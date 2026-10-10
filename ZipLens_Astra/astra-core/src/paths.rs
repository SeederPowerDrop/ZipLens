//! 아카이브 이름과 실제 목적지 경로를 검사합니다. 위험한 `..`를 지워서 복구하지 않고 거부합니다.
//! 문자열 검사·파일 식별자 검사는 서로 보완하며, 외부 프로세스의 동시 파일 변경을 잠그지는 않습니다.
use crate::Entry;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
};
use unicode_normalization::UnicodeNormalization;

// 경로 철자가 달라도 같은 원본일 수 있습니다. Unix에서는 device + inode로 하드링크 별칭도 식별합니다.
#[derive(Eq, PartialEq, Hash)]
enum FileIdentity {
    #[cfg(unix)]
    Inode(u64, u64),
    #[cfg(not(unix))]
    Path(PathBuf),
}

fn file_identity(path: &Path) -> std::io::Result<Option<FileIdentity>> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(Some(FileIdentity::Inode(metadata.dev(), metadata.ino())))
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        Ok(Some(FileIdentity::Path(fs::canonicalize(path)?)))
    }
}

/// Compare actual files, including case/Unicode aliases and hard links on Unix.
/// An absent path cannot be the same existing file.
pub fn same_file(left: &Path, right: &Path) -> std::io::Result<bool> {
    Ok(match (file_identity(left)?, file_identity(right)?) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    })
}

/// 원본 아카이브와 알려진 분할 볼륨의 식별자를 보관하여 결과로 덮어쓰는 것을 막습니다.
/// Unix에서는 대소문자·Unicode 표기·하드링크 별칭이 달라도 같은 파일인지 확인합니다.
/// 등록 시점의 식별자를 저장하는 것으로, 원본 파일을 잠그거나 변경을 감시하는 기능은 아닙니다.
pub(crate) struct ProtectedInputs {
    identities: HashSet<FileIdentity>,
}

impl ProtectedInputs {
    pub(crate) fn new(archive: &Path) -> Result<Self, String> {
        let mut protected = Self {
            identities: HashSet::new(),
        };
        protected.add(archive)?;
        // 7-Zip does not expose its input volume paths in the extraction result.
        // Protect only same-basename conventional volume families, never every sibling.
        if let Some(parent) = archive.parent() {
            for item in fs::read_dir(parent).map_err(|e| e.to_string())? {
                let item = item.map_err(|e| e.to_string())?;
                if volume_family_matches(archive, &item.path()) {
                    protected.add(&item.path())?;
                }
            }
        }
        Ok(protected)
    }

    pub(crate) fn add(&mut self, path: &Path) -> Result<(), String> {
        if let Some(identity) = file_identity(path).map_err(|e| e.to_string())? {
            self.identities.insert(identity);
        }
        Ok(())
    }

    pub(crate) fn contains(&self, path: &Path) -> Result<bool, String> {
        Ok(file_identity(path)
            .map_err(|e| e.to_string())?
            .is_some_and(|id| self.identities.contains(&id)))
    }
}

fn volume_family_matches(archive: &Path, candidate: &Path) -> bool {
    fn name(path: &Path) -> String {
        path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .nfc()
            .collect::<String>()
            .to_lowercase()
    }
    fn digits(text: &str) -> bool {
        !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit())
    }
    fn numeric_base(name: &str) -> Option<&str> {
        let (base, suffix) = name.rsplit_once('.')?;
        (suffix.len() >= 3 && digits(suffix)).then_some(base)
    }
    fn rar_part_base(name: &str) -> Option<&str> {
        let (base, number) = name.strip_suffix(".rar")?.rsplit_once(".part")?;
        digits(number).then_some(base)
    }
    fn old_volume_base<'a>(name: &'a str, main: &str, first: u8, last: u8) -> Option<&'a str> {
        let (base, ext) = name.rsplit_once('.')?;
        (ext == main
            || (ext.len() == 3 && (first..=last).contains(&ext.as_bytes()[0]) && digits(&ext[1..])))
        .then_some(base)
    }
    let archive = name(archive);
    let candidate = name(candidate);
    if let Some(base) = numeric_base(&archive) {
        return numeric_base(&candidate) == Some(base);
    }
    if numeric_base(&candidate) == Some(archive.as_str()) {
        return true;
    }
    if let Some(base) = rar_part_base(&archive) {
        return rar_part_base(&candidate) == Some(base);
    }
    for (main, first, last) in [("zip", b'z', b'z'), ("rar", b'r', b'z')] {
        if let Some(base) = old_volume_base(&archive, main, first, last) {
            return old_volume_base(&candidate, main, first, last) == Some(base);
        }
    }
    false
}

/// 아카이브 이름을 안전한 상대 경로로 변환합니다. 디스크 존재 여부·링크 목적지는 별도로 검사합니다.
pub fn relative(name: &str) -> Result<PathBuf, String> {
    let name = name.replace('\\', "/");
    if name.starts_with('/')
        || name.contains('\0')
        || name.split('/').any(|p| p == ".." || p.contains(':'))
    {
        return Err(format!("Unsafe archive path: {name}"));
    }
    let path: PathBuf = name
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    if path.as_os_str().is_empty() {
        return Err(format!("Empty archive path: {name}"));
    }
    Ok(path)
}

/// 전체 목록의 크기 제한과 macOS에서 모호해질 수 있는 이름·부모 경로 충돌을 검사합니다.
pub fn validate_entries(entries: &[Entry]) -> Result<(), String> {
    if entries.len() > crate::context::MAX_ENTRIES {
        return Err("Archive has too many entries".into());
    }
    let mut names = HashMap::new();
    let mut total = 0u64;
    for e in entries {
        let p = relative(&e.path)?;
        // Conservative across the default case-insensitive, normalization-insensitive macOS volume.
        let key = p.to_string_lossy().nfc().collect::<String>().to_lowercase();
        if names.insert(key.clone(), e.is_dir).is_some() {
            return Err(format!("Ambiguous duplicate archive path: {}", e.path));
        }
        total = total.checked_add(e.size).ok_or("Archive size overflow")?;
    }
    if total > crate::context::MAX_EXTRACTED_BYTES {
        return Err("Archive exceeds 1 TiB extraction limit".into());
    }
    for key in names.keys() {
        let mut p = Path::new(key).parent();
        while let Some(parent) = p {
            if names.get(parent.to_string_lossy().as_ref()) == Some(&false) {
                return Err(format!("File/link used as directory: {}", parent.display()));
            }
            p = parent.parent();
        }
    }
    Ok(())
}

/// 링크의 상대 경로가 문자열 해석상 staging 밖으로 나가지 않는지 검사합니다.
/// 실제 링크 사슬의 도착점 검사는 별도로 필요하며, `Engine`의 staging 검사에서 수행합니다.
pub fn validate_link(name: &Path, target: &Path) -> Result<(), String> {
    if target.is_absolute() || target.as_os_str().is_empty() {
        return Err("External or empty symbolic link is blocked".into());
    }
    let mut depth = name.parent().map_or(0, |p| p.components().count());
    for part in target.components() {
        match part {
            Component::ParentDir => {
                if depth == 0 {
                    return Err("External symbolic link is blocked".into());
                }
                depth -= 1;
            }
            Component::Normal(s) => {
                if s.to_string_lossy().contains([':', '\\']) {
                    return Err("Ambiguous symbolic link target".into());
                }
                depth += 1;
            }
            Component::CurDir => (),
            _ => return Err("External symbolic link is blocked".into()),
        }
    }
    Ok(())
}

/// 끊어진 심볼릭 링크도 이름을 차지하므로 `Path::exists`와 달리 링크 자체를 검사합니다.
pub fn exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// root 아래 디렉터리를 차례로 확인·생성합니다. root는 호출자가 이미 검증한 경로여야 합니다.
pub fn ensure_under(root: &Path, path: &Path) -> Result<(), String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Destination escaped output root")?;
    let mut current = root.to_path_buf();
    for part in relative.components() {
        if !matches!(part, Component::Normal(_)) {
            return Err("Unsafe destination component".into());
        }
        current.push(part);
        ensure_directory(&current)?;
    }
    Ok(())
}

/// 해당 경로가 실제 디렉터리인지 확인하거나 생성합니다. 그 위치의 링크는 따라가지 않습니다.
pub fn ensure_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !m.is_symlink() => Ok(()),
        Ok(_) => Err(format!(
            "Not a real directory (links are blocked): {}",
            path.display()
        )),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    ensure_directory(parent)?;
                }
            }
            match fs::create_dir(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => ensure_directory(path),
                Err(e) => Err(e.to_string()),
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Keep Both 후보 이름을 만듭니다. 이름을 예약하지 않으므로 실제 이동도 충돌을 검사해야 합니다.
pub fn numbered(path: &Path, n: usize) -> PathBuf {
    if n == 0 {
        return path.to_owned();
    }
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let suffix = path
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    path.with_file_name(format!("{stem} ({n}){suffix}"))
}

/// macOS는 `renamex_np(RENAME_EXCL)`로 충돌 확인과 이동을 한 번에 수행합니다.
/// 다른 플랫폼의 fallback은 exists→rename 사이 경쟁을 막지 못하므로 같은 보장을 가정하지 않습니다.
pub fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::ffi::OsStrExt;
        let source_path = std::ffi::CString::new(from.as_os_str().as_bytes())?;
        let destination_path = std::ffi::CString::new(to.as_os_str().as_bytes())?;
        // SAFETY: 두 CString은 호출이 끝날 때까지 살아 있으며 NUL 종료 포인터를 제공합니다.
        let result = unsafe {
            libc::renamex_np(
                source_path.as_ptr(),
                destination_path.as_ptr(),
                libc::RENAME_EXCL,
            )
        };
        if result != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        if exists(to) {
            return Err(std::io::ErrorKind::AlreadyExists.into());
        }
        fs::rename(from, to)
    }
}

#[cfg(test)]
mod source_input_tests {
    use super::*;

    #[test]
    fn conventional_volume_guards_cover_rar_and_zip_without_blocking_unrelated_files() {
        for (first, related, unrelated) in [
            (
                "archive.part01.rar",
                "archive.part02.rar",
                "other.part02.rar",
            ),
            ("archive.rar", "archive.r00", "other.r00"),
            ("archive.rar", "archive.s01", "archive.txt"),
            ("archive.zip", "archive.z01", "other.z01"),
            ("archive.7z.001", "archive.7z.002", "archive.7z.notes"),
        ] {
            let temp = tempfile::tempdir().unwrap();
            for name in [first, related, unrelated] {
                fs::write(temp.path().join(name), b"original").unwrap();
            }
            let protected = ProtectedInputs::new(&temp.path().join(first)).unwrap();
            assert!(
                protected.contains(&temp.path().join(related)).unwrap(),
                "{related}"
            );
            assert!(
                !protected.contains(&temp.path().join(unrelated)).unwrap(),
                "{unrelated}"
            );
        }
    }
}

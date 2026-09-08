//! Never repair hostile paths by deleting `..`: reject them before any writes.
use crate::Entry;
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
};
use unicode_normalization::UnicodeNormalization;

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

/// Links are created last; every target must stay lexically and physically inside the stage.
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

pub fn exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

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

/// macOS renamex_np(RENAME_EXCL) closes the exists/rename race for keep-both results.
pub fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::ffi::OsStrExt;
        let a = std::ffi::CString::new(from.as_os_str().as_bytes())?;
        let b = std::ffi::CString::new(to.as_os_str().as_bytes())?;
        let r = unsafe { libc::renamex_np(a.as_ptr(), b.as_ptr(), libc::RENAME_EXCL) };
        if r != 0 {
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

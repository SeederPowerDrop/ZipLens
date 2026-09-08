use crate::{context::PREVIEW_LIMIT, paths, Context, Entry};
use rayon::prelude::*;
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, BufReader, BufWriter, Read, Seek, SeekFrom},
    path::Path,
    sync::Arc,
};
use zip::{CompressionMethod, ZipArchive};

/// Clones share an open file, but NOT the seek cursor (File::try_clone would share it on Unix).
/// ZipArchive::clone shares the parsed central directory, avoiding O(entries²) reparsing.
#[derive(Clone)]
pub struct ArchiveReader {
    file: Arc<File>,
    offset: u64,
    len: u64,
}
impl ArchiveReader {
    pub fn open(path: &Path) -> io::Result<Self> {
        let file = File::open(path)?;
        let len = file.metadata()?.len();
        Ok(Self {
            file: Arc::new(file),
            offset: 0,
            len,
        })
    }
}
impl Read for ArchiveReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        #[cfg(unix)]
        let n = {
            use std::os::unix::fs::FileExt;
            self.file.read_at(buf, self.offset)?
        };
        #[cfg(windows)]
        let n = {
            use std::os::windows::fs::FileExt;
            self.file.seek_read(buf, self.offset)?
        };
        self.offset += n as u64;
        Ok(n)
    }
}
impl Seek for ArchiveReader {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        let next = match pos {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::Current(n) => self.offset as i128 + n as i128,
            SeekFrom::End(n) => self.len as i128 + n as i128,
        };
        if !(0..=u64::MAX as i128).contains(&next) {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        self.offset = next as u64;
        Ok(self.offset)
    }
}

pub fn decode(raw: &[u8]) -> String {
    if let Ok(s) = std::str::from_utf8(raw) {
        return s.into();
    }
    // Korean legacy fallback is deliberate, not universal encoding detection.
    encoding_rs::EUC_KR.decode(raw).0.into_owned()
}
fn name(f: &zip::read::ZipFile<'_>) -> String {
    // Respect a valid Info-ZIP Unicode Path extra field if the crate decoded it.
    if f.extra_data().is_some_and(has_unicode_path) {
        return f.name().into();
    }
    decode(f.name_raw())
}
fn has_unicode_path(mut data: &[u8]) -> bool {
    while data.len() >= 4 {
        let tag = u16::from_le_bytes([data[0], data[1]]);
        let len = u16::from_le_bytes([data[2], data[3]]) as usize;
        if data.len() < 4 + len {
            break;
        }
        if tag == 0x7075 {
            return true;
        }
        data = &data[4 + len..];
    }
    false
}

pub fn preview(path: &Path, ctx: &Context) -> Result<Vec<Entry>, String> {
    let mut zip = ZipArchive::new(BufReader::new(File::open(path).map_err(|e| e.to_string())?))
        .map_err(|e| e.to_string())?;
    if zip.len() > crate::context::MAX_ENTRIES {
        return Err("Archive has too many entries".into());
    }
    let mut files = Vec::with_capacity(zip.len());
    for i in 0..zip.len() {
        ctx.check()?;
        let f = zip.by_index_raw(i).map_err(|e| e.to_string())?;
        let path = name(&f);
        let is_dir = path.ends_with(['/', '\\']);
        files.push(Entry {
            path,
            size: f.size(),
            compressed_size: Some(f.compressed_size()),
            is_encrypted: f.encrypted(),
            is_dir,
            is_link: f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000),
            error: None,
        });
    }
    Ok(files)
}

pub fn native_supported(path: &Path) -> Result<bool, String> {
    let mut zip = ZipArchive::new(BufReader::new(File::open(path).map_err(|e| e.to_string())?))
        .map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let f = zip.by_index_raw(i).map_err(|e| e.to_string())?;
        if !matches!(
            f.compression(),
            CompressionMethod::Stored | CompressionMethod::Deflated
        ) {
            return Ok(false);
        }
    }
    Ok(true)
}

fn password_error(error: zip::result::ZipError) -> String {
    match error {
        zip::result::ZipError::InvalidPassword => "PASSWORD_REQUIRED".into(),
        zip::result::ZipError::UnsupportedArchive(zip::result::ZipError::PASSWORD_REQUIRED) => {
            "PASSWORD_REQUIRED".into()
        }
        e => e.to_string(),
    }
}

pub fn extract(
    path: &Path,
    dest: &Path,
    targets: &HashSet<String>,
    password: Option<&str>,
    ctx: &Context,
) -> Result<(), String> {
    let mut archive = ZipArchive::new(ArchiveReader::open(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut regular = Vec::new();
    let mut links = Vec::new();
    let mut directories = Vec::new();
    for i in 0..archive.len() {
        ctx.check()?;
        let f = archive.by_index_raw(i).map_err(|e| e.to_string())?;
        let name = name(&f);
        if !targets.contains(&name) {
            continue;
        }
        let relative = paths::relative(&name)?;
        if name.ends_with(['/', '\\']) {
            fs::create_dir_all(dest.join(&relative)).map_err(|e| e.to_string())?;
            directories.push((relative, f.unix_mode()));
        } else {
            if let Some(p) = dest.join(&relative).parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            if f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
                links.push(i);
            } else {
                regular.push(i);
            }
        }
    }
    // Each worker keeps its own decoder/cursor. Metadata parsing is constant per operation.
    let template = archive.clone();
    regular
        .par_chunks((regular.len().div_ceil(worker_count())).max(1))
        .try_for_each(|chunk| {
            let mut zip = template.clone();
            for &i in chunk {
                ctx.check()?;
                let mut f = match password {
                    Some(pw) => zip.by_index_decrypt(i, pw.as_bytes()),
                    None => zip.by_index(i),
                }
                .map_err(password_error)?;
                let filename = name(&f);
                let output = dest.join(paths::relative(&filename)?);
                let mut writer = BufWriter::with_capacity(
                    256 * 1024,
                    File::options()
                        .write(true)
                        .create_new(true)
                        .open(&output)
                        .map_err(|e| e.to_string())?,
                );
                let size = f.size();
                ctx.copy(&mut f, &mut writer, &filename, size)?;
                // into_inner flushes; an I/O/CRC failure aborts the stage, preserving the destination.
                let writer = writer.into_inner().map_err(|e| e.to_string())?;
                if writer.metadata().map_err(|e| e.to_string())?.len() != f.size() {
                    return Err(format!("{filename}: decoded size mismatch"));
                }
                set_mode(&output, f.unix_mode())?;
                if let Some(time) = f
                    .last_modified()
                    .and_then(|d| time::OffsetDateTime::try_from(d).ok())
                {
                    filetime::set_file_mtime(
                        &output,
                        filetime::FileTime::from_unix_time(time.unix_timestamp(), 0),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            Ok::<_, String>(())
        })?;
    for i in links {
        let mut f = match password {
            Some(pw) => archive.by_index_decrypt(i, pw.as_bytes()),
            None => archive.by_index(i),
        }
        .map_err(password_error)?;
        let filename = name(&f);
        let rel = paths::relative(&filename)?;
        let mut bytes = Vec::new();
        ctx.copy(&mut f, &mut bytes, &filename, 4096)?;
        let target = std::str::from_utf8(&bytes).map_err(|e| e.to_string())?;
        paths::validate_link(&rel, Path::new(target))?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, dest.join(rel)).map_err(|e| e.to_string())?;
    }
    // Defer restrictive directory permissions until all children have been written.
    directories.sort_by_key(|(p, _)| std::cmp::Reverse(p.components().count()));
    for (dir, mode) in directories {
        // Staging must remain traversable/writable until publication and RAII cleanup.
        set_mode(&dest.join(dir), mode.map(|m| m | 0o700))?;
    }
    Ok(())
}

pub fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map_or(2, |n| n.get())
        .min(8)
}

pub(crate) fn set_mode(path: &Path, mode: Option<u32>) -> Result<(), String> {
    #[cfg(unix)]
    if let Some(mode) = mode {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn read_entry(
    path: &Path,
    target: &str,
    password: Option<&str>,
    ctx: &Context,
) -> Result<Vec<u8>, String> {
    let mut zip = ZipArchive::new(BufReader::new(File::open(path).map_err(|e| e.to_string())?))
        .map_err(|e| e.to_string())?;
    let index = (0..zip.len())
        .find(|&i| zip.by_index_raw(i).is_ok_and(|f| name(&f) == target))
        .ok_or("File not found in archive")?;
    let mut f = match password {
        Some(pw) => zip.by_index_decrypt(index, pw.as_bytes()),
        None => zip.by_index(index),
    }
    .map_err(password_error)?;
    if f.size() > PREVIEW_LIMIT
        || f.is_dir()
        || f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
    {
        return Err("Preview limit is 20 MiB; links and folders cannot be previewed".into());
    }
    let mut data = Vec::new();
    ctx.copy(&mut f, &mut data, target, PREVIEW_LIMIT)?;
    Ok(data)
}

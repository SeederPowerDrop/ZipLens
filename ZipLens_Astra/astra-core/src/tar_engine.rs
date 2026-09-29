use crate::{paths, zip_engine::set_mode, Context, Entry};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufReader, BufWriter, Read},
    path::{Path, PathBuf},
};

pub fn supports(path: &Path) -> bool {
    let name = path.to_string_lossy().to_ascii_lowercase();
    [
        ".tar",
        ".cbt",
        ".tar.gz",
        ".tar.gzip",
        ".tgz",
        ".tar.zst",
        ".tar.zstd",
        ".tzst",
    ]
    .iter()
    .any(|s| name.ends_with(s))
}
fn reader(path: &Path, ctx: &Context) -> Result<Box<dyn Read>, String> {
    let file = BufReader::with_capacity(256 * 1024, File::open(path).map_err(|e| e.to_string())?);
    let name = path.to_string_lossy().to_ascii_lowercase();
    let inner: Box<dyn Read> =
        if name.ends_with(".gz") || name.ends_with(".gzip") || name.ends_with(".tgz") {
            Box::new(flate2::read::MultiGzDecoder::new(file))
        } else if name.ends_with(".zst") || name.ends_with(".zstd") || name.ends_with(".tzst") {
            Box::new(zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?)
        } else {
            Box::new(file)
        };
    Ok(Box::new(CheckedReader {
        inner,
        ctx: ctx.clone(),
        decoded: 0,
    }))
}
// TAR skips unselected entries inside its own read loop. Check cancellation there too.
struct CheckedReader {
    inner: Box<dyn Read>,
    ctx: Context,
    decoded: u64,
}
impl Read for CheckedReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.ctx.check().map_err(std::io::Error::other)?;
        let n = self.inner.read(buf)?;
        self.decoded = self.decoded.saturating_add(n as u64);
        if self.decoded > crate::context::MAX_EXTRACTED_BYTES {
            return Err(std::io::Error::other("Decoded TAR exceeds size limit"));
        }
        Ok(n)
    }
}
fn entry_name<R: Read>(entry: &tar::Entry<'_, R>) -> Result<String, String> {
    let path = entry.path().map_err(|e| e.to_string())?;
    let mut name = path
        .to_str()
        .ok_or("Non-UTF-8 TAR names are not supported")?
        .to_string();
    if entry.header().entry_type().is_dir() && !name.ends_with('/') {
        name.push('/');
    }
    Ok(name)
}
pub fn preview(path: &Path, ctx: &Context) -> Result<Vec<Entry>, String> {
    let mut archive = tar::Archive::new(reader(path, ctx)?);
    let mut result = Vec::new();
    for item in archive.entries().map_err(|e| e.to_string())? {
        ctx.check()?;
        let e = item.map_err(|e| e.to_string())?;
        let path = entry_name(&e)?;
        // Common TAR root marker is metadata, not a file to extract.
        if matches!(path.as_str(), "./" | "/") && e.header().entry_type().is_dir() {
            continue;
        }
        if result.len() >= crate::context::MAX_ENTRIES {
            return Err("Archive has too many entries".into());
        }
        let kind = e.header().entry_type();
        result.push(Entry {
            path,
            size: e.size(),
            compressed_size: None,
            is_encrypted: false,
            is_dir: kind.is_dir(),
            is_link: kind.is_symlink() || kind.is_hard_link(),
            error: None,
        });
    }
    // TAR stops at zero blocks; drain the outer decoder to verify gzip/zstd trailers.
    ctx.copy(
        &mut archive.into_inner(),
        &mut std::io::sink(),
        "Checking archive trailer",
        crate::context::MAX_EXTRACTED_BYTES,
    )?;
    Ok(result)
}

pub fn extract(
    path: &Path,
    dest: &Path,
    targets: &HashSet<String>,
    ctx: &Context,
) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader(path, ctx)?);
    let mut links = Vec::<(PathBuf, PathBuf, bool)>::new();
    let mut dirs = Vec::new();
    for item in archive.entries().map_err(|e| e.to_string())? {
        ctx.check()?;
        let mut e = item.map_err(|e| e.to_string())?;
        let name = entry_name(&e)?;
        if !targets.contains(&name) {
            continue;
        }
        let relative = paths::relative(&name)?;
        let output = dest.join(&relative);
        let kind = e.header().entry_type();
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if kind.is_dir() {
            fs::create_dir_all(&output).map_err(|e| e.to_string())?;
            dirs.push((output, e.header().mode().ok()));
        } else if kind.is_file() {
            let mut writer = BufWriter::new(
                File::options()
                    .write(true)
                    .create_new(true)
                    .open(&output)
                    .map_err(|e| e.to_string())?,
            );
            let size = e.size();
            if ctx.copy(&mut e, &mut writer, &name, size)? != size {
                return Err(format!("{name}: truncated TAR entry"));
            }
            writer.into_inner().map_err(|e| e.to_string())?;
            set_mode(&output, e.header().mode().ok())?;
            if let Ok(mtime) = e.header().mtime() {
                filetime::set_file_mtime(
                    &output,
                    filetime::FileTime::from_unix_time(mtime.min(i64::MAX as u64) as i64, 0),
                )
                .map_err(|e| e.to_string())?;
            }
        } else if kind.is_symlink() || kind.is_hard_link() {
            let target = e
                .link_name()
                .map_err(|e| e.to_string())?
                .ok_or("Missing link target")?
                .into_owned();
            if kind.is_symlink() {
                paths::validate_link(&relative, &target)?;
            } else {
                paths::relative(target.to_str().ok_or("Invalid hard link target")?)?;
            }
            links.push((relative, target, kind.is_hard_link()));
        } else {
            return Err(format!("{name}: special TAR entries are blocked"));
        }
    }
    ctx.copy(
        &mut archive.into_inner(),
        &mut std::io::sink(),
        "Checking archive trailer",
        crate::context::MAX_EXTRACTED_BYTES,
    )?;
    // Hard links must refer to a selected regular file, never a symbolic link or an outside file.
    for (relative, target, hard) in links.iter().filter(|(_, _, h)| *h) {
        let target = dest.join(paths::relative(
            target.to_str().ok_or("Invalid hard link target")?,
        )?);
        if *hard
            && !fs::symlink_metadata(&target)
                .map_err(|e| e.to_string())?
                .is_file()
        {
            return Err("Invalid hard link target".into());
        }
        fs::hard_link(target, dest.join(relative)).map_err(|e| e.to_string())?;
    }
    for (relative, target, _) in links.iter().filter(|(_, _, h)| !*h) {
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, dest.join(relative)).map_err(|e| e.to_string())?;
    }
    dirs.sort_by_key(|(p, _)| std::cmp::Reverse(p.components().count()));
    for (path, mode) in dirs {
        // Staging must remain traversable/writable until publication and RAII cleanup.
        set_mode(&path, mode.map(|m| m | 0o700))?;
    }
    Ok(())
}

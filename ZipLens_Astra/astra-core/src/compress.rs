use crate::{paths, Context, Engine};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

pub struct CompressionRequest {
    pub sources: Vec<PathBuf>,
    pub destination: PathBuf,
    pub format: String,
    pub split_size: Option<String>,
    pub password: Option<String>,
    pub encryption: Option<String>,
    pub level: u32,
}
struct Source {
    path: PathBuf,
    name: String,
    meta: fs::Metadata,
}

impl Engine {
    pub fn compress(&self, r: &CompressionRequest, ctx: &Context) -> Result<Vec<String>, String> {
        if r.sources.is_empty() {
            return Err("No source files selected".into());
        }
        if r.level > 9 {
            return Err("Compression level must be 0–9".into());
        }
        if !["zip", "7z", "tar", "tar.gz", "tar.zst"].contains(&r.format.as_str()) {
            return Err("Unsupported compression format".into());
        }
        if r.password.as_deref() == Some("") {
            return Err("Password cannot be empty".into());
        }
        let split = r
            .split_size
            .as_deref()
            .filter(|s| !s.trim().is_empty() && s.trim() != "0")
            .map(validate_split)
            .transpose()?;
        if r.format.starts_with("tar") && (r.password.is_some() || split.is_some()) {
            return Err(
                "TAR formats do not support passwords or split volumes; select ZIP or 7Z".into(),
            );
        }
        let parent = r.destination.parent().ok_or("Missing destination parent")?;
        paths::ensure_directory(parent)?;
        let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
        let dest = parent.join(
            r.destination
                .file_name()
                .ok_or("Missing archive filename")?,
        );
        if fs::symlink_metadata(&dest).is_ok_and(|m| !m.is_file() || m.is_symlink()) {
            return Err("Output must be a regular file".into());
        }
        let mut sources = Vec::new();
        let mut seen = HashSet::new();
        let mut absolute_sources = Vec::new();
        for input in &r.sources {
            ctx.check()?;
            let source =
                fs::canonicalize(input).map_err(|e| format!("{}: {e}", input.display()))?;
            if dest == source
                || paths::same_file(&dest, &source).map_err(|e| e.to_string())?
                || (source.is_dir() && dest.starts_with(&source))
            {
                return Err("Save the archive outside the selected source folder (and never over a source file)".into());
            }
            absolute_sources.push(source.clone());
            let base = source
                .parent()
                .ok_or("Cannot archive the filesystem root")?;
            for entry in WalkDir::new(&source)
                .follow_links(false)
                .sort_by_file_name()
            {
                ctx.check()?;
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry
                    .path()
                    .strip_prefix(base)
                    .map_err(|e| e.to_string())?
                    .to_str()
                    .ok_or("Non-UTF-8 source path")?
                    .replace('\\', "/");
                let key = name.to_lowercase();
                if !seen.insert(key) {
                    return Err(format!("Duplicate source name: {name}"));
                }
                paths::relative(&name)?;
                let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
                if !meta.is_file() && !meta.is_dir() && !meta.is_symlink() {
                    return Err(format!("{name}: special source files are not supported"));
                }
                sources.push(Source {
                    path: entry.path().into(),
                    name,
                    meta,
                });
            }
        }
        let total = sources
            .iter()
            .filter(|s| s.meta.is_file())
            .try_fold(0u64, |n, s| {
                n.checked_add(s.meta.len()).ok_or("Source size overflow")
            })?;
        ctx.set_total(total);
        let stage = tempfile::Builder::new()
            .prefix(".ziplens-astra-compress-")
            .tempdir_in(&parent)
            .map_err(|e| e.to_string())?;
        let staged_file = stage.path().join(dest.file_name().unwrap());
        if r.format == "7z" || r.password.is_some() || split.is_some() {
            let mut args = vec![
                "a".into(),
                format!("-t{}", r.format),
                format!("-mx={}", r.level),
                format!("-mmt={}", crate::zip_engine::worker_count()),
                "-y".into(),
                "-sccUTF-8".into(),
                "-snl".into(),
                "-spd".into(),
                "-bsp0".into(),
            ];
            if let Some(split) = &split {
                args.push(format!("-v{split}"));
            }
            if let Some(pw) = &r.password {
                args.push(format!("-p{pw}"));
                if r.format == "zip" {
                    args.push(if r.encryption.as_deref() == Some("ZipCrypto") {
                        "-mem=ZipCrypto".into()
                    } else {
                        "-mem=AES256".into()
                    });
                } else {
                    args.push("-mhe=on".into());
                }
            }
            if r.format == "7z" {
                args.push("-m0=lzma2".into());
            }
            args.extend(["--".into(), staged_file.to_string_lossy().into()]);
            args.extend(
                absolute_sources
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned()),
            );
            ctx.set_total(0);
            ctx.progress("7-Zip", false);
            self.run_sidecar(&args, ctx)?;
        } else if r.format == "zip" {
            compress_zip(&sources, &staged_file, r.level, ctx)?;
        } else {
            let file = BufWriter::with_capacity(
                256 * 1024,
                File::create(&staged_file).map_err(|e| e.to_string())?,
            );
            if r.format == "tar.gz" {
                let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
                    file,
                    flate2::Compression::new(r.level),
                ));
                compress_tar(&sources, &mut builder, ctx)?;
                let mut output = builder
                    .into_inner()
                    .map_err(|e| e.to_string())?
                    .finish()
                    .map_err(|e| e.to_string())?;
                output.flush().map_err(|e| e.to_string())?;
            } else if r.format == "tar.zst" {
                let mut enc = zstd::stream::write::Encoder::new(
                    file,
                    match r.level {
                        0..=3 => 1,
                        4..=6 => 3,
                        _ => 9,
                    },
                )
                .map_err(|e| e.to_string())?;
                enc.multithread(crate::zip_engine::worker_count() as u32)
                    .map_err(|e| e.to_string())?;
                let mut builder = tar::Builder::new(enc);
                compress_tar(&sources, &mut builder, ctx)?;
                let mut output = builder
                    .into_inner()
                    .map_err(|e| e.to_string())?
                    .finish()
                    .map_err(|e| e.to_string())?;
                output.flush().map_err(|e| e.to_string())?;
            } else {
                let mut builder = tar::Builder::new(file);
                compress_tar(&sources, &mut builder, ctx)?;
                builder
                    .into_inner()
                    .map_err(|e| e.to_string())?
                    .flush()
                    .map_err(|e| e.to_string())?;
            }
        }
        ctx.check()?;
        let mut outputs: Vec<_> = fs::read_dir(stage.path())
            .map_err(|e| e.to_string())?
            .map(|e| e.map(|e| e.path()))
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        outputs.sort();
        if outputs.is_empty() {
            return Err("Compression produced no files".into());
        }
        if split.is_some()
            && outputs
                .iter()
                .any(|p| paths::exists(&parent.join(p.file_name().unwrap())))
        {
            return Err("Split volume already exists; choose a new archive name".into());
        }
        let mut result = Vec::new();
        // No cancellation midway through volume publication. Existing volumes are never replaced.
        for output in outputs {
            let target = parent.join(output.file_name().unwrap());
            let renamed = if split.is_some() {
                paths::rename_no_replace(&output, &target)
            } else {
                fs::rename(&output, &target)
            };
            if let Err(e) = renamed {
                // Only remove volumes created by this operation, restoring the prior state.
                if split.is_some() {
                    for p in &result {
                        let _ = fs::remove_file(p);
                    }
                }
                return Err(e.to_string());
            }
            result.push(target.to_string_lossy().into_owned());
        }
        ctx.progress("", true);
        Ok(result)
    }
}

fn validate_split(text: &str) -> Result<String, String> {
    let text = text.trim().to_ascii_lowercase();
    let digits = text.trim_end_matches(['b', 'k', 'm', 'g']);
    if digits.is_empty()
        || !digits.bytes().all(|c| c.is_ascii_digit())
        || text.len() - digits.len() > 1
        || digits.parse::<u64>().ok().filter(|n| *n > 0).is_none()
    {
        return Err("Split size must look like 10m, 100m, or 2g".into());
    }
    Ok(text)
}

fn compress_zip(sources: &[Source], dest: &Path, level: u32, ctx: &Context) -> Result<(), String> {
    let mut writer = zip::ZipWriter::new(BufWriter::with_capacity(
        256 * 1024,
        File::create(dest).map_err(|e| e.to_string())?,
    ));
    for source in sources {
        ctx.check()?;
        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            source.meta.permissions().mode() & 0o777
        };
        #[cfg(not(unix))]
        let mode = if source.meta.is_dir() { 0o755 } else { 0o644 };
        let mut options = SimpleFileOptions::default()
            .compression_method(if level == 0 {
                zip::CompressionMethod::Stored
            } else {
                zip::CompressionMethod::Deflated
            })
            .compression_level(if level == 0 { None } else { Some(level as i64) })
            .unix_permissions(mode)
            .large_file(source.meta.len() >= u32::MAX as u64);
        if let Ok(modified) = source.meta.modified() {
            if let Ok(date) = zip::DateTime::try_from(time::OffsetDateTime::from(modified)) {
                options = options.last_modified_time(date);
            }
        }
        if source.meta.is_symlink() {
            let target = fs::read_link(&source.path).map_err(|e| e.to_string())?;
            writer
                .add_symlink(
                    &source.name,
                    target.to_str().ok_or("Non-UTF-8 link target")?,
                    options,
                )
                .map_err(|e| e.to_string())?;
        } else if source.meta.is_dir() {
            writer
                .add_directory(&source.name, options)
                .map_err(|e| e.to_string())?;
        } else {
            writer
                .start_file(&source.name, options)
                .map_err(|e| e.to_string())?;
            let mut file = BufReader::new(File::open(&source.path).map_err(|e| e.to_string())?);
            let bytes = ctx.copy(&mut file, &mut writer, &source.name, source.meta.len())?;
            if bytes != source.meta.len() {
                return Err(format!("{} changed while compressing", source.name));
            }
        }
    }
    writer
        .finish()
        .map_err(|e| e.to_string())?
        .flush()
        .map_err(|e| e.to_string())?;
    Ok(())
}

struct Cancellable<'a> {
    file: File,
    ctx: &'a Context,
    name: &'a str,
    remaining: u64,
}
impl Read for Cancellable<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // Interrupted is retried by io::copy; cancellation must be a terminal error.
        self.ctx.check().map_err(std::io::Error::other)?;
        if buf.is_empty() {
            return Ok(0);
        }
        let n = self.file.read(buf)?;
        // tar::Builder copies until EOF without comparing data length to the header.
        // Abort the staged archive if a live source shrinks or grows while we read it.
        if n as u64 > self.remaining || (n == 0 && self.remaining != 0) {
            return Err(std::io::Error::other(format!(
                "{} changed while compressing",
                self.name
            )));
        }
        self.remaining -= n as u64;
        self.ctx.advance(n as u64, self.name);
        Ok(n)
    }
}
fn compress_tar<W: Write>(
    sources: &[Source],
    builder: &mut tar::Builder<W>,
    ctx: &Context,
) -> Result<(), String> {
    builder.follow_symlinks(false);
    for source in sources {
        ctx.check()?;
        ctx.progress(&source.name, false);
        if source.meta.is_file() {
            let mut header = tar::Header::new_gnu();
            header.set_metadata(&source.meta);
            header.set_cksum();
            let mut file = Cancellable {
                file: File::open(&source.path).map_err(|e| e.to_string())?,
                ctx,
                name: &source.name,
                remaining: source.meta.len(),
            };
            let result = builder
                .append_data(&mut header, &source.name, &mut file)
                .map_err(|e| e.to_string());
            ctx.check()?;
            result?;
        } else {
            builder
                .append_path_with_name(&source.path, &source.name)
                .map_err(|e| e.to_string())?;
        }
    }
    builder.finish().map_err(|e| e.to_string())
}

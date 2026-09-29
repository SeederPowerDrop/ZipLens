//! Single-stream formats often have no name or decoded size in 7-Zip listings.
//! Decode to a bounded private file so previews, selection and extraction agree.
use crate::{context::MAX_EXTRACTED_BYTES, tar_engine, Context, Engine, Entry};
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

pub(crate) struct PreparedStream {
    pub file: tempfile::NamedTempFile,
    // None means the decoded file is a TAR, whose entries are validated separately.
    pub entry: Option<Entry>,
}

fn format(path: &Path) -> Option<(&'static str, String, bool)> {
    if tar_engine::supports(path) {
        return None;
    }
    let name = path.file_name()?.to_str()?;
    let lower = name.to_ascii_lowercase();
    for (suffix, kind) in [(".tbz2", "bzip2"), (".tbz", "bzip2"), (".txz", "xz")] {
        if lower.ends_with(suffix) {
            return Some((kind, name[..name.len() - suffix.len()].into(), true));
        }
    }
    for (suffix, kind) in [
        (".bzip2", "bzip2"),
        (".bz2", "bzip2"),
        (".xz", "xz"),
        (".zstd", "zstd"),
        (".zst", "zstd"),
        (".gzip", "gzip"),
        (".gz", "gzip"),
        (".lzma", "lzma"),
        (".z", "Z"),
    ] {
        if let Some(stem) = lower.strip_suffix(suffix) {
            let output_name = &name[..name.len() - suffix.len()];
            return Some((kind, output_name.to_owned(), stem.ends_with(".tar")));
        }
    }
    None
}

impl Engine {
    pub(crate) fn prepare_stream(
        &self,
        archive: &Path,
        ctx: &Context,
    ) -> Result<Option<PreparedStream>, String> {
        let Some((kind, name, is_tar)) = format(archive) else {
            return Ok(None);
        };
        ctx.check()?;
        if !is_tar {
            crate::paths::relative(&name)?;
        }
        let path = fs::canonicalize(archive).map_err(|e| e.to_string())?;
        let file = tempfile::Builder::new()
            .prefix("ziplens-astra-stream-")
            .suffix(if is_tar { ".tar" } else { ".data" })
            .tempfile()
            .map_err(|e| e.to_string())?;
        let mut output = file.reopen().map_err(|e| e.to_string())?;
        // Forced outer format + stdout prevents recursive TAR unpacking and archive-controlled
        // filesystem writes. Only the native TAR extractor may publish its inner entries.
        let mut child = Command::new(&self.sidecar)
            .args([
                "x",
                "-so",
                "-bd",
                "-bb0",
                "-bsp0",
                &format!("-t{kind}"),
                "--",
            ])
            .arg(path)
            .env("LC_ALL", "en_US.UTF-8")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Cannot start bundled 7-Zip: {e}"))?;
        let mut stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let copy_ctx = ctx.clone();
        let copy_failed = Arc::new(AtomicBool::new(false));
        let failed = copy_failed.clone();
        ctx.set_total(0);
        ctx.progress("Decoding compressed stream", false);
        let decoded = thread::spawn(move || {
            let result = copy_ctx.copy(
                &mut stdout,
                &mut output,
                "Decoding compressed stream",
                MAX_EXTRACTED_BYTES,
            );
            failed.store(result.is_err(), Ordering::Release);
            result
        });
        let errors = thread::spawn(move || crate::sidecar::collect(stderr));
        let status = loop {
            if ctx.check().is_err() || copy_failed.load(Ordering::Acquire) {
                let _ = child.kill();
                break child.wait();
            }
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => thread::sleep(Duration::from_millis(40)),
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(error);
                }
            }
        };
        let size = decoded.join().map_err(|_| "Stream decoder reader failed")?;
        let stderr = errors
            .join()
            .map_err(|_| "7-Zip error reader failed")?
            .map_err(|e| e.to_string())?;
        ctx.check()?;
        let size = size?;
        if !status.map_err(|e| e.to_string())?.success() {
            return Err(format!(
                "7-Zip failed to decode stream: {}",
                String::from_utf8_lossy(&stderr.0)
                    .chars()
                    .take(2000)
                    .collect::<String>()
            ));
        }
        let entry = if is_tar {
            None
        } else {
            Some(Entry {
                path: name,
                size,
                compressed_size: Some(fs::metadata(archive).map_err(|e| e.to_string())?.len()),
                is_encrypted: false,
                is_dir: false,
                is_link: false,
                error: None,
            })
        };
        Ok(Some(PreparedStream { file, entry }))
    }
}

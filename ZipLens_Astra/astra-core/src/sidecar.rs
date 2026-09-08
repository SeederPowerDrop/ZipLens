use crate::{paths, Context, Engine, Entry};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    thread,
    time::Duration,
};

const LOG_LIMIT: usize = 32 * 1024 * 1024;
fn collect(mut reader: impl Read) -> std::io::Result<(Vec<u8>, bool)> {
    let mut bytes = Vec::new();
    let mut chunk = [0; 8192];
    let mut truncated = false;
    loop {
        let n = reader.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        let keep = n.min(LOG_LIMIT.saturating_sub(bytes.len()));
        bytes.extend_from_slice(&chunk[..keep]);
        truncated |= keep != n;
    }
    Ok((bytes, truncated))
}

impl Engine {
    pub(crate) fn run_sidecar(&self, args: &[String], ctx: &Context) -> Result<String, String> {
        ctx.check()?;
        let mut child = Command::new(&self.sidecar)
            .args(args)
            .env("LC_ALL", "en_US.UTF-8")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Cannot start bundled 7-Zip: {e}"))?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let out = thread::spawn(move || collect(stdout));
        let err = thread::spawn(move || collect(stderr));
        let status = loop {
            if ctx.check().is_err() {
                let _ = child.kill();
                break child.wait();
            }
            match child.try_wait() {
                Ok(Some(s)) => break Ok(s),
                Ok(None) => thread::sleep(Duration::from_millis(40)),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(e);
                }
            }
        }
        .map_err(|e| e.to_string());
        let (stdout, clipped_out) = out
            .join()
            .map_err(|_| "7-Zip output reader failed")?
            .map_err(|e| e.to_string())?;
        let (stderr, clipped_err) = err
            .join()
            .map_err(|_| "7-Zip error reader failed")?
            .map_err(|e| e.to_string())?;
        ctx.check()?;
        if clipped_out || clipped_err {
            return Err("7-Zip output exceeds 32 MiB limit".into());
        }
        let stdout = String::from_utf8(stdout).map_err(|e| e.to_string())?;
        let stderr = String::from_utf8_lossy(&stderr);
        if !status?.success() {
            let error = format!("{stderr}\n{stdout}");
            if [
                "Wrong password",
                "password is incorrect",
                "Enter password",
                "Cannot open encrypted archive",
            ]
            .iter()
            .any(|s| error.contains(s))
            {
                return Err("PASSWORD_REQUIRED".into());
            }
            return Err(format!(
                "7-Zip failed: {}",
                error.chars().take(2000).collect::<String>()
            ));
        }
        Ok(stdout)
    }

    pub(crate) fn sidecar_preview(
        &self,
        path: &Path,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Entry>, String> {
        let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
        // -ba removes the archive header: no filename-based heuristic can discard a real entry.
        let args = vec![
            "l".into(),
            "-slt".into(),
            "-ba".into(),
            "-sccUTF-8".into(),
            format!("-p{}", password.unwrap_or("")),
            "--".into(),
            path.to_string_lossy().into(),
        ];
        parse_listing(&self.run_sidecar(&args, ctx)?)
    }

    pub(crate) fn sidecar_extract(
        &self,
        path: &Path,
        dest: &Path,
        entries: &[Entry],
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<(), String> {
        let mut list = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        for entry in entries.iter().filter(|e| !e.is_dir) {
            if entry.path.contains(['\r', '\n']) {
                return Err("7-Zip selection cannot contain line breaks".into());
            }
            paths::relative(&entry.path)?;
            writeln!(list, "{}", entry.path.trim_end_matches('/')).map_err(|e| e.to_string())?;
        }
        list.flush().map_err(|e| e.to_string())?;
        ctx.set_total(0); // No fabricated 50%/ETA for an external process.
        ctx.progress("7-Zip", false);
        let args = vec![
            "x".into(),
            format!("-o{}", dest.display()),
            "-y".into(),
            "-sccUTF-8".into(),
            "-scsUTF-8".into(),
            "-spd".into(),
            "-bb0".into(),
            "-bsp0".into(),
            format!("-p{}", password.unwrap_or("")),
            format!("-i@{}", list.path().display()),
            "--".into(),
            path.to_string_lossy().into(),
        ];
        if entries.iter().any(|e| !e.is_dir) {
            self.run_sidecar(&args, ctx)?;
        }
        for entry in entries.iter().filter(|e| e.is_dir) {
            fs::create_dir_all(dest.join(paths::relative(&entry.path)?))
                .map_err(|e| e.to_string())?;
        }
        // A success exit code still needs a filesystem check; logs are not the result manifest.
        for entry in entries {
            let output = dest.join(paths::relative(&entry.path)?);
            let meta = fs::symlink_metadata(&output).map_err(|e| format!("{}: {e}", entry.path))?;
            if meta.is_symlink()
                || (entry.is_dir && !meta.is_dir())
                || (!entry.is_dir && (!meta.is_file() || meta.len() != entry.size))
            {
                return Err(format!("{}: unexpected extracted file", entry.path));
            }
        }
        Ok(())
    }
}

pub fn parse_listing(text: &str) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for block in text.split("\n\n") {
        let mut path = None;
        let mut size = 0;
        let mut packed = None;
        let mut encrypted = false;
        let mut directory = false;
        let mut link = false;
        for line in block.lines() {
            if let Some((key, value)) = line.trim_end_matches('\r').split_once(" = ") {
                match key {
                    "Path" => {
                        if path.replace(value.to_owned()).is_some() {
                            return Err("Ambiguous 7-Zip listing".into());
                        }
                    }
                    "Size" => size = value.parse().map_err(|_| "Invalid 7-Zip size")?,
                    "Packed Size" => packed = value.parse().ok(),
                    "Encrypted" => encrypted = value == "+",
                    "Folder" => directory = value == "+",
                    "Attributes" => {
                        directory |= value.starts_with('D') || value.contains(" dr");
                        link |= value.contains(" lr");
                    }
                    "Symbolic Link" | "Hard Link" => link |= !value.is_empty(),
                    _ => (),
                }
            }
        }
        if let Some(mut path) = path {
            if directory && !path.ends_with('/') {
                path.push('/');
            }
            entries.push(Entry {
                path,
                size,
                compressed_size: packed,
                is_encrypted: encrypted,
                is_dir: directory,
                is_link: link,
                error: None,
            });
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn listing_preserves_spaces_and_archive_named_entry() {
        let entries =
            parse_listing("Path = sample.7z\nSize = 4\n\nPath = folder \nFolder = +\nSize = 0\n\n")
                .unwrap();
        assert_eq!(entries[0].path, "sample.7z");
        assert_eq!(entries[1].path, "folder /");
        assert!(entries[1].is_dir);
    }
}

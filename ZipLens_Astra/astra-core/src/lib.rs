//! ZipLens Astra: decoding and validation happen in a private staging directory.
//! Only completed data is published. Existing destination folders are never deleted.
mod compress;
pub mod context;
pub mod paths;
mod sidecar;
mod tar_engine;
pub mod zip_engine;
pub use compress::CompressionRequest;
pub use context::{Context, Progress};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, serde::Serialize)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub compressed_size: Option<u64>,
    pub is_encrypted: bool,
    pub is_dir: bool,
    pub is_link: bool,
    pub error: Option<String>,
}

#[derive(Default, Debug, serde::Serialize)]
pub struct ExtractReport {
    pub success_files: Vec<String>,
    pub failed_files: Vec<(String, String)>,
    pub output_paths: Vec<String>,
    pub cancelled: bool,
}

pub struct ExtractRequest {
    pub archive: PathBuf,
    pub destination: PathBuf,
    pub targets: Option<Vec<String>>,
    pub password: Option<String>,
    pub keep_both: bool,
}

#[derive(Clone)]
pub struct Engine {
    pub sidecar: PathBuf,
}

fn is_zip(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "zip" | "zipx" | "cbz"
    )
}

impl Engine {
    pub fn preview(
        &self,
        path: &Path,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Entry>, String> {
        ctx.check()?;
        let entries = if is_zip(path) {
            zip_engine::preview(path, ctx)?
        } else if tar_engine::supports(path) {
            tar_engine::preview(path, ctx)?
        } else {
            self.sidecar_preview(path, password, ctx)?
        };
        paths::validate_entries(&entries)?;
        Ok(entries)
    }

    pub fn extract(
        &self,
        request: &ExtractRequest,
        ctx: &Context,
    ) -> Result<ExtractReport, String> {
        match self.extract_inner(request, ctx) {
            Err(e) if e == "CANCELLED" || ctx.check().is_err() => Ok(ExtractReport {
                cancelled: true,
                ..Default::default()
            }),
            r => r,
        }
    }

    fn extract_inner(&self, r: &ExtractRequest, ctx: &Context) -> Result<ExtractReport, String> {
        let archive = fs::canonicalize(&r.archive).map_err(|e| e.to_string())?;
        let entries = self.preview(&archive, r.password.as_deref(), ctx)?;
        let targets = r
            .targets
            .as_ref()
            .map(|v| v.iter().cloned().collect::<HashSet<_>>());
        if let Some(t) = &targets {
            if t.is_empty() {
                return Err("No files selected".into());
            }
            let known: HashSet<_> = entries.iter().map(|e| &e.path).collect();
            if t.iter().any(|p| !known.contains(p)) {
                return Err("Selected file is not in the archive".into());
            }
        }
        let selected: Vec<_> = entries
            .iter()
            .filter(|e| targets.as_ref().is_none_or(|t| t.contains(&e.path)))
            .cloned()
            .collect();
        if selected.iter().any(|e| e.is_encrypted) && r.password.is_none() {
            return Err("PASSWORD_REQUIRED".into());
        }
        paths::ensure_directory(&r.destination)?;
        let dest = fs::canonicalize(&r.destination).map_err(|e| e.to_string())?;
        let stage = tempfile::Builder::new()
            .prefix(".ziplens-astra-")
            .tempdir_in(&dest)
            .map_err(|e| e.to_string())?;
        ctx.set_total(selected.iter().map(|e| e.size).sum());
        let names: HashSet<_> = selected.iter().map(|e| e.path.clone()).collect();
        if is_zip(&archive) && zip_engine::native_supported(&archive)? {
            zip_engine::extract(&archive, stage.path(), &names, r.password.as_deref(), ctx)?;
        } else if tar_engine::supports(&archive) {
            tar_engine::extract(&archive, stage.path(), &names, ctx)?;
        } else {
            // Reject links before launching an external extractor. Its parser is not a sandbox.
            if entries.iter().any(|e| e.is_link) {
                return Err("Links in sidecar archives are not supported safely yet".into());
            }
            self.sidecar_extract(
                &archive,
                stage.path(),
                &selected,
                r.password.as_deref(),
                ctx,
            )?;
        }
        ctx.check()?;
        audit_stage(stage.path())?;
        let expected: HashSet<_> = selected
            .iter()
            .filter(|e| !e.is_dir)
            .map(|e| paths::relative(&e.path))
            .collect::<Result<_, _>>()?;
        for item in walkdir::WalkDir::new(stage.path())
            .follow_links(false)
            .min_depth(1)
        {
            let item = item.map_err(|e| e.to_string())?;
            if !item.file_type().is_dir()
                && !expected.contains(item.path().strip_prefix(stage.path()).unwrap())
            {
                return Err("Extractor produced an unselected file".into());
            }
        }
        let report = publish(stage.path(), &dest, &archive, &selected, r.keep_both, ctx)?;
        ctx.progress("", true);
        Ok(report)
    }

    pub fn read_entry(
        &self,
        archive: &Path,
        name: &str,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<u8>, String> {
        paths::relative(name)?;
        if is_zip(archive) && zip_engine::native_supported(archive)? {
            return zip_engine::read_entry(archive, name, password, ctx);
        }
        let entries = self.preview(archive, password, ctx)?;
        let entry = entries
            .iter()
            .find(|e| e.path == name)
            .ok_or("File not found in archive")?;
        if entry.size > context::PREVIEW_LIMIT || entry.is_dir || entry.is_link {
            return Err("Preview limit is 20 MiB; links and folders cannot be previewed".into());
        }
        let tmp = tempfile::Builder::new()
            .prefix("ziplens-astra-preview-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let report = self.extract(
            &ExtractRequest {
                archive: archive.into(),
                destination: tmp.path().into(),
                targets: Some(vec![name.into()]),
                password: password.map(str::to_owned),
                keep_both: false,
            },
            ctx,
        )?;
        if report.cancelled {
            return Err("CANCELLED".into());
        }
        if !report.failed_files.is_empty() || report.output_paths.len() != 1 {
            return Err("Preview extraction failed".into());
        }
        let mut file = fs::File::open(&report.output_paths[0]).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        ctx.copy(&mut file, &mut bytes, name, context::PREVIEW_LIMIT)?;
        Ok(bytes)
    }
}

fn audit_stage(stage: &Path) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(stage)
        .follow_links(false)
        .min_depth(1)
    {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_symlink() {
            let link = fs::read_link(entry.path()).map_err(|e| e.to_string())?;
            paths::validate_link(entry.path().strip_prefix(stage).unwrap(), &link)?;
            // Resolve link chains too. Broken/cyclic links are rejected deliberately.
            let target = fs::canonicalize(entry.path())
                .map_err(|e| format!("Invalid symbolic link: {e}"))?;
            if !target.starts_with(stage) {
                return Err("External symbolic link is blocked".into());
            }
        } else if !entry.file_type().is_dir() && !entry.file_type().is_file() {
            return Err("Special archive files are blocked".into());
        }
    }
    Ok(())
}

fn publish(
    stage: &Path,
    dest: &Path,
    archive: &Path,
    entries: &[Entry],
    keep: bool,
    ctx: &Context,
) -> Result<ExtractReport, String> {
    let mut report = ExtractReport::default();
    let mut root_map = HashMap::<PathBuf, PathBuf>::new();
    if keep {
        // Renaming one root must not redirect its links into another pre-existing root.
        for item in walkdir::WalkDir::new(stage)
            .follow_links(false)
            .min_depth(1)
        {
            let item = item.map_err(|e| e.to_string())?;
            if item.file_type().is_symlink() {
                let source_root = item
                    .path()
                    .strip_prefix(stage)
                    .unwrap()
                    .components()
                    .next()
                    .unwrap();
                let resolved = fs::canonicalize(item.path()).map_err(|e| e.to_string())?;
                let target_root = resolved
                    .strip_prefix(stage)
                    .map_err(|_| "External symbolic link")?
                    .components()
                    .next();
                if target_root != Some(source_root) {
                    return Err("Keep Both cannot rename cross-folder symbolic links safely".into());
                }
            }
        }
        for item in fs::read_dir(stage).map_err(|e| e.to_string())? {
            if ctx.check().is_err() {
                report.cancelled = true;
                break;
            }
            let item = item.map_err(|e| e.to_string())?;
            let base = dest.join(item.file_name());
            let mut moved = None;
            for i in 0..10_000 {
                let candidate = paths::numbered(&base, i);
                match paths::rename_no_replace(&item.path(), &candidate) {
                    Ok(()) => {
                        moved = Some(candidate);
                        break;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => {
                        report
                            .failed_files
                            .push((item.file_name().to_string_lossy().into(), e.to_string()));
                        break;
                    }
                }
            }
            if let Some(p) = moved {
                root_map.insert(PathBuf::from(item.file_name()), p);
            } else if report.failed_files.is_empty() {
                report.failed_files.push((
                    base.display().to_string(),
                    "Too many conflicting names".into(),
                ));
            }
        }
        for entry in entries.iter().filter(|e| !e.is_dir) {
            let p = paths::relative(&entry.path)?;
            let mut parts = p.components();
            let root = PathBuf::from(parts.next().unwrap().as_os_str());
            if let Some(mapped) = root_map.get(&root) {
                let output = if parts.as_path().as_os_str().is_empty() {
                    mapped.clone()
                } else {
                    mapped.join(parts.as_path())
                };
                report
                    .success_files
                    .push(output.strip_prefix(dest).unwrap().to_string_lossy().into());
                report.output_paths.push(output.to_string_lossy().into());
            }
        }
    } else {
        // Files already passed CRC validation. Rename each file atomically; merge directories.
        // This is a per-file transaction, not rollback of the entire destination tree.
        let mut nodes: Vec<_> = walkdir::WalkDir::new(stage)
            .follow_links(false)
            .min_depth(1)
            .into_iter()
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        nodes.sort_by_key(|e| (e.file_type().is_symlink(), e.depth()));
        for node in nodes {
            if ctx.check().is_err() {
                report.cancelled = true;
                break;
            }
            let relative = node.path().strip_prefix(stage).unwrap();
            let target = dest.join(relative);
            let result = (|| {
                if target == archive {
                    return Err("Refusing to replace the source archive".into());
                }
                if node.file_type().is_dir() {
                    return paths::ensure_under(dest, &target);
                }
                paths::ensure_under(dest, target.parent().ok_or("Missing output parent")?)?;
                if let Ok(m) = fs::symlink_metadata(&target) {
                    if m.is_symlink() || m.is_dir() {
                        return Err("Destination is a link or folder; use Keep Both".into());
                    }
                }
                fs::rename(node.path(), &target).map_err(|e| e.to_string())
            })();
            match result {
                Ok(()) if !node.file_type().is_dir() => {
                    report.success_files.push(relative.to_string_lossy().into());
                    report.output_paths.push(target.to_string_lossy().into());
                }
                Ok(()) => (),
                Err(e) => report
                    .failed_files
                    .push((relative.to_string_lossy().into(), e)),
            }
        }
    }
    Ok(report)
}

//! GUI/CLI가 함께 사용하는 압축 엔진. 학습은 [`Engine`]의 `preview` → `extract` 순서로 시작합니다.
//!
//! `stream`은 단일 압축 스트림을 준비하고, ZIP/TAR/legacy/sidecar 엔진이 형식을 처리합니다.
//! [`paths`]는 경로와 원본 파일을 보호하고, [`Context`]는 취소·진행률을 전달합니다.
//! 압축 해제는 임시 디렉터리에서 검증한 뒤 목적지로 옮깁니다. 다만 옮기기는 파일 또는
//! 최상위 항목 단위이므로, 도중에 실패·취소되어도 이미 옮긴 결과 전체를 되돌리지는 않습니다.
mod compress;
pub mod context;
mod legacy;
mod legacy_worker;
pub mod paths;
mod sidecar;
mod stream;
mod tar_engine;
pub mod zip_engine;
pub use compress::CompressionRequest;
pub use context::{Context, Progress};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

/// 압축 파일 내부 항목의 메타데이터. `path`는 로컬 절대 경로가 아닌 아카이브 내부 이름입니다.
/// 헤더의 크기·경로는 신뢰하지 않으며, 목록 검사와 실제 디코딩 시 각각 검증합니다.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub compressed_size: Option<u64>,
    pub is_encrypted: bool,
    pub is_dir: bool,
    pub is_link: bool,
    pub error: Option<String>,
}

/// 목적지로 옮긴 결과. `Ok(report)`여도 일부 항목 실패 또는 취소가 있을 수 있습니다.
/// 호출자는 `failed_files`와 `cancelled`를 함께 확인해야 합니다.
#[derive(Default, Debug, serde::Serialize)]
pub struct ExtractReport {
    /// 성공한 파일·링크의 목적지 기준 상대 경로. 이름 충돌 시 변경된 이름을 포함합니다.
    pub success_files: Vec<String>,
    pub failed_files: Vec<(String, String)>,
    /// 성공한 파일·링크의 실제 절대 경로. 디렉터리 자체는 포함하지 않습니다.
    pub output_paths: Vec<String>,
    pub cancelled: bool,
}

/// 한 번의 압축 해제 요청. GUI와 CLI는 같은 요청과 검증 경로를 사용합니다.
pub struct ExtractRequest {
    pub archive: PathBuf,
    pub destination: PathBuf,
    /// `None`은 전체 항목, `Some`은 목록에 있는 정확한 항목 이름들입니다. 빈 목록은 오류입니다.
    pub targets: Option<Vec<String>>,
    pub password: Option<String>,
    /// `true`이면 최상위 항목을 충돌 없는 이름으로 옮기며, `false`이면 폴더를 병합합니다.
    pub keep_both: bool,
}

/// 형식별 엔진을 선택하는 진입점. 작업별 상태는 엔진이 아닌 [`Context`]에 둡니다.
#[derive(Clone)]
pub struct Engine {
    /// 번들 7-Zip 실행 파일 경로. ALZ/EGG helper도 같은 디렉터리에서 찾습니다.
    pub sidecar: PathBuf,
}

fn has_zip_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "zip" | "zipx" | "cbz"
    )
}

fn require_regular_archive(path: &Path) -> Result<(), String> {
    // Opening a FIFO can block before a decoder can observe cancellation. Follow
    // symlinks so ordinary archive aliases still work, but reject special files.
    if !fs::metadata(path).map_err(|e| e.to_string())?.is_file() {
        return Err("Archive input must be a regular file.".into());
    }
    Ok(())
}

impl Engine {
    /// 목록을 읽고 위험하거나 모호한 경로를 거릅니다. 파일 내용 전체의 무결성 검사는 아닙니다.
    pub fn preview(
        &self,
        path: &Path,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Entry>, String> {
        ctx.check()?;
        require_regular_archive(path)?;
        let prepared = self.prepare_stream(path, ctx)?;
        self.preview_prepared(path, prepared.as_ref(), password, ctx)
    }

    fn preview_prepared(
        &self,
        archive: &Path,
        prepared: Option<&stream::PreparedStream>,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Entry>, String> {
        let path = prepared.map_or(archive, |p| p.file.path());
        if let Some(entry) = prepared.and_then(|p| p.entry.as_ref()) {
            paths::validate_entries(std::slice::from_ref(entry))?;
            return Ok(vec![entry.clone()]);
        }
        let entries = if legacy::supports(path) {
            self.legacy_preview(path, password, ctx)?
        } else if has_zip_extension(path) {
            zip_engine::preview(path, ctx)?
        } else if tar_engine::supports(path) {
            tar_engine::preview(path, ctx)?
        } else {
            self.sidecar_preview(path, password, ctx)?
        };
        paths::validate_entries(&entries)?;
        Ok(entries)
    }

    /// 디코딩·검증 후 항목을 목적지로 옮깁니다. 취소는 오류 대신 `cancelled` 보고서로 반환합니다.
    pub fn extract(
        &self,
        request: &ExtractRequest,
        context: &Context,
    ) -> Result<ExtractReport, String> {
        match self.extract_to_staging_and_publish(request, context) {
            Err(e) if e == "CANCELLED" || context.check().is_err() => Ok(ExtractReport {
                cancelled: true,
                ..Default::default()
            }),
            result => result,
        }
    }

    fn extract_to_staging_and_publish(
        &self,
        request: &ExtractRequest,
        context: &Context,
    ) -> Result<ExtractReport, String> {
        // 1. 원본 식별자를 보관하고 목록·선택을 검증합니다. 분할 볼륨도 덮어쓰지 않아야 합니다.
        let archive = fs::canonicalize(&request.archive).map_err(|e| e.to_string())?;
        require_regular_archive(&archive)?;
        let mut protected_inputs = paths::ProtectedInputs::new(&archive)?;
        let prepared = self.prepare_stream(&archive, context)?;
        let prepared_input = prepared
            .as_ref()
            .map_or(archive.as_path(), |p| p.file.path());
        let entries = self.preview_prepared(
            &archive,
            prepared.as_ref(),
            request.password.as_deref(),
            context,
        )?;
        let targets = request
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
        let selected_entries: Vec<_> = entries
            .iter()
            .filter(|e| targets.as_ref().is_none_or(|t| t.contains(&e.path)))
            .cloned()
            .collect();
        if selected_entries.iter().any(|e| e.is_encrypted) && request.password.is_none() {
            return Err("PASSWORD_REQUIRED".into());
        }
        // 2. 목적지와 같은 파일시스템의 임시 폴더에만 디코딩합니다. TempDir가 미완료 결과를 정리합니다.
        paths::ensure_directory(&request.destination)?;
        let destination = fs::canonicalize(&request.destination).map_err(|e| e.to_string())?;
        let staging = tempfile::Builder::new()
            .prefix(".ziplens-astra-")
            .tempdir_in(&destination)
            .map_err(|e| e.to_string())?;
        context.set_total(selected_entries.iter().map(|e| e.size).sum());
        let selected_names: HashSet<_> = selected_entries.iter().map(|e| e.path.clone()).collect();
        if let Some(entry) = prepared.as_ref().and_then(|p| p.entry.as_ref()) {
            let mut source = fs::File::open(prepared_input).map_err(|e| e.to_string())?;
            let mut output = fs::File::options()
                .write(true)
                .create_new(true)
                .open(staging.path().join(paths::relative(&entry.path)?))
                .map_err(|e| e.to_string())?;
            if context.copy(&mut source, &mut output, &entry.path, entry.size)? != entry.size {
                return Err("Truncated decoded stream".into());
            }
        } else if legacy::supports(prepared_input) {
            for source in self.legacy_extract(
                prepared_input,
                staging.path(),
                &selected_entries,
                request.password.as_deref(),
                context,
            )? {
                protected_inputs.add(&source)?;
            }
        } else if has_zip_extension(prepared_input)
            && zip_engine::native_supported(prepared_input, context)?
        {
            zip_engine::extract(
                prepared_input,
                staging.path(),
                &selected_names,
                request.password.as_deref(),
                context,
            )?;
        } else if tar_engine::supports(prepared_input) {
            tar_engine::extract(prepared_input, staging.path(), &selected_names, context)?;
        } else {
            // Reject links before launching an external extractor. Its parser is not a sandbox.
            if entries.iter().any(|e| e.is_link) {
                return Err("Links in sidecar archives are not supported safely yet".into());
            }
            self.sidecar_extract(
                prepared_input,
                staging.path(),
                &selected_entries,
                request.password.as_deref(),
                context,
            )?;
        }
        // 3. 실제 출력도 검사한 뒤 옮깁니다. 헤더 검사만으로 외부 추출기의 출력을 신뢰하지 않습니다.
        context.check()?;
        validate_staged_tree(staging.path())?;
        let expected_files: HashSet<_> = selected_entries
            .iter()
            .filter(|e| !e.is_dir)
            .map(|e| paths::relative(&e.path))
            .collect::<Result<_, _>>()?;
        for item in walkdir::WalkDir::new(staging.path())
            .follow_links(false)
            .min_depth(1)
        {
            let item = item.map_err(|e| e.to_string())?;
            if !item.file_type().is_dir()
                && !expected_files.contains(item.path().strip_prefix(staging.path()).unwrap())
            {
                return Err("Extractor produced an unselected file".into());
            }
        }
        let report = publish_staged_entries(
            staging.path(),
            &destination,
            &protected_inputs,
            &selected_entries,
            request.keep_both,
            context,
        )?;
        context.progress("", true);
        Ok(report)
    }

    /// 내부 파일 하나를 메모리 미리보기로 읽습니다. 20 MiB 제한을 적용하며 폴더·링크는 거부합니다.
    pub fn read_entry(
        &self,
        archive: &Path,
        name: &str,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<u8>, String> {
        paths::relative(name)?;
        ctx.check()?;
        require_regular_archive(archive)?;
        if has_zip_extension(archive) && zip_engine::native_supported(archive, ctx)? {
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

/// Entry point for the bundled ALZ/EGG worker. Applications use `Engine` instead.
#[doc(hidden)]
pub fn legacy_worker_main() -> i32 {
    legacy_worker::main()
}

/// 링크 문자열 검사에 더해 연결 사슬의 실제 도착점도 임시 폴더 안인지 검사합니다.
fn validate_staged_tree(staging: &Path) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(staging)
        .follow_links(false)
        .min_depth(1)
    {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_symlink() {
            let link = fs::read_link(entry.path()).map_err(|e| e.to_string())?;
            paths::validate_link(entry.path().strip_prefix(staging).unwrap(), &link)?;
            // Resolve link chains too. Broken/cyclic links are rejected deliberately.
            let target = fs::canonicalize(entry.path())
                .map_err(|e| format!("Invalid symbolic link: {e}"))?;
            if !target.starts_with(staging) {
                return Err("External symbolic link is blocked".into());
            }
        } else if !entry.file_type().is_dir() && !entry.file_type().is_file() {
            return Err("Special archive files are blocked".into());
        }
    }
    Ok(())
}

/// 검증된 결과를 목적지로 옮깁니다. 성공한 항목과 실패한 항목을 함께 보고합니다.
/// Keep Both는 최상위 항목 단위, 덮어쓰기는 파일 단위이며 전체 트리의 원자적 교체는 아닙니다.
fn publish_staged_entries(
    staging: &Path,
    destination: &Path,
    protected_inputs: &paths::ProtectedInputs,
    entries: &[Entry],
    keep_both: bool,
    context: &Context,
) -> Result<ExtractReport, String> {
    let mut report = ExtractReport::default();
    let mut published_roots = HashMap::<PathBuf, PathBuf>::new();
    if keep_both {
        // Renaming one root must not redirect its links into another pre-existing root.
        for item in walkdir::WalkDir::new(staging)
            .follow_links(false)
            .min_depth(1)
        {
            let item = item.map_err(|e| e.to_string())?;
            if item.file_type().is_symlink() {
                let source_root = item
                    .path()
                    .strip_prefix(staging)
                    .unwrap()
                    .components()
                    .next()
                    .unwrap();
                let resolved = fs::canonicalize(item.path()).map_err(|e| e.to_string())?;
                let target_root = resolved
                    .strip_prefix(staging)
                    .map_err(|_| "External symbolic link")?
                    .components()
                    .next();
                if target_root != Some(source_root) {
                    return Err("Keep Both cannot rename cross-folder symbolic links safely".into());
                }
            }
        }
        for item in fs::read_dir(staging).map_err(|e| e.to_string())? {
            if context.check().is_err() {
                report.cancelled = true;
                break;
            }
            let item = item.map_err(|e| e.to_string())?;
            let base = destination.join(item.file_name());
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
                published_roots.insert(PathBuf::from(item.file_name()), p);
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
            if let Some(mapped) = published_roots.get(&root) {
                let output = if parts.as_path().as_os_str().is_empty() {
                    mapped.clone()
                } else {
                    mapped.join(parts.as_path())
                };
                report.success_files.push(
                    output
                        .strip_prefix(destination)
                        .unwrap()
                        .to_string_lossy()
                        .into(),
                );
                report.output_paths.push(output.to_string_lossy().into());
            }
        }
    } else {
        // 형식별 디코딩 검사와 staging 검사를 마친 항목입니다. 폴더는 병합하고 파일은 rename합니다.
        // 파일별 교체는 원자적이지만, 전체 목적지 트리를 되돌리는 트랜잭션은 아닙니다.
        let mut nodes: Vec<_> = walkdir::WalkDir::new(staging)
            .follow_links(false)
            .min_depth(1)
            .into_iter()
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        nodes.sort_by_key(|e| (e.file_type().is_symlink(), e.depth()));
        // Resolve links while their targets still exist in the complete stage. Publication
        // can fail per file; a link must never fall back to a pre-existing, different target.
        let mut pending_links = Vec::new();
        for node in nodes.iter().filter(|e| e.file_type().is_symlink()) {
            let resolved = fs::canonicalize(node.path()).map_err(|e| e.to_string())?;
            let relative = resolved
                .strip_prefix(staging)
                .map_err(|_| "External symbolic link")?
                .to_owned();
            pending_links.push((node.clone(), relative, String::new()));
        }
        let mut published = HashSet::from([PathBuf::new()]); // the destination root already exists
        for node in nodes.iter().filter(|e| !e.file_type().is_symlink()) {
            if context.check().is_err() {
                report.cancelled = true;
                break;
            }
            let relative = node.path().strip_prefix(staging).unwrap();
            let target = destination.join(relative);
            let result = publish_staged_node(node, &target, destination, protected_inputs);
            match result {
                Ok(()) if !node.file_type().is_dir() => {
                    published.insert(relative.to_owned());
                    report.success_files.push(relative.to_string_lossy().into());
                    report.output_paths.push(target.to_string_lossy().into());
                }
                Ok(()) => {
                    published.insert(relative.to_owned());
                }
                Err(e) => report
                    .failed_files
                    .push((relative.to_string_lossy().into(), e)),
            }
        }
        // Retry unresolved link chains after their inner links have been published.
        // The earlier canonicalization already rejects cyclic/excessively deep chains.
        while !pending_links.is_empty() && !report.cancelled {
            let mut remaining = Vec::new();
            let mut published_any_link = false;
            for (node, resolved_relative, _) in pending_links {
                if context.check().is_err() {
                    report.cancelled = true;
                    break;
                }
                let relative = node.path().strip_prefix(staging).unwrap();
                let target = destination.join(relative);
                let result = (|| {
                    if !published.contains(&resolved_relative) {
                        return Err("Symbolic link target was not published".into());
                    }
                    let raw = fs::read_link(node.path()).map_err(|e| e.to_string())?;
                    let resolved =
                        fs::canonicalize(target.parent().ok_or("Missing output parent")?.join(raw))
                            .map_err(|e| format!("Symbolic link target is unavailable: {e}"))?;
                    if !resolved.starts_with(destination)
                        || !paths::same_file(&resolved, &destination.join(&resolved_relative))
                            .map_err(|e| e.to_string())?
                    {
                        return Err("Symbolic link target changed during publication".into());
                    }
                    publish_staged_node(&node, &target, destination, protected_inputs)
                })();
                match result {
                    Ok(()) => {
                        published_any_link = true;
                        report.success_files.push(relative.to_string_lossy().into());
                        report.output_paths.push(target.to_string_lossy().into());
                    }
                    Err(error) => remaining.push((node, resolved_relative, error)),
                }
            }
            if report.cancelled {
                break;
            }
            if !published_any_link {
                report
                    .failed_files
                    .extend(remaining.into_iter().map(|(node, _, error)| {
                        (
                            node.path()
                                .strip_prefix(staging)
                                .unwrap()
                                .to_string_lossy()
                                .into(),
                            error,
                        )
                    }));
                break;
            }
            pending_links = remaining;
        }
    }
    Ok(report)
}

/// 디렉터리는 병합하고 일반 파일·링크는 rename으로 옮깁니다.
/// 경로 검사는 동시 외부 변경을 잠그지 않으므로 이 함수를 파일시스템 sandbox로 간주하면 안 됩니다.
fn publish_staged_node(
    node: &walkdir::DirEntry,
    target: &Path,
    destination: &Path,
    protected_inputs: &paths::ProtectedInputs,
) -> Result<(), String> {
    if protected_inputs.contains(target)? {
        return Err("Refusing to replace a source archive or split volume".into());
    }
    if node.file_type().is_dir() {
        return paths::ensure_under(destination, target);
    }
    paths::ensure_under(destination, target.parent().ok_or("Missing output parent")?)?;
    if let Ok(metadata) = fs::symlink_metadata(target) {
        if metadata.is_symlink() || metadata.is_dir() {
            return Err("Destination is a link or folder; use Keep Both".into());
        }
    }
    fs::rename(node.path(), target).map_err(|e| e.to_string())
}

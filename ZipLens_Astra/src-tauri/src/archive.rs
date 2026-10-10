//! GUI의 Tauri IPC 인수를 `astra-core` 요청으로 바꾸는 연결부입니다.
//!
//! 압축 알고리즘은 이곳에 두지 않습니다. UI 이벤트 루프를 막지 않도록 엔진 작업을
//! `spawn_blocking`으로 넘기고, 진행률·취소와 작업 수명만 연결합니다.
//! `#[tauri::command]` 함수명과 인수명은 프런트엔드와 맞물리는 IPC 계약입니다.
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

static ARCHIVE_OPERATION_ACTIVE: AtomicBool = AtomicBool::new(false);
static ACTIVE_CANCELLATION: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
#[derive(Default)]
/// 외부 앱이 미리보기 파일을 읽는 동안 임시 폴더가 사라지지 않도록 앱 종료까지 소유합니다.
pub struct PreviewSessions(pub Mutex<Vec<tempfile::TempDir>>);

/// 이 프로세스에서 실행 중인 엔진 작업을 표시하는 RAII 가드입니다.
/// 엔진이 끝날 때까지 blocking closure가 소유해야 하며, 반환·오류 시 Drop으로 해제합니다.
struct ArchiveOperationGuard;
impl Drop for ArchiveOperationGuard {
    fn drop(&mut self) {
        *ACTIVE_CANCELLATION
            .get_or_init(Default::default)
            .lock()
            .unwrap() = None;
        ARCHIVE_OPERATION_ACTIVE.store(false, Ordering::Release);
    }
}
/// 네이티브 엔진 작업 하나와 그 작업만의 취소·진행률 컨텍스트를 만듭니다.
/// 파일 선택창까지 잠그는 프런트엔드 ArchiveActionGate와는 범위가 다릅니다.
fn begin_archive_operation(app: &AppHandle) -> Result<(ArchiveOperationGuard, Context), String> {
    if ARCHIVE_OPERATION_ACTIVE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Another archive operation is running".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    *ACTIVE_CANCELLATION
        .get_or_init(Default::default)
        .lock()
        .unwrap() = Some(cancelled.clone());
    let app = app.clone();
    Ok((
        ArchiveOperationGuard,
        Context::new(cancelled, move |p| {
            let _ = app.emit("archive_progress", p);
        }),
    ))
}
/// GUI와 CLI 모두 같은 동봉 7-Zip 경로를 사용합니다. 개발 실행에만 소스 폴더를 허용합니다.
pub(crate) fn create_archive_engine() -> Result<Engine, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bundled = exe
        .parent()
        .ok_or("Application directory missing")?
        .join("7zz");
    #[cfg(debug_assertions)]
    let bundled = if bundled.is_file() {
        bundled
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/7zz")
    };
    Ok(Engine { sidecar: bundled })
}
#[tauri::command]
/// 취소를 요청할 뿐 작업 완료를 뜻하지 않습니다. UI는 엔진의 최종 결과를 기다려야 합니다.
pub fn cancel_operation() {
    if let Some(cancel) = ACTIVE_CANCELLATION
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .as_ref()
    {
        cancel.store(true, Ordering::Relaxed);
    }
}
#[tauri::command]
/// 메모리 미리보기 대신 외부 앱으로 넘길 항목 하나를 임시 폴더에 해제합니다.
pub async fn prepare_external_preview(
    app: AppHandle,
    archive_path: String,
    target_file: String,
    password: Option<String>,
) -> Result<String, String> {
    let (operation_guard, context) = begin_archive_operation(&app)?;
    let engine = create_archive_engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        let session = tempfile::Builder::new()
            .prefix("ziplens-astra-view-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let report = engine.extract(
            &ExtractRequest {
                archive: archive_path.into(),
                destination: session.path().into(),
                targets: Some(vec![target_file]),
                password,
                keep_both: false,
            },
            &context,
        )?;
        if report.cancelled {
            return Err("CANCELLED".into());
        }
        if !report.failed_files.is_empty() || report.output_paths.len() != 1 {
            return Err("Cannot prepare external preview".into());
        }
        let path = report.output_paths[0].clone();
        // Retain until app exit so the receiving application has time to read the file.
        app.state::<PreviewSessions>()
            .0
            .lock()
            .unwrap()
            .push(session);
        Ok(path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
/// 선택된 항목을 해제합니다. 파일별 실패와 취소는 성공 경로가 포함된 보고서로 돌아옵니다.
pub async fn extract_archive(
    app: AppHandle,
    archive_path: String,
    dest_path: String,
    target_files: Option<Vec<String>>,
    password: Option<String>,
    conflict_resolution: String,
) -> Result<ziplens_astra_core::ExtractReport, String> {
    if !["overwrite", "keep_both"].contains(&conflict_resolution.as_str()) {
        return Err("Invalid conflict resolution".into());
    }
    let (operation_guard, context) = begin_archive_operation(&app)?;
    let engine = create_archive_engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        engine.extract(
            &ExtractRequest {
                archive: archive_path.into(),
                destination: dest_path.into(),
                targets: target_files,
                password,
                keep_both: conflict_resolution == "keep_both",
            },
            &context,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
/// 압축 안의 항목 목록을 읽습니다. 항목의 실제 내용 읽기는 extract_file_memory가 맡습니다.
pub async fn preview_archive(
    app: AppHandle,
    archive_path: String,
    password: Option<String>,
) -> Result<Vec<ziplens_astra_core::Entry>, String> {
    let (operation_guard, context) = begin_archive_operation(&app)?;
    let engine = create_archive_engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        engine.preview(&PathBuf::from(archive_path), password.as_deref(), &context)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
/// 기존 GUI 옵션을 엔진 요청으로 전달합니다. CLI의 출력 파일 게시 정책은 cli.rs에 있습니다.
#[allow(clippy::too_many_arguments)] // Keep named IPC fields compatible with the frontend.
pub async fn compress_archive(
    app: AppHandle,
    source_paths: Vec<String>,
    dest_path: String,
    format: String,
    split_size: Option<String>,
    password: Option<String>,
    encrypt_level: Option<String>,
    compression_level: Option<u32>,
) -> Result<Vec<String>, String> {
    let (operation_guard, context) = begin_archive_operation(&app)?;
    let engine = create_archive_engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        engine.compress(
            &CompressionRequest {
                sources: source_paths.into_iter().map(PathBuf::from).collect(),
                destination: dest_path.into(),
                format,
                split_size,
                password,
                encryption: encrypt_level,
                level: compression_level.unwrap_or(6),
            },
            &context,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
/// 확인창에 표시할 충돌 후보입니다. 이 조회가 파일 이름을 예약하지는 않으므로
/// 실제 파일 반영 때의 엔진 검사도 유지해야 합니다.
pub fn check_conflicts(dest_path: String, root_items: Vec<String>) -> Result<Vec<String>, String> {
    let dest = PathBuf::from(dest_path);
    let mut conflicts = Vec::new();
    for item in root_items {
        let path = ziplens_astra_core::paths::relative(&item)?;
        if path.components().count() != 1 {
            return Err("Expected a root item name".into());
        }
        if ziplens_astra_core::paths::exists(&dest.join(path)) {
            conflicts.push(item);
        }
    }
    Ok(conflicts)
}
#[tauri::command]
/// 내장 텍스트·이미지 미리보기용 바이트를 읽습니다. 크기 한도는 core에서도 검사합니다.
pub async fn extract_file_memory(
    app: AppHandle,
    archive_path: String,
    target_file: String,
    password: Option<String>,
) -> Result<Vec<u8>, String> {
    let (operation_guard, context) = begin_archive_operation(&app)?;
    let engine = create_archive_engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_guard;
        engine.read_entry(
            &PathBuf::from(archive_path),
            &target_file,
            password.as_deref(),
            &context,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn save_report_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(file_path, content).map_err(|e| e.to_string())
}

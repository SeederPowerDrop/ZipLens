//! Tauri adapter only. Filesystem/codec behavior is tested in astra-core.
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

static ACTIVE: AtomicBool = AtomicBool::new(false);
static CANCEL: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
#[derive(Default)]
pub struct PreviewSessions(pub Mutex<Vec<tempfile::TempDir>>);
struct Job;
impl Drop for Job {
    fn drop(&mut self) {
        *CANCEL.get_or_init(Default::default).lock().unwrap() = None;
        ACTIVE.store(false, Ordering::Release);
    }
}
fn begin(app: &AppHandle) -> Result<(Job, Context), String> {
    if ACTIVE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Another archive operation is running".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    *CANCEL.get_or_init(Default::default).lock().unwrap() = Some(cancelled.clone());
    let app = app.clone();
    Ok((
        Job,
        Context::new(cancelled, move |p| {
            let _ = app.emit("archive_progress", p);
        }),
    ))
}
fn engine() -> Result<Engine, String> {
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
pub fn cancel_operation() {
    if let Some(cancel) = CANCEL
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .as_ref()
    {
        cancel.store(true, Ordering::Relaxed);
    }
}
#[tauri::command]
pub async fn prepare_external_preview(
    app: AppHandle,
    archive_path: String,
    target_file: String,
    password: Option<String>,
) -> Result<String, String> {
    let (job, ctx) = begin(&app)?;
    let engine = engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
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
            &ctx,
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
    let (job, ctx) = begin(&app)?;
    let engine = engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
        engine.extract(
            &ExtractRequest {
                archive: archive_path.into(),
                destination: dest_path.into(),
                targets: target_files,
                password,
                keep_both: conflict_resolution == "keep_both",
            },
            &ctx,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn preview_archive(
    app: AppHandle,
    archive_path: String,
    password: Option<String>,
) -> Result<Vec<ziplens_astra_core::Entry>, String> {
    let (job, ctx) = begin(&app)?;
    let engine = engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
        engine.preview(&PathBuf::from(archive_path), password.as_deref(), &ctx)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
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
    let (job, ctx) = begin(&app)?;
    let engine = engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
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
            &ctx,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
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
pub async fn extract_file_memory(
    app: AppHandle,
    archive_path: String,
    target_file: String,
    password: Option<String>,
) -> Result<Vec<u8>, String> {
    let (job, ctx) = begin(&app)?;
    let engine = engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _job = job;
        engine.read_entry(
            &PathBuf::from(archive_path),
            &target_file,
            password.as_deref(),
            &ctx,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn save_report_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(file_path, content).map_err(|e| e.to_string())
}

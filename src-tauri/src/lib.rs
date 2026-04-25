// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod archive;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct StartupAction {
    action: String,   // "extract" | "compress" | ""
    paths: Vec<String>,
}

/// CLI 인수를 파싱합니다.
/// 지원 형식:
///   ziplens --extract /path/to/archive.zip
///   ziplens --compress /path/to/file1 /path/to/file2 ...
fn parse_startup_args() -> StartupAction {
    let args: Vec<String> = std::env::args().skip(1).collect();
    
    if args.is_empty() {
        return StartupAction { action: String::new(), paths: vec![] };
    }
    
    match args[0].as_str() {
        "--extract" => {
            let paths: Vec<String> = args[1..].to_vec();
            StartupAction { action: "extract".into(), paths }
        }
        "--compress" => {
            let paths: Vec<String> = args[1..].to_vec();
            StartupAction { action: "compress".into(), paths }
        }
        _ => {
            // 플래그 없이 경로가 주어진 경우: 압축 파일이면 해제, 아니면 압축
            let paths: Vec<String> = args.clone();
            let first = std::path::Path::new(&args[0]);
            let ext = first
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            let archive_exts = ["zip", "7z", "rar", "tar", "gz", "tgz", "zst", "tzst", "cab", "iso", "lzh", "alz", "egg"];
            if archive_exts.contains(&ext.as_str()) {
                StartupAction { action: "extract".into(), paths }
            } else {
                StartupAction { action: "compress".into(), paths }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_action = parse_startup_args();

    tauri::Builder::default()
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let window = app.get_webview_window("main").unwrap();
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::UnderWindowBackground,
                    None,
                    None,
                )
                .unwrap_or_else(|_| println!("Apply vibrancy failed"));
            }

            // startup_action을 webview가 준비된 뒤 emit
            if !startup_action.action.is_empty() {
                use tauri::Manager;
                use tauri::Emitter;
                let action = startup_action.clone();
                let window = app.get_webview_window("main").unwrap();
                // 웹뷰 로드 완료 후 이벤트를 보내기 위해 짧게 대기
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let _ = window.emit("startup_action", action);
                });
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            archive::extract_archive,
            archive::compress_archive,
            archive::preview_archive,
            archive::check_conflicts,
            archive::save_report_file,
            archive::resolve_extract_error
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

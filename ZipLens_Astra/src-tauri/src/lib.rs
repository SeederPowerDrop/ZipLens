//! GUI 부팅, 네이티브 메뉴, Finder 요청 큐와 IPC 등록을 구성합니다.
//! headless `cli` 명령은 main.rs에서 먼저 처리하므로 이 GUI 초기화를 거치지 않습니다.

// Tauri 초기 템플릿의 연결 확인 명령입니다. 실제 압축 기능은 archive 모듈에 있습니다.
// 이미 등록된 IPC 이름을 이번 가독성 정리에서 바꾸지 않습니다.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod archive;
pub mod cli;
mod file_associations;
mod input;
mod licenses;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct StartupAction {
    action: String, // "extract" | "compress" | "settings" | ""
    paths: Vec<String>,
}

/// 창을 여는 GUI 시작 인수를 파싱합니다. JSON을 반환하는 `cli ...`와 다른 진입점입니다.
/// 지원 형식:
///   ziplens --extract /path/to/archive.zip
///   ziplens --compress /path/to/file1 /path/to/file2 ...
fn parse_gui_startup_args() -> StartupAction {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.is_empty() {
        return StartupAction {
            action: String::new(),
            paths: vec![],
        };
    }

    match args[0].as_str() {
        "--extract" => {
            let paths: Vec<String> = args[1..].to_vec();
            StartupAction {
                action: "extract".into(),
                paths,
            }
        }
        "--compress" => {
            let paths: Vec<String> = args[1..].to_vec();
            StartupAction {
                action: "compress".into(),
                paths,
            }
        }
        _ => {
            // 플래그 없이 경로가 주어진 경우: 압축 파일이면 해제, 아니면 압축
            let paths: Vec<String> = args.clone();
            let first = std::path::Path::new(&args[0]);
            if file_associations::is_archive_path(first) {
                StartupAction {
                    action: "extract".into(),
                    paths,
                }
            } else {
                StartupAction {
                    action: "compress".into(),
                    paths,
                }
            }
        }
    }
}

// 웹뷰가 이벤트를 듣기 전에 도착한 요청도 보관합니다. 프런트엔드는 먼저 listen한 뒤
// take_startup_actions로 가져가야 합니다. 고정 시간 sleep으로 준비 상태를 추측하지 않습니다.
struct StartupQueue(std::sync::Mutex<Vec<StartupAction>>);
#[tauri::command]
fn take_startup_actions(queue: tauri::State<'_, StartupQueue>) -> Vec<StartupAction> {
    std::mem::take(&mut *queue.0.lock().unwrap())
}

/// Follow the in-app language for custom menu labels. Native standard actions
/// retain their macOS-managed labels, shortcuts and behavior.
#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let (about, defaults, file, edit) = match lang.as_str() {
        "ko" => ("ZipLens 정보", "기본 압축 앱 설정…", "파일", "편집"),
        "en" => ("About ZipLens", "Default Archive App…", "File", "Edit"),
        "ja" => ("ZipLens について", "標準の圧縮アプリ…", "ファイル", "編集"),
        "zh" => ("关于 ZipLens", "默认压缩应用…", "文件", "编辑"),
        "vi" => (
            "Giới thiệu về ZipLens",
            "Ứng dụng nén mặc định…",
            "Tệp",
            "Sửa",
        ),
        "es" => (
            "Acerca de ZipLens",
            "Aplicación de archivos predeterminada…",
            "Archivo",
            "Edición",
        ),
        "fr" => (
            "À propos de ZipLens",
            "Application d’archives par défaut…",
            "Fichier",
            "Édition",
        ),
        "de" => (
            "Über ZipLens",
            "Standard-App für Archive…",
            "Ablage",
            "Bearbeiten",
        ),
        "ru" => ("О ZipLens", "Архиватор по умолчанию…", "Файл", "Правка"),
        "ar" => ("حول ZipLens", "تطبيق الأرشيف الافتراضي…", "ملف", "تحرير"),
        _ => return Err("UNSUPPORTED_LANGUAGE".into()),
    };

    #[cfg(target_os = "macos")]
    {
        use tauri::menu::MenuItemKind;
        let Some(menu) = app.menu() else {
            return Ok(());
        };
        if let Some(MenuItemKind::Submenu(submenu)) = menu.get("app_submenu") {
            for (id, text) in [("custom_about", about), ("file_associations", defaults)] {
                if let Some(MenuItemKind::MenuItem(item)) = submenu.get(id) {
                    item.set_text(text).map_err(|error| error.to_string())?;
                }
            }
        }
        for (id, text) in [("file_submenu", file), ("edit_submenu", edit)] {
            if let Some(MenuItemKind::Submenu(submenu)) = menu.get(id) {
                submenu.set_text(text).map_err(|error| error.to_string())?;
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, about, defaults, file, edit);
    Ok(())
}

// Finder can send Opened/Reopen before Tauri's Ready event creates the main
// window. Creating it here would make Tauri's setup fail with a duplicate label
// and abort inside applicationDidFinishLaunching. Early actions stay queued for
// the frontend handshake; after setup, CloseRequested keeps this window alive.
#[cfg(target_os = "macos")]
fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn queue_startup_action<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: StartupAction) {
    use tauri::{Emitter, Manager};
    app.state::<StartupQueue>().0.lock().unwrap().push(action);
    show_main_window(app);
    let _ = app.emit("startup_actions_available", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// GUI 서비스의 조립 지점입니다. 새 IPC는 구현뿐 아니라 invoke_handler에도 등록해야 합니다.
pub fn run() {
    let startup_action = parse_gui_startup_args();

    tauri::Builder::default()
        .manage(archive::PreviewSessions::default())
        .manage(StartupQueue(std::sync::Mutex::new(
            if startup_action.action.is_empty() {
                vec![]
            } else {
                vec![startup_action]
            },
        )))
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
                use tauri::{Emitter, Manager};
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let window = app.get_webview_window("main").unwrap();
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::UnderWindowBackground,
                    None,
                    None,
                )
                .unwrap_or_else(|_| println!("Apply vibrancy failed"));

                let app_submenu = Submenu::with_id_and_items(
                    app,
                    "app_submenu",
                    "ZipLens",
                    true,
                    &[
                        &MenuItem::with_id(
                            app,
                            "custom_about",
                            "About ZipLens",
                            true,
                            None::<&str>,
                        )
                        .unwrap(),
                        &PredefinedMenuItem::separator(app).unwrap(),
                        &MenuItem::with_id(
                            app,
                            "file_associations",
                            "Default Archive App…",
                            true,
                            Some("CmdOrCtrl+,"),
                        )
                        .unwrap(),
                        &PredefinedMenuItem::separator(app).unwrap(),
                        &PredefinedMenuItem::services(app, None).unwrap(),
                        &PredefinedMenuItem::separator(app).unwrap(),
                        &PredefinedMenuItem::hide(app, None).unwrap(),
                        &PredefinedMenuItem::hide_others(app, None).unwrap(),
                        &PredefinedMenuItem::show_all(app, None).unwrap(),
                        &PredefinedMenuItem::separator(app).unwrap(),
                        &PredefinedMenuItem::quit(app, None).unwrap(),
                    ],
                )
                .unwrap();

                let file_submenu = Submenu::with_id_and_items(
                    app,
                    "file_submenu",
                    "File",
                    true,
                    &[&PredefinedMenuItem::close_window(app, None).unwrap()],
                )
                .unwrap();

                let edit_submenu = Submenu::with_id_and_items(
                    app,
                    "edit_submenu",
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None).unwrap(),
                        &PredefinedMenuItem::redo(app, None).unwrap(),
                        &PredefinedMenuItem::separator(app).unwrap(),
                        &PredefinedMenuItem::cut(app, None).unwrap(),
                        &PredefinedMenuItem::copy(app, None).unwrap(),
                        &PredefinedMenuItem::paste(app, None).unwrap(),
                        &PredefinedMenuItem::select_all(app, None).unwrap(),
                    ],
                )
                .unwrap();

                let menu =
                    Menu::with_items(app, &[&app_submenu, &file_submenu, &edit_submenu]).unwrap();
                app.set_menu(menu).unwrap();

                app.on_menu_event(move |app, event| {
                    if event.id() == "file_associations" {
                        queue_startup_action(
                            app,
                            StartupAction {
                                action: "settings".into(),
                                paths: vec![],
                            },
                        );
                    }
                    if event.id() == "custom_about" {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("open_about", ());
                        }
                    }
                });
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // Keep the webview and its in-flight dialogs/jobs alive for Dock/Finder reopen.
                    // Cmd+Q still terminates the app through the application menu.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            archive::extract_archive,
            archive::compress_archive,
            archive::preview_archive,
            archive::check_conflicts,
            archive::save_report_file,
            archive::cancel_operation,
            archive::prepare_external_preview,
            input::inspect_input_paths,
            take_startup_actions,
            set_menu_language,
            licenses::open_license_folder,
            file_associations::get_file_associations,
            file_associations::set_default_file_associations,
            archive::extract_file_memory
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = &event {
                use tauri::Manager;
                archive::cancel_operation();
                app.state::<archive::PreviewSessions>()
                    .0
                    .lock()
                    .unwrap()
                    .clear();
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = &event
            {
                show_main_window(app);
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    queue_startup_action(
                        app,
                        StartupAction {
                            action: "extract".into(),
                            paths,
                        },
                    );
                }
            }
        });
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use tauri::Manager;

    #[test]
    fn finder_open_before_ready_preserves_actions_without_creating_a_duplicate_window() {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().app.windows.push(Default::default());
        let mut app = tauri::test::mock_builder()
            .manage(StartupQueue(std::sync::Mutex::new(vec![])))
            .build(context)
            .unwrap();

        // macOS delivers an archive-open event before applicationDidFinishLaunching.
        queue_startup_action(
            app.handle(),
            StartupAction {
                action: "extract".into(),
                paths: vec!["/tmp/압축 파일.zip".into()],
            },
        );
        // An early Dock reopen must not create the configured window either.
        show_main_window(app.handle());
        assert!(app.webview_windows().is_empty());

        // Run Tauri's real setup path, which owns configured-window creation.
        #[allow(deprecated)]
        app.run_iteration(|_, _| {});
        assert_eq!(app.webview_windows().len(), 1);
        assert!(app.get_webview_window("main").is_some());

        // The frontend subscribes after setup and drains the pending input once.
        let actions = take_startup_actions(app.state());
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action, "extract");
        assert_eq!(actions[0].paths, ["/tmp/압축 파일.zip"]);
        assert!(take_startup_actions(app.state()).is_empty());

        // A later reopen restores the same window and cannot duplicate it.
        show_main_window(app.handle());
        assert_eq!(app.webview_windows().len(), 1);
    }
}

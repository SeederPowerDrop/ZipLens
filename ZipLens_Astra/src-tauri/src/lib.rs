// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod archive;
mod file_associations;
mod licenses;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct StartupAction {
    action: String, // "extract" | "compress" | "settings" | ""
    paths: Vec<String>,
}

/// CLI 인수를 파싱합니다.
/// 지원 형식:
///   ziplens --extract /path/to/archive.zip
///   ziplens --compress /path/to/file1 /path/to/file2 ...
fn parse_startup_args() -> StartupAction {
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

// A handshake replaces the old 800 ms sleep, which could lose Finder/CLI open events.
struct StartupQueue(std::sync::Mutex<Vec<StartupAction>>);
#[tauri::command]
fn take_startup_actions(queue: tauri::State<'_, StartupQueue>) -> Vec<StartupAction> {
    std::mem::take(&mut *queue.0.lock().unwrap())
}

// Finder may send an Opened event while the window is minimized or closed.
// New webviews drain StartupQueue after installing their event listener.
#[cfg(target_os = "macos")]
fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    let window = app.get_webview_window("main").or_else(|| {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")?;
        let window = tauri::WebviewWindowBuilder::from_config(app, config)
            .ok()?
            .build()
            .ok()?;
        let _ = window_vibrancy::apply_vibrancy(
            &window,
            window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
            None,
            None,
        );
        Some(window)
    });
    if let Some(window) = window {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_action = parse_startup_args();

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
                    "ZipLens 2.0",
                    true,
                    &[
                        &MenuItem::with_id(
                            app,
                            "custom_about",
                            "About ZipLens 2.0",
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
                        app.state::<StartupQueue>()
                            .0
                            .lock()
                            .unwrap()
                            .push(StartupAction {
                                action: "settings".into(),
                                paths: vec![],
                            });
                        show_main_window(app);
                        let _ = app.emit("startup_actions_available", ());
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
            take_startup_actions,
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
                use tauri::{Emitter, Manager};
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    app.state::<StartupQueue>()
                        .0
                        .lock()
                        .unwrap()
                        .push(StartupAction {
                            action: "extract".into(),
                            paths,
                        });
                    show_main_window(app);
                    let _ = app.emit("startup_actions_available", ());
                }
            }
        });
}

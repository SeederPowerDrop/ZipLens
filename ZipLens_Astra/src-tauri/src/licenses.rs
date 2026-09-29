//! The frontend may open only the app's fixed, bundled notice directory.
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn open_license_folder(app: tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("legal");
    #[cfg(debug_assertions)]
    let directory = if directory.is_dir() {
        directory
    } else {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../legal")
    };
    if !directory.join("README.txt").is_file() {
        return Err("The bundled open-source license files are missing.".into());
    }
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

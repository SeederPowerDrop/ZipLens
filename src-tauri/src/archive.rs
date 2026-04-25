use std::path::Path;
use std::fs;
use zip::ZipArchive;
use tauri::AppHandle;
use encoding_rs::EUC_KR;

/// ZIP 파일 내 엔트리 파일명을 UTF-8로 안전하게 디코딩합니다.
/// ZIP 스펙상 UTF-8 플래그가 없으면 raw bytes는 CP949/EUC-KR 등의 인코딩일 수 있습니다.
/// 1) UTF-8로 유효하면 그대로 반환
/// 2) 아니면 EUC-KR(=CP949 슈퍼셋)으로 디코딩 시도
/// 3) 그래도 깨지면 lossy UTF-8로 반환
fn decode_zip_filename(raw: &[u8]) -> String {
    if raw.is_ascii() {
        return String::from_utf8_lossy(raw).into_owned();
    }

    let (euckr_decoded, _, _) = EUC_KR.decode(raw);
    let euckr_str = euckr_decoded.into_owned();
    let euckr_korean = euckr_str.chars()
        .filter(|c| (*c >= '\u{AC00}' && *c <= '\u{D7A3}') || 
                (*c >= '\u{3130}' && *c <= '\u{318F}') || 
                (*c >= '\u{1100}' && *c <= '\u{11FF}'))
        .count();

    if euckr_korean > 0 {
        return euckr_str;
    }

    if let Ok(utf8_str) = std::str::from_utf8(raw) {
        return utf8_str.to_string();
    }

    euckr_str
}

pub fn recover_pua_string(s: &str) -> String {
    let mut has_pua = false;
    for c in s.chars() {
        let cp = c as u32;
        if cp >= 0xEF00 && cp <= 0xEFFF {
            has_pua = true;
            break;
        }
    }
    
    if !has_pua {
        return s.to_string();
    }

    let mut recovered_bytes = Vec::new();
    for c in s.chars() {
        let cp = c as u32;
        if cp >= 0xEF00 && cp <= 0xEFFF {
            recovered_bytes.push((cp & 0xFF) as u8);
        } else {
            let mut b = [0; 4];
            let bytes = c.encode_utf8(&mut b).as_bytes();
            recovered_bytes.extend_from_slice(bytes);
        }
    }
    
    let (euckr_decoded, _, _) = EUC_KR.decode(&recovered_bytes);
    let euckr_str = euckr_decoded.into_owned();
    let euckr_korean = euckr_str.chars()
        .filter(|c| (*c >= '\u{AC00}' && *c <= '\u{D7A3}') || 
                (*c >= '\u{3130}' && *c <= '\u{318F}') || 
                (*c >= '\u{1100}' && *c <= '\u{11FF}'))
        .count();

    if euckr_korean > 0 {
        return euckr_str;
    }

    if let Ok(utf8_str) = std::str::from_utf8(&recovered_bytes) {
        return utf8_str.to_string();
    }
    
    euckr_str
}




use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;

static ERROR_RESOLUTION_TX: Mutex<Option<Sender<String>>> = Mutex::new(None);
static IGNORE_ALL_ERRORS: AtomicBool = AtomicBool::new(false);
static PROMPT_MUTEX: Mutex<()> = Mutex::new(());

#[derive(serde::Serialize, Clone)]
pub struct ExtractReport {
    pub success_files: Vec<String>,
    pub failed_files: Vec<(String, String)>,
    pub cancelled: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct ErrorPromptInfo {
    pub path: String,
    pub error: String,
}

#[tauri::command]
pub fn resolve_extract_error(choice: String) {
    let mut tx_guard = ERROR_RESOLUTION_TX.lock().unwrap();
    if let Some(tx) = tx_guard.take() {
        let _ = tx.send(choice);
    }
}

#[tauri::command]
pub fn check_conflicts(dest_path: String, root_items: Vec<String>) -> Vec<String> {
    let mut conflicts = Vec::new();
    let dest = Path::new(&dest_path);
    for item in root_items {
        let full_path = dest.join(&item);
        if full_path.exists() {
            conflicts.push(item);
        }
    }
    conflicts
}

#[tauri::command]
pub async fn extract_archive(
    app: AppHandle,
    archive_path: String,
    dest_path: String,
    target_files: Option<Vec<String>>,
    password: Option<String>,
    conflict_resolution: String,
    root_items: Vec<String>,
) -> Result<ExtractReport, String> {
    IGNORE_ALL_ERRORS.store(false, Ordering::SeqCst);
    let path = Path::new(&archive_path);

    if !path.exists() {
        return Err("Archive file not found".into());
    }

    let is_keep_both = conflict_resolution == "keep_both";
    let is_overwrite = conflict_resolution == "overwrite";

    if is_overwrite {
        let dest_p = Path::new(&dest_path);
        for item in &root_items {
            let p = dest_p.join(item);
            if p.exists() {
                if p.is_dir() {
                    let _ = std::fs::remove_dir_all(&p);
                } else {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
    }

    let actual_dest = if is_keep_both {
        let temp_name = format!(".ziplens_temp_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        let p = Path::new(&dest_path).join(&temp_name);
        std::fs::create_dir_all(&p).unwrap_or_default();
        p.to_string_lossy().to_string()
    } else {
        dest_path.clone()
    };

    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    let contains_app = root_items.iter().any(|item| item.to_lowercase().ends_with(".app") || item.to_lowercase().ends_with(".app/"));
    
    let result = if file_name.ends_with(".zip") {
        let zip_res = {
            #[cfg(target_os = "macos")]
            if contains_app && password.is_none() && target_files.is_none() {
                extract_ditto(&app, &archive_path, &actual_dest)
            } else {
                extract_zip(&app, &archive_path, &actual_dest, &target_files, &password)
            }
            #[cfg(not(target_os = "macos"))]
            {
                extract_zip(&app, &archive_path, &actual_dest, &target_files, &password)
            }
        };
        match zip_res {
            Ok(r) => Ok(r),
            Err(e) => {
                println!("Native zip extraction failed: {}. Falling back to 7zz...", e);
                extract_7zz(app.clone(), &archive_path, &actual_dest, &target_files, &password).await
            }
        }
    } else if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") {
        extract_tar_gz(&app, &archive_path, &actual_dest, &target_files)
    } else if file_name.ends_with(".tar.zst") || file_name.ends_with(".tzst") {
        extract_tar_zst(&app, &archive_path, &actual_dest, &target_files)
    } else if file_name.ends_with(".tar") {
        extract_tar(&app, &archive_path, &actual_dest, &target_files)
    } else if file_name.ends_with(".7z") {
        if password.is_some() {
            extract_7zz(app, &archive_path, &actual_dest, &target_files, &password).await
        } else {
            match extract_7z(&app, &archive_path, &actual_dest, &target_files) {
                Ok(r) => Ok(r),
                Err(e) => {
                    println!("Native 7z extraction failed: {}. Falling back to 7zz...", e);
                    extract_7zz(app, &archive_path, &actual_dest, &target_files, &password).await
                }
            }
        }
    } else {
        extract_7zz(app, &archive_path, &actual_dest, &target_files, &password).await
    };

    let report = match result {
        Ok(r) => r,
        Err(e) => {
            if is_keep_both {
                let _ = std::fs::remove_dir_all(&actual_dest);
            }
            return Err(e);
        }
    };

    let mut final_extracted_paths: Vec<String> = Vec::new();

    if is_keep_both {
        let temp_dir = Path::new(&actual_dest);
        if let Ok(entries) = std::fs::read_dir(temp_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let mut final_path = Path::new(&dest_path).join(&name);
                
                if final_path.exists() {
                    let stem = Path::new(&name).file_stem().unwrap_or_default().to_string_lossy().to_string();
                    let ext = Path::new(&name).extension().unwrap_or_default().to_string_lossy().to_string();
                    let suffix = if ext.is_empty() { "".to_string() } else { format!(".{}", ext) };
                    
                    let mut counter = 1;
                    loop {
                        let new_name = format!("{} ({}){}", stem, counter, suffix);
                        final_path = Path::new(&dest_path).join(&new_name);
                        if !final_path.exists() {
                            break;
                        }
                        counter += 1;
                    }
                }
                
                if std::fs::rename(entry.path(), &final_path).is_ok() {
                    final_extracted_paths.push(final_path.to_string_lossy().to_string());
                }
            }
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    } else {
        for item in root_items {
            final_extracted_paths.push(Path::new(&dest_path).join(item).to_string_lossy().to_string());
        }
    }

    Ok(report)
}

// 7-Zip Sidecar Extraction for (RAR, ISO, CAB, LZH, ALZ, EGG, etc.)
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri::Emitter;

async fn extract_7zz(app: AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>, password: &Option<String>) -> Result<ExtractReport, String> {
    let sidecar_command = app.shell().sidecar("7zz").map_err(|e| format!("Failed to create sidecar: {}", e))?;
    
    let mut args = vec!["x".to_string(), archive_path.to_string(), format!("-o{}", dest_path), "-y".to_string(), "-mcp=949".to_string(), "-sccUTF-8".to_string(), "-bb1".to_string()];
    if let Some(pw) = password {
        args.push(format!("-p{}", pw));
    } else {
        args.push("-p".to_string());
    }
    
    if let Some(targets) = target_files {
        let list_path = std::env::temp_dir().join(format!("7z_list_{}.txt", std::process::id()));
        let mut list_content = Vec::new();
        for t in targets {
            let (encoded, _, _) = EUC_KR.encode(t);
            list_content.extend_from_slice(&encoded);
            list_content.push(b'\n');
        }
        std::fs::write(&list_path, &list_content).map_err(|e| e.to_string())?;
        args.push("-scsWIN".to_string());
        args.push(format!("-i@{}", list_path.display()));
    }
    
    let cmd = sidecar_command.args(args);
    
    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("Failed to spawn 7zz sidecar: {}", e))?;
    
    let _ = app.emit("extract_progress", 50);

    let mut success_files = Vec::new();
    let mut failed_files = Vec::new();
    let mut current_extracting = String::new();

    // Read stdout/stderr from 7zz
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line).to_string();
                if s.starts_with("- ") {
                    if !current_extracting.is_empty() {
                        success_files.push(current_extracting.clone());
                    }
                    let filename = s[2..].trim().to_string();
                    let decoded_filename = crate::archive::recover_pua_string(&filename);
                    current_extracting = decoded_filename.clone();
                    let _ = app.emit("extract_filename", decoded_filename);
                } else if s.starts_with("ERROR: ") {
                    let decoded_error = crate::archive::recover_pua_string(s.trim());
                    let mut err_filename = "archive".to_string();
                    if let Some(idx) = decoded_error.rfind(" : ") {
                        let potential_path = decoded_error[idx + 3..].trim();
                        if !potential_path.is_empty() {
                            err_filename = potential_path.to_string();
                        }
                    } else if !current_extracting.is_empty() {
                        err_filename = current_extracting.clone();
                    }
                    failed_files.push((err_filename, decoded_error));
                    current_extracting.clear();
                }
            }
            CommandEvent::Stderr(line) => {
                 let s = String::from_utf8_lossy(&line).to_string();
                 if s.starts_with("- ") {
                     // -bb1 mode: some lines may come via stderr
                     if !current_extracting.is_empty() {
                         success_files.push(current_extracting.clone());
                     }
                     let filename = s[2..].trim().to_string();
                     let decoded_filename = crate::archive::recover_pua_string(&filename);
                     current_extracting = decoded_filename.clone();
                     let _ = app.emit("extract_filename", decoded_filename);
                 } else if s.starts_with("ERROR: ") {
                     let decoded_error = crate::archive::recover_pua_string(s.trim());
                     let mut err_filename = "archive".to_string();
                     if let Some(idx) = decoded_error.rfind(" : ") {
                         let potential_path = decoded_error[idx + 3..].trim();
                         if !potential_path.is_empty() {
                             err_filename = potential_path.to_string();
                         }
                     } else if !current_extracting.is_empty() {
                         err_filename = current_extracting.clone();
                     }
                     failed_files.push((err_filename, decoded_error));
                     current_extracting.clear();
                 }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let code = payload.code.unwrap_or(-1);
                    if code == 2 && failed_files.is_empty() {
                        return Err("PASSWORD_REQUIRED".into());
                    } else if failed_files.is_empty() {
                        return Err(format!("7zz extraction failed (exit code: {})", code));
                    }
                    // If we have failed files, we let it return ExtractReport instead of erroring out fully
                }
            }
            _ => {}
        }
    }
    
    if !current_extracting.is_empty() {
        success_files.push(current_extracting);
    }
    
    // Fix PUA mangled filenames from 7zz
    let mut fixed_success_files = Vec::new();
    for f in success_files {
        fixed_success_files.push(recover_pua_string(&f));
    }
    
    let mut fixed_failed_files = Vec::new();
    for (f, err) in failed_files {
        fixed_failed_files.push((recover_pua_string(&f), err));
    }

    // Recursively rename files on disk
    fn rename_pua_recursively(dir: &std::path::Path) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            let mut paths = Vec::new();
            for entry in entries.flatten() {
                paths.push(entry.path());
            }
            
            // Rename children first (bottom-up)
            for path in &paths {
                if path.is_dir() {
                    rename_pua_recursively(path);
                }
            }
            
            // Rename current level
            for path in &paths {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let recovered = recover_pua_string(name);
                    if name != recovered {
                        let new_path = path.with_file_name(recovered);
                        let _ = std::fs::rename(path, &new_path);
                    }
                }
            }
        }
    }
    
    // Only rename PUA-mangled entries within top-level items that were just extracted,
    // not the entire dest_path (which could be the user's home folder).
    if let Ok(entries) = std::fs::read_dir(std::path::Path::new(dest_path)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                rename_pua_recursively(&path);
            }
            // Rename the top-level item itself if needed
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let recovered = recover_pua_string(name);
                if name != recovered {
                    let new_path = path.with_file_name(recovered);
                    let _ = std::fs::rename(&path, &new_path);
                }
            }
        }
    }
    
    let _ = app.emit("extract_progress", 100);
    Ok(ExtractReport { success_files: fixed_success_files, failed_files: fixed_failed_files, cancelled: false })
}

#[cfg(target_os = "macos")]
fn extract_ditto(app: &AppHandle, archive_path: &str, dest_path: &str) -> Result<ExtractReport, String> {
    let sidecar_command = app.shell().sidecar("ditto").map_err(|e| format!("Failed to create ditto sidecar: {}", e))?;
    let args = vec!["-x".to_string(), "-k".to_string(), archive_path.to_string(), dest_path.to_string()];
    let output = tauri::async_runtime::block_on(async {
        sidecar_command.args(args).output().await
    }).map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    use tauri::Emitter;
    let _ = app.emit("extract_progress", 100);

    Ok(ExtractReport { success_files: vec!["ditto_extracted".to_string()], failed_files: vec![], cancelled: false })
}


use std::sync::Arc;

fn handle_extract_error(
    app: &AppHandle, 
    path: &str, 
    error: &str, 
    failed_files: &Arc<Mutex<Vec<(String, String)>>>, 
    cancelled: &Arc<std::sync::atomic::AtomicBool>
) -> Result<(), String> {
    if IGNORE_ALL_ERRORS.load(Ordering::SeqCst) || cancelled.load(Ordering::SeqCst) {
        if !cancelled.load(Ordering::SeqCst) {
            failed_files.lock().unwrap().push((path.to_string(), error.to_string()));
        }
        return Ok(());
    }

    let _lock = PROMPT_MUTEX.lock().unwrap();
    if IGNORE_ALL_ERRORS.load(Ordering::SeqCst) || cancelled.load(Ordering::SeqCst) {
        if !cancelled.load(Ordering::SeqCst) {
            failed_files.lock().unwrap().push((path.to_string(), error.to_string()));
        }
        return Ok(());
    }

    let (tx, rx) = std::sync::mpsc::channel();
    *ERROR_RESOLUTION_TX.lock().unwrap() = Some(tx);

    use tauri::Emitter;
    let _ = app.emit("extract_error_prompt", ErrorPromptInfo { path: path.to_string(), error: error.to_string() });

    let choice = rx.recv().unwrap_or_else(|_| "cancel".to_string());
    
    match choice.as_str() {
        "ignore" => {
            failed_files.lock().unwrap().push((path.to_string(), error.to_string()));
            Ok(())
        },
        "ignore_all" => {
            IGNORE_ALL_ERRORS.store(true, Ordering::SeqCst);
            failed_files.lock().unwrap().push((path.to_string(), error.to_string()));
            Ok(())
        },
        _ => {
            cancelled.store(true, Ordering::SeqCst);
            Err("CANCELLED".into())
        }
    }
}


fn extract_zip(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>, password: &Option<String>) -> Result<ExtractReport, String> {
    let archive_path_clone = Path::new(archive_path).to_path_buf();
    let file = fs::File::open(&archive_path_clone).map_err(|e| e.to_string())?;
    let archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let total_files = archive.len();
    
    use std::sync::{Arc, Mutex};
    use rayon::prelude::*;
    let processed_count = Arc::new(Mutex::new(0usize));
    
    let success_files = Arc::new(Mutex::new(Vec::new()));
    let failed_files = Arc::new(Mutex::new(Vec::new()));
    let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
    
    let indexes: Vec<usize> = (0..total_files).collect();
    let pw_clone = password.clone();
    
    let err = indexes.par_iter().try_for_each(|&i| -> Result<(), String> {
        let f = match fs::File::open(&archive_path_clone) {
            Ok(f) => f,
            Err(_) => return Ok(()) // skip
        };
        let mut thread_archive = match ZipArchive::new(f) {
            Ok(a) => a,
            Err(_) => return Ok(()) // skip
        };
        
        let (encrypted, decoded_name) = match thread_archive.by_index_raw(i) {
            Ok(file) => (file.encrypted(), decode_zip_filename(file.name_raw())),
            Err(e) => {
                let _ = handle_extract_error(app, &format!("File_Index_{}", i), &e.to_string(), &failed_files, &cancelled);
                return Ok(());
            }
        };
        
        if encrypted && pw_clone.is_none() {
            let _ = handle_extract_error(app, &decoded_name, "PASSWORD_REQUIRED", &failed_files, &cancelled);
            return Ok(());
        }
        
        let mut file = if let Some(pw) = &pw_clone {
            match thread_archive.by_index_decrypt(i, pw.as_bytes()) {
                Ok(f) => f,
                Err(e) => {
                    let _ = handle_extract_error(app, &decoded_name, &e.to_string(), &failed_files, &cancelled);
                    return Ok(());
                }
            }
        } else {
            match thread_archive.by_index(i) {
                Ok(f) => f,
                Err(e) => {
                    let _ = handle_extract_error(app, &decoded_name, &e.to_string(), &failed_files, &cancelled);
                    return Ok(());
                }
            }
        };
        
        if let Some(targets) = target_files {
            if !targets.contains(&decoded_name) {
                return Ok(());
            }
        }
        
        // Directory traversal protection
        let sanitized: std::path::PathBuf = decoded_name
            .replace("\\\\", "/")
            .split('/')
            .filter(|c| !c.is_empty() && *c != "..")
            .collect();
        
        if sanitized.as_os_str().is_empty() {
            return Ok(());
        }
        
        let outpath = Path::new(dest_path).join(&sanitized);

        let mode = file.unix_mode();

        if decoded_name.ends_with('/') || decoded_name.ends_with("\\\\") {
            fs::create_dir_all(&outpath).unwrap_or_default();
            #[cfg(unix)]
            if let Some(m) = mode {
                let m = m & 0o777;
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(m));
            }
            success_files.lock().unwrap().push(decoded_name.clone());
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    let _ = fs::create_dir_all(p);
                }
            }
            
            #[cfg(unix)]
            let is_symlink = mode.map_or(false, |m| m & 0o170000 == 0o120000);
            #[cfg(not(unix))]
            let is_symlink = false;

            if is_symlink {
                let mut target = String::new();
                if let Err(e) = std::io::Read::read_to_string(&mut file, &mut target) {
                    if handle_extract_error(app, &decoded_name, &e.to_string(), &failed_files, &cancelled).is_err() {
                        return Err("CANCELLED".into());
                    }
                } else {
                    #[cfg(unix)]
                    {
                        if outpath.exists() || outpath.is_symlink() {
                            let _ = fs::remove_file(&outpath);
                        }
                        let _ = std::os::unix::fs::symlink(&target, &outpath);
                    }
                    success_files.lock().unwrap().push(decoded_name.clone());
                }
            } else {
                let mut outfile = match fs::File::create(&outpath) {
                    Ok(f) => f,
                    Err(e) => {
                        if handle_extract_error(app, &decoded_name, &e.to_string(), &failed_files, &cancelled).is_err() {
                            return Err("CANCELLED".into());
                        }
                        return Ok(());
                    }
                };
                if let Err(e) = std::io::copy(&mut file, &mut outfile) {
                    if handle_extract_error(app, &decoded_name, &e.to_string(), &failed_files, &cancelled).is_err() {
                        return Err("CANCELLED".into());
                    }
                } else {
                    #[cfg(unix)]
                    if let Some(m) = mode {
                        let m = m & 0o777;
                        use std::os::unix::fs::PermissionsExt;
                        let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(m));
                    }
                    success_files.lock().unwrap().push(decoded_name.clone());
                }
            }
        }
        
        let mut count = processed_count.lock().unwrap();
        *count += 1;
        
        use tauri::Emitter;
        let progress = ((*count as f64 / total_files as f64) * 100.0) as u32;
        let _ = app.emit("extract_progress", progress);
        let _ = app.emit("extract_filename", decoded_name);
        
        Ok(())
    });

    use tauri::Emitter;
    let _ = app.emit("extract_progress", 100);

    let is_cancelled = cancelled.load(Ordering::SeqCst) || err.is_err();
    
    let s = success_files.lock().unwrap().clone();
    let f = failed_files.lock().unwrap().clone();
    Ok(ExtractReport {
        success_files: s,
        failed_files: f,
        cancelled: is_cancelled,
    })
}


fn extract_tar_gz(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<ExtractReport, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar_zst(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<ExtractReport, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(dec);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<ExtractReport, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(file);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar_inner<R: std::io::Read>(app: &AppHandle, archive: &mut tar::Archive<R>, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<ExtractReport, String> {
    let dest_path = Path::new(dest_path);
    use tauri::Emitter;
    let _ = app.emit("extract_progress", 50);

    let success_files = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let failed_files = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    let entries = match archive.entries() {
        Ok(e) => e,
        Err(_) => return Ok(ExtractReport { success_files: vec![], failed_files: vec![("TAR_ARCHIVE".to_string(), "Corrupt tar entries".to_string())], cancelled: false })
    };

    for entry in entries {
        if cancelled.load(Ordering::SeqCst) { break; }
        
        let mut entry = match entry {
            Ok(e) => e,
            Err(e) => {
                let _ = handle_extract_error(app, "unknown_tar_entry", &e.to_string(), &failed_files, &cancelled);
                continue;
            }
        };
        let path = match entry.path() {
            Ok(p) => p.to_path_buf(),
            Err(e) => {
                let _ = handle_extract_error(app, "unknown_tar_path", &e.to_string(), &failed_files, &cancelled);
                continue;
            }
        };
        let name_str = path.to_string_lossy().to_string();
        
        if let Some(targets) = target_files {
            if !targets.contains(&name_str) {
                continue;
            }
        }
        
        let _ = app.emit("extract_filename", name_str.clone());
        
        if let Err(e) = entry.unpack_in(dest_path) {
            let _ = handle_extract_error(app, &name_str, &e.to_string(), &failed_files, &cancelled);
        } else {
            success_files.lock().unwrap().push(name_str);
        }
    }
    
    let _ = app.emit("extract_progress", 100);
    
    let s = success_files.lock().unwrap().clone();
    let f = failed_files.lock().unwrap().clone();
    let c = cancelled.load(Ordering::SeqCst);
    Ok(ExtractReport {
        success_files: s,
        failed_files: f,
        cancelled: c,
    })
}

fn extract_7z(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<ExtractReport, String> {
    let archive_path_clone = archive_path.to_string();
    let dest_path_clone = dest_path.to_string();
    let app_clone = app.clone();
    let target_files_clone = target_files.clone();

    let success_files = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let failed_files = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    let success_files_copy = success_files.clone();
    let failed_files_copy = failed_files.clone();
    let cancelled_copy = cancelled.clone();

    match sevenz_rust::decompress_file_with_extract_fn(archive_path_clone.clone(), dest_path_clone.clone(), move |entry, reader, dest| {
        let name = entry.name().to_string();
        
        if let Some(targets) = &target_files_clone {
            if !targets.contains(&name) {
                return Ok(true); 
            }
        }
        
        let _ = app_clone.emit("extract_filename", name.clone());
        let p = dest.to_path_buf();
        let res = sevenz_rust::default_entry_extract_fn(entry, reader, &p);
        if let Err(e) = &res {
            let _ = handle_extract_error(&app_clone, &name, &e.to_string(), &failed_files_copy, &cancelled_copy);
            if cancelled_copy.load(Ordering::SeqCst) {
                return Err(sevenz_rust::Error::io(std::io::Error::new(std::io::ErrorKind::Interrupted, "CANCELLED")));
            }
            return Ok(true);
        } else {
            success_files_copy.lock().unwrap().push(name);
        }
        res
    }) {
        Ok(_) => {
            let _ = app.emit("extract_progress", 100);
            let s = success_files.lock().unwrap().clone();
            let f = failed_files.lock().unwrap().clone();
            let c = cancelled.load(Ordering::SeqCst);
            Ok(ExtractReport {
                success_files: s,
                failed_files: f,
                cancelled: c,
            })
        },
        Err(sevenz_rust::Error::PasswordRequired) | Err(sevenz_rust::Error::UnsupportedCompressionMethod(_)) => {
            Err("PASSWORD_REQUIRED".to_string())
        },
        Err(e) => Err(e.to_string())
    }
}

use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use std::io::Write;

#[tauri::command]
pub async fn compress_archive(
    app: AppHandle,
    source_paths: Vec<String>,
    dest_path: String,
    format: String,
    split_size: Option<String>,
    password: Option<String>,
    encrypt_level: Option<String>,
) -> Result<(), String> {
    if source_paths.is_empty() {
        return Err("No source files selected".into());
    }

    let dest = Path::new(&dest_path);

    // Calculate total size for UI progress
    let mut total_size: u64 = 0;
    for sp in &source_paths {
        let p = Path::new(sp);
        if !p.exists() { continue; }
        for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    total_size += metadata.len();
                }
            }
        }
    }

    use tauri::Emitter;
    let _ = app.emit("compress_size", total_size);

    if format == "zip" {
        if password.is_some() {
            compress_7zz(app.clone(), &source_paths, &dest_path, split_size, &format, password, encrypt_level).await
        } else {
            compress_zip(&app, &source_paths, dest)
        }
    } else if format == "tar.gz" || format == "tgz" {
        compress_tar_gz(&app, &source_paths, dest)
    } else if format == "tar.zst" || format == "tzst" {
        compress_tar_zst(&app, &source_paths, dest)
    } else if format == "7z" {
        compress_7zz(app.clone(), &source_paths, &dest_path, split_size, &format, password, encrypt_level).await
    } else {
        Err(format!("Unsupported compression format: {}", format))
    }
}

async fn compress_7zz(app: AppHandle, source_paths: &[String], dest_path: &str, split_size: Option<String>, format: &str, password: Option<String>, encrypt_level: Option<String>) -> Result<(), String> {
    let sidecar_command = app.shell().sidecar("7zz").map_err(|e| format!("Failed to create sidecar: {}", e))?;
    
    let mut args: Vec<String> = vec!["a".to_string(), dest_path.to_string()];
    
    if let Some(size) = split_size {
        if !size.trim().is_empty() && size.trim() != "0" {
            args.push(format!("-v{}", size.trim()));
        }
    }
    
    if let Some(pw) = password {
        args.push(format!("-p{}", pw));
        if format == "zip" {
            args.push("-tzip".to_string());
            if encrypt_level.as_deref() == Some("AES-256") {
                args.push("-mem=AES256".to_string());
            } else if encrypt_level.as_deref() == Some("ZipCrypto") {
                args.push("-mem=ZipCrypto".to_string());
            }
        } else {
            if encrypt_level.as_deref() == Some("mhe=on") {
                args.push("-mhe=on".to_string());
            }
        }
    } else {
        if format == "zip" {
            args.push("-tzip".to_string());
        }
    }
    
    // Max compression, multithreading on
    args.push("-mx=9".to_string());
    if format == "7z" {
        args.push("-m0=lzma2".to_string());
    }
    
    for sp in source_paths {
        args.push(sp.clone());
    }
    
    let cmd = sidecar_command.args(args);
    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("Failed to spawn 7zz sidecar: {}", e))?;
    
    // Read stdout from 7zz (Compressing X)
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line).to_string();
                if s.starts_with("Compressing  ") {
                    let filename = s.replace("Compressing  ", "").trim().to_string();
                    let _ = app.emit("extract_filename", filename);
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!("7-Zip compression failed with code {:?}", payload.code));
                }
            }
            CommandEvent::Error(err) => {
                return Err(err.to_string());
            }
            _ => {}
        }
    }
    
    let _ = app.emit("extract_progress", 100);
    Ok(())
}

fn compress_zip(app: &AppHandle, source_paths: &[String], dest_path: &Path) -> Result<(), String> {
    let file = fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9))
        .unix_permissions(0o755);

    for sp in source_paths {
        let source_path = Path::new(sp);
        if !source_path.exists() { continue; }

        let walkdir = WalkDir::new(source_path);
        for entry in walkdir.into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let name_str = get_relative_name(source_path, path);
            if name_str.is_empty() { continue; }
            
            use tauri::Emitter;
            let _ = app.emit("extract_filename", name_str.clone());

            #[allow(deprecated)]
            let name_str = name_str.replace("\\", "/");

            if path.is_file() {
                zip.start_file(name_str, options).map_err(|e| e.to_string())?;
                let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            } else if path.is_dir() {
                zip.add_directory(name_str, options).map_err(|e| e.to_string())?;
            }
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn compress_tar_gz(app: &AppHandle, source_paths: &[String], dest_path: &Path) -> Result<(), String> {
    let file = fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let enc = flate2::write::GzEncoder::new(file, flate2::Compression::best());
    let mut builder = tar::Builder::new(enc);
    
    compress_tar_inner(app, &mut builder, source_paths)?;
    
    builder.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn compress_tar_zst(app: &AppHandle, source_paths: &[String], dest_path: &Path) -> Result<(), String> {
    let file = fs::File::create(dest_path).map_err(|e| e.to_string())?;
    // zstd naturally supports multi-threading for compression
    let mut enc = zstd::stream::write::Encoder::new(file, 3).map_err(|e| e.to_string())?;
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) as u32;
    enc.multithread(cores).map_err(|e: std::io::Error| e.to_string())?;
    
    let mut builder = tar::Builder::new(enc);
    
    compress_tar_inner(app, &mut builder, source_paths)?;
    
    builder.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn compress_tar_inner<W: Write>(app: &AppHandle, builder: &mut tar::Builder<W>, source_paths: &[String]) -> Result<(), String> {
    for sp in source_paths {
        let source_path = Path::new(sp);
        if !source_path.exists() { continue; }

        let walkdir = WalkDir::new(source_path);
        for entry in walkdir.into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let name_str = get_relative_name(source_path, path);
            if name_str.is_empty() { continue; }
            
            use tauri::Emitter;
            let _ = app.emit("extract_filename", name_str.clone());

            #[allow(deprecated)]
            let name_str = name_str.replace("\\", "/");

            if path.is_file() {
                let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
                builder.append_file(&name_str, &mut f).map_err(|e| e.to_string())?;
            } else if path.is_dir() {
                builder.append_dir(&name_str, path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn get_relative_name(base_source: &Path, current_path: &Path) -> String {
    if base_source.is_file() {
        current_path.file_name().unwrap_or_default().to_string_lossy().to_string()
    } else {
        let base = base_source.parent().unwrap_or(base_source);
        let name = current_path.strip_prefix(base).unwrap_or(current_path);
        let s = name.to_string_lossy().to_string();
        s
    }
}

#[derive(serde::Serialize)]
pub struct ArchiveFileInfo {
    pub path: String,
    pub size: u64,
    pub compressed_size: Option<u64>,
    pub is_encrypted: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn preview_archive(
    app: AppHandle,
    archive_path: String,
    password: Option<String>,
) -> Result<Vec<ArchiveFileInfo>, String> {
    IGNORE_ALL_ERRORS.store(false, Ordering::SeqCst);
    let path = Path::new(&archive_path);
    if !path.exists() {
        return Err("Archive file not found".into());
    }

    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if file_name.ends_with(".zip") {
        match preview_zip(&archive_path) {
            Ok(files) => Ok(files),
            Err(e) => {
                println!("Native zip preview failed: {}. Falling back to 7zz...", e);
                Box::pin(preview_7zz(app, &archive_path, &password)).await
            }
        }
    } else if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") {
        preview_tar_gz(&archive_path)
    } else if file_name.ends_with(".tar.zst") || file_name.ends_with(".tzst") {
        preview_tar_zst(&archive_path)
    } else if file_name.ends_with(".tar") {
        preview_tar(&archive_path)
    } else if file_name.ends_with(".7z") {
        if password.is_some() {
            preview_7zz(app, &archive_path, &password).await
        } else {
            match preview_7z(&archive_path) {
                Ok(files) => Ok(files),
                Err(e) => {
                    if e == "PASSWORD_REQUIRED" && password.is_none() {
                        return Err(e);
                    }
                    println!("Native 7z preview failed: {}. Falling back to 7zz...", e);
                    preview_7zz(app, &archive_path, &password).await
                }
            }
        }
    } else {
        preview_7zz(app, &archive_path, &password).await
    }
}

fn preview_zip(archive_path: &str) -> Result<Vec<ArchiveFileInfo>, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for i in 0..archive.len() {
        match archive.by_index_raw(i) {
            Ok(file) => {
                let raw = file.name_raw();
                if i < 3 {
                    println!("[ZipLens DIAG] Entry {}: name_raw() hex={:02X?}, name()='{}'", i, &raw[..raw.len().min(40)], file.name());
                }
                let decoded_name = decode_zip_filename(raw);
                if i < 3 {
                    println!("[ZipLens DIAG] Entry {}: decoded='{}'", i, decoded_name);
                }
                files.push(ArchiveFileInfo {
                    path: decoded_name,
                    size: file.size(),
                    compressed_size: Some(file.compressed_size()),
                    is_encrypted: file.encrypted(),
                    error: None,
                });
            },
            Err(e) => {
                files.push(ArchiveFileInfo {
                    path: format!("[Entry #{}]", i),
                    size: 0,
                    compressed_size: None,
                    is_encrypted: false,
                    error: Some(e.to_string()),
                });
            }
        }
    }
    Ok(files)
}

fn preview_tar_gz(archive_path: &str) -> Result<Vec<ArchiveFileInfo>, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);
    preview_tar_inner(&mut archive)
}

fn preview_tar_zst(archive_path: &str) -> Result<Vec<ArchiveFileInfo>, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(dec);
    preview_tar_inner(&mut archive)
}

fn preview_tar(archive_path: &str) -> Result<Vec<ArchiveFileInfo>, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(file);
    preview_tar_inner(&mut archive)
}

fn preview_tar_inner<R: std::io::Read>(archive: &mut tar::Archive<R>) -> Result<Vec<ArchiveFileInfo>, String> {
    let mut files = Vec::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
        files.push(ArchiveFileInfo {
            path: path.to_string_lossy().to_string(),
            size: entry.header().size().unwrap_or(0),
            compressed_size: None,
            is_encrypted: false,
            error: None,
        });
    }
    Ok(files)
}

fn preview_7z(archive_path: &str) -> Result<Vec<ArchiveFileInfo>, String> {
    let mut file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    
    let archive = match sevenz_rust::Archive::read(&mut file, len, &[]) {
        Ok(a) => a,
        Err(sevenz_rust::Error::PasswordRequired) | Err(sevenz_rust::Error::UnsupportedCompressionMethod(_)) => {
            return Err("PASSWORD_REQUIRED".to_string());
        },
        Err(e) => return Err(e.to_string())
    };
    
    let mut files = Vec::new();
    for entry in archive.files {
        files.push(ArchiveFileInfo {
            path: entry.name().to_string(),
            size: entry.size(),
            compressed_size: None,
            is_encrypted: false,
            error: None,
        });
    }
    Ok(files)
}

async fn preview_7zz(app: AppHandle, archive_path: &str, password: &Option<String>) -> Result<Vec<ArchiveFileInfo>, String> {
    let sidecar_command = app.shell().sidecar("7zz").map_err(|e| format!("Failed to create sidecar: {}", e))?;
    let mut args = vec!["l".to_string(), archive_path.to_string(), "-slt".to_string(), "-mcp=949".to_string(), "-sccUTF-8".to_string()];
    if let Some(pw) = password {
        args.push(format!("-p{}", pw));
    } else {
        args.push("-p".to_string());
    }
    
    let output = sidecar_command.args(args).output().await.map_err(|e| e.to_string())?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if stderr.contains("Wrong password") || stdout.contains("Wrong password") || stdout.contains("Cannot open encrypted archive") || stderr.contains("Cannot open encrypted archive") || stdout.contains("Enter password") || stderr.contains("Enter password") {
        if password.is_none() {
            return Err("PASSWORD_REQUIRED".into());
        } else {
            return Err("Wrong password provided".into());
        }
    }
    if stdout.contains("Is not archive") || stderr.contains("Is not archive") || stdout.contains("Cannot open the file as") || stderr.contains("Cannot open the file as") {
        return Err("CORRUPTED_ARCHIVE".into());
    }
    if output.status.code() == Some(2) {
        return Err("CORRUPTED_ARCHIVE".into());
    }
    let mut files = Vec::new();
    let mut current_path = String::new();
    let mut current_size = 0;
    let mut current_packed = None;
    let mut current_encrypted = false;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !current_path.is_empty() {
                files.push(ArchiveFileInfo {
                    path: current_path.clone(),
                    size: current_size,
                    compressed_size: current_packed,
                    is_encrypted: current_encrypted,
                    error: None,
                });
                current_path.clear();
                current_size = 0;
                current_packed = None;
                current_encrypted = false;
            }
        } else if line.starts_with("Path = ") {
            let p = line.replace("Path = ", "").trim().to_string();
            current_path = recover_pua_string(&p);
        } else if line.starts_with("Size = ") {
            if let Ok(sz) = line.replace("Size = ", "").trim().parse::<u64>() {
                current_size = sz;
            }
        } else if line.starts_with("Packed Size = ") {
            if let Ok(sz) = line.replace("Packed Size = ", "").trim().parse::<u64>() {
                current_packed = Some(sz);
            }
        } else if line.starts_with("Encrypted = ") {
            if line.contains("+") {
                current_encrypted = true;
            }
        }
    }
    if !current_path.is_empty() {
        files.push(ArchiveFileInfo {
            path: current_path.clone(),
            size: current_size,
            compressed_size: current_packed,
            is_encrypted: current_encrypted,
            error: None,
        });
    }
    
    if !files.is_empty() {
        files.remove(0); // The first entry is usually the archive file itself in 7zz l -slt
    }
    Ok(files)
}

#[tauri::command]
pub fn save_report_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, content.as_bytes()).map_err(|e| format!("Failed to write report: {}", e))
}

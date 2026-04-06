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
    // ZIP 엔트리에 UTF-8 플래그가 설정된 경우 already-valid UTF-8
    if let Ok(s) = std::str::from_utf8(raw) {
        return s.to_string();
    }
    // EUC-KR (CP949의 슈퍼셋) 으로 디코딩 시도
    let (decoded, _, had_errors) = EUC_KR.decode(raw);
    if !had_errors {
        return decoded.into_owned();
    }
    // 최후 수단: lossy UTF-8
    String::from_utf8_lossy(raw).into_owned()
}



#[tauri::command]
pub async fn extract_archive(
    app: AppHandle,
    archive_path: String,
    dest_path: String,
    target_files: Option<Vec<String>>,
    password: Option<String>,
) -> Result<(), String> {
    let path = Path::new(&archive_path);

    if !path.exists() {
        return Err("Archive file not found".into());
    }

    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if file_name.ends_with(".zip") {
        extract_zip(&app, &archive_path, &dest_path, &target_files, &password)
    } else if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") {
        extract_tar_gz(&app, &archive_path, &dest_path, &target_files)
    } else if file_name.ends_with(".tar.zst") || file_name.ends_with(".tzst") {
        extract_tar_zst(&app, &archive_path, &dest_path, &target_files)
    } else if file_name.ends_with(".tar") {
        extract_tar(&app, &archive_path, &dest_path, &target_files)
    } else if file_name.ends_with(".7z") {
        if password.is_some() {
            extract_7zz(app, &archive_path, &dest_path, &target_files, &password).await
        } else {
            match extract_7z(&app, &archive_path, &dest_path, &target_files) {
                Ok(_) => Ok(()),
                Err(e) => {
                    println!("Native 7z extraction failed: {}. Falling back to 7zz...", e);
                    extract_7zz(app, &archive_path, &dest_path, &target_files, &password).await
                }
            }
        }
    } else {
        extract_7zz(app, &archive_path, &dest_path, &target_files, &password).await
    }
}

// 7-Zip Sidecar Extraction for (RAR, ISO, CAB, LZH, ALZ, EGG, etc.)
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri::Emitter;

async fn extract_7zz(app: AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>, password: &Option<String>) -> Result<(), String> {
    let sidecar_command = app.shell().sidecar("7zz").map_err(|e| format!("Failed to create sidecar: {}", e))?;
    
    let mut args = vec!["x".to_string(), archive_path.to_string(), format!("-o{}", dest_path), "-y".to_string()];
    if let Some(pw) = password {
        args.push(format!("-p{}", pw));
    } else {
        args.push("-p".to_string());
    }
    
    if let Some(targets) = target_files {
        let list_path = std::env::temp_dir().join(format!("7z_list_{}.txt", std::process::id()));
        let mut list_content = String::new();
        for t in targets {
            list_content.push_str(t);
            list_content.push('\n');
        }
        std::fs::write(&list_path, list_content).map_err(|e| e.to_string())?;
        args.push(format!("-i@{}", list_path.display()));
    }
    
    let cmd = sidecar_command.args(args);
    
    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("Failed to spawn 7zz sidecar: {}", e))?;
    
    let _ = app.emit("extract_progress", 50);

    // Read stdout/stderr from 7zz
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line).to_string();
                // 7zz usually prints "Extracting archive: [name]" or "Extracting  [file]"
                if s.starts_with("Extracting  ") {
                    let filename = s.replace("Extracting  ", "").trim().to_string();
                    let _ = app.emit("extract_filename", filename);
                }
            }
            CommandEvent::Stderr(_line) => {
                // Handle stderr if needed
            }
            CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err("PASSWORD_REQUIRED".into());
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

fn extract_zip(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>, password: &Option<String>) -> Result<(), String> {
    let archive_path_clone = Path::new(archive_path).to_path_buf();
    let dest_path_clone = Path::new(dest_path).to_path_buf();
    let file = fs::File::open(&archive_path_clone).map_err(|e| e.to_string())?;
    let archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let total_files = archive.len();
    
    use std::sync::{Arc, Mutex};
    use rayon::prelude::*;
    let processed_count = Arc::new(Mutex::new(0usize));
    
    let indexes: Vec<usize> = (0..total_files).collect();
    let pw_clone = password.clone();
    
    indexes.par_iter().try_for_each(|&i| -> Result<(), String> {
        let f = fs::File::open(&archive_path_clone).map_err(|e| e.to_string())?;
        let mut thread_archive = ZipArchive::new(f).map_err(|e| e.to_string())?;
        
        // Peek at the file to check encryption first, then drop it to release borrow
        let (encrypted, decoded_name) = {
            let file = thread_archive.by_index_raw(i).map_err(|e| e.to_string())?;
            let name = decode_zip_filename(file.name_raw());
            (file.encrypted(), name)
        };
        
        if encrypted && pw_clone.is_none() {
            return Err("PASSWORD_REQUIRED".into());
        }
        
        let mut file = if let Some(pw) = &pw_clone {
            match thread_archive.by_index_decrypt(i, pw.as_bytes()) {
                Ok(f) => f,
                Err(_) => return Err("PASSWORD_REQUIRED".into())
            }
        } else {
            thread_archive.by_index(i).map_err(|e| e.to_string())?
        };
        
        if let Some(targets) = target_files {
            if !targets.contains(&decoded_name) {
                return Ok(());
            }
        }
        
        // 디렉토리 traversal 공격 방지: ".."가 포함된 경로는 스킵
        let sanitized: std::path::PathBuf = decoded_name
            .replace('\\', "/")
            .split('/')
            .filter(|c| !c.is_empty() && *c != "..")
            .collect();
        
        if sanitized.as_os_str().is_empty() {
            return Ok(());
        }
        
        let outpath = Path::new(dest_path).join(&sanitized);

        if decoded_name.ends_with('/') || decoded_name.ends_with('\\') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
        
        let mut count = processed_count.lock().unwrap();
        *count += 1;
        
        use tauri::Emitter;
        let progress = ((*count as f64 / total_files as f64) * 100.0) as u32;
        let _ = app.emit("extract_progress", progress);
        let _ = app.emit("extract_filename", decoded_name);
        
        Ok(())
    })?;

    use tauri::Emitter;
    let _ = app.emit("extract_progress", 100);

    Ok(())
}

fn extract_tar_gz(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar_zst(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let dec = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(dec);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(file);
    extract_tar_inner(app, &mut archive, dest_path, target_files)
}

fn extract_tar_inner<R: std::io::Read>(app: &AppHandle, archive: &mut tar::Archive<R>, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<(), String> {
    let dest_path = Path::new(dest_path);
    // Emit 50 to kick off the indeterminate progress bar timer immediately
    use tauri::Emitter;
    let _ = app.emit("extract_progress", 50);

    // We can just iterate and emit filenames
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
        let name_str = path.to_string_lossy().to_string();
        
        if let Some(targets) = target_files {
            if !targets.contains(&name_str) {
                continue;
            }
        }
        
        let _ = app.emit("extract_filename", name_str);
        
        entry.unpack_in(dest_path).map_err(|e| e.to_string())?;
    }
    
    let _ = app.emit("extract_progress", 100);
    
    Ok(())
}

fn extract_7z(app: &AppHandle, archive_path: &str, dest_path: &str, target_files: &Option<Vec<String>>) -> Result<(), String> {
    let archive_path_clone = archive_path.to_string();
    let dest_path_clone = dest_path.to_string();
    let app_clone = app.clone();
    let target_files_clone = target_files.clone();

    match sevenz_rust::decompress_file_with_extract_fn(&archive_path_clone, &dest_path_clone, move |entry, reader, dest| {
        let name = entry.name().to_string();
        
        if let Some(targets) = &target_files_clone {
            if !targets.contains(&name) {
                return Ok(true); 
            }
        }
        
        let _ = app_clone.emit("extract_filename", name.clone());
        let p = dest.to_path_buf();
        sevenz_rust::default_entry_extract_fn(entry, reader, &p)
    }) {
        Ok(_) => {
            let _ = app.emit("extract_progress", 100);
            Ok(())
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
}

#[tauri::command]
pub async fn preview_archive(
    app: AppHandle,
    archive_path: String,
    password: Option<String>,
) -> Result<Vec<ArchiveFileInfo>, String> {
    let path = Path::new(&archive_path);
    if !path.exists() {
        return Err("Archive file not found".into());
    }

    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if file_name.ends_with(".zip") {
        preview_zip(&archive_path)
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
        let file = archive.by_index_raw(i).map_err(|e| e.to_string())?;
        let decoded_name = decode_zip_filename(file.name_raw());
        files.push(ArchiveFileInfo {
            path: decoded_name,
            size: file.size(),
            compressed_size: Some(file.compressed_size()),
            is_encrypted: file.encrypted(),
        });
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
        });
    }
    Ok(files)
}

async fn preview_7zz(app: AppHandle, archive_path: &str, password: &Option<String>) -> Result<Vec<ArchiveFileInfo>, String> {
    let sidecar_command = app.shell().sidecar("7zz").map_err(|e| format!("Failed to create sidecar: {}", e))?;
    let mut args = vec!["l".to_string(), archive_path.to_string(), "-slt".to_string()];
    if let Some(pw) = password {
        args.push(format!("-p{}", pw));
    } else {
        args.push("-p".to_string());
    }
    
    let output = sidecar_command.args(args).output().await.map_err(|e| e.to_string())?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if stderr.contains("Wrong password") || stdout.contains("Wrong password") || stdout.contains("Cannot open encrypted archive") || stderr.contains("Cannot open encrypted archive") || stderr.contains("Data Error") || stdout.contains("Data Error") || stdout.contains("Enter password") || stderr.contains("Enter password") {
        if password.is_none() {
            return Err("PASSWORD_REQUIRED".into());
        } else {
            return Err("Wrong password provided".into());
        }
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
                });
                current_path.clear();
                current_size = 0;
                current_packed = None;
                current_encrypted = false;
            }
        } else if line.starts_with("Path = ") {
            current_path = line.replace("Path = ", "").trim().to_string();
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
            path: current_path,
            size: current_size,
            compressed_size: current_packed,
            is_encrypted: current_encrypted,
        });
    }
    
    if !files.is_empty() {
        files.remove(0); // The first entry is usually the archive file itself in 7zz l -slt
    }
    Ok(files)
}

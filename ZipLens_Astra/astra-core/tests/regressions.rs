use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};
use tempfile::TempDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};
use ziplens_astra_core::{paths, CompressionRequest, Context, Engine, ExtractRequest};

fn engine() -> Engine {
    Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    }
}
fn zip(path: &Path, files: &[(&str, &[u8])]) {
    let mut z = ZipWriter::new(File::create(path).unwrap());
    for (name, data) in files {
        let o = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o640);
        if name.ends_with('/') {
            z.add_directory(*name, o).unwrap();
        } else {
            z.start_file(*name, o).unwrap();
            z.write_all(data).unwrap();
        }
    }
    z.finish().unwrap();
}
fn request(root: &TempDir) -> ExtractRequest {
    ExtractRequest {
        archive: root.path().join("input.zip"),
        destination: root.path().join("out"),
        targets: None,
        password: None,
        keep_both: false,
    }
}
fn compression(root: &TempDir, format: &str) -> CompressionRequest {
    CompressionRequest {
        sources: vec![root.path().join("source")],
        destination: root.path().join(format!("output.{format}")),
        format: format.into(),
        split_size: None,
        password: None,
        encryption: None,
        level: 6,
    }
}

#[test]
fn hostile_paths_are_rejected_not_rewritten() {
    for name in [
        "../escape",
        "a/../../escape",
        "/tmp/escape",
        "C:\\escape",
        "\\\\host\\share",
        "a\0b",
        "./",
        "a/../safe",
    ] {
        assert!(paths::relative(name).is_err(), "{name}");
    }
    assert_eq!(
        paths::relative("./한글/자료.txt").unwrap(),
        PathBuf::from("한글/자료.txt")
    );
}
#[test]
fn overwrite_merges_and_preserves_unrelated_files() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    fs::create_dir_all(r.destination.join("folder")).unwrap();
    fs::write(r.destination.join("folder/keep.txt"), b"keep").unwrap();
    fs::write(r.destination.join("folder/change.txt"), b"old").unwrap();
    zip(&r.archive, &[("folder/change.txt", b"new")]);
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert_eq!(
        fs::read(r.destination.join("folder/keep.txt")).unwrap(),
        b"keep"
    );
    assert_eq!(
        fs::read(r.destination.join("folder/change.txt")).unwrap(),
        b"new"
    );
    assert_eq!(report.success_files, ["folder/change.txt"]);
    assert!(report.failed_files.is_empty());
}
#[test]
fn keep_both_reports_actual_renamed_path() {
    let root = tempfile::tempdir().unwrap();
    let mut r = request(&root);
    r.keep_both = true;
    fs::create_dir_all(&r.destination).unwrap();
    fs::write(r.destination.join("file.txt"), b"old").unwrap();
    zip(&r.archive, &[("file.txt", b"new")]);
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert_eq!(report.success_files, ["file (1).txt"]);
    assert_eq!(fs::read(&report.output_paths[0]).unwrap(), b"new");
    assert_eq!(fs::read(r.destination.join("file.txt")).unwrap(), b"old");
}
#[test]
fn corrupt_crc_keeps_previous_destination_and_cleans_stage() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    fs::create_dir_all(&r.destination).unwrap();
    fs::write(r.destination.join("file.txt"), b"old").unwrap();
    zip(&r.archive, &[("file.txt", b"payload_marker")]);
    let mut data = fs::read(&r.archive).unwrap();
    let pos = data
        .windows(14)
        .position(|b| b == b"payload_marker")
        .unwrap();
    data[pos] ^= 1;
    fs::write(&r.archive, data).unwrap();
    assert!(engine().extract(&r, &Context::default()).is_err());
    assert_eq!(fs::read(r.destination.join("file.txt")).unwrap(), b"old");
    assert_eq!(fs::read_dir(&r.destination).unwrap().count(), 1);
}
#[test]
fn traversal_zip_never_touches_outside_or_existing_data() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    zip(&r.archive, &[("../outside", b"bad")]);
    assert!(engine().extract(&r, &Context::default()).is_err());
    assert!(!root.path().join("outside").exists());
}
#[cfg(unix)]
#[test]
fn destination_symlink_ancestor_does_not_escape() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    fs::create_dir_all(root.path().join("outside/sub")).unwrap();
    fs::create_dir_all(&r.destination).unwrap();
    std::os::unix::fs::symlink(root.path().join("outside"), r.destination.join("link")).unwrap();
    zip(&r.archive, &[("link/sub/escape", b"bad")]);
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert!(!report.failed_files.is_empty());
    assert!(report.success_files.is_empty());
    assert!(!root.path().join("outside/sub/escape").exists());
}
#[cfg(unix)]
#[test]
fn archive_symlink_outside_is_blocked() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    let mut z = ZipWriter::new(File::create(&r.archive).unwrap());
    z.add_symlink("link", "../outside", SimpleFileOptions::default())
        .unwrap();
    z.finish().unwrap();
    assert!(engine().extract(&r, &Context::default()).is_err());
    assert!(!r.destination.join("link").exists());
}
#[cfg(unix)]
#[test]
fn internal_symlink_and_executable_mode_survive() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    let mut z = ZipWriter::new(File::create(&r.archive).unwrap());
    z.start_file(
        "App/run",
        SimpleFileOptions::default().unix_permissions(0o751),
    )
    .unwrap();
    z.write_all(b"run").unwrap();
    z.add_symlink("App/current", "run", SimpleFileOptions::default())
        .unwrap();
    z.finish().unwrap();
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(fs::read(r.destination.join("App/current")).unwrap(), b"run");
    assert_eq!(
        fs::metadata(r.destination.join("App/run"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o751
    );
}
#[test]
fn case_and_unicode_collisions_are_rejected() {
    for pair in [("A.txt", "a.txt"), ("한글.txt", "한글.txt")] {
        let root = tempfile::tempdir().unwrap();
        let r = request(&root);
        zip(&r.archive, &[(pair.0, b"a"), (pair.1, b"b")]);
        assert!(engine()
            .extract(&r, &Context::default())
            .unwrap_err()
            .contains("Ambiguous"));
    }
}
#[test]
fn selection_is_exact_and_unknown_selection_fails() {
    let root = tempfile::tempdir().unwrap();
    let mut r = request(&root);
    zip(&r.archive, &[("a.txt", b"a"), ("b.txt", b"b")]);
    r.targets = Some(vec!["b.txt".into()]);
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert_eq!(report.success_files, ["b.txt"]);
    assert!(!r.destination.join("a.txt").exists());
    r.targets = Some(vec!["missing".into()]);
    assert!(engine().extract(&r, &Context::default()).is_err());
}
#[test]
fn cancelled_job_produces_no_success() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    zip(&r.archive, &[("file", b"data")]);
    let ctx = Context::new(Arc::new(AtomicBool::new(true)), |_| {});
    let report = engine().extract(&r, &ctx).unwrap();
    assert!(report.cancelled);
    assert!(report.success_files.is_empty());
    assert!(!r.destination.exists());
}
#[test]
fn encrypted_zip_prompts_then_retries_without_truncating_existing_file() {
    let root = tempfile::tempdir().unwrap();
    let mut r = request(&root);
    let mut z = ZipWriter::new(File::create(&r.archive).unwrap());
    z.start_file(
        "secret.txt",
        SimpleFileOptions::default().with_aes_encryption(zip::AesMode::Aes256, "암호🔒"),
    )
    .unwrap();
    z.write_all(b"secret").unwrap();
    z.finish().unwrap();
    assert_eq!(
        engine().extract(&r, &Context::default()).unwrap_err(),
        "PASSWORD_REQUIRED"
    );
    r.password = Some("wrong".into());
    assert_eq!(
        engine().extract(&r, &Context::default()).unwrap_err(),
        "PASSWORD_REQUIRED"
    );
    r.password = Some("암호🔒".into());
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert_eq!(fs::read(&report.output_paths[0]).unwrap(), b"secret");
}
#[test]
fn preview_limit_is_enforced_by_backend() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    zip(
        &r.archive,
        &[("large.txt", &vec![b'a'; 20 * 1024 * 1024 + 1])],
    );
    assert!(engine()
        .read_entry(&r.archive, "large.txt", None, &Context::default())
        .unwrap_err()
        .contains("20 MiB"));
}
#[test]
fn compression_rejects_self_inclusion_and_missing_sources() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(root.path().join("source/file"), b"input").unwrap();
    let mut r = compression(&root, "zip");
    r.destination = root.path().join("source/out.zip");
    assert!(engine().compress(&r, &Context::default()).is_err());
    assert!(!r.destination.exists());
    r.sources = vec![root.path().join("missing")];
    r.destination = root.path().join("existing.zip");
    fs::write(&r.destination, b"keep").unwrap();
    assert!(engine().compress(&r, &Context::default()).is_err());
    assert_eq!(fs::read(&r.destination).unwrap(), b"keep");
}
#[test]
fn native_compression_roundtrips_all_formats_with_empty_directories() {
    for format in ["zip", "tar", "tar.gz", "tar.zst"] {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("source/empty")).unwrap();
        fs::write(root.path().join("source/한글.txt"), b"roundtrip").unwrap();
        let c = compression(&root, format);
        engine().compress(&c, &Context::default()).unwrap();
        let mut r = request(&root);
        r.archive = c.destination;
        let report = engine().extract(&r, &Context::default()).unwrap();
        assert!(
            report.failed_files.is_empty(),
            "{format}: {:?}",
            report.failed_files
        );
        assert_eq!(
            fs::read(r.destination.join("source/한글.txt")).unwrap(),
            b"roundtrip"
        );
        assert!(r.destination.join("source/empty").is_dir());
    }
}
#[test]
fn unsupported_tar_options_are_not_silently_ignored() {
    let root = tempfile::tempdir().unwrap();
    let mut c = compression(&root, "tar.gz");
    c.password = Some("secret".into());
    assert!(engine()
        .compress(&c, &Context::default())
        .unwrap_err()
        .contains("do not support"));
}
#[test]
fn zip_split_without_password_is_honored_and_roundtrips() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(root.path().join("source/한글.txt"), vec![b'a'; 100_000]).unwrap();
    let mut c = compression(&root, "zip");
    c.level = 0;
    c.split_size = Some("10k".into());
    let output = engine().compress(&c, &Context::default()).unwrap();
    assert!(output.len() > 1);
    assert!(output[0].ends_with(".001"));
    let mut r = request(&root);
    r.archive = output[0].clone().into();
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(
        fs::read(r.destination.join("source/한글.txt"))
            .unwrap()
            .len(),
        100_000
    );
}
#[test]
fn seven_zip_encrypted_header_and_unicode_selection_roundtrip() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(root.path().join("source/한글😀.txt"), b"yes").unwrap();
    fs::write(root.path().join("source/no.txt"), b"no").unwrap();
    let mut c = compression(&root, "7z");
    c.password = Some("암호".into());
    engine().compress(&c, &Context::default()).unwrap();
    assert!(engine()
        .preview(&c.destination, None, &Context::default())
        .is_err());
    let entries = engine()
        .preview(&c.destination, Some("암호"), &Context::default())
        .unwrap();
    assert!(entries.iter().any(|e| e.path == "source/" && e.is_dir));
    let mut r = request(&root);
    r.archive = c.destination;
    r.password = c.password;
    r.targets = Some(vec!["source/".into(), "source/한글😀.txt".into()]);
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert!(report.failed_files.is_empty());
    assert!(!r.destination.join("source/no.txt").exists());
    assert_eq!(
        fs::read(r.destination.join("source/한글😀.txt")).unwrap(),
        b"yes"
    );
}
#[test]
fn archive_reader_clones_have_independent_offsets() {
    use std::io::{Seek, SeekFrom};
    let root = tempfile::tempdir().unwrap();
    let p = root.path().join("data");
    fs::write(&p, b"abcdef").unwrap();
    let mut a = ziplens_astra_core::zip_engine::ArchiveReader::open(&p).unwrap();
    let mut b = a.clone();
    a.seek(SeekFrom::Start(3)).unwrap();
    let mut buf = [0; 3];
    b.read_exact(&mut buf).unwrap();
    assert_eq!(&buf, b"abc");
    a.read_exact(&mut buf).unwrap();
    assert_eq!(&buf, b"def");
}

#[test]
fn cancellation_during_copy_discards_stage() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    zip(&r.archive, &[("large", &vec![b'a'; 4 * 1024 * 1024])]);
    let cancel = Arc::new(AtomicBool::new(false));
    let trigger = cancel.clone();
    let ctx = Context::new(cancel, move |p| {
        if p.processed_bytes > 0 {
            trigger.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    });
    let report = engine().extract(&r, &ctx).unwrap();
    assert!(report.cancelled);
    assert!(report.success_files.is_empty());
    assert_eq!(fs::read_dir(&r.destination).unwrap().count(), 0);
}
#[test]
fn legacy_cp949_zip_names_roundtrip_without_mojibake() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    zip(&r.archive, &[("abcd.txt", b"korean")]);
    let mut bytes = fs::read(&r.archive).unwrap();
    let encoded = encoding_rs::EUC_KR.encode("한글").0.into_owned();
    for i in 0..bytes.len() - 8 {
        if &bytes[i..i + 8] == b"abcd.txt" {
            bytes[i..i + 4].copy_from_slice(&encoded);
        }
    }
    fs::write(&r.archive, bytes).unwrap();
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert_eq!(report.success_files, ["한글.txt"]);
    assert_eq!(
        engine()
            .read_entry(&r.archive, "한글.txt", None, &Context::default())
            .unwrap(),
        b"korean"
    );
}
#[test]
fn damaged_gzip_trailer_is_not_reported_as_success() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(root.path().join("source/file"), b"data").unwrap();
    let c = compression(&root, "tar.gz");
    engine().compress(&c, &Context::default()).unwrap();
    let mut bytes = fs::read(&c.destination).unwrap();
    let n = bytes.len();
    bytes[n - 8] ^= 1;
    fs::write(&c.destination, bytes).unwrap();
    let mut r = request(&root);
    r.archive = c.destination;
    assert!(engine().extract(&r, &Context::default()).is_err());
    assert!(!r.destination.exists());
}

#[cfg(unix)]
#[test]
fn restrictive_directory_modes_do_not_break_staging_or_cleanup() {
    let root = tempfile::tempdir().unwrap();
    let r = request(&root);
    let mut archive = ZipWriter::new(File::create(&r.archive).unwrap());
    archive
        .add_directory(
            "readonly",
            SimpleFileOptions::default().unix_permissions(0o500),
        )
        .unwrap();
    archive
        .start_file("readonly/file", SimpleFileOptions::default())
        .unwrap();
    archive.write_all(b"complete").unwrap();
    archive.finish().unwrap();
    let report = engine().extract(&r, &Context::default()).unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(
        fs::read(r.destination.join("readonly/file")).unwrap(),
        b"complete"
    );
    assert_eq!(fs::read_dir(&r.destination).unwrap().count(), 1);
}

#[test]
fn tar_compression_cancellation_is_not_retried_forever() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(
        root.path().join("source/large"),
        vec![b'a'; 4 * 1024 * 1024],
    )
    .unwrap();
    let request = compression(&root, "tar.gz");
    fs::write(&request.destination, b"preserve previous archive").unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let trigger = cancelled.clone();
    let ctx = Context::new(cancelled, move |p| {
        if p.processed_bytes > 0 {
            trigger.store(true, std::sync::atomic::Ordering::Relaxed);
        } else {
            // Advance past progress throttling so cancellation happens on a real data read.
            std::thread::sleep(std::time::Duration::from_millis(90));
        }
    });
    assert_eq!(engine().compress(&request, &ctx).unwrap_err(), "CANCELLED");
    assert_eq!(
        fs::read(&request.destination).unwrap(),
        b"preserve previous archive"
    );
}

#[test]
fn tar_source_size_changes_preserve_the_previous_archive() {
    for format in ["tar", "tar.gz", "tar.zst"] {
        for (before, after) in [(1024, 1), (1, 1024)] {
            let root = tempfile::tempdir().unwrap();
            let source = root.path().join("changing.txt");
            fs::write(&source, vec![b'a'; before]).unwrap();
            let mut request = compression(&root, format);
            request.sources = vec![source.clone()];
            fs::write(&request.destination, b"preserve previous archive").unwrap();
            let changed = Arc::new(AtomicBool::new(false));
            let trigger = changed.clone();
            let ctx = Context::new(Arc::new(AtomicBool::new(false)), move |p| {
                // The first TAR progress event occurs after source metadata is captured.
                if p.filename == "changing.txt"
                    && !trigger.swap(true, std::sync::atomic::Ordering::Relaxed)
                {
                    fs::write(&source, vec![b'b'; after]).unwrap();
                }
            });
            let result = engine().compress(&request, &ctx);
            assert!(changed.load(std::sync::atomic::Ordering::Relaxed));
            assert!(result.is_err(), "{format}: {before} -> {after}: {result:?}");
            assert_eq!(
                fs::read(&request.destination).unwrap(),
                b"preserve previous archive"
            );
            assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
        }
    }
}

#[cfg(target_os = "macos")]
#[test]
fn compression_does_not_overwrite_a_source_through_a_case_alias() {
    use std::os::unix::fs::MetadataExt;
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("original.zip");
    let alias = root.path().join("ORIGINAL.ZIP");
    fs::write(&source, b"preserve source bytes").unwrap();
    // This scenario requires a case-insensitive volume, as used by default on macOS.
    if !alias.exists() {
        return;
    }
    assert_eq!(
        fs::metadata(&source).unwrap().ino(),
        fs::metadata(&alias).unwrap().ino()
    );
    let mut request = compression(&root, "zip");
    request.sources = vec![source.clone()];
    request.destination = alias;
    assert!(engine().compress(&request, &Context::default()).is_err());
    assert_eq!(fs::read(source).unwrap(), b"preserve source bytes");
}

#[cfg(target_os = "macos")]
#[test]
fn compression_rejects_output_inside_a_case_aliased_source_folder() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("source")).unwrap();
    fs::write(root.path().join("source/file"), b"keep").unwrap();
    let alias = root.path().join("SOURCE");
    if !alias.is_dir() {
        return;
    }
    let mut request = compression(&root, "zip");
    request.destination = alias.join("out.zip");
    assert!(engine().compress(&request, &Context::default()).is_err());
    assert!(!request.destination.exists());
}

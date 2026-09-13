use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

fn engine() -> Engine {
    Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    }
}

fn encode_stream(kind: &str, data: &[u8], path: &Path) {
    match kind {
        "gzip" => {
            let mut encoder = flate2::write::GzEncoder::new(
                File::create(path).unwrap(),
                flate2::Compression::default(),
            );
            encoder.write_all(data).unwrap();
            encoder.finish().unwrap();
        }
        "zstd" => fs::write(path, zstd::stream::encode_all(data, 3).unwrap()).unwrap(),
        _ => {
            let source = tempfile::NamedTempFile::new().unwrap();
            fs::write(source.path(), data).unwrap();
            let output = Command::new(engine().sidecar)
                .args(["a", &format!("-t{kind}"), "--"])
                .arg(path)
                .arg(source.path())
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}

fn extraction(archive: &Path, destination: &Path) -> ExtractRequest {
    ExtractRequest {
        archive: archive.into(),
        destination: destination.into(),
        targets: None,
        password: None,
        keep_both: false,
    }
}

#[test]
fn single_stream_formats_have_real_sizes_and_roundtrip() {
    let data = "stream 한글\n".as_bytes();
    for (extension, kind) in [
        ("gz", "gzip"),
        ("gzip", "gzip"),
        ("bz2", "bzip2"),
        ("bzip2", "bzip2"),
        ("xz", "xz"),
        ("XZ", "xz"),
        ("zst", "zstd"),
        ("zstd", "zstd"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join(format!("자료.txt.{extension}"));
        encode_stream(kind, data, &archive);
        verify_stream(root.path(), &archive, data);
    }
}

fn verify_stream(root: &Path, archive: &Path, data: &[u8]) {
    let entries = engine()
        .preview(archive, None, &Context::default())
        .unwrap();
    assert_eq!(entries.len(), 1, "{}", archive.display());
    assert_eq!(entries[0].path, "자료.txt");
    assert_eq!(entries[0].size, data.len() as u64);
    assert_eq!(
        engine()
            .read_entry(archive, "자료.txt", None, &Context::default())
            .unwrap(),
        data
    );
    let mut request = extraction(archive, &root.join("out"));
    request.targets = Some(vec!["자료.txt".into()]);
    let report = engine().extract(&request, &Context::default()).unwrap();
    assert_eq!(report.success_files, ["자료.txt"]);
    assert!(report.failed_files.is_empty());
    assert_eq!(
        fs::read(request.destination.join("자료.txt")).unwrap(),
        data
    );
    request.targets = Some(vec!["missing".into()]);
    assert!(engine().extract(&request, &Context::default()).is_err());
}

#[test]
fn legacy_lzma_and_unix_compress_streams_roundtrip() {
    // Independently encoded FORMAT_ALONE LZMA and Unix compress fixtures.
    let fixtures: &[(&str, &[u8])] = &[
        (
            "lzma",
            &[
                93, 0, 0, 128, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 57, 157, 10, 140, 140,
                138, 68, 157, 83, 2, 19, 147, 169, 110, 54, 19, 136, 210, 23, 255, 252, 233, 32, 0,
            ],
        ),
        (
            "Z",
            &[
                31, 157, 144, 115, 232, 200, 41, 19, 166, 13, 136, 118, 149, 56, 169, 195, 5, 72, 1,
            ],
        ),
    ];
    for (extension, bytes) in fixtures {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join(format!("자료.txt.{extension}"));
        fs::write(&archive, bytes).unwrap();
        verify_stream(root.path(), &archive, "stream 한글\n".as_bytes());
    }
}

#[test]
fn empty_streams_are_files_and_are_not_lost_from_the_listing() {
    for (extension, kind) in [
        ("bz2", "bzip2"),
        ("xz", "xz"),
        ("zst", "zstd"),
        ("gz", "gzip"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join(format!("자료.txt.{extension}"));
        encode_stream(kind, b"", &archive);
        verify_stream(root.path(), &archive, b"");
    }
}

fn tar_data() -> Vec<u8> {
    let mut archive = tar::Builder::new(Vec::new());
    for (name, data) in [
        ("folder/한글.txt", b"selected".as_slice()),
        ("other.txt", b"other".as_slice()),
    ] {
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o640);
        header.set_cksum();
        archive.append_data(&mut header, name, data).unwrap();
    }
    archive.into_inner().unwrap()
}

#[test]
fn compressed_tar_variants_list_and_select_inner_files() {
    for (extension, kind) in [
        ("tar.bz2", "bzip2"),
        ("tar.bzip2", "bzip2"),
        ("tbz", "bzip2"),
        ("tbz2", "bzip2"),
        ("tar.xz", "xz"),
        ("txz", "xz"),
        ("tar.gzip", "gzip"),
        ("tar.zstd", "zstd"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join(format!("files.{extension}"));
        encode_stream(kind, &tar_data(), &archive);
        let entries = engine()
            .preview(&archive, None, &Context::default())
            .unwrap();
        assert_eq!(entries.len(), 2, "{extension}");
        assert_eq!(entries[0].path, "folder/한글.txt");
        assert_eq!(
            engine()
                .read_entry(&archive, "folder/한글.txt", None, &Context::default())
                .unwrap(),
            b"selected"
        );
        let mut request = extraction(&archive, &root.path().join("out"));
        request.targets = Some(vec!["folder/한글.txt".into()]);
        let report = engine().extract(&request, &Context::default()).unwrap();
        assert!(report.failed_files.is_empty(), "{extension}");
        assert_eq!(report.success_files, ["folder/한글.txt"]);
        assert_eq!(
            fs::read(request.destination.join("folder/한글.txt")).unwrap(),
            b"selected"
        );
        assert!(!request.destination.join("other.txt").exists());
    }
}

#[test]
fn plain_stream_suffix_does_not_implicitly_unpack_inner_tar() {
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("files.gz");
    let tar = tar_data();
    encode_stream("gzip", &tar, &archive);
    let entries = engine()
        .preview(&archive, None, &Context::default())
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, "files");
    assert_eq!(entries[0].size, tar.len() as u64);
    let request = extraction(&archive, &root.path().join("out"));
    let report = engine().extract(&request, &Context::default()).unwrap();
    assert_eq!(report.success_files, ["files"]);
    assert_eq!(fs::read(request.destination.join("files")).unwrap(), tar);
    assert!(!request.destination.join("folder").exists());
}

#[test]
fn compressed_tar_traversal_is_rejected_before_destination_creation() {
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("hostile.tar.xz");
    let mut tar = tar::Builder::new(Vec::new());
    let mut header = tar::Header::new_gnu();
    header.as_mut_bytes()[..10].copy_from_slice(b"../outside");
    header.set_size(3);
    header.set_mode(0o640);
    header.set_cksum();
    tar.append(&header, b"bad".as_slice()).unwrap();
    encode_stream("xz", &tar.into_inner().unwrap(), &archive);
    let request = extraction(&archive, &root.path().join("out"));
    assert!(engine()
        .extract(&request, &Context::default())
        .unwrap_err()
        .contains("Unsafe"));
    assert!(!root.path().join("outside").exists());
    assert!(!request.destination.exists());
}

#[test]
fn truncated_streams_never_replace_existing_data() {
    for (extension, kind) in [
        ("bz2", "bzip2"),
        ("xz", "xz"),
        ("zst", "zstd"),
        ("gz", "gzip"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join(format!("data.{extension}"));
        encode_stream(kind, b"new data", &archive);
        let mut bytes = fs::read(&archive).unwrap();
        bytes.truncate(bytes.len() - 8);
        fs::write(&archive, bytes).unwrap();
        let request = extraction(&archive, &root.path().join("out"));
        fs::create_dir(&request.destination).unwrap();
        fs::write(request.destination.join("data"), b"old data").unwrap();
        assert!(
            engine().extract(&request, &Context::default()).is_err(),
            "{extension}"
        );
        assert_eq!(
            fs::read(request.destination.join("data")).unwrap(),
            b"old data"
        );
        assert_eq!(fs::read_dir(&request.destination).unwrap().count(), 1);
    }
}

#[test]
fn cancelling_stream_decode_does_not_publish_partial_data() {
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("data.bz2");
    encode_stream("bzip2", &vec![b'a'; 4 * 1024 * 1024], &archive);
    let request = extraction(&archive, &root.path().join("out"));
    let cancelled = Arc::new(AtomicBool::new(false));
    let trigger = cancelled.clone();
    let ctx = Context::new(cancelled, move |p| {
        if p.processed_bytes > 0 {
            trigger.store(true, Ordering::Relaxed);
        } else {
            std::thread::sleep(std::time::Duration::from_millis(90));
        }
    });
    let report = engine().extract(&request, &ctx).unwrap();
    assert!(report.cancelled);
    assert!(report.success_files.is_empty());
    assert!(!request.destination.exists());
}

#[test]
fn comic_book_container_aliases_roundtrip() {
    for (format, extension) in [("zip", "cbz"), ("7z", "cb7"), ("tar", "cbt")] {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("page.txt");
        fs::write(&source, b"comic page").unwrap();
        let mut archive = root.path().join(format!("pages.{format}"));
        engine()
            .compress(
                &CompressionRequest {
                    sources: vec![source],
                    destination: archive.clone(),
                    format: format.into(),
                    split_size: None,
                    password: None,
                    encryption: None,
                    level: 3,
                },
                &Context::default(),
            )
            .unwrap();
        let alias = archive.with_extension(extension);
        fs::rename(&archive, &alias).unwrap();
        archive = alias;
        let request = extraction(&archive, &root.path().join("out"));
        let report = engine().extract(&request, &Context::default()).unwrap();
        assert!(report.failed_files.is_empty(), "{extension}");
        assert_eq!(report.success_files, ["page.txt"]);
        assert_eq!(
            fs::read(request.destination.join("page.txt")).unwrap(),
            b"comic page"
        );
    }
}

#[cfg(target_os = "macos")]
#[test]
fn cpio_and_ar_archives_roundtrip_with_system_generated_fixtures() {
    for format in ["cpio", "ar"] {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("file.txt"), b"portable archive").unwrap();
        let archive = root.path().join(format!("input.{format}"));
        let output = if format == "cpio" {
            Command::new("/usr/bin/bsdtar")
                .current_dir(root.path())
                .args(["--format=newc", "-cf"])
                .arg(&archive)
                .arg("file.txt")
                .output()
                .unwrap()
        } else {
            Command::new("/usr/bin/ar")
                .current_dir(root.path())
                .arg("-q")
                .arg(&archive)
                .arg("file.txt")
                .output()
                .unwrap()
        };
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let request = extraction(&archive, &root.path().join("out"));
        let report = engine().extract(&request, &Context::default()).unwrap();
        assert!(report.failed_files.is_empty(), "{format}");
        assert_eq!(report.success_files, ["file.txt"]);
        assert_eq!(
            fs::read(request.destination.join("file.txt")).unwrap(),
            b"portable archive"
        );
    }
}

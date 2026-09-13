use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use ziplens_astra_core::{paths, Context, Engine, ExtractRequest};

fn engine(legacy: bool) -> Engine {
    Engine {
        sidecar: if legacy {
            PathBuf::from(env!("CARGO_BIN_EXE_ziplens-legacy")).with_file_name("7zz")
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz")
        },
    }
}
fn request(archive: &Path, destination: &Path, keep_both: bool) -> ExtractRequest {
    ExtractRequest {
        archive: archive.into(),
        destination: destination.into(),
        targets: None,
        password: None,
        keep_both,
    }
}
fn make_zip(path: &Path, entry: &str) {
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    zip.start_file(entry, zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"verified extracted content").unwrap();
    zip.finish().unwrap();
}
fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/legacy")
        .join(name)
}

#[test]
fn extraction_never_replaces_source_through_same_name_case_or_unicode_alias() {
    for (archive_name, entry) in [
        ("same.zip", "same.zip"),
        ("case.zip", "CASE.zip"),
        ("Café.zip", "Cafe\u{301}.zip"),
    ] {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join(archive_name);
        make_zip(&archive, entry);
        let original = fs::read(&archive).unwrap();
        // A case-sensitive/normalization-sensitive test filesystem has no alias to protect.
        if !paths::same_file(&archive, &temp.path().join(entry)).unwrap() {
            continue;
        }
        let report = engine(false)
            .extract(&request(&archive, temp.path(), false), &Context::default())
            .unwrap();
        assert!(report.success_files.is_empty(), "{archive_name}");
        assert!(
            report
                .failed_files
                .iter()
                .any(|(p, e)| p == entry && e.contains("source archive")),
            "{report:?}"
        );
        assert_eq!(fs::read(&archive).unwrap(), original);
    }
}

#[test]
fn extraction_source_hardlink_is_protected_and_keep_both_remains_available() {
    let temp = tempfile::tempdir().unwrap();
    let archive = temp.path().join("source.zip");
    make_zip(&archive, "alias.zip");
    let original = fs::read(&archive).unwrap();
    let alias = temp.path().join("alias.zip");
    fs::hard_link(&archive, &alias).unwrap();
    assert!(paths::same_file(&archive, &alias).unwrap());
    let report = engine(false)
        .extract(&request(&archive, temp.path(), false), &Context::default())
        .unwrap();
    assert!(report.success_files.is_empty());
    assert_eq!(report.failed_files.len(), 1);
    assert_eq!(fs::read(&alias).unwrap(), original);
    let report = engine(false)
        .extract(&request(&archive, temp.path(), true), &Context::default())
        .unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(report.success_files, ["alias (1).zip"]);
    assert_eq!(
        fs::read(temp.path().join("alias (1).zip")).unwrap(),
        b"verified extracted content"
    );
    assert_eq!(fs::read(&archive).unwrap(), original);
    assert_eq!(fs::read(&alias).unwrap(), original);
}

#[test]
fn source_named_entry_can_be_saved_with_keep_both_without_touching_original() {
    let temp = tempfile::tempdir().unwrap();
    let archive = temp.path().join("same.zip");
    make_zip(&archive, "same.zip");
    let original = fs::read(&archive).unwrap();
    let report = engine(false)
        .extract(&request(&archive, temp.path(), true), &Context::default())
        .unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(report.success_files, ["same (1).zip"]);
    assert_eq!(fs::read(&archive).unwrap(), original);
}

#[test]
fn normal_overwrite_of_unrelated_file_is_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let archive = temp.path().join("source.zip");
    make_zip(&archive, "other.txt");
    fs::write(temp.path().join("other.txt"), b"old").unwrap();
    let report = engine(false)
        .extract(&request(&archive, temp.path(), false), &Context::default())
        .unwrap();
    assert!(report.failed_files.is_empty());
    assert_eq!(
        fs::read(temp.path().join("other.txt")).unwrap(),
        b"verified extracted content"
    );
}

#[test]
fn alz_second_input_volume_is_protected_during_publication() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("split.alz");
    let second = temp.path().join("split.a00");
    fs::copy(fixture("split.alz"), &first).unwrap();
    let mut bytes = fs::read(fixture("split.a00")).unwrap();
    let pos = bytes.windows(9).position(|b| b == b"other.txt").unwrap();
    bytes[pos..pos + 9].copy_from_slice(b"split.a00");
    fs::write(&second, &bytes).unwrap();
    let report = engine(true)
        .extract(&request(&first, temp.path(), false), &Context::default())
        .unwrap();
    assert!(report
        .failed_files
        .iter()
        .any(|(p, e)| p == "split.a00" && e.contains("source archive")));
    assert_eq!(fs::read(second).unwrap(), bytes);
}

#[test]
fn egg_header_discovered_volume_is_protected_even_without_volume_filename() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("split.vol1.egg");
    let second = temp.path().join("other.txt");
    fs::copy(fixture("split.vol1.egg"), &first).unwrap();
    fs::copy(fixture("split.vol2.egg"), &second).unwrap();
    let original = fs::read(&second).unwrap();
    let report = engine(true)
        .extract(&request(&first, temp.path(), false), &Context::default())
        .unwrap();
    assert!(
        report
            .failed_files
            .iter()
            .any(|(p, e)| p == "other.txt" && e.contains("source archive")),
        "{report:?}"
    );
    assert_eq!(fs::read(second).unwrap(), original);
}

#[test]
fn seven_zip_and_zip_numbered_input_volumes_are_protected() {
    for format in ["7z", "zip"] {
        let temp = tempfile::tempdir().unwrap();
        let input = temp.path().join("input");
        fs::create_dir(&input).unwrap();
        let entry = format!("multi.{format}.002");
        fs::write(input.join(&entry), vec![42u8; 1024]).unwrap();
        let output = Command::new(engine(false).sidecar)
            .current_dir(&input)
            .args(["a", &format!("-t{format}"), "-mx=0", "-v128b", "--"])
            .arg(temp.path().join(format!("multi.{format}")))
            .arg(&entry)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let first = temp.path().join(format!("multi.{format}.001"));
        let second = temp.path().join(&entry);
        let original = fs::read(&second).unwrap();
        let report = engine(false)
            .extract(&request(&first, temp.path(), false), &Context::default())
            .unwrap();
        assert!(
            report
                .failed_files
                .iter()
                .any(|(p, e)| p == &entry && e.contains("source archive")),
            "{report:?}"
        );
        assert_eq!(fs::read(&second).unwrap(), original);
    }
}

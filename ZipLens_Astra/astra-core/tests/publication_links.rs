#![cfg(unix)]
use std::{
    fs,
    path::{Path, PathBuf},
};
use ziplens_astra_core::{Context, Engine, ExtractRequest};

fn engine() -> Engine {
    Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    }
}
fn add_file(builder: &mut tar::Builder<fs::File>, name: &str) {
    let mut header = tar::Header::new_gnu();
    header.set_mode(0o644);
    header.set_size(4);
    header.set_cksum();
    builder
        .append_data(&mut header, name, b"safe".as_slice())
        .unwrap();
}
fn add_link(builder: &mut tar::Builder<fs::File>, name: &str, target: &str) {
    let mut header = tar::Header::new_gnu();
    header.set_mode(0o777);
    header.set_size(0);
    header.set_entry_type(tar::EntryType::Symlink);
    header.set_link_name(target).unwrap();
    header.set_cksum();
    builder
        .append_data(&mut header, name, std::io::empty())
        .unwrap();
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

#[test]
fn a_failed_file_cannot_redirect_a_published_archive_link_outside_destination() {
    for conflict_is_link in [true, false] {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("archive.tar");
        let destination = temp.path().join("out");
        fs::create_dir(&destination).unwrap();
        let outside = temp.path().join("outside.txt");
        fs::write(&outside, b"outside original").unwrap();
        if conflict_is_link {
            std::os::unix::fs::symlink(&outside, destination.join("target.txt")).unwrap();
        } else {
            fs::create_dir(destination.join("target.txt")).unwrap();
        }
        let mut tar = tar::Builder::new(fs::File::create(&archive).unwrap());
        add_file(&mut tar, "target.txt");
        add_link(&mut tar, "link.txt", "target.txt");
        tar.finish().unwrap();
        let report = engine()
            .extract(&request(&archive, &destination, false), &Context::default())
            .unwrap();
        assert!(report.success_files.is_empty(), "{report:?}");
        assert_eq!(report.failed_files.len(), 2, "{report:?}");
        assert!(!destination.join("link.txt").exists());
        assert_eq!(fs::read(&outside).unwrap(), b"outside original");
    }
}

#[test]
fn links_to_a_blocked_source_archive_are_not_published() {
    let temp = tempfile::tempdir().unwrap();
    let archive = temp.path().join("source.tar");
    let mut tar = tar::Builder::new(fs::File::create(&archive).unwrap());
    add_file(&mut tar, "source.tar");
    add_link(&mut tar, "link.txt", "source.tar");
    tar.finish().unwrap();
    drop(tar);
    let original = fs::read(&archive).unwrap();
    let report = engine()
        .extract(&request(&archive, temp.path(), false), &Context::default())
        .unwrap();
    assert!(report.success_files.is_empty());
    assert_eq!(report.failed_files.len(), 2);
    assert!(!temp.path().join("link.txt").exists());
    assert_eq!(fs::read(&archive).unwrap(), original);
}

#[test]
fn valid_internal_link_chains_and_keep_both_still_roundtrip() {
    for keep in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("archive.tar");
        let destination = temp.path().join("out");
        fs::create_dir_all(destination.join("root")).unwrap();
        fs::write(destination.join("root/existing.txt"), b"existing").unwrap();
        let mut tar = tar::Builder::new(fs::File::create(&archive).unwrap());
        add_file(&mut tar, "root/data.txt");
        // Outer link comes first: publication must wait for the inner link.
        add_link(&mut tar, "root/outer.txt", "inner.txt");
        add_link(&mut tar, "root/inner.txt", "data.txt");
        tar.finish().unwrap();
        drop(tar);
        let report = engine()
            .extract(&request(&archive, &destination, keep), &Context::default())
            .unwrap();
        assert!(report.failed_files.is_empty(), "{report:?}");
        assert_eq!(report.success_files.len(), 3);
        let root = destination.join(if keep { "root (1)" } else { "root" });
        for name in ["data.txt", "inner.txt", "outer.txt"] {
            assert_eq!(fs::read(root.join(name)).unwrap(), b"safe");
        }
        assert!(root.join("inner.txt").is_symlink());
        assert!(root.join("outer.txt").is_symlink());
        assert_eq!(
            fs::read(destination.join("root/existing.txt")).unwrap(),
            b"existing"
        );
    }
}

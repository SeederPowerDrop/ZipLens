use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use ziplens_astra_core::{Context, Engine, ExtractRequest};

const PAYLOAD: &str = "ZipLens 한글 압축 테스트\n";
const NAME: &str = "폴더/한글.txt";
fn engine() -> Engine {
    Engine {
        sidecar: PathBuf::from(env!("CARGO_BIN_EXE_ziplens-legacy")).with_file_name("7zz"),
    }
}
fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/legacy")
        .join(name)
}
fn request(archive: &Path, destination: &Path) -> ExtractRequest {
    ExtractRequest {
        archive: archive.into(),
        destination: destination.into(),
        targets: None,
        password: None,
        keep_both: false,
    }
}

#[test]
fn alz_egg_codecs_korean_names_preview_extract_and_read_entry() {
    for archive in [
        "store.alz",
        "deflate.alz",
        "bzip2.alz",
        "store.egg",
        "deflate.egg",
        "bzip2.egg",
        "lzma.egg",
        "azo-stored.egg",
        "solid.egg",
        "split.alz",
        "split.vol1.egg",
    ] {
        let path = fixture(archive);
        let entries = engine()
            .preview(&path, None, &Context::default())
            .unwrap_or_else(|e| panic!("{archive}: {e}"));
        let file = entries.iter().find(|e| e.path == NAME).unwrap();
        assert_eq!(file.size, PAYLOAD.len() as u64, "{archive}");
        assert_eq!(
            engine()
                .read_entry(&path, NAME, None, &Context::default())
                .unwrap_or_else(|e| panic!("{archive}: {e}")),
            PAYLOAD.as_bytes()
        );
        let temp = tempfile::tempdir().unwrap();
        let req = request(&path, &temp.path().join("out"));
        let report = engine()
            .extract(&req, &Context::default())
            .unwrap_or_else(|e| panic!("{archive}: {e}"));
        assert!(report.failed_files.is_empty());
        assert_eq!(
            fs::read(req.destination.join(NAME)).unwrap(),
            PAYLOAD.as_bytes()
        );
        assert_eq!(
            fs::read(req.destination.join("other.txt")).unwrap(),
            b"other"
        );
    }
}

#[test]
fn legacy_selection_is_exact_even_in_solid_archives() {
    for archive in [
        "deflate.alz",
        "deflate.egg",
        "solid.egg",
        "split.alz",
        "split.vol1.egg",
    ] {
        let temp = tempfile::tempdir().unwrap();
        let mut req = request(&fixture(archive), &temp.path().join("out"));
        req.targets = Some(vec![NAME.into()]);
        let result = engine()
            .extract(&req, &Context::default())
            .unwrap_or_else(|e| panic!("{archive}: {e}"));
        assert_eq!(result.success_files, [NAME]);
        assert_eq!(
            fs::read(req.destination.join(NAME)).unwrap(),
            PAYLOAD.as_bytes()
        );
        assert!(!req.destination.join("other.txt").exists());
    }
    let temp = tempfile::tempdir().unwrap();
    let mut req = request(&fixture("solid.egg"), &temp.path().join("out"));
    req.targets = Some(vec!["폴더/".into()]);
    engine().extract(&req, &Context::default()).unwrap();
    assert!(req.destination.join("폴더").is_dir());
    assert!(!req.destination.join(NAME).exists());
}

#[test]
fn legacy_password_retry_and_korean_password_roundtrip() {
    for archive in ["encrypted.alz", "encrypted.egg"] {
        let temp = tempfile::tempdir().unwrap();
        let path = fixture(archive);
        let entries = engine().preview(&path, None, &Context::default()).unwrap();
        assert!(
            entries
                .iter()
                .find(|e| e.path == NAME)
                .unwrap()
                .is_encrypted
        );
        let mut req = request(&path, &temp.path().join("out"));
        for password in [None, Some("wrong")] {
            req.password = password.map(str::to_owned);
            assert!(engine()
                .extract(&req, &Context::default())
                .unwrap_err()
                .contains("PASSWORD_REQUIRED"));
            assert!(!req.destination.join(NAME).exists());
        }
        req.password = Some("암호".into());
        engine()
            .extract(&req, &Context::default())
            .unwrap_or_else(|e| panic!("{archive}: {e}"));
        assert_eq!(
            fs::read(req.destination.join(NAME)).unwrap(),
            PAYLOAD.as_bytes()
        );
        assert_eq!(
            engine()
                .read_entry(&path, NAME, Some("암호"), &Context::default())
                .unwrap(),
            PAYLOAD.as_bytes()
        );
    }
}

#[test]
fn legacy_corrupt_crc_does_not_publish_any_files() {
    for archive in ["store.alz", "store.egg"] {
        let temp = tempfile::tempdir().unwrap();
        let mut data = fs::read(fixture(archive)).unwrap();
        // Corrupt the later entry, after the first one has been decoded into stage.
        let pos = data.windows(5).rposition(|w| w == b"other").unwrap();
        data[pos] ^= 1;
        let path = temp.path().join(archive);
        fs::write(&path, data).unwrap();
        let req = request(&path, &temp.path().join("out"));
        assert!(engine().extract(&req, &Context::default()).is_err());
        assert!(!req.destination.join(NAME).exists());
        assert!(!req.destination.join("other.txt").exists());
    }
}

#[test]
fn legacy_truncation_and_missing_split_volumes_are_errors() {
    for archive in ["store.alz", "store.egg", "split.alz", "split.vol1.egg"] {
        let temp = tempfile::tempdir().unwrap();
        let mut bytes = fs::read(fixture(archive)).unwrap();
        if archive.starts_with("store") {
            bytes.truncate(bytes.len() - 8);
        }
        let path = temp.path().join(archive);
        fs::write(&path, bytes).unwrap();
        assert!(
            engine().preview(&path, None, &Context::default()).is_err(),
            "{archive}"
        );
        let req = request(&path, &temp.path().join("out"));
        assert!(engine().extract(&req, &Context::default()).is_err());
        assert!(!req.destination.exists());
    }
}

#[test]
fn legacy_raw_absolute_paths_are_rejected_before_upstream_normalizes_them() {
    for archive in ["store.alz", "store.egg"] {
        let temp = tempfile::tempdir().unwrap();
        let mut data = fs::read(fixture(archive)).unwrap();
        let pos = data.windows(9).position(|w| w == b"other.txt").unwrap();
        data[pos..pos + 9].copy_from_slice(b"/evil.txt");
        let path = temp.path().join(archive);
        fs::write(&path, data).unwrap();
        let req = request(&path, &temp.path().join("out"));
        assert!(engine().extract(&req, &Context::default()).is_err());
        assert!(!req.destination.exists());
    }
}

#[test]
fn legacy_helper_cancellation_returns_without_publication() {
    let temp = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let signal = cancelled.clone();
    let ctx = Context::new(cancelled, move |_| {
        signal.store(true, Ordering::Relaxed);
    });
    let req = request(&fixture("deflate.egg"), &temp.path().join("out"));
    assert!(engine().extract(&req, &ctx).unwrap().cancelled);
    assert!(!req.destination.exists());
}

fn egg_names(entries: &[(u32, Option<u32>, String)]) -> Vec<u8> {
    let mut bytes = b"EGGA\x00\x01\x01\0\0\0\0\0\0\0".to_vec();
    let end = 0x08E28222u32.to_le_bytes();
    bytes.extend(end);
    for (id, parent, name) in entries {
        bytes.extend(0x0A8590E3u32.to_le_bytes());
        bytes.extend(id.to_le_bytes());
        bytes.extend(0u64.to_le_bytes());
        bytes.extend(0x0A8591ACu32.to_le_bytes());
        bytes.push(if parent.is_some() { 0x10 } else { 0 });
        bytes.extend(((name.len() + if parent.is_some() { 4 } else { 0 }) as u16).to_le_bytes());
        if let Some(parent) = parent {
            bytes.extend(parent.to_le_bytes());
        }
        bytes.extend(name.as_bytes());
        bytes.extend(end);
    }
    bytes.extend(end);
    bytes
}

fn rejected_preview(bytes: &[u8], extension: &str, expected: &str) {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join(format!("malformed.{extension}"));
    fs::write(&path, bytes).unwrap();
    let error = engine()
        .preview(&path, None, &Context::default())
        .unwrap_err();
    assert!(
        error.contains(expected),
        "expected {expected:?}, got {error:?}"
    );
}

#[test]
fn egg_relative_name_expansion_and_parent_chains_are_bounded_before_parse() {
    let nested = egg_names(&[
        (1, None, "parent".into()),
        (2, Some(1), "child".into()),
        (3, Some(2), "leaf".into()),
    ]);
    rejected_preview(&nested, "egg", "Nested relative");
    let mut repeated = vec![(1, None, "a".repeat(4000))];
    for id in 2..=5000 {
        repeated.push((id, Some(1), format!("child{id}")));
    }
    rejected_preview(&egg_names(&repeated), "egg", "16 MiB");
    rejected_preview(
        &egg_names(&[(1, Some(2), "orphan".into())]),
        "egg",
        "Missing EGG parent",
    );
}

#[test]
fn legacy_declared_sizes_and_counts_are_rejected_before_allocating_or_decoding() {
    let mut egg = egg_names(&[(1, None, "file".into())]);
    // 18-byte archive prefix, signature + ID, then decoded file size.
    egg[26..34].copy_from_slice(&(1024u64.pow(4) + 1).to_le_bytes());
    rejected_preview(&egg, "egg", "1 TiB");
    let huge = egg_names(
        &(1..=100_001)
            .map(|i| (i, None, format!("f{i}")))
            .collect::<Vec<_>>(),
    );
    rejected_preview(&huge, "egg", "100,000 entries");
    let mut alz = fs::read(fixture("store.alz")).unwrap();
    alz[12..14].copy_from_slice(&u16::MAX.to_le_bytes());
    rejected_preview(&alz, "alz", "filename length");
    let mut egg = fs::read(fixture("lzma.egg")).unwrap();
    let pos = egg
        .windows(4)
        .position(|w| w == 0x02B50C13u32.to_le_bytes())
        .unwrap();
    egg[pos + 6..pos + 10].copy_from_slice(&(257u32 * 1024 * 1024).to_le_bytes());
    rejected_preview(&egg, "egg", "memory limit");
}

#[test]
fn egg_encryption_metadata_accepts_known_overstated_header_variant() {
    let temp = tempfile::tempdir().unwrap();
    let mut bytes = fs::read(fixture("encrypted.egg")).unwrap();
    let sig = 0x08D1470Fu32.to_le_bytes();
    let positions: Vec<_> = bytes
        .windows(4)
        .enumerate()
        .filter_map(|(i, w)| (w == sig).then_some(i))
        .collect();
    for pos in positions {
        bytes[pos + 5..pos + 7].copy_from_slice(&21u16.to_le_bytes());
    }
    let path = temp.path().join("overstated.egg");
    fs::write(&path, bytes).unwrap();
    assert_eq!(
        engine()
            .read_entry(&path, NAME, Some("암호"), &Context::default())
            .unwrap(),
        PAYLOAD.as_bytes()
    );
}

#[test]
fn legacy_final_end_markers_are_required() {
    for name in ["store.alz", "store.egg"] {
        let mut bytes = fs::read(fixture(name)).unwrap();
        bytes.truncate(bytes.len() - 4);
        rejected_preview(&bytes, name.rsplit('.').next().unwrap(), "Incomplete");
    }
}

#[test]
#[cfg(unix)]
fn egg_split_symlinks_are_rejected_but_unrelated_symlinks_are_allowed() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("split.vol1.egg");
    fs::copy(fixture("split.vol1.egg"), &first).unwrap();
    let second = temp.path().join("split.vol2.egg");
    std::os::unix::fs::symlink(fixture("split.vol2.egg"), &second).unwrap();
    assert!(engine()
        .preview(&first, None, &Context::default())
        .unwrap_err()
        .contains("Symlinked"));
    fs::remove_file(&second).unwrap();
    fs::copy(fixture("split.vol2.egg"), &second).unwrap();
    std::os::unix::fs::symlink(fixture("store.egg"), temp.path().join("unrelated")).unwrap();
    engine().preview(&first, None, &Context::default()).unwrap();
}

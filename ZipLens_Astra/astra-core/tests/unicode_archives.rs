//! The archive's names and bytes are independent of the UI language. Exercise
//! the shared core entry points, including read_entry (not exposed by the CLI).
use std::{collections::BTreeMap, fs, path::PathBuf};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

const NAMES: &[&str] = &[
    "한국어/사용 설명서.txt",
    "English/User guide.txt",
    "日本語/使い方.txt",
    "中文/使用说明.txt",
    "Tiếng Việt/Hướng dẫn sử dụng.txt",
    "Español/Guía de uso.txt",
    "Français/Mode d’emploi.txt",
    "Deutsch/Größe und Übersicht.txt",
    "Русский/Руководство.txt",
    "العربية/دليل الاستخدام.txt",
    "emoji/가족 👨‍👩‍👧‍👦 📦.txt",
    "NFC/café.txt",
    "NFD/cafe\u{301}.txt",
];

fn engine() -> Engine {
    Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    }
}

#[test]
fn multilingual_names_survive_preview_read_selection_and_full_extraction() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("자료-日本語-العربية");
    let mut expected = BTreeMap::new();
    for (index, name) in NAMES.iter().enumerate() {
        let path = source.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let payload = format!("{index}: {name}\n").into_bytes();
        fs::write(&path, &payload).unwrap();
        expected.insert(format!("자료-日本語-العربية/{name}"), payload);
    }
    fs::create_dir(source.join("空のフォルダー-빈 폴더-فارغ")).unwrap();
    for (index, (format, password)) in [
        ("zip", None),
        ("7z", None),
        ("tar", None),
        ("tar.gz", None),
        ("tar.zst", None),
        ("zip", Some("test-only-ASCII-password-42")),
        ("7z", Some("테스트-日本語-العربية-🔒")),
    ]
    .iter()
    .enumerate()
    {
        let archive = root
            .path()
            .join(format!("압축-日本語-العربية-{index}.{format}"));
        let request = CompressionRequest {
            sources: vec![source.clone()],
            destination: archive.clone(),
            format: (*format).into(),
            split_size: None,
            password: password.map(str::to_owned),
            encryption: None,
            level: 6,
        };
        engine().compress(&request, &Context::default()).unwrap();
        let archive_before = fs::read(&archive).unwrap();
        let entries = engine()
            .preview(&archive, *password, &Context::default())
            .unwrap();
        let actual: BTreeMap<_, _> = entries
            .iter()
            .filter(|entry| !entry.is_dir)
            .map(|entry| (entry.path.clone(), entry.size))
            .collect();
        let expected_sizes: BTreeMap<_, _> = expected
            .iter()
            .map(|(name, bytes)| (name.clone(), bytes.len() as u64))
            .collect();
        assert_eq!(actual, expected_sizes, "format {format}, case {index}");
        for (name, payload) in &expected {
            assert_eq!(
                engine()
                    .read_entry(&archive, name, *password, &Context::default())
                    .unwrap(),
                *payload,
                "format {format}, entry {name}"
            );
        }
        // A subset verifies exact selection cannot accidentally extract neighbors.
        let selected: Vec<_> = expected.keys().step_by(2).cloned().collect();
        let extract = ExtractRequest {
            archive: archive.clone(),
            destination: root.path().join(format!("선택-الخروج-{index}")),
            targets: Some(selected.clone()),
            password: password.map(str::to_owned),
            keep_both: false,
        };
        let report = engine().extract(&extract, &Context::default()).unwrap();
        assert!(!report.cancelled && report.failed_files.is_empty());
        assert_eq!(report.success_files.len(), selected.len());
        for (name, payload) in &expected {
            let output = extract.destination.join(name);
            if selected.contains(name) {
                assert_eq!(fs::read(output).unwrap(), *payload);
            } else {
                assert!(!output.exists(), "Unselected file {name} was extracted");
            }
        }
        let all = ExtractRequest {
            destination: root.path().join(format!("전체-الخروج-{index}")),
            targets: None,
            ..extract
        };
        let report = engine().extract(&all, &Context::default()).unwrap();
        assert!(!report.cancelled && report.failed_files.is_empty());
        assert_eq!(report.success_files.len(), expected.len());
        for (name, payload) in &expected {
            assert_eq!(fs::read(all.destination.join(name)).unwrap(), *payload);
        }
        assert!(all
            .destination
            .join("자료-日本語-العربية/空のフォルダー-빈 폴더-فارغ")
            .is_dir());
        assert_eq!(fs::read(archive).unwrap(), archive_before);
    }
    for (name, payload) in &expected {
        assert_eq!(fs::read(root.path().join(name)).unwrap(), *payload);
    }
}

#[test]
fn unsupported_zip_password_characters_fail_before_touching_output() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("자료.txt");
    fs::write(&source, b"preserve source").unwrap();
    let destination = root.path().join("existing.zip");
    fs::write(&destination, b"preserve existing archive").unwrap();
    for encryption in ["AES256", "ZipCrypto"] {
        for password in [
            "암호",
            "日本語",
            "العربية",
            "café",
            "🔒",
            "tab\t",
            "line\n",
            "\u{1f}",
        ] {
            let request = CompressionRequest {
                sources: vec![source.clone()],
                destination: destination.clone(),
                format: "zip".into(),
                split_size: None,
                password: Some(password.into()),
                encryption: Some(encryption.into()),
                level: 6,
            };
            let error = engine()
                .compress(&request, &Context::default())
                .unwrap_err();
            assert!(error.contains("ZIP creation requires ASCII"), "{error}");
            assert_eq!(
                fs::read(&destination).unwrap(),
                b"preserve existing archive"
            );
            assert_eq!(fs::read(&source).unwrap(), b"preserve source");
            assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
            let request = CompressionRequest {
                destination: root.path().join("not-created/new.zip"),
                ..request
            };
            assert!(engine()
                .compress(&request, &Context::default())
                .unwrap_err()
                .contains("ASCII"));
            assert!(!root.path().join("not-created").exists());
        }
    }
}

use std::{
    fs::{self, File},
    io::{BufWriter, Write},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};
use ziplens_astra_core::{Context, Engine, ExtractRequest};

#[test]
fn zip64_entry_count_lists_and_extracts_exact_selection_after_65535() {
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("many-entries.zip");
    let mut writer = ZipWriter::new(BufWriter::new(File::create(&archive).unwrap()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    // Cross the 16-bit entry-count boundary without a multi-gigabyte fixture or
    // tens of thousands of extracted files. The selected payload comes last.
    for index in 0..65_536 {
        writer
            .start_file(format!("entry-{index:05}.txt"), options)
            .unwrap();
    }
    writer.start_file("last-selected.txt", options).unwrap();
    writer.write_all(b"last ZIP64 entry").unwrap();
    writer.finish().unwrap().flush().unwrap();
    let bytes = fs::read(&archive).unwrap();
    assert!(bytes.windows(4).any(|window| window == b"PK\x06\x06"));

    // This fixture must stay on the native ZIP path; no external helper is needed.
    let engine = Engine {
        sidecar: root.path().join("missing-7zz"),
    };
    let entries = engine.preview(&archive, None, &Context::default()).unwrap();
    assert_eq!(entries.len(), 65_537);
    assert_eq!(entries.first().unwrap().path, "entry-00000.txt");
    assert_eq!(entries.last().unwrap().path, "last-selected.txt");
    let destination = root.path().join("selected-output");
    let report = engine
        .extract(
            &ExtractRequest {
                archive,
                destination: destination.clone(),
                targets: Some(vec!["last-selected.txt".into()]),
                password: None,
                keep_both: false,
            },
            &Context::default(),
        )
        .unwrap();
    assert!(!report.cancelled);
    assert!(report.failed_files.is_empty());
    assert_eq!(report.success_files, ["last-selected.txt"]);
    assert_eq!(report.output_paths.len(), 1);
    assert_eq!(
        fs::read(&report.output_paths[0]).unwrap(),
        b"last ZIP64 entry"
    );
    assert_eq!(fs::read_dir(destination).unwrap().count(), 1);
}

//! Reproducible engine benchmark. Baseline adapters reproduce the original ZIP loops,
//! using the SAME linked codecs and no Tauri events. This is not a Bandizip comparison.
use rayon::prelude::*;
use serde_json::json;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    time::Instant,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

fn baseline_extract(path: &Path, dest: &Path) {
    fs::create_dir_all(dest).unwrap();
    let archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
    (0..archive.len()).into_par_iter().for_each(|i| {
        // Original archive.rs: every file reparses the entire central directory.
        let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
        let mut file = archive.by_index(i).unwrap();
        let out = dest.join(file.name());
        if file.is_dir() {
            fs::create_dir_all(out).unwrap();
        } else {
            fs::create_dir_all(out.parent().unwrap()).unwrap();
            std::io::copy(&mut file, &mut File::create(out).unwrap()).unwrap();
        }
    });
}
fn baseline_compress(source: &Path, dest: &Path) {
    let mut zip = ZipWriter::new(File::create(dest).unwrap());
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9))
        .unix_permissions(0o755);
    for e in walkdir::WalkDir::new(source) {
        let e = e.unwrap();
        let p = e.path();
        let name = p
            .strip_prefix(source.parent().unwrap())
            .unwrap()
            .to_str()
            .unwrap();
        if p.is_dir() {
            zip.add_directory(name, options).unwrap();
        } else {
            zip.start_file(name, options).unwrap();
            std::io::copy(&mut File::open(p).unwrap(), &mut zip).unwrap();
        }
    }
    zip.finish().unwrap();
}
fn verify(source: &Path, extracted: &Path) {
    for e in walkdir::WalkDir::new(source) {
        let e = e.unwrap();
        if !e.file_type().is_file() {
            continue;
        }
        let relative = e.path().strip_prefix(source.parent().unwrap()).unwrap();
        assert_eq!(
            fs::read(e.path()).unwrap(),
            fs::read(extracted.join(relative)).unwrap()
        );
    }
}
fn verify_zip(source: &Path, path: &Path) {
    let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).unwrap();
        if f.is_dir() {
            continue;
        }
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).unwrap();
        assert_eq!(
            bytes,
            fs::read(source.parent().unwrap().join(f.name())).unwrap()
        );
    }
}
fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(f64::total_cmp);
    values[values.len() / 2]
}
fn main() {
    let report = PathBuf::from(std::env::args().nth(1).expect("output JSON path"));
    let root = tempfile::Builder::new()
        .prefix("astra-benchmark-")
        .tempdir_in("/private/tmp")
        .unwrap();
    let engine = Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    };
    let mut cases = Vec::new();
    for scenario in [
        "many-small-2000x4KiB",
        "single-compressible-32MiB",
        "single-mixed-32MiB",
    ] {
        let work = root.path().join(scenario);
        let source = work.join("source");
        fs::create_dir_all(&source).unwrap();
        if scenario.starts_with("many") {
            for i in 0..2000 {
                fs::write(
                    source.join(format!("file-{i:04}.txt")),
                    &format!("ZipLens benchmark file {i:04}\n")
                        .repeat(160)
                        .as_bytes()[..4096],
                )
                .unwrap();
            }
        } else {
            let mut data = vec![0u8; 32 * 1024 * 1024];
            let mut seed = 0x6a09e667f3bcc909u64;
            for (i, byte) in data.iter_mut().enumerate() {
                seed ^= seed << 13;
                seed ^= seed >> 7;
                seed ^= seed << 17;
                *byte = if scenario.contains("mixed") && i % 4096 >= 2048 {
                    seed as u8
                } else {
                    b"ZipLens Astra performance dataset\n"[i % 33]
                };
            }
            fs::write(source.join("data.bin"), data).unwrap();
        }
        let input_bytes: u64 = walkdir::WalkDir::new(&source)
            .into_iter()
            .map(|e| e.unwrap())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.metadata().unwrap().len())
            .sum();
        let zip = work.join("input.zip");
        baseline_compress(&source, &zip);
        let mut extraction = [Vec::new(), Vec::new()];
        let mut compression = [Vec::new(), Vec::new(), Vec::new()];
        let mut sizes = [0; 3];
        // One warm-up then three measurements. Alternate order to reduce cache/order bias.
        for run in 0..4 {
            for variant in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let out = work.join(format!("extract-{run}-{variant}"));
                let now = Instant::now();
                if variant == 0 {
                    baseline_extract(&zip, &out);
                } else {
                    let result = engine
                        .extract(
                            &ExtractRequest {
                                archive: zip.clone(),
                                destination: out.clone(),
                                targets: None,
                                password: None,
                                keep_both: false,
                            },
                            &Context::default(),
                        )
                        .unwrap();
                    assert!(result.failed_files.is_empty());
                }
                let seconds = now.elapsed().as_secs_f64();
                verify(&source, &out);
                fs::remove_dir_all(out).unwrap();
                if run > 0 {
                    extraction[variant].push(seconds);
                }
            }
            for variant in if run % 2 == 0 { [0, 1, 2] } else { [2, 1, 0] } {
                let out = work.join(format!("compress-{variant}.zip"));
                let now = Instant::now();
                if variant == 0 {
                    baseline_compress(&source, &out);
                } else {
                    engine
                        .compress(
                            &CompressionRequest {
                                sources: vec![source.clone()],
                                destination: out.clone(),
                                format: "zip".into(),
                                split_size: None,
                                password: None,
                                encryption: None,
                                level: if variant == 1 { 9 } else { 6 },
                            },
                            &Context::default(),
                        )
                        .unwrap();
                }
                let seconds = now.elapsed().as_secs_f64();
                sizes[variant] = fs::metadata(&out).unwrap().len();
                verify_zip(&source, &out);
                if run > 0 {
                    compression[variant].push(seconds);
                }
            }
        }
        let result = json!({"scenario":scenario,"input_bytes":input_bytes,"extraction_seconds":{"baseline_samples":extraction[0],"astra_samples":extraction[1],"baseline_median":median(extraction[0].clone()),"astra_median":median(extraction[1].clone()),"speedup":median(extraction[0].clone())/median(extraction[1].clone())},"compression_seconds":{"baseline_level9_samples":compression[0],"astra_level9_samples":compression[1],"astra_level6_samples":compression[2],"baseline_level9_median":median(compression[0].clone()),"astra_level9_median":median(compression[1].clone()),"astra_level6_median":median(compression[2].clone())},"zip_bytes":{"baseline_level9":sizes[0],"astra_level9":sizes[1],"astra_level6":sizes[2]}});
        println!("{}", serde_json::to_string(&result).unwrap());
        cases.push(result);
    }
    let metadata = json!({"method":"Original-loop adapters and Astra core; identical codec dependencies; no Tauri/UI; warm cache; 1 warm-up + 3 interleaved repetitions; median; byte-for-byte verification outside timing; /private/tmp", "workers": ziplens_astra_core::zip_engine::worker_count(), "cases": cases});
    fs::write(
        report,
        serde_json::to_string_pretty(&metadata).unwrap() + "\n",
    )
    .unwrap();
}

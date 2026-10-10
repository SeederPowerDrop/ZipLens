//! One operation per process, for warm-cache CPU/RSS measurements on macOS.
//! Usage: resource_probe <extract|zip|7z|tar.gz|tar.zst> <input> <output>
//! Input data generation and byte-for-byte verification belong outside this probe.
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};
use ziplens_astra_core::{CompressionRequest, Context, Engine, ExtractRequest};

#[cfg(target_os = "macos")]
fn usage(who: libc::c_int) -> (f64, i64) {
    let mut value = std::mem::MaybeUninit::<libc::rusage>::uninit();
    // getrusage initializes the complete structure on success.
    assert_eq!(unsafe { libc::getrusage(who, value.as_mut_ptr()) }, 0);
    let value = unsafe { value.assume_init() };
    let seconds = |t: libc::timeval| t.tv_sec as f64 + t.tv_usec as f64 / 1_000_000.0;
    (
        seconds(value.ru_utime) + seconds(value.ru_stime),
        value.ru_maxrss,
    )
}

#[cfg(target_os = "macos")]
fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(args.len(), 4, "operation input output");
    let engine = Engine {
        sidecar: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-tauri/binaries/7zz"),
    };
    let events = Arc::new(AtomicU64::new(0));
    let observed = events.clone();
    let ctx = Context::new(Default::default(), move |_| {
        observed.fetch_add(1, Ordering::Relaxed);
    });
    let before_self = usage(libc::RUSAGE_SELF);
    let before_children = usage(libc::RUSAGE_CHILDREN);
    let start = Instant::now();
    if args[1] == "extract" {
        let report = engine
            .extract(
                &ExtractRequest {
                    archive: args[2].clone().into(),
                    destination: args[3].clone().into(),
                    targets: None,
                    password: None,
                    keep_both: false,
                },
                &ctx,
            )
            .expect("extract");
        assert!(
            !report.cancelled && report.failed_files.is_empty(),
            "{report:?}"
        );
    } else {
        engine
            .compress(
                &CompressionRequest {
                    sources: vec![args[2].clone().into()],
                    destination: args[3].clone().into(),
                    format: args[1].clone(),
                    split_size: None,
                    password: None,
                    encryption: None,
                    level: 6,
                },
                &ctx,
            )
            .expect("compress");
    }
    let wall = start.elapsed().as_secs_f64();
    let after_self = usage(libc::RUSAGE_SELF);
    let after_children = usage(libc::RUSAGE_CHILDREN);
    println!(
        "{}",
        serde_json::json!({
            "operation": args[1], "wall_seconds": wall,
            "cpu_seconds": after_self.0 - before_self.0 + after_children.0 - before_children.0,
            "parent_peak_rss_bytes": after_self.1, "child_peak_rss_bytes": after_children.1,
            "progress_events": events.load(Ordering::Relaxed),
            "worker_limit": ziplens_astra_core::zip_engine::worker_count(),
        })
    );
}

#[cfg(not(target_os = "macos"))]
fn main() {
    panic!("This resource probe measures macOS getrusage counters.");
}

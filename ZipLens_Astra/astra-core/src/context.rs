//! Per-operation cancellation and throttled progress. No GUI dependency is needed in tests.
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub const PREVIEW_LIMIT: u64 = 20 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 1_000_000;
pub const MAX_EXTRACTED_BYTES: u64 = 1024 * 1024 * 1024 * 1024; // 1 TiB, explicit backend limit.

#[derive(Clone, serde::Serialize)]
pub struct Progress {
    pub percent: Option<u8>,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub filename: String,
}

#[derive(Clone)]
pub struct Context {
    pub cancelled: Arc<AtomicBool>,
    bytes: Arc<AtomicU64>,
    total: Arc<AtomicU64>,
    last: Arc<Mutex<Instant>>,
    emit: Arc<dyn Fn(Progress) + Send + Sync>,
}

impl Default for Context {
    fn default() -> Self {
        Self::new(Arc::new(AtomicBool::new(false)), |_| {})
    }
}

impl Context {
    pub fn new(
        cancelled: Arc<AtomicBool>,
        emit: impl Fn(Progress) + Send + Sync + 'static,
    ) -> Self {
        Self {
            cancelled,
            bytes: Arc::new(AtomicU64::new(0)),
            total: Arc::new(AtomicU64::new(0)),
            last: Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1))),
            emit: Arc::new(emit),
        }
    }
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err("CANCELLED".into())
        } else {
            Ok(())
        }
    }
    pub fn set_total(&self, total: u64) {
        self.total.store(total, Ordering::Relaxed);
        self.bytes.store(0, Ordering::Relaxed);
    }
    pub fn progress(&self, name: &str, done: bool) {
        let mut last = self.last.lock().unwrap();
        if !done && last.elapsed() < Duration::from_millis(80) {
            return;
        }
        *last = Instant::now();
        let bytes = self.bytes.load(Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);
        (self.emit)(Progress {
            percent: if done {
                Some(100)
            } else if total == 0 {
                None
            } else {
                Some(((bytes as f64 / total as f64) * 95.0).min(95.0) as u8)
            },
            processed_bytes: bytes,
            total_bytes: total,
            filename: name.into(),
        });
    }
    pub fn advance(&self, bytes: u64, name: &str) {
        self.bytes.fetch_add(bytes, Ordering::Relaxed);
        self.progress(name, false);
    }
    /// Limit actual decoded bytes as well as header sizes. Read through EOF to check CRCs.
    pub fn copy(
        &self,
        reader: &mut impl Read,
        writer: &mut impl Write,
        name: &str,
        limit: u64,
    ) -> Result<u64, String> {
        let mut buf = vec![0; 256 * 1024];
        let mut written = 0u64;
        loop {
            self.check()?;
            let n = reader.read(&mut buf).map_err(|e| format!("{name}: {e}"))?;
            if n == 0 {
                break;
            }
            written = written
                .checked_add(n as u64)
                .ok_or("Decoded size overflow")?;
            if written > limit {
                return Err(format!("{name}: decoded data exceeds size limit"));
            }
            writer
                .write_all(&buf[..n])
                .map_err(|e| format!("{name}: {e}"))?;
            let total = self
                .bytes
                .fetch_add(n as u64, Ordering::Relaxed)
                .saturating_add(n as u64);
            if total > MAX_EXTRACTED_BYTES {
                return Err("Operation exceeds 1 TiB limit".into());
            }
            self.progress(name, false);
        }
        Ok(written)
    }
}

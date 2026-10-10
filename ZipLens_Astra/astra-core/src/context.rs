//! 한 작업의 취소·진행률·바이트 제한을 관리합니다. GUI에 의존하지 않아 같은 경로를 CLI와 테스트에서 사용합니다.
//! `Context`를 clone하면 상태도 공유합니다. 독립 작업에는 새 인스턴스를 만들어야 합니다.
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

/// UI/CLI로 보내는 작업 진행률. 처리 중 바이트 총량을 모르면 `percent`는 `None`입니다.
#[derive(Clone, serde::Serialize)]
pub struct Progress {
    pub percent: Option<u8>,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub filename: String,
}

/// 협력적 취소 토큰과 공유 진행 상태. 긴 루프는 [`Self::check`]를 반복 호출해야 합니다.
/// 콜백은 작업 스레드에서 호출되므로 UI 갱신은 호출자가 이벤트 등으로 전달합니다.
#[derive(Clone)]
pub struct Context {
    pub cancelled: Arc<AtomicBool>,
    processed_bytes: Arc<AtomicU64>,
    total_bytes: Arc<AtomicU64>,
    last_progress_at: Arc<Mutex<Instant>>,
    emit_progress: Arc<dyn Fn(Progress) + Send + Sync>,
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
            processed_bytes: Arc::new(AtomicU64::new(0)),
            total_bytes: Arc::new(AtomicU64::new(0)),
            last_progress_at: Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1))),
            emit_progress: Arc::new(emit),
        }
    }
    /// GUI/CLI와 helper가 공유하는 오류 표식 `CANCELLED`를 반환합니다. 표식을 번역하지 않습니다.
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err("CANCELLED".into())
        } else {
            Ok(())
        }
    }
    /// 새 단계를 시작하며 누적 바이트를 0으로 초기화합니다. 총량 0은 계산 불가를 뜻합니다.
    pub fn set_total(&self, total: u64) {
        self.total_bytes.store(total, Ordering::Relaxed);
        self.processed_bytes.store(0, Ordering::Relaxed);
    }
    /// 일반 진행 이벤트는 최소 80ms 간격, `done`은 즉시 알립니다.
    /// 처리 중에는 95%까지만 표시해 검증·이동 단계를 남겨 둡니다. 성공 여부는 별도 결과로 판단합니다.
    pub fn progress(&self, name: &str, done: bool) {
        let mut last = self.last_progress_at.lock().unwrap();
        if !done && last.elapsed() < Duration::from_millis(80) {
            return;
        }
        *last = Instant::now();
        let bytes = self.processed_bytes.load(Ordering::Relaxed);
        let total = self.total_bytes.load(Ordering::Relaxed);
        (self.emit_progress)(Progress {
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
        self.processed_bytes.fetch_add(bytes, Ordering::Relaxed);
        self.progress(name, false);
    }
    /// 헤더와 별도로 실제 복사 바이트도 제한합니다. EOF까지 읽어야 디코더의 마지막 무결성 오류도 받습니다.
    /// 블록마다 취소를 확인하지만, 진행 중인 단일 `read`/`write` 호출 자체를 중단하지는 않습니다.
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
                .processed_bytes
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

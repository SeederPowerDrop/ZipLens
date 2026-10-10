//! ALZ/EGG 디코더는 별도 프로세스에서 실행합니다. 디코더 내부가 취소 토큰을 확인하지 않아도
//! 부모가 프로세스를 종료할 수 있습니다. 이 분리는 운영체제 sandbox를 구성하지 않습니다.
use crate::{paths, Context, Engine, Entry};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub(crate) const MESSAGE_LIMIT: u64 = 32 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
pub(crate) struct Request {
    pub archive: PathBuf,
    pub destination: Option<PathBuf>,
    pub targets: Option<Vec<String>>,
    pub password: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct Response {
    pub entries: Vec<Entry>,
    pub source_paths: Vec<PathBuf>,
    pub error: Option<String>,
}

pub(crate) fn supports(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("alz" | "egg")
    )
}

impl Engine {
    fn run_legacy(&self, request: Request, ctx: &Context) -> Result<Response, String> {
        ctx.check()?;
        let input = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
        if input.len() as u64 > MESSAGE_LIMIT {
            return Err("ALZ/EGG selection exceeds metadata limit".into());
        }
        let helper = self.sidecar.with_file_name(if cfg!(windows) {
            "ziplens-legacy.exe"
        } else {
            "ziplens-legacy"
        });
        let mut child = Command::new(&helper)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Cannot start bundled ALZ/EGG engine: {e}"))?;
        let mut stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        // 요청 전송과 두 출력 읽기를 분리해 큰 JSON 때문에 파이프가 서로 막히지 않게 합니다.
        let send = thread::spawn(move || stdin.write_all(&input));
        let out = thread::spawn(move || crate::sidecar::collect(stdout));
        let err = thread::spawn(move || crate::sidecar::collect(stderr));
        let started = Instant::now();
        ctx.set_total(0);
        ctx.progress("ALZ / EGG", false);
        // 10분 제한은 이 ALZ/EGG helper의 정책입니다. 취소와 시간 초과는 호출자에게 구별해 알립니다.
        let mut timed_out = false;
        let status = loop {
            if ctx.check().is_err() || started.elapsed() > Duration::from_secs(600) {
                timed_out = ctx.check().is_ok();
                // kill만 호출하면 자식 회수가 끝나지 않으므로 wait까지 수행합니다.
                let _ = child.kill();
                break child.wait();
            }
            match child.try_wait() {
                Ok(Some(s)) => break Ok(s),
                Ok(None) => thread::sleep(Duration::from_millis(40)),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(e);
                }
            }
        };
        let sent = send.join().map_err(|_| "ALZ/EGG request writer failed")?;
        let (output, clipped) = out
            .join()
            .map_err(|_| "ALZ/EGG response reader failed")?
            .map_err(|e| e.to_string())?;
        let (_, clipped_error) = err
            .join()
            .map_err(|_| "ALZ/EGG error reader failed")?
            .map_err(|e| e.to_string())?;
        ctx.check()?;
        if timed_out {
            return Err("ALZ/EGG operation exceeded the 10-minute processing limit".into());
        }
        if clipped || clipped_error {
            return Err("ALZ/EGG engine exceeded metadata limit".into());
        }
        let status = status.map_err(|e| e.to_string())?;
        let mut response: Response = serde_json::from_slice(&output)
            .map_err(|_| "ALZ/EGG engine stopped without a valid result".to_string())?;
        if let Some(error) = response.error.take() {
            return Err(error);
        }
        sent.map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("ALZ/EGG engine failed; no files were published".into());
        }
        paths::validate_entries(&response.entries)?;
        Ok(response)
    }

    pub(crate) fn legacy_preview(
        &self,
        archive: &Path,
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Entry>, String> {
        self.run_legacy(
            Request {
                archive: fs::canonicalize(archive).map_err(|e| e.to_string())?,
                destination: None,
                targets: None,
                password: password.map(str::to_owned),
            },
            ctx,
        )
        .map(|response| response.entries)
    }

    pub(crate) fn legacy_extract(
        &self,
        archive: &Path,
        destination: &Path,
        selected: &[Entry],
        password: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<PathBuf>, String> {
        let response = self.run_legacy(
            Request {
                archive: archive.into(),
                destination: Some(destination.into()),
                targets: Some(selected.iter().map(|e| e.path.clone()).collect()),
                password: password.map(str::to_owned),
            },
            ctx,
        )?;
        for entry in selected {
            let output = destination.join(paths::relative(&entry.path)?);
            let meta = fs::symlink_metadata(&output).map_err(|e| format!("{}: {e}", entry.path))?;
            if meta.is_symlink()
                || (entry.is_dir && !meta.is_dir())
                || (!entry.is_dir && (!meta.is_file() || meta.len() != entry.size))
            {
                return Err(format!("{}: unexpected ALZ/EGG extracted file", entry.path));
            }
        }
        Ok(response.source_paths)
    }
}

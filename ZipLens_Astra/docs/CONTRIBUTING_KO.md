# ZipLens 기여 및 업데이트 안내

이 문서는 공부용 수정부터 다음 앱 업데이트까지 같은 소스를 다룰 때의 작업 안내입니다. 먼저 [코드 읽기 안내](CODE_GUIDE_KO.md)에서 담당 모듈을 찾으세요. 아래 명령은 **저장소 루트에서 `cd ZipLens_Astra`를 실행한 뒤** 사용합니다. 루트에 보존된 1.x 프로젝트와 혼동하지 않습니다.

## 1. 변경 전 기준을 남기기

`git status --short`와 현재 브랜치를 확인하고, 기존 수정과 이번 변경을 구분합니다. 새 작업이라면 저장소 루트에서 `git switch -c codex/describe-your-change`처럼 목적이 드러나는 브랜치를 만듭니다. 이미 수정 중인 파일을 덮어쓰거나 빌드 문제를 해결하려고 다른 변경을 초기화하지 않습니다.

이미 공개한 `v2.1.1` 태그와 릴리스 파일은 그 버전의 기록입니다. 공부용 리팩터링은 [CHANGELOG](../CHANGELOG.md)의 **Unreleased**에 기록하고, 배포 결정을 내리기 전에는 새 버전 번호를 임의로 붙이지 않습니다. 실제 새 버전을 낼 때 새 태그·앱·대응 소스를 함께 준비합니다.

macOS, Xcode Command Line Tools, Rust/Cargo 1.89 이상, Python 3.11 이상과 Node.js가 필요합니다. 이번 유지보수에서 확인한 Node 버전은 **24.11.1**입니다. `npm test`는 Node의 `--experimental-strip-types`와 소스의 import 문법을 지원하는 런타임을 사용하므로 Vite의 최소 Node 요구사항만으로 테스트 실행 가능 여부를 판단하지 않습니다. 실패하면 먼저 `node --version`, `rustc --version`, `python3 --version`을 기록하고 도구 오류와 코드 오류를 구분하세요.

```sh
cd ZipLens_Astra
npm ci
cargo fetch --manifest-path astra-core/Cargo.toml --locked
cargo fetch --manifest-path src-tauri/Cargo.toml --locked
python3 scripts/prepare-distribution.py
```

처음 의존성을 받는 단계에는 네트워크가 필요할 수 있습니다. `prepare-distribution.py`는 동봉한 7-Zip·대응 소스의 해시, 자체 라이선스, 생성된 외부 구성요소 고지를 검사하고 `ziplens-legacy`를 빌드합니다. 고지 불일치는 검사를 끄는 방식으로 넘기지 말고 아래의 의존성 갱신 절차로 해결합니다. 전체 빌드 조건은 [앱 README](../README.md#실행과-빌드)에 있습니다.

## 2. 이름과 주석의 기준

코드 식별자는 기존 TypeScript의 `camelCase`, Rust의 `snake_case` / 타입 `PascalCase`를 따르는 **영어 이름**을 사용합니다. 한국어 설명은 팀이 판단 이유를 이해하는 데 도움이 되는 곳에 붙입니다. 쉬운 한 줄 코드를 그대로 번역하는 주석보다, 변경 시 깨질 수 있는 계약을 적습니다.

| 대상 | 좋은 기준 | 실제 예 |
|---|---|---|
| 함수 | 동작과 대상을 함께 표현 | `snapshotExtraction`, `classifyInputPaths`, `begin_archive_operation` |
| 상태 | 어떤 데이터인지, 어떤 단계인지 표현 | `loadedArchivePath`, `archiveDirectory`, `isHandlingStartupAction` |
| 같은 작업의 단계 | 사용자가 시작하는 함수와 이미 gate 안에서 실행하는 함수를 구분 | `startCompression` → `executeCompression` |
| 경로 | 호스트 파일 경로와 압축 내부의 상대 이름을 구분 | `archivePath` / `targetFiles`, `destination` / `Entry.path` |
| 주석 | 대기·실패·소유권·보호 조건의 이유 설명 | “목적지 대화상자 전 선택을 복사해야 Finder 요청이 대상을 바꾸지 않는다.” |

새 주석에는 필요에 따라 입력 조건, 부수 효과, 반환값의 의미, 오류/취소 시 남을 수 있는 결과를 적습니다. Rust 공개 타입·함수는 `///`, 모듈의 책임은 `//!`, TypeScript의 호출 계약은 `/** ... */`를 사용합니다. 임시 메모를 남길 때는 “나중에 정리” 대신 해결할 조건과 연결된 이슈를 남기세요.

이름을 바꿀 때는 정의뿐 아니라 호출자·테스트·문서를 검색합니다. IPC 문자열(`extract_archive` 등), Tauri 이벤트, DOM ID, JSON 필드, CLI 옵션, 오류 코드, 앱 식별자와 저장된 설정 키는 호환성 경계입니다. **내부 이름 개선과 공개 계약 변경을 섞지 않습니다.** 기존 짧은 공개 API를 전부 길게 바꾸거나 모든 줄에 주석을 붙일 필요도 없습니다.

## 3. 자주 하는 수정

### 번역이나 UI 문구 수정

[`src/i18n.ts`](../src/i18n.ts)의 영어 원본 키와 모든 언어의 메시지를 함께 확인합니다. `{count}`, `{name}`, `{error}` 같은 치환자를 보존합니다. `satisfies` 타입 검사와 [`tests/i18n.test.ts`](../tests/i18n.test.ts)가 누락·잘못된 키와 치환자 문제를 찾는 데 도움을 줍니다. 정보창은 [`about.ts`](../src/about.ts), 오프라인 사용법은 [`user-guide.ts`](../src/user-guide.ts), 렌즈 설명은 [`lens-explorer-copy.ts`](../src/lens-explorer-copy.ts)에 별도 내용이 있습니다.

새 언어를 추가할 때는 `supportedLanguages`만 늘리지 않습니다. 해당 내용과 [`file-associations.ts`](../src/file-associations.ts)의 설정창, [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs)의 `set_menu_language`, 각 테스트의 언어 목록도 확인합니다. 화면에서는 짧은 창, 긴 번역, 키보드 이동, 아랍어 RTL과 동작 줄이기를 확인하세요. 운영체제가 제공하는 버튼·표준 메뉴는 앱 번역과 별개입니다.

사용자 파일명·오류문·압축 내용은 표시할 데이터입니다. 동적 텍스트는 `textContent` 또는 기존 이스케이프 규칙을 따라야 하며 번역용 HTML과 섞어 삽입하지 않습니다. CSV 내보내기는 [`csvCell`](../src/archive-model.ts)의 수식 실행 방지 처리를 유지합니다.

### 압축 형식·엔진 수정

먼저 “새 확장자 별칭”인지 “새 압축 방식 구현”인지 구분합니다. 인식 목록은 [`tauri.conf.json`](../src-tauri/tauri.conf.json)의 `bundle.fileAssociations`를 화면과 네이티브가 공유합니다. 목록에 추가했다고 엔진 지원이 생기지 않습니다. `Engine`의 형식 분기와 stream/ZIP/TAR/sidecar 경로를 살피고 실제로 생성한 작은 fixture로 목록·내용 읽기·전체 및 선택 해제·손상 파일·기존 출력 보존을 확인합니다.

생성 형식은 [`compress.rs`](../astra-core/src/compress.rs), 화면 설정인 [`index.html`](../index.html), CLI의 `FORMATS`·목적지 확장자 검증·`capabilities`, 문서를 함께 확인합니다. 암호·분할 옵션의 유효성도 각각 점검합니다. 기존 회귀 테스트의 임시 디렉터리 패턴을 재사용하되 개인 자료나 출처 불명인 큰 파일을 fixture로 넣지 않습니다.

### 비동기 흐름 수정

대화상자를 띄우기 전에 선택과 옵션을 고정하고, `ArchiveActionGate`는 결과창 종료까지 소유합니다. 이미 gate 안에 있는 코드가 다시 gate를 획득하려 하면 실행이 건너뛰어질 수 있으므로 진입 함수와 실행 함수를 구분합니다. native `ArchiveOperationGuard`를 UI gate 대신 쓰거나 `isProcessing`만으로 대기 상태를 판단하지 않습니다.

해제 결과의 성공·일부 실패·취소를 모두 유지합니다. 시간이 초과됐거나 취소됐어도 저장한 파일이 있을 수 있습니다. GUI는 결과 보고서를, CLI는 `result.output_paths`를 보존해야 합니다. 이 부분을 고칠 때는 [`action-session.test.ts`](../tests/action-session.test.ts), [`password-dialog.test.ts`](../tests/password-dialog.test.ts), 코어 publication 테스트를 함께 읽으세요.

## 4. 공부용 샘플로 실행해 보기

화면 실습은 직접 만든 작은 텍스트 파일로 시작합니다. 폴더 이름을 `sample.zip`으로 바꿔 선택했을 때 압축 목록 대신 생성 설정이 열리는지, 압축 파일과 일반 파일을 함께 선택하면 입력이 유지되는지 관찰하고 `classifyInputPaths`의 분기와 연결해 보세요. 암호·충돌 대화상자 중 다른 압축 파일을 Finder에서 열어 보고, 기존 작업을 마친 뒤 대기 요청이 처리되는지도 확인할 수 있습니다.

아래 실습은 **직접 빌드·포장한 앱**을 사용합니다. 임시 폴더에 한글 텍스트를 만들고 두 번 압축한 다음 목록·해제·중복 이름 보존·원본 보존을 확인합니다. `TemporaryDirectory`가 끝나면 실습 파일을 정리하며 개인 파일이나 설치 앱을 바꾸지 않습니다.

```sh
python3 - <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess

binary = (Path.cwd() / "release_build/preview/ZipLens.app/Contents/MacOS/ziplens").resolve()
assert binary.is_file(), "먼저 아래 앱 빌드·포장 명령을 실행하세요."

def invoke(*arguments):
    completed = subprocess.run(
        [str(binary), "cli", *map(str, arguments)],
        stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30,
    )
    response = json.loads(completed.stdout)
    assert completed.returncode == 0 and response["ok"], response
    assert response["schema_version"] == 1
    return response["result"]

with TemporaryDirectory(prefix="ziplens-study-") as directory:
    root = Path(directory)
    source = root / "sample"
    source.mkdir()
    original = "ZipLens 공부용 한글 파일\n".encode("utf-8")
    (source / "hello.txt").write_bytes(original)
    requested = root / "study.zip"
    first = invoke("compress", source, "--destination", requested, "--format", "zip")
    second = invoke("compress", source, "--destination", requested, "--format", "zip")
    assert first["output_paths"] != second["output_paths"]
    archive = Path(first["output_paths"][0])
    listing = invoke("list", archive)
    assert any(item["path"] == "sample/hello.txt" for item in listing["entries"])
    report = invoke("extract", archive, "--destination", root / "restored")
    restored = [Path(path) for path in report["output_paths"]]
    assert len(restored) == 1 and restored[0].read_bytes() == original
    assert (source / "hello.txt").read_bytes() == original
    print("목록·압축·해제·중복 이름·원본 보존 확인 완료")
PY
```

다음 연습으로 [`tests/ui-model.test.ts`](../tests/ui-model.test.ts)의 복합 확장자 사례와 [`tests/action-session.test.ts`](../tests/action-session.test.ts)의 선택 snapshot 사례를 설명해 보세요. 이후 실제로 바꾸려는 동작 하나에 대해서만 기대 결과를 추가합니다. [`publication_links.rs`](../astra-core/tests/publication_links.rs)는 실패한 파일 때문에 링크가 기존의 다른 파일을 가리키지 않게 하는 이유를 공부하기 좋습니다. 위험한 경로·링크 실험은 이 테스트의 `TempDir` 안에서만 확장하세요.

## 5. 바꾼 부분에 맞는 검증

아래 표의 명령은 모두 `ZipLens_Astra/`에서 실행합니다. 먼저 변경한 계층을 검사하고, 엔진·어댑터·의존성처럼 배포 동작에 영향을 주는 변경은 앱 빌드와 실제 CLI 검사까지 진행합니다. 주석·문서만 바꿨다면 링크·심볼·명령이 맞는지 확인하고 필요 없는 장시간 실행을 반복하지 않습니다.

| 변경 대상 | 명령 | 확인하는 범위 |
|---|---|---|
| 화면 모델·번역·상태 | `npm test` | `tests/*.test.ts`의 순수 모델 및 모의 DOM 검사. 실제 macOS GUI 조작 전체는 아닙니다. |
| 화면 타입·번들 | `npm run build` | TypeScript 검사와 Vite 프로덕션 빌드. 네이티브 앱 빌드는 아닙니다. |
| 코어 | `cargo test --manifest-path astra-core/Cargo.toml --locked` | 형식·경로·원본·링크·취소·압축 회귀. 먼저 보조 프로그램을 준비합니다. |
| Tauri 어댑터·CLI 인수 | `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked` | 네이티브 연결·시작 요청과 CLI 단위 검사. macOS 준비가 필요합니다. |
| 코어 정적 검사 | `cargo clippy --manifest-path astra-core/Cargo.toml --all-targets --locked -- -D warnings` | 코어 및 테스트의 컴파일·Clippy 진단 |
| 패키지 절차 | `python3 scripts/test-package-macos.py` | 보조 프로그램·ZIP 왕복·실패 시 보존. Apple 서비스 호출은 모의 검사이며 실제 공증이 아닙니다. |
| 실제 빌드 앱 CLI | `python3 scripts/test-cli.py --binary "release_build/preview/ZipLens.app/Contents/MacOS/ziplens"` | 창 없는 실행, JSON, 오류 코드, 형식 왕복·암호·충돌·원본 보존 |

한 계층의 실패를 조사할 때는 테스트 이름을 좁혀 실행할 수 있습니다. 예를 들어 경로 보호 변경은 다음처럼 확인합니다.

```sh
cargo test --manifest-path astra-core/Cargo.toml --locked --test source_protection
cargo test --manifest-path astra-core/Cargo.toml --locked --test publication_links
```

실제 앱 빌드와 로컬 포장:

```sh
npm run tauri build -- --bundles app
python3 scripts/package-macos.py --preview
python3 scripts/test-cli.py --binary "release_build/preview/ZipLens.app/Contents/MacOS/ziplens"
```

표준 결과는 `src-tauri/target/release/bundle/macos/ZipLens.app`, 검증된 포장 복사본은 `release_build/preview/ZipLens.app`입니다. 위 명령은 `/Applications`의 설치 앱을 교체하지 않습니다. 방금 바꾼 코드가 들어간 파일을 검사하는지 경로를 확인하세요. GUI 변경은 이 앱에서 해당 동작을 직접 확인하고, 실제로 확인한 운영체제·CPU·동작만 검증 기록에 씁니다. 자동 테스트 수나 통과 사실을 이전 릴리스에서 복사하지 않습니다.

## 6. 의존성·생성 파일·배포 자료

[`package-lock.json`](../package-lock.json), [`astra-core/Cargo.lock`](../astra-core/Cargo.lock), [`src-tauri/Cargo.lock`](../src-tauri/Cargo.lock)은 의도한 의존성 해석 결과입니다. 수정한 의존성의 lockfile만 관리 도구로 갱신하고 차이를 검토합니다. 문제를 피하려고 lockfile을 지우거나 광범위하게 업데이트하지 않습니다.

Rust 도구 체인이나 배포 대상·의존성이 바뀌면 설치·fetch 후 구성요소 고지를 다시 생성합니다. 아래는 Apple Silicon 예이며 Intel은 실제 빌드 대상에 맞춰 `x86_64-apple-darwin`을 사용합니다.

```sh
python3 scripts/generate-third-party-notices.py --target aarch64-apple-darwin
python3 scripts/generate-third-party-notices.py --check --target aarch64-apple-darwin
python3 scripts/prepare-distribution.py --target aarch64-apple-darwin
```

`legal/third-party`의 고지·목록·필요한 대응 소스는 생성 결과를 검토해 반영합니다. 수동으로 해시만 맞추거나 빠진 원문을 추측해 만들지 않습니다. `legal/third-party/supplements.json`은 검토된 보충 자료입니다. 7-Zip을 바꾸면 원본 배포 파일과 소스, [`docs/sidecar-provenance.json`](sidecar-provenance.json), 라이선스 자료를 함께 확인해야 합니다. 자세한 항목은 [배포 안내](DISTRIBUTION_KO.md)에 있습니다.

`dist/`, 각 `target/`, `src-tauri/binaries/`, `release_build/`, `node_modules/`는 준비·빌드 결과이므로 소스 변경으로 커밋하지 않습니다. 반대로 `legal/`의 추적된 생성 고지는 배포 입력입니다. “생성 파일”이라는 이유로 함께 삭제하지 마세요.

제품명·화면 버전은 [`app-info.ts`](../src/app-info.ts)가 `tauri.conf.json`에서 읽습니다. 실제 버전 업데이트에서는 `package.json`과 npm lock metadata, Tauri 설정, 앱 Cargo manifest와 lock metadata, 릴리스 문서가 맞는지 확인합니다. `astra-core` crate 버전과 macOS `bundleVersion`은 역할이 달라 앱 표시 버전과 무조건 같은 문자열로 치환하지 않습니다. 앱 식별자 변경도 버전 업데이트와 별개의 결정입니다.

프리뷰의 ad-hoc 서명은 Apple Developer ID 서명·공증과 다릅니다. 정식 배포는 [기존 배포 절차](DISTRIBUTION_KO.md)를 따릅니다. 배포할 실행 파일과 대응 소스·체크섬은 같은 소스 상태에서 준비하고, 배포 후 문서의 “최신 버전” 링크를 갱신합니다. 라이선스와 후원 안내는 [README](../README.md#라이선스와-후원)를 기준으로 유지합니다.

## 7. 변경 설명 남기기

리뷰 설명에는 사용자가 만나는 문제, 바뀐 동작, 수정한 경계와 실제 검증을 적습니다. 리팩터링이면 “동작 유지”가 무엇을 뜻하는지 구체적으로 적으세요. 예: “대화상자 전 선택 고정과 결과창까지의 작업 잠금을 유지하면서 내부 함수명을 단계에 맞게 정리했다.” 실패하거나 실행하지 못한 검사는 완료로 쓰지 않습니다.

공개 문서에는 재현 가능한 샘플·코드 구조·사용법·검증 요약을 남깁니다. 개인 파일 경로, 암호, 키, 개인 자료 내용이나 원시 개발 기록을 fixture·로그·스크린샷으로 함께 커밋하지 않습니다. 후배가 같은 문제를 이해할 수 있도록 복잡한 판단은 해당 코드 가까이에, 전체 구조는 이 안내에 남깁니다.

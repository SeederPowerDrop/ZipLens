# ZipLens 검증 요약

이 문서는 공개 앱과 개발 소스의 확인 범위 및 재현 명령을 정리합니다. 과거 검사 결과와 새 배포본의 검사를 구분하며, 통과한 검사 수를 전체 형식의 호환성 보증으로 해석하지 않습니다.

## 소스 품질 점검 — 2026-10-18 (Unreleased)

다음은 2.1.1 이후 **미배포 소스 변경**의 검사입니다. 이미 설치한 앱과 공개 `v2.1.1` 파일을 이 변경으로 교체했다는 뜻은 아닙니다. 원시 실행 로그와 개발 기록은 비공개 보관하고, 여기에는 재현 가능한 범위와 확인한 결과만 남깁니다.

자동 검사 **196개가 모두 통과**했습니다. 아래 합계에 수동 GUI 확인이나 과거 릴리스의 검사 횟수는 포함하지 않습니다.

| 검사 | 통과 |
|---|---:|
| 프런트엔드 회귀 | 65 |
| 압축 엔진 | 68 |
| Tauri/Rust 라이브러리 | 22 |
| 패키징 회귀 | 21 |
| 새로 빌드한 앱의 CLI | 20 |

TypeScript·Vite 프로덕션 화면 빌드와 코어의 `cargo clippy --all-targets -- -D warnings`도 통과했습니다. 패키징 회귀의 Apple 서비스 호출은 모의 검사이며 실제 서명·공증 승인을 뜻하지 않습니다. CLI 검사는 이번 소스로 만든 임시 디버그 앱에서 실행했습니다.

추가한 검사에는 다음이 포함됩니다.

- `a.txt` / `nested/a.txt`의 보고서 크기 구분, 실제 출력 경로, 이름이 바뀐 결과의 불확실한 크기, CSV 인용·수식 방지, 전체 TXT·CSV 내보내기.
- 실제 결과창 함수를 모의 DOM에서 실행해 실패 100,000건이 목록 50개와 나머지 개수로 표시되고, CSV에는 100,000건 모두 남으며 결과창을 닫을 때 대기가 끝나는지 확인. 실제 macOS GUI 전체 검사와는 구분합니다.
- 보고서 메타데이터 100,000건에서 원본 접근 수가 선형 범위인지 확인. 경과 시간을 테스트 통과 조건으로 사용하지 않습니다.
- ZIP64 항목 **65,537개**의 목록과 마지막 항목 선택 해제, Unicode 조합 방식이 다른 이름의 압축 충돌 거부, FIFO·디렉터리 입력 거부와 일반 파일을 가리키는 심볼릭 링크 허용. ZIP64 검사는 작은 항목으로 개수 경계를 확인했으며 대용량 파일 처리량 검사는 아닙니다.

### 보고서 모델 측정

Node.js 24.11.1, macOS Apple Silicon에서 보고서 크기 조회를 측정했습니다. 1,000건 준비 실행 후 각 조건을 3회 실행하고 중앙값을 기록했습니다. 각 측정 전 GC를 호출하고, 결과 개수와 크기 합계가 같은지도 확인했습니다.

| 항목 수 | 이전 접미사 전체 검색 | 개선한 인덱스 기반 보고서 모델 |
|---:|---:|---:|
| 10,000 | 3,365.299ms | 11.596ms |
| 100,000 | 측정하지 않음 | 134.724ms |

공개 재현 스크립트의 별도 실행에서는 10,000건 중앙값이 2,482.790ms → 6.207ms, 개선 후 100,000건은 69.451ms였습니다. 시스템 부하와 캐시에 따라 절대 시간은 달라지므로 특정 배수의 앱 전체 가속을 보장하지 않습니다.

입력은 `folder/item-000000.txt`부터 시작하는 고유 경로와 순차 크기이며, 모든 항목이 성공한 보고서를 사용했습니다. 이전 코드는 결과마다 `entries.find(entry => path.endsWith(entry.path))`를 실행하여 10,000건에서 50,005,000회 비교합니다. 개선 코드는 [`buildReportRows`](../src/report-model.ts)로 한 번 인덱싱합니다. 이 값은 **순수 메타데이터 모델의 시간**이며 DOM 렌더링, 파일 저장, 압축·해제 처리량이나 앱 전체 속도를 뜻하지 않습니다. 100,000건의 이전 코드 시간을 추정값으로 보고하지 않습니다.

변경한 부분만 다시 확인하려면 `ZipLens_Astra/`에서 실행합니다. 전체 빌드·패키징·CLI 명령은 아래 [재현 명령](#재현-명령)에 있습니다.

```sh
node --experimental-strip-types --test tests/report-model.test.ts tests/report-dialog.test.ts
cargo test --manifest-path astra-core/Cargo.toml --locked --test regressions
cargo test --manifest-path astra-core/Cargo.toml --locked --test zip64
node --experimental-strip-types --expose-gc scripts/benchmark-reports.mjs
```

[`benchmark-reports.mjs`](../scripts/benchmark-reports.mjs)는 위 측정 방법을 재현해 stdout에 JSON 결과를 출력합니다. 실행 환경과 부하에 따라 시간은 달라집니다. 원시 측정 기록은 비공개 개발 자료로 보관합니다.

### 실제 GUI 확인과 남은 범위

이번 소스로 만든 **임시 디버그 앱**에서 네이티브 파일 선택창 → 스마트 해제 → 결과 상세 → CSV 저장을 직접 조작했습니다. 직접 만든 `a.txt` 1바이트와 `nested/a.txt` 900바이트가 올바른 크기와 절대 출력 경로로 내보내지는지, CSV 수식 방지 처리와 실제 해제 바이트가 맞는지 확인했습니다. 이는 해당 흐름의 GUI 확인이며 새 릴리스·설치 프로그램·전체 GUI 검증은 아닙니다.

설치되어 있던 2.1.1 앱에서는 파일 선택창·목록·Unicode 이름의 파일 3개와 빈 폴더 해제·중복 이름 보존을 별도로 확인했습니다. 이 관찰은 위 디버그 앱 검사와 구분합니다.

이번 점검은 이 Apple Silicon Mac에서 수행했습니다. Intel Mac과 다른 장비·macOS 버전의 실행, 외장 디스크 연결 해제, 저장 공간 부족 상황은 추가 실전 확인이 필요합니다. 특정 macOS 버전 전체와 모든 파일 시스템·압축 변종을 보증하지 않습니다.

## 2.1.1 배포본 검사 — 2026-10-11

이번 소스로 다시 실행한 자동 검사 **181개가 모두 통과**했습니다. 과거 실전 검사 횟수는 이 합계에 포함하지 않습니다.

| 검사 | 통과 |
|---|---:|
| 프런트엔드 회귀 | 56 |
| 압축 엔진 | 64 |
| Tauri/Rust 라이브러리 | 22 |
| 패키징 회귀 | 21 |
| 빌드된 앱의 CLI | 18 |

패키징 회귀에는 앱 라이선스 문서 누락·빈 파일·GPL 사본 불일치 거부, 최종 ZIP의 라이선스 포함, 서명·공증 실패 시 기존 결과물 보존을 포함합니다. Apple 서비스 응답을 모의하는 단위 검사를 실제 공증 승인으로 취급하지 않습니다.

최적화 Tauri 앱 빌드와 Apple Silicon용 ad-hoc 프리뷰 패키징을 완료했습니다. 앱 282개 파일 중 라이선스 자료는 266개입니다. ZIP CRC, 실제 재추출 후 파일 바이트·실행 권한, 앱의 deep/strict 서명 및 재추출 앱 서명, 보조 프로그램 아키텍처와 준비된 실행 파일의 일치를 확인했습니다.

- 파일: `ZipLens_2.1.1_arm64-preview.zip`
- 크기: **18,066,233바이트**
- SHA-256: `fa674efc9a2cee87e1c9ad163cdd0c77989fb4761a9f6718a02ad83cd4cfe43a`

이번 검사는 GUI의 실제 조작이나 설치 완료 확인을 포함하지 않습니다. Apple Developer ID 서명·공증·Gatekeeper 승인은 완료하지 않았습니다.

설치본의 기본 화면·2.1.1 버전 표시·정보창의 후원 링크와 내장 한국어 사용 가이드도 실제 화면에서 확인했습니다. 전체 GUI 작업 흐름 검사를 뜻하지 않습니다.

## 실제 이미지 왕복 검사 — 2026-10-10

Apple Silicon, macOS 15.7.5의 2.1.1 앱 실행 파일에서 GUI와 같은 엔진을 사용하는 CLI로 검사했습니다. DNG 728개와 HEIC 1개, 총 **729개 / 26,583,788,836바이트(26.58GB)**를 다섯 ZIP 묶음으로 압축·해제했습니다.

- 모든 해제본의 파일명·크기·SHA-256이 원본과 일치했습니다. 작업 전후 원본의 해시와 파일 목록·크기·수정 시각·권한도 유지되었습니다.
- 5개 ZIP 중 4개에서 중앙 디렉터리 오프셋이 4GiB를 넘었습니다. 그중 5.61GB ZIP64의 첫 항목과 4GiB 이후 마지막 항목은 Python 표준 ZIP 디코더로도 독립 복원하여 해시를 대조했습니다.
- 실제 이미지 표본으로 7Z·TAR·TAR.GZ·TAR.ZST 왕복, AES-256 ZIP의 암호 없음·오류 거부와 정상 복원을 확인했습니다. 선택 해제와 같은 목적지의 중복 파일 보존도 확인했습니다.
- 실전 왕복 검사 **10묶음**, 당시 프런트엔드 **56개**, 앱 CLI **18개**가 각각 통과했습니다.
- 전체 ZIP 출력은 약 **24.94GB**로, 입력보다 약 **6.20%** 작았습니다. 압축 합계 475.88초, 해제 합계 69.79초는 이 Mac에서 관측한 값이며 원본 해싱·추가 검사 시간은 제외했습니다. 다른 시스템이나 앱과의 성능 비교값은 아닙니다.

## 확인 범위와 한계

- 위 실전 검사는 다섯 묶음으로 실행했습니다. 26.58GB 단일 압축 파일, 개별 4GiB 초과 입력 파일 또는 65,535개 초과 항목의 실전 검사를 뜻하지 않습니다.
- SHA-256 대조는 이미지와 내부 EXIF를 포함한 파일 바이트의 보존을 확인합니다. 추출 결과의 ACL·확장 속성·리소스 포크와 모든 파일시스템 메타데이터 보존을 검증한 것은 아닙니다.
- CLI 검사를 GUI 드래그앤드롭·파일 선택창·진행률·취소·분할 압축의 실제 조작 검사로 대신하지 않습니다.
- Apple Silicon용 실행 결과이며 Intel Mac 실행은 검증하지 않았습니다. ad-hoc 프리뷰는 Developer ID 서명·Apple 공증 완료를 뜻하지 않습니다. [macOS 실행 안내](MACOS_LAUNCH_KO.md)를 참고하세요.
- RAR·ALZ·EGG를 포함한 모든 형식의 모든 변종을 검증하지 않았습니다. ALZ/EGG의 크기 한도와 확인한 변형은 [테스트 자료 안내](../astra-core/tests/fixtures/legacy/README.md)에 명시합니다.

## 재현 명령

[빌드 안내](../README.md#실행과-빌드)에 따라 의존성과 앱을 준비한 뒤 `ZipLens_Astra`에서 실행합니다. 빌드 스크립트, 잠금 파일, 테스트와 공개 샘플은 소스 저장소에 포함됩니다.

```sh
npm test
npm run build
cargo test --manifest-path astra-core/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
python3 scripts/generate-third-party-notices.py --check
python3 scripts/prepare-distribution.py
python3 scripts/test-package-macos.py
npm run tauri build -- --bundles app
python3 scripts/package-macos.py --preview
python3 scripts/test-cli.py --binary "release_build/preview/ZipLens.app/Contents/MacOS/ziplens"
```

패키징은 ZIP을 다시 풀어 내용·실행 권한·서명과 보조 프로그램 일치를 검사합니다. 실제 배포 ZIP의 체크섬과 해당 버전의 소스는 [GitHub 릴리스](https://github.com/SeederPowerDrop/ZipLens/releases)에서 확인하세요. [CLI 사용법](AI_CLI.md)과 [라이선스·배포 안내](DISTRIBUTION_KO.md)는 별도 문서에 정리합니다.

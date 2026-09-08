# ZipLens 2.0

첫 ZipLens를 보존하면서 안정성과 처리 속도를 개선한 독립 개발판입니다. 기존 프로젝트의 미커밋 변경까지 복사한 뒤, **이 폴더 안에서만** 수정했습니다. 앱 식별자는 `com.ziplens.astra`, 표시 이름은 `ZipLens 2.0`, 버전은 `2.0.0`입니다.

## 먼저 보기

- [코드 검토·반디집 비교·남은 개선 과제](docs/REVIEW_KO.md)
- [성능 측정과 해석](docs/BENCHMARKS_KO.md)
- [개발자 노트](docs/DEVELOPER_NOTES.md)
- [함께 작업한 기록](docs/WORK_LOG.md)
- [변경 이력](CHANGELOG.md)
- [검증 기록](docs/VALIDATION.md)

## 이번 버전에서 달라진 점

- 압축 해제는 오목렌즈를 통과해 퍼지는 빛, 압축은 볼록렌즈를 통과해 모이는 빛으로 표현합니다. 실제 작업 중에만 광선이 움직이며 macOS 동작 줄이기를 지원합니다.
- 두 완료창도 같은 렌즈 디자인을 사용합니다. 알아서 풀기는 폴더와 반짝임 아이콘으로 표현합니다.
- 소개글에는 한국어 원문과 선택한 언어의 번역을 함께 표시합니다. 한국어 선택 시에는 원문만 표시하며 개인 헌사는 그대로 유지합니다.

- 덮어쓰기 시 기존 폴더 전체를 삭제하지 않습니다. 새 데이터를 임시 폴더에서 검증하고, 같은 파일만 교체합니다.
- 상대 경로 탈출, 절대 경로, 외부 심볼릭 링크, 파일명 충돌을 검사합니다. ZIP 파일명과 오류 메시지는 HTML로 실행되지 않습니다.
- ZIP 중앙 목록을 파일마다 다시 파싱하던 병목을 제거했습니다. 실제 측정 조건과 한계는 성능 보고서에 적었습니다.
- 압축 정도를 빠르게/균형/최대로 선택합니다. 암호 없는 ZIP도 분할 압축이 적용됩니다.
- 작업 취소, 검색, 300행 단위 페이지 이동, 언어 설정 저장, 한글 ZIP 파일명 처리, 정확한 중복 파일 결과 경로를 지원합니다.
- 암호가 틀렸을 때 다시 입력할 수 있고, 메모리 미리보기는 백엔드에서도 20 MiB로 제한합니다.
- 유지보수가 중단된 `sevenz-rust`를 제거했습니다. 공식 7-Zip 26.03을 동봉하고 배포 파일 해시를 기록했습니다.

## 지원 범위

직접 만드는 포맷: ZIP, 7Z, TAR, TAR.GZ, TAR.ZST. ZIP/7Z는 암호와 분할 압축을 지원합니다. 7Z 암호 설정 시 파일 목록도 암호화합니다. ZIP의 기본 암호화는 AES-256입니다.

ZIP과 TAR 계열은 Rust 엔진을 사용합니다. 7Z 및 추가 포맷은 동봉한 7-Zip을 사용합니다. RAR/ISO/CAB 등은 엔진이 제공하지만 이번 테스트에서 모든 변종을 검증하지는 않았습니다. **ALZ/EGG 지원은 주장하지 않습니다.** 7-Zip이 해당 포맷을 지원한다는 이전 소개는 부정확했습니다.

TAR의 암호/분할 옵션은 명시적으로 오류를 표시합니다. 7-Zip 경로의 링크는 현재 차단합니다. macOS 앱 번들의 리소스 포크·확장 속성·서명 보존은 추가 검증이 필요합니다.

## 실행과 빌드

macOS, Node.js, Rust/Cargo, Xcode Command Line Tools, Python 3가 필요합니다. 이 작업에서는 Apple M3, 메모리 24 GiB, macOS 15.7.5에서 확인했습니다.

```sh
cd ZipLens_Astra
npm ci
npm run tauri dev
```

배포용 최적화 앱 만들기:

```sh
npm run tauri build -- --bundles app
```

로컬 작업 폴더에서 바로 실행할 앱: `release_build/ZipLens 2.0.app`.
직접 다시 빌드하면 `src-tauri/target/release/bundle/macos/ZipLens 2.0.app`에 생성됩니다.
`release_build`와 빌드 산출물은 Git에 포함되지 않으므로 새로 clone한 환경에서는 위 명령으로 빌드해야 합니다.
현재 결과물은 Apple Silicon용 로컬 개발 빌드입니다. Apple 공증을 받은 공개 배포판은 아닙니다. 원본 `/Applications/ZipLens.app`을 교체하거나 시스템 기본 연결을 변경하지 않았습니다.

## 검증 명령

```sh
npm test
npm run build
cargo test --manifest-path astra-core/Cargo.toml --locked
cargo clippy --manifest-path astra-core/Cargo.toml --all-targets --locked -- -D warnings
```

`python3 scripts/verify-originals.py`는 최초 작업 PC의 미커밋 원본과 로컬 파일까지 대조하는 보존 감사입니다. 새로 clone한 저장소의 빌드/회귀 검사에 포함하지 않습니다.

성능 시험:

```sh
cargo run --manifest-path astra-core/Cargo.toml --example benchmark --release --locked -- docs/benchmark-results.json
```

빌드 전에 `scripts/prepare-sidecar.py`가 동봉된 공식 배포 파일의 해시를 확인하고 7-Zip 실행 파일을 복구합니다. 원본 프로젝트의 의존성이나 빌드 폴더를 공유하지 않습니다. 두 Rust lockfile은 각 명령의 재현성을 위해 유지합니다.

현재 로컬 배포용 ZIP: `release_build/ZipLens_2.0.0_arm64.zip`. 같은 폴더의 이름 변경 전 1.4.0 파일은 이전 개발판 백업입니다. 이 경로는 GitHub Release 첨부 파일을 의미하지 않습니다.

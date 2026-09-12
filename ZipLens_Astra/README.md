# ZipLens 2.0

첫 ZipLens를 보존하면서 안정성과 처리 속도를 개선한 독립 개발판입니다. 기존 프로젝트의 미커밋 변경까지 복사한 뒤, **이 폴더 안에서만** 수정했습니다. 앱 식별자는 `com.ziplens.astra`, 표시 이름은 `ZipLens 2.0`, 버전은 `2.0.0`입니다.

## 먼저 보기

- [2.0.0 프리뷰 다운로드·고객 안내](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.0.0) — Apple Silicon용, Apple 공증 미완료
- [이전 게시본 대비 변경점](docs/RELEASE_2.0.0_KO.md)

- [코드 검토·반디집 비교·남은 개선 과제](docs/REVIEW_KO.md)
- [최종 버그·기능 점검 및 수정 결과](docs/FINAL_REVIEW_KO.md)
- [성능 측정과 해석](docs/BENCHMARKS_KO.md)
- [개발자 노트](docs/DEVELOPER_NOTES.md)
- [함께 작업한 기록](docs/WORK_LOG.md)
- [변경 이력](CHANGELOG.md)
- [검증 기록](docs/VALIDATION.md)
- [배포·라이선스 안내](docs/DISTRIBUTION_KO.md)

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

## macOS 기본 압축 해제 앱

앱 오른쪽 위의 **기본 압축 앱 설정** 버튼 또는 **ZipLens 2.0 → Default Archive App…** 메뉴(⌘,)에서 확장자를 선택하고 적용합니다. 선택한 종류의 파일을 Finder에서 더블클릭하면 ZipLens 미리보기가 열립니다. 실행할 `.app`을 계속 사용할 위치에 둔 뒤 설정하세요. 개발 서버 실행에서는 시스템 연결을 적용하지 않습니다.

이 설정은 파일을 여는 앱을 지정합니다. Finder의 우클릭 **압축** 메뉴를 바꾸지는 않습니다. 설정을 열기만 해서는 연결이 바뀌지 않으며, 이미 기본인 확장자의 체크를 해제해도 기존 연결을 되돌리지는 않습니다. macOS에서 같은 파일 종류로 묶은 별칭은 함께 적용될 수 있습니다. ISO/DMG와 범용 분할 파일 `.001`은 열기를 지원하되 일괄 기본 연결에서는 제외합니다.

Finder에서도 파일 선택 → **정보 가져오기(⌘I) → 다음으로 열기 → ZipLens 2.0 → 모두 변경**으로 종류별 기본 앱을 지정할 수 있습니다. [Apple 안내](https://support.apple.com/en-euro/guide/mac-help/mh35597/mac)

## 지원 범위

직접 만드는 포맷: ZIP, 7Z, TAR, TAR.GZ, TAR.ZST. ZIP/7Z는 암호와 분할 압축을 지원합니다. 7Z 암호 설정 시 파일 목록도 암호화합니다. ZIP의 기본 암호화는 AES-256입니다.

열기·미리보기·압축 해제의 연결 목록은 36개 확장자입니다(서로 같은 형식의 별칭 포함).

- 일반 압축: ZIP, ZIPX, 7Z, RAR, TAR.
- ALZ·EGG: 목록, 선택 해제와 파일 미리보기(해제 전용).
- 스트림/압축 TAR: GZ/GZIP, TGZ, BZ2/BZIP2, TBZ/TBZ2, XZ/TXZ, ZST/ZSTD/TZST, LZMA, Z. `tar.gz`, `tar.bz2`, `tar.xz`, `tar.zst` 등은 내부 TAR의 파일까지 열고 선택해 해제합니다.
- 추가 아카이브: CAB, LZH/LHA, ARJ, CPIO, AR, XAR, WIM.
- 만화 파일 별칭: CBZ, CBR, CB7, CBT.
- 디스크 이미지/분할 파일: ISO, DMG, 001(첫 조각, 나머지 조각은 같은 폴더에 필요).

ZIP과 TAR 목록/해제 검증은 Rust 엔진을 사용합니다. 추가 압축 스트림과 7Z 등은 동봉한 7-Zip을 사용합니다. 파일 종류마다 지원하는 압축 방식과 변종에는 차이가 있습니다. 특히 RAR/ISO/DMG/CAB 등의 모든 변종을 직접 검증했다는 의미는 아닙니다. 실제 회귀 검사 범위는 [검증 기록](docs/VALIDATION.md)에 남깁니다. ALZ·EGG는 별도 보조 프로그램에서 처리하며 안전 한도를 초과하거나 손상된 파일은 완료로 처리하지 않습니다. EGG의 암호화된 파일명·전체 헤더 등 일부 변형은 지원하지 않으며 [크기 한도와 검증 범위](astra-core/tests/fixtures/legacy/README.md)를 확인할 수 있습니다. [공식 7-Zip 형식 안내](https://www.7-zip.org/)

TAR의 암호/분할 옵션은 명시적으로 오류를 표시합니다. 7-Zip 경로의 링크는 현재 차단합니다. macOS 앱 번들의 리소스 포크·확장 속성·서명 보존은 추가 검증이 필요합니다.

## 실행과 빌드

macOS, Node.js, Rust/Cargo 1.89 이상(검증 버전 1.94.0), Xcode Command Line Tools, Python 3.11 이상이 필요합니다. 이 작업에서는 Apple M3, 메모리 24 GiB, macOS 15.7.5에서 확인했습니다. Rust 도구 버전이나 의존성을 바꿨다면 `python3 scripts/generate-third-party-notices.py`로 고지를 갱신하고 변경된 조건을 검토하세요.

```sh
cd ZipLens_Astra
npm ci
cargo fetch --manifest-path astra-core/Cargo.toml --locked
cargo fetch --manifest-path src-tauri/Cargo.toml --locked
npm run tauri dev
```

배포용 최적화 앱 만들기:

```sh
npm run tauri build -- --bundles app
python3 scripts/package-macos.py
```

로컬 작업 폴더에서 바로 실행할 앱: `release_build/ZipLens 2.0.app`.
직접 다시 빌드하면 `src-tauri/target/release/bundle/macos/ZipLens 2.0.app`에 생성됩니다.
`release_build`와 빌드 산출물은 Git에 포함되지 않으므로 새로 clone한 환경에서는 위 명령으로 빌드해야 합니다.
배포 스크립트는 앱과 보조 프로그램에 로컬 ad-hoc 서명을 추가하고 ZIP의 파일 내용·실행 권한과 묶음 무결성을 검사합니다. 현재 결과물은 Apple Silicon용 로컬 개발 빌드입니다. Apple 공증을 받은 공개 배포판은 아닙니다. 원본 `/Applications/ZipLens.app`을 교체하거나 시스템 기본 연결을 변경하지 않았습니다.

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

빌드 전에 `scripts/prepare-distribution.py`가 동봉된 공식 7-Zip 배포 파일·소스의 해시와 라이선스 자료를 확인하고, ALZ·EGG 해제 보조 프로그램을 빌드합니다. 라이선스 자료가 누락되거나 의존성 변경 후 갱신되지 않았으면 빌드를 중단합니다. 원본 프로젝트의 의존성이나 빌드 폴더를 공유하지 않습니다. 두 Rust lockfile은 각 명령의 재현성을 위해 유지합니다.

로컬 배포용 ZIP은 `release_build/ZipLens_2.0.0_arm64.zip`입니다. 공개 다운로드는 [GitHub의 2.0.0 프리뷰 릴리스](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.0.0)를 이용하세요. 같은 로컬 폴더의 이전 버전 파일은 개발판 백업입니다.

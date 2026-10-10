# ZipLens 2.1.1 — 열 가지 언어, 오프라인 사용법, AI/CLI와 GPLv3

**2026-10-11 · Apple Silicon Mac용 프리뷰**

[2.1.1 릴리스](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1) · [사용 설명서](USER_GUIDE_KO_EN.md) · [변경 이력](../CHANGELOG.md)

> 이번 앱은 **ad-hoc 서명 프리뷰**입니다. Apple Developer ID 서명·Apple 공증은 완료하지 않았으며 macOS가 실행을 차단할 수 있습니다. Intel Mac 실행은 검증하지 않았습니다. GitHub의 Latest 표시는 최신 다운로드를 안내하며 Apple 공증 완료를 뜻하지 않습니다.

## 공개 2.0.3 이후 달라진 점

- **파일을 고르면 알맞은 작업으로:** 메인 화면에서 파일과 폴더를 각각 선택할 수 있습니다. 압축 파일은 목록을 열고 일반 파일·폴더나 혼합 선택은 새 압축 설정으로 이어집니다. 선택한 원본을 확인하고 다시 고를 수 있습니다.
- **렌즈 둘러보기:** 메인 화면의 렌즈 그림을 두 번 클릭하거나 키보드로 선택해 Enter·Space를 누르면 열 가지 렌즈·빛 패턴의 개념도와 설명을 볼 수 있습니다. 되돌리기 버튼으로 처음 화면에 돌아갑니다.
- **앱 이름과 정보창:** 이름을 `ZipLens`, 앱 번들을 `ZipLens.app`으로 통일하고 실제 버전을 한 번만 표시합니다. 제작 철학, 사용법, 후원과 라이선스 안내를 정보창에서 확인할 수 있습니다. Dock 아이콘의 흰 바깥 여백도 투명하게 정리했습니다.
- **열 가지 언어:** 한국어, 영어, 일본어, 중국어(간체), 베트남어, 스페인어, 프랑스어, 독일어, 러시아어, 아랍어를 지원합니다. 저장한 언어가 우선이며 처음 실행할 때 시스템의 지원 언어를 선택합니다. 아랍어는 오른쪽에서 왼쪽으로 표시합니다. 운영체제 자체 대화상자와 일부 엔진 오류는 별도 언어로 표시될 수 있습니다.
- **앱 안의 사용 설명서:** 정보창의 사용 가이드에서 파일 열기·미리보기, 선택 해제, 새 압축, 기본 앱 설정, AI/CLI 안내를 인터넷 연결 없이 읽을 수 있습니다. 앱 안의 가이드는 같은 열 가지 언어를 제공합니다.
- **AI·터미널 자동화:** 동일한 앱 실행 파일에 `cli capabilities`, `list`, `extract`, `compress`가 포함됩니다. 창을 열지 않고 JSON과 종료 코드를 반환하며 목적지를 명시합니다. 기존 파일은 기본적으로 보존하고 실제 결과 경로를 알려줍니다. 별도의 AI 서비스나 API 키는 필요하지 않습니다. [CLI 사용법과 제한](AI_CLI.md)
- **GPLv3 적용:** ZipLens 자체 코드를 GNU GPL version 3 only (`GPL-3.0-only`)로 공개합니다. 앱에는 라이선스 전문과 안내가 포함되며 외부 구성요소의 라이선스는 그대로 유지됩니다. 대응 소스 파일을 앱과 함께 제공합니다. [라이선스](../LICENSE) · [앱 고지](../legal/ziplens/NOTICE.txt)
- **선택적인 후원 유지:** 공식 앱의 Buy Me a Coffee, Ko-fi, Bitcoin 후원란을 유지합니다. 수정본을 배포할 때에도 원작과 원작자 후원 링크를 남겨 달라는 안내를 README에 추가했습니다. 이는 자발적인 부탁이며 추가 라이선스 조건이나 후원 의무가 아닙니다.
- **ZIP 처리 보완:** 크기가 다른 파일의 해제 작업을 더 고르게 나누고, ZIP 형식 확인과 미리보기 항목 검색에서도 취소 요청을 확인합니다. 속도는 파일과 환경에 따라 달라집니다.

2.1.0은 별도의 공개 릴리스로 배포하지 않았습니다. 그 버전에서 개발한 CLI와 언어 개선을 이번 2.1.1에 함께 담았습니다. 기존의 압축 파일 미리보기, 선택 해제, ALZ·EGG 해제, 파일 충돌 시 원본 보호 기능도 포함합니다.

## 다운로드와 설치

| 파일 | 용도 |
|---|---|
| [ZipLens_2.1.1_arm64-preview.zip](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.1/ZipLens_2.1.1_arm64-preview.zip) | Apple Silicon용 `ZipLens.app` |
| [ZipLens_2.1.1_source.tar.gz](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.1/ZipLens_2.1.1_source.tar.gz) | 이 배포본의 대응 소스와 빌드 안내 |
| [SHA256SUMS.txt](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.1/SHA256SUMS.txt) | 배포 파일의 SHA-256 체크섬 |

1. 진행 중인 작업을 마친 뒤 실행 중인 구버전을 ⌘Q로 종료합니다.
2. 앱 ZIP을 macOS 아카이브 유틸리티로 풉니다.
3. `ZipLens.app`을 응용 프로그램 폴더 등 계속 사용할 위치에 둡니다. 구버전을 교체한다면 먼저 백업하세요. 실행 파일만 꺼내지 말고 `.app` 전체를 사용합니다.
4. 앱을 열고 언어와 정보창의 버전 `2.1.1`을 확인합니다. 기본 앱 연결은 새 앱을 사용할 위치에 둔 뒤 다시 설정할 수 있습니다.

체크섬 파일과 두 배포 파일을 같은 폴더에 받은 경우 `shasum -a 256 -c SHA256SUMS.txt`로 확인할 수 있습니다. 파일 하나만 받았다면 `shasum -a 256 파일명`의 결과를 체크섬 파일의 해당 줄과 비교하세요. 체크섬은 Apple 공증을 대신하지 않습니다. [실행 문제 안내](MACOS_LAUNCH_KO.md)

## 실제 파일 검증과 범위

2026년 10월 10일, macOS 15.7.5의 Apple Silicon Mac에서 2.1.1 로컬 프리뷰의 CLI로 **DNG 728개·HEIC 1개, 합계 729개·26.58GB**를 다섯 ZIP 묶음으로 압축하고 복원했습니다. 파일명·크기·SHA-256이 모두 원본과 일치했고 원본도 검사 전후 그대로 보존됐습니다. 네 묶음은 4GiB를 넘는 ZIP64였으며 ZIP 합계는 **24.94GB, 약 6.2% 감소**였습니다.

별도의 **15개·494.7MB** 표본으로 7Z·TAR·TAR.GZ·TAR.ZST 왕복 검사를 통과했습니다. 암호 ZIP의 암호 없음·오류·정상 복원, 선택 해제, 같은 이름의 기존 파일 보존도 확인했습니다. 같은 날 프런트엔드 **56개**와 앱 CLI **18개** 회귀 검사가 실패나 건너뜀 없이 통과했습니다.

이것은 앱과 같은 엔진을 사용한 기존 실전 검사 결과입니다. 26.58GB를 하나의 압축으로 만드는 조건, GUI 드래그·취소·분할 압축 조작, 모든 압축 형식·변종을 검증했다는 뜻은 아닙니다. 이 수치를 새 배포 파일 전체의 재검사 횟수로 합산하지 않습니다.

2026년 10월 11일 새 배포 소스로 프런트엔드 56개, 압축 엔진 64개, Tauri/Rust 22개, 패키징 21개, 빌드된 앱 CLI 18개를 다시 실행하여 **총 181개가 통과**했습니다. 최적화 앱 빌드, ZIP CRC와 실제 재추출 후 파일 내용·실행 권한·서명, 보조 프로그램의 아키텍처와 준비된 실행 파일 일치도 확인했습니다. 이번 검사는 새 GUI 조작이나 설치 완료 확인을 포함하지 않습니다. 배포 ZIP의 크기·SHA-256과 검사 범위는 [검증 요약](VALIDATION.md)에 정리합니다.

## 소스와 후원

`ZipLens_2.1.1_source.tar.gz`에는 이 배포본과 일치하는 전체 자체 소스, 빌드 안내, 실행·빌드에 쓰이는 Rust crate 소스와 npm 의존성의 상위 프로젝트 TypeScript 소스 아카이브를 포함합니다. 직접 빌드를 재현할 때 참고하세요. 공개 문서는 검증 요약을 제공하고 개인 작업 기록과 원시 실행 로그는 별도의 비공개 기록으로 보관합니다.

배포 실행 파일을 수정해 다시 배포한다면 GPLv3에 따라 해당 버전의 대응 소스를 수령인이 받을 수 있게 해야 합니다. 수정하지 않고 개인적으로 사용하는 것과 배포하지 않는 개인 수정에는 공개 저장소를 만들 의무가 없습니다. 외부 구성요소에는 각자의 라이선스가 적용됩니다. 자세한 조건은 [LICENSE](../LICENSE)와 [배포 안내](DISTRIBUTION_KO.md)에 있습니다.

원작자의 개발은 선택적인 [Buy Me a Coffee](https://buymeacoffee.com/master_chief)와 [Ko-fi](https://ko-fi.com/seederpower) 후원으로 응원할 수 있습니다. Bitcoin 후원은 공식 앱의 정보창에서 확인할 수 있습니다. 앱과 소스는 후원 없이 사용할 수 있습니다.

---

## English

### ZipLens 2.1.1 — Ten Languages, Offline Help, AI/CLI and GPLv3

**October 11, 2026 · Apple Silicon preview**

This is an **ad-hoc signed preview without Apple Developer ID signing or Apple notarization**. macOS may block it from opening. Intel Mac execution has not been verified. GitHub's Latest label identifies the current download; it does not certify Apple notarization.

### Changes since public version 2.0.3

- **File and folder selection** now leads directly to the appropriate action: archive browsing for archives, or compression settings for regular files, folders and mixed selections. You can review and change the selected sources.
- **Explore lenses** from the home illustration with a double-click or keyboard Enter/Space. Ten conceptual lens and beam exhibits include explanations, with a reset control to return to the opening pair.
- The app is named **ZipLens** (`ZipLens.app`), with the actual version shown once in About. The Dock icon's outer white background is now transparent.
- The interface and bundled guide support **Korean, English, Japanese, Simplified Chinese, Vietnamese, Spanish, French, German, Russian and Arabic**, with right-to-left Arabic layout. Saved preferences take priority, followed by supported system languages. OS dialogs and some engine errors may use another language.
- **Offline help** in About explains previewing, extraction, compression, default-app settings and AI/CLI use without an internet connection.
- The same app executable offers **`cli capabilities`, `list`, `extract`, and `compress`** for terminal tools and AI agents. Commands return JSON and exit codes without opening windows, require explicit destinations, preserve existing files by default and report actual output paths. No separate AI service or API key is required. [CLI documentation](AI_CLI.md)
- ZipLens's own code uses **GNU GPL version 3 only (`GPL-3.0-only`)**. The app includes its license and notice, third-party licenses are preserved, and the corresponding source archive accompanies this release.
- The official app retains **optional Buy Me a Coffee, Ko-fi and Bitcoin support**. The README asks modified-version distributors to retain the original project and author support links. This is voluntary, not a license condition or donation requirement.
- **ZIP processing** distributes differently sized entries more evenly across workers and checks cancellation while inspecting ZIP capabilities and searching for preview entries. Speed depends on the files and environment.

Version 2.1.0 was developed locally and was not released separately. Its language and CLI features are included here, along with the existing archive browser, selective extraction, ALZ/EGG extraction and original-file protection.

### Install and verify

Download **ZipLens_2.1.1_arm64-preview.zip** for the app, **ZipLens_2.1.1_source.tar.gz** for its corresponding source and build information, and **SHA256SUMS.txt** from the [2.1.1 release](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1). Finish ongoing work and quit older copies with ⌘Q. Extract with macOS Archive Utility, then place the complete `ZipLens.app` in Applications or another permanent location. Back up an old installation before replacing it. Check version `2.1.1` in About and reapply default-app associations if needed.

With both archives and the checksum file in one folder, run `shasum -a 256 -c SHA256SUMS.txt`. For a single downloaded archive, compare `shasum -a 256 filename` with its matching checksum entry. Checksums do not replace notarization.

### Real-file validation and limits

On October 10, 2026, the local 2.1.1 app's CLI compressed and restored **729 images totaling 26.58GB**—728 DNG and one HEIC—in five ZIP batches on Apple Silicon with macOS 15.7.5. Every filename, size and SHA-256 matched, and the source files remained unchanged. Four batches exercised ZIP64 beyond 4GiB. The combined ZIP output was **24.94GB**, about **6.2% smaller** for this corpus.

A separate **15-image, 494.7MB** sample passed 7Z, TAR, TAR.GZ and TAR.ZST round trips. Tests also covered missing and incorrect passwords, successful encrypted ZIP extraction, selected files and conflicting existing filenames. All **56 frontend** and **18 app CLI** regressions passed that day without failures or skips.

These are prior real-file tests of the same engine used by the app. They do not cover one 26.58GB archive, GUI drag-and-drop, cancellation or split-archive interactions, or every archive variant. They are not counted as a new full rerun of this release package.

On October 11, 2026, **all 181 newly run checks passed**: 56 frontend, 64 archive-engine, 22 Tauri/Rust, 21 packaging and 18 built-app CLI tests. The optimized app build and package checks also passed, including ZIP CRC, extracted file contents and executable permissions, signatures, and the helper's architecture and match to its prepared executable. These checks do not constitute a new GUI interaction test or completed-installation check. See the [validation summary](VALIDATION.md) for the ZIP size, SHA-256 and verification scope.

### Source and support

`ZipLens_2.1.1_source.tar.gz` contains the complete matching first-party source, build instructions, runtime/build Rust crate sources and upstream TypeScript source archives for npm dependencies to help reproduce this build. Public docs provide validation summaries; personal work records and raw run logs are retained separately in a private archive.

When distributing executables, make the corresponding source for that version available as required by GPLv3. Private use or modifications that you do not distribute do not require a public source repository. Third-party components retain their licenses. See [LICENSE](../LICENSE) and the [app notice](../legal/ziplens/NOTICE.txt).

Support the original author through [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower), or Bitcoin in the official app's About dialog. Donations are optional.

[User guide](USER_GUIDE_KO_EN.md) · [Build instructions and supported formats](../README.md) · [Report an issue](https://github.com/SeederPowerDrop/ZipLens/issues/new)

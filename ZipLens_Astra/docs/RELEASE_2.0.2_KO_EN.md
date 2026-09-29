# ZipLens 2.0.2 프리뷰 — 더 넓어진 파일 목록과 편리한 탐색

압축 파일을 열었을 때 내용에 더 집중할 수 있도록 화면을 정리했습니다. 이번 업데이트는 파일 목록·검색·폴더 이동·긴 파일명 표시를 개선하고, 지금까지의 2.0 개발 내용을 GitHub 기본 페이지와 문서에 함께 정리합니다.

**2026년 9월 30일 · Apple Silicon Mac용 프리뷰**
[다운로드](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.0.2) · [사용법](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/README.md) · [English below](#english)

> Apple Developer ID 서명·공증을 완료하지 않은 프리뷰입니다. macOS가 실행을 차단할 수 있습니다. Intel Mac 실행과 모든 압축 형식의 변종을 검증한 것은 아닙니다.

## 이번에 개선한 점

### 1. 파일 목록을 더 넓게

압축 파일을 열면 큰 시작 영역 대신 작은 파일 제목과 아이콘을 표시합니다. 상단 도구도 간결하게 정돈해 내부 파일을 볼 공간을 늘렸습니다. 폴더 경로, 검색, 선택 버튼, 정렬이 목록 위에 모이고 파일 목록만 따로 스크롤됩니다.

![ZipLens 2.0.2의 압축 파일 미리보기](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.2/ZipLens_Astra/docs/screenshots/archive-preview.jpg)

### 2. 필요한 파일을 찾고 선택하기 쉽게

긴 파일명은 화면 너비에 맞춰 표시하고, 마우스를 올리면 전체 이름을 확인할 수 있습니다. 폴더 경로를 키보드로 선택할 수 있는 버튼으로 바꿨습니다. 언어를 바꿔도 열어 둔 압축 파일명이 유지되고 검색 입력의 접근성 설명도 선택한 언어로 표시됩니다.

![공개용 샘플에서 필요한 파일 하나만 선택한 화면](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.2/ZipLens_Astra/docs/screenshots/selective-extraction.jpg)

### 3. 화면과 작업 흐름 정리

파일을 읽은 후 화면을 강제로 숨겼다가 다시 보여 주던 처리를 제거하고, 열린 압축 화면의 애니메이션을 정리했습니다. 새 압축 설정과 파일 목록은 작업에 맞춰 표시됩니다. 압축은 볼록렌즈의 빛 수렴, 해제는 오목렌즈의 빛 확산으로 표현합니다.

![볼록렌즈와 압축 설정](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.2/ZipLens_Astra/docs/screenshots/compression-settings.jpg)

선택한 파일을 해제하면 완료 보고서에서 파일 열기, Finder에서 보기, 상세 목록 확인을 이어갈 수 있습니다.

![오목렌즈와 압축 해제 완료 보고서](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.2/ZipLens_Astra/docs/screenshots/extraction-complete.jpg)

스크린샷은 실제 앱에서 공개용 샘플 자료로 촬영했습니다. [촬영 안내](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/screenshots/README.md)

## 2.0 시리즈에서 함께 개선한 기능

- **Finder 시작 오류 수정:** 앱이 꺼진 상태에서 압축 파일을 열면 종료되던 문제를 2.0.1에서 수정했으며 이번 버전에도 포함합니다.
- **ALZ·EGG 해제:** 목록, 선택 해제와 파일 미리보기를 지원합니다. ALZ·EGG 생성은 지원하지 않습니다.
- **원본 보호:** 기존 폴더 전체를 삭제하지 않고 검증한 파일만 반영합니다. 원본·분할 조각 덮어쓰기, 위험한 경로와 외부 링크를 검사합니다.
- **ZIP 처리 개선:** 중앙 목록을 재사용해 반복 읽기를 줄였습니다. [실제 측정 조건과 결과](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/BENCHMARKS_KO.md)를 함께 공개합니다.
- **사용 편의:** 한글 파일명, 검색, 페이지 이동, 암호 재입력, 취소, 완료 보고서와 7개 언어를 지원합니다.
- **macOS 연동:** 앱에서 종류별 기본 열기 앱을 설정하고 Finder로 압축 파일을 열 수 있습니다.
- **지원 범위:** ZIP·7Z·TAR·TAR.GZ·TAR.ZST 생성, 별칭 포함 36개 확장자 인식. 형식과 변종별 지원 차이가 있습니다.

## 다운로드와 설치

1. 아래 첨부 파일에서 **ZipLens_2.0.2_arm64-preview.zip**과 **SHA256SUMS.txt**를 받습니다.
2. 실행 중인 구버전 ZipLens는 ⌘Q로 완전히 종료합니다.
3. ZIP을 우클릭하고 **다음으로 열기 → 아카이브 유틸리티(압축 유틸리티)**로 풉니다.
4. `ZipLens 2.0.app`을 사용할 위치에 둡니다. 기존 설치본을 교체할 경우 먼저 백업하세요.

두 다운로드 파일이 있는 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`로 무결성을 확인할 수 있습니다. 체크섬은 공증을 대신하지 않습니다. 실행 차단에 관한 설명은 [실행 문제 안내](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/MACOS_LAUNCH_KO.md)에 있습니다.

## 검증

이번 게시를 위해 자동 검사 **101개**를 다시 실행해 통과했습니다: 압축 엔진 61개, 프런트엔드 13개, Tauri 라이브러리 8개, 패키징 19개. 프런트엔드와 macOS 앱 빌드, ZIP CRC·내용·실행 권한, ZIP을 실제로 푼 앱의 로컬 서명 검사도 통과했습니다. 자동 함수 검사가 화면 배치 전체를 검증하는 것은 아닙니다. 실제 앱 확인과 남은 범위는 [검증 기록](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/VALIDATION.md)에 정리합니다.

정식 배포를 위한 서명·Apple 공증·Gatekeeper 검사 절차는 준비되어 있지만, 이번 다운로드는 **ad-hoc 서명 프리뷰**입니다. 공증 완료나 모든 Mac에서의 실행을 의미하지 않습니다.

---

## English

# ZipLens 2.0.2 Preview — More Room for Your Files

**September 30, 2026 · Apple Silicon Mac preview**

This update makes archive browsing more comfortable and brings the accumulated 2.0 work into the repository's main page and documentation.

### What's improved

1. **A larger file list.** Opening an archive replaces the large welcome area with a compact title and icon. Navigation, search, selection controls and sorting sit above a separately scrolling file list.
2. **Easier navigation and selection.** Hover over shortened filenames to see the full name. Folder-path buttons are keyboard-accessible. Switching languages keeps the loaded archive filename intact and translates the search field's accessible label.
3. **More stable display.** Removed the forced hide-and-redisplay step after loading an archive and simplified loaded-view animations. Compression settings and the archive list appear according to the current task.
4. **Consistent lens visuals.** Compression uses a converging convex lens; extraction uses a diverging concave lens. Completion reports offer relevant actions such as opening files, revealing them in Finder and viewing details.

The screenshots above show the actual 2.0.2 macOS app with public sample files: the archive browser, a single-file selection, compression settings and a successful extraction report.

### Improvements carried forward from 2.0

- Includes the 2.0.1 fix for a startup crash when opening archives from Finder while the app is closed.
- ALZ/EGG listing, previews and selective extraction; creating ALZ/EGG archives is not supported.
- Stronger original-file protection, validated extraction before publishing files, and checks for unsafe paths and links.
- Reused ZIP directory data to reduce repeated parsing; [benchmarks](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/BENCHMARKS_KO.md) document the measured conditions and limits.
- Korean filenames, search, pagination, password retries, cancellation, completion reports and seven interface languages.
- macOS default archive-app settings. Creates ZIP, 7Z, TAR, TAR.GZ and TAR.ZST; recognizes 36 extensions including aliases. Support varies by format and variant.

### Download and verification

Download **ZipLens_2.0.2_arm64-preview.zip** and **SHA256SUMS.txt** from this release, quit older copies with ⌘Q, extract with macOS Archive Utility, and place the app where you want to keep it. Back up an older installation before replacing it. Run `shasum -a 256 -c SHA256SUMS.txt` in the download folder to verify integrity.

**All 101 automated checks passed again for this update:** 61 archive-engine, 13 frontend, 8 Tauri-library and 19 packaging checks. Production builds and ZIP content, permissions, CRC and extracted-app signature checks also passed. See the [validation record](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/docs/VALIDATION.md) for native UI checks and limits.

**This is an ad-hoc signed preview, without Apple Developer ID signing or notarization. macOS may block it from opening. Intel Mac execution and every archive variant have not been verified.** Checksums and local signature checks do not replace notarization.

[Usage and build instructions](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.2/ZipLens_Astra/README.md) · [Report an issue](https://github.com/SeederPowerDrop/ZipLens/issues/new)

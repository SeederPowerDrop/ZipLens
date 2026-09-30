# ZipLens 2.0.3 — 선택한 앱 언어로 보는 정보창

앱 오른쪽 위에서 언어를 선택하고 **정보(i)** 버튼을 누르면 소개글이 해당 언어로 표시됩니다. 별도의 영어 전환 버튼 없이 앱의 언어 설정을 그대로 따릅니다.

**최신 다운로드: 2.0.3 · Apple Silicon Mac용**

> 이번 다운로드는 **Apple Developer ID 서명·공증을 완료하지 않은 ad-hoc 서명 프리뷰**입니다. macOS가 실행을 차단할 수 있으며, Intel Mac 실행은 검증하지 않았습니다. GitHub의 Latest 표시는 최신 다운로드를 안내하기 위한 것으로, Apple 공증 완료를 의미하지 않습니다.

## 2.0.3 개선 내용

- 한국어 원문과 번역을 함께 표시하던 방식에서 **선택한 언어만 표시**하도록 변경했습니다.
- 한국어·영어·일본어·중국어·프랑스어·스페인어·아랍어를 지원합니다.
- 정보창 제목, 소개글, 버전 표시, 후원 문구, 오픈소스 라이선스 버튼과 안내, 확인 버튼을 함께 번역합니다. 정보 버튼의 툴팁과 접근성 이름도 바뀝니다.
- 아랍어 정보창은 오른쪽에서 왼쪽으로 읽도록 정렬하며, 다른 언어로 돌아가면 표시 방향도 복원합니다.
- 제작자·후원 링크와 개인 메시지 **ERW FWS WRG**는 유지합니다. 개인 메시지 앞의 연결어만 선택한 언어로 표시합니다.

## 함께 포함된 파일 목록 개선

2.0.2에서 개선한 작은 도구 모음, 넓어진 파일 목록, 한글 검색, 선택 해제, 폴더 이동과 긴 파일명 표시도 포함합니다.

![ZipLens 압축 파일 미리보기](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.3/ZipLens_Astra/docs/screenshots/archive-preview.jpg)

![선택한 파일의 압축 해제 완료](https://raw.githubusercontent.com/SeederPowerDrop/ZipLens/v2.0.3/ZipLens_Astra/docs/screenshots/extraction-complete.jpg)

위 이미지는 2.0.2에서 공개용 샘플로 촬영한 실제 앱 화면입니다. 2.0.3에서도 유지되는 파일 목록·선택 해제를 소개하며, 이번 정보창 번역의 새 스크린샷은 아닙니다.

## 다운로드와 설치

1. 첨부한 **ZipLens_2.0.3_arm64-preview.zip**과 **SHA256SUMS.txt**를 받습니다.
2. 사용자가 작업을 마친 뒤 실행 중인 구버전을 ⌘Q로 종료합니다.
3. ZIP은 macOS 아카이브 유틸리티로 풀고 `ZipLens 2.0.app`을 사용할 위치에 둡니다. 이전 설치본을 교체할 경우 먼저 백업하세요.
4. 실행 후 앱 언어를 선택하고 정보 버튼에서 해당 번역을 확인합니다.

두 다운로드 파일이 있는 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`로 무결성을 확인할 수 있습니다. 체크섬은 Apple 공증을 대신하지 않습니다. [실행 문제 안내](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.3/ZipLens_Astra/docs/MACOS_LAUNCH_KO.md)

## 검증 범위

- 정보창 언어 전환 회귀 검사 2개를 포함해 프런트엔드 검사 **15개**, 타입 검사와 production 빌드 통과.
- macOS 앱 빌드, 라이선스 자료 확인, ZIP 내용·실행 권한·CRC·재추출 로컬 서명 검사 통과.
- 게시 전 앱·패키지·정보창의 버전과 ZIP·동봉 실행 파일의 해시를 대조했습니다.
- 압축 엔진은 변경하지 않아 이번에는 엔진 검사를 다시 실행하지 않았습니다. 새 정보창의 네이티브 화면 배치는 아직 수동 확인하지 못했습니다. [상세 검증 기록](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.3/ZipLens_Astra/docs/VALIDATION.md)

---

## English

### ZipLens 2.0.3 — About Follows Your App Language

Choose a language at the top right of the app, then click **Info (i)**. About now displays that language directly, using the app's existing language setting.

**Current download: 2.0.3 for Apple Silicon Mac.** This is an **ad-hoc signed preview without Apple Developer ID signing or notarization**. macOS may block it from opening; Intel execution has not been verified. GitHub's Latest label points to the current download and does not mean that Apple notarization is complete.

### Improvements

- Shows only the selected language, replacing the previous Korean-plus-translation layout.
- Supports Korean, English, Japanese, Chinese, French, Spanish and Arabic.
- Localizes the title, introduction, version label, support text, license controls and hints, confirmation button, and the Info button's tooltip and accessible name.
- Uses right-to-left layout for Arabic and restores left-to-right layout when switching back.
- Preserves the author/support links and the exact personal message **ERW FWS WRG**; only its introductory word is translated.

The archive-browser improvements from 2.0.2 are included: a compact toolbar, larger file list, search, selective extraction, folder navigation and full-name tooltips. The screenshots above were captured from the actual 2.0.2 app with public sample files. They illustrate archive features retained in 2.0.3, not the newly localized About dialog.

### Installation and verification

Download **ZipLens_2.0.3_arm64-preview.zip** and **SHA256SUMS.txt**. Finish your work and quit the older app with ⌘Q, extract the ZIP with macOS Archive Utility, and place the app where you want to keep it. Back up an older installation before replacing it. Run `shasum -a 256 -c SHA256SUMS.txt` to verify integrity.

All **15 frontend checks**, including two new language-switching regressions, passed, along with TypeScript and production builds. The macOS app build and ZIP content, permissions, CRC and extracted-app local signature checks passed. Versions and packaged-file hashes were checked before publication. The unchanged archive engine tests were not rerun, and the new About layout has not yet been manually checked in the native app.

[Usage and supported formats](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.3/ZipLens_Astra/README.md) · [Validation record](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.3/ZipLens_Astra/docs/VALIDATION.md) · [Report an issue](https://github.com/SeederPowerDrop/ZipLens/issues/new)

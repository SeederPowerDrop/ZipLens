# ZipLens 2.1.2 — 다국어 화면과 파일 처리 보완

**2026-10-18 · Apple Silicon Mac용 프리뷰**

[2.1.2 릴리스](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.2) · [10개 언어 사용 설명서](guides/README.md) · [변경 이력](../CHANGELOG.md)

이번 앱은 **ad-hoc 서명 프리뷰**입니다. Apple Developer ID 서명·Apple 공증은 완료하지 않았으며 macOS가 실행을 차단할 수 있습니다. Intel Mac 실행은 검증하지 않았습니다. GitHub의 Latest 표시는 Apple 공증 완료를 뜻하지 않습니다.

## 2.1.1 이후 달라진 점

- **다국어 화면:** 긴 툴바·선택 버튼의 줄바꿈과 작은 창의 모달 배치를 보완했습니다. 암호 보기 아이콘과 아랍어 RTL 간격을 정리하고, 혼합 언어 파일명·경로는 원문을 유지하며 표시 방향을 분리했습니다.
- **ZIP 암호 안내:** 동봉 엔진이 생성하지 못하는 비ASCII ZIP 암호는 출력 파일을 만들기 전에 안내합니다. Unicode 암호가 필요하면 7Z를 선택하세요. 파일명이나 기존 압축 파일을 풀 때 입력하는 암호에 같은 제한을 적용하지 않습니다.
- **정확한 결과 보고서:** `a.txt`와 `nested/a.txt`처럼 끝 이름이 같은 항목의 크기를 구분하고, 성공한 파일의 실제 출력 경로를 내보냅니다. 이름 보존 처리 후 원본과의 대응이 불확실한 경우 크기를 추측하지 않습니다.
- **대량 결과 처리:** 크기 조회에 인덱스를 사용해 결과마다 파일 목록 전체를 반복 검색하던 처리를 줄였습니다. 화면의 실패 목록은 처음 50개와 나머지 개수로 표시하며, TXT·CSV 내보내기는 전체 결과를 유지합니다.
- **원본 보호와 입력 검사:** Unicode 조합 방식만 다른 이름의 충돌을 새 압축 전에 거부합니다. UTF-8로 표현할 수 없는 CLI 인수, FIFO·디렉터리 등 압축 파일로 사용할 수 없는 입력도 명확한 오류로 처리합니다.
- **학습과 기여:** 코드 내부 이름·주석을 정리하고 코드 읽기·기여 안내, 10개 언어별 소개·기능·사용 설명서를 추가했습니다. CLI의 명령·JSON 계약은 유지합니다.

GPLv3 공개, 공식 후원란과 오프라인 사용법은 그대로 유지합니다. 누구나 경제적 여건이나 언어와 관계없이 기본 디지털 도구를 쓰고, 코드를 공부·수정·공유하며 기여할 수 있기를 바라는 **소프트웨어 기본권**이 개발의 지향점입니다.

## 검증한 범위

새 소스의 프런트엔드 69개, 압축 엔진 70개, Tauri/CLI 단위 검사 22개, 패키징 21개, 실제 앱 CLI 20개로 **202개 검사를 다시 실행해 모두 통과**했습니다. **Unicode 파일명 13개 시나리오**도 별도로 다시 통과했습니다. 앱 CLI와 Unicode 검사는 최적화 빌드의 앱에서 최종 패키징 전에 실행했습니다.

기존 2.1.1과 최종 포장한 2.1.2의 대용량·다수 파일 비교는 **40왕복 / 120개 CLI 명령**을 완료했습니다(2.1.1: 14왕복, 2.1.2: 26왕복). 4 GiB + 64 MiB 단일 파일의 ZIP64, 512 MiB 혼합 파일의 다섯 생성 형식, 1만 개 작은 파일을 확인했습니다. 모든 파일의 이름·크기·SHA-256, 원본과 입력 압축 파일 보존 검사를 통과했습니다.

큰 ZIP의 압축·해제 시간은 기존 2.1.1의 측정 범위와 비슷했습니다. 작은 파일 해제는 최초 중앙값 0.862 → 1.120초였고, 추가 6회 검사에서도 **0.722 → 0.815초(약 0.093초 / 12.8% 증가)**였습니다. 측정 범위는 겹치며 원인은 미확정입니다. 성능 개선이나 저하 없음으로 단정하지 않습니다. 7Z는 512 MiB 표본 압축에서 합산 RSS 샘플 최고치 약 **1.71 GiB**로 ZIP보다 메모리를 많이 사용했습니다.

검사한 조건에서 손상·기능 실패·멈춤은 없었고 배포를 막을 결함은 확인되지 않았다고 판단했습니다. 앱 빌드와 배포 ZIP의 CRC, 실제 재추출 후 내용·실행 권한·서명, 보조 프로그램의 아키텍처와 준비된 코드 일치도 확인했습니다. 이 검사는 Apple 공증이나 GUI 전체 성능 검증을 뜻하지 않습니다.

이번 대용량 검사는 이전 설치본 2.1.1과 새 패키지의 CLI를 같은 합성 파일로 비교합니다. GUI와 동일한 압축 엔진을 호출하지만 GUI 응답성의 측정은 아닙니다. 조건·시간·메모리·무결성 결과와 한계는 [대용량 파일 검증](LARGE_FILE_VALIDATION_2026-10-18.md)에 기록합니다.

이전 소스 검사에서 확인한 독일어 압축창, 아랍어 정보·후원·QR 표시와 다국어 ZIP 왕복 결과는 [기존 검증 기록](VALIDATION.md)에 별도로 남겼습니다. 이전의 202개 자동 검사, 160개 WebKit 화면 검사, 13개 Unicode CLI 시나리오와 26.58GB 실제 이미지 검사를 이번 재실행 횟수에 합산하지 않습니다.

모든 형식·변종, 모든 하드웨어 또는 모든 UI 동작의 무오류를 보증하는 검사는 아닙니다. 인코딩 정보가 없는 구형 ZIP의 CP932·GBK·CP437 이름 자동 판별과 macOS 앱 번들의 메타데이터 보존에는 기존 한계가 남습니다.

## 다운로드와 설치

| 파일 | 용도 |
|---|---|
| [ZipLens_2.1.2_arm64-preview.zip](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.2/ZipLens_2.1.2_arm64-preview.zip) | Apple Silicon용 `ZipLens.app` |
| [ZipLens_2.1.2_source.tar.gz](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.2/ZipLens_2.1.2_source.tar.gz) | 해당 배포본의 대응 소스와 빌드 자료 |
| [SHA256SUMS.txt](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.2/SHA256SUMS.txt) | 배포 파일의 SHA-256 체크섬 |

진행 중인 작업을 마친 뒤 구버전을 ⌘Q로 종료합니다. ZIP을 macOS 아카이브 유틸리티로 풀어 **`ZipLens.app` 전체**를 응용 프로그램 폴더에 둡니다. 기존 설치본을 교체한다면 먼저 백업하고, 실행 후 **ⓘ**에서 버전 **2.1.2**를 확인하세요. 앱 실행 파일만 따로 꺼내면 보조 프로그램을 사용할 수 없습니다.

앱 ZIP·소스·체크섬 파일을 같은 폴더에 받았다면 `shasum -a 256 -c SHA256SUMS.txt`로 확인할 수 있습니다. 체크섬은 Apple 공증을 대신하지 않습니다. [실행 문제 안내](MACOS_LAUNCH_KO.md)

앱 ZIP은 **18,064,245 bytes**이며 SHA-256은 다음과 같습니다. 소스 아카이브를 포함한 최종 배포 파일의 체크섬은 같은 릴리스의 [SHA256SUMS.txt](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.2/SHA256SUMS.txt)에서 확인하세요.

```text
01cba9b5d22ccbf917483fc576341943ff6829173ecf8102a99bf2dff4f2a36d  ZipLens_2.1.2_arm64-preview.zip
```

## 소스와 선택적 후원

대응 소스에는 해당 배포본의 전체 자체 소스, 빌드 스크립트·설정·잠금 파일, 실행·빌드에 쓰이는 Rust crate 소스와 npm 의존성의 상위 프로젝트 TypeScript 소스 아카이브를 함께 제공합니다. 공개 문서에는 재빌드 자료와 검증 요약을 남기며, 개인 작업 기록·원시 로그·콘텐츠 제작 초안은 별도로 비공개 보관합니다.

ZipLens 자체 코드는 **GNU GPL version 3 only (`GPL-3.0-only`)**이며 외부 구성요소에는 각각의 라이선스를 유지합니다. [라이선스](../LICENSE) · [배포 안내](DISTRIBUTION_KO.md)

공식 앱의 [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower), Bitcoin 후원은 선택 사항입니다. 수정본에 원작과 원작자 후원 링크를 남겨 달라는 안내도 자발적인 부탁이며 추가 라이선스 조건이 아닙니다.

---

## English

### ZipLens 2.1.2 — Multilingual layout and file-handling improvements

**October 18, 2026 · Apple Silicon preview**

This is an **ad-hoc signed preview without Apple Developer ID signing or Apple notarization**. macOS may block it from opening. Intel execution has not been verified. GitHub’s Latest label does not certify notarization.

### Changes since 2.1.1

- Long translated toolbar and selection controls wrap more reliably, with improved small-window dialogs, password visibility icons and Arabic RTL spacing. Mixed-language filenames retain their original text and separate display direction.
- Unsupported non-ASCII passwords for creating ZIP archives are rejected before output creation, with guidance to use 7Z for Unicode passwords. This is not a general restriction on filenames or extraction passwords.
- Reports distinguish names such as `a.txt` and `nested/a.txt`, export actual successful output paths and avoid guessing file sizes when renamed output cannot be matched reliably.
- Indexed size lookup removes repeated full-list searches in large report exports. Failure lists show the first 50 entries and the remaining count; TXT and CSV exports retain all results.
- New archives reject filenames that differ only by Unicode composition. Invalid UTF-8 CLI arguments and unsuitable archive inputs such as FIFOs or directories receive explicit errors.
- Clearer internal names and comments, code-reading and contribution guides, and introductions and usage guides in ten languages help users study and maintain the app. CLI command and JSON contracts are preserved.

### Validation and limits

All **202 newly rerun checks passed**: 69 frontend, 70 archive engine, 22 Tauri/CLI unit, 21 packaging and 20 actual-app CLI checks. **13 Unicode filename scenarios** also passed separately. The app CLI and Unicode checks used the optimized build before final packaging.

The comparison completed **40 archive round trips / 120 timed CLI commands** (14 round trips on 2.1.1 and 26 on the final packaged 2.1.2 app), covering one 4 GiB + 64 MiB ZIP64 file, 512 MiB of mixed files in all five creation formats, and 10,000 small files. Every filename, size and SHA-256 matched; source files and archives remained unchanged.

Large-ZIP compression and extraction timings were similar to the measured 2.1.1 ranges. Small-file extraction initially rose from a median **0.862 to 1.120 seconds**; a separate six-repeat follow-up still rose from **0.722 to 0.815 seconds (about 0.093 seconds / 12.8%)**. Ranges overlap and the cause remains unresolved, so we claim neither a speedup nor an absence of slowdown. For the 512 MiB corpus, 7Z compression’s sampled process-tree RSS peaked near **1.71 GiB**, substantially above ZIP.

No corruption, operation failures, hangs or release-blocking defects were found under these tested conditions. The optimized build and package checks passed, including ZIP CRC, extracted bytes, modes and signatures, and helper architecture/code consistency. These checks are not Apple notarization or a full GUI performance test.

The large-file comparison uses the installed 2.1.1 app and the new packaged app against identical synthetic files through their CLI. It exercises the app’s archive engine, not GUI responsiveness. See [conditions, timings, memory, integrity and limitations](LARGE_FILE_VALIDATION_2026-10-18.md).

Earlier native German and Arabic UI checks, multilingual ZIP round trips, 202 automated checks, 160 WebKit screen checks, 13 Unicode CLI scenarios and 26.58GB real-image tests remain separate historical evidence. They are not counted as newly rerun checks. These tests do not guarantee every format, hardware configuration or GUI workflow. Untagged legacy ZIP encoding and macOS app-bundle metadata limitations remain.

### Install, source and support

Download **ZipLens_2.1.2_arm64-preview.zip**, **ZipLens_2.1.2_source.tar.gz** and **SHA256SUMS.txt** from the [2.1.2 release](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.2). Finish ongoing work, quit old copies with ⌘Q, extract using macOS Archive Utility and place the complete app in Applications. Back up an old installation before replacing it and check **2.1.2** in About. With both archives and the checksum file together, use `shasum -a 256 -c SHA256SUMS.txt`.

The matching source archive includes the complete first-party source, build scripts, configuration, lockfiles, runtime/build Rust crate sources and upstream TypeScript source archives for npm dependencies. Public docs retain rebuild materials and validation summaries; personal logs and content drafts stay private.

Our guiding value of **basic software rights** is that everyone, regardless of income or language, can use essential digital tools and study, modify, share and contribute to their code. ZipLens’s own code remains **GPL-3.0-only**; third-party licenses are preserved. Official [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower) and Bitcoin support remain optional. Retaining the original project and author support links in modified versions is a voluntary request, not an additional license condition.

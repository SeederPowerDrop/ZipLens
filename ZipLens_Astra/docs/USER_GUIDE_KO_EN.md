# ZipLens 2.1.2 사용 설명서

**갱신: 2026-10-18 · macOS Apple Silicon용 프리뷰**

**2026-10-18 문서 보완:** [10개 언어별 소개·기능·사용 설명서](guides/README.md)를 추가했습니다. 다운로드 앱은 2.1.2이며 이후 `main`의 미배포 수정은 [변경 이력](../CHANGELOG.md)에서 구분합니다. 설치된 앱은 문서 갱신만으로 바뀌지 않습니다.

앱 안에서는 상단 **ⓘ → 사용 가이드**에서 인터넷 연결 없이 같은 기본 사용법을 열 수 있습니다. 내장 가이드는 한국어·영어·일본어·중국어(간체)·베트남어·스페인어·프랑스어·독일어·러시아어·아랍어를 지원합니다. 이 문서는 한국어와 영어로 설치부터 CLI까지 정리합니다.

[2.1.2 다운로드](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.2) · [업데이트 안내](RELEASE_2.1.2_KO_EN.md) · [English](#english)

## 설치와 업데이트

1. 릴리스의 `ZipLens_2.1.2_arm64-preview.zip`을 받습니다. 공부·수정·빌드에 필요한 대응 소스는 같은 릴리스의 `ZipLens_2.1.2_source.tar.gz`입니다. 이 배포본의 전체 자체 소스와 빌드 안내, 실행·빌드 Rust crate 소스, npm 의존성의 상위 프로젝트 TypeScript 소스 아카이브를 포함합니다.
2. 작업을 마친 뒤 실행 중인 구버전을 ⌘Q로 종료합니다. ZIP을 macOS 아카이브 유틸리티로 풀고 **`ZipLens.app` 전체**를 응용 프로그램 폴더 등 계속 사용할 위치에 둡니다.
3. 기존 앱을 교체할 때는 먼저 백업합니다. 앱을 열고 **ⓘ**에서 버전 `2.1.2`를 확인하세요. 이전 앱은 `ZipLens 2.0.app`이라는 이름일 수 있습니다.

이 배포본은 **Apple Developer ID 서명·Apple 공증을 완료하지 않은 ad-hoc 서명 프리뷰**입니다. macOS가 실행을 차단할 수 있으며 Intel Mac 실행은 검증하지 않았습니다. 실행이 막히면 [실행 문제 안내](MACOS_LAUNCH_KO.md)를 확인하세요.

## 파일 열기와 미리보기

- 압축 파일을 앱 창에 놓거나 상단 **열기**, 메인 화면의 **파일 선택**으로 선택하면 안의 목록을 먼저 표시합니다.
- 압축 파일만 여러 개 고르면 첫 번째 파일을 열고 안내를 표시합니다. 일반 파일·폴더가 함께 있으면 선택한 항목으로 새 압축을 준비합니다.
- 목록의 폴더를 한 번 클릭해 이동하고 검색창에서 파일명을 찾습니다. 경로 버튼으로 상위 폴더에 돌아갈 수 있습니다.
- 파일을 두 번 클릭하면 엽니다. 지원하는 이미지·텍스트는 크기 제한 안에서 앱에 표시하며, 그 밖의 파일은 임시로 풀어 기본 앱에서 엽니다. 작은 파일의 앱 내 미리보기 한도는 **20 MiB**입니다.

메인 화면의 **렌즈 그림**은 별도로 둘러볼 수 있습니다. 그림을 두 번 클릭하거나 키보드로 선택해 Enter·Space를 누르면 렌즈와 빛 패턴의 개념도·설명을 차례로 표시합니다. **두 렌즈로 돌아가기** 버튼이나 그림에 초점이 있을 때 Escape로 처음 모습에 돌아갑니다.

## 전체 또는 필요한 파일만 풀기

1. **전체 선택**을 누르거나 체크박스로 필요한 파일을 고릅니다.
2. **압축 해제**를 누르고 저장할 폴더를 선택합니다. 암호가 필요하면 안내에 따라 입력합니다.
3. 완료창에서 실제 저장 위치, 성공 파일과 오류를 확인합니다. 필요하면 Finder에서 결과를 확인합니다.

**알아서 풀기**는 원본 압축 파일 옆에 저장합니다. 선택한 최상위 항목이 여러 개면 압축 파일 이름의 폴더를 만듭니다. 기존 파일과 이름이 겹치면 안내를 확인한 뒤 처리 방식을 선택하세요. 취소하거나 일부 파일에 실패한 경우에도 이미 저장된 파일이 있을 수 있으므로 결과를 확인합니다.

분할 압축은 모든 조각을 같은 폴더에 둔 다음 첫 조각을 엽니다. 지원 여부는 형식과 변종에 따라 달라집니다.

## 새 압축 파일 만들기

파일·폴더를 창에 놓거나 선택하면 그 항목으로 압축 설정을 엽니다. 형식과 옵션을 정한 뒤 **선택한 항목 압축**을 누르고 이름·저장 위치를 지정합니다. **다시 선택**으로 입력을 바꿀 수 있습니다.

또는 **새로 압축**에서 형식과 대상 종류(파일 또는 폴더)를 정하고, **선택하고 압축**으로 원본과 저장 위치를 차례로 선택합니다.

| 형식 | 사용과 옵션 |
|---|---|
| ZIP | 일반적인 교환용. 암호·분할 압축 지원, 기본 암호화 AES-256 |
| 7Z | 암호·분할 압축 지원, 암호 지정 시 파일 목록도 암호화 |
| TAR | 여러 파일을 묶음. 자체 압축·암호·분할 옵션 없음 |
| TAR.GZ / TAR.ZST | TAR에 압축을 적용. 암호·분할 옵션 없음 |

**균형**으로 시작하고 필요에 따라 **빠르게** 또는 **최대 압축**을 선택하세요. 최대 압축은 더 오래 걸릴 수 있으며 용량 감소는 파일 종류에 따라 다릅니다. ALZ·EGG는 열기와 해제만 지원합니다. 전체 지원 확장자와 제한은 [앱 README](../README.md#지원-범위)에 있습니다.

ZIP 생성 암호는 출력 가능한 ASCII(영문·숫자·기호)를 사용합니다. 한글 등 Unicode 암호가 필요하면 7Z를 선택하세요. 파일명이나 기존 압축 파일을 해제할 때 입력하는 암호에 같은 언어 제한을 적용한다는 뜻은 아닙니다.

화면 언어와 파일명 인코딩은 별개입니다. UTF-8과 유효한 ZIP Unicode 경로 정보를 지원하지만, 인코딩 표시 없는 구형 ZIP은 한국어 CP949 호환 방식으로 해석합니다. 무태그 Shift-JIS/CP932·GBK·CP437 이름은 항상 자동 복원할 수 없으므로, 필요하면 제작자에게 UTF-8 ZIP이나 7Z로 다시 만들어 달라고 요청하세요. 압축 해제는 텍스트 내용의 인코딩을 변환하지 않습니다. [검증한 조건과 한계](VALIDATION.md)

## 언어와 기본 앱 설정

언어는 창 위에서 바꿉니다. 저장한 선택을 우선 사용하며 처음 실행할 때 지원하는 시스템 언어를 선택합니다. 지원 언어가 없으면 영어로 표시합니다. 운영체제 자체 창과 일부 압축 엔진 오류의 언어는 다를 수 있습니다.

**기본 압축 앱 설정** 또는 **ZipLens → 기본 압축 앱 설정… (⌘,)** 에서 연결할 파일 종류를 선택하고 적용합니다. 앱을 계속 사용할 위치에 둔 뒤 설정하세요. 이 설정은 Finder에서 파일을 두 번 클릭할 때 사용하는 앱을 지정하며 Finder의 우클릭 압축 기능은 바꾸지 않습니다. 체크를 해제하는 것만으로 이전 연결을 되돌리지는 않습니다.

## 정보·라이선스·후원

**ⓘ**에서 버전, 제작자, 사용 가이드, 라이선스와 후원을 확인합니다. **오픈소스 라이선스** 버튼은 ZipLens 자체 GPLv3 안내와 외부 구성요소 고지가 포함된 폴더를 Finder에서 엽니다.

ZipLens 자체 코드는 **GNU GPL version 3 only (`GPL-3.0-only`)**입니다. [LICENSE](../LICENSE)와 [소스·배포 안내](DISTRIBUTION_KO.md)를 확인할 수 있습니다. 외부 구성요소의 라이선스는 별도로 유지됩니다.

공식 앱의 [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower), Bitcoin 후원은 **선택 사항**입니다. Bitcoin은 정보창에서 수신 주소를 복사하거나 QR 코드를 볼 수 있습니다. 후원하지 않아도 앱과 소스를 사용할 수 있습니다. 수정본에 원작과 원작자 후원 링크를 남겨 달라는 요청 역시 추가 라이선스 조건이 아닙니다.

## AI·터미널 자동화

터미널 실행 권한이 있는 도구는 같은 앱 실행 파일을 직접 호출할 수 있습니다. 별도의 AI API 키나 서비스는 필요하지 않습니다. 아래 경로는 앱을 응용 프로그램 폴더에 둔 예시입니다.

```sh
ZIPLENS="/Applications/ZipLens.app/Contents/MacOS/ziplens"
"$ZIPLENS" cli capabilities
"$ZIPLENS" cli list "/path/to/archive.zip"
"$ZIPLENS" cli extract "/path/to/archive.zip" --destination "/path/to/output"
"$ZIPLENS" cli compress "/path/to/documents" --destination "/path/to/backup.zip" --format zip
```

결과는 JSON과 종료 코드입니다. `capabilities`로 버전과 지원 기능을 먼저 확인하세요. 저장 목적지는 필수이며 기존 파일은 기본적으로 다른 이름으로 보존합니다. 요청한 이름과 실제 파일명이 다를 수 있으므로 `result.output_paths`를 사용합니다. `--overwrite`는 기존 파일을 교체하려는 경우에만 지정합니다.

CLI의 암호는 `--password-stdin`으로 전달하며 현재 CLI에는 분할 압축 생성 옵션이 없습니다. 정확한 선택 이름, 암호 전달, 시간 제한과 오류 코드는 [AI/CLI 설명서](AI_CLI.md)에 있습니다. `.app`에서 실행 파일만 꺼내면 필요한 보조 프로그램이 없어질 수 있으므로 앱 전체를 유지하세요.

---

## English

### ZipLens 2.1.2 user guide

**Updated October 18, 2026 · macOS Apple Silicon preview**

**Documentation update, October 18, 2026:** [Introduction, features and guides in ten languages](guides/README.md) are now available. The downloadable app is 2.1.2; see the [changelog](../CHANGELOG.md) for unreleased source changes. Documentation updates do not replace your installed app.

Open **ⓘ → User guide** for basic instructions without an internet connection. The bundled guide supports Korean, English, Japanese, Simplified Chinese, Vietnamese, Spanish, French, German, Russian and Arabic.

### Install or update

Download **ZipLens_2.1.2_arm64-preview.zip** from the [2.1.2 release](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.2). The same release provides **ZipLens_2.1.2_source.tar.gz** for studying, modifying and building the app, including its complete matching first-party source, build instructions, runtime/build Rust crate sources and upstream TypeScript source archives for npm dependencies. Finish ongoing work and quit an older copy with ⌘Q. Extract with macOS Archive Utility and place the complete **`ZipLens.app`** in Applications or another permanent location. Back up an older installation before replacing it, then confirm version `2.1.2` in About. Older copies may be named `ZipLens 2.0.app`.

This is an **ad-hoc signed preview without Apple Developer ID signing or notarization**. macOS may block it from opening. Intel Mac execution has not been verified.

### Open and preview

Drop an archive onto the window or choose **Open / Choose files** to see its contents. If you select only archives and there are several, the first opens with a notice. A selection containing regular files or folders instead prepares a new archive.

Click folders to browse, use path buttons to go back, and search by filename. Double-click a file to open it. Supported small images and text can be previewed in the app, with a **20 MiB** limit; other files are extracted temporarily and opened in their default app.

You can also explore the **home lens illustration**: double-click it or focus it and press Enter/Space to see conceptual lens and beam diagrams with explanations. Choose **Back to the pair**, or press Escape while focus is within the illustration, to return to its opening view.

### Extract files

Use **Select All** or check only the files you need. Choose **Extract Archive**, select a destination and enter a password if prompted. Review the actual output locations and any errors in the completion report.

**Smart Extract** saves beside the source archive and creates an archive-named folder when the selection has several top-level items. Review prompts when existing filenames conflict. Cancellation or a partial failure can leave already completed files, so check the report. For split archives, keep every part together and open the first part; supported variants depend on the format.

### Create an archive

Drop or select regular files or folders to open compression settings, choose a format and options, then choose **Compress selected items** and a destination. **Choose again** changes the input. Alternatively, choose **Create Archive**, select a format and source type, then **Select and compress** to choose the input and destination.

The app creates **ZIP, 7Z, TAR, TAR.GZ and TAR.ZST**. ZIP and 7Z support passwords and split archives in the GUI. ZIP uses AES-256 by default; 7Z also encrypts its file list when a password is set. TAR only bundles files. TAR variants do not offer password or split options. ALZ and EGG can be opened and extracted, but not created.

Start with **Balanced**. **Fast** prioritizes speed, while **Maximum** may reduce size further and take longer. Results depend on the source files.

ZIP creation passwords require printable ASCII characters. Choose 7Z for accented letters or other Unicode passwords. This does not impose the same restriction on filenames or passwords entered when extracting existing archives.

Interface language and filename encoding are separate. UTF-8 and valid ZIP Unicode-path metadata are supported; untagged old ZIP names use a Korean CP949-compatible fallback. Untagged Shift-JIS/CP932, GBK or CP437 names cannot always be recovered automatically. If necessary, ask the creator to remake the archive as UTF-8 ZIP or 7Z. Extraction does not convert text-file contents to another encoding. See the [validation conditions and limits](VALIDATION.md).

### Language and default app

Change the language at the top of the window. Saved preferences take priority, followed by a supported system language, then English. OS dialogs and some engine errors may use a different language.

Choose **Default archive app** or the corresponding **ZipLens menu item (⌘,)**, select file types and apply. Do this after placing the app where it will remain. It changes which app opens files from Finder, not Finder's contextual Compress command. Unchecking a type alone does not restore its earlier association.

### About, licensing and optional support

**ⓘ** contains the version, author, guide, licenses and support. **Open-source licenses** opens the folder containing ZipLens's GPLv3 notice and third-party notices in Finder. ZipLens's own code uses **GNU GPL version 3 only (`GPL-3.0-only`)**; third-party components retain their licenses. See [LICENSE](../LICENSE).

[Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower) and Bitcoin support are **optional**. Bitcoin address copy and QR options are in About. Donations are not required to use the app or source. The request to retain the original project and author support links in modified versions is voluntary, not an additional license condition.

### AI tools and terminal automation

Tools with terminal access can invoke the same app executable directly; no AI service or API key is required. The shell example above assumes installation in Applications. Commands include `capabilities`, `list`, `extract` and `compress`, and return JSON with exit codes without opening windows.

Check `capabilities` first. Extraction and compression require explicit destinations. Existing files are preserved under different names by default, so use `result.output_paths` for the actual results. Use `--overwrite` only when replacement is intended. Passwords use `--password-stdin`; split-archive creation is currently available only in the GUI. Keep the whole `.app`, including its helper executables. See the [CLI reference](AI_CLI.md) for exact selection names, password handling, timeouts and errors.

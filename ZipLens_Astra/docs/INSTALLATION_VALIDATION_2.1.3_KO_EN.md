# ZipLens 2.1.3 설치 검증 / Installation validation

2026-10-19 · Apple Silicon용 ad-hoc 서명 프리뷰

## 배포 형식과 실행 허용은 별개입니다

DMG에는 `ZipLens.app`, 응용 프로그램 폴더를 가리키는 `Applications` 바로가기, 설치 안내가 들어 있습니다. 파일 복사가 끝나면 이미지를 꺼내고 응용 프로그램 폴더의 앱을 실행합니다. DMG를 열기 위해 ZipLens를 먼저 설치할 필요가 없습니다. Finder의 디스크 이미지 마운터를 사용합니다.

이 배포본에는 **Apple Developer ID 서명·공증이 없습니다**. DMG 무결성 검사와 앱의 로컬 서명 검사를 통과하더라도 다른 사용자의 Mac에서 실행이 허용된다는 뜻은 아닙니다. 현재 작업 Mac에서 유효한 배포 서명 인증서가 0개임을 확인했습니다. 공식 서명·공증을 완료한 배포판은 별도 준비가 필요합니다.

## 확인한 결과 / Observed results

대상 파일 / Artifact: `ZipLens_2.1.3_arm64-preview.dmg` · **19,875,599 bytes**

SHA-256: `200a42f245428d8e01a8a2cc5d62ca0394ee2c641ac67da3bab5843d34de3f2f`

| 단계 / Step | 결과 / Result | 범위 / Scope |
|---|---|---|
| 로컬 DMG 무결성·마운트 / Local DMG integrity and mount | 통과 / Passed | `hdiutil` 검증 및 이미지 열기 / Image verification and mounting |
| DMG에서 앱 복사 / Copy app from DMG | 통과 / Passed | 앱 전체 복사 및 282개 파일 대조 / Whole app copied; 282 app files compared |
| 앱 서명·CLI / App signature and CLI | 통과 / Passed | deep/strict 서명 검사와 실제 CLI 실행 / Deep/strict signature verification and actual CLI execution |
| 이 Mac의 설치본 / Installation on this Mac | 통과 / Passed | `/Applications`의 2.1.3 설치본과 실제 한국어 홈 / Installed 2.1.3 and native Korean home screen |
| 실제 도움말 연결 / Native Help link | 통과 / Passed | 한국어 GitHub `guides/ko.md` URL이 브라우저에서 열림 / Korean guide URL opened in a browser |
| 시험용 quarantine의 Gatekeeper / Gatekeeper with synthetic quarantine | **차단 / Rejected** | 별도 앱 복사본: 종료 코드 3, `rejected` / Separate app copy: exit 3, `rejected` |
| 유효한 배포 서명 인증서 / Valid distribution signing identities | **0개 / None** | Developer ID 서명·Apple 공증 없음 / No Developer ID signing or Apple notarization |
| GitHub 릴리스에서 실제 재다운로드 / Actual download from GitHub release | **통과 / Passed** | 초안 릴리스에서 gh CLI로 다운로드, SHA-256·실제 마운트·복사·282개 파일/권한/서명 대조 / Downloaded from the draft release with gh CLI; SHA-256, mount, copy, 282 files, modes and signature verified |


시험용 quarantine 검사는 로컬 빌드의 별도 복사본에 격리 속성을 부여해 수행했습니다. 실제 웹 브라우저 다운로드가 생성한 격리 정보나 새 Mac에서의 실행을 재현했다고 주장하지 않습니다. 관측한 거부 결과는 이 프리뷰가 기본 Gatekeeper 정책을 통과하지 못할 수 있다는 제한을 보여 줍니다. DMG 파일 형식을 추가하는 것만으로 이 제한이 해소되지 않습니다.

The quarantine assessment used a separate copy of the locally built app with a synthetic quarantine attribute. It is not evidence of browser-generated download quarantine or execution on a second Mac. The observed rejection documents a preview limitation; changing the distribution format to DMG does not resolve it.

이번 자동 검사는 프런트엔드 75 + 패키징 32 + 앱 CLI 20 = **127개 통과**, 별도 Unicode CLI **13개 통과**, WebKit **160개 화면 상태 / 실패 0개**, 별도 애니메이션 활성 상태의 패널 반복 열기 **6회 통과**입니다. 화면 검사의 IPC·네이티브 대화상자는 모의 처리했습니다. 실제 네이티브 확인에는 한국어 홈·정보창과 도움말 연결, 영어 정보창, 프랑스어 압축 설정 표시·취소가 포함됩니다. 파일 선택 자동 조작에 제약이 있어 이번 2.1.3에서 GUI 압축·해제 왕복을 완료했다고 주장하지 않습니다. [전체 검증 이력](VALIDATION.md).

Current checks passed: **127 automated checks** (75 frontend, 32 packaging and 20 app CLI), **13 separate Unicode CLI scenarios**, and **160 WebKit screen states with zero failures**, plus **six repeated panel openings with motion enabled**. The screen tests mock IPC and native dialogs. Native observations cover Korean Home/About and Help routing, English About, and French compression controls/cancellation. File-picker automation was limited; this is not a completed native GUI archive round trip for 2.1.3. The large-file performance figures elsewhere are historical **2.1.2 measurements, not a 2.1.3 rerun**.


## 설치할 때 문제가 생기면

- 이미지를 열지 못하면 공식 릴리스의 DMG와 `SHA256SUMS.txt`를 다시 받고 파일의 SHA-256을 대조합니다. DMG 자체를 ZipLens로 여는 대신 Finder의 **다음으로 열기 → 디스크 이미지 마운터**를 사용합니다.
- 구버전에서 진행 중인 작업을 마치고 ⌘Q로 종료한 뒤 앱 전체를 복사합니다. 일부 파일만 교체하지 않습니다. 앱은 DMG 안에서 계속 사용하지 말고 응용 프로그램 폴더로 복사합니다.
- 개발자를 확인할 수 없거나 공증을 확인할 수 없다는 경고는 다운로드 손상과 다를 수 있습니다. 출처·체크섬을 확인한 뒤 해당 버전 macOS의 [Apple 공식 안내](https://support.apple.com/102445)를 따르세요. 시스템 전체의 Gatekeeper를 끄거나 격리 속성을 일괄 삭제하는 방법은 권장하지 않습니다.
- 관리형 Mac은 조직 정책으로 실행을 허용할 수 없을 수 있습니다. Intel Mac과 다른 macOS 버전은 이번 실제 설치 검사 대상이 아닙니다.
- 문제를 신고할 때에는 ZipLens 버전, Mac 칩·macOS 버전, 경고 문구와 발생 단계(다운로드/DMG 열기/복사/실행)를 알려 주세요. 개인 파일이나 비밀번호를 공개 이슈에 올리지 마세요.

## English

The DMG contains `ZipLens.app`, an `Applications` shortcut and installation instructions. Copy the whole app, eject the image and launch the installed copy. Use Finder’s DiskImageMounter to open the DMG; ZipLens itself is not needed to install ZipLens.

**This preview is not Developer ID-signed or notarized by Apple.** Image integrity and a valid local ad-hoc app signature do not establish Gatekeeper acceptance on another Mac. This build machine has no valid distribution signing identity. A notarized distribution requires separate signing and notarization setup.

The verification table above distinguishes successful copying and local execution from macOS trust-policy rejection. It does not represent tests on a second physical Mac, a fresh macOS account, Intel hardware or all supported OS releases.

If installation fails, download the official DMG again and compare its SHA-256 with `SHA256SUMS.txt`. Quit older copies, copy the entire app and use the copy in Applications. For developer-verification or notarization warnings, follow [Apple’s guidance](https://support.apple.com/102445) after verifying the source and checksum; do not disable Gatekeeper system-wide or remove quarantine attributes in bulk. Managed devices may enforce additional restrictions.

[7개 언어 릴리스 안내 / Release notes](RELEASE_2.1.3_MULTILINGUAL.md) · [간단한 사용법 / Quick guides](guides/README.md) · [2.1.2 성능 측정 / Benchmark provenance](LARGE_FILE_VALIDATION_2026-10-18.md)

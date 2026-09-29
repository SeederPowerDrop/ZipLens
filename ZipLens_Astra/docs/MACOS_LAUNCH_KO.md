# macOS 다운로드 앱 실행 문제

## 2026-09-13 진단

GitHub에서 받은 `ZipLens_2.0.0_arm64.zip`을 직접 검사했습니다.

- 크기: 12,843,073 bytes.
- SHA-256: `da2163051e14e314849bbd0f3fb547114308d6aeb72c9fc5eb7663e9537efb10` — 게시된 릴리스의 해시와 일치.
- ZIP CRC 검사, macOS `ditto` 압축 해제, 추출 앱의 `codesign --verify --deep --strict` 검사 통과.
- 다운로드 ZIP에는 브라우저가 설정한 `com.apple.quarantine` 속성이 있습니다.
- 앱 서명은 `adhoc`, 개발자 Team ID는 없고 Apple 공증도 없습니다. 추출 앱의 실제 Gatekeeper 검사(`spctl --assess`)는 `rejected`로 종료했습니다.

따라서 검사한 ZIP의 다운로드 손상은 발견되지 않았습니다. 아래 두 문제는 별개입니다.

## 1. Finder에서 파일을 열 때 앱이 곧바로 종료됨

앱을 완전히 종료하고 Finder에서 샘플 ZIP을 더블클릭하자 기존 2.0.0 앱이 종료됐고, `applicationDidFinishLaunching` 중 Rust panic으로 `SIGABRT` 충돌 기록이 생성됐습니다.

macOS는 앱 초기화가 끝나기 전에 파일 열기 요청을 전달할 수 있습니다. 기존 코드는 그때 `main` 창을 생성했고, Tauri 초기화가 같은 창을 다시 만들면서 중복 라벨 오류가 발생했습니다.

**2.0.1 수정:** 창 생성은 Tauri 초기화에 맡깁니다. 먼저 도착한 파일 요청은 대기열에 보관하고 화면 준비 후 처리합니다. 이미 열린 창은 기존대로 표시·복원하며, 창을 닫아 숨긴 뒤 다시 파일을 열 수 있습니다. 초기 파일 요청 → Tauri 초기화 → 단일 창 생성 → 요청을 한 번만 처리하는 순서를 회귀 검사합니다.

## 2. “손상되어 열 수 없음” 등의 macOS 실행 차단

파일 내용과 로컬 서명이 일치해도 Apple이 확인한 배포자인지, 공증을 받았는지는 별도입니다. 기존 패키징은 ad-hoc 서명만 검사하고 정식 배포에 필요한 검증을 빠뜨렸습니다. [Apple의 서명·공증 설명](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

**배포 수정:** 기본 패키징은 Developer ID 인증서와 기존 공증 프로필을 요구합니다. 보조 프로그램부터 서명하고 공증 승인·티켓 첨부를 거친 뒤 ZIP을 다시 만듭니다. 이 ZIP을 새 임시 폴더에 풀어 파일·권한·서명·티켓·Gatekeeper 허용을 검사합니다. 하나라도 실패하면 배포 파일을 교체하지 않습니다. [Apple의 ZIP 공증 절차](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

현재 작업 Mac에는 사용 가능한 Developer ID 인증서가 없어 **정식 서명·공증 완료 여부는 미검증**입니다. 시작 오류를 고친 프리뷰도 공증이 없으면 다운로드 시 차단될 수 있습니다.

## 로컬 프리뷰와 정식 배포

`ZipLens_Astra` 폴더에서 실행합니다.

```sh
npm run tauri build -- --bundles app
# 로컬 개발·검증용. Gatekeeper 승인 결과물이 아닙니다.
python3 scripts/package-macos.py --preview

# 키체인에 미리 설정한 실제 인증서와 프로필 사용
python3 scripts/package-macos.py \
  --signing-identity "Developer ID Application: YOUR NAME (TEAMID)" \
  --notary-profile "YOUR_NOTARY_PROFILE"
```

프리뷰는 `release_build/preview`, 정식 배포는 `release_build`에 앱·ZIP·체크섬·검증 기록을 각각 저장합니다. 환경 변수 `ZIPLENS_SIGNING_IDENTITY`, `ZIPLENS_NOTARY_PROFILE`로 같은 값을 지정할 수도 있습니다. 프리뷰 생성이 기존 정식 결과물을 덮어쓰지 않습니다.

## 기존 다운로드 파일 확인

ZIP 자체가 풀리지 않으면 같은 릴리스의 ZIP과 `SHA256SUMS.txt`를 다시 받은 뒤 다운로드 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`로 비교합니다. 압축 해제가 ZipLens로 연결되어 구버전 앱이 종료된다면 Finder의 **다음으로 열기 → 압축 유틸리티**로 ZIP을 풀 수 있습니다.

앱 실행 차단은 새 ZIP으로 묶는 것만으로 해소되지 않습니다. 공증된 배포판이 필요하며, macOS의 경고와 허용 절차는 [Apple 지원 안내](https://support.apple.com/102445)를 참고하세요.

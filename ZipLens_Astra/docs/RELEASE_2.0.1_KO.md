# ZipLens 2.0.1 프리뷰 — Finder 시작 오류 수정

앱을 완전히 종료한 상태에서 Finder로 압축 파일을 열면 곧바로 종료되던 문제를 수정했습니다. README에는 실제 메인 화면과 한글 압축 파일 미리보기 스크린샷을 추가했습니다.

> **Apple Silicon Mac용 프리뷰입니다. Apple Developer ID 서명·공증을 완료하지 않았으므로 macOS의 ‘손상되어 열 수 없음’ 등 실행 차단은 남을 수 있습니다.** 이번 버전은 Finder 시작 중 종료 오류를 수정했으며, 공증된 정식 배포판은 아닙니다.

## 다운로드와 설치

1. 실행 중인 구버전 ZipLens를 메뉴의 종료(⌘Q)로 완전히 종료합니다. 홈 폴더 등에 같은 앱의 복사본이 있다면 함께 확인하세요.
2. 첨부된 **ZipLens_2.0.1_arm64-preview.zip**과 **SHA256SUMS.txt**를 받습니다.
3. 구버전이 ZIP 기본 앱으로 연결되어 있으면 ZIP을 우클릭해 **다음으로 열기 → 아카이브 유틸리티(압축 유틸리티)**로 풉니다.
4. `ZipLens 2.0.app`을 사용할 위치에 둡니다. 기존 설치본을 교체할 경우 먼저 백업하세요.

다운로드가 손상되었는지 확인하려면 두 파일이 있는 폴더에서 `shasum -a 256 -c SHA256SUMS.txt`를 실행합니다. 체크섬 일치는 Apple 공증을 대신하지 않습니다. 실행 차단과 macOS의 허용 절차는 [Apple 지원 안내](https://support.apple.com/102445)를 참고하세요.

## 수정 내용

- **Finder 시작 오류:** 앱 준비 전에 도착한 파일 요청을 보관하고, 창은 초기화 과정에서 한 번만 생성합니다.
- **배포 검증:** 정식 패키징에 Developer ID 서명, Apple 공증 승인, 티켓 첨부, ZIP을 실제로 푼 앱의 Gatekeeper 검사를 필수로 추가했습니다. 인증서가 없으면 정식 파일 생성을 중단합니다.
- **프리뷰 분리:** 개발 프리뷰가 정식 앱·체크섬·검증 기록을 덮어쓰지 않도록 출력 폴더를 분리했습니다.
- **README:** 실제 앱 스크린샷 2장과 실행 오류 안내를 추가했습니다.

## 검증

기존 2.0.0 ZIP은 게시 해시·CRC·재추출 서명 검사를 통과했습니다. 별도로 Finder에서 시작 중 종료되는 문제를 재현한 뒤, 2.0.1에서는 한글 샘플 ZIP의 8개 파일이 정상 표시되는 것을 확인했습니다. 수정 ZIP도 실제 압축 해제 후 내용·실행 권한·서명 검사를 통과했습니다.

자동 검사 **101개**가 통과했습니다(압축 엔진 61개, 프런트엔드 13개, Tauri 라이브러리 8개, 패키징 19개). 세부 결과와 한계는 [검증 기록](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.1/ZipLens_Astra/docs/VALIDATION.md)에 있습니다. Apple 공증은 사용 가능한 인증서가 없어 실행하지 않았습니다. Intel Mac 실행은 검증하지 않았습니다.

- [앱 화면과 사용법](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.1/README.md)
- [상세 원인과 배포 방법](https://github.com/SeederPowerDrop/ZipLens/blob/v2.0.1/ZipLens_Astra/docs/MACOS_LAUNCH_KO.md)
- [문제 신고](https://github.com/SeederPowerDrop/ZipLens/issues/new)

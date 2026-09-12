# ZipLens 배포·라이선스 안내

ZipLens를 무료로 제공하고 후원이나 광고로 운영할 수 있도록, **공개된 이용 조건에서 상업적 사용을 허용하는 구성요소**를 채택한다. 무료 배포라는 이유만으로 비상업적 이용 조건을 충족한다고 판단하지 않는다. 이 문서는 실제 채택 구성요소와 고지·소스 제공 조치의 기록이며 법적 무문제 보증은 아니다.

## 채택한 엔진

| 구성요소 | 용도 | 적용 조건과 처리 |
|---|---|---|
| 공식 7-Zip 26.03 `7zz` | 7Z 및 여러 추가 형식의 목록·해제, 일부 압축 생성 | 공식 실행 코드를 별도 프로세스로 실행하고 앱 포장 시 로컬 ad-hoc 서명을 추가. LGPL-2.1-or-later, unRAR 제한, BSD 고지 전문과 같은 버전의 완전한 공식 소스를 함께 제공 |
| alkegi/unalz 0.2.1 | ALZ 해제 | MIT 저작권·허가문 유지. 버전 고정 |
| alkegi/unegg 0.2.1 | EGG 해제 | MIT 저작권·허가문 유지. 버전 고정 |
| libazo 및 하위 의존성 | EGG 압축 방식 등 | 각 구성요소별 라이선스·저작권 고지 수집. 단순히 상위 프로젝트의 MIT 표시로 대체하지 않음 |
| Tauri·Rust·프런트엔드 의존성 | 앱과 기본 압축 엔진 | 잠금 파일의 실제 버전별 고지 수집. MPL 구성요소에는 해당 버전 소스도 포함 |

공개된 MIT 조건은 소프트웨어의 이용·변경·배포·판매를 허용하면서 저작권과 허가문 유지를 요구한다. 앱 개발자 자신의 모든 코드를 MIT로 공개해야 한다는 뜻은 아니다. 여러 라이선스 중 선택할 수 있는 구성요소와 고유 라이선스 파일은 생성된 목록에서 원문을 확인한다. [MIT 전문](https://opensource.org/license/mit), [unalz](https://github.com/alkegi/unalz/blob/master/LICENSE), [unegg](https://github.com/alkegi/unegg/blob/master/LICENSE)

ESTsoft 공식 EGG SDK와 Bandisoft Ark SDK는 포함하지 않았다. ESTsoft 공식 패키지의 비상업적 이용 조건은 별도의 확인·승인 없이 후원·광고 앱에 적합하다고 가정하지 않는다. 반대로 그 SDK 조건을 독립 구현 전체에 자동 적용하지도 않는다. [ESTsoft 공식 FAQ](https://altools.co.kr/service/FAQ?menu=QA01&no=262&submenu=QA01002), [Ark 안내](https://kr.bandisoft.com/ark/)

RAR·ALZ·EGG 파일 **생성**은 구현하지 않는다. 특히 unRAR 유래 소스를 RAR 압축 알고리즘을 재현하는 데 이용해서는 안 된다. 7-Zip은 상용 앱에서 사용할 수 있지만, 배포 시 라이선스·소스 제공 의무가 남는다. [7-Zip FAQ](https://www.7-zip.org/faq.html), [7-Zip 공식 릴리스](https://github.com/ip7z/7zip/releases/tag/26.03)

## 사용자가 받는 자료

앱의 **프로그램 정보 → 오픈소스 라이선스** 버튼은 앱 내부의 `Contents/Resources/legal` 폴더를 Finder에서 연다. 인터넷 연결이 없어도 원문을 읽고 동봉 소스를 복사할 수 있다.

- `README.txt`: 사용한 소프트웨어와 자료 안내.
- `7zip/`: 실제 동봉 버전의 원본 저작권·라이선스, LGPL 전문, 공식 26.03 소스 압축 파일, 출처와 SHA-256, 빌드·교체 안내.
- `third-party/`: 버전·출처·라이선스 목록, 원문, MPL 해당 소스 압축 파일.

소스 제공을 앞으로 응답할 서면 약속에만 의존하지 않고 **배포 앱 안에 해당 소스를 직접 포함**했다. 앱을 ZIP으로 배포하거나 다른 경로로 재배포할 때 이 폴더를 제거하지 않는다. 7-Zip 실행 코드와 소스는 변경하지 않았다. 앱 묶음의 무결성을 위해 추가하는 로컬 ad-hoc 서명은 실행 파일 바이트를 바꾸므로, 공식 입력 해시와 서명 후 해시를 구분해 기록한다. 이는 Developer ID 서명·공증을 대신하지 않는다. 출처·해시는 `sidecar-provenance.json`에 기록한다.

개발자 자신의 앱 코드에 새 라이선스를 자동으로 지정하지 않았다. 앱의 배포 정책과 제3자 구성요소의 권리는 구별한다. 오픈소스 원문에 포함된 출처·면책·추가 안내도 보존한다. SDK에서 유래한 선언 등 upstream이 명시한 법적 불확실성을 라이선스 배지만 보고 해결되었다고 표현하지 않는다.

## 의존성을 변경한 뒤

두 Rust 잠금 파일과 `package-lock.json`을 유지한다. 앱과 ALZ·EGG 보조 프로그램은 각각의 잠금 파일로 빌드하므로 고지는 두 의존성 집합을 포함해야 한다.

```sh
python3 scripts/generate-third-party-notices.py
python3 scripts/generate-third-party-notices.py --check
python3 scripts/prepare-distribution.py
# Tauri release 빌드 후 로컬 배포 ZIP 생성
python3 scripts/package-macos.py
```

생성기가 보고하는 누락·미확인 항목을 해결하고, 새 라이선스·출처·copyleft 의무를 검토한 뒤 배포한다. `prepare-distribution.py`는 공식 배포 자료의 해시 및 고지 검증을 통과해야 보조 프로그램을 빌드한다. Tauri 빌드에도 연결되어 있어 자료 누락을 조용히 무시하지 않는다.

## 공개 배포 전 남은 일

- 현재 로컬 결과물은 Apple Silicon용이며 Apple Developer ID 서명·공증을 완료하지 않았다. 일반 사용자의 실행 편의를 위해 서명·공증 후 최종 배포 ZIP을 검사한다. 현재 Mac의 읽기 전용 인증서 조회에서 Developer ID Application 인증서가 0개였다. Apple 계정·인증서 설정은 이번 작업에서 변경하지 않았다.
- Intel Mac 배포를 약속하기 전에 해당 아키텍처로 앱과 보조 프로그램을 빌드하고 실제 동작을 검사한다.
- 모든 ALZ·EGG·RAR 변종의 호환성을 보증하지 않는다. 안전 한도·지원 방식 및 실행한 검사는 `VALIDATION.md`에 구분해 남긴다.
- 광고 기능을 실제 추가할 때는 해당 광고 SDK의 이용 조건과 개인정보 처리 방식을 별도로 확인한다. 이번 변경은 광고 SDK·결제 기능을 추가하지 않는다.

법적 확정 판단이 필요한 공개 배포 계약·정책은 채택 버전과 이 고지 자료를 바탕으로 검토할 수 있다. 이 기록은 공개된 이용 조건을 이행하기 위한 기술적 조치이며, 모든 관할의 지식재산권·상표권 등을 조사한 의견서는 아니다.

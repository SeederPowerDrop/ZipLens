# ZipLens 2.0 개발자 노트

## 소유권과 작업 경계

원본 프로젝트를 바꾸지 않기 위해 `ZipLens_Astra`에 복사했습니다. 원본 `index.html`, Rust/TS/CSS에는 작업 시작 전부터 staged/unstaged 변경이 있었으므로 이를 정리·커밋·되돌리지 않았습니다. 새 변경은 이 디렉터리에만 있습니다. `scripts/verify-originals.py`로 158개 원본 파일을 검사할 수 있습니다.

이 문서는 다음 개발자나 AI가 변경 이유를 이해하고, 위험한 구현으로 되돌아가지 않게 하기 위한 기록입니다.

## 앱 이름과 버전

2026-09-06 사용자 요청으로 임시 이름 ZipLens Astra 1.4.0을 **ZipLens 2.0 / 2.0.0**으로 확정했습니다. `tauri.conf.json`, NPM/Rust 패키지와 lockfile 버전, 창 제목, 7개 언어의 제목, macOS 메뉴, 정보 화면을 함께 맞춥니다. 이후 버전 변경 시 `index.html`의 정보 화면 버전도 갱신합니다.

작업 폴더 `ZipLens_Astra`와 내부 crate 이름은 유지합니다. 기존 개발판의 설정을 이어 쓰고 원본 앱과 구분하도록 앱 식별자 `com.ziplens.astra`도 유지합니다. 이 값은 사용자에게 표시되는 앱 이름이 아닙니다.

## 렌즈를 작업 UI에 통합

2026-09-08 사용자가 의도를 명확히 했다: 정지 아이콘 삽입보다 압축/해제의 의미를 렌즈로 표현한다. `app-icon.jpg`/`src-tauri/icons`의 원래 그림은 macOS 앱 아이콘과 favicon에 유지하고, 화면 안에서는 `src/lens-scene.ts`와 `src/lens-scene.css`의 SVG를 사용한다.

- 압축 해제: 얇은 중심과 두꺼운 가장자리의 오목렌즈. 왼쪽 평행광이 렌즈를 지나 오른쪽으로 확산.
- 압축: 두꺼운 중심의 볼록렌즈. 왼쪽 평행광이 오른쪽 초점으로 수렴한 뒤 하나의 빔으로 이어짐. 이는 압축을 표현하는 시각적 은유이며 광학 시뮬레이터는 아니다.
- `setProcessing(true, operation, optionalStatus)`의 타입으로 `extract`/`compress`/`preview`를 전달한다. 번역된 상태 문자열에서 Extract/Compress를 검색하지 않는다. 첫 화면과 압축 설정은 정지 상태로 표시한다.
- 실제 작업 중 다섯 개 경로의 CSS stroke-dashoffset만 애니메이션한다. 종료/취소 요청/암호 대기 시 정지하며 별도 requestAnimationFrame 루프나 인위적인 작업 지연을 넣지 않는다.
- 수치/진행 바는 백엔드 이벤트를 그대로 사용한다. null은 미정이며 광선의 반복 주기로 진행률·남은 시간을 만들어 내지 않는다. 완료 대화상자를 기다리는 동안에도 빛은 정지한다.
- 진행 화면을 첫 viewport 안에 보이게 기존 파일 목록/입력 화면을 일시적으로 숨기며 DOM과 선택 상태는 보존한다. 처리가 끝나면 기존 화면으로 돌아간다.
- 각 SVG의 gradient ID는 home/compression/progress/completion마다 다르다. 수평 중앙 광선에도 색이 나오도록 beam gradient에 `userSpaceOnUse`를 사용한다. objectBoundingBox는 높이 0인 경로에서 표시가 사라질 수 있다.
- macOS `prefers-reduced-motion`에서는 광선 이동과 미정 진행 바를 멈추고 도형·텍스트·실측 진행률만 유지한다. 정보 화면의 제작자 이미지는 별개로 유지한다.

`tests/lens-scene.test.ts`는 번역에 독립적인 모드 선택, 미리보기/정지 상태, 미정/잘못된 진행률, 중복 gradient ID와 중앙 광선 누락을 검사한다. 실제 WebView의 렌더링 검증은 별도로 기록한다.

## 압축·압축 해제 완료 화면

2026-09-08 압축 성공에 쓰던 네이티브 `message()`와 압축 해제 보고서를 `showArchiveReport(report, operation)`의 공통 대화상자로 통일했다. 성공 시 기존 `LensScene`을 재사용하며 압축은 볼록렌즈의 수렴, 해제는 오목렌즈의 확산을 정지 상태로 보여 준다. `cancelled`가 참이거나 실패 파일이 있으면 기존 경고 아이콘·상태 문구·실패 목록을 표시한다. 부분 완료나 취소를 성공 그림으로 바꾸지 않는다.

- `showArchiveReport()`는 닫기 또는 Escape로 해제되는 `Promise<void>`를 반환한다. 호출부가 이를 기다리고 `finally`에서 `setProcessing(false)`를 실행하므로 Finder/CLI에서 대기 중인 다음 작업이 현재 보고서를 덮어쓰지 않는다.
- 보고서를 여는 시점에 광선 애니메이션과 경과 시간 타이머를 멈추고 진행 화면을 숨기며 취소 버튼을 비활성화한다. 화면용 `app.dataset.processing`은 해제하되 내부 `isProcessing`은 닫을 때까지 유지한다. 완료 대화상자 대기를 작업 시간으로 세지 않는다.
- 암호 재입력 경로의 validator는 추출 결과를 저장하고 성공 여부만 반환한다. `requestPassword()`가 입력창을 정리한 다음 공통 보고서를 기다린다. validator 안에서 보고서 닫기를 기다리면 암호 입력창 정리가 지연된다.
- 압축 결과에는 Finder에서 보기와 닫기만 표시한다. 해제 결과에는 상세 목록·TXT/CSV 내보내기를 유지하고, 취소·오류 없이 파일 하나를 추출했으며 실제 출력 경로가 있을 때 파일 열기를 제공한다. 매번 상세 영역·버튼 표시·내보내기 핸들러·아이콘 스타일을 설정해 이전 작업의 상태가 남지 않게 한다.
- Finder 버튼은 보고서를 열 때 결과 경로를 캡처한다. 압축 결과의 Finder 호출이 실패하면 결과 파일의 상위 폴더를 열어 압축 파일 자체를 다시 실행하지 않는다.
- 보고서가 열린 동안 배경 `#app`에 `inert`를 적용하고 닫을 때 해제한다. 보고서의 표시 상태와 `aria-hidden`을 동기화하며 닫기 버튼에 포커스를 두고 Tab 이동을 보고서 안에 유지한다.
- WebKit에서 마우스로 버튼을 누르면 초점이 body에 남을 수 있어, 보고서를 연 동안만 document에서 키보드 이벤트를 받고 닫을 때 제거한다. 상세 보기 클릭 후에도 Escape가 작동하며, Tab은 초점이 보고서 밖에 있으면 내부 첫/마지막 버튼으로 복귀한다.
- 완료 대화상자는 opacity/transform 애니메이션과 배경 블러를 제거하고 불투명에 가까운 고정 배경을 사용한다. 렌즈 장면에도 움직임을 넣지 않는다. 이는 여러 블러·애니메이션 레이어가 겹치는 구성을 줄이기 위한 변경이며 네이티브 렌더링 문제의 원인이 확정되었다는 뜻은 아니다.

한국어 macOS 앱에서 압축→암호 ZIP 해제 전환과 두 렌즈 디자인을 확인했다. 최종 배포 앱에서는 일반 ZIP 해제 후 상세 보기와 Escape 닫기를 재확인했다. 결과 바이트 대조와 검증 범위는 `VALIDATION.md`에 기록한다.

## 구조

소개글은 `src/about.ts`가 한국어 원문을 기준으로 선택 언어 번역을 문단별로 덧붙인다. `setLanguage()`의 DOM 갱신에 연결되어 재실행 없이 바뀐다. 모든 문장은 `textContent`로 넣고 한국어는 `lang="ko" dir="ltr"`, 아랍어 번역만 `dir="rtl"`로 표시한다. 긴 병기는 소개글 본문만 스크롤하며 닫기 버튼은 남는다. 개인 헌사는 번역 컨테이너 밖의 `#about-dedication`에 한 번만 두고 `translate="no"`와 LTR 격리를 유지한다. 이 문구를 번역 데이터에 추가하지 않는다.

- `astra-core/src/lib.rs`: 검증 → 선택 확정 → private stage → 결과 검증 → publish.
- `paths.rs`: 엔트리 경로/충돌/링크 검사와 macOS exclusive rename.
- `zip_engine.rs`: 공유 중앙 목록과 독립적인 positional read, ZIP 디코딩·메모리 보기.
- `tar_engine.rs`: TAR 스트리밍, 후순위 링크 생성, 바깥 gzip/zstd trailer 검사.
- `sidecar.rs`: 7-Zip 호출·한도 있는 로그 수집·중단 시 kill/wait·기술 목록 파싱.
- `compress.rs`: 입력 검증, 메타데이터, 출력 임시 저장, 포맷·암호·분할·레벨 분기.
- `context.rs`: 작업별 취소 및 80 ms 간격 진행 알림.
- `src-tauri/src/archive.rs`: Tauri 어댑터. 무거운 작업은 `spawn_blocking`으로 보내며 한 번에 하나만 수행.
- `src-tauri/src/lib.rs`: 메뉴, 준비 handshake, Finder Opened 대기열, 앱 종료 처리.
- `src/lens-scene.ts` / `src/lens-scene.css`: 작업 종류별 렌즈 기하·광선·활성/정지 상태.
- `src/main.ts`: 상태·상호작용. `src/archive-model.ts`는 UI와 독립적으로 테스트할 수 있는 함수.

## 지켜야 할 규칙

1. 압축 파일이나 프런트엔드에서 온 이름을 바로 `dest.join(name)`에 넣어 삭제하거나 쓰지 않습니다. `root_items`는 충돌 표시용으로만 사용합니다.
2. `..`를 제거해 이름을 ‘고치는’ 방법으로 보안을 구현하지 않습니다. 허용되지 않는 경로는 거부합니다.
3. ZIP 중앙 목록은 파일마다 다시 만들지 않습니다. Unix의 `File::try_clone()`은 파일 오프셋을 공유할 수 있으므로, 작업별 독립 seek 상태를 제공하는 `ArchiveReader`를 유지합니다.
4. 무결성 검증 전에는 기존 목적지를 건드리지 않습니다. 오류 시 다른 엔진으로 무조건 재시도하지 않습니다. 보안 검사 실패를 fallback으로 우회해서는 안 됩니다.
5. 심볼릭 링크를 파일보다 먼저 만들지 않습니다. 스테이지 자체를 임의 파일명으로 재귀 rename하지 않습니다.
6. 디렉터리는 병합합니다. `remove_dir_all(destination/root)`를 덮어쓰기 구현에 사용하지 않습니다.
7. 보고서에는 실제로 게시한 경로를 반환합니다. 로그의 ‘추출 시작’ 줄은 성공 증거가 아닙니다. 취소를 성공으로 표시하지 않습니다.
8. 임시 파일은 `TempDir`/`NamedTempFile`로 소유합니다. 앱 외부 보기의 수신 앱이 읽을 시간을 위해 세션은 앱 종료까지 유지합니다. 강제 종료 시 남는 OS 임시 파일에 대한 다음 실행 청소 정책은 후속 과제입니다.
9. 파일명·암호·오류는 서로 다르게 취급합니다. 파일명/오류는 HTML로 삽입하지 않으며 암호를 개발 로그에 남기지 않습니다. CSV 필드도 수식 시작 문자를 무력화합니다.
10. 직접 지원하지 않는 조합을 조용히 무시하지 않습니다. TAR+암호/분할은 에러이며, 검증되지 않은 포맷·변형을 README에 지원한다고 쓰지 않습니다. ALZ/EGG의 추가 범위와 제한은 아래 절을 따릅니다.

## 안전성과 호환성의 절충

- 일반 덮어쓰기는 파일별 rename입니다. publish 중 실패하면 성공한 파일은 남고 실패 목록에 나머지를 기록합니다. 전체 작업 롤백은 아닙니다.
- Keep Both는 루트 항목 단위 suffix를 사용합니다. macOS `renamex_np(RENAME_EXCL)`로 중복 이름 경쟁을 처리합니다. 폴더 사이를 가로지르는 링크는 이름 변경 후 뜻이 달라질 수 있어 거부합니다.
- 같은 이름, 대소문자만 다른 이름, NFC/NFD만 다른 이름이 함께 있으면 사전 거부합니다. 엄격한 정책이므로 대소문자 구분 파일 시스템에 대한 사용자 선택은 후속 기능입니다.
- 외부 엔진의 링크는 아직 거부합니다. 기존 `ditto` 자동 경로는 검증 없는 우회였기 때문에 제거했습니다. 앱 번들 확장 속성/리소스 포크 보존이 완전하다고 주장하지 않습니다.
- ZIP 파일의 모드/mtime과 TAR 일반 파일의 모드/mtime을 처리합니다. 폴더의 모드/mtime, 소유권, xattr 전반은 완전하게 보존하지 않습니다. 읽기 전용 디렉터리가 들어 있는 자료의 후처리 정책도 추가 검증 대상입니다.
- 외부 7-Zip 진행률은 미정 상태로 표시합니다. 실제 측정 없이 50%/ETA를 만들어 내지 않습니다.
- 최대 1 TiB, 백만 엔트리, 20 MiB 메모리 보기, 32 MiB 로그 한도가 있습니다. 모든 자원 고갈·로컬 경쟁 공격을 막는 완전한 샌드박스는 아닙니다.

## 회귀 검증

`astra-core`는 목록 파서 1개와 통합 회귀 24개를 포함합니다. 덮어쓰기 보존, 손상 CRC, 상위/절대 경로, 목적지 링크, 내부/외부 링크, 파일 모드, 대소문자/NFC 충돌, 정확한 선택, 작업 중 취소(TAR의 Interrupted 재시도 방지 포함), 암호 ZIP, CP949, 잘못된 gzip trailer, 메모리 제한, 자기 포함 방지, ZIP/TAR/GZIP/ZSTD round trip, ZIP 분할, 암호화 7z 한글/이모지 선택을 검사합니다.

프런트엔드 순수 함수 테스트 4개는 복합 확장자, 루트 이름, HTML escape, CSV 수식을 검사합니다. 이 4개는 실제 WebView 클릭 테스트를 대신하지 않습니다. 이번 작업에서는 release 앱에서 652개 목록, HTML 형태의 파일명 표시, 한글 검색, 더블클릭 텍스트 미리보기, 선택 파일 1개 추출, 압축 옵션/암호 입력창 표시를 별도로 수동 확인했습니다.

성능 시험은 원본 알고리즘을 재현한 어댑터와 core를 비교합니다. Tauri/실제 반디집 실행 시간이나 메모리 프로파일은 아닙니다. 같은 레벨과 다른 기본 레벨을 분리해 해석해야 합니다.

## 다음 PR은 작게 나누기

- 디렉터리 메타데이터 + 실제 `.app` fixtures.
- 암호를 프로세스 인수 대신 파이프로 전달하고 Keychain은 별도 선택 기능으로 설계.
- GUI 상태를 typed model로 분리하고 실제 WebView/Finder 이벤트 회귀 테스트 추가.
- 큰 디렉터리의 checkbox 업데이트 비용 축소, 폴더별 집계 캐시, 다중 작업 큐.
- 포맷별 손상·ZIP64·리소스 제한·디스크 공간 검사.
- native ZIP 압축 병렬화는 출력 호환성·메모리·임시 디스크 사용량과 함께 벤치마크.

## 알아서 풀기 버튼 아이콘

2026-09-08 달러 기호로 오인되던 SVG를 폴더+반짝임으로 교체했다. `index.html`의 `btn-smart-extract` 안에 있는 24×24 viewBox의 벡터이며 기존 툴바 색상을 상속한다. 장식 SVG는 `aria-hidden="true"`, `focusable="false"`로 두고 실제 버튼 이름은 텍스트가 제공한다.

문구는 `src/i18n.ts`의 `btnSmartExtract`와 `updateDOM()`으로 갱신한다. HTML의 초기 한국어 문구만 바꾸면 언어 전환에 연결되지 않는다. SVG를 보존하는 기존 `el()` 헬퍼로 직접 자식 span만 수정하여 아이콘·클릭 핸들러·disabled 상태를 유지한다.


## 기본 앱 연결과 형식 확대 — 2026-09-11

`src-tauri/tauri.conf.json`의 36개 확장자를 Finder 선언, CLI 분류와 프런트엔드 드래그 인식에서 공유한다. 파일 선택창은 macOS 유형 필터가 ALZ/EGG를 비활성화하는 호환성 문제를 피하기 위해 모든 파일을 선택할 수 있고, 엔진이 실제 형식과 구조를 검증한다. macOS의 등록 순위는 Alternate로 두고 실제 기본 연결은 사용자가 설정창에서 선택해 적용할 때만 변경한다. `file_associations.rs`는 Launch Services 상태 조회와 변경, 실행 중인 `.app` 번들 검증, 확장자별 오류 및 변경 후 재조회를 담당한다. ISO/DMG/001처럼 다른 용도로도 쓰는 종류는 일괄 기본 연결에서 제외한다. macOS UTI가 같은 별칭은 함께 변경될 수 있으며 체크 해제는 복원 명령이 아니다.

프런트엔드는 7개 언어의 `file-associations.ts/css`로 구성한다. 설정창은 키보드 초점과 배경 inert 상태를 관리하고, 읽기/적용 오류와 부분 성공을 구분한다. Finder/메뉴 이벤트는 시작 대기열로 전달하며 새 창 생성 이후에도 준비 handshake를 거친다. 닫거나 최소화한 창은 파일 열기 요청 시 다시 표시한다. 시작 요청 실행 중에는 별도 guard를 두어 저장 대화상자에서 아직 isProcessing이 false인 동안에도 다른 시작 요청이 끼어들지 않게 한다.

추가 압축 스트림의 핵심은 `astra-core/src/stream.rs`다. 7-Zip 목록이 이름/해제 크기를 생략하는 BZ2/XZ 등에 대해 강제 외부 형식 + stdout으로 제한된 임시 파일을 만든다. stderr는 별도 스레드로 비우고 취소·용량 초과·쓰기 실패 시 자식 프로세스를 종료한다. 성공 종료와 데이터 검증 뒤에만 목록/해제를 진행한다. 압축 TAR는 임시 파일을 기존 native TAR 검증 경로에 넣어 경로 검사와 내부 선택을 유지한다. 단일 `.gz` 등은 내용이 TAR여도 자동으로 재귀 해제하지 않는다. 압축 해제될 데이터만큼 임시 디스크 공간이 필요하고 미리보기에서도 먼저 풀기 때문에 큰 스트림의 첫 열기는 시간이 들 수 있다. 임시 파일은 작업 범위 종료 시 정리된다. 새 의존성은 없다.

[Apple 기본 앱 선택 안내](https://support.apple.com/en-euro/guide/mac-help/mh35597/mac), [Tauri 파일 연결 설정](https://v2.tauri.app/reference/config/#fileassociation), [공식 7-Zip 지원 형식](https://www.7-zip.org/) 및 설치된 macOS SDK 헤더를 참고했다.


## ALZ/EGG와 배포 고지 — 2026-09-12

`legacy.rs`는 `7zz` 옆의 `ziplens-legacy` 보조 프로그램과 크기가 제한된 JSON stdin/stdout으로 통신한다. 암호는 프로세스 인수에 넣지 않는다. 취소·10분 제한에서 자식을 종료하고 회수한다. `legacy_worker.rs`는 헤더·분할 볼륨·메타데이터를 사전 검사하고, 고정된 unalz/unegg 0.2.1을 이용해 선택한 항목만 빈 임시 폴더에 해제한다. 부모가 경로·유형·크기·예상 외 출력을 다시 검사한 뒤 공개한다. CRC 오류나 ALZ의 부분 복구를 정상 완료로 처리하지 않는다. 세부 버퍼 한도와 미지원 변형은 `astra-core/tests/fixtures/legacy/README.md`에 기록했다.

`prepare-distribution.py`는 공식 7-Zip 입력·해당 소스 해시와 고지를 검사하고 대상 아키텍처의 해제 보조 프로그램을 빌드한다. `generate-third-party-notices.py --check`는 앱/보조 프로그램의 두 lockfile, NPM 및 Rust 표준 라이브러리 자료를 확인한다. `legal` 전체가 Tauri Resources/legal로 들어가며 `open_license_folder`는 외부 입력 경로 없이 이 고정 위치만 연다.

`package-macos.py`는 이미 빌드된 앱을 포장한다. 7-Zip의 공식 입력 해시를 먼저 검사하고, 보조 실행 파일과 앱에 로컬 ad-hoc 서명을 적용한다. 서명 전 공식 7-Zip 해시와 서명 후 배포 실행 파일 해시를 구별한다. Google Drive 폴더에서 ditto의 메타데이터 복사가 실패할 수 있어 파일 바이트와 POSIX 권한을 보존하여 복사한다. ZIP의 CRC·모든 파일 바이트·실행 권한과 코드 서명을 검사한다. Developer ID 서명이나 Apple 공증은 수행하지 않는다.


## 최종 점검의 보호 규칙 — 2026-09-13

- `paths::ProtectedInputs`는 원본과 분할 입력의 실제 파일 식별자를 보관한다. ALZ/EGG helper 응답의 `source_paths`는 실제 발견한 입력 볼륨이며, 새 부모 코드와 helper를 함께 빌드해야 한다. 7-Zip은 명확한 같은 이름군의 숫자/ZIP/RAR 분할 파일을 보호한다.
- 덮어쓰기 게시 시 일반 파일/폴더의 성공 목록을 유지하고, 링크는 staging에서 확인한 최종 대상이 실제 게시됐으며 목적지 안의 동일 파일로 해석될 때만 게시한다. 내부 링크 체인은 의존 링크를 게시한 뒤 재시도한다. Keep Both의 루트별 원자적 이동과 교차 루트 링크 제한은 유지한다.
- `compress.rs`는 출력과 입력을 실제 파일 식별자로 비교한다. TAR reader는 헤더 길이와 실제 읽은 길이 차이를 오류로 처리하여 스테이징 결과를 폐기한다.
- `ArchiveActionGate`는 모든 파일/저장/목적지 선택과 충돌/암호/결과/인라인 미리보기 대기를 포함한다. 추출·압축 인수는 await 이전에 고정하고 Finder 큐는 gate 해제 후 재개한다. `showPasswordDialog`는 제출 중에도 취소를 엔진에 전달하며 validator가 종료될 때까지 완료하지 않는다.
- macOS main 창의 CloseRequested는 hide로 처리하여 기존 WebView를 유지한다. 명시적 앱 종료는 그대로 수행한다.
- `package-macos.py`는 준비된 target helper와 번들 helper의 아키텍처·실행 권한·바이트를 비교한다. 코드 서명만 다르면 임시 복사본에서 동일 서명으로 정규화한다. `scripts/test-package-macos.py`에 성공/거부 경로6개가 있다.

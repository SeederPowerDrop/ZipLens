# 대용량 파일 성능·무결성 검증 — 2026-10-18

**총 40회 압축·목록·해제 왕복, 120개 CLI 측정을 완료했고 모든 파일의 이름·크기·SHA-256 및 원본 보존 검사를 통과했습니다.** 큰 ZIP의 측정 범위는 기존 2.1.1과 비슷했습니다. 1만 개 작은 파일의 해제는 후속 검사에서도 2.1.2의 중앙값이 약 0.093초 높았으므로 성능이 개선됐다고 표현하지 않습니다.

검사한 조건에서 파일 손상·기능 실패·작업 중단은 발견되지 않았습니다. 관측된 작은 파일 시간 차이와 형식별 메모리 사용량을 아래에 공개하며, 이번 프리뷰 배포를 막을 결함은 확인되지 않았다고 판단했습니다. 모든 파일·환경에서 무오류 또는 같은 속도를 보장한다는 의미는 아닙니다.

## 환경과 측정한 앱

- Apple M3, 8 CPU 코어, 메모리 24 GiB, macOS 15.7.5 arm64. Python 3.14.7 표준 라이브러리로 측정했습니다.
- 비교 대상은 설치돼 있던 **2.1.1**과 최적화 빌드 후 최종 포장한 **2.1.2**의 실제 앱 실행 파일입니다. 2.1.2의 macOS 빌드 번호는 `2.1.3`, 앱 식별자는 `com.ziplens.astra`입니다.
- 2.1.2는 소스 기준 커밋 `93283fef7ccfb27b9ed7198d1a33f337c16978aa`에서 버전·배포 메타데이터를 갱신해 빌드했습니다. 배포 대응 소스는 [v2.1.2 태그](https://github.com/SeederPowerDrop/ZipLens/tree/v2.1.2)와 같은 릴리스의 소스 아카이브를 확인하세요.
- 측정 시작 시 작업 볼륨 여유 공간은 약 22.81 GiB였습니다. 각 조건·반복 전에 필요한 공간을 확인하고 최소 4 GiB의 여유를 남기도록 제한했습니다.
- 앱은 Apple Silicon용 **ad-hoc 서명 프리뷰**입니다. Developer ID 서명·공증·Gatekeeper 승인을 뜻하지 않습니다.

| 항목 | SHA-256 |
|---|---|
| 기존 2.1.1 실행 파일 | `7ddb0f50a0f83396698f434a901c0d9ffe426ec106ad466087d61c73aca182cc` |
| 측정한 2.1.2 실행 파일 | `876728c0855edac012e5d85d81b357e8959d3293804f8ab07f016afbf4cdfcbe` |
| 2.1.2 앱 ZIP (18,064,245 bytes) | `01cba9b5d22ccbf917483fc576341943ff6829173ecf8102a99bf2dff4f2a36d` |
| 최초 측정 스크립트 | `27fd295d3ad840903cb83e6b81613d676f5147845a295dc1fb5ee18509bddcff` |
| 후속 측정·공개 스크립트 | `c5904110031eab866cbadae0d61ede885a8903e0e9d60fe8d20161bcfef813a7` |

최초·후속 스크립트의 차이는 종료 신호 처리 람다를 이름 있는 함수로 정리한 것뿐이며, 측정·검증·정상 완료 로직은 같습니다. 각 원시 기록에 실행 시 스크립트 해시를 남겼습니다.

## 입력과 방법

| 합성 입력 | 실제 크기 | 검사 |
|---|---:|---|
| 단일 비희소 의사난수 파일 | 4,362,076,160 bytes = 4 GiB + 64 MiB | ZIP64, 각 앱 2회 |
| 8개 혼합 파일 | 536,870,912 bytes = 512 MiB | ZIP은 각 앱 3회, 다른 4형식은 2.1.2만 각각 3회 |
| 10,000개 작은 파일 | 각 4 KiB, 합계 40,960,000 bytes | ZIP은 최초 각 앱 3회, 후속 각 앱 6회 |

개인 자료 대신 고정 시드의 합성 데이터를 사용했습니다. 큰 파일은 모든 바이트를 실제로 기록했으며 할당 크기가 논리적 크기 이상임을 확인했습니다. 혼합 파일은 각 블록의 절반이 의사난수, 나머지가 반복되는 공개 예제 문장입니다. 파일명에는 여러 언어와 이모지가 포함되며 이름 비교는 Unicode NFC 정규화에 따른 동등성만 허용했습니다.

압축 수준은 **6**입니다. 양쪽 앱은 동일한 원본·옵션을 사용했고 ZIP의 실행 순서는 반복마다 바꿨습니다. 입력 생성·해시 검사 시간은 CLI 측정에서 제외했습니다. 별도의 캐시 비우기나 준비 실행은 하지 않았으므로, 방금 쓰거나 읽은 파일을 사용하는 조건입니다. 각 명령은 프로세스 시작부터 종료까지 측정하며 10ms 간격으로 종료를 확인합니다. 수십 ms의 짧은 목록 시간은 프로세스 시작 비용과 이 확인 간격에 영향을 받습니다.

최초 검사는 **28왕복 / 84개 명령**, 작은 파일의 추가 검사는 **12왕복 / 36개 명령**입니다. 전체 40왕복은 **2.1.1의 14왕복과 2.1.2의 26왕복을 합한 수**입니다. 각각 압축·목록·해제를 포함합니다. 모든 반복에서 목록의 이름·종류·크기, 복원 파일의 전체 SHA-256과 원본 압축 파일의 전후 SHA-256을 확인했습니다. 각 조건을 마친 뒤 입력 파일도 다시 검사했습니다. 2.1.2 ZIP은 각 조건의 첫 반복에서 Python `zipfile`로 별도 전체 읽기·CRC·SHA-256 검사를 했으며, 큰 파일의 ZIP64 추가 필드도 확인했습니다.

## ZIP 비교 — 최초 검사

시간 단위는 **초**, 값은 **중앙값 (최소–최대)**입니다. `횟수`는 앱별 반복 수입니다.

| 입력 | 작업 | 횟수 | 2.1.1 | 2.1.2 |
|---|---|---:|---:|---:|
| 4 GiB + 64 MiB 단일 파일 | 압축 | 2 | 67.007 (61.887–72.127) | 64.898 (61.507–68.288) |
| 4 GiB + 64 MiB 단일 파일 | 목록 | 2 | 0.016 (0.014–0.019) | 0.024 (0.019–0.030) |
| 4 GiB + 64 MiB 단일 파일 | 해제 | 2 | 8.565 (7.543–9.586) | 8.505 (8.075–8.935) |
| 512 MiB / 8파일 | 압축 | 3 | 3.869 (3.678–3.962) | 3.798 (3.711–3.905) |
| 512 MiB / 8파일 | 목록 | 3 | 0.017 (0.017–0.017) | 0.015 (0.014–0.018) |
| 512 MiB / 8파일 | 해제 | 3 | 0.130 (0.119–0.151) | 0.135 (0.121–0.210) |
| 4 KiB × 10,000파일 | 압축 | 3 | 0.925 (0.830–0.958) | 0.977 (0.927–2.353) |
| 4 KiB × 10,000파일 | 목록 | 3 | 0.084 (0.076–0.088) | 0.102 (0.074–0.120) |
| 4 KiB × 10,000파일 | 해제 | 3 | 0.862 (0.856–1.476) | 1.120 (0.981–1.456) |

큰 파일의 2.1.2 ZIP은 **4,363,407,715 bytes**였고, 단일 항목 자체가 4 GiB를 넘는 ZIP64였습니다. 의사난수 데이터이므로 압축 후 용량이 조금 증가하는 것은 예상된 결과입니다. 큰 ZIP 압축·해제에서는 반복 범위가 겹쳤으며 뚜렷한 성능 저하를 관측하지 않았습니다. 각 앱 2회의 결과만으로 통계적으로 유의한 개선을 주장하지 않습니다.

## 작은 파일의 추가 확인

최초 3회에서 1만 파일 해제 중앙값은 **0.862 → 1.120초**, 약 **29.9% 증가**했습니다. 반복 간 편차가 커서 같은 조건을 각 앱 **6회** 더 검사했으며, 최초 결과와 구분해 기록합니다.

| 작업 | 2.1.1 · 6회 | 2.1.2 · 6회 |
|---|---:|---:|
| 압축 | 0.753 (0.733–0.999) | 0.797 (0.748–1.318) |
| 목록 | 0.077 (0.074–0.078) | 0.095 (0.076–0.112) |
| 해제 | 0.722 (0.663–0.785) | 0.815 (0.624–0.916) |

추가 검사에서도 해제 중앙값은 **0.722 → 0.815초**, 약 **0.093초 / 12.8% 증가**했습니다. 두 버전의 측정 범위는 겹치며 원인은 확정하지 않았습니다. 이 조건에서 2.1.2가 더 빠르거나 저하가 전혀 없다고 말하지 않습니다. 추가 12왕복도 파일 무결성과 원본 보존을 모두 통과했고 기능 실패·멈춤은 없었습니다.

## 2.1.2의 생성 형식별 결과

같은 **512 MiB / 8파일**을 형식마다 3회 검사했습니다. 아래는 **2.1.2 단독 측정**이며, ZIP 이외 형식의 구버전 대비 성능 비교는 하지 않았습니다. 시간은 초 단위 중앙값 (최소–최대), 크기는 MiB입니다.

| 형식 | 생성 | 목록 | 해제 | 출력 MiB |
|---|---:|---:|---:|---:|
| ZIP | 3.798 (3.711–3.905) | 0.015 (0.014–0.018) | 0.135 (0.121–0.210) | 258.19 |
| TAR | 0.170 (0.152–0.192) | 0.057 (0.051–0.058) | 0.186 (0.182–0.253) | 512.01 |
| TAR.GZ | 3.863 (3.734–3.903) | 0.140 (0.139–0.162) | 0.418 (0.391–0.419) | 258.20 |
| TAR.ZST | 0.184 (0.184–0.194) | 0.052 (0.051–0.061) | 0.208 (0.200–0.212) | 256.13 |
| 7Z | 18.326 (12.364–19.923) | 0.062 (0.062–0.063) | 0.629 (0.623–2.195) | 256.38 |

합성 입력에 대한 값이며 사진·영상·실제 문서의 압축률을 대표하지 않습니다. TAR는 자체 압축을 하지 않아 용량이 줄지 않습니다. 이 표를 근거로 모든 형식의 성능이 개선됐다고 주장하지 않습니다.

## 메모리

아래는 2.1.2 CLI와 살아 있는 자식 프로세스의 RSS를 **100ms 간격**으로 더해 관측한 최고치입니다. 단위는 **MiB**입니다. 모든 측정에서 샘플 수집 오류는 0건이었습니다.

| 조건 | 압축 RSS 최고치 | 해제 RSS 최고치 |
|---|---:|---:|
| 4 GiB + 64 MiB 단일 파일 ZIP | 5.6 | 5.6 |
| 4 KiB × 10,000파일 ZIP · 최초 | 21.3 | 100.0 |
| 4 KiB × 10,000파일 ZIP · 후속 | 21.1 | 142.3 |
| 512 MiB / 8파일 ZIP | 7.6 | 9.7 |
| 512 MiB / 8파일 TAR | 4.7 | 6.2 |
| 512 MiB / 8파일 TAR.GZ | 5.2 | 5.8 |
| 512 MiB / 8파일 TAR.ZST | 103.2 | 10.8 |
| 512 MiB / 8파일 7Z | 1748.4 | 792.4 |

**7Z 압축은 이 표본에서 약 1.71 GiB, 해제는 약 792.4 MiB**를 사용해 ZIP보다 메모리 요구량이 컸습니다. 압축 수준·형식·파일에 따라 사용량이 달라지므로 큰 파일에서 모든 형식이 적은 메모리로 동작한다고 일반화하지 않습니다.

이 값은 순간 합산 RSS의 **샘플 추정치**입니다. 100ms 사이의 짧은 최고치를 놓칠 수 있고 프로세스 사이의 공유 페이지를 중복 계산할 수 있습니다. 짧은 목록 명령은 최고치를 포착하기 어려워 이 표에서 제외했습니다. 원시 기록에는 `wait4`의 커널 최대 RSS도 별도로 보관하며, 이를 부모·자식의 동시 메모리 합계로 해석하지 않습니다. CPU 시간은 기다려 회수한 자식의 사용량을 포함하는 `wait4` 값을 사용했습니다.

## 재현과 한계

측정 도구는 [benchmark-large-files.py](../scripts/benchmark-large-files.py)에 공개했습니다. 두 앱 전체를 유지한 채 실행 파일 경로를 지정하세요. 출력 폴더는 존재하지 않는 새 경로여야 합니다.

```sh
python3 scripts/benchmark-large-files.py \
  --baseline "/path/to/2.1.1/ZipLens.app/Contents/MacOS/ziplens" \
  --candidate "/path/to/2.1.2/ZipLens.app/Contents/MacOS/ziplens" \
  --output "/private/tmp/ziplens-large-results"
```

추가 반복은 같은 명령에 `--cases many-small-files --repetitions 6`을 지정하고 별도 출력 폴더를 사용합니다. `--quick`은 도구 자체의 작은 표본 검사이며 대용량 성능 결과로 계산하지 않습니다. 생성한 입력·압축·해제 파일은 조건별로 제거하고 JSON 근거만 남깁니다. 이번 검사에서도 임시 대용량 자료의 제거를 확인했습니다.

이것은 앱과 엔진을 공유하는 **CLI 측정**이며 GUI 응답성·진행 표시·취소 조작의 측정은 아닙니다. 파일시스템 캐시·백그라운드 작업·저장장치·CPU·압축 수준에 따라 결과가 달라집니다. 모든 압축 변종, 암호·분할·중단·디스크 부족 조건 전체를 검증하지 않았습니다.

새 소스로 다시 실행한 **202개 회귀 검사**와 **별도 Unicode 13개 시나리오**는 이 40왕복과 다른 검사 묶음입니다. 회귀의 앱 CLI 20개와 Unicode 시나리오는 최적화 앱 빌드에서 최종 패키징 전에 실행했고, 위 성능 측정은 최종 포장된 앱으로 실행했습니다. 이전의 160개 WebKit 화면 검사, 대표 실제 GUI 검사와 26.58GB 실제 이미지 검사는 이번 재실행으로 합산하지 않습니다. [검증 이력과 범위](VALIDATION.md)

## English

All **40 archive round trips and 120 timed CLI commands** completed with matching filenames, sizes and SHA-256 hashes, unchanged source files and source archives, and no observed operation failures or hangs. This compares the installed 2.1.1 app with the final optimized 2.1.2 package on an Apple M3, 24 GiB Mac running macOS 15.7.5.

The corpus covered a non-sparse **4 GiB + 64 MiB** pseudorandom file in ZIP64 (two runs per app), **512 MiB across eight mixed files** (ZIP three times per app; the other four formats three times on 2.1.2 only), and **10,000 files of 4 KiB each** (three initial runs plus six follow-up runs per app). Table timings are seconds as **median (minimum–maximum)**. Compression level was 6, ZIP order alternated, and caches were not flushed. Listing and full extraction integrity were checked each time; candidate ZIPs also received an independent Python CRC/SHA check for each corpus.

For the large ZIP, compression medians were **67.007 → 64.898 seconds** and extraction **8.565 → 8.505 seconds**, with overlapping ranges. No clear large-ZIP slowdown was observed; two samples do not establish a significant speedup. The initial small-file extraction median rose **0.862 → 1.120 seconds**. The separate six-repeat follow-up still showed **0.722 → 0.815 seconds**, approximately **0.093 seconds / 12.8% higher**, with overlapping ranges and an unresolved cause. We do not claim that small-file extraction improved or that no slowdown exists.

The memory table reports the maximum sampled sum of live CLI and child-process RSS in MiB, at 100ms intervals. **7Z compression peaked near 1.71 GiB and extraction near 792.4 MiB** on the 512 MiB corpus, considerably above ZIP. Samples can miss short peaks or double-count shared pages; kernel `wait4` maximum RSS is kept separately and is not a simultaneous process-tree sum. Short list timings also include startup overhead and 10ms exit polling.

No release-blocking defect was found under these tested conditions, but this does not guarantee every input, format or machine. These are CLI/engine measurements, not GUI responsiveness tests. The **202 regression checks plus 13 separate Unicode scenarios** are a different test group, with their app CLI checks run on the optimized build before final packaging. Historical GUI and real-image tests were not rerun or added to these counts.

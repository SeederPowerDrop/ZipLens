# ZipLens 2.1.3 — DMG · GitHub Help

[한국어](#한국어) · [English](#english) · [Español](#español) · [Français](#français) · [Deutsch](#deutsch) · [Русский](#русский) · [简体中文](#简体中文)

[DMG](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.3/ZipLens_2.1.3_arm64-preview.dmg) · [Release / source / checksums](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.3) · [Guides](guides/README.md)

**검증 / Validation · 2026-10-19:** 프런트엔드 75 + 패키징 32 + 앱 CLI 20 = **127개 통과**, 별도 Unicode CLI **13개**, WebKit **160개 화면 상태 / 실패 0개**, 애니메이션을 켠 패널 반복 열기 **6회 통과**. 실제 DMG의 무결성·마운트·앱 282개 파일 복사 대조·deep/strict 서명·CLI를 확인했고, 이 Mac의 2.1.3 설치본에서 한국어 홈과 GitHub 한국어 도움말 연결을 확인했습니다. WebKit의 IPC·네이티브 대화상자는 모의 처리했으며 모든 언어의 네이티브 조작을 검증한 것은 아닙니다.

**127 automated checks passed** (75 frontend, 32 packaging, 20 app CLI), plus **13 Unicode CLI scenarios** and **160 WebKit screen states with zero failures**. DMG verification, mounting, comparison of 282 copied app files, deep/strict signature verification and CLI execution passed. The installed 2.1.3 app showed the Korean home screen and opened the Korean GitHub Help URL. WebKit uses mocked IPC/native dialogs; native checks here cover those Korean flows. A separate app copy with synthetic quarantine was **rejected by Gatekeeper (exit 3)**; valid distribution signing identities: **0**. This remains an ad-hoc, unnotarized preview. [Artifact checksum and step-by-step download/installation status / 체크섬·단계별 다운로드 및 설치 상태](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

## 한국어

**2.1.3은 DMG 설치 파일과 앱에서 GitHub 설명서를 여는 도움말 연결을 추가합니다.** DMG를 열어 ZipLens.app 전체를 응용 프로그램 폴더에 복사하고, 구버전을 종료한 뒤 실행하세요. **ⓘ → 사용 가이드**는 선택한 언어의 GitHub `main` 문서를 브라우저에서 엽니다. 인터넷이 필요하며, 브라우저 실행 실패 시에는 내장 기본 가이드를 표시합니다. 브라우저 안의 연결 오류까지 자동으로 전환하지는 않습니다. 한국어·영어·스페인어·프랑스어·독일어·러시아어·중국어(간체)의 소개·기능·설치·사용법을 정리했고 기존 일본어·베트남어·아랍어 문서도 유지합니다. [한국어 안내](guides/ko.md)

**미공증 Apple Silicon ad-hoc 프리뷰입니다.** DMG가 공증을 대신하거나 다른 모든 Mac의 실행을 보장하지 않습니다. macOS가 차단할 수 있고 Intel 실행은 검증하지 않았습니다. 신뢰하는 앱의 사용자 허용 절차는 [Apple 공식 안내](https://support.apple.com/102445)를 따르세요. [실제 DMG·다운로드·설치 검증](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

성능 표는 **2.1.2의 기존 CLI 검사**이며 2.1.3 재측정이 아닙니다. 약 4.36 GB 단일 파일의 ZIP 중앙값은 압축 64.9초·해제 8.5초였고, 1만 작은 파일의 후속 해제는 2.1.1 0.722초→2.1.2 0.815초였습니다. 512 MiB 표본의 7Z 압축 RSS 샘플 최고치는 약 1.71 GiB였습니다. 40왕복은 **구버전 14 + 2.1.2 26**이며 모든 조건의 성능 개선·무오류를 뜻하지 않습니다. [조건과 한계](LARGE_FILE_VALIDATION_2026-10-18.md)

자체 코드의 GPL-3.0-only, 소프트웨어 기본권 철학, 공식 후원을 유지합니다. 수정본의 원작자 후원 링크 보존은 자발적인 부탁이며 추가 라이선스 조건이 아닙니다.

## English

**2.1.3 adds a DMG installer and Help links to GitHub guides.** Open the DMG and copy the complete ZipLens.app to Applications; quit older copies before launching. **ⓘ → User guide / Help** opens the selected language’s guide on GitHub `main` in a browser and requires internet. If the browser cannot launch, the bundled basic guide is shown; network errors inside an opened browser do not trigger that fallback. Introductions, features, installation and usage are refreshed in Korean, English, Spanish, French, German, Russian and Simplified Chinese. Existing Japanese, Vietnamese and Arabic guides remain available. [English guide](guides/en.md)

This is an **ad-hoc signed Apple Silicon preview without Apple notarization**. A DMG does not replace notarization or guarantee launch on every other Mac. macOS may block it; Intel execution is unverified. For an app whose source you trust, follow [Apple’s user-approval instructions](https://support.apple.com/102445). [Actual DMG, download and installation checks](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

Performance figures are **historical 2.1.2 CLI measurements, not a 2.1.3 rerun**: about 4.36 GB in a single ZIP input took median 64.9 s to compress and 8.5 s to extract; the follow-up 10,000-small-file extraction median rose from 0.722 s in 2.1.1 to 0.815 s in 2.1.2. Sampled process-tree RSS peaked near 1.71 GiB during 7Z compression of a 512 MiB corpus. The 40 round trips comprise **14 on 2.1.1 and 26 on 2.1.2**, not a universal speedup or zero-bug guarantee. [Conditions and limitations](LARGE_FILE_VALIDATION_2026-10-18.md)

GPL-3.0-only, our guiding value of basic software rights and official optional support are preserved. Keeping original author support links in modified distributions remains a voluntary request, not an extra license condition.

## Español

**2.1.3 añade un DMG de instalación y enlaces de Ayuda a las guías de GitHub.** Abre el DMG, copia ZipLens.app completo a Aplicaciones y cierra las versiones anteriores antes de iniciar. **ⓘ → Guía de uso / Ayuda** abre la guía del idioma elegido en GitHub `main` y necesita internet. Si no se puede iniciar el navegador, muestra la guía básica incluida; los errores de red dentro del navegador no activan esa alternativa. Se actualizan presentación, funciones, instalación y uso en coreano, inglés, español, francés, alemán, ruso y chino simplificado. Se conservan las guías anteriores en japonés, vietnamita y árabe. [Guía en español](guides/es.md)

Es una **versión preliminar Apple Silicon con firma ad-hoc, sin notarización de Apple**. El DMG no sustituye la notarización ni garantiza el inicio en todos los demás Mac. macOS puede bloquearla; Intel no está verificado. Para una aplicación de origen fiable, consulta la [autorización manual explicada por Apple](https://support.apple.com/102445). [Comprobaciones reales de DMG, descarga e instalación](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

Las cifras son **mediciones anteriores de la CLI 2.1.2, no nuevas pruebas de 2.1.3**: un archivo de unos 4,36 GB tuvo medianas ZIP de 64,9 s al comprimir y 8,5 s al extraer. La extracción adicional de 10.000 archivos pequeños pasó de 0,722 s en 2.1.1 a 0,815 s en 2.1.2. El máximo RSS muestreado del árbol de procesos fue unos 1,71 GiB al comprimir una muestra de 512 MiB en 7Z. Las 40 pruebas completas suman **14 de 2.1.1 y 26 de 2.1.2**; no garantizan una mejora universal ni ausencia de errores. [Condiciones y límites](LARGE_FILE_VALIDATION_2026-10-18.md)

Se mantienen GPL-3.0-only, los derechos básicos sobre el software como orientación del proyecto y las donaciones opcionales. Conservar los enlaces de apoyo al autor en modificaciones es una petición voluntaria, no una condición adicional de licencia.

## Français

**2.1.3 ajoute une installation par DMG et des liens d’aide vers les guides GitHub.** Ouvrez le DMG, copiez ZipLens.app en entier dans Applications et quittez les anciennes versions avant de lancer l’app. **ⓘ → Guide d’utilisation / Aide** ouvre le guide de la langue choisie sur GitHub `main` et nécessite internet. Si le navigateur ne peut pas démarrer, le guide de base intégré s’affiche ; une erreur réseau dans le navigateur ne déclenche pas ce repli. Présentation, fonctions, installation et utilisation sont actualisées en coréen, anglais, espagnol, français, allemand, russe et chinois simplifié. Les guides antérieurs japonais, vietnamien et arabe restent disponibles. [Guide français](guides/fr.md)

Il s’agit d’une **préversion Apple Silicon signée ad-hoc, sans notarisation Apple**. Le DMG ne remplace pas la notarisation et ne garantit pas le démarrage sur tous les autres Mac. macOS peut le bloquer ; l’exécution sur Intel reste non vérifiée. Pour une application de provenance fiable, consultez la [procédure d’autorisation d’Apple](https://support.apple.com/102445). [Vérifications du DMG, du téléchargement et de l’installation](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

Les chiffres proviennent des **mesures antérieures de la CLI 2.1.2, sans nouveau test de 2.1.3** : un fichier d’environ 4,36 Go a donné des médianes ZIP de 64,9 s en compression et 8,5 s en extraction. Le suivi sur 10 000 petits fichiers est passé de 0,722 s avec 2.1.1 à 0,815 s avec 2.1.2 en extraction. Le maximum RSS échantillonné de l’arbre de processus était d’environ 1,71 GiB pour la compression 7Z d’une sélection de 512 MiB. Les 40 cycles réunissent **14 cycles de 2.1.1 et 26 de 2.1.2** et ne garantissent ni gain universel ni absence d’erreurs. [Conditions et limites](LARGE_FILE_VALIDATION_2026-10-18.md)

GPL-3.0-only, les droits fondamentaux liés au logiciel comme valeur du projet et le soutien facultatif sont conservés. Garder les liens de soutien à l’auteur dans les versions modifiées reste une demande volontaire, pas une condition de licence supplémentaire.

## Deutsch

**2.1.3 ergänzt eine DMG zur Installation und Hilfe-Links zu GitHub-Anleitungen.** DMG öffnen, die vollständige ZipLens.app nach Programme kopieren und alte Versionen vor dem Start schließen. **ⓘ → Anleitung / Hilfe** öffnet die gewählte Sprache auf GitHub `main` im Browser und benötigt Internet. Startet der Browser nicht, erscheint die integrierte Basisanleitung; Netzwerkfehler im geöffneten Browser lösen diesen Ersatz nicht aus. Einführung, Funktionen, Installation und Bedienung wurden auf Koreanisch, Englisch, Spanisch, Französisch, Deutsch, Russisch und vereinfachtem Chinesisch überarbeitet. Vorhandene japanische, vietnamesische und arabische Anleitungen bleiben verfügbar. [Deutsche Anleitung](guides/de.md)

Dies ist eine **ad-hoc signierte Apple-Silicon-Vorschau ohne Apple-Notarisierung**. Eine DMG ersetzt die Notarisierung nicht und garantiert keinen Start auf jedem anderen Mac. macOS kann den Start blockieren; Intel ist ungeprüft. Die manuelle Freigabe einer App aus vertrauenswürdiger Quelle beschreibt [Apple](https://support.apple.com/102445). [Prüfung von DMG, Download und Installation](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

Die Werte stammen aus **früheren CLI-Messungen von 2.1.2, nicht aus erneuten 2.1.3-Tests**: Bei einer einzelnen Datei von etwa 4,36 GB lag der ZIP-Median bei 64,9 s zum Komprimieren und 8,5 s zum Entpacken. Der zusätzliche Test mit 10.000 kleinen Dateien ergab beim Entpacken 0,722 s mit 2.1.1 gegenüber 0,815 s mit 2.1.2. Das erfasste RSS-Maximum des Prozessbaums betrug bei 7Z-Komprimierung einer 512-MiB-Probe etwa 1,71 GiB. Die 40 Durchläufe umfassen **14 mit 2.1.1 und 26 mit 2.1.2**; sie garantieren weder allgemeine Beschleunigung noch Fehlerfreiheit. [Bedingungen und Grenzen](LARGE_FILE_VALIDATION_2026-10-18.md)

GPL-3.0-only, grundlegende Rechte bei Software als Projektwert und freiwillige Unterstützung bleiben erhalten. Links zur Unterstützung des Originalautors in Änderungen beizubehalten ist eine freiwillige Bitte, keine zusätzliche Lizenzbedingung.

## Русский

**2.1.3 добавляет установку из DMG и ссылки справки на руководства GitHub.** Откройте DMG, скопируйте ZipLens.app целиком в «Программы» и закройте старые версии перед запуском. **ⓘ → Руководство / Справка** открывает документ выбранного языка в GitHub `main` через браузер и требует интернет. Если браузер не запускается, показывается встроенная краткая инструкция; ошибки сети в открытом браузере не вызывают такого переключения. Обзор, возможности, установка и использование обновлены на корейском, английском, испанском, французском, немецком, русском и упрощённом китайском. Существующие японское, вьетнамское и арабское руководства сохранены. [Русское руководство](guides/ru.md)

Это **предварительная версия Apple Silicon с подписью ad-hoc, без нотариального заверения Apple**. DMG не заменяет заверение и не гарантирует запуск на всех других Mac. macOS может блокировать запуск; Intel не проверен. Порядок ручного разрешения приложения из доверенного источника описан у [Apple](https://support.apple.com/102445). [Проверка DMG, загрузки и установки](INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

Цифры относятся к **прежним измерениям CLI 2.1.2, а не к новым тестам 2.1.3**: ZIP для одного файла около 4,36 GB дал медианы 64,9 с при сжатии и 8,5 с при распаковке. Дополнительные замеры распаковки 10 000 мелких файлов дали 0,722 с в 2.1.1 и 0,815 с в 2.1.2. Максимум RSS дерева процессов по выборочным замерам составил около 1,71 GiB при сжатии 512 MiB в 7Z. 40 циклов включают **14 в 2.1.1 и 26 в 2.1.2** и не гарантируют всеобщего ускорения или отсутствия ошибок. [Условия и ограничения](LARGE_FILE_VALIDATION_2026-10-18.md)

Сохраняются GPL-3.0-only, базовые права на программное обеспечение как ориентир проекта и добровольные пожертвования. Просьба сохранять ссылки поддержки автора в модификациях добровольна и не является дополнительным условием лицензии.

## 简体中文

**2.1.3 新增 DMG 安装文件，以及在应用中打开 GitHub 使用指南的帮助链接。** 打开 DMG，将完整的 ZipLens.app 复制到“应用程序”，启动前退出旧版本。**ⓘ → 使用指南 / 帮助**会在浏览器中打开所选语言的 GitHub `main` 文档，需要联网。无法启动浏览器时会显示内置基础指南；浏览器中的网络错误不会触发该备用方式。本次更新了韩语、英语、西班牙语、法语、德语、俄语和简体中文的简介、功能、安装与使用说明，同时保留既有的日语、越南语和阿拉伯语文档。[中文指南](guides/zh.md)

这是 **Apple Silicon 的 ad-hoc 签名预览版，未通过 Apple 公证**。DMG 不能替代公证，也不能保证在所有其他 Mac 上启动。macOS 可能阻止运行，Intel 尚未验证。对于来源可信的应用，请参考 [Apple 的手动允许说明](https://support.apple.com/102445)。 [DMG、下载与安装的实际验证](INSTALLATION_VALIDATION_2.1.3_KO_EN.md)。

性能数字来自 **2.1.2 的既有 CLI 测量，并非 2.1.3 重新测试**：约 4.36 GB 的单文件 ZIP 压缩中位数为 64.9 秒，解压为 8.5 秒；追加的 10,000 个小文件解压测量由 2.1.1 的 0.722 秒变为 2.1.2 的 0.815 秒。512 MiB 样本进行 7Z 压缩时，进程树 RSS 采样最高值约为 1.71 GiB。40 次往返包括 **2.1.1 的 14 次和 2.1.2 的 26 次**，不代表全面提速或零错误保证。[条件与限制](LARGE_FILE_VALIDATION_2026-10-18.md)

保留 GPL-3.0-only、软件基本权利理念及可选的官方捐助。希望修改版保留原作者捐助链接，这只是自愿请求，不是额外的许可证条件。

---

[Buy Me a Coffee](https://buymeacoffee.com/master_chief) · [Ko-fi](https://ko-fi.com/seederpower) · Bitcoin in About · [GPL-3.0-only](../LICENSE) · [Source repository](https://github.com/SeederPowerDrop/ZipLens)

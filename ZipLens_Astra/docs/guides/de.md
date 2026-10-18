# ZipLens 2.1.3 — Einführung und Bedienung

[Sprachen](README.md) · [DMG herunterladen](https://github.com/SeederPowerDrop/ZipLens/releases/download/v2.1.3/ZipLens_2.1.3_arm64-preview.dmg) · [Version, Quelltext und Prüfsummen](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.3)

<img src="../screenshots/2.1.3/home-ko.png" alt="Echte App: koreanischer Startbildschirm" width="640">

**Erst den Inhalt ansehen, dann nur die benötigten Dateien entpacken.** ZipLens ist eine kostenlose, werbefreie macOS-App von SeederPowerDrop. Linsen veranschaulichen das Komprimieren und Entpacken.

## Funktionen

- Ordner durchsuchen, Namen suchen, Einträge auswählen sowie unterstützte kleine Bilder und UTF-8-Text vorab ansehen.
- **ZIP, 7Z, TAR, TAR.GZ und TAR.ZST** erstellen. Die Oberfläche bietet für ZIP/7Z Passwörter und Aufteilung in Teile. ALZ/EGG werden nur entpackt.
- Namenskonflikte behandeln, Aufgaben abbrechen und tatsächliche Ausgabepfade sowie Fehler prüfen.
- Zehn Oberflächensprachen, GitHub-Anleitungen und Automatisierung über die [JSON-CLI](../AI_CLI.md) derselben App. Kein zusätzlicher KI-API-Schlüssel nötig.

## Mit der DMG installieren

1. Laufende Aufgaben beenden, alte Versionen mit **⌘Q** schließen und die DMG öffnen.
2. Die **vollständige ZipLens.app nach Programme kopieren**. Eine vorhandene Installation vor dem Ersetzen sichern.
3. Die kopierte App starten, unter **ⓘ** die Version **2.1.3** prüfen und das DMG-Volume auswerfen.

Dies ist eine **ad-hoc signierte Apple-Silicon-Vorschau ohne Apple-Notarisierung**. Eine DMG ersetzt keine Notarisierung; macOS kann den Start blockieren. Der Betrieb auf jedem anderen Mac ist nicht garantiert, die Ausführung auf Intel ist ungeprüft. Eine manuelle Freigabe für eine App aus einer von Ihnen als vertrauenswürdig eingestuften Quelle beschreibt [Apple offiziell](https://support.apple.com/102445). [Prüfung von DMG, Download und Installation](../INSTALLATION_VALIDATION_2.1.3_KO_EN.md).

## Im Alltag

1. **Entpacken:** Archiv ablegen oder öffnen, Einträge durchsuchen und auswählen, dann Entpacken und einen Zielordner wählen. Bei Bedarf das Passwort eingeben.
2. **Komprimieren:** Dateien/Ordner ablegen oder auswählen, Format, Optionen, Namen und Ziel festlegen. Mit der ausgewogenen Einstellung beginnen; bereits komprimierte Fotos oder Videos werden eventuell kaum kleiner.
3. **Ergebnis prüfen:** Tatsächliche Pfade und Fehler ansehen. Nach Abbruch oder Fehler können bereits fertiggestellte Dateien bleiben. Alle Teile eines aufgeteilten Archivs zusammen ablegen und den ersten öffnen.

Die Sprache oben im Fenster wählen. **ⓘ → Anleitung / Hilfe** öffnet die Anleitung der gewählten Sprache auf GitHub `main` im Browser und benötigt Internet. Kann der Browser nicht gestartet werden, erscheint die integrierte Basisanleitung. Ein Netzwerkfehler nach dem Browserstart löst diesen Ersatz nicht automatisch aus. Unter **ⓘ** stehen außerdem Lizenzen, freiwillige Unterstützung sowie Bitcoin-Adresse und QR-Code.

## Frühere Messungen: Engine 2.1.2

Diese Werte stammen aus **CLI-Tests von 2.1.2 am 18. Oktober 2026**, nicht aus neuen 2.1.3-Messungen. Umgebung: Apple M3, 24 GiB, macOS 15.7.5; Kompressionsstufe 6.

| Eingabe | Beobachtung |
|---|---|
| Eine Datei mit 4 GiB + 64 MiB, etwa 4,36 GB | ZIP 2.1.2: Median 64,9 s Komprimieren / 8,5 s Entpacken; jeweils zwei Durchläufe |
| 10.000 Dateien à 4 KiB; je sechs zusätzliche Durchläufe | Entpack-Median: **0,722 s mit 2.1.1 → 0,815 s mit 2.1.2** |
| Gemischte 512-MiB-Probe, 7Z-Komprimierung | Alle 100 ms erfasstes RSS-Maximum des Prozessbaums: etwa **1,71 GiB** |

Die **40 vollständigen Durchläufe umfassen 14 mit 2.1.1 und 26 mit 2.1.2**. Namen, Größen und SHA-256 stimmten überein; Originale blieben erhalten. Bei kleinen Dateien lag der Entpack-Median rund 12,8 % höher. Die Bereiche überlappen, die Ursache ist ungeklärt. Eine allgemeine Beschleunigung wird nicht behauptet. RSS-Stichproben können kurze Spitzen verpassen oder gemeinsam genutzte Seiten mehrfach zählen. [Messwerte und Grenzen](../LARGE_FILE_VALIDATION_2026-10-18.md)

## Grenzen

ZIP-Erstellung erfordert druckbare ASCII-Passwörter; für Unicode-Passwörter 7Z wählen. Oberflächensprache und Dateinamenkodierung sind unabhängig. UTF-8 und gültige Unicode-Pfadmetadaten werden unterstützt. Alte ZIPs ohne Kennzeichnung nutzen eine CP949-kompatible Interpretation; CP932, GBK oder CP437 lassen sich nicht immer rekonstruieren. Bei Bedarf UTF-8-ZIP oder 7Z anfordern. Die Textvorschau nutzt UTF-8; Entpacken ändert die Inhaltskodierung nicht. Systemdialoge folgen macOS. Nicht jede Archivvariante und jeder Mac wurden geprüft. [Formatübersicht](../../README.md#지원-범위)

## Grundlegende Rechte bei Software und freiwillige Unterstützung

Alle Menschen sollten unabhängig von Einkommen und Sprache grundlegende digitale Werkzeuge nutzen sowie ihren Code studieren, ändern, teilen und verbessern können. Diese **grundlegenden Rechte bei Software** leiten das Projekt: Menschen und KI sollen Wissen teilen, gemeinsam lernen und gestalten.

Eigener Code steht unter [GPL-3.0-only](../../LICENSE); fremde Lizenzen bleiben erhalten. Offizielle Unterstützung über [Buy Me a Coffee](https://buymeacoffee.com/master_chief), [Ko-fi](https://ko-fi.com/seederpower) und Bitcoin ist freiwillig. Bitte behalten Sie in verteilten Änderungen Links zum Originalprojekt und zur Unterstützung des Autors bei. Das ist eine **freiwillige Bitte, keine zusätzliche GPL-Bedingung**.

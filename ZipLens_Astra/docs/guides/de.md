# ZipLens: Einführung, Funktionen und Bedienung

[Alle Sprachen](README.md) · Aktualisiert am 18. Oktober 2026

ZipLens ist eine kostenlose, werbefreie Archiv-App für macOS von SeederPowerDrop. Sehen Sie sich ein Archiv vor dem Entpacken an und wählen Sie nur benötigte Dateien. Die Linsen zeigen gebündeltes Licht beim Komprimieren und aufgefächertes Licht beim Entpacken.

## Installation und Version

Laden Sie `ZipLens_2.1.1_arm64-preview.zip` von der [Version 2.1.1](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1) herunter. Beenden Sie laufende Arbeiten, schließen Sie ältere Versionen mit ⌘Q und entpacken Sie mit dem Archivierungsprogramm von macOS. Legen Sie die vollständige `ZipLens.app` in Programme ab. Sichern Sie eine vorhandene Installation vor dem Ersetzen. Prüfen Sie die Version unter **ⓘ**.

Diese Apple-Silicon-Vorschau ist ad-hoc signiert, ohne Apple-Developer-ID-Signatur oder Notarisierung; macOS kann sie blockieren. Intel-Ausführung ist ungeprüft. Der Download bleibt **2.1.1**; `main` kann **Unreleased (unveröffentlichte)** Änderungen enthalten. Quelltext- oder Dokumentationsänderungen aktualisieren keine installierte App.

## Funktionen

- Erstellen Sie **ZIP, 7Z, TAR, TAR.GZ und TAR.ZST**. ZIP/7Z bieten Passwort und Aufteilung in der Oberfläche. ZIP nutzt standardmäßig AES-256; passwortgeschützte 7Z verschlüsseln auch Dateinamen. TAR bündelt nur; TAR-Varianten bieten weder Passwort noch Aufteilung. ZIP-Passwörter müssen aus druckbaren ASCII-Zeichen bestehen; für Umlaute oder andere Unicode-Zeichen wählen Sie 7Z.
- Ordner durchsuchen, Namen suchen, Dateien auswählen, abbrechen und Ergebnisse prüfen. Unterstützte Bilder/Texte unter **20 MiB** erscheinen in der App; andere Dateien werden vorübergehend entpackt und mit ihrer Standard-App geöffnet. Die Textvorschau liest nur UTF-8; erscheint älter kodierter Text fehlerhaft, entpacken Sie ihn und öffnen Sie ihn in einem passenden Editor—dieses Anzeigeproblem ist von der Erhaltung der ursprünglichen Bytes beim Entpacken zu unterscheiden.
- Weitere Formate wie ALZ und EGG lassen sich entpacken. Erkannte Endungen garantieren nicht jede Variante: siehe [Formatgrenzen](../../README.md#지원-범위).
- Automatisieren Sie mit der [JSON-CLI](../AI_CLI.md) derselben App. Die CLI erstellt keine mehrteiligen Archive.

## Öffnen und entpacken

1. Ziehen Sie ein Archiv ins Fenster oder wählen Sie **Öffnen**. Bei einer Auswahl nur aus mehreren Archiven öffnet sich das erste mit einem Hinweis.
2. Navigieren, suchen und markieren Sie alle oder einzelne Dateien. Ein Doppelklick zeigt eine Vorschau oder öffnet die Datei.
3. Starten Sie das Entpacken, wählen Sie das Ziel und geben Sie bei Aufforderung ein Passwort ein. Automatisches Entpacken speichert neben dem Original; mehrere ausgewählte Elemente auf oberster Ebene erzeugen einen Ordner mit dem Archivnamen.
4. Entscheiden Sie bei Namenskonflikten und prüfen Sie tatsächliche Pfade sowie Fehler. Nach Abbruch oder Fehler können fertige Dateien verbleiben. Halten Sie bei mehrteiligen Archiven alle Teile zusammen und öffnen Sie den ersten.

## Archiv erstellen

Ziehen oder wählen Sie Dateien/Ordner, legen Sie Format und Optionen fest, komprimieren Sie die Auswahl und wählen Sie Name sowie Ziel. Gemischte Auswahlen aus Archiven und normalen Dateien erzeugen ebenfalls ein neues Archiv. Alternativ beginnen Sie über die Schaltfläche zum Erstellen. Starten Sie mit Ausgewogen. Schnell bevorzugt kurze Laufzeiten; Maximal kann länger dauern. Bereits komprimierte Fotos oder Videos werden möglicherweise kaum kleiner.

## Sprache und Informationen

Wechseln Sie oben die Sprache; Arabisch läuft von rechts nach links. macOS-Dialoge folgen dem System, technische Fehler können anderssprachig bleiben. Die Standard-App-Einstellung ändert das Öffnen im Finder, nicht dessen Komprimieren-Befehl.

**ⓘ** enthält Autor, Version, Offline-Anleitung und freiwillige Unterstützung. Die Schaltfläche für Open-Source-Lizenzen öffnet deren Ordner im Finder. Auch Bitcoin-Adresse und QR-Code finden Sie dort.

## Dateinamen und Leistung

Oberflächensprache und Namenskodierung sind unabhängig. UTF-8 sowie gültige ZIP-Unicode-Pfadmetadaten werden unterstützt. Alte ZIP-Namen ohne Kennzeichnung werden mit einer koreanischen CP949-kompatiblen Interpretation gelesen. Unmarkiertes Shift-JIS/CP932, GBK oder CP437 lässt sich nicht immer erkennen. Bitten Sie gegebenenfalls um ein UTF-8-ZIP oder 7Z. Sprachwechsel reparieren keine Namen; Entpacken übersetzt keine Inhalte und ändert keine Textkodierung.

Geschwindigkeit hängt von Format, Dateianzahl, Stufe und Speicher ab. Die [Prüfaufzeichnungen](../VALIDATION.md) beschreiben Bedingungen und Grenzen, keine Garantie für fehlerfreie Verarbeitung jedes Archivs.

## Softwarefreiheit, Beiträge und Unterstützung

**Grundlegende Softwarerechte** sind unser Entwicklungswert: Jeder Mensch soll unabhängig von Einkommen oder Sprache grundlegende digitale Werkzeuge nutzen und ihren Code studieren, ändern, teilen und mitgestalten können. Menschen und KI können Wissen teilen, gemeinsam lernen und gestalten.

Eigener Code verwendet [GPL-3.0-only](../../LICENSE); Fremdkomponenten behalten ihre Lizenzen. Beiträge sind willkommen. [Buy Me a Coffee](https://buymeacoffee.com/master_chief) und [Ko-fi](https://ko-fi.com/seederpower) sind freiwillig. Bitte behalten Sie in veränderten Versionen Links zum Originalprojekt und zur Unterstützung des Autors bei; dies ist keine zusätzliche GPL-Bedingung.

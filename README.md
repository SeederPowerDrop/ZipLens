# ZipLens v1.1.0

A modern, universal archive extraction and compression utility built on **Tauri**, **Vanilla TS**, and **Rust**.

## What's New in v1.1
- **Advanced Archive Preview**: View the complete list of files inside an archive *before* extracting them.
- **Detailed File Metadata**: Displays the original size and compression efficiency ratio for all files inside the archive.
- **Partial Extraction**: Selectively check/uncheck files from the preview list. Extract only what you want!
- **Shift+Click Multi-select**: Native OS-like behavior for quickly selecting a continuous range of files in the preview list.
- **Dynamic Capacity Tracker**: See the exact storage footprint of your selected files in real time before extraction.

## Core Features

- **Universal Format Support**: Extract and compress ZIP, TAR, TAR.GZ, TAR.ZST, and 7Z formats directly and natively via Rust.
- **Extended Sidecar Support**: Handles RAR, ALZ, EGG, ISO, CAB, and LZH smoothly using an embedded `7zz` sidecar.
- **Korean Filename Auto-Detection (CP949/EUC-KR)**: Automatically detects and safely decodes non-UTF-8 filenames to prevent text corruption in old ZIP files.
- **Volume Split Compression**: Compress large folders into split volumes (10MB, 100MB, 700MB, 4GB).
- **macOS Quick Actions**: Integrates with "ZipLens로 압축 해제" workflow for simple right-click context menu extraction.

## Installation & Build

Ensure you have Rust and Node.js installed for your local environment.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development environment:
   ```bash
   npm run tauri dev
   ```
3. Build the release bundle (macOS, Windows, or Linux):
   ```bash
   npm run tauri build
   ```

## Requirements
- macOS environment (configured for Apple Silicon / Intel)
- Node.js & npm
- Rust & Cargo

## About

안녕하세요, SeederPowerDrop입니다.

macOS에 쓰이는 압축 프로그램이 불편한 와중에 바이브코딩을 알게 되어서 직접 만들어 봤습니다.
그래서 직접 만들어본 ZipLens입니다.
다른 Mac용 압축 프로그램과 달리 불편하지 않으면서 비용도 들지 않게 만들어 봤습니다.

ZipLens라는 이름은 Lens는 빛을 압축시키기도(Convergence) 발산시키기도(Divergence) 합니다.
그래서 Lens를 압축 프로그램에 빗대어 만들어 봤습니다.

모두 다 잘 사용했으면 합니다.

그리고 ERW FWS WRG

감사합니다.
(https://github.com/SeederPowerDrop)

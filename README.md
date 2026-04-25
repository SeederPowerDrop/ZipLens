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

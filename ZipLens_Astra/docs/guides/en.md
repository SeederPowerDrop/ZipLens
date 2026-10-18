# ZipLens: introduction, features and user guide

[All languages](README.md) · Updated October 18, 2026

ZipLens is a free, ad-free macOS archive app by SeederPowerDrop. Look inside an archive before extracting it, then choose only the files you need. Lens illustrations represent compression and extraction.

## Install and check the version

Download `ZipLens_2.1.1_arm64-preview.zip` from the [2.1.1 release](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.1). Quit older copies with ⌘Q, extract with macOS Archive Utility and keep the entire `ZipLens.app` in Applications. Back up an existing installation before replacing it. Check the version under **ⓘ**.

This Apple Silicon preview is ad-hoc signed, without Apple Developer ID signing or notarization; macOS may block it. Intel execution is unverified. The downloadable app remains **2.1.1**; `main` may include **Unreleased** fixes. Source updates do not update installed apps.

## Features

- Create **ZIP, 7Z, TAR, TAR.GZ and TAR.ZST**. ZIP/7Z support passwords and splitting through the GUI. ZIP defaults to AES-256; password-protected 7Z also encrypts filenames. TAR only bundles files; TAR variants have no password or split options. ZIP creation passwords require printable ASCII; choose 7Z for accented letters or other Unicode characters.
- Browse folders, search names, select entries, cancel work and review results. Supported image/text previews are smaller than **20 MiB**; other files open through their default app after temporary extraction. Text previews decode UTF-8 only; if legacy-encoded content looks garbled, extract it and open it in an editor supporting that encoding—this display issue is separate from preserving the original bytes during extraction.
- Open additional formats, including ALZ and EGG, for extraction. Not every variant is supported. See [format limits](../../README.md#지원-범위).
- Automate with the app’s JSON CLI; see the [CLI reference](../AI_CLI.md). GUI split creation is not a CLI option.

## Open and extract

1. Drop an archive onto the window or choose **Open / Choose files**. Selecting only multiple archives opens the first with a notice.
2. Browse folders, search and select all entries or individual checkboxes. Double-click a file to preview or open it.
3. Choose **Extract Archive**, a destination and, if requested, a password. **Smart Extract** saves beside the archive and creates an archive-named folder for several selected top-level items.
4. Resolve filename conflicts deliberately and check the completion report's actual paths and errors. Cancellation or failure can leave already completed files. For split archives, keep all parts together and open the first.

## Create an archive

Drop or select files/folders, choose a format and options, then **Compress selected items** and a destination. Mixed archives and ordinary files also create a new archive. Alternatively use **Create Archive → Select and compress**. Start with **Balanced**; **Fast** favors speed and **Maximum** may take longer. Already compressed photos or videos may shrink little.

## Language and About

Choose a language at the top. Arabic reads right to left. System dialogs follow macOS; engine diagnostics may use another language. **Default archive app** sets Finder opening associations, not its Compress command.

**ⓘ** contains the author, version, offline guide and optional support. **Open-source licenses** opens the bundled license folder in Finder. Bitcoin address-copy and QR controls are also in About.

## Filenames and performance

Interface language and filename encoding are separate. UTF-8 and valid ZIP Unicode-path metadata are supported; untagged legacy ZIP names use a Korean CP949-compatible fallback. Untagged Shift-JIS/CP932, GBK or CP437 names cannot always be inferred. Ask the creator to remake an archive as UTF-8 ZIP or 7Z when needed. Changing the UI language does not repair its names. Extraction does not translate file contents or change a text file's encoding.

Speed depends on format, file count, compression level and storage. See the [validation record](../VALIDATION.md) for conditions and limits; it is not a guarantee of error-free operation on every archive.

## Software freedom, contribution and support

Our idea of **basic software rights** is a development value: everyone, regardless of income or language, should be able to use basic digital tools and study, modify, share and contribute to their code. People and AI can share knowledge, learn and create together.

ZipLens's own code uses [GPL-3.0-only](../../LICENSE); third-party licenses remain separate. Contributions are welcome. [Buy Me a Coffee](https://buymeacoffee.com/master_chief) and [Ko-fi](https://ko-fi.com/seederpower) support is optional. Please retain the original project and author support links in distributed modifications; this is a voluntary request, not an additional GPL condition.

ZipLens 2.0 — Open-source acknowledgements / 오픈소스 고지

ZipLens uses third-party software under the separate licenses included here.
These notices do not assign an open-source license to the author's own app code.
Third-party copyright and license terms remain in force for redistribution,
whether the app is free, donation-supported, advertising-supported, or sold.

ZipLens에 사용한 오픈소스의 저작권 고지·이용 조건·해당 소스입니다.
앱을 무료로 배포하거나 후원·광고 수익을 받더라도 이 고지를 유지해야 합니다.
각 구성요소의 라이선스는 해당 구성요소에 적용되며, 이 문서가 개발자 자신의
앱 소스에 새로운 오픈소스 라이선스를 부여하지는 않습니다.

Contents / 구성

  7zip/License.txt
      Notices for the official 7-Zip 26.03 macOS executable.
      A local ad-hoc signature is added when packaging the app; source and
      executable program code are unchanged.
      Copyright (C) 1999–2026 Igor Pavlov. LGPL-2.1-or-later, with the
      unRAR restriction and the additional BSD notices stated in that file.
  7zip/LGPL-2.1.txt
      Full GNU Lesser General Public License version 2.1.
  7zip/7z2603-src.tar.xz
      Complete corresponding 7-Zip 26.03 source, including build files.
      This is an unmodified official source archive, provided locally rather
      than relying only on a future website link or a written source offer.
  7zip/SOURCE.txt
      Source origin, checksums, and replacement/build information.
  third-party/
      Versioned Rust/JavaScript dependency inventory, copyright and license
      texts, and corresponding source archives for MPL components.

ALZ and EGG extraction uses alkegi/unalz and alkegi/unegg under their published
MIT licenses, with their separately licensed dependencies. ZipLens does not
include ESTsoft's official EGG SDK or Bandisoft's Ark SDK. ALZ, EGG and RAR
creation is not implemented. The unRAR-derived code must not be used to
re-create the RAR compression algorithm; see 7zip/License.txt.

The open-source components are provided under the warranty disclaimers in
their licenses. Preserve this entire folder, including sources, when sharing
the app. Open About > Open-source licenses to locate these files offline.

앱을 공유할 때에는 소스를 포함한 이 폴더 전체를 함께 유지해 주세요.
프로그램 정보 > 오픈소스 라이선스에서 인터넷 연결 없이 확인할 수 있습니다.

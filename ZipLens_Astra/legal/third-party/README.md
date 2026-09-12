# Third-party notices and covered source

`NOTICES.txt` contains the component list and complete license/copyright texts.
`inventory.json` records exact versions, source URLs, source checksums, build graph
membership, and the SHA-256 of every notice. Paths are relative to this directory.
7-Zip is handled separately in `../7zip`.

`sources/*.crate` are the complete, unmodified published source archives of the
MPL-2.0 components in the inventory. A `.crate` file is a gzip-compressed tar
archive. These files are included with the application so recipients receive the
covered source without depending on an external website or a future source
request. The source download URLs remain available in the inventory as an
additional way to obtain the same versions. ZipLens does not modify these crates.

The application and the separately built legacy archive helper use separate Rust
lockfiles. Both target-filtered normal/build graphs are included, along with
frontend production npm dependencies and the Rust standard library's notices.
Build-only Rust components are conservatively included. The upstream standard
library notice includes other-platform components; inclusion of that notice does
not mean every listed target-specific component is linked into this macOS app.

`upstream-supplements` contains documents omitted from published crates.
`supplements.json` identifies their upstream URLs, exact VCS commits where
available, hashes, and provenance. Some older crates declare a standard license
without including its full text. For those, the exact declaration, published
copyright headers when present, author metadata, and the referenced standard
license text are preserved separately. Template copyright fields in a standard
license text are not a substitute for, or an assertion about, component authors.
The objc2 workspace's own licensing statement is retained verbatim, including
its explanation concerning Apple SDK-derived bindings.

The ALZ/EGG engines are `unalz` 0.2.1, `unegg` 0.2.1 and `libazo` 0.1.1 under their
published MIT licenses. Additional zlib notices for projects named in their
upstream references are retained conservatively. These references do not assert
that the original C/C++ implementations are linked or establish derivation. The
ESTsoft EGG SDK and Ark SDK are not components of this distribution.

The Zstandard C library is used under its BSD-3-Clause option. Its alternative
GPLv2 document is retained as part of the published source notices. Where a
component explicitly offers LGPL as an alternative to MIT, this distribution
chooses MIT. Other combined or file-level notices remain applicable as stated.
MPL-covered source is supplied as described above. These documents do not apply
a new license to the ZipLens application's own code.

To regenerate after an intentional dependency/toolchain change, run from the
`ZipLens_Astra` project directory:

```sh
python3 scripts/generate-third-party-notices.py
python3 scripts/generate-third-party-notices.py --check
```

The generator is offline and uses the installed dependency cache. It verifies
Rust source archives against both lockfiles before copying their license texts.
New or missing license declarations, unknown license identifiers, unhandled
copyleft combinations, missing license documents, changed supplement hashes, and
stale generated files cause an error. A maintainer must inspect actual upstream
terms before adding a new reviewed license or supplement. Automated inventory
checks do not establish rights that an upstream publisher has not granted.

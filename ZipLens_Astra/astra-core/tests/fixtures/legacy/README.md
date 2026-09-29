# ALZ / EGG regression fixtures

These small archives and their text contents were authored for ZipLens. `generate.py`
reproduces them deterministically using Python's standard library and public format
field layouts. No archive contents or implementation code were copied from upstream.
All test passwords are the public string `암호`. The text `폴더/한글.txt` contains
`ZipLens 한글 압축 테스트` followed by a newline; `other.txt` contains `other`.

Format/API references used to interpret the fixtures:

- <https://github.com/alkegi/unalz> (pinned crate 0.2.1)
- <https://github.com/alkegi/unegg> (pinned crate 0.2.1)
- <https://github.com/alkegi/libazo>

`store`, `deflate`, and `bzip2` cover ALZ's three compression methods. ALZ Bzip2
uses ALZ's modified block framing. EGG additionally covers Python-encoded LZMA
and AZO framing with a stored AZO block. `encrypted` uses independent ZipCrypto
encoding, including Korean password bytes. `solid.egg` packs two files into one
Deflate block. Split pairs exercise logical reading across volume boundaries.
These are synthetic compatibility tests, not a claim that every producer variant
or every real-world ALZip archive has been tested. The AZO fixture does not test
an arithmetic-coded AZO block; EGG AES/LEA encryption remains provided by the
pinned library but is not covered by these fixtures.

The integration suite also derives malformed fixtures in temporary directories to
check CRC failure without publication, absent final markers, missing volumes,
symlinked matching EGG volumes, unsafe paths, oversized declared sizes/counts,
relative-name expansion, nested parent IDs, and a known overstated encryption
header length. Selection and file preview are tested separately from full extraction.

## Extraction contract and deliberate limits

The `ziplens-legacy` helper accepts one bounded JSON request on stdin and returns
one JSON response on stdout. Passwords are never command-line arguments. It writes
only the exact selected entries to the parent's empty private staging directory.
The parent validates paths before extraction, checks file types/sizes and staging
contents afterwards, and publishes only after the helper succeeds. CRC or
cryptographic authentication failure, an incomplete archive, a killed/crashed
helper, and timeout all prevent publication. ALZ's partial-recovery APIs are not used.

Limits are enforced before upstream metadata allocation and before buffered codecs:

- 100,000 entries and 100,000 EGG data blocks; 16 MiB raw metadata and decoded or
  resolved filenames; 32 MiB protocol messages.
- 128 split volumes, 256 process file descriptors; 1 TiB combined input and declared
  extracted data. Missing, cyclic, ambiguous, and symlinked matching volumes fail.
- ALZ Bzip2: 64 MiB compressed input per entry.
- EGG LZMA/AZO: 64 MiB compressed input and 256 MiB decoded output per block.
- Solid EGG: 128 MiB combined compressed input; LZMA/AZO additionally require at
  most 256 MiB combined output. Mixed compression methods in one solid stream fail.
- EGG encrypted filenames/archive headers, nested relative parent-ID chains,
  archive links/special files, and unknown methods are rejected explicitly.

These are explicit format/buffer limits, not a general-purpose operating-system
memory sandbox. Codecs run in a separate process so cancellation can stop even a
CPU-only decoder. The parent kills and waits for that process on cancellation or
at the ten-minute limit. No byte-level decoding progress is available from these
libraries, so ALZ/EGG decoding reports indeterminate progress. Reading one selected
file from a solid archive may decode the complete shared stream internally.

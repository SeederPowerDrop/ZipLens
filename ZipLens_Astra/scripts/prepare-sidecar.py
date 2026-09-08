#!/usr/bin/env python3
"""Restore the official bundled 7-Zip binary without modifying the original project."""
from pathlib import Path
import hashlib
import json
import os
import tarfile
import tempfile

root = Path(__file__).resolve().parents[1]
archive = root / 'src-tauri/7z-mac.tar.xz'
provenance = json.loads((root / 'docs/sidecar-provenance.json').read_text())
if hashlib.sha256(archive.read_bytes()).hexdigest() != provenance['sha256_download']:
    raise SystemExit('Bundled 7-Zip archive checksum mismatch')
destination = root / 'src-tauri/binaries'
destination.mkdir(exist_ok=True)
with tarfile.open(archive) as source:
    for name in ['7zz', 'License.txt', 'History.txt', 'readme.txt']:
        member = source.getmember(name)
        if not member.isfile():
            raise SystemExit('Unexpected bundled archive member')
        data = source.extractfile(member).read()
        if name == '7zz' and hashlib.sha256(data).hexdigest() != provenance['sha256_binary']:
            raise SystemExit('7-Zip executable checksum mismatch')
        names = [name] if name != '7zz' else ['7zz', '7zz-aarch64-apple-darwin', '7zz-x86_64-apple-darwin']
        for target_name in names:
            target = destination / target_name
            if target.is_file() and target.read_bytes() == data:
                continue
            with tempfile.NamedTemporaryFile(dir=destination, delete=False) as temp:
                temp.write(data)
                temp_path = Path(temp.name)
            temp_path.chmod(0o755 if name == '7zz' else 0o644)
            os.replace(temp_path, target)
print('7-Zip ' + provenance['version'] + ' verified (arm64 + x86_64)')

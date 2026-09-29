#!/usr/bin/env python3
"""Verify that every original source/resource file is byte-for-byte unchanged."""
from pathlib import Path
import hashlib
import json
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'docs/original-manifest.json').read_text())
changed = [name for name, digest in manifest.items()
           if not (root.parent / name).is_file()
           or hashlib.sha256((root.parent / name).read_bytes()).hexdigest() != digest]
if changed:
    raise SystemExit('Original files changed or missing:\n' + '\n'.join(changed))
print(f'PASS: {len(manifest)} original files are unchanged.')

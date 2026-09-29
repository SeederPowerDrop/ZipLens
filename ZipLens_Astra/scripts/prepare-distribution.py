#!/usr/bin/env python3
"""Build the isolated decoder and verify every required distribution notice."""
from pathlib import Path
import argparse
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--target', help='Rust macOS target triple (defaults to Tauri target/host)')
args = parser.parse_args()
host = next(line.removeprefix('host: ') for line in subprocess.check_output(
    ['rustc', '-vV'], text=True).splitlines() if line.startswith('host: '))
architecture = os.environ.get('TAURI_ENV_ARCH')
target = args.target or (f'{architecture}-apple-darwin' if architecture else host)
if target not in ('aarch64-apple-darwin', 'x86_64-apple-darwin'):
    raise SystemExit(f'Unsupported distribution target: {target}. Build each macOS architecture separately.')

subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-sidecar.py')], check=True)
for name in ('README.txt', '7zip/SOURCE.txt', '7zip/License.txt', '7zip/readme.txt'):
    path = ROOT / 'legal' / name
    if not path.is_file() or path.stat().st_size == 0:
        raise SystemExit(f'Missing distribution notice: legal/{name}')
subprocess.run([
    sys.executable, str(ROOT / 'scripts/generate-third-party-notices.py'),
    '--check', '--target', target,
], check=True)
# A dedicated target directory avoids CARGO_TARGET_DIR from the parent Tauri
# build changing where this separately version-locked helper is produced.
build_directory = ROOT / 'astra-core/target'
subprocess.run([
    'cargo', 'build', '--manifest-path', str(ROOT / 'astra-core/Cargo.toml'),
    '--bin', 'ziplens-legacy', '--release', '--locked', '--offline',
    '--target', target, '--target-dir', str(build_directory),
], check=True)
binary = build_directory / target / 'release/ziplens-legacy'
expected_architecture = {'aarch64-apple-darwin': 'arm64', 'x86_64-apple-darwin': 'x86_64'}[target]
actual_architecture = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip()
if actual_architecture != expected_architecture:
    raise SystemExit(f'Built legacy helper architecture {actual_architecture!r} differs from target {target!r}')
data = binary.read_bytes()
destination = ROOT / 'src-tauri/binaries'
for name in (f'ziplens-legacy-{target}', 'ziplens-legacy'):
    path = destination / name
    if path.is_file() and path.read_bytes() == data:
        continue
    with tempfile.NamedTemporaryFile(dir=destination, delete=False) as temporary:
        temporary.write(data)
        temporary_path = Path(temporary.name)
    temporary_path.chmod(0o755)
    os.replace(temporary_path, path)
print(f'ALZ/EGG decoder and distribution notices prepared for {target}')

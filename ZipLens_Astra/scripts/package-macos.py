#!/usr/bin/env python3
"""Package a built macOS app with notices, local signatures, and verified ZIP bytes."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(arguments):
    result = subprocess.run(arguments, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def fingerprint(folder):
    return {
        p.relative_to(folder).as_posix(): (
            hashlib.sha256(p.read_bytes()).hexdigest(), stat.S_IMODE(p.stat().st_mode)
        )
        for p in folder.rglob('*') if p.is_file()
    }


def copy_tree(source, destination):
    # File Provider folders can reject ditto's metadata writes. This app has no
    # resource forks or symlinks; preserve every file byte and POSIX mode instead.
    destination.mkdir(parents=True, exist_ok=True)
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise RuntimeError(f'Unexpected bundle symlink: {path.name}')
        target = destination / path.relative_to(source)
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
        target.chmod(stat.S_IMODE(path.stat().st_mode))
    destination.chmod(stat.S_IMODE(source.stat().st_mode))


def verify_legacy_helper(bundled, prepared, architecture):
    """Reject a stale/wrong decoder while allowing only code-signature variation."""
    for path, label in [(bundled, 'Bundled'), (prepared, 'Prepared target')]:
        if not path.is_file() or not os.access(path, os.X_OK):
            raise RuntimeError(f'{label} legacy helper is missing or not executable; rebuild the app first')
        actual = run(['lipo', '-archs', str(path)])
        if actual != architecture:
            raise RuntimeError(f'{label} legacy helper architecture {actual!r} differs from app {architecture!r}')
    if bundled.read_bytes() == prepared.read_bytes():
        return
    # Removing signatures clears their padding but can leave different
    # __LINKEDIT sizes. Reapplying one identical local signature then normalizes
    # that metadata too, without changing either input executable.
    normalized = []
    with tempfile.TemporaryDirectory(prefix='ziplens-helper-verify-') as temporary:
        for index, path in enumerate((bundled, prepared)):
            copy = Path(temporary) / f'helper-{index}'
            copy.write_bytes(path.read_bytes())
            copy.chmod(0o755)
            run(['codesign', '--remove-signature', str(copy)])
            run(['codesign', '--force', '--sign', '-', '--timestamp=none',
                 '--identifier', 'com.ziplens.helper-comparison', str(copy)])
            normalized.append(copy.read_bytes())
    if normalized[0] != normalized[1]:
        raise RuntimeError('Bundled legacy helper differs from the prepared target helper; rebuild the app first')


def main():
    config = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text())
    name = config['productName'] + '.app'
    source = ROOT / 'src-tauri/target/release/bundle/macos' / name
    info = plistlib.loads((source / 'Contents/Info.plist').read_bytes())
    if info['CFBundleShortVersionString'] != config['version']:
        raise RuntimeError('Build version differs from configuration; rebuild the app first')
    architecture = run(['lipo', '-archs', str(source / 'Contents/MacOS/ziplens')])
    targets = {'arm64': 'aarch64-apple-darwin', 'x86_64': 'x86_64-apple-darwin'}
    if architecture not in targets:
        raise RuntimeError('Package each macOS architecture separately')
    run([sys.executable, str(ROOT / 'scripts/prepare-sidecar.py')])
    run([sys.executable, str(ROOT / 'scripts/generate-third-party-notices.py'),
         '--check', '--target', targets[architecture]])
    provenance = json.loads((ROOT / 'docs/sidecar-provenance.json').read_text())
    original_7zip = (ROOT / 'src-tauri/binaries/7zz').read_bytes()
    if hashlib.sha256(original_7zip).hexdigest() != provenance['sha256_binary']:
        raise RuntimeError('Official 7-Zip input hash differs')
    if architecture not in run(['lipo', '-archs', str(ROOT / 'src-tauri/binaries/7zz')]).split():
        raise RuntimeError('Official 7-Zip input does not support the app architecture')
    prepared_helper = ROOT / 'src-tauri/binaries' / f'ziplens-legacy-{targets[architecture]}'

    release = ROOT / 'release_build'
    release.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.package-', dir=release) as temporary:
        stage = Path(temporary)
        app = stage / name
        copy_tree(source, app)
        verify_legacy_helper(app / 'Contents/MacOS/ziplens-legacy', prepared_helper, architecture)
        shutil.rmtree(app / 'Contents/Resources/legal')
        copy_tree(ROOT / 'legal', app / 'Contents/Resources/legal')
        (app / 'Contents/MacOS/7zz').write_bytes(original_7zip)
        for binary, identifier in [('7zz', '7zz'), ('ziplens-legacy', 'legacy')]:
            path = app / 'Contents/MacOS' / binary
            if not os.access(path, os.X_OK):
                raise RuntimeError(f'Helper is not executable: {binary}')
            run(['codesign', '--force', '--sign', '-', '--timestamp=none',
                 '--identifier', f"{config['identifier']}.{identifier}", str(path)])
        run(['codesign', '--force', '--sign', '-', '--timestamp=none', str(app)])
        run(['codesign', '--verify', '--deep', '--strict', str(app)])
        assert fingerprint(ROOT / 'legal') == fingerprint(app / 'Contents/Resources/legal')

        archive_name = f"ZipLens_{config['version']}_{architecture}.zip"
        archive = stage / archive_name
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
            for path in sorted(app.rglob('*')):
                if path.is_file():
                    zipped.write(path, path.relative_to(stage).as_posix())
        with zipfile.ZipFile(archive) as zipped:
            if zipped.testzip() is not None:
                raise RuntimeError('ZIP CRC validation failed')
            for relative, (sha, mode) in fingerprint(app).items():
                member = zipped.getinfo(name + '/' + relative)
                if hashlib.sha256(zipped.read(member)).hexdigest() != sha:
                    raise RuntimeError('ZIP member differs from app')
                if stat.S_IMODE(member.external_attr >> 16) != mode:
                    raise RuntimeError('ZIP member lost file permissions')

        destination = release / name
        if destination.exists():
            os.rename(destination, stage / 'previous.app')
        os.rename(app, destination)
        output_archive = release / archive_name
        backup = release / archive_name.replace('.zip', '.before-licenses.zip')
        if output_archive.exists() and not backup.exists():
            shutil.copyfile(output_archive, backup)
        os.replace(archive, output_archive)
        run(['codesign', '--verify', '--deep', '--strict', str(destination)])
        result = {
            'architecture': architecture,
            'app_file_count': len(fingerprint(destination)),
            'legal_file_count': len(fingerprint(ROOT / 'legal')),
            'binary_sha256': hashlib.sha256((destination / 'Contents/MacOS/ziplens').read_bytes()).hexdigest(),
            'legacy_helper_sha256': hashlib.sha256((destination / 'Contents/MacOS/ziplens-legacy').read_bytes()).hexdigest(),
            'signed_7zip_sha256': hashlib.sha256((destination / 'Contents/MacOS/7zz').read_bytes()).hexdigest(),
            'official_7zip_input_sha256': provenance['sha256_binary'],
            'archive_sha256': hashlib.sha256(output_archive.read_bytes()).hexdigest(),
            'archive_bytes': output_archive.stat().st_size,
            'signature': 'local ad-hoc; not Developer ID; not notarized',
            'deep_strict_signature_verified': True,
            'zip_crc_contents_and_modes_verified': True,
            'legacy_helper_architecture_and_prepared_bytes_verified': True,
        }
        (release / 'packaging-result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

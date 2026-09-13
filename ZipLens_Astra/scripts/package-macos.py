#!/usr/bin/env python3
"""Package a notarized macOS release, or an explicitly requested local preview."""
from pathlib import Path
import argparse
import errno
import hashlib
import json
import os
import plistlib
import re
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


def parse_options(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true',
                        help='Create an ad-hoc signed local preview; it is not a Gatekeeper-approved release')
    parser.add_argument('--signing-identity', default=os.environ.get('ZIPLENS_SIGNING_IDENTITY'),
                        help='Developer ID Application certificate name or SHA-1 (or ZIPLENS_SIGNING_IDENTITY)')
    parser.add_argument('--notary-profile', default=os.environ.get('ZIPLENS_NOTARY_PROFILE'),
                        help='Existing notarytool keychain profile (or ZIPLENS_NOTARY_PROFILE)')
    return parser.parse_args(arguments)


def validate_credentials(options):
    """Fail before build preparation or release writes; never fall back to ad-hoc."""
    if options.preview:
        return '-'
    if not options.signing_identity or not options.notary_profile:
        raise RuntimeError('Public packaging requires --signing-identity and --notary-profile '
                           '(or ZIPLENS_SIGNING_IDENTITY and ZIPLENS_NOTARY_PROFILE). '
                           'Use --preview only for a local, non-notarized preview.')
    identities = run(['security', 'find-identity', '-v', '-p', 'codesigning'])
    matches = [sha for sha, name in re.findall(r'\b([0-9A-Fa-f]{40})\s+"([^"]+)"', identities)
               if name.startswith('Developer ID Application: ') and
               (name == options.signing_identity or sha.lower() == options.signing_identity.lower())]
    if len(matches) != 1:
        raise RuntimeError('Signing identity must match exactly one valid Developer ID Application '
                           'certificate with its private key in the keychain.')
    # history validates the existing profile without changing credentials or submitting software.
    run(['xcrun', 'notarytool', 'history', '--keychain-profile', options.notary_profile,
         '--output-format', 'json'])
    return matches[0]


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


def sign_app(app, identifier, identity, preview):
    options = ['--timestamp=none'] if preview else ['--options', 'runtime', '--timestamp']
    # Sign nested executables before sealing their containing app. Do not use --deep to sign.
    for binary, suffix in [('7zz', '7zz'), ('ziplens-legacy', 'legacy')]:
        path = app / 'Contents/MacOS' / binary
        if not path.is_file() or not os.access(path, os.X_OK):
            raise RuntimeError(f'Helper is missing or not executable: {binary}')
        run(['codesign', '--force', '--sign', identity, *options,
             '--identifier', f'{identifier}.{suffix}', str(path)])
    run(['codesign', '--force', '--sign', identity, *options, str(app)])
    run(['codesign', '--verify', '--deep', '--strict', str(app)])


def create_zip(app, archive):
    # ditto preserves bundle metadata, including the notarization ticket, in the ZIP.
    run(['ditto', '-c', '-k', '--rsrc', '--extattr', '--sequesterRsrc', '--keepParent',
         str(app), str(archive)])


def notarize_app(app, stage, profile):
    submission = stage / 'notarization-submission.zip'
    create_zip(app, submission)
    response = json.loads(run(['xcrun', 'notarytool', 'submit', str(submission),
                               '--keychain-profile', profile, '--wait', '--output-format', 'json']))
    if response.get('status') != 'Accepted' or not response.get('id'):
        raise RuntimeError(f"Notarization was not accepted: {response.get('status', 'missing status')} "
                           f"(submission {response.get('id', 'unknown')}). Inspect its notarytool log.")
    run(['xcrun', 'stapler', 'staple', str(app)])
    run(['xcrun', 'stapler', 'validate', str(app)])
    run(['codesign', '--verify', '--deep', '--strict', str(app)])
    return response['id']


def verify_archive(app, archive, preview):
    """Verify what macOS actually extracts, rather than only the ZIP directory."""
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise RuntimeError('ZIP CRC validation failed')
    # Stay outside synced/File Provider folders so extraction can restore macOS metadata.
    with tempfile.TemporaryDirectory(prefix='ziplens-roundtrip-') as temporary:
        run(['ditto', '-x', '-k', '--rsrc', '--extattr', str(archive), temporary])
        extracted = Path(temporary) / app.name
        if not extracted.is_dir() or fingerprint(app) != fingerprint(extracted):
            raise RuntimeError('Extracted ZIP app differs in file contents or POSIX permissions')
        run(['codesign', '--verify', '--deep', '--strict', str(extracted)])
        if not preview:
            run(['xcrun', 'stapler', 'validate', str(extracted)])
            run(['spctl', '--assess', '--type', 'execute', '--verbose=4', str(extracted)])


def publish_outputs(app, archive, release, result):
    """Prepare every output before replacing the previous local package."""
    release.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.package-export-', dir=release) as temporary:
        pending = Path(temporary)
        staged_app = pending / app.name
        try:
            os.rename(app, staged_app)
        except OSError as error:
            if error.errno != errno.EXDEV:
                raise
            # A separate release volume needs a metadata-preserving copy instead of rename.
            run(['ditto', '--rsrc', '--extattr', str(app), str(staged_app)])
        run(['codesign', '--verify', '--deep', '--strict', str(staged_app)])
        if not result['preview']:
            run(['xcrun', 'stapler', 'validate', str(staged_app)])
        shutil.copyfile(archive, pending / archive.name)
        if hashlib.sha256((pending / archive.name).read_bytes()).hexdigest() != result['archive_sha256']:
            raise RuntimeError('Release ZIP copy differs from the verified archive')
        (pending / 'SHA256SUMS.txt').write_text(f"{result['archive_sha256']}  {archive.name}\n")
        (pending / 'packaging-result.json').write_text(json.dumps(result, indent=2) + '\n')
        names = [app.name, archive.name, 'SHA256SUMS.txt', 'packaging-result.json']
        replaced = []
        try:
            for name in names:
                destination = release / name
                backup = pending / ('previous-' + name)
                if destination.exists():
                    os.rename(destination, backup)
                replaced.append((destination, backup))
                os.rename(pending / name, destination)
        except OSError:
            for destination, backup in reversed(replaced):
                if destination.is_dir():
                    shutil.rmtree(destination)
                elif destination.exists():
                    destination.unlink()
                if backup.exists():
                    os.rename(backup, destination)
            raise


def main(arguments=None):
    options = parse_options(arguments)
    identity = validate_credentials(options)
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
    if options.preview:
        release = release / 'preview'
    with tempfile.TemporaryDirectory(prefix='ziplens-package-') as temporary:
        stage = Path(temporary)
        app = stage / name
        copy_tree(source, app)
        verify_legacy_helper(app / 'Contents/MacOS/ziplens-legacy', prepared_helper, architecture)
        shutil.rmtree(app / 'Contents/Resources/legal')
        copy_tree(ROOT / 'legal', app / 'Contents/Resources/legal')
        (app / 'Contents/MacOS/7zz').write_bytes(original_7zip)
        sign_app(app, config['identifier'], identity, options.preview)
        if fingerprint(ROOT / 'legal') != fingerprint(app / 'Contents/Resources/legal'):
            raise RuntimeError('Bundled legal notices differ from their prepared source')
        submission_id = None if options.preview else notarize_app(app, stage, options.notary_profile)

        suffix = '-preview' if options.preview else ''
        archive_name = f"ZipLens_{config['version']}_{architecture}{suffix}.zip"
        archive = stage / archive_name
        create_zip(app, archive)
        verify_archive(app, archive, options.preview)
        result = {
            'architecture': architecture,
            'preview': options.preview,
            'public_distribution_ready': not options.preview,
            'archive_name': archive_name,
            'app_file_count': len(fingerprint(app)),
            'legal_file_count': len(fingerprint(ROOT / 'legal')),
            'binary_sha256': hashlib.sha256((app / 'Contents/MacOS/ziplens').read_bytes()).hexdigest(),
            'legacy_helper_sha256': hashlib.sha256((app / 'Contents/MacOS/ziplens-legacy').read_bytes()).hexdigest(),
            'signed_7zip_sha256': hashlib.sha256((app / 'Contents/MacOS/7zz').read_bytes()).hexdigest(),
            'official_7zip_input_sha256': provenance['sha256_binary'],
            'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
            'archive_bytes': archive.stat().st_size,
            'signature': ('local ad-hoc; not Developer ID; not notarized' if options.preview
                          else 'Developer ID Application; hardened runtime; secure timestamp'),
            'notarized': not options.preview,
            'notarization_submission_id': submission_id,
            'stapled_ticket_verified': not options.preview,
            'gatekeeper_assessment': 'not assessed (local preview)' if options.preview else 'accepted',
            'deep_strict_signature_verified': True,
            'zip_crc_contents_and_modes_verified': True,
            'zip_extracted_signature_verified': True,
            'legacy_helper_architecture_and_prepared_bytes_verified': True,
        }
        publish_outputs(app, archive, release, result)
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(f'Packaging failed: {error}')

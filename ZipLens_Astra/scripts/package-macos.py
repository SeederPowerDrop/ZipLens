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

from distribution_license import verify_app_license

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


def installation_readme(app_name, version, preview):
    notice = ('This preview is not signed with Apple Developer ID or notarized. '
              'macOS may block it from opening.\n'
              '이 프리뷰는 Apple Developer ID 서명·공증을 완료하지 않아 macOS가 실행을 차단할 수 있습니다.\n'
              if preview else '')
    return (f'ZipLens {version} — Install / 설치\n\n'
            f'1. Finish any archive operations and quit older ZipLens copies.\n'
            f'2. Drag {app_name} onto the Applications shortcut.\n'
            f'   Replace an existing copy only if you intend to update it.\n'
            f'3. Eject this disk image, then open {app_name} from Applications.\n\n'
            f'1. 진행 중인 압축 작업을 마치고 이전 ZipLens를 종료하세요.\n'
            f'2. {app_name}을 Applications 바로가기로 끌어다 놓으세요.\n'
            f'   기존 설치본을 업데이트하려는 경우에만 교체하세요.\n'
            f'3. 디스크 이미지를 추출한 뒤 응용 프로그램에서 {app_name}을 여세요.\n\n'
            f'{notice}\nHelp / 도움말: https://github.com/SeederPowerDrop/ZipLens\n')


def create_disk_image(app, image, stage, version, preview):
    """Build a read-only drag-install image from an already verified app."""
    contents = stage / 'disk-image-contents'
    contents.mkdir()
    # Preserve the app's extended attributes and notarization ticket. The only
    # intentional symlink is the conventional root-level Applications shortcut.
    run(['ditto', '--rsrc', '--extattr', str(app), str(contents / app.name)])
    (contents / 'Applications').symlink_to('/Applications', target_is_directory=True)
    readme = installation_readme(app.name, version, preview).encode('utf-8')
    (contents / 'README.txt').write_bytes(readme)
    run(['hdiutil', 'create', '-fs', 'HFS+', '-format', 'UDZO', '-volname',
         f'ZipLens {version}', '-srcfolder', str(contents), str(image)])
    return readme


def notarize_disk_image(image, identity, identifier, profile):
    """The signed image is a separate notarization target from the enclosed app."""
    run(['codesign', '--force', '--sign', identity, '--timestamp',
         '--identifier', f'{identifier}.dmg', str(image)])
    run(['codesign', '--verify', '--strict', str(image)])
    response = json.loads(run(['xcrun', 'notarytool', 'submit', str(image),
                               '--keychain-profile', profile, '--wait', '--output-format', 'json']))
    if response.get('status') != 'Accepted' or not response.get('id'):
        raise RuntimeError(f"Disk image notarization was not accepted: {response.get('status', 'missing status')} "
                           f"(submission {response.get('id', 'unknown')}). Inspect its notarytool log.")
    run(['xcrun', 'stapler', 'staple', str(image)])
    run(['xcrun', 'stapler', 'validate', str(image)])
    run(['codesign', '--verify', '--strict', str(image)])
    run(['spctl', '--assess', '--type', 'open', '--context', 'context:primary-signature',
         '--verbose=4', str(image)])
    return response['id']


def verify_disk_image_app(expected, actual):
    """Reject altered bytes, modes, directories, or unexpected app symlinks."""
    if not actual.is_dir() or actual.is_symlink():
        raise RuntimeError('Disk image app is missing or is a symlink')
    paths = [actual, *actual.rglob('*')]
    if any(path.is_symlink() for path in paths):
        raise RuntimeError('Unexpected symlink inside disk image app')
    def directories(folder):
        return {path.relative_to(folder).as_posix(): stat.S_IMODE(path.stat().st_mode)
                for path in [folder, *folder.rglob('*')] if path.is_dir()}
    if fingerprint(expected) != fingerprint(actual) or directories(expected) != directories(actual):
        raise RuntimeError('Disk image app differs in contents or POSIX permissions')


def detach_disk_image(mountpoint):
    """Retry a busy test mount, but never hide failure or delete a mounted tree."""
    try:
        run(['hdiutil', 'detach', str(mountpoint)])
    except RuntimeError:
        try:
            run(['hdiutil', 'detach', '-force', str(mountpoint)])
        except RuntimeError as error:
            raise RuntimeError(f'Cannot detach verification image at {mountpoint}; '
                               'temporary files were retained for safe manual cleanup') from error


def verify_disk_image(app, image, readme, preview):
    """Mount the final image read-only and check a Finder-style installation copy."""
    run(['hdiutil', 'verify', str(image)])
    if run(['hdiutil', 'imageinfo', '-format', str(image)]) != 'UDZO':
        raise RuntimeError('Disk image must use the read-only compressed UDZO format')
    temporary = Path(tempfile.mkdtemp(prefix='ziplens-dmg-verify-'))
    mountpoint = temporary / 'mounted'
    mountpoint.mkdir()
    attached = False
    try:
        response = run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-noautoopen',
                        '-mountpoint', str(mountpoint), '-plist', str(image)])
        attached = True
        entities = plistlib.loads(response.encode('utf-8')).get('system-entities', [])
        mounted = [entity.get('mount-point') for entity in entities if entity.get('mount-point')]
        # macOS tempfile paths can use /var while hdiutil reports /private/var.
        # Accept that filesystem alias, but still require exactly our one mount.
        if (len(mounted) != 1 or not isinstance(mounted[0], str)
                or Path(mounted[0]).resolve() != mountpoint.resolve()):
            raise RuntimeError('Disk image did not mount at the requested verification path')
        applications = mountpoint / 'Applications'
        if not applications.is_symlink() or os.readlink(applications) != '/Applications':
            raise RuntimeError('Disk image Applications shortcut must point to /Applications')
        instructions = mountpoint / 'README.txt'
        if instructions.is_symlink() or not instructions.is_file() or instructions.read_bytes() != readme:
            raise RuntimeError('Disk image installation instructions are missing or changed')
        visible_names = {path.name for path in mountpoint.iterdir() if not path.name.startswith('.')}
        if visible_names != {app.name, 'Applications', 'README.txt'}:
            raise RuntimeError('Unexpected visible items in disk image')
        mounted_app = mountpoint / app.name
        verify_disk_image_app(app, mounted_app)
        run(['codesign', '--verify', '--deep', '--strict', str(mounted_app)])
        installed = temporary / 'installed' / app.name
        run(['ditto', '--rsrc', '--extattr', str(mounted_app), str(installed)])
        verify_disk_image_app(app, installed)
        run(['codesign', '--verify', '--deep', '--strict', str(installed)])
        if not preview:
            run(['xcrun', 'stapler', 'validate', str(installed)])
            run(['spctl', '--assess', '--type', 'execute', '--verbose=4', str(installed)])
    finally:
        # An attach error can still leave a mounted volume. If detach fails,
        # retain this directory: recursively deleting a live mount is unsafe.
        if attached or mountpoint.is_mount():
            detach_disk_image(mountpoint)
        shutil.rmtree(temporary)


def publish_outputs(app, archive, image, release, result):
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
        checksums = []
        for source, digest_key in [(archive, 'archive_sha256'), (image, 'dmg_sha256')]:
            shutil.copyfile(source, pending / source.name)
            digest = hashlib.sha256((pending / source.name).read_bytes()).hexdigest()
            if digest != result[digest_key]:
                raise RuntimeError(f'Release {source.suffix} copy differs from the verified artifact')
            checksums.append(f'{digest}  {source.name}\n')
        (pending / 'SHA256SUMS.txt').write_text(''.join(checksums))
        (pending / 'packaging-result.json').write_text(json.dumps(result, indent=2) + '\n')
        names = [app.name, archive.name, image.name, 'SHA256SUMS.txt', 'packaging-result.json']
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
    verify_app_license(ROOT)
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
        image = stage / archive_name.replace('.zip', '.dmg')
        readme = create_disk_image(app, image, stage, config['version'], options.preview)
        image_submission_id = (None if options.preview else notarize_disk_image(
            image, identity, config['identifier'], options.notary_profile))
        verify_disk_image(app, image, readme, options.preview)
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
            'primary_download_name': image.name,
            'dmg_name': image.name,
            'dmg_sha256': hashlib.sha256(image.read_bytes()).hexdigest(),
            'dmg_bytes': image.stat().st_size,
            'dmg_signature': ('unsigned disk image; enclosed app uses local ad-hoc signature' if options.preview
                              else 'Developer ID Application; secure timestamp'),
            'dmg_notarized': not options.preview,
            'dmg_notarization_submission_id': image_submission_id,
            'dmg_stapled_ticket_verified': not options.preview,
            'dmg_gatekeeper_assessment': 'not assessed (local preview)' if options.preview else 'accepted',
            'dmg_readonly_udzo_verified': True,
            'dmg_mount_and_install_copy_verified': True,
            'dmg_applications_symlink_verified': True,
            'dmg_mounted_and_copied_app_signature_verified': True,
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
        publish_outputs(app, archive, image, release, result)
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(f'Packaging failed: {error}')

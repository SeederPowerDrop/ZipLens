#!/usr/bin/env python3
"""macOS packaging gate regressions; run after preparing the release sidecars."""
from pathlib import Path
import contextlib
import hashlib
import io
import json
import os
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
script = ROOT / 'scripts/package-macos.py'
namespace = {'__file__': str(script), '__name__': 'package_macos_tests'}
exec(compile(script.read_text(), str(script), 'exec'), namespace)
verify = namespace['verify_legacy_helper']
real_run = namespace['run']


class ReleasePackagingTests(unittest.TestCase):
    """Exercise publishing decisions with real ZIP round trips and mocked Apple services."""
    identity = 'Developer ID Application: ZipLens Test (TESTTEAM01)'
    certificate = 'A' * 40

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ziplens-release-test-')
        self.directory = Path(self.temporary.name)
        self.config = {'productName': 'ZipLens Test', 'version': '2.0.0',
                       'identifier': 'com.ziplens.test'}
        self.source = self.directory / 'src-tauri/target/release/bundle/macos/ZipLens Test.app'
        (self.source / 'Contents/MacOS').mkdir(parents=True)
        (self.source / 'Contents/Resources/legal').mkdir(parents=True)
        (self.source / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleShortVersionString': '2.0.0'}))
        for name in ['ziplens', '7zz', 'ziplens-legacy']:
            path = self.source / 'Contents/MacOS' / name
            path.write_bytes(name.encode())
            path.chmod(0o755)
        (self.directory / 'src-tauri/tauri.conf.json').write_text(json.dumps(self.config))
        binaries = self.directory / 'src-tauri/binaries'
        binaries.mkdir()
        for name in ['7zz', 'ziplens-legacy']:
            target = name if name == '7zz' else name + '-aarch64-apple-darwin'
            shutil.copy2(self.source / 'Contents/MacOS' / name, binaries / target)
        (self.directory / 'docs').mkdir()
        (self.directory / 'docs/sidecar-provenance.json').write_text(json.dumps({
            'sha256_binary': hashlib.sha256(b'7zz').hexdigest()}))
        (self.directory / 'legal').mkdir()
        (self.directory / 'legal/NOTICE.txt').write_text('License notice\n')
        (self.directory / 'LICENSE').write_text('Canonical GPL text for test fixture\n')
        (self.directory / 'legal/ziplens').mkdir()
        (self.directory / 'legal/ziplens/COPYING.txt').write_bytes(
            (self.directory / 'LICENSE').read_bytes())
        (self.directory / 'legal/ziplens/NOTICE.txt').write_text('ZipLens license notice\n')
        self.release = self.directory / 'release_build'
        self.release.mkdir()
        (self.release / 'previous.zip').write_bytes(b'previous release')
        self.initial_release = namespace['fingerprint'](self.release)
        self.notary_status = 'Accepted'
        self.gatekeeper_error = False
        self.profile_error = False
        self.dmg_notary_status = 'Accepted'
        self.dmg_mutation = None
        self.dmg_mountpoints = []
        self.dmg_tickets = set()
        self.commands = []
        self.mock_run = Mock(side_effect=self.run_tool)
        self.namespace_patch = patch.dict(namespace, {'ROOT': self.directory, 'run': self.mock_run})
        self.namespace_patch.start()
        self.environment_patch = patch.dict(os.environ, {}, clear=True)
        self.environment_patch.start()

    def tearDown(self):
        self.environment_patch.stop()
        self.namespace_patch.stop()
        self.temporary.cleanup()

    def run_tool(self, command):
        self.commands.append(command)
        if command[0] == 'ditto':
            return real_run(command)
        # Unit tests model disk-image contents with a real metadata-preserving
        # ZIP. Real hdiutil format/mount verification remains a packaging gate;
        # these doubles exercise failure handling without requiring a disk mount.
        if command[:2] == ['hdiutil', 'create']:
            source = command[command.index('-srcfolder') + 1]
            return real_run(['ditto', '-c', '-k', '--rsrc', '--extattr', source, command[-1]])
        if command[:2] == ['hdiutil', 'imageinfo']:
            return 'UDZO'
        if command[:2] == ['hdiutil', 'attach']:
            mountpoint = Path(command[command.index('-mountpoint') + 1])
            self.dmg_mountpoints.append(mountpoint)
            real_run(['ditto', '-x', '-k', '--rsrc', '--extattr', command[-1], str(mountpoint)])
            if self.dmg_mutation:
                self.dmg_mutation(mountpoint)
            return plistlib.dumps({'system-entities': [{'mount-point': str(mountpoint)}]}).decode()
        if command[0] == 'lipo':
            return 'arm64'
        if command[0] == 'security':
            return f'  1) {self.certificate} "{self.identity}"\n     1 valid identities found'
        if command[:3] == ['xcrun', 'notarytool', 'history']:
            if self.profile_error:
                raise RuntimeError('No Keychain password item found for profile')
            return '{"history": []}'
        if command[:3] == ['xcrun', 'notarytool', 'submit']:
            image = Path(command[3]).suffix == '.dmg'
            return json.dumps({'id': 'test-dmg-submission-id' if image else 'test-submission-id',
                               'status': self.dmg_notary_status if image else self.notary_status})
        if command[:3] == ['xcrun', 'stapler', 'staple']:
            if Path(command[-1]).suffix == '.dmg':
                self.dmg_tickets.add(command[-1])
            else:
                (Path(command[-1]) / 'Contents/stapled-ticket.txt').write_text('test ticket')
        if command[:3] == ['xcrun', 'stapler', 'validate']:
            if (command[-1] not in self.dmg_tickets
                    and not (Path(command[-1]) / 'Contents/stapled-ticket.txt').is_file()):
                raise RuntimeError('Missing test notarization ticket')
        if command[0] == 'spctl' and self.gatekeeper_error:
            raise RuntimeError('Gatekeeper rejected app')
        return ''

    def public_arguments(self):
        return ['--signing-identity', self.identity, '--notary-profile', 'test-profile']

    def package(self, arguments):
        with contextlib.redirect_stdout(io.StringIO()):
            namespace['main'](arguments)
        output = self.release / 'preview' if '--preview' in arguments else self.release
        return json.loads((output / 'packaging-result.json').read_text())

    def assert_release_unchanged(self):
        self.assertEqual(self.initial_release, namespace['fingerprint'](self.release))

    def test_default_missing_credentials_fails_before_preparation_or_release_writes(self):
        with self.assertRaisesRegex(RuntimeError, 'Public packaging requires'):
            namespace['main']([])
        self.mock_run.assert_not_called()
        self.assert_release_unchanged()

    def test_development_certificate_or_adhoc_identity_cannot_pass_public_gate(self):
        for identity in ['-', 'Apple Development: ZipLens Test (TESTTEAM01)', 'Developer ID Application:']:
            with self.subTest(identity=identity):
                with self.assertRaisesRegex(RuntimeError, 'valid Developer ID Application'):
                    namespace['main'](['--signing-identity', identity, '--notary-profile', 'test-profile'])
        self.assertFalse(any(command[0] == 'ditto' for command in self.commands))
        self.assert_release_unchanged()

    def test_missing_existing_keychain_profile_fails_before_build_preparation(self):
        self.profile_error = True
        with self.assertRaisesRegex(RuntimeError, 'No Keychain password item'):
            namespace['main'](self.public_arguments())
        self.assertEqual([command[0] for command in self.commands], ['security', 'xcrun'])
        self.assert_release_unchanged()

    def test_public_credentials_can_be_supplied_by_environment_and_certificate_hash(self):
        with patch.dict(os.environ, {'ZIPLENS_SIGNING_IDENTITY': self.certificate.lower(),
                                     'ZIPLENS_NOTARY_PROFILE': 'test-profile'}):
            options = namespace['parse_options']([])
            self.assertEqual(self.certificate, namespace['validate_credentials'](options))

    def test_missing_or_empty_app_license_documents_prevent_packaging(self):
        for relative in ('LICENSE', 'legal/ziplens/COPYING.txt', 'legal/ziplens/NOTICE.txt'):
            path = self.directory / relative
            original = path.read_bytes()
            for state in ('missing', 'empty'):
                with self.subTest(document=relative, state=state):
                    if state == 'missing':
                        path.unlink()
                    else:
                        path.write_text(' \n')
                    try:
                        with self.assertRaisesRegex(RuntimeError, 'Missing or empty ZipLens license document'):
                            namespace['main'](['--preview'])
                        self.assert_release_unchanged()
                    finally:
                        path.write_bytes(original)
        self.assertFalse(any(command[0] in ['codesign', 'ditto'] for command in self.commands))

    def test_mismatched_bundled_app_license_prevents_packaging(self):
        (self.directory / 'legal/ziplens/COPYING.txt').write_text('Stale license text\n')
        with self.assertRaisesRegex(RuntimeError, 'differs from the canonical LICENSE'):
            namespace['main'](['--preview'])
        self.assert_release_unchanged()
        self.assertFalse(any(command[0] in ['codesign', 'ditto'] for command in self.commands))

    def test_public_package_signs_inside_out_notarizes_staples_then_verifies_extracted_zip(self):
        result = self.package(self.public_arguments())
        signing = [command for command in self.commands if command[:2] == ['codesign', '--force']]
        self.assertEqual([Path(command[-1]).name for command in signing],
                         ['7zz', 'ziplens-legacy', 'ZipLens Test.app', 'ZipLens_2.0.0_arm64.dmg'])
        for command in signing:
            self.assertIn(self.certificate, command)
            self.assertIn('--timestamp', command)
            if Path(command[-1]).suffix != '.dmg':
                self.assertIn('runtime', command)
            self.assertNotIn('--deep', command)
        submit_index = next(index for index, command in enumerate(self.commands)
                            if command[:3] == ['xcrun', 'notarytool', 'submit'])
        submit = self.commands[submit_index]
        self.assertIn('--wait', submit)
        self.assertIn('json', submit)
        staple_index = next(index for index, command in enumerate(self.commands)
                            if command[:3] == ['xcrun', 'stapler', 'staple'])
        zip_indices = [index for index, command in enumerate(self.commands)
                       if command[:3] == ['ditto', '-c', '-k']]
        self.assertLess(zip_indices[0], submit_index)
        self.assertLess(submit_index, staple_index)
        self.assertLess(staple_index, zip_indices[1])
        assessment = next(command for command in self.commands if command[0] == 'spctl')
        self.assertIn('ziplens-roundtrip-', assessment[-1])
        self.assertTrue(result['public_distribution_ready'])
        self.assertTrue(result['stapled_ticket_verified'])
        self.assertEqual('accepted', result['gatekeeper_assessment'])
        self.assertEqual('test-submission-id', result['notarization_submission_id'])
        self.assertEqual('ZipLens_2.0.0_arm64.zip', result['archive_name'])
        archive = self.release / result['archive_name']
        with zipfile.ZipFile(archive) as zipped:
            prefix = 'ZipLens Test.app/Contents/Resources/legal/ziplens/'
            self.assertEqual((self.directory / 'LICENSE').read_bytes(), zipped.read(prefix + 'COPYING.txt'))
            self.assertEqual((self.directory / 'legal/ziplens/NOTICE.txt').read_bytes(),
                             zipped.read(prefix + 'NOTICE.txt'))
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        image = self.release / result['dmg_name']
        self.assertEqual(f'{checksum}  {archive.name}\n{result["dmg_sha256"]}  {image.name}\n',
                         (self.release / 'SHA256SUMS.txt').read_text())
        self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(), result['dmg_sha256'])
        self.assertEqual(image.name, result['primary_download_name'])
        self.assertTrue(result['dmg_notarized'])
        self.assertTrue(result['dmg_stapled_ticket_verified'])
        self.assertEqual('test-dmg-submission-id', result['dmg_notarization_submission_id'])
        self.assertEqual('accepted', result['dmg_gatekeeper_assessment'])
        self.assertTrue(any('context:primary-signature' in command for command in self.commands))

    def test_invalid_or_pending_notarization_leaves_previous_release_untouched(self):
        for status in ['Invalid', 'In Progress', None]:
            with self.subTest(status=status):
                self.notary_status = status
                with self.assertRaisesRegex(RuntimeError, 'Notarization was not accepted'):
                    namespace['main'](self.public_arguments())
                self.assert_release_unchanged()
        self.assertFalse(any(command[:3] == ['xcrun', 'stapler', 'staple'] for command in self.commands))

    def test_gatekeeper_rejection_leaves_previous_release_untouched(self):
        self.gatekeeper_error = True
        with self.assertRaisesRegex(RuntimeError, 'Gatekeeper rejected'):
            namespace['main'](self.public_arguments())
        self.assert_release_unchanged()

    def test_preview_is_explicitly_named_and_never_calls_notary_or_gatekeeper(self):
        result = self.package(['--preview'])
        self.assertTrue(result['preview'])
        self.assertFalse(result['public_distribution_ready'])
        self.assertFalse(result['notarized'])
        self.assertFalse(result['stapled_ticket_verified'])
        self.assertEqual('not assessed (local preview)', result['gatekeeper_assessment'])
        self.assertEqual('ZipLens_2.0.0_arm64-preview.zip', result['archive_name'])
        self.assertEqual('ZipLens_2.0.0_arm64-preview.dmg', result['primary_download_name'])
        self.assertFalse(result['dmg_notarized'])
        self.assertFalse(result['dmg_stapled_ticket_verified'])
        self.assertEqual('not assessed (local preview)', result['dmg_gatekeeper_assessment'])
        self.assertTrue(result['dmg_mount_and_install_copy_verified'])
        self.assertTrue(result['dmg_applications_symlink_verified'])
        self.assertTrue((self.release / 'preview' / result['archive_name']).is_file())
        self.assertFalse((self.release / 'packaging-result.json').exists())
        self.assertFalse(any(command[0] in ['security', 'xcrun', 'spctl'] for command in self.commands))
        signing = [command for command in self.commands if command[:2] == ['codesign', '--force']]
        for command in signing:
            self.assertEqual('-', command[command.index('--sign') + 1])
            self.assertIn('--timestamp=none', command)

    def test_preview_preserves_existing_public_app_archive_checksum_and_manifest(self):
        public = self.package(self.public_arguments())
        public_files = namespace['fingerprint'](self.release)
        preview = self.package(['--preview'])
        after = {name: value for name, value in namespace['fingerprint'](self.release).items()
                 if not name.startswith('preview/')}
        self.assertEqual(public_files, after)
        self.assertTrue(public['public_distribution_ready'])
        self.assertFalse(preview['public_distribution_ready'])
        self.assertEqual('test-submission-id',
                         json.loads((self.release / 'packaging-result.json').read_text())[
                             'notarization_submission_id'])
        preview_folder = self.release / 'preview'
        self.assertTrue((preview_folder / 'ZipLens Test.app').is_dir())
        self.assertFalse((preview_folder / 'ZipLens Test.app/Contents/stapled-ticket.txt').exists())
        checksum = hashlib.sha256((preview_folder / preview['archive_name']).read_bytes()).hexdigest()
        self.assertEqual(f"{checksum}  {preview['archive_name']}\n"
                         f"{preview['dmg_sha256']}  {preview['dmg_name']}\n",
                         (preview_folder / 'SHA256SUMS.txt').read_text())

    def assert_images_detached(self):
        for mountpoint in self.dmg_mountpoints:
            self.assertTrue(any(command[:2] == ['hdiutil', 'detach']
                                and command[-1] == str(mountpoint) for command in self.commands))
            self.assertFalse(mountpoint.parent.exists())

    def test_disk_image_rejects_wrong_shortcut_or_changed_instructions_and_detaches(self):
        def change_link(folder):
            (folder / 'Applications').unlink()
            (folder / 'Applications').symlink_to('/tmp')
        def replace_link_with_directory(folder):
            (folder / 'Applications').unlink()
            (folder / 'Applications').mkdir()
        def change_readme(folder):
            (folder / 'README.txt').write_text('Incorrect instructions')
        for mutation in [change_link, replace_link_with_directory, change_readme]:
            with self.subTest(mutation=mutation.__name__):
                self.dmg_mutation = mutation
                with self.assertRaisesRegex(RuntimeError, 'shortcut|instructions'):
                    namespace['main'](['--preview'])
                self.assert_release_unchanged()
                self.assert_images_detached()

    def test_disk_image_rejects_altered_app_bytes_modes_or_symlinks_and_detaches(self):
        def change_bytes(folder):
            (folder / self.source.name / 'Contents/MacOS/ziplens').write_bytes(b'changed')
        def change_mode(folder):
            (folder / self.source.name / 'Contents/MacOS/ziplens').chmod(0o644)
        def change_symlink(folder):
            binary = folder / self.source.name / 'Contents/MacOS/ziplens'
            binary.unlink()
            binary.symlink_to(self.source / 'Contents/MacOS/ziplens')
        for mutation in [change_bytes, change_mode, change_symlink]:
            with self.subTest(mutation=mutation.__name__):
                self.dmg_mutation = mutation
                with self.assertRaisesRegex(RuntimeError, 'contents or POSIX permissions|symlink'):
                    namespace['main'](['--preview'])
                self.assert_release_unchanged()
                self.assert_images_detached()

    def test_disk_image_copy_failure_or_invalid_signature_detaches_and_preserves_release(self):
        original = self.mock_run.side_effect
        for failure in ['copy', 'signature']:
            with self.subTest(failure=failure):
                def fail_install(command):
                    if 'ziplens-dmg-verify-' in command[-1] and '/installed/' in command[-1]:
                        if failure == 'copy' and command[0] == 'ditto':
                            original(command)
                            (Path(command[-1]) / 'Contents/MacOS/ziplens').chmod(0o644)
                            return ''
                        if failure == 'signature' and command[:2] == ['codesign', '--verify']:
                            raise RuntimeError('Copied app signature is invalid')
                    return original(command)
                self.mock_run.side_effect = fail_install
                with self.assertRaisesRegex(RuntimeError, 'POSIX permissions|signature is invalid'):
                    namespace['main'](['--preview'])
                self.assert_release_unchanged()
                self.assert_images_detached()

    def test_invalid_image_checksum_or_writable_format_prevents_mount_and_publication(self):
        original = self.mock_run.side_effect
        for failure in ['checksum', 'format']:
            with self.subTest(failure=failure):
                def reject_image(command):
                    if command[:2] == ['hdiutil', 'verify'] and failure == 'checksum':
                        raise RuntimeError('Disk image checksum failed')
                    if command[:2] == ['hdiutil', 'imageinfo'] and failure == 'format':
                        return 'UDRW'
                    return original(command)
                self.mock_run.side_effect = reject_image
                with self.assertRaisesRegex(RuntimeError, 'checksum failed|read-only compressed'):
                    namespace['main'](['--preview'])
                self.assert_release_unchanged()
                self.assertEqual([], self.dmg_mountpoints)

    def test_malformed_mount_response_still_detaches(self):
        original = self.mock_run.side_effect
        def malformed_response(command):
            result = original(command)
            return 'invalid plist' if command[:2] == ['hdiutil', 'attach'] else result
        self.mock_run.side_effect = malformed_response
        with self.assertRaises(plistlib.InvalidFileException):
            namespace['main'](['--preview'])
        self.assert_release_unchanged()
        self.assert_images_detached()

    def test_canonical_mount_alias_is_accepted(self):
        original = self.mock_run.side_effect
        alias = self.directory / 'mount-alias'
        def report_equivalent_path(command):
            result = original(command)
            if command[:2] == ['hdiutil', 'attach']:
                requested = Path(command[command.index('-mountpoint') + 1])
                alias.symlink_to(requested, target_is_directory=True)
                self.assertNotEqual(str(alias), str(requested))
                self.assertEqual(alias.resolve(), requested.resolve())
                return plistlib.dumps({'system-entities': [{'mount-point': str(alias)}]}).decode()
            return result
        self.mock_run.side_effect = report_equivalent_path
        self.assertTrue(self.package(['--preview'])['dmg_mount_and_install_copy_verified'])
        self.assert_images_detached()

    def test_unrelated_or_multiple_mounts_are_rejected_even_with_a_valid_alias(self):
        original = self.mock_run.side_effect
        other = self.directory / 'unrelated-mount'
        other.mkdir()
        for multiple in [False, True]:
            with self.subTest(multiple=multiple):
                def report_wrong_mount(command):
                    result = original(command)
                    if command[:2] == ['hdiutil', 'attach']:
                        requested = Path(command[command.index('-mountpoint') + 1])
                        entities = [{'mount-point': str(other)}]
                        if multiple:
                            entities.insert(0, {'mount-point': str(requested.resolve())})
                        return plistlib.dumps({'system-entities': entities}).decode()
                    return result
                self.mock_run.side_effect = report_wrong_mount
                with self.assertRaisesRegex(RuntimeError, 'requested verification path'):
                    namespace['main'](['--preview'])
                self.assert_release_unchanged()
                self.assert_images_detached()
                self.assertTrue(other.is_dir())

    def test_busy_mount_retries_detach_before_publishing(self):
        original = self.mock_run.side_effect
        def busy_once(command):
            if command[:2] == ['hdiutil', 'detach'] and '-force' not in command:
                raise RuntimeError('Resource busy')
            return original(command)
        self.mock_run.side_effect = busy_once
        self.package(['--preview'])
        self.assertTrue(any(command[:3] == ['hdiutil', 'detach', '-force'] for command in self.commands))
        self.assert_images_detached()

    def test_failed_detach_retains_mount_directory_and_prevents_publication(self):
        original = self.mock_run.side_effect
        def cannot_detach(command):
            if command[:2] == ['hdiutil', 'detach']:
                raise RuntimeError('Resource busy')
            return original(command)
        self.mock_run.side_effect = cannot_detach
        try:
            with self.assertRaisesRegex(RuntimeError, 'temporary files were retained'):
                namespace['main'](['--preview'])
            self.assert_release_unchanged()
            self.assertTrue(self.dmg_mountpoints[-1].exists())
        finally:
            # These are simulated mounts, so the test can safely remove its tree.
            for mountpoint in self.dmg_mountpoints:
                shutil.rmtree(mountpoint.parent)

    def test_image_notary_or_gatekeeper_rejection_does_not_fall_back_to_preview(self):
        original = self.mock_run.side_effect
        for failure in ['notary', 'assessment']:
            with self.subTest(failure=failure):
                self.dmg_notary_status = 'Invalid' if failure == 'notary' else 'Accepted'
                def reject_assessment(command):
                    if command[0] == 'spctl' and command[-1].endswith('.dmg') and failure == 'assessment':
                        raise RuntimeError('Gatekeeper rejected disk image')
                    return original(command)
                self.mock_run.side_effect = reject_assessment
                with self.assertRaisesRegex(RuntimeError, 'Disk image notarization|rejected disk image'):
                    namespace['main'](self.public_arguments())
                self.assert_release_unchanged()
                self.assertFalse((self.release / 'preview').exists())

    def test_late_disk_image_publication_failure_rolls_back_every_output(self):
        real_rename = os.rename
        def fail_image_publish(source, destination):
            destination = Path(destination)
            if destination.parent == self.release and destination.suffix == '.dmg':
                raise OSError('Simulated image publication failure')
            return real_rename(source, destination)
        with patch.object(os, 'rename', side_effect=fail_image_publish):
            with self.assertRaisesRegex(OSError, 'publication failure'):
                namespace['main'](self.public_arguments())
        self.assert_release_unchanged()

    def test_roundtrip_rejects_changed_bytes_or_lost_executable_permissions(self):
        archive = self.directory / 'broken.zip'
        for change in ['bytes', 'mode']:
            with self.subTest(change=change):
                with zipfile.ZipFile(archive, 'w') as zipped:
                    for path in self.source.rglob('*'):
                        if path.is_file():
                            name = self.source.name + '/' + path.relative_to(self.source).as_posix()
                            member = zipfile.ZipInfo.from_file(path, name)
                            payload = path.read_bytes()
                            if path.name == 'ziplens':
                                if change == 'bytes':
                                    payload += b'changed'
                                else:
                                    member.external_attr = (0o100644 << 16)
                            zipped.writestr(member, payload)
                with self.assertRaisesRegex(RuntimeError, 'contents or POSIX permissions'):
                    namespace['verify_archive'](self.source, archive, True)

    def test_ditto_zip_preserves_bundle_extended_attributes(self):
        attribute = 'com.ziplens.packaging-test'
        relative = Path('Contents/Info.plist')
        real_run(['xattr', '-w', attribute, 'notarization-metadata-test', str(self.source / relative)])
        archive = self.directory / 'metadata.zip'
        namespace['create_zip'](self.source, archive)
        extracted = self.directory / 'metadata-extracted'
        real_run(['ditto', '-x', '-k', str(archive), str(extracted)])
        self.assertEqual('notarization-metadata-test',
                         real_run(['xattr', '-p', attribute, str(extracted / self.source.name / relative)]))

    def test_missing_extracted_staple_prevents_publication(self):
        original = self.mock_run.side_effect

        def remove_extracted_ticket(command):
            if command[:3] == ['xcrun', 'stapler', 'validate'] and 'ziplens-roundtrip-' in command[-1]:
                (Path(command[-1]) / 'Contents/stapled-ticket.txt').unlink()
            return original(command)

        self.mock_run.side_effect = remove_extracted_ticket
        with self.assertRaisesRegex(RuntimeError, 'Missing test notarization ticket'):
            namespace['main'](self.public_arguments())
        self.assert_release_unchanged()

    def test_signature_failure_after_extraction_prevents_publication(self):
        original = self.mock_run.side_effect

        def reject_extracted_signature(command):
            if command[:2] == ['codesign', '--verify'] and 'ziplens-roundtrip-' in command[-1]:
                raise RuntimeError('Extracted signature is invalid')
            return original(command)

        self.mock_run.side_effect = reject_extracted_signature
        with self.assertRaisesRegex(RuntimeError, 'Extracted signature is invalid'):
            namespace['main'](['--preview'])
        self.assert_release_unchanged()


class LegacyPackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        host = subprocess.check_output(['rustc', '-vV'], text=True)
        target = next(line.removeprefix('host: ') for line in host.splitlines() if line.startswith('host: '))
        cls.architecture = {'aarch64-apple-darwin': 'arm64', 'x86_64-apple-darwin': 'x86_64'}[target]
        cls.prepared = ROOT / 'src-tauri/binaries' / f'ziplens-legacy-{target}'
        if not cls.prepared.is_file():
            raise RuntimeError('Run scripts/prepare-distribution.py before these tests')

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ziplens-package-test-')
        self.directory = Path(self.temporary.name)
        self.bundled = self.directory / 'ziplens-legacy'
        shutil.copyfile(self.prepared, self.bundled)
        self.bundled.chmod(0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def thin_7zip(self, architecture):
        path = self.directory / f'wrong-helper-{architecture}'
        subprocess.run(['lipo', str(ROOT / 'src-tauri/binaries/7zz'),
                        '-thin', architecture, '-output', str(path)], check=True,
                       capture_output=True)
        path.chmod(0o755)
        return path

    def test_identical_prepared_helper_is_accepted(self):
        verify(self.bundled, self.prepared, self.architecture)

    def test_signing_only_variation_is_accepted_without_mutating_inputs(self):
        subprocess.run(['codesign', '--force', '--sign', '-', '--timestamp=none',
                        '--identifier', 'com.ziplens.test-other-signature', str(self.bundled)],
                       check=True, capture_output=True)
        before = (self.bundled.read_bytes(), self.prepared.read_bytes())
        self.assertNotEqual(*before)
        verify(self.bundled, self.prepared, self.architecture)
        self.assertEqual(before, (self.bundled.read_bytes(), self.prepared.read_bytes()))

    def test_different_executable_with_matching_architecture_is_rejected(self):
        wrong = self.thin_7zip(self.architecture)
        with self.assertRaisesRegex(RuntimeError, 'differs from the prepared target helper'):
            verify(wrong, self.prepared, self.architecture)

    def test_wrong_bundled_architecture_is_rejected(self):
        other = 'x86_64' if self.architecture == 'arm64' else 'arm64'
        with self.assertRaisesRegex(RuntimeError, 'Bundled legacy helper architecture'):
            verify(self.thin_7zip(other), self.prepared, self.architecture)

    def test_wrong_prepared_architecture_is_rejected(self):
        other = 'x86_64' if self.architecture == 'arm64' else 'arm64'
        with self.assertRaisesRegex(RuntimeError, 'Prepared target legacy helper architecture'):
            verify(self.bundled, self.thin_7zip(other), self.architecture)

    def test_non_executable_helper_is_rejected(self):
        self.bundled.chmod(0o644)
        self.assertFalse(os.access(self.bundled, os.X_OK))
        with self.assertRaisesRegex(RuntimeError, 'missing or not executable'):
            verify(self.bundled, self.prepared, self.architecture)


if __name__ == '__main__':
    unittest.main()

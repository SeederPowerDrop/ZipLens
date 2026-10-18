#!/usr/bin/env python3
"""Exercise an already-built ZipLens executable without launching its GUI.

Run: python3 scripts/test-cli.py --binary /path/to/ZipLens.app/Contents/MacOS/ziplens
Only the Python standard library is required. All fixtures and extraction results
live in temporary directories. Sidecar cases are skipped if the executable cannot
use 7zz; --seven-zip can supply the fixture tool for a development build. Every
process has a deadline, including fixture tools.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
import zipfile


PROJECT = Path(__file__).resolve().parents[1]


def run_process(arguments, timeout, *, cwd, stdin=''):
    """Close stdin and kill the whole process group if a CLI or helper hangs."""
    process = subprocess.Popen(
        [os.fspath(argument) for argument in arguments], cwd=cwd,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8', start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(stdin, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=5)
        raise AssertionError(
            f'Process exceeded {timeout}s deadline: {arguments[0]}\n'
            f'stdout: {stdout[:2000]}\nstderr: {stderr[:2000]}'
        ) from None
    return subprocess.CompletedProcess(arguments, process.returncode, stdout, stderr)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files_under(directory):
    return {path.relative_to(directory).as_posix(): path.read_bytes()
            for path in directory.rglob('*') if path.is_file()}


class CommandLineTests(unittest.TestCase):
    binary = None
    seven_zip = None
    timeout = 30

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ziplens-cli-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()

    def archive(self, name='input.zip', entries=None):
        archive = self.root / name
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
            for entry, contents in (entries or {'hello.txt': b'hello\n'}).items():
                output.writestr(entry, contents)
        return archive

    def invoke(self, *arguments, status=0, error=None, stdin=''):
        process = run_process([self.binary, 'cli', *arguments], self.timeout,
                              cwd=self.root, stdin=stdin)
        try:
            response = json.loads(process.stdout)
        except (ValueError, TypeError) as failure:
            self.fail(f'Expected one JSON document on stdout: {failure}\n'
                      f'status: {process.returncode}\nstdout: {process.stdout[:3000]}\n'
                      f'stderr: {process.stderr[:3000]}')
        self.assertIsInstance(response, dict)
        self.assertEqual(response.get('schema_version'), 1)
        self.assertEqual(process.returncode, status,
                         f'{response}\nstderr: {process.stderr[:2000]}')
        self.assertIs(response.get('ok'), status == 0, response)
        if status == 0:
            self.assertIsInstance(response.get('result'), dict, response)
            self.assertNotIn('error', response)
        else:
            self.assertIsInstance(response.get('error'), dict, response)
            self.assertIsInstance(response['error'].get('code'), str, response)
            self.assertIsInstance(response['error'].get('message'), str, response)
            self.assertTrue(response['error']['message'], response)
            if error:
                self.assertEqual(response['error']['code'], error, response)
        return response

    def sidecar(self):
        if not self.invoke('capabilities')['result']['backends']['seven_zip_available']:
            self.skipTest('The tested binary cannot access its 7zz helper')
        executable = self.seven_zip or self.binary.parent / '7zz'
        if not executable.is_file() or not os.access(executable, os.X_OK):
            self.skipTest('No fixture 7zz found; supply --seven-zip for a development build')
        return executable

    def test_capabilities_are_machine_readable(self):
        result = self.invoke('capabilities')['result']
        self.assertEqual(result['name'], 'ZipLens')
        self.assertIsInstance(result['version'], str)
        self.assertTrue(result['version'])
        self.assertEqual(set(result['commands']), {'capabilities', 'list', 'extract', 'compress'})
        self.assertIs(result['headless'], True)
        self.assertIs(result['interactive_prompts'], False)

    def test_help_version_and_unknown_startup_flag_do_not_wait_for_gui(self):
        version = self.invoke('capabilities')['result']['version']
        for arguments in [('cli', '--help'), ('--help',), ('cli', 'extract', '--help')]:
            with self.subTest(arguments=arguments):
                result = run_process([self.binary, *arguments], self.timeout, cwd=self.root)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('ziplens cli extract', result.stdout)
                self.assertIn('--password-stdin', result.stdout)
        for arguments in [('cli', '--version'), ('--version',)]:
            with self.subTest(arguments=arguments):
                result = run_process([self.binary, *arguments], self.timeout, cwd=self.root)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), f'ZipLens {version}')
        result = run_process([self.binary, '--unknown-startup-option'], self.timeout,
                             cwd=self.root)
        self.assertEqual(result.returncode, 2, result.stderr)
        response = json.loads(result.stdout)
        self.assertEqual(response['schema_version'], 1)
        self.assertIs(response['ok'], False)
        self.assertEqual(response['error']['code'], 'INVALID_ARGUMENTS')

    def test_non_utf8_startup_paths_fail_without_panicking_or_opening_gui(self):
        for arguments in [(b'\xff.zip',), ('--extract', b'\xff.zip'),
                          ('--compress', b'\xff.txt'), ('cli', 'list', b'\xff.zip')]:
            with self.subTest(arguments=arguments):
                process = run_process([self.binary, *arguments], self.timeout, cwd=self.root)
                self.assertEqual(process.returncode, 2, process.stderr)
                response = json.loads(process.stdout)
                self.assertEqual(response['schema_version'], 1)
                self.assertIs(response['ok'], False)
                self.assertEqual(response['error']['code'], 'INVALID_ARGUMENTS')
                self.assertIn('UTF-8', response['error']['message'])
                self.assertNotIn('panicked', process.stderr)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_native_compression_timeout_preserves_existing_output_and_removes_staging(self):
        source = self.root / 'sparse-source.bin'
        # Sparse allocation keeps this fixture small on disk. Its logical size keeps
        # compression busy beyond the one-second deadline even on a fast machine.
        logical_size = 64 * 1024**3
        with source.open('wb') as output:
            output.truncate(logical_size)
        destination = self.archive('existing.zip', {'keep.txt': b'existing archive contents'})
        original_digest = digest(destination)
        self.invoke('compress', source, '--destination', destination, '--format', 'zip',
                    '--overwrite', '--timeout-seconds', '1', status=124, error='TIMEOUT')
        self.assertEqual(digest(destination), original_digest)
        self.assertEqual(source.stat().st_size, logical_size)
        self.assertEqual(set(self.root.iterdir()), {source, destination},
                         'Cancellation must remove both CLI and engine staging directories')

    def test_list_and_exact_targets_preserve_unicode_spaces_and_option_like_names(self):
        entries = {'별도 폴더/보고서 2026.txt': '안녕하세요\n'.encode(),
                   'data [1].txt': b'brackets\n', '--overwrite': b'literal option\n',
                   '*.txt': b'literal wildcard\n', 'unselected.txt': b'leave behind\n'}
        archive = self.archive('자료 모음.zip', entries)
        before = digest(archive)
        result = self.invoke('list', archive)['result']
        self.assertEqual(Path(result['archive']), archive)
        listed = {entry['path']: entry for entry in result['entries']}
        self.assertEqual(set(listed), set(entries))
        for name, payload in entries.items():
            self.assertEqual(listed[name]['size'], len(payload))
            self.assertIs(listed[name]['is_dir'], False)
            self.assertIs(listed[name]['is_encrypted'], False)
        destination = self.root / 'selected output'
        selected = {name: entries[name] for name in
                    ['별도 폴더/보고서 2026.txt', '--overwrite', '*.txt']}
        result = self.invoke('extract', archive, '--destination', destination,
                             *[f'--target={name}' for name in selected])['result']
        self.assertEqual(files_under(destination), selected)
        self.assertEqual(set(result['success_files']), set(selected))
        self.assertEqual(set(map(Path, result['output_paths'])),
                         {destination / name for name in selected})
        self.assertEqual(result['failed_files'], [])
        self.assertIs(result['cancelled'], False)
        self.assertEqual(digest(archive), before)

    def test_extraction_keeps_existing_files_then_allows_explicit_overwrite(self):
        archive = self.archive(entries={'hello.txt': b'new content', 'folder/item.txt': b'new item'})
        destination = self.root / 'output'
        (destination / 'folder').mkdir(parents=True)
        (destination / 'hello.txt').write_bytes(b'existing content')
        (destination / 'folder/item.txt').write_bytes(b'existing item')
        (destination / 'folder/untouched.txt').write_bytes(b'keep this')
        result = self.invoke('extract', archive, '--destination', destination)['result']
        self.assertEqual((destination / 'hello.txt').read_bytes(), b'existing content')
        self.assertEqual((destination / 'folder/item.txt').read_bytes(), b'existing item')
        self.assertEqual({Path(path).read_bytes() for path in result['output_paths']},
                         {b'new content', b'new item'})
        self.assertTrue(all(Path(path).is_relative_to(destination)
                            for path in result['output_paths']))
        self.invoke('extract', archive, '--destination', destination, '--overwrite')
        self.assertEqual((destination / 'hello.txt').read_bytes(), b'new content')
        self.assertEqual((destination / 'folder/item.txt').read_bytes(), b'new item')
        self.assertEqual((destination / 'folder/untouched.txt').read_bytes(), b'keep this')

    def test_native_compression_formats_roundtrip(self):
        source = self.root / 'source 폴더'
        source.mkdir()
        (source / 'file with spaces.txt').write_bytes(b'ZipLens round trip\n' * 32)
        (source / '--option.txt').write_bytes(b'option-like filename')
        before = files_under(source)
        for format_name in ['zip', 'tar', 'tar.gz', 'tar.zst']:
            with self.subTest(format=format_name):
                archive = self.root / ('roundtrip.' + format_name)
                compressed = self.invoke('compress', source, '--destination', archive,
                                         '--format', format_name, '--level', '6')['result']
                self.assertEqual(compressed['format'], format_name)
                self.assertEqual(compressed['output_paths'], [str(archive)])
                self.assertGreater(archive.stat().st_size, 0)
                listed = self.invoke('list', archive)['result']['entries']
                self.assertEqual({entry['path'] for entry in listed if not entry['is_dir']},
                                 {f'{source.name}/{name}' for name in before})
                destination = self.root / ('roundtrip-output-' + format_name)
                self.invoke('extract', archive, '--destination', destination)
                self.assertEqual(files_under(destination / source.name), before)
        self.assertEqual(files_under(source), before)

    def test_compression_keeps_existing_archive_then_allows_explicit_overwrite(self):
        source = self.root / 'source.txt'
        source.write_bytes(b'replacement data')
        destination = self.root / 'result.zip'
        original = self.archive('result.zip', {'old.txt': b'previous archive'})
        before = digest(original)
        result = self.invoke('compress', source, '--destination', destination,
                             '--format', 'zip')['result']
        self.assertEqual(result['destination'], str(destination))
        self.assertEqual(digest(original), before)
        self.assertEqual(len(result['output_paths']), 1)
        actual = Path(result['output_paths'][0])
        self.assertNotEqual(actual, destination)
        self.assertEqual(actual.parent, destination.parent)
        with zipfile.ZipFile(actual) as zipped:
            self.assertEqual(zipped.read(source.name), source.read_bytes())
        result = self.invoke('compress', source, '--destination', destination,
                             '--format', 'zip', '--overwrite')['result']
        self.assertEqual(result['output_paths'], [str(destination)])
        with zipfile.ZipFile(destination) as zipped:
            self.assertEqual(zipped.namelist(), [source.name])
            self.assertEqual(zipped.read(source.name), source.read_bytes())

    def test_keep_both_preserves_compound_tar_suffix_and_roundtrip(self):
        source = self.root / 'source.txt'
        for format_name in ['tar.gz', 'tar.zst']:
            with self.subTest(format=format_name):
                destination = self.root / ('archive.' + format_name)
                source.write_bytes(b'original archive contents')
                self.invoke('compress', source, '--destination', destination,
                            '--format', format_name)
                original_digest = digest(destination)
                payload = f'new archive contents for {format_name}\n'.encode()
                source.write_bytes(payload)
                result = self.invoke('compress', source, '--destination', destination,
                                     '--format', format_name)['result']
                self.assertEqual(result['destination'], str(destination))
                self.assertEqual(len(result['output_paths']), 1)
                actual = Path(result['output_paths'][0])
                self.assertNotEqual(actual, destination)
                self.assertEqual(actual.parent, destination.parent)
                self.assertTrue(actual.name.endswith('.' + format_name), actual.name)
                self.assertEqual(digest(destination), original_digest)
                entries = self.invoke('list', actual)['result']['entries']
                self.assertEqual([entry['path'] for entry in entries], [source.name])
                self.assertEqual(entries[0]['size'], len(payload))
                output = self.root / ('collision-output-' + format_name)
                self.invoke('extract', actual, '--destination', output)
                self.assertEqual(files_under(output), {source.name: payload})
                self.assertEqual(source.read_bytes(), payload)

    def test_option_terminator_accepts_option_like_source(self):
        source = self.root / '--source.txt'
        source.write_bytes(b'literal command-line source')
        destination = self.root / 'options.zip'
        self.invoke('compress', '--destination', destination, '--format', 'zip', '--', source.name)
        with zipfile.ZipFile(destination) as zipped:
            self.assertEqual(zipped.read(source.name), source.read_bytes())

    def test_traversal_is_rejected_before_publication(self):
        sentinel = self.root / 'sentinel.txt'
        sentinel.write_bytes(b'original sentinel')
        for index, hostile in enumerate(['../sentinel.txt', str(sentinel), '..\\sentinel.txt']):
            with self.subTest(entry=hostile):
                archive = self.archive(f'hostile-{index}.zip',
                                       {'safe.txt': b'safe', hostile: b'bad overwrite'})
                before = digest(archive)
                destination = self.root / f'blocked-{index}'
                self.invoke('list', archive, status=1)
                self.invoke('extract', archive, '--destination', destination, '--overwrite', status=1)
                self.assertEqual(sentinel.read_bytes(), b'original sentinel')
                self.assertEqual(files_under(destination), {})
                self.assertEqual(digest(archive), before)

    def test_overwrite_never_replaces_the_input_archive(self):
        archive = self.archive('source.zip', {'source.zip': b'not an archive', 'safe.txt': b'valid'})
        before = digest(archive)
        response = self.invoke('extract', archive, '--destination', self.root,
                               '--overwrite', status=4, error='PARTIAL_FAILURE')
        self.assertEqual(digest(archive), before)
        self.assertTrue(response['result']['failed_files'])
        self.assertEqual((self.root / 'safe.txt').read_bytes(), b'valid')

    def test_partial_publication_reports_success_and_blocked_symlink_separately(self):
        archive = self.archive(entries={'blocked.txt': b'archive replacement', 'safe.txt': b'valid'})
        destination = self.root / 'partial-output'
        destination.mkdir()
        external = self.root / 'external.txt'
        external.write_bytes(b'existing external data')
        blocked = destination / 'blocked.txt'
        blocked.symlink_to(external)
        response = self.invoke('extract', archive, '--destination', destination,
                               '--overwrite', status=4, error='PARTIAL_FAILURE')
        result = response['result']
        self.assertEqual(result['success_files'], ['safe.txt'])
        self.assertEqual(result['output_paths'], [str(destination / 'safe.txt')])
        self.assertEqual([failure[0] for failure in result['failed_files']], ['blocked.txt'])
        self.assertTrue(result['failed_files'][0][1])
        self.assertIs(result['cancelled'], False)
        self.assertEqual((destination / 'safe.txt').read_bytes(), b'valid')
        self.assertTrue(blocked.is_symlink())
        self.assertEqual(external.read_bytes(), b'existing external data')

    def test_compression_never_overwrites_a_source_or_writes_inside_source(self):
        source = self.root / 'source.zip'
        source.write_bytes(b'irreplaceable source')
        self.invoke('compress', source, '--destination', source, '--format', 'zip',
                    '--overwrite', status=1)
        self.assertEqual(source.read_bytes(), b'irreplaceable source')
        folder = self.root / 'source-folder'
        folder.mkdir()
        (folder / 'original.txt').write_bytes(b'original')
        before = files_under(folder)
        self.invoke('compress', folder, '--destination', folder / 'inside.zip',
                    '--format', 'zip', status=1)
        self.assertEqual(files_under(folder), before)
        nested = folder / 'new-output-folder' / 'deeper' / 'inside.zip'
        self.invoke('compress', folder, '--destination', nested, '--format', 'zip', status=1)
        self.assertEqual(files_under(folder), before)
        self.assertFalse((folder / 'new-output-folder').exists(),
                         'A rejected output must not create directories inside the source')

    def test_normalized_output_outside_source_does_not_create_source_directories(self):
        source = self.root / 'source-folder'
        source.mkdir()
        (source / 'original.txt').write_bytes(b'original source contents')
        before = files_under(source)
        requested = source / 'new-directory' / '..' / '..' / 'outside.zip'
        result = self.invoke('compress', source, '--destination', requested,
                             '--format', 'zip')['result']
        actual = self.root / 'outside.zip'
        self.assertEqual(result['destination'], str(actual))
        self.assertEqual(result['output_paths'], [str(actual)])
        self.assertFalse((source / 'new-directory').exists())
        self.assertEqual(files_under(source), before)
        entries = self.invoke('list', actual)['result']['entries']
        self.assertEqual({entry['path'] for entry in entries if not entry['is_dir']},
                         {f'{source.name}/{name}' for name in before})
        output = self.root / 'normalized-output'
        self.invoke('extract', actual, '--destination', output)
        self.assertEqual(files_under(output / source.name), before)

    def test_mismatched_compression_suffix_fails_without_creating_output_parent(self):
        source = self.root / 'source.txt'
        source.write_bytes(b'preserved source contents')
        mismatches = [('zip', 'result.tar.gz'), ('7z', 'result.zip'), ('tar', 'result.7z'),
                      ('tar.gz', 'result.tar'), ('tar.zst', 'result.gz')]
        for index, (format_name, filename) in enumerate(mismatches):
            with self.subTest(format=format_name, filename=filename):
                parent = self.root / f'uncreated-{index}'
                self.invoke('compress', source, '--destination', parent / filename,
                            '--format', format_name, status=2, error='INVALID_ARGUMENTS')
                self.assertFalse(parent.exists())
        self.assertEqual(source.read_bytes(), b'preserved source contents')

    def test_invalid_arguments_and_missing_inputs_are_json_errors(self):
        archive = self.archive()
        cases = [(), ('unknown-command',), ('list',), ('extract', archive),
                 ('extract', archive, '--destination'),
                 ('list', archive, '--unknown-option'),
                 ('compress', archive, '--destination', self.root / 'bad.zip', '--format', 'rar'),
                 ('compress', archive, '--destination', self.root / 'bad.zip',
                  '--format', 'zip', '--level', '10'),
                 ('compress', archive, '--destination', self.root / 'bad.zip',
                  '--format', 'zip', '--level', 'not-a-number')]
        for arguments in cases:
            with self.subTest(arguments=arguments):
                self.invoke(*arguments, status=2, error='INVALID_ARGUMENTS')
        self.invoke('list', self.root / 'missing.zip', status=1, error='MISSING_INPUT')
        self.invoke('extract', archive, '--destination', self.root / 'unused',
                    '--target', 'not-an-entry.txt', status=1)
        self.assertFalse((self.root / 'unused').exists())

    def test_encrypted_archives_fail_promptly_and_accept_password_stdin(self):
        sidecar = self.sidecar()
        source = self.root / 'secret file.txt'
        source.write_bytes(b'encrypted fixture contents')
        password = 'test-only-password-42'
        for format_name in ['zip', '7z']:
            with self.subTest(format=format_name):
                archive = self.root / ('encrypted.' + format_name)
                options = ['-mem=AES256'] if format_name == 'zip' else ['-mhe=on']
                fixture = run_process([sidecar, 'a', f'-t{format_name}', f'-p{password}',
                                       *options, '-y', '--', archive, source],
                                      self.timeout, cwd=self.root)
                self.assertEqual(fixture.returncode, 0, fixture.stderr)
                before = digest(archive)
                if format_name == '7z':
                    self.invoke('list', archive, status=3, error='PASSWORD_REQUIRED')
                    self.invoke('list', archive, '--password-stdin', stdin='wrong\n', status=3)
                listed = self.invoke('list', archive, '--password-stdin',
                                     stdin=password + '\n')['result']['entries']
                self.assertEqual([entry['path'] for entry in listed], [source.name])
                self.assertTrue(listed[0]['is_encrypted'])
                destination = self.root / ('decrypted-' + format_name)
                self.invoke('extract', archive, '--destination', destination,
                            status=3, error='PASSWORD_REQUIRED')
                self.invoke('extract', archive, '--destination', destination,
                            '--password-stdin', stdin='wrong\n', status=3)
                self.assertEqual(files_under(destination), {})
                self.invoke('extract', archive, '--destination', destination,
                            '--password-stdin', stdin=password + '\n')
                self.assertEqual(files_under(destination), {source.name: source.read_bytes()})
                self.assertEqual(digest(archive), before)

    def test_encrypted_compression_and_7z_roundtrip(self):
        self.sidecar()
        source = self.root / 'private.txt'
        source.write_bytes(b'private round-trip fixture')
        for format_name in ['zip', '7z']:
            with self.subTest(format=format_name):
                archive = self.root / ('created.' + format_name)
                self.invoke('compress', source, '--destination', archive, '--format', format_name,
                            '--password-stdin', stdin='another-test-password\n')
                destination = self.root / ('verified-' + format_name)
                self.invoke('extract', archive, '--destination', destination, '--password-stdin',
                            stdin='another-test-password\n')
                self.assertEqual(files_under(destination), {source.name: source.read_bytes()})

    def test_encrypted_alz_and_egg_preserve_korean_names_and_passwords(self):
        backends = self.invoke('capabilities')['result']['backends']
        if not backends['legacy_alz_egg_available']:
            self.skipTest('The tested binary cannot access its ALZ/EGG helper')
        fixtures = PROJECT / 'astra-core/tests/fixtures/legacy'
        expected = {'폴더/한글.txt': 'ZipLens 한글 압축 테스트\n'.encode(), 'other.txt': b'other'}
        for format_name in ['alz', 'egg']:
            with self.subTest(format=format_name):
                archive = self.root / ('encrypted.' + format_name)
                archive.write_bytes((fixtures / archive.name).read_bytes())
                before = digest(archive)
                entries = [entry for entry in self.invoke('list', archive)['result']['entries']
                           if not entry['is_dir']]
                self.assertEqual({entry['path'] for entry in entries}, set(expected))
                self.assertTrue(all(entry['is_encrypted'] for entry in entries))
                destination = self.root / ('legacy-output-' + format_name)
                self.invoke('extract', archive, '--destination', destination,
                            status=3, error='PASSWORD_REQUIRED')
                self.invoke('extract', archive, '--destination', destination,
                            '--password-stdin', stdin='wrong\n', status=3, error='PASSWORD_REQUIRED')
                self.assertEqual(files_under(destination), {})
                self.invoke('extract', archive, '--destination', destination,
                            '--password-stdin', stdin='암호\n')
                self.assertEqual(files_under(destination), expected)
                self.assertEqual(digest(archive), before)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path,
                        help='Built ziplens executable (not the .app directory)')
    parser.add_argument('--seven-zip', type=Path,
                        help='Optional 7zz fixture tool, for a development binary without a sibling 7zz')
    parser.add_argument('--timeout', type=float, default=30,
                        help='Per-process deadline in seconds (default: 30)')
    options, test_arguments = parser.parse_known_args()
    if not options.binary.is_file() or not os.access(options.binary, os.X_OK):
        parser.error('--binary must name an executable file')
    if options.timeout <= 0:
        parser.error('--timeout must be greater than zero')
    if options.seven_zip and (not options.seven_zip.is_file()
                              or not os.access(options.seven_zip, os.X_OK)):
        parser.error('--seven-zip must name an executable file')
    CommandLineTests.binary = options.binary.resolve()
    CommandLineTests.seven_zip = options.seven_zip.resolve() if options.seven_zip else None
    CommandLineTests.timeout = options.timeout
    unittest.main(argv=[str(Path(__file__)), *test_arguments], verbosity=2)


if __name__ == '__main__':
    main()

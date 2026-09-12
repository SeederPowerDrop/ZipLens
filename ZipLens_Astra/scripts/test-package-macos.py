#!/usr/bin/env python3
"""macOS packaging gate regressions; run after preparing the release sidecars."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
script = ROOT / 'scripts/package-macos.py'
namespace = {'__file__': str(script), '__name__': 'package_macos_tests'}
exec(compile(script.read_text(), str(script), 'exec'), namespace)
verify = namespace['verify_legacy_helper']


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

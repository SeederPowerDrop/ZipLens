#!/usr/bin/env python3
"""Check filename and content round trips through an already-built ZipLens CLI.

Uses only Python's standard library, synthetic files, bounded subprocesses, and
temporary directories. UTF-8, Unicode Path metadata, and the documented Korean
legacy fallback are assertions. Untagged other legacy encodings are observations:
their source encoding cannot be inferred reliably from filename bytes alone.

Run: python3 scripts/test-unicode-archives.py --binary /path/to/ziplens --benchmark
The optional benchmark compares equal file counts and payloads, not compression
ratios or whole-app UI performance. Its elapsed times include process startup.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import statistics
import struct
import subprocess
import tempfile
import time
import zlib


LANGUAGE_NAMES = {
    'ko': '한국어/사용 설명서.txt',
    'en': 'English/User guide.txt',
    'ja': '日本語/使い方.txt',
    'zh': '中文/使用说明.txt',
    'vi': 'Tiếng Việt/Hướng dẫn sử dụng.txt',
    'es': 'Español/Guía de uso.txt',
    'fr': 'Français/Mode d’emploi.txt',
    'de': 'Deutsch/Größe und Übersicht.txt',
    'ru': 'Русский/Руководство.txt',
    'ar': 'العربية/دليل الاستخدام.txt',
}
PASSWORD = '테스트-日本語-العربية-🔒'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_hashes(root):
    return {path.relative_to(root).as_posix(): digest(path)
            for path in root.rglob('*') if path.is_file()}


def invoke(binary, root, *arguments, password=None, allow_error=False):
    command = [str(binary), 'cli', *map(str, arguments)]
    if password is not None:
        command.append('--password-stdin')
    started = time.perf_counter()
    process = subprocess.Popen(command, cwd=root, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding='utf-8', start_new_session=True)
    try:
        stdout, stderr = process.communicate('' if password is None else password + '\n',
                                             timeout=60)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate(timeout=5)
        raise AssertionError(f'CLI exceeded 60-second deadline: {arguments[0]}') from None
    elapsed = time.perf_counter() - started
    response = json.loads(stdout)
    assert response.get('schema_version') == 1, response
    if not allow_error:
        assert process.returncode == 0 and response.get('ok') is True, (response, stderr)
    return response, elapsed


def stored_zip(path, raw_name, payload, unicode_name=None):
    """Write one stored member without assuming Python's filename encoding policy."""
    extra = b''
    if unicode_name is not None:
        field = b'\x01' + struct.pack('<I', zlib.crc32(raw_name)) + unicode_name.encode('utf-8')
        extra = struct.pack('<HH', 0x7075, len(field)) + field
    crc, size = zlib.crc32(payload), len(payload)
    local = struct.pack('<IHHHHHIIIHH', 0x04034B50, 20, 0, 0, 0, 0, crc, size, size,
                        len(raw_name), len(extra)) + raw_name + extra + payload
    central = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014B50, 20, 20, 0, 0, 0, 0,
                          crc, size, size, len(raw_name), len(extra), 0, 0, 0, 0, 0)
    central += raw_name + extra
    end = struct.pack('<IHHHHIIH', 0x06054B50, 0, 0, 1, 1, len(central), len(local), 0)
    path.write_bytes(local + central + end)


def roundtrips(binary, root):
    source = root / '자료-日本語-العربية'
    names = list(LANGUAGE_NAMES.values()) + ['emoji/가족 👨‍👩‍👧‍👦 📦.txt',
                                            'NFC/café.txt', 'NFD/cafe\u0301.txt']
    for index, name in enumerate(names):
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((f'{index}: {name}\n'.encode('utf-8') + bytes(range(256))) * 4)
    (source / '空のフォルダー-빈 폴더-فارغ').mkdir()
    before = file_hashes(source)
    expected = {f'{source.name}/{name}': value for name, value in before.items()}
    cases = []
    for format_name, encrypted in [(item, False) for item in ['zip', '7z', 'tar', 'tar.gz', 'tar.zst']] + [('zip', True), ('7z', True)]:
        label = format_name + ('-encrypted' if encrypted else '')
        archive = root / f'압축-日本語-العربية-{label}.{format_name}'
        password = (PASSWORD if format_name == '7z' else 'test-only-ASCII-password-42') if encrypted else None
        _, compress_seconds = invoke(binary, root, 'compress', source, '--destination', archive,
                                     '--format', format_name, password=password)
        archive_hash = digest(archive)
        listing, list_seconds = invoke(binary, root, 'list', archive, password=password)
        entries = listing['result']['entries']
        assert {entry['path'] for entry in entries if not entry['is_dir']} == set(expected), label
        destination = root / f'전체-الخروج-{label}'
        result, extract_seconds = invoke(binary, root, 'extract', archive, '--destination', destination,
                                        password=password)
        assert file_hashes(destination) == expected, label
        assert not result['result']['failed_files'] and not result['result']['cancelled'], result
        assert (destination / source.name / '空のフォルダー-빈 폴더-فارغ').is_dir(), label
        # Select each member explicitly, including decomposed names and RTL text.
        selected_destination = root / f'선택-{label}'
        invoke(binary, root, 'extract', archive, '--destination', selected_destination,
               *[f'--target={name}' for name in expected], password=password)
        assert file_hashes(selected_destination) == expected, label
        assert digest(archive) == archive_hash and file_hashes(source) == before, label
        cases.append({'case': label, 'passed': True, 'files': len(expected),
                      'names_exact': True, 'contents_sha256_match': True,
                      'compress_seconds': compress_seconds, 'list_seconds': list_seconds,
                      'extract_seconds': extract_seconds})
    return cases


def legacy_names(binary, root):
    cases, observations = [], []
    fixtures = [('cp949', '한글/설명서.txt'), ('cp932', '日本語/説明書.txt'),
                ('gbk', '中文/说明书.txt'), ('cp437', 'Français/café.txt')]
    for encoding, name in fixtures:
        for tagged in [False, True]:
            label = encoding + ('-unicode-path' if tagged else '-untagged')
            archive = root / (label + '.zip')
            payload = f'Synthetic {label} fixture\n'.encode()
            stored_zip(archive, name.encode(encoding), payload, name if tagged else None)
            response, _ = invoke(binary, root, 'list', archive, allow_error=True)
            listed = [entry['path'] for entry in response.get('result', {}).get('entries', [])]
            required = tagged or encoding == 'cp949'
            if required:
                assert response['ok'] and listed == [name], (label, response)
                destination = root / ('legacy-' + label)
                invoke(binary, root, 'extract', archive, '--destination', destination,
                       f'--target={name}')
                assert file_hashes(destination) == {name: hashlib.sha256(payload).hexdigest()}, label
                cases.append({'case': label, 'passed': True, 'names_exact': True,
                              'contents_sha256_match': True})
            else:
                observations.append({'case': label, 'expected_name': name, 'listed_names': listed,
                                     'name_preserved': listed == [name],
                                     'error': response.get('error'),
                                     'scope': 'Unsupported ambiguous legacy encoding; not a pass claim'})
    # Some producers omit the ZIP UTF-8 flag even though the bytes are UTF-8.
    name = '日本語/한국어-العربية-📦.txt'
    archive = root / 'unflagged-utf8.zip'
    stored_zip(archive, name.encode('utf-8'), b'UTF-8 without flag')
    response, _ = invoke(binary, root, 'list', archive)
    assert [entry['path'] for entry in response['result']['entries']] == [name]
    destination = root / 'unflagged-utf8'
    invoke(binary, root, 'extract', archive, '--destination', destination, f'--target={name}')
    assert (destination / name).read_bytes() == b'UTF-8 without flag'
    cases.append({'case': 'unflagged-utf8', 'passed': True, 'names_exact': True,
                  'contents_sha256_match': True})
    return cases, observations


def benchmark(binary, root):
    """Use equal payloads and alternating order to reduce cache/order bias."""
    count, repeats = 1000, 3
    payload = bytes(range(256)) * 4
    sources = {}
    for label, prefix in [('ascii', 'document'), ('unicode', '한국어-日本語-العربية-📦')]:
        source = root / ('bench-' + label)
        source.mkdir()
        for index in range(count):
            (source / f'{prefix}-{index:04}.txt').write_bytes(payload)
        sources[label] = source
    samples = {label: [] for label in sources}
    for repeat in range(repeats):
        for label in (['ascii', 'unicode'] if repeat % 2 == 0 else ['unicode', 'ascii']):
            archive = root / f'bench-{label}-{repeat}.zip'
            _, compression = invoke(binary, root, 'compress', sources[label], '--destination', archive,
                                    '--format', 'zip')
            listing, listing_seconds = invoke(binary, root, 'list', archive)
            assert sum(not entry['is_dir'] for entry in listing['result']['entries']) == count
            destination = root / f'bench-out-{label}-{repeat}'
            _, extraction = invoke(binary, root, 'extract', archive, '--destination', destination)
            assert file_hashes(destination / sources[label].name) == file_hashes(sources[label])
            samples[label].append({'compress_seconds': compression, 'list_seconds': listing_seconds,
                                   'extract_seconds': extraction, 'archive_bytes': archive.stat().st_size})
    return {'format': 'zip', 'files': count, 'payload_bytes_each': len(payload), 'repeats': repeats,
            'order': 'alternating', 'includes': 'CLI startup + native ZIP I/O; excludes GUI rendering',
            'samples': samples, 'median_seconds': {
                label: {operation: statistics.median(sample[operation] for sample in values)
                        for operation in ['compress_seconds', 'list_seconds', 'extract_seconds']}
                for label, values in samples.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--benchmark', action='store_true')
    args = parser.parse_args()
    binary = args.binary.resolve()
    with tempfile.TemporaryDirectory(prefix='ziplens-unicode-') as temporary:
        root = Path(temporary)
        capabilities, _ = invoke(binary, root, 'capabilities')
        assert capabilities['result']['backends']['seven_zip_available'], 'Bundled 7zz is required'
        cases = roundtrips(binary, root)
        legacy_cases, observations = legacy_names(binary, root)
        cases.extend(legacy_cases)
        report = {'binary': str(binary), 'version': capabilities['result']['version'],
                  'platform': platform.platform(), 'languages': list(LANGUAGE_NAMES),
                  'passed_cases': len(cases), 'cases': cases,
                  'legacy_encoding_observations': observations}
        if args.benchmark:
            report['benchmark'] = benchmark(binary, root)
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

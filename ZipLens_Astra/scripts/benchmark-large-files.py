#!/usr/bin/env python3
"""Benchmark packaged ZipLens CLIs with allocated, synthetic files (stdlib only).

Example:
  python3 scripts/benchmark-large-files.py --baseline /Applications/ZipLens.app/Contents/MacOS/ziplens \
    --candidate /path/to/new/ZipLens.app/Contents/MacOS/ziplens --output /private/tmp/results

The full suite uses a 4 GiB + 64 MiB ZIP64 entry, eight 64 MiB mixed files,
and 10,000 Unicode-named 4 KiB files. Fixtures, archives and extraction outputs
are removed after each case, including failure. JSON evidence remains in output.
--quick uses small fixtures to check this harness; its results are not benchmarks.
Timing covers each complete CLI process, excluding generation and verification.
No cache eviction is attempted. This measures the engine through CLI, not the GUI.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import random
import shutil
import signal
import statistics
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import zipfile


MIB = 1024 ** 2
GIB = 1024 ** 3
CHUNK_BYTES = MIB
NAMES = ['한글', '日本語', '简体中文', '繁體中文', 'Deutsch', 'Français',
         'Español', 'Português', 'العربية', 'हिन्दी', '🎁']


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def save_json(path, value):
    """Atomically replace evidence so an interrupted run keeps a readable report."""
    temporary = path.with_name(path.name + '.writing')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def check_deadline(deadline):
    if time.monotonic() >= deadline:
        raise TimeoutError('The whole-suite deadline was reached')


def hash_stream(stream, deadline):
    digest = hashlib.sha256()
    byte_count = 0
    while block := stream.read(CHUNK_BYTES):
        check_deadline(deadline)
        digest.update(block)
        byte_count += len(block)
    return byte_count, digest.hexdigest()


def hash_file(path, deadline):
    with path.open('rb') as stream:
        return hash_stream(stream, deadline)[1]


def normalized_path(path):
    return unicodedata.normalize('NFC', path.as_posix())


def file_manifest(source, relative_to, deadline):
    """Compare names, directories, byte sizes and streamed hashes, never contents."""
    entries = {}
    paths = [source, *source.rglob('*')] if source.is_dir() else [source]
    for path in paths:
        check_deadline(deadline)
        key = normalized_path(path.relative_to(relative_to))
        if path.is_symlink():
            raise RuntimeError('Unexpected symlink in synthetic fixture or extraction')
        if key in entries:
            raise RuntimeError('Canonical Unicode path collision')
        if path.is_dir():
            entries[key] = {'kind': 'directory'}
        elif path.is_file():
            entries[key] = {'kind': 'file', 'bytes': path.stat().st_size,
                            'sha256': hash_file(path, deadline)}
        else:
            raise RuntimeError('Unexpected special file in fixture or extraction')
    return dict(sorted(entries.items()))


def extracted_manifest(destination, deadline):
    result = {}
    for entry in destination.iterdir():
        for key, value in file_manifest(entry, destination, deadline).items():
            if key in result:
                raise RuntimeError('Canonical Unicode path collision after extraction')
            result[key] = value
    return dict(sorted(result.items()))


def verify_equal(expected, actual):
    if expected != actual:
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        changed = sorted(key for key in expected.keys() & actual.keys()
                         if expected[key] != actual[key])
        raise RuntimeError('Manifest mismatch: ' + json.dumps(
            {'missing': missing[:10], 'extra': extra[:10], 'changed': changed[:10]},
            ensure_ascii=False))


def require_space(directory, upcoming_bytes, reserve_bytes):
    free = shutil.disk_usage(directory).free
    required = upcoming_bytes + reserve_bytes
    if free < required:
        raise RuntimeError(f'Insufficient disk space: {free} free bytes; '
                           f'{required} required, including {reserve_bytes} reserve bytes')
    return {'free_bytes': free, 'required_bytes': required,
            'reserve_bytes': reserve_bytes}


def write_fixture(path, byte_count, rng, mixed, deadline):
    """Write every byte; unique PRNG blocks avoid sparse/repeated-random shortcuts."""
    written = 0
    with path.open('wb') as stream:
        while written < byte_count:
            check_deadline(deadline)
            size = min(CHUNK_BYTES, byte_count - written)
            random_size = size // 2 if mixed else size
            block = rng.randbytes(random_size)
            if mixed:
                phrase = b'ZipLens allocated synthetic mixed-data benchmark.\n'
                block += (phrase * ((size - random_size) // len(phrase) + 1))[:size-random_size]
            stream.write(block)
            written += size
        stream.flush()
        os.fsync(stream.fileno())


def make_fixture(case, directory, quick, deadline):
    rng = random.Random(20261018)
    if case == 'zip64-single':
        size = 16 * MIB if quick else 4 * GIB + 64 * MIB
        source = directory / '대용량-日本語-العربية-🎁.bin'
        write_fixture(source, size, rng, False, deadline)
    else:
        source = directory / '자료-日本語-العربية-🎁'
        source.mkdir()
        count, size = ((8, MIB if quick else 64 * MIB) if case == 'mixed-files'
                       else (100 if quick else 10000, 4096))
        for index in range(count):
            write_fixture(source / f'{index:05d}-{NAMES[index % len(NAMES)]}.bin',
                          size, rng, case == 'mixed-files', deadline)
    return source


class ProcessTreeSampler:
    """Keep only this benchmark process tree; never persist unrelated ps rows."""

    def __init__(self, pid, interval):
        self.pid = pid
        self.interval = interval
        self.stop = threading.Event()
        self.samples = []
        self.errors = 0
        self.started = time.monotonic()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        while not self.stop.is_set():
            started = time.monotonic()
            try:
                result = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,rss='],
                                        capture_output=True, text=True, timeout=2, check=True)
                rows = [tuple(map(int, line.split())) for line in result.stdout.splitlines()
                        if len(line.split()) == 3]
                descendants = {self.pid}
                while True:
                    expanded = descendants | {pid for pid, parent, _ in rows if parent in descendants}
                    if expanded == descendants:
                        break
                    descendants = expanded
                selected = [(pid, rss) for pid, _, rss in rows if pid in descendants]
                if selected:
                    self.samples.append({
                        'seconds': round(time.monotonic() - self.started, 6),
                        'rss_bytes': sum(rss for _, rss in selected) * 1024,
                        'process_count': len(selected),
                    })
            except (OSError, subprocess.SubprocessError, ValueError):
                self.errors += 1
            self.stop.wait(max(0, self.interval - (time.monotonic() - started)))

    def finish(self):
        self.stop.set()
        self.thread.join(timeout=3)
        return {'interval_seconds_requested': self.interval, 'errors': self.errors,
                'peak_tree_rss_bytes': max((s['rss_bytes'] for s in self.samples), default=None),
                'max_process_count': max((s['process_count'] for s in self.samples), default=0),
                'samples': self.samples}


def terminate_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def measure_cli(binary, arguments, work, args, deadline, expected_entries=None):
    """wait4 reaps exactly our child and exposes CPU/RSS without another wrapper."""
    check_deadline(deadline)
    stdout_path, stderr_path = work / 'cli-stdout.tmp', work / 'cli-stderr.tmp'
    process = sampler = None
    reaped = False
    try:
        with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
            started = time.monotonic()
            process = subprocess.Popen([str(binary), 'cli', *map(str, arguments)],
                                       cwd=work, stdin=subprocess.DEVNULL, stdout=stdout,
                                       stderr=stderr, start_new_session=True)
            sampler = ProcessTreeSampler(process.pid, args.sample_interval)
            sampler.thread.start()
            hard_deadline = min(deadline, started + args.timeout_seconds + 30)
            timed_out = False
            while True:
                pid, status, usage = os.wait4(process.pid, os.WNOHANG)
                if pid:
                    reaped = True
                    process.returncode = os.waitstatus_to_exitcode(status)
                    finished = time.monotonic()
                    break
                if time.monotonic() >= hard_deadline:
                    timed_out = True
                    terminate_group(process)
                time.sleep(0.01)
        rss = sampler.finish()
        response_text = stdout_path.read_text(encoding='utf-8', errors='replace')
        stderr_text = stderr_path.read_text(encoding='utf-8', errors='replace')
        try:
            response = json.loads(response_text)
        except json.JSONDecodeError:
            response = None
        # CLI output paths can be very large for the 10k-file case. Persist counts,
        # not the full response or any source payload; the manifest holds names.
        result = response.get('result', {}) if isinstance(response, dict) else {}
        metrics = {
            'wall_seconds': finished - started,
            'cpu_user_seconds': usage.ru_utime, 'cpu_system_seconds': usage.ru_stime,
            'cpu_seconds': usage.ru_utime + usage.ru_stime,
            'kernel_maxrss_bytes_wait4': int(usage.ru_maxrss * (1 if sys.platform == 'darwin' else 1024)),
            'sampled_process_tree': rss,
            'returncode': process.returncode, 'hard_timeout': timed_out,
            'cli_ok': response.get('ok') if isinstance(response, dict) else None,
            'cli_schema_version': response.get('schema_version') if isinstance(response, dict) else None,
            'cli_output_path_count': len(result.get('output_paths', [])),
            'cli_error': response.get('error') if isinstance(response, dict) else 'Invalid JSON response',
            'stderr': stderr_text[:4000],
        }
        if expected_entries is not None and metrics['cli_ok']:
            try:
                actual = {}
                for entry in result['entries']:
                    key = unicodedata.normalize('NFC', entry['path'].rstrip('/'))
                    if key in actual:
                        raise RuntimeError('Duplicate canonical name in CLI listing')
                    actual[key] = ({'kind': 'directory'} if entry['is_dir']
                                   else {'kind': 'file', 'bytes': entry['size']})
                expected = {key: {field: value for field, value in details.items()
                                  if field != 'sha256'} for key, details in expected_entries.items()}
                verify_equal(expected, actual)
                metrics['listing_verification'] = {'ok': True, 'entry_count': len(actual)}
            except (KeyError, TypeError, ValueError, RuntimeError) as error:
                metrics['listing_verification'] = {'ok': False, 'error': str(error)}
        return metrics
    finally:
        if process is not None and not reaped:
            terminate_group(process)
            try:
                _, status, _ = os.wait4(process.pid, 0)
                process.returncode = os.waitstatus_to_exitcode(status)
            except ChildProcessError:
                pass
        if sampler is not None:
            sampler.finish()
        stdout_path.unlink(missing_ok=True)
        stderr_path.unlink(missing_ok=True)


def require_cli_success(measurement):
    if measurement['returncode'] != 0 or measurement['cli_ok'] is not True:
        raise RuntimeError('CLI operation failed: ' + json.dumps({
            key: measurement[key] for key in ['returncode', 'hard_timeout', 'cli_error', 'stderr']}))


def has_zip64_extra(extra):
    offset = 0
    while offset + 4 <= len(extra):
        tag, length = struct.unpack_from('<HH', extra, offset)
        if tag == 1:
            return True
        offset += 4 + length
    return False


def verify_independent_zip(archive, expected, deadline, require_zip64):
    """Read the complete candidate ZIP with Python, validating CRC and SHA-256."""
    actual = {}
    large = []
    with zipfile.ZipFile(archive) as zipped:
        for info in zipped.infolist():
            key = unicodedata.normalize('NFC', info.filename.rstrip('/'))
            if key in actual:
                raise RuntimeError('Duplicate ZIP entry in independent reader')
            if info.is_dir():
                actual[key] = {'kind': 'directory'}
            else:
                with zipped.open(info) as stream:
                    size, digest = hash_stream(stream, deadline)
                actual[key] = {'kind': 'file', 'bytes': size, 'sha256': digest}
                if info.file_size > 0xffffffff:
                    large.append({'entry': key, 'bytes': info.file_size,
                                  'compress_bytes': info.compress_size,
                                  'extract_version': info.extract_version,
                                  'zip64_extra': has_zip64_extra(info.extra)})
    verify_equal(expected, actual)
    if require_zip64 and (not large or not all(item['zip64_extra'] for item in large)):
        raise RuntimeError('The >4 GiB ZIP entry is missing ZIP64 metadata')
    return {'ok': True, 'reader': 'Python stdlib zipfile; complete CRC/SHA stream read',
            'entry_count': len(actual), 'large_entries': large}


def schedule(case, repetitions):
    rows = []
    for iteration in range(repetitions):
        order = ['baseline', 'candidate'] if iteration % 2 == 0 else ['candidate', 'baseline']
        rows.extend((binary, 'zip', iteration + 1) for binary in order)
    if case == 'mixed-files':
        rows.extend(('candidate', format_name, iteration + 1)
                    for format_name in ['tar', 'tar.gz', 'tar.zst', '7z']
                    for iteration in range(repetitions))
    return rows


def summarize(runs):
    groups = {}
    for run in runs:
        if not run.get('ok'):
            continue
        for operation in ['compress', 'list', 'extract']:
            key = (run['case'], run['binary'], run['format'], operation)
            groups.setdefault(key, []).append(run[operation])
    result = []
    for (case, binary, format_name, operation), rows in groups.items():
        result.append({'case': case, 'binary': binary, 'format': format_name,
                       'operation': operation, 'count': len(rows),
                       'wall_seconds_median': statistics.median(row['wall_seconds'] for row in rows),
                       'wall_seconds_min': min(row['wall_seconds'] for row in rows),
                       'wall_seconds_max': max(row['wall_seconds'] for row in rows),
                       'cpu_seconds_median': statistics.median(row['cpu_seconds'] for row in rows),
                       'kernel_maxrss_bytes_max': max(row['kernel_maxrss_bytes_wait4'] for row in rows),
                       'sampled_tree_rss_bytes_max': max(
                           (row['sampled_process_tree']['peak_tree_rss_bytes'] for row in rows
                            if row['sampled_process_tree']['peak_tree_rss_bytes'] is not None),
                           default=None)})
    return result


@contextmanager
def case_directory(args, case, case_report, report):
    """Only remove a directory created by this invocation, even on interruption."""
    temporary = tempfile.TemporaryDirectory(prefix=f'ziplens-bench-{case}-', dir=args.work_dir)
    try:
        yield Path(temporary.name)
    finally:
        temporary.cleanup()
        case_report['temporary_fixture_and_outputs_removed'] = True
        if case_report.get('state') != 'passed':
            case_report['state'] = 'failed-or-interrupted'
        save_json(args.output / 'report.json', report)


def run_suite(args, report, deadline):
    repetitions = {'zip64-single': 1 if args.quick else 2,
                   'mixed-files': 1 if args.quick else 3,
                   'many-small-files': 1 if args.quick else 3}
    if args.repetitions is not None:
        repetitions = dict.fromkeys(repetitions, args.repetitions)
    input_sizes = {'zip64-single': 16 * MIB if args.quick else 4 * GIB + 64 * MIB,
                   'mixed-files': 8 * MIB if args.quick else 512 * MIB,
                   'many-small-files': (100 if args.quick else 10000) * 4096}
    for case in args.cases:
        check_deadline(deadline)
        case_report = {'case': case, 'state': 'generating', 'started_utc': utc_now(),
                       'scheduled_runs': [dict(zip(['binary', 'format', 'iteration'], row))
                                          for row in schedule(case, repetitions[case])]}
        report['cases'].append(case_report)
        save_json(args.output / 'report.json', report)
        # Source + archive budget (120%) + extraction budget (110%). Each run
        # reuses the source but removes the previous archive/extraction first.
        case_report['disk_before_fixture'] = require_space(
            args.work_dir, int(input_sizes[case] * 3.3), args.reserve_bytes)
        with case_directory(args, case, case_report, report) as work:
            source = make_fixture(case, work, args.quick, deadline)
            expected = file_manifest(source, work, deadline)
            file_entries = [value for value in expected.values() if value['kind'] == 'file']
            total_bytes = sum(value['bytes'] for value in file_entries)
            allocated_bytes = sum(path.stat().st_blocks * 512 for path in
                                  ([source] if source.is_file() else source.rglob('*')) if path.is_file())
            case_report.update({'state': 'measuring', 'file_count': len(file_entries),
                                'input_bytes': total_bytes, 'allocated_fixture_bytes': allocated_bytes,
                                'manifest_file': f'{case}-fixture-manifest.json'})
            if case == 'zip64-single':
                case_report['fully_allocated_source_verified'] = allocated_bytes >= total_bytes
                if not case_report['fully_allocated_source_verified']:
                    raise RuntimeError('The large random source has fewer allocated bytes than its size')
            save_json(args.output / case_report['manifest_file'], {
                'seed': 20261018, 'generator': 'random.Random.randbytes, unique sequential blocks; '
                'mixed files contain half pseudorandom bytes and half repeated public text per block',
                'unicode_normalization_for_comparison': 'NFC', 'entries': expected})
            save_json(args.output / 'report.json', report)
            independent_zip_done = False
            print(f'{case}: fixture ready ({len(file_entries)} files, {total_bytes} bytes)', flush=True)
            for binary_name, format_name, iteration in schedule(case, repetitions[case]):
                run = {'case': case, 'binary': binary_name, 'format': format_name,
                       'iteration': iteration, 'started_utc': utc_now(), 'ok': False}
                report['runs'].append(run)
                run['disk_before_run'] = require_space(work, int(total_bytes * 2.3), args.reserve_bytes)
                archive, destination = work / f'output.{format_name}', work / 'extracted'
                save_json(args.output / 'report.json', report)
                try:
                    run['compress'] = measure_cli(getattr(args, binary_name), [
                        'compress', source, '--destination', archive, '--format', format_name,
                        '--level', '6', '--timeout-seconds', str(args.timeout_seconds)], work, args, deadline)
                    save_json(args.output / 'report.json', report)
                    require_cli_success(run['compress'])
                    run['archive_bytes'] = archive.stat().st_size
                    run['archive_sha256_before'] = hash_file(archive, deadline)
                    run['list'] = measure_cli(getattr(args, binary_name), [
                        'list', archive, '--timeout-seconds', str(args.timeout_seconds)],
                        work, args, deadline, expected_entries=expected)
                    save_json(args.output / 'report.json', report)
                    require_cli_success(run['list'])
                    if not run['list']['listing_verification']['ok']:
                        raise RuntimeError('CLI listing differs from fixture manifest: '
                                           + str(run['list']['listing_verification']))
                    run['extract'] = measure_cli(getattr(args, binary_name), [
                        'extract', archive, '--destination', destination,
                        '--timeout-seconds', str(args.timeout_seconds)], work, args, deadline)
                    save_json(args.output / 'report.json', report)
                    require_cli_success(run['extract'])
                    verify_equal(expected, extracted_manifest(destination, deadline))
                    run['extraction_verified'] = True
                    run['archive_sha256_after'] = hash_file(archive, deadline)
                    if run['archive_sha256_before'] != run['archive_sha256_after']:
                        raise RuntimeError('Extraction changed the source archive')
                    if binary_name == 'candidate' and format_name == 'zip' and not independent_zip_done:
                        run['independent_zip_verification'] = verify_independent_zip(
                            archive, expected, deadline, case == 'zip64-single' and not args.quick)
                        independent_zip_done = True
                    run['ok'] = True
                    print(f"{case} {binary_name} {format_name} #{iteration}: "
                          f"compress {run['compress']['wall_seconds']:.3f}s, "
                          f"list {run['list']['wall_seconds']:.3f}s, "
                          f"extract {run['extract']['wall_seconds']:.3f}s; SHA/name verification passed",
                          flush=True)
                except BaseException as error:
                    run['error'] = f'{type(error).__name__}: {error}'
                    raise
                finally:
                    run['finished_utc'] = utc_now()
                    report['summary'] = summarize(report['runs'])
                    save_json(args.output / 'report.json', report)
                    archive.unlink(missing_ok=True)
                    if destination.exists():
                        shutil.rmtree(destination)
            verify_equal(expected, file_manifest(source, work, deadline))
            case_report['source_unchanged_after_all_runs'] = True
            case_report['state'] = 'passed'
            case_report['finished_utc'] = utc_now()
        save_json(args.output / 'report.json', report)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New evidence directory (must not exist)')
    parser.add_argument('--work-dir', type=Path, default=Path('/private/tmp'))
    parser.add_argument('--quick', action='store_true', help='Tiny harness self-check; not a performance result')
    parser.add_argument('--cases', nargs='+', choices=['zip64-single', 'mixed-files', 'many-small-files'],
                        default=['zip64-single', 'mixed-files', 'many-small-files'])
    parser.add_argument('--repetitions', type=int, help='Override repeats; default large=2, other=3')
    parser.add_argument('--timeout-seconds', type=int, default=1200)
    parser.add_argument('--deadline-seconds', type=int, default=7200)
    parser.add_argument('--reserve-gib', type=float, default=4)
    parser.add_argument('--sample-interval', type=float, default=0.1)
    args = parser.parse_args()
    if not hasattr(os, 'wait4'):
        parser.error('This harness requires POSIX wait4')
    if (args.timeout_seconds < 1 or args.deadline_seconds < 1 or args.reserve_gib < 4
            or args.sample_interval < 0.05 or (args.repetitions is not None and args.repetitions < 1)):
        parser.error('Positive timeouts/repetitions, reserve >=4 GiB and sample interval >=0.05 required')
    if len(set(args.cases)) != len(args.cases):
        parser.error('Cases must not be repeated')
    for name in ['baseline', 'candidate']:
        path = getattr(args, name).expanduser().resolve(strict=True)
        if not path.is_file() or not os.access(path, os.X_OK):
            parser.error(f'{name} must be an executable file')
        setattr(args, name, path)
    args.work_dir = args.work_dir.expanduser().resolve(strict=True)
    args.output = args.output.expanduser().resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    args.reserve_bytes = int(args.reserve_gib * GIB)
    deadline = time.monotonic() + args.deadline_seconds
    report = {
        'schema_version': 1, 'started_utc': utc_now(), 'ok': False,
        'mode': 'quick-harness-check' if args.quick else 'full-benchmark',
        'environment': {'platform': platform.platform(), 'machine': platform.machine(),
                        'python': platform.python_version(), 'cpu_count': os.cpu_count()},
        'method': {
            'measurement': 'Complete optimized packaged CLI process; fixture creation/hash verification excluded',
            'cache': 'No cache flush and no separate warm-up; source was just generated/read; '
                     'baseline/candidate ZIP order alternates by iteration',
            'cpu': 'wait4 user + system time of the reaped CLI, including waited-for child accounting',
            'kernel_rss': 'Kernel wait4 ru_maxrss; bytes on macOS, converted from KiB on Linux; '
                          'not a sum of simultaneous parent/child peaks',
            'sampled_rss': 'Sum of live CLI and descendant RSS sampled with ps; includes a live 7zz child; '
                           'sampled estimate can miss short peaks, and shared pages can be double counted',
            'limits': 'Synthetic data on this machine; no GUI responsiveness, encrypted archives or '
                      'exhaustive format coverage; two large samples do not establish statistical significance',
            'compression_level': 6, 'cli_timeout_seconds': args.timeout_seconds,
            'external_process_timeout_seconds': args.timeout_seconds + 30,
            'suite_deadline_seconds': args.deadline_seconds, 'reserve_bytes': args.reserve_bytes,
        }, 'cases': [], 'runs': [], 'summary': [],
    }
    save_json(args.output / 'report.json', report)
    exit_code = 0
    try:
        report['binaries'] = {name: {'path': str(getattr(args, name)),
                                    'sha256': hash_file(getattr(args, name), deadline)}
                              for name in ['baseline', 'candidate']}
        report['harness_sha256'] = hash_file(Path(__file__), deadline)
        run_suite(args, report, deadline)
        report['ok'] = True
    except BaseException as error:
        report['error'] = f'{type(error).__name__}: {error}'
        print(report['error'], file=sys.stderr, flush=True)
        exit_code = 130 if isinstance(error, KeyboardInterrupt) else 1
    finally:
        report['finished_utc'] = utc_now()
        save_json(args.output / 'report.json', report)
    return exit_code


def handle_termination(_signum, _frame):
    """Use the normal interruption path to clean children and generated files."""
    raise KeyboardInterrupt()


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, handle_termination)
    raise SystemExit(main())

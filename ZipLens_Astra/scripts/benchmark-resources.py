#!/usr/bin/env python3
"""Measure an already-built resource_probe, outside the synced source directory.

Uses synthetic public data, one warm-up and three measured processes per operation.
Verification is outside the timed process. No cache flushing or UI measurements.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import shutil
import statistics
import subprocess
import tempfile
import zipfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(source, extracted):
    expected = {p.relative_to(source.parent): digest(p) for p in source.rglob('*') if p.is_file()}
    actual = {p.relative_to(extracted): digest(p) for p in extracted.rglob('*') if p.is_file()}
    if expected != actual:
        raise RuntimeError('Extracted files differ from source')


def invoke(probe, operation, source, destination):
    result = subprocess.run([str(probe), operation, str(source), str(destination)],
                            text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def measure(probe, operation, source, root, verify_source):
    samples = []
    for iteration in range(4):
        output = root / f'result-{iteration}'
        if operation != 'extract':
            output = output.with_suffix('.' + operation)
        sample = invoke(probe, operation, source, output)
        if operation == 'extract':
            verify(verify_source, output)
            shutil.rmtree(output)
        else:
            sample['archive_bytes'] = output.stat().st_size
            check = root / 'verify'
            invoke(probe, 'extract', output, check)
            verify(verify_source, check)
            shutil.rmtree(check)
            output.unlink()
        if iteration:
            samples.append(sample)
    summary = {key: statistics.median(sample[key] for sample in samples)
               for key in samples[0] if isinstance(samples[0][key], (int, float))}
    summary['average_cpu_cores'] = summary['cpu_seconds'] / summary['wall_seconds']
    return {'operation': operation, 'samples': samples, 'median': summary}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--suite', choices=['zip', 'full'], default='full')
    args = parser.parse_args()
    results = []
    with tempfile.TemporaryDirectory(prefix='ziplens-resources-', dir='/private/tmp') as temporary:
        root = Path(temporary)
        rng = random.Random(20261002)
        # A 64 KiB block with half repeated text and half pseudo-random data.
        block = (b'ZipLens resource benchmark\n' * 1300)[:32768] + rng.randbytes(32768)
        for scenario in ['many-small', 'front-loaded-large']:
            work = root / scenario
            source = work / 'source'
            source.mkdir(parents=True)
            if scenario == 'many-small':
                for index in range(2000):
                    (source / f'{index:04}.txt').write_bytes(block[:4096])
            else:
                for index in range(80):
                    with (source / f'{index:04}.bin').open('wb') as stream:
                        for _ in range(256 if index < 8 else 1):
                            stream.write(block if index < 8 else block[:4096])
            archive = work / 'input.zip'
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
                for item in sorted(source.iterdir()):
                    zipped.write(item, item.relative_to(source.parent))
            row = {'scenario': scenario, 'input_bytes': sum(p.stat().st_size for p in source.iterdir()),
                   **measure(args.probe.resolve(), 'extract', archive, work, source)}
            results.append(row)
            print(scenario, json.dumps(row['median']), flush=True)
        if args.suite == 'full':
            work = root / 'mixed-64MiB'
            source = work / 'source'
            source.mkdir(parents=True)
            with (source / 'data.bin').open('wb') as stream:
                for _ in range(1024):
                    stream.write(block)
            for format_name in ['zip', '7z', 'tar.gz', 'tar.zst']:
                archive = work / ('input.' + format_name)
                invoke(args.probe.resolve(), format_name, source, archive)
                for operation, input_path in [(format_name, source), ('extract', archive)]:
                    row = {'scenario': 'mixed-64MiB', 'format': format_name, 'input_bytes': 64 * 1024 * 1024,
                           **measure(args.probe.resolve(), operation, input_path, work, source)}
                    results.append(row)
                    print(format_name, operation, json.dumps(row['median']), flush=True)
        report = {'method': 'macOS arm64 release core; 1 warm-up + 3 independent processes; warm cache; synthetic data; streaming SHA-256 verification outside timing; /private/tmp; no UI/IPC; CPU includes child processes; parent and child peak RSS are separate, not additive simultaneous peaks',
                  'probe_sha256': digest(args.probe), 'suite': args.suite, 'cases': results}
        args.output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()

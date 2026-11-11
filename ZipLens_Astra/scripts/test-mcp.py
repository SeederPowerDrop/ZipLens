#!/usr/bin/env python3
"""Exercise the packaged ZipLens MCP server over stdio without installing a client."""
import argparse
from contextlib import contextmanager
import json
from pathlib import Path
from queue import Queue
import subprocess
import tempfile
from threading import Thread
import unittest
import zipfile


MODERN_META = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
    'io.modelcontextprotocol/clientInfo': {'name': 'ziplens-test', 'version': '1.0'},
}


class McpTests(unittest.TestCase):
    binary = None

    @contextmanager
    def client(self, *, modern):
        with subprocess.Popen(
            [self.binary, 'mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding='utf-8',
        ) as server:
            lines = Queue()

            def read():
                for line in server.stdout:
                    lines.put(json.loads(line))
                lines.put(None)

            reader = Thread(target=read, daemon=True)
            reader.start()
            next_id = 0

            def send(method, params, request_id=None):
                params = {**params, '_meta': MODERN_META} if modern else params
                message = {'jsonrpc': '2.0', 'method': method, 'params': params}
                if request_id is not None:
                    message['id'] = request_id
                server.stdin.write(json.dumps(message) + '\n')
                server.stdin.flush()

            def request(method, params=None):
                nonlocal next_id
                next_id += 1
                send(method, params or {}, next_id)
                reply = lines.get(timeout=15)
                self.assertIsNotNone(reply)
                self.assertEqual(reply['id'], next_id)
                self.assertNotIn('error', reply)
                if modern:
                    self.assertEqual(reply['result']['resultType'], 'complete')
                return reply['result']

            try:
                if modern:
                    result = request('server/discover')
                    self.assertEqual(result['supportedVersions'], ['2026-07-28'])
                else:
                    result = request('initialize', {
                        'protocolVersion': '2025-11-25', 'capabilities': {},
                        'clientInfo': {'name': 'ziplens-test', 'version': '1.0'},
                    })
                    self.assertEqual(result['protocolVersion'], '2025-11-25')
                    send('notifications/initialized', {})
                yield request
            finally:
                server.stdin.close()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
                    raise
                reader.join(timeout=5)
                self.assertEqual(server.returncode, 0)

    def call(self, request, name, **arguments):
        response = request('tools/call', {'name': f'ziplens_{name}', 'arguments': arguments})
        payload = response['structuredContent']
        self.assertEqual(json.loads(response['content'][0]['text']), payload)
        self.assertEqual(response['isError'], not payload['ok'])
        return payload

    def test_modern_tools_roundtrip_and_pagination(self):
        with self.client(modern=True) as request, tempfile.TemporaryDirectory() as temp:
            tools = request('tools/list')['tools']
            self.assertEqual({tool['name'] for tool in tools}, {
                'ziplens_capabilities', 'ziplens_list', 'ziplens_extract', 'ziplens_compress',
            })
            self.assertEqual(self.call(request, 'capabilities')['result']['name'], 'ZipLens')
            directory = Path(temp)
            source = directory / '한글 이름.txt'
            source.write_bytes(b'zip data')
            other = directory / '--other.txt'
            other.write_bytes(b'unselected')
            archive = directory / 'archive.zip'
            self.assertTrue(self.call(request, 'compress', sources=[str(source), str(other)],
                                      destination=str(archive), format='zip')['ok'])

            first = self.call(request, 'list', archive=str(archive), limit=1)['result']
            second = self.call(request, 'list', archive=str(archive),
                               offset=first['next_offset'], limit=1)['result']
            self.assertEqual(first['total_entries'], 2)
            self.assertIsNone(second['next_offset'])
            self.assertEqual({first['entries'][0]['path'], second['entries'][0]['path']},
                             {source.name, other.name})

            destination = directory / 'extracted'
            destination.mkdir()
            existing = destination / other.name
            existing.write_bytes(b'previous content')
            result = self.call(request, 'extract', archive=str(archive),
                               destination=str(destination), targets=[other.name])['result']
            paths = [Path(path) for path in result['output_paths']]
            self.assertEqual(len(paths), 1)
            self.assertNotEqual(paths[0], existing.resolve())
            self.assertEqual(paths[0].read_bytes(), b'unselected')
            self.assertEqual(existing.read_bytes(), b'previous content')
            self.assertFalse((destination / source.name).exists())

    def test_legacy_initialization_and_tool_errors(self):
        with self.client(modern=False) as request, tempfile.TemporaryDirectory() as temp:
            self.assertEqual(request('ping'), {})
            self.assertEqual(len(request('tools/list')['tools']), 4)
            missing = self.call(request, 'list', archive=str(Path(temp) / 'missing.zip'))
            self.assertEqual(missing['error']['code'], 'MISSING_INPUT')
            relative = self.call(request, 'list', archive='relative.zip')
            self.assertEqual(relative['error']['code'], 'INVALID_ARGUMENTS')
            archive = Path(temp) / 'archive.zip'
            with zipfile.ZipFile(archive, 'w') as zipped:
                zipped.writestr('file.txt', b'content')
            destination = Path(temp) / 'output'
            for invalid in (None, []):
                failure = self.call(request, 'extract', archive=str(archive),
                                    destination=str(destination), targets=invalid)
                self.assertEqual(failure['error']['code'], 'INVALID_ARGUMENTS')
                self.assertFalse(destination.exists())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    options = parser.parse_args()
    McpTests.binary = options.binary.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)

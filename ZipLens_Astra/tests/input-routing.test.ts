import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInputPaths } from '../src/input-routing.ts';

test('empty input has no action', () => {
  assert.deepEqual(classifyInputPaths([]), { kind: 'empty' });
});

test('archives route to extraction, including upper case, compound and split extensions', () => {
  for (const path of ['/Downloads/photos.ZIP', '/Downloads/photos.TAR.GZ', '/Downloads/photos.7z.001']) {
    assert.deepEqual(classifyInputPaths([{ path, isDirectory: false }]), {
      kind: 'extract', path, archiveCount: 1
    });
  }
});

test('ordinary files and folders route to compression in selection order', () => {
  const inputs = [
    { path: '/Downloads/photo.jpg', isDirectory: false },
    { path: '/Downloads/documents', isDirectory: true },
    { path: '/Downloads/readme', isDirectory: false }
  ];
  assert.deepEqual(classifyInputPaths(inputs), {
    kind: 'compress', paths: inputs.map(input => input.path)
  });
});

test('an archive-like directory name still routes to compression', () => {
  for (const path of ['/Downloads/photos.zip', '/Downloads/photos.TAR.GZ']) {
    assert.deepEqual(classifyInputPaths([{ path, isDirectory: true }]), {
      kind: 'compress', paths: [path]
    });
  }
});

test('multiple archives preview the first and report the number of unique archives', () => {
  const first = '/Downloads/first.zip';
  const second = '/Downloads/second.7z';
  assert.deepEqual(classifyInputPaths([
    { path: first, isDirectory: false },
    { path: second, isDirectory: false },
    { path: first, isDirectory: false }
  ]), { kind: 'extract', path: first, archiveCount: 2 });
});

test('archives mixed with ordinary inputs stay together for compression', () => {
  for (const ordinary of [
    { path: '/Downloads/readme.txt', isDirectory: false },
    { path: '/Downloads/photos.zip', isDirectory: true }
  ]) {
    const archive = { path: '/Downloads/backup.zip', isDirectory: false };
    for (const inputs of [[archive, ordinary], [ordinary, archive]]) {
      assert.deepEqual(classifyInputPaths(inputs), {
        kind: 'compress', paths: inputs.map(input => input.path)
      });
    }
  }
});

test('duplicate compression paths are removed without changing selection order', () => {
  const first = { path: '/Downloads/readme.txt', isDirectory: false };
  const second = { path: '/Downloads/documents', isDirectory: true };
  assert.deepEqual(classifyInputPaths([first, second, first, second]), {
    kind: 'compress', paths: [first.path, second.path]
  });
});

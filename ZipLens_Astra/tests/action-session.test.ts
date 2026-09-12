import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveActionGate } from '../src/action-session.ts';
import { snapshotExtraction } from '../src/archive-model.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('a conflict dialog keeps the original archive and selection until extraction finishes', async () => {
  const gate = new ArchiveActionGate();
  const conflict = deferred<void>();
  const complete = deferred<void>();
  const files = [{ path: 'shared.txt', selected: true }, { path: 'other.txt', selected: false }];
  let loadedArchive = '/A.zip';
  let extracted: ReturnType<typeof snapshotExtraction> | undefined;
  const extraction = gate.run(async () => {
    const request = snapshotExtraction(loadedArchive, 'password-A', files);
    await conflict.promise;
    extracted = request;
    await complete.promise;
  });
  assert.equal(gate.busy, true);
  await gate.run(async () => { loadedArchive = '/B.zip'; });
  files[0].selected = false;
  files[1].selected = true;
  conflict.resolve();
  await Promise.resolve();
  assert.deepEqual(extracted, { archivePath: '/A.zip', password: 'password-A', targetFiles: ['shared.txt'], rootItems: ['shared.txt'], emptySelection: false });
  assert.equal(gate.busy, true, 'result/codec completion still belongs to the action');
  complete.resolve();
  await extraction;
  assert.equal(gate.busy, false);
  await gate.run(async () => { loadedArchive = '/B.zip'; });
  assert.equal(loadedArchive, '/B.zip');
});

test('cancelling a save dialog or failing an action releases the gate exactly once', async () => {
  const changes: boolean[] = [];
  const gate = new ArchiveActionGate(busy => changes.push(busy));
  const saveDialog = deferred<string | null>();
  let secondRan = false;
  const first = gate.run(async () => { await saveDialog.promise; });
  await gate.run(async () => { secondRan = true; });
  assert.equal(secondRan, false);
  saveDialog.resolve(null);
  await first;
  await assert.rejects(gate.run(async () => { throw new Error('dialog failed'); }), /dialog failed/);
  assert.equal(gate.busy, false);
  assert.deepEqual(changes, [true, false, true, false]);
});

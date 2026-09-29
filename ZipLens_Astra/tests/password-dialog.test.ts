import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveActionGate } from '../src/action-session.ts';
import { showPasswordDialog } from '../src/password-dialog.ts';

function controls() {
  const element = () => ({ style: { display: '' }, disabled: false, value: '', onclick: null as null | (() => unknown), focus() {} });
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    modal: { ...element(), addEventListener(name: string, handler: (event: unknown) => void) { listeners.set(name, handler); }, removeEventListener(name: string) { listeners.delete(name); } },
    input: element(), submit: element(), cancel: element(), error: element(), listeners
  };
}

test('cancelling password submission interrupts codec work and holds the action until it stops', async () => {
  const ui = controls();
  let stop!: (accepted: boolean) => void;
  let cancelCalls = 0;
  let finished = false;
  const gate = new ArchiveActionGate();
  const pending = gate.run(() => showPasswordDialog(ui as any, () => new Promise<boolean>(resolve => { stop = resolve; }), {
    cancelWork: async () => { cancelCalls++; }, running() {}, cancelFailed() { assert.fail('unexpected cancellation failure'); }
  }));
  void pending.then(() => { finished = true; });
  ui.input.value = 'correct password';
  const submission = ui.submit.onclick!();
  assert.equal(ui.submit.disabled, true);
  assert.equal(ui.cancel.disabled, false, 'cancel must remain available while extraction runs');
  ui.cancel.onclick!();
  await Promise.resolve();
  assert.equal(cancelCalls, 1);
  assert.equal(finished, false);
  assert.equal(gate.busy, true, 'a new Finder request must wait for the cancelled backend');
  stop(true);
  await submission;
  assert.equal(await pending, null);
  assert.equal(gate.busy, false);
  assert.equal(ui.modal.style.display, 'none');
  assert.equal(ui.input.value, '');
  assert.equal(ui.listeners.size, 0);
});

test('incorrect passwords allow retry and idle cancellation cleans up handlers', async () => {
  const ui = controls();
  let attempts = 0;
  const pending = showPasswordDialog(ui as any, async () => { attempts++; return false; }, {
    cancelWork: async () => assert.fail('idle cancellation must not cancel another job'), running() {}, cancelFailed() {}
  });
  await ui.submit.onclick!();
  assert.equal(attempts, 1);
  assert.equal(ui.error.style.display, 'block');
  assert.equal(ui.submit.disabled, false);
  assert.equal(ui.input.disabled, false);
  ui.listeners.get('keydown')!({ key: 'Escape', preventDefault() {} });
  assert.equal(await pending, null);
  assert.equal(ui.submit.onclick, null);
  assert.equal(ui.cancel.onclick, null);
});

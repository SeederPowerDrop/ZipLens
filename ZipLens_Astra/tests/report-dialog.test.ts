import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildReportRows, formatReportCsv, formatReportTxt, reportDisplayItems } from '../src/report-model.ts';
import { escapeHTML } from '../src/utils.ts';

// 실제 main.ts의 결과창 함수를 실행한다. 앱 전체를 import하면 Tauri 초기화가 먼저 실행된다.
const source = ts.createSourceFile('main.ts', readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'showArchiveReport');
assert.ok(declaration, 'main.ts must contain the report dialog controller');
const script = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function element() {
  return {
    style: {} as Record<string, string>, dataset: {} as Record<string, string>, children: [] as ReturnType<typeof element>[],
    innerHTML: '', innerText: '', onclick: null as null | (() => void | Promise<void>), inert: false, disabled: false,
    classList: { remove() {}, add() {} }, setAttribute() {}, focus() {},
    appendChild(child: ReturnType<typeof element>) { this.children.push(child); }
  };
}

function reportFixture() {
  const controls = Object.fromEntries([
    'progressContainer', 'reportModal', 'reportIcon', 'reportFailedList', 'reportSuccessList', 'reportFailedSection',
    'reportTitle', 'reportDesc', 'reportSuccessSection', 'reportExportTxt', 'reportExportCsv', 'reportClose'
  ].map(key => [key, element()]));
  const app = element();
  const cancel = element();
  const listeners = new Map<string, unknown>();
  const saved: string[] = [];
  const context = vm.createContext({
    elements: controls, progressLens: { setRunning() {} }, timerInterval: null, lastResultPath: '/out',
    archiveEntries: [], APP_DISPLAY_NAME: 'ZipLens', clearInterval,
    document: {
      getElementById: (id: string) => id === 'app' ? app : id === 'btn-cancel-operation' ? cancel : null,
      createElement: element, addEventListener: (name: string, listener: unknown) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name)
    },
    getTranslation: (key: string) => key === 'moreFiles' ? '{count} more files' : key,
    getCurrentLang: () => 'en', escapeHTML, reportDisplayItems, buildReportRows, formatReportCsv, formatReportTxt,
    save: async () => '/sample/report.csv', message: async () => {},
    invoke: async (command: string, payload: { content: string }) => {
      assert.equal(command, 'save_report_file');
      saved.push(payload.content);
    }
  });
  const showReport = vm.runInContext(script + '\nshowArchiveReport;', context);
  return { controls, app, listeners, saved, showReport };
}

test('actual report dialog caps 100,000 failures, retains every export row, and awaits dismissal', async () => {
  const { controls, app, listeners, saved, showReport } = reportFixture();
  const failures = Array.from({ length: 100_000 }, (_, index) => [`file-${index}.txt`, 'cannot publish']);
  let dismissed = false;
  const pending = showReport({ success_files: [], failed_files: failures, output_paths: [], cancelled: false }, 'extract');
  void pending.then(() => { dismissed = true; });
  assert.equal(controls.reportFailedList.children.length, 51);
  assert.equal(controls.reportFailedList.children[50].innerText, '99950 more files');
  assert.equal(app.inert, true);
  assert.equal(dismissed, false);
  await controls.reportExportCsv.onclick!();
  assert.equal(saved[0].split('\n').length, 100_002, 'all failures exported, not just visible ones');
  assert.match(saved[0], /file-99999\.txt/);
  controls.reportClose.onclick!();
  await pending;
  assert.equal(dismissed, true);
  assert.equal(app.inert, false);
  assert.equal(listeners.size, 0);
});

test('mixed-direction filenames are isolated in the report while exports retain exact Unicode paths', async () => {
  const { controls, saved, showReport } = reportFixture();
  const failedPath = 'مجلد/تقرير <العربية>.txt';
  const successPath = '日本語/تقرير cafe\u0301 (1).txt';
  const outputPath = `/tmp/نتائج/${successPath}`;
  const pending = showReport({
    success_files: [successPath], failed_files: [[failedPath, 'تعذر الحفظ']],
    output_paths: [outputPath], cancelled: false
  }, 'extract');
  const failure = controls.reportFailedList.children[0].innerHTML;
  const success = controls.reportSuccessList.children[0].innerHTML;
  assert.match(failure, /<bdi dir="auto">تقرير &lt;العربية&gt;\.txt<\/bdi>/);
  assert.match(failure, /<div dir="ltr"[^>]*>مجلد\/تقرير &lt;العربية&gt;\.txt<\/div>/);
  assert.match(success, /<bdi dir="auto"[^>]*>تقرير cafe\u0301 \(1\)\.txt<\/bdi>/);
  assert.doesNotMatch(failure + success, /[\u2066-\u2069]/, 'direction is presentation, never inserted into filenames');
  await controls.reportExportCsv.onclick!();
  assert.ok(saved[0].includes(`"${failedPath}"`));
  assert.ok(saved[0].includes(`"${outputPath}"`));
  assert.doesNotMatch(saved[0], /[\u2066-\u2069]/);
  controls.reportClose.onclick!();
  await pending;
});

test('a single conflict isolates the full mixed-direction path and still resolves the chosen action', async () => {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'requestConflictResolution');
  assert.ok(declaration);
  const script = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const controls = Object.fromEntries(['conflictModal', 'conflictMsg', 'conflictOverwrite', 'conflictKeep', 'conflictCancel'].map(key => [key, element()]));
  const context = vm.createContext({
    elements: controls, escapeHTML,
    getTranslation: () => 'هذا الملف موجود بالفعل:\n{path}'
  });
  const requestConflict = vm.runInContext(`${script}\nrequestConflictResolution;`, context);
  const pending = requestConflict(['/tmp/ملفات/<notes>.txt']);
  assert.equal(controls.conflictMsg.innerHTML, 'هذا الملف موجود بالفعل:\n<bdi dir="ltr">/tmp/ملفات/&lt;notes&gt;.txt</bdi>');
  controls.conflictKeep.onclick!();
  assert.equal(await pending, 'keep_both');
  assert.equal(controls.conflictModal.style.display, 'none');
  assert.equal(controls.conflictOverwrite.onclick, null);
  assert.equal(controls.conflictKeep.onclick, null);
  assert.equal(controls.conflictCancel.onclick, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportRows, formatReportCsv, formatReportTxt, reportDisplayItems, type ExtractionReport } from '../src/report-model.ts';

const translate = (key: string) => key;
const report = (changes: Partial<ExtractionReport> = {}): ExtractionReport => ({
  success_files: [], failed_files: [], output_paths: [], cancelled: false, ...changes
});

test('exact source names prevent nested suffix collisions and keep actual output locations', () => {
  const result = report({ success_files: ['nested/a.txt', 'a.txt'], output_paths: ['/saved/nested/a.txt', '/saved/a.txt'] });
  const rows = buildReportRows(result, [{ path: 'a.txt', size: 1 }, { path: 'nested/a.txt', size: 900 }]);
  assert.deepEqual(rows.successes, [
    { path: '/saved/nested/a.txt', size: 900, error: '' }, { path: '/saved/a.txt', size: 1, error: '' }
  ]);
  assert.match(formatReportTxt(result, rows, 'ZipLens', 'fixed date', translate), /a\.txt \(900 B\) — \/saved\/nested\/a\.txt/);
  assert.match(formatReportCsv(rows, translate), /"900 B","\/saved\/nested\/a\.txt"/);
});

test('source comparison follows relative dot and separator normalization without suffix guessing', () => {
  const result = report({
    success_files: ['folder/a.txt'], output_paths: ['/saved/folder/a.txt'],
    failed_files: [['other/a.txt', 'failed'], ['/folder/a.txt', 'absolute error path']]
  });
  const rows = buildReportRows(result, [{ path: './folder\\a.txt', size: 25 }]);
  assert.equal(rows.successes[0].size, 25);
  assert.deepEqual(rows.failures.map(row => row.size), [null, null]);
});

test('keep-both does not borrow metadata from an original entry that happens to match the renamed result', () => {
  const result = report({ success_files: ['folder (1)/a.txt'], output_paths: ['/saved/folder (1)/a.txt'] });
  const rows = buildReportRows(result, [
    { path: 'folder/a.txt', size: 5 }, { path: 'folder (1)/a.txt', size: 900 }
  ], false);
  assert.equal(rows.successes[0].size, null);
  assert.equal(rows.successes[0].path, '/saved/folder (1)/a.txt');
  assert.match(formatReportTxt(result, rows, 'ZipLens', 'date', translate), /a\.txt \(-\)/);
  assert.match(formatReportCsv(rows, translate), /"'-","\/saved\/folder \(1\)\/a\.txt"/);
});

test('missing metadata stays unknown while a real empty file remains zero bytes', () => {
  const result = report({ success_files: ['empty.txt', 'missing.txt'], output_paths: ['/out/empty.txt', '/out/missing.txt'] });
  const rows = buildReportRows(result, [{ path: 'empty.txt', size: 0 }]);
  assert.deepEqual(rows.successes.map(row => row.size), [0, null]);
  const csv = formatReportCsv(rows, translate);
  assert.match(csv, /"0 B","\/out\/empty\.txt"/);
  assert.match(csv, /"'-","\/out\/missing\.txt"/);
});

test('mismatched output arrays do not associate an unrelated destination or size with a success', () => {
  const result = report({ success_files: ['a.txt', 'b.txt'], output_paths: ['/out/only-one.txt'] });
  const rows = buildReportRows(result, [{ path: 'a.txt', size: 10 }, { path: 'b.txt', size: 20 }]);
  assert.deepEqual(rows.successes, [
    { path: 'a.txt', size: null, error: '' }, { path: 'b.txt', size: null, error: '' }
  ]);
});

test('large reports bound both visible lists but export every failure and success', () => {
  const count = 10_000;
  const names = Array.from({ length: count }, (_, index) => `item-${String(index).padStart(5, '0')}.txt`);
  const result = report({
    success_files: names, output_paths: names.map(name => `/out/${name}`),
    failed_files: names.map(name => [`failed/${name}`, 'output denied'])
  });
  for (const entries of [result.success_files, result.failed_files]) {
    const display = reportDisplayItems(entries);
    assert.equal(display.items.length, 50);
    assert.equal(display.hiddenCount, count - 50);
    assert.equal(entries.length, count, 'display truncation cannot discard export data');
  }
  const rows = buildReportRows(result, names.map((path, index) => ({ path, size: index })));
  const csv = formatReportCsv(rows, translate);
  assert.equal(csv.split('\n').length, count * 2 + 2, 'header + all result rows + final newline');
  assert.match(csv, /failed\/item-09999\.txt/);
  assert.match(csv, /\/out\/item-09999\.txt/);
  const txt = formatReportTxt(result, rows, 'ZipLens', 'date', translate);
  assert.match(txt, /10000\. item-09999\.txt/);
  assert.match(txt, /10000\. \[TXT\] item-09999\.txt/);
});

test('metadata indexing remains linear for 100,000 matching results', () => {
  const count = 100_000;
  let pathReads = 0;
  const names = Array.from({ length: count }, (_, index) => `folder/file-${index}.txt`);
  const entries = names.map((path, size) => ({ get path() { pathReads++; return path; }, size }));
  const rows = buildReportRows(report({ success_files: names, output_paths: names.map(path => `/out/${path}`) }), entries);
  assert.ok(pathReads <= count * 3, `source visits must stay linear; observed ${pathReads}`);
  assert.equal(rows.successes.length, count);
  assert.equal(rows.successes.at(-1)?.size, count - 1);
});

test('CSV keeps quoting, Unicode and formula protection for result data', () => {
  const result = report({
    success_files: ['=SUM(1,2).txt'], output_paths: ['/out/=SUM(1,2).txt'],
    failed_files: [['한글,"보고서".txt', '+formula\nnext line']]
  });
  const csv = formatReportCsv(buildReportRows(result, []), translate);
  assert.ok(csv.startsWith('\uFEFF"status","sortName","extension","size","fullPath","error"\n'));
  assert.ok(csv.includes('"\'=SUM(1,2).txt"'));
  assert.ok(csv.includes('"한글,""보고서"".txt"'));
  assert.ok(csv.includes('"\'+formula\nnext line"'));
});

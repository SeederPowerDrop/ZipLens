import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveStem, archiveRoots, csvCell } from '../src/archive-model.ts';
import { escapeHTML } from '../src/utils.ts';

test('compound and split archive extensions do not leak into smart extraction folder names', () => {
  for (const name of ['photos.tar.gz', 'photos.tar.zst', 'photos.7z.001', 'photos.zip.001', 'photos.zip']) assert.equal(archiveStem(name), 'photos');
});
test('TAR ./ root and Windows separators yield actual root conflict names', () => {
  assert.deepEqual(archiveRoots(['./docs/a.txt', './docs/b.txt', 'images\\photo.jpg']), ['docs', 'images']);
});
test('archive filenames and error text cannot inject HTML attributes or elements', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('exported CSV quotes filenames and neutralizes formulas', () => {
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell(' normal, "name" '), '" normal, ""name"" "');
});

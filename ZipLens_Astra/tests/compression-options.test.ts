import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real controller functions without initializing Tauri or native dialogs.
const source = ts.createSourceFile('main.ts', readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declarations = ['readCompressionOptions', 'updateCompressionPasswordHint'].map(name => {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} must exist in the app controller`);
  return declaration.getText(source);
});
const script = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const elements = {
    formatSelect: { value: 'zip' }, enablePasswordCb: { checked: true },
    compressPasswordInput: { value: '' }, splitSelect: { value: '0' }
  };
  const hint = { hidden: false };
  const context = vm.createContext({
    elements,
    document: { getElementById: (id: string) => id === 'zip-password-hint' ? hint :
      { value: id === 'compression-level' ? '6' : 'AES-256' } },
    getTranslation: (key: string) => key === 'zipPasswordHint' ? '다른 언어의 비밀번호는 7Z를 선택하세요.' : key
  });
  const controller = vm.runInContext(`${script}\n({ readCompressionOptions, updateCompressionPasswordHint });`, context);
  return { elements, hint, ...controller };
}

test('ZIP creation rejects unsupported passwords with localized guidance while 7Z preserves Unicode', () => {
  const { elements, readCompressionOptions } = fixture();
  for (const password of ['암호', '日本語', 'العربية', 'café', 'пароль', 'line\nbreak', 'tab\tkey']) {
    elements.compressPasswordInput.value = password;
    elements.formatSelect.value = 'zip';
    assert.throws(readCompressionOptions, /다른 언어의 비밀번호는 7Z를 선택하세요\./);
    elements.formatSelect.value = '7z';
    assert.equal(readCompressionOptions().password, password, '7Z passwords must not be normalized or rewritten');
  }
  elements.formatSelect.value = 'zip';
  for (const password of ['A z 0-9!@#$%^&*()', '~', '\x7f']) {
    elements.compressPasswordInput.value = password;
    assert.equal(readCompressionOptions().password, password);
  }
  elements.enablePasswordCb.checked = false;
  elements.compressPasswordInput.value = 'unused 한글';
  assert.equal(readCompressionOptions().password, null);
});

test('ZIP password guidance follows format and encryption choices without changing the entered password', () => {
  const { elements, hint, updateCompressionPasswordHint } = fixture();
  elements.compressPasswordInput.value = 'my unchanged password';
  for (const [format, enabled, visible] of [
    ['zip', true, true], ['7z', true, false], ['tar', true, false],
    ['zip', false, false], ['zip', true, true]
  ] as const) {
    elements.formatSelect.value = format;
    elements.enablePasswordCb.checked = enabled;
    updateCompressionPasswordHint();
    assert.equal(hint.hidden, !visible);
    assert.equal(elements.compressPasswordInput.value, 'my unchanged password');
  }
});

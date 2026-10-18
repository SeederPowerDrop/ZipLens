import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const appConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const appInfoUrl = moduleUrl(compile('../src/app-info.ts').replace(
  'import appConfig from "../src-tauri/tauri.conf.json";', `const appConfig = ${JSON.stringify(appConfig)};`
));
const { APP_DISPLAY_NAME } = await import(appInfoUrl);
const aboutUrl = moduleUrl(compile('../src/about.ts'));
const { supportedLanguages, translations, resolveLanguage, setLanguage, getCurrentLang, getTranslation } =
  await import(moduleUrl(compile('../src/i18n.ts')
    .replace('from "./app-info"', `from "${appInfoUrl}"`)
    .replace('from "./about"', `from "${aboutUrl}"`)));

const expectedLanguages = [
  { code: 'ko', label: '한국어' }, { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }, { code: 'zh', label: '中文（简体）' },
  { code: 'vi', label: 'Tiếng Việt' }, { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' }, { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' }, { code: 'ar', label: 'العربية' }
];

test('the language menu and dictionaries expose exactly the ten requested languages in order', () => {
  assert.deepEqual(supportedLanguages, expectedLanguages);
  assert.deepEqual(Object.keys(translations), expectedLanguages.map(language => language.code));
});

test('every language uses the bundled app name and version for its title', () => {
  assert.equal(APP_DISPLAY_NAME, `${appConfig.productName} ${appConfig.version}`);
  for (const { code } of expectedLanguages) {
    assert.equal(translations[code].titlebar, APP_DISPLAY_NAME, code);
  }
});

test('every language supplies every message, interpolation token and allowed HTML tag', () => {
  const keys = Object.keys(translations.en).sort();
  const placeholders = (text: string) => [...text.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort();
  const tags = (text: string) => text.match(/<[^>]*>/g) ?? [];
  for (const { code } of expectedLanguages) {
    assert.deepEqual(Object.keys(translations[code]).sort(), keys, code);
    for (const key of keys) {
      const text = translations[code][key];
      assert.equal(typeof text, 'string', `${code}.${key}`);
      assert.ok(text.trim().length > 0, `${code}.${key} must not rely on fallback text`);
      assert.deepEqual(placeholders(text), placeholders(translations.en[key]), `${code}.${key} placeholders`);
      assert.deepEqual(tags(text), tags(translations.en[key]), `${code}.${key} HTML`);
      if (code !== 'ko') assert.doesNotMatch(text, /[가-힣]/, `${code}.${key} contains untranslated Korean`);
    }
  }
});

test('a valid saved language wins, while invalid saved values fall through to browser preferences', () => {
  for (const { code } of expectedLanguages) {
    assert.equal(resolveLanguage(code, ['ko-KR', 'en-US']), code);
    assert.equal(resolveLanguage(code, []), code);
  }
  for (const invalid of [null, '', 'it', 'constructor', '__proto__', 'toString', 'DE', 'de-DE', ' ko ']) {
    assert.equal(resolveLanguage(invalid, ['vi-VN', 'en-US']), 'vi', String(invalid));
  }
});

test('browser locale matching respects preference order, regional tags, case and underscores', () => {
  const examples = [
    ['KO_kr', 'ko'], ['EN-us', 'en'], ['ja-JP', 'ja'], ['zh-Hans-CN', 'zh'],
    ['vi_VN', 'vi'], ['es-MX', 'es'], ['fr-CA', 'fr'], ['de-AT', 'de'],
    ['ru_RU', 'ru'], ['ar-EG', 'ar'], ['  DE-ch  ', 'de']
  ];
  for (const [locale, expected] of examples) {
    assert.equal(resolveLanguage(null, ['it-IT', locale, 'en-US']), expected, locale);
  }
  assert.equal(resolveLanguage('unsupported', ['ru-RU', 'vi-VN']), 'ru');
  assert.equal(resolveLanguage(null, ['en-GB', 'ko-KR']), 'en');
});

test('unsupported or missing preferences fall back to English without accepting partial matches', () => {
  for (const preferred of [[], [''], ['it-IT', 'pt-BR'], ['korean', 'english'], ['__proto__', 'constructor']]) {
    assert.equal(resolveLanguage(null, preferred), 'en');
  }
});

class Element {
  tagName: string;
  children: Element[] = [];
  attributes = new Map<string, string>();
  nodeType = 1;
  lang = '';
  dir = '';
  type = 'password';
  value = '';
  loaded = false;
  options: { value: string; text: string }[] = [];
  classList = { contains: (name: string) => name === 'loaded' && this.loaded };
  private text = '';
  constructor(tagName = 'span') { this.tagName = tagName; }
  get childNodes() { return this.children; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children = []; }
  appendChild(child: Element) { this.children.push(child); return child; }
  removeChild(child: Element) { this.children = this.children.filter(candidate => candidate !== child); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  querySelector(selector: string): Element | null {
    if (selector === ':scope > span') return this.children.find(child => child.tagName === 'span') ?? null;
    if (selector === 'svg') {
      for (const child of this.children) {
        if (child.tagName === 'svg') return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
    }
    return null;
  }
}

function fixture() {
  const textControls = {
    'btn-open-archive': 'openArchive', 'btn-extract': 'btnExtract', 'btn-smart-extract': 'btnSmartExtract',
    'btn-compress': 'btnCompressFolder', 'btn-cancel-compress': 'cancel',
    'btn-confirm-compress': 'confirmCompress', 'btn-cancel-operation': 'cancelOperation',
    'compression-level-label': 'compressionLevel', 'compression-source-label': 'compressionSource',
    'zip-password-hint': 'zipPasswordHint',
    'split-option-none': 'noSplit', 'select-all': 'selectAll', 'deselect-all': 'deselectAll',
    'toggle-all': 'invertSelection'
  };
  const otherIds = ['drop-zone', 'lang-select', 'format-select', 'compression-level', 'compression-source',
    'encrypt-level', 'split-select', 'preview-search', 'breadcrumb-container', 'viewer-close',
    'compress-password', 'compress-pwd-toggle', 'unlock-password', 'unlock-pwd-toggle', 'about-app-name'];
  const nodes = new Map([...Object.keys(textControls), ...otherIds].map(id => [id, new Element()]));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of nodes.keys()) assert.ok(html.includes(`id="${id}"`), `${id} exists in actual app markup`);
  const button = nodes.get('btn-smart-extract')!;
  const wrapper = button.appendChild(new Element('div'));
  const svg = wrapper.appendChild(new Element('svg'));
  const buttonLabel = button.appendChild(new Element('span'));
  const sortLabels = new Map(['name', 'size', 'compressed', 'ext'].map(column => [column, new Element()]));
  assert.equal((html.match(/class="sort-label"/g) ?? []).length, 4);
  const dropText = new Element();
  dropText.textContent = '한글 이름 — résumé.zip';
  nodes.get('drop-zone')!.loaded = true;
  nodes.get('compression-level')!.options = ['1', '6', '9'].map(value => ({ value, text: '' }));
  nodes.get('compression-level')!.value = '9';
  nodes.get('compression-source')!.options = ['folder', 'files'].map(value => ({ value, text: '' }));
  nodes.get('compression-source')!.value = 'files';
  nodes.get('encrypt-level')!.options = ['AES-256', 'ZipCrypto'].map(value => ({ value, text: '' }));
  nodes.get('encrypt-level')!.value = 'ZipCrypto';
  nodes.get('compress-password')!.type = 'text';
  nodes.get('compress-password')!.value = 'keep-secret';
  const progress = new Element();
  const root = new Element();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousNode = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: { TEXT_NODE: 3 } });
  const document = {
    title: '',
    documentElement: root,
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: (tag: string) => new Element(tag),
    querySelector: (selector: string) => selector === '.progress-bar' ? progress :
      sortLabels.get(selector.match(/data-sort="([^"]+)"/)?.[1] ?? '') ?? null,
    querySelectorAll: (selector: string) => selector === '.drop-text' ? [dropText] : []
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  return {
    nodes, root, textControls, svg, button, buttonLabel, sortLabels, dropText, progress, document,
    restore() {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (previousNode) Object.defineProperty(globalThis, 'Node', previousNode);
      else Reflect.deleteProperty(globalThis, 'Node');
    }
  };
}

test('switching all ten languages localizes controls and RTL without losing loaded files or user choices', () => {
  const ui = fixture();
  try {
    for (const { code } of [...expectedLanguages, expectedLanguages[1]]) {
      setLanguage(code);
      assert.equal(getCurrentLang(), code);
      assert.equal(ui.root.lang, code);
      assert.equal(ui.root.dir, code === 'ar' ? 'rtl' : 'ltr');
      assert.equal(ui.document.title, APP_DISPLAY_NAME);
      assert.equal(ui.nodes.get('about-app-name')!.textContent, APP_DISPLAY_NAME);
      for (const [id, key] of Object.entries(ui.textControls)) {
        assert.equal(ui.nodes.get(id)!.textContent, translations[code][key], `${code}.${id}`);
      }
      for (const [id, key] of Object.entries({
        'lang-select': 'language', 'format-select': 'archiveFormat', 'compression-level': 'compressionLevel',
        'compression-source': 'compressionSource', 'breadcrumb-container': 'folderPath',
        'viewer-close': 'close', 'preview-search': 'searchPlaceholder',
        'compress-pwd-toggle': 'hidePassword', 'unlock-pwd-toggle': 'showPassword'
      })) assert.equal(ui.nodes.get(id)!.attributes.get('aria-label'), translations[code][key], `${code}.${id}`);
      assert.equal(ui.progress.attributes.get('aria-label'), translations[code].progress);
      assert.equal(ui.nodes.get('preview-search')!.attributes.get('placeholder'), translations[code].searchPlaceholder);
      for (const [column, key] of Object.entries({ name: 'sortName', size: 'extractedSize', compressed: 'compressedSize', ext: 'extension' })) {
        assert.equal(ui.sortLabels.get(column)!.textContent, translations[code][key]);
      }
      assert.deepEqual(ui.nodes.get('compression-level')!.options.map(option => option.text),
        ['compressionFast', 'compressionBalanced', 'compressionMaximum'].map(key => translations[code][key]));
      assert.deepEqual(ui.nodes.get('compression-source')!.options.map(option => option.text),
        ['sourceFolder', 'sourceFiles'].map(key => translations[code][key]));
      assert.equal(ui.nodes.get('compression-level')!.value, '9');
      assert.equal(ui.nodes.get('compression-source')!.value, 'files');
      assert.equal(ui.nodes.get('encrypt-level')!.value, 'ZipCrypto');
      assert.equal(ui.nodes.get('compress-password')!.value, 'keep-secret');
      assert.equal(ui.nodes.get('compress-pwd-toggle')!.attributes.get('aria-pressed'), 'true');
      assert.equal(ui.nodes.get('unlock-pwd-toggle')!.attributes.get('aria-pressed'), 'false');
      assert.equal(ui.button.querySelector('svg'), ui.svg);
      assert.equal(ui.button.querySelector(':scope > span'), ui.buttonLabel);
      assert.equal(ui.button.children.length, 2);
      assert.equal(ui.dropText.textContent, '한글 이름 — résumé.zip');
      assert.equal(getTranslation('compressionComplete'), translations[code].compressionComplete);
    }
    setLanguage('constructor');
    assert.equal(getCurrentLang(), 'en', 'invalid runtime values cannot select inherited object properties');
  } finally { ui.restore(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const aboutUrl = moduleUrl(compile('../src/about.ts'));
// Exercise the real app-language entry point, including its About update hook.
const { setLanguage, getCurrentLang } = await import(moduleUrl(
  compile('../src/i18n.ts').replace('from "./about"', `from "${aboutUrl}"`)
));

class Element {
  children: Element[] = [];
  attributes = new Map<string, string>();
  lang = '';
  dir = '';
  title = '';
  className = '';
  private text = '';
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children = []; }
  appendChild(child: Element) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; this.text = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

function fixture() {
  const ids = ['about-modal', 'about-introduction', 'about-title', 'about-version-label', 'btn-about',
    'about-close', 'about-close-x', 'about-support-label', 'about-licenses', 'about-licenses-hint',
    'about-dedication-prefix'];
  const nodes = new Map(ids.map(id => [id, new Element()]));
  const root = new Element();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    documentElement: root,
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: () => new Element(),
    querySelector: () => null,
    querySelectorAll: () => []
  }});
  return {
    get: (id: string) => nodes.get(id)!, root,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  };
}

test('the app language selects one About introduction and localizes its controls in all seven languages', () => {
  const ui = fixture();
  try {
    const cases = [
      ['ko', 'ZipLens 2.0 정보', '안녕하세요', '확인', '버전'],
      ['en', 'About ZipLens 2.0', 'Hello', 'OK', 'Version'],
      ['ja', 'ZipLens 2.0 について', 'こんにちは', '確認', 'バージョン'],
      ['zh', '关于 ZipLens 2.0', '大家好', '确定', '版本'],
      ['fr', 'À propos de ZipLens 2.0', 'Bonjour', 'OK', 'Version'],
      ['es', 'Acerca de ZipLens 2.0', 'Hola', 'Aceptar', 'Versión'],
      ['ar', 'حول ZipLens 2.0', 'مرحبًا', 'موافق', 'الإصدار']
    ];
    for (const [lang, title, greeting, close, version] of cases) {
      setLanguage(lang);
      assert.equal(getCurrentLang(), lang);
      assert.equal(ui.get('about-title').textContent, title);
      assert.equal(ui.get('btn-about').title, title);
      assert.equal(ui.get('btn-about').attributes.get('aria-label'), title);
      assert.equal(ui.get('about-close').textContent, close);
      assert.equal(ui.get('about-close-x').attributes.get('aria-label'), close);
      assert.equal(ui.get('about-version-label').textContent, version);
      const introduction = ui.get('about-introduction');
      assert.equal(introduction.children.length, 5, `${lang}: no duplicated Korean original`);
      assert.ok(introduction.children[0].textContent.startsWith(greeting));
      assert.equal(ui.get('about-modal').lang, lang);
      assert.equal(ui.get('about-modal').dir, lang === 'ar' ? 'rtl' : 'ltr');
      for (const id of ['about-support-label', 'about-licenses', 'about-licenses-hint', 'about-dedication-prefix']) {
        assert.ok(ui.get(id).textContent.length > 0);
        if (lang !== 'ko') assert.doesNotMatch(ui.get(id).textContent, /[가-힣]/);
      }
      if (lang !== 'ko') assert.doesNotMatch(introduction.textContent, /[가-힣]/);
    }
  } finally { ui.restore(); }
});

test('repeated language changes replace content, reset RTL and preserve the support link', () => {
  const ui = fixture();
  const support = ui.get('about-support-label');
  support.setAttribute('href', 'https://buymeacoffee.com/master_chief');
  try {
    for (const lang of ['en', 'ar', 'ko', 'ar', 'en']) {
      setLanguage(lang);
      assert.equal(ui.get('about-introduction').children.length, 5);
      assert.equal(ui.get('about-modal').dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(support.attributes.get('href'), 'https://buymeacoffee.com/master_chief');
      assert.equal(support.children.length, 1);
      assert.equal(support.children[0].dir, 'ltr');
      assert.equal(support.children[0].textContent, '(Buy Me A Coffee)');
    }
    assert.equal(ui.get('about-dedication-prefix').textContent, 'And');
  } finally { ui.restore(); }
});

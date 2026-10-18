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
const guideNavigationUrl = moduleUrl(compile('../src/guide-navigation.ts'));
const aboutUrl = moduleUrl(compile('../src/about.ts').replace('from "./guide-navigation"', `from "${guideNavigationUrl}"`));
const { copyBitcoinAddress, getAboutLicenseError } = await import(aboutUrl);
const { updateUserGuide } = await import(moduleUrl(compile('../src/user-guide.ts')));
// Exercise the real app-language entry point, including its About update hook.
const { setLanguage, getCurrentLang, translations } = await import(moduleUrl(
  compile('../src/i18n.ts')
    .replace('from "./app-info"', `from "${appInfoUrl}"`)
    .replace('from "./about"', `from "${aboutUrl}"`)
));

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bitcoinAddress = 'BC1QUEUAX3FJP77NZUKF732AEWVFE0YVS9ZPKUMLTV';
const supportDestinations = [
  ['about-support-label', 'https://buymeacoffee.com/master_chief', 'Buy Me a Coffee'],
  ['about-kofi-link', 'https://ko-fi.com/seederpower', 'Ko-fi']
];
const languageCases = [
  ['ko', 'ZipLens 정보', '안녕하세요', '확인', '사용 가이드', '후원하기', '주소 복사'],
  ['en', 'About ZipLens', 'Hello', 'OK', 'User guide', 'Support the project', 'Copy address'],
  ['ja', 'ZipLensについて', 'こんにちは', '確認', '使い方ガイド', '開発を支援する', 'アドレスをコピー'],
  ['zh', '关于 ZipLens', '大家好', '确定', '使用指南', '支持开发', '复制地址'],
  ['vi', 'Giới thiệu về ZipLens', 'Xin chào', 'Đóng', 'Hướng dẫn sử dụng', 'Ủng hộ dự án', 'Sao chép địa chỉ'],
  ['es', 'Acerca de ZipLens', 'Hola', 'Aceptar', 'Guía de uso', 'Apoyar el proyecto', 'Copiar dirección'],
  ['fr', 'À propos de ZipLens', 'Bonjour', 'OK', 'Guide d’utilisation', 'Soutenir le projet', 'Copier l’adresse'],
  ['de', 'Über ZipLens', 'Hallo', 'OK', 'Benutzerhandbuch', 'Projekt unterstützen', 'Adresse kopieren'],
  ['ru', 'О ZipLens', 'Здравствуйте', 'ОК', 'Руководство пользователя', 'Поддержать проект', 'Скопировать адрес'],
  ['ar', 'حول ZipLens', 'مرحبًا', 'موافق', 'دليل الاستخدام', 'دعم المشروع', 'نسخ العنوان']
];
const guideCases = [
  ['ko', 'ZipLens 사용 방법', '닫기'], ['en', 'How to use ZipLens', 'Close'],
  ['ja', 'ZipLensの使い方', '閉じる'], ['zh', 'ZipLens 使用方法', '关闭'],
  ['vi', 'Cách sử dụng ZipLens', 'Đóng'], ['es', 'Cómo usar ZipLens', 'Cerrar'],
  ['fr', 'Utiliser ZipLens', 'Fermer'], ['de', 'ZipLens verwenden', 'Schließen'],
  ['ru', 'Как пользоваться ZipLens', 'Закрыть'], ['ar', 'كيفية استخدام ZipLens', 'إغلاق']
];
const clipboardConfirmations = [
  ['ko', '주소를 복사했습니다.'], ['en', 'Address copied.'], ['ja', 'アドレスをコピーしました。'],
  ['zh', '地址已复制。'], ['vi', 'Đã sao chép địa chỉ.'], ['es', 'Dirección copiada.'],
  ['fr', 'Adresse copiée.'], ['de', 'Adresse kopiert.'], ['ru', 'Адрес скопирован.'], ['ar', 'تم نسخ العنوان.']
];
const manualCopyGuidance = [
  ['ko', '자동 복사가 되지 않았습니다. 선택된 주소를 직접 복사해 주세요.'],
  ['en', 'Automatic copying failed. Please copy the selected address manually.'],
  ['ja', '自動コピーできませんでした。選択されたアドレスを手動でコピーしてください。'],
  ['zh', '自动复制失败，请手动复制已选中的地址。'],
  ['vi', 'Không thể sao chép tự động. Vui lòng sao chép thủ công địa chỉ đã chọn.'],
  ['es', 'No se pudo copiar automáticamente. Copia la dirección seleccionada manualmente.'],
  ['fr', 'La copie automatique a échoué. Copiez manuellement l’adresse sélectionnée.'],
  ['de', 'Die Adresse konnte nicht automatisch kopiert werden. Bitte kopieren Sie die ausgewählte Adresse manuell.'],
  ['ru', 'Не удалось скопировать адрес автоматически. Скопируйте выделенный адрес вручную.'],
  ['ar', 'تعذر النسخ تلقائيًا. يرجى نسخ العنوان المحدد يدويًا.']
];

function openingTag(tag: string, id: string): string {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(match, `${id} must exist in the actual app HTML`);
  return match[0];
}

class Element {
  tagName: string;
  children: Element[] = [];
  attributes = new Map<string, string>();
  lang = '';
  dir = '';
  title = '';
  className = '';
  value = '';
  focused = false;
  selected = false;
  id = '';
  href = '';
  target = '';
  rel = '';
  private text = '';
  constructor(tagName = 'span') { this.tagName = tagName; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.text = value; this.children = []; }
  appendChild(child: Element) { this.children.push(child); return child; }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = [...children]; this.text = ''; }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'dir') this.dir = value;
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

function loadAttributes(element: Element, markup: string) {
  for (const [, name, value] of markup.matchAll(/\b([\w-]+)="([^"]*)"/g)) {
    element.setAttribute(name, value);
  }
}

function fixture(options: {
  clipboard?: { writeText(text: string): Promise<void> };
  execCopy?: () => boolean;
} = {}) {
  const ids = ['about-modal', 'about-introduction', 'about-title', 'about-app-name', 'about-user-guide', 'home-user-guide', 'btn-about',
    'about-close', 'about-close-x', 'about-support-label', 'about-licenses', 'about-licenses-hint',
    'about-dedication', 'about-dedication-prefix', 'about-support-title', 'about-support-message', 'about-kofi-link',
    'about-bitcoin-hint', 'about-bitcoin-address-label', 'about-bitcoin-address', 'about-bitcoin-qr',
    'about-bitcoin-copy', 'about-bitcoin-status', 'user-guide-dialog', 'user-guide-title',
    'user-guide-content', 'user-guide-close'];
  const nodes = new Map(ids.map(id => [id, new Element()]));
  // Seed immutable payment details from the shipped markup, not a parallel fixture value.
  for (const [id] of supportDestinations) {
    const anchor = nodes.get(id)!;
    const tag = openingTag('a', id);
    loadAttributes(anchor, tag);
    const body = html.slice(html.indexOf(tag) + tag.length).split('</a>')[0];
    const brand = body.match(/<bdi\b([^>]*)>([^<]+)<\/bdi>/);
    assert.ok(brand, `${id} must keep its brand isolated for RTL languages`);
    const child = new Element();
    loadAttributes(child, brand[1]);
    child.textContent = brand[2];
    anchor.appendChild(child);
  }
  const dedicationTag = openingTag('p', 'about-dedication');
  const dedicationBody = html.slice(html.indexOf(dedicationTag) + dedicationTag.length).split('</p>')[0];
  const dedicationMatch = dedicationBody.match(/<bdi\b([^>]*)>([^<]+)<\/bdi>/);
  assert.ok(dedicationMatch, 'the actual HTML must isolate the personal dedication');
  const dedication = new Element();
  loadAttributes(dedication, dedicationMatch[1]);
  dedication.textContent = dedicationMatch[2];
  nodes.get('about-dedication')!.appendChild(nodes.get('about-dedication-prefix')!);
  nodes.get('about-dedication')!.appendChild(dedication);
  const addressTag = openingTag('textarea', 'about-bitcoin-address');
  const address = nodes.get('about-bitcoin-address')!;
  loadAttributes(address, addressTag);
  address.value = html.slice(html.indexOf(addressTag) + addressTag.length).split('</textarea>')[0];
  loadAttributes(nodes.get('about-bitcoin-qr')!, openingTag('img', 'about-bitcoin-qr'));
  loadAttributes(nodes.get('about-user-guide')!, openingTag('a', 'about-user-guide'));
  loadAttributes(nodes.get('home-user-guide')!, openingTag('a', 'home-user-guide'));
  const root = new Element();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const commands: string[] = [];
  const document = {
    title: '',
    documentElement: root,
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: (tag: string) => new Element(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    execCommand(command: string) {
      commands.push(command);
      return options.execCopy?.() ?? false;
    }
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: options.clipboard } });
  return {
    get: (id: string) => nodes.get(id)!, root, commands, document,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
      if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  };
}

test('the app language selects one About introduction and localizes its controls in every supported language', () => {
  const ui = fixture();
  try {
    assert.deepEqual(languageCases.map(([lang]) => lang).sort(), Object.keys(translations).sort());
    assert.equal(APP_DISPLAY_NAME, `${appConfig.productName} ${appConfig.version}`);
    assert.doesNotMatch(html, /id="about-version-label"/);
    openingTag('strong', 'about-app-name');
    for (const [lang, title, greeting, close, guide, support, copy] of languageCases) {
      setLanguage(lang);
      assert.equal(getCurrentLang(), lang);
      assert.equal(ui.get('about-title').textContent, title);
      assert.equal(ui.get('btn-about').title, title);
      assert.equal(ui.get('btn-about').attributes.get('aria-label'), title);
      assert.equal(ui.get('about-close').textContent, close);
      assert.equal(ui.get('about-close-x').attributes.get('aria-label'), close);
      assert.equal(ui.get('about-app-name').textContent, APP_DISPLAY_NAME);
      assert.equal(ui.document.title, APP_DISPLAY_NAME);
      for (const id of ['about-user-guide', 'home-user-guide']) {
        assert.equal(ui.get(id).textContent, guide);
        assert.ok(ui.get(id).title.trim().length > 0);
        if (lang !== 'ko') assert.doesNotMatch(ui.get(id).title, /[가-힣]/);
        assert.equal(ui.get(id).attributes.get('href'), `https://github.com/SeederPowerDrop/ZipLens/blob/main/ZipLens_Astra/docs/guides/${lang}.md`);
        assert.equal(ui.get(id).attributes.get('target'), '_blank');
        assert.equal(ui.get(id).attributes.get('rel'), 'noopener noreferrer');
        assert.equal(ui.get(id).attributes.has('aria-haspopup'), false);
      }
      const introduction = ui.get('about-introduction');
      assert.equal(introduction.children.length, 6, `${lang}: one introduction including the new philosophy`);
      assert.ok(introduction.children[0].textContent.startsWith(greeting));
      for (const paragraph of introduction.children) assert.ok(paragraph.textContent.trim().length > 0);
      assert.equal(ui.get('about-modal').lang, lang);
      assert.equal(ui.get('about-modal').dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(ui.get('about-support-title').textContent, support);
      assert.equal(ui.get('about-bitcoin-copy').textContent, copy);
      assert.equal(ui.get('about-support-label').attributes.get('aria-label'), `${support} — Buy Me a Coffee`);
      assert.equal(ui.get('about-kofi-link').attributes.get('aria-label'), `${support} — Ko-fi`);
      const qrAlt = ui.get('about-bitcoin-qr').attributes.get('alt')!;
      assert.ok(qrAlt.length > 0);
      const licenseError = getAboutLicenseError(lang);
      assert.ok(licenseError.length > 0);
      if (lang !== 'ko') assert.doesNotMatch(licenseError, /[가-힣]/);
      if (lang !== 'ko') assert.doesNotMatch(qrAlt, /[가-힣]/);
      for (const id of ['about-support-message', 'about-bitcoin-hint', 'about-bitcoin-address-label',
        'about-licenses', 'about-licenses-hint', 'about-dedication-prefix']) {
        assert.ok(ui.get(id).textContent.length > 0);
        if (lang !== 'ko') assert.doesNotMatch(ui.get(id).textContent, /[가-힣]/);
      }
      if (lang !== 'ko') assert.doesNotMatch(introduction.textContent, /[가-힣]/);
    }
  } finally { ui.restore(); }
});

test('language changes preserve the actual HTML payment destinations, address and isolated brands', () => {
  const ui = fixture();
  const brands = supportDestinations.map(([id]) => ui.get(id).children[0]);
  const dedication = ui.get('about-dedication').children[1];
  try {
    assert.match(openingTag('textarea', 'about-bitcoin-address'), /\breadonly(?:\s|>)/);
    for (const lang of ['en', 'ar', ...languageCases.map(([lang]) => lang), 'ar', 'en']) {
      ui.get('about-bitcoin-status').textContent = 'stale feedback';
      setLanguage(lang);
      assert.equal(ui.get('about-introduction').children.length, 6);
      assert.equal(ui.get('about-modal').dir, lang === 'ar' ? 'rtl' : 'ltr');
      for (const [index, [id, href, label]] of supportDestinations.entries()) {
        const anchor = ui.get(id);
        assert.equal(anchor.attributes.get('href'), href);
        assert.equal(anchor.attributes.get('target'), '_blank');
        assert.equal(anchor.children.length, 1);
        assert.equal(anchor.children[0], brands[index], 'language changes must not rebuild payment controls');
        assert.equal(anchor.children[0].dir, 'ltr');
        assert.equal(anchor.children[0].textContent, label);
      }
      assert.equal(ui.get('about-bitcoin-address').value, bitcoinAddress);
      assert.equal(ui.get('about-bitcoin-address').dir, 'ltr');
      assert.equal(ui.get('about-bitcoin-qr').attributes.get('src'), '/bitcoin-support.svg');
      assert.equal(ui.get('about-bitcoin-status').textContent, '');
      assert.equal(ui.get('about-dedication').children[1], dedication);
      assert.equal(dedication.textContent, 'ERW FWS WRG');
      assert.equal(dedication.dir, 'ltr');
    }
    assert.equal(ui.get('about-dedication-prefix').textContent, 'And');
  } finally { ui.restore(); }
});

test('the user guide renders all ten languages and replaces previous content without changing its project link', () => {
  const ui = fixture();
  try {
    assert.deepEqual(guideCases.map(([lang]) => lang).sort(), Object.keys(translations).sort());
    openingTag('dialog', 'user-guide-dialog');
    openingTag('h2', 'user-guide-title');
    openingTag('div', 'user-guide-content');
    openingTag('button', 'user-guide-close');
    for (const [lang, title, close] of [...guideCases, guideCases[1]]) {
      const content = ui.get('user-guide-content');
      const previousSections = [...content.children];
      updateUserGuide(lang);
      assert.equal(ui.get('user-guide-dialog').lang, lang === 'zh' ? 'zh-Hans' : lang);
      assert.equal(ui.get('user-guide-dialog').dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(ui.get('user-guide-title').textContent, title);
      assert.equal(ui.get('user-guide-close').textContent, close);
      assert.equal(content.children.length, 5, `${lang}: exactly one complete guide`);
      for (const section of content.children) {
        assert.ok(!previousSections.includes(section), 'language changes must replace the previous guide');
        assert.equal(section.tagName, 'section');
        assert.equal(section.children[0].tagName, 'h3');
        assert.ok(section.children[0].textContent.trim().length > 0);
        assert.ok(section.children.length > 1);
        for (const paragraph of section.children.slice(1)) {
          assert.equal(paragraph.tagName, 'p');
          assert.ok(paragraph.textContent.trim().length > 0);
        }
      }
      if (lang !== 'ko') assert.doesNotMatch(content.textContent, /[가-힣]/);
      const projectLink = content.children.at(-1)!.children.at(-1)!.children[0];
      assert.equal(projectLink.id, 'user-guide-project-link');
      assert.equal(projectLink.tagName, 'a');
      assert.equal(projectLink.href, 'https://github.com/SeederPowerDrop/ZipLens');
      assert.equal(projectLink.target, '_blank');
      assert.equal(projectLink.rel, 'noopener noreferrer');
      assert.match(projectLink.textContent, /GitHub/);
    }
  } finally { ui.restore(); }
});

test('the bundled guide shows a launch-failure notice and clears it when refreshed normally', () => {
  const ui = fixture();
  try {
    const noticeText = '브라우저를 열지 못했습니다. 대신 앱에 포함된 사용 가이드를 보여드립니다.';
    updateUserGuide('ko', noticeText);
    const content = ui.get('user-guide-content');
    assert.equal(content.children.length, 6);
    assert.equal(content.children[0].id, 'user-guide-fallback-notice');
    assert.equal(content.children[0].attributes.get('role'), 'status');
    assert.equal(content.children[0].textContent, noticeText);
    assert.equal(content.children[1].tagName, 'section');
    updateUserGuide('en');
    assert.equal(content.children.length, 5);
    assert.ok(content.children.every(child => child.tagName === 'section'));
    assert.doesNotMatch(content.textContent, /[가-힣]/);
  } finally { ui.restore(); }
});

test('clipboard success copies only the exact receiving address and localizes confirmation', async () => {
  const written: string[] = [];
  const ui = fixture({ clipboard: { async writeText(text) { written.push(text); } } });
  try {
    assert.deepEqual(clipboardConfirmations.map(([lang]) => lang).sort(), Object.keys(translations).sort());
    for (const [lang, confirmation] of clipboardConfirmations) {
      setLanguage(lang);
      const count = written.length;
      const pending = copyBitcoinAddress(lang);
      assert.equal(written.length, count + 1, 'start writing before yielding away from the click gesture');
      await pending;
      assert.equal(written.at(-1), bitcoinAddress);
      assert.equal(ui.get('about-bitcoin-status').textContent, confirmation);
    }
    assert.equal(written.length, clipboardConfirmations.length);
    assert.deepEqual(ui.commands, [], 'successful async clipboard writes must not use the fallback');
    assert.equal(ui.get('about-bitcoin-address').selected, false);
  } finally { ui.restore(); }
});

test('missing or rejected clipboard access falls back to copying the selected raw address', async () => {
  for (const clipboard of [undefined, { async writeText() { throw new Error('NotAllowedError'); } }]) {
    const ui = fixture({ clipboard, execCopy() {
      const address = ui.get('about-bitcoin-address');
      assert.equal(address.focused, true);
      assert.equal(address.selected, true);
      assert.equal(address.value, bitcoinAddress);
      return true;
    } });
    try {
      for (const [lang, confirmation] of clipboardConfirmations) {
        setLanguage(lang);
        await copyBitcoinAddress(lang);
        assert.equal(ui.get('about-bitcoin-status').textContent, confirmation);
      }
      assert.deepEqual(ui.commands, clipboardConfirmations.map(() => 'copy'));
    } finally { ui.restore(); }
  }
});

test('failed copy attempts keep the address selected and replace stale success with manual-copy guidance', async () => {
  assert.deepEqual(manualCopyGuidance.map(([lang]) => lang).sort(), Object.keys(translations).sort());
  for (const execCopy of [() => false, () => { throw new Error('Copy is unavailable'); }]) {
    const ui = fixture({ clipboard: { async writeText() { throw new Error('NotAllowedError'); } }, execCopy });
    try {
      for (const [lang, guidance] of manualCopyGuidance) {
        setLanguage(lang);
        ui.get('about-bitcoin-status').textContent = 'Address copied.';
        await copyBitcoinAddress(lang);
        assert.equal(ui.get('about-bitcoin-status').textContent, guidance);
        assert.equal(ui.get('about-bitcoin-address').focused, true);
        assert.equal(ui.get('about-bitcoin-address').selected, true);
        assert.equal(ui.get('about-bitcoin-address').value, bitcoinAddress);
      }
      assert.deepEqual(ui.commands, manualCopyGuidance.map(() => 'copy'));
    } finally { ui.restore(); }
  }
});

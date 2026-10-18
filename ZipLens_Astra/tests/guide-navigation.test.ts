import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/guide-navigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const { createGuideOpener, getUserGuideUrl } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const languages = ['ko', 'en', 'ja', 'zh', 'vi', 'es', 'fr', 'de', 'ru', 'ar'];
const guideBase = 'https://github.com/SeederPowerDrop/ZipLens/blob/main/ZipLens_Astra/docs/guides/';

test('guide routes accept all ten fixed locales and send unsupported/path-like values to English', () => {
  for (const language of languages) assert.equal(getUserGuideUrl(language), `${guideBase}${language}.md`);
  for (const language of ['', 'it', 'de-DE', 'AR', '../ko', 'ko?x=1', 'ko#x', '__proto__', 'constructor', 'https://example.com']) {
    assert.equal(getUserGuideUrl(language), `${guideBase}en.md`, language);
  }
});

test('each help click reads the current language and opens only its GitHub guide', async () => {
  let language = 'ko';
  const urls: string[] = [];
  const busy: boolean[] = [];
  const open = createGuideOpener({
    getLanguage: () => language,
    openUrl: async (url: string) => { urls.push(url); },
    showOfflineGuide: () => assert.fail('a successful browser launch must not show the fallback'),
    setBusy: (value: boolean) => busy.push(value),
  });
  for (language of languages) assert.equal(await open(), 'browser');
  assert.deepEqual(urls, languages.map(code => `${guideBase}${code}.md`));
  assert.deepEqual(busy, languages.flatMap(() => [true, false]));
});

test('repeated clicks share one in-flight launch and a later click is allowed', async () => {
  let complete!: () => void;
  let launches = 0;
  const busy: boolean[] = [];
  const open = createGuideOpener({
    getLanguage: () => 'fr',
    openUrl: () => { launches++; return new Promise<void>(resolve => { complete = resolve; }); },
    showOfflineGuide: () => assert.fail('unexpected fallback'),
    setBusy: (value: boolean) => busy.push(value),
  });
  const first = open();
  assert.equal(await open(), 'busy');
  assert.equal(launches, 1);
  complete();
  assert.equal(await first, 'browser');
  const second = open();
  assert.equal(launches, 2);
  complete();
  assert.equal(await second, 'browser');
  assert.deepEqual(busy, [true, false, true, false]);
});

test('browser failure shows an explicit localized fallback for every locale', async () => {
  for (const language of [...languages, 'unsupported']) {
    const shown: { language: string, notice: string }[] = [];
    const busy: boolean[] = [];
    const open = createGuideOpener({
      getLanguage: () => language,
      openUrl: async () => { throw new Error('OS opener unavailable'); },
      showOfflineGuide: (locale: string, notice: string) => shown.push({ language: locale, notice }),
      setBusy: (value: boolean) => busy.push(value),
    });
    assert.equal(await open(), 'offline');
    assert.equal(shown.length, 1);
    assert.equal(shown[0].language, language === 'unsupported' ? 'en' : language);
    assert.ok(shown[0].notice.length > 20);
    if (language !== 'ko') assert.doesNotMatch(shown[0].notice, /[가-힣]/);
    assert.deepEqual(busy, [true, false]);
  }
});

test('a fallback dialog error releases the in-flight state so the user can retry', async () => {
  let fail = true;
  const busy: boolean[] = [];
  const open = createGuideOpener({
    getLanguage: () => 'ar',
    openUrl: async () => { if (fail) throw new Error('OS opener unavailable'); },
    showOfflineGuide: () => { throw new Error('dialog unavailable'); },
    setBusy: (value: boolean) => busy.push(value),
  });
  await assert.rejects(open(), /dialog unavailable/);
  fail = false;
  assert.equal(await open(), 'browser');
  assert.deepEqual(busy, [true, false, true, false]);
});

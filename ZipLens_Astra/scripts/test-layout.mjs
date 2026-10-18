/**
 * Real WebKit layout checks over the app's HTML, CSS and event handlers.
 * IPC is mocked: this tests rendering and UI flow, not Rust/native dialogs.
 * Start `npm run dev`, install Playwright + WebKit in your test environment,
 * then run this script. PLAYWRIGHT_MODULE may point to an existing installation.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.LAYOUT_OUTPUT ? resolve(process.env.LAYOUT_OUTPUT) : await mkdtemp(join(tmpdir(), 'ziplens-layout-'));
await mkdir(output, { recursive: true });
const browser = await webkit.launch({ headless: true });
const languages = (process.env.LAYOUT_LANGUAGES || 'ko,en,ja,zh,vi,es,fr,de,ru,ar').split(',');
const widths = (process.env.LAYOUT_WIDTHS || '800,480').split(',').map(Number);
const results = [];
const failures = [];
try {
  for (const width of widths) for (const lang of languages) {
    const page = await browser.newPage({ viewport: { width, height: 600 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => {
      const callbacks = new Map(); let id = 0;
      window.__layout = { calls: [], open: [], encrypted: false };
      const names = ['한글-日本語-中文-résumé-العربية-📦.txt', 'Deutsch_Русский_Tiếng Việt_ñ.txt'];
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(callback) { callbacks.set(++id, callback); return id; },
        unregisterCallback(key) { callbacks.delete(key); },
        async invoke(command, args = {}) {
          window.__layout.calls.push({ command, args });
          switch (command) {
            case 'take_startup_actions': return [];
            case 'set_menu_language': case 'open_license_folder': case 'cancel_operation': return;
            case 'plugin:event|listen': return args.handler;
            case 'plugin:event|unlisten': return;
            case 'plugin:window|inner_size': return { width: innerWidth, height: innerHeight };
            case 'plugin:window|current_monitor': return null;
            case 'plugin:dialog|open': return window.__layout.open.shift() ?? null;
            case 'plugin:dialog|message': return;
            case 'inspect_input_paths': return args.paths.map(path => ({ path, isDirectory: false }));
            case 'preview_archive':
              if (window.__layout.encrypted && args.password !== 'test-password') throw 'PASSWORD_REQUIRED';
              return names.map((path, i) => ({ path, size: i + 1, compressed_size: i + 1, is_dir: false, is_link: false, is_encrypted: false }));
            case 'check_conflicts': return args.rootItems.map(name => '/tmp/نتيجة/' + name);
            case 'extract_archive': {
              const selected = args.targetFiles ?? names;
              return { success_files: selected, failed_files: [], output_paths: selected.map(name => '/tmp/نتيجة/' + name), cancelled: false };
            }
            case 'plugin:path|dirname': return '/tmp';
            case 'plugin:path|join': return args.paths.join('/');
            default: throw new Error('Unmocked IPC: ' + command);
          }
        }
      };
    });
    const check = async (state, scope = '#app') => {
      const measurements = await page.locator(scope).evaluate(root => {
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const controls = [...root.querySelectorAll('button, select, input, textarea, a')].filter(visible);
        const issues = [];
        for (const el of controls) {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const name = el.id || el.textContent.trim().slice(0, 50);
          if (box.left < -2 || box.right > innerWidth + 2) issues.push({ name, problem: 'outside horizontal viewport', left: box.left, right: box.right });
          // Text inputs scroll by design; ellipsis is intentional only on file/path labels.
          if (el.matches('button, a') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 3 && style.textOverflow !== 'ellipsis') {
            issues.push({ name, problem: 'text overflows control', client: el.clientWidth, scroll: el.scrollWidth });
          }
          const container = el.closest('.modal, dialog');
          if (container && ['about-close', 'about-licenses', 'user-guide-close'].includes(el.id) && (box.top < 0 || box.bottom > innerHeight + 2)) {
            issues.push({ name, problem: 'dialog action outside viewport', top: box.top, bottom: box.bottom });
          }
        }
        const toolbar = [...root.querySelectorAll('.floating-toolbar button')].filter(visible);
        for (let i = 0; i < toolbar.length; i++) for (let j = i + 1; j < toolbar.length; j++) {
          const a = toolbar[i].getBoundingClientRect(), b = toolbar[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
            issues.push({ name: toolbar[i].id + '/' + toolbar[j].id, problem: 'toolbar overlap' });
          }
        }
        return { issues, controls: controls.length, lang: document.documentElement.lang, dir: document.documentElement.dir };
      });
      const record = { width, lang, state, ...measurements };
      results.push(record);
      if (measurements.issues.length) failures.push(record);
      if (['de', 'ru', 'ar'].includes(lang) && ['home', 'compression', 'about', 'guide', 'preview', 'report'].includes(state)) {
        await page.screenshot({ path: resolve(output, `${lang}-${width}-${state}.png`) });
      }
      assert.equal(measurements.lang, lang);
      assert.equal(measurements.dir, lang === 'ar' ? 'rtl' : 'ltr');
    };
    try {
      await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:1420/');
      await page.waitForFunction(() => !!document.getElementById('btn-about')?.onclick);
      await page.selectOption('#lang-select', lang);
      await check('home');
      await page.click('#btn-compress');
      await page.locator('#enable-password-cb').check();
      await check('compression');
      await page.click('#btn-cancel-compress');
      await page.click('#btn-about');
      await page.click('#about-bitcoin-toggle');
      await check('about', '#about-modal');
      assert.equal(await page.locator('#about-modal').getAttribute('lang'), lang);
      assert.equal(await page.locator('#about-bitcoin-address').inputValue(), 'BC1QUEUAX3FJP77NZUKF732AEWVFE0YVS9ZPKUMLTV');
      await page.click('#about-user-guide');
      await check('guide', '#user-guide-dialog');
      assert.equal(await page.locator('#user-guide-dialog').getAttribute('lang'), lang === 'zh' ? 'zh-Hans' : lang);
      await page.click('#user-guide-close');
      await page.click('#about-licenses');
      assert.ok(await page.evaluate(() => window.__layout.calls.some(call => call.command === 'open_license_folder')));
      await page.click('#about-close');
      await page.evaluate(() => { window.__layout.encrypted = true; window.__layout.open.push(['/tmp/العربية-日本語.zip']); });
      await page.click('#btn-open-archive');
      await page.locator('#password-modal').waitFor({ state: 'visible' });
      await check('password', '#password-modal');
      await page.fill('#unlock-password', 'test-password');
      await page.click('#password-submit');
      await page.waitForFunction(() => document.getElementById('drop-zone')?.classList.contains('loaded'));
      await page.waitForFunction(() => document.getElementById('app')?.dataset.actionBusy === 'false');
      const originalNames = ['한글-日本語-中文-résumé-العربية-📦.txt', 'Deutsch_Русский_Tiếng Việt_ñ.txt'];
      assert.deepEqual((await page.locator('.file-name bdi').allTextContents()).sort(), [...originalNames].sort());
      await check('preview');
      await page.locator('.file-checkbox').nth(1).uncheck();
      const selectedName = await page.locator('.file-name bdi').first().textContent();
      await page.evaluate(() => window.__layout.open.push('/tmp/نتيجة'));
      await page.click('#btn-extract');
      await page.locator('#conflict-modal').waitFor({ state: 'visible' });
      await check('conflict', '#conflict-modal');
      await page.click('#conflict-keep');
      await page.locator('#report-modal').waitFor({ state: 'visible' });
      const requestedNames = await page.evaluate(() => window.__layout.calls.find(call => call.command === 'extract_archive').args.targetFiles);
      assert.deepEqual(requestedNames, [selectedName]);
      await page.click('#report-view-details');
      await check('report', '#report-modal');
      await page.click('#report-close');
      assert.deepEqual(errors, []);
    } catch (error) {
      failures.push({ width, lang, error: String(error), pageErrors: errors });
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
await writeFile(resolve(output, 'results.json'), JSON.stringify({ engine: 'Playwright WebKit', ipc: 'mocked', results, failures }, null, 2) + '\n');
console.log(JSON.stringify({ states: results.length, failures: failures.length, output }));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }

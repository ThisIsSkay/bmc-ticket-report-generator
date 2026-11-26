// Browser check for the unified app (/app/) and the unchanged standalone pages.
//   npm run build:gh-pages && npm run stage:pages
//   NODE_PATH=<dir containing playwright> node scripts/verify-unified.mjs
// Serves dist/ itself, blocks every outside request, uses fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualFixtures } from './golden/groups/whatsapp-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const BASE = '/bmc-ticket-report-generator/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.xlsx': 'application/octet-stream' };
const req = createRequire(resolve(root, 'package.json'));
let playwright;
for (const base of [root, process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean)) { try { playwright = createRequire(resolve(base, 'x.js'))('playwright'); break; } catch { /* next */ } }
if (!playwright) throw new Error('Playwright not found; set NODE_PATH.');
void req;

const server = createServer((q, r) => {
  let url = decodeURIComponent((q.url || '/').split('?')[0]);
  if (!url.startsWith(BASE)) { r.writeHead(404); r.end(); return; }
  url = url.slice(BASE.length);
  if (url === '' || url.endsWith('/')) url += 'index.html';
  const file = resolve(dist, url);
  if (!(file.startsWith(dist + sep))) { r.writeHead(403); r.end(); return; }
  try { r.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); r.end(readFileSync(file)); } catch { r.writeHead(404); r.end(); }
}).listen(0, '127.0.0.1');
await new Promise((ok) => server.once('listening', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const site = origin + BASE;

const browser = await playwright.chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const checks = [];
const ok = (name) => { checks.push(name); };
try {
  // ---------- 1. WhatsApp section inside /app/ exports exactly the golden image ----------
  const fx = visualFixtures().hostile;
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1300 }, timezoneId: 'Asia/Singapore', locale: 'en-SG', acceptDownloads: true });
  const blocked = [];
  await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => { blocked.push(route.request().url()); return route.abort(); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00+08:00'));
  // Seed storage from the top page only (init scripts also run in frames, including the sandboxed email preview).
  await page.addInitScript((entries) => { if (window === window.top && !sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, {
    'bmc-report:config:v2': JSON.stringify({ teams: fx.teams, statuses: null, categories: null }),
    'bmc-report:column-mapping:v2': JSON.stringify(fx.mapping),
    'bmc-report:feedback:v1': JSON.stringify({ EUC: 2, System: 0, Network: 1 }),
    'bmc-report:theme:v1': 'light',
  });
  await page.goto(site + 'app/');
  const tabs = page.locator('.tool-tab');
  assert.deepEqual(await tabs.allInnerTexts(), ['WhatsApp Report', 'Email Reports', 'Customer Survey']);
  assert.equal(await page.locator('.tool-tab-active').innerText(), 'WhatsApp Report');
  assert.equal(await page.locator('.status-strip .theme-toggle').count(), 0, 'one theme toggle only (in the tool bar)');
  ok('tool bar: three sections, WhatsApp first, single theme toggle');

  await page.locator('input[type="file"]').setInputFiles({ name: fx.fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fx.bytes });
  await page.locator('.report-canvas').waitFor({ state: 'visible', timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const exportVia = async (label) => { const d = page.waitForEvent('download'); await page.getByRole('button', { name: label }).click(); const dl = await d; return readFileSync(await dl.path()); };
  const png = await exportVia(/Save as PNG/);
  const jpg = await exportVia(/Save as JPEG/);
  const goldenPng = readFileSync(resolve(root, 'docs/merge/golden/whatsapp/visual/hostile-light.export.png'));
  const goldenJpg = readFileSync(resolve(root, 'docs/merge/golden/whatsapp/visual/hostile-light.export.jpg'));
  assert.ok(png.equals(goldenPng), 'PNG exported inside /app/ must equal the standalone golden');
  assert.ok(jpg.equals(goldenJpg), 'JPEG exported inside /app/ must equal the standalone golden');
  ok('WhatsApp export inside /app/ is byte-identical to the standalone golden (PNG and JPEG)');

  // ---------- 2. Email section: themed frame, working tool, preview untouched ----------
  await page.locator('.tool-tab', { hasText: 'Email Reports' }).click();
  assert.match(page.url(), /#\/email$/);
  const emailFrameEl = page.locator('iframe[title="Email Reports"]');
  await emailFrameEl.waitFor({ state: 'visible' });
  const email = page.frameLocator('iframe[title="Email Reports"]');
  await email.locator('#demoBtn').waitFor();
  const emailFrame = page.frames().find((f) => f.url().includes('/daily-email/'));
  await emailFrame.waitForFunction(() => document.documentElement.classList.contains('bmc-embedded'));
  // First visit: the email page opens its settings window after 250 ms.
  await email.locator('#modal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await email.locator('#modalClose').isVisible()) await email.locator('#modalClose').click();
  const bg = () => emailFrame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await bg(), 'rgb(243, 241, 238)', 'email page uses the WhatsApp app light background');
  await email.locator('#demoBtn').click();
  await email.locator('#result').waitFor({ state: 'visible' });
  const preview = await emailFrame.evaluate(() => document.getElementById('emailFrame').srcdoc);
  assert.match(preview, /<html/i);
  assert.ok(!preview.includes('bmc-embedded'), 'theme never enters the email HTML');
  const htmlDl = page.waitForEvent('download');
  await email.locator('#downloadHtml').click();
  const htmlFile = readFileSync(await (await htmlDl).path(), 'utf8');
  assert.equal(htmlFile, preview, 'downloaded .html equals the preview HTML');
  ok('Email section: themed, demo report renders, .html download equals preview, no theme in email HTML');

  // ---------- 3. Survey section ----------
  await page.locator('.tool-tab', { hasText: 'Customer Survey' }).click();
  const survey = page.frameLocator('iframe[title="Customer Survey"]');
  await survey.locator('#ticketSample').waitFor();
  const surveyFrame = page.frames().find((f) => f.url().includes('/customer-survey/'));
  await surveyFrame.waitForFunction(() => document.documentElement.classList.contains('bmc-embedded'));
  await survey.locator('#ticketSample').click();
  await survey.locator('#directorySample').click();
  await survey.locator('#match').click();
  await survey.locator('#reviewRows tr').first().waitFor();
  const rows = await survey.locator('#reviewRows tr').count();
  assert.equal(rows, 4);
  assert.equal(await survey.locator('footer').isVisible(), false, 'footer links to separate pages are hidden inside /app/');
  ok('Survey section: themed, fictional samples match into 4 review rows');

  // ---------- 4. Switching keeps state; theme follows everywhere ----------
  await page.locator('.tool-tab', { hasText: 'WhatsApp Report' }).click();
  await page.locator('.tool-tab', { hasText: 'Customer Survey' }).click();
  assert.equal(await survey.locator('#reviewRows tr').count(), 4, 'survey review survives switching');
  await page.locator('.tool-tab', { hasText: 'Email Reports' }).click();
  await email.locator('#result').waitFor({ state: 'visible', timeout: 5000 }); // the section shows after the hash change
  assert.equal(await emailFrame.evaluate(() => document.getElementById('emailFrame').srcdoc.length > 0), true, 'email report survives switching');
  ok('switching sections keeps each section\'s state');

  await page.locator('.tool-bar .theme-toggle').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await emailFrame.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await surveyFrame.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await bg(), 'rgb(11, 17, 23)', 'email page uses the dark background');
  assert.equal(await emailFrame.evaluate(() => getComputedStyle(document.getElementById('emailFrame')).backgroundColor), 'rgb(255, 255, 255)', 'email preview stays white in dark theme');
  assert.equal(await page.evaluate(() => localStorage.getItem('bmc-report:theme:v1')), 'dark');
  ok('one toggle switches the shell, WhatsApp section and both frames to dark; email preview stays white');

  // ---------- 5. Reload, deep link and lazy loading ----------
  await page.goto(site + 'app/#/survey');
  await page.reload();
  assert.equal(await page.locator('.tool-tab-active').innerText(), 'Customer Survey');
  assert.equal(await page.locator('.app-shell').count(), 0, 'WhatsApp section is not loaded until opened');
  const survey2 = page.frames().find((f) => f.url().includes('/customer-survey/'));
  await survey2.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  ok('deep link #/survey opens that section, theme remembered, WhatsApp loaded on demand');

  // ---------- 6. Standalone pages are unchanged ----------
  for (const [path, color] of [['daily-email/', 'rgb(243, 245, 248)'], ['customer-survey/', 'rgb(243, 246, 250)']]) {
    const p = await ctx.newPage();
    await p.goto(site + path);
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains('bmc-embedded') || !!document.getElementById('bmc-unified-embed-theme')), false);
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), color);
    await p.close();
  }
  const rootPage = await ctx.newPage();
  await rootPage.goto(site);
  assert.equal(await rootPage.locator('.tool-bar').count(), 0, 'live WhatsApp page has no unified tool bar');
  assert.equal(await rootPage.locator('.status-strip .theme-toggle').count(), 1, 'live WhatsApp page keeps its own theme toggle');
  await rootPage.close();
  ok('standalone pages (/, /daily-email/, /customer-survey/) keep their original look');

  const blockedFromApp = blocked.filter((u) => !u.includes('fonts.g')); // the live root page loads Google Fonts (P0-1)
  assert.deepEqual(blockedFromApp, [], 'unified app makes no outside requests');
  assert.deepEqual(errors, []);
  ok('no outside requests from /app/ and no page errors');
  await ctx.close();

  // ---------- 7. Full or blocked browser storage must not blank the app (B-3) ----------
  for (const mode of ['full', 'blocked']) {
    const sctx = await browser.newContext();
    await sctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
    const sp = await sctx.newPage();
    const serrors = [];
    sp.on('pageerror', (e) => serrors.push(e.message));
    await sp.addInitScript((m) => { if (window !== window.top) return; const fail = () => { throw new DOMException('test ' + m, m === 'full' ? 'QuotaExceededError' : 'SecurityError'); }; Storage.prototype.setItem = fail; if (m === 'blocked') Storage.prototype.getItem = fail; }, mode);
    await sp.goto(site + 'app/');
    await sp.locator('.app-shell').waitFor({ timeout: 10000 });
    assert.equal(await sp.locator('.tool-bar').count(), 1);
    await sp.locator('.tool-tab', { hasText: 'Customer Survey' }).click();
    await sp.locator('iframe[title="Customer Survey"]').waitFor({ state: 'visible' });
    assert.deepEqual(serrors, [], `no page errors with storage ${mode}`);
    await sctx.close();
  }
  ok('full or blocked browser storage: tool bar, WhatsApp section and frames still work');
} finally {
  await browser.close();
  server.close();
}
console.log(`PASS: ${checks.length} unified-app checks\n- ` + checks.join('\n- '));

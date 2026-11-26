// RD-02 browser check: the outstanding/monthly dashboard shows a prominent
// warning when tickets were submitted after the age reference date, hides it
// otherwise, and the outstanding totals do not move with the date.
//   npm run build:gh-pages && npm run stage:pages
//   NODE_PATH=<dir containing playwright> node scripts/verify-future-dated.mjs
// Fictional data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const BASE = '/bmc-ticket-report-generator/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
let playwright;
for (const base of [root, process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean)) { try { playwright = createRequire(resolve(base, 'x.js'))('playwright'); break; } catch { /* next */ } }
if (!playwright) throw new Error('Playwright not found; set NODE_PATH.');

const CSV = `Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority
2026-10-20 09:00,,2026-11-12 09:00,INC900000101,Fictional older ticket,Assigned,Incident,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-05 10:00,,2026-11-12 10:00,INC900000102,Fictional newer ticket,Pending,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,Low
`;

const server = createServer((q, r) => {
  let url = decodeURIComponent((q.url || '/').split('?')[0]);
  if (!url.startsWith(BASE)) { r.writeHead(404); r.end(); return; }
  url = url.slice(BASE.length); if (url === '' || url.endsWith('/')) url += 'index.html';
  const file = resolve(dist, url);
  if (!file.startsWith(dist + sep)) { r.writeHead(403); r.end(); return; }
  try { r.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); r.end(readFileSync(file)); } catch { r.writeHead(404); r.end(); }
}).listen(0, '127.0.0.1');
await new Promise((ok) => server.once('listening', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch({ args: ['--no-sandbox'] });
let checks = 0;

// WCAG relative-luminance contrast of two CSS rgb() colours.
const contrast = (a, b) => {
  const lum = (c) => { const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

async function run(target, scheme) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Singapore', colorScheme: scheme });
  await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (target === 'app') await page.addInitScript((theme) => { if (window === window.top) localStorage.setItem('bmc-report:theme:v1', theme); }, scheme);
  await page.goto(origin + BASE + (target === 'app' ? 'app/#/email' : 'daily-email/'));
  const L = (s) => (target === 'app' ? page.frameLocator('iframe[title="Email Reports"]').locator(s) : page.locator(s));
  await L('#modal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await L('#modalClose').isVisible()) await L('#modalClose').click();
  await L('#fileInput').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await L('#result').waitFor({ state: 'visible' });
  const warning = L('#futureDatedWarning');
  const setDate = async (date) => { await L('#asAt').fill(date); await L('#asAt').dispatchEvent('change'); };

  for (const mode of ['monthly', 'pending']) {
    await L('#reportContent').selectOption(mode);
    await setDate('2026-10-31');
    assert.equal(await warning.isVisible(), true, `${target} ${scheme} ${mode}: warning visible`);
    assert.match(await warning.innerText(), /^Warning: 1 of 2 outstanding tickets was submitted after 2026-10-31/);
    assert.equal(await L('#outstandingTotal').innerText(), '2');
    const colours = await warning.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; });
    assert.ok(contrast(...colours) >= 4.5, `${target} ${scheme} ${mode}: warning text contrast ${contrast(...colours).toFixed(2)}`);
    // The email preview carries the same warning.
    const preview = await L('#emailFrame').getAttribute('srcdoc');
    assert.match(preview.replace(/&#8203;/g, ''), /Warning: 1 of 2 outstanding tickets was submitted after 2026-10-31/);
    await setDate('2026-11-12');
    assert.equal(await warning.isVisible(), false, `${target} ${scheme} ${mode}: no warning on a current date`);
    assert.equal(await L('#outstandingTotal').innerText(), '2', 'total does not move with the date');
    assert.doesNotMatch(await L('#emailFrame').getAttribute('srcdoc'), /Warning:/);
    checks += 6;
  }
  assert.deepEqual(errors, []);
  await ctx.close();
}

try {
  for (const target of ['standalone', 'app']) for (const scheme of ['light', 'dark']) await run(target, scheme);
} finally {
  await browser.close();
  server.close();
}
console.log(`PASS: ${checks} future-dated warning checks (standalone and /app/, light and dark)`);

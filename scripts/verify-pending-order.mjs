// Outstanding/monthly ticket order (owner, 2026-11-27): newest submitted first
// by default, oldest first on request, optional grouping by assigned group with
// a heading per group in the email; the choice is remembered after reload.
//   npm run build:gh-pages && npm run stage:pages
//   NODE_PATH=<dir containing playwright> node scripts/verify-pending-order.mjs
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
2026-10-01 09:00,,2026-11-20 09:00,SRV900000010,Fictional oldest EUC,Pending,Service Request,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,Medium
2026-11-15 09:00,,2026-11-20 09:00,INC900000020,Fictional newest EUC,Assigned,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-02 09:00,,2026-11-20 09:00,INC900000030,Fictional network,Pending,Incident,Sam Example,EXAMPLE_NETWORK,CN-EXAMPLE-A,Medium
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
const shot = process.env.SHOT_DIR;

async function run(target) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Singapore', viewport: { width: 1280, height: 900 } });
  await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const open = async () => {
    await page.goto(origin + BASE + (target === 'app' ? 'app/#/email' : 'daily-email/'));
    await L('#modal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await L('#modalClose').isVisible()) await L('#modalClose').click();
    await L('#fileInput').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await L('#result').waitFor({ state: 'visible' });
    await L('#reportContent').selectOption('pending');
  };
  const L = (s) => (target === 'app' ? page.frameLocator('iframe[title="Email Reports"]').locator(s) : page.locator(s));
  const tableIds = async () => (await L('#pendingTicketTable tbody tr td:first-child').allInnerTexts()).map((t) => t.trim());
  const preview = async () => (await L('#emailFrame').getAttribute('srcdoc')).replace(/&#8203;/g, '');
  await open();
  assert.equal(await L('#pendingOrder').inputValue(), 'newest');
  assert.equal(await L('#pendingGroupBy').isChecked(), false);
  assert.deepEqual(await tableIds(), ['INC900000020', 'INC900000030', 'SRV900000010'], `${target}: newest first by default`);
  let html = await preview();
  assert.ok(html.indexOf('INC900000020') < html.indexOf('SRV900000010'), 'email newest first');
  assert.doesNotMatch(html, / · \d tickets?<\/td>/);
  await L('#pendingOrder').selectOption('oldest');
  assert.deepEqual(await tableIds(), ['SRV900000010', 'INC900000030', 'INC900000020'], `${target}: oldest first`);
  await L('#pendingOrder').selectOption('newest');
  await L('#pendingGroupBy').check();
  assert.deepEqual(await tableIds(), ['INC900000020', 'SRV900000010', 'INC900000030'], `${target}: grouped, each group newest first`);
  html = await preview();
  assert.match(html, />EXAMPLE_EUC · 2 tickets<\/td>/);
  assert.match(html, />EXAMPLE_NETWORK · 1 ticket<\/td>/);
  if (shot && target === 'standalone') {
    const view = await ctx.newPage();
    await view.setViewportSize({ width: 820, height: 600 });
    await view.setContent(html);
    const top = await view.locator('text=EXAMPLE_EUC · 2 tickets').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await view.screenshot({ path: `${shot}/grouped-email.png`, fullPage: true, clip: { x: 0, y: Math.max(0, top - 80), width: 820, height: 330 } });
    await view.close();
  }
  await page.reload();
  await L('#modal').waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (await L('#modalClose').isVisible()) await L('#modalClose').click();
  await L('#fileInput').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await L('#result').waitFor({ state: 'visible' });
  await L('#reportContent').selectOption('pending');
  assert.equal(await L('#pendingGroupBy').isChecked(), true, `${target}: grouping remembered after reload`);
  assert.equal(await L('#pendingOrder').inputValue(), 'newest');
  checks += 9;
  assert.deepEqual(errors, []);
  await ctx.close();
}

try {
  await run('standalone');
  await run('app');
} finally {
  await browser.close();
  server.close();
}
console.log(`PASS: ${checks} ticket order checks (standalone and /app/)`);

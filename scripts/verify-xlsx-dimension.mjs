// RD-03 browser check: inside /app/, each section reads the whole populated
// worksheet of a workbook whose fourth sheet claims <dimension ref="A1"/>,
// next to three empty sheets, exactly as it reads the well-formed copy.
//   npm run build:gh-pages && npm run stage:pages
//   NODE_PATH=<dir containing playwright> node scripts/verify-xlsx-dimension.mjs
// Fictional data only (scripts/fixtures/dimension-a1.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dimensionFixtures, worksheetDimension, EXPECTED, POPULATED_SHEET, REPORT_DATE } from './fixtures/dimension-a1.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const BASE = '/bmc-ticket-report-generator/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const XLSX = createRequire(resolve(root, 'package.json'))('xlsx');
let playwright;
for (const base of [root, process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean)) { try { playwright = createRequire(resolve(base, 'x.js'))('playwright'); break; } catch { /* next */ } }
if (!playwright) throw new Error('Playwright not found; set NODE_PATH.');

const { wellFormed, malformed } = dimensionFixtures(XLSX);
assert.equal(worksheetDimension(XLSX, malformed), 'A1');
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

async function observe(bytes) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Singapore' });
  await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const file = { name: 'fictional-bmc-export.xlsx', mimeType: XLSX_TYPE, buffer: Buffer.from(bytes) };
  const seen = {};

  // WhatsApp section (the app's own upload and worksheet recommendation).
  await page.goto(origin + BASE + 'app/#/whatsapp');
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const rowsValue = page.locator('.status-group', { has: page.locator('.status-label', { hasText: 'Rows' }) }).locator('.status-value');
  await page.waitForFunction(() => [...document.querySelectorAll('.status-group')].some((g) => /Rows/.test(g.textContent) && /\d/.test(g.querySelector('.status-value')?.textContent || '')), null, { timeout: 15000 });
  seen.whatsappRows = await rowsValue.innerText();

  // Email section (xlsx-lite).
  await page.locator('.tool-tab', { hasText: 'Email Reports' }).click();
  const email = page.frameLocator('iframe[title="Email Reports"]');
  await email.locator('#modal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await email.locator('#modalClose').isVisible()) await email.locator('#modalClose').click();
  await email.locator('#fileInput').setInputFiles(file);
  await email.locator('#result').waitFor({ state: 'visible' });
  await email.locator('#dateInput').fill(REPORT_DATE);
  await email.locator('#dateInput').dispatchEvent('change');
  seen.emailSource = await email.locator('#sourceMeta').innerText();
  seen.emailCounts = { created: await email.locator('#createdCount').innerText(), closed: await email.locator('#closedCount').innerText(), pending: await email.locator('#pendingCount').innerText() };

  // Customer Survey section (vendored SheetJS).
  await page.locator('.tool-tab', { hasText: 'Customer Survey' }).click();
  const survey = page.frameLocator('iframe[title="Customer Survey"]');
  await survey.locator('#ticketSample').waitFor();
  // The frame loads on first visit; wait until app.mjs has run (it sets the
  // sample buttons' handlers after the file listeners) before choosing a file.
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe[title="Customer Survey"]');
    return Boolean(frame?.contentDocument?.getElementById('ticketSample')?.onclick);
  }, null, { timeout: 15000 });
  await survey.locator('#ticketFile').setInputFiles(file);
  await survey.locator('#ticketInfo').filter({ hasText: 'rows' }).waitFor();
  seen.surveySheet = await survey.locator('#ticketSheet').inputValue();
  seen.surveyInfo = await survey.locator('#ticketInfo').innerText();

  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
  return seen;
}

let bad, good;
try {
  bad = await observe(malformed);
  good = await observe(wellFormed);
} finally {
  await browser.close();
  server.close();
}
assert.equal(bad.whatsappRows, String(EXPECTED.dataRows), 'WhatsApp reads every row');
assert.equal(bad.emailSource, `${EXPECTED.dataRows} rows · worksheet: ${POPULATED_SHEET}`, 'Email picks the fourth sheet and reads every row');
assert.deepEqual(bad.emailCounts, Object.fromEntries(Object.entries(EXPECTED.email).map(([k, v]) => [k, String(v)])), 'Email totals');
assert.equal(bad.surveySheet, POPULATED_SHEET, 'Survey picks the fourth sheet');
assert.match(bad.surveyInfo, new RegExp(`· ${EXPECTED.dataRows} rows$`), 'Survey reads every row');
assert.deepEqual(bad, good, 'malformed and well-formed workbooks look the same in every section');
console.log('PASS: dimension A1 workbook read in full by WhatsApp, Email and Survey inside /app/');
console.log(JSON.stringify(bad));

// RD-01 browser acceptance: the customer-scope safeguard on every email export
// path, in every report mode, on the standalone page and inside /app/.
//   npm run build:gh-pages && npm run stage:pages
//   NODE_PATH=<dir containing playwright> node scripts/verify-export-scope.mjs
// Fictional data only (contracts CN-EXAMPLE-A, CN-EXAMPLE-B and blank).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const BASE = '/bmc-ticket-report-generator/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv' };
let playwright;
for (const base of [root, process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean)) { try { playwright = createRequire(resolve(base, 'x.js'))('playwright'); break; } catch { /* next */ } }
if (!playwright) throw new Error('Playwright not found; set NODE_PATH.');

const HEAD = 'Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority';
const MIXED = `${HEAD}
2026-11-10 08:00,,2026-11-10 08:00,INC900000001,Fictional ticket for contract A,Assigned,Incident,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-10 09:00,2026-11-10 10:00,2026-11-10 10:00,INC900000002,Fictional ticket for contract B,Resolved,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-B,Low
2026-11-10 09:30,,2026-11-10 09:30,SRV900000003,Fictional ticket without contract,Pending,Service Request,Sam Example,EXAMPLE_EUC,,Low
`;
const NO_CONTRACT_COLUMN = MIXED.split('\n').map((line) => line.split(',').filter((_, i) => i !== 9).join(',')).join('\n');

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

async function run(target) {
  const ctx = await browser.newContext({ acceptDownloads: true, timezoneId: 'Asia/Singapore', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let answer = 'dismiss';
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); return answer === 'accept' ? d.accept() : d.dismiss(); });
  await page.goto(origin + BASE + (target === 'app' ? 'app/#/email' : 'daily-email/'));
  const L = (s) => (target === 'app' ? page.frameLocator('iframe[title="Email Reports"]').locator(s) : page.locator(s));
  const F = () => (target === 'app' ? page.frames().find((f) => f.url().includes('/daily-email/')) : page.mainFrame());
  await L('#modal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await L('#modalClose').isVisible()) await L('#modalClose').click();
  const upload = async (csv) => { await L('#fileInput').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await L('#result').waitFor({ state: 'visible' }); };
  const setClipboard = () => F().evaluate(() => navigator.clipboard.writeText('SENTINEL'));
  const clipboard = () => F().evaluate(() => navigator.clipboard.readText());
  const deliver = async (kind) => {
    if (kind === 'eml') await L('#clientChoice').selectOption('new');
    if (kind === 'ps1') await L('#clientChoice').selectOption('classic');
    const sel = { copy: '#copyHtml', html: '#downloadHtml', eml: '#downloadEml', ps1: '#downloadClassic', xlsx: '#downloadWorkbook' }[kind];
    const before = dialogs.length;
    const dl = page.waitForEvent('download', { timeout: 1500 }).catch(() => null);
    await L(sel).click();
    const download = await dl;
    await page.waitForTimeout(200);
    return { download, dialog: dialogs.slice(before).join('\n'), text: download ? readFileSync(await download.path(), 'utf8') : '' };
  };
  const pickContracts = async (values) => {
    if (!(await F().evaluate(() => document.getElementById('contractFilter').open))) await L('#contractSelection').click();
    if (values === null) { if (!(await L('#allContracts').isChecked())) await L('#allContracts').check(); return; }
    if (await L('#allContracts').isChecked()) await L('#allContracts').uncheck();
    for (const input of await L('#contractChoices input').all()) { const v = await input.getAttribute('value'); if (values.includes(v) !== (await input.isChecked())) await input.click(); }
  };

  await upload(MIXED);
  // ---- Daily, All contracts: every delivery asks; Cancel produces nothing ----
  for (const kind of ['copy', 'html', 'eml', 'ps1']) {
    answer = 'dismiss'; await setClipboard();
    const r = await deliver(kind);
    assert.match(r.dialog, /Check the customer scope before exporting/, `${target} daily ${kind}: dialog`);
    assert.match(r.dialog, /All contracts \(2 in this export, plus 1 ticket with no contract\)/);
    assert.equal(r.download, null, `${target} daily ${kind}: cancelled export must not download`);
    assert.equal(await clipboard(), 'SENTINEL', `${target} daily ${kind}: cancelled export must not touch the clipboard`);
    answer = 'accept';
    const ok = await deliver(kind);
    if (kind === 'copy') assert.notEqual(await clipboard(), 'SENTINEL', `${target} daily copy: accepted export writes the clipboard`);
    else assert.ok(ok.download, `${target} daily ${kind}: accepted export downloads`);
    checks += 2;
  }
  // ---- A selected contract: no dialog, and only that contract's tickets ----
  await pickContracts(['CN-EXAMPLE-A']);
  assert.equal(await L('#previewScope').innerText(), 'Contract: CN-EXAMPLE-A');
  answer = 'dismiss';
  const onlyA = await deliver('html');
  assert.equal(onlyA.dialog, '', 'no dialog for an explicit contract');
  assert.ok(onlyA.text.includes('INC900000001') && !onlyA.text.includes('INC900000002') && !onlyA.text.includes('SRV900000003'), 'only contract A tickets are exported');
  checks += 1;
  // ---- Empty selection: blocked everywhere, no dialog ----
  await pickContracts([]);
  assert.match(await L('#previewScope').innerText(), /No contract selected/);
  assert.equal(await L('#contractWarning').isVisible(), true);
  for (const kind of ['copy', 'html', 'eml', 'ps1']) {
    await setClipboard();
    const r = await deliver(kind);
    assert.equal(r.download, null, `${target} empty ${kind}: blocked`);
    assert.equal(r.dialog, '', `${target} empty ${kind}: no dialog, just blocked`);
    assert.equal(await clipboard(), 'SENTINEL');
    checks += 1;
  }
  assert.match(await L('#toast').innerText(), /No contract is selected/);
  // ---- Outstanding and monthly: same rules, Excel included ----
  await pickContracts(null);
  for (const mode of ['pending', 'monthly']) {
    await L('#reportContent').selectOption(mode);
    await L('#asAt').fill('2026-11-10'); await L('#asAt').dispatchEvent('change');
    for (const kind of ['xlsx', 'ps1', 'html']) {
      answer = 'dismiss';
      const r = await deliver(kind);
      assert.match(r.dialog, /Check the customer scope/, `${target} ${mode} ${kind}: dialog`);
      assert.equal(r.download, null, `${target} ${mode} ${kind}: cancelled`);
      checks += 1;
    }
    answer = 'accept';
    assert.ok((await deliver('xlsx')).download, `${target} ${mode}: accepted Excel downloads`);
    checks += 1;
  }
  await L('#reportContent').selectOption('daily');
  // ---- No Contract column: still asks, and says why ----
  await upload(NO_CONTRACT_COLUMN);
  answer = 'dismiss';
  const noColumn = await deliver('html');
  assert.match(noColumn.dialog, /no Contract column/);
  assert.equal(noColumn.download, null);
  checks += 1;
  assert.deepEqual(errors, [], `${target}: no page errors`);
  await ctx.close();
}

try {
  await run('standalone');
  await run('app');
} finally {
  await browser.close();
  server.close();
}
console.log(`PASS: ${checks} export-scope checks (standalone /daily-email/ and /app/#/email)`);

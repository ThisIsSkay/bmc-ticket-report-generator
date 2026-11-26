// WhatsApp report visual goldens: the app's own "Save as PNG" export (compared
// pixel for pixel) and "Save as JPEG" export (dimensions plus a small pixel-diff
// threshold), captured in Playwright from a fresh production build.
//
// Pixels depend on the Chromium build and installed fonts. These goldens are
// valid for the environment recorded in docs/merge/BASELINE.md; re-record them
// (from the pre-merge commit) if that environment changes, never to hide a diff.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { repoRoot, stableJson } from '../lib/util.mjs';

const BASE = '/bmc-ticket-report-generator/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png' };
const JPEG_MAX_CHANGED_FRACTION = 0.001; // share of pixels allowed to differ by more than 16 levels
const JPEG_CHANNEL_TOLERANCE = 16;

function loadPlaywright() {
  for (const base of [repoRoot, process.env.NODE_PATH, '/opt/node22/lib/node_modules'].filter(Boolean)) {
    try { return createRequire(resolve(base, 'noop.js'))('playwright'); } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. Install it or put it on NODE_PATH to run the visual goldens.');
}

const STORAGE = (teams, mapping) => ({
  'bmc-report:config:v2': JSON.stringify({ teams, statuses: null, categories: null }),
  'bmc-report:column-mapping:v2': JSON.stringify(mapping),
  'bmc-report:feedback:v1': JSON.stringify({ EUC: 2, System: 0, Network: 1 }),
});

const CASES = [
  { name: 'sample-light', file: 'sample', now: '2026-09-08T10:00:00+08:00', theme: 'light' },
  { name: 'sample-dark', file: 'sample', now: '2026-09-08T10:00:00+08:00', theme: 'dark' },
  { name: 'sample-2026-09-09', file: 'sample', now: '2026-09-09T17:30:00+08:00', theme: 'light' },
  { name: 'hostile-light', file: 'hostile', now: '2026-11-10T10:00:00+08:00', theme: 'light' },
];

async function build() {
  const vite = await import(resolve(repoRoot, 'node_modules/vite/dist/node/index.js'));
  const outDir = mkdtempSync(join(tmpdir(), 'golden-dist-'));
  await vite.build({ root: repoRoot, configFile: resolve(repoRoot, 'vite.config.ts'), mode: 'github-pages', logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  return outDir;
}

function serve(dir) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (!url.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
    const rel = url.slice(BASE.length) || 'index.html';
    const file = resolve(dir, rel);
    if (!(file === dir || file.startsWith(dir + sep))) { res.writeHead(403); res.end(); return; }
    try { const body = readFileSync(file); res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

export async function generate({ fixtures }) {
  const { chromium } = loadPlaywright();
  const outDir = await build();
  const server = await serve(outDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  const files = new Map();
  const meta = { chromium: browser.version(), cases: {} };
  try {
    for (const c of CASES) {
      const fixture = fixtures[c.file];
      const context = await browser.newContext({ viewport: { width: 2000, height: 1300 }, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore', locale: 'en-SG', acceptDownloads: true, colorScheme: 'light' });
      const page = await context.newPage();
      // Outside requests (index.html loads Google Fonts for the app chrome) are
      // blocked so captures are deterministic offline. The report canvas uses Arial.
      const external = [];
      await context.route((url) => !url.href.startsWith(origin) && !url.href.startsWith('data:') && !url.href.startsWith('blob:'), (route) => { external.push(new URL(route.request().url()).host); return route.abort(); });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.clock.setFixedTime(new Date(c.now));
      const storage = { ...STORAGE(fixture.teams, fixture.mapping), 'bmc-report:theme:v1': c.theme };
      await page.addInitScript((entries) => { if (!sessionStorage.getItem('golden-seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); sessionStorage.setItem('golden-seeded', '1'); } }, storage);
      await page.goto(origin + BASE);
      await page.locator('input[type="file"]').setInputFiles({ name: fixture.fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fixture.bytes });
      const canvas = page.locator('.report-canvas');
      await canvas.waitFor({ state: 'visible', timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      // Use the app's own exports (html-to-image), i.e. exactly what users save and paste.
      const exportVia = async (label) => {
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: label }).click();
        const download = await downloadPromise;
        const bytes = readFileSync(await download.path());
        const type = label.source.includes('JPEG') ? 'image/jpeg' : 'image/png';
        const dims = await page.evaluate(async ({ b64, type }) => { const img = new Image(); img.src = `data:${type};base64,` + b64; await img.decode(); return { width: img.naturalWidth, height: img.naturalHeight }; }, { b64: bytes.toString('base64'), type });
        return { bytes, name: download.suggestedFilename(), dims };
      };
      const png = await exportVia(/Save as PNG/);
      const jpg = await exportVia(/Save as JPEG/);
      files.set(`whatsapp/visual/${c.name}.export.png`, png.bytes);
      files.set(`whatsapp/visual/${c.name}.export.jpg`, jpg.bytes);
      meta.cases[c.name] = { now: c.now, theme: c.theme, fixture: c.file, png: { fileName: png.name, dimensions: png.dims }, jpeg: { fileName: jpg.name, dimensions: jpg.dims }, blockedExternalHosts: [...new Set(external)].sort(), pageErrors: errors };
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(outDir, { recursive: true, force: true });
  }
  files.set('whatsapp/visual/meta.json', stableJson(meta));
  return files;
}

/** PNG: exact pixels. JPEG: same dimensions and at most 0.1% of pixels off by more than 16 levels. */
export async function compare(path, expected, actual) {
  if (path.endsWith('.json')) return null; // compared as text by the runner
  if (expected.equals(actual)) return null;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const type = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const result = await page.evaluate(async ({ a, b, type, tol }) => {
      const load = async (b64) => { const img = new Image(); img.src = `data:${type};base64,` + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data }; };
      const A = await load(a), B = await load(b);
      if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: `${A.w}x${A.h} vs ${B.w}x${B.h}` };
      let changed = 0, any = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
        if (d > 0) any++;
        if (d > tol) changed++;
      }
      return { pixels: A.w * A.h, any, changed };
    }, { a: expected.toString('base64'), b: actual.toString('base64'), type, tol: JPEG_CHANNEL_TOLERANCE });
    if (result.sizeMismatch) return `image size changed: ${result.sizeMismatch}`;
    if (path.endsWith('.png')) return result.any ? `${result.any} of ${result.pixels} pixels differ` : null;
    return result.changed / result.pixels > JPEG_MAX_CHANGED_FRACTION ? `${result.changed} of ${result.pixels} pixels differ by more than ${JPEG_CHANNEL_TOLERANCE} levels` : null;
  } finally {
    await browser.close();
  }
}

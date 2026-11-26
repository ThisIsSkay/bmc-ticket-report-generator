// Saved-settings goldens: every fixture in docs/merge/fixtures/storage/ is loaded
// through each tool's own load/normalise code, including legacy keys, key
// precedence, malformed JSON, unavailable storage and a full quota. Later phases
// must keep these results (or migrate with a documented, tested change).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot, stableJson } from '../lib/util.mjs';

const FIXTURES = resolve(repoRoot, 'docs/merge/fixtures/storage');
const fixture = (name) => readFileSync(resolve(FIXTURES, name), 'utf8');

/** Minimal Web Storage stand-in. mode: 'normal' | 'unavailable' (every call throws) | 'full' (writes throw). */
function fakeStorage(entries = {}, mode = 'normal') {
  const data = new Map(Object.entries(entries));
  const fail = (op) => { const e = new Error(`fake storage ${op} refused (${mode})`); e.name = mode === 'full' ? 'QuotaExceededError' : 'SecurityError'; throw e; };
  return {
    get length() { if (mode === 'unavailable') fail('length'); return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => { if (mode === 'unavailable') fail('getItem'); return data.has(k) ? data.get(k) : null; },
    setItem: (k, v) => { if (mode !== 'normal') fail('setItem'); data.set(k, String(v)); },
    removeItem: (k) => { if (mode === 'unavailable') fail('removeItem'); data.delete(k); },
    clear: () => data.clear(),
    dump: () => Object.fromEntries(data),
  };
}

const attempt = (fn) => { try { return { ok: true, value: fn() ?? null }; } catch (error) { return { ok: false, error: `${error.name}: ${error.message}` }; } };

export async function generate({ emailRoot }) {
  const files = new Map();
  const realStorage = globalThis.localStorage;

  // ---- WhatsApp report: src/lib/storage.ts --------------------------------
  const { createServer } = await import(pathToFileURL(resolve(repoRoot, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({ root: repoRoot, configFile: resolve(repoRoot, 'vite.config.ts'), logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const storage = await server.ssrLoadModule('/src/lib/storage.ts');
    const v2 = {
      'bmc-report:config:v2': fixture('bmc-report.config.v2.json'),
      'bmc-report:column-mapping:v2': fixture('bmc-report.column-mapping.v2.json'),
      'bmc-report:feedback:v1': fixture('bmc-report.feedback.v1.json'),
      'bmc-report:theme:v1': fixture('bmc-report.theme.v1.txt'),
    };
    const scenarios = {
      'empty': [{}],
      'current-v2-keys': [v2],
      'legacy-config-cancelled-under-closed': [{ 'bmc-report:config:v1': fixture('bmc-report.config.v1.legacy-cancelled-under-closed.json'), 'bmc-report:column-mapping:v2': v2['bmc-report:column-mapping:v2'] }],
      'legacy-config-placeholder-teams': [{ 'bmc-report:config:v1': fixture('bmc-report.config.v1.legacy-placeholder-teams.json'), 'bmc-report:column-mapping:v2': v2['bmc-report:column-mapping:v2'] }],
      'legacy-column-mapping-only': [{ 'bmc-report:config:v2': v2['bmc-report:config:v2'], 'bmc-report:column-mapping:v1': fixture('bmc-report.column-mapping.v1.legacy.json') }],
      'v2-and-v1-both-present': [{ ...v2, 'bmc-report:config:v1': fixture('bmc-report.config.v1.legacy-placeholder-teams.json'), 'bmc-report:column-mapping:v1': fixture('bmc-report.column-mapping.v1.legacy.json') }],
      'malformed-json-everywhere': [{ 'bmc-report:config:v2': '{not json', 'bmc-report:column-mapping:v2': '[1,', 'bmc-report:feedback:v1': 'undefined', 'bmc-report:theme:v1': '"dark"' }],
      'storage-unavailable': [v2, 'unavailable'],
      'storage-full': [v2, 'full'],
    };
    const results = {};
    // Saves that fail on purpose log a warning (src/lib/storage.ts writeItem); keep the output quiet.
    const realWarn = console.warn;
    console.warn = () => {};
    for (const [name, [entries, mode]] of Object.entries(scenarios)) {
      const fake = fakeStorage(entries, mode);
      globalThis.localStorage = fake;
      results[name] = {
        loadConfig: attempt(() => storage.loadConfig()),
        loadColumnMapping: attempt(() => storage.loadColumnMapping()),
        loadFeedback: attempt(() => storage.loadFeedback()),
        loadTheme: attempt(() => storage.loadTheme()),
        hasSavedWorkflowSetup: attempt(() => storage.hasSavedWorkflowSetup()),
        saveTheme: attempt(() => storage.saveTheme('light')),
        saveConfig: attempt(() => storage.saveConfig(storage.loadConfig())),
        storageAfter: mode === 'unavailable' ? null : fake.dump(),
      };
    }
    console.warn = realWarn;
    files.set('storage/whatsapp.json', stableJson(results));
  } finally {
    globalThis.localStorage = realStorage;
    await server.close();
  }

  // ---- Email reports: prototype/daily-email settings ----------------------
  const lib = (file) => import(pathToFileURL(resolve(emailRoot, 'lib', file)).href);
  const { normalizeSettings } = await lib('settings-persistence.mjs');
  const { persistCandidate, validHeaderLogo } = await lib('header-logo.mjs');
  const { sanitizeSignatureHtml, plainToSignatureHtml } = await lib('signature-html.mjs');
  const { PENDING_SUBJECT, PENDING_INTRO } = await lib('pending-report.mjs');
  // Mirrors DEFAULTS in app.mjs at 3fcc777 (line 17) and loadSettings() (line 19).
  const DEFAULTS = { to: '', cc: '', bcc: '', subject: 'Daily BMC Ticket Report – {date}', greeting: 'Hi Team,', intro: 'Please find below the daily BMC ticket activity report.', client: 'classic', reportContent: 'daily', showEngineer: false, pendingSubject: PENDING_SUBJECT, pendingIntro: PENDING_INTRO, emailVariant: 'A', emailSender: { name: '', title: '', company: '', phone: '' }, signatureId: '', signatures: [{ id: 'support', name: 'IT Support Team', content: 'Best regards,\nIT Support Team' }] };
  const loadSettings = (raw) => { try { return normalizeSettings(JSON.parse(raw), DEFAULTS); } catch { return normalizeSettings(null, DEFAULTS); } };
  const KEY = 'bmc-daily-email-report:settings:v1';
  const email = {};
  for (const [name, raw] of Object.entries({
    'full': fixture('bmc-daily-email-report.settings.v1.json'),
    'minimal-legacy': fixture('bmc-daily-email-report.settings.v1.minimal-legacy.json'),
    'missing': null,
    'malformed-json': '{"to":',
    'not-an-object': '"just a string"',
  })) {
    const settings = loadSettings(raw);
    email[name] = {
      settings,
      headerLogoValid: validHeaderLogo(settings.headerLogo || ''),
      // What the renderer receives for each signature profile (app.mjs emailSettings()).
      renderedSignatures: settings.signatures.map((p) => ({ id: p.id, html: sanitizeSignatureHtml(p.html ?? plainToSignatureHtml(p.content)) })),
    };
  }
  // A save that hits a full quota must throw and leave the stored value untouched (header-logo.mjs persistCandidate).
  const full = fakeStorage({ [KEY]: fixture('bmc-daily-email-report.settings.v1.minimal-legacy.json') }, 'full');
  email['save-when-quota-full'] = { save: attempt(() => persistCandidate(full, KEY, loadSettings(fixture('bmc-daily-email-report.settings.v1.json')))), storedAfter: full.dump() };
  files.set('storage/email.json', stableJson(email));
  return files;
}

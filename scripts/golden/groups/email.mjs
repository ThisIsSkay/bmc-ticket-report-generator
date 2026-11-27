// Email reports goldens. Rebuilds each output exactly the way
// prototype/daily-email/app.mjs does (report → view → settings → renderer),
// using only the tool's own library modules. Pure Node, no browser.
//
// Layout:
//   email/core/<fixture>/<mode>-<variant>.{html,txt,eml,ps1}  full outputs
//   email/core/<fixture>/<mode>-workbook.json                 .xlsx cell values
//   email/matrix.json   sha256 of every output for every combination
//   email/inputs.json   normalised tickets per fixture (CSV and XLSX paths)
//   email/sample-data/<variant>.html, plain.txt               design fixture
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pngDataUrl } from '../lib/png.mjs';
import { repoRoot, sha256, stableJson, withFixedClock } from '../lib/util.mjs';

const XLSX = createRequire(resolve(repoRoot, 'package.json'))('xlsx');

const HEADERS = ['Submit Date', 'Resolved Date', 'Last Modified Date', 'Ticket ID', 'Description', 'Status', 'Incident Type', 'Assigned Engineer', 'Assigned Group', 'Contract Number', 'Priority'];
const LONG = 'Unbroken' + 'x'.repeat(252);
// Fictional adversarial export. Report date 2026-11-10; age reference 2026-11-10.
const HOSTILE_ROWS = [
  ['2026-11-10 08:00', '', '2026-11-10 08:05', 'INC100000001', '<script>alert(1)</script> & "quoted" \'single\'', 'Assigned', 'Incident', 'Alex Example', 'EXAMPLE_EUC', 'CN-EXAMPLE-1', 'High'],
  ['2026-11-10 08:30', '2026-11-10 09:00', '2026-11-10 09:00', 'INC100000002', LONG, 'Resolved', 'Incident', 'Jamie Example', 'EXAMPLE_EUC', 'CN-EXAMPLE-1', 'Medium'],
  ['2026-11-10 09:00', '2026-11-10 12:00', '2026-11-10 12:00', 'SRV100000003', 'José Example requests café access — 李明 Example', 'Closed', 'Service Request', 'José Example', 'EXAMPLE_NETWORK', 'CN-EXAMPLE-2', 'Low'],
  ['2026-11-10 09:30', '2026-11-10 10:00', '2026-11-10 10:00', 'SRV100000004', 'Cancelled request', 'Cancelled', 'Service Request', 'Sam Example', 'EXAMPLE_NETWORK', 'CN-EXAMPLE-2', 'Low'],
  ['2026-11-01 10:00', '2026-11-03 10:00', '2026-11-03 10:00', 'INC100000005', 'Reopened ticket (older row)', 'Resolved', 'Incident', 'Chris Example', 'EXAMPLE_SYSTEM', 'CN-EXAMPLE-1', 'Medium'],
  ['2026-11-01 10:00', '', '2026-11-09 16:00', 'INC100000005', 'Reopened ticket (latest row)', 'Pending', 'Incident', 'Chris Example', 'EXAMPLE_SYSTEM', 'CN-EXAMPLE-1', 'Medium'],
  ['2026-10-02 10:00', '', '2026-10-20 10:00', 'INC100000006', 'Duplicate row A (older)', 'Assigned', 'Incident', '', '', 'CN-EXAMPLE-1', ''],
  ['2026-10-02 10:00', '', '2026-10-21 10:00', 'INC100000006', 'Duplicate row B (latest)', 'Work in Progress', 'Incident', '', '', 'CN-EXAMPLE-1', ''],
  ['2026-11-10 07:00', '', '2026-11-10 07:00', 'EVT100000007', 'Monitoring event', 'Assigned', 'Event', 'Monitor Example', 'EXAMPLE_NOC', 'CN-EXAMPLE-1', 'Low'],
  ['2026-09-15 10:00', '', '2026-09-15 10:00', 'FSC100000008', 'Forward schedule maintenance', 'Pending', 'Forward Schedule', 'Sam Example', 'EXAMPLE_SYSTEM', '', 'Low'],
  ['2026-08-01 10:00', '', '2026-08-02 10:00', 'SRV100000009', 'Old pending request', 'Waiting User Reply', 'Service Request', 'Jamie Example', 'EXAMPLE_EUC', 'CN-EXAMPLE-2', 'Medium'],
  ['2026-11-12 10:00', '', '2026-11-12 10:00', 'INC100000010', 'Future-dated submission', 'Assigned', 'Incident', 'Alex Example', 'EXAMPLE_EUC', 'CN-EXAMPLE-1', 'High'],
  ['', '', '', 'INC100000011', '', 'Mystery Status', 'Incident', '', 'EXAMPLE_EUC', 'CN-EXAMPLE-1', ''],
  ['2026-11-10 13:00', '', '2026-11-10 13:00', 'INC100000012', 'Group name with <b>markup</b> & ampersand', 'Pending', 'Incident', 'Alex Example', 'EXAMPLE <GROUP> & CO', 'CN-EXAMPLE-2', 'Critical'],
];

const csvCell = (value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const toCsv = (rows) => [HEADERS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const SIGNATURE_LOGO = pngDataUrl(48, 48, [200, 80, 0]);
const HEADER_LOGO = pngDataUrl(96, 32);
const SENDER = { name: 'Alex Example', title: 'IT Executive', company: 'Example Company', phone: '+65 6000 0000' };
const NO_SENDER = { name: '', title: '', company: '', phone: '' };
const SIGNATURES = [
  { id: 'support', name: 'IT Support Team', content: 'Best regards,\nIT Support Team' },
  { id: 'logo-sig', name: 'Signature with logo', content: 'Best regards,\nAlex Example', html: `<p>Best regards,<br>Alex Example</p><p><img src="${SIGNATURE_LOGO}" width="48" height="48" alt="Example logo"></p>` },
];

// Mirrors DEFAULTS in app.mjs at 3fcc777.
const BASE_SETTINGS = {
  to: 'team@example.com; lead@example.net', cc: 'manager@example.org', bcc: '',
  subject: 'Daily BMC Ticket Report – {date}', greeting: 'Hi Team,', intro: 'Please find below the daily BMC ticket activity report.',
  client: 'classic', reportContent: 'daily', showEngineer: false, summaryOnly: false,
  monthlySubject: 'Monthly pending tickets — {date}', monthlyIntro: 'Please find below the monthly pending ticket report as at {date}.',
  emailSender: SENDER, signatureId: 'logo-sig', signatures: SIGNATURES, headerLogo: HEADER_LOGO, headerLogoName: 'example-logo.png',
};

export async function generate({ emailRoot }) {
  const lib = (file) => import(pathToFileURL(resolve(emailRoot, 'lib', file)).href);
  const core = await lib('report-core.mjs');
  const { parseXlsx } = await lib('xlsx-lite.mjs');
  const { renderEmail, renderEml, renderPlainText, renderPendingEmail, renderPendingPlainText } = await lib('mail.mjs');
  const { renderClassicOutlookScript } = await lib('classic-outlook.mjs');
  const { buildPendingView, PENDING_SUBJECT, PENDING_INTRO } = await lib('pending-report.mjs');
  const { contractLabel, generateContractReport, missingContracts } = await lib('contract-scope.mjs');
  const { dayNumber } = await lib('ageing.mjs');
  const exportGuardLib = existsSync(resolve(emailRoot, 'lib', 'export-guard.mjs')) ? await lib('export-guard.mjs') : null;
  const { sanitizeSignatureHtml, plainToSignatureHtml } = await lib('signature-html.mjs');
  const { workbookSheets, buildWorkbook } = await lib('workbook.mjs');
  const { normalizeVariant, renderThemedEmail } = await lib('email-themes.mjs');

  const settingsBase = { ...BASE_SETTINGS, pendingSubject: PENDING_SUBJECT, pendingIntro: PENDING_INTRO };

  // Fixtures: the tool's own sample CSV, the adversarial CSV, and the same rows through the XLSX reader.
  const sampleCsv = readFileSync(resolve(emailRoot, 'samples/fictional-tickets.csv'), 'utf8');
  const fromCsv = (text) => { const { headers, rows } = core.parseCsv(text); return core.normalizeTickets(rows, core.detectColumns(headers)); };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([HEADERS, ...HOSTILE_ROWS]), 'Tickets');
  const xlsxBytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsedXlsx = await parseXlsx(xlsxBytes);
  const fixtures = {
    sample: fromCsv(sampleCsv),
    hostile: fromCsv(toCsv(HOSTILE_ROWS)),
    'hostile-xlsx': core.normalizeTickets(parsedXlsx.rows, core.detectColumns(parsedXlsx.headers)),
  };

  // One output set for one combination, built like app.mjs (makeEmail, deliverySettings, deliveryDate, downloads).
  async function outputs(fixture, combo) {
    const { mode, variant, groupFilter = 'All', contracts = null, excludeEvents = true, groups = null, types = null, statuses = null, asAt = '2026-11-10', settings: extra = {} } = combo;
    const pending = mode === 'pending' || mode === 'monthly';
    const monthly = mode === 'monthly';
    const settings = { ...settingsBase, ...extra, reportContent: mode };
    const options = { reportDate: '2026-11-10', groupFilter, contractFilter: contractLabel(contracts), excludeEvents };
    const report = generateContractReport(fixtures[fixture], pending ? { ...options, groupFilter: 'All' } : options, contracts);
    const view = pending ? buildPendingView(report, { ...options, groups, types, statuses, asAt, order: settings.pendingOrder, groupBy: settings.pendingGroupBy === true }) : null;
    if (view) view.monthly = monthly;
    const emailSettings = {
      ...settings,
      ...(monthly ? { pendingIntro: settings.monthlyIntro || 'Please find below the monthly pending ticket report as at {date}.', reportContent: 'monthly' } : {}),
      signatures: settings.signatures.map((p) => ({ ...p, html: sanitizeSignatureHtml(p.html ?? plainToSignatureHtml(p.content)) })),
    };
    const deliverySettings = monthly
      ? { ...settings, subject: settings.monthlySubject || 'Monthly pending tickets — {date}' }
      : pending ? { ...settings, subject: settings.pendingSubject === 'BMC Outstanding Tickets' ? PENDING_SUBJECT : settings.pendingSubject } : settings;
    const deliveryDate = pending ? view.asAt || 'current snapshot' : report.reportDate;
    // Pre-RD-01 rules, only used when the email tool has no lib/export-guard.mjs.
    const legacyGuard = () => {
      const missing = missingContracts(fixtures[fixture], contracts);
      const block = missing.length ? 'Selected contracts are missing from this export: ' + contractLabel(missing) + '. Review the contracts before exporting.' : monthly && dayNumber(asAt) === null ? 'Choose the monthly reporting date.' : '';
      return { block: block || null, confirm: pending && !block && contracts === null ? 'All contracts are selected or the Contract column is missing. Confirm these tickets belong to the intended customer before exporting.' : null };
    };
    const html = pending
      ? renderPendingEmail(view, emailSettings, normalizeVariant(variant))
      : renderEmail(report, emailSettings, options, variant === 'legacy' ? 'legacy' : normalizeVariant(variant));
    // Export guards: the app's own lib/export-guard.mjs (RD-01), called the way
    // app.mjs confirmScope() calls it. The preview (html) is always rendered; a
    // blocked delivery is recorded as "BLOCKED: <toast>". `confirm` is the text of
    // the customer-scope dialog the user must accept before any delivery.
    const guard = exportGuardLib
      ? exportGuardLib.exportGuard({ tickets: fixtures[fixture], contracts, hasContractColumn: true, mode, asAt, scopeError: '', to: settings.to, reportDate: pending ? (asAt || 'current snapshot') : report.reportDate, counts: pending ? { total: view.total } : report.counts })
      : legacyGuard();
    const scopeError = guard.block || '';
    const workbookError = pending && dayNumber(asAt) === null ? 'Choose an age reference date before exporting Excel.' : '';
    const guards = { exportBlocked: scopeError || null, workbookBlocked: scopeError || workbookError || null, confirm: guard.confirm };
    const blocked = (message) => 'BLOCKED: ' + message;
    if (scopeError) {
      return { html, txt: blocked(scopeError), eml: blocked(scopeError), ps1: blocked(scopeError), workbook: null, guards };
    }
    const txt = pending ? renderPendingPlainText(view, emailSettings) : renderPlainText(report, emailSettings, options);
    const eml = renderEml(html, deliverySettings, deliveryDate);
    if (workbookError) return { html, txt, eml, ps1: blocked(workbookError), workbook: null, guards };
    let workbook = null;
    const attachments = [];
    if (pending) {
      const sheets = workbookSheets(view, settings.showEngineer);
      const bytes = new Uint8Array(buildWorkbook(view, settings.showEngineer, XLSX));
      const read = XLSX.read(bytes, { type: 'array', cellDates: true });
      const cells = Object.fromEntries(read.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json(read.Sheets[name], { header: 1, raw: true, defval: null })
        .map((row) => row.map((v) => (v instanceof Date ? { date: v.toISOString() } : v)))]));
      workbook = { sheetNames: read.SheetNames, sheets, cells, types: Object.fromEntries(read.SheetNames.map((name) => [name, Object.fromEntries(Object.entries(read.Sheets[name]).filter(([k]) => !k.startsWith('!')).map(([k, c]) => [k, c.t]))])) };
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const base = monthly ? 'BMC_Monthly_Pending_' + String(deliveryDate).replace(/[^a-zA-Z0-9._-]/g, '_') : 'BMC_Outstanding_Tickets';
      attachments.push({ filename: base + '.xlsx', base64: Buffer.from(binary, 'binary').toString('base64') });
    }
    const ps1 = renderClassicOutlookScript(html, deliverySettings, deliveryDate, attachments);
    return { html, txt, eml, ps1, workbook, guards };
  }

  const files = new Map();
  const matrix = {};
  const record = (key, { guards, ...out }) => {
    matrix[key] = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('BLOCKED: ') ? v : { bytes: typeof v === 'string' ? Buffer.byteLength(v) : stableJson(v).length, sha256: sha256(typeof v === 'string' ? v : stableJson(v)) }]));
    matrix[key].guards = guards;
  };

  await withFixedClock(async () => {
    const modes = { daily: ['legacy', 'A', 'B', 'C', 'D'], pending: ['A', 'B', 'C', 'D'], monthly: ['A', 'B', 'C', 'D'] };
    // Core: full outputs with every setting populated.
    for (const fixture of ['sample', 'hostile']) {
      for (const [mode, variants] of Object.entries(modes)) {
        for (const variant of variants) {
          const out = await outputs(fixture, { mode, variant });
          const stem = `email/core/${fixture}/${mode}-${variant}`;
          files.set(stem + '.html', out.html);
          files.set(stem + '.txt', out.txt);
          files.set(stem + '.eml', out.eml);
          files.set(stem + '.ps1', out.ps1);
          if (out.workbook && variant === variants[0]) files.set(`email/core/${fixture}/${mode}-workbook.json`, stableJson(out.workbook));
          record(`core/${fixture}/${mode}/${variant}`, out);
        }
      }
    }
    // Matrix: one setting changed at a time, every mode and variant; hashes only.
    const variations = {
      'no-sender': { settings: { emailSender: NO_SENDER } },
      'plain-signature': { settings: { signatureId: 'support' } },
      'no-signature': { settings: { signatureId: '' } },
      'no-header-logo': { settings: { headerLogo: '', headerLogoName: '' } },
      'group-filter': { groupFilter: 'EXAMPLE_EUC', groups: ['EXAMPLE_EUC'] },
      'contract-single': { contracts: ['CN-EXAMPLE-1'] },
      'contract-multi': { contracts: ['CN-EXAMPLE-1', 'CN-EXAMPLE-2'] },
      'contract-none-selected': { contracts: [] },
      'events-included': { excludeEvents: false },
      'show-engineer': { settings: { showEngineer: true } },
      'summary-only': { settings: { summaryOnly: true } },
      'order-oldest': { settings: { pendingOrder: 'oldest' } },
      'grouped-newest': { settings: { pendingGroupBy: true } },
      'grouped-oldest': { settings: { pendingOrder: 'oldest', pendingGroupBy: true } },
      'types-statuses': { types: ['Incident', 'Service Request'], statuses: ['Assigned', 'Pending'] },
      'no-age-reference': { asAt: '' },
      'intro-no-period': { settings: { intro: 'Daily update', greeting: '' } },
      'no-recipients': { settings: { to: '', cc: '', bcc: '' } },
    };
    for (const fixture of ['sample', 'hostile', 'hostile-xlsx']) {
      for (const [mode, variants] of Object.entries(modes)) {
        for (const variant of variants) {
          if (fixture === 'hostile-xlsx') { record(`xlsx-path/${mode}/${variant}`, await outputs(fixture, { mode, variant })); continue; }
          for (const [name, combo] of Object.entries(variations)) {
            record(`${name}/${fixture}/${mode}/${variant}`, await outputs(fixture, { mode, variant, ...combo, settings: { ...(combo.settings || {}) } }));
          }
        }
      }
    }

    // Design fixture, adapted exactly as test/report.test.mjs sampleFixture() does.
    const sample = JSON.parse(readFileSync(resolve(emailRoot, '../../docs/email-design/sample-data.json'), 'utf8'));
    const rows = (list) => list.map((r) => ({ group: r.name, created: r.created, closed: r.closed, pending: r.outstanding }));
    const report = {
      reportDate: sample.reportDate,
      counts: { created: sample.kpis.createdOnDate, closed: sample.kpis.closedResolved, pending: sample.kpis.outstanding },
      pivot: rows(sample.byGroup), byType: rows(sample.byType),
      created: sample.createdTickets.map((t) => ({ id: t.id, kind: t.type, description: t.summary, assigned: t.assignee, group: t.group, status: t.status })),
    };
    const designSettings = { greeting: 'Hi Team,', intro: 'Please find below the daily ticket activity summary.', emailSender: sample.sender, signatures: [], signatureId: '' };
    for (const variant of ['A', 'B', 'C', 'D']) files.set(`email/sample-data/${variant}.html`, renderThemedEmail(report, designSettings, {}, variant));
  });

  const inputs = Object.fromEntries(Object.entries(fixtures).map(([name, tickets]) => [name, tickets]));
  files.set('email/inputs.json', stableJson({ xlsxHeaders: parsedXlsx.headers, tickets: inputs }));
  files.set('email/matrix.json', stableJson(matrix));
  return files;
}

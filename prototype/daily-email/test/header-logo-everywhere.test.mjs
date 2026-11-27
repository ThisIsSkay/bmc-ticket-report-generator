// The saved header logo appears in every report (daily, outstanding, monthly)
// in every theme, and survives into the .eml and Classic Outlook drafts.
// (Before: only outstanding/monthly theme C; daily theme C showed a "LOGO" box.)
// Fictional data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv, detectColumns, normalizeTickets, generateReport} from '../lib/report-core.mjs';
import {buildPendingView} from '../lib/pending-report.mjs';
import {renderEmail, renderEml, renderPendingEmail} from '../lib/mail.mjs';
import {renderClassicOutlookScript} from '../lib/classic-outlook.mjs';

const png = (w, h) => { const b = Buffer.alloc(24); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return 'data:image/png;base64,' + b.toString('base64'); };
const CSV = `Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority
2026-11-10 08:00,,2026-11-10 08:00,INC900000001,Fictional open ticket,Assigned,Incident,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-10 09:00,2026-11-10 10:00,2026-11-10 10:00,INC900000002,Fictional resolved ticket,Resolved,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,Low
`;
const {headers, rows} = parseCsv(CSV);
const report = generateReport(normalizeTickets(rows, detectColumns(headers)), {reportDate: '2026-11-10'});
const LOGO = png(360, 120), SQUARE = png(120, 120);
const outputs = (settings) => {
  const out = [];
  for (const variant of ['A', 'B', 'C', 'D']) {
    out.push(['daily ' + variant, renderEmail(report, settings, {}, variant)]);
    for (const monthly of [false, true]) out.push([(monthly ? 'monthly ' : 'outstanding ') + variant, renderPendingEmail({...buildPendingView(report, {asAt: '2026-11-10'}), monthly}, settings, variant)]);
  }
  return out;
};

test('the logo is in every report and every theme, scaled into 120 × 40', () => {
  for (const [name, html] of outputs({headerLogo: LOGO})) {
    assert.equal((html.match(/alt="Report logo"/g) || []).length, 1, name);
    assert.ok(html.includes(`<img src="${LOGO}" width="120" height="40"`), name);
    assert.doesNotMatch(html, />LOGO<\/td>/, name + ': no placeholder box when a logo is saved');
  }
  for (const [name, html] of outputs({headerLogo: SQUARE})) assert.match(html, /width="40" height="40"/, name + ': square logos keep their shape');
});

test('the logo sits at the top: theme C in its slot, other themes above the greeting', () => {
  for (const [name, html] of outputs({headerLogo: LOGO, greeting: 'Hi Team,'})) {
    assert.ok(html.indexOf('alt="Report logo"') < html.indexOf('Hi Team,'), name);
    if (name.endsWith('C')) assert.match(html, /<td width="120" height="36"[^>]*><img src="data:image\/png/, name);
    else assert.match(html, /<tr><td style="padding:24px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;"><img src="data:image\/png[^"]*" width="120" height="40" alt="Report logo" style="display:block;border:0;width:120px;height:40px;" \/><\/td><\/tr>/, name);
  }
});

test('no logo saved: no image, and themes A, B, D are unchanged', () => {
  for (const [name, html] of outputs({headerLogo: ''})) {
    assert.doesNotMatch(html, /alt="Report logo"/, name);
    if (!name.endsWith('C')) assert.doesNotMatch(html, /padding:24px 32px 0 32px;font-family/, name);
  }
  assert.doesNotMatch(outputs({headerLogo: 'data:image/gif;base64,R0lGOD'}).map(([, h]) => h).join(''), /alt="Report logo"/, 'only PNG/JPEG data URLs');
});

test('the logo travels into the .eml (inline image) and the Classic Outlook draft', () => {
  const settings = {headerLogo: LOGO, to: 'team@example.com', subject: 'Daily {date}'};
  const html = renderEmail(report, settings, {}, 'A');
  const eml = renderEml(html, settings, '2026-11-10');
  assert.match(eml, /Content-Type: multipart\/related/);
  assert.match(eml, /Content-ID: <bmc-signature-1@local\.invalid>/);
  const htmlPart = Buffer.from(eml.split('\r\n\r\n').slice(2).join('\r\n\r\n').split('--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.match(htmlPart, /<img src="cid:bmc-signature-1@local\.invalid" width="120" height="40" alt="Report logo"/);
  const ps1 = renderClassicOutlookScript(html, settings, '2026-11-10');
  assert.match(ps1, /src="cid:bmc-signature-1@local\.invalid" width="120" height="40" alt="Report logo"/);
  assert.match(ps1, /ContentId = 'bmc-signature-1@local\.invalid'/);
});

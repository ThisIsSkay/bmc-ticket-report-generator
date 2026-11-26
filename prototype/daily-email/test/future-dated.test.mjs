// RD-02: an age reference date earlier than the snapshot. Counting is
// unchanged; future-dated tickets are made visible in every output.
// Fictional data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv, detectColumns, normalizeTickets, generateReport} from '../lib/report-core.mjs';
import {buildPendingView, futureDatedCount, futureDatedWarning} from '../lib/pending-report.mjs';
import {renderPendingEmail, renderPendingPlainText} from '../lib/mail.mjs';
import {workbookSheets} from '../lib/workbook.mjs';

// A November snapshot with one outstanding ticket submitted before 31 October and one after.
const CSV = `Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority
2026-10-20 09:00,,2026-11-12 09:00,INC900000101,Fictional older ticket,Assigned,Incident,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-05 10:00,,2026-11-12 10:00,INC900000102,Fictional newer ticket,Pending,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,Low
2026-10-01 10:00,2026-10-02 10:00,2026-10-02 10:00,INC900000103,Fictional closed ticket,Closed,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,Low
`;
const {headers, rows} = parseCsv(CSV);
const report = generateReport(normalizeTickets(rows, detectColumns(headers)), {reportDate: '2026-11-12'});
const view = (asAt, monthly = true) => ({...buildPendingView(report, {asAt}), monthly});
const band = (v, name) => v.byAge.find((row) => row.name === name).count;
const VARIANTS = ['A', 'B', 'C', 'D'];
const FORBIDDEN = [/class\s*=/i, /<style/i, /display\s*:\s*flex/i, /display\s*:\s*grid/i, /float\s*:/i, /position\s*:/i, /border-radius/i, /gradient/i, /box-shadow/i, /<svg/i, /url\(/i];

test('both tickets stay counted; the newer one is Future-dated against 31 October', () => {
  const october = view('2026-10-31');
  assert.equal(october.total, 2);
  assert.equal(band(october, 'Future-dated'), 1);
  assert.equal(futureDatedCount(october), 1);
  assert.equal(futureDatedWarning(october), 'Warning: 1 of 2 outstanding tickets was submitted after 2026-10-31 (shown as Future-dated). These figures show current status in the uploaded export, not the backlog as at 2026-10-31. To report that date, use an export taken on it.');
});

test('moving the reference date changes age bands, not outstanding totals', () => {
  const october = view('2026-10-31'), november = view('2026-11-12');
  assert.equal(november.total, october.total);
  assert.equal(november.incidents, october.incidents);
  assert.deepEqual(november.byGroup, october.byGroup);
  assert.deepEqual(november.tickets.map((t) => t.id), october.tickets.map((t) => t.id));
  assert.equal(band(november, 'Future-dated'), 0);
  assert.notDeepEqual(november.byAge, october.byAge);
});

test('the warning appears in the email HTML (every theme), plain text and Excel summary', () => {
  const october = view('2026-10-31');
  for (const monthly of [true, false]) {
    const v = {...october, monthly};
    for (const variant of VARIANTS) {
      const html = renderPendingEmail(v, {}, variant);
      const flat = html.replace(/&#8203;/g, '');
      assert.match(flat, /Warning: 1 of 2 outstanding tickets was submitted after 2026-10-31/, variant);
      // It sits above the KPI figures, not in the small print.
      assert.ok(flat.indexOf('Warning: 1 of 2') < flat.indexOf('>Outstanding<'), variant + ': warning before KPIs');
    }
    const text = renderPendingPlainText(v, {});
    assert.match(text, /^Warning: 1 of 2 outstanding tickets was submitted after 2026-10-31/m);
    const summary = workbookSheets(v).Summary;
    assert.deepEqual(summary.find((row) => row[0] === 'Warning'), ['Warning', futureDatedWarning(october)]);
  }
});

test('the HTML warning row follows the Outlook-safe email rules', () => {
  const html = renderPendingEmail(view('2026-10-31'), {}, 'A');
  const row = /<tr><td style="padding:0 32px 16px 32px;">[^]*?bgcolor="#FFF4E5"[^]*?<\/td><\/tr><\/tbody><\/table><\/td><\/tr>/.exec(html)?.[0];
  assert.ok(row, 'warning row present');
  for (const token of FORBIDDEN) assert.doesNotMatch(row, token);
  assert.match(row, /width="736"/);
  const cell = /<td bgcolor="(#[0-9A-F]{6})" style="([^"]*)">/.exec(row);
  assert.ok(cell);
  assert.match(cell[2], new RegExp(`background-color:${cell[1]};`));
  assert.match(cell[2], /border:1px solid #[0-9A-F]{6};/);
  assert.match(cell[2], /font-family:Arial,Helvetica,sans-serif;/);
});

test('no warning anywhere when nothing is future-dated, or with no reference date', () => {
  for (const v of [view('2026-11-12'), view(''), {...view(''), monthly: false}]) {
    assert.equal(futureDatedWarning(v), '');
    for (const variant of VARIANTS) assert.doesNotMatch(renderPendingEmail(v, {}, variant), /Warning:|#FFF4E5/, variant);
    assert.doesNotMatch(renderPendingPlainText(v, {}), /Warning:/);
    assert.equal(workbookSheets(v).Summary.some((row) => row[0] === 'Warning'), false);
  }
});

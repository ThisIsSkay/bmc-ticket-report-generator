// Outstanding / monthly ticket list order (owner, 2026-11-27): newest submitted
// first by default, oldest first on request, optionally grouped by assigned
// group with a heading per group. Fictional data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv, detectColumns, normalizeTickets, generateReport} from '../lib/report-core.mjs';
import {buildPendingView, groupRuns, groupHeading} from '../lib/pending-report.mjs';
import {renderPendingEmail, renderPendingPlainText} from '../lib/mail.mjs';
import {workbookSheets} from '../lib/workbook.mjs';
import {normalizeSettings} from '../lib/settings-persistence.mjs';

const CSV = `Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority
2026-10-01 09:00,,2026-11-20 09:00,SRV900000010,Fictional oldest EUC,Pending,Service Request,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,Medium
2026-11-15 09:00,,2026-11-20 09:00,INC900000020,Fictional newest EUC,Assigned,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-02 09:00,,2026-11-20 09:00,INC900000030,Fictional network,Pending,Incident,Sam Example,EXAMPLE_NETWORK,CN-EXAMPLE-A,Medium
2026-11-15 14:00,,2026-11-20 09:00,INC900000040,Fictional network same day,Pending,Incident,Sam Example,EXAMPLE_NETWORK,CN-EXAMPLE-A,Low
,,2026-11-20 09:00,INC900000050,Fictional no submit date,Pending,Incident,Pat Example,EXAMPLE_APPLICATION,CN-EXAMPLE-A,Low
2026-10-20 09:00,,2026-11-20 09:00,SRV900000060,Fictional application,Assigned,Service Request,Pat Example,EXAMPLE_APPLICATION,CN-EXAMPLE-A,Medium
`;
const {headers, rows} = parseCsv(CSV);
const report = generateReport(normalizeTickets(rows, detectColumns(headers)), {reportDate: '2026-11-20', groupFilter: 'All'});
const ids = (options) => buildPendingView(report, {asAt: '2026-11-20', ...options}).tickets.map((t) => t.id);

test('newest submitted first by default, all groups in one list', () => {
  assert.deepEqual(ids({}), ['INC900000040', 'INC900000020', 'INC900000030', 'SRV900000060', 'SRV900000010', 'INC900000050'],
    'same-day tickets by Ticket ID (higher first); no submit date goes last');
  assert.equal(buildPendingView(report, {}).order, 'newest');
  assert.equal(buildPendingView(report, {}).groupBy, false);
});

test('oldest first on request; no submit date still goes last', () => {
  assert.deepEqual(ids({order: 'oldest'}), ['SRV900000010', 'SRV900000060', 'INC900000030', 'INC900000020', 'INC900000040', 'INC900000050']);
  assert.equal(buildPendingView(report, {order: 'sideways'}).order, 'newest', 'unknown values fall back to newest');
});

test('grouped: assigned groups A to Z, each newest first (or oldest first)', () => {
  assert.deepEqual(ids({groupBy: true}), ['SRV900000060', 'INC900000050', 'INC900000020', 'SRV900000010', 'INC900000040', 'INC900000030']);
  assert.deepEqual(ids({groupBy: true, order: 'oldest'}), ['SRV900000060', 'INC900000050', 'SRV900000010', 'INC900000020', 'INC900000030', 'INC900000040'], 'the previous fixed order');
  const view = buildPendingView(report, {groupBy: true});
  assert.deepEqual(groupRuns(view.tickets), [{group: 'EXAMPLE_APPLICATION', start: 0, count: 2}, {group: 'EXAMPLE_EUC', start: 2, count: 2}, {group: 'EXAMPLE_NETWORK', start: 4, count: 2}]);
  assert.equal(groupHeading({group: 'EXAMPLE_EUC', count: 1}), 'EXAMPLE_EUC · 1 ticket');
});

test('order and grouping change only the list: counts and summaries stay the same', () => {
  const a = buildPendingView(report, {asAt: '2026-11-20'}), b = buildPendingView(report, {asAt: '2026-11-20', order: 'oldest', groupBy: true});
  for (const key of ['total', 'incidents', 'other', 'byGroup', 'byStatus', 'byAge', 'groupType', 'typePriority']) assert.deepEqual(a[key], b[key], key);
});

test('the email shows a heading row per group when grouped, in every theme', () => {
  for (const monthly of [false, true]) for (const variant of ['A', 'B', 'C', 'D']) {
    const grouped = renderPendingEmail({...buildPendingView(report, {asAt: '2026-11-20', groupBy: true}), monthly}, {}, variant);
    const headings = [...grouped.matchAll(/<td colspan="\d+"[^>]*>(EXAMPLE_[A-Z]+ · \d tickets?)<\/td>/g)].map((m) => m[1]);
    assert.deepEqual(headings, ['EXAMPLE_APPLICATION · 2 tickets', 'EXAMPLE_EUC · 2 tickets', 'EXAMPLE_NETWORK · 2 tickets'], variant);
    for (const m of grouped.matchAll(/<td colspan="\d+"([^>]*)>EXAMPLE_/g)) {
      assert.match(m[1], /font-family:Arial,Helvetica,sans-serif/, variant);
      const bg = /bgcolor="(#[0-9A-Fa-f]{6})"/.exec(m[1]);
      if (bg) assert.match(m[1], new RegExp(`background-color:${bg[1]}`, 'i'), variant);
    }
    assert.ok(grouped.indexOf('EXAMPLE_EUC · 2 tickets') < grouped.indexOf('INC900000020'), variant + ': heading before its tickets');
    const flat = renderPendingEmail({...buildPendingView(report, {asAt: '2026-11-20'}), monthly}, {}, variant);
    assert.doesNotMatch(flat, / · \d tickets?<\/td>/, variant + ': no headings in one list');
    assert.ok(flat.indexOf('INC900000040') < flat.indexOf('SRV900000010'), variant + ': newest first');
  }
});

test('plain text and Excel follow the same order; text has group headings when grouped', () => {
  const view = buildPendingView(report, {asAt: '2026-11-20', groupBy: true});
  const text = renderPendingPlainText(view, {});
  assert.match(text, /EXAMPLE_APPLICATION · 2 tickets\n1\. SRV900000060/);
  assert.match(text, /\n\nEXAMPLE_EUC · 2 tickets\n3\. INC900000020/);
  assert.doesNotMatch(renderPendingPlainText(buildPendingView(report, {asAt: '2026-11-20'}), {}), / · \d tickets?\n/);
  assert.deepEqual(workbookSheets(view).Tickets.slice(1).map((row) => row[0]), view.tickets.map((t) => t.id));
});

test('the choice is remembered in settings, newest and ungrouped by default', () => {
  const defaults = {to: '', reportContent: 'pending'};
  assert.equal(normalizeSettings({}, defaults).pendingOrder, 'newest');
  assert.equal(normalizeSettings({}, defaults).pendingGroupBy, false);
  assert.equal(normalizeSettings({pendingOrder: 'oldest', pendingGroupBy: true}, defaults).pendingOrder, 'oldest');
  assert.equal(normalizeSettings({pendingOrder: 'oldest', pendingGroupBy: true}, defaults).pendingGroupBy, true);
  assert.equal(normalizeSettings({pendingOrder: 'random', pendingGroupBy: 'yes'}, defaults).pendingOrder, 'newest');
  assert.equal(normalizeSettings({pendingOrder: 'random', pendingGroupBy: 'yes'}, defaults).pendingGroupBy, false);
});

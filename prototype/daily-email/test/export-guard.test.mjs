// RD-01: the customer-scope safeguard applies to every export path in every mode.
// Fictional data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {exportGuard, contractSummary, EMPTY_SCOPE_MESSAGE} from '../lib/export-guard.mjs';
import {normalizeTickets, detectColumns, parseCsv} from '../lib/report-core.mjs';

const CSV = `Submit Date,Resolved Date,Last Modified Date,Ticket ID,Description,Status,Incident Type,Assigned Engineer,Assigned Group,Contract Number,Priority
2026-11-10 08:00,,2026-11-10 08:00,INC900000001,Fictional A,Assigned,Incident,Alex Example,EXAMPLE_EUC,CN-EXAMPLE-A,High
2026-11-10 09:00,2026-11-10 10:00,2026-11-10 10:00,INC900000002,Fictional B,Resolved,Incident,Jamie Example,EXAMPLE_EUC,CN-EXAMPLE-B,Low
2026-11-10 09:30,,2026-11-10 09:30,SRV900000003,Fictional blank contract,Pending,Service Request,Sam Example,EXAMPLE_EUC,,Low
`;
const {headers, rows} = parseCsv(CSV);
const tickets = normalizeTickets(rows, detectColumns(headers));
const daily = {tickets, mode: 'daily', to: 'team@example.com', reportDate: '2026-11-10', counts: {created: 3, closed: 1, pending: 2}};

test('contractSummary counts nonblank contracts and tickets with no contract', () => {
  assert.deepEqual(contractSummary(tickets), {contracts: 2, blank: 1});
});

test('daily report with All contracts now asks for confirmation (was skipped before RD-01)', () => {
  const guard = exportGuard({...daily, contracts: null});
  assert.equal(guard.block, null);
  assert.match(guard.confirm, /Report: Daily activity · 2026-11-10/);
  assert.match(guard.confirm, /All contracts \(2 in this export, plus 1 ticket with no contract\)/);
  assert.match(guard.confirm, /To: team@example\.com/);
  assert.match(guard.confirm, /3 created, 1 closed\/resolved, 2 outstanding/);
});

test('a selected contract exports without a dialog in every mode', () => {
  for (const mode of ['daily', 'pending', 'monthly']) {
    assert.deepEqual(exportGuard({...daily, mode, asAt: '2026-11-10', contracts: ['CN-EXAMPLE-A']}), {block: null, confirm: null}, mode);
  }
});

test('an explicitly empty contract selection is blocked in every mode (owner decision)', () => {
  for (const mode of ['daily', 'pending', 'monthly']) {
    assert.deepEqual(exportGuard({...daily, mode, asAt: '2026-11-10', contracts: []}), {block: EMPTY_SCOPE_MESSAGE, confirm: null}, mode);
  }
});

test('a selected contract that is not in the export stays blocked', () => {
  const guard = exportGuard({...daily, contracts: ['CN-EXAMPLE-GONE']});
  assert.match(guard.block, /missing from this export: CN-EXAMPLE-GONE/);
  assert.equal(guard.confirm, null);
});

test('a missing Contract column asks for confirmation and says why', () => {
  const guard = exportGuard({...daily, contracts: null, hasContractColumn: false});
  assert.match(guard.confirm, /no Contract column/);
});

test('pending and monthly keep their existing blocks and ask for confirmation on All contracts', () => {
  assert.equal(exportGuard({...daily, mode: 'monthly', asAt: '', contracts: null}).block, 'Choose the monthly reporting date.');
  assert.equal(exportGuard({...daily, mode: 'pending', scopeError: 'Saved groups are missing from this export.', contracts: null}).block, 'Saved groups are missing from this export.');
  assert.equal(exportGuard({...daily, mode: 'daily', scopeError: 'Saved groups are missing from this export.', contracts: ['CN-EXAMPLE-A']}).block, null, 'daily ignores the outstanding-mode setup error, as before');
  const pending = exportGuard({...daily, mode: 'pending', asAt: '2026-11-10', contracts: null, counts: {total: 2}});
  assert.match(pending.confirm, /Report: Outstanding tickets/);
  assert.match(pending.confirm, /2 outstanding\./);
});

test('recipients not configured are shown as such', () => {
  assert.match(exportGuard({...daily, to: '', contracts: null}).confirm, /To: \(not configured\)/);
});

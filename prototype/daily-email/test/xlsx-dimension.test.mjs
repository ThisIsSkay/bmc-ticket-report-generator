// RD-03: a populated worksheet whose <dimension> claims "A1", next to three
// empty worksheets, must be read in full. Fictional fixture, built at test time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseXlsx} from '../lib/xlsx-lite.mjs';
import {normalizeTickets, detectColumns, generateReport} from '../lib/report-core.mjs';
import {dimensionFixtures, worksheetDimension, SHEET_NAMES, POPULATED_SHEET, REPORT_DATE, HEADERS, EXPECTED} from '../../../scripts/fixtures/dimension-a1.mjs';

const XLSX = createRequire(import.meta.url)('xlsx');
const {wellFormed, malformed} = dimensionFixtures(XLSX);

test('the fixture really is malformed only in the populated sheet dimension', () => {
  assert.equal(worksheetDimension(XLSX, malformed, 4), 'A1');
  assert.equal(worksheetDimension(XLSX, wellFormed, 4), 'A1:M13');
});

test('xlsx-lite picks the fourth sheet and reads every row and column despite dimension A1', async () => {
  const parsed = await parseXlsx(malformed);
  assert.equal(parsed.name, POPULATED_SHEET);
  assert.deepEqual(parsed.worksheets, SHEET_NAMES.map((name) => ({name, count: name === POPULATED_SHEET ? EXPECTED.dataRows : 0})));
  assert.deepEqual(parsed.headers, HEADERS);
  assert.equal(parsed.rows.length, EXPECTED.dataRows);
  assert.deepEqual(parsed.rows.map((row) => row['Ticket ID']), EXPECTED.ticketIds, 'IDs keep their leading zeros');
  assert.deepEqual(parsed, await parseXlsx(wellFormed), 'identical to the well-formed workbook');
});

test('report totals match the fixture expectations, dates preserved', async () => {
  const parsed = await parseXlsx(malformed);
  const tickets = normalizeTickets(parsed.rows, detectColumns(parsed.headers));
  assert.equal(tickets[0].created, REPORT_DATE);
  assert.equal(tickets[3].resolved, REPORT_DATE);
  assert.equal(tickets[0].contract, 'CN-EXAMPLE-A');
  assert.deepEqual(generateReport(tickets, {reportDate: REPORT_DATE}).counts, EXPECTED.email);
});

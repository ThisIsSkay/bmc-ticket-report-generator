// RD-03 regression fixture (fictional data only).
//
// Some BMC exports carry a worksheet whose <dimension ref="A1"/> claims a
// single cell although the sheet holds thousands of rows, next to three empty
// worksheets. This module builds an equivalent fictional workbook, in a
// well-formed copy and a malformed copy that differ ONLY in that dimension
// element, so every tool's XLSX reader can be tested against both.
//
// SheetJS is passed in (XLSX) so the same fixture serves the WhatsApp app
// (node_modules), the email tool and the survey tests. Bytes are generated at
// test time; nothing binary is committed.

export const SHEET_NAMES = ['1-Export', '2-Export', '3-Export', '4-All Tickets'];
export const POPULATED_SHEET = '4-All Tickets';
export const REPORT_DATE = '2026-11-10';
export const HEADERS = ['Submit Date', 'Resolved Date', 'Last Modified Date', 'Ticket ID', 'Description', 'Status', 'Incident Type', 'Assigned Engineer', 'Assigned Group', 'Contract Number', 'Priority', 'Customer Name', 'Customer Company'];

/** Excel 1900-system serial for a wall-clock time (no time zone involved). */
export function serial(date, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return (Date.UTC(y, m - 1, d, h, mi) - Date.UTC(1899, 11, 30)) / 86400000;
}

// [submit, resolved, modified, id, status, type, engineer, contract, customer]
const PLAN = [
  [['2026-11-10', '09:00'], null, ['2026-11-10', '09:00'], 'INC000009000001', 'Assigned', 'User Service Restoration', 'Alex Example', 'CN-EXAMPLE-A', 'Casey Example'],
  [['2026-11-10', '10:00'], ['2026-11-10', '11:00'], ['2026-11-10', '11:00'], 'INC000009000002', 'Resolved', 'User Service Restoration', 'Jamie Example', 'CN-EXAMPLE-A', 'Drew Example'],
  [['2026-11-10', '11:30'], null, ['2026-11-10', '11:30'], 'SRV000009000003', 'Pending', 'User Service Request', 'Alex Example', 'CN-EXAMPLE-B', 'Robin Example'],
  [['2026-11-09', '14:00'], ['2026-11-10', '09:30'], ['2026-11-10', '09:30'], 'INC000009000004', 'Closed', 'User Service Restoration', 'Jamie Example', 'CN-EXAMPLE-A', 'Casey Example'],
  [['2026-11-08', '08:15'], null, ['2026-11-09', '16:00'], 'INC000009000005', 'Assigned', 'User Service Restoration', 'Alex Example', 'CN-EXAMPLE-B', 'Morgan Example'],
  [['2026-11-07', '13:00'], ['2026-11-07', '15:00'], ['2026-11-07', '15:00'], 'INC000009000006', 'Resolved', 'User Service Restoration', 'Jamie Example', 'CN-EXAMPLE-A', 'Drew Example'],
  [['2026-11-10', '12:00'], null, ['2026-11-10', '12:30'], 'SRV000009000007', 'Work In Progress', 'User Service Request', 'Alex Example', 'CN-EXAMPLE-A', 'Robin Example'],
  [['2026-11-05', '10:00'], ['2026-11-10', '10:00'], ['2026-11-10', '10:00'], 'INC000009000008', 'Cancelled', 'User Service Restoration', 'Jamie Example', 'CN-EXAMPLE-B', 'Morgan Example'],
  [['2026-11-10', '15:45'], null, ['2026-11-10', '15:45'], 'INC000009000009', 'Assigned', 'User Service Restoration', 'Jamie Example', 'CN-EXAMPLE-A', 'Casey Example'],
  [['2026-11-03', '09:00'], ['2026-11-10', '16:00'], ['2026-11-10', '16:00'], 'INC000009000010', 'Resolved', 'User Service Restoration', 'Alex Example', 'CN-EXAMPLE-A', 'Drew Example'],
  [['2026-11-10', '08:30'], ['2026-11-10', '17:00'], ['2026-11-10', '17:00'], 'SRV000009000011', 'Resolved', 'User Service Request', 'Jamie Example', 'CN-EXAMPLE-B', 'Robin Example'],
  [['2026-11-02', '11:00'], null, ['2026-11-06', '09:00'], 'INC000009000012', 'Pending', 'User Service Restoration', 'Alex Example', 'CN-EXAMPLE-A', 'Morgan Example'],
];

/** Data rows as raw cell values: dates are numeric serials, as in real BMC exports. */
export const ROWS = PLAN.map(([submit, resolved, modified, id, status, type, engineer, contract, customer], i) => [
  serial(...submit), resolved ? serial(...resolved) : '', serial(...modified), id,
  `Fictional ticket ${i + 1}`, status, type, engineer, 'EXAMPLE_EUC', contract, i % 3 === 0 ? 'High' : 'Low', customer, 'Example Company',
]);

/** Hand-derived expectations for REPORT_DATE (see PLAN above). */
export const EXPECTED = {
  dataRows: ROWS.length,
  columns: HEADERS.length,
  ticketIds: PLAN.map((row) => row[3]),
  firstSubmit: '2026-11-10 09:00',
  // Email daily report: created on the date; Closed/Resolved on the date; not Closed/Resolved/Cancelled.
  email: { created: 6, closed: 4, pending: 6 },
  // WhatsApp: submitted on the date and not Cancelled, all in team EUC.
  whatsappNewEuc: 6,
};

const DATE_FORMAT = 'yyyy-mm-dd hh:mm';
const DATE_COLUMNS = new Set([0, 1, 2]);

function populatedSheet(XLSX) {
  const sheet = {};
  [HEADERS, ...ROWS].forEach((row, r) => row.forEach((value, c) => {
    if (value === '') return;
    const address = XLSX.utils.encode_cell({ r, c });
    sheet[address] = r > 0 && DATE_COLUMNS.has(c) ? { t: 'n', v: value, z: DATE_FORMAT } : { t: 's', v: String(value) };
  }));
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ROWS.length, c: HEADERS.length - 1 } });
  return sheet;
}

/** The well-formed workbook: three empty worksheets, then the populated one. */
export function buildWorkbook(XLSX) {
  const book = XLSX.utils.book_new();
  for (const name of SHEET_NAMES.slice(0, 3)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), name);
  XLSX.utils.book_append_sheet(book, populatedSheet(XLSX), POPULATED_SHEET);
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
}

const sheetEntry = (cfb, XLSX, index) => XLSX.CFB.find(cfb, `Root Entry/xl/worksheets/sheet${index}.xml`);

/** The <dimension ref> of worksheet N (1-based) in an .xlsx. */
export function worksheetDimension(XLSX, bytes, index = 4) {
  const entry = sheetEntry(XLSX.CFB.read(bytes, { type: 'array' }), XLSX, index);
  return /<dimension ref="([^"]*)"/.exec(new TextDecoder().decode(entry.content))?.[1] ?? null;
}

/** A copy of the workbook whose worksheet N claims the given dimension; nothing else changes. */
export function withDimension(XLSX, bytes, ref = 'A1', index = 4) {
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const entry = sheetEntry(cfb, XLSX, index);
  const xml = new TextDecoder().decode(entry.content);
  const patched = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${ref}"/>`);
  if (patched === xml) throw new Error('Worksheet has no dimension element to patch.');
  entry.content = new TextEncoder().encode(patched);
  entry.size = entry.content.length;
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}

/** Both copies: { wellFormed, malformed }. */
export function dimensionFixtures(XLSX) {
  const wellFormed = buildWorkbook(XLSX);
  return { wellFormed, malformed: withDimension(XLSX, wellFormed, 'A1') };
}

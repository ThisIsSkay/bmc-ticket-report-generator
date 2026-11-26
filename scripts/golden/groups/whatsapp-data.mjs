// WhatsApp report data goldens: the numbers behind the report image and the
// dashboard diagnostics, computed by the app's own TypeScript modules (loaded
// through Vite's SSR loader, no build step). Pure Node, no browser.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { repoRoot, stableJson, withFixedClock } from '../lib/util.mjs';

const XLSX = createRequire(resolve(repoRoot, 'package.json'))('xlsx');

// Fictional export using the real BMC header names, with three empty sheets
// first (the real export's shape) and adversarial rows.
const BMC_HEADERS = ['Submit Date', 'Submitter', 'Resolved Date', 'Last Modified Date', 'Customer Company', 'Status', 'Incident Type', 'Ticket ID', 'Description ', 'Assigned Group', 'Assigned Engineer', 'Priority', 'Contract Number'];
const d = (iso) => new Date(iso); // local time (TZ is fixed by the harness)
const BMC_ROWS = [
  [d('2026-11-10T08:00:00'), 'Portal', '', d('2026-11-10T08:05:00'), 'Example Co', 'Assigned', 'Incident', 'INC200000001', '<script>alert(1)</script> & "quoted"', 'EXAMPLE_EUC', 'Alex Example', 'High', 'CN-EXAMPLE-1'],
  [d('2026-11-10T08:30:00'), 'Portal', d('2026-11-10T09:00:00'), d('2026-11-10T09:00:00'), 'Example Co', 'Resolved', 'Incident', 'INC200000002', 'x'.repeat(260), 'EXAMPLE_EUC', 'Jamie Example', 'Medium', 'CN-EXAMPLE-1'],
  [d('2026-11-10T09:00:00'), 'Portal', d('2026-11-10T12:00:00'), d('2026-11-10T12:00:00'), 'Example Co', 'Closed', 'Service Request', 'SRV200000003', 'New joiner onboarding for José Example', 'EXAMPLE_EUC', 'Jamie Example', 'Low', 'CN-EXAMPLE-2'],
  [d('2026-11-10T09:30:00'), 'Portal', d('2026-11-10T10:00:00'), d('2026-11-10T10:00:00'), 'Example Co', 'Cancelled', 'Service Request', 'SRV200000004', 'Cancelled request', 'EXAMPLE_NETWORK', 'Sam Example', 'Low', 'CN-EXAMPLE-2'],
  [d('2026-11-01T10:00:00'), 'Portal', d('2026-11-03T10:00:00'), d('2026-11-03T10:00:00'), 'Example Co', 'Resolved', 'Incident', 'INC200000005', 'Reopened ticket (older row)', 'EXAMPLE_SYSTEM', 'Chris Example', 'Medium', 'CN-EXAMPLE-1'],
  [d('2026-11-01T10:00:00'), 'Portal', '', d('2026-11-09T16:00:00'), 'Example Co', 'Pending', 'Incident', 'INC200000005', 'Reopened ticket (latest row)', 'EXAMPLE_SYSTEM', 'Chris Example', 'Medium', 'CN-EXAMPLE-1'],
  [d('2026-10-02T10:00:00'), 'Portal', '', d('2026-10-20T10:00:00'), 'Example Co', 'On Hold', 'Incident', 'INC200000006', 'Blank engineer', 'EXAMPLE_EUC', '', 'Low', 'CN-EXAMPLE-1'],
  [d('2026-11-10T07:00:00'), 'Monitor', '', d('2026-11-10T07:00:00'), 'Example Co', 'Assigned', 'Event', 'EVT200000007', 'Monitoring event', 'EXAMPLE_NOC', 'Monitor Example', 'Low', 'CN-EXAMPLE-1'],
  [d('2026-09-15T10:00:00'), 'Portal', '', d('2026-09-15T10:00:00'), 'Example Co', 'Pending', 'Forward Schedule', 'FSC200000008', 'Preventive maintenance', 'EXAMPLE_SYSTEM', 'Sam Example', 'Low', ''],
  [d('2026-08-01T10:00:00'), 'Portal', '', d('2026-08-02T10:00:00'), 'Example Co', 'Waiting User Reply', 'Service Request', 'SRV200000009', 'Offboarding: terminate access for leaver', 'EXAMPLE_EUC', 'Alex Example', 'Medium', 'CN-EXAMPLE-2'],
  ['10/11/2026', 'Portal', '', '10/11/2026', 'Example Co', 'Work in Progress', 'Incident', 'INC200000010', 'Ambiguous slash date', 'EXAMPLE_NETWORK', 'Chris Example', 'High', 'CN-EXAMPLE-1'],
  ['13/11/2026', 'Portal', '', '13/11/2026', 'Example Co', 'New', 'Incident', 'INC200000011', 'Day-first slash date', 'EXAMPLE_NETWORK', 'Chris Example', 'High', 'CN-EXAMPLE-1'],
  ['31/02/2026', 'Portal', '', '', 'Example Co', 'Mystery Status', 'Incident', 'CHG200000012', 'Invalid date, unknown prefix and status', 'EXAMPLE_EUC', 'Unmapped Example', '', 'CN-EXAMPLE-1'],
  [d('2026-11-10T13:00:00'), 'Portal', '', d('2026-11-10T13:00:00'), 'Example Co', 'Pending', 'Service Request', 'SRV200000013', 'Schedule a planned work window', 'EXAMPLE <GROUP> & CO', 'Sam Example', 'Critical', 'CN-EXAMPLE-2'],
];

const TEAMS_EXPLICIT = { EUC: ['Alex Example', 'Jamie Example'], System: ['Sam Example'], Network: ['Chris Example'] };
const TEAMS_SAMPLE = { EUC: ['EUC Analyst', 'EUC Engineer'], System: ['Systems Analyst', 'Systems Engineer'], Network: ['Network Analyst', 'Network Engineer'] };

const view = (t) => ({ ...t, raw: undefined }); // raw rows are recorded once in inputs

function hostileWorkbookBytes() {
  const book = XLSX.utils.book_new();
  for (const name of ['1-AsiaPac', '2-AsiaPac', '3-AsiaPac']) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), name);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([BMC_HEADERS, ...BMC_ROWS], { cellDates: true }), '4-AsiaPac All Tickets');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
}

// The bundled sample uses the six placeholder engineer names that loadConfig()
// deliberately resets, so a saved selection cannot reach the dashboard. The
// visual golden renames them to fictional people; every other cell is unchanged.
const SAMPLE_RENAMES = { 'EUC Analyst': 'Alex Example', 'EUC Engineer': 'Jamie Example', 'Systems Analyst': 'Sam Example', 'Systems Engineer': 'Pat Example', 'Network Analyst': 'Chris Example', 'Network Engineer': 'Lee Example' };
function renamedSampleBytes() {
  const book = XLSX.read(readFileSync(resolve(repoRoot, 'public/sample-bmc-export.xlsx')), { type: 'buffer', cellDates: true });
  const sheet = book.Sheets.Tickets;
  for (const [address, cell] of Object.entries(sheet)) if (!address.startsWith('!') && typeof cell.v === 'string' && SAMPLE_RENAMES[cell.v]) { cell.v = SAMPLE_RENAMES[cell.v]; delete cell.w; delete cell.h; delete cell.r; }
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
}

/** Inputs shared with the visual group: file bytes, the saved team selection and column mapping. */
export function visualFixtures() {
  return {
    sample: {
      fileName: 'sample-bmc-export.xlsx', bytes: renamedSampleBytes(),
      teams: { EUC: ['Alex Example', 'Jamie Example'], System: ['Pat Example', 'Sam Example'], Network: ['Chris Example', 'Lee Example'] },
      mapping: { ticketId: 'Display ID', assignedTo: 'Assigned To', status: 'Status', ticketType: 'Ticket Type', summary: 'Summary', createdDate: 'Created Date', closedDate: 'Closed Date', supportGroup: 'Support Group', contract: 'Contract' },
    },
    hostile: {
      fileName: 'fictional-bmc-export.xlsx', bytes: hostileWorkbookBytes(), teams: TEAMS_EXPLICIT,
      mapping: { ticketId: 'Ticket ID', assignedTo: 'Assigned Engineer', status: 'Status', ticketType: 'Incident Type', summary: 'Description', createdDate: 'Submit Date', closedDate: 'Resolved Date', supportGroup: 'Assigned Group', contract: 'Contract Number' },
    },
  };
}

export async function generate() {
  const { createServer } = await import(resolve(repoRoot, 'node_modules/vite/dist/node/index.js'));
  const server = await createServer({ root: repoRoot, configFile: resolve(repoRoot, 'vite.config.ts'), logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  const files = new Map();
  try {
    const load = (p) => server.ssrLoadModule(p);
    const imp = await load('/src/lib/import.ts');
    const norm = await load('/src/lib/normalize.ts');
    const rep = await load('/src/lib/report.ts');
    const { defaultConfig, defaultFilters } = await load('/src/config/defaults.ts');

    const hostileBytes = hostileWorkbookBytes();

    const fixtures = [
      { name: 'sample', bytes: readFileSync(resolve(repoRoot, 'public/sample-bmc-export.xlsx')), teams: [['explicit', TEAMS_SAMPLE]], dates: ['2026-09-08', '2026-09-09'] },
      { name: 'hostile', bytes: hostileBytes, teams: [['explicit', TEAMS_EXPLICIT], ['inferred', null], ['none', { EUC: [], System: [], Network: [] }]], dates: ['2026-11-10', '2026-11-03', '2026-10-11'] },
    ];

    await withFixedClock(async () => {
      for (const fixture of fixtures) {
        // Same read options as parseWorkbookFile (src/lib/import.ts).
        const workbook = XLSX.read(fixture.bytes, { type: 'array', cellDates: true, dense: true });
        const parsed = { fileName: fixture.name + '.xlsx', workbook, sheetNames: workbook.SheetNames };
        const sheet = imp.recommendWorksheet(parsed);
        const { headers, rows } = imp.readWorksheet(parsed, sheet);
        const mapping = imp.autoDetectColumns(headers);
        files.set(`whatsapp/data/${fixture.name}/inputs.json`, stableJson({ sheetNames: parsed.sheetNames, recommendedSheet: sheet, headers, mapping, fingerprint: imp.mappingFingerprint(headers), rows }));
        for (const [teamsName, teamsValue] of fixture.teams) {
          let teams = teamsValue;
          if (!teams) teams = norm.inferTeamMappingFromTickets(norm.normalizeRows(rows, mapping, defaultConfig));
          const config = { ...defaultConfig, teams };
          const tickets = norm.normalizeRows(rows, mapping, config);
          const out = {
            teams,
            teamMappingErrors: norm.validateTeamMapping(teams),
            tickets: tickets.map(view),
            validation: rep.buildValidation(tickets),
            assignees: rep.availableAssignees(tickets),
            byDate: {},
          };
          for (const reportDate of fixture.dates) {
            const filters = { ...defaultFilters, reportDate };
            const filtered = rep.filterTickets(tickets, filters, { protectResolvedOnReportDate: true });
            const narrowed = rep.filterTickets(tickets, { ...filters, team: 'EUC', startDate: '2026-11-01', search: 'example' }, { protectResolvedOnReportDate: true });
            out.byDate[reportDate] = {
              filterDescription: rep.filterDescription(filters),
              metrics: rep.aggregateTickets(filtered, reportDate),
              outOfScope: rep.outOfScopeByGroup(filtered),
              pendingDiagnostics: rep.pendingDiagnostics(filtered),
              reportPendingDiagnostics: rep.reportPendingDiagnostics(filtered),
              reportPendingTicketIds: rep.reportPendingTickets(filtered).map((t) => [t.id, t.sourceIndex]),
              closedOnReportDateIds: rep.closedOnReportDateTickets(filtered, reportDate).map((t) => [t.id, t.sourceIndex]),
              narrowedFilter: { description: rep.filterDescription({ ...filters, team: 'EUC', startDate: '2026-11-01', search: 'example' }), metrics: rep.aggregateTickets(narrowed, reportDate) },
            };
          }
          files.set(`whatsapp/data/${fixture.name}/${teamsName}.json`, stableJson(out));
        }
      }
    });
  } finally {
    await server.close();
  }
  return files;
}

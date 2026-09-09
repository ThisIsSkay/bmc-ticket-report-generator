# BMC Ticket Report Generator

🌐 **[Open the BMC Ticket Report Generator](https://thisisskay.github.io/bmc-ticket-report-generator/)**

A local-only React/TypeScript web app for turning the daily AsiaPac/BMC Excel export into the Excel-style landscape report shown in the supplied reference screenshot, with one-click WhatsApp-friendly JPEG export.

## Daily workflow

1. Upload the fresh BMC `.xlsx`, `.xls`, or `.csv` export.
2. The app automatically recommends the worksheet containing the largest data table. This is useful for the supplied **AsiaPac All Tickets Report - Dynamic Preview** workbook, where the raw ticket table is not the first worksheet.
3. Confirm the automatically detected BMC columns.
4. Select the engineers who belong to **EUC**, **System**, and **Network**.
5. Confirm/edit status and category rules.
6. Open **Report Dashboard** and save the report as JPEG.

The engineer selection is remembered in browser local storage for the next day's export.

## Engineer selection

The report uses **Assigned Engineer** as the final team-classification field.

- An engineer can be selected for EUC, System, or Network.
- Matching is case-insensitive and trims surrounding spaces.
- One engineer/alias cannot belong to multiple teams.
- The picker is populated from the names in the uploaded file.
- **Use BMC suggestions** looks at the engineer's dominant EUC/System/Network **Assigned Group** during the latest 90 days present in the workbook.
- Any engineer not selected remains **Review / Unassigned** and is excluded from the three team report totals.
- Advanced aliases/spelling variations can still be edited and imported/exported as JSON or CSV.

For the supplied raw workbook, the current recent-group suggestions resolve to the active names present in the file rather than hard-coded sample names.

## Internal daily clock

The dashboard contains a live device clock. The clock automatically determines the report day and rolls over when the local date changes.

The daily calculations are intentionally different from a simple Created-Date filter:

- **New Tickets** = unique tickets whose **Submit Date** is the current report day, regardless of their current BMC status.
- **Closed** = unique tickets whose **Resolved Date** is the current report day **and** whose status normalizes to Closed. Cancelled tickets also carry a Resolved Date in BMC, but cancellation is not completed work and never counts as Closed throughput.
- **On/Off-Boarding, Schedule** = all outstanding (non-terminal) tickets categorized as Schedule, Onboarding, or Offboarding — including New/Assigned work not yet started. Closed and Cancelled are terminal.
- **Pending** (chart) = the remaining Pending/On-Hold backlog of any category after Schedule/Onboarding/Offboarding tickets have been separated into the first bucket. This is intentionally a **different metric** from the Pending line inside the On-hold Incidents summary, which counts Incident-category tickets only — the reference dashboard shows the two disagreeing, and that is expected.
- **Team summary — Total tickets** = current outstanding Schedule + Onboarding + Offboarding workload.
- **Schedule request / Onboarding / Offboarding** = breakdown of that backlog.
- **On-hold Incidents — Total** = current Incident backlog in Pending, On Hold, Work in Progress, or Waiting User Reply.
- **Pending** inside the incident table includes source statuses normalized to Pending or On Hold.
- **Work in Progress** and **Waiting User Reply** use their normalized report statuses.

All dashboard blocks use the same normalized ticket records. Duplicate Ticket IDs are counted once in report metrics — deterministically keeping the row with the most recent lifecycle information (latest Resolved Date, then latest Submit Date, then the later export row) — while every raw row remains visible in the detail screen.

## BMC raw export compatibility

The column detector is tuned for the supplied AsiaPac raw export and recognizes these mappings automatically:

| Report field | AsiaPac/BMC column |
| --- | --- |
| Ticket ID | `Ticket ID` |
| Assigned To | `Assigned Engineer` |
| Status | `Status` |
| Ticket type/category | `Incident Type` |
| Summary/description | `Description` |
| Created date | `Submit Date` |
| Closed date | `Resolved Date` |
| Support group | `Assigned Group` |
| Contract | `Contract Number` / `Contract ID+` |

The mapping screen remains available in case BMC changes column names in a future export.

## Category classification

The structured BMC **Incident Type** field is reliable, so it takes priority over loose description keywords:

| Incident Type | Category |
| --- | --- |
| `Incident` | **Incident** — even if the description mentions words like "onboarding" or "schedule" |
| `Forward Schedule / Preventive Maintenance` | **Schedule** |
| `Service Request` | Description keywords decide **Onboarding** → **Offboarding** → **Schedule**, otherwise **Other** |
| `Event` | **Other** (monitoring noise, not reportable engineer workload) |
| blank / unknown | Keyword fallback over type + description |

Default description keyword rules (editable in the UI):

- **Onboarding:** onboarding, onboard, new joiner, joiner
- **Offboarding:** offboarding, terminate access, leaver, termination, resignation
- **Schedule:** forward schedule, preventive maintenance, schedule, scheduling, planned work
- **Incident:** incident, outage, unavailable, error, failure (used by the fallback only)

Matching normalizes case and whitespace.

## Status defaults

- **New:** new, assigned, created
- **Pending:** pending
- **Closed:** closed, resolved
- **Work in Progress:** work in progress, in progress, wip
- **Waiting User Reply:** waiting user reply, awaiting user, pending user, waiting for user
- **On Hold:** on hold, hold
- **Cancelled:** cancelled, canceled — a separate status that never contributes to Closed throughput or outstanding backlog
- Anything else becomes **Other** until mapped.

Configurations saved by earlier versions that listed cancelled/canceled under Closed are migrated automatically on load.

The supplied AsiaPac raw workbook currently contains BMC values such as Closed, Cancelled, Pending, and Resolved; the editable mapping remains in place for future exports that contain additional states.

## Reference dashboard layout

The export canvas is fixed at **1800×950**, matching the wide proportions of the supplied Excel screenshot:

- upper-left: **New Tickets** column chart;
- lower-left: **Pending & Closed Tickets** chart;
- upper-right: stacked EUC, System, and Network summary boxes;
- lower-right: New Tickets input, Pending and Closed tickets input, and Feedback Form.

The chart panels use the same Excel-like white/grey gradient appearance and team colors:

- EUC — green
- System — dark blue/teal
- Network — purple/magenta

Summary/input blocks use thin black Excel-style borders and compact grey/white cells.

## Image export

The report canvas is the only DOM section captured. Buttons, filters, browser controls, and surrounding application UI are excluded.

- JPEG: **1800×950 × 1.5 = 2700×1425**
- PNG export
- Copy image to clipboard where supported
- Print / Save as PDF
- White background
- Filename: `BMC_Ticket_Report_YYYY-MM-DD.jpg`

## Screens

1. Upload Data
2. Column Mapping
3. Engineer Selection
4. Status & Category Rules
5. Report Dashboard
6. Detailed Ticket Data
7. Configuration Export / Import

## Privacy

There is no application backend. SheetJS reads the workbook in the browser, and all ticket processing stays in the active browser session. Ticket data is not sent to an application API or server. Browser local storage stores only configuration, engineer selections, column mappings, and feedback values.

## Development

Requirements: Node.js 20+.

```bash
npm ci
npm test
npm run build
npm run dev
```

`package-lock.json` is committed so that CI and local installs are reproducible; use `npm ci` rather than `npm install` unless you are intentionally changing dependencies.

### SheetJS

The project uses **SheetJS 0.20.3**, vendored at `vendor/xlsx-0.20.3.tgz` and referenced from `package.json` as `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`, so `npm ci` installs reproducibly without contacting `cdn.sheetjs.com` on every build.

> ⚠️ Provenance: the currently committed tarball was obtained via the `@e965/xlsx` npm registry mirror because `cdn.sheetjs.com` was unreachable from the environment that vendored it. Its MD5 is `f485cee690a4c2f96d7c8fd7768e5fc2`, which does **not** match the official SheetJS `xlsx-0.20.3.tgz` checksum `aac39517149362ea8123d8a303486c3c`, so it must not be treated as the official tarball. To replace it with the official build, run on a machine with CDN access:
>
> ```bash
> curl -o vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
> md5sum vendor/xlsx-0.20.3.tgz   # expect aac39517149362ea8123d8a303486c3c
> npm install                     # refreshes the lock-file hash
> ```

Open the Vite URL printed in the terminal.

## Validation behavior

- Empty and invalid workbooks show a clear import error.
- The most likely data worksheet is selected automatically, but can be changed manually.
- Missing required columns block processing.
- Invalid dates are flagged.
- Blank Assigned Engineer values remain unclassified.
- Duplicate engineer aliases across teams block the report until resolved.
- Unknown statuses become Other.
- Unmatched categories become Other.
- Duplicate Ticket IDs remain visible but count once in report totals.
- The detail table retains the original imported columns and rows.

## GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`.

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Push to `main` or run the deployment workflow manually.

Manual build:

```bash
npm ci
npm test
npm run build:gh-pages
```

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- No backend functions or environment variables required.

## Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Project structure

```text
src/
  components/ReportCanvas.tsx   Fixed Excel-style export canvas
  config/defaults.ts            BMC column synonyms + default rules
  lib/clock.ts                  Automatic local report date/time
  lib/import.ts                 SheetJS parsing + worksheet recommendation
  lib/normalize.ts              Team suggestions, classification and normalization
  lib/report.ts                 Daily report formulas, filters and validation
  lib/export.ts                 JPEG/PNG/clipboard/print capture
  screens/                      Seven application screens
  test/                         Unit tests
public/
  sample-bmc-export.xlsx        Fictional sample data only
  default-team-mapping.json
  default-rules.json
```

The uploaded real BMC workbook is **not** bundled into this repository; the included sample workbook remains fictional.

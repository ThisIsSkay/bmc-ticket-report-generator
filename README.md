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

## Engineer selection defines report ownership

The BMC system is shared with teams this report does not cover (for example application or NOC teams). Ownership is decided by **your explicit engineer selection**, never by group names, and no team name is hard-coded anywhere in the source.

**A ticket contributes to EUC/System/Network metrics only if its Assigned Engineer has been explicitly selected for one of those teams.**

- An engineer can be selected for EUC, System, or Network.
- Matching is case-insensitive and trims surrounding spaces.
- One engineer/alias cannot belong to multiple teams.
- The picker is populated from the names in the uploaded file.
- **Use BMC suggestions** is an explicit, optional action: it proposes engineers based on their dominant EUC/System/Network **Assigned Group** during the latest 90 days present in the workbook. Nothing is selected automatically on import.
- Every engineer you do not select stays **Review / Unassigned / out of scope** and is excluded from all three team totals. This is how other BMC teams are kept out of the report without naming them in code.
- A blank Assigned Engineer is never auto-assigned from its Assigned Group; it stays out of scope.
- Advanced aliases/spelling variations can still be edited and imported/exported as JSON or CSV.

### Out-of-scope transparency

Two diagnostics show exactly what the report excluded. Both live in the configuration UI only and never appear in the exported image:

- **Engineer Selection screen** — each unselected engineer with their ticket count and the Assigned Groups they work in.
- **Report Dashboard** — an *Out of Scope / Unassigned by Assigned Group* table (group name, ticket count).

## Internal daily clock

The dashboard contains a live device clock. The clock automatically determines the report day and rolls over when the local date changes.

The daily calculations are intentionally different from a simple Created-Date filter:

- **New Tickets** = unique tickets whose **Submit Date** is the current report day, regardless of their current BMC status.
- **Closed** = unique tickets whose **Resolved Date** is the current report day **and** whose status normalizes to Closed. Cancelled tickets also carry a Resolved Date in BMC, but cancellation is not completed work and never counts as Closed throughput.
- **On/Off-Boarding, Schedule** = all outstanding (non-terminal) tickets categorized as Schedule, Onboarding, or Offboarding — including New/Assigned work not yet started. Closed and Cancelled are terminal.
- **Pending** (chart) = the remaining Pending/On-Hold backlog of any ticket type after Schedule/Onboarding/Offboarding tickets have been separated into the first bucket. See *Pending is still under validation* below.
- **On/Off-Boarding, Schedule** and its breakdown come from outstanding **SRV** and **FSC** tickets; the incident summary counts **INC** tickets only.
- **Team summary — Total tickets** = current outstanding Schedule + Onboarding + Offboarding workload.
- **Schedule request / Onboarding / Offboarding** = breakdown of that backlog.
- **On-hold Incidents — Total** = current INC backlog in Pending, On Hold, Work in Progress, or Waiting User Reply.
- **Pending** inside the incident table includes source statuses normalized to Pending or On Hold.
- **Work in Progress** and **Waiting User Reply** use their normalized report statuses.

### Pending is still under validation

The chart's **Pending** bar and the **Pending** line inside each team's On-hold Incidents box are deliberately **different metrics**, and the tool does not force them to agree:

- chart Pending = every pending/on-hold ticket outside the On/Off-Boarding and Schedule bucket, of any ticket type;
- incident-summary Pending = INC tickets in Pending or On Hold only.

The reference Excel dashboard shows Network with a chart Pending of 18 while its incident Pending is 16, which is consistent with the two metrics measuring different populations. **This rule is not final** and is being observed across several real reporting days before it is confirmed; the current behavior is unchanged in the meantime. To observe it, the Report Dashboard shows a *Pending breakdown* diagnostic — per team: the chart total and its INC / SRV / other-prefix split, plus a per-Assigned-Group breakdown. Like the out-of-scope table, it appears in the UI only and never in the exported image.

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

## Ticket type and category classification

The **Ticket ID prefix** is authoritative — it is the most reliable indicator BMC provides, and it beats any wording found in the description.

| Ticket ID prefix | Ticket type | Category |
| --- | --- | --- |
| `INC…` | Incident | **Incident**, always |
| `SRV…` | Service Request | **Onboarding** / **Offboarding** / **Schedule** from the structured type and description keywords, otherwise **Other** |
| `FSC…` | Forward Schedule | **Schedule**, always |
| `EVT…` | Event | **Other** (monitoring noise, not reportable engineer workload) |
| anything else | Unknown | **Other**, and the prefix is reported in validation rather than guessed at |

Prefix matching is case-insensitive and ignores surrounding whitespace.

An INC ticket stays an Incident even when its description contains words such as "onboarding", "offboarding" or "schedule". Schedule work comes from either an `FSC` ticket or an SRV ticket that matches the schedule rules; only SRV tickets can become Onboarding or Offboarding.

Default description keyword rules for service requests (editable in the UI):

- **Onboarding:** onboarding, onboard, new joiner, joiner
- **Offboarding:** offboarding, terminate access, leaver, termination, resignation
- **Schedule:** forward schedule, preventive maintenance, schedule, scheduling, planned work
- **Incident:** incident, outage, unavailable, error, failure (retained for configuration; the INC prefix decides incidents)

An SRV ticket whose structured Incident Type is `Forward Schedule / Preventive Maintenance` is also classified as Schedule regardless of its description.

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

The committed tarball is the official SheetJS distribution. Its checksum matches the one published by SheetJS:

```bash
md5sum vendor/xlsx-0.20.3.tgz
# aac39517149362ea8123d8a303486c3c
```

Re-verify that checksum after any future dependency update; the npm registry's `xlsx` package is outdated and is deliberately not used.

## Validation behavior

- Empty and invalid workbooks show a clear import error.
- The most likely data worksheet is selected automatically, but can be changed manually.
- Missing required columns block processing.
- Invalid dates are flagged.
- Blank Assigned Engineer values remain unclassified.
- Duplicate engineer aliases across teams block the report until resolved.
- Unknown statuses become Other.
- Service requests matching no category keyword become Other and are counted separately from Event/unknown tickets, which are Other by design.
- Unrecognized Ticket ID prefixes are listed with their counts instead of being treated as INC or SRV.
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

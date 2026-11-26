# Phase 0 baseline

Recorded on 2026-11-26 from `main` at `1a74ff4` (on `integration/unified-app`) and
from `feature/daily-pivot-email-report` at `3fcc777` (a separate read-only
worktree). Later phases must reach at least these counts.

## Environment

| Item | Version |
|---|---|
| Node.js | v22.23.4 |
| npm | 10.9.9 |
| Playwright | 1.63.0 |
| Chromium (Playwright build 1243) | 153.0.8010.12 |
| OS | Linux (cloud container), headless |

## Test counts

### `main` at `1a74ff4`

| Command | Result | Time |
|---|---|---|
| `npm ci` | OK | — |
| `npm test` (Vitest) | **61/61 passed** (6 files) | 1.3 s |
| `npm run typecheck` | OK | 0.6 s |
| `npm run build:gh-pages` | OK (existing warning: a chunk over 500 kB) | 2.0 s |
| `npm run test:survey` | **13/13 passed** | 0.3 s |
| `scripts/verify-survey.mjs` (server: `python3 -m http.server 4180 --bind 127.0.0.1 --directory prototype/customer-survey`) | **3/3 runs passed** | — |

### `feature/daily-pivot-email-report` at `3fcc777`

| Command | Result |
|---|---|
| `node --test prototype/daily-email/test/*.test.mjs` | **117/117 passed** (0.5 s) |
| `node --check` on every `prototype/daily-email/**/*.mjs` | 18 files, 0 failures |
| `scripts/verify-weekly.mjs` | **3/3 runs passed** |
| `scripts/verify-outstanding.mjs` | **2/3 runs passed.** Run 3 timed out waiting for a download at `scripts/verify-outstanding.mjs:47` (`download()` at line 23). This is the harness flake already recorded in `prototype/daily-email/HANDOFF.md` (R7 "only partly fixed"), not a new app failure. |
| `scripts/verify-header-logo.mjs` | **3/3 runs passed** |

The email verify scripts need `node prototype/daily-email/server.mjs`
(port 4177; override with `BMC_PREVIEW_URL`), Playwright on `NODE_PATH`, and a
resolvable `xlsx` package. `CHROMIUM_PATH` is optional.

Note: `node --test prototype/daily-email/test/` (a directory argument) fails on
Node 22 with `MODULE_NOT_FOUND`. Pass the files with a glob, as above.

## Storage inventory

All three tools are served from one GitHub Pages origin
(`thisisskay.github.io`), so they share one `localStorage` quota (usually about
5 MB per origin). The email settings can be large because signatures and the
header logo are stored inline as data URLs.

### WhatsApp report (`src/lib/storage.ts`)

| Key | Read | Write | Value | Typical size |
|---|---|---|---|---|
| `bmc-report:config:v2` | `loadConfig` :34-35, `hasSavedWorkflowSetup` :103 | `saveConfig` :66-67 | JSON `AppConfig`: `teams` {EUC, System, Network: string[]}, `statuses` {8 report statuses: alias[]}, `categories` {Onboarding, Offboarding, Schedule, Incident: keyword[]} | about 1–3 KB |
| `bmc-report:config:v1` (legacy) | `loadConfig` :35 fallback, `hasSavedWorkflowSetup` :103 | never (read-only migration) | Same shape. On load, `cancelled`/`canceled` aliases are stripped from Closed, and the six old placeholder team names reset the teams | about 1 KB |
| `bmc-report:column-mapping:v2` | `loadColumnMapping` :70-71, `hasSavedWorkflowSetup` :102 | `saveColumnMapping` :75-76 | JSON `ColumnMapping`: 9 keys → source header names | under 0.5 KB |
| `bmc-report:column-mapping:v1` (legacy) | `loadColumnMapping` :71 fallback, :102 | never | Same shape | under 0.5 KB |
| `bmc-report:feedback:v1` | `loadFeedback` :79-80 | `saveFeedback` :84-85 | JSON {EUC, System, Network: number} | under 0.1 KB |
| `bmc-report:theme:v1` | `loadTheme` :88-90 | `saveTheme` :96-97 | plain string `light` or `dark` (not JSON) | 5 bytes |

Every read is wrapped in try/catch. The writes (`save*`) are not, so a full or
blocked storage throws to the caller.

### Email reports (`prototype/daily-email/`, at `3fcc777`)

| Key | Read | Write | Value | Typical size |
|---|---|---|---|---|
| `bmc-daily-email-report:settings:v1` | `loadSettings` `app.mjs:19`; usage meter `app.mjs:111`; first-run modal check `app.mjs:295` | `storeSettings` `app.mjs:20` (debounced through `createDebouncedSaver`, `lib/settings-persistence.mjs`); `commitSettings` → `persistCandidate` `app.mjs:114`, `lib/header-logo.mjs:7` | JSON object normalised by `normalizeSettings` (`lib/settings-persistence.mjs:10`). Fields: `to`, `cc`, `bcc`, `subject`, `greeting`, `intro`, `client`, `reportContent` (daily / pending / monthly), `showEngineer`, `summaryOnly`, `pendingSubject`, `pendingIntro`, `monthlySubject`, `monthlyIntro`, `asAt`, `monthlyAsAt`, `emailVariant` (A–D, unknown → A), `emailSender` {name, title, company, phone}, `signatureId`, `signatures` [{id, name, content, html?}], `headerLogo` (data URL), `headerLogoName`, `reportSetup` {groups, types, statuses, contracts, events} | 1 KB without images; can reach hundreds of KB to MB with signature images and a logo |

Settings import/export uses a downloaded `settings.json` file (`app.mjs:277`)
with the same shape.

### Customer survey (`prototype/customer-survey/`, at `1a74ff4`)

No `localStorage`, `sessionStorage`, IndexedDB, cookies, caches or service
worker (searched `app.mjs`, `lib/*.mjs`, `index.html`). Files and decisions
live in tab memory only. `scripts/verify-survey.mjs` asserts that both storage
lengths stay 0.

### Fixtures for later migration tests

`docs/merge/fixtures/storage/` holds one fictional value per key, named after
the key with `:` replaced by `.`:

- `bmc-report.config.v2.json`, `bmc-report.column-mapping.v2.json`,
  `bmc-report.feedback.v1.json`, `bmc-report.theme.v1.txt` (raw string);
- `bmc-report.config.v1.legacy-cancelled-under-closed.json` and
  `bmc-report.config.v1.legacy-placeholder-teams.json`, the two legacy cases
  `loadConfig` rewrites;
- `bmc-daily-email-report.settings.v1.json`: every field, a signature with an
  inline PNG, a header logo, a monthly scope with two contracts and variant C;
- `bmc-daily-email-report.settings.v1.minimal-legacy.json`: an older,
  sparse value with an invalid variant `Z`, which loads as variant A.

Both email fixtures were loaded through the tool's own `normalizeSettings` at
`3fcc777`. The full fixture keeps variant C, the logo, monthly mode and both
contracts.

## Golden outputs

The harness (`scripts/golden/`) regenerates every output with each tool's own
code and compares it with `docs/merge/golden/`. It uses fictional inputs only
and makes no network requests: the browser blocks every outside host.

### Commands

```sh
# Phase 0: the email tool is read from a worktree pinned to the pre-merge commit
git worktree add --detach ../email-3fcc777 3fcc777
npm ci
NODE_PATH=<dir containing playwright> node scripts/golden/check.mjs --email-root=../email-3fcc777/prototype/daily-email

# After Phase 1 merges the email tool into this branch, --email-root can be omitted
node scripts/golden/check.mjs

# Options
#   --only=survey,email,whatsapp-data,whatsapp-visual   check some groups
#   --skip-visual                                       no browser (e.g. CI without Playwright)
#   GOLDEN_EMAIL_ROOT=<path>                            same as --email-root
```

`record.mjs` takes the same options and rewrites the goldens. Use it only from
the pre-merge commits, to move the goldens to a new environment, and note it in
`HANDOFF.md`. **Never re-record to make a failing check pass.**

The harness sets `TZ=Asia/Singapore`. Wherever a tool reads the current time it
sees 2026-11-10 09:00 SGT: a `Date` stub in Node, and `page.clock` in the
browser. With the clock fixed, the `.eml` `Date:` header and MIME boundary are
deterministic, so **no output needs normalising**. Files are compared byte for
byte, except as listed below.

### What is covered

| Group | Files | Source of truth | Comparison |
|---|---|---|---|
| `survey/` | 3 | `prototype/customer-survey/lib` at `1a74ff4` | JSON text |
| `email/` | 114 + 429 hashed combinations | `prototype/daily-email/lib` at `3fcc777` | text bytes; `.xlsx` by parsed cell values and cell types |
| `whatsapp/data/` | 6 | `src/lib/*.ts` at `1a74ff4` (loaded through Vite SSR) | JSON text |
| `whatsapp/visual/` | 8 images + `meta.json` | production build of `src/` at `1a74ff4`, exported with the app's own Save as PNG / Save as JPEG buttons | PNG: every pixel; JPEG: 2700×1425 and at most 0.1% of pixels off by more than 16 levels |

- **Survey:**
  - CSV import: UTF-8 with quotes and multi-line values, UTF-8 BOM with
    semicolons, UTF-16 LE and BE, Windows-1252 (requested and auto-detected),
    trailing blank column, malformed quote, extra values, CR-only lines;
  - directory validation: duplicates, shared email, invalid and angle-bracket
    addresses, hostile name;
  - 24 requesters through `matchBatch`: exact, case-only duplicate ticket,
    ambiguous, near-namesake, reordered, alias (normal and reversed),
    initials, accents, CJK, punctuation variants, zero-width space, title,
    blank, hostile, no match.
- **Email:**
  - fixtures: the tool's sample CSV, an adversarial CSV (hostile markup and
    quotes, 260-character unbroken text, accented and CJK text, cancelled,
    reopened, duplicate, monitoring event, forward schedule, future-dated,
    blank fields, unknown status, markup in a group name), and the same
    adversarial rows read through `xlsx-lite`;
  - core outputs stored in full, for 2 fixtures × daily (legacy, A–D),
    outstanding (A–D) and monthly (A–D): HTML, plain text, `.eml`, Classic
    Outlook `.ps1` (with the embedded workbook) and the workbook cells;
  - `matrix.json`: sha256 of every output for 15 one-setting-at-a-time
    variations across every mode and variant: no sender; plain, no or logo
    signature; no header logo; group filter; single, multiple and
    none-selected contracts; events included; engineer column; summary only;
    type/status scope; no age reference; intro without a period; no
    recipients. Also the XLSX-read path;
  - `sample-data/`: variants A–D from `docs/email-design/sample-data.json`,
    adapted exactly as the existing M4 test does.
- **WhatsApp data:**
  - fixtures: the bundled sample, and an adversarial export with the real
    BMC header names, three empty sheets first, all ticket prefixes,
    cancelled, reopened, blank engineer, ambiguous, day-first and invalid
    dates, and markup;
  - team mappings: explicit, inferred and none;
  - recorded: worksheet choice, column detection, normalised tickets,
    validation and, for several report dates, the aggregated metrics,
    out-of-scope counts, both pending diagnostics, pending and
    closed-on-date ticket lists, and a narrowed filter.
- **WhatsApp visual:** sample light, sample dark, sample on a second date,
  adversarial export. The bundled sample's six placeholder engineer names are
  renamed to fictional people, because `loadConfig()` deliberately resets
  those names, so a saved selection could not reach the dashboard. All other
  cells are unchanged.

### Determinism and sensitivity

- `check.mjs` was run twice in a row on 2026-11-26 after recording. All 132
  files passed both times, in about 13 s per run.
- Each group was then shown to fail on a deliberate, reverted change:
  - one email colour (`#1B3A5C` → `#1B3A5D`): email FAIL, reported at the
    exact column;
  - one survey reason string: survey FAIL;
  - New Tickets counted twice in `aggregateTickets`: whatsapp-data and
    whatsapp-visual FAIL;
  - report canvas top padding +1 px: whatsapp-visual FAIL (268,186 PNG
    pixels).

  A +1 px change to the canvas *bottom* padding did not change the export. The
  canvas has a fixed height and content does not move, so this is correct.
- The dark-theme export is byte-identical to the light-theme export, so the
  app theme does not leak into the image.
- The JPEG is byte-identical with Google Fonts blocked or allowed. The report
  canvas uses Arial.

### Environment dependence

Image pixels depend on the Chromium build and the installed fonts. Here Arial
resolves to Liberation Sans. The visual goldens are valid for the environment
listed at the top of this file. A GitHub-hosted runner has different fonts, so
Phase 1 should either run the visual group in a pinned container (the
Playwright image for Chromium 153) or run only `--skip-visual` in CI and the
full check locally. Data, email and survey goldens do not depend on the
environment.

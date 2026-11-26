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

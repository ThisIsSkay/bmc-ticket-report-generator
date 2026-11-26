BATON: Claude — real-data findings RD-01 to RD-03 (branch only, no publish) — 2026-11-26

# Unified app merge — handoff

Read this file and [PLAN.md](PLAN.md) before doing anything. Trust these files,
not chat history. Keep this file current after every commit.

## Purpose

Merge the WhatsApp report app, the email reports prototype and the customer
survey preview into one app, in phases 0–6 (see PLAN.md). Phase 0 records the
"before" state so later phases can prove they changed no output.

## Rules (condensed)

- Only the baton holder pushes. Fetch and check the baton line before pushing;
  set the next holder in your last commit.
- Push only to `integration/unified-app`. Never push to `main` or
  `feature/daily-pivot-email-report`. No PRs opened, merged or closed.
- Never rewrite history: no force-push, rebase, or amend of pushed commits.
- Phase 0 changes only `docs/merge/**` and `scripts/golden/**`.
- Fictional data only. If sensitive data is found in Git history, stop and
  report it.
- Business rules stay separate per tool. Suspected bugs are recorded here,
  not fixed, during Phase 0.
- `node scripts/golden/check.mjs` must pass after every later change.
  **Never re-record goldens to make a check pass.**

## Branch and tags

- Working branch: `integration/unified-app`, created from `main` at
  `1a74ff4`.
- Tags: `pre-merge/main-1a74ff4` → `1a74ff4`;
  `pre-merge/email-3fcc777` → `3fcc777`.
  **Not on GitHub yet:** the tags exist only in Claude's local clone. The
  session's git access refused the tag push (HTTP 403), while the branch push
  succeeded. The commits themselves are safe because `main` and
  `feature/daily-pivot-email-report` still contain them. **Owner action:**
  create the two tags (GitHub → Releases → "Draft a new release" → choose a tag
  → target the commit), or run, in any clone with push rights:
  `git tag -a pre-merge/main-1a74ff4 1a74ff4 -m "Rollback point" && git tag -a pre-merge/email-3fcc777 3fcc777 -m "Rollback point" && git push origin pre-merge/main-1a74ff4 pre-merge/email-3fcc777`
- Phase 0 reads the email tool through a separate worktree pinned to
  `3fcc777`. That branch is not merged in Phase 0.

## Roles

Codex was unavailable, so the owner asked Claude to lead Phase 0 as the
builder. The independent review is open: Codex (when available) or the owner.
A reviewer should follow the "Claude — Phase 0 review" steps in the owner's
sync message, with the roles swapped: re-run the baseline, run `check.mjs`
twice from a clean checkout, prove each group can fail, check coverage and
privacy, and record findings below.

## Phase checklist

- [x] **Phase 0 — Freeze and baseline** (owner approved by asking Claude to complete the merge)
  - [x] Step 1: branch, tags (local only, see above), PLAN.md, HANDOFF.md
  - [x] Step 2: baseline test counts (BASELINE.md)
  - [x] Step 3: storage inventory and fixtures
  - [x] Step 4: goldens (WhatsApp, email, survey) and determinism check
  - [x] Step 5: handover
- [x] Phase 0.1 — harness fixes from the ChatGPT review
- [x] Phase 1 — merge feature branch, self-contained deploy (`f8336a6`)
- [x] Phase 2 (fast version, owner decision) — unified app at `/app/`: tool bar, WhatsApp section native, Email and Survey pages in themed same-origin frames, one theme (`c731b0f`)
- [x] Publish — `integration/unified-app` fast-forwarded to `main`; Pages deploys `/`, `/app/`, `/daily-email/`, `/customer-survey/`
- [ ] **Codex bug check of the live `/app/`** (see "Codex bug-check brief" below)
- [ ] Phase 3 — rebuild the Email screens natively in React (3a, 3b, 3c) — later, after the bug check
- [ ] Phase 4 — rebuild the Survey screens natively in React — later
- [ ] Phase 5 — one upload, one Clear all data, one settings backup — later (owner chose separate uploads first)
- [ ] Phase 6 — hardening and switch-over (retire old pages after sign-off; keep them until then)

## Phase 0 results

- **Baseline:**
  - main: 61/61 Vitest, typecheck OK, `build:gh-pages` OK, 13/13 survey
    checks, `verify-survey` 3/3;
  - email branch: 117/117 node tests, 18 files pass `node --check`,
    `verify-weekly` 3/3, `verify-header-logo` 3/3, `verify-outstanding` 2/3
    (known harness flake).

  Details are in BASELINE.md.
- **Goldens:** 132 files plus 429 hashed email combinations in Phase 0;
  138 files and five groups after Phase 0.1. `check.mjs` passed twice in a
  row each time, and from a clean checkout of the pushed branch. Every group
  fails on a deliberate one-line change.
- **Only `docs/merge/**` and `scripts/golden/**` changed:**
  `git diff --stat origin/main..integration/unified-app` lists nothing else.

## Findings recorded during Phase 0 (not fixed)

| # | Severity | Finding | Where | Suggested phase |
|---|---|---|---|---|
| P0-1 | Medium (privacy/network) | The WhatsApp app loads Google Fonts (Figtree) for its app chrome on every visit. During an export, html-to-image requests the font CSS and files again (`cacheBust: true`). No ticket data is sent, but this is a third-party request the README privacy section doesn't mention, and it conflicts with "no new network calls" once all tools share the page. The report image itself uses Arial and is byte-identical with the fonts blocked. | `index.html:7-9`, `src/index.css:39`, `src/lib/export.ts:3-9` | Phase 2 (self-host the font or use system fonts) and the Phase 6 audit |
| P0-2 | Medium (business decision) | Ambiguous slash dates are read month-first: `10/11/2026` becomes 11 Oct 2026 in the WhatsApp app (golden fixture `INC200000010`). Singapore exports are usually DD/MM. Already an open owner decision; recorded so later phases don't "fix" it silently. | `src/lib/normalize.ts` `parseFlexibleDate`; the email tool's `dateOnly` has the same rule | Owner decision before Phase 5 (shared upload) |
| P0-3 | Low | The bundled sample workbook uses the six placeholder engineer names that `loadConfig()` resets, so a saved engineer selection never reaches the dashboard for the sample. The first-time UI flow (Load bundled sample → Engineer Selection) still works. The visual golden renames them to fictional people. | `public/sample-bmc-export.xlsx`, `src/lib/storage.ts` `isOldPlaceholderTeams` | Phase 5 (shared sample data) |
| P0-4 | Low (test harness) | `scripts/verify-outstanding.mjs` times out waiting for a download about 1 run in 3 (`:47` → `download()` `:23`). This is the existing R7 flake. | email branch | Phase 1 (make the wait robust; never skip it) |
| P0-5 | Info | `node --test prototype/daily-email/test/` (a directory argument) fails on Node 22. Use `node --test prototype/daily-email/test/*.test.mjs`. | email branch docs | Phase 1 (`package.json` script) |
| P0-6 | Info | The goldens use npm `xlsx` 0.20.3 (the vendored tarball). The email app uses its vendored `xlsx.mini.min.js` of the same version, so workbooks are compared by cell values, not bytes. | `scripts/golden/groups/email.mjs` | Phase 2 (one SheetJS copy) |
| P0-7 | Info | Visual goldens depend on Chromium 153 (Playwright build 1243) and on Arial resolving to Liberation Sans. GitHub-hosted runners differ. | BASELINE.md "Environment dependence" | Phase 1 CI design |
| P0-14 | Medium-low (robustness) | Every WhatsApp-app save runs in a React `useEffect` with no try/catch. If the browser blocks storage or the quota is full, `saveConfig`, `saveColumnMapping`, `saveFeedback` and `saveTheme` throw inside the effect, which can crash the whole app. Loading already falls back safely. Recorded by the `storage` golden (scenarios `storage-unavailable` and `storage-full`). | `src/App.tsx:69-75`, `src/lib/storage.ts` `save*` | Phase 2 (shared storage helper with error handling) |
| P0-15 | Medium (merge risk) | SheetJS keeps a process-wide number-format table. A workbook read or written earlier with custom formats (e.g. `00000`, `yyyy-mm-dd`) changes the `styles.xml` bytes of later workbooks in the same page or process. Cell values are unchanged. Today each tool has its own SheetJS copy and page, so nothing leaks. Once Phase 2 shares one copy across all tools, the email tool's Excel attachment bytes could depend on what the user opened earlier in the session. The golden harness now runs each group in its own process. | `node_modules/xlsx` (SSF table) | Phase 2 (isolate or reset the format table; compare workbooks by cells) |

## Phase 0 review (ChatGPT, 2026-11-26)

ChatGPT reviewed Phase 0 by reading the source only. Its environment couldn't
reach GitHub with git and had no Playwright, so it ran no tests, golden checks
or mutation tests. Its verdict, "FAIL — verification incomplete", means
"not independently executed", not a failing result. It agreed with P0-1 to
P0-7 (P0-4 partly, since the flake wasn't reproduced) and raised six new
findings. Claude checked each one against the code and fixed all six in
Phase 0.1 (test harness only, no product code):

| # | Finding | Status after Phase 0.1 |
|---|---|---|
| P0-8 | Email goldens recorded outputs the app refuses to export (e.g. `.ps1` with no age reference date) | **Fixed.** The harness mirrors `confirmScope()`, `contractScopeError()` and `workbookBytes()`. Refused deliveries are recorded as `BLOCKED: <message>`. Every matrix entry records its `guards`. This was wider than reported: it also covered every selected-contract case on the sample fixture, whose only contract is `SAMPLE-CONTRACT` (110 outputs in total). |
| P0-9 | WhatsApp data harness bypassed `parseWorkbookFile()` and saved-mapping precedence | **Fixed.** Every fixture goes through `parseWorkbookFile(new File(...))`. Added a `.csv` fixture, saved-mapping precedence and fallback, and parser outcomes for wrong-extension, empty, corrupt and upper-case-extension files. |
| P0-10 | No fixture for `bmc-report:column-mapping:v1`; fixtures never actually loaded | **Fixed.** Added the fixture and the `storage` golden group (WhatsApp `load*`/`save*` across 9 scenarios; email `normalizeSettings`, signature sanitising, logo validity, full-quota save). |
| P0-11 | Survey goldens lacked XLSX, header-row and leading-zero cases | **Fixed** for the data path (`survey/xlsx-upload.json`). Worker matching, cancelling, replacing a file and Clear all data are browser behaviour, still covered by `scripts/verify-survey.mjs` (3/3). |
| P0-12 | PNG comparison ignored transparency | **Fixed.** Alpha is compared for PNG. Proven with a transparency-only difference (16 of 16 pixels reported). |
| P0-13 | Nothing enforced the pinned email commit | **Fixed.** Optional `--expect-email-commit=3fcc777` fails on another commit or on local changes. |
| Privacy | "AsiaPac" sheet names in a fixture | **Fixed.** The worksheets are now `1-Export` … `4-All Tickets`. The "NCC" group names and the people in `docs/email-design/sample-data.json` predate this work, are marked fictional, and belong to the email tool's files. Phase 0 doesn't change them. |

An independent **executed** review is still outstanding. The owner can run the
non-browser groups on Windows:
`node scripts/golden/check.mjs --skip-visual --email-root=..\email-3fcc777\prototype\daily-email --expect-email-commit=3fcc777`
(run it twice; every line should say PASS).

## Owner decisions (2026-11-26)

The owner asked Claude to complete the merge and publish a live page, then
have Codex check it for bugs. Answers given:

- **D1:** fast first. The Email and Survey pages run unchanged inside the new
  app, restyled to the WhatsApp theme. The React rebuild comes later.
- **D2:** separate uploads per section first. The shared upload comes after
  the bug check.
- **D3:** "WhatsApp Report · Email Reports · Customer Survey".
- **D4:** old pages stay available, unchanged, until the owner signs off.
- **D5:** live page at `/app/`, linked first in the README.
- **D6:** Claude builds, Codex checks for bugs.
- **P0-2 (date order):** not decided. Business rules are unchanged.

## How the unified app works (Phase 2, fast version)

- `app/index.html` → `src/unified/main.tsx` → `UnifiedApp.tsx`. Vite builds it
  as a second page (`vite.config.ts` `build.rollupOptions.input`). The live
  page `index.html` is unchanged.
- **Tool bar:** three sections with hash routes `#/whatsapp`, `#/email` and
  `#/survey`, plus one theme toggle stored under `bmc-report:theme:v1`.
  Sections mount on first visit and stay mounted, so switching keeps state.
- **WhatsApp section:** `src/App.tsx`, lazy-loaded. App gained optional
  `theme` / `onThemeChange` props; without them, as on the live page, it
  behaves exactly as before.
- **Email and Survey sections:** the published `../daily-email/` and
  `../customer-survey/` pages in same-origin iframes
  (`allow="clipboard-read; clipboard-write"`).
  - `src/unified/frameTheme.ts` injects `src/unified/embed-theme.css` into the
    frame and sets `html.bmc-embedded` and `data-theme`.
  - All rules are scoped to `html.bmc-embedded`, so the standalone pages look
    exactly as before.
  - The email preview (`#emailFrame`) and the signature editor keep white
    backgrounds, because they show real email HTML.
- **No web fonts and no outside requests on `/app/`.** The live root page
  still loads Google Fonts (P0-1).
- **Deploy:** `scripts/stage-pages.mjs` copies the browser files of both
  prototypes into `dist/`. CI runs every test suite and
  `golden:check --skip-visual`.
- **Browser checks:** `scripts/verify-unified.mjs` (9 checks, passed 3/3
  locally). Among them:
  - the PNG and JPEG exported inside `/app/` are byte-identical to the
    standalone goldens;
  - the Email `.html` download equals the preview, and no theme leaks into
    the email HTML;
  - the Survey samples match;
  - switching sections keeps state;
  - the theme reaches every section;
  - deep links and lazy loading work;
  - the standalone pages are unchanged;
  - no outside requests and no page errors.

## Real-data findings RD-01 to RD-04 (ChatGPT QA, 2026-11-26)

ChatGPT tested the owner's real BMC export locally (logic level, not in a
browser). Its report stays **private**: no real names, ticket IDs, contracts
or counts go into this repository. Fixtures are fictional.

Owner decisions (2026-11-26):
- An explicitly **empty contract selection blocks every export**.
- Fixes stay on `integration/unified-app`. **Do not push to `main`** until
  the owner approves.

Checklist (continue from the first unticked item):
- [x] RD-01 (High) Customer-scope safeguard for every export path, daily
  included. "All contracts" or a missing Contract column asks for
  confirmation, showing the scope, recipients and counts; cancel means no
  clipboard write and no download. Empty selection is blocked. The guard
  logic moves into a tested module that the app and the golden harness
  share. Golden `email/matrix.json` guards change intentionally (owner
  request).
  - Reproduced: `confirmScope()` returned early for daily reports, so a
    daily export with All contracts went out with no prompt; an empty
    selection fell back to All in daily mode.
  - Fix: `prototype/daily-email/lib/export-guard.mjs` (pure, no DOM);
    `app.mjs:234` `confirmScope()` now calls it for every mode; call sites
    are copy (`app.mjs:209`, before the clipboard write), Excel (`:263`),
    .ps1/.eml/.html (`:305-307`). `contractScopeError()` (`:150`) reports
    an empty selection first. The preview header shows a new Scope line
    (`index.html:58`, `previewScopeText()` at `app.mjs:229`).
  - Tests: `test/export-guard.test.mjs` (8 tests);
    `npm run verify:export-scope` (44 browser checks, standalone
    `/daily-email/` and `/app/#/email`, fictional CN-EXAMPLE-A/B/blank
    CSV): Cancel gives no download and leaves the clipboard untouched for
    copy, .html, .eml, .ps1 and Excel in daily, outstanding and monthly;
    OK produces each output; a selected contract exports only its tickets
    with no prompt; an empty selection is blocked with no prompt; a missing
    Contract column prompts and says why.
  - Golden: only `email/matrix.json`, only the `contract-none-selected`
    scenario's outputs (26 cases): 78 deliveries are now `BLOCKED: No
    contract is selected…` and 16 Excel entries are gone (blocked). Every
    other output hash is unchanged; the 113 full-output files are
    byte-identical. The guards record changed shape in all 429 entries
    (`contractConfirmation` → `{exportBlocked, workbookBlocked, confirm}`);
    343 now carry the confirm text. Re-recorded with
    `node scripts/golden/record.mjs --only=email` after that diff was
    checked field by field.
- [ ] RD-03 (Medium) A worksheet whose `<dimension>` says `A1` but holds
  many rows. Fictional regression fixture, tested against the email
  `xlsx-lite` reader, the WhatsApp import (SheetJS) and the survey import.
  Fix any parser that truncates.
- [ ] RD-02 (Medium) Monthly/outstanding reference date earlier than the
  snapshot: show the future-dated count prominently in the UI and in the
  email HTML and plain text. Counting rules unchanged. Reports with no
  future-dated tickets must stay byte-identical.
- [ ] RD-04 (Info) No change; P0-2 stays open.

## Claude bug check of /app/ (started 2026-11-26)

The owner asked Claude to bug-check and fix until its usage runs out. If this
stops mid-way, **continue from the first unticked item**. Rules:
- Fixes go to `integration/unified-app`, then fast-forward to `main`, only
  after the full gate passes: all suites, `golden:check`, `build:gh-pages`,
  `stage:pages`, `verify:unified`.
- Never re-record goldens.
- Each finding is logged below with a `B-` number, severity, reproduction,
  fix commit (or "open").

Checklist (in order of risk):
- [x] B-scan-1 Dark/light readability scan: every visible text element in
  each section and state (settings window open, results, modals), for text
  contrast below 3:1 and for light boxes left in dark mode.
- [x] B-scan-2 Layout under the tool bar: sticky sidebar and status strip,
  validation panel, sticky table headers, modals/overlays, print.
- [x] B-scan-3 Every Email export from inside /app/ (.ps1, .eml, .xlsx, copy
  to clipboard) against the same steps on /daily-email/.
- [x] B-scan-4 Navigation: back/forward, unknown hash, deep links, reload,
  keyboard focus order, window title.
- [x] B-scan-5 WhatsApp section workflows inside /app/ (Engineer Selection,
  Rules, Configuration import/export, copy and print).
- [x] B-scan-6 Survey inside /app/ (XLSX upload, Clear all data, worker).
- [x] B-scan-7 Dev experience: `npm run dev` serves the email and survey
  pages for /app/.
- [x] B-scan-8 Edge cases: narrow and very wide windows, storage blocked,
  frame load failure.

Round 2 (after all eight scans):
- [x] R2-1 Read through the shell code (hash handling, theme on frame
  load, state per section): no logic errors found.
- [x] R2-2 README local preview (`vite preview --mode github-pages`): every
  page serves.
- [x] R2-3 Email settings inside the frame: header logo upload, save,
  reload, logo and sender in the theme C email, settings export. All work.
- [x] R2-4 File drag-and-drop: see B-6 (fixed).
- [x] R2-5 `npm run dev` in a browser: both frames load and are themed, and
  the survey worker matches (confirms B-1).
- [x] R2-6 Background cost: with the WhatsApp dashboard mounted but
  hidden, the Email tab uses about 4 ms of script per second (under 0.5%
  CPU). Not an issue.

**Status at hand-over:** B-1 to B-6 fixed and published. `main` = `2e23da3`;
every gate passed before each publish (61 Vitest, 117 email, 13 survey,
typecheck, all golden groups, build, stage, `verify:unified` 11 checks).

Round 3 (not started; continue here):
- [ ] R3-1 Owner decision: warn before closing or reloading /app/ while any
  section has loaded data? It would protect work across three sections,
  but it changes behaviour and can annoy.
- [ ] R3-2 P0-1: stop the live root page loading Google Fonts (self-host
  Figtree or use system fonts). Changes the root page's look slightly, but
  not the report image.
- [ ] R3-3 Manual checks that can't run here: Edge/Firefox/Safari, a real
  Classic Outlook run of a `.ps1` downloaded from /app/, a real BMC export
  compared between /app/ and the original pages.
- [ ] R3-4 P0-15 before any shared SheetJS copy (full Phase 2): reset or
  isolate the number-format table, and compare workbooks by cells.
- [x] R3-5 A bare `/app`, `/daily-email` or `/customer-survey` (no
  trailing slash) now redirects under `npm run dev` and `vite preview`, as
  on GitHub Pages. The same plugin serves both prototype pages in preview
  even before `stage:pages`.
- [ ] R3-6 Later phases from PLAN.md: rebuild the Email and Survey screens in
  React, one shared upload, retire the old pages after sign-off.

Scan results:
- **B-scan-1:** 16 states × 2 themes (WhatsApp upload, dashboard, validation
  panel, Ticket Data, Engineer Selection, Rules, Configuration, Column
  Mapping; Email first-run window, daily, contract menu, outstanding,
  monthly, settings; Survey review; tool bar). No text below 3:1 contrast
  except one disabled button (expected). No light boxes in dark mode
  outside the email preview and signature editor, which are white on
  purpose. The scanner caught both planted test failures, so the clean
  result is real.
- **B-scan-2:** every sticky table header sits inside its own scroll box,
  print uses its own window, and the sidebar and status strip sit below the
  tool bar. No issues.
- **B-scan-4:** back/forward follow the tabs and update the title; an
  unknown hash falls back to WhatsApp; `#/survey/extra?x=1` opens Survey;
  Tab reaches the tool bar tabs, Enter switches, and focus is visible.
- **B-scan-5:** the bundled sample, Engineer Selection, Configuration
  export and re-import, Copy image (clipboard PNG 2250×1187) and Print
  (2160×1140 image in its own window) behave identically on / and inside
  /app/, with no errors.
- **B-scan-6:** inside /app/, an XLSX with a cover sheet and the header on
  row 2 works; leading zeros are kept; 3,000 rows match in the worker in
  about 0.6 s; Clear all data resets everything; the survey writes nothing
  to storage.
- **B-scan-8:** no horizontal overflow at 900, 1180 or 2560 px
  (`body { min-width: 1180px }` applies, as on the live page). Blocked and
  full storage: see B-3. A missing framed page: see B-4.
- **B-scan-3:** done in a browser with a fixed clock. `.ps1`, `.eml`,
  `.html`, clipboard (HTML and plain text) for themes A and C in daily,
  outstanding and monthly modes, plus both `.xlsx` files: **28 of 28
  byte-identical** between /app/ and /daily-email/. Clipboard copy works
  inside the frame. The "All contracts" confirm dialog appears in both.

Findings:
| # | Severity | Finding | Fix |
|---|---|---|---|
| B-1 | Medium (developers) | Under `npm run dev`, the Email and Survey sections showed the **WhatsApp app** inside their frames: Vite's SPA fallback answered `/daily-email/` and `/customer-survey/` with `index.html`. Production was not affected. | `scripts/vite-prototype-pages.mjs`, a dev-only plugin serving both prototype folders at their published paths (bare path → 301; `test/` and traversal refused). |
| B-3 | **High** (robustness) | With browser storage full or blocked, **/app/ rendered a blank page**. The WhatsApp section's save calls (`saveConfig`, `saveTheme`, …) threw inside React effects with no error boundary, so React unmounted everything, including the tool bar and the Email/Survey sections. This is realistic because all tools share one storage quota and the email tool stores images and a logo there. The same throw crashed the standalone WhatsApp page (P0-14). | `src/lib/storage.ts`: every save goes through `writeItem`, which catches, warns and returns `false`; the report keeps working for the visit. `SectionBoundary` wraps the WhatsApp section, so any future crash stays inside its section with a Reload button. **Intentional golden update:** `storage/whatsapp.json` save results only (`null`→`true` on success, throw→`false` when blocked or full); every load result and stored value is unchanged, and `email.json` is identical. Regression: `verify-unified` check 10. Closes P0-14. |
| B-4 | Low | If a framed page is missing (a host where `stage:pages` was not run), the section showed a bare "404". | The shell checks for a page-specific element after load (`readySelector`) and shows "Email Reports could not be loaded" with the fix to run. |
| B-5 | Low (cosmetic) | In dark mode, /app/ flashed the light theme until React started. | Inline script in `app/index.html` applies the saved theme before the first paint (verified with JavaScript delayed 800 ms). |
| B-6 | Medium (data loss) | Dropping a file anywhere that doesn't accept it (Email and Survey pages beside their file inputs, the tool bar, empty areas) makes the browser open the file in place of the page. In /app/ that throws away the work in **all three sections** at once. | `guardFileDrops()` on the /app/ window and on each frame ignores file drops that nothing handles. File inputs and the WhatsApp drop zone, which handle drops themselves, keep working (verified: a dropped workbook still reaches the dashboard). Regression: `verify-unified` check 11. |
| B-2 | Low (cosmetic) | In dark mode, the Email multi-select lists (ticket types, statuses) showed the browser's grey selected rows. | `embed-theme.css`: selected rows use the accent tint. |

## Codex bug-check brief

Codex: you hold the baton. Check the LIVE unified app at
https://thisisskay.github.io/bmc-ticket-report-generator/app/ and the code on
`main`. Fictional data only. Don't change product code in this check: record
severity-ranked findings, with reproduction steps and file:line, in a new
section "## Codex bug check (<date>)" here, then set
`BATON: Owner — review Codex findings`.

1. Run `npm ci`, `npm test`, `npm run test:email`, `npm run test:survey`,
   `npm run typecheck`, `npm run golden:check` (add `--skip-visual` if your
   Chromium or fonts differ from BASELINE.md),
   `npm run build:gh-pages && npm run stage:pages`, and
   `NODE_PATH=… npm run verify:unified`.
2. In a browser, try every section with its fictional samples, in light and
   dark. Switch sections mid-task, reload, open deep links (`#/email`,
   `#/survey`), and test narrow and very wide windows and keyboard navigation.
3. **Email inside `/app/`:**
   - first-run settings window;
   - Email settings: save and import/export;
   - signature with an image, header logo;
   - every report mode and theme A–D;
   - Copy formatted email (clipboard inside a frame), `.html`, `.eml`,
     Classic Outlook `.ps1`, Excel;
   - compare each with the same steps on `/daily-email/`.
4. **Survey inside `/app/`:** XLSX and CSV uploads, header row, matching,
   confirm/exclude, Clear all data, and the worker on large fictional files.
5. **WhatsApp inside `/app/`:** the full workflow, including Engineer
   Selection, Rules, Configuration import/export, and JPEG/PNG/copy/print.
6. Look for:
   - theme gaps: unreadable text or white boxes in dark mode;
   - layout overlaps with the tool bar (sticky sidebar and status strip);
   - state lost when switching;
   - storage conflicts between sections;
   - anything the standalone pages do that `/app/` doesn't.

## Notes for next agent (Phase 1, historical)

- Merge `feature/daily-pivot-email-report` into `integration/unified-app`
  with a merge commit; no rebase, no squash. Expected conflicts:
  - `.github/workflows/deploy.yml`, which must no longer check out another
    branch at build time;
  - `README.md` (keep the live dashboard link first);
  - `AGENTS.md`, `vite.config.ts` (keep the Vitest `prototype/**` exclude
    from the email branch) and `package.json` (keep `test:survey`).
- Three SheetJS copies will exist after the merge (npm tarball, and the
  vendored minified copies in both prototypes). Leave them until Phase 2.
- After the merge, `prototype/daily-email/` exists in this branch.
  `check.mjs` must then pass without `--email-root`. If it doesn't, the merge
  changed an output: find out why, don't re-record.
- `.gitignore` ignores `*.csv`. The email tool's
  `samples/fictional-tickets.csv` is whitelisted by
  `prototype/daily-email/.gitignore`; confirm it survives the merge.
- Add to `package.json`: `test:email` (node test glob), `golden:check`.
  Add to CI: `golden:check --skip-visual` at minimum; the visual group needs
  the pinned environment (P0-7).
- Fix the existing deploy concurrency issue (`cancel-in-progress: true` with
  PR runs) when touching `deploy.yml` (Phase 6 at the latest).

## Open owner decisions

D1–D6 as listed in PLAN.md. Not yet answered. P0-2 (date order) also needs
an owner decision.

## Commit log

| Date | Commit | Summary |
|---|---|---|
| 2026-11-26 | `50a7120` | Plan and handoff |
| 2026-11-26 | `0b61c4e` | Baseline test counts, storage inventory, storage fixtures |
| 2026-11-26 | `1553faf` | Golden harness (`scripts/golden/`) |
| 2026-11-26 | `311b36d` | Recorded goldens (132 files) |
| 2026-11-26 | `232527f` | BASELINE golden section, Phase 0 results and findings, baton to owner |
| 2026-11-26 | `15ca475` | Phase 0.1 harness fixes |
| 2026-11-26 | `f73be7e` | Phase 0.1 goldens re-recorded (only intended changes) and review responses |
| 2026-11-26 | `f8336a6` | Phase 1: merge of `feature/daily-pivot-email-report` (`3fcc777`), self-contained deploy, CI runs email tests and golden check |
| 2026-11-26 | `c731b0f` | Phase 2: unified app at `/app/` |
| 2026-11-26 | (this commit) | README link and unified-app docs, Codex bug-check brief; then fast-forwarded to `main` |

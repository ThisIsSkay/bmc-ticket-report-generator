# HANDOFF — email-theme bug-fix effort

Read this file first if you are picking the work up. Keep it current: the
branch must never be left in a state this file does not describe.

## Purpose

`prototype/daily-email/` is a standalone, zero-dependency browser tool that
turns the daily BMC ticket export into a pivot-style HTML email for recipients
on Classic Outlook (Word rendering engine). An independent review of the
selectable email-theme implementation (commit `e6f9cfa`) confirmed a list of
bugs (H1, H2, M1–M7, L1–L4) plus weak tests. This effort fixes those bugs,
adds a regression test for each, and hardens the theme tests. The subsequent
owner-authorized outstanding-report work is described below.

## Review of `1f503e1` (weekly ageing release 1) — 2026-11-18

Reviewer: Claude. Scope: `git diff b03fa1d..1f503e1`, fictional data only. No
code changed in this review. Verdict: **good release, one blocking bug (W1)**
before it is used week to week.

### Verified (reproduced here)

- `report-core.mjs` and `src/` unchanged. **Daily output byte-identical to
  `b03fa1d`** across 42 combinations (themes, legacy, plain text, filters,
  sender/signature, hostile and long values).
- 107/107 prototype tests, 61/61 main-app tests, typecheck and
  `build:gh-pages` pass; `node --check` passes.
- `vendor/xlsx.mini.min.js` is byte-identical to `dist/xlsx.mini.min.js` in
  the repo's existing `vendor/xlsx-0.20.3.tgz`; Apache-2.0 licence included.
- `scripts/verify-weekly.mjs` passed 3/3. `scripts/verify-outstanding.mjs`
  passed about half the time: it still misses the `.eml` download at the same
  step (variant B, check 47) although the app runs it (toast shown). Harness
  flake, not an app bug (R7 only partly fixed).
- Filters run after dedupe; type × group, type × priority and age bands
  reconcile with the ticket total, including `(blank)` priority. Age bands
  match the owner's definition (day 7 → 0–7, day 8 → 8–14, …; missing date →
  Age unknown; date after the reference → Future-dated).
- Excel: Summary/Tickets/Scope sheets; Submitted is a real date cell, age is a
  number, text starting with `=` stays text, engineer column absent when
  hidden, only in-scope tickets included.
- Classic Outlook `.ps1`: the embedded workbook decodes to the same rows as the
  downloaded `.xlsx`, is attached as `BMC_Outstanding_Tickets.xlsx` to an
  unsent draft, and there is no Send call. Theme C header logo gets explicit
  dimensions and becomes a CID image.
- R3, R4, R5, R6 and R8 from the previous review are fixed. R1 now confirms on
  each export when the contract is All or missing; R2 now uses a manually
  entered age reference date.

### Findings

**W1 — High. Saved weekly setup can silently narrow later weeks.** "Use
weekly ageing setup" selects only the type/status values present in the
current file, and that selection is saved. Repro with fictional exports:
week 2 has no Pending tickets and no Service Requests → export is blocked
(good) → "Clear saved scope" → "Use weekly ageing setup" again saves
types=[Incident], statuses=[Assigned], contract=All → week 3 contains two
Pending Service Requests, and both are excluded with no warning other than
"Excluded by type: 2" in the caption. The customer email under-reports.
Fix: store the intended weekly values as constants (Incident, Service
Request; Assigned, Pending) regardless of whether they appear in this file;
for types/statuses, treat a saved value that is absent this week as a zero
count with a notice, not a scope error; keep the hard block for missing
contract or groups. Weekly setup should not save contract "All" over a
previously saved contract.

**W2 — Medium. Manual filter changes are not saved and get reverted.** The
setup is captured only when "Use weekly ageing setup" or "Export settings" is
clicked. Changing statuses by hand and uploading the next file restores the
older saved setup. "Clear saved scope" resets groups and contract but leaves
the type/status lists as they were (observed: Assigned + Resolved selected).
Decide whether the setup is "last used" (save on every change) or "explicitly
saved" (show a Save setup button and an "unsaved changes" marker).

**W3 — Medium-low. Excel cannot filter by priority.** The Tickets sheet has a
combined "Status / Priority" cell containing a line break ("Pending" /
"Priority: Low"). Split into separate Status and Priority columns in the
workbook (the email layout can stay combined).

**W4 — Low. Customer caption lists terminal statuses.** With the default
(all statuses selected) the caption in the email reads "Statuses: Assigned,
Closed, Pending, Work in Progress", because the status list is built from all
rows. Build the type/status option lists from `report.pending`, or show "All
outstanding" when everything is selected.

**W5 — To test manually.** Copy formatted email now shows a confirm dialog
before writing to the clipboard. Browsers can refuse the clipboard write if
the click is no longer recent after the dialog. The browser suite mocks the
clipboard, so check in real Chrome/Edge with the contract set to All.

Still open: R7 harness flake; real Classic Outlook rendering, attachment and
logo scaling (100/125/150%); A/B/D header logo designs; multi-preset
management.

## Weekly ageing release 1 — 2026-11-18

Owner approved implementation and confirmed the weekly setup: Incident + Service
Request; raw Assigned + Pending; age bands 0–7, 8–14, 15–30, 31–60, over 60;
manually entered reference date. This is calendar age since submission, not time
in status or historical backlog. Existing outstanding defaults remain broad.

Implemented on top of review commit `b03fa1d`:
- Explicit type/status selection after dedupe, exclusion counts, group × type,
  type × raw priority and ageing breakdowns. Blank/unknown priorities retained;
  missing submission dates are Age unknown and future dates are flagged.
- Weekly setup button selects the approved filters and concise email mode.
  Full details remain in dashboard and Excel, with engineer visibility shared.
- Real XLSX Summary/Tickets/Scope workbook, dates, autofilter, column widths and
  text-only user fields; 5 MB output limit. SheetJS mini 0.20.3 and its licence
  are copied from the existing repository vendor package (no CDN dependency).
- Classic Outlook helper attaches the same workbook to an unsent draft. EML
  and clipboard use manual workbook attachment; there is no automatic sending.
- Theme C outstanding header logo upload, proportional explicit dimensions,
  existing CID conversion. A/B/D header logo designs and multi-preset management
  remain deferred. One report setup uses existing settings export/import.
- Saved setup records exact groups, contract, types/statuses and event selection;
  missing saved values block export until Clear saved scope is used. No inferred
  customer mappings. All/missing contract requires confirmation on each export.
- Scope/recipients shown beside exports. Age reference date is explicit, never
  inferred from file metadata. {date} works in outstanding subject/introduction.
- R3/R4/R5/R6/R8 corrected (line breaks, plain text, group width, dashboard
  alignment, blank greeting). Browser contexts accept downloads and support
  Playwright's installed browser or CHROMIUM_PATH. Separate weekly browser test.

Validation: 107 prototype tests, 61 main tests, typecheck and Pages build pass;
127 outstanding browser checks and the weekly browser flow pass. Compared daily
A–D HTML, daily plain text and attachment-free Outlook helper with `b03fa1d`:
byte-identical for the fictional fixture. src/ and report-core.mjs unchanged.
Native Outlook execution/rendering, clipboard image handling and display scaling
still require manual testing. No merge or deployment performed.

Claude: review this release against `b03fa1d`. Focus on filter reconciliation,
setup import/missing-value checks, Excel row/column privacy, scope confirmation,
age boundary semantics, CID header logo and workbook attachment handling. Run
`npm --prefix prototype/daily-email test` and both `scripts/verify-*.mjs` using
Playwright and a running prototype server. Do not merge or deploy.

## Outstanding report implementation — 2026-11-18

Implemented on `feature/daily-pivot-email-report`, based on `d72e0f3`, in a
fresh checkout after the history rewrite. The owner authorized committing and
pushing this implementation for review directly in the shared repository.
No merge or deployment is authorized as part of this change.

For the review, fetch the current branch and inspect `git diff d72e0f3..HEAD`.
Check for existing local work before updating a checkout. Both reviewers and
developers should fetch before starting work and check the remote tip before
pushing, preserving each other's changes without force-pushes. Keep review
findings and implementation status in this file so no downloaded patch or
manual file transfer is needed.

- **Report options → Report content → Outstanding tickets** selects the new
  mode. Daily activity remains the default for existing settings.
- `lib/pending-report.mjs` builds one presentation view from the existing
  `generateReport().pending`. Contract and monitoring filters still run in
  the core; multiple group selections run AFTER deduplication, with the core
  group filter set to All. No lifecycle rules or `src/` code changed.
- Outstanding retains the existing non-terminal definition, including unknown
  statuses with a visible warning. It describes the uploaded export snapshot,
  never a historical backlog. The daily date controls are hidden in this mode.
- Group choices come directly from the export. Application is available when
  represented by an actual assigned group; no guessed aliases or engineer
  mapping are introduced. `NCC_Application` in tests is fictional, not a
  confirmed production group name. All groups are selected on every import;
  unchecking All permits multiple selection, and selecting none means zero.
- Dashboard, themes A–D, plain text, rich clipboard, HTML, EML and Classic
  Outlook helper all use the same pending view. Details include ID, type,
  summary, group, status/priority and submitted date. Engineer names default
  to hidden, with an explicit opt-in shared across those outputs.
- Mode, engineer visibility and separate pending subject/introduction persist
  with settings and JSON backups. Ticket rows and selected group names are
  not persisted. Existing signature handling is reused.
- A scope note requests customer-scope checking, including when Contract is
  missing. No mandatory contract guard or contract-to-customer rule was added.
- Existing required input columns, date parser, and unknown-status behavior
  remain unchanged. There is no direct email sending or invented progress text.

### Verification and review focus

- Prototype: `npm --prefix prototype/daily-email test` — 98 tests passed,
  including existing daily theme golden checks and new outstanding tests.
- Main app: `npm test` — 61 passed; `npm run typecheck` and
  `npm run build:gh-pages` passed (existing large-chunk warning remains).
- Optional browser suite: start the prototype on port 4177, then run
  `NODE_PATH=/path/to/playwright/node_modules node scripts/verify-outstanding.mjs`.
  Use `BMC_PREVIEW_URL` or `CHROMIUM_PATH` to override the defaults. Playwright
  is a separate test dependency, not a runtime/package-lock change.
- Chromium browser suite — 127 checks passed.
- The browser suite covers all themes and engineer settings, download content,
  clipboard payloads, group/contract filtering after reassignment, empty scope,
  long text width, settings import/reload, and switching back to identical
  daily HTML. Clipboard is mocked; this does not prove OS clipboard or actual
  Outlook rendering. Native Outlook and a representative sanitized export
  still need manual review.

Claude review: inspect the branch diff against `d72e0f3`, particularly
dedupe-before-group-selection, scope consistency, unknown-status warnings,
engineer visibility across exports, escaping, empty states and mode/settings
transitions. Confirm every summary reconciles with detail rows and daily
output remains unchanged. Use fictional data only; keep this PR a draft and
do not merge or deploy. Confirm actual Application group names and the
customer/contract mapping before introducing any mappings or restrictions.

## Review of `7a2dae9` (outstanding report) — 2026-11-18

Reviewer: Claude. Scope: `git diff d72e0f3..7a2dae9`, fictional data only.
No code was changed in this review; the items below are for the next
implementer. Verdict: **sound foundation, not ready for customer use** until
R1–R3 are fixed or explicitly accepted by the owner.

### Verified (reproduced here)

- `lib/report-core.mjs` and `src/` are unchanged.
- **Daily output is byte-identical to `d72e0f3`:** 42 combinations (legacy
  layout, A–D, unknown variant, plain text; three filter sets; sender block
  and signature profile with logo; hostile and long values) all match.
- 98/98 prototype tests, 61/61 main-app tests, typecheck and
  `build:gh-pages` pass; `node --check` passes on every `.mjs`.
- Group selection runs after dedupe: a ticket reassigned from an
  Application group to another group is not counted under the old group.
  Contract and EVT filters still run in the core.
- Engineer names are hidden by default and the setting applies to the
  dashboard, HTML, plain text and every export. Escaping, reconciliation
  (KPIs = both TOTAL rows = detail rows) and empty states are correct. Column
  widths sum to 736 with and without the engineer column.
- `scripts/verify-outstanding.mjs`: passed 127/127 in one of four runs here;
  see R7 for the other three.

### Findings

**R1 — Medium. Customer-scope check is advisory and easy to miss.** With
"All contracts" selected, or no Contract column, every export still proceeds.
The only warning sits in Report options, about 900px above the export
buttons. A customer email can therefore include other customers' tickets.
Recommended: repeat the warning beside the export buttons in outstanding
mode and require a confirmation click when the contract is All or missing.
Whether to block outright is owner decision (h).

**R2 — Medium. Internal caveats and missing date in customer-facing text.**
- The disclaimer tells the customer "Export snapshot time was not provided."
- Variant C's top bar shows "Uploaded export snapshot".
- The subject is the same every day ("BMC Outstanding Tickets"); `{date}` in
  the outstanding subject becomes "uploaded snapshot", and `{date}` in the
  outstanding introduction is left as literal text.
Recommended: an editable "Data as at" date/time in outstanding mode
(defaulting to the uploaded file's `File.lastModified`), used in the title,
subject `{date}`, intro `{date}`, Variant C top bar and disclaimer. Which
source to use is owner decision (i).

**R3 — Bug. Outstanding introduction can lose its line break.**
`renderPendingEmail` runs `softBreak` over `multiline(...)` output, so a
zero-width space can be inserted inside `<br />`. Repro: introduction =
39 × "x", newline, "Thanks" → output contains `<&#8203;br />`; the recipient
sees literal "<br />" text and no line break. Fix: escape and `softBreak` each
line, then join with `<br />`. Add a regression test with 19, 39 and 59
character lines.

**R4 — Low. Plain text splits ticket rows.** The Status/Priority value contains
a newline, so each ticket with a priority spans two lines
("1. … | Pending" / "Priority: High | 2026-11-10"). Use " · " in plain text.

**R5 — Low. Group codes break mid-word in the email.** The 96px Assigned
group column forces `softBreak` inside ordinary codes ("NCC_NETW" / "ORK").
The daily table uses 116px; take 20px from Summary.

**R6 — Low. Dashboard table alignment.** In the outstanding ticket-details
table the headers from column 2 onward are right-aligned (CSS default for
`th`) while the cells are left-aligned, and the Status/Priority newline
collapses to "Pending Priority: Low". Dashboard only; the email is fine.

**R7 — Low. Browser script is environment-specific and flaky.** It defaults to
`/usr/bin/chromium` (absent here; needed `CHROMIUM_PATH`). In three of four
runs it timed out waiting for the `.eml` download although the app ran the
download (its toast appeared), so this is the harness, not the app. Suggest
`browser.newContext({acceptDownloads:true})`, Playwright's default browser
when `CHROMIUM_PATH` is unset, and one retry per download.

**R8 — Trivial.** A whitespace-only greeting is not trimmed in outstanding
mode (daily trims it to the "Hi Team," default).

### Owner decisions added by this review

- (h) Block, confirm, or only warn when exporting an outstanding report with
  all contracts or no Contract column?
- (i) "Data as at" source: file timestamp, latest Last Modified Date in the
  export, or typed by the user?
- Still open from the planning handoff: the definition of "pending"
  (implemented as all non-terminal statuses, which differs from the approved
  dashboard's "Pending" bucket), the real Application group value(s), whether
  details should include more than the summary, and real Outlook testing.

## Rules (non-negotiable)

- Never commit real BMC exports or real ticket data (code, tests, `public/`).
  Fictional data only.
- No real people's names, job titles, emails or phone numbers anywhere,
  including commit messages, PR text and this file. Use "Alex Example" and
  `example.com` / `.net` / `.org`.
- If sensitive data turns up in Git history: stop, report what needs cleanup,
  push nothing further.
- Do not change calculations or business rules in `lib/report-core.mjs`.
- Do not touch `src/` (the approved main app).
- No merge, no deploy, no force-push, no history rewrite without the owner's
  explicit go-ahead. PR #11 stays a draft. (One owner-approved rewrite of this
  branch was done on 2026-11-16; see Notes.)
- Email HTML stays Outlook-safe (see `AGENTS.md` and
  `docs/email-design/README.md` section 1): tables only, inline styles only,
  Arial on every text-bearing `p`/`h1`/`h2`/`td`/`th`, 1px solid borders,
  `bgcolor` + `background-color` together, 800px outer / 736px content.
  No `class`, `<style>`, flex, grid, float, position, border-radius,
  gradient, box-shadow, SVG or `url()`.
- `docs/email-design/reference/variant-{A,B,C,D}.html` are the source of
  truth for every colour, size and padding.
- Every fix gets a regression test in
  `prototype/daily-email/test/report.test.mjs`.

## Branch / PR

- Branch: `feature/daily-pivot-email-report` (push here only).
- PR: draft PR #11 into `main`.
- Starting tip for this effort: `4a49874`.

## Status checklist

- [x] H1 — placeholder sender text (sender fields in settings, no bracket fallback, warning)
- [x] H2 — rich signature / logo dropped in themed variants
- [x] M1 — broken intro sentence (". for …")
- [x] M2 — email misstates its scope (filters, caption, disclaimer)
- [x] M3 — long values widen the email past 800px
- [x] M4 — variants B, C, D do not match their reference designs
- [x] M5 — plain-text clipboard output unusable
- [x] M6 — pull-request CI can cancel production Pages deploys
- [x] M7 — personal data in `docs/email-design/` sender blocks
- [x] L1 — settings import desyncs the selected theme
- [x] L2 — invalid stored variant renders the legacy layout
- [x] L3 — docs reference a missing `previews/` folder
- [x] L4 — test fixtures use real domains
- [x] Test hardening — all-variant theme tests with hostile / blank fixture
- [x] Verification — full command list + Playwright pass + CI result recorded

## Owner decisions received 2026-11-15

- The prototype **stays on this branch**; it is not to be merged into `main`.
  `main` only links to it from its README and stages it on GitHub Pages at
  `/daily-email/`. So decision (b) below is settled: `main`'s `deploy.yml`
  checking out this branch is the intended design, not a pre-merge blocker.
  The live preview only refreshes when `main` is deployed (a push to `main`
  or a manual run of the workflow on `main`).
- There is **no stakeholder review**. The tool is a skeleton for automation
  with a human check before sending. PR #11 stays an open draft as the home
  of the prototype.
- Real Classic Outlook testing will happen later (not scheduled).
- Personal data is to be cleared or replaced with dummy names. Done for the
  files and the history of both this branch and `main` (see (e) and Notes).

## Open decisions for the owner (agents: do NOT decide these)

a) Ambiguous slash dates are read month-first unless the first number is >12.
   That is risky for Singapore DD/MM CSV exports. Keep or change?
b) `main`'s `deploy.yml` checks out `feature/daily-pivot-email-report` at
   build time to stage the prototype. It must become self-contained before
   the final merge.
c) GitHub Pages must be enabled (Settings > Pages > Source = GitHub Actions).
d) Themed emails omit the closed-ticket list, per the design spec. Confirm
   this is intended.
e) Done for file contents and commit messages. This branch and the last four
   commits of `main` were rewritten on 2026-11-16; no commit reachable from
   any branch now contains the earlier real names. Remaining, owner's call:
   (1) old commit IDs can stay reachable on GitHub by direct URL until GitHub
   Support purges them; (2) commit author metadata still carries the owner's
   own Git name and email.
f) Variant C renders a boxed `LOGO` placeholder cell in the top bar, exactly
   as in `reference/variant-C.html`. A real recipient would see the word
   "LOGO". Decide: supply a real logo image, drop the cell, or keep it. The
   golden test pins the current markup to the reference, so changing this
   means changing the reference too.

## How to verify

From the repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build:gh-pages
node --test prototype/daily-email/test/report.test.mjs
for f in $(find prototype/daily-email -name '*.mjs'); do node --check "$f" || echo "FAIL $f"; done
git grep -n -i "End-User Comput[i]ng" -- docs/ prototype/   # M7 check: must print nothing ([i] stops this line matching itself)
```

Browser pass (Playwright/Chromium against
`node prototype/daily-email/server.mjs`, http://127.0.0.1:4177): load the
fictional sample and, for each of A, B, C and D, confirm zero console errors;
the preview, `.html`, `.eml` and `.ps1` downloads all show the selected
variant; the signature block shows the configured sender details or the
selected profile (with logo) and never `[Company name]`; and a 260-character
unbroken summary keeps the email 800px wide. Then wait for CI on the branch
and record the result below.

## Verification results (2026-11-15, local, at commit `6dde39c` + docs)

- `npm ci` — exit 0.
- `npm test` — 6 files, 61 tests passed (main app, untouched).
- `npm run typecheck` — exit 0.
- `npm run build:gh-pages` — built, exit 0.
- `node --test prototype/daily-email/test/report.test.mjs` — 79 passed, 0
  failed (was 28 at `4a49874`).
- `node --check` on every `.mjs` under `prototype/daily-email/` — all pass.
- M7 grep — prints nothing.
- Playwright/Chromium against `server.mjs`, fictional sample plus a fictional
  stress CSV, sender-block mode and signature-profile mode, variants A–D:
  124/124 checks passed. Zero console errors; preview, `.html`, `.eml` and
  `.ps1` all show the selected variant; sign-off shows the configured sender
  or the profile with logo (`.eml` multipart/related with Content-ID, `.ps1`
  attaches by cid) and never a bracket placeholder; a 260-character unbroken
  summary (plus overlong ID, type, assignee, group, URL and CJK values) keeps
  the email exactly 800px wide; clipboard plain text is clean; L1/L2/M2
  behaviours confirmed in the UI.
- CI on the branch (PR #11, workflow "Deploy to GitHub Pages", run 43712468391
  on `fe3a63a`): `build` success, `deploy` skipped (pull requests only
  validate). The only commit after that changes this file alone.

## Notes for next agent

- Work order: H1+H2, M1+M2, M3, M4, M5, M6+M7, L1–L4, test hardening,
  verification. Each fix commit is followed by a small `HANDOFF: record …`
  commit that adds its hash to the Log.
- H1/H2: when a signature profile with content is selected it replaces the whole sign-off (no automatic "Best regards,"); an empty profile falls back to the sender block. Pasted signature images are not resized in the email HTML (Word ignores max-width), so a pasted logo wider than 736px could still widen the email; images added via Insert PNG/JPEG are already capped at 820x320 on import. Not in the review list; left as is.
- M2: when EVT monitoring is included the disclaimer reads "… (SGT) and include monitoring events." (wording chosen by the agent; the reference only covers the excluded case).
- M7: the working tree is clean, but the previous sender values remain in Git history (commits before this one that touch docs/email-design/). Removing them needs a history rewrite, which this effort is not allowed to do — owner decision, see Open decisions (e). The verify command uses `Comput[i]ng` so this file does not match its own check.
- M3: zero-width spaces are inserted into any unbroken value longer than 24 characters, so a long URL copied out of the email carries invisible break characters. That is the trade-off the review asked for (Word ignores word-break). `word-wrap:break-word;` is the only style not in the references; the golden test strips it before comparing.
- M4: all four golden tests pass with zero differing lines. Email-themes.mjs is now readable multi-line code: per-variant values live in `THEMES`, `HEADERS` and `KPIS`.
- M6: the fix lives in this branch's deploy.yml. PR runs use the PR merge commit's workflow so they are covered now; `main`'s own copy only changes when PR #11 merges.
- L1: the import handler also syncs the Email client dropdown (same desync bug, one extra assignment).
- Tests: the hardening block uses a small tag walker (`parseElements`) in the test file; no new dependencies.
- M3 follow-up (found by the browser pass): breaking only runs longer than 24
  characters was not enough. Several medium-length unbroken values in one row
  (or wide glyphs such as W, M, @, CJK) still stretched variants A, B and D
  to 803-810px. `softBreak(escaped,maxPx,fontPx)` is now width-aware: it uses
  Arial advance widths and each column's content width, and adds a zero-width
  space wherever a run would not fit its cell (as well as at least every 20
  characters in runs over 24). Values that fit, such as 15-character ticket
  IDs, get no hidden characters. `table-layout:fixed` was tried and rejected:
  browsers add cell padding to the `width` attributes and the table grew to
  922px.
- Not verifiable here: rendering in real Classic Outlook (Word engine). All
  width and layout checks were done in Chromium. Someone with Outlook should
  open one generated draft per variant before the PR leaves draft.
- Signature logo test (owner request, 2026-11-15): inserting via **Insert
  PNG/JPEG** and pasting (Ctrl+V) were tested in Chromium with a small PNG,
  a 1600x500 PNG and a 2400x400 JPEG, across A-D: 71/71 checks pass (image
  lands in the editor, survives save + reload, shows in the preview, goes
  inline by Content-ID into `.eml` and `.ps1`). Bug found and fixed: large
  images were stored 820px wide with no explicit size, and Classic Outlook
  ignores `max-width`, so they would have widened the email. Images are now
  capped at 736px on import, and every signature `<img>` gets `width` and
  `height` attributes (read from the PNG/JPEG header when missing, scaled
  down to 736px).
- The `LOGO` box in Variant C's top bar is a separate header placeholder
  from the reference design. It is not connected to the signature logo.
- History rewrite (owner-approved, 2026-11-16): the 55 commits on this branch
  that are not on `main` were rewritten with dummy names (sender block in the
  design fixtures, a reviewer's name in the prototype README and page) and
  force-pushed. File contents at the tip are byte-identical to before. Every
  commit ID on this branch changed: the hashes in this file were updated to
  the new IDs, but the hashes inside older `HANDOFF: record ...` commit
  subjects are pre-rewrite IDs and no longer resolve. Any other clone of this
  branch must be re-cloned or hard-reset to `origin`; do not push an old copy.
- `main`'s README was reworded on 2026-11-16 (owner-approved push to `main`)
  to drop a real name and the "awaiting review" wording.
- `main` history rewrite (owner-approved, 2026-11-16): only the last four
  commits of `main` were affected (README wording and one commit message).
  They were rewritten and force-pushed; file contents are byte-identical and
  the first 50 commits of `main` keep their IDs. This branch forks from an
  earlier `main` commit, so it did not need rewriting again. `main`'s tip is
  now `0cd198b`. No other remote branch contained the affected commits. Any
  clone of `main` must be hard-reset to `origin/main`.
- Sample/test data check (2026-11-16): `public/sample-bmc-export.xlsx`
  (role names such as "EUC Analyst", first names Alice/Bob/Carol),
  `src/test/*`, `public/default-*.json`, the prototype CSV sample and
  `docs/email-design/sample-data.json` contain fictional values only.
  Nothing needed changing. Organisation terms (BMC, NCC, AsiaPac) remain;
  they are not personal data and the main app depends on them.

## Log

- 2026-11-15 — `af22ca7` Add HANDOFF.md and AGENTS.md pointer.
- 2026-11-15 — `aba2b64` Fix H1/H2: real sender details and rich signatures in themed emails (33 prototype tests pass).
- 2026-11-15 — `edda2ca` Fix M1/M2: intro sentence and truthful scope caption/disclaimer (35 prototype tests pass).
- 2026-11-15 — `393ce4d` Fix M7: fictional sender in the email design fixtures (36 prototype tests pass).
- 2026-11-15 — `8f4de5f` Fix M3/M4: rebuild themed renderer from the reference designs (42 prototype tests pass).
- 2026-11-15 — `62a4f53` Fix M5: build clipboard plain text from the report data (43 prototype tests pass).
- 2026-11-15 — `eb9ee0a` Fix M6: keep pull-request CI from cancelling Pages deploys (44 prototype tests pass).
- 2026-11-15 — `ca3f774` Fix L1-L4: theme sync on import, variant fallback, docs, fixtures (48 prototype tests pass).
- 2026-11-15 — `9973ff8` Harden theme tests: eight checks per variant on a hostile fixture (79 prototype tests pass).
- 2026-11-15 — `6dde39c` M3 follow-up: width-aware break opportunities per column (79 prototype tests pass).
- 2026-11-15 — `fe3a63a` Record local verification results; README notes for sender details. CI on this commit: build success, deploy skipped.
- 2026-11-15 — (latest commit) Tick Verification and record the CI result. All checklist items done; only the owner decisions above remain open.
- 2026-11-15 — `1cf7e78` Signature logos: cap at 736px and set explicit width/height; owner decisions recorded (80 prototype tests pass).
- 2026-11-16 — This branch's history rewritten with dummy names (force-push); `main` README reworded, then the last four `main` commits rewritten (force-push, new tip `0cd198b`). Sample/test data confirmed fictional.
- 2026-11-18 — `7a2dae9` Outstanding report (Codex). Reviewed: daily output byte-identical, 98/61 tests pass; findings R1–R8 recorded above.
- 2026-11-18 — `1f503e1` Weekly ageing release 1 (Codex). Reviewed: daily output byte-identical, 107/61 tests pass; findings W1–W5 recorded above.

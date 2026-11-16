# HANDOFF — email-theme bug-fix effort

Read this file first if you are picking the work up. Keep it current: the
branch must never be left in a state this file does not describe.

## Purpose

`prototype/daily-email/` is a standalone, zero-dependency browser tool that
turns the daily BMC ticket export into a pivot-style HTML email for recipients
on Classic Outlook (Word rendering engine). An independent review of the
selectable email-theme implementation (commit `e6f9cfa`) confirmed a list of
bugs (H1, H2, M1–M7, L1–L4) plus weak tests. This effort fixes those bugs,
adds a regression test for each, and hardens the theme tests. Nothing else is
in scope.

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

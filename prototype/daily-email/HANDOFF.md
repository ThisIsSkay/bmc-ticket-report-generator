# HANDOFF — email-theme bug-fix effort

Read this file first if you are picking the work up. Keep it current: the
branch must never be left in a state this file does not describe.

## Purpose

`prototype/daily-email/` is a standalone, zero-dependency browser tool that
turns the daily BMC ticket export into a pivot-style HTML email for recipients
on Classic Outlook (Word rendering engine). An independent review of the
selectable email-theme implementation (commit `dbacae1`) confirmed a list of
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
- No merge, no deploy, no force-push, no history rewrite. PR #11 stays a draft.
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
- Starting tip for this effort: `0d2e2ba`.

## Status checklist

- [ ] H1 — placeholder sender text (sender fields in settings, no bracket fallback, warning)
- [ ] H2 — rich signature / logo dropped in themed variants
- [ ] M1 — broken intro sentence (". for …")
- [ ] M2 — email misstates its scope (filters, caption, disclaimer)
- [ ] M3 — long values widen the email past 800px
- [ ] M4 — variants B, C, D do not match their reference designs
- [ ] M5 — plain-text clipboard output unusable
- [ ] M6 — pull-request CI can cancel production Pages deploys
- [ ] M7 — personal data in `docs/email-design/` sender blocks
- [ ] L1 — settings import desyncs the selected theme
- [ ] L2 — invalid stored variant renders the legacy layout
- [ ] L3 — docs reference a missing `previews/` folder
- [ ] L4 — test fixtures use real domains
- [ ] Test hardening — all-variant theme tests with hostile / blank fixture
- [ ] Verification — full command list + Playwright pass + CI result recorded

## Open decisions for the owner (agents: do NOT decide these)

a) Ambiguous slash dates are read month-first unless the first number is >12.
   That is risky for Singapore DD/MM CSV exports. Keep or change?
b) `main`'s `deploy.yml` checks out `feature/daily-pivot-email-report` at
   build time to stage the prototype. It must become self-contained before
   the final merge.
c) GitHub Pages must be enabled (Settings > Pages > Source = GitHub Actions).
d) Themed emails omit the closed-ticket list, per the design spec. Confirm
   this is intended.

## How to verify

From the repository root:

```bash
npm ci
npm test
npm run typecheck
npm run build:gh-pages
node --test prototype/daily-email/test/report.test.mjs
for f in $(find prototype/daily-email -name '*.mjs'); do node --check "$f" || echo "FAIL $f"; done
git grep -n -i "End-User Comput[i]ng" -- docs/ prototype/   # must print nothing
```

Browser pass (Playwright/Chromium against
`node prototype/daily-email/server.mjs`, http://127.0.0.1:4177): load the
fictional sample and, for each of A, B, C and D, confirm zero console errors;
the preview, `.html`, `.eml` and `.ps1` downloads all show the selected
variant; the signature block shows the configured sender details or the
selected profile (with logo) and never `[Company name]`; and a 260-character
unbroken summary keeps the email 800px wide. Then wait for CI on the branch
and record the result below.

## Notes for next agent

- Nothing started yet. Work order: H1+H2, M1+M2, M3, M4, M5, M6+M7, L1–L4,
  test hardening, verification.

## Log

- 2026-11-15 — (this commit) Add HANDOFF.md and AGENTS.md pointer.

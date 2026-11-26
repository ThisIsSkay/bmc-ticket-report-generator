# Unified app merge plan

Owner-approved plan for merging the three tools in this repository into one
app. Only owner decisions change this file. Progress, findings and the baton
live in [HANDOFF.md](HANDOFF.md); test counts, the storage inventory and the
golden commands live in [BASELINE.md](BASELINE.md).

## Goal

One app. The live React WhatsApp report app (`src/`) becomes the shell. Its
look and its light/dark theme apply to the **app screens only, never to
outputs**: emails stay Outlook-safe inline HTML, and the WhatsApp report image
keeps its fixed look.

## Tools being merged

| # | Tool | Code | Branch at Phase 0 | Browser storage |
|---|---|---|---|---|
| 1 | WhatsApp report (live) | `src/` (React + TypeScript) | `main` | `bmc-report:*` |
| 2 | Email reports: daily, outstanding / weekly ageing, monthly pending | `prototype/daily-email/`, `docs/email-design/`, `scripts/verify-weekly.mjs`, `scripts/verify-outstanding.mjs`, `scripts/verify-header-logo.mjs` | `feature/daily-pivot-email-report` only | `bmc-daily-email-report:settings:v1` |
| 3 | Customer survey | `prototype/customer-survey/` | `main` | none, by design |

## Rules for every phase

- Each tool's business rules stay separate. The WhatsApp counts and the email
  counts are intentionally different and are not reconciled by this merge.
- Outputs must match the Phase 0 goldens exactly:
  - WhatsApp report: pixels;
  - email HTML, plain text, `.eml` and `.ps1`: bytes after the documented
    normalisation;
  - `.xlsx`: parsed cell values;
  - survey matches: JSON.
- Saved settings are kept: the same storage keys, or a tested migration that
  keeps a backup of the old value.
- No new network calls. Survey data is never saved.
- No direct commits to `main` during the merge. Work happens on
  `integration/unified-app`.
- Every phase updates `HANDOFF.md`. The owner approves each phase gate before
  the next phase starts.
- Fictional data only in the repository.

## Phases

| Phase | Scope | Gate |
|---|---|---|
| 0 | Freeze and baseline: goldens, storage inventory, test counts, rollback tags. No product code changes. | Goldens recorded; the check passes twice; owner approval. |
| 1 | Merge `feature/daily-pivot-email-report` into `integration/unified-app` with a merge commit. Make the deploy self-contained (no checkout of another branch at build time). Add the golden check to `package.json` and CI. The site still publishes three pages. | All suites green; goldens unchanged; owner confirms the email tool still works from the integration build. |
| 2 | Shared app frame: `src/tools/{whatsapp,email,survey}`, `src/shared/`; navigation "WhatsApp Report · Email Reports · Customer Survey"; URL routing that works on GitHub Pages; shared theme; one SheetJS copy; each tool loaded on demand. | WhatsApp image pixel-identical; light and dark screenshots. |
| 3 | Email tool into the app. 3a: report, scope and sandboxed preview. 3b: delivery (`.ps1`, `.eml`, copy, `.xlsx`). 3c: settings, signatures, logo and storage migration. Email logic modules reused unchanged. | Email goldens byte-identical; owner checks in Classic Outlook. |
| 4 | Survey tool into the app (Web Worker matching, no persistence). | Survey goldens identical; no storage writes; Clear all data works. |
| 5 | One upload for all tools, per-tool mapping status, one Clear all data, one settings backup file (survey data never included). | End-to-end browser tests across all tools. |
| 6 | Hardening and switch-over: full regression, accessibility, performance, privacy and network audit; old URLs forward to the new sections; old pages kept for rollback; README rewrite (live link stays first); deploy concurrency fix; owner sign-off; archive (not delete) the feature branch. | Owner sign-off. |

## Rollback points

- `pre-merge/main-1a74ff4` is `main` before the merge work.
- `pre-merge/email-3fcc777` is `feature/daily-pivot-email-report` before the
  merge work.

## Open owner decisions

Agents must not decide these. The owner answers them in `HANDOFF.md`.

- **D1**: rebuild the tool screens in React (recommended), or embed them as
  frames.
- **D2**: one shared upload (recommended), or a separate upload per tool.
- **D3**: menu names.
- **D4**: how long the old pages stay available (suggest 4 weeks).
- **D5**: testing during the merge: a temporary `/next/` preview, or local
  only.
- **D6**: who builds and who reviews each later phase.

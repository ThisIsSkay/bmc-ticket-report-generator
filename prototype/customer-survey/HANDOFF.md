# Customer Survey handoff

## Resolved-day scope, groups and BCC draft — 2026-11-26

Owner instructions (Claude, branch `integration/unified-app`, not on `main`):
- Survey tickets: status exactly Resolved, Resolved date on one chosen day
  (default: the latest Resolved date in the export). Closed is NOT included.
- Groups: tick Assigned Group values from the export (null = All, [] = none,
  which blocks matching). Without a mapped group column, all groups.
- Output: one unsent Outlook draft, confirmed recipients in BCC, as .eml and a
  Classic Outlook .ps1 helper (Save + Display, no Send).
- Remember draft text, survey link, To line, group ticks and date order in this
  browser. No customer or ticket data is stored.

Code: `lib/scope.mjs` (status rule, day parsing incl. Excel serials and
day/month order detection, group counts), `lib/draft.mjs` (.eml/.ps1, BCC,
de-duplication, link check, 500-recipient cap), `lib/settings.mjs` (the only
storage), `app.mjs` (new mappings, raw XLSX values for the Resolved date,
matching on in-scope rows only, draft section), `index.html`, `style.css`.
Tests: `test/scope.checks.mjs` (8), `test/draft.checks.mjs` (7),
`scripts/verify-survey.mjs` (updated: XLSX/CSV flows now carry Status and
Resolved Date; new scope, draft and storage checks).
Not yet verified: opening the .eml and running the .ps1 in real Outlook (the
owner must check with test addresses that BCC is kept and nothing is in To).

## 2026-11-20

## Corrections after Claude review of 9fd8046

Owner supplied Claude’s review summary and authorized fixes. The full review was
not pushed by Claude; its local commit e6294c1 is not available here. No attempt
was made to overwrite Claude’s branch. Summary and implemented corrections:

- V1/V3: short near-namesakes are shown; an exact result with competing candidates
  is Review required, and tied weak candidates are Ambiguous. No auto-confirm.
- V2: cache once per name/company/department while retaining per-row decisions;
  background worker keeps UI responsive and supports cancellation/replacement.
  Limits are 100,000 rows/file, 20 MiB/file and 50 million unique comparisons.
- V4: narrowly normalise company legal suffixes and IT/HR expansions; retain genuine
  company/department contradictions for review.
- V5/V6: common invisible characters, punctuation, Latin letter variants, and
  reordered/compact supplied aliases produce explainable proposals.
- V7: explicit Windows-1252 selection and readable decoding errors; ignore empty
  trailing columns; choose usable sheets; show actionable import status.
- V8–V11: stricter email syntax, single display-name mailbox extraction, case-insensitive
  duplicate ticket IDs, source row offsets, persistent per-row search text.

Validation: 13 survey regression groups, 61 main tests, typecheck/build. Browser
flow additionally checks Windows-1252, preserved search text, 12,000 ticket rows
against 5,000 directory records, background matching cancellation, and data clearing.
The scale fixture repeats a requester; it does not establish worst-case performance
for 12,000 distinct requesters. Real customer data and mail delivery remain untested.
All confirmation and matching-only constraints remain in force.

## Original release


Owner authorized building the matching-only first release and committing directly
to main, followed by Claude review before user interaction testing. Work starts
from main 0cd198b; the daily/monthly feature branch is not merged or changed.

Implemented:
- Separate /customer-survey/ static page, staged by the existing Pages workflow.
- CSV/TXT UTF-8 and BOM UTF-16, comma/semicolon/tab parsing; XLSX sheet and header
  selection using the repository's existing SheetJS mini distribution/licence.
- Explicit requester/directory mapping, optional company/department/aliases.
- Directory validation, exact duplicate collapse, same-name and shared-email flags.
- Tiered explainable suggestions, multilingual preservation, conservative partial/
  initial/spelling matching and reverse-collision checks. No scores or auto-confirm.
- Per-source-row confirmation/exclusion/no-match/reset and full-directory search.
  Invalid directory records cannot be confirmed. All input/mapping changes clear
  prior decisions; candidate changes clear the affected confirmation.
- Confirmed-recipient preview, fictional samples, pagination, Clear all data.
- No storage writes, network matching, survey sending, drafts or recipient exports.

Deliberate first-release boundaries:
- No stable-ID mapping yet, no group-wide decisions or saved mappings.
- All ticket rows are reviewed, regardless of status/date. Duplicate ticket IDs
  are flagged and retained. Eligibility/deduplication for surveys is not yet agreed.
- No cooldown, offboarding/generic-name exclusions or domain allowlist policy yet.
- The actual customer files have not been inspected; confirm headers and requester
  semantics with the owner. This is not validation of matching accuracy on real data.

Validation: seven Node regression groups cover parsing, tiers, ambiguity, aliases,
reverse matches, invalid addresses, repeated tickets, and Unicode. Main's 61 tests,
typecheck and Pages build pass. Browser flow covers samples, confirmation gating,
manual search, invalid emails, hostile text, mapping reset, XLSX sheet/header choice,
clear/reload, no local/session storage writes, and no external requests.
Main dashboard src/ unchanged. Existing daily/monthly publishing step unchanged.

Claude review: see CLAUDE_REVIEW.md. Owner will evaluate interaction after review;
report defects first, with concrete reproduction steps and severity. Do not send
messages/emails or add business rules without owner direction.

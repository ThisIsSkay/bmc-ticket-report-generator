# Customer Survey handoff — 2026-11-20

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

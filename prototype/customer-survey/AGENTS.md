# Customer Survey guidance

Read HANDOFF.md and README.md. Owner rules (2026-11-26): the survey covers tickets
with status exactly Resolved whose Resolved date is the chosen day (default: latest),
optionally narrowed by ticked Assigned Group values; the output is ONE unsent Outlook
draft (.eml or Classic Outlook .ps1) with confirmed recipients in BCC only. Never
send, never put customers in To or Cc, no automatic confirmation, no cooldown or
other eligibility rules without a new owner instruction. Every recipient requires
explicit per-ticket confirmation.
Use fictional fixtures only. Never commit customer exports, directory data or
stakeholder names. Render source fields as text or HTML-escaped strings.
Keep source data and decisions in tab memory; do not add tracking or external APIs.
Only lib/settings.mjs may write storage: draft text, survey link, To line, group
ticks and date order. Never store ticket rows, names, directory records or decisions.
Preserve src/ and the separately maintained daily/monthly report prototype.
Run npm run test:survey, npm test, npm run typecheck and npm run build:gh-pages.
Use scripts/verify-survey.mjs for browser flows. Main changes trigger deployment;
follow the owner's current authorization and coordinate with the shared repository.

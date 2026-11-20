# Customer Survey guidance

Read HANDOFF.md and README.md. This is a matching-only preview: no sending, drafts,
eligibility rules, persistent directories or automatic confirmation without a new
owner instruction. Every recipient requires explicit per-ticket confirmation.
Use fictional fixtures only. Never commit customer exports, directory data or
stakeholder names. Render source fields as text or HTML-escaped strings.
Keep source data and decisions in tab memory; do not add tracking or external APIs.
Preserve src/ and the separately maintained daily/monthly report prototype.
Run npm run test:survey, npm test, npm run typecheck and npm run build:gh-pages.
Use scripts/verify-survey.mjs for browser flows. Main changes trigger deployment;
follow the owner's current authorization and coordinate with the shared repository.

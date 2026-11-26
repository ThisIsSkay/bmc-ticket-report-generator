Review the latest feature/daily-pivot-email-report changes against 4c5d4d5.
Read AGENTS.md and HANDOFF.md. Review first; do not merge or deploy.

The owner requests Daily activity and Monthly pending tickets based on the raw
export prepared on the reporting day. Monthly means current outstanding tickets
including older tickets, subject to explicit type/status/customer filters, not a
creation-month filter or reconstructed historical backlog.

Independently verify:
- Monthly title, subject, introduction, reporting date, Excel and Outlook draft
  consistently reflect the selected report. Daily HTML/plain text remain unchanged.
- W1: Assigned/Pending and Incident/Service Request intent survives a sparse export
  and includes new matches in the next export. Applying weekly setup keeps contract.
- W2: active manual scope survives a new upload; Save report setup persists it;
  missing contract/groups block export; reset/import behave coherently.
- W3/W4: Excel has separate Status/Priority columns; default choices exclude terminal
  statuses; every summary reconciles with the exported detail rows.
- Test 1200×1200 PNG upload, saved thumbnail, reload, monthly theme C, rejection and
  quota failures. Prior logo fixes are now included for publication. The user's
  original logo is unavailable; do not claim that exact file has been diagnosed.
- Header support stays monthly/outstanding theme C. Preserve daily and signatures.
- Native clipboard with contract confirmation remains an outstanding manual check.

Run prototype tests and scripts/verify-weekly.mjs and verify-header-logo.mjs with
Playwright and the prototype server. Add adversarial cases where warranted.
Return severity-ranked findings with reproductions and file references. Use only
fictional data and record findings in HANDOFF.md for the shared-repository workflow.

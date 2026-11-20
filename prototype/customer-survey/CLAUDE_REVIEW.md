Review the new Customer Survey matching preview on main against baseline 0cd198b.
Fetch safely and preserve local work. Read prototype/customer-survey/AGENTS.md,
README.md and HANDOFF.md. Review only: do not send, merge, deploy or change code
until the owner requests corrections. Record findings in the shared handoff.

Owner wants name matching using BMC Customer Name plus a separately uploaded
name/email directory. Names may differ. This release is matching and recipient
review only, with explicit per-row confirmation; no eligibility decisions or drafts.

Independently inspect and test:
1. UTF-8/UTF-16 BOM, comma/semicolon/tab quoting, XLSX worksheet/header mapping,
   malformed files, blanks/duplicates, limits, and asynchronous replacement/clear.
2. Exact, reordered, alias, compact, partial, initial, title and spelling tiers.
   Probe repeated tokens, Unicode accents/scripts, very short names, duplicates,
   shared mailboxes, invalid addresses, conflicting departments and reverse matches.
   No similarity percentage or automatic identity confirmation is acceptable.
3. Confirmed records cannot be produced without deliberate selection/confirmation.
   Manual search must not reuse stale choices; changed choices/input/mapping must
   invalidate the right decisions. Same-name people and duplicate ticket rows must
   remain distinguishable. Review per-row approach versus future grouping needs.
4. HTML injection from every mapped field, user-controlled worksheet/column names,
   storage/network behavior, and Clear all data including in-flight uploads.
5. XLSX/CSV parsing accuracy, browser responsiveness and the two-million-comparison
   limit. Identify practical scale limitations rather than assuming large data works.
6. Existing src/ and daily/monthly functionality/deployment remain intact.
7. Distinguish missing future features from bugs in the agreed first release:
   no sending, drafts, eligibility, cooldown, saved directory/mappings or exports.

Run npm run test:survey, npm test, npm run typecheck, npm run build:gh-pages.
Run scripts/verify-survey.mjs with Playwright and the documented local server.
Add independent fictional probes; don't rely only on existing tests. Return
severity-ranked findings with file/line evidence and reproducible cases, then
recommend improvements for the owner's later interaction testing. Never commit
real customer data or claim real-data accuracy without examining it appropriately.

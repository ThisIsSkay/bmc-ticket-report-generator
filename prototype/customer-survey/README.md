# Customer Survey — matching preview

[Open the matching preview](https://thisisskay.github.io/bmc-ticket-report-generator/customer-survey/).
It picks the tickets resolved on one day, matches their requesters to your
directory for review, and prepares one unsent Outlook draft with the confirmed
customers in BCC. It never sends email and keeps no survey history.

## Workflow

1. Upload BMC CSV/TXT/XLSX and a customer directory CSV/TXT/XLSX, or use both
   fictional sample buttons. CSV supports UTF-8 and BOM-marked UTF-16, comma,
   semicolon and tab separators. Maximum 20 MiB and 100,000 rows per file. Select Windows-1252 explicitly for older Windows Excel CSVs that are not UTF-8; decoding errors now explain this choice. Empty trailing columns are ignored. The first usable worksheet is selected automatically, and original logical row numbers are retained.
2. Select worksheet and header row. Map BMC Customer Name to Name, not Submitter
   or assigned engineer. Verify that it identifies the actual requester in your
   export. Map directory Name and Email; company, department and aliases are optional.
   Alias values must be separated with semicolons or vertical bars.
3. Survey tickets: status **Resolved** only (Closed, Cancelled and open tickets
   are left out) with a Resolved date on the chosen day, which starts on the
   latest Resolved date in the export. Tick Assigned Groups (e.g. your EUC and
   Network groups) or keep All groups. XLSX date cells are read from their stored
   value, so the display format does not matter; for CSV dates such as 03/04/2026
   the page asks whether they are day-first or month-first unless the file shows it.
   Changing the day, groups or date order clears matches and decisions.
4. Find matches. Unique proposal is not identity verification. No candidate is
   preselected and no record is confirmed automatically.
5. Review explanations, duplicate/conflict warnings and supporting details. Search
   the whole directory manually if the top five suggestions are unsuitable.
   Search shows up to 20 results; refine the search when necessary.
6. Confirm, exclude, mark no suitable match, or reset each ticket row. The final
   preview shows only confirmed records. A change in recipient choice invalidates
   that row's previous confirmation. Input or mapping changes clear all decisions.
7. Survey draft: set the subject, survey link and message (`{link}` is replaced
   by the link; without it the link goes at the end) and an optional To line such
   as your team mailbox. Download the .eml (New Outlook / Outlook on the web: open
   it and it appears as a draft) or the Classic Outlook .ps1 (Run with PowerShell:
   it saves the draft in Drafts and opens it). Confirmed addresses go in BCC only,
   each person once; at most 500 per draft. A confirmation shows the day, groups,
   recipient count, To and subject first; Cancel gives no file. Check the BCC line
   before sending.
8. Clear all data when done. Reload also discards files and decisions. The To line,
   subject, link, message, group ticks and date order are remembered in this browser
   (key `bmc-customer-survey:settings:v1`); "Forget saved survey settings" removes them.

## Matching rules and limits

Exact case/whitespace, punctuation/Latin accents, reordered tokens, explicit
aliases and compact spacing produce stronger proposals. Partial names, initials,
leading titles and one-letter edits/transpositions generate weaker suggestions (including short syllables of at least three characters when the other name parts agree). Exact matches with competing near-namesakes require review; tied weak candidates are ambiguous.
No cross-script transliteration, phonetic mapping, guessed nicknames, or percentage confidence. Common invisible formatting characters, punctuation and Latin letter variants are normalised only for proposals; original names remain visible. Supplied aliases support reordered and compact name keys. Company legal suffixes and IT/HR department expansions are narrowly normalised; other conflicts still require review.
Other-script characters are preserved. Directory conflicts, contradictory company/
department evidence and reverse matches across requester identities require review.

Directory records have separate in-memory IDs even if names or addresses coincide.
Identical records collapse; conflicting records remain visible. Invalid addresses
cannot be confirmed. All BMC source rows remain separate; duplicate ticket IDs are
flagged rather than silently choosing a revision. Decisions never propagate to a
same-name person or another ticket. Ticket eligibility and deduplication policy
must be agreed before draft generation is added.

Matching is cached per distinct requester name/company/department, with separate per-ticket decisions. A cancellable background worker supports up to 50 million distinct-requester/directory comparisons. Large inputs with few repeated names may still need narrowing.
Review is paginated at 30 ticket rows. Validation displays the first 100 warnings
with a notice if more exist. There is no saved directory, matching-decision file,
network matching service or automated sending. Survey cooldown (someone surveyed
last week) is not applied.

## Development

From the repository root:

```sh
npm run test:survey
python3 -m http.server 4180 --bind 127.0.0.1 --directory prototype/customer-survey
```

Optional browser checks require Playwright installed separately:
`NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chromium node scripts/verify-survey.mjs`.
Omit CHROMIUM_PATH to use Playwright's installed Chromium; SURVEY_URL overrides
localhost. SheetJS mini 0.20.3 is copied from the repository's existing vendor
archive; its licence is included. No CDN is used.

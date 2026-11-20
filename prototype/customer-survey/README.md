# Customer Survey — matching preview

[Open the matching preview](https://thisisskay.github.io/bmc-ticket-report-generator/customer-survey/).
This first release prepares a reviewed recipient list; it does not send email,
create drafts, decide ticket eligibility or maintain survey history.

## Workflow

1. Upload BMC CSV/TXT/XLSX and a customer directory CSV/TXT/XLSX, or use both
   fictional sample buttons. CSV supports UTF-8 and BOM-marked UTF-16, comma,
   semicolon and tab separators. Maximum 20 MiB and 10,000 rows per file.
2. Select worksheet and header row. Map BMC Customer Name to Name, not Submitter
   or assigned engineer. Verify that it identifies the actual requester in your
   export. Map directory Name and Email; company, department and aliases are optional.
   Alias values must be separated with semicolons or vertical bars.
3. Find matches. Unique proposal is not identity verification. No candidate is
   preselected and no record is confirmed automatically.
4. Review explanations, duplicate/conflict warnings and supporting details. Search
   the whole directory manually if the top five suggestions are unsuitable.
   Search shows up to 20 results; refine the search when necessary.
5. Confirm, exclude, mark no suitable match, or reset each ticket row. The final
   preview shows only confirmed records. A change in recipient choice invalidates
   that row's previous confirmation. Input or mapping changes clear all decisions.
6. Clear all data when done. Reload also discards files and decisions.

## Matching rules and limits

Exact case/whitespace, punctuation/Latin accents, reordered tokens, explicit
aliases and compact spacing produce stronger proposals. Partial names, initials,
leading titles and one-letter edits/transpositions generate weaker suggestions.
No transliteration, phonetic mapping, guessed nicknames, or percentage confidence.
Other-script characters are preserved. Directory conflicts, contradictory company/
department evidence and reverse matches across requester identities require review.

Directory records have separate in-memory IDs even if names or addresses coincide.
Identical records collapse; conflicting records remain visible. Invalid addresses
cannot be confirmed. All BMC source rows remain separate; duplicate ticket IDs are
flagged rather than silently choosing a revision. Decisions never propagate to a
same-name person or another ticket. Ticket eligibility and deduplication policy
must be agreed before draft generation is added.

The page currently caps matching at two million requester/directory comparisons.
Review is paginated at 30 ticket rows. Validation displays the first 100 warnings
with a notice if more exist. There is no saved directory, matching-decision file,
recipient export, draft generator, network matching service or automated sending.

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

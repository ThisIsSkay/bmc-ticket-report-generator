# BMC Daily Ticket Report — email design handoff

Design spec for adding an **Outlook-safe HTML email** output to the BMC ticket report generator.
Four visual variants (A–D) share one structure; pick one to implement.

```
email-design/
├── README.md            ← this spec
├── CODEX_PROMPT.md      ← prompt to paste into Codex
├── sample-data.json     ← fictional data the references were built from
├── reference/variant-{A,B,C,D}.html   ← exact target markup (source of truth)
└── previews/variant-{A,B,C,D}.png     ← screenshots of the references
```

The **reference HTML is the source of truth** for every colour, size and padding. Copy its inline
styles verbatim; do not re-derive them from the PNGs.

---

## 1. Hard rendering constraints (Classic Outlook / Word engine)

Every generated email must satisfy all of these:

- Layout with `<table>` only — no flexbox, grid, float or `position`.
- All styling inline on each element — no `class`, no `<style>` block, no external CSS.
- `font-family:Arial,Helvetica,sans-serif` set **on every `p`, `h1`, `h2`, `td` and `th` that holds text** (Outlook falls back to Times New Roman on unstyled `<p>`).
- No web fonts, icon fonts, SVG, `border-radius`, gradients, `box-shadow` or background images.
- Solid hex backgrounds (`bgcolor` attribute **and** `background-color` style) and **1px solid** borders only.
- Thicker accent bars (B, C) are filled `<td>`s with `height`, `font-size:1px`, matching `line-height`, `mso-line-height-rule:exactly` and `&nbsp;` — keep that pattern.
- Spacer cells are `<td width="N" style="width:Npx;font-size:0;line-height:0;">&nbsp;</td>`.
- Layout tables carry `role="presentation"`; data tables use `<thead>`/`<th>` and no role.
- Outer width is fixed at **800px**; content width is **736px** (32px side padding).
- Any logo is a plain `<img src="…" width="120" height="36" alt="…" style="display:block;border:0;">` (variant C has a labelled `LOGO` placeholder cell in that spot).

## 2. Email structure (all variants, in this order)

1. Greeting — `Hi Team,` + `Please find below the daily ticket activity summary for {reportDateLong}.`
2. Title — `BMC Daily Ticket Report — {reportDate}` (em dash) as `<h1>`
3. Caption — `Daily ticket activity · Monitoring events excluded` (middle dot)
4. KPI row, 3 cells: **Created on date**, **Closed/resolved**, **Outstanding**
5. `<h2>` **Summary by assigned group** + table: Assigned group | Created | Closed | Outstanding, rows from data, then **TOTAL**
6. `<h2>` **Summary by ticket type** + table: Ticket type | Created | Closed | Outstanding, rows from data, then **TOTAL**
7. `<h2>` **Tickets created on {reportDate} ({count})** + table: Ticket ID | Type | Summary | Assignee | Assigned group | Current status — **one row per created ticket** (the references show 3 for brevity)
8. Signature — `Best regards,` / name / title / company · phone
9. Disclaimer — small grey text: `This is an automated report generated from BMC Helix ITSM. Figures cover tickets for {reportDate} (SGT) and exclude monitoring events. This email is intended only for the named recipients; if you received it in error, please notify the sender and delete it.`

Column widths (keep them): summary tables `376 / 120 / 120 / 120`; tickets table `132 / 108 / 198 / 96 / 116 / 86`.

## 3. Data mapping

Use the tool's **existing** parsing and counting logic; the email must show the same numbers as the
dashboard and WhatsApp report. `sample-data.json` shows the shape the designs assume:

| Email element | Field |
|---|---|
| Dates | `reportDate` (YYYY-MM-DD), `reportDateLong` (e.g. 10 November 2026) |
| KPI cells | `kpis.createdOnDate`, `kpis.closedResolved`, `kpis.outstanding` |
| Group table rows | `byGroup[]` → `name, created, closed, outstanding` |
| Type table rows | `byType[]` → same fields |
| TOTAL rows | sum of the rows above (or the tool's existing totals) |
| Tickets table | `createdTickets[]` → `id, type, summary, assignee, group, status` |
| Signature | `sender.name, sender.title, sender.company, sender.phone` |

Rendering rules:

- **HTML-escape** every value from ticket data (`& < > " '`) — summaries are free text.
- Missing values render as `—`, never `undefined`/`null`.
- Zero created tickets → one row, `colspan="6"`, text `No tickets were created on this date.`, styled as a normal data row.
- Long summaries wrap; nothing may widen the email past 800px.

## 4. Per-variant row rules (the parts that change with row count)

Static parts (header, KPI cells, signature) copy straight from the reference. Repeating rows follow these rules — row index is 1-based, data rows only:

| | Data rows | Last data row before TOTAL | TOTAL row | Numbers |
|---|---|---|---|---|
| **A · Navy band** | Even rows filled `#F4F6F9`; every row except the first has `border-top:1px solid #D3DAE2` | same as others | fill `#E3E9F0`, `border-top:1px solid #9FB0C3`, bold, `#1B3A5C` | centred |
| **B · Ruled minimal** | No fill; `border-bottom:1px solid #E1E5E9`; first column `padding-left:0`, last column `padding-right:0` | `border-bottom:1px solid #1F2328` (summary tables only; tickets table keeps `#E1E5E9`) | no border, bold | right-aligned |
| **C · Boxed grid** | `border:1px solid #B9C1CA` on every cell; even rows filled `#F6F7F9` | same as others | fill + border `#2E3D4F`, white bold, `padding:6px 8px` | centred |
| **D · Tinted panels** | No borders; even rows filled `#F2F7F5` | same as others | fill `#DCE9E5`, `border-top:1px solid #1F5F55`, bold `#1F5F55` | right-aligned |

The tickets table uses the same data-row rules as the summary tables of its variant (no TOTAL row).

## 5. Delivery in the tool

Fit these to how the tool already outputs the WhatsApp report — add alongside it, don't replace it:

- **Preview** — render the generated HTML in a sandboxed `<iframe srcdoc>` 800px wide.
- **Copy for Outlook** — `navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })])` so pasting into a new Outlook message keeps formatting; plain-text fallback is the WhatsApp-style text.
- **Download .html** — full document (doctype + head + body) as in `reference/`.

## 6. Acceptance checks

- Rendering `sample-data.json` gives the same markup and inline styles as `reference/variant-X.html`, except the tickets table has 5 rows instead of 3.
- An automated test fails if the output contains any of: `class=`, `<style`, `display:flex`, `display:grid`, `float:`, `position:`, `border-radius`, `gradient`, `box-shadow`, `<svg`, `url(`.
- A test confirms every `<p`, `<h1`, `<h2`, and text-bearing `<td`/`<th` has `font-family:Arial`.
- Escaping test: a summary of `Printer <HP> & "scanner"` renders escaped.
- Existing WhatsApp/dashboard output is unchanged.

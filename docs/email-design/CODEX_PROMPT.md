Implement variant [A/B/C/D] of the daily ticket report email in this tool.

Read docs/email-design/README.md first. It is the spec. docs/email-design/reference/variant-[A/B/C/D].html is the exact target markup: copy its structure and inline styles verbatim. The PNGs in docs/email-design/previews/ show how it should look.

Tasks:
1. Find where the tool computes the daily report (the same data behind the dashboard and WhatsApp report). Reuse that data; do not write new counting logic.
2. Add a function that turns that report data into the email HTML for the chosen variant, following README sections 2–4: dynamic rows, zebra/border rules, TOTAL row, the empty state, and HTML-escaping of all ticket fields.
3. Add the delivery UI from README section 5 (preview iframe, "Copy for Outlook" rich-HTML clipboard copy, "Download .html") alongside the existing WhatsApp output. Do not change the existing output.
4. Add the tests from README section 6, using docs/email-design/sample-data.json as the fixture.
5. Add a short "Email HTML rules" section to AGENTS.md (create it if missing) summarising README section 1, so future changes keep the email Outlook-safe.

Hard rules: tables only, all styles inline, Arial on every text element, 1px solid borders, solid hex backgrounds, no classes, no <style> block, no flex/grid/float/position, no border-radius, gradients, shadows, SVG or background images.

When done, list the files you changed and show the generated HTML for sample-data.json.

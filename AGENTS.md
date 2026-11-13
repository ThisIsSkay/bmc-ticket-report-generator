# Project guidance

## Email HTML rules

Generated daily report emails must remain safe for the Classic Outlook Word
renderer. Use tables for layout, keep all styles inline, and set
`font-family:Arial,Helvetica,sans-serif` on every text-bearing `p`, `h1`,
`h2`, `td`, and `th`. Use solid hexadecimal backgrounds and 1px solid
borders. Do not add classes, `<style>` blocks, web fonts, flexbox, grid,
float, position, border radius, gradients, shadows, SVG, or background images.
Keep the outer table at 800px and the content table at 736px. Use `bgcolor`
alongside `background-color` for filled cells, preserve the Outlook-safe
spacer-cell and accent-bar patterns, and escape every ticket value before
inserting it into HTML. Missing values render as `—`.

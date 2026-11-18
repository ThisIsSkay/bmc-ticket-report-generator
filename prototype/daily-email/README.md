# BMC Daily Pivot & Email Report (prototype)

A local-only starter project for the **Daily Pivot & Email Report** navigation item that will sit beneath the existing NCC **Report Dashboard** in [bmc-ticket-report-generator](https://github.com/ThisIsSkay/bmc-ticket-report-generator). This prototype is a standalone proof of concept; it does **not** change the existing report generator. Customer email design is **provisional** until the reference design is approved.

## Current functions
- Import a BMC `.xlsx`/`.csv` export with automatic worksheet and column identification.
- Apply report date, assigned-group and contract filters; exclude EVT monitoring by default.
- Pivot-style summaries by assigned group and ticket type; lists of tickets **created** and **closed/resolved** on the report date, plus current outstanding tickets.
- Avoid double-counting duplicate Ticket IDs. A ticket created and closed on the same date appears in both activity lists.
- First-run email settings: To, Cc, Bcc, subject template, greeting and introduction. Multiple editable rich-text signature presets with clipboard PNG/JPEG paste, logo uploads and formatted Outlook signatures; selectable per export. Stored locally in the browser; export/import as JSON.
- Select Classic Outlook, New Outlook or Gmail. **Classic Outlook** can download a local `.ps1` helper that creates an unsent editable draft and saves a Unicode `.msg`; **New Outlook/Gmail** retain `.eml`, `.html`, or rich clipboard export. No credential capture and **no automatic sending**.
- Includes fictional CSV sample data. The provided real Excel workbook is intentionally **not packaged**.

- Email themes A–D (`lib/email-themes.mjs`) follow `docs/email-design/reference/variant-{A,B,C,D}.html`. The sign-off is either the selected signature profile (rich HTML and logo) or, when none is selected, the **Sender details** (name, job title, company, office phone) from Email settings; blank lines are left out and the email panel warns while they are incomplete. The introduction may use `{date}`; otherwise " for <report date>." is appended. **Copy formatted email** also puts a plain-text version of the report on the clipboard.
- In-progress fix list and status: `HANDOFF.md` in this folder.

## Outstanding customer reports

1. Upload an export or load the fictional sample.
2. Under **02 / Report options**, set **Report content** to **Outstanding tickets**.
3. Select the intended contract. To choose specific teams, uncheck **All assigned
   groups**, then select the groups you need. Application groups appear using
   their exact names in the uploaded export; the built-in daily sample does not
   contain an Application group.
4. Engineer names are hidden by default. Enable **Include engineer names** only
   when wanted in the report.
5. Review totals and ticket details. Under **04 / Email preview & export**, choose
   theme A–D and use the existing copy, HTML, EML or Classic Outlook draft options.

Outstanding includes all current non-terminal statuses in the uploaded snapshot,
not just the literal Pending status. Closed, Resolved, Cancelled and Canceled
are excluded by the existing reporting rules. The selected daily date does not
limit outstanding tickets. No export timestamp or historical backlog is inferred.
Group selection applies after duplicate resolution, so reassigned tickets cannot
reappear under an older group. Selecting no groups produces an empty report.

The outstanding subject and introduction have separate fields in **Email settings**.
Mode, engineer visibility and these fields are saved locally and in settings backups.
Group selections reset to All when a new file is loaded. The scope notice is a
reminder to check the intended customer; a contract is not assumed to identify a
customer automatically. Drafts remain unsent until reviewed and sent in your client.

## Weekly ageing setup and Excel delivery

In Outstanding tickets, click **Use weekly ageing setup**, then enter the
**Age reference date**. The setup selects Incident and Service Request with raw
Assigned and Pending statuses. Change the multi-select lists to narrow or expand
that scope. The ageing bands are 0–7, 8–14, 15–30, 31–60 and over 60 calendar days
since submission, with separate unknown/future categories. This does not show
historical backlog or time spent in a status.

Weekly setup enables **Email summaries only**; full details are in **Download
Excel details**. The Classic Outlook helper attaches that workbook automatically
when creating the unsent draft. For EML or clipboard, download Excel and attach
it manually. A reference date is required for workbook and pending Outlook-helper
exports. Workbooks over 5 MB require a narrower scope.

Use Email settings to upload a PNG/JPEG header logo for outstanding theme C.
Other themes keep their approved header designs. Save settings, then **Export
settings** to save one report setup including current filters and recipients.
Import restores it; missing saved scope values block export until you explicitly
**Clear saved scope** and review the new selection. Multiple named report presets
are deferred. Imported tickets are never stored in the settings file.

## Run

Requires Node.js 20+; no npm installation or external dependencies.

```bash
npm run dev
# then visit http://localhost:4173
npm test
```

For a static site, the directory can also be hosted over HTTPS. Browser capabilities (`DecompressionStream`, clipboard) vary; Chrome/Edge are recommended for XLSX upload.

## Next integration into existing sidebar

In `src/App.tsx` of the original BMC generator, under **Report**, display:

1. **Report Dashboard** — existing NCC screenshot/JPEG report, unchanged.
2. **Daily Pivot & Email Report** — the new feature here.
3. **Ticket Data** — existing detail view, unchanged.

Both screens should share the normalized import data and configuration. The current standalone prototype uses **Assigned Group/Contract** scope, whereas the original NCC screenshot report defines team scope through selected engineers. Before integrating, make the scope selectable and ensure the email summary totals use the same filters as its detail tables. Do not merge into the original dashboard until the customer email format and reporting rules are approved.

## Reporting rules

- Created = ticket's Submit Date matches selected report date (including cancelled, if submitted that day).
- Closed = current raw BMC status is Closed or Resolved **and** Resolved Date matches selected report date.
- Pending = current status is not Closed, Resolved or Cancelled. This is a **current snapshot**, not a historical as-of backlog.
- Ticket IDs deduplicate by Last Modified Date, then last row order in exported file.
- EVT events excluded by default; can be included.
- If the Resolved Date column is missing, reporting is blocked rather than showing an incorrect zero.

**Snapshot limitation:** a reopened ticket with a current status of Pending does not count as closed on an earlier date based on its old Resolved Date. Historical throughput requires BMC lifecycle audit data. Duplicate ordering can also be wrong if export rows aren't chronological and lack a modified timestamp; audit before operational use.

## Email client limitations

`.eml` is portable but not guaranteed to open as a ready-to-edit draft in all clients. In particular, **Classic Outlook can display the raw MIME headers/Base64 as a plain-text message rather than import an editable email**. Do not use `.eml` as the Classic Outlook primary flow.

**Classic Outlook on Windows:** choose Classic Outlook and click **Download Classic Outlook draft (.ps1)**. In the Downloads folder right-click the script and choose **Run with PowerShell** (or use Windows PowerShell 5.1 to run that local file if permitted). It uses `Outlook.Application` COM automation with the existing configured Outlook profile to create an **unsent editable draft**, saves a Unicode `.msg` next to the `.ps1`, and opens the draft for review. If the report includes signature logos, the helper attaches them with Content-ID references. No additional email login is needed; it never calls `Send`. The script contains the report data and is intended for a trusted workstation. **If your organisation blocks PowerShell or Outlook automation, do not bypass that policy; use Copy formatted email into a new Outlook compose window instead.** Native Classic Outlook COM does not run in New Outlook or Gmail.

**New Outlook:** `.eml` may open but draft editability varies; use Copy formatted email when necessary. **Gmail:** use Copy formatted email into the signed-in compose window. Neither client receives automatic sign-in or sends from this static browser app. Client login credentials are neither requested nor stored.

## Privacy

- Raw BMC Excel/CSV is processed only in the current browser; ticket rows never enter localStorage.
- The real workbook is **not** part of this project or ZIP.
- Generated HTML and EML include ticket data. Review recipients and confidentiality before sending.
- No network API, tracking, or email delivery. Host on a trusted local or internal network for real customer data.

## Handoff for Claude

Read `README.md`, `lib/report-core.mjs`, `lib/mail.mjs`, `lib/xlsx-lite.mjs` and tests first. Keep existing screenshot export unchanged. Once the desired customer email sample is approved, adjust `renderEmail` to match it. Priorities: integrate as **Daily Pivot & Email Report** beneath **Report Dashboard**; preserve signed-in Outlook workflow without credentials; align team and contract rules with the parent app; test rich signature branding across email clients; test the same-day created+closed case, reopened tickets, time zones, duplicates and blank assignees. Do not include genuine BMC data in Git.

## Working branch and preview

This prototype is developed on `feature/daily-pivot-email-report` inside the existing repository, stored under `prototype/daily-email/`. The main NCC screenshot report remains unchanged. GitHub Pages copies the prototype into `/daily-email/` for stakeholder testing; its saved settings live separately in browser storage.

### Rich signature images

The signature editor accepts formatted text and pasted PNG/JPEG images. It also provides **Insert PNG/JPEG** for logos whose binary data is not included when copying an Outlook signature. Supported images are resized for safe local storage. HTML emails preserve rich formatting, and downloaded .eml files embed image bytes as inline Content-ID (CID) MIME attachments to avoid broken logo links.

Settings (including images) are stored in browser localStorage and can be backed up as JSON. Test in the intended email client before sending: EML draft editability and HTML clipboard image rendering vary by email client.

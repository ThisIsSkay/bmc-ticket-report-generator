/**
 * Survey email draft (owner instruction, 2026-11-26): ONE unsent draft with the
 * confirmed recipients in BCC, so customers never see each other's addresses.
 * Two forms: an .eml file (X-Unsent) for New Outlook / Outlook on the web, and a
 * PowerShell helper that creates the draft in installed Classic Outlook.
 * Nothing here sends mail, calls a network service or stores data.
 */
export const DEFAULT_DRAFT = Object.freeze({
  to: '',
  subject: 'Customer satisfaction survey',
  link: '',
  message: 'Dear Customer,\n\nYour recent IT support ticket has been resolved. We would appreciate a few minutes of your time to tell us about your experience:\n\n{link}\n\nThank you.\nIT Service Desk',
});
export const MAX_RECIPIENTS = 500; // Exchange Online's default per-message recipient limit.
const ADDRESS = /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]+$/;
const F = 'font-family:Arial,Helvetica,sans-serif;';
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Split a To line into valid and invalid addresses. */
export function addressList(text) {
  const items = String(text || '').split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean);
  return {valid: items.filter((x) => ADDRESS.test(x)), invalid: items.filter((x) => !ADDRESS.test(x))};
}

/** Each address once (case-insensitive), first spelling and order kept. */
export function uniqueRecipients(emails) {
  const seen = new Set(), out = [];
  for (const email of emails) {
    const value = String(email ?? '').trim();
    if (!ADDRESS.test(value) || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

export function linkProblem(link) {
  const value = String(link ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || /\s/.test(value)) throw Error();
  } catch { return 'The survey link must be a full web address starting with https://'; }
  return '';
}

/** Why the draft cannot be made yet, or ''. */
export function draftProblem({recipients = [], to = '', subject = '', link = '', message = ''} = {}) {
  if (!recipients.length) return 'Confirm at least one recipient first.';
  if (recipients.length > MAX_RECIPIENTS) return `${recipients.length} recipients is over ${MAX_RECIPIENTS}, the usual Outlook limit for one email. Tick fewer groups.`;
  const bad = addressList(to).invalid;
  if (bad.length) return 'The To line has an address that is not valid: ' + bad.join(', ');
  if (!String(subject).trim()) return 'Add a subject.';
  if (!String(message).trim()) return 'Add a message.';
  const problem = linkProblem(link);
  if (problem) return problem;
  if (String(message).includes('{link}') && !String(link).trim()) return 'Add the survey link, or remove {link} from the message.';
  return '';
}

/** Plain-text body: {link} becomes the link; without the placeholder the link goes at the end. */
export function messageText(message, link) {
  const text = String(message ?? '').replace(/\r\n?/g, '\n');
  const url = String(link ?? '').trim();
  if (text.includes('{link}')) return text.replaceAll('{link}', url);
  return url ? text.replace(/\s*$/, '') + '\n\n' + url : text;
}

/** Outlook-safe HTML body: one table, inline Arial on every text element, escaped text. */
export function messageHtml(message, link, subject = '') {
  const url = String(link ?? '').trim();
  const anchor = url ? `<a href="${escapeHtml(url)}" style="${F}color:#0B5CAD;text-decoration:underline;">${escapeHtml(url)}</a>` : '';
  let text = String(message ?? '').replace(/\r\n?/g, '\n');
  if (!text.includes('{link}') && url) text = text.replace(/\s*$/, '') + '\n\n{link}';
  const paragraphs = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px 0;${F}font-size:14px;line-height:21px;color:#1F2933;">${escapeHtml(block).replaceAll('{link}', anchor).replace(/\n/g, '<br />')}</p>`);
  return `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background-color:#FFFFFF;"><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;border-collapse:collapse;"><tbody><tr><td style="padding:16px 24px;${F}font-size:14px;line-height:21px;color:#1F2933;">${paragraphs.join('')}</td></tr></tbody></table></body></html>`;
}

const utf8Base64 = (text) => { const bytes = new TextEncoder().encode(text); let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(data); };
const fold76 = (s) => s.match(/.{1,76}/g)?.join('\r\n') || '';
const oneLine = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
const header = (v) => /^[\x20-\x7e]*$/.test(oneLine(v)) ? oneLine(v) : `=?UTF-8?B?${utf8Base64(oneLine(v))}?=`;
// One address per folded line keeps every header line far below the 998-character limit.
const addressHeader = (name, list) => list.length ? [`${name}: ${list.join(',\r\n ')}`] : [];

/** RFC 5322 unsent draft. Recipients go in Bcc only; To holds only the optional To line. */
export function renderSurveyEml({to = '', bcc = [], subject = '', message = '', link = '', now = new Date()} = {}) {
  const recipients = uniqueRecipients(bcc);
  const boundary = 'bmc-survey-' + now.getTime().toString(36);
  return [
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    'Date: ' + now.toUTCString(),
    ...addressHeader('To', addressList(to).valid),
    ...addressHeader('Bcc', recipients),
    'Subject: ' + header(subject),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    fold76(utf8Base64(messageText(message, link))),
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    fold76(utf8Base64(messageHtml(message, link, oneLine(subject)))),
    '--' + boundary + '--',
    '',
  ].join('\r\n');
}

const psQuote = (value) => "'" + String(value ?? '').replaceAll("'", "''") + "'";

/** Classic Outlook helper: creates and opens an unsent draft. It has no Send call. */
export function renderSurveyPs1({to = '', bcc = [], subject = '', message = '', link = ''} = {}) {
  const recipients = uniqueRecipients(bcc);
  // Inside a single-quoted here-string only a line starting with '@ can end it early.
  const html = messageHtml(message, link, oneLine(subject)).replace(/\r\n?/g, '\n').replace(/(^|\n)'@/g, '$1&#39;@');
  const lines = [
    '# BMC Customer Survey - Classic Outlook draft helper',
    '# Generated locally. Requires installed Classic Outlook with a configured profile.',
    '# Creates ONE unsent draft with the survey recipients in BCC and opens it for review.',
    '# Does not send email, use credentials, download scripts, or call an API.',
    '$ErrorActionPreference = "Stop"',
    '$html = @' + "'",
    html,
    "'@",
    'try {',
    '    $outlook = New-Object -ComObject Outlook.Application',
    '    $mail = $outlook.CreateItem(0) # 0 = olMailItem',
    '    $mail.BodyFormat = 2 # 2 = olFormatHTML',
    '    $mail.To = ' + psQuote(addressList(to).valid.join('; ')),
    '    $mail.BCC = ' + psQuote(recipients.join('; ')),
    '    $mail.Subject = ' + psQuote(oneLine(subject)),
    '    $mail.HTMLBody = $html',
    '    $mail.Save() # Saves to the Drafts folder of the active Outlook profile',
    '    $mail.Display($false) # Opens the draft for review; you send it yourself',
    '    Write-Host ("Unsent survey draft opened in Classic Outlook with ' + recipients.length + ' recipient(s) in BCC.")',
    '} catch {',
    '    Write-Host ("Could not create the Classic Outlook draft: " + $_.Exception.Message) -ForegroundColor Red',
    '    [void] (Read-Host "Press Enter to close")',
    '    exit 1',
    '}',
    '',
  ];
  // Windows PowerShell 5.1 needs a UTF-8 BOM to read non-ASCII text.
  return '﻿' + lines.join('\r\n');
}

export const draftFilename = (day, extension) => `Customer_Survey_Draft_${String(day || 'undated').replace(/[^0-9A-Za-z-]/g, '_')}.${extension}`;

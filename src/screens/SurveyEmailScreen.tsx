import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Mail, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { defaultSurveyEmailTemplate } from '../config/defaults'
import { closedOnReportDateTickets } from '../lib/report'
import {
  buildSurveyRecipients,
  dedupeSurveyRecipients,
  isValidSurveyEmail,
  resolveSurveyBody,
  surveySourceStats,
  type SurveyRecipient,
} from '../lib/surveyEmail'
import { loadSurveyEmailTemplate, saveSurveyEmailTemplate } from '../lib/storage'
import type { SurveyEmailTemplate, Ticket } from '../types'

const cloneRecipients = (rows: SurveyRecipient[]): SurveyRecipient[] =>
  rows.map((row) => ({ email: row.email, ticketIds: [...row.ticketIds] }))

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const text = document.createElement('textarea')
  text.value = value
  document.body.appendChild(text)
  text.select()
  document.execCommand('copy')
  text.remove()
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function encodeHeaderUtf8(value: string): string {
  const text = cleanHeader(value)
  if (!text) return ''
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `=?UTF-8?B?${btoa(binary)}?=`
}

function safeFileName(value: string): string {
  const base = cleanHeader(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return `${base || 'survey-email'}.eml`
}

function downloadEml(template: SurveyEmailTemplate, bcc: string[], body: string): void {
  const headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    `Date: ${new Date().toUTCString()}`,
    template.to.trim() ? `To: ${cleanHeader(template.to)}` : '',
    bcc.length ? `Bcc: ${bcc.join(', ')}` : '',
    `Subject: ${encodeHeaderUtf8(template.subject)}`,
  ].filter(Boolean)

  const message = `${headers.join('\r\n')}\r\n\r\n${body.replace(/\r?\n/g, '\r\n')}\r\n`
  const blob = new Blob([message], { type: 'message/rfc822;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFileName(template.subject)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SurveyEmailScreen({
  tickets,
  reportDate,
  requesterEmailMapped,
  onOpenColumnMapping,
}: {
  tickets: Ticket[]
  reportDate: string
  requesterEmailMapped: boolean
  onOpenColumnMapping: () => void
}) {
  const closedTickets = useMemo(() => closedOnReportDateTickets(tickets, reportDate), [tickets, reportDate])
  const sourceRecipients = useMemo(() => buildSurveyRecipients(closedTickets), [closedTickets])
  const sourceStats = useMemo(() => surveySourceStats(closedTickets), [closedTickets])
  const [recipientRows, setRecipientRows] = useState<SurveyRecipient[]>(() => cloneRecipients(sourceRecipients))
  const [template, setTemplate] = useState<SurveyEmailTemplate>(() => loadSurveyEmailTemplate())
  const [message, setMessage] = useState('')

  useEffect(() => {
    setRecipientRows(cloneRecipients(sourceRecipients))
  }, [sourceRecipients])

  const validRecipients = useMemo(() => dedupeSurveyRecipients(recipientRows), [recipientRows])
  const bcc = useMemo(() => validRecipients.map((recipient) => recipient.email), [validRecipients])
  const invalidEditedRows = recipientRows.filter((row) => row.email.trim() && !isValidSurveyEmail(row.email)).length
  const duplicateEditedRows = Math.max(0, recipientRows.filter((row) => isValidSurveyEmail(row.email)).length - validRecipients.length)
  const resolvedBody = resolveSurveyBody(template.body, template.surveyLink)
  const surveyLinkRequired = template.body.includes('{{SURVEY_LINK}}')
  const ready = bcc.length > 0 && Boolean(template.subject.trim()) && Boolean(template.body.trim()) && (!surveyLinkRequired || Boolean(template.surveyLink.trim()))

  const updateTemplate = (patch: Partial<SurveyEmailTemplate>) => {
    setTemplate((current) => ({ ...current, ...patch }))
    setMessage('')
  }

  const ensureReady = (): boolean => {
    if (!bcc.length) window.alert('There are no valid BCC recipients.')
    else if (!template.subject.trim()) window.alert('Please enter an email subject.')
    else if (!template.body.trim()) window.alert('Please enter an email message.')
    else if (surveyLinkRequired && !template.surveyLink.trim()) window.alert('Please enter the survey link used by the email template.')
    else return true
    return false
  }

  const copyBcc = async () => {
    await copyText(bcc.join('; '))
    setMessage('BCC copied.')
  }

  const copyEmail = async () => {
    await copyText(`To: ${template.to.trim()}\nBCC: ${bcc.join('; ')}\nSubject: ${template.subject.trim()}\n\n${resolvedBody}`)
    setMessage('Email copied.')
  }

  const openOutlook = () => {
    if (!ensureReady()) return
    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(template.to.trim())}&bcc=${encodeURIComponent(bcc.join(';'))}&subject=${encodeURIComponent(template.subject.trim())}&body=${encodeURIComponent(resolvedBody)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openGmail = () => {
    if (!ensureReady()) return
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(template.to.trim())}&bcc=${encodeURIComponent(bcc.join(','))}&su=${encodeURIComponent(template.subject.trim())}&body=${encodeURIComponent(resolvedBody)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h2 className="text-2xl font-bold">Survey Email</h2>
          <p className="mt-1 text-sm text-gray-600">Prepare one satisfaction survey email from users whose in-scope tickets were Closed/Resolved on {reportDate}. Recipients are placed in BCC.</p>
        </div>
        <span className={ready ? 'pill pill-ok' : 'pill pill-attn'}>{ready ? 'Draft ready' : 'Needs review'}</span>
      </div>

      {!requesterEmailMapped && (
        <div className="flex items-start justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div><strong>User / Requester Email is not mapped.</strong><div className="mt-1">Map the BMC email column to populate survey recipients automatically. You can still add recipients manually below.</div></div>
          <button className="btn-secondary shrink-0" onClick={onOpenColumnMapping}>Open Column Mapping</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="panel p-4"><div className="label">Closed today</div><div className="text-2xl font-bold">{closedTickets.length.toLocaleString()}</div><div className="mt-1 text-xs text-gray-500">same Closed population as the report</div></div>
        <div className="panel p-4"><div className="label">With valid email</div><div className="text-2xl font-bold">{sourceStats.validEmailTickets.toLocaleString()}</div><div className="mt-1 text-xs text-gray-500">closed tickets with usable email</div></div>
        <div className="panel p-4"><div className="label">Unique recipients</div><div className="text-2xl font-bold">{bcc.length.toLocaleString()}</div><div className="mt-1 text-xs text-gray-500">deduplicated BCC list</div></div>
        <div className="panel p-4"><div className="label">Needs review</div><div className="text-2xl font-bold">{sourceStats.needsReview.toLocaleString()}</div><div className="mt-1 text-xs text-gray-500">source tickets missing/invalid email</div></div>
      </div>

      <div className="grid grid-cols-[1.08fr_.92fr] items-start gap-5">
        <div className="space-y-5">
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="font-bold">BCC recipients</h3><p className="mt-1 text-xs text-gray-500">Edit, remove or add recipients before creating the email.</p></div>
              <span className="tag tag-neutral">{bcc.length.toLocaleString()} recipients</span>
            </div>

            {(sourceStats.needsReview > 0 || invalidEditedRows > 0 || duplicateEditedRows > 0) && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {sourceStats.needsReview > 0 && <span>{sourceStats.needsReview} closed ticket(s) have a missing or invalid mapped email. </span>}
                {invalidEditedRows > 0 && <span>{invalidEditedRows} edited/manual recipient(s) are invalid. </span>}
                {duplicateEditedRows > 0 && <span>{duplicateEditedRows} duplicate edited recipient(s) will only be BCC'd once.</span>}
              </div>
            )}

            <div className="space-y-2">
              {recipientRows.length === 0 && <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">No valid mapped recipients yet. You can add one manually.</div>}
              {recipientRows.map((recipient, index) => {
                const valid = !recipient.email.trim() || isValidSurveyEmail(recipient.email)
                return (
                  <div className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2" key={index}>
                    <input
                      className={valid ? 'field' : 'field border-red-300'}
                      value={recipient.email}
                      placeholder="name@example.com"
                      onChange={(event) => setRecipientRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, email: event.target.value } : row))}
                    />
                    <div className="truncate text-xs text-gray-500" title={recipient.ticketIds.join(', ')}>{recipient.ticketIds.length ? recipient.ticketIds.join(', ') : 'Manual recipient'}</div>
                    <button className="btn-danger px-2 py-2" aria-label="Remove recipient" onClick={() => setRecipientRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setRecipientRows((current) => [...current, { email: '', ticketIds: [] }])}><Plus className="h-4 w-4" /> Add recipient</button>
              <button className="btn-ghost" onClick={() => setRecipientRows(cloneRecipients(sourceRecipients))}><RotateCcw className="h-4 w-4" /> Restore from closed tickets</button>
              <button className="btn-secondary" disabled={!bcc.length} onClick={() => void copyBcc()}><Mail className="h-4 w-4" /> Copy BCC</button>
            </div>

            <details className="mt-4 border-t border-gray-200 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700">View source closed tickets ({closedTickets.length.toLocaleString()})</summary>
              <div className="mt-3 max-h-72 overflow-auto rounded-md border border-gray-200">
                <table className="diagnostic-table">
                  <thead><tr>{['Ticket ID', 'Team', 'Engineer', 'User Email', 'Status', 'Resolved Date'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
                  <tbody>
                    {closedTickets.map((ticket) => (
                      <tr key={`${ticket.id}-${ticket.sourceIndex}`}>
                        <td className="font-semibold">{ticket.id || '(blank)'}</td>
                        <td>{ticket.team}</td>
                        <td>{ticket.assignedTo || '(blank)'}</td>
                        <td>{ticket.requesterEmail || <span className="text-red-600">Missing</span>}</td>
                        <td>{ticket.rawStatus}</td>
                        <td className="whitespace-nowrap">{ticket.closedDate?.toLocaleString() ?? '—'}</td>
                      </tr>
                    ))}
                    {closedTickets.length === 0 && <tr><td colSpan={6} className="text-gray-500">No tickets were closed on the report date.</td></tr>}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="panel p-5">
            <div className="mb-4"><h3 className="font-bold">Email content</h3><p className="mt-1 text-xs text-gray-500">Today's draft is editable. Save it only when you want these values to become your default template.</p></div>
            <div className="space-y-3">
              <div><label className="label">To (optional)</label><input className="field" value={template.to} placeholder="Your mailbox or service desk address" onChange={(event) => updateTemplate({ to: event.target.value })} /></div>
              <div><label className="label">Subject</label><input className="field" value={template.subject} onChange={(event) => updateTemplate({ subject: event.target.value })} /></div>
              <div><label className="label">Survey link</label><input className="field" value={template.surveyLink} placeholder="https://..." onChange={(event) => updateTemplate({ surveyLink: event.target.value })} /></div>
              <div><label className="label">Message</label><textarea className="field min-h-64 resize-y" value={template.body} onChange={(event) => updateTemplate({ body: event.target.value })} /><div className="mt-1 text-xs text-gray-500">Use <strong>{'{{SURVEY_LINK}}'}</strong> in the message to insert the survey URL.</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => { saveSurveyEmailTemplate(template); setMessage('Default survey template saved.') }}><Save className="h-4 w-4" /> Save as default template</button>
              <button className="btn-secondary" onClick={() => { setTemplate(loadSurveyEmailTemplate()); setMessage('Saved template restored.') }}><RotateCcw className="h-4 w-4" /> Reset to saved template</button>
              <button className="btn-ghost" onClick={() => { setTemplate({ ...defaultSurveyEmailTemplate }); setMessage('Factory template loaded. Save it if you want it as the new default.') }}>Factory template</button>
            </div>
          </section>
        </div>

        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold">Draft preview</h3><span className={ready ? 'pill pill-ok' : 'pill pill-attn'}>{ready ? 'Ready' : 'Needs input'}</span></div>
          <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-xs">
            <span className="font-semibold text-gray-500">To</span><strong className="break-all">{template.to.trim() || '—'}</strong>
            <span className="font-semibold text-gray-500">BCC</span><strong>{bcc.length ? `${bcc.length} recipients` : '—'}</strong>
            <span className="font-semibold text-gray-500">Subject</span><strong>{template.subject.trim() || '—'}</strong>
          </div>
          <div className="mt-4 min-h-80 whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6">{resolvedBody}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => void copyEmail()}>Copy Email</button>
            <button className="btn-primary" onClick={() => { if (ensureReady()) downloadEml(template, bcc, resolvedBody) }}><Download className="h-4 w-4" /> Download Email (.eml)</button>
            <button className="btn-primary" onClick={openOutlook}><ExternalLink className="h-4 w-4" /> Open Outlook</button>
            <button className="btn-primary" onClick={openGmail}><ExternalLink className="h-4 w-4" /> Open Gmail</button>
          </div>
          {message && <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs font-semibold text-gray-700">{message}</div>}
          <p className="mt-4 text-xs leading-5 text-gray-500">Nothing is sent automatically. Ticket/user email data remains in the current browser session; only the survey template is saved locally when you choose “Save as default template”.</p>
        </section>
      </div>
    </div>
  )
}

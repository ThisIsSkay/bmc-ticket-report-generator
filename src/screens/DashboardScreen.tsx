import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Clipboard, Download, FileImage, Printer, RefreshCw, RotateCcw } from 'lucide-react'
import type { FeedbackValues, Filters, TeamMapping, Ticket, ValidationSummary } from '../types'
import { CATEGORIES, REPORT_STATUSES, TEAMS } from '../types'
import { aggregateTickets, filterTickets, outOfScopeByGroup, reportPendingDiagnostics } from '../lib/report'
import { copyReportToClipboard, printReport, saveReportAsJpeg, saveReportAsPng } from '../lib/export'
import { ReportCanvas } from '../components/ReportCanvas'
import { defaultFilters } from '../config/defaults'
import { localDateKey } from '../lib/clock'

export function DashboardScreen({
  tickets,
  filters,
  onFilters,
  feedback,
  onFeedback,
  fileName,
  teamMapping,
}: {
  tickets: Ticket[]
  filters: Filters
  onFilters: (filters: Filters) => void
  feedback: FeedbackValues
  onFeedback: (feedback: FeedbackValues) => void
  validation: ValidationSummary
  fileName: string
  teamMapping: TeamMapping
}) {
  const reportRef = useRef<HTMLDivElement | null>(null)
  const [generatedAt, setGeneratedAt] = useState(new Date())
  const [now, setNow] = useState(new Date())
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const reportDate = localDateKey(now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (filters.reportDate !== reportDate) onFilters({ ...filters, reportDate })
  }, [filters, onFilters, reportDate])

  const filtered = useMemo(() => filterTickets(tickets, filters, { protectResolvedOnReportDate: true }), [tickets, filters])
  const metrics = useMemo(() => aggregateTickets(filtered, reportDate), [filtered, reportDate])
  const outOfScope = useMemo(() => outOfScopeByGroup(filtered), [filtered])
  const pendingSplit = useMemo(() => reportPendingDiagnostics(filtered), [filtered])
  const pendingDiagnosticTotal = useMemo(() => pendingSplit.reduce((sum, row) => sum + row.total, 0), [pendingSplit])

  const run = async (name: string, fn: (node: HTMLElement) => Promise<void>) => {
    if (!reportRef.current) return
    setBusy(name); setMessage('')
    try { await fn(reportRef.current); setMessage(`${name} completed.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : `${name} failed.`) }
    finally { setBusy('') }
  }

  const resetFilters = () => onFilters({ ...defaultFilters, reportDate })

  return (
    <div className="dashboard-screen">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">Report Dashboard</h2>
          <p className="dashboard-caption">Fixed 1800×950 report canvas • exports at 2700×1425 for WhatsApp readability.</p>
        </div>
        <div className="dashboard-actions">
          <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void run('JPEG export', (node) => saveReportAsJpeg(node, reportDate))}><FileImage className="h-4 w-4" /> Save as JPEG</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('PNG export', (node) => saveReportAsPng(node, reportDate))}><Download className="h-4 w-4" /> Save as PNG</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('Clipboard copy', copyReportToClipboard)}><Clipboard className="h-4 w-4" /> Copy image</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('Print', printReport)}><Printer className="h-4 w-4" /> Print / PDF</button>
        </div>
      </div>

      <div className="dashboard-filter-bar">
        <div className="filter-control"><label className="label">Created from</label><input className="field" type="date" value={filters.startDate} onChange={(e) => onFilters({ ...filters, startDate: e.target.value })} /></div>
        <div className="filter-control"><label className="label">Created to</label><input className="field" type="date" value={filters.endDate} onChange={(e) => onFilters({ ...filters, endDate: e.target.value })} /></div>
        <div className="filter-control"><label className="label">Team</label><select className="field" value={filters.team} onChange={(e) => onFilters({ ...filters, team: e.target.value as Filters['team'] })}><option>All</option>{[...TEAMS, 'Review / Unassigned'].map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="filter-control"><label className="label">Status</label><select className="field" value={filters.status} onChange={(e) => onFilters({ ...filters, status: e.target.value as Filters['status'] })}><option>All</option>{REPORT_STATUSES.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="filter-control"><label className="label">Category</label><select className="field" value={filters.category} onChange={(e) => onFilters({ ...filters, category: e.target.value as Filters['category'] })}><option>All</option>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="filter-search"><label className="label">Search</label><input className="field" placeholder="Ticket ID, engineer, summary…" value={filters.search} onChange={(e) => onFilters({ ...filters, search: e.target.value })} /></div>
        <div className="filter-actions">
          <button className="btn-ghost" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Reset</button>
          <button className="btn-secondary" onClick={() => { const next = new Date(); setNow(next); setGeneratedAt(next) }}><RefreshCw className="h-4 w-4" /> Recalculate</button>
        </div>
        <div className="filter-note"><strong>Daily logic:</strong> New = Submit Date today • Closed = Resolved Date today (Cancelled excluded) • On/Offboarding = active onboarding/offboarding only • Pending = every other active/non-terminal ticket, including Assigned, Schedule, In Progress, Waiting User Reply and On Hold. Optional Created-from/to filters narrow the source population but never remove tickets resolved on the report date.</div>
      </div>

      <div className="preview-label-row">
        <div className="preview-label">Report preview</div>
        <div className="preview-rule" />
        <div className="feedback-controls">
          {TEAMS.map((team) => (
            <label className="feedback-control" key={team}>{team}<input type="number" value={feedback[team]} onChange={(e) => onFeedback({ ...feedback, [team]: Number(e.target.value) || 0 })} /></label>
          ))}
        </div>
      </div>

      {(busy || message) && <div className="dashboard-message">{busy ? `${busy}…` : message}</div>}

      <div className="report-frame">
        <div className="report-scroll">
          <ReportCanvas reportRef={reportRef} metrics={metrics} filters={{ ...filters, reportDate }} feedback={feedback} generatedAt={generatedAt} fileName={fileName} reportDate={reportDate} teamMapping={teamMapping} />
        </div>
      </div>

      <div className="diagnostic-grid">
        <details className="diagnostic-card">
          <summary className="diagnostic-summary"><ChevronDown className="diagnostic-chevron" size={16} strokeWidth={2.5} /><span>Pending breakdown</span><span className="tag tag-neutral">{pendingDiagnosticTotal.toLocaleString()} tickets</span></summary>
          <div className="diagnostic-body">
            <p className="diagnostic-copy">Splits exactly the tickets behind the report's Pending bars. This summary bucket includes every active/non-terminal ticket that is not Onboarding or Offboarding, including Assigned, Schedule, In Progress, Waiting User Reply and On Hold.</p>
            <table className="diagnostic-table">
              <thead><tr>{['Team', 'Total Pending', 'INC', 'SRV', 'Other'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {pendingSplit.map((row) => (
                  <tr key={row.team}><td className="font-semibold">{row.team}</td><td className="tabular-nums">{row.total}</td><td className="tabular-nums">{row.incident}</td><td className="tabular-nums">{row.serviceRequest}</td><td className="tabular-nums">{row.other}</td></tr>
                ))}
              </tbody>
            </table>
            {pendingSplit.some((row) => row.byGroup.length > 0) && (
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                {pendingSplit.filter((row) => row.byGroup.length > 0).map((row) => <div key={row.team}><strong>{row.team}</strong> by Assigned Group: {row.byGroup.map((g) => `${g.label} (${g.count})`).join(', ')}</div>)}
              </div>
            )}
          </div>
        </details>

        <details className="diagnostic-card">
          <summary className="diagnostic-summary"><ChevronDown className="diagnostic-chevron" size={16} strokeWidth={2.5} /><span>Out of scope by Assigned Group</span><span className="tag tag-neutral">{outOfScope.total.toLocaleString()} tickets</span></summary>
          <div className="diagnostic-body">
            <p className="diagnostic-copy">BMC is shared with teams outside this report. These tickets are excluded from EUC/System/Network metrics because their Assigned Engineer is not selected on the Engineer Selection screen.</p>
            {outOfScope.rows.length === 0 ? (
              <div className="text-sm font-semibold" style={{ color: 'var(--sage-700)' }}>Every imported ticket belongs to a selected engineer.</div>
            ) : (
              <div className="max-h-56 overflow-auto">
                <table className="diagnostic-table"><thead><tr><th>Assigned Group</th><th>Ticket count</th></tr></thead><tbody>{outOfScope.rows.map((row) => <tr key={row.label}><td>{row.label}</td><td className="tabular-nums">{row.count.toLocaleString()}</td></tr>)}</tbody></table>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

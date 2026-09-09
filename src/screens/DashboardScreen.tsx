import { useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, Download, FileImage, Printer, RefreshCw, RotateCcw } from 'lucide-react'
import type { FeedbackValues, Filters, TeamMapping, Ticket, ValidationSummary } from '../types'
import { CATEGORIES, REPORT_STATUSES, TEAMS } from '../types'
import { aggregateTickets, availableAssignees, filterTickets, outOfScopeByGroup, pendingDiagnostics } from '../lib/report'
import { copyReportToClipboard, printReport, saveReportAsJpeg, saveReportAsPng } from '../lib/export'
import { ReportCanvas } from '../components/ReportCanvas'
import { defaultFilters } from '../config/defaults'
import { formatLocalDate, formatLocalTime, localDateKey } from '../lib/clock'

export function DashboardScreen({
  tickets,
  filters,
  onFilters,
  feedback,
  onFeedback,
  validation,
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
  const assignees = useMemo(() => availableAssignees(tickets), [tickets])
  const outOfScope = useMemo(() => outOfScopeByGroup(filtered), [filtered])
  const pendingSplit = useMemo(() => pendingDiagnostics(filtered), [filtered])

  const run = async (name: string, fn: (node: HTMLElement) => Promise<void>) => {
    if (!reportRef.current) return
    setBusy(name); setMessage('')
    try { await fn(reportRef.current); setMessage(`${name} completed.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : `${name} failed.`) }
    finally { setBusy('') }
  }

  const warningCount = validation.duplicateTicketIds.length + validation.blankAssigneeCount + validation.invalidDateCount + validation.unknownStatusCount + validation.unknownCategoryCount + validation.unclassifiedAssignees.length + validation.unknownPrefixes.length

  const resetFilters = () => onFilters({ ...defaultFilters, reportDate })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Report Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">The report follows the supplied Excel screenshot at a fixed 1800×950 canvas and exports at 2700×1425 for WhatsApp readability.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void run('JPEG export', (node) => saveReportAsJpeg(node, reportDate))}><FileImage className="h-4 w-4" /> Save Report as JPEG</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('PNG export', (node) => saveReportAsPng(node, reportDate))}><Download className="h-4 w-4" /> Save as PNG</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('Clipboard copy', copyReportToClipboard)}><Clipboard className="h-4 w-4" /> Copy Image</button>
          <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void run('Print', printReport)}><Printer className="h-4 w-4" /> Print / PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        <div className="rounded-lg border border-gray-900 bg-gray-950 p-4 text-white shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Internal report clock</div>
          <div className="mt-2 text-xl font-bold">{formatLocalDate(now)}</div>
          <div className="mt-1 font-mono text-lg tabular-nums text-gray-200">{formatLocalTime(now)}</div>
          <div className="mt-2 text-xs leading-5 text-gray-400">The device clock automatically determines the daily report date. It rolls over without requiring a new upload.</div>
        </div>

        <div className="panel p-4">
          <div className="grid grid-cols-7 gap-3">
            <div><label className="label">Created from</label><input className="field" type="date" value={filters.startDate} onChange={(e) => onFilters({ ...filters, startDate: e.target.value })} /></div>
            <div><label className="label">Created to</label><input className="field" type="date" value={filters.endDate} onChange={(e) => onFilters({ ...filters, endDate: e.target.value })} /></div>
            <div><label className="label">Team</label><select className="field" value={filters.team} onChange={(e) => onFilters({ ...filters, team: e.target.value as Filters['team'] })}><option>All</option>{[...TEAMS, 'Review / Unassigned'].map((v) => <option key={v}>{v}</option>)}</select></div>
            <div><label className="label">Status</label><select className="field" value={filters.status} onChange={(e) => onFilters({ ...filters, status: e.target.value as Filters['status'] })}><option>All</option>{REPORT_STATUSES.map((v) => <option key={v}>{v}</option>)}</select></div>
            <div><label className="label">Category</label><select className="field" value={filters.category} onChange={(e) => onFilters({ ...filters, category: e.target.value as Filters['category'] })}><option>All</option>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></div>
            <div><label className="label">Engineer</label><select className="field" value={filters.assignee} onChange={(e) => onFilters({ ...filters, assignee: e.target.value })}><option value="">All selected engineers</option>{assignees.map((v) => <option key={v}>{v}</option>)}</select></div>
            <div><label className="label">Search</label><input className="field" placeholder="ID, summary…" value={filters.search} onChange={(e) => onFilters({ ...filters, search: e.target.value })} /></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-xs leading-5 text-gray-500">
              <strong>Daily logic:</strong> New = Submit Date today • Closed = Resolved Date today (Cancelled excluded) • On/Offboarding/Schedule = outstanding non-terminal work • Pending = remaining pending/on-hold backlog. Optional Created-from/to filters narrow the source population but never remove tickets resolved on the report date.
            </div>
            <div className="flex shrink-0 gap-2"><button className="btn-secondary py-1.5" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Reset filters</button><button className="btn-secondary py-1.5" onClick={() => { const next = new Date(); setNow(next); setGeneratedAt(next) }}><RefreshCw className="h-4 w-4" /> Recalculate</button></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className={`rounded-md border p-3 text-sm ${warningCount ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800'}`}>
          {warningCount ? (
            <>
              {`Validation: ${validation.duplicateTicketIds.length} duplicate ID(s), ${validation.blankAssigneeCount} blank engineer row(s), ${validation.invalidDateCount} invalid-date row(s), ${validation.unknownStatusCount} unknown status row(s), ${validation.unknownCategoryCount} uncategorized service request(s), ${validation.unclassifiedAssignees.length} engineer value(s) outside the three selected teams.`}
              {validation.unknownPrefixes.length > 0 && (
                <div className="mt-1 font-semibold">
                  Unrecognized Ticket ID prefix(es), counted as Other rather than guessed: {validation.unknownPrefixes.map((p) => `${p.label} (${p.count.toLocaleString()})`).join(', ')}.
                </div>
              )}
            </>
          ) : 'Validation checks passed for the current import.'}
        </div>
        <div className="panel flex items-center gap-2 px-3 py-2 text-sm">
          <span className="font-bold">Feedback:</span>{TEAMS.map((team) => <label className="flex items-center gap-1" key={team}>{team}<input className="w-16 rounded border px-2 py-1" type="number" value={feedback[team]} onChange={(e) => onFeedback({ ...feedback, [team]: Number(e.target.value) || 0 })} /></label>)}
        </div>
      </div>

      {(busy || message) && <div className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">{busy ? `${busy}…` : message}</div>}

      <div className="grid grid-cols-2 gap-4">
        <details className="panel p-4" open>
          <summary className="cursor-pointer font-bold">Pending breakdown (diagnostic — not exported)</summary>
          <p className="mt-1 text-xs text-gray-500">
            Splits exactly the tickets behind the chart's Pending bars. The chart counts every pending/on-hold ticket outside the On/Off-Boarding and Schedule bucket, while each team summary's Pending line counts incidents only — so INC here should reconcile with the summary.
          </p>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead><tr className="bg-gray-100 text-left">{['Team', 'Total Pending', 'INC', 'SRV', 'Other'].map((h) => <th key={h} className="border px-3 py-1.5">{h}</th>)}</tr></thead>
            <tbody>
              {pendingSplit.map((row) => (
                <tr key={row.team}>
                  <td className="border px-3 py-1.5 font-semibold">{row.team}</td>
                  <td className="border px-3 py-1.5 tabular-nums">{row.total}</td>
                  <td className="border px-3 py-1.5 tabular-nums">{row.incident}</td>
                  <td className="border px-3 py-1.5 tabular-nums">{row.serviceRequest}</td>
                  <td className="border px-3 py-1.5 tabular-nums">{row.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pendingSplit.some((row) => row.byGroup.length > 0) && (
            <div className="mt-3 space-y-1 text-xs text-gray-600">
              {pendingSplit.filter((row) => row.byGroup.length > 0).map((row) => (
                <div key={row.team}><strong>{row.team}</strong> by Assigned Group: {row.byGroup.map((g) => `${g.label} (${g.count})`).join(', ')}</div>
              ))}
            </div>
          )}
        </details>

        <details className="panel p-4" open>
          <summary className="cursor-pointer font-bold">Out of Scope / Unassigned by Assigned Group (diagnostic — not exported)</summary>
          <p className="mt-1 text-xs text-gray-500">
            BMC is shared with teams outside this report. These {outOfScope.total.toLocaleString()} ticket(s) are excluded from all EUC/System/Network metrics because their Assigned Engineer is not selected on the Engineer Selection screen. No group name is hard-coded — select an engineer to bring their tickets into scope.
          </p>
          {outOfScope.rows.length === 0 ? (
            <div className="mt-3 text-sm text-green-700">Every imported ticket belongs to a selected engineer.</div>
          ) : (
            <div className="mt-3 max-h-56 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-gray-100"><tr className="text-left"><th className="border px-3 py-1.5">Assigned Group</th><th className="border px-3 py-1.5">Ticket count</th></tr></thead>
                <tbody>{outOfScope.rows.map((row) => <tr key={row.label}><td className="border px-3 py-1.5">{row.label}</td><td className="border px-3 py-1.5 tabular-nums">{row.count.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </details>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-300 bg-gray-200 p-4 shadow-inner">
        <ReportCanvas reportRef={reportRef} metrics={metrics} filters={{ ...filters, reportDate }} feedback={feedback} generatedAt={generatedAt} fileName={fileName} reportDate={reportDate} teamMapping={teamMapping} />
      </div>
    </div>
  )
}

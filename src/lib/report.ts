import { CATEGORIES, REPORT_STATUSES, TEAMS } from '../types'
import type {
  CountByLabel,
  Filters,
  PendingDiagnosticRow,
  ReportMetrics,
  Team,
  TeamSummary,
  Ticket,
  ValidationSummary,
} from '../types'
import { dateMatchesLocalKey, localDateKey } from './clock'

// Deterministic duplicate resolution: when the export repeats a Ticket ID, keep
// the row that carries the most recent lifecycle information (latest Resolved
// Date, then latest Submit Date, then the later export row). BMC exports place
// the freshest snapshot of a re-exported ticket later in the file, so this
// prefers the ticket's latest known state instead of the arbitrary first row.
const dedupeRank = (t: Ticket): [number, number, number] => [
  t.closedDate?.getTime() ?? -1,
  t.createdDate?.getTime() ?? -1,
  t.sourceIndex,
]

export function uniqueForReporting(tickets: Ticket[]): Ticket[] {
  const chosen = new Map<string, Ticket>()
  const order: string[] = []
  for (const ticket of tickets) {
    const key = ticket.id || `__row_${ticket.sourceIndex}`
    const existing = chosen.get(key)
    if (!existing) {
      chosen.set(key, ticket)
      order.push(key)
      continue
    }
    const a = dedupeRank(ticket)
    const b = dedupeRank(existing)
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) {
      chosen.set(key, ticket)
    }
  }
  return order.map((key) => chosen.get(key)!)
}

export interface FilterOptions {
  // Keep tickets resolved on the report date even when the optional Created
  // from/to range would exclude them. "Closed = Resolved Date today" must not
  // lose tickets merely because they were submitted before the range.
  protectResolvedOnReportDate?: boolean
}

export function filterTickets(tickets: Ticket[], filters: Filters, options?: FilterOptions): Ticket[] {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null
  const query = filters.search.trim().toLowerCase()
  const protect = Boolean(options?.protectResolvedOnReportDate && filters.reportDate)

  return tickets.filter((ticket) => {
    const resolvedOnReportDate = protect && dateMatchesLocalKey(ticket.closedDate, filters.reportDate)
    if (!resolvedOnReportDate) {
      if (start && (!ticket.createdDate || ticket.createdDate < start)) return false
      if (end && (!ticket.createdDate || ticket.createdDate > end)) return false
    }
    if (filters.team !== 'All' && ticket.team !== filters.team) return false
    if (filters.status !== 'All' && ticket.reportStatus !== filters.status) return false
    if (filters.category !== 'All' && ticket.category !== filters.category) return false
    if (filters.assignee && ticket.assignedTo !== filters.assignee) return false
    if (query) {
      const text = `${ticket.id} ${ticket.assignedTo} ${ticket.summary} ${ticket.rawStatus} ${ticket.supportGroup} ${ticket.contract}`.toLowerCase()
      if (!text.includes(query)) return false
    }
    return true
  })
}

const blankSummary = (): TeamSummary => ({
  totalTickets: 0,
  scheduleRequests: 0,
  onboarding: 0,
  offboarding: 0,
  incidentTotal: 0,
  pendingIncidents: 0,
  workInProgressIncidents: 0,
  waitingUserReplyIncidents: 0,
})

const isSpecialBacklog = (ticket: Ticket): boolean =>
  ticket.category === 'Schedule' || ticket.category === 'Onboarding' || ticket.category === 'Offboarding'

// Outstanding workload = anything not in a terminal state. New/Assigned
// onboarding or schedule work is still outstanding even before an engineer
// starts it; Closed and Cancelled are terminal.
const isOutstanding = (ticket: Ticket): boolean =>
  ticket.reportStatus !== 'Closed' && ticket.reportStatus !== 'Cancelled'

const isBacklogStatus = (ticket: Ticket): boolean =>
  ticket.reportStatus === 'Pending' ||
  ticket.reportStatus === 'Work in Progress' ||
  ticket.reportStatus === 'Waiting User Reply' ||
  ticket.reportStatus === 'On Hold'

const isPendingBucket = (ticket: Ticket): boolean =>
  ticket.reportStatus === 'Pending' || ticket.reportStatus === 'On Hold'

// Closed on the daily report is a fixed BMC throughput rule, not a configurable
// status-normalization rule: the source Status must literally be Closed or
// Resolved and the Resolved Date must fall on the report date. This keeps daily
// completion counts correct even if an older/local rules config omitted the
// "resolved" alias. Cancelled/canceled tickets are deliberately excluded.
const isClosedOnReportDate = (ticket: Ticket, reportDate: string): boolean => {
  const sourceStatus = ticket.rawStatus.trim().toLowerCase()
  const completed = sourceStatus === 'closed' || sourceStatus === 'resolved'
  return completed && dateMatchesLocalKey(ticket.closedDate, reportDate)
}

export function aggregateTickets(input: Ticket[], reportDate = localDateKey()): ReportMetrics {
  const tickets = uniqueForReporting(input).filter((ticket) => TEAMS.includes(ticket.team as Team))
  const metrics: ReportMetrics = {
    newTickets: { EUC: 0, System: 0, Network: 0 },
    pendingClosed: {
      EUC: { scheduledOnOffBoarding: 0, pending: 0, closed: 0 },
      System: { scheduledOnOffBoarding: 0, pending: 0, closed: 0 },
      Network: { scheduledOnOffBoarding: 0, pending: 0, closed: 0 },
    },
    summaries: { EUC: blankSummary(), System: blankSummary(), Network: blankSummary() },
    totalUniqueTickets: tickets.length,
  }

  for (const ticket of tickets) {
    const team = ticket.team as Team
    const backlog = isBacklogStatus(ticket)
    const special = isSpecialBacklog(ticket)
    const outstandingSpecial = isOutstanding(ticket) && special

    // "New Tickets" in the daily Excel report means submitted on the report day,
    // regardless of the ticket's current BMC status.
    if (dateMatchesLocalKey(ticket.createdDate, reportDate)) metrics.newTickets[team] += 1

    // First backlog bucket mirrors the Excel block labelled On/Off-Boarding and
    // includes Schedule requests as shown in the team summary table. It counts
    // every non-terminal status, including New/Assigned work not yet started.
    if (outstandingSpecial) metrics.pendingClosed[team].scheduledOnOffBoarding += 1

    // Pending is the remaining pending/on-hold backlog after Schedule/Onboarding/
    // Offboarding has been separated into the first bucket.
    if (isPendingBucket(ticket) && !special) metrics.pendingClosed[team].pending += 1

    // Closed is daily throughput and is intentionally independent from the
    // outstanding Pending calculation and from editable status aliases.
    if (isClosedOnReportDate(ticket, reportDate)) metrics.pendingClosed[team].closed += 1

    const summary = metrics.summaries[team]
    if (outstandingSpecial) {
      summary.totalTickets += 1
      if (ticket.category === 'Schedule') summary.scheduleRequests += 1
      if (ticket.category === 'Onboarding') summary.onboarding += 1
      if (ticket.category === 'Offboarding') summary.offboarding += 1
    }

    if (backlog && ticket.category === 'Incident') {
      summary.incidentTotal += 1
      if (ticket.reportStatus === 'Pending' || ticket.reportStatus === 'On Hold') summary.pendingIncidents += 1
      if (ticket.reportStatus === 'Work in Progress') summary.workInProgressIncidents += 1
      if (ticket.reportStatus === 'Waiting User Reply') summary.waitingUserReplyIncidents += 1
    }
  }
  return metrics
}

const countByLabel = (tickets: Ticket[], label: (ticket: Ticket) => string): CountByLabel[] => {
  const counts = new Map<string, number>()
  for (const ticket of tickets) {
    const key = label(ticket)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function buildValidation(tickets: Ticket[], missingRequiredColumns: string[] = []): ValidationSummary {
  const duplicateTicketIds = [...new Set(tickets.filter((t) => t.duplicateId).map((t) => t.id).filter(Boolean))]
  return {
    missingRequiredColumns,
    duplicateTicketIds,
    blankAssigneeCount: tickets.filter((t) => !t.assignedTo).length,
    invalidDateCount: tickets.filter((t) => t.dateInvalid).length,
    unknownStatusCount: tickets.filter((t) => t.reportStatus === 'Other').length,
    // Only service requests can be genuinely uncategorized: Event and unknown
    // prefixes are Other by design and are reported separately.
    unknownCategoryCount: tickets.filter((t) => t.kind === 'Service Request' && t.category === 'Other').length,
    unclassifiedAssignees: [...new Set(tickets.filter((t) => t.team === 'Review / Unassigned').map((t) => t.assignedTo || '(blank)'))].sort(),
    unknownPrefixes: countByLabel(tickets.filter((t) => t.kind === 'Unknown'), (t) => t.idPrefix || '(blank)'),
  }
}

// Diagnostics only — these never appear in the exported report image.

// Tickets whose Assigned Engineer is not mapped to a report team, grouped by
// their BMC Assigned Group. BMC is shared with teams that AsiaPac does not
// manage, and this shows exactly what the engineer selection excluded without
// hard-coding any group name.
export function outOfScopeByGroup(input: Ticket[]): { rows: CountByLabel[]; total: number } {
  const outOfScope = uniqueForReporting(input).filter((ticket) => !TEAMS.includes(ticket.team as Team))
  return { rows: countByLabel(outOfScope, (t) => t.supportGroup || '(blank)'), total: outOfScope.length }
}

// Splits exactly the population behind the chart's Pending bars by ticket kind,
// so the chart Pending total can be reconciled against the Incident-only
// Pending line in the team summary.
export function pendingDiagnostics(input: Ticket[]): PendingDiagnosticRow[] {
  const tickets = uniqueForReporting(input).filter(
    (ticket) => TEAMS.includes(ticket.team as Team) && isPendingBucket(ticket) && !isSpecialBacklog(ticket),
  )
  return TEAMS.map((team) => {
    const forTeam = tickets.filter((ticket) => ticket.team === team)
    return {
      team,
      total: forTeam.length,
      incident: forTeam.filter((t) => t.kind === 'Incident').length,
      serviceRequest: forTeam.filter((t) => t.kind === 'Service Request').length,
      other: forTeam.filter((t) => t.kind !== 'Incident' && t.kind !== 'Service Request').length,
      byGroup: countByLabel(forTeam, (t) => t.supportGroup || '(blank)'),
    }
  })
}

export function availableAssignees(tickets: Ticket[]): string[] {
  return [...new Set(tickets.map((t) => t.assignedTo).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function filterDescription(filters: Filters): string {
  const parts: string[] = []
  if (filters.reportDate) parts.push(`Report date: ${filters.reportDate}`)
  if (filters.startDate || filters.endDate) parts.push(`Created: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}`)
  if (filters.team !== 'All') parts.push(`Team: ${filters.team}`)
  if (filters.status !== 'All') parts.push(`Status: ${filters.status}`)
  if (filters.category !== 'All') parts.push(`Category: ${filters.category}`)
  if (filters.assignee) parts.push(`Assignee: ${filters.assignee}`)
  if (filters.search) parts.push(`Search: “${filters.search}”`)
  return parts.length ? parts.join(' • ') : 'Daily report'
}

export { CATEGORIES, REPORT_STATUSES, TEAMS }

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

// Deterministic duplicate resolution: BMC exports place the freshest snapshot
// of a repeated Ticket ID later in the file, so source row order must be the
// primary lifecycle signal. This is important for reopened tickets: a newer
// active snapshot can legitimately have no Resolved Date and must replace an
// older Resolved/Closed snapshot instead of being discarded as "less complete".
// Date fields remain deterministic tie-breakers for callers that provide equal
// source indexes.
const dedupeRank = (t: Ticket): [number, number, number] => [
  t.sourceIndex,
  t.closedDate?.getTime() ?? -1,
  t.createdDate?.getTime() ?? -1,
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

const isOnOffBoarding = (ticket: Ticket): boolean =>
  ticket.category === 'Onboarding' || ticket.category === 'Offboarding'

const isOutstanding = (ticket: Ticket): boolean =>
  ticket.reportStatus !== 'Closed' && ticket.reportStatus !== 'Cancelled'

const isBacklogStatus = (ticket: Ticket): boolean =>
  ticket.reportStatus === 'Pending' ||
  ticket.reportStatus === 'Work in Progress' ||
  ticket.reportStatus === 'Waiting User Reply' ||
  ticket.reportStatus === 'On Hold'

const isPendingBucket = (ticket: Ticket): boolean =>
  ticket.reportStatus === 'Pending' || ticket.reportStatus === 'On Hold'

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
    summaryBuckets: {
      EUC: { onOffBoarding: 0, pending: 0 },
      System: { onOffBoarding: 0, pending: 0 },
      Network: { onOffBoarding: 0, pending: 0 },
    },
    pendingBreakdown: {
      EUC: { pending: 0, workInProgress: 0, waitingUserReply: 0, onHold: 0 },
      System: { pending: 0, workInProgress: 0, waitingUserReply: 0, onHold: 0 },
      Network: { pending: 0, workInProgress: 0, waitingUserReply: 0, onHold: 0 },
    },
    summaries: { EUC: blankSummary(), System: blankSummary(), Network: blankSummary() },
    totalUniqueTickets: tickets.length,
  }

  for (const ticket of tickets) {
    const team = ticket.team as Team
    const backlog = isBacklogStatus(ticket)
    const special = isSpecialBacklog(ticket)
    const outstandingSpecial = isOutstanding(ticket) && special
    const outstandingOnOff = isOutstanding(ticket) && isOnOffBoarding(ticket)
    const reportPending = isOutstanding(ticket) && !isOnOffBoarding(ticket)

    if (dateMatchesLocalKey(ticket.createdDate, reportDate)) metrics.newTickets[team] += 1

    if (outstandingSpecial) metrics.pendingClosed[team].scheduledOnOffBoarding += 1
    if (isPendingBucket(ticket) && !special) metrics.pendingClosed[team].pending += 1

    if (outstandingOnOff) metrics.summaryBuckets[team].onOffBoarding += 1

    if (reportPending) {
      metrics.summaryBuckets[team].pending += 1
      const breakdown = metrics.pendingBreakdown[team]
      if (ticket.reportStatus === 'Work in Progress') breakdown.workInProgress += 1
      else if (ticket.reportStatus === 'Waiting User Reply') breakdown.waitingUserReply += 1
      else if (ticket.reportStatus === 'On Hold') breakdown.onHold += 1
      else breakdown.pending += 1
    }

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
    unknownCategoryCount: tickets.filter((t) => t.kind === 'Service Request' && t.category === 'Other').length,
    unclassifiedAssignees: [...new Set(tickets.filter((t) => t.team === 'Review / Unassigned').map((t) => t.assignedTo || '(blank)'))].sort(),
    unknownPrefixes: countByLabel(tickets.filter((t) => t.kind === 'Unknown'), (t) => t.idPrefix || '(blank)'),
  }
}

export function outOfScopeByGroup(input: Ticket[]): { rows: CountByLabel[]; total: number } {
  const outOfScope = uniqueForReporting(input).filter((ticket) => !TEAMS.includes(ticket.team as Team))
  return { rows: countByLabel(outOfScope, (t) => t.supportGroup || '(blank)'), total: outOfScope.length }
}

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

export function reportPendingDiagnostics(input: Ticket[]): PendingDiagnosticRow[] {
  const tickets = uniqueForReporting(input).filter(
    (ticket) => TEAMS.includes(ticket.team as Team) && isOutstanding(ticket) && !isOnOffBoarding(ticket),
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

export function reportPendingTickets(input: Ticket[]): Ticket[] {
  return uniqueForReporting(input).filter(
    (ticket) => TEAMS.includes(ticket.team as Team) && isOutstanding(ticket) && !isOnOffBoarding(ticket),
  )
}

export function closedOnReportDateTickets(input: Ticket[], reportDate: string): Ticket[] {
  return uniqueForReporting(input).filter(
    (ticket) => TEAMS.includes(ticket.team as Team) && isClosedOnReportDate(ticket, reportDate),
  )
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

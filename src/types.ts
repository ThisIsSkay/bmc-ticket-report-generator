import type * as XLSX from 'xlsx'

export const TEAMS = ['EUC', 'System', 'Network'] as const
export type Team = (typeof TEAMS)[number]
export type ClassifiedTeam = Team | 'Review / Unassigned'

export const REPORT_STATUSES = [
  'New',
  'Pending',
  'Closed',
  'Work in Progress',
  'Waiting User Reply',
  'On Hold',
  'Cancelled',
  'Other',
] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const CATEGORIES = ['Onboarding', 'Offboarding', 'Schedule', 'Incident', 'Other'] as const
export type TicketCategory = (typeof CATEGORIES)[number]

// Derived from the Ticket ID prefix, which BMC assigns reliably: INC tickets
// are incidents, SRV tickets are service requests and FSC tickets are forward
// schedule / preventive maintenance work, whatever the free-text description
// says. EVT is monitoring noise. Any other prefix is Unknown and is surfaced in
// validation rather than guessed at.
export const TICKET_KINDS = ['Incident', 'Service Request', 'Forward Schedule', 'Event', 'Unknown'] as const
export type TicketKind = (typeof TICKET_KINDS)[number]

export type ColumnKey =
  | 'ticketId'
  | 'assignedTo'
  | 'status'
  | 'ticketType'
  | 'summary'
  | 'createdDate'
  | 'closedDate'
  | 'supportGroup'
  | 'contract'

export type ColumnMapping = Record<ColumnKey, string>
export type RawRow = Record<string, unknown>

export interface TeamMapping {
  EUC: string[]
  System: string[]
  Network: string[]
}

export type StatusMapping = Record<ReportStatus, string[]>
export type CategoryRules = Record<Exclude<TicketCategory, 'Other'>, string[]>

export interface AppConfig {
  teams: TeamMapping
  statuses: StatusMapping
  categories: CategoryRules
}

export interface ParsedWorkbook {
  fileName: string
  workbook: XLSX.WorkBook
  sheetNames: string[]
}

export interface Ticket {
  sourceIndex: number
  raw: RawRow
  id: string
  assignedTo: string
  rawStatus: string
  rawCategory: string
  summary: string
  createdDate: Date | null
  closedDate: Date | null
  supportGroup: string
  contract: string
  team: ClassifiedTeam
  kind: TicketKind
  idPrefix: string
  category: TicketCategory
  reportStatus: ReportStatus
  duplicateId: boolean
  dateInvalid: boolean
}

export interface Filters {
  reportDate: string
  startDate: string
  endDate: string
  team: 'All' | ClassifiedTeam
  status: 'All' | ReportStatus
  category: 'All' | TicketCategory
  assignee: string
  search: string
}

export interface ValidationSummary {
  missingRequiredColumns: string[]
  duplicateTicketIds: string[]
  blankAssigneeCount: number
  invalidDateCount: number
  unknownStatusCount: number
  unknownCategoryCount: number
  unclassifiedAssignees: string[]
  unknownPrefixes: CountByLabel[]
}

export interface CountByLabel {
  label: string
  count: number
}

export interface PendingDiagnosticRow {
  team: Team
  total: number
  incident: number
  serviceRequest: number
  other: number
  byGroup: CountByLabel[]
}

export interface TeamSummary {
  totalTickets: number
  scheduleRequests: number
  onboarding: number
  offboarding: number
  incidentTotal: number
  pendingIncidents: number
  workInProgressIncidents: number
  waitingUserReplyIncidents: number
}

export interface ReportMetrics {
  newTickets: Record<Team, number>
  pendingClosed: Record<Team, { scheduledOnOffBoarding: number; pending: number; closed: number }>
  // User-facing report buckets. On/Offboarding contains only those two request
  // categories. Pending absorbs every other active/non-terminal ticket,
  // including Schedule, In Progress, Waiting User Reply and On Hold.
  summaryBuckets: Record<Team, { onOffBoarding: number; pending: number }>
  summaries: Record<Team, TeamSummary>
  totalUniqueTickets: number
}

export interface FeedbackValues {
  EUC: number
  System: number
  Network: number
}

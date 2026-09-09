import type { AppConfig, ColumnMapping, FeedbackValues, Filters } from '../types'

export const defaultColumnMapping: ColumnMapping = {
  ticketId: '',
  assignedTo: '',
  status: '',
  ticketType: '',
  summary: '',
  createdDate: '',
  closedDate: '',
  supportGroup: '',
  contract: '',
}

export const defaultConfig: AppConfig = {
  teams: {
    EUC: [],
    System: [],
    Network: [],
  },
  statuses: {
    New: ['new', 'assigned', 'created'],
    Pending: ['pending'],
    Closed: ['closed', 'resolved', 'cancelled', 'canceled'],
    'Work in Progress': ['work in progress', 'in progress', 'wip'],
    'Waiting User Reply': ['waiting user reply', 'awaiting user', 'pending user', 'waiting for user'],
    'On Hold': ['on hold', 'hold'],
    Other: [],
  },
  categories: {
    Onboarding: ['onboarding', 'onboard ', 'new joiner', 'joiner'],
    Offboarding: ['offboarding', 'terminate access', 'leaver', 'termination', 'resignation'],
    Schedule: ['forward schedule', 'preventive maintenance', 'schedule', 'scheduling', 'planned work'],
    Incident: ['incident', 'outage', 'unavailable', 'error', 'failure'],
  },
}

export const defaultFilters: Filters = {
  reportDate: '',
  startDate: '',
  endDate: '',
  team: 'All',
  status: 'All',
  category: 'All',
  assignee: '',
  search: '',
}

export const defaultFeedback: FeedbackValues = { EUC: 0, System: 0, Network: 0 }

export const requiredColumnKeys = ['ticketId', 'assignedTo', 'status', 'summary', 'createdDate'] as const

export const columnLabels: Record<keyof ColumnMapping, string> = {
  ticketId: 'Ticket ID',
  assignedTo: 'Assigned Engineer',
  status: 'Status',
  ticketType: 'Ticket type/category',
  summary: 'Summary/description',
  createdDate: 'Created / Submit date',
  closedDate: 'Closed / Resolved date',
  supportGroup: 'Support / Assigned group',
  contract: 'Contract',
}

export const columnSynonyms: Record<keyof ColumnMapping, string[]> = {
  ticketId: ['display id', 'ticket id', 'incident id', 'request id', 'id'],
  assignedTo: ['assigned engineer', 'assigned to', 'assignee', 'assignedto', 'engineer'],
  status: ['status', 'status value', 'ticket status'],
  ticketType: ['incident type', 'ticket type', 'type', 'category', 'request type'],
  summary: ['summary', 'description', 'detailed description', 'title'],
  createdDate: ['submit date', 'submitted date', 'created date', 'create date', 'created'],
  closedDate: ['resolved date', 'closed date', 'close date', 'closure date'],
  supportGroup: ['assigned group', 'support group', 'assignment group'],
  contract: ['contract number', 'contract id+', 'contract id', 'contract', 'contract description', 'contract name'],
}

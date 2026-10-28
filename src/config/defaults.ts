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
  requesterEmail: '',
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
    Closed: ['closed', 'resolved'],
    'Work in Progress': ['work in progress', 'in progress', 'wip'],
    'Waiting User Reply': ['waiting user reply', 'awaiting user', 'pending user', 'waiting for user'],
    'On Hold': ['on hold', 'hold'],
    // Cancelled work is not successful Closed throughput: BMC stamps a
    // Resolved Date on cancellations too, so it needs its own bucket.
    Cancelled: ['cancelled', 'canceled'],
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

export const defaultSurveyEmailTemplate = {
  to: '',
  subject: 'IT Service Satisfaction Survey',
  surveyLink: '',
  body: `Hi,

Thank you for engaging our IT support team.

We would appreciate it if you could take a moment to complete our satisfaction survey:

{{SURVEY_LINK}}

Your feedback helps us improve our service.

Thank you.

Regards,
IT Support Team`,
}

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
  requesterEmail: 'User / Requester Email',
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
  requesterEmail: ['requester email', 'requestor email', 'customer email', 'user email', 'requested for email', 'submitter email', 'requester email address', 'customer email address'],
}

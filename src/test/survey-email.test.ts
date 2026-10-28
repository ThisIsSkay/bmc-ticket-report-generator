import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig } from '../config/defaults'
import { normalizeRows } from '../lib/normalize'
import { closedOnReportDateTickets } from '../lib/report'
import { buildSurveyRecipients, dedupeSurveyRecipients, resolveSurveyBody, surveySourceStats } from '../lib/surveyEmail'
import type { AppConfig, ColumnMapping, RawRow } from '../types'

const mapping: ColumnMapping = {
  ...defaultColumnMapping,
  ticketId: 'ID',
  assignedTo: 'Engineer',
  status: 'Status',
  ticketType: 'Type',
  summary: 'Summary',
  createdDate: 'Submit',
  closedDate: 'Resolved',
  supportGroup: 'Group',
  requesterEmail: 'User Email',
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] },
}

describe('survey email workflow', () => {
  it('uses the exact in-scope Closed-on-report-date population and keeps requester email', () => {
    const rows: RawRow[] = [
      { ID: 'INC000100', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Closed today', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'user1@example.com' },
      { ID: 'SRV000101', Engineer: 'Alex Example', Status: 'Closed', Type: 'Service Request', Summary: 'Closed today too', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'user2@example.com' },
      { ID: 'INC000102', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Incident', Summary: 'Cancelled', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'cancelled@example.com' },
      { ID: 'INC000103', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Closed yesterday', Submit: '2026-10-26', Resolved: '2026-10-27', Group: 'NCC_EUC', 'User Email': 'old@example.com' },
      { ID: 'INC000104', Engineer: 'Outside Engineer', Status: 'Resolved', Type: 'Incident', Summary: 'Out of scope', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'OTHER', 'User Email': 'outside@example.com' },
    ]

    const tickets = normalizeRows(rows, mapping, config)
    expect(tickets[0].requesterEmail).toBe('user1@example.com')

    const closed = closedOnReportDateTickets(tickets, '2026-10-28')
    expect(closed.map((ticket) => ticket.id)).toEqual(['INC000100', 'SRV000101'])
  })

  it('deduplicates valid recipient emails case-insensitively and reports missing/invalid source emails', () => {
    const rows: RawRow[] = [
      { ID: 'INC000110', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'One', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'same@example.com' },
      { ID: 'INC000111', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Two', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'SAME@example.com' },
      { ID: 'INC000112', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Missing', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': '' },
      { ID: 'INC000113', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Invalid', Submit: '2026-10-27', Resolved: '2026-10-28', Group: 'NCC_EUC', 'User Email': 'not-an-email' },
    ]

    const closed = closedOnReportDateTickets(normalizeRows(rows, mapping, config), '2026-10-28')
    const recipients = buildSurveyRecipients(closed)
    const stats = surveySourceStats(closed)

    expect(recipients).toHaveLength(1)
    expect(recipients[0].ticketIds).toEqual(['INC000110', 'INC000111'])
    expect(stats).toEqual({ validEmailTickets: 2, needsReview: 2 })
  })

  it('deduplicates manual edits and resolves the survey-link placeholder', () => {
    const recipients = dedupeSurveyRecipients([
      { email: 'one@example.com', ticketIds: ['INC1'] },
      { email: 'ONE@example.com', ticketIds: ['INC2'] },
      { email: 'bad-email', ticketIds: [] },
      { email: 'two@example.com', ticketIds: [] },
    ])

    expect(recipients.map((recipient) => recipient.email)).toEqual(['one@example.com', 'two@example.com'])
    expect(recipients[0].ticketIds).toEqual(['INC1', 'INC2'])
    expect(resolveSurveyBody('Please visit {{SURVEY_LINK}}. Thanks.', 'https://survey.example')).toBe('Please visit https://survey.example. Thanks.')
  })
})

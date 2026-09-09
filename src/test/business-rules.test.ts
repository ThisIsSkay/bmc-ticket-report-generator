import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig } from '../config/defaults'
import { categorizeTicket, normalizeRows, normalizeStatus } from '../lib/normalize'
import { aggregateTickets } from '../lib/report'
import type { AppConfig, ColumnMapping, RawRow } from '../types'

const mapping: ColumnMapping = {
  ...defaultColumnMapping,
  ticketId: 'ID', assignedTo: 'Engineer', status: 'Status', ticketType: 'Type', summary: 'Summary', createdDate: 'Submit', closedDate: 'Resolved',
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] },
}

describe('structured Incident Type precedence', () => {
  const rules = defaultConfig.categories

  it('keeps Incidents as Incident even when the description mentions category keywords', () => {
    expect(categorizeTicket('Incident', 'Cannot access onboarding portal', rules)).toBe('Incident')
    expect(categorizeTicket('Incident', 'Scheduled task error on server', rules)).toBe('Incident')
  })

  it('maps Forward Schedule / Preventive Maintenance to Schedule', () => {
    expect(categorizeTicket('Forward Schedule / Preventive Maintenance', 'Router firmware upgrade', rules)).toBe('Schedule')
  })

  it('classifies Service Requests by description, otherwise Other', () => {
    expect(categorizeTicket('Service Request', 'Request: Onboarding - new joiner', rules)).toBe('Onboarding')
    expect(categorizeTicket('Service Request', 'Terminate access for leaver', rules)).toBe('Offboarding')
    expect(categorizeTicket('Service Request', 'Planned work for meeting room', rules)).toBe('Schedule')
    expect(categorizeTicket('Service Request', 'Install additional monitor', rules)).toBe('Other')
    // Incident-flavoured wording does not turn a Service Request into an Incident.
    expect(categorizeTicket('Service Request', 'Replace failed disk error', rules)).toBe('Other')
  })

  it('maps Event to Other', () => {
    expect(categorizeTicket('Event', 'CPU utilization threshold reached', rules)).toBe('Other')
  })

  it('falls back to keyword matching when the type is blank or unknown', () => {
    expect(categorizeTicket('', 'Network outage at branch', rules)).toBe('Incident')
    expect(categorizeTicket('Task', 'Offboarding checklist', rules)).toBe('Offboarding')
  })
})

describe('cancelled tickets', () => {
  it('normalizes cancelled to its own status, not Closed', () => {
    expect(normalizeStatus('Cancelled', defaultConfig.statuses)).toBe('Cancelled')
    expect(normalizeStatus('canceled', defaultConfig.statuses)).toBe('Cancelled')
    expect(normalizeStatus('Resolved', defaultConfig.statuses)).toBe('Closed')
  })

  it('never counts a cancelled ticket with a Resolved Date as Closed throughput', () => {
    const rows: RawRow[] = [
      { ID: '1', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Incident', Summary: 'Cancelled incident', Submit: '2026-09-01', Resolved: '2026-09-09' },
      { ID: '2', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Fixed incident', Submit: '2026-09-01', Resolved: '2026-09-09' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.closed).toBe(1)
  })

  it('excludes cancelled tickets from outstanding backlog buckets', () => {
    const rows: RawRow[] = [
      { ID: '1', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Service Request', Summary: 'Onboarding cancelled', Submit: '2026-09-01', Resolved: '2026-09-08' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(0)
    expect(metrics.summaries.EUC.totalTickets).toBe(0)
  })
})

describe('outstanding on/off-boarding and schedule work', () => {
  it('includes active statuses such as New, not only Pending', () => {
    const rows: RawRow[] = [
      { ID: '1', Engineer: 'Alex Example', Status: 'New', Type: 'Service Request', Summary: 'Request: Onboarding new joiner', Submit: '2026-09-09' },
      { ID: '2', Engineer: 'Alex Example', Status: 'Work in Progress', Type: 'Service Request', Summary: 'Forward schedule for patching', Submit: '2026-09-08' },
      { ID: '3', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Offboarding leaver', Submit: '2026-09-08' },
      { ID: '4', Engineer: 'Alex Example', Status: 'Closed', Type: 'Service Request', Summary: 'Onboarding done', Submit: '2026-09-01', Resolved: '2026-09-05' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(3)
    expect(metrics.summaries.EUC.totalTickets).toBe(3)
    expect(metrics.summaries.EUC.onboarding).toBe(1)
    expect(metrics.summaries.EUC.scheduleRequests).toBe(1)
    expect(metrics.summaries.EUC.offboarding).toBe(1)
  })

  it('keeps the On-hold Incidents summary limited to pending/on-hold style incident statuses', () => {
    const rows: RawRow[] = [
      { ID: '1', Engineer: 'Alex Example', Status: 'New', Type: 'Incident', Summary: 'Brand new incident', Submit: '2026-09-09' },
      { ID: '2', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Pending incident', Submit: '2026-09-08' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.summaries.EUC.incidentTotal).toBe(1)
    expect(metrics.summaries.EUC.pendingIncidents).toBe(1)
  })
})

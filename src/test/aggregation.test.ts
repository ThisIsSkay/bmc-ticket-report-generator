import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig } from '../config/defaults'
import { normalizeRows } from '../lib/normalize'
import { aggregateTickets } from '../lib/report'
import type { AppConfig, ColumnMapping, RawRow } from '../types'

const mapping: ColumnMapping = {
  ...defaultColumnMapping,
  ticketId: 'ID', assignedTo: 'Engineer', status: 'Status', ticketType: 'Type', summary: 'Summary', createdDate: 'Submit', closedDate: 'Resolved', supportGroup: 'Group',
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] },
}

const rows: RawRow[] = [
  { ID: '1', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Request: Onboarding - new joiner', Submit: '2026-09-09', Group: 'NCC_EUC' },
  { ID: '2', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Incident: laptop failure', Submit: '2026-09-08', Group: 'NCC_EUC' },
  { ID: '3', Engineer: 'Sam Example', Status: 'Closed', Type: 'Service Request', Summary: 'Routine task', Submit: '2026-09-08', Resolved: '2026-09-09', Group: 'NCC_SYSTEM' },
  { ID: '4', Engineer: 'Nina Example', Status: 'Waiting User Reply', Type: 'Incident', Summary: 'VPN incident', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
  { ID: '4', Engineer: 'Nina Example', Status: 'Waiting User Reply', Type: 'Incident', Summary: 'VPN incident duplicate export row', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
]

describe('daily report aggregation', () => {
  it('uses Submit Date for New, Resolved Date for Closed, and current backlog for pending blocks', () => {
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.totalUniqueTickets).toBe(4)
    expect(metrics.newTickets.EUC).toBe(1)
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(1)
    expect(metrics.pendingClosed.EUC.pending).toBe(1)
    expect(metrics.pendingClosed.System.closed).toBe(1)
    expect(metrics.summaries.EUC.totalTickets).toBe(1)
    expect(metrics.summaries.EUC.onboarding).toBe(1)
    expect(metrics.summaries.EUC.incidentTotal).toBe(1)
    expect(metrics.summaries.EUC.pendingIncidents).toBe(1)
    expect(metrics.summaries.Network.waitingUserReplyIncidents).toBe(1)
  })
})

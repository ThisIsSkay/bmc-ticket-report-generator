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
  { ID: 'SRV000001', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Request: Onboarding - new joiner', Submit: '2026-09-09', Group: 'NCC_EUC' },
  { ID: 'INC000002', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Incident: laptop failure', Submit: '2026-09-08', Group: 'NCC_EUC' },
  { ID: 'SRV000003', Engineer: 'Sam Example', Status: 'Closed', Type: 'Service Request', Summary: 'Routine task', Submit: '2026-09-08', Resolved: '2026-09-09', Group: 'NCC_SYSTEM' },
  { ID: 'INC000004', Engineer: 'Nina Example', Status: 'Waiting User Reply', Type: 'Incident', Summary: 'VPN incident', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
  { ID: 'INC000004', Engineer: 'Nina Example', Status: 'Waiting User Reply', Type: 'Incident', Summary: 'VPN incident duplicate export row', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
]

describe('daily report aggregation', () => {
  it('uses Submit Date for New, Resolved Date for Closed, and current backlog for pending blocks', () => {
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.totalUniqueTickets).toBe(4)
    expect(metrics.newTickets.EUC).toBe(1)
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(1)
    expect(metrics.pendingClosed.EUC.pending).toBe(1)
    expect(metrics.pendingClosed.System.closed).toBe(1)
    expect(metrics.summaryBuckets.EUC.onOffBoarding).toBe(1)
    expect(metrics.summaryBuckets.EUC.pending).toBe(1)
    expect(metrics.summaryBuckets.Network.pending).toBe(1)
    expect(metrics.summaries.EUC.totalTickets).toBe(1)
    expect(metrics.summaries.EUC.onboarding).toBe(1)
    expect(metrics.summaries.EUC.incidentTotal).toBe(1)
    expect(metrics.summaries.EUC.pendingIncidents).toBe(1)
    expect(metrics.summaries.Network.waitingUserReplyIncidents).toBe(1)
  })

  it('counts raw Resolved/Closed statuses resolved on the report day even if a local status alias is stale, but excludes Cancelled', () => {
    const staleConfig: AppConfig = {
      ...config,
      statuses: {
        ...config.statuses,
        Closed: ['closed'],
      },
    }
    const dailyRows: RawRow[] = [
      { ID: 'SRV000010', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Service Request', Summary: 'Completed request', Submit: '2026-09-08', Resolved: '2026-09-09', Group: 'NCC_EUC' },
      { ID: 'INC000011', Engineer: 'Alex Example', Status: 'Closed', Type: 'Incident', Summary: 'Completed incident', Submit: '2026-09-08', Resolved: '2026-09-09', Group: 'NCC_EUC' },
      { ID: 'SRV000012', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Service Request', Summary: 'Cancelled request', Submit: '2026-09-08', Resolved: '2026-09-09', Group: 'NCC_EUC' },
      { ID: 'SRV000013', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Service Request', Summary: 'Resolved yesterday', Submit: '2026-09-07', Resolved: '2026-09-08', Group: 'NCC_EUC' },
    ]

    const metrics = aggregateTickets(normalizeRows(dailyRows, mapping, staleConfig), '2026-09-09')
    expect(metrics.pendingClosed.EUC.closed).toBe(2)
  })

  it('summarizes Schedule and active statuses such as In Progress under report Pending, while On/Offboarding stays separate', () => {
    const dailyRows: RawRow[] = [
      { ID: 'SRV000020', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Request: Onboarding - new joiner', Submit: '2026-09-08', Group: 'NCC_EUC' },
      { ID: 'SRV000021', Engineer: 'Alex Example', Status: 'Work in Progress', Type: 'Service Request', Summary: 'Routine software setup', Submit: '2026-09-08', Group: 'NCC_EUC' },
      { ID: 'FSC000022', Engineer: 'Alex Example', Status: 'Pending', Type: 'Forward Schedule / Preventive Maintenance', Summary: 'Maintenance window', Submit: '2026-09-08', Group: 'NCC_EUC' },
      { ID: 'INC000023', Engineer: 'Alex Example', Status: 'Waiting User Reply', Type: 'Incident', Summary: 'Waiting for user', Submit: '2026-09-08', Group: 'NCC_EUC' },
      { ID: 'SRV000024', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Service Request', Summary: 'Cancelled task', Submit: '2026-09-08', Group: 'NCC_EUC' },
    ]

    const metrics = aggregateTickets(normalizeRows(dailyRows, mapping, config), '2026-09-09')
    expect(metrics.summaryBuckets.EUC.onOffBoarding).toBe(1)
    expect(metrics.summaryBuckets.EUC.pending).toBe(3)
  })
})

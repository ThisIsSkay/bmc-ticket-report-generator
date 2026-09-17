import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig } from '../config/defaults'
import { normalizeRows } from '../lib/normalize'
import { aggregateTickets, uniqueForReporting } from '../lib/report'
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
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: [], Network: [] },
}

describe('reopened duplicate ticket resolution', () => {
  it('keeps a later active snapshot even when an older snapshot has a Resolved Date', () => {
    const rows: RawRow[] = [
      {
        ID: 'INC000001',
        Engineer: 'Alex Example',
        Status: 'Resolved',
        Type: 'Incident',
        Summary: 'Previously resolved incident',
        Submit: '2026-09-15',
        Resolved: '2026-09-16',
      },
      {
        ID: 'INC000001',
        Engineer: 'Alex Example',
        Status: 'In Progress',
        Type: 'Incident',
        Summary: 'Reopened incident',
        Submit: '2026-09-15',
        Resolved: '',
      },
    ]

    const tickets = normalizeRows(rows, mapping, config)
    const unique = uniqueForReporting(tickets)

    expect(unique).toHaveLength(1)
    expect(unique[0].reportStatus).toBe('Work in Progress')
    expect(unique[0].closedDate).toBeNull()

    const metrics = aggregateTickets(tickets, '2026-09-17')
    expect(metrics.summaryBuckets.EUC.pending).toBe(1)
    expect(metrics.pendingBreakdown.EUC.workInProgress).toBe(1)
    expect(metrics.pendingClosed.EUC.closed).toBe(0)
  })

  it('still keeps a later resolved snapshot when resolution is the newest state', () => {
    const rows: RawRow[] = [
      {
        ID: 'INC000002',
        Engineer: 'Alex Example',
        Status: 'In Progress',
        Type: 'Incident',
        Summary: 'Active incident',
        Submit: '2026-09-15',
        Resolved: '',
      },
      {
        ID: 'INC000002',
        Engineer: 'Alex Example',
        Status: 'Resolved',
        Type: 'Incident',
        Summary: 'Resolved incident',
        Submit: '2026-09-15',
        Resolved: '2026-09-17',
      },
    ]

    const tickets = normalizeRows(rows, mapping, config)
    const unique = uniqueForReporting(tickets)

    expect(unique).toHaveLength(1)
    expect(unique[0].reportStatus).toBe('Closed')

    const metrics = aggregateTickets(tickets, '2026-09-17')
    expect(metrics.summaryBuckets.EUC.pending).toBe(0)
    expect(metrics.pendingClosed.EUC.closed).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig, defaultFilters } from '../config/defaults'
import { localDateKey } from '../lib/clock'
import { normalizeRows, parseFlexibleDate } from '../lib/normalize'
import { aggregateTickets, filterTickets, uniqueForReporting } from '../lib/report'
import type { AppConfig, ColumnMapping, RawRow } from '../types'

const mapping: ColumnMapping = {
  ...defaultColumnMapping,
  ticketId: 'ID', assignedTo: 'Engineer', status: 'Status', ticketType: 'Type', summary: 'Summary', createdDate: 'Submit', closedDate: 'Resolved',
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] },
}

describe('date parsing', () => {
  it('treats date-only ISO strings as local midnight in every timezone', () => {
    const date = parseFlexibleDate('2026-09-09')
    expect(date).not.toBeNull()
    expect(localDateKey(date!)).toBe('2026-09-09')
    expect(date!.getHours()).toBe(0)
  })

  it('treats date-only slash strings as local midnight', () => {
    const date = parseFlexibleDate('9/9/2026')
    expect(localDateKey(date!)).toBe('2026-09-09')
    expect(date!.getHours()).toBe(0)
  })

  it('parses day-first slash dates when the day exceeds 12', () => {
    const date = parseFlexibleDate('25/12/2026')
    expect(localDateKey(date!)).toBe('2026-12-25')
  })

  it('parses Excel serial numbers', () => {
    // Serial 45000 = 2023-03-15 in the 1900 date system.
    const date = parseFlexibleDate(45000)
    expect(localDateKey(date!)).toBe('2023-03-15')
  })

  it('flags unparseable non-blank dates and keeps blanks as null', () => {
    expect(parseFlexibleDate('not a date')).toBeNull()
    expect(parseFlexibleDate('')).toBeNull()
    const tickets = normalizeRows([
      { ID: 'INC000001', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Printer incident', Submit: 'garbage' },
      { ID: 'INC000002', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Printer incident', Submit: '' },
    ], mapping, config)
    expect(tickets[0].dateInvalid).toBe(true)
    expect(tickets[1].dateInvalid).toBe(false)
  })
})

describe('duplicate ticket resolution', () => {
  const rows: RawRow[] = [
    { ID: 'INC-1', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Duplicated export row', Submit: '2026-09-08' },
    { ID: 'INC-1', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Duplicated export row', Submit: '2026-09-08', Resolved: '2026-09-09' },
  ]

  it('keeps the duplicate row with the most recent lifecycle information', () => {
    const unique = uniqueForReporting(normalizeRows(rows, mapping, config))
    expect(unique).toHaveLength(1)
    expect(unique[0].reportStatus).toBe('Closed')
    expect(localDateKey(unique[0].closedDate!)).toBe('2026-09-09')
  })

  it('counts the resolved duplicate as closed today instead of pending backlog', () => {
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.closed).toBe(1)
    expect(metrics.pendingClosed.EUC.pending).toBe(0)
  })

  it('is deterministic on full-tie duplicates (later export row wins) and preserves order', () => {
    const tie: RawRow[] = [
      { ID: 'INC00000A', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'First snapshot', Submit: '2026-09-08' },
      { ID: 'INC00000B', Engineer: 'Sam Example', Status: 'Pending', Type: 'Incident', Summary: 'Other ticket', Submit: '2026-09-08' },
      { ID: 'INC00000A', Engineer: 'Alex Example', Status: 'Work in Progress', Type: 'Incident', Summary: 'Second snapshot', Submit: '2026-09-08' },
    ]
    const unique = uniqueForReporting(normalizeRows(tie, mapping, config))
    expect(unique.map((t) => t.id)).toEqual(['INC00000A', 'INC00000B'])
    expect(unique[0].reportStatus).toBe('Work in Progress')
  })
})

describe('created-range filter versus closed-today', () => {
  const rows: RawRow[] = [
    { ID: 'INC000OLD', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Old incident resolved today', Submit: '2026-08-01', Resolved: '2026-09-09' },
    { ID: 'INC000NEW', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Fresh incident', Submit: '2026-09-09' },
  ]
  const tickets = normalizeRows(rows, mapping, config)
  const filters = { ...defaultFilters, reportDate: '2026-09-09', startDate: '2026-09-09', endDate: '2026-09-09' }

  it('keeps tickets resolved on the report date even when created before the range', () => {
    const filtered = filterTickets(tickets, filters, { protectResolvedOnReportDate: true })
    expect(filtered.map((t) => t.id).sort()).toEqual(['INC000NEW', 'INC000OLD'])
    const metrics = aggregateTickets(filtered, '2026-09-09')
    expect(metrics.pendingClosed.EUC.closed).toBe(1)
  })

  it('applies the strict range when protection is not requested', () => {
    expect(filterTickets(tickets, filters).map((t) => t.id)).toEqual(['INC000NEW'])
  })
})

describe('report date rollover and empty teams', () => {
  const rows: RawRow[] = [
    { ID: 'INC000001', Engineer: 'Alex Example', Status: 'New', Type: 'Incident', Summary: 'Submitted on the 9th', Submit: '2026-09-09' },
    { ID: 'INC000002', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Resolved on the 9th', Submit: '2026-09-01', Resolved: '2026-09-09' },
    { ID: 'INC000003', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Backlog incident', Submit: '2026-09-01' },
  ]
  const tickets = normalizeRows(rows, mapping, config)

  it('resets New and Closed after midnight while backlog persists', () => {
    const today = aggregateTickets(tickets, '2026-09-09')
    expect(today.newTickets.EUC).toBe(1)
    expect(today.pendingClosed.EUC.closed).toBe(1)

    const tomorrow = aggregateTickets(tickets, '2026-09-10')
    expect(tomorrow.newTickets.EUC).toBe(0)
    expect(tomorrow.pendingClosed.EUC.closed).toBe(0)
    expect(tomorrow.pendingClosed.EUC.pending).toBe(1)
  })

  it('reports zeros for teams with no selected engineers', () => {
    const metrics = aggregateTickets(tickets, '2026-09-09')
    expect(metrics.newTickets.Network).toBe(0)
    expect(metrics.pendingClosed.Network).toEqual({ scheduledOnOffBoarding: 0, pending: 0, closed: 0 })
    expect(metrics.summaries.Network.totalTickets).toBe(0)
  })
})

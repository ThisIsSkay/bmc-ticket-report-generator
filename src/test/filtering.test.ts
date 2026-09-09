import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig, defaultFilters } from '../config/defaults'
import { normalizeRows } from '../lib/normalize'
import { filterTickets } from '../lib/report'
import type { AppConfig, ColumnMapping } from '../types'

const mapping: ColumnMapping = { ...defaultColumnMapping, ticketId: 'ID', assignedTo: 'Engineer', status: 'Status', ticketType: 'Type', summary: 'Summary', createdDate: 'Created' }
const config: AppConfig = { ...defaultConfig, teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] } }
const tickets = normalizeRows([
  { ID: 'A', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Onboarding Alice', Created: '2026-09-09' },
  { ID: 'B', Engineer: 'Sam Example', Status: 'Pending', Type: 'Incident', Summary: 'Database outage', Created: '2026-09-08' },
  { ID: 'C', Engineer: 'Nina Example', Status: 'Closed', Type: 'Service Request', Summary: 'Firewall planned work', Created: '2026-09-01' },
], mapping, config)

describe('filtering', () => {
  it('filters by date range, team, status, category, engineer and search', () => {
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', startDate: '2026-09-08', endDate: '2026-09-09' })).toHaveLength(2)
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', team: 'System' })).toHaveLength(1)
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', status: 'Closed' })).toHaveLength(1)
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', category: 'Incident' })).toHaveLength(1)
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', assignee: 'Alex Example' })).toHaveLength(1)
    expect(filterTickets(tickets, { ...defaultFilters, reportDate: '2026-09-09', search: 'firewall' })[0].id).toBe('C')
  })
})

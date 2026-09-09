import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaults'
import { categorizeTicket, classifyTeam, inferTeamMappingFromTickets, normalizeStatus, validateTeamMapping } from '../lib/normalize'
import type { TeamMapping, Ticket } from '../types'

const teams: TeamMapping = {
  EUC: ['Alex Example', 'A. Example'],
  System: ['Sam Example'],
  Network: ['Nina Example'],
}

describe('team classification', () => {
  it('matches selected engineers case-insensitively and trims spaces', () => {
    expect(classifyTeam('  alex example ', teams)).toBe('EUC')
    expect(classifyTeam('SAM EXAMPLE', teams)).toBe('System')
  })

  it('returns Review / Unassigned for blank or unknown names', () => {
    expect(classifyTeam('', teams)).toBe('Review / Unassigned')
    expect(classifyTeam('Unknown Person', teams)).toBe('Review / Unassigned')
  })

  it('detects aliases placed in multiple teams', () => {
    const mapping = { ...teams, Network: [...teams.Network, 'Alex Example'] }
    expect(validateTeamMapping(mapping)).toContain('Alex Example')
  })

  it('suggests engineers from their dominant recent BMC Assigned Group', () => {
    const base = {
      sourceIndex: 0, raw: {}, id: '', rawStatus: 'Pending', rawCategory: 'Service Request', summary: '', closedDate: null,
      contract: '', team: 'Review / Unassigned' as const, kind: 'Service Request' as const, idPrefix: 'SRV',
      category: 'Other' as const, reportStatus: 'Pending' as const, duplicateId: false, dateInvalid: false,
    }
    const tickets: Ticket[] = [
      { ...base, sourceIndex: 1, assignedTo: 'Alex Example', supportGroup: 'NCC_EUC', createdDate: new Date(2026, 9, 1) },
      { ...base, sourceIndex: 2, assignedTo: 'Alex Example', supportGroup: 'NCC_EUC', createdDate: new Date(2026, 9, 2) },
      { ...base, sourceIndex: 3, assignedTo: 'Alex Example', supportGroup: 'NCC_NETWORK', createdDate: new Date(2026, 9, 3) },
      { ...base, sourceIndex: 4, assignedTo: 'Sam Example', supportGroup: 'NCC_SYSTEM', createdDate: new Date(2026, 9, 4) },
      { ...base, sourceIndex: 5, assignedTo: 'Nina Example', supportGroup: 'NCC_NETWORK', createdDate: new Date(2026, 9, 5) },
    ]
    const suggested = inferTeamMappingFromTickets(tickets)
    expect(suggested.EUC).toContain('Alex Example')
    expect(suggested.System).toContain('Sam Example')
    expect(suggested.Network).toContain('Nina Example')
  })
})

describe('category categorization', () => {
  it('recognizes BMC-style onboarding, schedule and incident values', () => {
    expect(categorizeTicket('Service Request', 'Service Request', 'Request: Onboarding - Onboard new joiner', defaultConfig.categories)).toBe('Onboarding')
    expect(categorizeTicket('Service Request', 'Forward Schedule / Preventive Maintenance', 'Cuppage maintenance', defaultConfig.categories)).toBe('Schedule')
    expect(categorizeTicket('Incident', 'Incident', 'Printer issue', defaultConfig.categories)).toBe('Incident')
  })
})

describe('status normalization', () => {
  it('maps BMC source statuses and falls back to Other', () => {
    expect(normalizeStatus('  RESOLVED ', defaultConfig.statuses)).toBe('Closed')
    expect(normalizeStatus('Pending', defaultConfig.statuses)).toBe('Pending')
    expect(normalizeStatus('Vendor Queue', defaultConfig.statuses)).toBe('Other')
  })
})

import { describe, expect, it } from 'vitest'
import { defaultColumnMapping, defaultConfig } from '../config/defaults'
import { categorizeTicket, normalizeRows, normalizeStatus, ticketIdPrefix, ticketKindFromId } from '../lib/normalize'
import { aggregateTickets, buildValidation, outOfScopeByGroup, pendingDiagnostics } from '../lib/report'
import type { AppConfig, ColumnMapping, RawRow } from '../types'

const mapping: ColumnMapping = {
  ...defaultColumnMapping,
  ticketId: 'ID', assignedTo: 'Engineer', status: 'Status', ticketType: 'Type', summary: 'Summary', createdDate: 'Submit', closedDate: 'Resolved', supportGroup: 'Group',
}

const config: AppConfig = {
  ...defaultConfig,
  teams: { EUC: ['Alex Example'], System: ['Sam Example'], Network: ['Nina Example'] },
}

const rules = defaultConfig.categories

describe('ticket kind from the Ticket ID prefix', () => {
  it('reads the leading letters case-insensitively and ignores whitespace', () => {
    expect(ticketIdPrefix('  inc000000400003 ')).toBe('INC')
    expect(ticketKindFromId('  inc000000400003 ')).toBe('Incident')
    expect(ticketKindFromId('srv000000400001')).toBe('Service Request')
    expect(ticketKindFromId(' SRV000000400001 ')).toBe('Service Request')
  })

  it('treats unrecognized and blank prefixes as Unknown rather than guessing', () => {
    expect(ticketKindFromId('FSC000000400010')).toBe('Unknown')
    expect(ticketKindFromId('TASK-42')).toBe('Unknown')
    expect(ticketKindFromId('12345')).toBe('Unknown')
    expect(ticketKindFromId('')).toBe('Unknown')
  })
})

describe('INC tickets are always incidents', () => {
  it('ignores onboarding wording inside an incident description', () => {
    expect(categorizeTicket('Incident', 'Incident', 'User cannot reach the onboarding portal', rules)).toBe('Incident')
  })

  it('ignores schedule wording inside an incident description', () => {
    expect(categorizeTicket('Incident', 'Incident', 'Scheduled backup job failed overnight', rules)).toBe('Incident')
    expect(categorizeTicket('Incident', 'Forward Schedule / Preventive Maintenance', 'Preventive maintenance window', rules)).toBe('Incident')
  })

  it('ignores offboarding wording inside an incident description', () => {
    expect(categorizeTicket('Incident', 'Incident', 'Offboarding script crashed', rules)).toBe('Incident')
  })

  it('classifies an INC row end to end regardless of description keywords', () => {
    const tickets = normalizeRows(
      [{ ID: 'INC000000400003', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Request: Onboarding - schedule a laptop swap', Submit: '2026-09-09' }],
      mapping,
      config,
    )
    expect(tickets[0].kind).toBe('Incident')
    expect(tickets[0].category).toBe('Incident')
  })
})

describe('SRV tickets are classified from structured type and description', () => {
  it('maps onboarding descriptions', () => {
    expect(categorizeTicket('Service Request', 'Service Request', 'Request: Onboarding - new joiner', rules)).toBe('Onboarding')
  })

  it('maps offboarding descriptions', () => {
    expect(categorizeTicket('Service Request', 'Service Request', 'Terminate access for leaver', rules)).toBe('Offboarding')
  })

  it('maps schedule descriptions and the structured schedule type', () => {
    expect(categorizeTicket('Service Request', 'Service Request', 'Planned work for meeting room', rules)).toBe('Schedule')
    expect(categorizeTicket('Service Request', 'Forward Schedule / Preventive Maintenance', 'Quarterly router firmware', rules)).toBe('Schedule')
  })

  it('falls back to Other for service requests with none of those keywords', () => {
    expect(categorizeTicket('Service Request', 'Service Request', 'Install an additional monitor', rules)).toBe('Other')
    // Incident-flavoured wording never turns a service request into an incident.
    expect(categorizeTicket('Service Request', 'Service Request', 'Replace failed disk error', rules)).toBe('Other')
  })
})

describe('Event and unknown prefixes', () => {
  it('keeps Event tickets as Other', () => {
    expect(categorizeTicket('Event', 'Event', 'CPU utilization threshold reached', rules)).toBe('Other')
  })

  it('keeps unknown-prefix tickets as Other instead of guessing INC or SRV', () => {
    expect(categorizeTicket('Unknown', 'Forward Schedule / Preventive Maintenance', 'Preventive maintenance', rules)).toBe('Other')
    expect(categorizeTicket('Unknown', 'Incident', 'Network outage', rules)).toBe('Other')
  })

  it('surfaces unrecognized prefixes in validation with their counts', () => {
    const tickets = normalizeRows([
      { ID: 'FSC000000400010', Engineer: 'Alex Example', Status: 'Closed', Type: 'Forward Schedule / Preventive Maintenance', Summary: 'Quarterly maintenance', Submit: '2026-09-01', Resolved: '2026-09-02' },
      { ID: 'FSC000000400011', Engineer: 'Alex Example', Status: 'Closed', Type: 'Forward Schedule / Preventive Maintenance', Summary: 'Quarterly maintenance', Submit: '2026-09-01', Resolved: '2026-09-02' },
      { ID: 'TASK-1', Engineer: 'Alex Example', Status: 'Pending', Type: '', Summary: 'Unclassified work', Submit: '2026-09-01' },
      { ID: 'INC000000400003', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Laptop failure', Submit: '2026-09-01' },
    ], mapping, config)
    const validation = buildValidation(tickets)
    expect(validation.unknownPrefixes).toEqual([
      { label: 'FSC', count: 2 },
      { label: 'TASK', count: 1 },
    ])
  })
})

describe('report scope follows explicit engineer selection', () => {
  const rows: RawRow[] = [
    { ID: 'INC000000400001', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Selected engineer incident', Submit: '2026-09-09', Group: 'NCC_EUC' },
    { ID: 'INC000000400002', Engineer: 'Unselected Person', Status: 'Pending', Type: 'Incident', Summary: 'Other team incident', Submit: '2026-09-09', Group: 'NCC_Application' },
    { ID: 'INC000000400003', Engineer: '', Status: 'Pending', Type: 'Incident', Summary: 'Blank engineer incident', Submit: '2026-09-09', Group: 'NOAH' },
    { ID: 'EVT000000400004', Engineer: 'Monitoring Person', Status: 'Closed', Type: 'Event', Summary: 'Threshold event', Submit: '2026-09-09', Resolved: '2026-09-09', Group: 'DTS_NOC' },
  ]
  const tickets = normalizeRows(rows, mapping, config)

  it('includes tickets whose engineer is selected', () => {
    const metrics = aggregateTickets(tickets, '2026-09-09')
    expect(metrics.newTickets.EUC).toBe(1)
    expect(metrics.pendingClosed.EUC.pending).toBe(1)
  })

  it('excludes unselected engineers from every report metric', () => {
    const metrics = aggregateTickets(tickets, '2026-09-09')
    expect(metrics.totalUniqueTickets).toBe(1)
    expect(metrics.newTickets.System + metrics.newTickets.Network).toBe(0)
    // The unselected engineer's ticket is not silently re-homed anywhere.
    expect(metrics.pendingClosed.System.pending + metrics.pendingClosed.Network.pending).toBe(0)
  })

  it('leaves a blank engineer out of scope instead of using its Assigned Group', () => {
    const blank = tickets.find((ticket) => ticket.id === 'INC000000400003')
    expect(blank?.team).toBe('Review / Unassigned')
  })

  it('reports what was excluded, grouped by Assigned Group, without hard-coding group names', () => {
    const { rows: groups, total } = outOfScopeByGroup(tickets)
    expect(total).toBe(3)
    expect(groups).toEqual([
      { label: 'DTS_NOC', count: 1 },
      { label: 'NCC_Application', count: 1 },
      { label: 'NOAH', count: 1 },
    ])
  })
})

describe('pending diagnostic splits the chart population by ticket kind', () => {
  const rows: RawRow[] = [
    { ID: 'INC000000400001', Engineer: 'Nina Example', Status: 'Pending', Type: 'Incident', Summary: 'Network incident one', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
    { ID: 'INC000000400002', Engineer: 'Nina Example', Status: 'On Hold', Type: 'Incident', Summary: 'Network incident two', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
    { ID: 'SRV000000400003', Engineer: 'Nina Example', Status: 'Pending', Type: 'Service Request', Summary: 'Install a switch port', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
    { ID: 'SRV000000400004', Engineer: 'Nina Example', Status: 'Pending', Type: 'Service Request', Summary: 'Request: Onboarding - new joiner', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
    { ID: 'FSC000000400005', Engineer: 'Nina Example', Status: 'Pending', Type: 'Forward Schedule / Preventive Maintenance', Summary: 'Maintenance window', Submit: '2026-09-08', Group: 'NCC_NETWORK' },
  ]
  const tickets = normalizeRows(rows, mapping, config)

  it('reconciles the chart Pending total with its INC/SRV/other split', () => {
    const network = pendingDiagnostics(tickets).find((row) => row.team === 'Network')!
    const metrics = aggregateTickets(tickets, '2026-09-09')
    // The onboarding service request sits in the On/Off-Boarding bucket, so it
    // is not part of the chart's Pending bar.
    expect(network.total).toBe(metrics.pendingClosed.Network.pending)
    expect(network.total).toBe(4)
    expect(network.incident).toBe(2)
    expect(network.serviceRequest).toBe(1)
    expect(network.other).toBe(1)
    expect(network.incident).toBe(metrics.summaries.Network.pendingIncidents)
  })

  it('breaks the pending population down by Assigned Group', () => {
    const network = pendingDiagnostics(tickets).find((row) => row.team === 'Network')!
    expect(network.byGroup).toEqual([{ label: 'NCC_NETWORK', count: 4 }])
  })

  it('reports zeros for teams with no pending work', () => {
    const euc = pendingDiagnostics(tickets).find((row) => row.team === 'EUC')!
    expect(euc).toMatchObject({ total: 0, incident: 0, serviceRequest: 0, other: 0 })
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
      { ID: 'INC000000400001', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Incident', Summary: 'Cancelled incident', Submit: '2026-09-01', Resolved: '2026-09-09' },
      { ID: 'INC000000400002', Engineer: 'Alex Example', Status: 'Resolved', Type: 'Incident', Summary: 'Fixed incident', Submit: '2026-09-01', Resolved: '2026-09-09' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.closed).toBe(1)
  })

  it('excludes cancelled tickets from outstanding backlog buckets', () => {
    const rows: RawRow[] = [
      { ID: 'SRV000000400001', Engineer: 'Alex Example', Status: 'Cancelled', Type: 'Service Request', Summary: 'Onboarding cancelled', Submit: '2026-09-01', Resolved: '2026-09-08' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(0)
    expect(metrics.summaries.EUC.totalTickets).toBe(0)
  })
})

describe('outstanding on/off-boarding and schedule work', () => {
  it('includes active statuses such as New, not only Pending', () => {
    const rows: RawRow[] = [
      { ID: 'SRV000000400001', Engineer: 'Alex Example', Status: 'New', Type: 'Service Request', Summary: 'Request: Onboarding new joiner', Submit: '2026-09-09' },
      { ID: 'SRV000000400002', Engineer: 'Alex Example', Status: 'Work in Progress', Type: 'Service Request', Summary: 'Forward schedule for patching', Submit: '2026-09-08' },
      { ID: 'SRV000000400003', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Offboarding leaver', Submit: '2026-09-08' },
      { ID: 'SRV000000400004', Engineer: 'Alex Example', Status: 'Closed', Type: 'Service Request', Summary: 'Onboarding done', Submit: '2026-09-01', Resolved: '2026-09-05' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.pendingClosed.EUC.scheduledOnOffBoarding).toBe(3)
    expect(metrics.summaries.EUC.totalTickets).toBe(3)
    expect(metrics.summaries.EUC.onboarding).toBe(1)
    expect(metrics.summaries.EUC.scheduleRequests).toBe(1)
    expect(metrics.summaries.EUC.offboarding).toBe(1)
  })

  it('keeps the On-hold Incidents summary limited to INC tickets', () => {
    const rows: RawRow[] = [
      { ID: 'INC000000400001', Engineer: 'Alex Example', Status: 'New', Type: 'Incident', Summary: 'Brand new incident', Submit: '2026-09-09' },
      { ID: 'INC000000400002', Engineer: 'Alex Example', Status: 'Pending', Type: 'Incident', Summary: 'Pending incident', Submit: '2026-09-08' },
      { ID: 'SRV000000400003', Engineer: 'Alex Example', Status: 'Pending', Type: 'Service Request', Summary: 'Pending service request', Submit: '2026-09-08' },
    ]
    const metrics = aggregateTickets(normalizeRows(rows, mapping, config), '2026-09-09')
    expect(metrics.summaries.EUC.incidentTotal).toBe(1)
    expect(metrics.summaries.EUC.pendingIncidents).toBe(1)
  })
})

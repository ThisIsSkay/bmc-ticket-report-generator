import type {
  AppConfig,
  ClassifiedTeam,
  ColumnMapping,
  RawRow,
  ReportStatus,
  Team,
  TeamMapping,
  Ticket,
  TicketCategory,
} from '../types'

export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export function validateTeamMapping(config: AppConfig['teams']): string[] {
  const seen = new Map<string, string>()
  const duplicates = new Set<string>()
  for (const [team, aliases] of Object.entries(config)) {
    for (const alias of aliases) {
      const key = normalizeText(alias)
      if (!key) continue
      const prior = seen.get(key)
      if (prior && prior !== team) duplicates.add(alias.trim())
      else seen.set(key, team)
    }
  }
  return [...duplicates].sort((a, b) => a.localeCompare(b))
}

export function classifyTeam(assignedTo: unknown, teams: AppConfig['teams']): ClassifiedTeam {
  const needle = normalizeText(assignedTo)
  if (!needle) return 'Review / Unassigned'
  for (const team of ['EUC', 'System', 'Network'] as const) {
    if (teams[team].some((alias) => normalizeText(alias) === needle)) return team
  }
  return 'Review / Unassigned'
}

function supportGroupTeam(value: unknown): Team | null {
  const group = normalizeText(value)
  if (!group) return null
  if (/(^|[_\s-])euc($|[_\s-])/.test(group) || group.includes('ncc_euc') || group.includes('nccs_euc')) return 'EUC'
  if (/(^|[_\s-])systems?($|[_\s-])/.test(group) || group.includes('ncc_system')) return 'System'
  if (/(^|[_\s-])network($|[_\s-])/.test(group) || group.includes('ncc_network') || group.includes('d&t_network')) return 'Network'
  return null
}

export function inferTeamMappingFromTickets(tickets: Ticket[], recentDays = 90): TeamMapping {
  const dated = tickets.map((ticket) => ticket.createdDate?.getTime() ?? 0).filter((value) => value > 0)
  const latest = dated.length ? Math.max(...dated) : 0
  const cutoff = latest ? latest - recentDays * 86400000 : 0
  const counts = new Map<string, { display: string; teams: Record<Team, number> }>()

  for (const ticket of tickets) {
    if (!ticket.assignedTo) continue
    if (cutoff && ticket.createdDate && ticket.createdDate.getTime() < cutoff) continue
    const team = supportGroupTeam(ticket.supportGroup)
    if (!team) continue
    const key = normalizeText(ticket.assignedTo)
    const existing = counts.get(key) ?? { display: ticket.assignedTo.trim(), teams: { EUC: 0, System: 0, Network: 0 } }
    existing.teams[team] += 1
    counts.set(key, existing)
  }

  const result: TeamMapping = { EUC: [], System: [], Network: [] }
  for (const entry of counts.values()) {
    const ranking = (['EUC', 'System', 'Network'] as Team[])
      .map((team) => ({ team, count: entry.teams[team] }))
      .sort((a, b) => b.count - a.count)
    if (!ranking[0].count) continue
    if (ranking[1] && ranking[1].count === ranking[0].count) continue
    result[ranking[0].team].push(entry.display)
  }
  for (const team of ['EUC', 'System', 'Network'] as Team[]) {
    result[team].sort((a, b) => a.localeCompare(b))
  }
  return result
}

export function normalizeStatus(status: unknown, mappings: AppConfig['statuses']): ReportStatus {
  const needle = normalizeText(status)
  if (!needle) return 'Other'
  const order: ReportStatus[] = [
    'New',
    'Pending',
    'Closed',
    'Work in Progress',
    'Waiting User Reply',
    'On Hold',
  ]
  for (const target of order) {
    if (mappings[target].some((source) => normalizeText(source) === needle)) return target
  }
  return 'Other'
}

export function categorizeTicket(
  categoryValue: unknown,
  summaryValue: unknown,
  rules: AppConfig['categories'],
): TicketCategory {
  const haystack = normalizeText(`${String(categoryValue ?? '')} ${String(summaryValue ?? '')}`)
  const order: Exclude<TicketCategory, 'Other'>[] = ['Onboarding', 'Offboarding', 'Schedule', 'Incident']
  for (const category of order) {
    if (rules[category].some((keyword) => {
      const normalizedKeyword = normalizeText(keyword)
      return normalizedKeyword.length > 0 && haystack.includes(normalizedKeyword)
    })) {
      return category
    }
  }
  return 'Other'
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(1899, 11, 30, 0, 0, 0, 0)
    const date = new Date(excelEpoch.getTime() + value * 86400000)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const text = String(value ?? '').trim()
  if (!text) return null

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?$/)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    const y = Number(slash[3])
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    const rest = slash[4] ? ` ${slash[4]}` : ''
    const parsed = new Date(`${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${rest}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function value(row: RawRow, column: string): unknown {
  return column ? row[column] : ''
}

export function normalizeRows(
  rows: RawRow[],
  mapping: ColumnMapping,
  config: AppConfig,
): Ticket[] {
  const ids = rows.map((row) => String(value(row, mapping.ticketId) ?? '').trim())
  const counts = new Map<string, number>()
  ids.filter(Boolean).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))

  return rows.map((row, sourceIndex) => {
    const id = ids[sourceIndex]
    const assignedTo = String(value(row, mapping.assignedTo) ?? '').trim()
    const rawStatus = String(value(row, mapping.status) ?? '').trim()
    const rawCategory = String(value(row, mapping.ticketType) ?? '').trim()
    const summary = String(value(row, mapping.summary) ?? '').trim()
    const createdRaw = value(row, mapping.createdDate)
    const closedRaw = value(row, mapping.closedDate)
    const createdDate = parseFlexibleDate(createdRaw)
    const closedDate = parseFlexibleDate(closedRaw)
    const hasInvalidCreated = Boolean(String(createdRaw ?? '').trim()) && !createdDate
    const hasInvalidClosed = Boolean(String(closedRaw ?? '').trim()) && !closedDate

    return {
      sourceIndex,
      raw: row,
      id,
      assignedTo,
      rawStatus,
      rawCategory,
      summary,
      createdDate,
      closedDate,
      supportGroup: String(value(row, mapping.supportGroup) ?? '').trim(),
      contract: String(value(row, mapping.contract) ?? '').trim(),
      team: classifyTeam(assignedTo, config.teams),
      category: categorizeTicket(rawCategory, summary, config.categories),
      reportStatus: normalizeStatus(rawStatus, config.statuses),
      duplicateId: Boolean(id && (counts.get(id) ?? 0) > 1),
      dateInvalid: hasInvalidCreated || hasInvalidClosed,
    }
  })
}

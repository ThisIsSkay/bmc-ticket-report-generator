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
  TicketKind,
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
    'Cancelled',
  ]
  for (const target of order) {
    if (mappings[target].some((source) => normalizeText(source) === needle)) return target
  }
  return 'Other'
}

const matchesAny = (haystack: string, keywords: string[]): boolean =>
  keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    return normalizedKeyword.length > 0 && haystack.includes(normalizedKeyword)
  })

const KIND_BY_PREFIX: Record<string, TicketKind> = {
  INC: 'Incident',
  SRV: 'Service Request',
  FSC: 'Forward Schedule',
  EVT: 'Event',
}

// The leading letters of the Ticket ID, e.g. "INC000000400003" -> "INC".
export function ticketIdPrefix(id: unknown): string {
  const match = /^[A-Za-z]+/.exec(String(id ?? '').trim())
  return match ? match[0].toUpperCase() : ''
}

// BMC assigns the Ticket ID prefix reliably, so it — not the free-text
// description — decides what kind of work a ticket represents. Unrecognized
// prefixes stay Unknown so validation can surface them instead of being guessed
// into one of the known kinds.
export function ticketKindFromId(id: unknown): TicketKind {
  return KIND_BY_PREFIX[ticketIdPrefix(id)] ?? 'Unknown'
}

// Category follows the ticket kind:
//   Incident (INC)         -> Incident, always. "onboarding"/"schedule" wording
//                             inside an incident description never overrides it.
//   Service Request (SRV)  -> Onboarding / Offboarding / Schedule from the
//                             structured type and description keywords, else Other.
//   Forward Schedule (FSC) -> Schedule, always.
//   Event (EVT), Unknown   -> Other. Events are monitoring noise and unknown
//                             prefixes are reported rather than guessed.
export function categorizeTicket(
  kind: TicketKind,
  categoryValue: unknown,
  summaryValue: unknown,
  rules: AppConfig['categories'],
): TicketCategory {
  if (kind === 'Incident') return 'Incident'
  if (kind === 'Forward Schedule') return 'Schedule'
  if (kind !== 'Service Request') return 'Other'

  const type = normalizeText(categoryValue)
  if (type.includes('forward schedule') || type.includes('preventive maintenance')) return 'Schedule'

  const description = normalizeText(summaryValue)
  for (const category of ['Onboarding', 'Offboarding', 'Schedule'] as const) {
    if (matchesAny(description, rules[category])) return category
  }
  return 'Other'
}

// Builds a local-midnight date, rejecting out-of-range components. The
// multi-argument Date constructor silently rolls them over — month 13 becomes
// January of the next year and 31 February becomes 3 March — which would let a
// malformed source date pass validation and land on the wrong report day.
function buildLocalDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  const roundTrips = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return roundTrips ? date : null
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

  // Date-only values must resolve to LOCAL midnight. Passing "YYYY-MM-DD" to the
  // Date constructor parses as UTC midnight, which lands on the previous calendar
  // day for negative-offset browsers and 08:00 for Singapore.
  const isoDay = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoDay) {
    return buildLocalDate(Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]))
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?$/)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    const y = Number(slash[3])
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    // Out-of-range components are rejected outright rather than falling through
    // to Date's lenient string parser, which would silently roll "2/30/2026"
    // over to 2 March.
    if (!buildLocalDate(y, month, day)) return null
    if (!slash[4]) return buildLocalDate(y, month, day)
    const parsed = new Date(`${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${slash[4]}`)
    if (!Number.isNaN(parsed.getTime())) return parsed
    return null
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
    const kind = ticketKindFromId(id)
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
      kind,
      idPrefix: ticketIdPrefix(id),
      category: categorizeTicket(kind, rawCategory, summary, config.categories),
      reportStatus: normalizeStatus(rawStatus, config.statuses),
      duplicateId: Boolean(id && (counts.get(id) ?? 0) > 1),
      dateInvalid: hasInvalidCreated || hasInvalidClosed,
    }
  })
}

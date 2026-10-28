import type { Ticket } from '../types'

export interface SurveyRecipient {
  email: string
  ticketIds: string[]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidSurveyEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

export function buildSurveyRecipients(tickets: Ticket[]): SurveyRecipient[] {
  const recipients = new Map<string, SurveyRecipient>()
  for (const ticket of tickets) {
    const email = (ticket.requesterEmail ?? '').trim()
    if (!isValidSurveyEmail(email)) continue
    const key = email.toLowerCase()
    const existing = recipients.get(key)
    if (existing) {
      if (ticket.id && !existing.ticketIds.includes(ticket.id)) existing.ticketIds.push(ticket.id)
    } else {
      recipients.set(key, { email, ticketIds: ticket.id ? [ticket.id] : [] })
    }
  }
  return [...recipients.values()]
}

export function dedupeSurveyRecipients(rows: SurveyRecipient[]): SurveyRecipient[] {
  const recipients = new Map<string, SurveyRecipient>()
  for (const row of rows) {
    const email = row.email.trim()
    if (!isValidSurveyEmail(email)) continue
    const key = email.toLowerCase()
    const existing = recipients.get(key)
    if (existing) {
      for (const ticketId of row.ticketIds) {
        if (ticketId && !existing.ticketIds.includes(ticketId)) existing.ticketIds.push(ticketId)
      }
    } else {
      recipients.set(key, { email, ticketIds: [...row.ticketIds] })
    }
  }
  return [...recipients.values()]
}

export function surveySourceStats(tickets: Ticket[]): { validEmailTickets: number; needsReview: number } {
  const validEmailTickets = tickets.filter((ticket) => isValidSurveyEmail(ticket.requesterEmail ?? '')).length
  return { validEmailTickets, needsReview: tickets.length - validEmailTickets }
}

export function resolveSurveyBody(body: string, surveyLink: string): string {
  return body.split('{{SURVEY_LINK}}').join(surveyLink.trim() || '[SURVEY LINK]')
}

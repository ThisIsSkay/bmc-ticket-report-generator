// The three sections of the unified app. Email and Survey are the existing
// pages, published next to this app, shown in same-origin frames with their
// code untouched (PLAN.md Phase 2, "fast first" option chosen by the owner).
export type ToolId = 'whatsapp' | 'email' | 'survey'

export interface Tool {
  id: ToolId
  label: string
  description: string
  /** Relative to the published /app/ page; undefined for the native WhatsApp section. */
  frameSrc?: string
}

export const TOOLS: Tool[] = [
  { id: 'whatsapp', label: 'WhatsApp Report', description: 'Daily report image for the WhatsApp group' },
  { id: 'email', label: 'Email Reports', description: 'Daily, outstanding and monthly email reports', frameSrc: '../daily-email/' },
  { id: 'survey', label: 'Customer Survey', description: 'Match requesters to a customer directory', frameSrc: '../customer-survey/' },
]

export function toolFromHash(hash: string): ToolId {
  const id = hash.replace(/^#\/?/, '').split(/[?/]/)[0]
  return TOOLS.some((tool) => tool.id === id) ? (id as ToolId) : 'whatsapp'
}

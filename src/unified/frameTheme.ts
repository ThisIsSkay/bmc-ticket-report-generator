// Applies the WhatsApp app's look and light/dark theme to the Email and Survey
// pages while they are shown inside the unified app. The pages are same-origin,
// so the stylesheet is injected from outside: their own files stay untouched and
// the standalone pages keep their original look. Only the page chrome is
// restyled; generated emails, previews and exports are not affected.
import embedCss from './embed-theme.css?raw'
import type { AppTheme } from '../lib/storage'
import type { ToolId } from './tools'

const STYLE_ID = 'bmc-unified-embed-theme'

/** True when the frame shows the expected page (not a 404 or an empty document). */
export function frameHasPage(frame: HTMLIFrameElement | null | undefined, selector: string | undefined): boolean {
  if (!selector) return true
  try {
    return Boolean(frame?.contentDocument?.querySelector(selector))
  } catch {
    return false
  }
}

export function themeFrame(frame: HTMLIFrameElement | null | undefined, theme: AppTheme, tool: ToolId): boolean {
  let doc: Document | null = null
  try {
    doc = frame?.contentDocument ?? null
  } catch {
    return false // not same-origin (should never happen when published together)
  }
  if (!doc?.documentElement || !doc.head) return false
  const root = doc.documentElement
  root.classList.add('bmc-embedded', `bmc-embedded-${tool}`)
  root.dataset.theme = theme
  root.style.colorScheme = theme
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = embedCss
    doc.head.appendChild(style)
  }
  return true
}

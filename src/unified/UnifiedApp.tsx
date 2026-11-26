import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { FileImage, Mail, Moon, Sun, Users } from 'lucide-react'
import { loadTheme, saveTheme } from '../lib/storage'
import type { AppTheme } from '../lib/storage'
import { themeFrame } from './frameTheme'
import { TOOLS, toolFromHash } from './tools'
import type { ToolId } from './tools'

// The live WhatsApp report app, unchanged, loaded only when its section opens.
const WhatsAppReport = lazy(() => import('../App'))

const ICONS: Record<ToolId, typeof FileImage> = { whatsapp: FileImage, email: Mail, survey: Users }

export function UnifiedApp() {
  const [tool, setTool] = useState<ToolId>(() => toolFromHash(window.location.hash))
  // Sections stay mounted after their first visit, so switching never loses an
  // uploaded file, a selection or an unsaved review.
  const [visited, setVisited] = useState<ToolId[]>(() => [toolFromHash(window.location.hash)])
  const [theme, setTheme] = useState<AppTheme>(() => loadTheme())
  const frames = useRef<Partial<Record<ToolId, HTMLIFrameElement | null>>>({})
  const [themed, setThemed] = useState<Partial<Record<ToolId, boolean>>>({})

  useEffect(() => {
    const onHash = () => setTool(toolFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    setVisited((list) => (list.includes(tool) ? list : [...list, tool]))
    const current = TOOLS.find((item) => item.id === tool)
    document.title = `${current?.label ?? 'Tools'} · BMC Ticket Tools`
  }, [tool])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { saveTheme(theme) } catch { /* storage blocked: the theme still applies for this visit */ }
    for (const item of TOOLS) themeFrame(frames.current[item.id], theme, item.id)
  }, [theme])

  const select = (id: ToolId) => {
    if (id === tool) return
    window.location.hash = `#/${id}`
  }

  const onFrameLoad = useCallback((id: ToolId) => {
    const ok = themeFrame(frames.current[id], theme, id)
    setThemed((state) => ({ ...state, [id]: ok || true }))
  }, [theme])

  return (
    <div className="unified-app" data-tool={tool}>
      <header className="tool-bar">
        <div className="tool-brand">
          <div className="brand-mark" aria-hidden="true">B</div>
          <div className="min-w-0">
            <div className="brand-title">BMC Ticket Tools</div>
            <div className="brand-subtitle">Unified preview</div>
          </div>
        </div>
        <nav className="tool-tabs" aria-label="Tools">
          {TOOLS.map(({ id, label, description }) => {
            const Icon = ICONS[id]
            return (
              <button key={id} type="button" className={id === tool ? 'tool-tab tool-tab-active' : 'tool-tab'} aria-current={id === tool ? 'page' : undefined} title={description} onClick={() => select(id)}>
                <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
        <div className="tool-bar-actions">
          <span className="tool-privacy"><span className="tool-privacy-dot" aria-hidden="true" />Files stay in this browser</span>
          <button className="theme-toggle" type="button" onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={16} strokeWidth={2.3} /> : <Moon size={16} strokeWidth={2.3} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <div className="tool-panes">
        {visited.includes('whatsapp') && (
          <section className="tool-pane tool-pane-native" hidden={tool !== 'whatsapp'} aria-label="WhatsApp Report">
            <Suspense fallback={<div className="tool-loading">Loading WhatsApp Report…</div>}>
              <WhatsAppReport theme={theme} onThemeChange={setTheme} />
            </Suspense>
          </section>
        )}
        {TOOLS.filter((item) => item.frameSrc && visited.includes(item.id)).map((item) => (
          <section key={item.id} className="tool-pane tool-pane-frame" hidden={tool !== item.id} aria-label={item.label}>
            <iframe
              ref={(element) => { frames.current[item.id] = element }}
              className={themed[item.id] ? 'tool-frame tool-frame-ready' : 'tool-frame'}
              title={item.label}
              src={item.frameSrc}
              allow="clipboard-read; clipboard-write"
              onLoad={() => onFrameLoad(item.id)}
            />
          </section>
        ))}
      </div>
    </div>
  )
}

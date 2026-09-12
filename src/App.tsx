import { useEffect, useMemo, useState } from 'react'
import { BarChart3, FileSearch, FileUp, Settings2, SlidersHorizontal, Table2, Users } from 'lucide-react'
import { UploadScreen } from './screens/UploadScreen'
import { ColumnMappingScreen } from './screens/ColumnMappingScreen'
import { TeamMappingScreen } from './screens/TeamMappingScreen'
import { RulesScreen } from './screens/RulesScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DetailScreen } from './screens/DetailScreen'
import { ConfigScreen } from './screens/ConfigScreen'
import { autoDetectColumns, parseWorkbookFile, readWorksheet, recommendWorksheet } from './lib/import'
import { buildValidation } from './lib/report'
import { normalizeRows, validateTeamMapping } from './lib/normalize'
import { defaultColumnMapping, defaultFilters } from './config/defaults'
import { loadColumnMapping, loadConfig, loadFeedback, saveColumnMapping, saveConfig, saveFeedback } from './lib/storage'
import { formatLocalDate, formatLocalTime, localDateKey } from './lib/clock'
import type { AppConfig, ColumnMapping, FeedbackValues, Filters, ParsedWorkbook, RawRow } from './types'

type Screen = 'upload' | 'columns' | 'teams' | 'rules' | 'dashboard' | 'details' | 'config'

type NavItem = { id: Screen; label: string; icon: typeof FileUp; needsData?: boolean }

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Import',
    items: [
      { id: 'upload', label: 'Upload Data', icon: FileUp },
      { id: 'columns', label: 'Column Mapping', icon: SlidersHorizontal, needsData: true },
      { id: 'teams', label: 'Engineer Selection', icon: Users, needsData: true },
      { id: 'rules', label: 'Status & Category Rules', icon: Settings2 },
    ],
  },
  {
    label: 'Report',
    items: [
      { id: 'dashboard', label: 'Report Dashboard', icon: BarChart3, needsData: true },
      { id: 'details', label: 'Detailed Ticket Data', icon: Table2, needsData: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'config', label: 'Config Export / Import', icon: FileSearch },
    ],
  },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('upload')
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null)
  const [selectedSheet, setSelectedSheet] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(() => loadColumnMapping())
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())
  const [feedback, setFeedback] = useState<FeedbackValues>(() => loadFeedback())
  const [filters, setFilters] = useState<Filters>(() => ({ ...defaultFilters, reportDate: localDateKey() }))
  const [demoLoaded, setDemoLoaded] = useState(false)
  const [now, setNow] = useState(new Date())

  const tickets = useMemo(() => normalizeRows(rows, columnMapping, config), [rows, columnMapping, config])
  const validation = useMemo(() => buildValidation(tickets), [tickets])
  const teamMappingErrors = useMemo(() => validateTeamMapping(config.teams), [config.teams])

  useEffect(() => { saveConfig(config) }, [config])
  useEffect(() => { saveFeedback(feedback) }, [feedback])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const openFile = async (file: File) => {
    setError('')
    try {
      const next = await parseWorkbookFile(file)
      setParsed(next)
      setFileName(next.fileName)
      setSelectedSheet(recommendWorksheet(next))
    } catch (err) {
      setParsed(null)
      setError(err instanceof Error ? err.message : 'The file could not be imported.')
    }
  }

  const selectWorksheet = (sheet = selectedSheet, goToMapping = true) => {
    if (!parsed || !sheet) return
    try {
      const imported = readWorksheet(parsed, sheet)
      if (imported.rows.length === 0) throw new Error('The selected worksheet contains no data rows.')
      setHeaders(imported.headers)
      setRows(imported.rows)
      const detected = autoDetectColumns(imported.headers, loadColumnMapping())
      setColumnMapping(detected)
      setError('')
      if (goToMapping) setScreen('columns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The worksheet could not be read.')
      setScreen('upload')
    }
  }

  const loadSample = async (directToDashboard = false) => {
    setError('')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-bmc-export.xlsx`)
      if (!response.ok) throw new Error('Bundled sample workbook could not be loaded.')
      const blob = await response.blob()
      const file = new File([blob], 'sample-bmc-export.xlsx', { type: blob.type })
      const next = await parseWorkbookFile(file)
      const sheet = next.sheetNames.includes('Tickets') ? 'Tickets' : recommendWorksheet(next)
      const imported = readWorksheet(next, sheet)
      const detected = autoDetectColumns(imported.headers, defaultColumnMapping)
      setParsed(next); setSelectedSheet(sheet); setFileName(next.fileName); setHeaders(imported.headers); setRows(imported.rows); setColumnMapping(detected)
      if (directToDashboard) setScreen('dashboard')
      else setScreen('columns')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sample data could not be loaded.')
      setScreen('upload')
    }
  }

  useEffect(() => {
    if (!demoLoaded && new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemoLoaded(true)
      void loadSample(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoLoaded])

  const saveMappingAndContinue = () => {
    saveColumnMapping(columnMapping)
    setScreen('teams')
  }

  const hasData = rows.length > 0
  const allColumnsMapped = hasData && Object.values(columnMapping).every((value) => Boolean(value))
  const teamNeedsAttention = hasData && (teamMappingErrors.length > 0 || validation.unclassifiedAssignees.length > 0)
  const rulesNeedAttention = hasData && (validation.unknownStatusCount > 0 || validation.unknownCategoryCount > 0)

  const importDotClass = (id: Screen) => {
    if (id === 'upload') return hasData ? 'nav-dot-done' : 'nav-dot-attn'
    if (id === 'columns') return allColumnsMapped ? 'nav-dot-done' : hasData ? 'nav-dot-attn' : ''
    if (id === 'teams') return teamNeedsAttention ? 'nav-dot-attn' : hasData ? 'nav-dot-done' : ''
    if (id === 'rules') return rulesNeedAttention ? 'nav-dot-attn' : hasData ? 'nav-dot-done' : ''
    return ''
  }

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)', color: 'var(--app-ink)' }}>
        <div className="mx-auto max-w-[1900px] px-6 py-4">
          <div className="text-xl font-bold">BMC Ticket Report Generator</div>
          <div className="text-xs" style={{ color: 'var(--app-ink-soft)' }}>Local browser processing • Daily engineer selection • Excel-style WhatsApp report export</div>
        </div>
      </header>

      <div className="status-strip">
        <div>
          <div className="status-label">Report date</div>
          <div className="status-value">{formatLocalDate(now)} • {formatLocalTime(now)}</div>
        </div>
        <div className="min-w-0 max-w-[620px]">
          <div className="status-label">Source</div>
          <div className="status-value truncate" title={fileName || 'No BMC file loaded'}>{fileName || 'No BMC file loaded'}</div>
        </div>
        <div>
          <div className="status-label">Rows</div>
          <div className="status-value">{hasData ? rows.length.toLocaleString() : '—'}</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1900px] grid-cols-[250px_minmax(0,1fr)] gap-0">
        <aside className="min-h-[calc(100vh-121px)] border-r p-3" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)' }}>
          <nav>
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                <div className="space-y-1">
                  {group.items.map(({ id, label, icon: Icon, needsData }) => {
                    const disabled = Boolean((needsData && !hasData) || ((id === 'dashboard' || id === 'details') && teamMappingErrors.length > 0))
                    const itemClass = ['nav-item', screen === id ? 'nav-item-active' : '', disabled ? 'nav-item-disabled' : ''].filter(Boolean).join(' ')
                    return (
                      <button key={id} disabled={disabled} onClick={() => setScreen(id)} className={itemClass}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {group.label === 'Import' && <span className={`nav-dot ${importDotClass(id)}`} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          {hasData && (
            <div className="panel mt-6 p-3 text-xs leading-5" style={{ color: 'var(--app-ink-soft)' }}>
              <strong style={{ color: 'var(--app-ink)' }}>Import status</strong><br />
              {rows.length.toLocaleString()} raw rows<br />
              {tickets.length.toLocaleString()} processed rows<br />
              {config.teams.EUC.length + config.teams.System.length + config.teams.Network.length} selected engineer alias(es)<br />
              {validation.unclassifiedAssignees.length} engineer value(s) outside the three teams
            </div>
          )}
        </aside>

        <main className="min-w-0 p-6">
          {screen === 'upload' && <UploadScreen parsed={parsed} selectedSheet={selectedSheet} error={error} onFile={(file) => void openFile(file)} onSheet={setSelectedSheet} onContinue={() => selectWorksheet()} onSample={() => void loadSample(false)} />}
          {screen === 'columns' && <ColumnMappingScreen headers={headers} rows={rows} mapping={columnMapping} onChange={setColumnMapping} onContinue={saveMappingAndContinue} />}
          {screen === 'teams' && <TeamMappingScreen config={config} tickets={tickets} onConfig={setConfig} onContinue={() => setScreen('rules')} />}
          {screen === 'rules' && <RulesScreen config={config} onConfig={setConfig} onContinue={() => setScreen(hasData ? 'dashboard' : 'upload')} />}
          {screen === 'dashboard' && <DashboardScreen tickets={tickets} filters={filters} onFilters={setFilters} feedback={feedback} onFeedback={setFeedback} validation={validation} fileName={fileName} teamMapping={config.teams} />}
          {screen === 'details' && <DetailScreen tickets={tickets} filters={filters} rawHeaders={headers} />}
          {screen === 'config' && <ConfigScreen config={config} columnMapping={columnMapping} feedback={feedback} onImport={(payload) => { if (payload.config) setConfig(payload.config); if (payload.columnMapping) { setColumnMapping(payload.columnMapping); saveColumnMapping(payload.columnMapping) } if (payload.feedback) setFeedback(payload.feedback) }} />}
        </main>
      </div>
    </div>
  )
}

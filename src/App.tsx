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

const nav: Array<{ id: Screen; label: string; icon: typeof FileUp; needsData?: boolean }> = [
  { id: 'upload', label: 'Upload Data', icon: FileUp },
  { id: 'columns', label: 'Column Mapping', icon: SlidersHorizontal, needsData: true },
  { id: 'teams', label: 'Engineer Selection', icon: Users, needsData: true },
  { id: 'rules', label: 'Status & Category Rules', icon: Settings2 },
  { id: 'dashboard', label: 'Report Dashboard', icon: BarChart3, needsData: true },
  { id: 'details', label: 'Detailed Ticket Data', icon: Table2, needsData: true },
  { id: 'config', label: 'Config Export / Import', icon: FileSearch },
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

  return (
    <div className="min-h-screen">
      <header className="brand-header">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between px-6 pb-4 pt-5">
          <div className="flex items-center gap-4">
            <span className="brand-slash" aria-hidden="true" />
            <div>
              <div className="text-xl font-bold tracking-tight text-gray-950">BMC Ticket Report Generator</div>
              <div className="text-xs text-gray-500">Local browser processing • Daily engineer selection • Excel-style WhatsApp report export</div>
            </div>
          </div>
          <div className="mr-12 flex items-center gap-8 text-right text-xs text-gray-500">
            <div><div className="font-semibold text-gray-800">{formatLocalDate(now)} • {formatLocalTime(now)}</div><div>Device clock determines today's report date</div></div>
            <div>{fileName ? <>Current source<br /><strong className="text-gray-800">{fileName}</strong></> : 'No BMC file loaded'}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1900px] grid-cols-[250px_minmax(0,1fr)] gap-0">
        <aside className="brand-sidebar min-h-[calc(100vh-73px)] border-r border-gray-200 p-3">
          <nav className="space-y-1">
            {nav.map(({ id, label, icon: Icon, needsData }) => {
              const disabled = Boolean((needsData && !hasData) || ((id === 'dashboard' || id === 'details') && teamMappingErrors.length > 0))
              return <button key={id} disabled={disabled} onClick={() => setScreen(id)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${screen === id ? 'brand-nav-active' : disabled ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-100'}`}><Icon className="h-4 w-4" />{label}</button>
            })}
          </nav>
          {hasData && <div className="brand-import-status mt-6 rounded-md p-3 text-xs leading-5 text-gray-600"><strong className="text-gray-900">Import status</strong><br />{rows.length.toLocaleString()} raw rows<br />{tickets.length.toLocaleString()} processed rows<br />{config.teams.EUC.length + config.teams.System.length + config.teams.Network.length} selected engineer alias(es)<br />{validation.unclassifiedAssignees.length} engineer value(s) outside the three teams</div>}
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

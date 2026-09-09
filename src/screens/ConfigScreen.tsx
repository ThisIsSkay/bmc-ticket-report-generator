import { Download, Upload } from 'lucide-react'
import type { AppConfig, ColumnMapping, FeedbackValues } from '../types'

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function ConfigScreen({
  config,
  columnMapping,
  feedback,
  onImport,
}: {
  config: AppConfig
  columnMapping: ColumnMapping
  feedback: FeedbackValues
  onImport: (payload: { config?: AppConfig; columnMapping?: ColumnMapping; feedback?: FeedbackValues }) => void
}) {
  const bundle = { version: 1, exportedAt: new Date().toISOString(), config, columnMapping, feedback }

  const importConfig = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as typeof bundle
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid configuration file.')
      onImport({ config: parsed.config, columnMapping: parsed.columnMapping, feedback: parsed.feedback })
      window.alert('Configuration imported.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Configuration import failed.')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div><h2 className="text-2xl font-bold">Configuration Export / Import</h2><p className="mt-1 text-sm text-gray-600">Back up engineer selections/aliases, status/category rules, saved column mappings, and feedback values.</p></div>
      <div className="grid grid-cols-2 gap-5">
        <section className="panel p-5">
          <h3 className="font-bold">Export all configuration</h3>
          <p className="mt-1 text-sm text-gray-600">Ticket rows are intentionally excluded.</p>
          <button className="btn-primary mt-4" onClick={() => downloadJson(bundle, 'bmc-ticket-report-config.json')}><Download className="h-4 w-4" /> Export configuration</button>
        </section>
        <section className="panel p-5">
          <h3 className="font-bold">Import configuration</h3>
          <p className="mt-1 text-sm text-gray-600">Imported settings immediately replace matching local settings.</p>
          <label className="btn-secondary mt-4 cursor-pointer"><Upload className="h-4 w-4" /> Choose JSON<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importConfig(file); e.currentTarget.value = '' }} /></label>
        </section>
      </div>
      <div className="panel p-5">
        <h3 className="mb-3 font-bold">Bundled starter files</h3>
        <div className="flex gap-3 text-sm"><a className="btn-secondary" href="default-team-mapping.json" download>Default team mapping JSON</a><a className="btn-secondary" href="default-rules.json" download>Default rules JSON</a><a className="btn-secondary" href="sample-bmc-export.xlsx" download>Sample BMC workbook</a></div>
      </div>
      <div className="panel overflow-hidden">
        <div className="border-b bg-gray-50 px-4 py-3 font-bold">Current configuration preview</div>
        <pre className="max-h-[48vh] overflow-auto p-4 text-xs">{JSON.stringify(bundle, null, 2)}</pre>
      </div>
    </div>
  )
}

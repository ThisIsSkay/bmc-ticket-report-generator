import { useState } from 'react'
import { FileSpreadsheet, LockKeyhole, Upload } from 'lucide-react'
import type { ParsedWorkbook } from '../types'

export function UploadScreen({
  parsed,
  selectedSheet,
  error,
  onFile,
  onSheet,
  onContinue,
  onSample,
}: {
  parsed: ParsedWorkbook | null
  selectedSheet: string
  error: string
  onFile: (file: File) => void
  onSheet: (sheet: string) => void
  onContinue: () => void
  onSample: () => void
}) {
  const [dragActive, setDragActive] = useState(false)

  const acceptDroppedFile = (file: File | undefined) => {
    if (!file) return
    onFile(file)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Upload Data</h2>
        <p className="mt-1 text-sm text-gray-600">Import the daily BMC export. The largest worksheet is recommended automatically, and all processing stays in this browser session.</p>
      </div>

      <div className="panel p-6">
        <label
          className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition ${dragActive ? 'border-red-600 bg-red-50' : 'border-gray-300 bg-gray-50 hover:border-gray-500'}`}
          onDragEnter={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'copy'
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setDragActive(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(false)
            acceptDroppedFile(event.dataTransfer.files?.[0])
          }}
        >
          <Upload className={`mb-3 h-9 w-9 ${dragActive ? 'text-red-600' : 'text-gray-500'}`} />
          <span className="text-base font-bold">{dragActive ? 'Drop BMC export here' : 'Choose or drop BMC export'}</span>
          <span className="mt-1 text-sm text-gray-500">.xlsx, .xls, or .csv</span>
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
              event.currentTarget.value = ''
            }}
          />
        </label>

        <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />or<div className="h-px flex-1 bg-gray-200" />
        </div>
        <button className="btn-secondary w-full" onClick={onSample}><FileSpreadsheet className="h-4 w-4" /> Load bundled sample workbook</button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}

      {parsed && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-green-700" />
            <div><div className="font-bold">{parsed.fileName}</div><div className="text-xs text-gray-500">{parsed.sheetNames.length} worksheet(s)</div></div>
          </div>
          <label className="label">Worksheet</label>
          <select className="field" value={selectedSheet} onChange={(e) => onSheet(e.target.value)}>
            {parsed.sheetNames.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
          </select>
          <button className="btn-primary mt-4" onClick={onContinue}>Continue to Column Mapping</button>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
        <div><strong className="text-gray-900">Local-only processing.</strong> Ticket rows are not uploaded to an application server or external API. Configuration is stored in browser local storage.</div>
      </div>
    </div>
  )
}

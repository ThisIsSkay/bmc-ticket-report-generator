import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { columnLabels, requiredColumnKeys } from '../config/defaults'
import type { ColumnKey, ColumnMapping, RawRow } from '../types'

export function ColumnMappingScreen({
  headers,
  rows,
  mapping,
  onChange,
  onContinue,
}: {
  headers: string[]
  rows: RawRow[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
  onContinue: () => void
}) {
  const missing = requiredColumnKeys.filter((key) => !mapping[key])
  const preview = rows.slice(0, 5)
  const keys = Object.keys(mapping) as ColumnKey[]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Column Mapping</h2>
        <p className="mt-1 text-sm text-gray-600">Map the BMC export columns once. Matching saved columns are reused on future imports.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {keys.map((key) => {
          const required = requiredColumnKeys.includes(key as (typeof requiredColumnKeys)[number])
          return (
            <div className="panel p-4" key={key}>
              <label className="label">{columnLabels[key]} {required && <span className="text-red-600">*</span>}</label>
              <select className="field" value={mapping[key]} onChange={(e) => onChange({ ...mapping, [key]: e.target.value })}>
                <option value="">Not mapped</option>
                {headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </div>
          )
        })}
      </div>

      {missing.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Required mappings missing: {missing.map((key) => columnLabels[key]).join(', ')}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800"><CheckCircle2 className="h-4 w-4" /> Required columns are mapped.</div>
      )}

      <div className="panel overflow-hidden">
        <div className="border-b bg-gray-50 px-4 py-3 font-bold">Imported row preview <span className="text-sm font-normal text-gray-500">({rows.length.toLocaleString()} rows total)</span></div>
        <div className="max-h-80 overflow-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-gray-900 text-white"><tr>{headers.map((header) => <th className="whitespace-nowrap border border-gray-700 px-3 py-2 text-left" key={header}>{header}</th>)}</tr></thead>
            <tbody>{preview.map((row, index) => <tr key={index}>{headers.map((header) => <td className="max-w-72 truncate border border-gray-200 px-3 py-2" key={header} title={String(row[header] ?? '')}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>

      <button className="btn-primary" disabled={missing.length > 0 || rows.length === 0} onClick={onContinue}>Save Mapping &amp; Continue</button>
    </div>
  )
}

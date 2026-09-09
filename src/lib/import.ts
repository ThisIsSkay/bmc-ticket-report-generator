import * as XLSX from 'xlsx'
import { columnSynonyms, defaultColumnMapping } from '../config/defaults'
import type { ColumnMapping, ParsedWorkbook, RawRow } from '../types'
import { normalizeText } from './normalize'

export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) throw new Error('Please choose an .xlsx, .xls, or .csv file.')
  const data = await file.arrayBuffer()
  if (data.byteLength === 0) throw new Error('The selected file is empty.')
  try {
    const workbook = XLSX.read(data, { type: 'array', cellDates: true, dense: true })
    if (!workbook.SheetNames.length) throw new Error('No worksheets were found.')
    return { fileName: file.name, workbook, sheetNames: workbook.SheetNames }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    throw new Error(`The workbook could not be read: ${message}`)
  }
}

export function recommendWorksheet(parsed: ParsedWorkbook): string {
  let best = parsed.sheetNames[0] ?? ''
  let bestScore = -1
  for (const name of parsed.sheetNames) {
    const sheet = parsed.workbook.Sheets[name]
    if (!sheet?.['!ref']) continue
    try {
      const range = XLSX.utils.decode_range(sheet['!ref'])
      const rowCount = Math.max(0, range.e.r - range.s.r)
      const colCount = Math.max(1, range.e.c - range.s.c + 1)
      const firstRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1, defval: '', raw: true,
        range: { s: { r: range.s.r, c: range.s.c }, e: { r: range.s.r, c: range.e.c } },
      })
      const header = (firstRows[0] ?? []).filter((value) => String(value ?? '').trim()).length
      const score = rowCount * 1000 + header * 10 + colCount
      if (score > bestScore) {
        bestScore = score
        best = name
      }
    } catch {
      // Keep the current best worksheet if one sheet has malformed range metadata.
    }
  }
  return best
}

export function readWorksheet(parsed: ParsedWorkbook, sheetName: string): { headers: string[]; rows: RawRow[] } {
  const sheet = parsed.workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Worksheet “${sheetName}” was not found.`)
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
  if (!matrix.length) return { headers: [], rows: [] }

  const used = new Map<string, number>()
  const headers = (matrix[0] ?? []).map((value, index) => {
    const base = String(value ?? '').trim() || `Column ${index + 1}`
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })

  const rows: RawRow[] = matrix.slice(1)
    .filter((values) => values.some((value) => String(value ?? '').trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
  return { headers, rows }
}

export function autoDetectColumns(headers: string[], saved?: ColumnMapping): ColumnMapping {
  const result: ColumnMapping = { ...defaultColumnMapping }
  const normalizedHeaders = headers.map((header) => ({ raw: header, normalized: normalizeText(header) }))

  for (const key of Object.keys(result) as (keyof ColumnMapping)[]) {
    if (saved?.[key] && headers.includes(saved[key])) {
      result[key] = saved[key]
      continue
    }
    const synonyms = columnSynonyms[key].map(normalizeText)
    const exact = synonyms.map((synonym) => normalizedHeaders.find((header) => header.normalized === synonym)).find(Boolean)
    const contains = synonyms.map((synonym) => normalizedHeaders.find((header) => header.normalized.includes(synonym))).find(Boolean)
    result[key] = exact?.raw ?? contains?.raw ?? ''
  }
  return result
}

export function mappingFingerprint(headers: string[]): string {
  return headers.map(normalizeText).sort().join('|')
}

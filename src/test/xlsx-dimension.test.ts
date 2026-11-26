// RD-03: a populated worksheet whose <dimension> claims "A1", next to three
// empty worksheets, through the app's own upload path. Fictional fixture.
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { dimensionFixtures, worksheetDimension, EXPECTED, HEADERS, POPULATED_SHEET, REPORT_DATE, SHEET_NAMES } from '../../scripts/fixtures/dimension-a1.mjs'
import { defaultConfig, defaultFilters } from '../config/defaults'
import { localDateKey } from '../lib/clock'
import { autoDetectColumns, parseWorkbookFile, readWorksheet, recommendWorksheet } from '../lib/import'
import { normalizeRows } from '../lib/normalize'
import { aggregateTickets, filterTickets } from '../lib/report'
import type { AppConfig } from '../types'

const { wellFormed, malformed } = dimensionFixtures(XLSX)
const config: AppConfig = { ...defaultConfig, teams: { EUC: ['Alex Example', 'Jamie Example'], System: [], Network: [] } }

// App.tsx openFile → importWorksheet, without the UI.
async function upload(bytes: Uint8Array<ArrayBuffer>) {
  const parsed = await parseWorkbookFile(new File([bytes], 'fictional-bmc-export.xlsx'))
  const sheet = recommendWorksheet(parsed)
  const { headers, rows } = readWorksheet(parsed, sheet)
  const tickets = normalizeRows(rows, autoDetectColumns(headers), config)
  const filtered = filterTickets(tickets, { ...defaultFilters, reportDate: REPORT_DATE }, { protectResolvedOnReportDate: true })
  return { parsed, sheet, headers, rows, tickets, metrics: aggregateTickets(filtered, REPORT_DATE) }
}

describe('worksheet whose dimension says A1 (RD-03)', () => {
  it('is malformed only in the populated sheet', () => {
    expect(worksheetDimension(XLSX, malformed)).toBe('A1')
    expect(worksheetDimension(XLSX, wellFormed)).toBe('A1:M13')
  })

  it('recommends the populated fourth sheet and reads every row and column', async () => {
    const result = await upload(malformed)
    expect(result.parsed.sheetNames).toEqual(SHEET_NAMES)
    expect(result.sheet).toBe(POPULATED_SHEET)
    expect(result.headers).toEqual(HEADERS)
    expect(result.rows).toHaveLength(EXPECTED.dataRows)
    expect(result.tickets.map((ticket) => ticket.id)).toEqual(EXPECTED.ticketIds)
  })

  it('keeps dates and report totals, identical to the well-formed workbook', async () => {
    const bad = await upload(malformed)
    const good = await upload(wellFormed)
    expect(bad.rows[0]['Submit Date']).toBeInstanceOf(Date)
    expect(localDateKey(bad.tickets[0].createdDate!)).toBe(REPORT_DATE)
    expect(bad.metrics.newTickets.EUC).toBe(EXPECTED.whatsappNewEuc)
    expect(bad.metrics.totalUniqueTickets).toBe(EXPECTED.dataRows)
    expect(bad.rows).toEqual(good.rows)
    expect(bad.metrics).toEqual(good.metrics)
  })
})

// Types for the RD-03 fixture module, for the WhatsApp app's TypeScript tests.
type SheetJS = typeof import('xlsx')
export const SHEET_NAMES: string[]
export const POPULATED_SHEET: string
export const REPORT_DATE: string
export const HEADERS: string[]
export const ROWS: (string | number)[][]
export const EXPECTED: {
  dataRows: number
  columns: number
  ticketIds: string[]
  firstSubmit: string
  email: { created: number; closed: number; pending: number }
  whatsappNewEuc: number
}
export function serial(date: string, time?: string): number
export function buildWorkbook(XLSX: SheetJS): Uint8Array<ArrayBuffer>
export function worksheetDimension(XLSX: SheetJS, bytes: Uint8Array<ArrayBuffer>, index?: number): string | null
export function withDimension(XLSX: SheetJS, bytes: Uint8Array<ArrayBuffer>, ref?: string, index?: number): Uint8Array<ArrayBuffer>
export function dimensionFixtures(XLSX: SheetJS): { wellFormed: Uint8Array<ArrayBuffer>; malformed: Uint8Array<ArrayBuffer> }

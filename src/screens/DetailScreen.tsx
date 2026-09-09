import { useMemo, useState } from 'react'
import type { Filters, RawRow, Ticket } from '../types'
import { filterTickets } from '../lib/report'

const PAGE_SIZE = 50

export function DetailScreen({ tickets, filters, rawHeaders }: { tickets: Ticket[]; filters: Filters; rawHeaders: string[] }) {
  const filtered = useMemo(() => filterTickets(tickets, filters, { protectResolvedOnReportDate: true }), [tickets, filters])
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div><h2 className="text-2xl font-bold">Detailed Ticket Data</h2><p className="mt-1 text-sm text-gray-600">Every imported row is preserved here, including duplicates. Derived classification fields are shown before the original columns.</p></div>
      <div className="flex items-center justify-between text-sm"><div>{filtered.length.toLocaleString()} row(s) match the current dashboard filters.</div><div className="flex items-center gap-2"><button className="btn-secondary py-1" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button><span>Page {safePage + 1} / {pages}</span><button className="btn-secondary py-1" disabled={safePage >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Next</button></div></div>
      <div className="panel max-h-[72vh] overflow-auto">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-gray-900 text-white"><tr>{['Row','Duplicate','Team','Report Status','Category','Ticket ID','Assigned To','Created','Closed', ...rawHeaders].map((header) => <th key={header} className="whitespace-nowrap border border-gray-700 px-3 py-2 text-left">{header}</th>)}</tr></thead>
          <tbody>{shown.map((ticket) => <tr key={`${ticket.sourceIndex}-${ticket.id}`} className={ticket.duplicateId ? 'bg-amber-50' : 'bg-white'}>
            <td className="border px-3 py-2">{ticket.sourceIndex + 2}</td><td className="border px-3 py-2 font-bold">{ticket.duplicateId ? 'Yes' : 'No'}</td><td className="border px-3 py-2">{ticket.team}</td><td className="border px-3 py-2">{ticket.reportStatus}</td><td className="border px-3 py-2">{ticket.category}</td><td className="border px-3 py-2 font-semibold">{ticket.id}</td><td className="border px-3 py-2">{ticket.assignedTo || '(blank)'}</td><td className="border px-3 py-2">{ticket.createdDate?.toLocaleString() ?? 'Invalid / blank'}</td><td className="border px-3 py-2">{ticket.closedDate?.toLocaleString() ?? ''}</td>
            {rawHeaders.map((header) => <td key={header} className="max-w-72 truncate border px-3 py-2" title={String((ticket.raw as RawRow)[header] ?? '')}>{String((ticket.raw as RawRow)[header] ?? '')}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

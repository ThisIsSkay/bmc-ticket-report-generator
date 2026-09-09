import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RefObject } from 'react'
import type { FeedbackValues, Filters, ReportMetrics, Team, TeamMapping, TeamSummary } from '../types'
import { filterDescription, TEAMS } from '../lib/report'
import { formatDateKey, formatLocalTime } from '../lib/clock'

const COLORS: Record<Team, string> = {
  EUC: '#49A62B',
  System: '#0F6680',
  Network: '#A82B9E',
}

function BarValueLabel(props: any) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const value = Number(props.value ?? 0)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const hasBar = value > 0
  return (
    <text
      x={x + width / 2}
      y={hasBar ? y + 18 : y - 6}
      textAnchor="middle"
      fill={hasBar ? '#ffffff' : '#666666'}
      fontSize={13}
      fontWeight={700}
    >
      {value}
    </text>
  )
}

function TeamSummaryTable({ team, summary }: { team: Team; summary: TeamSummary }) {
  return (
    <section className="excel-summary-box">
      <div className="excel-summary-team">{team}</div>
      <div className="excel-summary-headings"><div>On/Offboarding, Schedule</div><div>On-hold Incidents</div></div>
      <div className="excel-summary-body">
        <div>
          <div>Total : {summary.totalTickets} tickets</div>
          <div>{summary.scheduleRequests} - schedule request</div>
          <div>{summary.onboarding} - Onboarding</div>
          <div>{summary.offboarding} - Offboarding</div>
        </div>
        <div>
          <div>Total : {summary.incidentTotal} tickets</div>
          <div>{summary.pendingIncidents} - Pending</div>
          <div>{summary.workInProgressIncidents} - work in progress</div>
          <div>{summary.waitingUserReplyIncidents} - waiting user reply</div>
        </div>
      </div>
    </section>
  )
}

function EngineerLine({ teamMapping }: { teamMapping: TeamMapping }) {
  return (
    <div className="truncate text-[11px] text-gray-600">
      {TEAMS.map((team) => `${team}: ${teamMapping[team].length ? teamMapping[team].join(', ') : 'none'}`).join('   •   ')}
    </div>
  )
}

export function ReportCanvas({
  metrics,
  filters,
  feedback,
  generatedAt,
  fileName,
  reportDate,
  teamMapping,
  reportRef,
}: {
  metrics: ReportMetrics
  filters: Filters
  feedback: FeedbackValues
  generatedAt: Date
  fileName: string
  reportDate: string
  teamMapping: TeamMapping
  reportRef: RefObject<HTMLDivElement | null>
}) {
  const newData = TEAMS.map((team) => ({ team, value: metrics.newTickets[team], color: COLORS[team] }))
  const pendingData = TEAMS.flatMap((team) => [
    { team, metric: 'On/Off-Boarding, Schedule', short: 'On/Off-Boarding...', value: metrics.pendingClosed[team].scheduledOnOffBoarding, color: COLORS[team] },
    { team, metric: 'Pending', short: 'Pending', value: metrics.pendingClosed[team].pending, color: COLORS[team] },
    { team, metric: 'Closed', short: 'Closed', value: metrics.pendingClosed[team].closed, color: COLORS[team] },
  ])

  return (
    <div ref={reportRef} id="report-canvas" className="report-canvas">
      <header className="report-image-header">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3"><h1>BMC Ticket Report</h1><span>Report date: {formatDateKey(reportDate)}</span></div>
          <EngineerLine teamMapping={teamMapping} />
        </div>
        <div className="shrink-0 text-right text-[11px] leading-4 text-gray-600">
          <div>Generated {formatLocalTime(generatedAt)} • {filterDescription(filters)}</div>
          <div>{fileName || 'Imported BMC data'} • {metrics.totalUniqueTickets} selected unique tickets</div>
        </div>
      </header>

      <div className="report-image-grid">
        <div className="report-left-column">
          <section className="excel-chart-panel">
            <h2>New Tickets</h2>
            <div className="excel-chart-area">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={newData} margin={{ top: 28, right: 35, left: 35, bottom: 14 }} barCategoryGap="42%">
                  <XAxis dataKey="team" tick={{ fontSize: 12, fill: '#555' }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  {/* minPointSize keeps zero-value bars measurable so their “0” data label stays visible */}
                  <Bar dataKey="value" maxBarSize={145} minPointSize={3} isAnimationActive={false}>
                    {newData.map((entry) => <Cell key={entry.team} fill={entry.color} />)}
                    <LabelList dataKey="value" content={<BarValueLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="excel-chart-panel">
            <h2>Pending &amp; Closed Tickets</h2>
            <div className="excel-chart-area pending-chart-area">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pendingData} margin={{ top: 25, right: 24, left: 24, bottom: 70 }} barCategoryGap="18%">
                  <XAxis dataKey="short" interval={0} tick={{ fontSize: 10.5, fill: '#555' }} angle={-43} textAnchor="end" height={82} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  <Bar dataKey="value" maxBarSize={66} minPointSize={3} isAnimationActive={false}>
                    {pendingData.map((entry, index) => <Cell key={`${entry.team}-${entry.metric}-${index}`} fill={entry.color} />)}
                    <LabelList dataKey="value" content={<BarValueLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="report-right-column">
          <div className="report-summary-stack">
            {TEAMS.map((team) => <TeamSummaryTable key={team} team={team} summary={metrics.summaries[team]} />)}
          </div>

          <div className="report-input-zone">
            <div className="input-left-stack">
              <div>
                <div className="excel-input-title">New Tickets input</div>
                <table className="excel-input-table">
                  <thead><tr>{TEAMS.map((team) => <th key={team}>{team}</th>)}</tr></thead>
                  <tbody><tr>{TEAMS.map((team) => <td key={team}>{metrics.newTickets[team]}</td>)}</tr></tbody>
                </table>
              </div>

              <div>
                <div className="excel-input-title">Feedback Form</div>
                <table className="excel-feedback-table"><tbody>{TEAMS.map((team) => <tr key={team}><td>{team}</td><td>{feedback[team]}</td></tr>)}</tbody></table>
              </div>
            </div>

            <div className="input-wide-block">
              <div className="excel-input-title">Pending and Closed tickets input</div>
              <table className="excel-pending-table">
                <thead>
                  <tr>{TEAMS.map((team) => <th key={team} colSpan={3}>{team}</th>)}</tr>
                  <tr>{TEAMS.flatMap((team) => [<th key={`${team}-a`}>On/Off-Boarding...</th>, <th key={`${team}-p`}>Pending</th>, <th key={`${team}-c`}>Closed</th>])}</tr>
                </thead>
                <tbody>
                  <tr>{TEAMS.flatMap((team) => [
                    <td key={`${team}-av`}>{metrics.pendingClosed[team].scheduledOnOffBoarding}</td>,
                    <td key={`${team}-pv`}>{metrics.pendingClosed[team].pending}</td>,
                    <td key={`${team}-cv`}>{metrics.pendingClosed[team].closed}</td>,
                  ])}</tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

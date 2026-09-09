import { Download, Sparkles, Trash2, Upload, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppConfig, Team, TeamMapping, Ticket } from '../types'
import { TEAMS } from '../types'
import { inferTeamMappingFromTickets, normalizeText, validateTeamMapping } from '../lib/normalize'

function linesToAliases(text: string): string[] {
  return [...new Set(text.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean))]
}

function downloadText(text: string, fileName: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function TeamMappingScreen({
  config,
  tickets,
  onConfig,
  onContinue,
}: {
  config: AppConfig
  tickets: Ticket[]
  onConfig: (config: AppConfig) => void
  onContinue: () => void
}) {
  const [search, setSearch] = useState('')
  const duplicates = validateTeamMapping(config.teams)
  const suggestions = useMemo(() => inferTeamMappingFromTickets(tickets, 90), [tickets])
  const importedEngineers = useMemo(
    () => [...new Set(tickets.map((t) => t.assignedTo).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [tickets],
  )
  const selectedKeys = useMemo(
    () => new Set(TEAMS.flatMap((team) => config.teams[team]).map(normalizeText)),
    [config.teams],
  )
  // Each unselected engineer with the Assigned Groups they actually work in,
  // so the shared-BMC teams are recognizable before deciding who is in scope.
  const unclassified = useMemo(() => {
    const byEngineer = new Map<string, { name: string; total: number; groups: Map<string, number> }>()
    for (const ticket of tickets) {
      if (ticket.team !== 'Review / Unassigned') continue
      const name = ticket.assignedTo || '(blank)'
      const entry = byEngineer.get(name) ?? { name, total: 0, groups: new Map<string, number>() }
      entry.total += 1
      const group = ticket.supportGroup || '(blank)'
      entry.groups.set(group, (entry.groups.get(group) ?? 0) + 1)
      byEngineer.set(name, entry)
    }
    return [...byEngineer.values()]
      .map((entry) => ({
        name: entry.name,
        total: entry.total,
        groups: [...entry.groups.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([group, count]) => `${group} (${count})`)
          .join(', '),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [tickets])

  const setTeam = (team: Team, aliases: string[]) => onConfig({ ...config, teams: { ...config.teams, [team]: aliases } })

  const assign = (assignee: string, team: Team) => {
    if (!assignee || assignee === '(blank)') return
    const key = normalizeText(assignee)
    const cleaned: TeamMapping = {
      EUC: config.teams.EUC.filter((v) => normalizeText(v) !== key),
      System: config.teams.System.filter((v) => normalizeText(v) !== key),
      Network: config.teams.Network.filter((v) => normalizeText(v) !== key),
    }
    if (!cleaned[team].some((v) => normalizeText(v) === key)) cleaned[team] = [...cleaned[team], assignee].sort((a, b) => a.localeCompare(b))
    onConfig({ ...config, teams: cleaned })
  }

  const remove = (assignee: string, team: Team) => {
    const key = normalizeText(assignee)
    setTeam(team, config.teams[team].filter((v) => normalizeText(v) !== key))
  }

  const useSuggestions = () => onConfig({ ...config, teams: suggestions })
  const clearAll = () => onConfig({ ...config, teams: { EUC: [], System: [], Network: [] } })

  const exportJson = () => downloadText(JSON.stringify(config.teams, null, 2), 'bmc-team-mapping.json', 'application/json')
  const exportCsv = () => {
    const csv = ['team,alias', ...TEAMS.flatMap((team) => config.teams[team].map((alias) => `${team},"${alias.replaceAll('"', '""')}"`))].join('\n')
    downloadText(csv, 'bmc-team-mapping.csv', 'text/csv')
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text) as TeamMapping
        onConfig({ ...config, teams: { EUC: parsed.EUC ?? [], System: parsed.System ?? [], Network: parsed.Network ?? [] } })
      } else {
        const next: TeamMapping = { EUC: [], System: [], Network: [] }
        text.split(/\r?\n/).slice(1).forEach((line) => {
          const match = line.match(/^([^,]+),(?:"(.*)"|(.*))$/)
          if (!match) return
          const team = match[1].trim() as Team
          const alias = (match[2] ?? match[3] ?? '').replaceAll('""', '"').trim()
          if (TEAMS.includes(team) && alias) next[team].push(alias)
        })
        onConfig({ ...config, teams: next })
      }
    } catch (error) {
      window.alert(`Could not import mapping: ${error instanceof Error ? error.message : 'Invalid file'}`)
    }
  }

  const availableFor = (team: Team) => {
    const needle = normalizeText(search)
    const suggested = suggestions[team].filter((name) => !selectedKeys.has(normalizeText(name)))
    const suggestedKeys = new Set(suggested.map(normalizeText))
    const all = importedEngineers.filter((name) => !selectedKeys.has(normalizeText(name)) && !suggestedKeys.has(normalizeText(name)))
    const matches = (name: string) => !needle || normalizeText(name).includes(needle)
    return { suggested: suggested.filter(matches), all: all.filter(matches) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Engineer Selection</h2>
          <p className="mt-1 max-w-4xl text-sm text-gray-600">
            Choose which <strong>Assigned Engineer</strong> belongs to EUC, System, and Network for the report. The imported BMC <strong>Assigned Group</strong> is used only to suggest engineers; your selections control the final team classification and are remembered for the next daily export.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary" onClick={useSuggestions}><Sparkles className="h-4 w-4" /> Use BMC suggestions</button>
          <button className="btn-secondary" onClick={clearAll}><Trash2 className="h-4 w-4" /> Clear</button>
          <button className="btn-secondary" onClick={exportJson}><Download className="h-4 w-4" /> JSON</button>
          <button className="btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</button>
          <label className="btn-secondary cursor-pointer"><Upload className="h-4 w-4" /> Import<input type="file" className="hidden" accept=".json,.csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.currentTarget.value = '' }} /></label>
        </div>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>{importedEngineers.length} engineer name(s)</strong> were found in the uploaded worksheet. Suggestions use the engineer's dominant EUC/System/Network Assigned Group within the latest 90 days present in the file.
      </div>

      <div className="panel p-4">
        <label className="label">Find engineer</label>
        <input className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type part of an engineer name…" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {TEAMS.map((team) => {
          const choices = availableFor(team)
          return (
            <section className="panel overflow-hidden" key={team}>
              <div className="border-b bg-gray-950 px-4 py-3 text-white">
                <div className="flex items-center justify-between"><h3 className="text-base font-bold">{team}</h3><span className="rounded bg-white/15 px-2 py-0.5 text-xs">{config.teams[team].length} selected</span></div>
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <label className="label">Add engineer</label>
                  <select className="field" value="" onChange={(e) => { if (e.target.value) assign(e.target.value, team) }}>
                    <option value="">Select an engineer…</option>
                    {choices.suggested.length > 0 && <optgroup label={`Suggested for ${team}`}>{choices.suggested.map((name) => <option key={`s-${name}`} value={name}>{name}</option>)}</optgroup>}
                    {choices.all.length > 0 && <optgroup label="Other imported engineers">{choices.all.map((name) => <option key={`a-${name}`} value={name}>{name}</option>)}</optgroup>}
                  </select>
                </div>

                <div className="min-h-28 rounded-md border border-gray-200 bg-gray-50 p-2">
                  {config.teams[team].length === 0 ? <div className="p-2 text-xs text-gray-500">No engineer selected.</div> : (
                    <div className="flex flex-wrap gap-2">
                      {config.teams[team].map((name) => (
                        <span key={name} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white py-1 pl-2.5 pr-1 text-xs font-semibold">
                          {name}<button type="button" aria-label={`Remove ${name}`} className="rounded-full p-0.5 hover:bg-gray-100" onClick={() => remove(name, team)}><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500">Suggested from BMC: {suggestions[team].length ? suggestions[team].join(', ') : 'none detected'}</div>
              </div>
            </section>
          )
        })}
      </div>

      {duplicates.length > 0 && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">Validation error: these engineer aliases appear in multiple team lists: {duplicates.join(', ')}</div>}

      <div className="panel overflow-hidden">
        <div className="border-b bg-gray-50 px-4 py-3"><div className="font-bold">Review / Unassigned engineers (out of report scope)</div><div className="text-xs text-gray-500">BMC is shared with teams this report does not cover. Any imported engineer not selected above stays out of every EUC/System/Network total. Blank engineer values are never auto-assigned from their Assigned Group.</div></div>
        {unclassified.length === 0 ? <div className="p-4 text-sm text-green-700">All non-blank imported engineers are assigned to a report team.</div> : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse text-sm"><tbody>
              {unclassified.map((entry) => <tr key={entry.name} className="border-b last:border-0">
                <td className="px-4 py-3"><div className="font-semibold">{entry.name}</div><div className="text-xs text-gray-500">{entry.total.toLocaleString()} ticket(s) • {entry.groups}</div></td>
                <td className="px-4 py-2 text-right">{TEAMS.map((team) => <button key={team} className="btn-secondary ml-2 py-1" disabled={entry.name === '(blank)'} onClick={() => assign(entry.name, team)}><UserPlus className="h-3.5 w-3.5" /> {team}</button>)}</td>
              </tr>)}
            </tbody></table>
          </div>
        )}
      </div>

      <details className="panel p-4">
        <summary className="cursor-pointer font-bold">Advanced: edit aliases / spelling variations</summary>
        <p className="mt-2 text-xs text-gray-500">One name or alias per line. Matching ignores case and leading/trailing spaces.</p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {TEAMS.map((team) => <div key={team}><label className="label">{team} aliases</label><textarea className="field h-44 resize-y font-mono text-xs" value={config.teams[team].join('\n')} onChange={(e) => setTeam(team, linesToAliases(e.target.value))} /></div>)}
        </div>
      </details>

      <button className="btn-primary" disabled={duplicates.length > 0} onClick={onContinue}>Save Engineer Selection &amp; Continue</button>
    </div>
  )
}

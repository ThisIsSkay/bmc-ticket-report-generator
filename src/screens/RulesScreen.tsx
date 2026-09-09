import type { AppConfig, ReportStatus, TicketCategory } from '../types'

const statusOrder: Exclude<ReportStatus, 'Other'>[] = ['New', 'Pending', 'Closed', 'Work in Progress', 'Waiting User Reply', 'On Hold']
const categoryOrder: Exclude<TicketCategory, 'Other'>[] = ['Onboarding', 'Offboarding', 'Schedule', 'Incident']

const splitRules = (value: string) => [...new Set(value.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean))]

export function RulesScreen({ config, onConfig, onContinue }: { config: AppConfig; onConfig: (config: AppConfig) => void; onContinue: () => void }) {
  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">Status and Category Rules</h2><p className="mt-1 text-sm text-gray-600">Source statuses use exact normalized matching. Category keywords use normalized substring matching against ticket type/category plus summary.</p></div>

      <section>
        <h3 className="mb-3 text-lg font-bold">Status normalization</h3>
        <div className="grid grid-cols-3 gap-4">
          {statusOrder.map((status) => <div className="panel p-4" key={status}><label className="label">{status}</label><textarea className="field h-28 font-mono text-xs" value={config.statuses[status].join('\n')} onChange={(e) => onConfig({ ...config, statuses: { ...config.statuses, [status]: splitRules(e.target.value) } })} /></div>)}
        </div>
        <div className="mt-2 text-xs text-gray-500">Any source status not listed above becomes <strong>Other</strong>.</div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-bold">Ticket category keywords</h3>
        <div className="grid grid-cols-2 gap-4">
          {categoryOrder.map((category) => <div className="panel p-4" key={category}><label className="label">{category}</label><textarea className="field h-28 font-mono text-xs" value={config.categories[category].join('\n')} onChange={(e) => onConfig({ ...config, categories: { ...config.categories, [category]: splitRules(e.target.value) } })} /></div>)}
        </div>
        <div className="mt-2 text-xs text-gray-500">Priority when multiple keywords match: Onboarding → Offboarding → Schedule → Incident. Unmatched tickets become <strong>Other</strong>.</div>
      </section>

      <button className="btn-primary" onClick={onContinue}>Save Rules &amp; Open Dashboard</button>
    </div>
  )
}

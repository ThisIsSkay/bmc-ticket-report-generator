import { defaultColumnMapping, defaultConfig, defaultFeedback } from '../config/defaults'
import type { AppConfig, ColumnMapping, FeedbackValues } from '../types'

const KEYS = {
  config: 'bmc-report:config:v2',
  legacyConfig: 'bmc-report:config:v1',
  columns: 'bmc-report:column-mapping:v2',
  legacyColumns: 'bmc-report:column-mapping:v1',
  feedback: 'bmc-report:feedback:v1',
}

function readUnknown(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const strings = (value: unknown, fallback: string[] = []): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback

function isOldPlaceholderTeams(teams: Partial<AppConfig['teams']> | undefined): boolean {
  const all = [...(teams?.EUC ?? []), ...(teams?.System ?? []), ...(teams?.Network ?? [])].map((v) => String(v))
  if (all.length !== 6) return false
  const expected = new Set(['EUC Analyst', 'EUC Engineer', 'Systems Analyst', 'Systems Engineer', 'Network Analyst', 'Network Engineer'])
  return all.every((name) => expected.has(name))
}

export function loadConfig(): AppConfig {
  const raw = (readUnknown(KEYS.config) ?? readUnknown(KEYS.legacyConfig)) as Partial<AppConfig> | null
  if (!raw) return defaultConfig
  const resetPlaceholder = isOldPlaceholderTeams(raw.teams)
  return {
    teams: resetPlaceholder ? { EUC: [], System: [], Network: [] } : {
      EUC: strings(raw.teams?.EUC, defaultConfig.teams.EUC),
      System: strings(raw.teams?.System, defaultConfig.teams.System),
      Network: strings(raw.teams?.Network, defaultConfig.teams.Network),
    },
    statuses: {
      New: strings(raw.statuses?.New, defaultConfig.statuses.New),
      Pending: strings(raw.statuses?.Pending, defaultConfig.statuses.Pending),
      // Configs saved before Cancelled existed listed cancelled/canceled under
      // Closed; strip them so cancellations stop counting as Closed throughput.
      Closed: strings(raw.statuses?.Closed, defaultConfig.statuses.Closed)
        .filter((alias) => !['cancelled', 'canceled'].includes(alias.trim().toLowerCase())),
      'Work in Progress': strings(raw.statuses?.['Work in Progress'], defaultConfig.statuses['Work in Progress']),
      'Waiting User Reply': strings(raw.statuses?.['Waiting User Reply'], defaultConfig.statuses['Waiting User Reply']),
      'On Hold': strings(raw.statuses?.['On Hold'], defaultConfig.statuses['On Hold']),
      Cancelled: strings(raw.statuses?.Cancelled, defaultConfig.statuses.Cancelled),
      Other: strings(raw.statuses?.Other, []),
    },
    categories: {
      Onboarding: strings(raw.categories?.Onboarding, defaultConfig.categories.Onboarding),
      Offboarding: strings(raw.categories?.Offboarding, defaultConfig.categories.Offboarding),
      Schedule: strings(raw.categories?.Schedule, defaultConfig.categories.Schedule),
      Incident: strings(raw.categories?.Incident, defaultConfig.categories.Incident),
    },
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(KEYS.config, JSON.stringify(config))
}

export function loadColumnMapping(): ColumnMapping {
  const raw = (readUnknown(KEYS.columns) ?? readUnknown(KEYS.legacyColumns)) as Partial<ColumnMapping> | null
  return { ...defaultColumnMapping, ...(raw ?? {}) }
}

export function saveColumnMapping(mapping: ColumnMapping): void {
  localStorage.setItem(KEYS.columns, JSON.stringify(mapping))
}

export function loadFeedback(): FeedbackValues {
  const raw = readUnknown(KEYS.feedback) as Partial<FeedbackValues> | null
  return { ...defaultFeedback, ...(raw ?? {}) }
}

export function saveFeedback(feedback: FeedbackValues): void {
  localStorage.setItem(KEYS.feedback, JSON.stringify(feedback))
}

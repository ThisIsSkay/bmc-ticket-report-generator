/**
 * Remembered survey settings (owner approval, 2026-11-26): draft text, survey
 * link, assigned-group ticks and date order, in this browser only. Ticket rows,
 * names, directory records, matches and decisions are NEVER stored.
 */
import {DEFAULT_DRAFT} from './draft.mjs';

export const SETTINGS_KEY = 'bmc-customer-survey:settings:v1';
const text = (value, max, fallback) => typeof value === 'string' ? value.slice(0, max) : fallback;

export function normalizeSettings(raw) {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const draft = value.draft && typeof value.draft === 'object' ? value.draft : {};
  return {
    draft: {
      to: text(draft.to, 2000, DEFAULT_DRAFT.to),
      subject: text(draft.subject, 300, DEFAULT_DRAFT.subject),
      link: text(draft.link, 2000, DEFAULT_DRAFT.link),
      message: text(draft.message, 5000, DEFAULT_DRAFT.message),
    },
    // null = All groups; an array = only these Assigned Group values.
    groups: Array.isArray(value.groups) ? [...new Set(value.groups.filter((g) => typeof g === 'string').map((g) => g.slice(0, 200)))].slice(0, 200) : null,
    dateOrder: ['dmy', 'mdy'].includes(value.dateOrder) ? value.dateOrder : 'auto',
  };
}

// Storage can be full, blocked or missing (private windows, policies): never throw.
export function loadSettings(storage) {
  try { return normalizeSettings(storage?.getItem(SETTINGS_KEY) ?? null); } catch { return normalizeSettings(null); }
}
export function saveSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings))); return true; } catch { return false; }
}
export function forgetSettings(storage) {
  try { storage.removeItem(SETTINGS_KEY); return true; } catch { return false; }
}

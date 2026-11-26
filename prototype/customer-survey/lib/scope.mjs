/**
 * Survey scope (owner rule, 2026-11-26): a ticket is in scope when its status is
 * exactly "Resolved" (case and surrounding spaces ignored) and its Resolved date
 * falls on the chosen day. Assigned groups narrow it further; null means all
 * groups and [] means none. Pure: no DOM, no storage.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/;

export const isResolved = (status) => String(status ?? '').trim().toLowerCase() === 'resolved';
export const groupLabel = (group) => group || '(no assigned group)';

function day(y, m, d) {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' or null. Numbers are Excel serial dates (XLSX cells). Text may be
 * ISO, a slash/dot/dash date, or use a month name. order ('dmy' | 'mdy' | null)
 * settles slash dates whose day and month could be swapped; without it they are
 * unreadable rather than guessed.
 */
export function parseDay(value, order = null) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null;
    return new Date(EXCEL_EPOCH + Math.floor(value + 1e-9) * 86400000).toISOString().slice(0, 10);
  }
  if (value instanceof Date) return Number.isNaN(+value) ? null : day(value.getFullYear(), value.getMonth() + 1, value.getDate());
  const text = String(value ?? '').trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(text);
  if (m) return day(+m[1], +m[2], +m[3]);
  m = SLASH.exec(text);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    const effective = a > 12 ? 'dmy' : b > 12 ? 'mdy' : order;
    if (!effective) return null;
    return effective === 'dmy' ? day(y, b, a) : day(y, a, b);
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3,})[ ,-]*(\d{4})(?!\d)/.exec(text);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return day(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  m = /^([A-Za-z]{3,})[ -](\d{1,2}),?[ -](\d{4})(?!\d)/.exec(text);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return day(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  return null;
}

/** Day/month order of the slash dates in a column: none, dmy, mdy, ambiguous or conflict. */
export function detectDateOrder(values) {
  let dmy = false, mdy = false, slash = false;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const m = SLASH.exec(value.trim());
    if (!m) continue;
    slash = true;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  if (!slash) return 'none';
  return dmy && mdy ? 'conflict' : dmy ? 'dmy' : mdy ? 'mdy' : 'ambiguous';
}

/**
 * Prepare the Resolved tickets of an imported table.
 * rows: table rows (objects); map: {status, resolved, group} column names;
 * resolvedValues[i]: the Resolved date of row i as read (number for XLSX dates);
 * dateOrder: 'auto' | 'dmy' | 'mdy'.
 */
export function prepareScope(rows, map, resolvedValues = [], dateOrder = 'auto') {
  if (!map.status || !map.resolved) return {ready: false, reason: 'Map Ticket status and Resolved date to choose survey tickets.'};
  const resolved = [];
  rows.forEach((row, index) => { if (isResolved(row[map.status])) resolved.push(index); });
  const valueOf = (index) => resolvedValues[index] ?? row(rows, index, map.resolved);
  const detected = detectDateOrder(resolved.map(valueOf));
  const order = dateOrder === 'dmy' || dateOrder === 'mdy' ? dateOrder : detected === 'dmy' || detected === 'mdy' ? detected : null;
  const needsOrder = dateOrder === 'auto' && (detected === 'ambiguous' || detected === 'conflict');
  const tickets = resolved.map((index) => ({index, day: parseDay(valueOf(index), order), group: map.group ? String(rows[index][map.group] ?? '').trim() : ''}));
  const days = [...new Set(tickets.map((t) => t.day).filter(Boolean))].sort().reverse();
  return {ready: true, detected, order, needsOrder, hasGroups: Boolean(map.group), tickets, resolvedCount: tickets.length, unreadable: tickets.filter((t) => !t.day).length, days, latest: days[0] || ''};
}
const row = (rows, index, key) => rows[index]?.[key] ?? '';

/** Every assigned group among Resolved tickets, with its count on the chosen day. */
export function groupCounts(prep, chosenDay) {
  const counts = new Map();
  for (const ticket of prep.tickets || []) {
    if (!counts.has(ticket.group)) counts.set(ticket.group, 0);
    if (ticket.day === chosenDay) counts.set(ticket.group, counts.get(ticket.group) + 1);
  }
  return [...counts].map(([name, count]) => ({name, count})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Indexes of the rows in scope, in source order. */
export function scopedIndexes(prep, chosenDay, groups = null) {
  if (!prep.ready || !chosenDay) return [];
  return prep.tickets.filter((t) => t.day === chosenDay && (groups === null || !prep.hasGroups || groups.includes(t.group))).map((t) => t.index);
}

/** Why matching cannot start yet, or '' when the scope is usable. */
export function scopeProblem(prep, chosenDay, groups = null) {
  if (!prep.ready) return prep.reason;
  if (prep.needsOrder) return prep.detected === 'conflict'
    ? 'Resolved dates mix day-first and month-first forms. Choose the date order, then check the tickets.'
    : 'Resolved dates such as 03/04/2026 could be day-first or month-first. Choose the date order.';
  if (!prep.resolvedCount) return 'This export has no tickets with status Resolved.';
  if (!chosenDay) return 'Choose the resolved day.';
  if (prep.hasGroups && Array.isArray(groups) && !groups.length) return 'No assigned group is selected. Tick at least one group, or All groups.';
  if (!scopedIndexes(prep, chosenDay, groups).length) return `No Resolved tickets on ${chosenDay} in the selected groups.`;
  return '';
}

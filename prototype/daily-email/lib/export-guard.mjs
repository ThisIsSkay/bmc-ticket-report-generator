import {contractLabel, missingContracts} from './contract-scope.mjs';
import {dedupeTickets} from './report-core.mjs';
import {dayNumber} from './ageing.mjs';

/**
 * Customer-scope safeguard shared by every export path (copy, .html, .eml,
 * Classic Outlook .ps1, Excel) in every report mode, and by the golden harness.
 * Pure: no DOM, no dialogs. Returns {block, confirm}:
 *  - block: a message; the export must not run.
 *  - confirm: a message to show in a confirmation dialog; the export runs only
 *    if the user accepts. It states the scope, recipients and ticket counts.
 * Calculation rules are untouched: this only decides whether a delivery may
 * be produced from the report the user already sees.
 */
export const EMPTY_SCOPE_MESSAGE = 'No contract is selected. Select at least one contract, or All contracts, before exporting.';

const MODE_LABEL = {daily: 'Daily activity', pending: 'Outstanding tickets', monthly: 'Monthly pending tickets'};

/** Contracts present in the (deduplicated) export: nonblank values and the number of tickets without one. */
export function contractSummary(tickets) {
  const unique = dedupeTickets(tickets);
  const names = new Set(unique.map(ticket => ticket.contract).filter(Boolean));
  return {contracts: names.size, blank: unique.filter(ticket => !ticket.contract).length};
}

function countsLine(mode, counts) {
  if (!counts) return '';
  if (mode === 'daily') return `Tickets in this email: ${counts.created ?? 0} created, ${counts.closed ?? 0} closed/resolved, ${counts.pending ?? 0} outstanding.`;
  return `Tickets in this email: ${counts.total ?? 0} outstanding.`;
}

export function exportGuard({tickets = [], contracts = null, hasContractColumn = true, mode = 'daily', asAt = '', scopeError = '', to = '', reportDate = '', counts = null} = {}) {
  const missing = missingContracts(tickets, contracts);
  if (missing.length) return {block: 'Selected contracts are missing from this export: ' + contractLabel(missing) + '. Review the contracts before exporting.', confirm: null};
  if (Array.isArray(contracts) && contracts.length === 0) return {block: EMPTY_SCOPE_MESSAGE, confirm: null};
  if (mode === 'monthly' && dayNumber(asAt) === null) return {block: 'Choose the monthly reporting date.', confirm: null};
  if (mode !== 'daily' && scopeError) return {block: scopeError, confirm: null};
  if (contracts !== null && hasContractColumn) return {block: null, confirm: null};
  const summary = contractSummary(tickets);
  const scope = !hasContractColumn
    ? 'Contracts: this export has no Contract column, so tickets cannot be limited to one customer.'
    : `Contracts: All contracts (${summary.contracts} in this export${summary.blank ? `, plus ${summary.blank} ticket${summary.blank === 1 ? '' : 's'} with no contract` : ''}).`;
  const recipients = String(to || '').trim() || '(not configured)';
  const confirm = [
    'Check the customer scope before exporting.',
    '',
    `Report: ${MODE_LABEL[mode] || mode}${reportDate ? ' · ' + reportDate : ''}`,
    scope,
    `To: ${recipients}`,
    countsLine(mode, counts),
    '',
    'Select OK only if every ticket belongs to the intended customer. Select Cancel to choose a contract.',
  ].filter((line, index, all) => line !== '' || (all[index - 1] !== '' && index > 0)).join('\n');
  return {block: null, confirm};
}

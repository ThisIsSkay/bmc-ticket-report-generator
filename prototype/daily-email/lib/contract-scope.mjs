import {dedupeTickets, generateReport} from './report-core.mjs';

/** null means All (including future contracts); [] means an explicit empty scope. */
export function contractsFromSetup(setup) {
  if (Array.isArray(setup?.contracts)) return [...new Set(setup.contracts.filter(v=>typeof v==='string'))];
  if (setup?.contracts===null) return null;
  // Migrate the original single-contract settings without widening their scope.
  return typeof setup?.contract==='string' && setup.contract!=='All' ? [setup.contract] : null;
}
export function contractLabel(contracts) {
  return contracts===null?'All':contracts.map(value=>value||'(blank)').join(', ')||'None selected';
}
export function missingContracts(tickets, contracts) {
  const available=new Set(dedupeTickets(tickets).map(ticket=>ticket.contract));
  return (contracts||[]).filter(value=>!available.has(value));
}
/** Reuse the existing counters, selecting contracts AFTER latest-row deduplication. */
export function generateContractReport(tickets, options, contracts=null) {
  if(contracts===null)return generateReport(tickets,{...options,contractFilter:'All'});
  const unique=dedupeTickets(tickets);
  const report=generateReport(unique.filter(ticket=>contracts.includes(ticket.contract)),{...options,contractFilter:'All'});
  return {...report,rawCount:tickets.length,duplicateCount:tickets.length-unique.length};
}

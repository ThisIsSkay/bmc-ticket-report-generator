import {ticketAge,AGE_BANDS,matrix} from './ageing.mjs';
/** Presentation of generateReport().pending; never reclassifies lifecycle status. */
export const normalizeReportContent=value=>value==='pending'?'pending':'daily';
export const PENDING_SUBJECT='BMC Outstanding Tickets — {date}';
export const PENDING_INTRO='Please find below the current outstanding tickets in the uploaded export.';

const label=value=>String(value??'').trim()||'—';
const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'en');
function countBy(tickets,key){
 const counts=new Map();
 for(const ticket of tickets){const name=label(ticket[key]);counts.set(name,(counts.get(name)||0)+1);}
 return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>compare(a.name,b.name));
}

/** report must come from generateReport with groupFilter:'All'.
 * null groups means all; [] deliberately means none. Filtering is AFTER dedupe.
 * Scope is shared by the dashboard, HTML, plain text and every export.
 */
export function buildPendingView(report,{groups=null,contractFilter='All',excludeEvents=true,types=null,statuses=null,asAt=''}={}){
 const selected=groups===null?null:[...new Set(groups)].sort(compare);
 const scoped=report.pending.filter(ticket=>selected===null||selected.includes(ticket.group))
;
 const typed=scoped.filter(t=>types===null||types.includes(t.kind));
 const tickets=typed.filter(t=>statuses===null||statuses.includes(t.status))
  .slice().sort((a,b)=>compare(a.group,b.group)||compare(a.created||'9999',b.created||'9999')||compare(a.id,b.id)||a.rowIndex-b.rowIndex);
 const incidents=tickets.filter(ticket=>ticket.kind==='Incident').length;
 return {tickets,groups:selected,contractFilter,excludeEvents,types,statuses,asAt,excludedType:scoped.length-typed.length,excludedStatus:typed.length-tickets.length,byAge:asAt?AGE_BANDS.map(name=>({name,count:tickets.filter(t=>ticketAge(t.created,asAt).band===name).length})):[],groupType:matrix(tickets,'group','kind'),typePriority:matrix(tickets,'kind','priority'),
  total:tickets.length,incidents,other:tickets.length-incidents,
  byGroup:countBy(tickets,'group'),byStatus:countBy(tickets,'status')};
}

export function pendingCaption(view){
 const groups=view.groups===null?'All assigned groups':view.groups.length?view.groups.join(', '):'None selected';
 return `Assigned groups: ${groups} · Contract: ${view.contractFilter||'All'} · Types: ${view.types===null?'All':view.types.join(', ')||'None'} · Statuses: ${view.statuses===null?'All':view.statuses.join(', ')||'None'} · Monitoring events ${view.excludeEvents?'excluded':'included'}`;
}
export function pendingDisclaimer(view){
 return `Figures reflect current ticket status in the uploaded BMC export, not a historical backlog for a selected date. ${view.asAt?`Age since submission uses ${view.asAt}; this is not an export timestamp.`:''} ${view.excludedType||0} tickets excluded by type and ${view.excludedStatus||0} by status. Monitoring events are ${view.excludeEvents?'excluded':'included'}. This email is intended only for the named recipients; if you received it in error, please notify the sender and delete it.`;
}

/** Engineer visibility applies to dashboard, email and plain text together. */
export function pendingColumns(showEngineer=false){
 const columns=[
  {key:'id',label:'Ticket ID',width:124},
  {key:'kind',label:'Type',width:84},
  {key:'description',label:'Summary',width:showEngineer?150:240},
  {key:'group',label:'Assigned group',width:116},
 ];
 if(showEngineer)columns.push({key:'assigned',label:'Engineer',width:90});
 columns.push({key:'status',label:'Status / Priority',width:84},{key:'created',label:'Submitted',width:88});
 return columns;
}
export function pendingTicketValues(ticket,showEngineer=false){
 return pendingColumns(showEngineer).map(column=>column.key==='status'
  ? `${label(ticket.status)}${ticket.priority?'\nPriority: '+ticket.priority:''}` : label(ticket[column.key]));
}

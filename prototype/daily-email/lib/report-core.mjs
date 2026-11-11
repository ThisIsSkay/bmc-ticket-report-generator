/** Pure ticket processing. No network requests, no browser dependencies. */
const columnNames = {
  id: ['ticket id', 'display id', 'incident id', 'request id'],
  created: ['submit date', 'submitted date', 'created date', 'creation date'],
  resolved: ['resolved date', 'closed date', 'closure date'],
  modified: ['last modified date', 'modified date', 'updated date'],
  status: ['status', 'ticket status'],
  assigned: ['assigned engineer', 'assigned to', 'assignee'],
  group: ['assigned group', 'support group', 'assignment group'],
  description: ['description', 'summary', 'title'],
  kind: ['incident type', 'ticket type', 'request type'],
  contract: ['contract number', 'contract id+', 'contract id'],
  priority: ['priority', 'incident priority'],
};

export function keyify(value) { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*[^a-z\d+ ]+\s*/g, ' ').trim(); }
export function detectColumns(headers) {
  const clean = headers.map(x=>keyify(x));
  return Object.fromEntries(Object.entries(columnNames).map(([key, aliases]) => {
    const exact = aliases.map(a => clean.findIndex(x => x === keyify(a))).find(i=>i>=0);
    return [key, exact == null ? '' : headers[exact]];
  }));
}
export const mandatoryColumns = ['id','created','status','resolved'];
export function serialDate(ser) {
  if (typeof ser !== 'number' || !Number.isFinite(ser)) return null;
  const millis = Date.UTC(1899,11,30) + ser*86400000;
  const dt = new Date(millis);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0,10) : null;
}
export function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(+value)) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if (typeof value === 'number') return serialDate(value);
  const s=String(value??'').trim(); if(!s) return null;
  const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const dmy=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(s);
  let y,mo,d;
  if (iso) { y=+iso[1];mo=+iso[2];d=+iso[3]; }
  else if (dmy) {const first=+dmy[1],second=+dmy[2];y=+dmy[3];mo=first>12?second:first;d=first>12?first:second;}
  else {const parsed = new Date(s);return Number.isNaN(+parsed)?null:`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;}
  const dt = new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==mo-1 || dt.getUTCDate()!==d)return null;
  return dt.toISOString().slice(0,10);
}
export function dateTimeSortValue(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime()/86400000;
  const parsed=Date.parse(String(value??'')); return Number.isNaN(parsed)?0:parsed/86400000;
}
export function typeOfTicket(id, rawKind) {
  const prefix=/^[A-Za-z]+/.exec(String(id??'').trim())?.[0]?.toUpperCase();
  return ({INC:'Incident',SRV:'Service Request',FSC:'Forward Schedule',EVT:'Event'})[prefix] || String(rawKind??'Other').trim() || 'Other';
}
export function normalizeTickets(rows,mapping) {
  return rows.map((row,index) => {
    const g=(k)=>row[mapping[k]]??'';
    const status=String(g('status')).trim();
    const id=String(g('id')).trim();
    return {id, created:dateOnly(g('created')), resolved:dateOnly(g('resolved')), modifiedRank:dateTimeSortValue(g('modified')), status, assigned:String(g('assigned')).trim(), group:String(g('group')).trim()||'Unassigned',description:String(g('description')).trim(),kind:typeOfTicket(id,g('kind')), contract:String(g('contract')).trim(), priority:String(g('priority')).trim(),rowIndex:index};
  });
}
export function dedupeTickets(tickets) {
  const byId=new Map();
  for (const ticket of tickets) {
    const id=ticket.id.toUpperCase()||`__empty_${ticket.rowIndex}`;
    const prev=byId.get(id);
    if(!prev||ticket.modifiedRank>prev.modifiedRank||(ticket.modifiedRank===prev.modifiedRank && ticket.rowIndex>prev.rowIndex)) byId.set(id,ticket);
  }
  return [...byId.values()];
}
const completed = new Set(['closed','resolved']);
const terminal=new Set(['closed','resolved','cancelled','canceled']);
const knownStatuses=new Set([...terminal,'new','assigned','created','pending','work in progress','in progress','wip','waiting user reply','awaiting user','pending user','waiting for user','on hold','hold']);
export function generateReport(allTickets,options) {
  const {reportDate, groupFilter='All',contractFilter='All',excludeEvents=true} = options;
  const deduped=dedupeTickets(allTickets);
  let unique=deduped;
  if(groupFilter!=='All') unique=unique.filter(t=>t.group===groupFilter);
  if(contractFilter!=='All') unique=unique.filter(t=>t.contract===contractFilter);
  if(excludeEvents) unique=unique.filter(t=>t.kind!=='Event');
  const created=unique.filter(t=>t.created===reportDate);
  const closed=unique.filter(t=>completed.has(t.status.toLowerCase()) && t.resolved===reportDate);
  const pending=unique.filter(t=>!terminal.has(t.status.toLowerCase()));
  // Unknown statuses retain the existing pending-count behaviour but are now visible.
  const unknownByName=new Map();
  for(const ticket of unique){
    const name=String(ticket.status||'').trim();
    const key=name.toLowerCase();
    if(!knownStatuses.has(key)){
      const current=unknownByName.get(key)||{status:name||'(blank)',count:0};
      current.count++;
      unknownByName.set(key,current);
    }
  }
  const unknownStatuses=[...unknownByName.values()].sort((a,b)=>b.count-a.count||a.status.localeCompare(b.status));
  const groupMap=new Map();
  const getGroup=(g)=>{if(!groupMap.has(g))groupMap.set(g,{group:g,created:0,closed:0,pending:0});return groupMap.get(g)};
  for(const t of created)getGroup(t.group).created++;
  for(const t of closed)getGroup(t.group).closed++;
  for(const t of pending)getGroup(t.group).pending++;
  const pivot=[...groupMap.values()].sort((a,b)=>(b.created+b.closed+b.pending)-(a.created+a.closed+a.pending)||a.group.localeCompare(b.group));
  const typeMap=new Map();
  const typeRow=(k)=>{if(!typeMap.has(k))typeMap.set(k,{group:k,created:0,closed:0,pending:0});return typeMap.get(k)};
  for (const t of created) typeRow(t.kind).created++;
  for (const t of closed) typeRow(t.kind).closed++;
  for (const t of pending) typeRow(t.kind).pending++;
  const byType=[...typeMap.values()].sort((a,b)=>a.group.localeCompare(b.group));
  created.sort((a,b)=>a.group.localeCompare(b.group)||a.id.localeCompare(b.id));
  closed.sort((a,b)=>a.group.localeCompare(b.group)||a.id.localeCompare(b.id));
  return {reportDate,created,closed,pending,pivot,byType,totalUnique:unique.length,counts:{created:created.length,closed:closed.length,pending:pending.length},rawCount:allTickets.length,duplicateCount:allTickets.length-deduped.length,unknownStatuses};
}
export function availableFilterValues(tickets,kind) {
  return [...new Set(tickets.map(t=>t[kind]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
export function lastActivityDate(tickets) {return [...tickets.flatMap(t=>[t.created,t.resolved])].filter(Boolean).sort().at(-1)||'';}
/** RFC4180-style CSV, including quoted newlines and escaped quotes. */
export function parseCsv(text) {
  const clean=text.replace(/^\uFEFF/,'');const out=[];let row=[],field='',quoted=false;
  for(let i=0;i<clean.length;i++){
    const c=clean[i];
    if(c==='"'&&quoted&&clean[i+1]==='"'){field+='"';i++;}
    else if(c==='"'){quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){row.push(field);if(row.some(x=>x.trim()!==''))out.push(row);row=[];field='';if(c==='\r'&&clean[i+1]==='\n')i++;}
    else field+=c;
  }
  row.push(field);if(row.some(x=>x.trim()!==''))out.push(row);
  if(!out.length)return {headers:[],rows:[]};
  const headers=out.shift().map(v=>v.trim());
  const rows=out.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
  return {headers,rows};
}

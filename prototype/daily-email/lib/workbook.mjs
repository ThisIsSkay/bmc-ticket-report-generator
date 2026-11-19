import {ticketAge,dayNumber} from './ageing.mjs';
import {pendingCaption,pendingTicketValues,pendingColumns} from './pending-report.mjs';
export function workbookSheets(view,showEngineer=false){
 const columns=pendingColumns(showEngineer).flatMap(c=>c.key==='status'?[{key:'status',label:'Status'},{key:'priority',label:'Priority'}]:[c]);const headings=columns.map(c=>c.label);
 return {
 Summary:[['Outstanding tickets',view.total],['Age reference date',view.asAt||'Not selected'],['Scope',pendingCaption(view)],['Excluded by type',view.excludedType||0],['Excluded by status',view.excludedStatus||0],['Age basis','Calendar days since submission; current export status, not historical backlog'],...(view.byAge||[]).map(r=>[r.name,r.count]),...[["Group by type",view.groupType],["Type by priority",view.typePriority]].filter(([,m])=>m).flatMap(([title,m])=>[[],[title,...m.columns,'Total'],...m.rows.map(r=>[r.name,...r.counts,r.counts.reduce((a,b)=>a+b,0)]),['TOTAL',...m.columns.map((_,i)=>m.rows.reduce((n,r)=>n+r.counts[i],0)),view.total]])],
 Tickets:[[...headings,'Age since submitted (days)','Age band'],...view.tickets.map(t=>{const values=columns.map(c=>t[c.key]||'—');const age=view.asAt?ticketAge(t.created,view.asAt):{days:null,band:'Age unknown'};values[values.length-1]=dayNumber(t.created)===null?'':new Date(t.created+'T00:00:00Z');return [...values,age.days,age.band];})],
 Scope:[['Groups',view.groups===null?'All':view.groups.join(', ')],['Contract',view.contractFilter],['Types',view.types===null?'All':view.types.join(', ')],['Raw statuses',view.statuses===null?'All':view.statuses.join(', ')],['Engineer included',showEngineer?'Yes':'No'],['Monitoring excluded',view.excludeEvents?'Yes':'No']]
 };
}
export function buildWorkbook(view,showEngineer,XLSX){
 const book=XLSX.utils.book_new();
 for(const [name,rows] of Object.entries(workbookSheets(view,showEngineer))){const sheet=XLSX.utils.aoa_to_sheet(rows,{cellDates:true,dateNF:'yyyy-mm-dd'});sheet['!cols']=rows[0].map(()=>({wch:24}));if(name==='Tickets')sheet['!autofilter']={ref:sheet['!ref']};XLSX.utils.book_append_sheet(book,sheet,name);}
 const bytes=XLSX.write(book,{type:'array',bookType:'xlsx',compression:true});
 if(bytes.byteLength>5*1024*1024)throw Error('Workbook exceeds 5 MB. Narrow the report scope.');
 return bytes;
}

/** Calendar age, not time in status or historical backlog. No clock access. */
export const AGE_BANDS=['0–7','8–14','15–30','31–60','Over 60','Age unknown','Future-dated'];
export function dayNumber(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
 const n=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:null;
}
export function ticketAge(created,asAt){
 const a=dayNumber(asAt),c=dayNumber(created);
 if(a===null)throw Error('Choose a valid age reference date.');
 const days=c===null?null:a-c;
 return {days,band:days===null?'Age unknown':days<0?'Future-dated':days<=7?'0–7':days<=14?'8–14':days<=30?'15–30':days<=60?'31–60':'Over 60'};
}
export function matrix(tickets,rowKey,columnKey){
 const rows=[...new Set(tickets.map(t=>String(t[rowKey]||'(blank)')))].sort();
 const columns=[...new Set(tickets.map(t=>String(t[columnKey]||'(blank)')))].sort((a,b)=>{const rank=v=>v==='(blank)'?99:/^(?:[1-4]\s*[-:]?\s*)?critical$/i.test(v)?0:/^(?:[1-4]\s*[-:]?\s*)?high$/i.test(v)?1:/^(?:[1-4]\s*[-:]?\s*)?medium$/i.test(v)?2:/^(?:[1-4]\s*[-:]?\s*)?low$/i.test(v)?3:10;return (columnKey==='priority'?rank(a)-rank(b):0)||a.localeCompare(b);});
 return {columns,rows:rows.map(name=>({name,counts:columns.map(col=>tickets.filter(t=>String(t[rowKey]||'(blank)')===name&&String(t[columnKey]||'(blank)')===col).length)}))};
}

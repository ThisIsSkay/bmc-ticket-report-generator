/** Client-neutral HTML email and RFC 5322 .eml generation. Never sends anything. */
import {renderThemedEmail} from './email-themes.mjs';
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tableCell='border:1px solid #d8dfe7;padding:7px 9px;font-size:12px;vertical-align:top;line-height:1.45';
const thCell=`${tableCell};background:#f1f4f8;color:#223248;text-align:left;font-weight:600`;
const tdCell=`${tableCell};color:#273648;`;
const nbsp='—';
function table(headers,rows,blankLabel){
  if(!rows.length) return `<p style="font-size:12px;color:#667085;margin:6px 0 18px">${escapeHtml(blankLabel)}</p>`;
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:100%;margin:7px 0 20px;background:white;font-family:Arial,sans-serif"><thead><tr>${headers.map(h=>`<th style="${thCell}">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td style="${tdCell}">${escapeHtml(c===null||c===undefined||c===''?nbsp:c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const title=t=>`<h2 style="font:600 14px/1.4 Arial,sans-serif;color:#142c45;margin:22px 0 7px">${escapeHtml(t)}</h2>`;
const safeText=v=>escapeHtml(v).replace(/\r?\n/g,'<br>');
function renderLegacyEmail(report,settings,filters={}) {
  const date=report.reportDate;
  const caption=['Daily ticket activity', filters.groupFilter!=='All'&&filters.groupFilter?`Group: ${filters.groupFilter}`:null,filters.contractFilter!=='All'&&filters.contractFilter?`Contract: ${filters.contractFilter}`:null,filters.excludeEvents?'Monitoring events excluded':null].filter(Boolean).join(' · ');
  const pivotRows=report.pivot.map(row=>[row.group,row.created,row.closed,row.pending]);
  const typeRows=report.byType.map(row=>[row.group,row.created,row.closed,row.pending]);
  const totals=['TOTAL',report.counts.created,report.counts.closed,report.counts.pending];
  const kpi=(label,count)=>`<td style="padding:12px 14px;border:1px solid #d8dfe7;width:33%;background:#f7f9fb"><div style="font-size:11px;color:#637083">${label}</div><div style="font-size:21px;font-weight:700;color:#142c45;margin-top:3px">${count}</div></td>`;
  const profile=settings.signatures?.find(s=>s.id===settings.signatureId);
  const signature=profile?.html || (profile?.content ? safeText(profile.content) : '');
  const intro=settings.intro||'Please find below the daily BMC ticket activity report.';
  const html=`<!doctype html><html><head><meta charset="UTF-8"><title>Daily BMC report ${escapeHtml(date)}</title></head><body style="margin:0;background:#ffffff;color:#273648;font:12px/1.55 Arial,Helvetica,sans-serif"><div style="max-width:1050px;margin:0 auto;padding:22px 16px 36px"><p style="font-size:12px;margin:0 0 16px">${safeText(settings.greeting||'Hi Team,')}</p><p style="font-size:12px;margin:0 0 17px">${safeText(intro)}</p><h1 style="font:600 19px/1.3 Arial,sans-serif;color:#142c45;margin:0 0 4px">BMC Daily Ticket Report — ${escapeHtml(date)}</h1><p style="font-size:11px;color:#718096;margin:0 0 13px">${escapeHtml(caption)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:0 0 20px"><tbody><tr>${kpi('Created on date',report.counts.created)}${kpi('Closed / resolved on date',report.counts.closed)}${kpi('Current outstanding',report.counts.pending)}</tr></tbody></table>${title('Summary by assigned group')}${table(['Assigned group','Created','Closed','Outstanding'],[...pivotRows,totals],'No tickets matched the selected scope.')}${title('Summary by ticket type')}${table(['Ticket type','Created','Closed','Outstanding'],[...typeRows,totals],'No tickets matched the selected scope.')}${title(`Tickets created on ${date} (${report.counts.created})`)}${table(['Ticket ID','Type','Summary','Assignee','Assigned group','Current status'],report.created.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),'No tickets were created on the selected date.')}${title(`Tickets closed / resolved on ${date} (${report.counts.closed})`)}${table(['Ticket ID','Type','Summary','Assignee','Assigned group','Current status'],report.closed.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),'No tickets were closed on the selected date.')}${signature?`<div style="font-size:12px;color:#273648;margin-top:22px">${signature}</div>`:''}<p style="color:#7c8793;font-size:10px;border-top:1px solid #e6eaef;padding-top:10px;margin-top:24px">Draft report generated from a locally uploaded BMC export. Please verify the figures before sending.</p></div></body></html>`;
  return html;
}
export function renderEmail(report,settings,filters={},variant='legacy') {
  return ['A','B','C','D'].includes(variant)?renderThemedEmail(report,settings,variant):renderLegacyEmail(report,settings,filters);
}
const utf8Base64=text=>{const bytes=new TextEncoder().encode(text);let data='';for(let i=0;i<bytes.length;i+=8192){data+=String.fromCharCode(...bytes.subarray(i,i+8192))}return btoa(data)};
const foldBase64=s=>s.match(/.{1,76}/g)?.join('\r\n')||'';
export function recipients(text){return String(text||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean).filter(x=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x));}
const stripNewlines=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
const rfcHeader = v => /^[\x20-\x7e]*$/.test(stripNewlines(v))?stripNewlines(v):`=?UTF-8?B?${utf8Base64(stripNewlines(v))}?=`;
export function buildSubject(template,date){return String(template||'Daily BMC Ticket Report - {date}').replaceAll('{date}',date)};
export function renderEml(html,settings,reportDate){
 const to=recipients(settings.to).join(', '),cc=recipients(settings.cc).join(', '),bcc=recipients(settings.bcc).join(', ');
 const subject=rfcHeader(buildSubject(settings.subject,reportDate));
 // Use CID-referenced multipart images instead of fragile data: URLs in .eml.
 const images=[];
 const htmlWithCids=html.replace(/<img\b[^>]*>/gi,tag=>{
   const match=/src=(['"])data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)\1/i.exec(tag);
   if(!match)return tag;
   const [, ,type,data]=match;
   if(data.length>1800000)return '<span>[Signature image omitted: exceeds export size limit]</span>';
   const prior=images.find(image=>image.data===data&&image.type===type.toLowerCase());
   let cid=prior?.cid;
   if(!cid){
     cid='bmc-signature-'+(images.length+1)+'@local.invalid';
     images.push({cid,type:type.toLowerCase(),data});
   }
   return tag.replace(match[0],'src="cid:'+cid+'"');
 });
 const body=foldBase64(utf8Base64(htmlWithCids));
 const base=['X-Unsent: 1','MIME-Version: 1.0','Date: '+new Date().toUTCString(),'To: '+to,cc&&'Cc: '+cc,bcc&&'Bcc: '+bcc,'Subject: '+subject].filter(Boolean);
 if(!images.length)return [...base,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body,''].join('\r\n');
 const boundary='bmc-inline-images-'+Date.now().toString(36);
 const parts=[...base,'Content-Type: multipart/related; boundary="'+boundary+'"','',
    '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body];
 for(const [index,image] of images.entries())parts.push('--'+boundary,
    'Content-Type: image/'+image.type+'; name="signature-'+(index+1)+(image.type==='jpeg'?'.jpg"':'.png"'),
    'Content-Transfer-Encoding: base64','Content-ID: <'+image.cid+'>','Content-Disposition: inline','',foldBase64(image.data));
 return [...parts,'--'+boundary+'--',''].join('\r\n');
}


/**
 * Outlook-safe themed daily report email (variants A-D).
 *
 * docs/email-design/reference/variant-{A,B,C,D}.html are the source of truth
 * for every colour, size and padding below; a golden test compares this
 * renderer's output for docs/email-design/sample-data.json against them.
 * Rules (AGENTS.md): tables only, inline styles only, Arial on every
 * text-bearing p/h1/h2/td/th, 1px solid borders, bgcolor + background-color.
 */
import {signatureEmailHtml,plainToSignatureHtml} from './signature-html.mjs';
import {pendingCaption,pendingDisclaimer,pendingColumns,pendingTicketValues,PENDING_INTRO} from './pending-report.mjs';

const F='font-family:Arial,Helvetica,sans-serif;';
const DOCTYPE='<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';
export const EMAIL_VARIANTS=['A','B','C','D'];
/** Any unknown, blank or legacy value falls back to Variant A. */
export const normalizeVariant=value=>EMAIL_VARIANTS.includes(value)?value:'A';

/** Missing values (blank, null, undefined, NaN) render as an em dash. */
const text=v=>{if(typeof v==='number'&&!Number.isFinite(v))return '—';const s=String(v??'').trim();return s||'—';};
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const multiline=v=>esc(v).replace(/\r?\n/g,'<br />');
/*
 * Arial advance widths (1/1000 em) for U+0020..U+007E, used only to decide
 * where a long unbroken value needs a break opportunity. Other characters are
 * over-estimated, which is harmless: an unused zero-width space is invisible.
 */
const ARIAL_WIDTHS=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
 667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
 556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
function charEm(ch){
 const code=ch.codePointAt(0);
 if(code>=0x20&&code<=0x7E)return ARIAL_WIDTHS[code-0x20]/1000;
 return code>0xFFFF?1.4:code>=0x2E80?1.1:0.95;
}
const ENTITY_CHAR={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
/**
 * Break opportunities for long unbroken values. Classic Outlook (Word)
 * ignores word-break, so zero-width spaces are inserted instead:
 *  - any non-whitespace run longer than 24 characters gets one at least every
 *    20 characters;
 *  - when the cell's content width is known (maxPx at fontPx), also wherever
 *    the run would otherwise be wider than the cell, so the columns can always
 *    shrink to their designed widths and the email stays 800px wide.
 * Values that already fit (ticket IDs, ordinary words) are left untouched.
 * Works on already-escaped text and never splits an entity such as &amp;.
 */
export function softBreak(escaped,maxPx=Infinity,fontPx=12){
 return String(escaped).split(/(\s+)/).map(run=>{
  if(/^\s*$/.test(run))return run;
  const units=run.match(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);|[\s\S]/giu)||[],maxChars=units.length>24?20:Infinity;
  let out='',chars=0,width=0;
  for(const unit of units){
   const w=charEm(unit.length>1&&unit[0]==='&'?ENTITY_CHAR[unit]||'W':unit)*fontPx;
   if(chars&&(chars>=maxChars||width+w>maxPx)){out+='&#8203;';chars=0;width=0;}
   out+=unit;chars++;width+=w;
  }
  return out;
 }).join('');
}
const WRAP='word-wrap:break-word;';
/** Left + right padding of a CSS padding shorthand, in px. */
const sidePadding=pad=>{const v=pad.split(/\s+/).map(parseFloat);return v.length===1?2*v[0]:v.length<4?2*v[1]:v[1]+v[3];};
const fontPx=style=>parseFloat(/font-size:(\d+)px/.exec(style)?.[1]||'12');
/** Escaped cell text that can always wrap inside a column of the given width (1px spare for a cell border). */
const cellText=(v,width,pad,style)=>softBreak(esc(v),width-sidePadding(pad)-1,fontPx(style));
const longDate=date=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);if(!m)return date;return new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(+m[1],+m[2]-1,+m[3]));};

const senderKeys=['name','title','company','phone'];
/** Sender details as trimmed strings. Never invents placeholder text. */
export function normalizeSender(sender){
 const source=sender&&typeof sender==='object'?sender:{};
 return Object.fromEntries(senderKeys.map(key=>[key,String(source[key]??'').trim()]));
}
/** Warning for the email panel while the structured sender block is incomplete; '' when nothing to warn about. */
export function senderWarning(settings={}){
 if(settings.signatures?.some(profile=>profile.id&&profile.id===settings.signatureId))return '';
 const sender=normalizeSender(settings.emailSender),missing=senderKeys.filter(key=>!sender[key]);
 if(!missing.length)return '';
 const labels={name:'sender name',title:'job title',company:'company',phone:'office phone'};
 return 'Sender details incomplete (missing: '+missing.map(key=>labels[key]).join(', ')+'). Blank lines are left out of the email sign-off. Add them in Email settings, or choose a signature profile.';
}
const DEFAULT_INTRO='Please find below the daily ticket activity summary';
/** Intro sentence ending in the report date. Supports a {date} token; otherwise trailing punctuation is dropped before " for {date}." is appended. */
export function introSentence(intro,dateLong){
 const base=String(intro??'').trim()||DEFAULT_INTRO;
 if(base.includes('{date}'))return base.replaceAll('{date}',dateLong);
 return (base.replace(/[\s.!?:;,]+$/,'')||DEFAULT_INTRO)+' for '+dateLong+'.';
}
const filterValue=v=>v&&v!=='All'?String(v):'';
/** Caption under the title: only states the scope that was actually applied. */
export function scopeCaption(filters={}){
 const group=filterValue(filters.groupFilter),contract=filterValue(filters.contractFilter);
 return ['Daily ticket activity',group&&'Group: '+group,contract&&'Contract: '+contract,filters.excludeEvents?'Monitoring events excluded':''].filter(Boolean).join(' · ');
}
export function disclaimerText(reportDate,filters={}){
 return 'This is an automated report generated from BMC Helix ITSM. Figures cover tickets for '+reportDate+' (SGT) and '+(filters.excludeEvents?'exclude':'include')+' monitoring events. This email is intended only for the named recipients; if you received it in error, please notify the sender and delete it.';
}
function selectedSignatureHtml(settings){
 const profile=settings.signatures?.find(s=>s.id&&s.id===settings.signatureId);
 if(!profile)return '';
 const html=signatureEmailHtml(profile.html??plainToSignatureHtml(profile.content||''));
 return /<img\b/i.test(html)||html.replace(/<[^>]*>|&nbsp;/g,'').trim()?html:'';
}
const count=v=>Number(v)||0;
function dataFor(report,settings,filters={}){
 const rows=list=>(list||[]).map(r=>({name:r.group,created:r.created,closed:r.closed,outstanding:r.pending}));
 const dateLong=longDate(report.reportDate);
 return {
  reportDate:report.reportDate,
  greeting:String(settings.greeting??'').trim()||'Hi Team,',
  introLine:introSentence(settings.intro,dateLong),
  caption:scopeCaption(filters),
  disclaimer:disclaimerText(report.reportDate,filters),
  kpis:[['Created on date',report.counts.created],['Closed/resolved',report.counts.closed],['Outstanding',report.counts.pending]],
  byGroup:rows(report.pivot),byType:rows(report.byType),
  createdTickets:(report.created||[]).map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),
  sender:normalizeSender(settings.emailSender),
  signatureHtml:selectedSignatureHtml(settings),
 };
}

/*
 * Per-variant values copied from the reference files. A padding given as an
 * array is [first column, middle columns, last column, full-width row].
 */
const THEMES={
 A:{
  greeting:{td:`padding:32px 32px 20px 32px;${F}font-size:14px;line-height:22px;color:#222222;`,p:'font-size:14px;line-height:22px;color:#222222;',gap:'8px'},
  section:{pad:'28px 32px 8px 32px',h2:'font-size:16px;line-height:22px;font-weight:bold;color:#1B3A5C;'},
  table:'border:1px solid #D3DAE2;',numAlign:'center',
  head:{bg:'#1B3A5C',border:'',sumPad:'9px 12px',sum:'font-size:13px;line-height:18px;font-weight:bold;color:#FFFFFF;',tixPad:'8px 10px',tix:'font-size:12px;line-height:16px;font-weight:bold;color:#FFFFFF;'},
  row:{stripe:'#F4F6F9',border:i=>i?'border-top:1px solid #D3DAE2;':'',sumPad:'8px 12px',sum:'font-size:13px;line-height:18px;color:#222222;',tixPad:'8px 10px',tix:'font-size:12px;line-height:16px;color:#222222;'},
  total:{bg:'#E3E9F0',border:'border-top:1px solid #9FB0C3;',pad:'8px 12px',text:'font-size:13px;line-height:18px;font-weight:bold;color:#1B3A5C;'},
  signature:{pad:'32px 32px 0 32px',size:'font-size:14px;line-height:22px;',ink:'#222222',accent:'#1B3A5C',gap:'12px',small:'font-size:13px;line-height:20px;',muted:'#555F6B'},
  disclaimer:{pad:'24px 32px 32px 32px',bg:'',style:'border-top:1px solid #D3DAE2;padding:12px 0 0 0;',text:'font-size:11px;line-height:16px;color:#666666;'},
 },
 B:{
  greeting:{td:`padding:36px 32px 28px 32px;${F}`,p:'font-size:14px;line-height:22px;color:#1F2328;',gap:'8px'},
  section:{pad:'32px 32px 12px 32px',h2:'font-size:15px;line-height:20px;font-weight:bold;color:#1F2328;'},
  table:'',numAlign:'right',
  head:{bg:'',border:'border-bottom:1px solid #1F2328;',sumPad:['0 10px 8px 0','0 10px 8px 10px','0 0 8px 10px'],sum:'font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#57606A;',tixPad:['0 10px 8px 0','0 10px 8px 10px','0 0 8px 10px'],tix:'font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#57606A;'},
  // Summary tables close with a dark rule above TOTAL; the tickets table keeps the light rule.
  row:{stripe:'',border:(i,lastSummaryRow)=>lastSummaryRow?'border-bottom:1px solid #1F2328;':'border-bottom:1px solid #E1E5E9;',sumPad:['10px 10px 10px 0','10px','10px 0 10px 10px','10px 0'],sum:'font-size:13px;line-height:18px;color:#1F2328;',tixPad:['10px 10px 10px 0','10px','10px 0 10px 10px','10px 0'],tix:'font-size:12px;line-height:16px;color:#1F2328;'},
  total:{bg:'',border:'',pad:['10px 10px 10px 0','10px','10px 0 10px 10px'],text:'font-size:13px;line-height:18px;font-weight:bold;color:#1F2328;'},
  signature:{pad:'36px 32px 0 32px',size:'font-size:14px;line-height:22px;',ink:'#1F2328',accent:'#1F2328',gap:'12px',small:'font-size:13px;line-height:20px;',muted:'#57606A'},
  disclaimer:{pad:'28px 32px 36px 32px',bg:'',style:'border-top:1px solid #E1E5E9;padding:12px 0 0 0;',text:'font-size:11px;line-height:16px;color:#666666;'},
 },
 C:{
  greeting:{td:`padding:24px 32px 20px 32px;${F}`,p:'font-size:13px;line-height:20px;color:#1E1E1E;',gap:'6px'},
  section:{pad:'24px 32px 8px 32px',h2:'font-size:12px;line-height:16px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#2E3D4F;'},
  table:'',numAlign:'center',
  head:{bg:'#E8ECF0',border:'border:1px solid #B9C1CA;',sumPad:'6px 8px',sum:'font-size:12px;line-height:16px;font-weight:bold;color:#2E3D4F;',tixPad:'6px 8px',tix:'font-size:12px;line-height:16px;font-weight:bold;color:#2E3D4F;'},
  row:{stripe:'#F6F7F9',border:()=>'border:1px solid #B9C1CA;',sumPad:'5px 8px',sum:'font-size:12px;line-height:16px;color:#1E1E1E;',tixPad:'5px 8px',tix:'font-size:12px;line-height:16px;color:#1E1E1E;'},
  total:{bg:'#2E3D4F',border:'border:1px solid #2E3D4F;',pad:'6px 8px',text:'font-size:12px;line-height:16px;font-weight:bold;color:#FFFFFF;'},
  signature:{pad:'28px 32px 0 32px',size:'font-size:13px;line-height:20px;',ink:'#1E1E1E',accent:'#2E3D4F',gap:'10px',small:'font-size:12px;line-height:18px;',muted:'#59636E'},
  disclaimer:{pad:'20px 32px 24px 32px',bg:'#F6F7F9',style:'border:1px solid #D5DADF;padding:10px 12px;',text:'font-size:11px;line-height:16px;color:#59636E;'},
 },
 D:{
  greeting:{td:`padding:32px 32px 20px 32px;${F}`,p:'font-size:14px;line-height:22px;color:#1E2A28;',gap:'8px'},
  section:{pad:'28px 32px 10px 32px',h2:'font-size:15px;line-height:20px;font-weight:bold;color:#1F5F55;'},
  table:'border:1px solid #CFDDD9;',numAlign:'right',
  head:{bg:'#DCE9E5',border:'',sumPad:'9px 12px',sum:'font-size:13px;line-height:18px;font-weight:bold;color:#1F5F55;',tixPad:'8px 10px',tix:'font-size:12px;line-height:16px;font-weight:bold;color:#1F5F55;'},
  row:{stripe:'#F2F7F5',border:()=>'',sumPad:'9px 12px',sum:'font-size:13px;line-height:18px;color:#1E2A28;',tixPad:'8px 10px',tix:'font-size:12px;line-height:16px;color:#1E2A28;'},
  total:{bg:'#DCE9E5',border:'border-top:1px solid #1F5F55;',pad:'9px 12px',text:'font-size:13px;line-height:18px;font-weight:bold;color:#1F5F55;'},
  signature:{pad:'32px 32px 0 32px',size:'font-size:14px;line-height:22px;',ink:'#1E2A28',accent:'#1F5F55',gap:'12px',small:'font-size:13px;line-height:20px;',muted:'#4A5A57'},
  disclaimer:{pad:'24px 32px 32px 32px',bg:'',style:'border-top:1px solid #CFDDD9;padding:12px 0 0 0;',text:'font-size:11px;line-height:16px;color:#666666;'},
 },
};

const padFor=(pad,col,cols,full=false)=>Array.isArray(pad)?(full?pad[3]:pad[col===0?0:col===cols-1?2:1]):pad;
/** One th/td. Attribute and style order follow the reference markup exactly. */
function cell(tag,o,html){
 const attrs=[o.colspan&&`colspan="${o.colspan}"`,o.align&&`align="${o.align}"`,o.valign&&`valign="${o.valign}"`,o.width&&`width="${o.width}"`,o.bg&&`bgcolor="${o.bg}"`].filter(Boolean).join(' ');
 const style=[o.width&&`width:${o.width}px;`,o.bg&&`background-color:${o.bg};`,o.border,`padding:${o.pad};`,F,o.text,o.wrap&&WRAP,o.textAlign&&`text-align:${o.textAlign};`].filter(Boolean).join('');
 return `<${tag}${attrs?' '+attrs:''} style="${style}">${html}</${tag}>`;
}
const dataTable=(t,head,rows)=>`<tr><td style="padding:0 32px;"><table width="736" cellpadding="0" cellspacing="0" border="0" style="width:736px;border-collapse:collapse;${t.table}"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></td></tr>`;
const section=(t,title)=>`<tr><td style="padding:${t.section.pad};"><h2 style="margin:0;${F}${t.section.h2}">${esc(title)}</h2></td></tr>`;

const SUMMARY_WIDTHS=[376,120,120,120];
function summaryTable(t,rows,label){
 const head=[label,'Created','Closed','Outstanding'].map((name,c)=>{const align=c?t.numAlign:'left';return cell('th',{align,width:SUMMARY_WIDTHS[c],bg:t.head.bg,border:t.head.border,pad:padFor(t.head.sumPad,c,4),text:t.head.sum,textAlign:align},name);}).join('');
 const stripe=i=>i%2?t.row.stripe:'';
 const body=rows.map((r,i)=>`<tr>${[r.name,r.created,r.closed,r.outstanding].map((value,c)=>cell('td',{align:c?t.numAlign:'',bg:stripe(i),border:t.row.border(i,i===rows.length-1),pad:padFor(t.row.sumPad,c,4),text:t.row.sum,wrap:!c,textAlign:c?t.numAlign:''},c?esc(value):cellText(value,SUMMARY_WIDTHS[0],padFor(t.row.sumPad,0,4),t.row.sum))).join('')}</tr>`);
 if(!rows.length)body.push(`<tr>${cell('td',{colspan:4,border:t.row.border(0,true),pad:padFor(t.row.sumPad,0,4,true),text:t.row.sum},'No tickets matched the selected scope.')}</tr>`);
 const totals=rows.reduce((sum,r)=>[sum[0]+count(r.created),sum[1]+count(r.closed),sum[2]+count(r.outstanding)],[0,0,0]);
 body.push(`<tr>${['TOTAL',...totals].map((value,c)=>cell('td',{align:c?t.numAlign:'',bg:t.total.bg,border:t.total.border,pad:padFor(t.total.pad,c,4),text:t.total.text,textAlign:c?t.numAlign:''},value)).join('')}</tr>`);
 return dataTable(t,head,body);
}
const TICKET_HEADS=['Ticket ID','Type','Summary','Assignee','Assigned group','Current status'],TICKET_WIDTHS=[132,108,198,96,116,86];
function ticketTable(t,tickets,heads=TICKET_HEADS,widths=TICKET_WIDTHS,empty='No tickets were created on this date.',lineBreaks=false){
 const cols=heads.length;
 const head=heads.map((name,c)=>cell('th',{align:'left',width:widths[c],bg:t.head.bg,border:t.head.border,pad:padFor(t.head.tixPad,c,cols),text:t.head.tix,textAlign:'left'},name)).join('');
 const body=tickets.map((values,i)=>`<tr>${values.map((value,c)=>cell('td',{valign:'top',bg:i%2?t.row.stripe:'',border:t.row.border(i,false),pad:padFor(t.row.tixPad,c,cols),text:t.row.tix,wrap:true},(lineBreaks?String(value).split('\n').map(line=>cellText(line,widths[c],padFor(t.row.tixPad,c,cols),t.row.tix)).join('<br />'):cellText(value,widths[c],padFor(t.row.tixPad,c,cols),t.row.tix)))).join('')}</tr>`);
 // Empty state: one full-width row styled as a normal data row.
 if(!tickets.length)body.push(`<tr>${cell('td',{colspan:cols,valign:'top',border:t.row.border(0,false),pad:padFor(t.row.tixPad,0,cols,true),text:t.row.tix},empty)}</tr>`);
 return dataTable(t,head,body);
}

const inner=html=>`<tr><td style="padding:0 32px;"><table role="presentation" width="736" cellpadding="0" cellspacing="0" border="0" style="width:736px;border-collapse:collapse;"><tbody><tr>${html}</tr></tbody></table></td></tr>`;
const HEADERS={
 A:(title,caption)=>inner(`<td bgcolor="#1B3A5C" style="background-color:#1B3A5C;padding:18px 24px;${F}"><h1 style="margin:0;${F}font-size:22px;line-height:28px;font-weight:bold;color:#FFFFFF;">${title}</h1><p style="margin:4px 0 0 0;${F}font-size:13px;line-height:18px;color:#C8D3E0;">${caption}</p></td>`),
 B:(title,caption)=>`<tr><td style="padding:0 32px;${F}"><table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0" style="width:48px;border-collapse:collapse;"><tbody><tr><td height="3" bgcolor="#0B5CAD" style="height:3px;background-color:#0B5CAD;font-size:1px;line-height:3px;mso-line-height-rule:exactly;">&nbsp;</td></tr></tbody></table><h1 style="margin:14px 0 0 0;${F}font-size:24px;line-height:30px;font-weight:bold;color:#1F2328;">${title}</h1><p style="margin:6px 0 0 0;${F}font-size:13px;line-height:18px;color:#57606A;">${caption}</p></td></tr>`,
 C:(title,caption)=>inner(`<td style="border-bottom:1px solid #B9C1CA;padding:0 0 12px 0;${F}"><h1 style="margin:0;${F}font-size:20px;line-height:26px;font-weight:bold;color:#2E3D4F;">${title}</h1><p style="margin:4px 0 0 0;${F}font-size:12px;line-height:16px;color:#59636E;">${caption}</p></td>`),
 D:(title,caption)=>inner(`<td bgcolor="#EEF4F2" style="background-color:#EEF4F2;border:1px solid #CFDDD9;padding:20px 24px;${F}"><h1 style="margin:0;${F}font-size:22px;line-height:28px;font-weight:bold;color:#1F5F55;">${title}</h1><p style="margin:4px 0 0 0;${F}font-size:13px;line-height:18px;color:#4A5A57;">${caption}</p></td>`),
};
const spacer=width=>`<td width="${width}" style="width:${width}px;font-size:0;line-height:0;">&nbsp;</td>`;
const kpiRow=(pad,border,cells)=>`<tr><td style="padding:${pad};"><table role="presentation" width="736" cellpadding="0" cellspacing="0" border="0" style="width:736px;border-collapse:collapse;${border}"><tbody><tr>${cells}</tr></tbody></table></td></tr>`;
const KPIS={
 // Three navy-on-grey cards with 23px spacer cells.
 A:kpis=>kpiRow('24px 32px 0 32px','',kpis.map(([label,n])=>`<td width="230" align="center" valign="top" bgcolor="#F4F6F9" style="width:230px;background-color:#F4F6F9;border:1px solid #D3DAE2;padding:16px 8px;${F}text-align:center;"><p style="margin:0;${F}font-size:30px;line-height:36px;font-weight:bold;color:#1B3A5C;">${esc(n)}</p><p style="margin:4px 0 0 0;${F}font-size:12px;line-height:16px;color:#555F6B;">${label}</p></td>`).join(spacer(23))),
 // Ruled strip; the Outstanding figure carries the blue accent.
 B:kpis=>kpiRow('24px 32px 0 32px','border-top:1px solid #D0D7DE;border-bottom:1px solid #D0D7DE;',kpis.map(([label,n],i)=>`<td width="${i===2?246:245}" valign="top" style="width:${i===2?246:245}px;${i?'border-left:1px solid #D0D7DE;padding:16px 20px;':'padding:16px 20px 16px 0;'}${F}"><p style="margin:0;${F}font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#57606A;">${label}</p><p style="margin:6px 0 0 0;${F}font-size:32px;line-height:36px;font-weight:bold;color:${i===2?'#0B5CAD':'#1F2328'};">${esc(n)}</p></td>`).join('')),
 // Three 236px boxed cards: label bar above the number, 14px spacer cells.
 C:kpis=>kpiRow('20px 32px 0 32px','',kpis.map(([label,n])=>`<td width="236" valign="top" style="width:236px;"><table role="presentation" width="236" cellpadding="0" cellspacing="0" border="0" style="width:236px;border-collapse:collapse;border:1px solid #2E3D4F;"><tbody><tr><td bgcolor="#2E3D4F" style="background-color:#2E3D4F;padding:6px 10px;${F}font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#FFFFFF;">${label}</td></tr><tr><td style="padding:10px;${F}font-size:28px;line-height:32px;font-weight:bold;color:#2E3D4F;">${esc(n)}</td></tr></tbody></table></td>`).join(spacer(14))),
 // Three 236px tinted panels: number beside its label, 14px spacer cells.
 D:kpis=>kpiRow('20px 32px 0 32px','',kpis.map(([label,n])=>`<td width="236" valign="middle" bgcolor="#EEF4F2" style="width:236px;background-color:#EEF4F2;padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td width="44" valign="middle" style="width:44px;${F}font-size:30px;line-height:34px;font-weight:bold;color:#1F5F55;">${esc(n)}</td><td valign="middle" style="padding:0 0 0 8px;${F}font-size:13px;line-height:17px;color:#1E2A28;">${label}</td></tr></tbody></table></td>`).join(spacer(14))),
};
const bar=height=>`<tr><td height="${height}" bgcolor="#2E3D4F" style="height:${height}px;background-color:#2E3D4F;font-size:1px;line-height:${height}px;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
// Variant C only: accent bar plus the logo placeholder cell and report date, as in the reference.
const topBar=(date,title='Daily Ticket Report',dateLabel='Report date: ')=>`${bar(6)}<tr><td style="padding:14px 32px;border-bottom:1px solid #D5DADF;"><table role="presentation" width="736" cellpadding="0" cellspacing="0" border="0" style="width:736px;border-collapse:collapse;"><tbody><tr><td width="120" height="36" align="center" valign="middle" bgcolor="#F6F7F9" style="width:120px;height:36px;background-color:#F6F7F9;border:1px solid #B9C1CA;${F}font-size:11px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#59636E;text-align:center;">LOGO</td><td align="right" valign="middle" style="padding:0 0 0 16px;${F}text-align:right;"><p style="margin:0;${F}font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#2E3D4F;">${title}</p><p style="margin:2px 0 0 0;${F}font-size:12px;line-height:16px;color:#59636E;">${dateLabel}${date}</p></td></tr></tbody></table></td></tr>`;

/** Selected signature profile (sanitized rich HTML, logo included) or the structured sender block. Blank sender lines are omitted. */
function signatureRow(t,data){
 const s=t.signature;
 if(data.signatureHtml)return `<tr><td style="padding:${s.pad};${F}${s.size}color:${s.ink};">${data.signatureHtml}</td></tr>`;
 const sender=data.sender,contact=[sender.company,sender.phone].filter(Boolean).map(esc).join(' · ');
 const lines=[sender.name&&{html:esc(sender.name),style:`${s.size}font-weight:bold;color:${s.accent};`},sender.title&&{html:esc(sender.title),style:`${s.small}color:${s.muted};`},contact&&{html:contact,style:`${s.small}color:${s.muted};`}].filter(Boolean);
 return `<tr><td style="padding:${s.pad};${F}"><p style="margin:0;${F}${s.size}color:${s.ink};">Best regards,</p>${lines.map((line,i)=>`<p style="margin:${i?'0':s.gap+' 0 0 0'};${F}${line.style}">${line.html}</p>`).join('')}</td></tr>`;
}
const disclaimerRow=(t,html)=>{const d=t.disclaimer;return `<tr><td style="padding:${d.pad};"><table role="presentation" width="736" cellpadding="0" cellspacing="0" border="0" style="width:736px;border-collapse:collapse;"><tbody><tr><td${d.bg?` bgcolor="${d.bg}"`:''} style="${d.bg?`background-color:${d.bg};`:''}${d.style}${F}${d.text}">${html}</td></tr></tbody></table></td></tr>`;};

export function renderThemedEmail(report,settings={},filters={},variant='A'){
 const v=normalizeVariant(variant),t=THEMES[v],d=dataFor(report,settings,filters),date=esc(d.reportDate),title=`BMC Daily Ticket Report — ${date}`;
 const body=[
  v==='C'?topBar(date):'',
  `<tr><td style="${t.greeting.td}"><p style="margin:0 0 ${t.greeting.gap} 0;${F}${t.greeting.p}">${multiline(d.greeting)}</p><p style="margin:0;${F}${t.greeting.p}">${multiline(d.introLine)}</p></td></tr>`,
  HEADERS[v](title,softBreak(esc(d.caption),640,13)),
  KPIS[v](d.kpis),
  section(t,'Summary by assigned group'),summaryTable(t,d.byGroup,'Assigned group'),
  section(t,'Summary by ticket type'),summaryTable(t,d.byType,'Ticket type'),
  section(t,`Tickets created on ${d.reportDate} (${d.createdTickets.length})`),ticketTable(t,d.createdTickets),
  signatureRow(t,d),
  disclaimerRow(t,esc(d.disclaimer)),
  v==='C'?bar(4):'',
 ].join('');
 return `${DOCTYPE}<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head><body style="margin:0;padding:0;background-color:#FFFFFF;"><table role="presentation" width="800" cellpadding="0" cellspacing="0" border="0" style="width:800px;background-color:#FFFFFF;border-collapse:collapse;"><tbody>${body}</tbody></table></body></html>`;
}

const decodeEntities=v=>v.replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function plainSignature(settings,sender){
 const profile=settings.signatures?.find(s=>s.id&&s.id===settings.signatureId);
 const fromHtml=html=>decodeEntities(String(html||'').replace(/<br\b[^>]*>|<\/(?:p|div|tr|li)>/gi,'\n').replace(/<[^>]*>/g,''));
 const lines=(profile?String(profile.content||'').trim()||fromHtml(profile.html):'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(lines.length)return lines;
 return ['Best regards,',sender.name,sender.title,[sender.company,sender.phone].filter(Boolean).join(' · ')].filter(Boolean);
}
/**
 * Plain-text version of the same email for the clipboard's text/plain part.
 * Built from the report data (never by stripping the HTML), so values are
 * unescaped and no markup, entities or layout placeholders leak in.
 */
export function renderPlainText(report,settings={},filters={}){
 const d=dataFor(report,settings,filters);
 const summary=(title,rows)=>{
  const totals=rows.reduce((sum,r)=>[sum[0]+count(r.created),sum[1]+count(r.closed),sum[2]+count(r.outstanding)],[0,0,0]);
  const line=(name,created,closed,outstanding)=>`- ${text(name)}: Created ${text(created)} | Closed ${text(closed)} | Outstanding ${text(outstanding)}`;
  return [title,...(rows.length?rows.map(r=>line(r.name,r.created,r.closed,r.outstanding)):['No tickets matched the selected scope.']),line('TOTAL',...totals)];
 };
 return [
  d.greeting,d.introLine,'',
  `BMC Daily Ticket Report — ${d.reportDate}`,d.caption,'',
  ...d.kpis.map(([label,n])=>`${label}: ${text(n)}`),'',
  ...summary('Summary by assigned group',d.byGroup),'',
  ...summary('Summary by ticket type',d.byType),'',
  `Tickets created on ${d.reportDate} (${d.createdTickets.length})`,
  ...(d.createdTickets.length?d.createdTickets.map((values,i)=>`${i+1}. ${values.map(text).join(' | ')}`):['No tickets were created on this date.']),'',
  ...plainSignature(settings,d.sender),'',
  d.disclaimer,
 ].join('\n');
}

/** Two-column summaries for the outstanding view, styled with the same themes. */
function pendingSummaryTable(t,rows,label){
 const widths=[616,120];
 const head=[label,'Outstanding'].map((name,c)=>cell('th',{align:c?t.numAlign:'left',width:widths[c],bg:t.head.bg,border:t.head.border,pad:padFor(t.head.sumPad,c,2),text:t.head.sum,textAlign:c?t.numAlign:'left'},name)).join('');
 const body=rows.map((r,i)=>`<tr>${[r.name,r.count].map((value,c)=>cell('td',{align:c?t.numAlign:'',bg:i%2?t.row.stripe:'',border:t.row.border(i,i===rows.length-1),pad:padFor(t.row.sumPad,c,2),text:t.row.sum,wrap:!c,textAlign:c?t.numAlign:''},cellText(value,widths[c],padFor(t.row.sumPad,c,2),t.row.sum))).join('')}</tr>`);
 if(!rows.length)body.push(`<tr>${cell('td',{colspan:2,border:t.row.border(0,true),pad:padFor(t.row.sumPad,0,2,true),text:t.row.sum},'No outstanding tickets in this selection.')}</tr>`);
 body.push(`<tr>${['TOTAL',rows.reduce((sum,r)=>sum+r.count,0)].map((value,c)=>cell('td',{align:c?t.numAlign:'',bg:t.total.bg,border:t.total.border,pad:padFor(t.total.pad,c,2),text:t.total.text,textAlign:c?t.numAlign:''},esc(value))).join('')}</tr>`);
 return dataTable(t,head,body);
}

export function renderPendingEmail(view,settings={},variant='A'){
 const v=normalizeVariant(variant),t=THEMES[v],title='BMC Outstanding Tickets';
 const columns=pendingColumns(settings.showEngineer===true);
 const d={sender:normalizeSender(settings.emailSender),signatureHtml:selectedSignatureHtml(settings)};
 const body=[
  v==='C'?topBar('Uploaded export snapshot','Outstanding Tickets',''):'',
  `<tr><td style="${t.greeting.td}"><p style="margin:0 0 ${t.greeting.gap} 0;${F}${t.greeting.p}">${multiline(settings.greeting||'Hi Team,')}</p><p style="margin:0;${F}${t.greeting.p}">${softBreak(multiline(settings.pendingIntro||PENDING_INTRO),640,14)}</p></td></tr>`,
  HEADERS[v](title,softBreak(esc(pendingCaption(view)),640,13)),
  KPIS[v]([['Outstanding',view.total],['Incidents',view.incidents],['Service requests &amp; other',view.other]]),
  section(t,'Outstanding by assigned group'),pendingSummaryTable(t,view.byGroup,'Assigned group'),
  section(t,'Outstanding by status'),pendingSummaryTable(t,view.byStatus,'Status'),
  section(t,`Outstanding tickets (${view.total})`),ticketTable(t,view.tickets.map(ticket=>pendingTicketValues(ticket,settings.showEngineer===true)),columns.map(c=>c.label),columns.map(c=>c.width),'There are no outstanding tickets for this selection.',true),
  signatureRow(t,d),disclaimerRow(t,esc(pendingDisclaimer(view))),v==='C'?bar(4):'',
 ].join('');
 return `${DOCTYPE}<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title></head><body style="margin:0;padding:0;background-color:#FFFFFF;"><table role="presentation" width="800" cellpadding="0" cellspacing="0" border="0" style="width:800px;background-color:#FFFFFF;border-collapse:collapse;"><tbody>${body}</tbody></table></body></html>`;
}

export function renderPendingPlainText(view,settings={}){
 const summary=(title,rows)=>[title,...rows.map(row=>`- ${row.name}: ${row.count}`),`TOTAL: ${view.total}`];
 const columns=pendingColumns(settings.showEngineer===true);
 return [settings.greeting||'Hi Team,',settings.pendingIntro||PENDING_INTRO,'',
  'BMC Outstanding Tickets',pendingCaption(view),'',
  `Outstanding: ${view.total}`,`Incidents: ${view.incidents}`,`Service requests & other: ${view.other}`,'',
  ...summary('Outstanding by assigned group',view.byGroup),'',...summary('Outstanding by status',view.byStatus),'',
  `Outstanding tickets (${view.total})`,columns.map(c=>c.label).join(' | '),
  ...(view.total?view.tickets.map((ticket,i)=>`${i+1}. ${pendingTicketValues(ticket,settings.showEngineer===true).join(' | ')}`):['There are no outstanding tickets for this selection.']),'',
  ...plainSignature(settings,normalizeSender(settings.emailSender)),'',pendingDisclaimer(view),
 ].join('\n');
}

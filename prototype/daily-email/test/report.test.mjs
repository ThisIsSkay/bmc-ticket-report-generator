import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,detectColumns,normalizeTickets,generateReport,dateOnly,mandatoryColumns,updateReportWarnings} from '../lib/report-core.mjs';
import {renderEmail,renderEml,renderPlainText} from '../lib/mail.mjs';
import {normalizeSender,normalizeVariant,senderWarning,introSentence,scopeCaption,softBreak} from '../lib/email-themes.mjs';
import {sanitizeSignatureHtml,signatureEmailHtml} from '../lib/signature-html.mjs';
import {renderClassicOutlookScript} from '../lib/classic-outlook.mjs';
import {parseXlsx} from '../lib/xlsx-lite.mjs';
import {createDebouncedSaver,normalizeSettings} from '../lib/settings-persistence.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const data=`Ticket ID,Submit Date,Resolved Date,Last Modified Date,Status,Assigned Engineer,Assigned Group,Description,Incident Type,Contract Number\nINC001,2026-11-10,,,Pending,Alex,EUC,Problem,Incident,AAA\nINC002,2026-11-09,2026-11-10,,Resolved,Alex,EUC,Resolved matter,Incident,AAA\nSRV003,2026-11-10,2026-11-10,,Closed,Sam,System,New and closed,Service Request,AAA\nINC004,2026-11-10,,,Cancelled,Alex,EUC,Cancelled today,Incident,AAA\nEVT005,2026-11-10,,,Pending,Bot,NOC,noise,Event,AAA`;
const {headers,rows}=parseCsv(data);const tickets=normalizeTickets(rows,detectColumns(headers));const report=generateReport(tickets,{reportDate:'2026-11-10'});
test('date parsing rejects impossible dates and handles Excel serials',()=>{assert.equal(dateOnly('2026-02-30'),null);assert.equal(dateOnly(45000),'2023-03-15');assert.equal(dateOnly('10/11/2026'),'2026-10-11')});
test('new/closed include both lifecycle events and skip monitoring',()=>{assert.equal(report.counts.created,3);assert.equal(report.counts.closed,2);assert.equal(report.counts.pending,1);assert.equal(report.created.filter(t=>t.id==='SRV003').length,1);assert.equal(report.closed.filter(t=>t.id==='SRV003').length,1)});
test('group pivot reconciles with created/closed/pending',()=>{assert.deepEqual(report.pivot.reduce((acc,r)=>acc.map((x,i)=>x+[r.created,r.closed,r.pending][i]),[0,0,0]),[3,2,1])});
test('email HTML escapes user-controlled descriptions',()=>{const t={...report,created:report.created.map(v=>({...v,description:'<script>alert("x")</script>'}))};const html=renderEmail(t,{greeting:'Hi',signatures:[],signatureId:''},{excludeEvents:true});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)});
test('email themes escape ticket fields',()=>{const t={...report,created:report.created.map(v=>({...v,description:'Printer <HP> & "scanner"'}))};const html=renderEmail(t,{signatures:[],signatureId:''},{excludeEvents:true},'D');assert.match(html,/Printer &lt;HP&gt; &amp; &quot;scanner&quot;/);assert.doesNotMatch(html,/Printer <HP>/)});
test('eml includes unsent marker, recipients, and encoded HTML',()=>{const html=renderEmail(report,{greeting:'Hello',signatures:[]},{excludeEvents:true});const eml=renderEml(html,{to:'team@example.com',cc:'manager@example.com',subject:'BMC {date}'},'2026-11-10');assert.match(eml,/X-Unsent: 1/);assert.match(eml,/To: team@example.com/);assert.match(eml,/Subject: BMC 2026-11-10/);assert.match(eml,/Content-Transfer-Encoding: base64/);});

const VARIANTS=['A','B','C','D'];
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ol0AAAAASUVORK5CYII=';
const logoProfile={id:'logo',name:'Unnamed signature',html:'<div><b>Regards,</b><br>Example Team<br><img src="data:image/png;base64,'+PNG+'" alt="Logo"></div>'};
// The legacy layout plus every themed variant the UI can select.
for(const variant of [undefined,...VARIANTS]){
 test('rich signature PNG is attached inline with a CID reference in the EML ('+(variant||'legacy')+')',()=>{
  const settings={to:'team@example.com',subject:'BMC {date}',signatureId:'logo',signatures:[logoProfile]};
  const html=renderEmail(report,settings,{excludeEvents:true},variant);
  assert.match(html,/<b>Regards,<\/b>/);
  assert.match(html,/Example Team/);
  assert.match(html,/data:image\/png;base64/);
  const eml=renderEml(html,settings,'2026-11-10');
  assert.match(eml,/multipart\/related/);
  assert.match(eml,/Content-ID: <bmc-signature-1@local.invalid>/);
  assert.match(eml,/Content-Type: image\/png/);
  const imagePart=eml.split('Content-Disposition: inline\r\n\r\n')[1].split('\r\n--')[0].replace(/\s+/g,'');
  assert.equal(imagePart,PNG);
  const script=renderClassicOutlookScript(html,settings,'2026-11-10');
  assert.match(script,/src="cid:bmc-signature-1@local\.invalid"/);
 });
}

test('H1: an unset sender never renders bracketed placeholder text in any variant',()=>{
 for(const variant of VARIANTS){
  for(const settings of [{signatures:[],signatureId:''},{signatures:[],signatureId:'',emailSender:{name:'  ',title:'',company:null}},{signatures:[{id:'support',name:'Unnamed signature',content:'x'}],signatureId:''}]){
   const html=renderEmail(report,settings,{excludeEvents:true},variant);
   assert.doesNotMatch(html,/\[/,variant);
   assert.doesNotMatch(html,/Company name|Office phone|Unnamed signature|IT Support Team|BMC Service Desk/,variant);
   assert.match(html,/Best regards,/,variant);
  }
 }
});
test('H1: a configured sender renders verbatim and HTML-escaped; blank lines are omitted',()=>{
 const emailSender={name:'Alex <Example>',title:'IT Executive & "Lead"',company:"Example Pte Ltd",phone:''};
 for(const variant of VARIANTS){
  const html=renderEmail(report,{signatures:[],signatureId:'',emailSender},{excludeEvents:true},variant);
  assert.match(html,/>Alex &lt;Example&gt;<\/p>/,variant);
  assert.match(html,/>IT Executive &amp; &quot;Lead&quot;<\/p>/,variant);
  assert.match(html,/>Example Pte Ltd<\/p>/,variant);
  assert.doesNotMatch(html,/Alex <Example>/,variant);
  assert.doesNotMatch(html,/ · <\/p>|<p[^>]*><\/p>/,variant);
  const full=renderEmail(report,{signatures:[],signatureId:'',emailSender:{...emailSender,phone:'6000 0000'}},{excludeEvents:true},variant);
  assert.match(full,/>Example Pte Ltd · 6000 0000<\/p>/,variant);
 }
});
test('H1: sender warning shows while details are incomplete and no signature profile is selected',()=>{
 assert.deepEqual(normalizeSender(undefined),{name:'',title:'',company:'',phone:''});
 assert.deepEqual(normalizeSender({name:' Alex Example ',phone:6000}),{name:'Alex Example',title:'',company:'',phone:'6000'});
 assert.match(senderWarning({}),/missing: sender name, job title, company, office phone/);
 assert.match(senderWarning({emailSender:{name:'Alex Example',title:'IT Executive',company:'Example Pte Ltd'}}),/missing: office phone\)/);
 assert.equal(senderWarning({emailSender:{name:'Alex Example',title:'IT Executive',company:'Example Pte Ltd',phone:'6000 0000'}}),'');
 assert.equal(senderWarning({signatureId:'logo',signatures:[logoProfile]}),'');
 assert.notEqual(senderWarning({signatureId:'gone',signatures:[logoProfile]}),'');
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8'),page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['senderName','senderTitle','senderCompany','senderPhone','senderWarning'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(app,/emailSender:normalizeSender\(\{name:\$\('senderName'\)\.value/);
 // Load and import both go through normalizeSettings(), which keeps emailSender.
 assert.match(app,/state\.settings=normalizeSettings\(\{\.\.\.settings,/);
 assert.deepEqual(normalizeSettings({emailSender:{name:' Alex Example ',phone:null}},{emailSender:{},signatures:[]}).emailSender,{name:'Alex Example',title:'',company:'',phone:''});
 assert.match(app,/exportSettings'.*JSON\.stringify\(\{version:1,settings:state\.settings\}/);
 assert.doesNotMatch(readFileSync(new URL('../lib/email-themes.mjs',import.meta.url),'utf8'),/\[Company name\]|\[Office phone\]/);
});
test('H2: a selected signature profile replaces the sender block, with Arial on p/div/td/th',()=>{
 const profile={id:'rich',name:'Unnamed signature',html:'<p style="font-family:Calibri;color:#333333">Kind regards,</p><table><tr><td>Example Service Desk</td><th style="color:#111111">Ext 100</th></tr></table><div>Level 1</div>'};
 const settings={signatureId:'rich',signatures:[profile],emailSender:{name:'Alex Example',title:'IT Executive',company:'Example Pte Ltd',phone:'6000 0000'}};
 for(const variant of VARIANTS){
  const html=renderEmail(report,settings,{excludeEvents:true},variant);
  assert.match(html,/<p style="color:#333333;font-family:Arial,Helvetica,sans-serif">Kind regards,<\/p>/,variant);
  assert.match(html,/<td style="font-family:Arial,Helvetica,sans-serif">Example Service Desk<\/td>/,variant);
  assert.match(html,/<th style="color:#111111;font-family:Arial,Helvetica,sans-serif">Ext 100<\/th>/,variant);
  assert.match(html,/<div style="font-family:Arial,Helvetica,sans-serif">Level 1<\/div>/,variant);
  assert.doesNotMatch(html,/Calibri|Unnamed signature|Alex Example|Best regards,/,variant);
 }
 // A plain-text-only profile still renders; an empty one falls back to the sender block.
 const plain=renderEmail(report,{signatureId:'p',signatures:[{id:'p',name:'x',content:'Thanks,\nExample <Desk>'}]},{excludeEvents:true},'B');
 assert.match(plain,/Thanks,<br>Example &lt;Desk&gt;/);
 const empty=renderEmail(report,{signatureId:'e',signatures:[{id:'e',name:'x',html:'<div><br></div>'}],emailSender:{name:'Alex Example'}},{excludeEvents:true},'B');
 assert.match(empty,/Best regards,/);assert.match(empty,/>Alex Example<\/p>/);
});
test('H2: signature markup is allowlist-sanitized without a DOM and cannot break the email layout',()=>{
 const hostile='<div onclick="x()" class="k" style="position:fixed;color:#111111;background:url(x)">Hi<script>alert(1)</script><style>p{}</style>'
  +'<img src="https://example.com/a.png"><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://example.com/?a=1&amp;b=2">ok</a>'
  +'<iframe src="x"></iframe><span>a < b</span></td></tr></table></div></div><meta charset="x"><p>tail';
 const clean=sanitizeSignatureHtml(hostile);
 assert.equal(clean,'<div style="color:#111111">Hi<a>bad</a><a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a><span>a &lt; b</span></div><p>tail</p>');
 assert.equal(sanitizeSignatureHtml(clean),clean);
 assert.equal(signatureEmailHtml('<td colspan="2" rowspan="99">x'),'<td colspan="2" style="font-family:Arial,Helvetica,sans-serif">x</td>');
 assert.equal(signatureEmailHtml('<img src="data:image/png;base64,'+PNG+'">'),'<img src="data:image/png;base64,'+PNG+'" alt="Signature image" style="max-width:100%;height:auto">');
});


/* ---------- Theme hardening: every check runs for all four variants ---------- */
/** Tiny tag walker for the generated email: elements with attributes, parent links and direct (own) text. */
function parseElements(html){
 const elements=[],stack=[],re=/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,VOID=new Set(['br','img','meta']);
 let pos=0,m;
 const addText=chunk=>{if(stack.length)stack[stack.length-1].ownText+=chunk;};
 while((m=re.exec(html))){
  addText(html.slice(pos,m.index));pos=re.lastIndex;
  if(!m[2])continue;
  const tag=m[2].toLowerCase();
  if(m[1]){while(stack.length&&stack.pop().tag!==tag);continue;}
  const attrs={};for(const a of m[3].matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g))attrs[a[1].toLowerCase()]=a[2];
  const element={tag,attrs,ownText:'',parent:stack[stack.length-1]||null,children:[]};
  if(element.parent)element.parent.children.push(element);
  elements.push(element);
  if(!VOID.has(tag)&&!/\/\s*$/.test(m[3]))stack.push(element);
 }
 return elements;
}
const declarations=style=>String(style||'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const at=part.indexOf(':');return [part.slice(0,at).trim().toLowerCase(),part.slice(at+1).trim()];});
const meaningful=textNode=>textNode.replace(/&nbsp;|&#8203;|\s/g,'');
const textTokens=html=>html.slice(html.indexOf('<body')).replace(/&#8203;/g,'').split(/<[^>]*>/).map(t=>t.trim()).filter(t=>t&&t!=='&nbsp;');
const NUMBER_BEFORE_LABEL={A:true,B:false,C:false,D:true};
/** KPI values, both TOTAL rows and created-ticket row count, read back out of the rendered HTML. */
function figures(html,variant){
 const tokens=textTokens(html);
 const kpis=['Created on date','Closed/resolved','Outstanding'].map(label=>{const at=tokens.indexOf(label);assert.ok(at>0,label);return tokens[at+(NUMBER_BEFORE_LABEL[variant]?-1:1)];});
 const totals=tokens.map((t,i)=>t==='TOTAL'?tokens.slice(i+1,i+4):null).filter(Boolean);
 const tables=parseElements(html).filter(e=>e.tag==='table'&&!e.attrs.role);
 const rowsOf=table=>table.children.find(c=>c.tag==='tbody').children;
 return {kpis,totals,tables,rowsOf,ticketRows:rowsOf(tables[2]).filter(row=>!row.children[0].attrs.colspan),heading:/Tickets created on [\d-]+ \((\d+)\)/.exec(html)[1]};
}
const HOSTILE={summary:'<script>alert("x")</script>',mixed:'Printer <HP> & "scanner"',group:'R&D <Ops> "A" \'B\'',type:'<b>Bold</b> & Type',id:'INC\'1"<x>'};
function hostileReport(){
 const created=[
  {id:HOSTILE.id,kind:HOSTILE.type,description:HOSTILE.summary,assigned:'<img src=x onerror=alert(1)>',group:HOSTILE.group,status:'Pending & <waiting>'},
  {id:'INC002',kind:'Incident',description:HOSTILE.mixed,assigned:'Alex Example',group:'EUC',status:'Assigned'},
  {id:'INC003',kind:null,description:undefined,assigned:'',group:'   ',status:null},
  {id:undefined,kind:'',description:'',assigned:undefined,group:null,status:''},
 ];
 return {reportDate:'2026-11-10',counts:{created:4,closed:3,pending:6},
  pivot:[{group:HOSTILE.group,created:1,closed:1,pending:2},{group:'EUC',created:1,closed:2,pending:3},{group:'',created:2,closed:0,pending:1}],
  byType:[{group:HOSTILE.type,created:1,closed:0,pending:1},{group:'Incident',created:1,closed:3,pending:4},{group:null,created:2,closed:0,pending:1}],
  created,closed:[]};
}
const hostileSender={emailSender:{name:'Alex <Example>',title:'IT & "Ops"',company:'Example <Pte> Ltd',phone:'6000 0000'},signatures:[],signatureId:''};
const hostileProfile={signatureId:'rich',signatures:[{id:'rich',name:'x',html:'<p>Kind regards,</p><table><tr><td>Example Desk<br><b>Level 1</b></td><th>Ext 100</th></tr></table><div>Example Pte Ltd <img src="data:image/png;base64,'+PNG+'" alt="Logo"></div>'}]};
const emptyCreated={...hostileReport(),counts:{created:0,closed:3,pending:6},created:[],pivot:hostileReport().pivot.map(r=>({...r,created:0})),byType:hostileReport().byType.map(r=>({...r,created:0}))};
const emptyScope=generateReport(tickets,{reportDate:'2031-01-01',groupFilter:'Nobody'});
const hardeningCases=[
 ['hostile data + sender block',hostileReport(),{greeting:'Hi <Team> & all,\nsecond line',intro:'Daily <b>update</b> & more.',...hostileSender},{excludeEvents:false,groupFilter:'R&D <Ops>',contractFilter:'C<1>'}],
 ['hostile data + signature profile',hostileReport(),hostileProfile,{excludeEvents:true}],
 ['no created tickets',emptyCreated,hostileSender,{excludeEvents:true}],
 ['no tickets in scope',emptyScope,{signatures:[],signatureId:''},{excludeEvents:true,groupFilter:'Nobody'}],
];
const FORBIDDEN=[/class\s*=/i,/<style/i,/display\s*:\s*flex/i,/display\s*:\s*grid/i,/float\s*:/i,/position\s*:/i,/border-radius/i,/gradient/i,/box-shadow/i,/<svg/i,/url\(/i];
for(const variant of VARIANTS){
 const rendered=hardeningCases.map(([name,r,settings,filters])=>[name,r,renderEmail(r,settings,filters,variant)]);
 test('HARDENING '+variant+' 1: no forbidden Outlook-unsafe tokens',()=>{
  for(const [name,,html] of rendered)for(const token of FORBIDDEN)assert.doesNotMatch(html,token,name);
 });
 test('HARDENING '+variant+' 2: every text-bearing p/h1/h2/td/th sets Arial in its own style',()=>{
  for(const [name,,html] of rendered){
   const textual=parseElements(html).filter(e=>['p','h1','h2','td','th'].includes(e.tag)&&meaningful(e.ownText));
   assert.ok(textual.length>=30,name+': only '+textual.length+' text elements found');
   for(const e of textual)assert.match(e.attrs.style||'',/font-family:Arial/,name+': <'+e.tag+'> "'+e.ownText.trim().slice(0,40)+'"');
  }
 });
 test('HARDENING '+variant+' 3: borders are 1px solid hex and bgcolor matches background-color',()=>{
  for(const [name,,html] of rendered){
   let borders=0,fills=0;
   for(const e of parseElements(html)){
    const style=declarations(e.attrs.style);
    for(const [property,value] of style)if(/^border(-(top|right|bottom|left))?$/.test(property)){borders++;assert.match(value,/^1px solid #[0-9A-Fa-f]{6}$/,name+': '+property+':'+value);}
    if('bgcolor' in e.attrs){fills++;assert.match(e.attrs.bgcolor,/^#[0-9A-F]{6}$/,name);assert.equal(Object.fromEntries(style)['background-color'],e.attrs.bgcolor,name+': <'+e.tag+'> bgcolor');}
    if(['td','th'].includes(e.tag)&&Object.fromEntries(style)['background-color'])assert.equal(e.attrs.bgcolor,Object.fromEntries(style)['background-color'],name+': filled cell without bgcolor');
   }
   assert.ok(borders>0&&fills>0,name);
  }
 });
 test('HARDENING '+variant+' 4: outer table is 800px and nothing else is wider than 736px',()=>{
  for(const [name,,html] of rendered){
   const all=parseElements(html),tables=all.filter(e=>e.tag==='table');
   assert.equal(tables[0].attrs.width,'800',name);
   assert.match(tables[0].attrs.style,/width:800px;/,name);
   assert.equal(tables[0].parent.tag,'body',name);
   assert.ok(tables.slice(1).some(t=>t.attrs.width==='736'),name);
   for(const e of all.filter(e=>e!==tables[0])){
    if(e.attrs.width!==undefined&&e.tag!=='img')assert.ok(Number(e.attrs.width)<=736,name+': <'+e.tag+' width='+e.attrs.width+'>');
    const width=Object.fromEntries(declarations(e.attrs.style)).width;
    if(width&&/px$/.test(width))assert.ok(parseFloat(width)<=736,name+': style width '+width);
   }
   for(const table of tables)for(const row of table.children.flatMap(section=>section.children))
    if(table.attrs.width==='736'&&row.children.every(c=>c.attrs.width))assert.equal(row.children.reduce((sum,c)=>sum+Number(c.attrs.width),0),736,name+': column widths');
  }
 });
 test('HARDENING '+variant+' 5: KPIs reconcile with both TOTAL rows and the created-ticket rows',()=>{
  for(const [name,r,html] of rendered){
   const f=figures(html,variant),expected=[r.counts.created,r.counts.closed,r.counts.pending].map(String);
   assert.deepEqual(f.kpis,expected,name);
   assert.deepEqual(f.totals,[expected,expected],name);
   assert.equal(f.ticketRows.length,r.counts.created,name);
   assert.equal(f.heading,String(r.counts.created),name);
   // Exactly three report data tables; a pasted signature may add its own table after them.
   assert.equal(f.tables.filter(t=>t.attrs.width==='736').length,3,name);
  }
 });
 test('HARDENING '+variant+' 6: ticket fields and group/type names are HTML-escaped',()=>{
  const html=rendered[0][2].replace(/&#8203;/g,'');
  for(const raw of [...Object.values(HOSTILE),'<img src=x','Pending & <waiting>','Hi <Team>','<b>update</b>','Alex <Example>','IT & "Ops"','R&D <Ops>','C<1>'])assert.ok(!html.includes(raw),'raw value leaked: '+raw);
  assert.doesNotMatch(html,/<script|<img|<b>|onerror=alert\(1\)>/i);
  const escapeHtml=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  for(const [raw,times] of [[HOSTILE.summary,1],[HOSTILE.mixed,1],[HOSTILE.id,1],[HOSTILE.group,2],[HOSTILE.type,2]])
   assert.equal(html.split('>'+escapeHtml(raw)+'</td>').length-1,times,'escaped cell for '+raw);
  assert.match(html,/Hi &lt;Team&gt; &amp; all,<br \/>second line<\/p>/);
  assert.match(html,/Group: R&amp;D &lt;Ops&gt; · Contract: C&lt;1&gt;<\/p>/);
  assert.match(html,/>Alex &lt;Example&gt;<\/p>/);
  // The signature-profile case keeps its own (sanitized) markup and logo.
  assert.match(rendered[1][2],/<b>Level 1<\/b>/);assert.match(rendered[1][2],/<img src="data:image\/png;base64,/);
 });
 test('HARDENING '+variant+' 7: missing values render as an em dash, never undefined/null/NaN/[object',()=>{
  for(const [name,,html] of rendered)assert.doesNotMatch(html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g,''),/undefined|null|NaN|\[object/,name);
  const f=figures(rendered[0][2],variant),cellsOf=row=>row.children.map(c=>c.ownText);
  assert.deepEqual(cellsOf(f.ticketRows[2]),['INC003','—','—','—','—','—']);
  assert.deepEqual(cellsOf(f.ticketRows[3]),['—','—','—','—','—','—']);
  assert.equal(f.rowsOf(f.tables[0])[2].children[0].ownText,'—');
  assert.equal(f.rowsOf(f.tables[1])[2].children[0].ownText,'—');
  const gaps=renderEmail({reportDate:'2026-11-10',counts:{},pivot:[{group:'EUC',created:undefined,closed:null,pending:NaN}],byType:[],created:[]},{signatures:[]},{},variant);
  assert.doesNotMatch(gaps,/undefined|null|NaN|\[object/);
  assert.deepEqual(figures(gaps,variant).kpis,['—','—','—']);
  assert.deepEqual(figures(gaps,variant).totals[0],['0','0','0']);
 });
 test('HARDENING '+variant+' 8: empty states for no created tickets and no tickets in scope',()=>{
  for(const [name,,html] of rendered.slice(2)){
   const f=figures(html,variant),rows=f.rowsOf(f.tables[2]);
   assert.equal(rows.length,1,name);assert.equal(rows[0].children.length,1,name);
   assert.equal(rows[0].children[0].attrs.colspan,'6',name);
   assert.equal(rows[0].children[0].ownText,'No tickets were created on this date.',name);
   assert.match(html,/Tickets created on [\d-]+ \(0\)<\/h2>/,name);
  }
  const f=figures(rendered[3][2],variant);
  assert.deepEqual(f.kpis,['0','0','0']);
  assert.deepEqual(f.totals,[['0','0','0'],['0','0','0']]);
  for(const table of f.tables.slice(0,2)){
   const rows=f.rowsOf(table);
   assert.equal(rows.length,2);
   assert.equal(rows[0].children[0].attrs.colspan,'4');
   assert.equal(rows[0].children[0].ownText,'No tickets matched the selected scope.');
   assert.equal(rows[1].children[0].ownText,'TOTAL');
  }
 });
}

test('M1: default and custom intros never produce a broken ". for" sentence',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const appDefault=/intro:'([^']+)'/.exec(app)[1];
 assert.match(appDefault,/\.$/);
 const intros=[undefined,'',appDefault,'Daily update.','Daily update...  ','Here is the report!','Summary:','No punctuation','Report for {date} follows.','...'];
 for(const variant of VARIANTS)for(const intro of intros){
  const html=renderEmail(report,{intro,signatures:[],signatureId:''},{excludeEvents:true},variant);
  assert.doesNotMatch(html,/[.!?:;,] for /,variant+' '+intro);
  assert.doesNotMatch(html,/\{date\}/);
  assert.equal((html.match(/10 November 2026/g)||[]).length,1,variant+' '+intro);
 }
 assert.equal(introSentence(appDefault,'10 November 2026'),'Please find below the daily BMC ticket activity report for 10 November 2026.');
 assert.equal(introSentence('Report for {date} follows.','10 November 2026'),'Report for 10 November 2026 follows.');
 assert.equal(introSentence('...','10 November 2026'),'Please find below the daily ticket activity summary for 10 November 2026.');
});
test('M2: caption and disclaimer state the scope that was actually applied',()=>{
 const withEvents=generateReport(tickets,{reportDate:'2026-11-10',excludeEvents:false,groupFilter:'NOC'});
 for(const variant of VARIANTS){
  const html=renderEmail(withEvents,{signatures:[],signatureId:''},{excludeEvents:false,groupFilter:'NOC',contractFilter:'All'},variant);
  assert.match(html,/EVT005/,variant);
  assert.doesNotMatch(html,/excluded|exclude monitoring/i,variant);
  assert.match(html,/>Daily ticket activity · Group: NOC<\/p>/,variant);
  assert.match(html,/\(SGT\) and include monitoring events\./,variant);
  const scoped=renderEmail(report,{signatures:[],signatureId:''},{excludeEvents:true,groupFilter:'A&B <x>',contractFilter:'AAA'},variant);
  assert.match(scoped,/>Daily ticket activity · Group: A&amp;B &lt;x&gt; · Contract: AAA · Monitoring events excluded<\/p>/,variant);
  assert.match(scoped,/\(SGT\) and exclude monitoring events\./,variant);
 }
 assert.equal(scopeCaption({groupFilter:'All',contractFilter:'All',excludeEvents:true}),'Daily ticket activity · Monitoring events excluded');
 assert.equal(scopeCaption(),'Daily ticket activity');
});
const designDoc=name=>readFileSync(new URL('../../../docs/email-design/'+name,import.meta.url),'utf8');
test('M7: design fixtures carry only the fictional sender',()=>{
 const sample=JSON.parse(designDoc('sample-data.json'));
 assert.equal(sample.sender.name,'Alex Example');
 assert.equal(sample.sender.title,'IT Executive');
 for(const variant of VARIANTS){
  const block=designDoc('reference/variant-'+variant+'.html').split('>Best regards,</p>')[1].split('</td>')[0];
  assert.deepEqual([...block.matchAll(/<p style="[^"]*">([^<]*)<\/p>/g)].map(m=>m[1]).slice(0,2),['Alex Example','IT Executive'],variant);
 }
});
/** Report + settings built from the fictional design fixture (docs/email-design/sample-data.json). */
function sampleFixture(){
 const sample=JSON.parse(designDoc('sample-data.json')),rows=list=>list.map(r=>({group:r.name,created:r.created,closed:r.closed,pending:r.outstanding}));
 return {
  report:{reportDate:sample.reportDate,counts:{created:sample.kpis.createdOnDate,closed:sample.kpis.closedResolved,pending:sample.kpis.outstanding},pivot:rows(sample.byGroup),byType:rows(sample.byType),
   created:sample.createdTickets.map(t=>({id:t.id,kind:t.type,description:t.summary,assigned:t.assignee,group:t.group,status:t.status}))},
  settings:{greeting:'Hi Team,',intro:'Please find below the daily ticket activity summary.',emailSender:sample.sender,signatures:[],signatureId:''},
 };
}
// Comments dropped, whitespace between tags collapsed. word-wrap is the one deliberate addition to the reference styles (M3).
const normalizeMarkup=html=>html.replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').replace(/word-wrap:break-word;/g,'').trim();
for(const variant of VARIANTS){
 test('M4: variant '+variant+' matches reference/variant-'+variant+'.html for sample-data.json',()=>{
  const {report:sampleReport,settings}=sampleFixture();
  const actual=normalizeMarkup(renderEmail(sampleReport,settings,{excludeEvents:true},variant));
  const expected=normalizeMarkup(designDoc('reference/variant-'+variant+'.html'));
  // The reference shows the first 3 created tickets; the real email lists all 5. Only those extra rows may differ.
  const bodyStart=actual.indexOf('<tbody>',actual.indexOf('>Ticket ID</th>'))+'<tbody>'.length,bodyEnd=actual.indexOf('</tbody>',bodyStart);
  const ticketRows=actual.slice(bodyStart,bodyEnd).split('</tr>').filter(Boolean).map(row=>row+'</tr>');
  assert.equal(ticketRows.length,5);
  const firstThree=actual.slice(0,bodyStart)+ticketRows.slice(0,3).join('')+actual.slice(bodyEnd);
  assert.deepEqual(firstThree.split('><'),expected.split('><'));
 });
}
test('M4: review findings a-e are pinned per variant',()=>{
 const {report:sampleReport,settings}=sampleFixture(),html=Object.fromEntries(VARIANTS.map(v=>[v,renderEmail(sampleReport,settings,{excludeEvents:true},v)]));
 // a) B tickets table: uppercase grey header with dark rule, light row rules, flush first/last columns.
 assert.match(html.B,/<th align="left" width="132" style="width:132px;border-bottom:1px solid #1F2328;padding:0 10px 8px 0;[^"]*text-transform:uppercase;color:#57606A;text-align:left;">Ticket ID<\/th>/);
 assert.match(html.B,/<td valign="top" style="border-bottom:1px solid #E1E5E9;padding:10px 10px 10px 0;[^"]*">INC000000412927<\/td>/);
 assert.match(html.B,/<td valign="top" style="border-bottom:1px solid #E1E5E9;padding:10px 0 10px 10px;[^"]*">Resolved<\/td><\/tr><\/tbody>/);
 assert.doesNotMatch(html.B,/#DCE9E5|#1F5F55/);
 // b) C KPI row: 236px boxed cards with a #2E3D4F label bar and 14px spacers.
 assert.equal((html.C.match(/<table role="presentation" width="236"[^>]*border:1px solid #2E3D4F;">/g)||[]).length,3);
 assert.match(html.C,/text-transform:uppercase;color:#FFFFFF;">Created on date<\/td><\/tr><tr><td style="padding:10px;[^"]*font-size:28px;line-height:32px;[^"]*">5<\/td>/);
 assert.equal((html.C.match(/<td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;<\/td>/g)||[]).length,2);
 // c) D KPI row: 236px tinted panels, vertically centred.
 assert.equal((html.D.match(/<td width="236" valign="middle" bgcolor="#EEF4F2" style="width:236px;background-color:#EEF4F2;padding:14px 16px;">/g)||[]).length,3);
 for(const v of ['C','D'])assert.doesNotMatch(html[v],/#1B3A5C|#F4F6F9/,v);
 // d) C section headings are spaced uppercase.
 assert.equal((html.C.match(/<h2 style="[^"]*letter-spacing:0\.6px;text-transform:uppercase;color:#2E3D4F;">/g)||[]).length,3);
 // e) A heading size, KPI valign, per-variant greeting colour.
 assert.match(html.A,/<h2 style="[^"]*font-size:16px;line-height:22px;/);
 assert.equal((html.A.match(/<td width="230" align="center" valign="top"/g)||[]).length,3);
 for(const [v,colour] of [['A','#222222'],['B','#1F2328'],['C','#1E1E1E'],['D','#1E2A28']])assert.match(html[v],new RegExp('color:'+colour+';">Hi Team,</p>'),v);
});
const visibleRuns=html=>html.replace(/<[^>]*>/g,' ').split(/\s+|&#8203;/).map(run=>run.replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi,'x'));
test('M3: long unbroken values always get a break opportunity and never split an entity',()=>{
 assert.equal(softBreak('short value stays'),'short value stays');
 assert.equal(softBreak('x'.repeat(24)),'x'.repeat(24));
 assert.equal(softBreak('x'.repeat(25)),'x'.repeat(20)+'&#8203;'+'x'.repeat(5));
 assert.equal(softBreak('a'.repeat(19)+'&amp;'+'b'.repeat(10)),'a'.repeat(19)+'&amp;&#8203;'+'b'.repeat(10));
 const long={summary:'S'.repeat(260),url:'https://intranet.example.com/'+'path/'.repeat(30)+'?a=1&b=<2>',group:'NCC_'+'VERYLONGGROUPNAME_'.repeat(8)};
 const t={...report,
  created:report.created.map((v,i)=>i?v:{...v,id:'INC'+'9'.repeat(40),description:long.summary,assigned:long.url,group:long.group,status:'Pending&'.repeat(10)}),
  pivot:[{...report.pivot[0],group:long.group},...report.pivot.slice(1)],byType:[{...report.byType[0],group:'&'.repeat(60)},...report.byType.slice(1)]};
 for(const variant of VARIANTS){
  const html=renderEmail(t,{signatures:[],signatureId:''},{excludeEvents:true,groupFilter:long.group},variant);
  const worst=visibleRuns(html.slice(html.indexOf('<body'))).reduce((a,b)=>a.length>=b.length?a:b,'');
  assert.ok(worst.length<=24,variant+': unbroken run of '+worst.length+' chars: '+worst);
  assert.doesNotMatch(html,/&[a-z#\d]*&#8203;[a-z#\d]*;/i,variant);
  assert.match(html,/word-wrap:break-word;/,variant);
  assert.ok(html.includes(softBreak('S'.repeat(260))),variant);
 }
});
test('M5: clipboard plain text is built from the report, unescaped, with KPIs, totals and tickets',()=>{
 const {report:sampleReport,settings}=sampleFixture();
 sampleReport.created[0].description='Printer <HP> & "scanner"';
 const plain=renderPlainText(sampleReport,{...settings,emailSender:{name:'Alex Example',title:'IT Executive',company:'Example Pte Ltd',phone:''}},{excludeEvents:true,groupFilter:'All'});
 assert.doesNotMatch(plain,/&nbsp;|&lt;|&gt;|&amp;|&quot;|&#|LOGO|<\/?(?:table|tr|td|th|p|h1|h2|br|html|title)\b/i);
 assert.equal(plain.split('BMC Daily Ticket Report').length-1,1);
 assert.ok(plain.startsWith('Hi Team,\nPlease find below the daily ticket activity summary for 10 November 2026.\n\nBMC Daily Ticket Report — 2026-11-10\nDaily ticket activity · Monitoring events excluded\n'));
 assert.match(plain,/^Created on date: 5\nClosed\/resolved: 3\nOutstanding: 5$/m);
 assert.match(plain,/^Summary by assigned group\n- NCC_EUC: Created 4 \| Closed 2 \| Outstanding 2\n- NCC_NETWORK: .*\n- NCC_SYSTEM: .*\n- TOTAL: Created 5 \| Closed 3 \| Outstanding 5$/m);
 assert.match(plain,/^Summary by ticket type\n- Incident: Created 3 \| Closed 2 \| Outstanding 3\n(?:.*\n){2}- TOTAL: Created 5 \| Closed 3 \| Outstanding 5$/m);
 assert.match(plain,/^Tickets created on 2026-11-10 \(5\)\n1\. INC000000412871 \| Incident \| Printer <HP> & "scanner" \| Daniel Lim \| NCC_EUC \| In Progress$/m);
 assert.match(plain,/^5\. INC000000412927 \| /m);
 assert.match(plain,/\nBest regards,\nAlex Example\nIT Executive\nExample Pte Ltd\n\nThis is an automated report/);
 // Selected signature profile is used as text; empty report states are spelled out.
 const empty=generateReport(tickets,{reportDate:'2031-01-01',groupFilter:'Nobody'});
 const emptyPlain=renderPlainText(empty,{signatureId:'logo',signatures:[logoProfile]},{excludeEvents:false,groupFilter:'Nobody'});
 assert.match(emptyPlain,/Daily ticket activity · Group: Nobody\n/);
 assert.match(emptyPlain,/No tickets matched the selected scope\.\n- TOTAL: Created 0 \| Closed 0 \| Outstanding 0/);
 assert.match(emptyPlain,/No tickets were created on this date\.\n\nRegards,\nExample Team\n\nThis is/);
 assert.doesNotMatch(emptyPlain,/undefined|null|NaN|data:image|Best regards/);
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/const plain=renderPlainText\(state\.report,emailSettings\(\),filters\(\)\)/);
 assert.doesNotMatch(app,/html\.replace\(\/<\[\^>\]\*>\/g/);
});
test('M6: pull-request CI runs cannot cancel a production Pages deploy',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/deploy.yml',import.meta.url),'utf8');
 const concurrency=/\nconcurrency:\n((?:[ \t]+.*\n)+)/.exec(workflow)[1];
 const group=/^\s+group:\s*(.+)$/m.exec(concurrency)[1].trim();
 assert.equal(group,"pages-${{ github.event_name == 'pull_request' && github.ref || 'deploy' }}");
 assert.match(workflow,/\n  pull_request:\n/);
});
const APP_DEFAULTS={emailVariant:'A',client:'classic',emailSender:{name:'',title:'',company:'',phone:''},signatures:[{id:'support',name:'IT Support Team',content:'x'}]};
test('L1: importing settings updates the theme dropdown before the preview refreshes',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf("$('importSettings').addEventListener"),app.indexOf("$('demoBtn')"));
 assert.match(handler,/state\.settings=normalizeSettings\(/);
 const sync=handler.indexOf("$('emailVariant').value=state.settings.emailVariant"),refresh=handler.indexOf('refreshReport()');
 assert.ok(sync>0&&refresh>sync,'dropdown must be synced before refreshReport()');
 const imported=normalizeSettings({emailVariant:'D',client:'gmail',signatures:[],emailSender:{name:' Alex Example '}},APP_DEFAULTS);
 assert.equal(imported.emailVariant,'D');
 assert.equal(imported.emailSender.name,'Alex Example');
 assert.deepEqual(imported.signatures,[]);
});
test('L2: an unknown stored or imported variant yields Variant A, never the legacy layout',()=>{
 for(const bad of ['Z','',null,undefined,'a','legacy',5,{}])assert.equal(normalizeVariant(bad),'A');
 for(const good of VARIANTS)assert.equal(normalizeVariant(good),good);
 assert.equal(normalizeSettings({emailVariant:'Z'},APP_DEFAULTS).emailVariant,'A');
 assert.equal(normalizeSettings(null,APP_DEFAULTS).emailVariant,'A');
 assert.equal(normalizeSettings('corrupt',APP_DEFAULTS).emailVariant,'A');
 assert.notEqual(normalizeSettings(null,APP_DEFAULTS).signatures,APP_DEFAULTS.signatures);
 const settings={signatures:[],signatureId:''},variantA=renderEmail(report,settings,{excludeEvents:true},'A');
 for(const bad of ['Z','',null,'d'])assert.equal(renderEmail(report,settings,{excludeEvents:true},bad),variantA);
 assert.match(variantA,/width="800"/);
 // The legacy layout is only reachable by omitting the variant.
 assert.doesNotMatch(renderEmail(report,settings,{excludeEvents:true}),/width="800"/);
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/function loadSettings\(\)\{try\{return normalizeSettings\(/);
 assert.match(app,/function makeEmail\(\)\{const variant=normalizeVariant\(/);
 assert.match(app,/\$\('emailVariant'\)\.value=normalizeVariant\(state\.settings\.emailVariant\)/);
});
test('L3: design docs do not reference the missing previews folder',()=>{
 for(const name of ['README.md','CODEX_PROMPT.md'])assert.doesNotMatch(designDoc(name),/previews|\.png/i,name);
});
test('L4: test fixtures only use reserved example domains',()=>{
 const source=readFileSync(new URL(import.meta.url),'utf8');
 const domains=[...source.matchAll(/@([a-z0-9-]+(?:\\?\.[a-z0-9-]+)+)/gi)].map(m=>m[1].replace(/\\/g,'').toLowerCase());
 assert.ok(domains.length>5);
 for(const domain of domains)assert.match(domain,/^(example\.(com|net|org)|local\.invalid)$/,domain);
});
test('Classic Outlook helper produces an unsent editable draft and Unicode MSG',()=>{
 const settings={to:"team@example.com",cc:"manager@example.com",bcc:"",subject:"Today's BMC – {date}"};
 const script=renderClassicOutlookScript('<html><body><b>Daily report</b></body></html>',settings,'2026-11-10');
 assert.equal(script.charCodeAt(0),0xfeff);
 assert.match(script,/New-Object -ComObject Outlook\.Application/);
 assert.match(script,/\$mail\.HTMLBody = \$html/);
 assert.match(script,/\$mail\.SaveAs\(\$target, 9\)/);
 assert.match(script,/\$mail\.Display\(\$false\)/);
 assert.match(script,/\$mail\.To = 'team@example\.com'/);
 assert.match(script,/\$mail\.Subject = 'Today''s BMC – 2026-11-10'/);
 assert.doesNotMatch(script,/\$mail\.Send\s*\(/);
});
test('Classic Outlook helper embeds PNG logo as CID attachment and guards PowerShell string boundary',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ol0AAAAASUVORK5CYII=';
 const html='<div>Start\n'+"\'@"+'\nEnd <img src="data:image/png;base64,'+png+'"></div>';
 const script=renderClassicOutlookScript(html,{subject:'BMC {date}'},'2026-11-10');
 assert.match(script,/src="cid:bmc-signature-1@local\.invalid"/);
 assert.match(script,/ContentId = 'bmc-signature-1@local\.invalid'/);
 assert.match(script,/PropertyAccessor\.SetProperty/);
 assert.match(script,/&#39;@\r?\nEnd/);
 assert.match(script,/iVBORw0KGgo/);
 assert.doesNotMatch(script,/\$mail\.Send\s*\(/);
});


/** Minimal in-memory, ZIP STORED XLSX. No real BMC data or binary fixtures. */
function testZip(entries){
 const locals=[],directories=[];let position=0,centralSize=0;
 for(const [name,xml] of Object.entries(entries)){
   const filename=Buffer.from(name,'utf8'),data=Buffer.from(xml,'utf8');
   const local=Buffer.alloc(30);
   local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
   local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
   local.writeUInt16LE(filename.length,26);
   locals.push(local,filename,data);
   const directory=Buffer.alloc(46);
   directory.writeUInt32LE(0x02014b50,0);
   directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);
   directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(data.length,24);
   directory.writeUInt16LE(filename.length,28);
   directory.writeUInt32LE(position,42);
   directories.push(directory,filename);
   position+=local.length+filename.length+data.length;
   centralSize+=directory.length+filename.length;
 }
 const end=Buffer.alloc(22),count=Object.keys(entries).length;
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);
 end.writeUInt32LE(centralSize,12);end.writeUInt32LE(position,16);
 return Buffer.concat([...locals,...directories,end]);
}
function sampleXlsx(rows){
 const sheet='<worksheet><sheetData>'+rows.join('')+'</sheetData></worksheet>';
 return testZip({
   'xl/workbook.xml':'<workbook><sheets><sheet name="Tickets" sheetId="1" r:id="rId1"/></sheets></workbook>',
   'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
   'xl/worksheets/sheet1.xml':sheet,
 });
}
const cell=(ref,value,attributes='')=>'<c r="'+ref+'" t="str"><v'+attributes+'>'+value+'</v></c>';
const sheetRow=(number,cells)=>'<row r="'+number+'">'+cells.join('')+'</row>';

test('BUG 1: XLSX preserves a whitespace-marked <v> and recognizes Description header',async()=>{
 const data=sampleXlsx([
   sheetRow(1,[cell('A1','Description ',' xml:space="preserve"'),cell('B1','Ticket ID')]),
   sheetRow(2,[cell('A2','Replace laptop'),cell('B2','INC000001')]),
 ]);
 const parsed=await parseXlsx(data);
 assert.deepEqual(parsed.headers,['Description','Ticket ID']);
 assert.equal(detectColumns(parsed.headers).description,'Description');
 assert.equal(parsed.rows[0].Description,'Replace laptop');
});

test('BUG 2: XLSX blank header must not shift subsequent ticket values',async()=>{
 const data=sampleXlsx([
   sheetRow(1,[cell('A1','Ticket ID'),cell('C1','Description'),cell('D1','Assigned Group'),cell('E1','Assigned Engineer'),cell('F1','Priority')]),
   sheetRow(2,[cell('A2','INC000002'),cell('B2','ignored blank-header value'),cell('C2','Printer needs repair'),cell('D2','NCC_EUC'),cell('E2','Alex'),cell('F2','High')]),
 ]);
 const parsed=await parseXlsx(data);
 assert.deepEqual(parsed.rows,[{'Ticket ID':'INC000002','Description':'Printer needs repair','Assigned Group':'NCC_EUC','Assigned Engineer':'Alex','Priority':'High'}]);
});

test('BUG 3: Vitest excludes node:test prototype while keeping defaults',()=>{
 const vite=readFileSync(new URL('../../../vite.config.ts',import.meta.url),'utf8');
 assert.match(vite,/configDefaults\.exclude/);
 assert.match(vite,/prototype\/\*\*/);
});

test('BUG 4: Singapore-local fallback dates never roll back to the preceding UTC day',()=>{
 const code='import {dateOnly} from '+JSON.stringify(new URL('../lib/report-core.mjs',import.meta.url).href)+
   ';console.log(JSON.stringify([dateOnly("10-Nov-2026"),dateOnly("Nov 10 2026 07:00")]))';
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,TZ:'Asia/Singapore'}});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout.trim()),['2026-11-10','2026-11-10']);
});

test('BUG 5: ambiguous slash dates align with main-app month-first heuristic',()=>{
 assert.equal(dateOnly('11/10/2026'),'2026-11-10');
 assert.equal(dateOnly('3/4/2026'),'2026-03-04');
 // Main app resolves 10/11 as October 11, not November 10.
 assert.equal(dateOnly('10/11/2026'),'2026-10-11');
 assert.equal(dateOnly('25/12/2026'),'2026-12-25');
 assert.equal(dateOnly('31/02/2026'),null);
 assert.equal(dateOnly('2/30/2026'),null);
});

test('BUG 6: Classic Outlook addresses normalize commas and newlines into semicolons',()=>{
 const script=renderClassicOutlookScript('<div>Hello</div>',{
   to:'alice@example.com, bob@example.net\ncarol@example.org',
   cc:'manager@example.com, lead@example.net',
   bcc:'archive@example.com\nquality@example.net',
   subject:'Daily {date}',
 },'2026-11-10');
 assert.match(script,/\$mail\.To = 'alice@example\.com; bob@example\.net; carol@example\.org'/);
 assert.match(script,/\$mail\.CC = 'manager@example\.com; lead@example\.net'/);
 assert.match(script,/\$mail\.BCC = 'archive@example\.com; quality@example\.net'/);
 assert.doesNotMatch(script,/\$mail\.To = '[^\r\n]*, bob/);
});

test('BUG 7: unknown status appears in warning banner without changing outstanding count',()=>{
 const rows=[{ 'Ticket ID':'INC099','Submit Date':'2026-11-09','Resolved Date':'2026-11-10','Status':'Completed','Assigned Group':'NCC_EUC'}];
 const t=normalizeTickets(rows,detectColumns(Object.keys(rows[0])));
 const r=generateReport(t,{reportDate:'2026-11-10'});
 assert.deepEqual(r.counts,{created:0,closed:0,pending:1});
 assert.deepEqual(r.unknownStatuses,[{status:'Completed',count:1}]);
 const banner={hidden:true,textContent:''};
 updateReportWarnings(banner,['Optional column(s) not found: contract'],r.unknownStatuses);
 assert.equal(banner.hidden,false);
 assert.match(banner.textContent,/Completed \(1\)/);
 assert.match(banner.textContent,/Outstanding/);
 updateReportWarnings(banner,[],[]);
 assert.equal(banner.hidden,true);
 assert.equal(banner.textContent,'');
});

test('BUG 8: rapid signature edits batch persistence but allow explicit immediate save',()=>{
 let sequence=0,saves=0;
 const pending=new Map();
 const clock={
   schedule(fn,delay){assert.equal(delay,400);const id=++sequence;pending.set(id,fn);return id;},
   cancel(id){pending.delete(id);}
 };
 const saver=createDebouncedSaver(()=>{saves++},400,clock);
 saver.queue();saver.queue();saver.queue();
 assert.equal(pending.size,1);
 assert.equal(saves,0);
 const latest=[...pending.entries()][0];pending.delete(latest[0]);latest[1]();
 assert.equal(saves,1);
 saver.queue();saver.flush();saver.flush();
 assert.equal(saves,2);
 assert.equal(pending.size,0);
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/signaturePersistence\.queue\(\)/);
 assert.match(app,/signaturePersistence\.cancel\(\)/);
});

test('LOW: missing Resolved Date is a required mapping rather than a silent zero',()=>{
 assert.ok(mandatoryColumns.includes('resolved'));
});

test('LOW: a large signature image uses a visible placeholder in EML, not src=""',()=>{
 const html='<html><body><img src="data:image/png;base64,'+'A'.repeat(1800001)+'"></body></html>';
 const eml=renderEml(html,{subject:'BMC {date}'},'2026-11-10');
 assert.doesNotMatch(eml,/multipart\/related/);
 const body=Buffer.from(eml.split('\r\n\r\n')[1].replace(/\s+/g,''),'base64').toString('utf8');
 assert.match(body,/Signature image omitted/);
 assert.doesNotMatch(body,/src=""/);
 assert.doesNotMatch(body,/<img/);
});

test('LOW: duplicate count reflects deduplicated source, including filter exclusions',()=>{
 const dup={...tickets[0],rowIndex:100,modifiedRank:1};
 const r=generateReport([...tickets,dup],{reportDate:'2026-11-10'});
 assert.equal(r.duplicateCount,1);
 assert.equal(r.rawCount,tickets.length+1);
});


test('REGRESSION: default debounce timer does not invoke unbound window timers',()=>{
 const realSchedule=globalThis.setTimeout, realCancel=globalThis.clearTimeout;
 let writes=0;
 try {
   // Simulate a browser timer that rejects calls with clock-object receivers.
   globalThis.setTimeout=function(fn, delay){
     if(this!==undefined && this!==globalThis)throw new TypeError('Illegal invocation');
     return realSchedule(fn,delay);
   };
   globalThis.clearTimeout=function(timer){
     if(this!==undefined && this!==globalThis)throw new TypeError('Illegal invocation');
     return realCancel(timer);
   };
   const saver=createDebouncedSaver(()=>{writes++},400);
   assert.doesNotThrow(()=>saver.queue());
   assert.doesNotThrow(()=>saver.queue());
   saver.flush();
   assert.equal(writes,1);
   saver.flush();
   assert.equal(writes,1);
 } finally {
   globalThis.setTimeout=realSchedule;
   globalThis.clearTimeout=realCancel;
 }
});

test('REGRESSION: default debounce persists after delay without a custom clock',async()=>{
 let writes=0;
 const saver=createDebouncedSaver(()=>{writes++},20);
 saver.queue();
 assert.equal(writes,0);
 await new Promise(resolve=>setTimeout(resolve,65));
 assert.equal(writes,1);
 saver.flush();
 assert.equal(writes,1);
});

test('REGRESSION: closing settings, backdrop, and pagehide flush pending signatures',()=>{
 const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
 assert.match(app,/modalClose'.*?signaturePersistence\.flush\(\)/s);
 assert.match(app,/if\(e\.target===\$\('modal'\)\)\{signaturePersistence\.flush\(\)/s);
 assert.match(app,/addEventListener\('pagehide',\(\)=>signaturePersistence\.flush\(\)\)/);
 assert.match(app,/visibilitychange'.*?signaturePersistence\.flush\(\)/s);
});

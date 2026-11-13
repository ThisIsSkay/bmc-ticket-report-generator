import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,detectColumns,normalizeTickets,generateReport,dateOnly,mandatoryColumns,updateReportWarnings} from '../lib/report-core.mjs';
import {renderEmail,renderEml} from '../lib/mail.mjs';
import {renderClassicOutlookScript} from '../lib/classic-outlook.mjs';
import {parseXlsx} from '../lib/xlsx-lite.mjs';
import {createDebouncedSaver} from '../lib/settings-persistence.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const data=`Ticket ID,Submit Date,Resolved Date,Last Modified Date,Status,Assigned Engineer,Assigned Group,Description,Incident Type,Contract Number\nINC001,2026-11-10,,,Pending,Alex,EUC,Problem,Incident,AAA\nINC002,2026-11-09,2026-11-10,,Resolved,Alex,EUC,Resolved matter,Incident,AAA\nSRV003,2026-11-10,2026-11-10,,Closed,Sam,System,New and closed,Service Request,AAA\nINC004,2026-11-10,,,Cancelled,Alex,EUC,Cancelled today,Incident,AAA\nEVT005,2026-11-10,,,Pending,Bot,NOC,noise,Event,AAA`;
const {headers,rows}=parseCsv(data);const tickets=normalizeTickets(rows,detectColumns(headers));const report=generateReport(tickets,{reportDate:'2026-11-10'});
test('date parsing rejects impossible dates and handles Excel serials',()=>{assert.equal(dateOnly('2026-02-30'),null);assert.equal(dateOnly(45000),'2023-03-15');assert.equal(dateOnly('10/11/2026'),'2026-10-11')});
test('new/closed include both lifecycle events and skip monitoring',()=>{assert.equal(report.counts.created,3);assert.equal(report.counts.closed,2);assert.equal(report.counts.pending,1);assert.equal(report.created.filter(t=>t.id==='SRV003').length,1);assert.equal(report.closed.filter(t=>t.id==='SRV003').length,1)});
test('group pivot reconciles with created/closed/pending',()=>{assert.deepEqual(report.pivot.reduce((acc,r)=>acc.map((x,i)=>x+[r.created,r.closed,r.pending][i]),[0,0,0]),[3,2,1])});
test('email HTML escapes user-controlled descriptions',()=>{const t={...report,created:report.created.map(v=>({...v,description:'<script>alert("x")</script>'}))};const html=renderEmail(t,{greeting:'Hi',signatures:[],signatureId:''},{excludeEvents:true});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)});
test('email themes render all four Outlook-safe variants',()=>{
 for(const variant of ['A','B','C','D']){
   const html=renderEmail(report,{signatures:[],signatureId:''},{excludeEvents:true},variant);
   assert.match(html,/width="800"/);assert.match(html,/width="736"/);assert.doesNotMatch(html,/class\s*=/i);assert.doesNotMatch(html,/<style\b/i);assert.match(html,/font-family:Arial/);
 }
});
test('email themes escape ticket fields',()=>{const t={...report,created:report.created.map(v=>({...v,description:'Printer <HP> & "scanner"'}))};const html=renderEmail(t,{signatures:[],signatureId:''},{excludeEvents:true},'D');assert.match(html,/Printer &lt;HP&gt; &amp; &quot;scanner&quot;/);assert.doesNotMatch(html,/Printer <HP>/)});
test('eml includes unsent marker, recipients, and encoded HTML',()=>{const html=renderEmail(report,{greeting:'Hello',signatures:[]},{excludeEvents:true});const eml=renderEml(html,{to:'team@example.com',cc:'manager@example.com',subject:'BMC {date}'},'2026-11-10');assert.match(eml,/X-Unsent: 1/);assert.match(eml,/To: team@example.com/);assert.match(eml,/Subject: BMC 2026-11-10/);assert.match(eml,/Content-Transfer-Encoding: base64/);});

test('rich signature PNG is attached inline with a CID reference in the EML',()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ol0AAAAASUVORK5CYII=';
 const profile={id:'logo',name:'Company',html:'<div><b>Regards,</b><br>Example Team<br><img src="data:image/png;base64,'+png+'" alt="Logo"></div>'};
 const settings={to:'team@example.com',subject:'BMC {date}',signatureId:'logo',signatures:[profile]};
 const html=renderEmail(report,settings,{excludeEvents:true});
 assert.match(html,/<b>Regards,<\/b>/);
 assert.match(html,/data:image\/png;base64/);
 const eml=renderEml(html,settings,'2026-11-10');
 assert.match(eml,/multipart\/related/);
 assert.match(eml,/Content-ID: <bmc-signature-1@local.invalid>/);
 assert.match(eml,/Content-Type: image\/png/);
 const imagePart=eml.split('Content-Disposition: inline\r\n\r\n')[1].split('\r\n--')[0].replace(/\s+/g,'');
 assert.equal(imagePart,png);
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
   to:'alice@x.com, bob@y.com\ncarol@z.com',
   cc:'manager@x.com, lead@y.com',
   bcc:'archive@x.com\nquality@y.com',
   subject:'Daily {date}',
 },'2026-11-10');
 assert.match(script,/\$mail\.To = 'alice@x\.com; bob@y\.com; carol@z\.com'/);
 assert.match(script,/\$mail\.CC = 'manager@x\.com; lead@y\.com'/);
 assert.match(script,/\$mail\.BCC = 'archive@x\.com; quality@y\.com'/);
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

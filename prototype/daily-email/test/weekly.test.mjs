import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ticketAge,dayNumber} from '../lib/ageing.mjs';
import {buildPendingView} from '../lib/pending-report.mjs';
import {buildWorkbook} from '../lib/workbook.mjs';
import {renderPendingEmail,renderPendingPlainText} from '../lib/email-themes.mjs';
import {renderClassicOutlookScript} from '../lib/classic-outlook.mjs';
const sandbox={Date};vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.mini.min.js',import.meta.url),'utf8'),sandbox);const XLSX=sandbox.XLSX;
const rows=[{id:'INC-EXAMPLE',kind:'Incident',status:'Assigned',priority:'High',group:'NCC_Application',description:'=1+1',created:'2026-11-10',assigned:'Alex Example'}, {id:'SRV-EXAMPLE',kind:'Service Request',status:'Pending',priority:'',group:'NCC_Application',created:'',description:'Example'}, {id:'FSC-EXAMPLE',kind:'Forward Schedule',status:'Assigned',created:'2026-11-19'}, {id:'INC-OTHER',kind:'Incident',status:'On Hold',created:'2026-11-01'}];
const view=buildPendingView({pending:rows},{asAt:'2026-11-18',types:['Incident','Service Request'],statuses:['Assigned','Pending']});
test('Calendar age boundaries, leap day, missing and future dates',()=>{
 for(const [days,band] of [[0,'0–7'],[7,'0–7'],[8,'8–14'],[14,'8–14'],[15,'15–30'],[30,'15–30'],[31,'31–60'],[60,'31–60'],[61,'Over 60']])assert.equal(ticketAge(new Date(Date.UTC(2026,10,18)-days*86400000).toISOString().slice(0,10),'2026-11-18').band,band);
 assert.equal(ticketAge('2024-02-29','2024-03-01').days,1);assert.equal(dayNumber('2026-02-30'),null);assert.equal(ticketAge('','2026-11-18').band,'Age unknown');assert.equal(ticketAge('2026-11-19','2026-11-18').band,'Future-dated');
});
test('Shared scope and all breakdowns reconcile without losing blanks',()=>{assert.equal(view.total,2);assert.equal(view.excludedType,1);assert.equal(view.excludedStatus,1);assert.equal(view.byAge.reduce((n,r)=>n+r.count,0),2);for(const m of [view.groupType,view.typePriority])assert.equal(m.rows.flatMap(r=>r.counts).reduce((a,b)=>a+b,0),2);assert.ok(view.typePriority.columns.includes('(blank)'));});
test('Workbook round trip retains text, dates, IDs, scope and hidden engineer',()=>{const bytes=buildWorkbook(view,false,XLSX);const book=XLSX.read(bytes,{type:'array',cellDates:true});assert.deepEqual(Array.from(book.SheetNames),['Summary','Tickets','Scope']);const sheet=book.Sheets.Tickets;assert.equal(sheet.A2.v,'INC-EXAMPLE');assert.equal(sheet.C2.v,'=1+1');assert.equal(sheet.C2.t,'s');assert.equal(sheet.C2.f,undefined);assert.equal(sheet.F2.t,'d');assert.ok(!JSON.stringify(sheet).includes('Alex Example'));assert.ok(sheet['!autofilter']);const ps=renderClassicOutlookScript('<p>Example</p>',{},'2026-11-18',[{filename:'details.xlsx',base64:Buffer.from(bytes).toString('base64')}]);assert.match(ps,/details.xlsx/);assert.match(ps,/Attachments.Add/);assert.doesNotMatch(ps,/\.Send\(/);});
for(const variant of ['A','B','C','D'])test(`Weekly ${variant} line breaks, dates and priority rows`,()=>{for(const length of [19,39,59]){const html=renderPendingEmail(view,{pendingIntro:'x'.repeat(length)+'\nThanks {date}',greeting:'   '},variant);assert.match(html,/<br \/>Thanks 2026-11-18/);assert.doesNotMatch(html,/<&#8203;/);assert.match(html,/Hi Team,/);assert.match(html,/Age since submitted/);}const plain=renderPendingPlainText(view);assert.match(plain,/Assigned · Priority: High/);});
test('Theme C header logo has explicit proportional dimensions and becomes a CID',()=>{
 const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ol0AAAAASUVORK5CYII=';
 const html=renderPendingEmail(view,{headerLogo:logo},'C');assert.match(html,/width="40" height="40" alt="Report logo"/);
 const ps=renderClassicOutlookScript(html,{},'2026-11-18');assert.match(ps,/src="cid:/);assert.match(ps,/ContentId/);
});

test('Exported priority headings are escaped',()=>{const hostile=buildPendingView({pending:[{...rows[0],priority:'<img src=x onerror=alert(1)>'}]},{});const html=renderPendingEmail(hostile,{},'A');assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);});

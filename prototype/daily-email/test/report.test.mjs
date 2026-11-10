import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,detectColumns,normalizeTickets,generateReport,dateOnly} from '../lib/report-core.mjs';
import {renderEmail,renderEml} from '../lib/mail.mjs';
import {renderClassicOutlookScript} from '../lib/classic-outlook.mjs';
const data=`Ticket ID,Submit Date,Resolved Date,Last Modified Date,Status,Assigned Engineer,Assigned Group,Description,Incident Type,Contract Number\nINC001,2026-11-10,,,Pending,Alex,EUC,Problem,Incident,AAA\nINC002,2026-11-09,2026-11-10,,Resolved,Alex,EUC,Resolved matter,Incident,AAA\nSRV003,2026-11-10,2026-11-10,,Closed,Sam,System,New and closed,Service Request,AAA\nINC004,2026-11-10,,,Cancelled,Alex,EUC,Cancelled today,Incident,AAA\nEVT005,2026-11-10,,,Pending,Bot,NOC,noise,Event,AAA`;
const {headers,rows}=parseCsv(data);const tickets=normalizeTickets(rows,detectColumns(headers));const report=generateReport(tickets,{reportDate:'2026-11-10'});
test('date parsing rejects impossible dates and handles Excel serials',()=>{assert.equal(dateOnly('2026-02-30'),null);assert.equal(dateOnly(45000),'2023-03-15');assert.equal(dateOnly('10/11/2026'),'2026-11-10')});
test('new/closed include both lifecycle events and skip monitoring',()=>{assert.equal(report.counts.created,3);assert.equal(report.counts.closed,2);assert.equal(report.counts.pending,1);assert.equal(report.created.filter(t=>t.id==='SRV003').length,1);assert.equal(report.closed.filter(t=>t.id==='SRV003').length,1)});
test('group pivot reconciles with created/closed/pending',()=>{assert.deepEqual(report.pivot.reduce((acc,r)=>acc.map((x,i)=>x+[r.created,r.closed,r.pending][i]),[0,0,0]),[3,2,1])});
test('email HTML escapes user-controlled descriptions',()=>{const t={...report,created:report.created.map(v=>({...v,description:'<script>alert("x")</script>'}))};const html=renderEmail(t,{greeting:'Hi',signatures:[],signatureId:''},{excludeEvents:true});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)});
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

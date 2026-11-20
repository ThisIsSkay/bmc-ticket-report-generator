import test from 'node:test';import assert from 'node:assert/strict';
import {decodeCsv,csvRows,tableFromRows} from '../lib/import.mjs';
import {directory,matchRequester,matchBatch,requestsFromRows,keys} from '../lib/match.mjs';
const dir=rows=>directory(rows.map(([Name,Email,Company='',Department='',Aliases=''])=>({Name,Email,Company,Department,Aliases})),{name:'Name',email:'Email',company:'Company',department:'Department',alias:'Aliases'}).entries;
const request=name=>({name,company:'',department:''});
test('CSV handles BOM, Unicode, quoted multiline, escaped quotes and delimiters',()=>{
 const text='Name;Email\r\n"Example, Alex";alex@example.com\r\n"Jamie\n""Example""";jamie@example.com';assert.equal(csvRows(text)[2][0],'Jamie\n"Example"');assert.equal(tableFromRows(csvRows(text)).rows.length,2);
 const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from('Name\tEmail\nAlex\talex@example.com','utf16le')]);assert.equal(csvRows(decodeCsv(utf16))[1][0],'Alex');assert.throws(()=>decodeCsv(Buffer.from([255,255,255])));assert.throws(()=>csvRows('Name,Email\n"broken'));assert.throws(()=>tableFromRows([['Name','Name'],['A','B']]));
});
test('Name layers preserve characters and reorder only as a suggestion',()=>{
 assert.equal(keys('Ａｌｅｘ  Example').exact,'alex example');assert.equal(keys('李明').canonical,'李明');
 for(const [a,b,tier] of [[' Alex Example ','alex example',1],['José Example','Jose Example',2],['Example, Jamie','Jamie Example',3],['Mei-Ling Example','Meiling Example',5],['Jessica Example','Jessica Mei Example',6],['R Example','Ravi Example',7],['Weimin Example','Weiming Example',8]])assert.equal(matchRequester(request(a),dir([[b,'person@example.com']])).candidates[0].tier,tier);
 assert.equal(matchRequester(request('Tan Example'),dir([['Chen Example','person@example.com']])).status,'No match');assert.equal(matchRequester(request('李明'),dir([['Li Ming','person@example.com']])).status,'No match');
});
test('Ambiguity, invalid emails, shared email and contradictory evidence are explicit',()=>{
 const entries=dir([['Chris Example','one@example.com'],['Chris Example','two@example.com']]);assert.equal(matchRequester(request('Chris Example'),entries).status,'Ambiguous');
 assert.equal(matchRequester(request('Alex Example'),dir([['Alex Example','mailto:alex@example.com']])).status,'Review required');
 assert.equal(matchRequester(request('Alex Example'),dir([['Alex Example','shared@example.com'],['Jamie Example','shared@example.com']])).status,'Review required');
 assert.equal(matchRequester({...request('Alex Example'),department:'Finance'},dir([['Alex Example','alex@example.com','','Support']])).status,'Review required');
});
test('Aliases explicit; duplicate records merged without collapsing people',()=>{
 assert.equal(matchRequester(request('Alex Example'),dir([['Alexander Example','alex@example.com','','','Alex Example']])).candidates[0].tier,4);
 const d=directory([{n:'Alex',e:'a@example.com'},{n:'Alex',e:'a@example.com'},{n:'Alex',e:'b@example.com'}],{name:'n',email:'e'});assert.equal(d.entries.length,2);assert.equal(d.duplicates,1);
});
test('Reverse matches flag differing requesters and duplicate ticket rows remain separate',()=>{
 const r=matchBatch([request('Alex Example'),request('Example Alex')],dir([['Alex Example','alex@example.com']]));assert.equal(r[0].status,'Review required');assert.match(r[0].reverseWarning,/another requester/);
 const tickets=requestsFromRows([{n:'Alex',id:'INC-1'},{n:'Alex',id:'INC-1'}],{name:'n',ticket:'id'});assert.equal(tickets.length,2);assert.ok(tickets.every(t=>t.duplicateTicket));assert.notEqual(tickets[0].id,tickets[1].id);
});
test('Titles and adjacent letter transpositions remain suggestions',()=>{
 assert.equal(matchRequester(request('Dr Alex Example'),dir([['Alex Example','a@example.com']])).status,'Suggestion');
 assert.equal(matchRequester(request('Jmaie Example'),dir([['Jamie Example','j@example.com']])).status,'Suggestion');
 assert.equal(dir([['---','a@example.com']])[0].valid,false);
});
test('UTF16 big endian, malformed fields and empty sheets',()=>{
 const input=Buffer.from('Name;Email\nAlex;alex@example.com','utf16le');input.swap16();const decoded=decodeCsv(Buffer.concat([Buffer.from([254,255]),input]));assert.equal(csvRows(decoded)[1][1],'alex@example.com');
 assert.throws(()=>tableFromRows([]));assert.throws(()=>csvRows('Name,Email\n"Alex"bad,a@example.com'));assert.throws(()=>tableFromRows([['Name','Email'],['A','a@example.com','unexpected']]));
});
test('V1/V3 short near-namesakes and weak ties do not appear unique',()=>{
 const r=matchRequester(request('Tan Wei Ming'),dir([['Tan Wei Ming','one@example.com'],['Tan Wei Min','two@example.com']]));assert.equal(r.candidates.length,2);assert.equal(r.status,'Review required');assert.equal(r.candidates[1].tier,8);
 assert.equal(matchRequester(request('A Tan'),dir([['Alex Tan','a@example.com'],['Alan Tan','b@example.com'],['Amy Tan','c@example.com']])).status,'Ambiguous');
});
test('V4 organisation equivalence is narrow; genuine conflicts remain',()=>{
 assert.equal(matchRequester({...request('Alex Example'),company:'Example Co Pte Ltd',department:'IT'},dir([['Alex Example','a@example.com','Example Co','Information Technology']])).status,'Unique proposal');
 assert.equal(matchRequester({...request('Alex Example'),department:'Finance'},dir([['Alex Example','a@example.com','','Information Technology']])).status,'Review required');
});
test('V5/V6 invisible characters, Latin variants and reordered aliases',()=>{
 for(const [a,b] of [['Alex\u200b Example','Alex Example'],['“Alex” (Example)','Alex Example'],['Đan Ølsen','Dan Olsen']])assert.ok(matchRequester(request(a),dir([[b,'a@example.com']])).candidates.length);
 assert.equal(matchRequester(request('Jamie Example'),dir([['James Example','j@example.com','','','Example, Jamie']])).candidates[0].tier,4);
});
test('V7 explicit Windows-1252, empty trailing columns and source row offsets',()=>{
 const data=Buffer.from('Name,Email,\nJos\xe9 Example,j@example.com,','latin1');assert.throws(()=>decodeCsv(data),/Windows-1252/);const table=tableFromRows(csvRows(decodeCsv(data,'windows-1252')));assert.equal(table.rows[0].Name,'José Example');assert.equal(table.headers.length,2);
 const offset=tableFromRows([['Cover'],['Name','Email'],[],['Alex','a@example.com']],1);assert.deepEqual(offset.rowNumbers,[4]);assert.equal(requestsFromRows(offset.rows,{name:'Name'},offset.rowNumbers)[0].ticket,'Row 4');
});
test('V8/V9 mailbox formats and case-insensitive duplicate ticket IDs',()=>{
 for(const email of ['a@b..com','.a@example.com','a..b@example.com','a@-b.com','a@example.com;other@example.com'])assert.equal(dir([['Alex Example',email]])[0].valid,false,email);
 const e=dir([['Alex Example','Alex Example <alex@example.com>']])[0];assert.equal(e.email,'alex@example.com');assert.equal(e.valid,true);
 assert.ok(requestsFromRows([{id:'INC-1'},{id:'inc-1'}],{ticket:'id'}).every(r=>r.duplicateTicket));
});
test('V2 repeated requesters reuse matching work while preserving separate rows',()=>{
 const entries=dir([['Alex Example','a@example.com']]);let reads=0;const key=entries[0].keys;Object.defineProperty(entries[0],'keys',{get(){reads++;return key;}});
 const requests=Array.from({length:12000},(_,i)=>({...request('Alex Example'),id:i}));const matched=matchBatch(requests,entries);assert.equal(matched.length,12000);assert.equal(reads,1);assert.notEqual(matched[0],matched[1]);
});

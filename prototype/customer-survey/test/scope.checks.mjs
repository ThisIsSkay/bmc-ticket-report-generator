// Survey scope: status exactly Resolved, Resolved date on the chosen day,
// optional Assigned Group ticks. Fictional data only.
import test from 'node:test';import assert from 'node:assert/strict';
import {tableFromRows} from '../lib/import.mjs';
import {parseDay,detectDateOrder,prepareScope,groupCounts,scopedIndexes,scopeProblem,isResolved} from '../lib/scope.mjs';

const MAP={status:'Status',resolved:'Resolved Date',group:'Assigned Group'};
const table=tableFromRows([
 ['Ticket ID','Customer Name','Status','Resolved Date','Assigned Group'],
 ['INC-1','Alex Example','Resolved','2026-11-10 09:30','EXAMPLE_EUC'],
 ['INC-2','Jamie Example',' resolved ','2026-11-10 17:00','EXAMPLE_NETWORK'],
 ['INC-3','Chris Example','Closed','2026-11-10 10:00','EXAMPLE_EUC'],
 ['INC-4','Pat Example','Resolved','2026-11-09 23:59','EXAMPLE_EUC'],
 ['INC-5','Sam Example','Cancelled','2026-11-10 08:00','EXAMPLE_NETWORK'],
 ['INC-6','Robin Example','Assigned','','EXAMPLE_SYSTEM'],
 ['INC-7','Drew Example','Resolved','2026-11-10 12:00',''],
 ['INC-8','Casey Example','Resolved','','EXAMPLE_EUC'],
]);

test('only status Resolved counts; Closed, Cancelled and open tickets never do',()=>{
 assert.deepEqual(['Resolved',' resolved ','RESOLVED','Closed','Cancelled','Resolved - Pending','',undefined].map(isResolved),[true,true,true,false,false,false,false,false]);
 const prep=prepareScope(table.rows,MAP);
 assert.equal(prep.resolvedCount,5);assert.equal(prep.unreadable,1,'a Resolved ticket with no Resolved date is reported, not guessed');
 assert.deepEqual(prep.days,['2026-11-10','2026-11-09']);assert.equal(prep.latest,'2026-11-10');
});
test('the chosen day and the ticked groups decide the rows, in source order',()=>{
 const prep=prepareScope(table.rows,MAP);
 const ids=indexes=>indexes.map(i=>table.rows[i]['Ticket ID']);
 assert.deepEqual(ids(scopedIndexes(prep,'2026-11-10',null)),['INC-1','INC-2','INC-7']);
 assert.deepEqual(ids(scopedIndexes(prep,'2026-11-10',['EXAMPLE_EUC'])),['INC-1']);
 assert.deepEqual(ids(scopedIndexes(prep,'2026-11-10',['EXAMPLE_EUC','EXAMPLE_NETWORK'])),['INC-1','INC-2']);
 assert.deepEqual(ids(scopedIndexes(prep,'2026-11-10',[''])),['INC-7'],'tickets with no group can be chosen on their own');
 assert.deepEqual(ids(scopedIndexes(prep,'2026-11-09',null)),['INC-4']);
 assert.deepEqual(scopedIndexes(prep,'2026-11-10',[]),[]);
 assert.deepEqual(groupCounts(prep,'2026-11-10'),[{name:'',count:1},{name:'EXAMPLE_EUC',count:1},{name:'EXAMPLE_NETWORK',count:1}]);
 assert.deepEqual(groupCounts(prep,'2026-11-09'),[{name:'',count:0},{name:'EXAMPLE_EUC',count:1},{name:'EXAMPLE_NETWORK',count:0}]);
});
test('without an Assigned Group column every Resolved ticket of the day is in scope',()=>{
 const prep=prepareScope(table.rows,{...MAP,group:''});
 assert.equal(prep.hasGroups,false);
 assert.equal(scopedIndexes(prep,'2026-11-10',['EXAMPLE_EUC']).length,3,'saved group ticks are ignored when the column is not mapped');
 assert.equal(scopeProblem(prep,'2026-11-10',[]),'');
});
test('problems are explained before matching',()=>{
 assert.match(scopeProblem(prepareScope(table.rows,{...MAP,resolved:''}),'',null),/Map Ticket status and Resolved date/);
 const prep=prepareScope(table.rows,MAP);
 assert.match(scopeProblem(prep,'2026-11-10',[]),/No assigned group is selected/);
 assert.match(scopeProblem(prep,'2026-11-08',null),/No Resolved tickets on 2026-11-08/);
 assert.match(scopeProblem(prep,'2026-11-09',['EXAMPLE_NETWORK']),/No Resolved tickets on 2026-11-09 in the selected groups/);
 assert.equal(scopeProblem(prep,'2026-11-10',['EXAMPLE_EUC']),'');
 const none=prepareScope(tableFromRows([['Status','Resolved Date'],['Closed','2026-11-10']]).rows,{status:'Status',resolved:'Resolved Date'});
 assert.match(scopeProblem(none,'',null),/no tickets with status Resolved/);
});
test('Excel serial dates, ISO text and month names read the same day in any time zone',()=>{
 const serial=(Date.UTC(2026,10,10)-Date.UTC(1899,11,30))/86400000;
 assert.equal(parseDay(serial),'2026-11-10');assert.equal(parseDay(serial+0.99999),'2026-11-10');assert.equal(parseDay(serial+1),'2026-11-11');
 for(const text of ['2026-11-10','2026-11-10 23:59:59','10-Nov-2026 09:00','10 November 2026','Nov 10, 2026 9:00 AM'])assert.equal(parseDay(text),'2026-11-10',text);
 assert.equal(parseDay('2026-02-30'),null);assert.equal(parseDay('soon'),null);assert.equal(parseDay(''),null);
});
test('slash dates: self-evident ones are read, ambiguous ones need the date order',()=>{
 assert.equal(parseDay('25/11/2026 10:00'),'2026-11-25');assert.equal(parseDay('11/25/2026 10:00 AM'),'2026-11-25');
 assert.equal(parseDay('03/04/2026'),null,'never guessed');
 assert.equal(parseDay('03/04/2026','dmy'),'2026-04-03');assert.equal(parseDay('03/04/2026','mdy'),'2026-03-04');
 assert.equal(parseDay('3/4/26','dmy'),'2026-04-03');
 assert.equal(detectDateOrder(['25/11/2026','03/04/2026']),'dmy');
 assert.equal(detectDateOrder(['11/25/2026','03/04/2026']),'mdy');
 assert.equal(detectDateOrder(['03/04/2026']),'ambiguous');
 assert.equal(detectDateOrder(['25/11/2026','11/25/2026']),'conflict');
 assert.equal(detectDateOrder(['2026-11-10',46336]),'none');
});
test('the column decides the order; an ambiguous column asks the user',()=>{
 const rows=[['Status','Resolved Date'],['Resolved','03/04/2026'],['Resolved','25/04/2026']];
 const decisive=prepareScope(tableFromRows(rows).rows,{status:'Status',resolved:'Resolved Date'});
 assert.equal(decisive.order,'dmy');assert.equal(decisive.needsOrder,false);assert.deepEqual(decisive.days,['2026-04-25','2026-04-03']);
 const ambiguous=prepareScope(tableFromRows(rows.slice(0,2)).rows,{status:'Status',resolved:'Resolved Date'});
 assert.equal(ambiguous.needsOrder,true);assert.match(scopeProblem(ambiguous,'',null),/Choose the date order/);
 const chosen=prepareScope(tableFromRows(rows.slice(0,2)).rows,{status:'Status',resolved:'Resolved Date'},[],'mdy');
 assert.equal(chosen.needsOrder,false);assert.deepEqual(chosen.days,['2026-03-04']);
});
test('XLSX date cells use the raw serial, not the displayed text',()=>{
 const rows=[{'Status':'Resolved','Resolved Date':'11/10/26 9:30'}];
 const serial=(Date.UTC(2026,10,10)-Date.UTC(1899,11,30))/86400000+0.3958;
 const prep=prepareScope(rows,{status:'Status',resolved:'Resolved Date'},[serial]);
 assert.equal(prep.needsOrder,false);assert.deepEqual(prep.days,['2026-11-10']);
});

// RD-03: the survey's XLSX path (the vendored SheetJS bundle the page loads,
// read exactly as app.mjs does) on a populated sheet whose <dimension> claims
// "A1". Fictional fixture, built at test time.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {tableFromRows} from '../lib/import.mjs';import {requestsFromRows} from '../lib/match.mjs';
import {dimensionFixtures,worksheetDimension,SHEET_NAMES,POPULATED_SHEET,HEADERS,EXPECTED} from '../../../scripts/fixtures/dimension-a1.mjs';
const writer=createRequire(import.meta.url)('xlsx');
const {wellFormed,malformed}=dimensionFixtures(writer);
const context={};vm.createContext(context);vm.runInContext(readFileSync(new URL('../vendor/xlsx.mini.min.js',import.meta.url),'utf8'),context);
const XLSX=context.XLSX;
// app.mjs ticketFile/directoryFile change handler, XLSX branch (JSON copy: the
// bundle runs in its own realm, so its arrays fail strict deep-equal otherwise).
const readSheets=bytes=>{const book=XLSX.read(bytes,{type:'array',cellDates:false});return JSON.parse(JSON.stringify(Object.fromEntries(book.SheetNames.map(name=>[name,XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:false})]))));};
test('vendored SheetJS reads every row of a sheet whose dimension says A1',()=>{
 assert.equal(worksheetDimension(writer,malformed),'A1');
 const sheets=readSheets(malformed);
 assert.deepEqual(Object.keys(sheets),SHEET_NAMES);
 for(const name of SHEET_NAMES.slice(0,3))assert.deepEqual(sheets[name],[],name+' is empty');
 const rows=sheets[POPULATED_SHEET];
 assert.equal(rows.length,EXPECTED.dataRows+1);
 assert.deepEqual(rows[0],HEADERS);
 assert.ok(rows.every(row=>row.length===EXPECTED.columns),'all columns read');
 assert.equal(rows[1][0],EXPECTED.firstSubmit,'dates keep their displayed text');
 assert.deepEqual(rows.slice(1).map(row=>row[3]),EXPECTED.ticketIds,'IDs keep their leading zeros');
 assert.deepEqual(sheets,readSheets(wellFormed),'identical to the well-formed workbook');
});
test('ticket requests from that sheet cover every row',()=>{
 const table=tableFromRows(readSheets(malformed)[POPULATED_SHEET],0);
 const requests=requestsFromRows(table.rows,{ticket:'Ticket ID',name:'Customer Name',company:'Customer Company'},table.rowNumbers);
 assert.equal(requests.length,EXPECTED.dataRows);
 assert.equal(requests[0].ticket,'INC000009000001');
 assert.equal(requests[0].name,'Casey Example');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contractsFromSetup,contractLabel,missingContracts,generateContractReport} from '../lib/contract-scope.mjs';
import {generateReport} from '../lib/report-core.mjs';
import {buildPendingView} from '../lib/pending-report.mjs';
import {renderEmail,renderPlainText,renderPendingEmail,renderPendingPlainText} from '../lib/mail.mjs';
import {workbookSheets} from '../lib/workbook.mjs';

const options={reportDate:'2026-11-10',groupFilter:'All',excludeEvents:true};
const ticket=(id,contract,status='Pending',kind='Incident',rowIndex=0)=>({id,contract,status,kind,rowIndex,modifiedRank:rowIndex,created:options.reportDate,resolved:options.reportDate,group:'Example Team',description:id,assigned:'Example Engineer',priority:'Low'});
const tickets=[ticket('INC-A','EXAMPLE-A'),ticket('SRV-B','EXAMPLE-B','Resolved','Service Request'),ticket('INC-C','EXAMPLE-C'),ticket('INC-BLANK',''),ticket('EVT-A','EXAMPLE-A','Pending','Event'),ticket('INC-MOVED','EXAMPLE-A','Pending','Incident',1),ticket('INC-MOVED','EXAMPLE-C','Pending','Incident',2)];

test('contract setup migrates legacy single/All and preserves new all/empty/list scopes',()=>{
 assert.deepEqual(contractsFromSetup({contract:'EXAMPLE-A'}),['EXAMPLE-A']);
 assert.equal(contractsFromSetup({contract:'All'}),null);
 assert.equal(contractsFromSetup(),null);
 assert.deepEqual(contractsFromSetup({contracts:[],contract:'EXAMPLE-A'}),[]);
 assert.equal(contractsFromSetup({contracts:null,contract:'EXAMPLE-A'}),null);
 assert.deepEqual(contractsFromSetup({contracts:['All','','EXAMPLE-B','EXAMPLE-B']}),['All','','EXAMPLE-B']);
});
test('all and single contract reports and every daily theme stay byte-identical to existing counters',()=>{
 const settings={greeting:'Hi Team',signatures:[]};
 for(const contract of ['All','EXAMPLE-A','EXAMPLE-B']){
  const filters={...options,contractFilter:contract};
  const expected=generateReport(tickets,filters),actual=generateContractReport(tickets,filters,contract==='All'?null:[contract]);
  assert.deepEqual(actual,expected);
  for(const variant of [undefined,'A','B','C','D'])assert.equal(renderEmail(actual,settings,filters,variant),renderEmail(expected,settings,filters,variant));
  assert.equal(renderPlainText(actual,settings,filters),renderPlainText(expected,settings,filters));
 }
});
test('multiple contracts are a union after dedupe, retaining group and monitoring rules',()=>{
 const report=generateContractReport(tickets,options,['EXAMPLE-A','EXAMPLE-B']);
 assert.deepEqual(report.created.map(t=>t.id),['INC-A','SRV-B']);
 assert.deepEqual(report.counts,{created:2,closed:1,pending:1});
 assert.equal(report.rawCount,7);assert.equal(report.duplicateCount,1);
 assert.equal(generateContractReport(tickets,{...options,excludeEvents:false},['EXAMPLE-A','EXAMPLE-B']).totalUnique,3);
 assert.equal(generateContractReport(tickets,{...options,groupFilter:'Another Team'},['EXAMPLE-A','EXAMPLE-B']).totalUnique,0);
});
test('empty selection is empty; All includes blank and newly appearing contracts',()=>{
 assert.equal(generateContractReport(tickets,options,[]).totalUnique,0);
 assert.equal(generateContractReport(tickets,options,['']).totalUnique,1);
 assert.equal(generateContractReport([...tickets,ticket('INC-NEW','EXAMPLE-NEW')],options,null).totalUnique,6);
 assert.equal(generateContractReport([ticket('INC-ALL','All'),ticket('INC-OTHER','Other')],options,['All']).totalUnique,1);
 assert.equal(contractLabel([]),'None selected');assert.equal(contractLabel(null),'All');assert.equal(contractLabel(['']),'(blank)');
});
test('missing selected contracts are detected using the latest deduped snapshot',()=>{
 assert.deepEqual(missingContracts(tickets,['EXAMPLE-A','EXAMPLE-Z']),['EXAMPLE-Z']);
 assert.deepEqual(missingContracts(tickets,null),[]);
 assert.deepEqual(missingContracts([ticket('INC-X','OLD','Pending','Incident',1),ticket('INC-X','NEW','Pending','Incident',2)],['OLD']),['OLD']);
});
test('pending email, text and workbook reuse the multi-contract scope',()=>{
 const contracts=['EXAMPLE-A','EXAMPLE-C'];
 const report=generateContractReport(tickets,options,contracts);
 const view=buildPendingView(report,{contractFilter:contractLabel(contracts),asAt:'2026-11-23'});
 assert.equal(view.total,3);
 const settings={signatures:[]};
 for(const variant of ['A','B','C','D']){
  const html=renderPendingEmail(view,settings,variant);
  assert.match(html,/EXAMPLE-A, EXAMPLE-C/);assert.doesNotMatch(html,/SRV-B|INC-BLANK/);
 }
 const plain=renderPendingPlainText(view,settings);assert.match(plain,/EXAMPLE-A, EXAMPLE-C/);assert.doesNotMatch(plain,/SRV-B|INC-BLANK/);
 const sheets=workbookSheets(view);assert.deepEqual(sheets.Scope[1],['Contract','EXAMPLE-A, EXAMPLE-C']);assert.equal(sheets.Tickets.length,4);
});

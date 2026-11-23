import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
async function download(id){const pending=page.waitForEvent('download');await page.locator(id).click();return await readFile(await (await pending).path());}
try{
 await page.goto(process.env.BMC_PREVIEW_URL||'http://127.0.0.1:4177');await page.locator('#modalClose').click();await page.locator('#demoBtn').click();await page.locator('#result').waitFor({state:'visible'});
 const daily=await page.locator('#emailFrame').getAttribute('srcdoc');
 await page.selectOption('#reportContent','pending');await page.locator('#weeklySetup').click();await page.locator('#asAt').fill('2026-11-18');await page.locator('#asAt').dispatchEvent('change');
 assert.equal(await page.locator('#outstandingTotal').textContent(),'2');
 for(const variant of ['A','B','C','D']){await page.selectOption('#emailVariant',variant);await page.frameLocator('#emailFrame').locator('h1').waitFor();const html=await page.locator('#emailFrame').getAttribute('srcdoc');assert.ok(html.includes('Age since submitted'));assert.ok(!html.includes('Outstanding tickets (2)'));const width=await page.frameLocator('#emailFrame').locator('body > table').evaluate(e=>e.getBoundingClientRect().width);assert.ok(width<=801,`${variant} width ${width}`);}
 const bytes=await download('#downloadWorkbook');const rows=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets.Tickets,{header:1});},[...bytes]);assert.equal(rows.length,3);assert.ok(!rows[0].includes('Engineer'));
 const script=(await download('#downloadClassic')).toString('utf8');assert.ok(script.includes('BMC_Outstanding_Tickets.xlsx'));assert.ok(!script.includes('$mail.Send('));
 await page.locator('#settingsBtn').click();const backup=await download('#exportSettings');await page.locator('#modalClose').click();
 await page.locator('#resetSetup').click();await page.locator('#settingsBtn').click();await page.locator('#importSettings').setInputFiles({name:'setup.json',mimeType:'application/json',buffer:backup});await page.locator('#modalClose').click();assert.equal(await page.locator('#outstandingTotal').textContent(),'2');
 await page.selectOption('#reportContent','daily');await page.selectOption('#emailVariant','A');assert.equal(await page.locator('#emailFrame').getAttribute('srcdoc'),daily);assert.deepEqual(errors,[]);
 await page.selectOption('#reportContent','monthly');await page.locator('#resetSetup').click();await page.locator('#asAt').fill('2026-11-18');await page.locator('#asAt').dispatchEvent('change');
 assert.equal(await page.locator('#outstandingTotal').textContent(),'5');assert.match(await page.locator('#previewSubject').textContent(),/Monthly pending tickets/);assert.match(await page.locator('#emailFrame').getAttribute('srcdoc'),/BMC Monthly Pending Tickets/);
 const monthly=await download('#downloadWorkbook');const headers=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets.Tickets,{header:1})[0]},[...monthly]);assert.ok(headers.includes('Status')&&headers.includes('Priority'));
 const csv='Ticket ID,Submit Date,Resolved Date,Status,Assigned Group,Contract Number\nINC-EXAMPLE,2026-10-01,,Assigned,NCC_Application,EXAMPLE-A';
 await page.locator('#fileInput').setInputFiles({name:'example.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.locator('#contractFilter').evaluate(el=>el.open=true);await page.locator('#contractChoices input[value="EXAMPLE-A"]').check();await page.locator('#weeklySetup').click();await page.locator('#saveReportSetup').click();
 await page.locator('#fileInput').setInputFiles({name:'next.csv',mimeType:'text/csv',buffer:Buffer.from(csv+'\nSRV-EXAMPLE,2026-10-02,,Pending,NCC_Application,EXAMPLE-A')});await page.waitForFunction(()=>document.getElementById('fileLabel').textContent==='next.csv');assert.equal(await page.locator('#outstandingTotal').textContent(),'2');assert.equal(await page.locator('#contractSelection').textContent(),'EXAMPLE-A');
 await page.selectOption('#pendingStatuses',['Pending']);await page.locator('#fileInput').setInputFiles({name:'later.csv',mimeType:'text/csv',buffer:Buffer.from(csv+'\nSRV-EXAMPLE,2026-10-02,,Pending,NCC_Application,EXAMPLE-A')});await page.waitForFunction(()=>document.getElementById('fileLabel').textContent==='later.csv');assert.equal(await page.locator('#outstandingTotal').textContent(),'1');

 await page.locator('#resetSetup').click();await page.locator('#asAt').fill('2026-11-30');await page.locator('#asAt').dispatchEvent('change');
 await page.locator('#fileInput').setInputFiles({name:'all-first.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.waitForFunction(()=>document.getElementById('fileLabel').textContent==='all-first.csv');
 const expanded=csv+'\nINC-HOLD,2025-01-01,,On Hold,NCC_Application,EXAMPLE-A\nFSC-NEW,2025-01-01,,Pending,NCC_Application,EXAMPLE-A';
 await page.locator('#fileInput').setInputFiles({name:'all-next.csv',mimeType:'text/csv',buffer:Buffer.from(expanded)});await page.waitForFunction(()=>document.getElementById('fileLabel').textContent==='all-next.csv');assert.equal(await page.locator('#outstandingTotal').textContent(),'3');assert.equal(await page.locator('#asAt').inputValue(),'2026-11-30');assert.ok(!(await page.locator('#setupStatus').textContent()).includes('Unsaved'));
 await page.locator('#saveReportSetup').click();await page.selectOption('#pendingStatuses',['Assigned']);assert.match(await page.locator('#newScopeValues').textContent(),/On Hold/);
 await page.selectOption('#reportContent','pending');await page.locator('#asAt').fill('2026-11-10');await page.locator('#asAt').dispatchEvent('change');await page.selectOption('#reportContent','monthly');assert.equal(await page.locator('#asAt').inputValue(),'2026-11-30');
 await page.reload();assert.match(await page.locator('#setupStatus').textContent(),/Saved setup/);
 console.log('PASS: weekly browser flow, four themes, Excel round trip, attached draft, setup import, daily unchanged');
}finally{await browser.close();}

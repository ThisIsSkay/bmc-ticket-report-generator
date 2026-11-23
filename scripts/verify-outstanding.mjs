/** Optional integration check: NODE_PATH=/path/to/node_modules node scripts/verify-outstanding.mjs
 * Requires Playwright and a running prototype server; uses fictional data only.
 */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}});
const page=await context.newPage();
page.on('dialog',dialog=>dialog.accept());
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
await page.addInitScript(()=>{
 if(window!==window.top)return; // Do not inject storage mocks into the sandboxed email preview.
 if(!localStorage.getItem('bmc-daily-email-report:settings:v1'))localStorage.setItem('bmc-daily-email-report:settings:v1',JSON.stringify({emailVariant:'A',reportContent:'daily',signatures:[]}));
 Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.clipboardText=await (await items[0].getType('text/plain')).text();window.clipboardHtml=await (await items[0].getType('text/html')).text();},writeText:async text=>{window.clipboardText=text;}}});
});
const html=()=>page.locator('#emailFrame').getAttribute('srcdoc');
const preview=()=>page.frames().find(frame=>frame.url()==='about:srcdoc');
const width=async()=>{await page.frameLocator('#emailFrame').locator('body > table').waitFor();return preview().locator('body > table').evaluate(el=>el.getBoundingClientRect().width);};
async function download(id){const wait=page.waitForEvent('download');await page.locator(id).click();const item=await wait;return {name:item.suggestedFilename(),content:await readFile(await item.path(),'utf8')};}
try{
 await page.goto(process.env.BMC_PREVIEW_URL||'http://127.0.0.1:4177');
 await page.locator('#demoBtn').click();await page.locator('#result').waitFor({state:'visible'});
 await page.selectOption('#reportContent','pending');await page.locator('#asAt').fill('2026-11-18');await page.locator('#asAt').dispatchEvent('change');await page.selectOption('#reportContent','daily');
 const daily={};
 for(const variant of ['A','B','C','D']){
  await page.selectOption('#emailVariant',variant);daily[variant]=await html();
  await page.selectOption('#reportContent','pending');
  check(await page.locator('#dailyDateControl').isHidden(),'Daily report date hidden');
  check(await page.locator('#pendingSummary').isVisible(),'Outstanding dashboard visible');
  check(await page.locator('#outstandingTotal').textContent()==='5','Sample outstanding total');
  for(const engineer of [false,true]){
   await page.locator('#showEngineer').setChecked(engineer);
   const markup=await html();check(markup.includes('Outstanding tickets (5)'),'Pending heading');
   check(markup.includes('>Engineer</th>')===engineer,'Engineer visibility');
   check(Math.abs(await width()-800)<1,`${variant} sample width`);
   await page.evaluate(()=>{window.clipboardText=undefined;window.clipboardHtml=undefined;});
   await page.locator('#copyHtml').click();
   await page.waitForFunction(()=>typeof window.clipboardHtml==='string');
   check((await page.evaluate(()=>window.clipboardText)).includes('Outstanding: 5'),'Plain clipboard');
   check(await page.evaluate(()=>window.clipboardHtml)===markup,'HTML clipboard matches preview');
   const h=await download('#downloadHtml');check(h.content===markup,'HTML download matches preview');check(h.name==='BMC_Outstanding_Tickets.html','Pending filename');
   await page.selectOption('#clientChoice','new');
   const eml=await download('#downloadEml');const encoded=eml.content.split(/\r?\n\r?\n/).slice(1).join('\n');
   check(Buffer.from(encoded.replace(/\s/g,''),'base64').toString('utf8')===markup,'EML matches preview');
   check((await page.locator('#previewSubject').textContent()).includes('2026-11-18'),'Dated pending subject');
   await page.selectOption('#clientChoice','classic');
   const ps=await download('#downloadClassic');check(ps.content.includes(markup),'Classic Outlook contains selected HTML');check(!ps.content.includes('$mail.Send('),'No automatic sending');
  }
  await page.selectOption('#reportContent','daily');check(await html()===daily[variant],`${variant} daily unchanged after mode switch`);
 }
 const csv=['Ticket ID,Submit Date,Resolved Date,Last Modified Date,Status,Assigned Engineer,Assigned Group,Description,Contract Number,Priority',
 'INC000000000001,2026-11-01,,2026-11-01,Pending,Alex Example,NCC_Application,Stale snapshot,EXAMPLE-A,High',
 'INC000000000001,2026-11-01,,2026-11-12,Assigned,Alex Example,NCC_EUC,Reassigned,EXAMPLE-A,High',
 'INC000000000002,2026-11-11,,2026-11-12,On Hold,Alex Example,NCC_Application,'+'W'.repeat(260)+',EXAMPLE-A,High',
 'SRV000000000003,2026-11-12,,2026-11-12,Escalated,Alex Example,NCC_Application,Needs investigation,EXAMPLE-A,Medium',
 'INC000000000004,2026-11-12,,2026-11-12,Pending,Alex Example,NCC_Application,Other customer,EXAMPLE-B,Low',
 'INC000000000005,2026-11-12,2026-11-12,2026-11-12,Resolved,Alex Example,NCC_Application,Resolved,EXAMPLE-A,Low'].join('\n');
 await page.locator('#fileInput').setInputFiles({name:'fictional-outstanding.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.selectOption('#reportContent','pending');await page.locator('#contractFilter').evaluate(el=>el.open=true);await page.locator('#contractChoices input[value="EXAMPLE-A"]').check();
 await page.locator('#allPendingGroups').uncheck();
 await page.locator('#pendingGroups input[value="NCC_EUC"]').uncheck();
 check(await page.locator('#outstandingTotal').textContent()==='2','Application filtered after dedupe');
 check(!(await html()).includes('INC000000000001'),'Reassigned stale ticket absent');
 check(!(await html()).includes('Other customer'),'Contract filter respected');
 check((await page.locator('#fileWarning').textContent()).includes('Escalated'),'Unknown status warning retained');
 for(const variant of ['A','B','C','D'])for(const engineer of [false,true]){
  await page.selectOption('#emailVariant',variant);await page.locator('#showEngineer').setChecked(engineer);
  check(Math.abs(await width()-800)<1,`${variant} long summary width, engineer=${engineer}: ${await width()}`);
 }
 await page.locator('#pendingGroups input[value="NCC_Application"]').uncheck();
 check(await page.locator('#outstandingTotal').textContent()==='0','None selected is empty');
 check((await html()).includes('There are no outstanding tickets'),'Empty email');
 await page.locator('#allPendingGroups').check();check(await page.locator('#outstandingTotal').textContent()==='3','All restores current scoped groups');
 await page.selectOption('#reportContent','daily');await page.locator('#dateInput').fill('');await page.locator('#dateInput').dispatchEvent('change');
 await page.selectOption('#reportContent','pending');check(await page.locator('#pendingSummary').isVisible(),'Pending does not require a daily report date');
 check(await page.locator('#outstandingTotal').textContent()==='3','Cleared daily date does not change outstanding totals');
 await page.locator('#settingsBtn').click();await page.locator('#pendingSubjectInput').fill('Customer outstanding');await page.locator('#pendingIntroInput').fill('Current export for review.');await page.locator('#saveSettings').click();
 check(await page.locator('#previewSubject').textContent()==='Customer outstanding','Custom pending subject');
 await page.locator('#settingsBtn').click();const backup=await download('#exportSettings');await page.locator('#modalClose').click();
 await page.selectOption('#reportContent','daily');
 await page.locator('#settingsBtn').click();await page.locator('#importSettings').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(backup.content)});await page.locator('#modalClose').click();
 check(await page.locator('#reportContent').inputValue()==='pending','Imported mode synchronized');
 check(await page.locator('#previewSubject').textContent()==='Customer outstanding','Imported pending subject');
 await page.reload();check(await page.locator('#reportContent').inputValue()==='pending','Mode survives reload');
 await page.locator('#demoBtn').click();await page.locator('#result').waitFor({state:'visible'});await page.locator('#resetSetup').click();check(await page.locator('#outstandingTotal').textContent()==='5','New upload resets group choices');
 check(errors.length===0,errors.join('\n'));
 console.log(`PASS: ${checks} browser checks`);
}finally{await browser.close();}

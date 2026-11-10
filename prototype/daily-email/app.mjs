import {detectColumns, mandatoryColumns, normalizeTickets, generateReport, availableFilterValues, lastActivityDate, parseCsv} from './lib/report-core.mjs';
import {parseXlsx} from './lib/xlsx-lite.mjs';
import {renderEmail, renderEml, buildSubject} from './lib/mail.mjs';
import {renderClassicOutlookScript} from './lib/classic-outlook.mjs';
import {sanitizeSignatureHtml, plainToSignatureHtml, imageFileToDataUrl} from './lib/signature-html.mjs';

const $=id=>document.getElementById(id);
const CONFIG_KEY='bmc-daily-email-report:settings:v1';
const DEFAULTS={to:'',cc:'',bcc:'',subject:'Daily BMC Ticket Report – {date}',greeting:'Hi Team,',intro:'Please find below the daily BMC ticket activity report.',client:'classic',signatureId:'',signatures:[{id:'support',name:'IT Support Team',content:'Best regards,\nIT Support Team'}]};
const state={file:null,rows:[],tickets:[],mapping:{},date:'',report:null,settings:loadSettings(),sourceInfo:'',dataErrors:[],includeLists:true};
function loadSettings(){try{const v=JSON.parse(localStorage.getItem(CONFIG_KEY));if(!v||typeof v!=='object')return structuredClone(DEFAULTS);return {...structuredClone(DEFAULTS),...v,signatures:Array.isArray(v.signatures)?v.signatures:structuredClone(DEFAULTS.signatures)};}catch{return structuredClone(DEFAULTS)}}
function storeSettings(){try{localStorage.setItem(CONFIG_KEY,JSON.stringify(state.settings));return true;}catch{toast('Cannot save settings: reduce logo size or back up other profiles.');return false;}}
function text(id,value){$(id).textContent=String(value??'');}
function h(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(msg){const box=$('toast');box.textContent=msg;box.classList.add('show');setTimeout(()=>box.classList.remove('show'),4000);}
function fileDownload(contents,name,mime='text/plain;charset=utf-8'){
 const blob=new Blob([contents],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function safeFilename(v){return String(v).replace(/[^a-zA-Z0-9._-]/g,'_')}
function dateDefault(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function makeTable(headers,rows,opts={}){
 const names=headers.map(x=>`<th>${h(x)}</th>`).join('');
 if(!rows.length)return '<div class="empty">No matching tickets.</div>';
 return `<table class="report-table"><thead><tr>${names}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((val,i)=>`<td class="${opts.textCols?.includes(i)?'text wrap':''}">${h(val===undefined||val===null||val===''?'—':val)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function pivotRows(rows,columns){return rows.map(r=>[r.group,r.created,r.closed,r.pending]);}
function saveLocalSettings(){state.settings={...state.settings,to:$('toInput').value,cc:$('ccInput').value,bcc:$('bccInput').value,subject:$('subjectInput').value,greeting:$('greetingInput').value,intro:$('introInput').value,client:$('clientChoice').value};if(!storeSettings())return;updateSignatureSelector();refreshReport();$('modal').hidden=true;toast('Settings saved to this browser.');}
let editingProfileId='';
function profileOptions(){
 const list=$('profileList');
 list.innerHTML=state.settings.signatures.map(p=>'<option value="'+h(p.id)+'">'+h(p.name)+'</option>').join('');
 if(!state.settings.signatures.length){$('profileName').value='';$('profileEditor').innerHTML='';return;}
 if(!state.settings.signatures.some(p=>p.id===editingProfileId))editingProfileId=state.settings.signatures[0].id;
 list.value=editingProfileId;populateEditingProfile();
}
function populateEditingProfile(){
 const profile=state.settings.signatures.find(p=>p.id===editingProfileId);
 $('profileName').value=profile?.name||'';
 $('profileEditor').innerHTML=sanitizeSignatureHtml(profile?.html??plainToSignatureHtml(profile?.content||''));
}
function syncProfile(){
 const profile=state.settings.signatures.find(p=>p.id===editingProfileId);
 if(profile){
   profile.name=$('profileName').value.trim()||'Unnamed signature';
   profile.html=sanitizeSignatureHtml($('profileEditor').innerHTML);
   profile.content=$('profileEditor').innerText||'';
   storeSettings();updateSignatureSelector();refreshReport();
 }
}
function editorSelection(){
 const sel=window.getSelection();
 return sel?.rangeCount&&$('profileEditor').contains(sel.anchorNode)?sel.getRangeAt(0).cloneRange():null;
}
function insertSignatureHtml(markup,savedRange){
 const editor=$('profileEditor');editor.focus();const selection=window.getSelection();
 let range=savedRange?.cloneRange();
 if(!range||!editor.contains(range.commonAncestorContainer)){
   range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
 }
 range.deleteContents();
 const fragment=range.createContextualFragment(sanitizeSignatureHtml(markup)),last=fragment.lastChild;
 range.insertNode(fragment);
 if(last){range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
 syncProfile();
}
async function addSignatureImages(files,markup='',selectionRange){
 const images=[];for(const file of files)images.push(await imageFileToDataUrl(file));
 let output=markup,replaced=0;
 if(output){
   const doc=new DOMParser().parseFromString(output,'text/html');
   for(const img of doc.querySelectorAll('img')){if(replaced>=images.length)break;img.setAttribute('src',images[replaced++]);}
   output=doc.body.innerHTML;
 }
 output+=images.slice(replaced).map(src=>'<div><img src="'+src+'" alt="Signature logo" style="max-width:100%;height:auto"></div>').join('');
 insertSignatureHtml(output,selectionRange);
 toast('Signature image inserted. Save settings to keep it.');
}
async function handleSignaturePaste(event){
 const board=event.clipboardData;if(!board)return;
 const files=[...board.items].filter(item=>item.kind==='file'&&['image/png','image/jpeg'].includes(item.type)).map(item=>item.getAsFile()).filter(Boolean);
 const html=board.getData('text/html'),plain=board.getData('text/plain');
 if(files.length){
   event.preventDefault();const selection=editorSelection();
   try{await addSignatureImages(files,html||plainToSignatureHtml(plain),selection);}
   catch(err){toast(err.message||'Cannot paste image.');}
   return;
 }
 if(html){
   event.preventDefault();const hadImages=/<img\b/i.test(html),clean=sanitizeSignatureHtml(html);
   insertSignatureHtml(clean,editorSelection());
   if(hadImages&&!/<img\b/i.test(clean))toast('Outlook did not provide image bytes. Use Insert PNG/JPEG for the logo.');
 }
}
function updateSignatureSelector(){const choice=$('signatureChoice');const previous=state.settings.signatureId;
 choice.innerHTML='<option value="">No signature / use email client signature</option>'+state.settings.signatures.map(p=>`<option value="${h(p.id)}">${h(p.name)}</option>`).join('');choice.value=state.settings.signatures.some(p=>p.id===previous)?previous:'';state.settings.signatureId=choice.value;}
function showModal(){const s=state.settings;$('toInput').value=s.to||'';$('ccInput').value=s.cc||'';$('bccInput').value=s.bcc||'';$('subjectInput').value=s.subject||'';$('greetingInput').value=s.greeting||'';$('introInput').value=s.intro||'';profileOptions();$('modal').hidden=false;}
function fillSelect(id,options,label){const sel=$(id),was=sel.value;sel.innerHTML=`<option value="All">${label}</option>`+options.map(v=>`<option value="${h(v)}">${h(v)}</option>`).join('');sel.disabled=options.length===0;sel.value=options.includes(was)?was:'All';}
function importRows(headers,rows,filename,meta){state.file=filename;state.rows=rows;state.mapping=detectColumns(headers);state.dataErrors=mandatoryColumns.filter(k=>!state.mapping[k]);
 const missingOptional=['resolved','assigned','group','description','kind','contract'].filter(k=>!state.mapping[k]);
 const warnings=[];if(state.dataErrors.length)warnings.push('Required columns not detected: '+state.dataErrors.join(', '));
 if(!state.mapping.resolved)warnings.push('Resolved Date is missing. Closed-on-date counts cannot be computed accurately.');
 if(missingOptional.length)warnings.push('Optional column(s) not found: '+missingOptional.join(', '));
 $('fileWarning').hidden=warnings.length===0;$('fileWarning').textContent=warnings.join(' · ');
 state.tickets=state.dataErrors.length?[]:normalizeTickets(rows,state.mapping);
 fillSelect('groupFilter',availableFilterValues(state.tickets,'group'),'All groups');
 fillSelect('contractFilter',availableFilterValues(state.tickets,'contract'),'All contracts');
 $('latestBtn').disabled=!state.tickets.length;
 state.date=lastActivityDate(state.tickets)||dateDefault();$('dateInput').value=state.date;
 text('fileLabel',filename);text('sourceMeta',meta||`${rows.length.toLocaleString()} rows loaded`);text('importInfo',`Source: ${filename} · ${rows.length.toLocaleString()} rows · ${headers.length} columns · ${state.tickets.length.toLocaleString()} records normalized`);
 refreshReport();
}
async function importFile(file){try{if(!file) return; const name=file.name;let book;
 if(/\.csv$/i.test(name)){const text=await file.text();book=parseCsv(text);book.name='CSV';book.worksheets=[{name:'CSV',count:book.rows.length}];}
 else if(/\.xlsx$/i.test(name)){book=await parseXlsx(await file.arrayBuffer());}
 else throw new Error('Choose an .xlsx or .csv file.');
 importRows(book.headers,book.rows,name,`${book.rows.length.toLocaleString()} rows · worksheet: ${book.name}`);
 }catch(error){$('fileWarning').hidden=false;$('fileWarning').textContent=error?.message||'Could not read the selected file';$('result').hidden=true;toast('Import failed.');}}
function filters(){return {reportDate:$('dateInput').value,groupFilter:$('groupFilter').value,contractFilter:$('contractFilter').value,excludeEvents:$('eventFilter').value==='exclude'};}
function updateClientNotes(){const c=$('clientChoice').value;const messages={classic:'Classic Outlook: download the local PowerShell helper (.ps1), then right-click it and choose Run with PowerShell. It opens an unsent editable draft in your existing Outlook profile AND saves a native .msg file beside the helper. This avoids the broken .eml import path. Scripts may be blocked by your organisation\'s security policy; Copy formatted email is the fallback.',new:'New Outlook: .eml can be opened, but editable draft behaviour may vary. Use Copy formatted email if composing a fresh message.',gmail:'Gmail: use Copy formatted email to paste into a signed-in compose window. .eml is an archive-compatible output, not a Gmail draft.'};$('downloadClassic').hidden=c!=='classic';$('downloadEml').hidden=c==='classic';text('clientNote',messages[c]||'');}
function makeEmail(){return renderEmail(state.report,{...state.settings,signatureId:$('signatureChoice').value,signatures:state.settings.signatures.map(p=>({...p,html:sanitizeSignatureHtml(p.html??plainToSignatureHtml(p.content))}))},filters());}
function refreshReport(){if(!state.tickets.length||!$('dateInput').value){$('result').hidden=true;return;}
 if(!state.mapping.resolved){$('result').hidden=true;$('fileWarning').hidden=false;$('fileWarning').textContent='Resolved Date column is required for reliable closed-on-date reporting. Select a complete BMC export.';return;}
 const options=filters();state.date=options.reportDate;state.report=generateReport(state.tickets,options);const r=state.report;
 $('result').hidden=false;text('reportCaption',`Report date ${r.reportDate} · Created and resolved activity from one exported snapshot`);
 text('createdCount',r.counts.created.toLocaleString());text('closedCount',r.counts.closed.toLocaleString());text('pendingCount',r.counts.pending.toLocaleString());text('uniqueCount',r.totalUnique.toLocaleString());
 $('pivotTable').innerHTML=makeTable(['Assigned group','Created','Closed','Outstanding'],[...pivotRows(r.pivot),['TOTAL',r.counts.created,r.counts.closed,r.counts.pending]],{textCols:[0]});
 $('typeTable').innerHTML=makeTable(['Ticket type','Created','Closed','Outstanding'],[...pivotRows(r.byType),['TOTAL',r.counts.created,r.counts.closed,r.counts.pending]],{textCols:[0]});
 $('createdTable').innerHTML=makeTable(['Ticket ID','Type','Summary','Engineer','Group','Status'],r.created.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),{textCols:[2]});
 $('closedTable').innerHTML=makeTable(['Ticket ID','Type','Summary','Engineer','Group','Status'],r.closed.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),{textCols:[2]});
 const html=makeEmail();$('emailFrame').srcdoc=html;
 text('previewTo',state.settings.to||'(not configured)');text('previewCc',state.settings.cc||'—');text('previewSubject',buildSubject(state.settings.subject,r.reportDate));updateClientNotes();
}
async function copyEmail(){try{const html=makeEmail();const plain=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined')await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
 else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(plain);toast('Formatted clipboard unsupported: copied plain text.');return;}else throw Error('Clipboard unavailable. Download HTML instead.');
 toast('Formatted email copied.');}catch(err){toast(err.message||'Copy failed. Use Download HTML.');}}
async function loadDemo(){const res=await fetch('./samples/fictional-tickets.csv');if(!res.ok)throw Error('Demo file unavailable');const csv=parseCsv(await res.text());importRows(csv.headers,csv.rows,'fictional-tickets.csv','Fictional sample only · contains no customer data');}
function validateAddresses(value){const parts=String(value||'').split(/[;,\n]+/).map(v=>v.trim()).filter(Boolean);return parts.every(v=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v));}
function init(){$('dateInput').value=dateDefault();$('clientChoice').value=state.settings.client||'classic';updateSignatureSelector();updateClientNotes();
 $('settingsBtn').addEventListener('click',showModal);$('modalClose').addEventListener('click',()=>{$('modal').hidden=true});
 $('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').hidden=true});
 $('saveSettings').addEventListener('click',()=>{if(!['toInput','ccInput','bccInput'].every(k=>validateAddresses($(k).value))){text('settingsStatus','Check email address format, then save.');return;}syncProfile();saveLocalSettings();});
 $('profileList').addEventListener('change',e=>{editingProfileId=e.target.value;populateEditingProfile();});
 $('profileName').addEventListener('change',syncProfile);
 $('profileEditor').addEventListener('input',syncProfile);
 $('profileEditor').addEventListener('paste',handleSignaturePaste);
 $('signatureImage').addEventListener('change',async event=>{
   const files=[...(event.target.files||[])];
   if(files.length){try{await addSignatureImages(files,'',editorSelection());}catch(err){toast(err.message||'Cannot insert image.');}}
   event.target.value='';
 });
 for(const [id,cmd] of [['sigBold','bold'],['sigItalic','italic'],['sigUnderline','underline']]){
   $(id).addEventListener('mousedown',event=>event.preventDefault());
   $(id).addEventListener('click',()=>{$('profileEditor').focus();document.execCommand(cmd,false);syncProfile();});
 }
 $('sigLink').addEventListener('mousedown',event=>event.preventDefault());
 $('sigLink').addEventListener('click',()=>{
   const url=prompt('Enter https:// or mailto: link');
   if(url&&/^(https?:\/\/|mailto:)/i.test(url)){$('profileEditor').focus();document.execCommand('createLink',false,url);syncProfile();}
 });
 $('addSignature').addEventListener('click',()=>{const id='sig-'+Math.random().toString(36).slice(2,10);state.settings.signatures.push({id,name:'New signature',content:''});editingProfileId=id;profileOptions();$('profileName').focus();});
 $('removeSignature').addEventListener('click',()=>{state.settings.signatures=state.settings.signatures.filter(s=>s.id!==editingProfileId);if(state.settings.signatureId===editingProfileId)state.settings.signatureId='';profileOptions();updateSignatureSelector();});
 $('exportSettings').addEventListener('click',()=>fileDownload(JSON.stringify({version:1,settings:state.settings},null,2),'bmc-daily-email-settings.json','application/json'));
 $('importSettings').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());const settings=data.settings;if(!settings||typeof settings!=='object'||!Array.isArray(settings.signatures))throw Error('Invalid settings file');state.settings={...structuredClone(DEFAULTS),...settings,signatures:settings.signatures.map(p=>({...p,html:sanitizeSignatureHtml(p.html??plainToSignatureHtml(p.content))}))};storeSettings();showModal();updateSignatureSelector();refreshReport();toast('Settings imported.');}catch(ex){toast(ex.message)}e.target.value='';});
 $('demoBtn').addEventListener('click',()=>loadDemo().catch(e=>toast(e.message)));
 $('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await importFile(f);e.target.value='';});
 ['dateInput','groupFilter','contractFilter','eventFilter'].forEach(k=>$(k).addEventListener('change',refreshReport));
 $('latestBtn').addEventListener('click',()=>{const val=lastActivityDate(state.tickets);if(val){$('dateInput').value=val;refreshReport()}});
 $('detailsToggle').addEventListener('click',()=>{const was=$('ticketLists').hidden;$('ticketLists').hidden=!was;$('detailsToggle').textContent=was?'Hide ticket lists':'Show ticket lists';});
 $('clientChoice').addEventListener('change',e=>{state.settings.client=e.target.value;storeSettings();updateClientNotes()});
 $('signatureChoice').addEventListener('change',e=>{state.settings.signatureId=e.target.value;storeSettings();refreshReport()});
 $('downloadClassic').addEventListener('click',()=>{if(!state.report)return;const script=renderClassicOutlookScript(makeEmail(),state.settings,state.report.reportDate);fileDownload(script,`BMC_Daily_Report_${safeFilename(state.report.reportDate)}_Outlook.ps1`,'text/plain;charset=utf-8');toast('Classic Outlook draft helper downloaded. Right-click and Run with PowerShell; no email is sent automatically.');});
 $('downloadEml').addEventListener('click',()=>{if(!state.report)return;const html=makeEmail(), eml=renderEml(html,state.settings,state.report.reportDate);fileDownload(eml,`BMC_Daily_Report_${safeFilename(state.report.reportDate)}.eml`,'message/rfc822');toast('EML downloaded; review before sending. For Classic Outlook use the dedicated draft helper instead.')});
 $('downloadHtml').addEventListener('click',()=>{if(!state.report)return;fileDownload(makeEmail(),`BMC_Daily_Report_${safeFilename(state.report.reportDate)}.html`,'text/html;charset=utf-8')});
 $('copyHtml').addEventListener('click',copyEmail);
 if(!localStorage.getItem(CONFIG_KEY))setTimeout(showModal,250);
}
init();

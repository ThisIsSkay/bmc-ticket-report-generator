import {readHeaderLogo,validHeaderLogo,logoDisplaySize,logoWarning,persistCandidate} from './lib/header-logo.mjs';
import {buildWorkbook} from './lib/workbook.mjs';
import {dayNumber} from './lib/ageing.mjs';
import {detectColumns, mandatoryColumns, normalizeTickets, generateReport, availableFilterValues, lastActivityDate, parseCsv, updateReportWarnings} from './lib/report-core.mjs';
import {parseXlsx} from './lib/xlsx-lite.mjs';
import {renderEmail, renderEml, renderPlainText, renderPendingEmail, renderPendingPlainText, buildSubject} from './lib/mail.mjs';
import {normalizeSender, normalizeVariant, senderWarning} from './lib/email-themes.mjs';
import {renderClassicOutlookScript} from './lib/classic-outlook.mjs';
import {sanitizeSignatureHtml, plainToSignatureHtml, imageFileToDataUrl, signatureImageSize} from './lib/signature-html.mjs';
import {createDebouncedSaver, normalizeSettings} from './lib/settings-persistence.mjs';

import {buildPendingView,pendingCaption,pendingColumns,pendingTicketValues,normalizeReportContent,PENDING_SUBJECT,PENDING_INTRO} from './lib/pending-report.mjs';

const $=id=>document.getElementById(id);
const CONFIG_KEY='bmc-daily-email-report:settings:v1';
const DEFAULTS={to:'',cc:'',bcc:'',subject:'Daily BMC Ticket Report – {date}',greeting:'Hi Team,',intro:'Please find below the daily BMC ticket activity report.',client:'classic',reportContent:'daily',showEngineer:false,pendingSubject:PENDING_SUBJECT,pendingIntro:PENDING_INTRO,emailVariant:'A',emailSender:{name:'',title:'',company:'',phone:''},signatureId:'',signatures:[{id:'support',name:'IT Support Team',content:'Best regards,\nIT Support Team'}]};
const state={file:null,rows:[],tickets:[],mapping:{},date:'',report:null,pendingView:null,settings:loadSettings(),sourceInfo:'',dataErrors:[],dataWarnings:[]};
function loadSettings(){try{return normalizeSettings(JSON.parse(localStorage.getItem(CONFIG_KEY)),DEFAULTS);}catch{return normalizeSettings(null,DEFAULTS)}}
function storeSettings(){try{localStorage.setItem(CONFIG_KEY,JSON.stringify(state.settings));return true;}catch{toast('Cannot save settings: reduce logo size or back up other profiles.');return false;}}
const signaturePersistence=createDebouncedSaver(storeSettings,400);
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
function pivotRows(rows){return rows.map(r=>[r.group,r.created,r.closed,r.pending]);}
function saveLocalSettings(){state.settings={...state.settings,monthlySubject:$('monthlySubjectInput').value,monthlyIntro:$('monthlyIntroInput').value,to:$('toInput').value,cc:$('ccInput').value,bcc:$('bccInput').value,subject:$('subjectInput').value,pendingSubject:$('pendingSubjectInput').value.trim()||PENDING_SUBJECT,pendingIntro:$('pendingIntroInput').value.trim()||PENDING_INTRO,greeting:$('greetingInput').value,intro:$('introInput').value,client:$('clientChoice').value,emailVariant:normalizeVariant($('emailVariant').value),emailSender:normalizeSender({name:$('senderName').value,title:$('senderTitle').value,company:$('senderCompany').value,phone:$('senderPhone').value})};signaturePersistence.cancel();if(!storeSettings())return;updateSignatureSelector();refreshReport();$('modal').hidden=true;toast('Settings saved to this browser.');}
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
   signaturePersistence.queue();updateSignatureSelector();refreshReport();
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
 output+=images.slice(replaced).map(src=>{const size=signatureImageSize(src);return '<div><img src="'+src+'" alt="Signature logo"'+(size?' width="'+size.width+'" height="'+size.height+'"':'')+' style="max-width:100%;height:auto"></div>';}).join('');
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
function updateLogoPanel(message='',error=false){
 const src=state.settings.headerLogo,size=logoDisplaySize(src),image=$('headerLogoThumbnail');
 image.hidden=!size;if(size){image.src=src;image.width=size.width;image.height=size.height;}else image.removeAttribute('src');
 const pixels=signatureImageSize(src);
 text('headerLogoInfo',size?`${state.settings.headerLogoName||'Saved logo'} · ${pixels.width} × ${pixels.height} pixels · ${(src.length/1024).toFixed(1)} KiB encoded`:'No header logo saved.');
 text('headerLogoWarning',logoWarning(src));text('headerLogoStatus',message);$('headerLogoStatus').style.color=error?'#b42318':'#176b3a';
 let used=0;try{used=(localStorage.getItem(CONFIG_KEY)||'').length*2/1024;}catch{text('settingsStorageUse','Browser storage is unavailable.');return;}
 text('settingsStorageUse',`Approximate saved settings size: ${used.toFixed(0)} KiB. Browser storage limits vary.${used>3072?' Consider exporting a settings backup and reducing image sizes.':''}`);
}
function commitSettings(candidate){try{state.settings=persistCandidate(localStorage,CONFIG_KEY,candidate);return true;}catch{updateLogoPanel('Not saved: browser storage is full or unavailable. Previous logo and saved settings were kept.',true);return false;}}
function showModal(){updateLogoPanel();const s=state.settings;$('monthlySubjectInput').value=s.monthlySubject||'Monthly pending tickets — {date}';$('monthlyIntroInput').value=s.monthlyIntro||'Please find below the monthly pending ticket report as at {date}.';$('toInput').value=s.to||'';$('ccInput').value=s.cc||'';$('bccInput').value=s.bcc||'';$('subjectInput').value=s.subject||'';$('pendingSubjectInput').value=s.pendingSubject;$('pendingIntroInput').value=s.pendingIntro;$('greetingInput').value=s.greeting||'';$('introInput').value=s.intro||'';const sender=normalizeSender(s.emailSender);$('senderName').value=sender.name;$('senderTitle').value=sender.title;$('senderCompany').value=sender.company;$('senderPhone').value=sender.phone;profileOptions();$('modal').hidden=false;}
function fillSelect(id,options,label){const sel=$(id),was=sel.value;sel.innerHTML=`<option value="All">${label}</option>`+options.map(v=>`<option value="${h(v)}">${h(v)}</option>`).join('');sel.disabled=options.length===0;sel.value=options.includes(was)?was:'All';}
function importRows(headers,rows,filename,meta){state.file=filename;state.rows=rows;state.mapping=detectColumns(headers);state.dataErrors=mandatoryColumns.filter(k=>!state.mapping[k]);
 const missingOptional=['assigned','group','description','kind','contract'].filter(k=>!state.mapping[k]);
 const warnings=[];if(state.dataErrors.length)warnings.push('Required columns not detected: '+state.dataErrors.join(', '));
 if(!state.mapping.resolved)warnings.push('Resolved Date is required for closed-on-date counts. Select a complete BMC export.');
 if(missingOptional.length)warnings.push('Optional column(s) not found: '+missingOptional.join(', '));
 state.dataWarnings=warnings;
 updateReportWarnings($('fileWarning'),state.dataWarnings);
 state.tickets=state.dataErrors.length?[]:normalizeTickets(rows,state.mapping);
 fillSelect('groupFilter',availableFilterValues(state.tickets,'group'),'All groups');
 fillSelect('contractFilter',availableFilterValues(state.tickets,'contract'),'All contracts');
 fillPendingGroups();applySetup();if(isMonthly()&&!$('asAt').value){$('asAt').value=dateDefault();state.settings.monthlyAsAt=$('asAt').value;}
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
function emailSettings(){return {...state.settings,...(isMonthly()?{pendingIntro:state.settings.monthlyIntro||'Please find below the monthly pending ticket report as at {date}.',reportContent:'monthly'}:{}),signatureId:$('signatureChoice').value,signatures:state.settings.signatures.map(p=>({...p,html:sanitizeSignatureHtml(p.html??plainToSignatureHtml(p.content))}))};}
function updateSenderWarning(){const message=senderWarning({...state.settings,signatureId:$('signatureChoice').value});$('senderWarning').hidden=!message;text('senderWarning',message);}
const isPending=()=>['pending','monthly'].includes(state.settings.reportContent);
const isMonthly=()=>state.settings.reportContent==='monthly';
function fillPendingGroups(){$('allPendingTypes').checked=true;$('allPendingStatuses').checked=true;
 for(const [id,key] of [['pendingTypes','kind'],['pendingStatuses','status']])$(id).innerHTML=[...new Set([...generateReport(state.tickets,{...filters(),groupFilter:'All',contractFilter:'All',excludeEvents:false}).pending.map(ticket=>ticket[key]),...(state.activeSetup?.[key==='kind'?'types':'statuses']||state.settings.reportSetup?.[key==='kind'?'types':'statuses']||[])])].map(value=>`<option selected value="${h(value)}">${h(value||'(blank)')}</option>`).join('');
 const groups=availableFilterValues(state.tickets,'group');
 $('allPendingGroups').checked=true;
 $('pendingGroups').innerHTML=groups.map(group=>`<label><input type="checkbox" value="${h(group)}" checked disabled> ${h(group)}</label>`).join('');
}
function selectedPendingGroups(){return $('allPendingGroups').checked?null:[...$('pendingGroups').querySelectorAll('input:checked')].map(input=>input.value);}
function syncReportControls(){scopeStatus();
 $('reportContent').value=state.settings.reportContent;$('asAt').parentElement.firstChild.textContent=isMonthly()?'Reporting / export date':'Age reference date (calendar days since submission)';
 $('showEngineer').checked=state.settings.showEngineer;$('summaryOnly').checked=state.settings.summaryOnly===true;
 for(const id of ['dailyDateControl','dailyGroupControl','latestBtn'])$(id).hidden=isPending();
 $('pendingOptions').hidden=!isPending();$('downloadWorkbook').hidden=!isPending();$('exportScope').hidden=!isPending();
 $('dailySummary').hidden=isPending();$('pendingSummary').hidden=!isPending();
}
function updatePendingDashboard(){
 const v=state.pendingView,columns=pendingColumns(state.settings.showEngineer);
 $('pendingSummary').querySelector('h2').textContent=isMonthly()?'03 / Monthly pending tickets':'03 / Outstanding tickets';
 text('pendingCaption',(isMonthly()?`Reporting date: ${v.asAt}. Includes older pending tickets in this export. `:'')+pendingCaption(v)+(v.byAge.some(r=>r.name==='Future-dated'&&r.count)?' · Warning: some submission dates are after the age reference date.':'')+` · Excluded by type: ${v.excludedType}; by status: ${v.excludedStatus}`);text('outstandingTotal',v.total);text('outstandingIncidents',v.incidents);text('outstandingOther',v.other);
 $('weeklyBreakdowns').innerHTML=[['Group by type',v.groupType],['Type by priority',v.typePriority]].map(([title,m])=>`<h3>${title}</h3><div class="table-scroll">${makeTable(['',...m.columns,'Total'],[...m.rows.map(r=>[r.name,...r.counts,r.counts.reduce((a,b)=>a+b,0)]),['TOTAL',...m.columns.map((_,i)=>m.rows.reduce((n,r)=>n+r.counts[i],0)),v.total]])}</div>`).join('')+(v.asAt?`<h3>Age since submitted (days), as at ${h(v.asAt)}</h3>${makeTable(['Age band','Tickets'],v.byAge.map(r=>[r.name,r.count]))}`:'');
 const summary=(rows,label)=>makeTable([label,'Outstanding'],[...rows.map(row=>[row.name,row.count]),['TOTAL',v.total]],{textCols:[0]});
 $('pendingGroupTable').innerHTML=summary(v.byGroup,'Assigned group');
 $('pendingStatusTable').innerHTML=summary(v.byStatus,'Status');
 $('pendingTicketTable').innerHTML=v.total?makeTable(columns.map(c=>c.label),v.tickets.map(ticket=>pendingTicketValues(ticket,state.settings.showEngineer)),{textCols:columns.map((_,i)=>i)}):'<div class="empty">There are no outstanding tickets for this selection.</div>';
 text('exportScope',(state.scopeError?state.scopeError+' ':'')+`To: ${state.settings.to||'(not configured)'} · Contract: ${v.contractFilter} · ${v.total} tickets. Excel details must be attached manually when copying email or using EML.`);
 const contract=filters().contractFilter;
 text('customerScopeNote',!state.mapping.contract?'No Contract column was detected. Check that this export contains only the intended customer’s tickets.':contract==='All'?'All contracts are selected. Check the customer scope before copying or downloading.':`Contract: ${contract}. Check that this selection matches the intended customer.`);
}
function deliverySettings(){if(isMonthly())return {...state.settings,subject:state.settings.monthlySubject||'Monthly pending tickets — {date}'};return isPending()?{...state.settings,subject:state.settings.pendingSubject==='BMC Outstanding Tickets'?PENDING_SUBJECT:state.settings.pendingSubject}:state.settings;}
function deliveryDate(){return isPending()?state.pendingView.asAt||'current snapshot':state.report.reportDate;}
function exportBase(){if(isMonthly())return 'BMC_Monthly_Pending_'+safeFilename(deliveryDate());return isPending()?'BMC_Outstanding_Tickets':`BMC_Daily_Report_${safeFilename(state.report.reportDate)}`;}
function makeEmail(){const variant=normalizeVariant($('emailVariant')?.value||state.settings.emailVariant);return isPending()?renderPendingEmail(state.pendingView,emailSettings(),variant):renderEmail(state.report,emailSettings(),filters(),variant);}
function refreshReport(){syncReportControls();scopeStatus();if(!state.tickets.length||(!isPending()&&!$('dateInput').value)){$('result').hidden=true;return;}
 if(state.dataErrors.length){$('result').hidden=true;updateReportWarnings($('fileWarning'),state.dataWarnings);return;}
 const options=filters();state.date=options.reportDate;state.report=generateReport(state.tickets,isPending()?{...options,groupFilter:'All'}:options);const r=state.report;
 state.pendingView=isPending()?buildPendingView(r,{...options,groups:selectedPendingGroups(),types:typeSelection(),statuses:statusSelection(),asAt:$('asAt').value}):null;
 if(isPending()){const scoped=buildPendingView(r,{...options,groups:selectedPendingGroups()});const notices=[];for(const [key,selected] of [['kind',typeSelection()],['status',statusSelection()]])if(selected!==null){const counts=new Map();for(const ticket of scoped.tickets)if(!selected.includes(ticket[key]))counts.set(ticket[key],(counts.get(ticket[key])||0)+1);for(const [value,count] of counts)notices.push(`${value||'(blank)'} (${count})`);}text('newScopeValues',notices.length?'Values outside your selected setup: '+notices.join(', '):'');state.pendingView.monthly=isMonthly();updatePendingDashboard();}
 const unknown=isPending()?r.unknownStatuses.map(row=>({...row,count:state.pendingView.tickets.filter(ticket=>(ticket.status.trim()||'(blank)').toLowerCase()===row.status.toLowerCase()).length})).filter(row=>row.count):r.unknownStatuses;
 updateReportWarnings($('fileWarning'),state.dataWarnings,unknown);
 $('result').hidden=false;text('reportCaption',`Report date ${r.reportDate} · Created and resolved activity from one exported snapshot`);
 text('createdCount',r.counts.created.toLocaleString());text('closedCount',r.counts.closed.toLocaleString());text('pendingCount',r.counts.pending.toLocaleString());text('uniqueCount',r.totalUnique.toLocaleString());
 $('pivotTable').innerHTML=makeTable(['Assigned group','Created','Closed','Outstanding'],[...pivotRows(r.pivot),['TOTAL',r.counts.created,r.counts.closed,r.counts.pending]],{textCols:[0]});
 $('typeTable').innerHTML=makeTable(['Ticket type','Created','Closed','Outstanding'],[...pivotRows(r.byType),['TOTAL',r.counts.created,r.counts.closed,r.counts.pending]],{textCols:[0]});
 $('createdTable').innerHTML=makeTable(['Ticket ID','Type','Summary','Engineer','Group','Status'],r.created.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),{textCols:[2]});
 $('closedTable').innerHTML=makeTable(['Ticket ID','Type','Summary','Engineer','Group','Status'],r.closed.map(t=>[t.id,t.kind,t.description,t.assigned,t.group,t.status]),{textCols:[2]});
 const html=makeEmail();$('emailFrame').srcdoc=html;updateSenderWarning();
 text('previewTo',state.settings.to||'(not configured)');text('previewCc',state.settings.cc||'—');text('previewSubject',buildSubject(deliverySettings().subject,deliveryDate()));updateClientNotes();
}
async function copyEmail(){try{if(!confirmScope())return;if(!state.report)throw Error('Load a report first.');const html=makeEmail();const plain=isPending()?renderPendingPlainText(state.pendingView,emailSettings()):renderPlainText(state.report,emailSettings(),filters());
 if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined')await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
 else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(plain);toast('Formatted clipboard unsupported: copied plain text.');return;}else throw Error('Clipboard unavailable. Download HTML instead.');
 toast('Formatted email copied.');}catch(err){toast(err.message||'Copy failed. Use Download HTML.');}}
async function loadDemo(){const res=await fetch('./samples/fictional-tickets.csv');if(!res.ok)throw Error('Demo file unavailable');const csv=parseCsv(await res.text());importRows(csv.headers,csv.rows,'fictional-tickets.csv','Fictional sample only · contains no customer data');}
function validateAddresses(value){const parts=String(value||'').split(/[;,\n]+/).map(v=>v.trim()).filter(Boolean);return parts.every(v=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v));}
function typeSelection(){return $('allPendingTypes').checked?null:[...$('pendingTypes').selectedOptions].map(o=>o.value);}
function statusSelection(){return $('allPendingStatuses').checked?null:[...$('pendingStatuses').selectedOptions].map(o=>o.value);}
function scopeStatus(){text('setupStatus',state.activeSetup&&JSON.stringify(state.activeSetup)!==JSON.stringify(state.settings.reportSetup)?'Unsaved scope changes':state.settings.reportSetup?'Saved setup':'All types/statuses (default scope)');}
function restoreReferenceDate(){const value=isMonthly()?state.settings.monthlyAsAt:state.settings.asAt;$('asAt').value=dayNumber(value)!==null?value:isMonthly()?dateDefault():'';}
function readScope(){return {groups:selectedPendingGroups(),types:typeSelection(),statuses:statusSelection(),contract:$('contractFilter').value,events:$('eventFilter').value};}
function captureSetup(){state.settings.reportSetup=readScope();state.activeSetup=readScope();text('setupStatus','Setup saved');}
function captureActiveSetup(){state.activeSetup=readScope();scopeStatus();}
function applySetup(){
 const setup=state.activeSetup||state.settings.reportSetup;state.scopeError='';scopeStatus();if(!setup||!state.tickets.length)return;
 for(const [id,key] of [['pendingTypes','types'],['pendingStatuses','statuses']]){$(id==='pendingTypes'?'allPendingTypes':'allPendingStatuses').checked=!Array.isArray(setup[key]);if(Array.isArray(setup[key])){for(const value of setup[key])if(![...$(id).options].some(o=>o.value===value))$(id).add(new Option(value,value));for(const option of $(id).options)option.selected=setup[key].includes(option.value);}}
 if(Array.isArray(setup.groups)){$('allPendingGroups').checked=false;for(const input of $('pendingGroups').querySelectorAll('input')){input.disabled=false;input.checked=setup.groups.includes(input.value);}if(setup.groups.some(g=>![...$('pendingGroups').querySelectorAll('input')].some(i=>i.value===g)))state.scopeError='Saved groups are missing from this export. Review the groups before exporting.';}
 if(typeof setup.contract==='string'&&[...$('contractFilter').options].some(o=>o.value===setup.contract))$('contractFilter').value=setup.contract;else state.scopeError='Saved contract is missing from this export. Select the intended contract before exporting.';
 $('eventFilter').value=setup.events==='include'?'include':'exclude';
}
function confirmScope(){if(isMonthly()&&dayNumber($('asAt').value)===null){toast('Choose the monthly reporting date.');return false;}if(isPending()&&state.scopeError){toast(state.scopeError);return false;}return !isPending()||((filters().contractFilter!=='All'&&state.mapping.contract)||confirm('All contracts are selected or the Contract column is missing. Confirm these tickets belong to the intended customer before exporting.'));}
function workbookBytes(){if(dayNumber($('asAt').value)===null)throw Error('Choose an age reference date before exporting Excel.');return buildWorkbook(state.pendingView,state.settings.showEngineer,globalThis.XLSX);}
function workbookAttachment(){const bytes=new Uint8Array(workbookBytes());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {filename:exportBase()+'.xlsx',base64:btoa(binary)};}
function init(){
 if(state.settings.monthlyAsAt===undefined&&isMonthly())state.settings.monthlyAsAt=state.settings.asAt||'';
 for(const [id,all] of [['pendingTypes','allPendingTypes'],['pendingStatuses','allPendingStatuses']]){
 $(id).addEventListener('change',()=>{$(all).checked=false;});
 $(all).addEventListener('change',()=>{if($(all).checked)for(const option of $(id).options)option.selected=true;captureActiveSetup();refreshReport();});}

 for(const id of ['pendingTypes','pendingStatuses','pendingGroups','allPendingGroups','contractFilter','eventFilter'])$(id).addEventListener('change',captureActiveSetup);
 restoreReferenceDate();
 for(const id of ['pendingTypes','pendingStatuses','asAt'])$(id).addEventListener('change',()=>{state.settings[isMonthly()?'monthlyAsAt':'asAt']=$('asAt').value;storeSettings();refreshReport()});
 $('saveReportSetup').addEventListener('click',()=>{const candidate={...state.settings,reportSetup:readScope()};if(commitSettings(candidate)){state.activeSetup=readScope();text('setupStatus','Setup saved');}});
 $('resetSetup').addEventListener('click',()=>{delete state.settings.reportSetup;delete state.activeSetup;state.scopeError='';storeSettings();fillPendingGroups();$('contractFilter').value='All';refreshReport()});
 $('summaryOnly').addEventListener('change',()=>{state.settings.summaryOnly=$('summaryOnly').checked;storeSettings();refreshReport()});
 $('weeklySetup').addEventListener('click',()=>{state.settings.summaryOnly=true;$('allPendingTypes').checked=false;$('allPendingStatuses').checked=false;for(const [id,values] of [['pendingTypes',['Incident','Service Request']],['pendingStatuses',['Assigned','Pending']]]){for(const value of values)if(![...$(id).options].some(o=>o.value===value))$(id).add(new Option(value,value));for(const o of $(id).options)o.selected=values.includes(o.value);}captureActiveSetup();refreshReport();if(!$('asAt').value)toast('Choose an age reference date before exporting the weekly report.');});
 $('downloadWorkbook').addEventListener('click',()=>{try{if(!confirmScope())return;fileDownload(workbookBytes(),exportBase()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(e){toast(e.message)}});
 $('headerLogo').addEventListener('change',async event=>{const input=event.target,file=input.files[0];if(!file)return;input.disabled=true;$('clearHeaderLogo').disabled=true;$('importSettings').disabled=true;updateLogoPanel('Processing image…');try{const logo=await readHeaderLogo(file);if(commitSettings({...state.settings,headerLogo:logo,headerLogoName:file.name})){updateLogoPanel('Logo saved. It appears in Outstanding or Monthly pending tickets, theme C.');refreshReport();}}catch(e){updateLogoPanel(e.message,true);}finally{input.value='';input.disabled=false;$('clearHeaderLogo').disabled=false;$('importSettings').disabled=false;}});
 $('clearHeaderLogo').addEventListener('click',()=>{if(commitSettings({...state.settings,headerLogo:'',headerLogoName:''})){updateLogoPanel('Header logo removed.');refreshReport();}});$('dateInput').value=dateDefault();$('clientChoice').value=state.settings.client||'classic';$('emailVariant').value=normalizeVariant(state.settings.emailVariant);syncReportControls();updateSignatureSelector();updateClientNotes();
 $('settingsBtn').addEventListener('click',showModal);$('modalClose').addEventListener('click',()=>{signaturePersistence.flush();$('modal').hidden=true});
 $('modal').addEventListener('click',e=>{if(e.target===$('modal')){signaturePersistence.flush();$('modal').hidden=true;}});
 window.addEventListener('pagehide',()=>signaturePersistence.flush());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')signaturePersistence.flush();});
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
 $('exportSettings').addEventListener('click',()=>{captureSetup();storeSettings();fileDownload(JSON.stringify({version:1,settings:state.settings},null,2),'bmc-daily-email-settings.json','application/json');});
 $('importSettings').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());const settings=data.settings;if(!settings||typeof settings!=='object'||!Array.isArray(settings.signatures))throw Error('Invalid settings file');if(settings.headerLogo&&!validHeaderLogo(settings.headerLogo))throw Error('Invalid or oversized header logo in settings file. Previous settings kept.');const candidate=normalizeSettings({...settings,signatures:settings.signatures.map(p=>({...p,html:sanitizeSignatureHtml(p.html??plainToSignatureHtml(p.content))}))},DEFAULTS);if(candidate.reportContent==='monthly'&&candidate.monthlyAsAt===undefined)candidate.monthlyAsAt=candidate.asAt||'';if(!commitSettings(candidate)){e.target.value='';return;}signaturePersistence.cancel();$('emailVariant').value=state.settings.emailVariant;$('clientChoice').value=state.settings.client||'classic';delete state.activeSetup;syncReportControls();restoreReferenceDate();applySetup();showModal();updateSignatureSelector();refreshReport();updateLogoPanel('Settings and header logo saved.');toast('Settings imported.');}catch(ex){updateLogoPanel(ex.message,true);toast(ex.message)}e.target.value='';});
 $('demoBtn').addEventListener('click',()=>loadDemo().catch(e=>toast(e.message)));
 $('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await importFile(f);e.target.value='';});
 ['dateInput','groupFilter','contractFilter','eventFilter'].forEach(k=>$(k).addEventListener('change',refreshReport));
 $('latestBtn').addEventListener('click',()=>{const val=lastActivityDate(state.tickets);if(val){$('dateInput').value=val;refreshReport()}});
 $('reportContent').addEventListener('change',event=>{state.settings.reportContent=normalizeReportContent(event.target.value);restoreReferenceDate();storeSettings();refreshReport()});
 $('showEngineer').addEventListener('change',event=>{state.settings.showEngineer=event.target.checked;storeSettings();refreshReport()});
 $('allPendingGroups').addEventListener('change',event=>{for(const input of $('pendingGroups').querySelectorAll('input')){input.disabled=event.target.checked;if(event.target.checked)input.checked=true;}refreshReport()});
 $('pendingGroups').addEventListener('change',refreshReport);
 $('detailsToggle').addEventListener('click',()=>{const was=$('ticketLists').hidden;$('ticketLists').hidden=!was;$('detailsToggle').textContent=was?'Hide ticket lists':'Show ticket lists';});
 $('clientChoice').addEventListener('change',e=>{state.settings.client=e.target.value;storeSettings();updateClientNotes()});
 $('emailVariant').addEventListener('change',e=>{state.settings.emailVariant=normalizeVariant(e.target.value);storeSettings();refreshReport()});
 $('signatureChoice').addEventListener('change',e=>{state.settings.signatureId=e.target.value;storeSettings();refreshReport()});
 $('downloadClassic').addEventListener('click',()=>{if(!state.report||!confirmScope())return;let attachment=[];try{if(isPending())attachment=[workbookAttachment()];}catch(e){toast(e.message);return;}const script=renderClassicOutlookScript(makeEmail(),deliverySettings(),deliveryDate(),attachment);fileDownload(script,`${exportBase()}_Outlook.ps1`,'text/plain;charset=utf-8');toast('Classic Outlook draft helper downloaded. Right-click and Run with PowerShell; no email is sent automatically.');});
 $('downloadEml').addEventListener('click',()=>{if(!state.report||!confirmScope())return;const html=makeEmail(), eml=renderEml(html,deliverySettings(),deliveryDate());fileDownload(eml,`${exportBase()}.eml`,'message/rfc822');toast('EML downloaded; review before sending. For Classic Outlook use the dedicated draft helper instead.')});
 $('downloadHtml').addEventListener('click',()=>{if(!state.report||!confirmScope())return;fileDownload(makeEmail(),`${exportBase()}.html`,'text/html;charset=utf-8')});
 $('copyHtml').addEventListener('click',copyEmail);
 if(!localStorage.getItem(CONFIG_KEY))setTimeout(showModal,250);
}
init();

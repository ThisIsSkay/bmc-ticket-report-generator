// Survey draft: one unsent draft, confirmed recipients in BCC only, nothing sent;
// remembered settings hold no customer data. Fictional data only.
import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_DRAFT,MAX_RECIPIENTS,addressList,uniqueRecipients,draftProblem,messageText,messageHtml,renderSurveyEml,renderSurveyPs1,draftFilename,linkProblem} from '../lib/draft.mjs';
import {SETTINGS_KEY,normalizeSettings,loadSettings,saveSettings,forgetSettings} from '../lib/settings.mjs';

const LINK='https://forms.example.com/r/survey?id=1&lang=en';
const people=['alex@example.com','Jamie@Example.com','jamie@example.com','chris.one@example.com'];
const decode=(eml,type)=>{const part=eml.split(/--bmc-survey-[a-z0-9]+/).find(p=>p.includes('Content-Type: '+type));return Buffer.from(part.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString('utf8');};
const headers=eml=>eml.split('\r\n\r\n')[0];

test('each person once; invalid addresses never become recipients',()=>{
 assert.deepEqual(uniqueRecipients([...people,'not-an-email','',' alex@example.com ']),['alex@example.com','Jamie@Example.com','chris.one@example.com']);
 assert.deepEqual(addressList('me@example.com; bad, you@example.com\n'),{valid:['me@example.com','you@example.com'],invalid:['bad']});
});
test('the draft is blocked until it is complete and safe',()=>{
 const ok={recipients:['a@example.com'],subject:'Survey',message:'Hi {link}',link:LINK};
 assert.equal(draftProblem(ok),'');
 assert.match(draftProblem({...ok,recipients:[]}),/Confirm at least one recipient/);
 assert.match(draftProblem({...ok,recipients:Array.from({length:MAX_RECIPIENTS+1},(_,i)=>`p${i}@example.com`)}),/over 500/);
 assert.match(draftProblem({...ok,subject:'  '}),/Add a subject/);
 assert.match(draftProblem({...ok,message:''}),/Add a message/);
 assert.match(draftProblem({...ok,link:''}),/Add the survey link, or remove \{link\}/);
 assert.equal(draftProblem({...ok,message:'No placeholder',link:''}),'');
 assert.match(draftProblem({...ok,to:'me@example.com; nope'}),/not valid: nope/);
 for(const bad of ['javascript:alert(1)','forms.example.com/x','https://exa mple.com','ftp://example.com'])assert.match(linkProblem(bad),/https:\/\//,bad);
});
test('the .eml is an unsent draft: recipients in Bcc only, To only from the To line',()=>{
 const eml=renderSurveyEml({to:'',bcc:people,subject:'Customer satisfaction survey',message:DEFAULT_DRAFT.message,link:LINK,now:new Date('2026-11-11T01:00:00Z')});
 const h=headers(eml);
 assert.match(h,/^X-Unsent: 1\r\n/);
 assert.doesNotMatch(h,/^To:/m,'no To header when the To line is empty');
 assert.match(h,/^Bcc: alex@example.com,\r\n Jamie@Example.com,\r\n chris.one@example.com\r\n/m);
 assert.ok(h.split('\r\n').every(line=>line.length<=998));
 assert.match(h,/^Subject: Customer satisfaction survey$/m);
 assert.match(h,/^Date: Wed, 11 Nov 2026 01:00:00 GMT$/m);
 assert.match(decode(eml,'text/plain'),/experience:\n\nhttps:\/\/forms\.example\.com\/r\/survey\?id=1&lang=en\n\nThank you\./);
 const html=decode(eml,'text/html');
 assert.match(html,/<a href="https:\/\/forms\.example\.com\/r\/survey\?id=1&amp;lang=en" style="font-family:Arial,Helvetica,sans-serif;color:#0B5CAD;text-decoration:underline;">/);
 const withTo=headers(renderSurveyEml({to:'servicedesk@example.com',bcc:people,subject:'S',message:'M',link:''}));
 assert.match(withTo,/^To: servicedesk@example.com$/m);
 assert.doesNotMatch(withTo,/^To:.*alex@example\.com/m,'customers are never in To');
});
test('header injection and non-ASCII subjects are handled',()=>{
 const h=headers(renderSurveyEml({bcc:['a@example.com'],subject:'Survey\r\nBcc: attacker@example.com',message:'M'}));
 assert.equal(h.match(/^Bcc:/gm).length,1);assert.doesNotMatch(h,/^ ?attacker/m,'no injected header or folded address line');
 assert.match(h,/^Subject: Survey Bcc: attacker@example\.com$/m,'line breaks in the subject become spaces, so the text stays in the subject');
 assert.match(headers(renderSurveyEml({bcc:['a@example.com'],subject:'Umfrage — Kundenzufriedenheit',message:'M'})),/^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/m);
 assert.deepEqual(uniqueRecipients(['a@example.com\r\nBcc: x@example.com']),[]);
});
test('message text is escaped in HTML and keeps line breaks',()=>{
 const html=messageHtml('Hi <b>team</b> & "all"\nLine two\n\n{link}',LINK,'S');
 assert.match(html,/Hi &lt;b&gt;team&lt;\/b&gt; &amp; &quot;all&quot;<br \/>Line two<\/p>/);
 assert.doesNotMatch(html,/<b>|<style|class=/);
 assert.equal(messageText('Please answer.',LINK),'Please answer.\n\n'+LINK,'link goes last when there is no {link}');
 assert.match(messageHtml('Please answer.',LINK),/Please answer\.<\/p><p [^>]*><a href=/);
 for(const p of html.match(/<(p|td)\b[^>]*>/g))assert.match(p,/font-family:Arial,Helvetica,sans-serif;/);
});
test('Classic Outlook helper saves and opens a draft, never sends',()=>{
 const ps=renderSurveyPs1({to:'',bcc:people,subject:"Customer's survey",message:"Line\n'@\nRemove-Item C:\\ -Recurse\n{link}",link:LINK});
 assert.ok(ps.startsWith('\uFEFF'));assert.ok(ps.includes('\r\n'));
 assert.doesNotMatch(ps,/\.Send\s*\(/i);
 assert.match(ps,/\$mail\.BCC = 'alex@example.com; Jamie@Example.com; chris.one@example.com'/);
 assert.match(ps,/\$mail\.To = ''/);
 assert.match(ps,/\$mail\.Subject = 'Customer''s survey'/);
 assert.match(ps,/\$mail\.Save\(\)/);assert.match(ps,/\$mail\.Display\(\$false\)/);
 const body=ps.slice(ps.indexOf("$html = @'"),ps.indexOf("\r\n'@\r\n"));
 assert.doesNotMatch(body,/\r\n'@/,'message text cannot end the here-string early');
 assert.equal(ps.match(/\r\n'@\r\n/g).length,1);
 assert.match(ps,/3 recipient\(s\) in BCC/);
});
test('file names and remembered settings',()=>{
 assert.equal(draftFilename('2026-11-10','eml'),'Customer_Survey_Draft_2026-11-10.eml');
 const store=new Map();const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 assert.deepEqual(loadSettings(storage),{draft:{...DEFAULT_DRAFT},groups:null,dateOrder:'auto'});
 assert.ok(saveSettings(storage,{draft:{subject:'S',link:LINK,message:'M',to:''},groups:['EXAMPLE_EUC','EXAMPLE_NETWORK'],dateOrder:'dmy',tickets:['INC-1'],names:['Alex Example']}));
 const saved=JSON.parse(store.get(SETTINGS_KEY));
 assert.deepEqual(Object.keys(saved),['draft','groups','dateOrder'],'only draft text, group ticks and date order are stored');
 assert.deepEqual(loadSettings(storage).groups,['EXAMPLE_EUC','EXAMPLE_NETWORK']);
 assert.ok(forgetSettings(storage));assert.equal(store.size,0);
 assert.deepEqual(normalizeSettings('{not json').groups,null);
 assert.equal(normalizeSettings({dateOrder:'ydm'}).dateOrder,'auto');
 const broken={getItem(){throw Error('blocked')},setItem(){throw Error('full')},removeItem(){throw Error('blocked')}};
 assert.equal(loadSettings(broken).dateOrder,'auto');assert.equal(saveSettings(broken,{}),false);assert.equal(forgetSettings(broken),false);
});

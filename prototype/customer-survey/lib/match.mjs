export const exact=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
export function keys(value){
 const original=exact(value),tokens=original.replace(/[.,’'\-]/gu,' ').split(/\s+/u).filter(Boolean);
 const simple=tokens.map(t=>/^[\p{Script=Latin}\p{M}]+$/u.test(t)?t.normalize('NFD').replace(/\p{M}/gu,''):t);
 return {exact:original,tokens:simple,canonical:simple.join(' '),sorted:[...simple].sort().join(' '),compact:simple.join('')};
}
const validEmail=email=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)&&!/^mailto:/i.test(email);
export function directory(rows,map){
 const entries=[],seen=new Set();let duplicates=0;
 for(const row of rows){const name=row[map.name]||'',email=(row[map.email]||'').trim(),company=row[map.company]||'',department=row[map.department]||'',aliases=(row[map.alias]||'').split(/[;|]/).map(x=>x.trim()).filter(Boolean);
 const signature=JSON.stringify([exact(name),email.toLowerCase(),exact(company),exact(department),aliases]);if(seen.has(signature)){duplicates++;continue;}seen.add(signature);
 entries.push({id:entries.length,name,email,company,department,aliases,keys:keys(name),valid:/\p{L}/u.test(name)&&validEmail(email),warnings:[]});}
 const byName=new Map(),byEmail=new Map();for(const e of entries){for(const [map,key] of [[byName,exact(e.name)],[byEmail,e.email.toLowerCase()]]){if(!map.has(key))map.set(key,[]);map.get(key).push(e);}}
 for(const e of entries){if(!e.valid)e.warnings.push('Missing name or invalid single email address');if(byName.get(exact(e.name)).length>1)e.warnings.push('Multiple directory records share this name');if(new Set(byEmail.get(e.email.toLowerCase()).map(x=>exact(x.name))).size>1)e.warnings.push('Email shared by different names');}
 return {entries,duplicates,invalid:entries.filter(e=>!e.valid).length};
}
function oneEdit(a,b){if(a.length===b.length){const differences=[...a].map((c,i)=>c===b[i]?-1:i).filter(i=>i>=0);if(differences.length===2&&differences[1]===differences[0]+1&&a[differences[0]]===b[differences[1]]&&a[differences[1]]===b[differences[0]])return true;}if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(i<a.length||j<b.length?1:0)===1;}
function tier(a,b,aliases){
 if(!a.exact||!b.exact)return null;
 if(a.exact===b.exact)return [1,'Same name after case and whitespace normalisation'];
 if(a.canonical===b.canonical)return [2,'Same name ignoring punctuation or Latin accents'];
 if(a.sorted===b.sorted)return [3,'Same name tokens in a different order'];
 if(aliases.some(alias=>keys(alias).canonical===a.canonical))return [4,'Matches an alias supplied in the directory'];
 if(a.compact===b.compact)return [5,'Same name with different spacing'];
 const titles=new Set(['mr','mrs','ms','mdm','dr','encik','puan','cik']);const withoutTitle=k=>k.tokens.filter((t,i)=>i!==0||!titles.has(t)).join(' ');
 if(withoutTitle(a)&&withoutTitle(a)===withoutTitle(b))return [6,'Same name without a leading title; review required'];
 const small=a.tokens.length<=b.tokens.length?a.tokens:b.tokens,big=small===a.tokens?b.tokens:a.tokens;
 if(small.length>=2&&small.every(t=>t.length>=2&&big.includes(t)))return [6,'Partial name; additional name parts differ'];
 if(a.tokens.length===b.tokens.length&&a.tokens.length>=2){let initials=0;const fit=a.tokens.every((t,i)=>{const u=b.tokens[i];if(t===u)return true;if((t.length===1||u.length===1)&&t[0]===u[0]){initials++;return true;}return false;});if(fit&&initials&&initials<a.tokens.length)return [7,'Initial matches; confirmation required'];
 const different=a.tokens.map((t,i)=>[t,b.tokens[i]]).filter(([t,u])=>t!==u);if(different.length===1&&different[0].every(t=>t.length>=5)&&oneEdit(...different[0]))return [8,'Possible one-letter spelling difference'];}
 return null;
}
export function matchRequester(request,entries){
 const name=keys(request.name);const candidates=[];
 for(const entry of entries){const result=tier(name,entry.keys,entry.aliases);if(!result)continue;const contradictions=['company','department'].filter(k=>exact(request[k])&&exact(entry[k])&&exact(request[k])!==exact(entry[k]));candidates.push({entry,tier:result[0],reason:result[1],contradictions});}
 candidates.sort((a,b)=>a.tier-b.tier||a.entry.name.localeCompare(b.entry.name)||a.entry.id-b.entry.id);
 const strong=candidates.filter(c=>c.tier<=5),best=candidates[0];
 return {candidates,status:!name.exact?'Missing requester':!best?'No match':strong.length>1?'Ambiguous':!best.entry.valid||best.entry.warnings.length||best.contradictions.length?'Review required':best.tier<=5?'Unique proposal':'Suggestion'};
}
export function matchBatch(requests,entries){const results=requests.map(r=>({...r,...matchRequester(r,entries)}));const reverse=new Map();for(const r of results)for(const c of r.candidates.filter(c=>c.tier<=5)){if(!reverse.has(c.entry.id))reverse.set(c.entry.id,new Set());reverse.get(c.entry.id).add(JSON.stringify([exact(r.name),exact(r.company),exact(r.department)]));}for(const r of results)if(r.status==='Unique proposal'&&reverse.get(r.candidates[0].entry.id)?.size>1){r.status='Review required';r.reverseWarning='This directory record also matches another requester identity.';}return results;}
export function requestsFromRows(rows,map){
 // No eligibility rules or silent dedupe: every source row is reviewable.
 const requests=rows.map((row,i)=>({id:i,ticket:row[map.ticket]||`Row ${i+2}`,name:row[map.name]||'',company:row[map.company]||'',department:row[map.department]||'',status:row[map.status]||''}));
 const counts=new Map();for(const r of requests)counts.set(r.ticket,(counts.get(r.ticket)||0)+1);return requests.map(r=>({...r,duplicateTicket:counts.get(r.ticket)>1}));
}

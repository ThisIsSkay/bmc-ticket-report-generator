/** Browser-only, allowlisted rich signature HTML and pasted PNG/JPEG support. */
const TAGS=new Set(['DIV','P','BR','SPAN','B','STRONG','I','EM','U','S','SMALL','A','IMG','TABLE','TBODY','THEAD','TFOOT','TR','TH','TD','UL','OL','LI']);
const DROP=new Set(['SCRIPT','STYLE','META','LINK','IFRAME','OBJECT','SVG','FORM','INPUT','VIDEO','AUDIO']);
const STYLES=new Set(['font-family','font-size','font-weight','font-style','text-decoration','color','background-color','text-align','line-height','vertical-align','width','height','max-width','border-collapse','border','padding','margin']);
export const plainToSignatureHtml=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\r?\n/g,'<br>');
export function allowedSignatureImage(src){return /^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=]+$/i.test(String(src||''))&&src.length<=1800000;}
function safeStyle(s){return String(s||'').split(';').map(part=>{const i=part.indexOf(':');if(i<0)return '';const k=part.slice(0,i).trim().toLowerCase(),v=part.slice(i+1).trim();return STYLES.has(k)&&v.length<150&&/^[#\w\s.,()%"'\-]+$/.test(v)&&!/url\s*\(|expression|behavior|import/i.test(v)?k+':'+v:'';}).filter(Boolean).join(';');}
const VOID=new Set(['BR','IMG']),VOID_DROP=new Set(['META','LINK','INPUT']),FONT_TAGS=new Set(['P','DIV','TD','TH']);
const EMAIL_FONT='font-family:Arial,Helvetica,sans-serif';
const escapeAttr=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const decodeAttr=v=>String(v??'').replace(/&(amp|lt|gt|quot|apos|#39|#x27);/gi,(m,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'",'#x27':"'"}[n.toLowerCase()]));
const escapeText=v=>v.replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);)/gi,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function parseAttrs(source){
 const attrs={},re=/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;let m;
 while((m=re.exec(source))){const name=m[1].toLowerCase();if(!(name in attrs))attrs[name]=decodeAttr(m[2]??m[3]??m[4]??'');}
 return attrs;
}
/**
 * DOM-free allowlist sanitizer. Every tag in the output is rebuilt from the
 * allowlists above, so it is safe to run on untrusted markup in Node (tests)
 * and as a second pass in the browser. With emailFont, every p/div/td/th gets
 * the Outlook-safe Arial stack because pasted signatures do not carry it.
 */
function sanitizeSignatureString(html,{emailFont=false}={}){
 const src=String(html||''),out=[],stack=[];
 const re=/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
 let pos=0,m;
 while((m=re.exec(src))){
  out.push(escapeText(src.slice(pos,m.index)));pos=re.lastIndex;
  if(!m[2])continue;
  const tag=m[2].toUpperCase(),closing=m[1]==='/';
  if(DROP.has(tag)){
   if(!closing&&!VOID_DROP.has(tag)){const end=new RegExp('</'+tag+'\\s*>','i').exec(src.slice(pos));pos=end?pos+end.index+end[0].length:src.length;re.lastIndex=pos;}
   continue;
  }
  if(!TAGS.has(tag))continue;
  if(closing){
   const at=stack.lastIndexOf(tag);
   if(VOID.has(tag)||at<0)continue;
   while(stack.length>at)out.push('</'+stack.pop().toLowerCase()+'>');
   continue;
  }
  const attrs=parseAttrs(m[3]),emit=[];
  let style=safeStyle(attrs.style);
  if(tag==='IMG'){
   if(!allowedSignatureImage(attrs.src))continue;
   emit.push('src="'+attrs.src+'"','alt="'+escapeAttr((attrs.alt||'Signature image').slice(0,120))+'"');
   style=[style,/(^|;)max-width:/.test(style)?'':'max-width:100%',/(^|;)height:/.test(style)?'':'height:auto'].filter(Boolean).join(';');
  }
  if(emailFont&&FONT_TAGS.has(tag))style=[...style.split(';').filter(part=>part&&!/^font-family:/.test(part)),EMAIL_FONT].join(';');
  if(tag==='A'&&/^(https?:\/\/|mailto:)/i.test(attrs.href||''))emit.push('href="'+escapeAttr(attrs.href)+'"','target="_blank"','rel="noopener noreferrer"');
  if(tag==='TD'||tag==='TH')for(const name of ['colspan','rowspan']){const n=Number(attrs[name]);if(Number.isInteger(n)&&n>=1&&n<=10)emit.push(name+'="'+n+'"');}
  if(style)emit.push('style="'+escapeAttr(style)+'"');
  out.push('<'+tag.toLowerCase()+(emit.length?' '+emit.join(' '):'')+'>');
  if(!VOID.has(tag))stack.push(tag);
 }
 out.push(escapeText(src.slice(pos)));
 while(stack.length)out.push('</'+stack.pop().toLowerCase()+'>');
 return out.join('');
}
/** Sanitized signature markup ready for the email body (Arial on p/div/td/th). */
export function signatureEmailHtml(html){return sanitizeSignatureString(sanitizeSignatureHtml(html),{emailFont:true});}
export function sanitizeSignatureHtml(html){
 if(typeof DOMParser==='undefined'||typeof document==='undefined')return sanitizeSignatureString(html);
 const parsed=new DOMParser().parseFromString(String(html||''),'text/html'),target=document.createElement('div');
 function clean(source,dest){
  if(source.nodeType===3){dest.appendChild(document.createTextNode(source.nodeValue||''));return;}
  if(source.nodeType!==1||DROP.has(source.tagName))return;
  if(!TAGS.has(source.tagName)){for(const c of source.childNodes)clean(c,dest);return;}
  if(source.tagName==='IMG'&&!allowedSignatureImage(source.getAttribute('src')))return;
  const el=document.createElement(source.tagName.toLowerCase()),style=safeStyle(source.getAttribute('style'));
  if(style)el.setAttribute('style',style);
  if(source.tagName==='IMG'){el.setAttribute('src',source.getAttribute('src'));el.setAttribute('alt',(source.getAttribute('alt')||'Signature image').slice(0,120));el.setAttribute('style',[style,'max-width:100%','height:auto'].filter(Boolean).join(';'));}
  if(source.tagName==='A'){const href=source.getAttribute('href')||'';if(/^(https?:\/\/|mailto:)/i.test(href)){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}}
  if(['TD','TH'].includes(source.tagName)){for(const attr of ['colspan','rowspan']){const n=Number(source.getAttribute(attr));if(Number.isInteger(n)&&n>=1&&n<=10)el.setAttribute(attr,String(n));}}
  for(const c of source.childNodes)clean(c,el);dest.appendChild(el);
 }
 for(const c of parsed.body.childNodes)clean(c,target);
 return target.innerHTML;
}
export async function imageFileToDataUrl(file){
 if(!['image/png','image/jpeg'].includes(file.type))throw Error('Choose a PNG or JPEG image.');
 if(file.size>8*1024*1024)throw Error('Image exceeds 8 MB. Resize it first.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Could not read image.'));img.src=url;});
  const factor=Math.min(1,820/img.naturalWidth,320/img.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL(file.type,file.type==='image/jpeg'?.84:undefined);
  if(!allowedSignatureImage(data))throw Error('Image is too large to save. Try a smaller logo.');
  return data;
 }finally{URL.revokeObjectURL(url);}
}
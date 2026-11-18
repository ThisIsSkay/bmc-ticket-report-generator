/** Browser-only, allowlisted rich signature HTML and pasted PNG/JPEG support. */
const TAGS=new Set(['DIV','P','BR','SPAN','B','STRONG','I','EM','U','S','SMALL','A','IMG','TABLE','TBODY','THEAD','TFOOT','TR','TH','TD','UL','OL','LI']);
const DROP=new Set(['SCRIPT','STYLE','META','LINK','IFRAME','OBJECT','SVG','FORM','INPUT','VIDEO','AUDIO']);
const STYLES=new Set(['font-family','font-size','font-weight','font-style','text-decoration','color','background-color','text-align','line-height','vertical-align','width','height','max-width','border-collapse','border','padding','margin']);
export const plainToSignatureHtml=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\r?\n/g,'<br>');
export const MAX_IMAGE_DATA_LENGTH=1800000;
export function allowedSignatureImage(src){return /^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=]+$/i.test(String(src||''))&&src.length<=MAX_IMAGE_DATA_LENGTH;}
/** Widest image the 736px email content column can hold; Classic Outlook ignores max-width, so size is set explicitly. */
export const MAX_SIGNATURE_IMAGE_WIDTH=736;
/** Pixel size of a PNG/JPEG data URL read from its header, or null. Needs no DOM. */
export function signatureImageSize(src){
 const m=/^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/i.exec(String(src||''));
 if(!m)return null;
 try{
  if(m[1].toLowerCase()==='png'){
   const b=atob(m[2].slice(0,32)),n=i=>((b.charCodeAt(i)<<24)|(b.charCodeAt(i+1)<<16)|(b.charCodeAt(i+2)<<8)|b.charCodeAt(i+3))>>>0;
   return b.length>=24&&b.slice(12,16)==='IHDR'&&n(16)&&n(20)?{width:n(16),height:n(20)}:null;
  }
  const b=atob(m[2]);let i=2;
  while(i+9<b.length){
   if(b.charCodeAt(i)!==0xFF)return null;
   const marker=b.charCodeAt(i+1),length=(b.charCodeAt(i+2)<<8)|b.charCodeAt(i+3);
   if(marker>=0xC0&&marker<=0xCF&&marker!==0xC4&&marker!==0xC8&&marker!==0xCC){
    const height=(b.charCodeAt(i+5)<<8)|b.charCodeAt(i+6),width=(b.charCodeAt(i+7)<<8)|b.charCodeAt(i+8);
    return width&&height?{width,height}:null;
   }
   if(length<2)return null;
   i+=2+length;
  }
 }catch{}
 return null;
}
/** width/height attributes for a signature image: explicit values if valid, else read from the image, scaled down to the email's content width. */
function imageDimensions(attrs){
 const given={width:Number(attrs.width),height:Number(attrs.height)},valid=Number.isInteger(given.width)&&Number.isInteger(given.height)&&given.width>0&&given.height>0&&given.width<=10000&&given.height<=10000;
 const size=valid?given:signatureImageSize(attrs.src);
 if(!size)return [];
 const factor=Math.min(1,MAX_SIGNATURE_IMAGE_WIDTH/size.width);
 return ['width="'+Math.max(1,Math.round(size.width*factor))+'"','height="'+Math.max(1,Math.round(size.height*factor))+'"'];
}
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
   emit.push('src="'+attrs.src+'"','alt="'+escapeAttr((attrs.alt||'Signature image').slice(0,120))+'"',...imageDimensions(attrs));
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
  if(source.tagName==='IMG'){el.setAttribute('src',source.getAttribute('src'));el.setAttribute('alt',(source.getAttribute('alt')||'Signature image').slice(0,120));el.setAttribute('style',[style,/(^|;)max-width:/.test(style)?'':'max-width:100%',/(^|;)height:/.test(style)?'':'height:auto'].filter(Boolean).join(';'));for(const attr of ['width','height']){const n=Number(source.getAttribute(attr));if(Number.isInteger(n)&&n>0&&n<=10000)el.setAttribute(attr,String(n));}}
  if(source.tagName==='A'){const href=source.getAttribute('href')||'';if(/^(https?:\/\/|mailto:)/i.test(href)){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}}
  if(['TD','TH'].includes(source.tagName)){for(const attr of ['colspan','rowspan']){const n=Number(source.getAttribute(attr));if(Number.isInteger(n)&&n>=1&&n<=10)el.setAttribute(attr,String(n));}}
  for(const c of source.childNodes)clean(c,el);dest.appendChild(el);
 }
 for(const c of parsed.body.childNodes)clean(c,target);
 return target.innerHTML;
}
export async function imageFileToDataUrl(file,{maxWidth=MAX_SIGNATURE_IMAGE_WIDTH,maxHeight=320}={}){
 if(!['image/png','image/jpeg'].includes(file.type))throw Error('Choose a PNG or JPEG image.');
 if(file.size>8*1024*1024)throw Error('Image exceeds 8 MB. Resize it first.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Could not read image.'));img.src=url;});
  const factor=Math.min(1,maxWidth/img.naturalWidth,maxHeight/img.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL(file.type,file.type==='image/jpeg'?.84:undefined);
  if(!allowedSignatureImage(data))throw Error('Image is too large to save. Try a smaller logo.');
  return data;
 }finally{URL.revokeObjectURL(url);}
}
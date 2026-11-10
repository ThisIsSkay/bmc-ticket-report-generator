/** Browser-only, allowlisted rich signature HTML and pasted PNG/JPEG support. */
const TAGS=new Set(['DIV','P','BR','SPAN','B','STRONG','I','EM','U','S','SMALL','A','IMG','TABLE','TBODY','THEAD','TFOOT','TR','TH','TD','UL','OL','LI']);
const DROP=new Set(['SCRIPT','STYLE','META','LINK','IFRAME','OBJECT','SVG','FORM','INPUT','VIDEO','AUDIO']);
const STYLES=new Set(['font-family','font-size','font-weight','font-style','text-decoration','color','background-color','text-align','line-height','vertical-align','width','height','max-width','border-collapse','border','padding','margin']);
export const plainToSignatureHtml=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\r?\n/g,'<br>');
export function allowedSignatureImage(src){return /^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/=]+$/i.test(String(src||''))&&src.length<=1800000;}
function safeStyle(s){return String(s||'').split(';').map(part=>{const i=part.indexOf(':');if(i<0)return '';const k=part.slice(0,i).trim().toLowerCase(),v=part.slice(i+1).trim();return STYLES.has(k)&&v.length<150&&/^[#\w\s.,()%"'\-]+$/.test(v)&&!/url\s*\(|expression|behavior|import/i.test(v)?k+':'+v:'';}).filter(Boolean).join(';');}
export function sanitizeSignatureHtml(html){
 if(typeof DOMParser==='undefined'||typeof document==='undefined')return plainToSignatureHtml(String(html||'').replace(/<[^>]*>/g,''));
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
/** Small zero-dependency XLSX reader (ZIP + SpreadsheetML). Supports ordinary BMC tables.
 * Does NOT support legacy binary .xls, formulas' cached result recomputation or encrypted XLSX.
 */
function u16(a,p){return a[p]|(a[p+1]<<8)}
function u32(a,p){return (a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0}
function decode(bytes){return new TextDecoder().decode(bytes)}
function attrs(s){const o={};for(const m of s.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))o[m[1]]=xmlText(m[2]);return o;}
function xmlText(s){return String(s).replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&(?:amp|lt|gt|quot|apos);/g,v=>({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[v]);}
async function inflateRaw(data){const ds=new DecompressionStream('deflate-raw');const writer=ds.writable.getWriter();const output=new Response(ds.readable).arrayBuffer();await writer.write(data);await writer.close();return new Uint8Array(await output);}
export async function unzip(buffer){
  const a=new Uint8Array(buffer);const result=new Map();let end=-1;
  for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--)if(u32(a,i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Not a valid .xlsx ZIP archive');
  let p=u32(a,end+16);const entries=u16(a,end+10);
  for(let i=0;i<entries;i++){
    if(u32(a,p)!==0x02014b50)throw new Error('Corrupt XLSX directory');
    const method=u16(a,p+10),size=u32(a,p+20),nameLen=u16(a,p+28),extra=u16(a,p+30),comment=u16(a,p+32),offset=u32(a,p+42);
    const name=decode(a.slice(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
    if(name.endsWith('/'))continue;
    if(u32(a,offset)!==0x04034b50)throw new Error('Corrupt XLSX entry');
    const start=offset+30+u16(a,offset+26)+u16(a,offset+28);const compressed=a.slice(start,start+size);
    result.set(name,async()=>{if(method===0)return compressed;if(method===8)return inflateRaw(compressed);throw new Error(`Unsupported ZIP compression ${method}`)});
  }
  return result;
}
const getXML=async(zip,path)=>{const entry=zip.get(path);return entry?decode(await entry()):null};
const cellIndex=(ref)=>{const letters=/^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase()||'';let n=0;for(const c of letters)n=n*26+c.charCodeAt(0)-64;return n-1};
function stringsFromXML(xml){if(!xml)return[];return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(([,s])=>[...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([,t])=>xmlText(t)).join(''));}
function cellsFromXML(xml,strings){
  const rows=[];const rowMatches=[...xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)];
  for(const rm of rowMatches){const rowAttrs=attrs(rm[1]);const rowIndex=(parseInt(rowAttrs.r||'',10)||rows.length+1)-1;const values=[];
    for(const match of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const a=attrs(match[1]);let x=match[2]||'';const v=/<v>([\s\S]*?)<\/v>/.exec(x)?.[1];const raw=a.t==='inlineStr'?[...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(y=>xmlText(y[1])).join(''):v==null?'':xmlText(v);
      const value=a.t==='s'?strings[+raw]??'':a.t==='inlineStr'||a.t==='str'||a.t==='e'?raw:a.t==='b'?raw==='1':raw===''?'':Number.isNaN(Number(raw))?raw:Number(raw);
      const ci=cellIndex(a.r||'');if(ci>=0&&ci<300)values[ci]=value;
    }
    if(values.some(v=>String(v??'').trim()))rows[rowIndex]=values;
  }
  return rows;
}
export async function parseXlsx(buffer){
  const zip=await unzip(buffer);const workbook=await getXML(zip,'xl/workbook.xml');if(!workbook)throw new Error('Workbook XML not found');
  const rels=await getXML(zip,'xl/_rels/workbook.xml.rels');const paths=new Map();for(const m of (rels||'').matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/g)){
    const a=attrs(m[1]);if(a.Id&&a.Target){let target=a.Target.replace(/^\//,'');if(!target.startsWith('xl/'))target='xl/'+target.replace(/^\.\//,'');paths.set(a.Id,target);}
  }
  const sheets=[...workbook.matchAll(/<sheet\b([^>]*?)\/?>(?:<\/sheet>)?/g)].map(m=>attrs(m[1])).map(s=>({name:s.name, path:paths.get(s['r:id'])})).filter(s=>s.path);
  if(!sheets.length)throw new Error('No worksheets found');
  const strings=stringsFromXML(await getXML(zip,'xl/sharedStrings.xml'));const parsed=[];
  for(const sheet of sheets){const xml=await getXML(zip,sheet.path);if(!xml)continue;const matrix=cellsFromXML(xml,strings);
    const top=matrix.findIndex(row=>row&&row.some(v=>String(v??'').trim()));if(top<0){parsed.push({name:sheet.name,headers:[],rows:[]});continue;}
    const headers=(matrix[top]||[]).map(x=>String(x??'').trim());const data=matrix.slice(top+1).filter(r=>r&&r.some(v=>String(v??'').trim()));
    parsed.push({name:sheet.name,headers,rows:data.map(r=>Object.fromEntries(headers.filter(Boolean).map((h,i)=>[h,r[i]??''])))});
  }
  if(!parsed.length)throw new Error('No readable worksheet');
  const valid=(s)=>s.headers.filter(h=>['ticket id','submit date','status','assigned engineer'].includes(String(h).trim().toLowerCase())).length;
  const selected=[...parsed].sort((a,b)=>valid(b)-valid(a)||b.rows.length-a.rows.length)[0];
  return {...selected,worksheets:parsed.map(s=>({name:s.name,count:s.rows.length}))};
}

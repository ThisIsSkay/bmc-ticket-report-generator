import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname||new URL('.',import.meta.url).pathname);
const mime={'.html':'text/html; charset=UTF-8','.js':'text/javascript; charset=UTF-8','.mjs':'text/javascript; charset=UTF-8','.css':'text/css; charset=UTF-8','.json':'application/json','.csv':'text/csv; charset=UTF-8'};
createServer(async(req,res)=>{
  try{const relative=decodeURIComponent((req.url||'/').split('?')[0]);const path=resolve(root,'.'+(relative==='/'?'/index.html':relative));
    if(!(path===root||path.startsWith(root+sep))||/\/(?:\.|node_modules)/.test(relative)){res.writeHead(403);res.end('Forbidden');return;}
    const file=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(file);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4177,'127.0.0.1',()=>console.log('BMC Daily Email Report running at http://127.0.0.1:4177'));

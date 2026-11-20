export function decodeCsv(buffer,requested='auto'){
 const bytes=new Uint8Array(buffer);let encoding=requested==='auto'?'utf-8':requested;
 if(!['utf-8','utf-16le','utf-16be','windows-1252'].includes(encoding))throw Error('Unsupported encoding.');
 if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';
 if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
 let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('Could not decode this CSV. Choose Windows-1252 for older Windows Excel exports, or re-export as UTF-8.');}
 if(text.includes('\0')||text.includes('\uFFFD'))throw Error('Unrecognised text encoding. Export as UTF-8 CSV or UTF-16 with a BOM.');
 return text;
}
export function csvRows(text){
 const first=text.split(/\r?\n/).find(line=>line.trim())||'';
 const counts={',':0,';':0,'\t':0};let quote=false;
 for(let i=0;i<first.length;i++){const c=first[i];if(c==='"'){if(quote&&first[i+1]==='"')i++;else quote=!quote;}else if(!quote&&c in counts)counts[c]++;}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 if(!counts[delimiter])throw Error('No comma, semicolon or tab columns detected.');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
 if(c==='"'){if(field||closed)throw Error('Malformed CSV quotes.');quoted=true;}
 else if(c===delimiter){row.push(field);field='';closed=false;}
 else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';closed=false;}
 else {if(closed)throw Error('Unexpected text after a closing CSV quote.');field+=c;}}
 if(quoted)throw Error('Unclosed CSV quote.');row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function tableFromRows(rows,headerIndex=0){
 const headers=(rows[headerIndex]||[]).map(x=>String(x??'').trim());while(headers.length&&!headers.at(-1))headers.pop();
 if(headers.length<2||headers.some(x=>!x)||new Set(headers.map(x=>x.toLowerCase())).size!==headers.length)throw Error('Choose a header row with at least two unique, nonblank column names.');
 const rowNumbers=[];const data=rows.slice(headerIndex+1).flatMap((row,i)=>{if(!row.some(x=>String(x??'').trim()))return [];rowNumbers.push(headerIndex+i+2);
 if(row.length>headers.length&&row.slice(headers.length).some(x=>String(x??'').trim()))throw Error(`Row ${headerIndex+i+2} has more values than the header.`);
 return [Object.fromEntries(headers.map((h,n)=>[h,String(row[n]??'').trim()]))];});
 return {headers,rows:data,rowNumbers};
}

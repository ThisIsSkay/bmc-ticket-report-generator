import zlib from 'node:zlib';
// Used by the golden harness for signature and header-logo images (fictional, generated).
// Deterministic solid-colour RGB PNG.
export function png(width,height,[r,g,b]=[27,58,92]){
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=buf=>{let c=0xFFFFFFFF;for(const x of buf)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const o=y*(width*3+1)+1+x*3;raw[o]=r;raw[o+1]=g;raw[o+2]=b;}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export const pngDataUrl=(...a)=>'data:image/png;base64,'+png(...a).toString('base64');

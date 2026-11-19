'use strict';
// Run only for data explicitly approved for inclusion in the published dashboard.
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const {gzipSync,gunzipSync}=require('node:zlib');
const assert=require('node:assert/strict');
const {importFiles}=require('../src/csv-core.js');
function pack(data){
 const riders=[...new Set(data.segments.map(s=>s.r))], attrs=[...new Set(data.segments.map(s=>s.p.attr))];
 const indexes=values=>new Map(values.map((v,i)=>[v,i]));
 const ri=indexes(riders),ai=indexes(attrs),ci=indexes(data.channels),bi=indexes(data.benefits);
 const series=rows=>rows.flatMap(x=>[x.prem,x.pnl,x.observed===false?0:1]);
 const parts=rows=>(rows??[]).map(x=>[x.value,series(x.series)]);
 const {segments,...rest}=data;
 return {...rest,format:'loss-ratio-default-v1',riders,attrs,packed:segments.map(s=>[s.p.id,ai.get(s.p.attr),ci.get(s.c),bi.get(s.b),ri.get(s.r),series(s.series),parts(s.fine),parts(s.durations)])};
}
async function run(){
 const args=process.argv.slice(2);if(args.length!==3)throw Error('Provide the three approved April, May and June CSV paths.');
 const files=args.map(p=>({name:path.basename(p),size:fs.statSync(p).size,stream:()=>Readable.toWeb(fs.createReadStream(p))}));
 let last=0;
 const data=await importFiles(files,p=>{if(Date.now()-last>15000){console.log('Reading '+Math.round(p.done/p.total*100)+'%');last=Date.now();}});
 const packed=pack(data), json=JSON.stringify(packed), compressed=gzipSync(json,{level:9});
 assert.equal(gunzipSync(compressed).toString(),json);
 const target=path.join(__dirname,'../public/index.html');
 const html=fs.readFileSync(target,'utf8');
 const slot=/<script type="application\/octet-stream" id="default-data">[\s\S]*?<\/script>/;
 assert.ok(slot.test(html),'default data slot must exist');
 fs.writeFileSync(target,html.replace(slot,'<script type="application/octet-stream" id="default-data">'+compressed.toString('base64')+'</script>'));
 console.log(JSON.stringify({rows:data.meta.rows,segments:data.segments.length,compressedBytes:compressed.length,htmlBytes:fs.statSync(target).size}));
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={pack};

'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./csv-core.cjs');
const html=readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const worker=html.match(/<script type="text\/plain" id="csv-worker-source">([\s\S]*?)<\/script>/)?.[1];
const main=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(worker && main);
assert.match(html,/connect-src 'none'/);
assert.doesNotMatch(worker + main,/\b(?:fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|importScripts)/);
const nodes = new Map();
const node=id=> {
 if(!nodes.has(id))nodes.set(id,{addEventListener(){},querySelector(){return null;}});
 return nodes.get(id);
};
async function run(){
 const browser=vm.createContext({assert,document:{getElementById:node,addEventListener(){}}});
 vm.runInContext(main,browser);
 node('csv-worker-source').textContent=worker;
 let finish;
 browser.Worker=class{
   constructor(url){this.url=url;}
   async postMessage(args){
    const world=vm.createContext({TextDecoder,postMessage:x=>{this.onmessage({data:x}); if(x.type!=='progress')finish(x);}});
    vm.runInContext(`
      class WorkerGlobalScope {}
      Object.setPrototypeOf(globalThis, WorkerGlobalScope.prototype);
      globalThis.addEventListener = (type, handler) => { globalThis.handle = handler; };
    `,world);
    vm.runInContext(await this.url.text(),world);
    await world.handle({data:args});
   }
   terminate(){}
 };
 browser.URL={createObjectURL:blob=>blob,revokeObjectURL(){}};
 browser.Blob=Blob;
 const files=[6,4,5].map(m=>new File([fixture(m)],'synthetic_20250'+m+'.csv'));
 browser.files=files;
 const complete=new Promise(resolve=>{finish=resolve});
 vm.runInContext('startImport(files)',browser);
 const reply=await complete;
 assert.equal(reply.type,'result',reply.message);
 vm.runInContext(`
   assert.equal(imported,true);
   assert.equal(MONTHS.join(','),'2025-04,2025-05,2025-06');
   assert.equal(CANDIDATES.length,1);
   assert.match($('csvStatus').textContent,/서버 전송은 하지 않았습니다/);
   assert.match($('alerts').innerHTML,/216\\.0/);
   setState('alert',CANDIDATES[0].key);setState('step','4');render();
   assert.match($('view').innerHTML,/2025-06/);
   assert.match($('view').innerHTML,/상품 전체/);
   resetCsv();render();
   assert.equal(imported,false);
   assert.equal(CANDIDATES.length,6);
   assert.equal(MONTHS[2],'2027-03');
 `,browser);
 console.log('Passed: embedded worker, file-order independence, app integration, alert details, clear, no network APIs');
}
run().catch(e=>{ console.error(e);process.exitCode=1; });

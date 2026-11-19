'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {gunzipSync}=require('node:zlib');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const packed=JSON.parse(gunzipSync(Buffer.from(html.match(/id="default-data">([^<]+)<\/script>/)[1],'base64')));
assert.equal(packed.format,'loss-ratio-default-v1');
assert.deepEqual(packed.months,['2025-04','2025-05','2025-06']);
assert.doesNotMatch(html,/가상 사례|합성 데이터|SYNTHETIC|2027-/);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},querySelector(){return null;}});return nodes.get(id);};
const ctx=vm.createContext({assert,packed,document:{body:{dataset:{}},getElementById:node,addEventListener(){}}});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
vm.runInContext(`
 defaultData=unpackDefault(packed);restoreDefault();render();
 assert.equal(usingDefault,true);assert.equal(imported,true);
 assert.ok(SEGMENTS.length>0);
 assert.match($('dataMode').textContent,/기본 데이터/);
 assert.doesNotMatch($('kpis').innerHTML,/가상/);
 for(const candidate of CANDIDATES){
   setState('alert',candidate.key);render();
   assert.equal(state.stage,6,'candidate opens a report in one click');
   assert.equal($('path').hidden,true,'no staged breadcrumb in report');
   assert.ok($('view').innerHTML.includes(esc(candidate.p.name)));
   for(const title of ['1 · 상품군 × 채널','2 · 간편고지 × 무·저해지','3 · 상품 × 급부','4 · 주계약·특약','선정 사유와 3개월 수치 근거','확인할 사항'])assert.ok($('view').innerHTML.includes(title),title);
   assert.equal(($('view').innerHTML.match(/class="report-witness"/g)||[]).length,Number(candidate.a)+Number(candidate.alertB));
   assert.doesNotMatch($('view').innerHTML,/NaN|undefined|Infinity/);
 }
 for(let mi=0;mi<3;mi++){
   const actual=fold(SEGMENTS,mi),expected=defaultData.totals[mi];
   assert.ok(Math.abs(actual.prem-expected.prem)<1);
   assert.ok(Math.abs(actual.pnl-expected.pnl)<1);
 }
 const sample=SEGMENTS.find(s=>s.series[2].prem>0&&s.fine.length&&s.durations.length);
 state={...state,g:sample.p.g,c:sample.c,p:sample.p.id,attr:sample.p.attr,b:sample.b,r:sample.r,stage:3,theme:'black'};
 render();assert.match($('view').innerHTML,/주계약·특약 매트릭스/);
 setState('rider',sample.r);render();assert.match($('view').innerHTML,/같은 코드의 월별 변화/);
 setState('summary',JSON.stringify({kind:'duration',value:sample.durations[0].value,metric:'shortfall'}));render();
 assert.match($('view').innerHTML,/1~5단계 수치 근거/);
 const defaults=SEGMENTS;usingDefault=false;resetCsv();render();
 assert.equal(SEGMENTS,defaults);assert.equal(usingDefault,true);
 assert.equal(state.stage,-1);assert.equal(state.theme,'black');
 assert.equal(MONTHS[2],'2025-06');assert.equal($('clearCsv').hidden,true);
`,ctx);
console.log('Passed: embedded default data, monthly reconciliation, no synthetic cases, stages 4–6, reset to default, black theme');

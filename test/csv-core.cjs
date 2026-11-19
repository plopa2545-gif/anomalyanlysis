'use strict';
const assert=require('node:assert/strict');
const {makeScanner,byHeader,cents,parseMonth,importFiles,evaluateExact}=require('../src/csv-core.js');
const suffix=['생존급부','생존급부장해진단제외','사망','장해','진단','입원','수술','실손'];
const header=[
 'CLSG_YM','ELPS_PD_NM','BSDP_CD','BSDP_NM','AXIS_CD','AXIS_NM','PDT_SCN_CD','PDT_BNFT_CD',
 'BNFT_MCL_CD_NEW','SCN_CL_CD','SCN_CL_NM','SMPC_NTIC_YN','PDT_GUBUN','LOWLAP_YN','위험보험료','위험차익금액',
 ...suffix.flatMap(s=>['위험보험료_'+s,'위험률차손익_'+s])
];
const field=v=>/[",\r\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':v;
const format=rows=>rows.map(r=>r.map(field).join(',')).join('\r\n')+'\r\n';
function fixture(month){
 const i=month-4;
 const ym='20250'+month;
 const a=[0,-50e6,-110e6][i], b=[-50e6,-10e6,-70e6][i];
 const parts=[
   {code:'001',name:'합성 "테스트", A', contract:'00042',p:120e6,pnl:a+b,measure:[60e6,a,60e6,b]},
   {code:'002',name:'합성 보정',contract:'00999',p:880e6,pnl:300e6-a-b,measure:[880e6,300e6-a-b,0,0]}
 ];
 const rows=parts.flatMap(x=>['1차','2년이내','전체'].map(elapsed=>[ym,elapsed,'003','합성 채널',
  x.code,x.name,x.contract,'01','UNRELATED','01','주계약','Y','합성 그룹','N',
  x.p,x.pnl,321e6,9e6,321e6,9e6,...x.measure,0,0,0,0,0,0,0,0]));
 return '\uFEFF'+format([header,...rows]);
}
function scopedFixture(month, blocked=false) {
 const i=month-4, ym='20250'+month;
 const a=[-10e6,-45e6,-80e6][i], b=[-30e6,-20e6,-90e6][i];
 const p0=blocked?-50e6:300e6, pnl0=blocked?0:60e6;
 const records=[
   ['001',p0,pnl0,100e6,a,100e6,b,p0-200e6,pnl0-a-b],
   ['002',1e9-p0,300e6-pnl0,1e9-p0,300e6-pnl0,0,0,0,0]
 ];
 const rows=records.flatMap(([id,p,pnl,...values])=>['1차','전체'].map(elapsed=>[
   ym,elapsed,'007','합성 채널',id,'합성 '+id,'00011','00009','NO_MAPPING','01','특약','N','합성 그룹','Y',
   p,pnl,0,0,0,0,...values,0,0,0,0,0,0
 ]));
 return format([header,...rows]);
}
function file(month,transform=s=>s){
 const blob=new Blob([transform(fixture(month))]);
 Object.defineProperty(blob,'name',{value:'fixture_20250'+month+'.csv'});
 return blob;
}
async function run(){
 const rows=[]; const sc=makeScanner(row=>rows.push(row));
 for(const ch of 'head,header\r\n"a""b","x,\r\ny"\r\nlast,')sc.feed(ch);
 sc.finish();
 assert.deepEqual(rows,[['head','header'],['a"b','x,\r\ny'],['last','']]);
 assert.throws(()=>{const bad=makeScanner(()=>{});bad.feed('"open');bad.finish();},/인용부호/);
 assert.throws(()=>byHeader(['CLSG_YM','ELPS_PD_NM']),/필수 열/);
 assert.equal(cents('-1,234.012000'.replace('012','010'),2,'금액'),-123401);
 assert.throws(()=>cents('1.001',2,'금액'),/금액 형식/);
 assert.equal(parseMonth('202504'),'2025-04');
 assert.equal(parseMonth('2025년 4월'),'2025-04');
 const updates=[];
 const result=await importFiles([file(6),file(4),file(5)],p=>updates.push(p));
 assert.deepEqual(result.months,['2025-04','2025-05','2025-06']);
 assert.deepEqual(result.baseline,[.3,.3,.3]);
 assert.ok(result.meta.balanced);
 assert.equal(result.meta.rows,18);
 assert.equal(result.segments.length,12,'observed zero benefits remain available for the presentation');
 const leaf=result.segments.find(s=>s.p.code==='001'&&s.b==='사망');
 assert.equal(leaf.fine[0].value,'01');
 assert.equal(leaf.fine[0].series[2].pnl,-110e6);
 assert.equal(leaf.durations[0].value,'1차');
 assert.equal(leaf.durations.length,1,'overlapping 전체 and 2년이내 are excluded');
 assert.equal(leaf.durations[0].series[2].prem,60e6);
 const zero=result.segments.find(s=>s.p.code==='001'&&s.b==='진단');
 assert.equal(zero.series[2].observed,true);
 assert.equal(zero.durations[0].series[2].prem,0);
 assert.equal(result.candidates.length,1);
 const [sample]=result.candidates;
 assert.equal(sample.p.code,'001');
 assert.equal(sample.p.name,'합성 "테스트", A');
 assert.equal(sample.point.level,'product');
 assert.equal(sample.shortage,216e6);
 assert.ok(sample.a && sample.alertB);
 assert.equal(sample.aEvidence.key,sample.bEvidence.key);
 assert.equal(updates.at(-1).phase,'calculate');
 assert.equal(updates.at(-1).done,updates.at(-1).total);
 await assert.rejects(importFiles([file(4),file(4),file(6)]),/월별로/);
 await assert.rejects(importFiles([file(4),file(5),file(6,s=>s.replace('202506,1차','202505,1차'))]),/파일명/);
 await assert.rejects(importFiles([file(4),file(5),file(6,s=>s.replaceAll(',1차,',',전체,'))]),/합계/);
 const witnesses=await importFiles([4,5,6].map(m=>file(m,()=>scopedFixture(m))));
 assert.equal(witnesses.candidates.length,1);
 const [dual]=witnesses.candidates;
 assert.ok(dual.a && dual.alertB);
 assert.equal(dual.aEvidence.b,'사망');
 assert.equal(dual.bEvidence.b,'장해');
 assert.equal(dual.b,'장해');
 assert.equal(dual.point.level,'benefit');
 const blocked=await importFiles([4,5,6].map(m=>file(m,()=>scopedFixture(m,true))));
 assert.equal(blocked.candidates.length,0);
 // Exact cents and BigInt ratios distinguish a one-cent threshold miss.
 const t=[[100_000_000_000,20_000_000_000],[100_000_000_000,20_000_000_000],[100_000_000_000,20_000_000_000]];
 const near=[[10_000_000_000,-1_000_000_000],[10_000_000_000,-2_000_000_000],[10_000_000_000,-8_000_000_000]];
 assert.ok(evaluateExact(near,t).a);
 const bndr=near.map(x=>x.slice()); bndr[2][1]+=1;
 assert.equal(evaluateExact(bndr,t).a,false);
 console.log('CSV tests passed');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,header};

/* Browser-local, streaming parser. The Worker never makes a network request. */
(function (root) {
'use strict';
const ALIASES = {
  month:['CLSG_YM','CLSG_YM_CD','STND_YM','STD_YM','BASE_YM','DATA_YM','YYMM','YYYYMM','월','마감월','마감년월','기준월','기준년월'],
  group:['PDT_GUBUN','PDT_GRP_NM','PDT_GRP_DV_NM','PDT_CNT_NM','PRDT_GRP_NM','PDT_LCLS_NM','상품군','상품군명','상품그룹','상품그룹명','상품분류'],
  channel:['BSDP_NM','SLS_CHNL_NM','SALE_CHNL_NM','CHNL_NM','CHNL_DV_NM','SALE_ORG_NM','SLS_ORG_NM','채널','채널명','영업채널','영업채널명','본부','본부명'],
  code:['AXIS_CD','PDT_AX_CD','PDT_AXIS_CD','PDT_AXSC_CD','PDT_CD','PRDT_CD','상품축코드','상품코드','상품축'],
  name:['AXIS_NM','PDT_AX_NM','PDT_AXIS_NM','PDT_AXSC_NM','PDT_NM','PRDT_NM','상품축명','상품명','상품이름'],
  benefit:['BNFT_CL_NM','PDT_BNFT_CL_NM','BNFT_GRP_NM','BNFT_DV_NM','BNFT_NM','급부','급부명','급부구분','급부구분명','급부분류'],
  contract:['PDT_SCN_CD','SCN_CD','특약코드','계리코드','담보코드','주계약특약코드'],
  contractType:['SCN_CL_NM','특약구분','담보구분','주계약특약구분'],
  major:['BNFT_MCL_CD_NEW'],
  child:['PDT_BNFT_CD','BNFT_CD','세부급부코드','세부급부'],
  elapsed:['ELPS_PD_NM','경과구분','경과구분명','경과기간'],
  simple:['SMPC_NTIC_YN','SMPC_YN','간편고지','간편고지여부'],
  low:['LOWLAP_YN','무저해지','무저해지여부','무·저해지'],
  prem:['위험보험료','위험보험료금액','위험P','RISK_PREM_AMT','RISK_PRM_AMT','RISK_PM','RISK_PREM'],
  pnl:['위험차익금액','위험차익','위험률차손익','위험률차손익금액','RISK_PNL_AMT','RISK_PL_AMT','RISK_PROFIT_AMT'],
};
const LABELS = {group:'상품군',channel:'채널',code:'상품코드',elapsed:'경과구분',prem:'위험보험료',pnl:'위험차익금액'};
const REQUIRED = Object.keys(LABELS);
const DURATION = new Set(['전체','2년이내','1차','2차','3차']);
const MONTHS_EXPECTED=['2025-04','2025-05','2025-06'];
const FIELD_LIMIT=128*1024, MAX_ROWS=2_000_000, MAX_BYTES=768*1024*1024;
const BENEFITS=['사망','장해','진단','입원','수술','실손'];
const MAX_POINTS=550_000;
const nkey=s=>s.replace(/^\uFEFF/, '').trim().normalize('NFKC').toUpperCase().replace(/[\s_-]+/g,'');
const trim=s=>s.trim();
const LABELS_POINT={simple:'간편고지',low:'무저해지',product:'상품 전체',benefit:'급부',contract:'주계약·특약',child:'세부급부',attr:'간편고지·무저해지',elapsed:'경과구분',elapsedBenefit:'급부 · 경과구분',elapsedContract:'주계약·특약 · 경과구분',elapsedChild:'세부급부 · 경과구분'};

function fail(message) {throw new Error(message);}
function makeScanner(onRow) {
  let cells=[], value='', state=0, skipLF=false, row=0;
  function field() {
    if(cells.length>=128) fail('열이 128개를 넘습니다.');
    cells.push(value); value=''; state=0;
  }
  function endRow() {
    field(); row++;
    if(cells.length!==1 || cells[0].trim()!=='') onRow(cells,row);
    cells=[];
  }
  return {
    feed(chunk) {
      for(let i=0;i<chunk.length;i++) {
        const ch=chunk[i];
        if(skipLF){skipLF=false;if(ch==='\n') continue;}
        if(state===1) {
          if(ch==='"') state=2; else value+=ch;
        } else if(state===2 && ch==='"') {
          value+='"'; state=1;
        } else if(ch===',') {
          field();
        } else if(ch==='\r' || ch==='\n') {
          endRow(); skipLF=ch==='\r';
        } else if(state===2) {
          fail('CSV '+(row+1)+'행의 인용부호 형식이 올바르지 않습니다.');
        } else if(ch==='"') {
          if(value.length) fail('CSV '+(row+1)+'행의 인용부호 형식이 올바르지 않습니다.');
          state=1;
        } else {
          value+=ch;
        }
        if(value.length>FIELD_LIMIT) fail('CSV 항목 길이가 허용 범위를 넘습니다.');
      }
    },
    finish() {
      if(state===1) fail('마지막 CSV 인용부호가 닫히지 않았습니다.');
      if(cells.length || value || state) endRow();
    }
  };
}
function byHeader(row) {
  const header=new Map();
  for (let i=0;i<row.length;i++){
    const k=nkey(row[i]);
    if(k && header.has(k)) fail('CSV 헤더에 이름이 같은 열이 있습니다.');
    if(k) header.set(k,i);
  }
  const result={};
  for(const [field, aliases] of Object.entries(ALIASES)){
    result[field]=aliases.map(nkey).map(k=>header.get(k)).find(i=>i!==undefined) ?? -1;
  }
  const missing=REQUIRED.filter(k=>result[k]<0).map(k=>LABELS[k]);
    const wide=BENEFITS.map(name=>({name,prem:header.get(nkey('위험보험료_'+name))??-1,pnl:header.get(nkey('위험률차손익_'+name))??-1}));
  const matches=wide.reduce((n,x)=>n+(x.prem>=0)+(x.pnl>=0),0);
  if(matches&&matches!==12) fail('급부 분류 6개의 위험보험료·위험률차손익 열이 각각 필요합니다.');
  result.wide=matches===12?wide:null;
  if(!result.wide&&result.benefit<0) missing.push('급부명 또는 급부별 금액 12열');
  if(missing.length) fail('CSV 필수 열을 찾을 수 없습니다: '+missing.join(', ')+' ('+row.length+'개 열 인식)');
  return result;
}
function parseMonth(value) {
 const m=/^([12]\d{3})\s*(?:[-./년]\s*)?(0?[1-9]|1[0-2])(?:\s*월)?(?:[-./]\d{1,2})?$/.exec(value);
 return m ? m[1]+'-'+m[2].padStart(2,'0'):null;
}
function namedMonth(name) {
 const m=/(?:^|\D)([12]\d{3})[-_.]?(0[1-9]|1[0-2])(?=\D|$)/.exec(name);
 return m ? m[1]+'-'+m[2]:null;
}
function cents(value,row,name) {
 if(!value) fail('CSV '+row+'행에 '+name+' 금액이 비어 있습니다.');
 let s=value.replace(/^[₩]\s*/, '').replaceAll('−','-');
 if(/^\(.*\)$/.test(s)) s='-'+s.slice(1,-1);
 if(!/^[+-]?(?:(?:\d+)|(?:\d{1,3}(?:,\d{3})+))(?:\.\d{1,2}0*)?$/.test(s))
   fail('CSV '+row+'행의 '+name+' 금액 형식이 올바르지 않습니다. 원 단위 숫자(소수점 두 자리까지)를 사용해 주세요.');
 const [a,b='']=s.replaceAll(',','').split('.');
 const out=Math.abs(Number(a))*100+Number((b+'00').slice(0,2));
 if(!Number.isSafeInteger(out)) fail('CSV '+row+'행의 금액이 안전한 계산 범위를 벗어났습니다.');
 return s[0]==='-'?-out:out;
}
function label(value, fallback='미분류') {
 if(/[\0-\x1F\x7F\u202A-\u202E\u2066-\u2069]/.test(value)||value.length>240) fail('CSV 분류 항목에 지원하지 않는 문자 또는 길이가 있습니다.');
 return value || fallback;
}
function attr(v) {return /^(?:Y|1|TRUE)$/i.test(v)?'Y':/^(?:N|0|FALSE)$/i.test(v)?'N':'미분류';}
function add(amounts,prem,pnl) {
 const p=amounts[0]+prem, q=amounts[1]+pnl;
 if(!Number.isSafeInteger(p)||!Number.isSafeInteger(q)) fail('합산 금액이 안전 계산 범위를 벗어났습니다.');
 amounts[0]=p; amounts[1]=q;
}
const tuple=parts=>JSON.stringify(parts);
function addPoint(map, point, prem, pnl) {
 let entry=map.get(point.key);
 if(!entry){
   if(map.size>=MAX_POINTS) fail('분석 조합 수가 너무 많습니다. 범위를 줄인 파일로 다시 시도해 주세요.');
   entry={...point, amounts:[0,0]};map.set(point.key,entry);
 }
 add(entry.amounts,prem,pnl);
}
function parseOne(file,encoding,onBytes) {
 return (async()=>{
    if(!file.size) fail('비어 있는 CSV 파일이 있습니다.');
    const decoder=new TextDecoder(encoding,{fatal:true});
    const stream=file.stream().getReader();
    let schema, width, month=null, bytes=0, rows=0, totalRows=0, detailRows=0, reported=0, measureMismatch=0;
    const hint=namedMonth(file.name??'');
    const totals=[0,0], details=[0,0], map=new Map(), leaves=new Map();
    function addScope(level,p,c,b,r,elapsed,detailCode,prem,pnl){
      const key=tuple([level,p.g,c,p.code,p.attr,b,r,elapsed,detailCode]);
      addPoint(level==='leaf'?leaves:map,{level,key,p,c,b,r,elapsed,detailCode},prem,pnl);
    }
    const scanner=makeScanner((cells,num)=>{
      if(!schema){schema=byHeader(cells);width=cells.length;return;}
      if(cells.length!==width) fail('CSV '+num+'행의 열 수가 헤더와 다릅니다.');
      if(++rows>MAX_ROWS) fail('CSV 한 파일의 최대 행 수를 넘었습니다.');
      const get=k=>schema[k]<0?'':trim(cells[schema[k]]);
      const cellMonth=schema.month<0?hint:parseMonth(get('month'));
      if(!cellMonth) fail('월을 확인할 수 없습니다. YYYYMM 월 열 또는 파일명(예: 202504.csv)이 필요합니다.');
      if(hint&&cellMonth!==hint) fail('CSV 내부의 기준월과 파일명에 표시된 월이 다릅니다.');
      if(month&&cellMonth!==month) fail('한 파일에는 한 분석월만 들어 있어야 합니다.');
      month=cellMonth;
      const elapsed=get('elapsed').replace(/\s+/g,'');
      if(!DURATION.has(elapsed)) fail('CSV '+num+'행의 경과구분이 지원되는 형식이 아닙니다.');
      const prem=cents(get('prem'),num,'위험보험료'), pnl=cents(get('pnl'),num,'위험차익');
      const code=label(get('code'),'');
      if(!code) fail('CSV '+num+'행에 상품코드가 없습니다.');
      const scopedAttrs=[attr(get('simple')),attr(get('low'))].join('/');
      const p={code, g:label(get('group')), name:label(get('name'),code), attr:''};
      const b=label(get('benefit'));
      const ct=label(get('contractType'),'');
      const cc=label(get('contract'),'');
      const r=(ct||'미상')+(cc?' '+cc:'');
      const detail=label(get('child'),'');
      const c=label(get('channel'));
      if(elapsed==='전체') {totalRows++; add(totals,prem,pnl); return;}
      if(elapsed==='2년이내') return;
      detailRows++;add(details,prem,pnl);
      addScope('product',p,c,'','','','',prem,pnl);
      const ySimple=attr(get('simple')), yLow=attr(get('low'));
      if(schema.simple>=0) addScope('simple',{...p,attr:''},c,'','','',ySimple,prem,pnl);
      if(schema.low>=0) addScope('low',{...p,attr:''},c,'','','',yLow,prem,pnl);
      if(schema.simple>=0||schema.low>=0) addScope('attr',{...p,attr:scopedAttrs},c,'','','','',prem,pnl);
      const measures=schema.wide?schema.wide.map(pair=>[pair.name,
        cents(trim(cells[pair.prem]),num,'급부별 위험보험료'),
        cents(trim(cells[pair.pnl]),num,'급부별 위험차익'),
      ]):[[b,prem,pnl]];
      if(schema.wide){
        const totalsMeasures=measures.reduce((out,m)=>{add(out,m[1],m[2]);return out;},[0,0]);
        const inRange=(a,b)=>Math.abs(a-b)<=1;
        if(!inRange(totalsMeasures[0],prem)||!inRange(totalsMeasures[1],pnl)) measureMismatch++;
      }
      for(const [bn,bp,bq] of measures){
        // Keep observed zeroes and the two independent breakdowns for presentation.
        // They are not additional money in the portfolio or additional alert points.
        const leafProduct={...p,attr:scopedAttrs};
        addScope('leaf',leafProduct,c,bn,r,'','',bp,bq);
        const leaf=leaves.get(tuple(['leaf',p.g,c,p.code,scopedAttrs,bn,r,'','']));
        leaf.breakdowns ??= {fine:new Map(),durations:new Map()};
        for(const [axis,value] of [['fine',detail],['durations',elapsed]]){
          if(!value)continue;
          const parts=leaf.breakdowns[axis];
          if(!parts.has(value))parts.set(value,[0,0]);
          add(parts.get(value),bp,bq);
        }
        if(bp===0&&bq===0)continue;
        // Do not include overlapping broad-benefit subtotal columns or subtotal duration rows.
        addScope('benefit',p,c,bn,'','','',bp,bq);
        addScope('contract',p,c,bn,r,'','',bp,bq);
        addScope('child',p,c,bn,r,'',detail,bp,bq);
        addScope('elapsedContract',p,c,bn,r,elapsed,'',bp,bq);
      }
    });
    function decode(chunk,opts){
      try{return decoder.decode(chunk,opts);}catch(err){throw new Error('CSV 문자 인코딩을 읽을 수 없습니다.',{cause:err});}
    }
    try {
      for(;;){
        const {done,value}=await stream.read();
        if(done) break;
        bytes+=value.length;
        scanner.feed(decode(value,{stream:true}));
        if(bytes-reported>=512*1024){onBytes(bytes);reported=bytes;}
      }
      scanner.feed(decode()); scanner.finish(); onBytes(bytes);
    } finally {await stream.cancel().catch(()=>{});stream.releaseLock();}
    if(!schema||!month||!rows) fail('CSV 헤더 또는 데이터 행을 찾을 수 없습니다.');
    if(!totalRows||totals[0]<=0) fail('경과구분이 전체인 행과 양수인 합계 위험보험료가 필요합니다.');
    const balanced=detailRows>0&&details[0]===totals[0]&&details[1]===totals[1];
    if(!balanced) fail('경과구분 1차·2차·3차 합계가 전체와 일치하지 않습니다. 월별 원본 내보내기 파일을 확인해 주세요.');
    if(measureMismatch) fail('일부 행에서 6개 급부 금액의 합이 총액과 일치하지 않습니다. 중복·누락을 확인해 주세요.');
    for(const [key,p] of map){
      if(p.level==='leaf'||p.level==='product')continue;
      const [x,y]=p.amounts;
      if(x<=0 || totals[1]/totals[0]-y/x<0.3-1e-10) map.delete(key);
    }
    const hasBenefit=!!schema.wide||schema.benefit>=0, hasContract=schema.contract>=0||schema.contractType>=0;
    return {month,rows,totalRows,detailRows,totals,balanced,measureMismatch,encoding,map,leaves,hasBenefit,hasContract};
 })();
}
async function parseFallback(file,onBytes){
 try {return await parseOne(file,'utf-8',onBytes);}
 catch(err){
   if(!/인코딩/.test(err.message) && !/필수 열/.test(err.message)) throw err;
   try {return await parseOne(file,'euc-kr',onBytes);}
   catch(retry){throw /필수 열/.test(err.message)&&/인코딩/.test(retry.message)?err:retry;}
 }
}
function evaluate(series,baseline){
 if(series.some(x=>x.prem<=0))return null;
 const rates=series.map(x=>x.pnl/x.prem);
 const gaps=rates.map((x,i)=>baseline[i]-x);
 if(gaps.some(x=>x<0.3-1e-12))return null;
 const shortage=baseline[2]*series[2].prem-series[2].pnl;
 const impact=series[2].prem*(rates[1]-rates[2]);
 const a=gaps[0]<gaps[1]&&gaps[1]<gaps[2]&&shortage>=1e8-1e-6;
 const alertB=shortage>=5e7-1e-6&&impact>=5e7-1e-6;
 return a||alertB?{a,alertB,gaps,shortage,impact}:null;
}
function evaluateExact(amounts, totals) {
 if(amounts.some(x=>x[0]<=0))return null;
 // Cheap necessary guards before integer cross-products; a margin keeps boundary points.
 const s=amounts.map(([prem,pnl])=>({prem:prem/100,pnl:pnl/100}));
 const bounds=totals.map(([prem,pnl])=>pnl/prem);
 const approxGap=s.map((r,i)=>bounds[i]-r.pnl/r.prem);
 const roughShort=bounds[2]*s[2].prem-s[2].pnl;
 if(roughShort<5e7-1||approxGap.some(g=>g<0.3-1e-10))return null;
 const p=amounts.map(x=>BigInt(x[0])), q=amounts.map(x=>BigInt(x[1]));
 const tp=totals.map(x=>BigInt(x[0])), tq=totals.map(x=>BigInt(x[1]));
 const shortN=p.map((n,i)=>tq[i]*n-q[i]*tp[i]);
 const gapD=p.map((n,i)=>n*tp[i]);
 if(shortN.some((n,i)=>n*10n<gapD[i]*3n))return null;
 const isIncreasing=(a,b)=>shortN[a]*gapD[b]<shortN[b]*gapD[a];
 const impactN=q[1]*p[2]-q[2]*p[1];
 const a=isIncreasing(0,1)&&isIncreasing(1,2)&&shortN[2]>=10_000_000_000n*tp[2];
 const alertB=shortN[2]>=5_000_000_000n*tp[2]&&impactN>=5_000_000_000n*p[1];
 return a||alertB?{a,alertB,gaps:shortN.map((n,i)=>Number(n)/Number(gapD[i])),shortage:Number(shortN[2])/Number(tp[2])/100,impact:Number(impactN)/Number(p[1])/100}:null;
}
function combine(reports){
 reports.sort((a,b)=>a.month.localeCompare(b.month));
 const months=reports.map(x=>x.month);
 if(months.some((m,i)=>m!==MONTHS_EXPECTED[i])) fail('2025년 4월·5월·6월 CSV를 월별로 한 개씩 선택해 주세요.');
 const totals=reports.map((x,i)=>({month:months[i],prem:x.totals[0]/100,pnl:x.totals[1]/100}));
 const baseline=totals.map(t=>t.pnl/t.prem);
 const ids=new Map(), products=[], groups=new Set(), channels=new Set(), benefits=new Set(), riders=new Set(), attrs=new Set(), segments=[];
 const getProduct=p=>{
   const key=tuple([p.g,p.code]); let id=ids.get(key);
   if(id===undefined){id=products.length+1;ids.set(key,id);products.push({...p,id});}
   return {...p,id};
 };
 function seriesFor(key,source='map'){
  return reports.map((x,i)=>{const entry=x[source].get(key);const [p,q]=entry?.amounts??[0,0];return {month:months[i],prem:p/100,pnl:q/100,observed:!!entry};});
 }
 const leafKeys=new Map();
 for (const {leaves} of reports) for(const [key,p] of leaves) leafKeys.set(key,p);
 for(const [key,s] of leafKeys){
   const p=getProduct(s.p); const {c,b,r}=s; groups.add(p.g);channels.add(c);benefits.add(b);riders.add(r);attrs.add(p.attr);
   const breakdowns={};
   for(const axis of ['fine','durations']){
     const values=new Set(reports.flatMap(x=>[...(x.leaves.get(key)?.breakdowns?.[axis]?.keys()??[])]));
     breakdowns[axis]=[...values].map(value=>({value,series:reports.map((x,i)=>{
       const amounts=x.leaves.get(key)?.breakdowns?.[axis]?.get(value);
       return {month:months[i],prem:amounts?amounts[0]/100:0,pnl:amounts?amounts[1]/100:0,observed:!!amounts};
     })}));
   }
   segments.push({key,p,c,b,r,series:seriesFor(key,'leaves'),...breakdowns});
 }
 const found=new Map();
 const fields=['product','benefit','contract','child','elapsedContract','simple','low','attr'];
 const prefer=(a,b)=>a.shortage>b.shortage || (a.shortage===b.shortage&&(fields.indexOf(a.point.level)<fields.indexOf(b.point.level)||(a.point.level===b.point.level&&a.key<b.key)));
 for(const s of reports[2].map.values()){
   if(s.level==='leaf'||!s.c)continue;
   if(/^elapsed/.test(s.level)&&reports.some(x=>!x.balanced)) continue;
   const product=reports[2].map.get(tuple(['product',s.p.g,s.c,s.p.code,'','','','','']));
   if(!(product?.amounts[0]>0))continue;
   const amounts=reports.map(x=>x.map.get(s.key)?.amounts??[0,0]);
   const verdict=evaluateExact(amounts,reports.map(x=>x.totals));
   if(!verdict)continue;
   const series=seriesFor(s.key);
   const p=getProduct(s.p), scope=tuple([p.g,s.c,p.code]);
   const e={key:s.key,p,c:s.c,b:s.b,r:s.r,series,...verdict,point:{level:s.level,label:LABELS_POINT[s.level],elapsed:s.elapsed,detailCode:s.detailCode}};
   const result=found.get(scope)??{rep:e,aEvidence:null,bEvidence:null};
   if(prefer(e,result.rep))result.rep=e;
   if(e.a&&(!result.aEvidence||prefer(e,result.aEvidence)))result.aEvidence=e;
   if(e.alertB&&(!result.bEvidence||prefer(e,result.bEvidence)))result.bEvidence=e;
   found.set(scope,result);
 }
 const candidates=[...found.values()].map(x=>({...x.rep,a:!!x.aEvidence,alertB:!!x.bEvidence,aEvidence:x.aEvidence,bEvidence:x.bEvidence}));
 candidates.sort((a,b)=>b.shortage-a.shortage||a.key.localeCompare(b.key));
 for(const p of products) p.attr=''; // Product identity remains stable where attributes vary.
 const sorted=s=>[...s].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
 return {months,groups:sorted(groups),channels:sorted(channels),attrs:sorted(attrs),products,benefits:sorted(benefits),riders:sorted(riders),segments,baseline,totals,candidates,meta:{
   rows:reports.reduce((n,x)=>n+x.rows,0),
   months:reports.map(x=>({month:x.month,rows:x.rows,totalRows:x.totalRows,detailRows:x.detailRows,encoding:x.encoding,balanced:x.balanced,measureMismatch:x.measureMismatch})),
   balanced:reports.every(x=>x.balanced), measureMismatch:reports.reduce((n,x)=>n+x.measureMismatch,0), fullDepth:reports.every(x=>x.hasBenefit&&x.hasContract),
   rule:'3개월 30%p 열위 + A(지속 악화) 또는 B(최근 급격 악화). 상품군·채널·상품코드별 중복 제거.',
   ruleCoverage:'상품·급부·담보·세부급부·경과·고지/저해지 분석점에서 계산합니다. 실제 파일과 기존 사이트 결과의 일치는 아직 대사하지 않았습니다.',
   baselineMethod:'월 기준에는 경과구분 전체를, 상세 계산에는 중복 없는 1차·2차·3차만 사용합니다.'
 }};
}
async function importFiles(files,onProgress=()=>{}){
 if(!Array.isArray(files)||files.length!==3) fail('2025년 4월·5월·6월 CSV 세 개를 선택해 주세요.');
 const total=files.reduce((n,x)=>n+x.size,0);
 if(total>MAX_BYTES) fail('선택 파일의 합계가 768MiB를 넘습니다.');
 let done=0;
 const reports=[];
 for(const file of files){
   const report=await parseFallback(file,bytes=>onProgress({phase:'read',done:done+bytes,total}));
   done+=file.size;reports.push(report);
 }
 onProgress({phase:'calculate',done,total});
 return combine(reports);
}
const api={makeScanner,byHeader,cents,parseMonth,importFiles,evaluate,evaluateExact};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.CsvCore=api;
if(typeof WorkerGlobalScope!=='undefined'&&root instanceof WorkerGlobalScope){
 root.addEventListener('message',async event=>{
   try{
     const result=await importFiles(event.data.files,d=>root.postMessage({type:'progress',...d}));
     root.postMessage({type:'result',data:result});
   }catch(error){root.postMessage({type:'error',message:error.message||'CSV 계산 중 오류가 발생했습니다.'});}
 });
}
})(globalThis);

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(src, 'inline app script must exist');
assert.doesNotMatch(html, /\b(?:https?:\/\/|fetch\s*\()|<script\s+src=/i);
const nodes = new Map(), handlers = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    addEventListener: (event, cb) => handlers.set(id + ':' + event, cb),
    querySelector: () => null,
    scrollIntoView() {},
  });
  return nodes.get(id);
}
const context = vm.createContext({
  assert,
  document: { getElementById: node, addEventListener: node('document').addEventListener },
  handlers,
});
vm.runInContext(src, context, { filename: 'dashboard-inline.js' });
vm.runInContext(`
  assert.equal(SEGMENTS.length, 216);
  assert.equal(new Set(SEGMENTS.map(s => s.key)).size, 216);
  assert.equal(CANDIDATES.length, 6);
  for (const [a, b] of [[true, false], [false, true], [true, true]]) {
    assert.equal(CANDIDATES.filter(s => s.a === a && s.alertB === b).length, 2);
  }
  assert.ok(CANDIDATES.every(s => s.gaps.every(g => g >= .30)));
  assert.match($('candidateCount').textContent, /6개/);
  assert.equal(state.stage, -1);
  assert.equal($('alertPanel').hidden, false);
  assert.equal($('view').hidden, true);
  assert.equal(($('tabs').innerHTML.match(/data-action="step"/g) || []).length, 7);
  $('search').value = 'no such product';
  handlers.get('search:input')();
  assert.match($('candidateCount').textContent, /표시 0개/);
  $('search').value = '';
  handlers.get('search:input')();
  assert.equal(($('alerts').innerHTML.match(/data-action="alert"/g) || []).length, 6);
  for (const alert of CANDIDATES) {
    setState('alert', alert.key);
    render();
    const matches = matching();
    assert.equal(matches.length, 1);
    assert.equal(matches[0].key, alert.key);
    assert.equal(alert.b, matches[0].b);
    assert.ok($('alerts').innerHTML.includes(alert.b));
    assert.match($('path').innerHTML, /가상 .+급부/);
  }
  const candidate = CANDIDATES[0];
  for (const [action, value, expected] of [
    ['alert', candidate.key, '간편고지 × 무·저해지'],
    ['attr', candidate.p.attr, '상품 × 급부'],
    ['benefit', JSON.stringify([candidate.p.id, candidate.b]), '주계약·특약 매트릭스'],
    ['rider', candidate.r, '경과구분과 월별 변화'],
    ['step', '5', '정량 분석 종합'],
  ]) {
    setState(action, value);
    render();
    assert.ok($('view').innerHTML.includes(expected), expected);
  }
  handlers.get('filters:change')({target: {dataset: {field: 'mi'}, value: '0'}});
  assert.equal(state.mi, 0);
  assert.ok($('filters').innerHTML.includes('2027년 01월'));
  setState('reset', '');
  render();
  assert.equal(state.stage, -1);
  assert.equal(state.mi, 2);
  setState('step', '0');
  render();
  assert.equal(($('view').innerHTML.match(/data-action="pair"/g) || []).length, 9);
  const hostile = '<img src=x onerror=alert(1)>|test';
  const months = ['2035-04','2035-05','2035-06'];
  const series = months.map(month => ({month,prem:90000000,pnl:-50000000}));
  const product = {id:7,code:'DEMO-007',name:hostile,g:hostile,attr:'Y/Y'};
  const leaf = {key:'leaf',p:product,c:'Synthetic|Channel',b:hostile,r:'Synthetic R',series};
  const importedCandidate = {...leaf,key:'evidence',a:true,alertB:false,gaps:[.31,.4,.5],shortage:80000000,impact:0,point:{label:hostile}};
  const bundle = {months,groups:[hostile],channels:[leaf.c],products:[product],benefits:[leaf.b],segments:[leaf],baseline:[.2,.3,.4],candidates:[importedCandidate],meta:{rows:3}};
  applyImported(bundle);
  render();
  assert.match($('dataMode').textContent, /PC에서 불러온 데이터/);
  assert.match($('alertNote').textContent, /완전 대사되지 않았습니다/);
  assert.ok(! $('alerts').innerHTML.includes(hostile));
  assert.ok($('alerts').innerHTML.includes('&lt;img'));
  assert.match($('candidateCount').textContent, /전체 1개/);
  assert.equal(counts([leaf]),1);
  setState('pair', JSON.stringify([hostile,leaf.c]));
  assert.equal(state.g,hostile);
  assert.equal(state.c,leaf.c);
  setState('benefit',JSON.stringify([7,hostile]));
  assert.equal(state.b,hostile);
  setState('alert','evidence');
  setState('step','4');
  render();
  assert.match($('view').innerHTML, /경과구분과 월별 변화/);
  assert.ok(! $('view').innerHTML.includes(hostile));
  assert.equal(checkedEvidence().key,'evidence');
  const globalProduct = {...product,attr:''};
  const pooledCandidate = {...importedCandidate,p:globalProduct,b:'',r:''};
  const otherProduct = {id:8,code:'DEMO-008',name:'Other',g:hostile,attr:''};
  const otherChannelLeaf = {...leaf,key:'another',p:{...otherProduct,attr:'Y/Y'},c:'Other channel'};
  const extraLeaf = {...leaf,key:'attribute-two',p:{...product,attr:'Y/미분류'}};
  applyImported({...bundle,products:[globalProduct,otherProduct],segments:[leaf,extraLeaf,otherChannelLeaf],candidates:[pooledCandidate]});
  setState('alert','evidence');
  render();
  assert.equal(state.attr,'','pooled evidence over multiple attributes must not choose one');
  assert.match($('view').innerHTML,/무저해지 미분류/);
  setState('attr','Y/Y');
  assert.deepEqual(filterProducts().map(p=>p.id),[7]);
  assert.equal(matching({p:0}).length,1);
  applyImported({...bundle,products:[globalProduct],candidates:[pooledCandidate]});
  setState('alert','evidence');
  assert.equal(state.attr,'Y/Y','one supported attribute may be selected automatically');
  assert.equal(filterProducts().length,1,'global product attr is blank, segment attr controls filtering');

  setState('reset','');
  render();
  assert.equal(imported,false);
  assert.equal(MONTHS[2],'2027-03');
  assert.equal(CANDIDATES.length,6);
  assert.equal($('clearCsv').hidden,true);
  assert.ok(! $('alerts').innerHTML.includes('&lt;img'));
  assert.throws(()=>applyImported({...bundle,months:['<b>bad','x','y']}));
  startImport([{size:1}]);
  assert.match($('csvStatus').textContent,/세 개 함께/);
  assert.equal(imported,false);
`, context);
console.log('Passed: offline render, unique synthetic segments, A/B rules, six views, month selector, imported escaping and evidence scope, reset');

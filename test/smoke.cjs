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
    ['benefit', [candidate.p.id, candidate.b].join('|'), '주계약 × 특약'],
    ['rider', candidate.r, '월별 추이'],
    ['step', '5', '정량 분석 종합'],
  ]) {
    setState(action, value);
    render();
    assert.ok($('view').innerHTML.includes(expected), expected);
  }
  handlers.get('filters:change')({target: {dataset: {field: 'mi'}, value: '0'}});
  assert.equal(state.mi, 0);
  assert.ok($('kpis').innerHTML.includes(MONTHS[0]));
  handlers.get('reset:click')();
  assert.equal(state.stage, 0);
  assert.equal(state.mi, 2);
  assert.equal(($('view').innerHTML.match(/data-action="pair"/g) || []).length, 9);
`, context);
console.log('Passed: offline render, unique synthetic segments, A/B rules, six views, month selector, reset');

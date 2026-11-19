'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src/csv-core.js'), 'utf8').trimEnd();
if (/<\/script/i.test(worker)) throw Error('Worker source must not contain a literal closing script tag.');
const target = path.join(root, 'public/index.html');
const html = fs.readFileSync(target, 'utf8');
const slot = /(<script\b(?=[^>]*\bid=["']csv-worker-source["'])[^>]*>)[\s\S]*?(<\/script>)/g;
if ([...html.matchAll(slot)].length !== 1) throw Error('Expected exactly one csv-worker-source slot.');
const output = html.replace(slot, (_, start, end) => start + '\n' + worker + '\n' + end);
if (process.argv.includes('--check')) {
  if (html !== output) throw Error('Embedded worker differs from src/csv-core.js.');
  console.log('Embedded worker matches source.');
} else {
  fs.writeFileSync(target, output);
  console.log('Embedded browser-local CSV worker.');
}

import fs from 'node:fs';
import path from 'node:path';
import { getDiabloColorFilter } from '../src/components/itemColorTransforms.js';

const root = process.cwd();
const itemDir = path.join(root, 'public', 'items');
const keys = new Set(['invbox']);
const imageRows = fs.readFileSync(path.join(root, 'D2RStashWorker', 'Data', 'item_images.tsv'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => line.split('\t'));
const sunderRow = imageRows.find(([code]) => code === 'cs2');
if (!sunderRow || !/^invch\d+$/.test(sunderRow[1])) {
  throw new Error(`Sunder Charm (cs2) must use a grand-charm sprite, got: ${sunderRow?.[1] || 'missing mapping'}`);
}

for (const file of ['item_images.tsv', 'item_gfx.tsv']) {
  const lines = fs.readFileSync(path.join(root, 'D2RStashWorker', 'Data', file), 'utf8')
    .split(/\r?\n/)
    .slice(1);
  for (const line of lines) {
    const columns = line.split('\t').slice(1);
    for (const key of columns) if (key) keys.add(key);
  }
}

const transformCodes = new Set();
for (const table of ['uniqueitems.txt', 'setitems.txt']) {
  const rows = fs.readFileSync(path.join(root, 'D2RStashWorker', 'Data', table), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
  const headers = rows.shift();
  const invIndex = headers.indexOf('invtransform');
  const chrIndex = headers.indexOf('chrtransform');
  for (const row of rows) {
    for (const index of [invIndex, chrIndex]) if (index >= 0 && row[index]) transformCodes.add(row[index].trim().toLowerCase());
  }
}
const unmappedTransforms = [...transformCodes].filter((code) => !getDiabloColorFilter(code));
if (unmappedTransforms.length) {
  throw new Error('Missing renderer mappings for transform colors: ' + unmappedTransforms.join(', '));
}

const bundledAssets = fs.readdirSync(itemDir).filter((file) => file !== '.gitkeep');
if (bundledAssets.length) {
  throw new Error(`Proprietary item assets must not be bundled in public/items: ${bundledAssets.slice(0, 5).join(', ')}`);
}

console.log(`Verified ${keys.size} canonical item image mappings; artwork is local-only.`);

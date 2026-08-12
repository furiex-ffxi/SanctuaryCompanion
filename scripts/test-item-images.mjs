import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const itemDir = path.join(root, 'public', 'items');
const files = new Set(fs.readdirSync(itemDir));
const keys = new Set(['invbox']);

for (const file of ['item_images.tsv', 'item_gfx.tsv']) {
  const lines = fs.readFileSync(path.join(root, 'D2RStashWorker', 'Data', file), 'utf8')
    .split(/\r?\n/)
    .slice(1);
  for (const line of lines) {
    const columns = line.split('\t').slice(1);
    for (const key of columns) if (key) keys.add(key);
  }
}

const missing = [...keys].filter((key) => !files.has(`${key}.png`));
if (missing.length) {
  throw new Error(`Missing case-sensitive item assets: ${missing.join(', ')}`);
}

console.log(`Verified ${keys.size} canonical item image keys against ${files.size} PNG assets.`);
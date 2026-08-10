const fs = require('fs');
const path = require('path');

function parseTsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  if (lines.length <= 1) {
    return {};
  }
  const headers = lines[0].split('\t');
  const codeIdx = headers.indexOf('code');
  const nameIdx = headers.indexOf('name');
  const wIdx = headers.indexOf('invwidth');
  const hIdx = headers.indexOf('invheight');

  const result = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split('\t');
    if (cols.length <= codeIdx) continue;
    const code = (cols[codeIdx] || '').toLowerCase().trim();
    if (!code) continue;
    const name = cols[nameIdx] || '';
    const w = parseInt(cols[wIdx], 10);
    const h = parseInt(cols[hIdx], 10);
    if (!isNaN(w) && !isNaN(h)) {
      result[code] = { iw: w, ih: h, n: name };
    }
  }
  return result;
}

const weapons = parseTsv('../D2SSharp/src/D2SSharp/Data/Txt/99/weapons.txt');
const armor = parseTsv('../D2SSharp/src/D2SSharp/Data/Txt/99/armor.txt');
const misc = parseTsv('../D2SSharp/src/D2SSharp/Data/Txt/99/misc.txt');

// Output as format
const output = {
  weapon_items: weapons,
  armor_items: armor,
  other_items: misc
};

fs.writeFileSync(
  './src/domain/entities/static_constant_data.js',
  'export const constants = ' + JSON.stringify(output, null, 2) + ';\n',
  'utf8'
);
console.log('Successfully updated static_constant_data.js!');

const fs = require('fs');
const glob = require('path');

const dirs = ['96', '97', '99', '105'];
const files = ['weapons.txt', 'armor.txt', 'misc.txt'];

for (const dir of dirs) {
  for (const file of files) {
    const p = `../D2SSharp/src/D2SSharp/Data/Txt/${dir}/${file}`;
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('cs2') || lines[i].toLowerCase().includes('sunder')) {
        console.log(`${dir}/${file} line ${i}: ${lines[i].substring(0, 100)}`);
      }
    }
  }
}

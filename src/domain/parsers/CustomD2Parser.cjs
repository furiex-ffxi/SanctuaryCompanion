const path = require('path');
const { execFile } = require('child_process');

const workerPath = path.join(__dirname, '..', '..', '..', 'server', 'bin', 'D2RStashWorker.exe');

function parseWithWorker(mode, filePath) {
  return new Promise((resolve, reject) => {
    execFile(workerPath, [mode, filePath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`D2RStashWorker ${mode} failed: ${stderr || err.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`D2RStashWorker ${mode} returned invalid JSON: ${parseError.message}`));
      }
    });
  });
}

// All D2R save and shared-stash reads use the same D2SSharp worker that writes them.
const parseD2S = (filePath) => parseWithWorker('parse_save', filePath);
const parseD2I = (filePath) => parseWithWorker('parse_stash', filePath);

async function writeD2I() {
  throw new Error('Use D2RStashWorker add/remove commands for .d2i writes.');
}

async function writeD2S() {
  throw new Error('Use D2RStashWorker add_save/remove_save commands for .d2s writes.');
}

module.exports = { parseD2S, parseD2I, writeD2I, writeD2S };
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..');
const d2rSharpRoot = process.env.D2R_SHARP_ROOT || path.resolve(repoRoot, '..', 'D2SSharp');
const lock = JSON.parse(await readFile(path.join(repoRoot, 'D2SSharp.lock.json'), 'utf8'));
const { stdout } = await execFileAsync('git', ['-C', d2rSharpRoot, 'rev-parse', 'HEAD']);
if (stdout.trim() !== lock.commit) throw new Error(`D2SSharp is at ${stdout.trim()}; expected pinned commit ${lock.commit}.`);
const output = path.join(repoRoot, 'server', 'bin');
await rm(output, { recursive: true, force: true });
const project = path.join(repoRoot, 'D2RStashWorker', 'D2RStashWorker.csproj');
await execFileAsync('dotnet', ['publish', project, '--configuration', 'Release', '--runtime', 'win-x64', '--self-contained', 'false', '--output', output, `/p:D2SSharpProjectPath=${path.join(d2rSharpRoot, lock.project)}`], { maxBuffer: 16 * 1024 * 1024 });
await writeFile(path.join(output, 'worker-version.json'), JSON.stringify({ d2sSharpCommit: lock.commit, builtAtUtc: new Date().toISOString(), runtime: 'win-x64' }));
console.log(`D2R worker built at ${output}`);
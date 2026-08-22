import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'child_process';

const STATE_ROOT = process.env.LOCALAPPDATA || os.tmpdir();
const STATE_DIRECTORY = path.join(STATE_ROOT, 'SanctuaryCompanion');
const SERVICE_STATE_PATH = path.join(STATE_DIRECTORY, 'W32Time-state.json');
fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
let operationQueue = Promise.resolve();

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function elevatedCommand(script) {
  const encoded = encodedPowerShell(script);
  return `powershell -NoProfile -Command "$process = Start-Process powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList '-NoProfile -EncodedCommand ${encoded}'; exit $process.ExitCode"`;
}

function pinScript(safeDatetime) {
  const statePath = quotePowerShell(SERVICE_STATE_PATH);
  return `$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='W32Time'"
if (-not $service) { throw 'W32Time service was not found' }
if (Test-Path -LiteralPath ${statePath}) {
  try {
    $existingState = Get-Content -LiteralPath ${statePath} -Raw | ConvertFrom-Json
    $stateAge = ([DateTime]::UtcNow - [DateTime]::Parse($existingState.PinnedAt)).TotalHours
    if ($stateAge -gt 24 -or $stateAge -lt -1) { throw 'Existing W32Time state is stale; restore it before starting a new pin' }
  } catch {
    throw "Cannot safely reuse existing W32Time state: $($_.Exception.Message)"
  }
} else {
  $state = @{ StartMode = $service.StartMode; State = $service.State; PinnedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
  $temporaryStatePath = ${statePath} + '.tmp'
  Set-Content -LiteralPath $temporaryStatePath -Value $state -Encoding UTF8
  Move-Item -LiteralPath $temporaryStatePath -Destination ${statePath} -Force
}
Set-Service -Name W32Time -StartupType Disabled
Stop-Service -Name W32Time -Force -ErrorAction Stop
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if ((Get-Service -Name W32Time).Status -eq 'Stopped') { break }
  Start-Sleep -Milliseconds 100
}
if ((Get-Service -Name W32Time).Status -ne 'Stopped') { throw 'W32Time did not stop; clock was not changed' }
Set-Date -Date ([datetime]${quotePowerShell(safeDatetime)})`;
}

function restoreScript() {
  const statePath = quotePowerShell(SERVICE_STATE_PATH);
  return `$ErrorActionPreference = 'Stop'
$statePath = ${statePath}
if (-not (Test-Path -LiteralPath $statePath)) { throw 'No saved W32Time service state was found' }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$stateAge = ([DateTime]::UtcNow - [DateTime]::Parse($state.PinnedAt)).TotalHours
if ($stateAge -gt 24 -or $stateAge -lt -1) { throw 'Saved W32Time service state is stale; manual recovery is required' }
$startupType = switch ($state.StartMode) {
  'Auto' { 'Automatic'; break }
  'Manual' { 'Manual'; break }
  'Disabled' { 'Disabled'; break }
  default { throw "Unsupported W32Time startup mode: $($state.StartMode)" }
}
Set-Service -Name W32Time -StartupType $startupType
if ($state.State -eq 'Running') {
  if ((Get-Service -Name W32Time).Status -ne 'Running') { Start-Service -Name W32Time }
  w32tm /resync /force
} else {
  if ((Get-Service -Name W32Time).Status -ne 'Stopped') { Stop-Service -Name W32Time -Force -ErrorAction Stop }
}
Remove-Item -LiteralPath $statePath -Force`;
}

export function setWindowsTime({ datetime, restore }, execFn = exec) {
  const operation = operationQueue.then(() => new Promise((resolve, reject) => {
      let script;
      if (restore) {
        script = elevatedCommand(restoreScript());
      } else {
        if (!datetime) return reject(new Error('Missing datetime parameter'));
        const parsedDate = new Date(datetime);
        if (isNaN(parsedDate.getTime())) {
          return reject(new Error('Invalid datetime parameter'));
        }
        const safeDatetime = parsedDate.toISOString();
        script = elevatedCommand(pinScript(safeDatetime));
      }

      execFn(script, (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || '').trim();
          // Node's exec error message includes the complete command, which
          // contains a large base64 payload. Surface PowerShell's useful
          // stderr instead and never send that payload to the UI.
          if (detail || err.cmd) {
            const message = detail
              ? `Windows time operation failed: ${detail}`
              : `Windows time operation failed (exit code ${err.code ?? 'unknown'}). UAC may have been cancelled or denied.`;
            const wrapped = new Error(message, { cause: err });
            wrapped.code = err.code;
            reject(wrapped);
          } else {
            reject(err);
          }
        }
        else resolve({ success: true });
      });
    }));
  operationQueue = operation.catch(() => {});
  return operation;
}

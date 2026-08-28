import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'child_process';

const STATE_ROOT = process.env.LOCALAPPDATA || os.tmpdir();
const STATE_DIRECTORY = process.env.SANCTUARY_TIME_STATE_DIRECTORY || path.join(STATE_ROOT, 'SanctuaryCompanion');
const SERVICE_STATE_PATH = path.join(STATE_DIRECTORY, 'W32Time-state.json');
const TIME_ERROR_PATH = path.join(STATE_DIRECTORY, 'W32Time-error.txt');
fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
let operationQueue = Promise.resolve();

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function elevatedCommand(script) {
  const errorPath = quotePowerShell(TIME_ERROR_PATH);
  const guardedScript = `$ErrorActionPreference = 'Stop'
try {
${script}
} catch {
  try { $_.Exception.ToString() | Set-Content -LiteralPath ${errorPath} -Encoding UTF8 } catch {}
  exit 1
}`;
  const guardedEncoded = encodedPowerShell(guardedScript);
  return `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; $errorPath = ${errorPath}; Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue; try { $process = Start-Process powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList '-NoProfile -EncodedCommand ${guardedEncoded}'; if ($null -eq $process) { throw 'The elevated time helper did not start; UAC may have been cancelled.' }; if ($process.ExitCode -ne 0) { if (Test-Path -LiteralPath $errorPath) { Get-Content -LiteralPath $errorPath -Raw | Write-Error; Remove-Item -LiteralPath $errorPath -Force -ErrorAction SilentlyContinue }; exit $process.ExitCode }; exit 0 } catch { Write-Error $_; exit 1 }"`;
}

// Keep the live request path compatible with the original scheduler. The
// hardened recovery script is still used by injected/test executors, but the
// persistent elevated-helper path has proven unreliable on some Windows hosts.
function legacyTimeCommand({ datetime, restore }) {
  if (restore) {
    return `powershell -Command "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-Command Start-Service W32Time -ErrorAction SilentlyContinue; W32tm /resync /force'"`;
  }
  if (!datetime) throw new Error('Missing datetime parameter');
  const parsedDate = new Date(datetime);
  if (isNaN(parsedDate.getTime())) throw new Error('Invalid datetime parameter');
  const safeDatetime = parsedDate.toISOString();
  return `powershell -Command "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-Command Stop-Service W32Time -ErrorAction SilentlyContinue; Set-Date -Date ([datetime]''${safeDatetime}'')'"`;
}

function pinScript(safeDatetime) {
  const statePath = quotePowerShell(SERVICE_STATE_PATH);
  return `$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='W32Time'"
if (-not $service) { throw 'W32Time service was not found' }
$targetDate = [datetime]${quotePowerShell(safeDatetime)}
if ($targetDate -le [DateTime]::Now) { throw 'Target datetime must be in the future' }
if (Test-Path -LiteralPath ${statePath}) {
  try {
    $existingState = Get-Content -LiteralPath ${statePath} -Raw | ConvertFrom-Json
  } catch {
    throw "Cannot safely reuse existing W32Time state: $($_.Exception.Message)"
  }
} else {
  $state = @{ StartMode = $service.StartMode; State = $service.State; OriginalUtc = [DateTime]::UtcNow.ToString('o'); PinnedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress
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
Set-Date -Date $targetDate`;
}

function restoreScript() {
  const statePath = quotePowerShell(SERVICE_STATE_PATH);
  return `$ErrorActionPreference = 'Stop'
$statePath = ${statePath}
if (-not (Test-Path -LiteralPath $statePath)) { throw 'No saved W32Time service state was found' }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$startupType = switch ($state.StartMode) {
  'Auto' { 'Automatic'; break }
  'Manual' { 'Manual'; break }
  'Disabled' { 'Disabled'; break }
  default { throw "Unsupported W32Time startup mode: $($state.StartMode)" }
}
# The service may be left Disabled after an interrupted pin even when the
# saved pre-pin mode was Manual. Always use a temporary startable mode first.
Set-Service -Name W32Time -StartupType Manual
if ((Get-Service -Name W32Time).Status -ne 'Running') { Start-Service -Name W32Time }
w32tm /resync /force
if ($LASTEXITCODE -ne 0) { throw "W32Time resynchronization failed with exit code $LASTEXITCODE" }
if ($state.State -ne 'Running' -and (Get-Service -Name W32Time).Status -ne 'Stopped') { Stop-Service -Name W32Time -Force -ErrorAction Stop }
Set-Service -Name W32Time -StartupType $startupType
Remove-Item -LiteralPath $statePath -Force`;
}

export function createTimeScript({ operation, datetime }) {
  if (operation === 'restore') return restoreScript();
  if (operation !== 'pin') throw new Error('Unsupported Windows time operation');
  if (!datetime) throw new Error('Missing datetime parameter');
  const parsedDate = new Date(datetime);
  if (isNaN(parsedDate.getTime())) throw new Error('Invalid datetime parameter');
  return pinScript(parsedDate.toISOString());
}

export function setWindowsTime({ datetime, restore }, execFn = exec) {
  const operation = operationQueue.then(() => new Promise((resolve, reject) => {
      if (execFn === exec) {
        let legacyScript;
        try {
          legacyScript = restore && fs.existsSync(SERVICE_STATE_PATH)
            ? elevatedCommand(restoreScript())
            : legacyTimeCommand({ datetime, restore });
        }
        catch (error) { reject(error); return; }
        execFn(legacyScript, error => {
          if (error) reject(error);
          else resolve({ success: true });
        });
        return;
      }
      const operationName = restore ? 'restore' : 'pin';
      let script;
      try { script = elevatedCommand(createTimeScript({ operation: operationName, datetime })); }
      catch (error) { reject(error); return; }

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

export function getWindowsTimeStatus() {
  const recoveryNeeded = fs.existsSync(SERVICE_STATE_PATH);
  let state = null;
  if (recoveryNeeded) {
    try {
      state = JSON.parse(fs.readFileSync(SERVICE_STATE_PATH, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return { recoveryNeeded: true, state: null, error: 'The saved W32Time recovery state is unreadable.' };
    }
  }
  return {
    recoveryNeeded,
    state: state ? { originalUtc: state.OriginalUtc ?? null, pinnedAt: state.PinnedAt ?? null, startMode: state.StartMode ?? null, serviceState: state.State ?? null } : null,
  };
}

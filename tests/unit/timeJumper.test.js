import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setWindowsTime } from '../../server/timeJumper.js';

function decodedScripts(command) {
  return [...command.matchAll(/-EncodedCommand ([A-Za-z0-9+/=]+)/g)]
    .map(match => Buffer.from(match[1], 'base64').toString('utf16le'));
}

describe('timeJumper', () => {
  it('should call exec with restore command when restore is true', async () => {
    let executedScript = '';
    const mockExec = (script, callback) => {
      executedScript = script;
      callback(null);
    };

    const res = await setWindowsTime({ restore: true }, mockExec);
    assert.equal(res.success, true);
    const [restoreScript] = decodedScripts(executedScript);
    assert.ok(executedScript.includes('-PassThru -Wait'));
    assert.ok(executedScript.includes('exit $process.ExitCode'));
    assert.ok(executedScript.includes('Get-Content -LiteralPath $errorPath -Raw | Write-Error'));
    assert.ok(executedScript.includes("$ErrorActionPreference = 'Stop'"));
    assert.ok(executedScript.includes('UAC may have been cancelled'));
    assert.ok(restoreScript.includes('Set-Service -Name W32Time -StartupType $startupType'));
    assert.ok(restoreScript.includes('Start-Service -Name W32Time'));
    assert.ok(restoreScript.includes('w32tm /resync /force'));
    assert.ok(!restoreScript.includes('Saved W32Time service state is stale'));
    assert.ok(restoreScript.includes('Remove-Item -LiteralPath $statePath -Force'));
  });

  it('should call exec with set-date command when datetime is provided', async () => {
    let executedScript = '';
    const mockExec = (script, callback) => {
      executedScript = script;
      callback(null);
    };

    const res = await setWindowsTime({ datetime: '2026-08-19T10:00:00.000Z' }, mockExec);
    assert.equal(res.success, true);
    const [pinScript] = decodedScripts(executedScript);
    assert.ok(pinScript.includes('Set-Service -Name W32Time -StartupType Disabled'));
    assert.ok(pinScript.includes('Stop-Service -Name W32Time -Force -ErrorAction Stop'));
    assert.ok(pinScript.includes("if ((Get-Service -Name W32Time).Status -ne 'Stopped')"));
    assert.ok(pinScript.includes('ConvertTo-Json -Compress'));
    assert.ok(pinScript.includes('OriginalUtc = [DateTime]::UtcNow.ToString'));
    assert.ok(pinScript.includes("Set-Date -Date ([datetime]'2026-08-19T10:00:00.000Z')"));
  });

  it('preserves service state when pinning is requested repeatedly', async () => {
    const commands = [];
    const mockExec = (script, callback) => {
      commands.push(script);
      callback(null);
    };

    await setWindowsTime({ datetime: '2026-08-19T10:00:00.000Z' }, mockExec);
    await setWindowsTime({ datetime: '2026-08-19T11:00:00.000Z' }, mockExec);

    assert.equal(commands.length, 2);
    assert.equal(decodedScripts(commands[0]).length, 1);
    assert.equal(decodedScripts(commands[1]).length, 1);
    assert.ok(decodedScripts(commands[1])[0].includes('Move-Item -LiteralPath $temporaryStatePath'));
  });

  it('makes restore safe to retry after the service has already started', async () => {
    let executedScript = '';
    const mockExec = (script, callback) => {
      executedScript = script;
      callback(null);
    };

    await setWindowsTime({ restore: true }, mockExec);

    const [restoreScript] = decodedScripts(executedScript);
    assert.ok(restoreScript.includes("if ((Get-Service -Name W32Time).Status -ne 'Running') { Start-Service -Name W32Time }"));
    assert.ok(restoreScript.includes('Remove-Item -LiteralPath $statePath -Force'));
  });

  it('does not resolve when the elevated command fails', async () => {
    await assert.rejects(
      setWindowsTime({ datetime: '2026-08-19T10:00:00.000Z' }, (_script, callback) => callback(new Error('elevation failed'))),
      { message: 'elevation failed' }
    );
  });

  it('should reject when datetime is invalid', async () => {
    try {
      await setWindowsTime({ datetime: "2026-08-19''); Remove-Item -Recurse C:\; #" }, () => {});
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.equal(err.message, 'Invalid datetime parameter');
    }
  });

  it('should reject when datetime is missing and restore is false', async () => {
    try {
      await setWindowsTime({ }, () => {});
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.equal(err.message, 'Missing datetime parameter');
    }
  });

  it('should reject when exec returns an error', async () => {
    const mockExec = (script, callback) => {
      callback(new Error('exec failed'));
    };

    try {
      await setWindowsTime({ restore: true }, mockExec);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.equal(err.message, 'exec failed');
    }
  });

  it('does not expose the encoded command when elevated PowerShell fails', async () => {
    await assert.rejects(
      setWindowsTime({ restore: true }, (_script, callback) => callback({ message: 'Command failed', cmd: 'powershell -EncodedCommand long-payload', code: 1 }, '', 'Access is denied.')),
      { message: 'Windows time operation failed: Access is denied.' }
    );
  });
});

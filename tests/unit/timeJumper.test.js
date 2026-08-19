import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setWindowsTime } from '../../server/timeJumper.js';

describe('timeJumper', () => {
  it('should call exec with restore command when restore is true', async () => {
    let executedScript = '';
    const mockExec = (script, callback) => {
      executedScript = script;
      callback(null);
    };

    const res = await setWindowsTime({ restore: true }, mockExec);
    assert.equal(res.success, true);
    assert.ok(executedScript.includes('Start-Service W32Time'));
    assert.ok(executedScript.includes('W32tm /resync /force'));
  });

  it('should call exec with set-date command when datetime is provided', async () => {
    let executedScript = '';
    const mockExec = (script, callback) => {
      executedScript = script;
      callback(null);
    };

    const res = await setWindowsTime({ datetime: '2026-08-19T10:00:00.000Z' }, mockExec);
    assert.equal(res.success, true);
    assert.ok(executedScript.includes('Stop-Service W32Time'));
    assert.ok(executedScript.includes("Set-Date -Date ([datetime]''2026-08-19T10:00:00.000Z'')"));
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
});

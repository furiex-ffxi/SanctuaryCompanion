import assert from 'node:assert/strict'
import test from 'node:test'
import { isD2RRunning, rejectWhileD2RRunning } from '../../server/processLock.js'

const runningOutput = 'Image Name                     PID Session Name        Session#    Mem Usage\nD2R.exe                       1234 Console                    1      10,000 K'

test('detects D2R from tasklist output and fails open when tasklist errors', () => {
  assert.equal(isD2RRunning(() => runningOutput), true)
  assert.equal(isD2RRunning(() => 'INFO: No tasks are running'), false)
  assert.equal(isD2RRunning(() => { throw new Error('tasklist unavailable') }), false)
})

test('returns a lock response for every save mutation boundary', () => {
  const response = { headers: null, status: null, body: null, writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
  assert.equal(rejectWhileD2RRunning(response, () => runningOutput), true)
  assert.equal(response.status, 423)
  assert.equal(JSON.parse(response.body).success, false)

  const unlocked = { writeHead() { throw new Error('must not write') }, end() { throw new Error('must not end') } }
  assert.equal(rejectWhileD2RRunning(unlocked, () => 'INFO: No tasks are running'), false)
})

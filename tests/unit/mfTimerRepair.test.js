import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { repairFutureD2RSaveTimestamps } from '../../server/mfTimerRepair.js'

test('repairs only future D2R MF Timer save timestamps', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-mf-timer-'))
  try {
    const now = new Date('2026-09-01T12:00:00.000Z')
    fs.writeFileSync(path.join(directory, 'future.ctl'), 'ctl')
    fs.writeFileSync(path.join(directory, 'past.ctlo'), 'ctlo')
    fs.writeFileSync(path.join(directory, 'future.txt'), 'ignored')
    fs.utimesSync(path.join(directory, 'future.ctl'), now, new Date('2026-09-01T13:00:00.000Z'))
    fs.utimesSync(path.join(directory, 'past.ctlo'), now, new Date('2026-09-01T11:00:00.000Z'))
    fs.utimesSync(path.join(directory, 'future.txt'), now, new Date('2026-09-01T13:00:00.000Z'))

    const result = repairFutureD2RSaveTimestamps({ directory, now, isRunning: () => false })

    assert.deepEqual(result.repaired.map(file => file.name), ['future.ctl'])
    assert.equal(result.count, 1)
    assert.equal(fs.statSync(path.join(directory, 'future.ctl')).mtime.getTime(), now.getTime())
    assert.equal(fs.statSync(path.join(directory, 'past.ctlo')).mtime.toISOString(), '2026-09-01T11:00:00.000Z')
    assert.equal(fs.statSync(path.join(directory, 'future.txt')).mtime.toISOString(), '2026-09-01T13:00:00.000Z')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('does not repair timestamps while D2R is running', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-mf-timer-'))
  try {
    const now = new Date('2026-09-01T12:00:00.000Z')
    const filePath = path.join(directory, 'future.ctl')
    fs.writeFileSync(filePath, 'ctl')
    const future = new Date('2026-09-01T13:00:00.000Z')
    fs.utimesSync(filePath, now, future)

    assert.throws(
      () => repairFutureD2RSaveTimestamps({ directory, now, isRunning: () => true }),
      /while Diablo II Resurrected is running/
    )
    assert.equal(fs.statSync(filePath).mtime.toISOString(), future.toISOString())
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

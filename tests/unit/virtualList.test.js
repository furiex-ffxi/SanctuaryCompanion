import test from 'node:test'
import assert from 'node:assert/strict'
import { getVirtualRange } from '../../src/domain/virtualList.js'

test('virtual range renders an overscanned visible window', () => {
  assert.deepEqual(getVirtualRange(1000, 860, 600), { start: 2, end: 25 })
})

test('virtual range clamps stale scroll positions after filtering', () => {
  assert.deepEqual(getVirtualRange(3, 100000, 600), { start: 2, end: 3 })
  assert.deepEqual(getVirtualRange(0, 100000, 600), { start: 0, end: 0 })
})
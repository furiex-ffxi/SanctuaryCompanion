import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { safeSavePath } from '../../server/savePath.js'

test('accepts contained save basenames and rejects traversal or wrong extensions', () => {
  const root = path.join(process.cwd(), 'test-saves')
  assert.equal(safeSavePath(root, 'Chosen.d2i', '.d2i'), path.join(root, 'Chosen.d2i'))
  assert.throws(() => safeSavePath(root, '../Chosen.d2i', '.d2i'), /basename/)
  assert.throws(() => safeSavePath(root, 'Character.d2s', '.d2i'), /basename/)
  assert.throws(() => safeSavePath(root, path.resolve(root, 'Chosen.d2i'), '.d2i'), /basename/)
})
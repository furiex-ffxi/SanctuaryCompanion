import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VaultRepository } from '../../server/vault/VaultRepository.js'

test('backfills raw vault items transactionally and journals the before/after data', async () => {
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-vault-backfill-'))
  const repository = new VaultRepository({ savesDir })
  try {
    await repository.add({
      vaultId: 'armor-backfill-1',
      stashedAt: '2026-08-17T00:00:00.000Z',
      sourceSave: 'Legacy.d2s',
      itemData: { id: 42, type: 'xpl', type_name: 'xpl', rawBytesHex: 'abcd' },
    })
    const result = await repository.backfillItemFields(async (item) => ({
      ...item, defense: 244, max_durability: 30, durability: 15,
    }))
    assert.deepEqual(result, { updatedCount: 1, skippedCount: 0 })
    assert.equal(repository.get('armor-backfill-1').itemData.defense, 244)
    assert.equal(repository.get('armor-backfill-1').itemData.max_durability, 30)
    assert.equal(repository.get('armor-backfill-1').itemData.durability, 15)
    const journal = fs.readFileSync(repository.epoch.journalPath, 'utf8')
    assert.match(journal, /backfill_item_fields/)
    assert.match(journal, /"defense":244/)
  } finally {
    repository.close()
    fs.rmSync(savesDir, { recursive: true, force: true })
  }
})
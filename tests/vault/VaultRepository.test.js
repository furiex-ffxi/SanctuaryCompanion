import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VaultRepository } from '../../server/vault/VaultRepository.js'
import { projectVaultEntry } from '../../server/vault/vaultProjection.js'
import { getItemSlotCategory, resolveVaultBaseType } from '../../src/domain/entities/VaultCatalog.js'
import { readVaultJournal, replayVaultEpoch } from '../../server/vault/VaultRecovery.js'

const temporaryDirectories = new Set()

function temporarySavesDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-vault-test-'))
  temporaryDirectories.add(directory)
  return directory
}

function entry(index, overrides = {}) {
  return {
    vaultId: `stash_${String(index).padStart(6, '0')}`,
    stashedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
    sourceSave: `Hero${index % 3}.d2s`,
    itemData: {
      type: index % 2 ? 'rin' : 'r33',
      type_name: index % 2 ? `Rare Ring ${index}` : 'Zod Rune',
      quality: index % 2 ? 6 : 2,
      magic_attributes: [{ name: 'fire_resist', values: [20 + index] }],
      rawBytesHex: `4a4d${index.toString(16).padStart(4, '0')}`,
    },
    ...overrides,
  }
}

test.afterEach(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true })
    temporaryDirectories.delete(directory)
  }
})

test('migrates legacy JSON once and preserves the original in backups', () => {
  const savesDir = temporarySavesDirectory()
  const legacyPath = path.join(savesDir, 'infinite_stash_vault.json')
  fs.writeFileSync(legacyPath, JSON.stringify([entry(1), entry(2)]))
  const repository = new VaultRepository({ savesDir })
  try {
    const result = repository.migrateLegacyJson()
    assert.equal(result.migrated, true)
    assert.equal(result.count, 2)
    assert.equal(repository.list().total, 2)
    assert.equal(repository.get(entry(1).vaultId).itemData.image_key, 'invrin1')
    assert.equal(repository.get(entry(2).vaultId).itemData.image_key, 'invrzod')
    assert.equal(fs.existsSync(path.join(result.archiveDir, 'infinite_stash_vault.json')), true)
    assert.equal(repository.migrateLegacyJson().reason, 'already-migrated')
  } finally {
    repository.close()
  }
})

test('aborts malformed legacy migration without partially importing', () => {
  const savesDir = temporarySavesDirectory()
  fs.writeFileSync(path.join(savesDir, 'infinite_stash_vault.json'), JSON.stringify([entry(1), { vaultId: 'broken' }]))
  const repository = new VaultRepository({ savesDir })
  try {
    assert.throws(() => repository.migrateLegacyJson(), /missing itemData/)
    assert.equal(repository.list().total, 0)
  } finally {
    repository.close()
  }
})

test('supports stable pagination, filters, search, and soft withdrawal', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  try {
    for (let index = 0; index < 225; index++) await repository.add(entry(index))
    const first = repository.list({ limit: 100 })
    const second = repository.list({ limit: 100, cursor: first.nextCursor })
    const third = repository.list({ limit: 100, cursor: second.nextCursor })
    assert.equal(first.items.length, 100)
    assert.equal(second.items.length, 100)
    assert.equal(third.items.length, 25)
    assert.equal(new Set([...first.items, ...second.items, ...third.items].map((item) => item.vaultId)).size, 225)
    assert.equal(repository.list({ slot: 'Ring' }).total, 112)
    assert.equal(repository.list({ q: 'fire resist' }).total, 225)
    const retired = first.items[0]
    await repository.retire(retired.vaultId, { reason: 'withdraw' })
    assert.equal(repository.get(retired.vaultId), null)
    assert.equal(repository.get(retired.vaultId, { includeInactive: true }).status, 'withdrawn')
  } finally {
    repository.close()
  }
})

test('creates one checkpoint per repository session and appends durable journal records', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  try {
    await repository.add(entry(1))
    const firstEpoch = repository.epoch
    await repository.add(entry(2))
    assert.equal(repository.epoch.epochId, firstEpoch.epochId)
    assert.equal(fs.existsSync(firstEpoch.checkpointPath), true)
    const journal = readVaultJournal(firstEpoch.journalPath)
    assert.equal(journal.records.length, 4)
    assert.equal(journal.unresolved.length, 0)
    assert.deepEqual(journal.records.map((record) => record.phase), ['intent', 'commit', 'intent', 'commit'])
  } finally {
    repository.close()
  }
})

test('replays committed journal operations onto a checkpoint', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  let epochDirectory
  try {
    await repository.add(entry(1))
    await repository.add(entry(2))
    await repository.retire(entry(1).vaultId, { reason: 'withdraw' })
    epochDirectory = repository.epoch.directory
  } finally {
    repository.close()
  }

  const recoveredPath = path.join(savesDir, 'recovered.sqlite3')
  const result = replayVaultEpoch(epochDirectory, recoveredPath)
  assert.equal(result.applied, 3)
  assert.equal(result.unresolved, 0)
  assert.equal(result.activeCount, 1)
  const recovered = new VaultRepository({ savesDir, databasePath: recoveredPath })
  try {
    assert.equal(recovered.get(entry(1).vaultId, { includeInactive: true }).status, 'withdrawn')
    assert.equal(recovered.get(entry(2).vaultId).itemData.rawBytesHex, entry(2).itemData.rawBytesHex)
  } finally {
    recovered.close()
  }
})

test('replays an interrupted intent as recovery_needed instead of losing the item', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  let epoch
  try {
    await repository.add(entry(99))
    epoch = repository.epoch
  } finally {
    repository.close()
  }

  const lines = fs.readFileSync(epoch.journalPath, 'utf8').trimEnd().split('\n')
  fs.writeFileSync(epoch.journalPath, `${lines[0]}\n`)
  const journal = readVaultJournal(epoch.journalPath)
  assert.equal(journal.unresolved.length, 1)

  const recoveredPath = path.join(savesDir, 'interrupted-recovery.sqlite3')
  const result = replayVaultEpoch(epoch.directory, recoveredPath)
  assert.equal(result.unresolved, 1)
  const recovered = new VaultRepository({ savesDir, databasePath: recoveredPath })
  try {
    assert.equal(recovered.get(entry(99).vaultId, { includeInactive: true }).status, 'recovery_needed')
  } finally {
    recovered.close()
  }
})

test('migrates and pages a five-thousand-item vault', () => {
  const savesDir = temporarySavesDirectory()
  const entries = Array.from({ length: 5000 }, (_, index) => entry(index))
  fs.writeFileSync(path.join(savesDir, 'infinite_stash_vault.json'), JSON.stringify(entries))
  const repository = new VaultRepository({ savesDir })
  try {
    assert.equal(repository.migrateLegacyJson().count, 5000)
    const page = repository.list({ limit: 100 })
    assert.equal(page.total, 5000)
    assert.equal(page.items.length, 100)
    assert.ok(page.nextCursor)
  } finally {
    repository.close()
  }
})
test('resolves catalog type names, equipment slots, and category fallbacks', () => {
  const bill = { type: '9vo', type_name: '9vo' }
  assert.equal(resolveVaultBaseType(bill), 'Bill')
  assert.equal(getItemSlotCategory(bill), 'Weapon')
  assert.deepEqual(
    (({ typeName, slot, category }) => ({ typeName, slot, category }))(projectVaultEntry({ itemData: bill })),
    { typeName: 'Bill', slot: 'Weapon', category: 'Weapons' },
  )

  assert.equal(getItemSlotCategory({ type: 'cap', type_name: 'cap' }), 'Head')
  assert.equal(getItemSlotCategory({ type: 'rin', type_name: 'rin' }), 'Ring')
  assert.equal(getItemSlotCategory({ type: 'r01', type_name: 'r01' }), 'Rune')
  assert.equal(getItemSlotCategory({ type: 'gcv', type_name: 'gcv' }), 'Gem')
  assert.equal(resolveVaultBaseType({ type: 'zzz', type_name: 'zzz' }), 'zzz')
  assert.equal(getItemSlotCategory({ type: 'zzz', type_name: 'zzz' }), 'Misc')
})

test('checkpoints and reprojects existing schema-v1 rows exactly once', async () => {
  const savesDir = temporarySavesDirectory()
  const databasePath = path.join(savesDir, 'infinite_stash_vault.sqlite3')
  const original = entry(777, { itemData: { type: '9vo', type_name: '9vo', quality: 2, rawBytesHex: '4a4dbeef' } })
  const initial = new VaultRepository({ savesDir, databasePath })
  await initial.add(original)
  initial.db.prepare("DELETE FROM schema_migrations WHERE version = 2").run()
  initial.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(new Date().toISOString())
  initial.db.prepare("UPDATE vault_items SET type_name = '9vo', slot = '9vo', category = 'Other / Misc', search_text = '9vo'").run()
  initial.close()

  const backupsBefore = fs.readdirSync(path.join(savesDir, 'backups', 'vault')).length
  const migrated = new VaultRepository({ savesDir, databasePath })
  try {
    assert.equal(migrated.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 2)
    assert.equal(migrated.list({ slot: 'Weapon' }).total, 1)
    assert.equal(migrated.list({ category: 'Weapons' }).total, 1)
    assert.equal(migrated.list({ q: 'bill weapon weapons' }).total, 1)
    assert.deepEqual(migrated.facets(), { slots: ['Weapon'], sets: [], categories: ['Weapons'] })
    assert.equal(migrated.get(original.vaultId).itemData.type, '9vo')
    assert.equal(migrated.get(original.vaultId).itemData.type_name, '9vo')
    assert.equal(migrated.get(original.vaultId).itemData.rawBytesHex, '4a4dbeef')
    assert.equal(fs.existsSync(migrated.epoch.checkpointPath), true)
    assert.equal(fs.readdirSync(path.join(savesDir, 'backups', 'vault')).length, backupsBefore + 1)
  } finally {
    migrated.close()
  }

  const reopened = new VaultRepository({ savesDir, databasePath })
  try {
    assert.equal(reopened.epoch, null)
    assert.equal(fs.readdirSync(path.join(savesDir, 'backups', 'vault')).length, backupsBefore + 1)
  } finally {
    reopened.close()
  }
})

import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
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

test('rejects a second active entry with the same save item identity', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  const first = entry(500, { sourceSave: 'RavenClaw.d2s', itemData: { id: 424242, type: '9s8', type_name: 'Raven Claw', rawBytesHex: '4a4d4242' } })
  const duplicate = { ...first, vaultId: 'stash_duplicate', itemData: { ...first.itemData } }
  try {
    await repository.add(first)
    await assert.rejects(() => repository.add(duplicate), error => error.statusCode === 409)
    assert.equal(repository.list().total, 1)
  } finally {
    repository.close()
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
    assert.throws(() => repository.list({ cursor: 'not-a-cursor' }), /Invalid vault pagination cursor/)
    assert.throws(() => repository.list({ slot: 'Ring', cursor: first.nextCursor }), /mismatched vault pagination cursor/)
    const cursorPayload = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'))
    cursorPayload.vaultId = ''
    const emptyIdCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url')
    assert.throws(() => repository.list({ cursor: emptyIdCursor }), /mismatched vault pagination cursor/)
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

test('sorts every supported field in both directions with stable multi-page cursors and nulls last', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  const records = [
    { id: 'sort_a', dateAdded: '2026-01-02T00:00:00.000Z', name: 'alpha', type: 'Axe', rarity: 7, source: 'HeroB.d2s' },
    { id: 'sort_b', dateAdded: '2026-01-01T00:00:00.000Z', name: 'Beta', type: 'bow', rarity: 2, source: 'heroA.d2s' },
    { id: 'sort_c', dateAdded: '2026-01-02T00:00:00.000Z', name: 'Alpha', type: null, rarity: null, source: 'HeroC.d2s' },
    { id: 'sort_d', dateAdded: '2026-01-03T00:00:00.000Z', name: 'delta', type: 'Axe', rarity: 7, source: 'heroA.d2s' },
    { id: 'sort_e', dateAdded: '2026-01-01T00:00:00.000Z', name: 'echo', type: null, rarity: null, source: 'HeroD.d2s' },
    { id: 'sort_f', dateAdded: '2026-01-04T00:00:00.000Z', name: 'charlie', type: 'Claw', rarity: 5, source: 'HeroB.d2s' },
    { id: 'sort_g', dateAdded: '2026-01-04T00:00:00.000Z', name: 'golf', type: 'bow', rarity: 2, source: 'HeroE.d2s' },
  ]
  try {
    for (const [index, record] of records.entries()) {
      await repository.add(entry(900 + index, { vaultId: record.id }))
      const fold = (value) => value == null ? null : value.normalize('NFKC').toLocaleLowerCase('und')
      repository.db.prepare('UPDATE vault_items SET stashed_at = ?, display_name = ?, display_name_sort = ?, type_name = ?, type_name_sort = ?, quality = ?, source_save = ?, source_save_sort = ? WHERE vault_id = ?')
        .run(record.dateAdded, record.name, fold(record.name), record.type, fold(record.type), record.rarity, record.source, fold(record.source), record.id)
    }

    const valueFor = (record, sort) => record[sort]
    const expectedIds = (sort, direction) => [...records].sort((left, right) => {
      const leftValue = valueFor(left, sort)
      const rightValue = valueFor(right, sort)
      if (leftValue == null && rightValue != null) return 1
      if (rightValue == null && leftValue != null) return -1
      let comparison = 0
      if (leftValue != null) {
        const normalizedLeft = typeof leftValue === 'string' ? leftValue.normalize('NFKC').toLocaleLowerCase('und') : leftValue
        const normalizedRight = typeof rightValue === 'string' ? rightValue.normalize('NFKC').toLocaleLowerCase('und') : rightValue
        comparison = normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0
      }
      if (comparison === 0) comparison = left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      return direction === 'asc' ? comparison : -comparison
    }).map((record) => record.id)

    for (const sort of ['dateAdded', 'name', 'type', 'rarity', 'source']) {
      for (const direction of ['asc', 'desc']) {
        const actual = []
        let cursor = null
        do {
          const page = repository.list({ sort, direction, limit: 2, cursor })
          actual.push(...page.items.map((item) => item.vaultId))
          cursor = page.nextCursor
        } while (cursor)
        assert.deepEqual(actual, expectedIds(sort, direction), sort + ' ' + direction)
        assert.equal(new Set(actual).size, records.length)
      }
    }
  } finally {
    repository.close()
  }
})

test('binds signed cursors to filters, sort, direction, sort value, and vault id', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  try {
    for (let index = 0; index < 4; index++) await repository.add(entry(950 + index))
    const first = repository.list({ sort: 'name', direction: 'asc', q: 'ring', limit: 1 })
    const payload = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'))
    assert.equal(payload.sort, 'name')
    assert.equal(payload.direction, 'asc')
    assert.equal(payload.q, 'ring')
    assert.ok(Object.hasOwn(payload, 'sortValue'))
    assert.ok(payload.vaultId)
    assert.ok(payload.signature)

    assert.throws(() => repository.list({ sort: 'type', direction: 'asc', q: 'ring', cursor: first.nextCursor }), /mismatched/)
    assert.throws(() => repository.list({ sort: 'name', direction: 'desc', q: 'ring', cursor: first.nextCursor }), /mismatched/)
    assert.throws(() => repository.list({ sort: 'name', direction: 'asc', q: 'zod', cursor: first.nextCursor }), /mismatched/)

    payload.sortValue = 'tampered'
    const tampered = Buffer.from(JSON.stringify(payload)).toString('base64url')
    assert.throws(() => repository.list({ sort: 'name', direction: 'asc', q: 'ring', cursor: tampered }), /mismatched/)
    assert.throws(() => repository.list({ sort: 'unsupported' }), (error) => error.statusCode === 400)
    assert.throws(() => repository.list({ direction: 'sideways' }), (error) => error.statusCode === 400)
  } finally {
    repository.close()
  }
})
test('preserves missing production metadata as null and folds Unicode sort keys', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  try {
    await repository.add(entry(970, {
      vaultId: 'unicode_a',
      sourceSave: 'ÄHero.d2s',
      itemData: { type: 'rin', type_name: 'Ring', unique_name: 'Äther', quality: 7 },
    }))
    await repository.add(entry(971, {
      vaultId: 'unicode_b',
      sourceSave: 'ähero.d2s',
      itemData: { type: 'rin', type_name: 'Ring', unique_name: 'äTHER', quality: 2 },
    }))
    await repository.add(entry(972, {
      vaultId: 'missing_metadata',
      sourceSave: 'Legacy.d2s',
      itemData: {},
    }))

    const missing = repository.db.prepare('SELECT type_name, type_name_sort, quality FROM vault_items WHERE vault_id = ?').get('missing_metadata')
    assert.deepEqual(missing, { type_name: null, type_name_sort: null, quality: null })
    const unicode = repository.db.prepare('SELECT display_name_sort, source_save_sort FROM vault_items WHERE vault_id = ?').get('unicode_a')
    assert.deepEqual(unicode, { display_name_sort: 'äther', source_save_sort: 'ähero.d2s' })

    const unicodeFirst = repository.list({ sort: 'name', direction: 'asc', q: 'äther', limit: 1 })
    const unicodeSecond = repository.list({ sort: 'name', direction: 'asc', q: 'äther', limit: 1, cursor: unicodeFirst.nextCursor })
    assert.deepEqual([...unicodeFirst.items, ...unicodeSecond.items].map(({ vaultId }) => vaultId), ['unicode_a', 'unicode_b'])
    assert.equal(repository.list({ sort: 'type', direction: 'asc' }).items.at(-1).vaultId, 'missing_metadata')
    assert.equal(repository.list({ sort: 'type', direction: 'desc' }).items.at(-1).vaultId, 'missing_metadata')
    assert.equal(repository.list({ sort: 'rarity', direction: 'asc' }).items.at(-1).vaultId, 'missing_metadata')
    assert.equal(repository.list({ sort: 'rarity', direction: 'desc' }).items.at(-1).vaultId, 'missing_metadata')
  } finally {
    repository.close()
  }
})

test('persists cursor signing across repository restarts', async () => {
  const savesDir = temporarySavesDirectory()
  const databasePath = path.join(savesDir, 'infinite_stash_vault.sqlite3')
  const firstRepository = new VaultRepository({ savesDir, databasePath })
  let firstPage
  try {
    for (let index = 0; index < 3; index++) await firstRepository.add(entry(980 + index))
    firstPage = firstRepository.list({ sort: 'name', direction: 'asc', limit: 1 })
    assert.ok(firstPage.nextCursor)
  } finally {
    firstRepository.close()
  }

  const reopened = new VaultRepository({ savesDir, databasePath })
  try {
    const secondPage = reopened.list({ sort: 'name', direction: 'asc', limit: 1, cursor: firstPage.nextCursor })
    assert.equal(secondPage.items.length, 1)
    assert.notEqual(secondPage.items[0].vaultId, firstPage.items[0].vaultId)
    assert.equal(reopened.epoch, null)
  } finally {
    reopened.close()
  }
})

test('uses matching indexes without temporary sorts for every order', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  try {
    await repository.add(entry(990))
    const orders = [
      ['stashed_at ASC, vault_id ASC', 'vault_items_order'],
      ['stashed_at DESC, vault_id DESC', 'vault_items_order'],
      ['display_name_sort ASC, vault_id ASC', 'vault_items_sort_name'],
      ['display_name_sort DESC, vault_id DESC', 'vault_items_sort_name'],
      ['source_save_sort ASC, vault_id ASC', 'vault_items_sort_source'],
      ['source_save_sort DESC, vault_id DESC', 'vault_items_sort_source'],
      ['type_name_sort IS NULL ASC, type_name_sort ASC, vault_id ASC', 'vault_items_sort_type_asc'],
      ['type_name_sort IS NULL ASC, type_name_sort DESC, vault_id DESC', 'vault_items_sort_type_desc'],
      ['quality IS NULL ASC, quality ASC, vault_id ASC', 'vault_items_sort_rarity_asc'],
      ['quality IS NULL ASC, quality DESC, vault_id DESC', 'vault_items_sort_rarity_desc'],
    ]
    for (const [order, expectedIndex] of orders) {
      const details = repository.db.prepare('EXPLAIN QUERY PLAN SELECT vault_id FROM vault_items WHERE status = ? ORDER BY ' + order + ' LIMIT 100')
        .all('active').map(({ detail }) => detail).join(' | ')
      assert.doesNotMatch(details, /TEMP B-TREE/i, order)
      assert.match(details, new RegExp(expectedIndex), order)
    }
  } finally {
    repository.close()
  }
})

test('rotates the migration epoch so recovery replays onto the upgraded schema', async () => {
  const savesDir = temporarySavesDirectory()
  const databasePath = path.join(savesDir, 'infinite_stash_vault.sqlite3')
  const initial = new VaultRepository({ savesDir, databasePath })
  await initial.add(entry(995))
  initial.db.exec(`
    DELETE FROM schema_migrations;
    INSERT INTO schema_migrations(version, applied_at) VALUES (3, '2026-01-01T00:00:00.000Z');
    DELETE FROM vault_metadata WHERE key = 'cursor_hmac_secret';
    DROP INDEX IF EXISTS vault_items_sort_name;
    DROP INDEX IF EXISTS vault_items_sort_source;
    DROP INDEX IF EXISTS vault_items_sort_type_asc;
    DROP INDEX IF EXISTS vault_items_sort_type_desc;
    DROP INDEX IF EXISTS vault_items_sort_rarity_asc;
    DROP INDEX IF EXISTS vault_items_sort_rarity_desc;
    ALTER TABLE vault_items DROP COLUMN source_save_sort;
    ALTER TABLE vault_items DROP COLUMN display_name_sort;
    ALTER TABLE vault_items DROP COLUMN type_name_sort;
    CREATE INDEX vault_items_sort_date ON vault_items(status, stashed_at, vault_id);
    CREATE INDEX vault_items_sort_name ON vault_items(status, display_name, vault_id);
    CREATE INDEX vault_items_sort_type ON vault_items(status, type_name, vault_id);
    CREATE INDEX vault_items_sort_rarity ON vault_items(status, quality, vault_id);
    CREATE INDEX vault_items_sort_source ON vault_items(status, source_save, vault_id);
  `)
  initial.close()

  const migrated = new VaultRepository({ savesDir, databasePath })
  let mutationEpoch
  try {
    assert.equal(migrated.epoch, null)
    assert.equal(migrated.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 4)
    await migrated.add(entry(996))
    mutationEpoch = migrated.epoch
    assert.equal(JSON.parse(fs.readFileSync(path.join(mutationEpoch.directory, 'manifest.json'), 'utf8')).databaseSchemaVersion, 4)
  } finally {
    migrated.close()
  }

  const recoveredPath = path.join(savesDir, 'recovered-after-migration.sqlite3')
  const result = replayVaultEpoch(mutationEpoch.directory, recoveredPath)
  assert.equal(result.activeCount, 2)
  const recovered = new Database(recoveredPath, { readonly: true })
  try {
    assert.equal(recovered.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 4)
    const indexes = new Set(recovered.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name))
    assert.equal(indexes.has('vault_items_sort_type_asc'), true)
    assert.equal(indexes.has('vault_items_sort_rarity_desc'), true)
    assert.equal(recovered.prepare('SELECT display_name_sort FROM vault_items WHERE vault_id = ?').get(entry(996).vaultId).display_name_sort.length > 0, true)
  } finally {
    recovered.close()
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

test('replays historical checkpoints that predate persisted sort columns', async () => {
  const savesDir = temporarySavesDirectory()
  const repository = new VaultRepository({ savesDir })
  let epoch
  try {
    await repository.add(entry(997))
    epoch = repository.epoch
  } finally {
    repository.close()
  }

  const checkpoint = new Database(epoch.checkpointPath)
  try {
    checkpoint.exec(`
      DROP INDEX IF EXISTS vault_items_sort_name;
      DROP INDEX IF EXISTS vault_items_sort_source;
      DROP INDEX IF EXISTS vault_items_sort_type_asc;
      DROP INDEX IF EXISTS vault_items_sort_type_desc;
      DROP INDEX IF EXISTS vault_items_sort_rarity_asc;
      DROP INDEX IF EXISTS vault_items_sort_rarity_desc;
      ALTER TABLE vault_items DROP COLUMN source_save_sort;
      ALTER TABLE vault_items DROP COLUMN display_name_sort;
      ALTER TABLE vault_items DROP COLUMN type_name_sort;
      DELETE FROM schema_migrations;
      INSERT INTO schema_migrations(version, applied_at) VALUES (3, '2026-01-01T00:00:00.000Z');
    `)
  } finally {
    checkpoint.close()
  }

  const recoveredPath = path.join(savesDir, 'recovered-historical.sqlite3')
  const result = replayVaultEpoch(epoch.directory, recoveredPath)
  assert.equal(result.activeCount, 1)
  const recovered = new Database(recoveredPath, { readonly: true })
  try {
    assert.equal(recovered.prepare('SELECT COUNT(*) AS count FROM vault_items WHERE vault_id = ?').get(entry(997).vaultId).count, 1)
    assert.equal(recovered.pragma('table_info(vault_items)').some(({ name }) => name === 'display_name_sort'), false)
  } finally {
    recovered.close()
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
  initial.db.prepare('DELETE FROM schema_migrations').run()
  initial.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)").run(new Date().toISOString())
  initial.db.prepare("UPDATE vault_items SET type_name = '9vo', slot = '9vo', category = 'Other / Misc', search_text = '9vo'").run()
  initial.close()

  const backupsBefore = fs.readdirSync(path.join(savesDir, 'backups', 'vault')).length
  const migrated = new VaultRepository({ savesDir, databasePath })
  try {
    assert.equal(migrated.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 4)
    const indexes = new Set(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name))
    for (const name of ['vault_items_sort_name', 'vault_items_sort_source', 'vault_items_sort_type_asc', 'vault_items_sort_type_desc', 'vault_items_sort_rarity_asc', 'vault_items_sort_rarity_desc']) {
      assert.equal(indexes.has(name), true)
    }
    assert.equal(indexes.has('vault_items_sort_date'), false)
    assert.equal(migrated.list({ slot: 'Weapon' }).total, 1)
    assert.equal(migrated.list({ category: 'Weapons' }).total, 1)
    assert.equal(migrated.list({ q: 'bill weapon weapons' }).total, 1)
    assert.deepEqual(migrated.facets(), { slots: ['Weapon'], sets: [], categories: ['Weapons'] })
    assert.equal(migrated.get(original.vaultId).itemData.type, '9vo')
    assert.equal(migrated.get(original.vaultId).itemData.type_name, '9vo')
    assert.equal(migrated.get(original.vaultId).itemData.rawBytesHex, '4a4dbeef')
    assert.equal(migrated.epoch, null)
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

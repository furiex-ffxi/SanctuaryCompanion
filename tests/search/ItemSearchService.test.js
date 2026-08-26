import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getItemQueryMatch, ItemSearchService, matchesItemQuery } from '../../server/search/ItemSearchService.js'
import { VaultRepository } from '../../server/vault/VaultRepository.js'
import { projectVaultEntry } from '../../server/vault/vaultProjection.js'

const item = (id, name, extra = {}) => ({ id, type: 'rin', type_name: name, location_id: 0, alt_position_id: 1, ...extra })
function fixture() {
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-search-'))
  for (const name of ['Alpha.d2s', 'Beta.d2s', 'Broken.d2s', 'Chosen.d2i', 'Ignored.d2i']) fs.writeFileSync(path.join(savesDir, name), name)
  const repository = new VaultRepository({ savesDir })
  let parses = 0
  const parseD2S = async file => {
    parses++
    if (path.basename(file) === 'Broken.d2s') throw Error('bad save')
    return { name: path.basename(file, '.d2s'), items: [item(42, 'Needle Ring'), item(50, 'Needle Parent', { socketed_items: [item(51, 'Needle Rune')] })], contained_items: [item(60, 'Needle Cube')], merc_items: [item(61, 'Needle Merc')], corpse_items: [item(62, 'Needle Corpse')], iron_golem_item: item(63, 'Needle Golem') }
  }
  const parseD2I = async file => ({ pages: [{ items: [item(42, path.basename(file) === 'Chosen.d2i' ? 'Needle Shared' : 'Wrong Stash')] }] })
  const service = new ItemSearchService({ savesDir, repository, parseD2S, parseD2I })
  return { savesDir, repository, service, parses: () => parses }
}

test('groups every source, preserves duplicate seeds, locations, and partial errors', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await f.repository.add({ vaultId: 'active', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(42, 'Needle Vault') })
  await f.repository.add({ vaultId: 'pending-deposit', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(43, 'Needle Deposit') })
  f.repository.db.prepare("UPDATE vault_items SET status = 'pending_deposit' WHERE vault_id = 'pending-deposit'").run()
  await f.repository.add({ vaultId: 'inactive', stashedAt: new Date().toISOString(), sourceSave: 'Beta.d2s', itemData: item(99, 'Needle Retired') })
  await f.repository.retire('inactive')
  await f.repository.markPendingWithdraw('active')
  const result = await f.service.search({ q: 'needle', sharedFile: 'Chosen.d2i', limit: 50 })
  assert.equal(result.groups.infiniteStash.total, 2)
  assert.deepEqual(new Set(result.groups.infiniteStash.results.map(row => row.vaultId)), new Set(['active', 'pending-deposit']))
  assert.equal(result.groups.sharedStash.results[0].filename, 'Chosen.d2i')
  assert.equal(result.groups.characters.results.find(row => row.itemSeed === 50).preview.socketCount, 1)
  assert.ok(result.errors.some(error => error.filename === 'Broken.d2s'))
  assert.ok(new Set(result.groups.characters.results.map(row => row.location)).isSupersetOf(new Set(['inventory', 'contained', 'mercenary', 'corpse', 'iron-golem'])))
  assert.equal(result.groups.characters.results.some(row => row.itemSeed === 51), false)
  assert.ok(result.groups.characters.results.some(row => row.itemSeed === 42) && result.groups.sharedStash.results.some(row => row.itemSeed === 42))
})

test('search paginates through all active and pending vault matches', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  const entries = Array.from({ length: 201 }, (_, index) => ({
    vaultId: `bulk-${index}`,
    stashedAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(),
    sourceSave: 'Bulk.d2s',
    itemData: item(index, 'Needle Bulk'),
  }))
  entries.push({ vaultId: 'pending-last', stashedAt: new Date(0).toISOString(), sourceSave: 'Bulk.d2s', itemData: item(999, 'Needle Pending') })
  await f.repository.importEntries(entries)
  f.repository.db.prepare("UPDATE vault_items SET status = 'pending_withdraw' WHERE vault_id = 'pending-last'").run()
  const result = await f.service.search({ q: 'needle' })
  assert.equal(result.groups.infiniteStash.total, 202)
})

test('enforces selected d2i basename, query minimum, and result cap', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await assert.rejects(() => f.service.search({ q: 'x' }), /at least 2/)
  const invalid = await f.service.search({ q: 'needle', sharedFile: '../Ignored.d2i' })
  assert.ok(invalid.errors.some(error => /basename/.test(error.error)))
  const missing = await f.service.search({ q: 'needle', sharedFile: 'Missing.d2i' })
  assert.equal(missing.groups.sharedStash.results.length, 0)
  assert.ok(missing.errors.some(error => error.filename === 'Missing.d2i'))
  const capped = await f.service.search({ q: 'needle', sharedFile: 'Chosen.d2i', limit: 1 })
  assert.equal(capped.groups.characters.results.length, 1)
})

test('deduplicates cached parses and invalidates on file metadata change', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await Promise.all([f.service.search({ q: 'needle' }), f.service.search({ q: 'needle' })])
  assert.equal(f.parses(), 3)
  fs.appendFileSync(path.join(f.savesDir, 'Alpha.d2s'), '!')
  await f.service.search({ q: 'needle' })
  assert.equal(f.parses(), 5)
})

test('SQLite search escapes wildcard characters', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await f.repository.add({ vaultId: 'literal', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(1, '100% Needle') })
  await f.repository.add({ vaultId: 'other', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(2, '100x Needle') })
  const result = await f.service.search({ q: '100%' })
  assert.deepEqual(result.groups.infiniteStash.results.map(row => row.vaultId), ['literal'])
})

test('tal matches word prefixes, labels the set piece, and ignores socket-derived stats', () => {
  const talPiece = { type: 'amu', type_name: 'Amulet', unique_name: "Tal Rasha's Adjudication", set_name: "Tal Rasha's Wrappings" }
  const crystalSword = { type: 'crs', type_name: 'Crystal Sword', displayed_combined_magic_attributes: [{ description: '+10 to Vitality' }] }
  const immortalKing = { type: 'uar', type_name: 'Immortal King Armor' }
  assert.equal(projectVaultEntry({ itemData: talPiece }).displayName, "Tal Rasha's Adjudication")
  assert.equal(matchesItemQuery(talPiece, 'tal'), true)
  assert.equal(matchesItemQuery(crystalSword, 'tal'), false)
  assert.equal(matchesItemQuery(immortalKing, 'tal'), false)
  assert.equal(projectVaultEntry({ itemData: { unique_name: "Tal Rasha's Howling Wind", set_name: "Tal Rasha's Wrappings" } }).displayName, "Tal Rasha's Guardianship")
})

test('ranks name matches above attributes and explains the matched field', () => {
  const named = { type: 'rin', type_name: 'Absorbing Ring' }
  const attributed = { type: 'rin', type_name: 'Ring', magic_attributes: [{ description: 'Absorb Fire +12' }] }
  const nameMatch = getItemQueryMatch(named, 'ab')
  const statMatch = getItemQueryMatch(attributed, 'ab')
  assert.equal(nameMatch.field, 'Name')
  assert.equal(statMatch.field, 'Stat')
  assert.equal(statMatch.text, 'Absorb Fire +12')
  assert.ok(nameMatch.rank < statMatch.rank)
})

test('applies shared filters and source scopes before ranking results', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await f.repository.add({ vaultId: 'unique-high', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(70, 'Needle Ring', { quality: 7, level_req: 80, set_name: 'Test Set' }) })
  await f.repository.add({ vaultId: 'normal-low', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(71, 'Needle Ring', { quality: 2, level_req: 10 }) })
  const filtered = await f.service.search({ q: 'needle', scope: 'infiniteStash', category: 'Set Items', slot: 'Ring', quality: '7', minLevel: '75', maxLevel: '90' })
  assert.deepEqual(filtered.groups.infiniteStash.results.map(row => row.vaultId), ['unique-high'])
  assert.equal(filtered.groups.characters.total, 0)
  assert.equal(filtered.groups.sharedStash.total, 0)
})

test('rejects invalid shared filter values', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await assert.rejects(() => f.service.search({ q: 'needle', scope: 'treasure' }), /scope/)
  await assert.rejects(() => f.service.search({ q: 'needle', quality: 'legendary' }), /quality/)
  await assert.rejects(() => f.service.search({ q: 'needle', minLevel: 90, maxLevel: 10 }), /exceed/)
})

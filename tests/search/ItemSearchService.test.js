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
    return { name: path.basename(file, '.d2s'), items: [item(42, 'Needle Ring'), item(50, 'Parent', { socketed_items: [item(51, 'Needle Rune')] })], contained_items: [item(60, 'Needle Cube')], merc_items: [item(61, 'Needle Merc')], corpse_items: [item(62, 'Needle Corpse')], iron_golem_item: item(63, 'Needle Golem') }
  }
  const parseD2I = async file => ({ pages: [{ items: [item(42, path.basename(file) === 'Chosen.d2i' ? 'Needle Shared' : 'Wrong Stash')] }] })
  const service = new ItemSearchService({ savesDir, repository, parseD2S, parseD2I })
  return { savesDir, repository, service, parses: () => parses }
}

test('groups every source, preserves duplicate seeds, locations, and partial errors', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await f.repository.add({ vaultId: 'active', stashedAt: new Date().toISOString(), sourceSave: 'Alpha.d2s', itemData: item(42, 'Needle Vault') })
  await f.repository.add({ vaultId: 'inactive', stashedAt: new Date().toISOString(), sourceSave: 'Beta.d2s', itemData: item(99, 'Needle Retired') })
  await f.repository.retire('inactive')
  const result = await f.service.search({ q: 'needle', sharedFile: 'Chosen.d2i', limit: 50 })
  assert.equal(result.groups.infiniteStash.total, 1)
  assert.equal(result.groups.sharedStash.results[0].filename, 'Chosen.d2i')
  assert.ok(result.errors.some(error => error.filename === 'Broken.d2s'))
  assert.ok(new Set(result.groups.characters.results.map(row => row.location)).isSupersetOf(new Set(['inventory', 'contained', 'mercenary', 'corpse', 'iron-golem'])))
  assert.equal(result.groups.characters.results.some(row => row.itemSeed === 51), false)
  assert.ok(result.groups.characters.results.some(row => row.itemSeed === 42) && result.groups.sharedStash.results.some(row => row.itemSeed === 42))
})

test('enforces selected d2i basename, query minimum, and result cap', async t => {
  const f = fixture(); t.after(() => { f.repository.close(); fs.rmSync(f.savesDir, { recursive: true, force: true }) })
  await assert.rejects(() => f.service.search({ q: 'x' }), /at least 2/)
  const invalid = await f.service.search({ q: 'needle', sharedFile: '../Ignored.d2i' })
  assert.ok(invalid.errors.some(error => /basename/.test(error.error)))
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

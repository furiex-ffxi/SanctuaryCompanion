import test from 'node:test'
import assert from 'node:assert/strict'
import { containsCanonicalItem, createLatestRequestGate, itemIdentityMatches, planItemSearchNavigation } from '../../src/domain/search/itemSearchNavigation.js'

test('plans character alternate-weapon and Shared Stash page navigation', () => {
  const character = planItemSearchNavigation({ sourceKind: 'character', filename: 'Hero.d2s', location: 'equipment', position: { equippedId: 11 }, navigation: { subTab: 'inventory' }, identity: { itemSeed: 7 } })
  assert.equal(character.useAlternateWeapons, true)
  assert.equal(character.filename, 'Hero.d2s')
  const shared = planItemSearchNavigation({ sourceKind: 'sharedStash', filename: 'Chosen.d2i', pageIndex: 2, identity: { itemSeed: 8 } })
  assert.deepEqual([shared.mainTab, shared.pageIndex], ['shared_stash', 2])
})

test('plans vault focusing and canonical highlight matching', () => {
  const vault = planItemSearchNavigation({ sourceKind: 'infiniteStash', vaultId: 'vault-9', identity: { vaultId: 'vault-9' } })
  assert.equal(vault.vaultId, 'vault-9')
  assert.equal(itemIdentityMatches(vault.highlight, {}, 'vault-9'), true)
  assert.equal(itemIdentityMatches({ itemSeed: 42 }, { id: 42 }), true)
  assert.equal(itemIdentityMatches({ itemSeed: 42 }, { id: 43 }), false)
})

test('latest-request gate suppresses stale responses', () => {
  const gate = createLatestRequestGate(), first = gate.issue(), second = gate.issue()
  assert.equal(gate.isLatest(first), false)
  assert.equal(gate.isLatest(second), true)
})

test('detects stale canonical identities through nested item collections', () => {
  assert.equal(containsCanonicalItem({ items: [{ id: 1, socketed_items: [{ id: 2 }] }] }, { itemSeed: 2 }), true)
  assert.equal(containsCanonicalItem({ items: [{ id: 1 }] }, { itemSeed: 2 }), false)
})

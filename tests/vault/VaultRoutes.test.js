import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VaultRepository } from '../../server/vault/VaultRepository.js'
import { registerVaultRoutes } from '../../server/vault/vaultRoutes.js'

function entry(index) {
  return {
    vaultId: `route_${index}`,
    stashedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    sourceSave: 'RoutesTest.d2s',
    itemData: { type: 'rin', type_name: `Test Ring ${index}`, quality: 6 },
  }
}

test('vault routes paginate mutations and enforce the server process lock', async () => {
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-vault-routes-'))
  const repository = new VaultRepository({ savesDir })
  let handler
  let locked = true
  const httpServer = http.createServer((req, res) => handler(req, res, () => {
    res.writeHead(404)
    res.end()
  }))
  registerVaultRoutes({ middlewares: { use(callback) { handler = callback } }, httpServer }, {
    savesDir,
    repository,
    processCheck: () => locked,
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${httpServer.address().port}`

  try {
    const blocked = await fetch(`${origin}/__vault/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry(1)),
    })
    assert.equal(blocked.status, 423)
    assert.equal(repository.list().total, 0)
    const lockedRead = await fetch(`${origin}/__vault/count`)
    assert.equal(lockedRead.status, 200)
    assert.deepEqual(await lockedRead.json(), { total: 0 })

    locked = false
    for (let index = 1; index <= 3; index++) {
      const response = await fetch(`${origin}/__vault/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry(index)),
      })
      assert.equal(response.status, 201)
    }
    const firstPage = await fetch(`${origin}/__vault/items?limit=2`).then((response) => response.json())
    assert.equal(firstPage.total, 3)
    assert.equal(firstPage.items.length, 2)
    assert.ok(firstPage.nextCursor)
    assert.deepEqual(firstPage.items.map((item) => item.vaultId), ['route_3', 'route_2'])
    assert.ok(repository.epoch)

    const count = await fetch(`${origin}/__vault/count`).then((response) => response.json())
    assert.deepEqual(count, { total: 3 })

    const defaults = await fetch(origin + '/__vault/items').then((response) => response.json())
    assert.deepEqual(defaults.items.map((item) => item.vaultId), ['route_3', 'route_2', 'route_1'])
    const sorted = await fetch(origin + '/__vault/items?sort=name&direction=asc').then((response) => response.json())
    assert.deepEqual(sorted.items.map((item) => item.vaultId), ['route_1', 'route_2', 'route_3'])

    const invalidSort = await fetch(origin + '/__vault/items?sort=invalid_sort')
    assert.equal(invalidSort.status, 400)
    assert.match((await invalidSort.json()).error, /Unsupported vault sort/)
    const invalidDirection = await fetch(origin + '/__vault/items?direction=forward')
    assert.equal(invalidDirection.status, 400)
    assert.match((await invalidDirection.json()).error, /Unsupported vault sort direction/)
    assert.equal((await fetch(origin + '/__vault/items?sort=')).status, 400)

    const removed = await fetch(`${origin}/__vault/items/${entry(1).vaultId}?reason=withdraw`, { method: 'DELETE' })
    assert.equal(removed.status, 200)
    assert.equal(repository.get(entry(1).vaultId, { includeInactive: true }).status, 'withdrawn')
    assert.deepEqual(await fetch(`${origin}/__vault/count`).then((response) => response.json()), { total: 2 })
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
    fs.rmSync(savesDir, { recursive: true, force: true })
  }
})

test('rehydrates a legacy vault page through the worker contract and journals it once', async () => {
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-vault-rehydrate-'))
  const repository = new VaultRepository({ savesDir })
  let handler
  const httpServer = http.createServer((req, res) => handler(req, res, () => {
    res.writeHead(404)
    res.end()
  }))
  await repository.add({
    vaultId: 'legacy-ring',
    stashedAt: '2026-01-01T00:00:00.000Z',
    sourceSave: 'Legacy.d2s',
    itemData: {
      type: 'rin',
      type_name: 'Ring',
      rawBytesHex: '4a4dbeef',
      displayed_combined_magic_attributes: [{
        id: 57,
        values: [52, 52, 125],
        description: '%+d poison damage over 25 seconds',
      }],
    },
  })
  let calls = 0
  const rehydrateItem = async (item) => {
    calls++
    return {
      ...item,
      stat_display_version: 1,
      item_format: 105,
      displayed_combined_magic_attributes: [{
        id: 57,
        values: [25, 25, 5],
        description: 'Adds 25 poison damage over 5 seconds',
      }],
    }
  }
  registerVaultRoutes({ middlewares: { use(callback) { handler = callback } }, httpServer }, {
    savesDir,
    repository,
    processCheck: () => false,
    rehydrateItem,
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + httpServer.address().port

  try {
    const first = await fetch(origin + '/__vault/items').then((response) => response.json())
    assert.equal(first.items[0].itemData.displayed_combined_magic_attributes[0].description, '%+d poison damage over 25 seconds')
    for (let attempt = 0; attempt < 50 && calls === 0; attempt++) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(repository.get('legacy-ring').itemData.stat_display_version, 1)
    assert.equal(calls, 1)

    await fetch(origin + '/__vault/items').then((response) => response.json())
    assert.equal(calls, 1)
    const journal = fs.readFileSync(repository.epoch.journalPath, 'utf8')
    assert.match(journal, /"operation":"metadata_update"/)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
    fs.rmSync(savesDir, { recursive: true, force: true })
  }
})

test('aborts a legacy import before SQLite mutation when worker rehydration fails', async () => {
  const savesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctuary-vault-import-rehydrate-'))
  const repository = new VaultRepository({ savesDir })
  let handler
  const httpServer = http.createServer((req, res) => handler(req, res, () => {
    res.writeHead(404)
    res.end()
  }))
  registerVaultRoutes({ middlewares: { use(callback) { handler = callback } }, httpServer }, {
    savesDir,
    repository,
    processCheck: () => false,
    rehydrateItem: async () => { throw new Error('invalid raw item') },
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + httpServer.address().port

  try {
    const response = await fetch(origin + '/__vault/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        vaultId: 'bad-import',
        itemData: { type: 'rin', rawBytesHex: 'bad0' },
      }]),
    })
    assert.equal(response.status, 500)
    assert.match((await response.json()).error, /invalid raw item/)
    assert.equal(repository.list().total, 0)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
    fs.rmSync(savesDir, { recursive: true, force: true })
  }
})

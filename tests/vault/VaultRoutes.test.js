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

    const defaults = await fetch(origin + '/__vault/items').then((response) => response.json())
    assert.deepEqual(defaults.items.map((item) => item.vaultId), ['route_3', 'route_2', 'route_1'])
    const sorted = await fetch(origin + '/__vault/items?sort=name&direction=asc').then((response) => response.json())
    assert.deepEqual(sorted.items.map((item) => item.vaultId), ['route_1', 'route_2', 'route_3'])

    const invalidSort = await fetch(origin + '/__vault/items?sort=level')
    assert.equal(invalidSort.status, 400)
    assert.match((await invalidSort.json()).error, /Unsupported vault sort/)
    const invalidDirection = await fetch(origin + '/__vault/items?direction=forward')
    assert.equal(invalidDirection.status, 400)
    assert.match((await invalidDirection.json()).error, /Unsupported vault sort direction/)
    assert.equal((await fetch(origin + '/__vault/items?sort=')).status, 400)

    const removed = await fetch(`${origin}/__vault/items/${entry(1).vaultId}?reason=withdraw`, { method: 'DELETE' })
    assert.equal(removed.status, 200)
    assert.equal(repository.get(entry(1).vaultId, { includeInactive: true }).status, 'withdrawn')
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
    fs.rmSync(savesDir, { recursive: true, force: true })
  }
})

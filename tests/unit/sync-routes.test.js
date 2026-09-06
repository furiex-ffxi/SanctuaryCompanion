import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { registerSyncRoutes } from '../../server/sync/syncRoutes.js'

function createTempDir(prefix = 'sync-routes-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

// Minimal mock server simulating Vite Connect middlewares
class MockServer {
  constructor() {
    this.routes = []
    this.middlewares = {
      use: (prefixOrFn, fn) => {
        if (typeof prefixOrFn === 'function') {
          this.routes.push({ prefix: null, handler: prefixOrFn })
        } else {
          this.routes.push({ prefix: prefixOrFn, handler: fn })
        }
      },
    }
  }

  async dispatch(method, url, body = null) {
    let statusCode = 200
    const headers = {}
    const chunks = []

    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.headers = {}

    const res = {
      writeHead(code, h = {}) {
        statusCode = code
        Object.assign(headers, h)
      },
      end(data) {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
      },
    }

    if (body !== null && (method === 'POST' || method === 'PUT')) {
      setImmediate(() => {
        req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body))
        req.emit('end')
      })
    } else {
      setImmediate(() => {
        req.emit('end')
      })
    }

    for (const route of this.routes) {
      if (!route.prefix) {
        let nextCalled = false
        await route.handler(req, res, () => { nextCalled = true })
        if (!nextCalled) break
      } else if (url === route.prefix || url.startsWith(route.prefix)) {
        // Strip prefix for mounted middleware per Connect semantics
        req.url = url.slice(route.prefix.length)
        const match = url.match(/\?.*$/)
        if (match && !req.url.includes('?')) req.url += match[0]
        await route.handler(req, res)
        break
      }
    }

    return {
      status: statusCode,
      headers,
      body: Buffer.concat(chunks).toString('utf8'),
      buffer: Buffer.concat(chunks),
    }
  }
}

test('registerSyncRoutes host endpoints: manifest, download, upload with backup', async (t) => {
  const tempDir = createTempDir('host-routes-')
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const saveFile = path.join(tempDir, 'TestChar.d2s')
  fs.writeFileSync(saveFile, Buffer.from('save-char-initial-bytes'))

  const server = new MockServer()
  registerSyncRoutes(server, {
    savesDir: tempDir,
    config: { isClient: false, isHost: true, machineId: 'host-pc' },
  })

  // 1. GET /__sync/manifest
  const manifestRes = await server.dispatch('GET', '/__sync/manifest')
  assert.equal(manifestRes.status, 200)
  const manifest = JSON.parse(manifestRes.body)
  assert.equal(manifest.machineId, 'host-pc')
  assert.equal(manifest.files.length, 1)
  assert.equal(manifest.files[0].filename, 'TestChar.d2s')
  assert.ok(manifest.files[0].hash)

  // 2. GET /__sync/files/TestChar.d2s
  const downloadRes = await server.dispatch('GET', '/__sync/files/TestChar.d2s')
  assert.equal(downloadRes.status, 200)
  assert.equal(downloadRes.body, 'save-char-initial-bytes')
  assert.ok(downloadRes.headers['X-File-Hash'])

  // 3. Security check: Reject path traversal
  const hackRes = await server.dispatch('GET', '/__sync/files/..%2Fsecret.txt')
  assert.equal(hackRes.status, 400)

  // 4. PUT /__sync/files/TestChar.d2s updates file and creates backup
  const uploadRes = await server.dispatch('PUT', '/__sync/files/TestChar.d2s', 'save-char-updated-v2')
  assert.equal(uploadRes.status, 200)
  assert.equal(fs.readFileSync(saveFile, 'utf8'), 'save-char-updated-v2')

  // Verify backup
  const backupsDir = path.join(tempDir, 'backups')
  assert.ok(fs.existsSync(backupsDir))
  const backupFolders = fs.readdirSync(backupsDir)
  assert.ok(backupFolders.some((f) => f.startsWith('pre-sync-receive-')))
  const backupFolder = backupFolders.find((f) => f.startsWith('pre-sync-receive-'))
  const backedUpFile = path.join(backupsDir, backupFolder, 'TestChar.d2s')
  assert.equal(fs.readFileSync(backedUpFile, 'utf8'), 'save-char-initial-bytes')
})

test('registerSyncRoutes status endpoint behaves correctly for host and client', async (t) => {
  const tempDir = createTempDir('status-routes-')
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  // Host mode
  const hostServer = new MockServer()
  registerSyncRoutes(hostServer, {
    savesDir: tempDir,
    config: { isClient: false, isHost: true, machineId: 'host-pc' },
  })

  const hostStatus = await hostServer.dispatch('GET', '/__sync/status')
  assert.equal(hostStatus.status, 200)
  assert.deepEqual(JSON.parse(hostStatus.body), {
    isClient: false,
    isHost: true,
    machineId: 'host-pc',
  })

  // Client mode
  const clientServer = new MockServer()
  const mockSyncService = {
    ping: async () => ({ connected: true, hostMachineId: 'host-pc', fileCount: 2 }),
  }
  registerSyncRoutes(clientServer, {
    savesDir: tempDir,
    config: { isClient: true, isHost: false, syncUrl: 'http://192.168.1.50:5173', machineId: 'laptop' },
    syncService: mockSyncService,
  })

  const clientStatus = await clientServer.dispatch('GET', '/__sync/status')
  assert.equal(clientStatus.status, 200)
  const clientBody = JSON.parse(clientStatus.body)
  assert.equal(clientBody.isClient, true)
  assert.equal(clientBody.syncUrl, 'http://192.168.1.50:5173')
  assert.equal(clientBody.host.connected, true)
})

test('registerSyncRoutes preview and selective sync endpoints for client', async (t) => {
  const tempDir = createTempDir('client-routes-')
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  let previewCalled = false
  let syncArg = null

  const mockSyncService = {
    ping: async () => ({ connected: true }),
    previewSync: async () => {
      previewCalled = true
      return {
        hostMachineId: 'remote-host',
        summary: { total: 1, toPush: 1, toPull: 0 },
        files: [{ filename: 'Hero.d2s', action: 'push' }],
      }
    },
    sync: async (arg) => {
      syncArg = arg
      return { pushed: arg?.selectedFiles || ['Hero.d2s'], pulled: [], conflicts: [], errors: [] }
    },
  }

  const clientServer = new MockServer()
  registerSyncRoutes(clientServer, {
    savesDir: tempDir,
    config: { isClient: true, isHost: false, syncUrl: 'http://remote-host:5173', machineId: 'laptop' },
    syncService: mockSyncService,
  })

  // 1. GET /__sync/preview
  const prevRes = await clientServer.dispatch('GET', '/__sync/preview')
  assert.equal(prevRes.status, 200)
  assert.equal(previewCalled, true)
  const prevData = JSON.parse(prevRes.body)
  assert.equal(prevData.summary.toPush, 1)

  // 2. POST /__sync/now with selectedFiles
  const syncRes = await clientServer.dispatch(
    'POST',
    '/__sync/now',
    JSON.stringify({ selectedFiles: ['Hero.d2s'] })
  )
  assert.equal(syncRes.status, 200)
  assert.deepEqual(syncArg, { selectedFiles: ['Hero.d2s'] })
  const syncData = JSON.parse(syncRes.body)
  assert.deepEqual(syncData.pushed, ['Hero.d2s'])
})


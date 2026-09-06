import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { SyncService, hashFile } from '../../server/sync/SyncService.js'

function createTempDir(prefix = 'sanctuary-sync-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('scanLocal identifies .d2s and .d2i files and ignores other files', async (t) => {
  const tempDir = createTempDir()
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  fs.writeFileSync(path.join(tempDir, 'Sorceress.d2s'), Buffer.from('d2s-sorc-data'))
  fs.writeFileSync(path.join(tempDir, 'SharedStashSoftCoreV2.d2i'), Buffer.from('d2i-stash-data'))
  fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'ignore me')
  fs.writeFileSync(path.join(tempDir, 'infinite_stash_vault.sqlite3'), 'vault db')

  const service = new SyncService({
    savesDir: tempDir,
    syncUrl: 'http://localhost:5173',
    machineId: 'test-client',
    isRunningCheck: () => false,
  })

  const localFiles = await service.scanLocal()
  assert.equal(localFiles.length, 2)
  const names = localFiles.map((f) => f.filename).sort()
  assert.deepEqual(names, ['SharedStashSoftCoreV2.d2i', 'Sorceress.d2s'])

  const sorc = localFiles.find((f) => f.filename === 'Sorceress.d2s')
  assert.equal(sorc.sizeBytes, Buffer.from('d2s-sorc-data').length)
  assert.ok(typeof sorc.hash === 'string' && sorc.hash.length === 64)
})

test('sync throws an error when D2R is running locally', async (t) => {
  const tempDir = createTempDir()
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const service = new SyncService({
    savesDir: tempDir,
    syncUrl: 'http://localhost:5173',
    machineId: 'test-client',
    isRunningCheck: () => true, // D2R running!
  })

  await assert.rejects(
    () => service.sync(),
    /D2R is running on this machine/
  )
})

test('sync correctly handles inSync, push, pull, and backup operations', async (t) => {
  const clientDir = createTempDir('sync-client-')
  const hostDir = createTempDir('sync-host-')
  t.after(() => {
    fs.rmSync(clientDir, { recursive: true, force: true })
    fs.rmSync(hostDir, { recursive: true, force: true })
  })

  // 1. Identical file on both (inSync)
  const sharedContent = Buffer.from('identical-barbarian-data')
  fs.writeFileSync(path.join(clientDir, 'Barb.d2s'), sharedContent)
  fs.writeFileSync(path.join(hostDir, 'Barb.d2s'), sharedContent)

  // 2. Client has newer Paladin.d2s (push)
  const oldHostPaladin = Buffer.from('paladin-v1-host')
  const newClientPaladin = Buffer.from('paladin-v2-client-newer')
  fs.writeFileSync(path.join(hostDir, 'Paladin.d2s'), oldHostPaladin)
  fs.writeFileSync(path.join(clientDir, 'Paladin.d2s'), newClientPaladin)
  // Set mtime: host = 1000 seconds ago, client = 100 seconds ago
  const now = Date.now() / 1000
  fs.utimesSync(path.join(hostDir, 'Paladin.d2s'), now - 1000, now - 1000)
  fs.utimesSync(path.join(clientDir, 'Paladin.d2s'), now - 100, now - 100)

  // 3. Host has newer Necro.d2s (pull with client backup)
  const oldClientNecro = Buffer.from('necro-v1-client')
  const newHostNecro = Buffer.from('necro-v2-host-newer')
  fs.writeFileSync(path.join(clientDir, 'Necro.d2s'), oldClientNecro)
  fs.writeFileSync(path.join(hostDir, 'Necro.d2s'), newHostNecro)
  fs.utimesSync(path.join(clientDir, 'Necro.d2s'), now - 1000, now - 1000)
  fs.utimesSync(path.join(hostDir, 'Necro.d2s'), now - 100, now - 100)

  // 4. Client-only file Amazon.d2s (push)
  fs.writeFileSync(path.join(clientDir, 'Amazon.d2s'), Buffer.from('amazon-client-only'))

  // 5. Host-only file Druid.d2s (pull)
  fs.writeFileSync(path.join(hostDir, 'Druid.d2s'), Buffer.from('druid-host-only'))

  // Mock fetch simulating host sync routes
  const mockFetch = async (url, options = {}) => {
    const urlStr = String(url)
    const method = options.method || 'GET'

    if (urlStr.endsWith('/__sync/manifest')) {
      const entries = fs.readdirSync(hostDir).filter((f) => /\.(d2s|d2i)$/i.test(f))
      const files = await Promise.all(
        entries.map(async (filename) => {
          const filePath = path.join(hostDir, filename)
          const stat = fs.statSync(filePath)
          const hash = await hashFile(filePath)
          return {
            filename,
            hash,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          }
        })
      )
      return {
        ok: true,
        status: 200,
        json: async () => ({ machineId: 'test-host', files }),
      }
    }

    if (urlStr.includes('/__sync/files/')) {
      const filename = decodeURIComponent(urlStr.split('/__sync/files/')[1])
      const filePath = path.join(hostDir, filename)

      if (method === 'GET') {
        if (!fs.existsSync(filePath)) {
          return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
        }
        const data = fs.readFileSync(filePath)
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        }
      }

      if (method === 'PUT') {
        fs.writeFileSync(filePath, options.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, filename }),
        }
      }
    }

    return { ok: false, status: 404 }
  }

  const service = new SyncService({
    savesDir: clientDir,
    syncUrl: 'http://mock-host:5173',
    machineId: 'test-client',
    isRunningCheck: () => false,
    fetchImpl: mockFetch,
  })

  const result = await service.sync()

  // barbarian was identical
  assert.deepEqual(result.inSync, ['Barb.d2s'])
  // paladin (newer) and amazon (client only) pushed
  assert.deepEqual(result.pushed.sort(), ['Amazon.d2s', 'Paladin.d2s'])
  // necro (newer) and druid (host only) pulled
  assert.deepEqual(result.pulled.sort(), ['Druid.d2s', 'Necro.d2s'])
  assert.equal(result.conflicts.length, 0)
  assert.equal(result.errors.length, 0)

  // Verify client files updated
  assert.equal(fs.readFileSync(path.join(clientDir, 'Druid.d2s'), 'utf8'), 'druid-host-only')
  assert.equal(fs.readFileSync(path.join(clientDir, 'Necro.d2s'), 'utf8'), 'necro-v2-host-newer')

  // Verify host files updated
  assert.equal(fs.readFileSync(path.join(hostDir, 'Amazon.d2s'), 'utf8'), 'amazon-client-only')
  assert.equal(fs.readFileSync(path.join(hostDir, 'Paladin.d2s'), 'utf8'), 'paladin-v2-client-newer')

  // Verify client backup was created for Necro.d2s before overwriting
  const backupsDir = path.join(clientDir, 'backups')
  assert.ok(fs.existsSync(backupsDir))
  const backupFolders = fs.readdirSync(backupsDir)
  assert.ok(backupFolders.some((folder) => folder.startsWith('pre-sync-')))
  const backupFolder = backupFolders.find((folder) => folder.startsWith('pre-sync-'))
  const backedUpNecro = path.join(backupsDir, backupFolder, 'Necro.d2s')
  assert.ok(fs.existsSync(backedUpNecro))
  assert.equal(fs.readFileSync(backedUpNecro, 'utf8'), 'necro-v1-client')
})

test('ping returns connected state and handles network failures', async () => {
  const successService = new SyncService({
    savesDir: 'any',
    syncUrl: 'http://mock-host:5173',
    machineId: 'client',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ machineId: 'host-pc', files: [{ filename: 'a.d2s' }] }),
    }),
  })

  const successPing = await successService.ping()
  assert.equal(successPing.connected, true)
  assert.equal(successPing.hostMachineId, 'host-pc')
  assert.equal(successPing.fileCount, 1)

  const failService = new SyncService({
    savesDir: 'any',
    syncUrl: 'http://mock-host:5173',
    machineId: 'client',
    fetchImpl: async () => {
      throw new Error('Connection refused')
    },
  })

  const failPing = await failService.ping()
  assert.equal(failPing.connected, false)
  assert.match(failPing.error, /Connection refused/)
})

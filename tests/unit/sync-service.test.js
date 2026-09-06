import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { SyncService, hashFile, compareFiles } from '../../server/sync/SyncService.js'
import { inspectSaveFile, clearMetadataCache } from '../../server/sync/saveMetadata.js'

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

test('compareFiles evaluates level progression and detects warnings/conflicts', () => {
  const baseTime = new Date('2026-09-06T12:00:00.000Z').getTime()

  // 1. Client character higher level
  const pushComp = compareFiles(
    {
      filename: 'Paladin.d2s',
      hash: 'hash-client',
      modifiedAt: new Date(baseTime + 1000).toISOString(),
      metadata: { type: 'character', level: 95, itemCount: 60 },
    },
    {
      filename: 'Paladin.d2s',
      hash: 'hash-host',
      modifiedAt: new Date(baseTime).toISOString(),
      metadata: { type: 'character', level: 92, itemCount: 55 },
    }
  )
  assert.equal(pushComp.action, 'push')
  assert.match(pushComp.reason, /Lvl 95 vs Lvl 92/)
  assert.equal(pushComp.warnings.length, 0)

  // 2. Host character higher level
  const pullComp = compareFiles(
    {
      filename: 'Sorc.d2s',
      hash: 'hash-client',
      modifiedAt: new Date(baseTime).toISOString(),
      metadata: { type: 'character', level: 80, itemCount: 40 },
    },
    {
      filename: 'Sorc.d2s',
      hash: 'hash-host',
      modifiedAt: new Date(baseTime + 2000).toISOString(),
      metadata: { type: 'character', level: 88, itemCount: 45 },
    }
  )
  assert.equal(pullComp.action, 'pull')
  assert.match(pullComp.reason, /Lvl 88 vs Lvl 80/)
  assert.equal(pullComp.warnings.length, 0)

  // 3. Conflict: host timestamp is newer, but client is higher level
  const conflictComp = compareFiles(
    {
      filename: 'Barb.d2s',
      hash: 'hash-client',
      modifiedAt: new Date(baseTime).toISOString(),
      metadata: { type: 'character', level: 90, itemCount: 50 },
    },
    {
      filename: 'Barb.d2s',
      hash: 'hash-host',
      modifiedAt: new Date(baseTime + 5000).toISOString(),
      metadata: { type: 'character', level: 85, itemCount: 48 },
    }
  )
  assert.equal(conflictComp.action, 'conflict')
  assert.ok(conflictComp.warnings.some((w) => w.includes('Level and timestamp conflict')))

  // 4. Warning: client newer but has fewer items
  const fewerItemsComp = compareFiles(
    {
      filename: 'Amazon.d2s',
      hash: 'hash-client',
      modifiedAt: new Date(baseTime + 1000).toISOString(),
      metadata: { type: 'character', level: 85, itemCount: 30 },
    },
    {
      filename: 'Amazon.d2s',
      hash: 'hash-host',
      modifiedAt: new Date(baseTime).toISOString(),
      metadata: { type: 'character', level: 85, itemCount: 45 },
    }
  )
  assert.equal(fewerItemsComp.action, 'push')
  assert.ok(fewerItemsComp.warnings.some((w) => w.includes('fewer items (30 vs 45)')))

  // 5. Shared stash: client newer but fewer items
  const stashComp = compareFiles(
    {
      filename: 'SharedStashSoftCoreV2.d2i',
      hash: 'stash-client',
      modifiedAt: new Date(baseTime + 3000).toISOString(),
      metadata: { type: 'shared_stash', pageCount: 7, itemCount: 180 },
    },
    {
      filename: 'SharedStashSoftCoreV2.d2i',
      hash: 'stash-host',
      modifiedAt: new Date(baseTime).toISOString(),
      metadata: { type: 'shared_stash', pageCount: 7, itemCount: 200 },
    }
  )
  assert.equal(stashComp.action, 'push')
  assert.ok(stashComp.warnings.some((w) => w.includes('fewer items (180 vs 200)')))

  // 6. In sync
  const inSyncComp = compareFiles(
    { filename: 'Shared.d2i', hash: 'same-hash', modifiedAt: new Date().toISOString() },
    { filename: 'Shared.d2i', hash: 'same-hash', modifiedAt: new Date().toISOString() }
  )
  assert.equal(inSyncComp.action, 'inSync')
})

test('previewSync aggregates comparison across local and remote manifests', async (t) => {
  const clientDir = createTempDir('preview-client-')
  t.after(() => fs.rmSync(clientDir, { recursive: true, force: true }))

  fs.writeFileSync(path.join(clientDir, 'Char1.d2s'), Buffer.from('c1-client'))
  fs.writeFileSync(path.join(clientDir, 'Char2.d2s'), Buffer.from('c2-client'))

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      machineId: 'remote-host',
      files: [
        {
          filename: 'Char1.d2s',
          hash: 'c1-remote-hash',
          sizeBytes: 100,
          modifiedAt: new Date(Date.now() - 50000).toISOString(),
          metadata: { type: 'character', level: 50, itemCount: 20 },
        },
        {
          filename: 'Char3.d2s',
          hash: 'c3-remote-hash',
          sizeBytes: 120,
          modifiedAt: new Date().toISOString(),
          metadata: { type: 'character', level: 70, itemCount: 30 },
        },
      ],
    }),
  })

  const mockOverrides = {
    parseD2S: async (filePath) => {
      if (filePath.includes('Char1')) return { level: 55, items: new Array(25) }
      if (filePath.includes('Char2')) return { level: 40, items: new Array(15) }
      return {}
    },
  }

  const service = new SyncService({
    savesDir: clientDir,
    syncUrl: 'http://mock-host:5173',
    machineId: 'local-client',
    isRunningCheck: () => false,
    fetchImpl: mockFetch,
    parserOverrides: mockOverrides,
  })

  const preview = await service.previewSync()
  assert.equal(preview.clientMachineId, 'local-client')
  assert.equal(preview.hostMachineId, 'remote-host')
  assert.equal(preview.summary.total, 3)
  assert.equal(preview.summary.toPush, 2) // Char1 (lvl 55 vs 50) + Char2 (client only)
  assert.equal(preview.summary.toPull, 1) // Char3 (host only)

  const char1 = preview.files.find((f) => f.filename === 'Char1.d2s')
  assert.equal(char1.action, 'push')
  assert.match(char1.reason, /Lvl 55 vs Lvl 50/)
})

test('sync accepts selectedFiles and only synchronizes chosen files', async (t) => {
  const clientDir = createTempDir('sync-sel-client-')
  const hostDir = createTempDir('sync-sel-host-')
  t.after(() => {
    fs.rmSync(clientDir, { recursive: true, force: true })
    fs.rmSync(hostDir, { recursive: true, force: true })
  })

  fs.writeFileSync(path.join(clientDir, 'A.d2s'), Buffer.from('client-A-newer'))
  fs.writeFileSync(path.join(hostDir, 'A.d2s'), Buffer.from('host-A-older'))
  fs.writeFileSync(path.join(clientDir, 'B.d2s'), Buffer.from('client-B-newer'))
  fs.writeFileSync(path.join(hostDir, 'B.d2s'), Buffer.from('host-B-older'))

  const now = Date.now() / 1000
  fs.utimesSync(path.join(hostDir, 'A.d2s'), now - 1000, now - 1000)
  fs.utimesSync(path.join(clientDir, 'A.d2s'), now - 10, now - 10)
  fs.utimesSync(path.join(hostDir, 'B.d2s'), now - 1000, now - 1000)
  fs.utimesSync(path.join(clientDir, 'B.d2s'), now - 10, now - 10)

  const mockFetch = async (url, options = {}) => {
    const urlStr = String(url)
    const method = options.method || 'GET'
    if (urlStr.endsWith('/__sync/manifest')) {
      return {
        ok: true,
        json: async () => ({
          machineId: 'host-pc',
          files: [
            {
              filename: 'A.d2s',
              hash: 'host-A-hash',
              sizeBytes: 12,
              modifiedAt: new Date((now - 1000) * 1000).toISOString(),
            },
            {
              filename: 'B.d2s',
              hash: 'host-B-hash',
              sizeBytes: 12,
              modifiedAt: new Date((now - 1000) * 1000).toISOString(),
            },
          ],
        }),
      }
    }
    if (urlStr.includes('/__sync/files/')) {
      const filename = decodeURIComponent(urlStr.split('/__sync/files/')[1])
      if (method === 'PUT') {
        fs.writeFileSync(path.join(hostDir, filename), options.body)
        return { ok: true, json: async () => ({ success: true, filename }) }
      }
    }
    return { ok: false, status: 404 }
  }

  const service = new SyncService({
    savesDir: clientDir,
    syncUrl: 'http://mock-host:5173',
    machineId: 'client-pc',
    isRunningCheck: () => false,
    fetchImpl: mockFetch,
  })

  // Only select A.d2s, skip B.d2s
  const result = await service.sync({ selectedFiles: ['A.d2s'] })
  assert.deepEqual(result.pushed, ['A.d2s'])

  // A.d2s was pushed to host, B.d2s was NOT pushed
  assert.equal(fs.readFileSync(path.join(hostDir, 'A.d2s'), 'utf8'), 'client-A-newer')
  assert.equal(fs.readFileSync(path.join(hostDir, 'B.d2s'), 'utf8'), 'host-B-older')
})

test('inspectSaveFile extracts metadata and caches results', async (t) => {
  clearMetadataCache()
  const tempDir = createTempDir('inspect-save-')
  t.after(() => {
    clearMetadataCache()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const d2sPath = path.join(tempDir, 'Hero.d2s')
  const d2iPath = path.join(tempDir, 'SharedStashSoftCoreV2.d2i')
  fs.writeFileSync(d2sPath, Buffer.from('dummy-hero-data'))
  fs.writeFileSync(d2iPath, Buffer.from('dummy-stash-data'))

  let parseD2SCallCount = 0
  let parseD2ICallCount = 0

  const mockOverrides = {
    parseD2S: async () => {
      parseD2SCallCount++
      return {
        name: 'Hero',
        class: 'Paladin',
        level: 89,
        items: [1, 2, 3],
        contained_items: [4],
        merc_items: [5],
        corpse_items: [],
        attributes: { gold: 50000, stashed_gold: 150000 },
      }
    },
    parseD2I: async () => {
      parseD2ICallCount++
      return {
        pages: [
          { items: [1, 2] },
          { items: [3, 4, 5] },
        ],
      }
    },
  }

  const d2sMeta1 = await inspectSaveFile(d2sPath, mockOverrides)
  assert.equal(d2sMeta1.type, 'character')
  assert.equal(d2sMeta1.level, 89)
  assert.equal(d2sMeta1.itemCount, 5)
  assert.equal(d2sMeta1.gold, 200000)
  assert.equal(parseD2SCallCount, 1)

  // Second call with unchanged file must hit cache
  const d2sMeta2 = await inspectSaveFile(d2sPath, mockOverrides)
  assert.equal(parseD2SCallCount, 1)
  assert.deepEqual(d2sMeta1, d2sMeta2)

  const d2iMeta = await inspectSaveFile(d2iPath, mockOverrides)
  assert.equal(d2iMeta.type, 'shared_stash')
  assert.equal(d2iMeta.pageCount, 2)
  assert.equal(d2iMeta.itemCount, 5)
  assert.equal(parseD2ICallCount, 1)
})

test('compareFiles flags conflict when corrupt save attempts to overwrite valid save', () => {
  const baseTime = new Date('2026-09-06T12:00:00.000Z').getTime()

  // 1. Client save is corrupt, host save is valid
  const corruptClient = compareFiles(
    {
      filename: 'Sorceress.d2s',
      hash: 'corrupt-hash',
      modifiedAt: new Date(baseTime + 10000).toISOString(),
      sizeBytes: 500,
      metadata: { error: 'D2RStashWorker parse_save failed' },
    },
    {
      filename: 'Sorceress.d2s',
      hash: 'valid-host-hash',
      modifiedAt: new Date(baseTime).toISOString(),
      sizeBytes: 4200,
      metadata: { type: 'character', level: 85, itemCount: 40 },
    }
  )
  assert.equal(corruptClient.action, 'conflict')
  assert.match(corruptClient.reason, /Corrupted client save/)

  // 2. Host save is corrupt, client save is valid
  const corruptHost = compareFiles(
    {
      filename: 'Paladin.d2s',
      hash: 'valid-client-hash',
      modifiedAt: new Date(baseTime).toISOString(),
      sizeBytes: 4200,
      metadata: { type: 'character', level: 90, itemCount: 50 },
    },
    {
      filename: 'Paladin.d2s',
      hash: 'corrupt-host-hash',
      modifiedAt: new Date(baseTime + 10000).toISOString(),
      sizeBytes: 200,
      metadata: { error: 'Corrupt header' },
    }
  )
  assert.equal(corruptHost.action, 'conflict')
  assert.match(corruptHost.reason, /Corrupted host save/)

  // 3. 0-byte file cannot overwrite valid file
  const zeroBytePush = compareFiles(
    {
      filename: 'Barb.d2s',
      hash: 'empty-hash',
      modifiedAt: new Date(baseTime + 10000).toISOString(),
      sizeBytes: 0,
    },
    {
      filename: 'Barb.d2s',
      hash: 'host-hash',
      modifiedAt: new Date(baseTime).toISOString(),
      sizeBytes: 3500,
    }
  )
  assert.equal(zeroBytePush.action, 'conflict')
  assert.match(zeroBytePush.reason, /0 bytes/)
})




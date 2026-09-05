import { execSync } from 'node:child_process'
import { VaultRepository } from './VaultRepository.js'
import { mapWithConcurrency, needsVaultItemRehydration, rehydrateVaultItem } from './vaultItemRehydrator.js'

const MAX_BODY_BYTES = 64 * 1024 * 1024

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
      req.destroy();
    }, 10000);

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        clearTimeout(timeout);
        reject(new Error('Request body exceeds 64 MiB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.on('end', () => {
      clearTimeout(timeout);
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON request: ${error.message}`));
      }
    });
  });
}

import { isD2RRunning } from '../processLock.js'

export function isD2Running() {
  return isD2RRunning();
}

export async function rehydrateVaultEntries(vault, entries, rehydrateItem = rehydrateVaultItem) {
  const stale = entries.filter((entry) => needsVaultItemRehydration(entry.itemData))
  if (stale.length === 0) return entries
  const parsedItems = await mapWithConcurrency(stale, (entry) => rehydrateItem(entry.itemData), 4)
  const refreshed = new Map()
  for (let index = 0; index < stale.length; index++) {
    const updated = await vault.update({ ...stale[index], itemData: parsedItems[index] })
    refreshed.set(updated.vaultId, updated)
  }
  return entries.map((entry) => refreshed.get(entry.vaultId) || entry)
}

import path from 'node:path'

export function registerVaultRoutes(server, { savesDir, repository, processCheck = isD2Running, rehydrateItem = rehydrateVaultItem } = {}) {
  const vaults = new Map()

  function getVault(url) {
    if (repository) return repository
    const realm = url.searchParams.get('realm')
    const safeRealm = (realm || 'expansion').replace(/[^a-zA-Z0-9_-]/g, '')
    const key = safeRealm === 'expansion' ? 'expansion' : safeRealm
    if (!vaults.has(key)) {
      const databasePath = key === 'expansion' 
        ? path.join(savesDir, 'infinite_stash_vault.sqlite3')
        : path.join(savesDir, `infinite_stash_vault_${key}.sqlite3`)
      const v = new VaultRepository({ savesDir, databasePath })
      if (key === 'expansion') {
        const migration = v.migrateLegacyJson()
        if (migration.migrated) console.log(`Migrated ${migration.count} Infinite Stash items to SQLite`)
      }
      vaults.set(key, v)
    }
    return vaults.get(key)
  }

  let mutationQueue = Promise.resolve()
  const rehydrationInFlight = new Set()
  const enqueue = (operation) => {
    const pending = mutationQueue.then(operation, operation)
    mutationQueue = pending.catch(() => {})
    return pending
  }
  const scheduleVaultRehydration = (vault, entries) => {
    const stale = entries.filter((entry) => (
      needsVaultItemRehydration(entry.itemData) && !rehydrationInFlight.has(entry.vaultId)
    ))
    if (!stale.length) return
    stale.forEach((entry) => rehydrationInFlight.add(entry.vaultId))
    enqueue(() => rehydrateVaultEntries(vault, stale, rehydrateItem))
      .catch((error) => console.error('Background vault item rehydration failed:', error.message))
      .finally(() => stale.forEach((entry) => rehydrationInFlight.delete(entry.vaultId)))
  }
  const requireUnlocked = () => {
    if (processCheck()) {
      const error = new Error('Diablo II Resurrected is running! Vault mutations are locked.')
      error.statusCode = 423
      throw error
    }
  }

  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/__vault/')) return next()

    try {
      const vault = getVault(url)
      
      if (req.method === 'GET' && url.pathname === '/__vault/items') {
        const result = vault.list({
          limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor'),
          q: url.searchParams.get('q'), slot: url.searchParams.get('slot'),
          category: url.searchParams.get('category'), setName: url.searchParams.get('set'),
          quality: url.searchParams.get('quality'),
          minLevel: url.searchParams.get('minLevel'),
          maxLevel: url.searchParams.get('maxLevel'),
          sort: url.searchParams.has('sort') ? url.searchParams.get('sort') : undefined,
          direction: url.searchParams.has('direction') ? url.searchParams.get('direction') : undefined,
          status: url.searchParams.get('status') || 'active'
        })
        scheduleVaultRehydration(vault, result.items)
        return sendJson(res, 200, result)
      }
      if (req.method === 'GET' && url.pathname === '/__vault/count') return sendJson(res, 200, { total: vault.count() })
      if (req.method === 'GET' && url.pathname === '/__vault/facets') return sendJson(res, 200, vault.facets())
      if (req.method === 'GET' && url.pathname === '/__vault/export') {
        const realmStr = url.searchParams.get('realm') || 'expansion'
        const filename = `sanctuary_infinite_stash_${realmStr}_${new Date().toISOString().slice(0, 10)}.json`
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${filename}"` })
        return res.end(JSON.stringify(vault.exportEntries(), null, 2))
      }
      if (req.method === 'POST' && url.pathname === '/__vault/items') {
        const entry = await readJsonBody(req)
        const item = await enqueue(async () => {
          requireUnlocked()
          if (needsVaultItemRehydration(entry.itemData)) entry.itemData = await rehydrateItem(entry.itemData)
          return vault.add(entry)
        })
        return sendJson(res, 201, { success: true, item })
      }
      if (req.method === 'PUT' && url.pathname === '/__vault/items') {
        const entry = await readJsonBody(req)
        const item = await enqueue(async () => {
          requireUnlocked()
          if (needsVaultItemRehydration(entry.itemData)) entry.itemData = await rehydrateItem(entry.itemData)
          return vault.update(entry)
        })
        if (!item) return sendJson(res, 404, { success: false, error: 'Vault item not found' })
        return sendJson(res, 200, { success: true, item })
      }
      if (req.method === 'POST' && url.pathname.match(/^\/__vault\/items\/[^/]+\/intent$/)) {
        const vaultId = decodeURIComponent(url.pathname.split('/')[3])
        const reason = url.searchParams.get('reason') || 'withdraw'
        const item = await enqueue(async () => { requireUnlocked(); return vault.markPendingWithdraw(vaultId, { reason }) })
        if (!item) return sendJson(res, 404, { success: false, error: 'Vault item not found' })
        return sendJson(res, 200, { success: true, item })
      }
      if (req.method === 'POST' && url.pathname.match(/^\/__vault\/items\/[^/]+\/recover$/)) {
        const vaultId = decodeURIComponent(url.pathname.split('/')[3])
        const item = await enqueue(async () => { requireUnlocked(); return vault.recover(vaultId) })
        if (!item) return sendJson(res, 404, { success: false, error: 'Vault item not found' })
        return sendJson(res, 200, { success: true, item })
      }
      if (req.method === 'DELETE' && url.pathname.startsWith('/__vault/items/')) {
        const vaultId = decodeURIComponent(url.pathname.slice('/__vault/items/'.length))
        const reason = url.searchParams.get('reason') === 'withdraw' ? 'withdraw' : 'delete'
        const item = await enqueue(async () => { requireUnlocked(); return vault.retire(vaultId, { reason }) })
        if (!item) return sendJson(res, 404, { success: false, error: 'Vault item not found' })
        return sendJson(res, 200, { success: true, item })
      }
      if (req.method === 'POST' && url.pathname === '/__vault/import') {
        const entries = await readJsonBody(req)
        const result = await enqueue(async () => {
          requireUnlocked()
          if (!Array.isArray(entries)) return vault.importEntries(entries)
          const normalized = await mapWithConcurrency(entries, async (entry) => (
            needsVaultItemRehydration(entry?.itemData)
              ? { ...entry, itemData: await rehydrateItem(entry.itemData) }
              : entry
          ), 4)
          return vault.importEntries(normalized)
        })
        return sendJson(res, 200, { success: true, ...result })
      }
      if (req.method === 'POST' && url.pathname === '/__vault/backup') {
        const epoch = await enqueue(() => vault.forceCheckpoint())
        return sendJson(res, 200, { success: true, epochId: epoch.epochId, directory: epoch.directory })
      }
      if (req.method === 'GET' && url.pathname === '/__vault/health') return sendJson(res, 200, { success: true, integrity: vault.integrityCheck() })
      return sendJson(res, 404, { success: false, error: 'Vault endpoint not found' })
    } catch (error) {
      const status = error.statusCode || (error.message.includes('Invalid JSON') ? 400 : 500)
      return sendJson(res, status, { success: false, error: error.message })
    }
  })

  server.httpServer?.once('close', () => {
    if (repository) repository.close()
    for (const v of vaults.values()) v.close()
  })
  
  // Return the default repository for backwards compatibility, if it exists
  if (repository) return repository
  return vaults.get('expansion') || new VaultRepository({ savesDir })
}

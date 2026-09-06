import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isD2RRunning } from '../processLock.js'
import { inspectSaveFile } from './saveMetadata.js'

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}h`
  return `${(ms / 86400_000).toFixed(1)}d`
}

export function compareFiles(local, server) {
  if (!server) {
    return {
      action: 'push',
      direction: 'push',
      reason: 'New file on client',
      warnings: [],
    }
  }

  if (!local) {
    return {
      action: 'pull',
      direction: 'pull',
      reason: 'New file on host',
      warnings: [],
    }
  }

  if (local.hash === server.hash) {
    return {
      action: 'inSync',
      direction: 'none',
      reason: 'Identical file content',
      warnings: [],
    }
  }

  const localTime = new Date(local.modifiedAt).getTime()
  const serverTime = new Date(server.modifiedAt).getTime()
  const diffMs = localTime - serverTime
  const absDiffStr = formatDuration(Math.abs(diffMs))
  const warnings = []

  if (local.metadata?.error) {
    warnings.push(`Client file parse error: ${local.metadata.error}`)
  }
  if (server.metadata?.error) {
    warnings.push(`Host file parse error: ${server.metadata.error}`)
  }

  const isD2S = local.filename.toLowerCase().endsWith('.d2s')
  const locMeta = local.metadata || {}
  const srvMeta = server.metadata || {}

  if (isD2S && typeof locMeta.level === 'number' && typeof srvMeta.level === 'number') {
    const locLvl = locMeta.level
    const srvLvl = srvMeta.level
    const locItems = locMeta.itemCount
    const srvItems = srvMeta.itemCount

    if (locLvl > srvLvl) {
      if (localTime >= serverTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
          warnings.push(`Client has fewer items (${locItems} vs ${srvItems}) despite higher level.`)
        }
        return {
          action: 'push',
          direction: 'push',
          reason: `Client character is higher level (Lvl ${locLvl} vs Lvl ${srvLvl}, +${absDiffStr})`,
          warnings,
        }
      } else {
        warnings.push('Level and timestamp conflict: host save is newer, but client character is higher level.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: `Host timestamp is newer (+${absDiffStr}) but client has higher level (Lvl ${locLvl} vs Lvl ${srvLvl})`,
          warnings,
        }
      }
    } else if (srvLvl > locLvl) {
      if (serverTime >= localTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
          warnings.push(`Host has fewer items (${srvItems} vs ${locItems}) despite higher level.`)
        }
        return {
          action: 'pull',
          direction: 'pull',
          reason: `Host character is higher level (Lvl ${srvLvl} vs Lvl ${locLvl}, +${absDiffStr})`,
          warnings,
        }
      } else {
        warnings.push('Level and timestamp conflict: client save is newer, but host character has higher level.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: `Client timestamp is newer (+${absDiffStr}) but host has higher level (Lvl ${srvLvl} vs Lvl ${locLvl})`,
          warnings,
        }
      }
    } else {
      // Same level
      if (localTime > serverTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
          warnings.push(`Client character has fewer items (${locItems} vs ${srvItems}).`)
        }
        return {
          action: 'push',
          direction: 'push',
          reason: `Client character is newer (+${absDiffStr}, Lvl ${locLvl})`,
          warnings,
        }
      } else if (serverTime > localTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
          warnings.push(`Host character has fewer items (${srvItems} vs ${locItems}).`)
        }
        return {
          action: 'pull',
          direction: 'pull',
          reason: `Host character is newer (+${absDiffStr}, Lvl ${srvLvl})`,
          warnings,
        }
      } else {
        warnings.push('Identical timestamps but different file contents.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: 'Identical timestamps with differing content',
          warnings,
        }
      }
    }
  }

  // Shared stash (.d2i) or character without level metadata
  const locItems = locMeta.itemCount
  const srvItems = srvMeta.itemCount
  const locPages = locMeta.pageCount
  const srvPages = srvMeta.pageCount

  if (localTime > serverTime) {
    if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
      warnings.push(`Client stash has fewer items (${locItems} vs ${srvItems}).`)
    }
    if (typeof locPages === 'number' && typeof srvPages === 'number' && locPages < srvPages) {
      warnings.push(`Client stash has fewer pages (${locPages} vs ${srvPages}).`)
    }
    const itemDesc = typeof locItems === 'number' ? `, ${locItems} items` : ''
    return {
      action: 'push',
      direction: 'push',
      reason: `Client file is newer (+${absDiffStr}${itemDesc})`,
      warnings,
    }
  } else if (serverTime > localTime) {
    if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
      warnings.push(`Host stash has fewer items (${srvItems} vs ${locItems}).`)
    }
    if (typeof locPages === 'number' && typeof srvPages === 'number' && srvPages < locPages) {
      warnings.push(`Host stash has fewer pages (${srvPages} vs ${locPages}).`)
    }
    const itemDesc = typeof srvItems === 'number' ? `, ${srvItems} items` : ''
    return {
      action: 'pull',
      direction: 'pull',
      reason: `Host file is newer (+${absDiffStr}${itemDesc})`,
      warnings,
    }
  } else {
    warnings.push('Identical timestamps but different file contents.')
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: 'Identical timestamps with differing content',
      warnings,
    }
  }
}

export async function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function hashFile(filePath) {
  const data = await fs.promises.readFile(filePath)
  return hashBuffer(data)
}

export class SyncService {
  constructor({
    savesDir,
    syncUrl,
    machineId,
    isRunningCheck = isD2RRunning,
    fetchImpl = globalThis.fetch,
    parserOverrides = null,
  }) {
    this.savesDir = savesDir
    this.syncUrl = syncUrl ? syncUrl.replace(/\/+$/, '') : null
    this.machineId = machineId
    this.isRunningCheck = isRunningCheck
    this.fetchImpl = fetchImpl
    this.parserOverrides = parserOverrides
  }

  async scanLocal() {
    if (!fs.existsSync(this.savesDir)) return []
    const entries = await fs.promises.readdir(this.savesDir)
    const saveFilenames = entries.filter((f) => /\.(d2s|d2i)$/i.test(f))
    const results = []

    for (const filename of saveFilenames) {
      const filePath = path.join(this.savesDir, filename)
      try {
        const stat = await fs.promises.stat(filePath)
        if (!stat.isFile()) continue
        const hash = await hashFile(filePath)
        const metadata = await inspectSaveFile(filePath, this.parserOverrides)
        results.push({
          filename,
          hash,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          metadata,
        })
      } catch (err) {
        // Skip unreadable files
        console.warn(`[sync] Failed to inspect local file ${filename}: ${err.message}`)
      }
    }
    return results
  }

  async ping() {
    if (!this.syncUrl) return { connected: false, error: 'No sync URL configured' }
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await this.fetchImpl(`${this.syncUrl}/__sync/manifest`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId))

      if (!res.ok) {
        return { connected: false, error: `Host returned HTTP ${res.status}` }
      }
      const body = await res.json()
      return {
        connected: true,
        hostMachineId: body.machineId || 'unknown',
        fileCount: Array.isArray(body.files) ? body.files.length : 0,
      }
    } catch (err) {
      return { connected: false, error: err.message }
    }
  }

  async previewSync() {
    if (!this.syncUrl) {
      throw new Error('No sync host URL configured on this client.')
    }
    const d2rRunning = this.isRunningCheck()
    const localFiles = await this.scanLocal()

    const res = await this.fetchImpl(`${this.syncUrl}/__sync/manifest`)
    if (!res.ok) {
      throw new Error(`Host returned HTTP ${res.status} when fetching manifest`)
    }
    const manifestData = await res.json()
    const serverFiles = manifestData.files || []

    const serverMap = new Map(serverFiles.map((f) => [f.filename, f]))
    const localMap = new Map(localFiles.map((f) => [f.filename, f]))
    const allFilenames = Array.from(new Set([...localMap.keys(), ...serverMap.keys()])).sort()

    const files = []
    let toPushCount = 0
    let toPullCount = 0
    let inSyncCount = 0
    let conflictsCount = 0
    let warningsCount = 0

    for (const filename of allFilenames) {
      const local = localMap.get(filename) || null
      const server = serverMap.get(filename) || null
      const comparison = compareFiles(local, server)

      if (comparison.action === 'push') toPushCount++
      else if (comparison.action === 'pull') toPullCount++
      else if (comparison.action === 'inSync') inSyncCount++
      else if (comparison.action === 'conflict') conflictsCount++

      if (comparison.warnings.length > 0) warningsCount++

      files.push({
        filename,
        type: filename.toLowerCase().endsWith('.d2i') ? 'shared_stash' : 'character',
        action: comparison.action,
        direction: comparison.direction,
        reason: comparison.reason,
        warnings: comparison.warnings,
        local,
        server,
      })
    }

    return {
      d2rRunning,
      hostMachineId: manifestData.machineId || 'unknown',
      clientMachineId: this.machineId,
      summary: {
        total: files.length,
        toPush: toPushCount,
        toPull: toPullCount,
        inSync: inSyncCount,
        conflicts: conflictsCount,
        warnings: warningsCount,
      },
      files,
      timestamp: new Date().toISOString(),
    }
  }

  async sync({ selectedFiles = null } = {}) {
    if (this.isRunningCheck()) {
      throw new Error('D2R is running on this machine. Exit the game before syncing.')
    }
    if (!this.syncUrl) {
      throw new Error('No sync host URL configured on this client.')
    }

    const preview = await this.previewSync()
    let planFiles = preview.files

    if (selectedFiles && Array.isArray(selectedFiles)) {
      const selectedSet = new Set(selectedFiles)
      planFiles = planFiles.filter((f) => selectedSet.has(f.filename))
    }

    const toPush = planFiles.filter((f) => f.action === 'push')
    const toPull = planFiles.filter((f) => f.action === 'pull')
    const conflicts = planFiles.filter((f) => f.action === 'conflict')
    const inSync = planFiles.filter((f) => f.action === 'inSync')

    // Backup before pulling into local directory
    if (toPull.length > 0) {
      const backupDir = path.join(this.savesDir, 'backups', `pre-sync-${Date.now()}`)
      await fs.promises.mkdir(backupDir, { recursive: true })
      for (const f of toPull) {
        const localPath = path.join(this.savesDir, f.filename)
        if (fs.existsSync(localPath)) {
          await fs.promises.copyFile(localPath, path.join(backupDir, f.filename))
        }
      }
    }

    // Pull newer files from host
    const pulled = []
    const errors = []

    for (const f of toPull) {
      try {
        const fileRes = await this.fetchImpl(`${this.syncUrl}/__sync/files/${encodeURIComponent(f.filename)}`)
        if (!fileRes.ok) {
          throw new Error(`HTTP ${fileRes.status} downloading ${f.filename}`)
        }
        const data = Buffer.from(await fileRes.arrayBuffer())
        const localPath = path.join(this.savesDir, f.filename)
        const tempPath = `${localPath}.sync-tmp-${crypto.randomUUID()}`

        await fs.promises.writeFile(tempPath, data)
        await fs.promises.rename(tempPath, localPath)
        pulled.push(f.filename)
      } catch (err) {
        errors.push(`Pull ${f.filename}: ${err.message}`)
      }
    }

    // Push newer files to host
    const pushed = []
    for (const f of toPush) {
      try {
        const localPath = path.join(this.savesDir, f.filename)
        const data = await fs.promises.readFile(localPath)
        const pushRes = await this.fetchImpl(`${this.syncUrl}/__sync/files/${encodeURIComponent(f.filename)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: data,
        })
        if (!pushRes.ok) {
          const body = await pushRes.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${pushRes.status}`)
        }
        pushed.push(f.filename)
      } catch (err) {
        errors.push(`Push ${f.filename}: ${err.message}`)
      }
    }

    return {
      pushed,
      pulled,
      conflicts: conflicts.map((c) => c.filename),
      inSync: inSync.map((i) => i.filename),
      errors,
      timestamp: new Date().toISOString(),
    }
  }
}

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isD2RRunning } from '../processLock.js'
import { safeSavePath } from '../savePath.js'
import { inspectSaveFile } from './saveMetadata.js'
import { compareFiles, formatDuration } from '../../src/domain/sync/compareFiles.js'

export { compareFiles, formatDuration }

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
    const saveFilenames = entries.filter((f) => {
      try {
        safeSavePath(this.savesDir, f, ['.d2s', '.d2i'])
        return true
      } catch {
        return false
      }
    })
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
        try {
          const localPath = safeSavePath(this.savesDir, f.filename, ['.d2s', '.d2i'])
          if (fs.existsSync(localPath)) {
            await fs.promises.copyFile(localPath, path.join(backupDir, f.filename))
          }
        } catch {
          // Ignore invalid path during backup
        }
      }
    }

    // Pull newer files from host
    const pulled = []
    const errors = []

    for (const f of toPull) {
      let tempPath = null
      try {
        const localPath = safeSavePath(this.savesDir, f.filename, ['.d2s', '.d2i'])
        const fileRes = await this.fetchImpl(`${this.syncUrl}/__sync/files/${encodeURIComponent(f.filename)}`)
        if (!fileRes.ok) {
          throw new Error(`HTTP ${fileRes.status} downloading ${f.filename}`)
        }
        const data = Buffer.from(await fileRes.arrayBuffer())
        if (!data || data.length === 0) {
          throw new Error(`Downloaded payload for ${f.filename} is empty`)
        }

        // Integrity verification
        const receivedHash = crypto.createHash('sha256').update(data).digest('hex')
        if (f.hash && receivedHash !== f.hash) {
          throw new Error(`Hash mismatch for ${f.filename}: expected ${f.hash}, got ${receivedHash}`)
        }

        // D2S magic header check if file is >= 100 bytes
        if (f.filename.toLowerCase().endsWith('.d2s') && data.length >= 100) {
          if (data.readUInt32LE(0) !== 0xAA55AA55) {
            throw new Error(`Invalid D2S file signature for ${f.filename}`)
          }
        }

        tempPath = `${localPath}.sync-tmp-${crypto.randomUUID()}`
        await fs.promises.writeFile(tempPath, data)
        await fs.promises.rename(tempPath, localPath)

        // Preserve modification timestamp
        if (f.modifiedAt) {
          const mtime = new Date(f.modifiedAt)
          if (!isNaN(mtime.getTime())) {
            await fs.promises.utimes(localPath, mtime, mtime).catch(() => {})
          }
        }

        pulled.push(f.filename)
      } catch (err) {
        errors.push(`Pull ${f.filename}: ${err.message}`)
      } finally {
        if (tempPath) {
          await fs.promises.unlink(tempPath).catch(() => {})
        }
      }
    }

    // Push newer files to host
    const pushed = []
    for (const f of toPush) {
      try {
        const localPath = safeSavePath(this.savesDir, f.filename, ['.d2s', '.d2i'])
        const stat = await fs.promises.stat(localPath)
        const data = await fs.promises.readFile(localPath)
        const hash = f.hash || (await hashBuffer(data))
        const pushRes = await this.fetchImpl(`${this.syncUrl}/__sync/files/${encodeURIComponent(f.filename)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Hash': hash,
            'X-File-Modified': stat.mtime.toISOString(),
          },
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

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isD2RRunning } from '../processLock.js'

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
  }) {
    this.savesDir = savesDir
    this.syncUrl = syncUrl ? syncUrl.replace(/\/+$/, '') : null
    this.machineId = machineId
    this.isRunningCheck = isRunningCheck
    this.fetchImpl = fetchImpl
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
        results.push({
          filename,
          hash,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
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

  async sync() {
    if (this.isRunningCheck()) {
      throw new Error('D2R is running on this machine. Exit the game before syncing.')
    }
    if (!this.syncUrl) {
      throw new Error('No sync host URL configured on this client.')
    }

    // 1. Scan local files
    const localFiles = await this.scanLocal()

    // 2. Fetch host manifest
    const res = await this.fetchImpl(`${this.syncUrl}/__sync/manifest`)
    if (!res.ok) {
      throw new Error(`Host returned HTTP ${res.status} when fetching manifest`)
    }
    const manifestData = await res.json()
    const serverFiles = manifestData.files || []

    // 3. Classify files
    const toPush = []
    const toPull = []
    const conflicts = []
    const inSync = []

    const serverMap = new Map(serverFiles.map((f) => [f.filename, f]))
    const localMap = new Map(localFiles.map((f) => [f.filename, f]))

    for (const local of localFiles) {
      const server = serverMap.get(local.filename)
      if (!server) {
        toPush.push(local)
        continue
      }
      if (local.hash === server.hash) {
        inSync.push(local.filename)
        continue
      }
      const localTime = new Date(local.modifiedAt).getTime()
      const serverTime = new Date(server.modifiedAt).getTime()

      if (localTime > serverTime) {
        toPush.push(local)
      } else if (serverTime > localTime) {
        toPull.push(server)
      } else {
        conflicts.push({ filename: local.filename, local, server })
      }
    }

    for (const server of serverFiles) {
      if (!localMap.has(server.filename)) {
        toPull.push(server)
      }
    }

    // 4. Backup before pulling into local directory
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

    // 5. Pull newer files from host
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

    // 6. Push newer files to host
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
      inSync,
      errors,
      timestamp: new Date().toISOString(),
    }
  }
}

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isD2RRunning } from '../processLock.js'
import { SyncService, hashFile } from './SyncService.js'
import { inspectSaveFile } from './saveMetadata.js'

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function isValidSaveFilename(filename) {
  if (!filename || typeof filename !== 'string') return false
  if (path.basename(filename) !== filename) return false
  const ext = path.extname(filename).toLowerCase()
  return ext === '.d2s' || ext === '.d2i'
}

/**
 * Register synchronization routes on the Vite dev server.
 *
 * Always available:
 *   GET  /__sync/manifest          — save file listing with hashes and game metadata
 *   GET  /__sync/files/:filename   — download a save file (.d2s / .d2i)
 *   PUT  /__sync/files/:filename   — upload a save file (backs up before overwrite)
 *   GET  /__sync/status            — returns sync client/host status and connectivity
 *
 * Client-triggered:
 *   GET  /__sync/preview           — preview file comparison, level progression, and item deltas
 *   POST /__sync/now               — runs bidirectional synchronization (optionally with selectedFiles)
 */
export function registerSyncRoutes(server, { savesDir, config, syncService = null }) {
  const service = syncService || new SyncService({
    savesDir,
    syncUrl: config.syncUrl,
    machineId: config.machineId,
  })

  // GET /__sync/status
  server.middlewares.use('/__sync/status', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }

    if (!config.isClient) {
      sendJson(res, 200, {
        isClient: false,
        isHost: config.isHost,
        machineId: config.machineId,
      })
      return
    }

    const hostPing = await service.ping()
    sendJson(res, 200, {
      isClient: true,
      isHost: false,
      syncUrl: config.syncUrl,
      machineId: config.machineId,
      host: hostPing,
    })
  })

  // GET /__sync/preview
  server.middlewares.use('/__sync/preview', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }

    if (!config.isClient) {
      sendJson(res, 400, {
        error: 'This machine is not configured as a sync client (SANCTUARY_SYNC_URL is not set).',
      })
      return
    }

    try {
      const preview = await service.previewSync()
      sendJson(res, 200, preview)
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
  })

  // POST /__sync/now
  server.middlewares.use('/__sync/now', async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }

    if (!config.isClient) {
      sendJson(res, 400, {
        success: false,
        error: 'This machine is not configured as a sync client (SANCTUARY_SYNC_URL is not set).',
      })
      return
    }

    let selectedFiles = null
    try {
      const chunks = []
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c))
        req.on('end', resolve)
        req.on('error', reject)
      })
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw) {
        const body = JSON.parse(raw)
        if (Array.isArray(body.selectedFiles)) {
          selectedFiles = body.selectedFiles
        }
      }
    } catch {
      // Ignore body parsing errors
    }

    try {
      const result = await service.sync({ selectedFiles })
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message })
    }
  })

  // GET /__sync/manifest
  server.middlewares.use('/__sync/manifest', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }

    try {
      if (!fs.existsSync(savesDir)) {
        sendJson(res, 200, { machineId: config.machineId, files: [] })
        return
      }

      const entries = await fs.promises.readdir(savesDir)
      const saveFilenames = entries.filter((f) => isValidSaveFilename(f))
      const manifest = []

      for (const filename of saveFilenames) {
        const filePath = path.join(savesDir, filename)
        try {
          const stat = await fs.promises.stat(filePath)
          if (!stat.isFile()) continue
          const hash = await hashFile(filePath)
          const metadata = await inspectSaveFile(filePath)
          manifest.push({
            filename,
            hash,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            metadata,
          })
        } catch (err) {
          console.warn(`[sync-manifest] Skipping ${filename}: ${err.message}`)
        }
      }

      sendJson(res, 200, { machineId: config.machineId, files: manifest })
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
  })

  // GET /__sync/files/:filename & PUT /__sync/files/:filename
  server.middlewares.use('/__sync/files/', async (req, res) => {
    const rawPath = req.url.replace(/^\/+/, '').split('?')[0]
    const filename = decodeURIComponent(rawPath)

    if (!isValidSaveFilename(filename)) {
      res.writeHead(400)
      res.end('Invalid save filename')
      return
    }

    const filePath = path.join(savesDir, filename)

    if (req.method === 'GET') {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404)
        res.end('File not found')
        return
      }

      try {
        const data = await fs.promises.readFile(filePath)
        const hash = crypto.createHash('sha256').update(data).digest('hex')
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-File-Hash': hash,
          'Content-Length': data.length,
        })
        res.end(data)
      } catch (err) {
        res.writeHead(500)
        res.end(err.message)
      }
      return
    }

    if (req.method === 'PUT') {
      if (isD2RRunning()) {
        sendJson(res, 423, {
          success: false,
          error: 'D2R is running on this machine — cannot overwrite save files while the game is active.',
        })
        return
      }

      try {
        const chunks = []
        await new Promise((resolve, reject) => {
          req.on('data', (c) => chunks.push(c))
          req.on('end', resolve)
          req.on('error', reject)
        })
        const data = Buffer.concat(chunks)

        // Safety backup existing file before replacing
        if (fs.existsSync(filePath)) {
          const backupDir = path.join(savesDir, 'backups', `pre-sync-receive-${Date.now()}`)
          await fs.promises.mkdir(backupDir, { recursive: true })
          await fs.promises.copyFile(filePath, path.join(backupDir, filename))
        }

        // Atomic write via temporary file
        const tempPath = path.join(savesDir, `${filename}.sync-tmp-${crypto.randomUUID()}`)
        await fs.promises.writeFile(tempPath, data)
        await fs.promises.rename(tempPath, filePath)

        const hash = crypto.createHash('sha256').update(data).digest('hex')
        sendJson(res, 200, {
          success: true,
          filename,
          hash,
          sizeBytes: data.length,
        })
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message })
      }
      return
    }

    res.writeHead(405)
    res.end('Method Not Allowed')
  })
}

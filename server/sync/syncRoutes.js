import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isD2RRunning } from '../processLock.js'
import { safeSavePath } from '../savePath.js'
import { SyncService, hashFile } from './SyncService.js'
import { inspectSaveFile } from './saveMetadata.js'

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function isValidSaveFilename(filename, savesDir = process.cwd()) {
  try {
    safeSavePath(savesDir, filename, ['.d2s', '.d2i'])
    return true
  } catch {
    return false
  }
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

  let activeAgent = null
  let activeAgentLastSeen = 0

  // POST /__sync/agent-heartbeat
  server.middlewares.use('/__sync/agent-heartbeat', async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }
    try {
      const chunks = []
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c))
        req.on('end', resolve)
        req.on('error', reject)
      })
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      const body = raw ? JSON.parse(raw) : {}
      const rawIp = req.socket.remoteAddress || ''
      const ip = rawIp.replace(/^::ffff:/, '') || '127.0.0.1'
      const port = body.agentPort || 5174

      activeAgent = {
        machineId: body.machineId || 'desktop',
        hostname: body.hostname || body.machineId || 'desktop',
        ip,
        agentPort: port,
        agentUrl: `http://${ip}:${port}`,
        d2rRunning: Boolean(body.d2rRunning),
        lastSync: body.lastSync || null,
        lastSyncTime: body.lastSyncTime || Date.now(),
      }
      activeAgentLastSeen = Date.now()
      sendJson(res, 200, { ok: true, registered: true })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message })
    }
  })

  // Proxy agent preview: GET /__sync/agent/preview
  server.middlewares.use('/__sync/agent/preview', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }
    if (!activeAgent?.agentUrl) {
      sendJson(res, 503, { error: 'No desktop agent currently connected' })
      return
    }
    try {
      const resp = await fetch(`${activeAgent.agentUrl}/preview`, { signal: AbortSignal.timeout(5000) })
      const data = await resp.json()
      sendJson(res, resp.status, data)
    } catch (err) {
      sendJson(res, 502, { error: `Desktop agent unreachable: ${err.message}` })
    }
  })

  // Proxy agent sync: POST /__sync/agent/sync
  server.middlewares.use('/__sync/agent/sync', async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }
    if (!activeAgent?.agentUrl) {
      sendJson(res, 503, { error: 'No desktop agent currently connected' })
      return
    }
    try {
      const chunks = []
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c))
        req.on('end', resolve)
        req.on('error', reject)
      })
      const resp = await fetch(`${activeAgent.agentUrl}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(15000),
      })
      const data = await resp.json()
      if (data.success && activeAgent) {
        activeAgent.lastSync = data
        activeAgent.lastSyncTime = Date.now()
      }
      sendJson(res, resp.status, data)
    } catch (err) {
      sendJson(res, 502, { error: `Desktop agent sync failed: ${err.message}` })
    }
  })

  // Proxy agent set_time: POST /__sync/agent/set_time
  server.middlewares.use('/__sync/agent/set_time', async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }
    if (!activeAgent?.agentUrl) {
      sendJson(res, 503, { error: 'No desktop agent currently connected' })
      return
    }
    try {
      const chunks = []
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c))
        req.on('end', resolve)
        req.on('error', reject)
      })
      const resp = await fetch(`${activeAgent.agentUrl}/set_time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(10000),
      })
      const data = await resp.json()
      sendJson(res, resp.status, data)
    } catch (err) {
      sendJson(res, 502, { error: `Desktop agent set_time failed: ${err.message}` })
    }
  })

  // Proxy agent repair: POST /__sync/agent/repair
  server.middlewares.use('/__sync/agent/repair', async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }
    if (!activeAgent?.agentUrl) {
      sendJson(res, 503, { error: 'No desktop agent currently connected' })
      return
    }
    try {
      const resp = await fetch(`${activeAgent.agentUrl}/repair`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      })
      const data = await resp.json()
      sendJson(res, resp.status, data)
    } catch (err) {
      sendJson(res, 502, { error: `Desktop agent repair failed: ${err.message}` })
    }
  })

  // GET /__sync/status
  server.middlewares.use('/__sync/status', async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end('Method Not Allowed')
      return
    }

    const isAgentActive = Boolean(activeAgent && (Date.now() - activeAgentLastSeen < 30_000))
    const agentPayload = isAgentActive ? { ...activeAgent, connected: true } : null

    if (!config.isClient) {
      const response = {
        isClient: false,
        isHost: config.isHost,
        machineId: config.machineId,
      }
      if (agentPayload) response.agent = agentPayload
      sendJson(res, 200, response)
      return
    }

    const hostPing = await service.ping()
    const clientResponse = {
      isClient: true,
      isHost: false,
      syncUrl: config.syncUrl,
      machineId: config.machineId,
      host: hostPing,
    }
    if (agentPayload) clientResponse.agent = agentPayload
    sendJson(res, 200, clientResponse)
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
    let resolutions = null
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
        if (body.resolutions && typeof body.resolutions === 'object') {
          resolutions = body.resolutions
        }
      }
    } catch {
      // Ignore body parsing errors
    }

    try {
      const syncArgs = { selectedFiles }
      if (resolutions) syncArgs.resolutions = resolutions
      const result = await service.sync(syncArgs)
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
      const d2rRunning = isD2RRunning()
      if (!fs.existsSync(savesDir)) {
        sendJson(res, 200, { machineId: config.machineId, d2rRunning, files: [] })
        return
      }

      const entries = await fs.promises.readdir(savesDir)
      const saveFilenames = entries.filter((f) => isValidSaveFilename(f, savesDir))
      const manifest = []

      for (const filename of saveFilenames) {
        const filePath = path.join(savesDir, filename)
        try {
          const stat = await fs.promises.stat(filePath)
          if (!stat.isFile()) continue
          const hash = await hashFile(filePath)
          const metadata = d2rRunning ? null : await inspectSaveFile(filePath)
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

      sendJson(res, 200, { machineId: config.machineId, d2rRunning, files: manifest })
    } catch (err) {
      sendJson(res, 500, { error: err.message })
    }
  })

  // GET /__sync/files/:filename & PUT /__sync/files/:filename
  server.middlewares.use('/__sync/files/', async (req, res) => {
    const rawPath = req.url.replace(/^\/+/, '').split('?')[0]
    let filename
    try {
      filename = decodeURIComponent(rawPath)
    } catch {
      sendJson(res, 400, { success: false, error: 'Invalid URI encoding' })
      return
    }

    let filePath
    try {
      filePath = safeSavePath(savesDir, filename, ['.d2s', '.d2i'])
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message })
      return
    }

    if (req.method === 'GET') {
      if (isD2RRunning()) {
        sendJson(res, 423, {
          success: false,
          error: 'D2R is running on this machine — cannot read save files during active gameplay.',
        })
        return
      }

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

      let tempPath = null
      try {
        const chunks = []
        await new Promise((resolve, reject) => {
          req.on('data', (c) => chunks.push(c))
          req.on('end', resolve)
          req.on('error', reject)
        })
        const data = Buffer.concat(chunks)

        if (!data || data.length === 0) {
          sendJson(res, 400, { success: false, error: 'Cannot upload empty save file' })
          return
        }

        // D2S magic header check if file is >= 100 bytes
        if (filename.toLowerCase().endsWith('.d2s') && data.length >= 100) {
          if (data.readUInt32LE(0) !== 0xAA55AA55) {
            sendJson(res, 400, { success: false, error: 'Invalid D2S file signature' })
            return
          }
        }

        // Verify hash if X-File-Hash header is present
        const clientHash = req.headers['x-file-hash']
        const computedHash = crypto.createHash('sha256').update(data).digest('hex')
        if (clientHash && computedHash !== clientHash) {
          sendJson(res, 400, { success: false, error: `Hash mismatch: expected ${clientHash}, got ${computedHash}` })
          return
        }

        // Safety backup existing file before replacing
        if (fs.existsSync(filePath)) {
          const backupDir = path.join(savesDir, 'backups', `pre-sync-receive-${Date.now()}`)
          await fs.promises.mkdir(backupDir, { recursive: true })
          await fs.promises.copyFile(filePath, path.join(backupDir, filename))
        }

        // Atomic write via temporary file
        tempPath = path.join(savesDir, `${filename}.sync-tmp-${crypto.randomUUID()}`)
        await fs.promises.writeFile(tempPath, data)
        await fs.promises.rename(tempPath, filePath)

        // Preserve mtime if provided
        const clientModified = req.headers['x-file-modified']
        if (clientModified) {
          const mtime = new Date(clientModified)
          if (!isNaN(mtime.getTime())) {
            await fs.promises.utimes(filePath, mtime, mtime).catch(() => {})
          }
        }

        sendJson(res, 200, {
          success: true,
          filename,
          hash: computedHash,
          sizeBytes: data.length,
        })
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message })
      } finally {
        if (tempPath) {
          await fs.promises.unlink(tempPath).catch(() => {})
        }
      }
      return
    }

    res.writeHead(405)
    res.end('Method Not Allowed')
  })
}


import http from 'node:http'
import os from 'node:os'
import { setWindowsTime as defaultSetWindowsTime } from './timeJumper.js'
import { isD2RRunning as defaultIsD2RRunning } from './processLock.js'
import { SyncService as DefaultSyncService } from './sync/SyncService.js'
import { repairFutureD2RSaveTimestamps as defaultRepairTimestamps } from './mfTimerRepair.js'
import { loadConfig } from './config.js'

function getDefaultSavesDir() {
  return loadConfig().savesDir
}

/**
 * Creates the HTTP request listener for the Desktop Agent.
 */
export function createAgentHandler({
  savesDir = getDefaultSavesDir(),
  syncUrl = process.env.SANCTUARY_SYNC_URL || 'http://dclaptop:5173',
  machineId = process.env.SANCTUARY_MACHINE_ID || os.hostname(),
  setWindowsTime = defaultSetWindowsTime,
  isD2RRunning = defaultIsD2RRunning,
  syncService = null,
  repairTimestamps = defaultRepairTimestamps,
  getState = () => ({ lastSyncResult: null, lastSyncTime: null }),
  onSyncComplete = () => {},
} = {}) {
  const activeSyncService = syncService || new DefaultSyncService({ savesDir, syncUrl, machineId })

  return async function handleAgentRequest(req, res) {
    // Enable CORS and Chrome/Edge Private Network Access
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)

    // GET /status
    if (req.method === 'GET' && (url.pathname === '/status' || url.pathname === '/')) {
      const state = getState()
      let running = false
      try {
        running = isD2RRunning()
      } catch {
        running = false
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        role: 'desktop-agent',
        hostname: os.hostname(),
        machineId,
        d2rRunning: running,
        syncUrl,
        savesDir,
        lastSync: state.lastSyncResult,
        lastSyncTime: state.lastSyncTime,
        autoSyncOnExit: true,
      }))
      return
    }

    // Read body helper
    const readJsonBody = () => new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch (err) {
          reject(new Error(`Invalid JSON: ${err.message}`))
        }
      })
      req.on('error', reject)
    })

    // POST /set_time
    if (req.method === 'POST' && url.pathname === '/set_time') {
      try {
        const { datetime, restore } = await readJsonBody()
        await setWindowsTime({ datetime, restore })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
      return
    }

    // POST /sync
    if (req.method === 'POST' && url.pathname === '/sync') {
      try {
        if (isD2RRunning()) {
          res.writeHead(423, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Cannot sync while Diablo II: Resurrected is running' }))
          return
        }
        const body = await readJsonBody().catch(() => ({}))
        const selectedFiles = Array.isArray(body?.selectedFiles) ? body.selectedFiles : null
        const result = await activeSyncService.sync({ selectedFiles })
        onSyncComplete(result)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, ...result }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
      return
    }

    // POST /repair
    if (req.method === 'POST' && url.pathname === '/repair') {
      try {
        const result = repairTimestamps({ directory: savesDir, isRunning: isD2RRunning })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, ...result }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
}

/**
 * Starts the Desktop Agent server and background D2R exit auto-sync loop.
 */
export function startDesktopAgent(options = {}) {
  const {
    port = Number(process.env.SANCTUARY_AGENT_PORT) || 5174,
    host = '127.0.0.1',
    savesDir = getDefaultSavesDir(),
    syncUrl = process.env.SANCTUARY_SYNC_URL || 'http://dclaptop:5173',
    machineId = process.env.SANCTUARY_MACHINE_ID || os.hostname(),
    pollInterval = 5000,
    isD2RRunning = defaultIsD2RRunning,
    setWindowsTime = defaultSetWindowsTime,
    SyncServiceClass = DefaultSyncService,
  } = options

  const syncService = new SyncServiceClass({ savesDir, syncUrl, machineId })

  let lastSyncResult = null
  let lastSyncTime = null
  let wasRunning = false
  let isSyncing = false

  const handler = createAgentHandler({
    savesDir,
    syncUrl,
    machineId,
    setWindowsTime,
    isD2RRunning,
    syncService,
    getState: () => ({ lastSyncResult, lastSyncTime }),
    onSyncComplete: (result) => {
      lastSyncResult = result
      lastSyncTime = Date.now()
    },
  })

  const server = http.createServer(handler)

  // Background watcher for D2R exit
  const pollTimer = setInterval(async () => {
    let currentlyRunning = false
    try {
      currentlyRunning = isD2RRunning()
    } catch {
      currentlyRunning = false
    }

    // Detect transition: running -> exited
    if (wasRunning && !currentlyRunning && !isSyncing) {
      isSyncing = true
      console.log(`[Desktop Agent] D2R exited. Automatically syncing saves with ${syncUrl}...`)
      try {
        const result = await syncService.sync()
        lastSyncResult = result
        lastSyncTime = Date.now()
        console.log(
          `[Desktop Agent] Auto-sync complete: ${result.pulled?.length || 0} pulled, ` +
          `${result.pushed?.length || 0} pushed, ${result.conflicts?.length || 0} conflicts`
        )
      } catch (err) {
        console.error(`[Desktop Agent] Auto-sync failed: ${err.message}`)
      } finally {
        isSyncing = false
      }
    }

    wasRunning = currentlyRunning
  }, pollInterval)

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`=======================================================`)
      console.log(` SanctuaryCompanion Desktop Agent`)
      console.log(`=======================================================`)
      console.log(` Listening on:  http://${host}:${port}`)
      console.log(` Syncing with:  ${syncUrl}`)
      console.log(` Saves Folder:  ${savesDir}`)
      console.log(` Auto-sync:     Enabled (triggers when D2R.exe exits)`)
      console.log(`=======================================================`)

      resolve({
        server,
        port,
        host,
        stop: () => new Promise((done) => {
          clearInterval(pollTimer)
          server.close(done)
        }),
      })
    })
    server.on('error', reject)
  })
}

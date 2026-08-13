import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'
import chokidar from 'chokidar'
import fs from 'fs'
import path from 'path'
import { registerVaultRoutes } from './server/vault/vaultRoutes.js'
import { registerItemSearchRoute } from './server/search/ItemSearchService.js'

import { constants } from './src/domain/entities/static_constant_data.js'

// Path to D2R saves directory
const SAVES_DIR = 'C:/Users/chang/Saved Games/Diablo II Resurrected'
const ITEM_ASSET_DIR = path.resolve(process.env.D2R_ITEM_ASSET_DIR || '.d2r-item-assets')

// D2SSharp owns all .d2s/.d2i parsing and writing through this thin process adapter.
const require = createRequire(import.meta.url)
const { parseD2S, parseD2I } = require('./src/domain/parsers/CustomD2Parser.cjs');

function getItemDimensions(type) {
  const t = (type || '').toLowerCase().trim()
  try {
    const itemData = constants.weapon_items[t] || constants.armor_items[t] || constants.other_items[t]
    if (itemData && itemData.iw && itemData.ih) return [itemData.iw, itemData.ih]
  } catch (err) {}
  if (t === 'cm2') return [1, 2]
  if (t === 'cm3') return [1, 3]
  if (t === 'box') return [2, 2]
  if (['qui','lea','hla','stu','rng','scl','chn','brs','spl','plt','fld','gth','full','ltp','ful','aar','6pa','voulge','scythe','poleaxe','halberd','war scythe'].includes(t)) return [2, 3]
  if (['cap','skp','hlm','fhl','ghm','crn','msk','bhm','phm'].includes(type)) return [2, 2]
  return [1, 1]
}

function d2sWatcherPlugin() {
  return {
    name: 'd2s-watcher',

    configureServer(server) {
      // Keep track of last parsed data per file so we can re-serve on reconnect
      const cache = {}

      // Proprietary D2R artwork is opt-in and served only from a local cache.
      server.middlewares.use('/__d2r_item_image', (req, res) => {
        if (!ITEM_ASSET_DIR) { res.writeHead(404); res.end(); return }
        const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '')
        if (!/^[A-Za-z0-9._@-]+\.(?:png|svg)$/.test(relative)) { res.writeHead(400); res.end('invalid item asset'); return }
        const fullPath = path.resolve(ITEM_ASSET_DIR, relative)
        if (fullPath !== ITEM_ASSET_DIR && !fullPath.startsWith(ITEM_ASSET_DIR + path.sep)) { res.writeHead(403); res.end(); return }
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'Content-Type': relative.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'Cache-Control': 'private, max-age=3600' })
        res.end(fs.readFileSync(fullPath))
      })

      const vaultRepository = registerVaultRoutes(server, { savesDir: SAVES_DIR })
      registerItemSearchRoute(server, { savesDir: SAVES_DIR, repository: vaultRepository, parseD2S, parseD2I })

      // Endpoint to check if Diablo II Resurrected process is currently running
      server.middlewares.use('/__d2r_status', (_req, res) => {
        const { exec } = require('child_process')
        exec('tasklist /FI "IMAGENAME eq D2R.exe"', (err, stdout) => {
          const isRunning = !err && stdout && stdout.toLowerCase().includes('d2r.exe')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ isRunning: Boolean(isRunning) }))
        })
      })

      // Expose an SSE-friendly HTTP endpoint so the browser can also manually
      // request a re-parse: GET /__d2s_refresh?file=<basename>
      server.middlewares.use('/__d2s_refresh', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const file = url.searchParams.get('file')
        if (!file) {
          res.writeHead(400); res.end('missing file param'); return
        }
        const fullPath = path.join(SAVES_DIR, file)
        try {
          const data = await parseD2S(fullPath)
          cache[file] = data
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err) {
          res.writeHead(500); res.end(err.message)
        }
      })

      // Expose endpoint for shared stash files: GET /__d2i_refresh?file=<basename_or_relative_path>
      server.middlewares.use('/__d2i_refresh', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        let file = url.searchParams.get('file')
        let fullPath = file ? path.join(SAVES_DIR, file) : null
        if (!fullPath || !fs.existsSync(fullPath)) {
          if (fs.existsSync(path.join(SAVES_DIR, 'ModernSharedStashSoftCoreV2.d2i'))) {
            fullPath = path.join(SAVES_DIR, 'ModernSharedStashSoftCoreV2.d2i')
          } else if (fs.existsSync(path.join(SAVES_DIR, 'SharedStashSoftCoreV2.d2i'))) {
            fullPath = path.join(SAVES_DIR, 'SharedStashSoftCoreV2.d2i')
          } else {
            const allFiles = fs.existsSync(SAVES_DIR) ? fs.readdirSync(SAVES_DIR) : []
            const foundD2i = allFiles.find(f => f.endsWith('.d2i'))
            if (foundD2i) fullPath = path.join(SAVES_DIR, foundD2i)
          }
        }
        try {
          if (!fullPath || !fs.existsSync(fullPath)) {
            res.writeHead(404); res.end(`No .d2i shared stash file found in ${SAVES_DIR}`); return
          }
          const data = await parseD2I(fullPath)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err) {
          res.writeHead(500); res.end(err.message)
        }
      })

      // Endpoint to remove item from .d2i shared stash file when depositing to Vault
      server.middlewares.use('/__d2i_remove_item', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method Not Allowed'); return
        }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('error', err => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: err.message }))
        })
        req.on('end', async () => {
          try {
            if (!body) throw new Error('Empty request body')
            const { file, item } = JSON.parse(body)
            if (!item) throw new Error('Missing item object in request body')
            
            // Enforce process locks: Check if Diablo II Resurrected is running
            const { execSync } = require('child_process')
            let isRunning = false
            try {
              const stdout = execSync('tasklist /FI "IMAGENAME eq D2R.exe"').toString()
              isRunning = stdout.toLowerCase().includes('d2r.exe')
            } catch (err) {}
            if (isRunning) {
              res.writeHead(423, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Diablo II Resurrected is running! File is locked.' }))
              return
            }

            const targetFile = file || (fs.existsSync(path.join(SAVES_DIR, 'ModernSharedStashSoftCoreV2.d2i')) ? 'ModernSharedStashSoftCoreV2.d2i' : 'SharedStashSoftCoreV2.d2i')
            const fullPath = path.isAbsolute(targetFile) ? targetFile : path.join(SAVES_DIR, targetFile)
            if (!fs.existsSync(fullPath)) throw new Error(`Shared stash file ${targetFile} not found`)

            // Write modified d2i to backup directory first
            const backupDir = path.join(SAVES_DIR, 'backups')
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true })
            }
            const tempFilePath = path.join(backupDir, `temp_${path.basename(fullPath)}`)

            // Spawn the C# D2RStashWorker executable to perform the extraction/removal
            const { execFile } = require('child_process')
            const workerPath = path.join(__dirname, 'server', 'bin', 'D2RStashWorker.exe')
            
            await new Promise((resolve, reject) => {
              execFile(workerPath, ['remove', fullPath, tempFilePath, String(item.id)], (err, stdout, stderr) => {
                if (err) {
                  reject(new Error(`Worker execution failed: ${stderr || err.message}`))
                } else {
                  resolve()
                }
              })
            })

            // Atomic rename swap
            fs.renameSync(tempFilePath, fullPath)

            // Re-parse for UI using our display parser
            const uiStash = await parseD2I(fullPath)
            
            // Reconstruct item bytes hex (rawBytesHex) from the requested item to return to Vault
            const itemBytesHex = item.rawBytesHex || ''

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, stash: uiStash, itemRemoved: true, itemBytesHex }))
          } catch (err) {
            console.error('Error in /__d2i_remove_item endpoint:', err)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })

      // Endpoint to remove item from .d2s save file when depositing to Vault
      server.middlewares.use('/__d2s_remove_item', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method Not Allowed'); return
        }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { file, item } = JSON.parse(body)
            if (!file) throw new Error('Missing file parameter')
            const fullPath = path.join(SAVES_DIR, file)
            if (!fs.existsSync(fullPath)) throw new Error(`File ${file} not found`)

            // Enforce process locks: Check if Diablo II Resurrected is running
            const { execSync } = require('child_process')
            let isRunning = false
            try {
              const stdout = execSync('tasklist /FI "IMAGENAME eq D2R.exe"').toString()
              isRunning = stdout.toLowerCase().includes('d2r.exe')
            } catch (err) {}
            if (isRunning) {
              res.writeHead(423, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Diablo II Resurrected is running! File is locked.' }))
              return
            }

            // Write modified d2s to backup directory first
            const backupDir = path.join(SAVES_DIR, 'backups')
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true })
            }
            const tempFilePath = path.join(backupDir, `temp_${path.basename(fullPath)}`)

            // Spawn the C# D2RStashWorker executable to perform the removal from .d2s
            const { execFile } = require('child_process')
            const workerPath = path.join(__dirname, 'server', 'bin', 'D2RStashWorker.exe')
            
            await new Promise((resolve, reject) => {
              execFile(workerPath, ['remove_save', fullPath, tempFilePath, String(item.id)], (err, stdout, stderr) => {
                if (err) {
                  reject(new Error(`Worker execution failed: ${stderr || err.message}`))
                } else {
                  resolve()
                }
              })
            })

            // Atomic rename swap
            fs.renameSync(tempFilePath, fullPath)

            // Re-parse for UI using Go WASM
            const char = await parseD2S(fullPath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, char }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })

      // Endpoint to add item to .d2i shared stash file when withdrawing from Infinite Stash Vault
      server.middlewares.use('/__d2i_add_item', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method Not Allowed'); return
        }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { file, item } = JSON.parse(body)
            
            // Enforce process locks: Check if Diablo II Resurrected is running
            const { execSync } = require('child_process')
            let isRunning = false
            try {
              const stdout = execSync('tasklist /FI "IMAGENAME eq D2R.exe"').toString()
              isRunning = stdout.toLowerCase().includes('d2r.exe')
            } catch (err) {}
            if (isRunning) {
              res.writeHead(423, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Diablo II Resurrected is running! File is locked.' }))
              return
            }

            const targetFile = file || (fs.existsSync(path.join(SAVES_DIR, 'ModernSharedStashSoftCoreV2.d2i')) ? 'ModernSharedStashSoftCoreV2.d2i' : 'SharedStashSoftCoreV2.d2i')
            const fullPath = path.isAbsolute(targetFile) ? targetFile : path.join(SAVES_DIR, targetFile)
            if (!fs.existsSync(fullPath)) throw new Error(`Shared stash file ${targetFile} not found`)


            const [itemW, itemH] = getItemDimensions(item.type)
            const stash = await parseD2I(fullPath)

            if (!stash || !stash.pages || stash.pages.length === 0) {
              throw new Error('No shared stash pages found')
            }

            let targetTabIdx = -1
            let placedX = -1
            let placedY = -1

            const preferredTabIdx = (item.pageIndex !== undefined && item.pageIndex !== null && item.pageIndex >= 0 && item.pageIndex < stash.pages.length)
              ? item.pageIndex
              : 0

            const searchOrder = [preferredTabIdx]
            for (let i = 0; i < stash.pages.length; i++) {
              if (i !== preferredTabIdx) searchOrder.push(i)
            }

            for (const tIdx of searchOrder) {
              const grid = Array.from({ length: 10 }, () => Array(10).fill(false))
              if (stash.pages[tIdx].items) {
                stash.pages[tIdx].items.forEach(i => {
                  const x = i.position_x ?? 0
                  const y = i.position_y ?? 0
                  const [w, h] = getItemDimensions(i.type)
                  for (let r = y; r < Math.min(10, y + h); r++) {
                    for (let c = x; c < Math.min(10, x + w); c++) {
                      grid[r][c] = true
                    }
                  }
                })
              }

              let foundSpace = false
              for (let r = 0; r <= 10 - itemH; r++) {
                for (let c = 0; c <= 10 - itemW; c++) {
                  let fits = true
                  for (let dr = 0; dr < itemH; dr++) {
                    for (let dc = 0; dc < itemW; dc++) {
                      if (grid[r + dr][c + dc]) { fits = false; break }
                    }
                    if (!fits) break
                  }
                  if (fits) {
                    placedX = c
                    placedY = r
                    targetTabIdx = tIdx
                    foundSpace = true
                    break
                  }
                }
                if (foundSpace) break
              }

              if (foundSpace) break
            }

            if (targetTabIdx === -1) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Shared Stash is full on all tabs!' }))
              return
            }

            if (!item.rawBytesHex) {
              throw new Error('Item rawBytesHex not found in stashed item.')
            }

            // Write modified d2i to backup directory first
            const backupDir = path.join(SAVES_DIR, 'backups')
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true })
            }
            const tempFilePath = path.join(backupDir, `temp_${path.basename(fullPath)}`)

            // Spawn the C# D2RStashWorker executable to perform the insertion
            const { execFile } = require('child_process')
            const workerPath = path.join(__dirname, 'server', 'bin', 'D2RStashWorker.exe')
            
            await new Promise((resolve, reject) => {
              execFile(workerPath, ['add', fullPath, tempFilePath, item.rawBytesHex, String(targetTabIdx), String(placedX), String(placedY)], (err, stdout, stderr) => {
                if (err) {
                  reject(new Error(`Worker execution failed: ${stderr || err.message}`))
                } else {
                  resolve()
                }
              })
            })

            // Atomic rename swap
            fs.renameSync(tempFilePath, fullPath)

            // Re-parse for UI using our display parser
            const uiStash = await parseD2I(fullPath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: true,
              targetTabIdx,
              placedX,
              placedY,
              stash: uiStash
            }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })

      // Endpoint to add item back to .d2s save file when withdrawing from Infinite Stash Vault
      server.middlewares.use('/__d2s_add_item', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method Not Allowed'); return
        }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { file, item } = JSON.parse(body)
            if (!file) throw new Error('Missing file parameter')
            const fullPath = path.join(SAVES_DIR, file)
            if (!fs.existsSync(fullPath)) throw new Error(`File ${file} not found`)

            const char = await parseD2S(fullPath)

            // Deep clone item & place into character Stash (location_id: 0, alt_position_id: 1)
            const newItem = JSON.parse(JSON.stringify(item))
            newItem.location_id = 0
            newItem.alt_position_id = 1 // Stash grid
            newItem.equipped_id = 0

            // Find an open space in Stash grid (10 cols x 10 rows) respecting item width/height
            const stashGrid = Array.from({ length: 10 }, () => Array(10).fill(false))
            if (char.items) {
              char.items.forEach(i => {
                if (i.location_id === 0 && i.alt_position_id === 1) {
                  const x = i.position_x ?? 0
                  const y = i.position_y ?? 0
                  const [w, h] = getItemDimensions(i.type)
                  for (let r = y; r < Math.min(10, y + h); r++) {
                    for (let c = x; c < Math.min(10, x + w); c++) {
                      stashGrid[r][c] = true
                    }
                  }
                }
              })
            }

            const [itemW, itemH] = getItemDimensions(item.type)
            let placedX = 0, placedY = 0, foundSpace = false
            for (let r = 0; r <= 10 - itemH; r++) {
              for (let c = 0; c <= 10 - itemW; c++) {
                let fits = true
                for (let dr = 0; dr < itemH; dr++) {
                  for (let dc = 0; dc < itemW; dc++) {
                    if (stashGrid[r + dr][c + dc]) {
                      fits = false
                      break
                    }
                  }
                  if (!fits) break
                }
                if (fits) {
                  placedX = c
                  placedY = r
                  foundSpace = true
                  break
                }
              }
              if (foundSpace) break
            }

            if (!foundSpace) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Stash is full! Clear some space before withdrawing.' }))
              return
            }

            if (!item.rawBytesHex) {
              throw new Error('Item rawBytesHex not found in stashed item.')
            }

            // Write modified d2s to backup directory first
            const backupDir = path.join(SAVES_DIR, 'backups')
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true })
            }
            const tempFilePath = path.join(backupDir, `temp_${path.basename(fullPath)}`)

            // Spawn the C# D2RStashWorker executable to perform the insertion into .d2s
            const { execFile } = require('child_process')
            const workerPath = path.join(__dirname, 'server', 'bin', 'D2RStashWorker.exe')
            
            await new Promise((resolve, reject) => {
              execFile(workerPath, ['add_save', fullPath, tempFilePath, item.rawBytesHex, String(placedX), String(placedY)], (err, stdout, stderr) => {
                if (err) {
                  reject(new Error(`Worker execution failed: ${stderr || err.message}`))
                } else {
                  resolve()
                }
              })
            })

            // Atomic rename swap
            fs.renameSync(tempFilePath, fullPath)

            // Re-parse for UI using Go WASM
            const updatedChar = await parseD2S(fullPath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, char: updatedChar, placedX, placedY }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })

      // Expose endpoint to trigger backup of all save files (.d2s & .d2i)
      server.middlewares.use('/__d2s_backup', async (_req, res) => {
        try {
          if (!fs.existsSync(SAVES_DIR)) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'SAVES_DIR not found' })); return
          }
          const now = new Date()
          const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
          const backupSubdir = path.join(SAVES_DIR, 'backups', timestamp)
          fs.mkdirSync(backupSubdir, { recursive: true })

          const allFiles = fs.readdirSync(SAVES_DIR)
          const saveFiles = allFiles.filter(f => f.endsWith('.d2s') || f.endsWith('.d2i'))
          const copied = []

          for (const f of saveFiles) {
            const srcPath = path.join(SAVES_DIR, f)
            const destPath = path.join(backupSubdir, f)
            fs.copyFileSync(srcPath, destPath)
            copied.push(f)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, timestamp, backupSubdir, count: copied.length, files: copied }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      // Expose endpoint to list backups
      server.middlewares.use('/__d2s_backups_list', (_req, res) => {
        try {
          const backupsDir = path.join(SAVES_DIR, 'backups')
          if (!fs.existsSync(backupsDir)) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify([]))
            return
          }
          const subdirs = fs.readdirSync(backupsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(subdirs))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      // Also expose a listing endpoint so the UI can list available saves
      server.middlewares.use('/__d2s_list', (_req, res) => {
        try {
          const files = fs.readdirSync(SAVES_DIR)
            .filter(f => f.endsWith('.d2s'))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(files))
        } catch (err) {
          res.writeHead(500); res.end(err.message)
        }
      })

      // NOTE: File watcher disabled to avoid holding file handles/locks on .d2s files
      // while Diablo II Resurrected is running and saving character state.
      // Server updates can still be manually triggered via the Refresh button.
    }
  }
}



// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), d2sWatcherPlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})

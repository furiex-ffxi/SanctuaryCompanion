#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDesktopAgent } from '../../server/desktopAgent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

// Automatically load .env if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(rootDir, '.env')
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath)
    }
  } else {
    // Fallback lightweight parser
    const envPath = path.join(rootDir, '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
    }
  }
} catch (err) {
  console.warn('[Desktop Agent] Note: Could not load .env file:', err.message)
}

// Parse command line flags
const args = process.argv.slice(2)
const options = {}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--port' && args[i + 1]) {
    options.port = Number(args[++i])
  } else if (arg === '--sync-url' && args[i + 1]) {
    options.syncUrl = args[++i]
  } else if (arg === '--saves-dir' && args[i + 1]) {
    options.savesDir = args[++i]
  } else if (arg === '--poll-interval' && args[i + 1]) {
    options.pollInterval = Number(args[++i])
  }
}

startDesktopAgent(options).then((agent) => {
  const shutdown = async () => {
    console.log('\n[Desktop Agent] Shutting down...')
    await agent.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}).catch((err) => {
  console.error('[Desktop Agent] Failed to start:', err)
  process.exit(1)
})

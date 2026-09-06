import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

/**
 * Parse simple .env file content.
 * Handles KEY=VALUE, comments (#), whitespace, and optional single/double quotes.
 */
export function parseEnvFile(content) {
  const result = {}
  if (typeof content !== 'string') return result

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) {
      let val = match[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      result[match[1]] = val
    }
  }
  return result
}

/**
 * Load machine-specific configuration from environment variables with optional .env support.
 * @param {Record<string, string> | null} [envOverrides] - Optional environment overrides for testing.
 * @param {string} [customEnvPath] - Optional path to .env file (defaults to '.env' at root).
 */
export function loadConfig(envOverrides = null, customEnvPath = null) {
  const env = { ...process.env }
  const envPath = customEnvPath ? path.resolve(customEnvPath) : path.resolve('.env')

  if (fs.existsSync(envPath)) {
    try {
      const parsed = parseEnvFile(fs.readFileSync(envPath, 'utf8'))
      for (const [key, val] of Object.entries(parsed)) {
        if (!env[key]) env[key] = val
      }
    } catch {}
  }

  if (envOverrides) {
    Object.assign(env, envOverrides)
  }

  const savesDir = env.SANCTUARY_SAVES_DIR
    || path.join(os.homedir(), 'Saved Games', 'Diablo II Resurrected')

  const syncHost = env.SANCTUARY_SYNC_HOST === 'true'
  const syncUrlRaw = env.SANCTUARY_SYNC_URL || null
  const syncUrl = syncUrlRaw ? syncUrlRaw.replace(/\/+$/, '') : null
  const machineId = env.SANCTUARY_MACHINE_ID || os.hostname()

  const isClient = Boolean(syncUrl)
  const isHost = syncHost
  const serverHost = env.SANCTUARY_SERVER_HOST || (isHost ? '0.0.0.0' : '127.0.0.1')

  return Object.freeze({
    savesDir,
    syncHost: isHost,
    syncUrl,
    machineId,
    isClient,
    isHost,
    serverHost,
  })
}

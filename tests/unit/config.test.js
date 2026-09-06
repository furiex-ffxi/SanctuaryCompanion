import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, parseEnvFile } from '../../server/config.js'

test('parseEnvFile parses key-value pairs, strips quotes, and ignores comments', () => {
  const content = `
# Comment line
SANCTUARY_SAVES_DIR="C:/My Saves/D2R"
SANCTUARY_SYNC_HOST='true'
SANCTUARY_SYNC_URL=http://192.168.1.50:5173/
SANCTUARY_MACHINE_ID=custom-laptop
INVALID LINE WITHOUT EQUALS
  `
  const result = parseEnvFile(content)
  assert.equal(result.SANCTUARY_SAVES_DIR, 'C:/My Saves/D2R')
  assert.equal(result.SANCTUARY_SYNC_HOST, 'true')
  assert.equal(result.SANCTUARY_SYNC_URL, 'http://192.168.1.50:5173/')
  assert.equal(result.SANCTUARY_MACHINE_ID, 'custom-laptop')
})

test('loadConfig provides sensible defaults when no env is set', () => {
  const config = loadConfig({}, 'nonexistent-.env')
  assert.equal(config.syncHost, false)
  assert.equal(config.syncUrl, null)
  assert.equal(config.isClient, false)
  assert.equal(config.isHost, false)
  assert.equal(config.serverHost, '127.0.0.1')
  assert.equal(config.machineId, os.hostname())
  assert.equal(config.savesDir, path.join(os.homedir(), 'Saved Games', 'Diablo II Resurrected'))
})

test('loadConfig recognizes host configuration', () => {
  const config = loadConfig({
    SANCTUARY_SYNC_HOST: 'true',
    SANCTUARY_MACHINE_ID: 'desktop-primary',
  }, 'nonexistent-.env')

  assert.equal(config.syncHost, true)
  assert.equal(config.isHost, true)
  assert.equal(config.isClient, false)
  assert.equal(config.serverHost, '0.0.0.0')
  assert.equal(config.machineId, 'desktop-primary')
})

test('loadConfig recognizes client configuration and trims trailing slash from syncUrl', () => {
  const config = loadConfig({
    SANCTUARY_SYNC_URL: 'http://192.168.1.100:5173///',
    SANCTUARY_MACHINE_ID: 'travel-laptop',
  }, 'nonexistent-.env')

  assert.equal(config.syncHost, false)
  assert.equal(config.isHost, false)
  assert.equal(config.isClient, true)
  assert.equal(config.syncUrl, 'http://192.168.1.100:5173')
  assert.equal(config.serverHost, '127.0.0.1')
  assert.equal(config.machineId, 'travel-laptop')
})

test('loadConfig respects explicit SANCTUARY_SERVER_HOST override', () => {
  const config = loadConfig({
    SANCTUARY_SYNC_HOST: 'true',
    SANCTUARY_SERVER_HOST: '192.168.1.20',
  }, 'nonexistent-.env')

  assert.equal(config.serverHost, '192.168.1.20')
})

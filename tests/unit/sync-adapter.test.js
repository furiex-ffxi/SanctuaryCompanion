import assert from 'node:assert/strict'
import test from 'node:test'
import { SyncAdapter } from '../../src/adapters/SyncAdapter.js'

test('SyncAdapter.status fetches /__sync/status and returns json', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    assert.equal(url, '/__sync/status')
    return {
      ok: true,
      status: 200,
      json: async () => ({ isClient: true, host: { connected: true } }),
    }
  }

  try {
    const result = await SyncAdapter.status()
    assert.equal(result.isClient, true)
    assert.equal(result.host.connected, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SyncAdapter.status throws on non-ok status', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
  })

  try {
    await assert.rejects(() => SyncAdapter.status(), /Failed to get sync status \(500\)/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SyncAdapter.syncNow sends POST to /__sync/now and handles response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/__sync/now')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      json: async () => ({ pulled: ['a.d2s'], pushed: [], conflicts: [], inSync: [], errors: [] }),
    }
  }

  try {
    const result = await SyncAdapter.syncNow()
    assert.deepEqual(result.pulled, ['a.d2s'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SyncAdapter.syncNow extracts server error message on failure', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 423,
    json: async () => ({ error: 'D2R is running on this machine' }),
  })

  try {
    await assert.rejects(() => SyncAdapter.syncNow(), /D2R is running on this machine/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SyncAdapter.manifest fetches /__sync/manifest', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    assert.equal(url, '/__sync/manifest')
    return {
      ok: true,
      status: 200,
      json: async () => ({ machineId: 'host-1', files: [] }),
    }
  }

  try {
    const result = await SyncAdapter.manifest()
    assert.equal(result.machineId, 'host-1')
    assert.deepEqual(result.files, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

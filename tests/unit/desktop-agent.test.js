import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { createAgentHandler } from '../../server/desktopAgent.js'

function createMockReqRes({ method = 'GET', url = '/status', body = null } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:5174' }

  let statusCode = 200
  const headers = {}
  const chunks = []

  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
    writeHead(code, h = {}) {
      statusCode = code
      for (const [k, v] of Object.entries(h)) {
        headers[k.toLowerCase()] = v
      }
    },
    end(data) {
      if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
    },
  }

  if (body !== null && (method === 'POST' || method === 'PUT')) {
    setImmediate(() => {
      req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body))
      req.emit('end')
    })
  } else {
    setImmediate(() => req.emit('end'))
  }

  return {
    req,
    res,
    getResponse: () => ({
      status: statusCode,
      headers,
      body: Buffer.concat(chunks).toString('utf8'),
      json: () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
    }),
  }
}

test('desktopAgent handler GET /status returns agent info and d2rRunning', async () => {
  let isRunningCalled = false
  const handler = createAgentHandler({
    savesDir: 'C:\\fake\\saves',
    syncUrl: 'http://dclaptop:5173',
    machineId: 'DESKTOP-TEST',
    isD2RRunning: () => {
      isRunningCalled = true
      return false
    },
    getState: () => ({ lastSyncResult: { inSync: ['char.d2s'] }, lastSyncTime: 12345 }),
  })

  const { req, res, getResponse } = createMockReqRes({ method: 'GET', url: '/status' })
  await handler(req, res)

  const response = getResponse()
  assert.equal(response.status, 200)
  assert.equal(response.headers['access-control-allow-private-network'], 'true')
  assert.equal(response.headers['access-control-allow-origin'], '*')

  const data = response.json()
  assert.equal(data.ok, true)
  assert.equal(data.role, 'desktop-agent')
  assert.equal(data.machineId, 'DESKTOP-TEST')
  assert.equal(data.d2rRunning, false)
  assert.equal(data.syncUrl, 'http://dclaptop:5173')
  assert.equal(data.lastSyncTime, 12345)
  assert.equal(isRunningCalled, true)
})

test('desktopAgent handler handles CORS OPTIONS preflight', async () => {
  const handler = createAgentHandler()
  const { req, res, getResponse } = createMockReqRes({ method: 'OPTIONS', url: '/set_time' })
  await handler(req, res)

  const response = getResponse()
  assert.equal(response.status, 204)
  assert.equal(response.headers['access-control-allow-private-network'], 'true')
})

test('desktopAgent handler POST /set_time executes setWindowsTime', async () => {
  let timeSetArgs = null
  const handler = createAgentHandler({
    setWindowsTime: async (args) => {
      timeSetArgs = args
    },
  })

  const { req, res, getResponse } = createMockReqRes({
    method: 'POST',
    url: '/set_time',
    body: JSON.stringify({ datetime: '2026-09-07T12:00:00Z', restore: false }),
  })
  await handler(req, res)

  const response = getResponse()
  assert.equal(response.status, 200)
  const data = response.json()
  assert.equal(data.success, true)
  assert.deepEqual(timeSetArgs, { datetime: '2026-09-07T12:00:00Z', restore: false })
})

test('desktopAgent handler POST /sync blocks when D2R is running', async () => {
  const handler = createAgentHandler({
    isD2RRunning: () => true,
  })

  const { req, res, getResponse } = createMockReqRes({
    method: 'POST',
    url: '/sync',
  })
  await handler(req, res)

  const response = getResponse()
  assert.equal(response.status, 423)
  const data = response.json()
  assert.equal(data.success, false)
  assert.match(data.error, /Cannot sync while Diablo II: Resurrected is running/)
})

test('desktopAgent handler POST /sync invokes syncService when D2R is stopped', async () => {
  let syncArgs = null
  let notifiedResult = null
  const mockSyncResult = { pulled: ['A.d2s'], pushed: [], conflicts: [] }

  const handler = createAgentHandler({
    isD2RRunning: () => false,
    syncService: {
      sync: async (args) => {
        syncArgs = args
        return mockSyncResult
      },
    },
    onSyncComplete: (result) => {
      notifiedResult = result
    },
  })

  const { req, res, getResponse } = createMockReqRes({
    method: 'POST',
    url: '/sync',
    body: JSON.stringify({ selectedFiles: ['A.d2s'] }),
  })
  await handler(req, res)

  const response = getResponse()
  assert.equal(response.status, 200)
  const data = response.json()
  assert.equal(data.success, true)
  assert.deepEqual(data.pulled, ['A.d2s'])
  assert.deepEqual(syncArgs, { selectedFiles: ['A.d2s'] })
  assert.deepEqual(notifiedResult, mockSyncResult)
})

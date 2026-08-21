import crypto from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HELPER_PATH = fileURLToPath(new URL('./timeHelper.js', import.meta.url))
const quotePowerShell = value => `'${String(value).replaceAll("'", "''")}'`

let sessionPromise = null

function startSession() {
  const token = crypto.randomBytes(32).toString('base64url')
  const server = net.createServer()
  const pending = new Map()
  let socket = null
  let buffer = ''
  let nextId = 1
  let readyResolve
  let readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const timeout = setTimeout(() => readyReject(new Error('Timed out waiting for the elevated time helper. UAC may have been cancelled.')), 30000)

  const failPending = error => {
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }

  server.on('connection', connection => {
    if (socket) { connection.destroy(); return }
    socket = connection
    connection.setEncoding('utf8')
    connection.on('data', chunk => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        let message
        try { message = JSON.parse(line) } catch { connection.destroy(); return }
        if (message.type === 'hello') {
          if (message.token !== token) { connection.destroy(); return }
          clearTimeout(timeout); readyResolve()
          continue
        }
        const request = pending.get(message.id)
        if (!request) continue
        pending.delete(message.id)
        if (message.ok) request.resolve(message)
        else request.reject(new Error(message.error || 'Elevated time helper failed'))
      }
    })
    connection.on('error', error => { if (!socket || socket === connection) { failPending(error); readyReject(error) } })
    connection.on('close', () => { if (socket === connection) { socket = null; failPending(new Error('Elevated time helper disconnected')) } })
  })

  const launch = () => {
    const address = server.address()
    const nodePath = quotePowerShell(process.execPath)
    const helperPath = quotePowerShell(path.resolve(HELPER_PATH))
    const tokenArg = quotePowerShell(token)
    const command = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; Start-Process -FilePath ${nodePath} -Verb RunAs -WindowStyle Hidden -ArgumentList @(${helperPath}, '--port', '${address.port}', '--token', ${tokenArg})"`
    exec(command, error => { if (error && !socket) readyReject(error) })
  }

  server.listen(0, '127.0.0.1', launch)

  return ready.then(() => ({
    request(operation, datetime) {
      if (!socket) return Promise.reject(new Error('Elevated time helper is not connected'))
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.write(JSON.stringify({ id, operation, datetime }) + '\n')
      })
    },
    close() { clearTimeout(timeout); failPending(new Error('Elevated time helper session closed')); socket?.end(); server.close() },
  })).catch(error => { clearTimeout(timeout); server.close(); throw error })
}

export async function runWithElevatedHelper({ operation, datetime }) {
  if (!sessionPromise) sessionPromise = startSession().catch(error => { sessionPromise = null; throw error })
  try {
    const session = await sessionPromise
    return await session.request(operation, datetime)
  } catch (error) {
    sessionPromise = null
    throw error
  }
}

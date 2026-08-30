import crypto from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { exec, execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HELPER_PATH = fileURLToPath(new URL('./timeHelper.js', import.meta.url))
const STATE_DIRECTORY = process.env.SANCTUARY_TIME_STATE_DIRECTORY || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'SanctuaryCompanion')
const quotePowerShell = value => `'${String(value).replaceAll("'", "''")}'`
const encodePowerShell = script => Buffer.from(script, 'utf16le').toString('base64')

function isElevated() {
  try {
    const result = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    ], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return result.toLowerCase() === 'true'
  } catch {
    return false
  }
}

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
    const helperArguments = [path.resolve(HELPER_PATH), '--port', String(address.port), '--token', token, '--state-dir', STATE_DIRECTORY]
    if (isElevated()) {
      const helper = spawn(process.execPath, helperArguments, { windowsHide: true })
      helper.once('error', error => { if (!socket) readyReject(error) })
      return
    }
    const helperScript = `& ${quotePowerShell(process.execPath)} ${quotePowerShell(path.resolve(HELPER_PATH))} --port ${quotePowerShell(address.port)} --token ${quotePowerShell(token)} --state-dir ${quotePowerShell(STATE_DIRECTORY)}`
    const encodedHelperScript = encodePowerShell(helperScript)
    const command = `powershell -NoProfile -WindowStyle Hidden -Command "$ErrorActionPreference = 'Stop'; Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', '${encodedHelperScript}')"`
    exec(command, { windowsHide: true }, error => { if (error && !socket) readyReject(error) })
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!sessionPromise) sessionPromise = startSession().catch(error => { sessionPromise = null; throw error })
    const currentSessionPromise = sessionPromise
    try {
      const session = await currentSessionPromise
      return await session.request(operation, datetime)
    } catch (error) {
      sessionPromise = null
      // The helper can disconnect between the hello handshake and the first
      // request. Reconnect once when no operation was sent; do not retry
      // errors returned by PowerShell because those operations may have run.
      if (attempt === 0 && error?.message === 'Elevated time helper is not connected') {
        currentSessionPromise.then(session => session.close()).catch(() => {})
        continue
      }
      throw error
    }
  }
}

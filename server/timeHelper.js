import net from 'node:net'
import { execFile } from 'node:child_process'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1])
const port = Number(args.get('--port'))
const token = args.get('--token')
if (!Number.isInteger(port) || !token) throw new Error('Invalid time helper arguments')
if (args.get('--state-dir')) process.env.SANCTUARY_TIME_STATE_DIRECTORY = args.get('--state-dir')

const { createTimeScript } = await import('./timeJumper.js')

const encodedPowerShell = script => Buffer.from(script, 'utf16le').toString('base64')
const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
  socket.write(JSON.stringify({ type: 'hello', token }) + '\n')
})
socket.setEncoding('utf8')
let buffer = ''

socket.on('data', chunk => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
    let request
    try { request = JSON.parse(line) } catch { process.exitCode = 1; socket.end(); return }
    let script
    try {
      script = createTimeScript({ operation: request.operation, datetime: request.datetime })
    } catch (error) {
      socket.write(JSON.stringify({ id: request.id, ok: false, error: error.message }) + '\n')
      continue
    }
    execFile('powershell.exe', ['-NoProfile', '-EncodedCommand', encodedPowerShell(script)], { windowsHide: true }, (error, stdout, stderr) => {
      socket.write(JSON.stringify({
        id: request.id,
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? String(stderr || error.message || 'PowerShell operation failed').trim() : null,
        code: error?.code ?? 0,
      }) + '\n')
    })
  }
})
socket.on('close', () => process.exit(0))
socket.on('error', () => process.exit(1))

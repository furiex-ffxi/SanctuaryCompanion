import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const lockPath = path.resolve('.vite-dev.lock')
let lockFd

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function acquireLock() {
  try {
    lockFd = fs.openSync(lockPath, 'wx')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const previousPid = Number(fs.readFileSync(lockPath, 'utf8').trim())
    if (Number.isInteger(previousPid) && previousPid > 0 && isProcessRunning(previousPid)) {
      console.error(`A SanctuaryCompanion dev server is already running (PID ${previousPid}).`)
      console.error('Stop it before starting another one.')
      process.exit(1)
    }
    fs.rmSync(lockPath, { force: true })
    lockFd = fs.openSync(lockPath, 'wx')
  }
  fs.writeFileSync(lockFd, String(process.pid))
}

function releaseLock() {
  if (lockFd === undefined) return
  try { fs.closeSync(lockFd) } catch {}
  try { fs.rmSync(lockPath, { force: true }) } catch {}
  lockFd = undefined
}

acquireLock()
const vitePath = path.resolve('node_modules/vite/bin/vite.js')
const vite = spawn(process.execPath, [vitePath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

const stop = (signal) => {
  if (!vite.killed) vite.kill(signal)
}
process.once('SIGINT', () => stop('SIGINT'))
process.once('SIGTERM', () => stop('SIGTERM'))
vite.once('exit', (code, signal) => {
  releaseLock()
  process.exit(code ?? (signal ? 1 : 0))
})
vite.once('error', (error) => {
  console.error(`Failed to start Vite: ${error.message}`)
  releaseLock()
  process.exit(1)
})

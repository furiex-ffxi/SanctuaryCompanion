import { execSync as defaultExecSync } from 'node:child_process'

const D2R_TASKLIST = 'tasklist /FI "IMAGENAME eq D2R.exe"'
const D2R_POWERSHELL = `powershell.exe -NoProfile -NonInteractive -Command "(Get-Process -Name 'D2R' -ErrorAction SilentlyContinue | Select-Object -First 1).Id"`

export function isD2RRunning(execSync = defaultExecSync) {
  try {
    const output = execSync(D2R_TASKLIST, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    return output.toLowerCase().includes('d2r.exe')
  } catch {
    try {
      const fallback = execSync(D2R_POWERSHELL, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      return /^\d+$/.test(fallback)
    } catch {
      return false
    }
  }
}

export function rejectWhileD2RRunning(res, execSync = defaultExecSync) {
  if (!isD2RRunning(execSync)) return false
  res.writeHead(423, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: false, error: 'Diablo II Resurrected is running! File is locked.' }))
  return true
}

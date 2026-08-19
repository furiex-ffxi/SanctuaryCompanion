import fs from 'node:fs'
import path from 'node:path'

function activeProfileFromConfig(configText) {
  const match = configText.match(/^active_profile\s*=\s*(.+?)\s*$/mi)
  if (!match?.[1]) throw new Error('mf_config.ini does not define active_profile')
  return match[1]
}

function estimateSessionTime(laps) {
  let total = 0
  for (let index = 0; index < laps.length; index += 1) {
    const lap = laps[index]
    const runTime = Number(lap['Run time']) || 0
    total += runTime
    if (index === 0) continue
    const previous = Date.parse(laps[index - 1]['Real time'])
    const current = Date.parse(lap['Real time'])
    const idle = (current - previous) / 1000 - runTime
    if (idle > 0 && idle <= 300) total += idle
  }
  return total
}

export function repairMfTimerProfile({ directory, now = new Date() } = {}) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('MF Timer directory must be an absolute path')
  const configPath = path.join(directory, 'mf_config.ini')
  const profile = activeProfileFromConfig(fs.readFileSync(configPath, 'utf8'))
  const profilePath = path.join(directory, 'Profiles', `${profile}.json`)
  const state = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  const current = Number(state.active_state?.session_time)
  if (!Number.isFinite(current) || current >= 0) return { repaired: false, profile, sessionTime: current }

  const laps = Array.isArray(state.active_state?.laps) ? state.active_state.laps : []
  const replacement = Math.max(0, estimateSessionTime(laps))
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_')
  const backupPath = `${profilePath}.pre-repair-${stamp}.bak`
  fs.copyFileSync(profilePath, backupPath)
  state.active_state.session_time = replacement
  const tempPath = `${profilePath}.repair-${process.pid}-${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 4)}\n`, 'utf8')
  fs.renameSync(tempPath, profilePath)
  return { repaired: true, profile, previousSessionTime: current, sessionTime: replacement, backupPath, runCount: laps.length }
}
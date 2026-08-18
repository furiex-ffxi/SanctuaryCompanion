import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const workerPath = process.env.D2R_WORKER || path.resolve(process.cwd(), 'server', 'bin', 'D2RStashWorker.exe')

export const CURRENT_STAT_DISPLAY_VERSION = 1

export function needsVaultItemRehydration(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && typeof item.rawBytesHex === 'string'
    && item.rawBytesHex.length > 0
    && Number(item.stat_display_version) !== CURRENT_STAT_DISPLAY_VERSION
  )
}

export async function rehydrateVaultItem(item, { version = item?.item_format || item?.version || 105 } = {}) {
  if (!needsVaultItemRehydration(item)) return item
  const { stdout } = await execFileAsync(
    workerPath,
    ['parse_item', item.rawBytesHex, String(version)],
    { maxBuffer: 16 * 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout)
  if (!parsed || typeof parsed !== 'object' || !parsed.type
    || Number(parsed.stat_display_version) !== CURRENT_STAT_DISPLAY_VERSION) {
    throw new Error('D2RStashWorker returned an invalid versioned item')
  }
  return { ...item, ...parsed, rawBytesHex: item.rawBytesHex }
}

export async function mapWithConcurrency(values, mapper, concurrency = 4) {
  const results = new Array(values.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return results
}

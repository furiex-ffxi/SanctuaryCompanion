import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const workerPath = process.env.D2R_WORKER || path.resolve(process.cwd(), 'server', 'bin', 'D2RStashWorker.exe')

export async function rehydrateVaultItem(item, { version = item?.item_format || item?.version || 105 } = {}) {
  if (!item?.rawBytesHex || typeof item.rawBytesHex !== 'string') throw new Error('Vault item is missing rawBytesHex')
  const { stdout } = await execFileAsync(workerPath, ['parse_item', item.rawBytesHex, String(version)], { maxBuffer: 16 * 1024 * 1024 })
  const parsed = JSON.parse(stdout)
  if (!parsed || typeof parsed !== 'object' || !parsed.type) throw new Error('D2RStashWorker returned an invalid item')
  return { ...item, ...parsed, rawBytesHex: item.rawBytesHex }
}
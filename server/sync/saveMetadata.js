import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
let customParser = null

try {
  customParser = require('../../src/domain/parsers/CustomD2Parser.cjs')
} catch (err) {
  console.warn('[saveMetadata] CustomD2Parser not loaded yet:', err.message)
}

// In-memory cache keyed by `${filePath}:${stat.mtimeMs}:${stat.size}`
const metadataCache = new Map()

/**
 * Inspect a .d2s or .d2i save file and extract game metadata (level, item count, gold, pages).
 * Cached by mtimeMs and size to avoid re-parsing unchanged files.
 */
export async function inspectSaveFile(filePath, parserOverrides = null) {
  const parseD2S = parserOverrides?.parseD2S || customParser?.parseD2S
  const parseD2I = parserOverrides?.parseD2I || customParser?.parseD2I

  if (!fs.existsSync(filePath)) return null

  let stat
  try {
    stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) return null
  } catch {
    return null
  }

  const cacheKey = `${filePath}:${stat.mtimeMs}:${stat.size}`
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey)
  }

  const lower = filePath.toLowerCase()
  let metadata = null

  if (lower.endsWith('.d2s') && parseD2S) {
    try {
      const data = await parseD2S(filePath)
      const itemsCount =
        (data.items?.length || 0) +
        (data.contained_items?.length || 0) +
        (data.merc_items?.length || 0) +
        (data.corpse_items?.length || 0)

      metadata = {
        type: 'character',
        name: data.name || '',
        charClass: data.class || '',
        level: data.level || data.header?.level || data.attributes?.level || 1,
        itemCount: itemsCount,
        gold: (data.attributes?.gold || 0) + (data.attributes?.stashed_gold || 0),
      }
    } catch (err) {
      console.warn(`[saveMetadata] Failed to parse .d2s ${filePath}: ${err.message}`)
      metadata = {
        type: 'character',
        error: err.message,
      }
    }
  } else if (lower.endsWith('.d2i') && parseD2I) {
    try {
      const data = await parseD2I(filePath)
      const pages = data.pages || []
      const itemsCount = pages.reduce((sum, p) => sum + (p.items?.length || 0), 0)

      metadata = {
        type: 'shared_stash',
        pageCount: pages.length,
        itemCount: itemsCount,
      }
    } catch (err) {
      console.warn(`[saveMetadata] Failed to parse .d2i ${filePath}: ${err.message}`)
      metadata = {
        type: 'shared_stash',
        error: err.message,
      }
    }
  }

  if (metadata) {
    metadataCache.set(cacheKey, metadata)
  }

  return metadata
}

export function clearMetadataCache() {
  metadataCache.clear()
}

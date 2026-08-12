import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.resolve(moduleDirectory, '../../D2RStashWorker/Data')

function readTsv(filename) {
  const lines = fs.readFileSync(path.join(dataDirectory, filename), 'utf8').split(/\r?\n/).filter(Boolean)
  const headers = lines.shift().split('\t')
  return lines.map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))
  })
}

const imageRows = new Map(readTsv('item_images.tsv').map((row) => [row.code.toLowerCase(), row]))
const gfxRows = new Map(readTsv('item_gfx.tsv').map((row) => [row.code.toLowerCase(), Object.values(row).slice(1).filter(Boolean)]))
const uniqueRows = new Map(readTsv('uniqueitems.txt').map((row) => [row.index?.toLowerCase(), row]))
const setRows = new Map(readTsv('setitems.txt').map((row) => [row.index?.toLowerCase(), row]))
const SUNDER_STAT_IDS = new Set([187, 189, 190, 191, 192, 193])

export function isSunderCharm(item = {}) {
  const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : ''
  if (type === 'cs2') return true
  return (item.magic_attributes || []).some((attribute) => SUNDER_STAT_IDS.has(Number(attribute?.id)))
}

const variableGfxTypes = new Map([
  ['rin', 'ring'],
  ['amu', 'amul'],
  ['jew', 'jewl'],
  ['cm1', 'scha'],
  ['cm2', 'mcha'],
  ['cm3', 'lcha'],
])

export function resolveItemImageKey(item = {}) {
  if (isSunderCharm(item)) return 'invch3'

  const existing = item.image_key || item.inv_file
  if (typeof existing === 'string' && existing.trim()) return existing.trim().toLowerCase()

  const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : ''
  const gfxType = variableGfxTypes.get(type)
  if (gfxType) {
    const files = gfxRows.get(gfxType) || []
    const index = Math.max(0, Math.min(Number(item.variable_gfx_id ?? item.variableGfxId) || 0, files.length - 1))
    if (files[index]) return files[index].toLowerCase()
  }
  if (type === 'box') return 'invbox'

  const row = imageRows.get(type)
  if (!row) return null
  if (Number(item.quality) === 7 && row.unique_inv_file) return row.unique_inv_file.toLowerCase()
  if (Number(item.quality) === 5 && row.set_inv_file) return row.set_inv_file.toLowerCase()
  return row.inv_file ? row.inv_file.toLowerCase() : null
}

export function getItemTransformMetadata(item = {}) {
  if (!item || typeof item !== 'object') return {}
  if (item.transform_color || item.inv_transform || item.chr_transform) {
    return {
      inv_transform: item.inv_transform,
      chr_transform: item.chr_transform,
      transform_color: item.transform_color || item.inv_transform || item.chr_transform,
    }
  }

  const quality = Number(item.quality ?? item.item_quality)
  const name = String(item.unique_name || '').trim().toLowerCase()
  let row = quality === 5
    ? setRows.get(name)
    : quality === 7 || quality === 8
      ? uniqueRows.get(name)
      : null
  // The UI-facing Tal Rasha armor name differs from the source-table name.
  if (!row && quality === 5 && name === "tal rasha's guardianship") {
    row = setRows.get("tal rasha's howling wind")
  }
  if (!row) return {}
  const invTransform = row.invtransform || ''
  const chrTransform = row.chrtransform || ''
  return {
    inv_transform: invTransform || undefined,
    chr_transform: chrTransform || undefined,
    transform_color: invTransform || chrTransform || undefined,
  }
}

export function normalizeVaultItem(item = {}) {
  if (!item || typeof item !== 'object') return item
  const imageKey = resolveItemImageKey(item)
  const transform = getItemTransformMetadata(item)
  const normalized = imageKey
    ? { ...item, ...transform, image_key: imageKey, inv_file: imageKey }
    : { ...item, ...transform }
  if (Array.isArray(item.socketed_items)) {
    normalized.socketed_items = item.socketed_items.map(normalizeVaultItem)
  }
  return normalized
}

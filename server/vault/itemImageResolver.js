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
const variableGfxTypes = new Map([
  ['rin', 'ring'],
  ['amu', 'amul'],
  ['jew', 'jewl'],
  ['cm1', 'scha'],
  ['cm2', 'mcha'],
  ['cm3', 'lcha'],
])

export function resolveItemImageKey(item = {}) {
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

export function normalizeVaultItem(item = {}) {
  if (!item || typeof item !== 'object') return item
  const imageKey = resolveItemImageKey(item)
  const normalized = imageKey
    ? { ...item, image_key: imageKey, inv_file: imageKey }
    : { ...item }
  if (Array.isArray(item.socketed_items)) {
    normalized.socketed_items = item.socketed_items.map(normalizeVaultItem)
  }
  return normalized
}

export const ITEM_SEARCH_SCOPES = Object.freeze(['all', 'character', 'sharedStash', 'infiniteStash'])
export const ITEM_SEARCH_QUALITIES = Object.freeze(['All', '2', '4', '5', '6', '7'])

const text = value => typeof value === 'string' ? value.trim() : ''
const searchTokens = value => String(value || '').toLowerCase().split(/[^a-z0-9%+]+/).filter(Boolean)

export function normalizeItemSearchFilters(input = {}) {
  const scope = text(input.scope || input.sourceScope || 'all') || 'all'
  if (!ITEM_SEARCH_SCOPES.includes(scope)) throw new Error(`Unsupported item search scope: ${scope}`)
  const quality = text(input.quality || 'All') || 'All'
  if (!ITEM_SEARCH_QUALITIES.includes(quality)) throw new Error(`Unsupported item quality: ${quality}`)
  const number = (value, name) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid ${name}`)
    return parsed
  }
  const minLevel = number(input.minLevel, 'minimum level')
  const maxLevel = number(input.maxLevel, 'maximum level')
  if (minLevel !== null && maxLevel !== null && minLevel > maxLevel) throw new Error('Minimum level cannot exceed maximum level')
  return {
    q: text(input.q),
    category: text(input.category || 'All') || 'All',
    slot: text(input.slot || 'All') || 'All',
    setName: text(input.setName || input.set || 'All') || 'All',
    quality,
    minLevel,
    maxLevel,
    scope,
    sharedFile: text(input.sharedFile),
  }
}

export function itemMatchesFilters(item, projection, filters) {
  const p = projection
  if (filters.q) {
    const available = searchTokens(p.searchText)
    if (!searchTokens(filters.q).every(wanted => available.some(candidate => candidate.startsWith(wanted)))) return false
  }
  if (filters.category !== 'All' && p.category !== filters.category) return false
  if (filters.slot !== 'All' && p.slot !== filters.slot) return false
  if (filters.setName !== 'All' && p.setName !== filters.setName) return false
  if (filters.quality !== 'All' && p.quality !== Number(filters.quality)) return false
  const hasMinLevel = filters.minLevel !== null && filters.minLevel !== undefined && filters.minLevel !== ''
  const hasMaxLevel = filters.maxLevel !== null && filters.maxLevel !== undefined && filters.maxLevel !== ''
  if (hasMinLevel && (p.level === null || p.level < Number(filters.minLevel))) return false
  if (hasMaxLevel && (p.level === null || p.level > Number(filters.maxLevel))) return false
  return true
}

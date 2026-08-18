import { getItemSlotCategory, resolveVaultBaseType } from '../../src/domain/entities/VaultCatalog.js'

function normalizeText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === "Tal Rasha's Howling Wind" ? "Tal Rasha's Guardianship" : text
}

export function unicodeSortKey(value) {
  const text = normalizeText(value)
  return text ? text.normalize('NFKC').toLocaleLowerCase('und') : null
}

export function getSearchableItemAttributes(item) {
  // Combined/displayed attributes may contain bonuses contributed by socketed
  // children. Global search intentionally indexes only the owning item's stats.
  const attributes = [
    ...(item.magic_attributes || []),
    ...(item.runeword_attributes || []),
    ...(item.set_attributes || []).flat(),
  ]

  return attributes.map((attribute) => {
    if (attribute?.description) return attribute.description
    const name = normalizeText(attribute?.name).replace(/_/g, ' ')
    const values = Array.isArray(attribute?.values) ? attribute.values.join(', ') : ''
    return `${name} ${values}`.trim()
  }).filter(Boolean)
}

export function getVaultItemSlot(item = {}) {
  return getItemSlotCategory(item)
}

export function getItemSocketCount(item = {}) {
  const total = Number(item.total_nr_of_sockets)
  if (Number.isFinite(total) && total >= 0) return total
  return Array.isArray(item.socketed_items) ? item.socketed_items.length : 0
}

export function getVaultCategory(item, slot = getVaultItemSlot(item)) {
  if (item.set_name) return 'Set Items'
  if (Number(item.quality) === 7) return 'Unique Items'
  if (['Ring', 'Amulet'].includes(slot)) return 'Rings & Amulets'
  if (['Rune', 'Gem'].includes(slot)) return 'Runes & Gems'
  if (slot.includes('Charm')) return 'Charms'
  if (['Torso', 'Head', 'Gloves', 'Boots', 'Belt', 'Shield', 'Armor'].includes(slot)) return 'Armor'
  if (slot === 'Weapon') return 'Weapons'
  return 'Other / Misc'
}

export function projectVaultEntry(entry) {
  const item = entry.itemData || {}
  const slot = getVaultItemSlot(item)
  const typeName = resolveVaultBaseType(item)
  const displayName = normalizeText(
    item.given_runeword_name
      || item.runeword_name
      || item.unique_name
      || item.set_name
      || [item.rare_name, item.rare_name2].filter(Boolean).join(' ')
      || item.personalized_name
      || typeName
      || item.type
      || 'Unknown Item',
  )
  const hasStoredType = Boolean(normalizeText(item.type) || normalizeText(item.type_name))
  const normalizedTypeName = hasStoredType ? normalizeText(typeName) || null : null
  const numericQuality = Number(item.quality)
  const quality = item.quality !== null && item.quality !== undefined && item.quality !== ''
    && Number.isInteger(numericQuality) && numericQuality > 0
    ? numericQuality
    : null
  const searchText = [
    displayName,
    item.type,
    item.type_name,
    typeName,
    slot,
    getVaultCategory(item, slot),
    item.set_name,
    item.unique_name,
    item.rare_name,
    item.rare_name2,
    item.magic_prefix_name,
    item.magic_suffix_name,
    item.given_runeword_name,
    item.runeword_name,
    getSearchableItemAttributes(item).join(' '),
  ].filter(Boolean).join(' ').toLowerCase()

  return {
    displayName,
    displayNameSort: unicodeSortKey(displayName),
    typeCode: normalizeText(item.type) || null,
    typeName: normalizedTypeName,
    typeNameSort: unicodeSortKey(normalizedTypeName),
    sourceSaveSort: unicodeSortKey(entry.sourceSave),
    slot,
    category: getVaultCategory(item, slot),
    quality,
    socketCount: getItemSocketCount(item),
    setName: normalizeText(item.set_name) || null,
    searchText,
  }
}

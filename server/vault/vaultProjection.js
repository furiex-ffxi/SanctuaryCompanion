import { getItemSlotCategory } from '../../src/domain/entities/VaultCatalog.js'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function magicAttributeText(item) {
  const attributes = item.displayed_combined_magic_attributes
    || item.displayed_magic_attributes
    || item.combined_magic_attributes
    || item.magic_attributes
    || []

  return attributes.map((attribute) => {
    if (attribute?.description) return attribute.description
    const name = normalizeText(attribute?.name).replace(/_/g, ' ')
    const values = Array.isArray(attribute?.values) ? attribute.values.join(', ') : ''
    return `${name} ${values}`.trim()
  }).join(' ')
}

export function getVaultItemSlot(item = {}) {
  return getItemSlotCategory(item)
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
  const displayName = normalizeText(
    item.given_runeword_name
      || item.runeword_name
      || item.set_name
      || item.unique_name
      || [item.rare_name, item.rare_name2].filter(Boolean).join(' ')
      || item.personalized_name
      || item.type_name
      || item.type
      || 'Unknown Item',
  )
  const searchText = [
    displayName,
    item.type,
    item.type_name,
    item.set_name,
    item.unique_name,
    item.rare_name,
    item.rare_name2,
    item.magic_prefix_name,
    item.magic_suffix_name,
    item.given_runeword_name,
    item.runeword_name,
    magicAttributeText(item),
  ].filter(Boolean).join(' ').toLowerCase()

  return {
    displayName,
    typeCode: normalizeText(item.type),
    typeName: normalizeText(item.type_name),
    slot,
    category: getVaultCategory(item, slot),
    quality: Number.isFinite(Number(item.quality)) ? Number(item.quality) : null,
    setName: normalizeText(item.set_name) || null,
    searchText,
  }
}

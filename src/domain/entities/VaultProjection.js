export function getVaultCategory(item = {}, slot = '') {
  if (item.set_name) return 'Set Items'
  if (Number(item.quality) === 7) return 'Unique Items'
  if (['Ring', 'Amulet'].includes(slot)) return 'Rings & Amulets'
  if (['Rune', 'Gem'].includes(slot)) return 'Runes & Gems'
  if (slot.includes('Charm')) return 'Charms'
  if (['Torso', 'Head', 'Gloves', 'Boots', 'Belt', 'Shield', 'Armor'].includes(slot)) return 'Armor'
  if (slot === 'Weapon') return 'Weapons'
  return 'Other / Misc'
}

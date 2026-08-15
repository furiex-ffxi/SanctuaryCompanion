// Item Entity & constants - Pure Domain logic

export const QUALITY_CLASS = {
  1: 'quality-white', // normal low
  2: 'quality-white', // normal
  3: 'quality-white', // superior
  4: 'quality-magic',
  5: 'quality-set',
  6: 'quality-rare',
  7: 'quality-unique',
  8: 'quality-unique', // crafted
};

export const SLOT_META = {
  1:  { label: 'Helm',       cls: 'slot-head' },
  2:  { label: 'Neck',       cls: 'slot-neck' },
  3:  { label: 'Torso',      cls: 'slot-torso' },
  4:  { label: 'Weapon',     cls: 'slot-weapon' },
  5:  { label: 'Shield',     cls: 'slot-shield' },
  6:  { label: 'Right Ring', cls: 'slot-ring' },
  7:  { label: 'Left Ring',  cls: 'slot-ring' },
  8:  { label: 'Belt',       cls: 'slot-belt' },
  9:  { label: 'Boots',      cls: 'slot-boots' },
  10: { label: 'Gloves',     cls: 'slot-gloves' },
  11: { label: 'Alt Weapon', cls: 'slot-weapon' },
  12: { label: 'Alt Shield', cls: 'slot-shield' },
};

export const STORAGE_META = {
  inventory: { altId: 1, cols: 10, rows: 4 },
  stash:     { altId: 5, cols: 10, rows: 10 },
  cube:      { altId: null, cols: 3, rows: 4 },
};

import { constants as constants99 } from './static_constant_data.js';

export const getItemDimensions = (type) => {
  const t = (type || '').toLowerCase().trim();
  
  // 1. Look up exact item dimensions from D2 constants data (weapon_items, armor_items, other_items)
  const itemData = constants99.weapon_items[t] || constants99.armor_items[t] || constants99.other_items[t];
  if (itemData && itemData.iw && itemData.ih) {
    return [itemData.iw, itemData.ih];
  }

  // 2. Fallbacks for special cases
  if (/^r\d+$/.test(t)) return [1, 1]; // Runes r01-r33
  if (/^gp/.test(t)) return [1, 1];    // Gems
  if (['rin', 'amu', 'jew', 'key', 'hp1','hp2','hp3','hp4','hp5',
       'mp1','mp2','mp3','mp4','mp5','rvs','rvl'].includes(t)) return [1, 1];
  if (t === 'cm1') return [1, 1]; // Small Charm
  if (t === 'cm2') return [1, 2]; // Large Charm
  if (t === 'cm3') return [1, 3]; // Grand Charm
  if (['tbk','ibk'].includes(t)) return [1, 2];
  if (t === 'box') return [2, 2]; // Horadric Cube
  return [1, 1];
};

export const getItemColorClass = (item) => {
  if (!item) return 'quality-white';
  if (item.runeword_name) return 'quality-runeword';
  return QUALITY_CLASS[item.quality] || 'quality-white';
};

const LEVEL_REQUIREMENT_STAT_ID = 92;

// D2SSharp exposes level requirements as the item_levelreq stat. Keep the
// direct-field fallbacks for older/imported vault records.
export const getItemLevelRequirement = (item) => {
  if (!item || item.equippable === false) return null;

  const directValue = item.level_requirement ?? item.levelRequirement ?? item.reqlevel ?? item.req_level;
  if (directValue != null && Number.isFinite(Number(directValue))) return Number(directValue);

  const attributes = [
    ...(item.magic_attributes || []),
    ...(item.displayed_magic_attributes || []),
    ...(item.combined_magic_attributes || []),
    ...(item.displayed_combined_magic_attributes || []),
  ];
  const levelAttribute = attributes.find((attribute) =>
    Number(attribute?.id) === LEVEL_REQUIREMENT_STAT_ID
    || String(attribute?.name || '').toLowerCase() === 'item_levelreq'
  );
  const value = levelAttribute?.values?.[0];
  return value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
};

export const getItemLevel = (item) => {
  const value = item?.item_level ?? item?.itemLevel;
  return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
};

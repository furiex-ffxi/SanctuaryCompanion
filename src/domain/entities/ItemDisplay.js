import { constants } from './static_constant_data.js';

const statLabels = {
  0: ['Strength', true], 1: ['Energy', true], 2: ['Dexterity', true], 3: ['Vitality', true],
  7: ['Life', true], 9: ['Mana', true], 16: ['Enhanced Defense', true], 19: ['Attack Rating', true],
  20: ['Chance to Block', true], 25: ['Enhanced Damage', true], 31: ['Defense', true],
  34: ['Damage Reduced', true], 36: ['Damage Reduced', true], 39: ['Fire Resist', true],
  40: ['Maximum Fire Resist', true], 41: ['Lightning Resist', true], 42: ['Maximum Lightning Resist', true],
  43: ['Cold Resist', true], 44: ['Maximum Cold Resist', true], 45: ['Poison Resist', true],
  46: ['Maximum Poison Resist', true], 60: ['Life Stolen per Hit', true], 62: ['Mana Stolen per Hit', true],
  67: ['Faster Run/Walk', true], 68: ['Increased Attack Speed', true], 79: ['Extra Gold from Monsters', true],
  80: ['Better Chance of Getting Magic Items', true], 81: ['Knockback', false], 85: ['Extra Experience', true],
  86: ['Life after Each Kill', true], 87: ['Reduced Prices', true], 89: ['Light Radius', true],
  91: ['Requirements', true], 92: ['Required Level', true], 93: ['Increased Attack Speed', true],
  96: ['Faster Run/Walk', true], 99: ['Faster Hit Recovery', true], 102: ['Faster Block Rate', true],
  105: ['Faster Cast Rate', true], 108: ['Slain Monsters Rest in Peace', false],
  110: ['Poison Length Reduced', true], 114: ['Damage Taken Goes to Mana', true], 127: ['to All Skills', true],
  252: ['Repairs durability', false],
};

const clean = (value) => typeof value === 'string' ? value.trim() : '';
// Remove parser-only classification suffixes from user-facing base names.
export function cleanItemTypeName(value) {
  return clean(value).replace(/\s+\([a-z0-9]+-[a-z0-9]+\)\s*$/i, '').trim();
}
const skillTabs = {
  '0:0': 'Amazon Bow and Crossbow', '0:1': 'Amazon Javelin and Spear', '0:2': 'Amazon Passive and Magic',
  '1:0': 'Sorceress Fire', '1:1': 'Sorceress Lightning', '1:2': 'Sorceress Cold',
  '2:0': 'Necromancer Curses', '2:1': 'Necromancer Poison and Bone', '2:2': 'Necromancer Summoning',
  '3:0': 'Paladin Combat', '3:1': 'Paladin Offensive Auras', '3:2': 'Paladin Defensive Auras',
  '4:0': 'Barbarian Combat Skills', '4:1': 'Barbarian Warcries', '4:2': 'Barbarian Masteries',
  '5:0': 'Druid Elemental', '5:1': 'Druid Shape Shifting', '5:2': 'Druid Summoning',
  '6:0': 'Assassin Martial Arts', '6:1': 'Assassin Shadow Disciplines', '6:2': 'Assassin Traps',
  '7:0': 'Demon', '7:1': 'Eldritch', '7:2': 'Chaos',
};

export function getSkillTabName(packedLayer) {
  const layer = Number(packedLayer);
  if (!Number.isInteger(layer) || layer < 0) return null;
  return skillTabs[`${layer >> 3}:${layer & 7}`] || null;
}

export function formatSkillTab(value, packedLayer) {
  const numeric = Number(value);
  const amount = Number.isFinite(numeric) && numeric >= 0 ? `+${value}` : value;
  return `${amount} to ${getSkillTabName(packedLayer) || `Skill Tab ${packedLayer}`} Skills`;
}

export function getFriendlyBaseName(item = {}) {
  const code = clean(item.type).toLowerCase();
  const catalogItem = constants.weapon_items?.[code] || constants.armor_items?.[code] || constants.other_items?.[code];
  const supplied = cleanItemTypeName(item.type_name);
  if (supplied && supplied.toLowerCase() !== code) return supplied;
  return clean(catalogItem?.n || catalogItem?.nc) || supplied || clean(item.type) || 'Item';
}

export function getItemTypeDisplayName(item = {}) {
  return getFriendlyBaseName(item);
}

export function getItemDisplayName(item) {
  if (!item) return '';
  if (item.runeword_name) return item.runeword_name;
  const typeName = item.type_name && item.type_name.toLowerCase() !== (item.type || '').toLowerCase()
    ? getItemTypeDisplayName(item)
    : null;
  const baseType = typeName || getFriendlyBaseName(item) || 'Item';
  if (item.quality === 5 && item.unique_name) return item.unique_name;
  if (item.quality === 5 && item.set_name) return item.set_name;
  if (item.quality === 7 && item.unique_name) return item.unique_name;
  if (item.unique_name) return item.unique_name;
  if (item.set_name) return item.set_name;
  const rare = [item.rare_name, item.rare_name2].filter(Boolean).join(' ');
  if (rare) return rare;
  const prefix = item.magic_prefix_name || '';
  const suffix = item.magic_suffix_name || '';
  if (prefix && suffix) return `${prefix} ${baseType} ${suffix}`;
  if (prefix) return `${prefix} ${baseType}`;
  if (suffix) return `${baseType} ${suffix}`;
  return baseType;
}

export function formatStat(attribute = {}) {
  const numericId = Number(attribute?.id);
  const values = Array.isArray(attribute.values) ? attribute.values.map(Number) : [];
  const description = clean(attribute.description);
  const malformedLegacyDescription = /%[+]?d|^(?:AddSkillTab|AddClassSkills|SingleSkill|NonClassSkill):/i.test(description);
  if (description && !malformedLegacyDescription) return description;
  const rawValue = values[0];

  // Scale fixed-point life/mana/stamina
  if ([6, 7, 8, 9, 10, 11].includes(numericId) && Number.isFinite(rawValue) && Math.abs(rawValue) >= 256 && rawValue % 256 === 0) {
    const label = numericId === 6 || numericId === 7 ? 'Life' : numericId === 8 || numericId === 9 ? 'Mana' : 'Stamina';
    return (rawValue >= 0 ? '+' : '') + (rawValue / 256) + ' ' + label;
  }

  const normalizedName = String(attribute?.name || '').toLowerCase().replace(/_/g, '');
  if (normalizedName.endsWith('addskilltab')) {
    let packedLayer = Number.isFinite(Number(attribute.layer)) ? Number(attribute.layer) : null;
    let bonus = values.at(-1) || 0;

    // Legacy parser format: values were [tab, class, bonus].
    if (packedLayer === null && values.length >= 3 && values[0] >= 0 && values[0] < 8 && values[1] >= 0) {
      packedLayer = (values[1] << 3) | values[0];
    }
    // Some older vault entries embedded the packed value in their description.
    if (packedLayer === null) {
      const match = String(attribute.description || '').match(/(?:tab|to)\s+(\d+)/i);
      if (match) packedLayer = Number(match[1]);
    }
    if (packedLayer !== null) {
      return formatSkillTab(bonus, packedLayer);
    }
  }

  const classNames = {
    0: 'Amazon', 1: 'Sorceress', 2: 'Necromancer', 3: 'Paladin', 
    4: 'Barbarian', 5: 'Druid', 6: 'Assassin'
  };

  if (normalizedName.endsWith('addclassskills')) {
    let layer = Number.isFinite(Number(attribute.layer)) ? Number(attribute.layer) : null;
    let val = values.at(-1) || 0;
    if (layer === null && values.length >= 2) {
      layer = values[0];
    }
    if (layer !== null && classNames[layer]) {
      const amount = val >= 0 ? `+${val}` : val;
      return `${amount} to ${classNames[layer]} Skill Levels`;
    }
  }

  const skillNames = {
    59: 'Blizzard (Sorceress Only)', 
    61: 'Fire Mastery (Sorceress Only)', 
    63: 'Lightning Mastery (Sorceress Only)', 
    65: 'Cold Mastery (Sorceress Only)', 
    91: 'Lower Resist'
  };

  if (normalizedName.endsWith('singleskill') || normalizedName.endsWith('nonclassskill')) {
    let layer = Number.isFinite(Number(attribute.layer)) ? Number(attribute.layer) : null;
    let val = values.at(-1) || 0;
    if (layer === null && values.length >= 2) {
      layer = values[0];
    }
    if (layer !== null && skillNames[layer]) {
      const amount = val >= 0 ? `+${val}` : val;
      return `${amount} to ${skillNames[layer]}`;
    }
  }


  const value = values.length === 1 ? values[0] : values.join(', ');
  const entry = statLabels[numericId];

  if (!entry) {
    const nameStr = clean(attribute.name || attribute.label || 'Stat');
    const humanized = nameStr.replace(/^item_/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const finalName = humanized.charAt(0).toUpperCase() + humanized.slice(1);
    return `${finalName}: ${value}`;
  }

  const [label, hasValue] = entry;
  if (!hasValue) return label;
  const numeric = Number(value);
  const formatted = Number.isFinite(numeric) && numeric >= 0 ? `+${value}` : value;
  return `${formatted} ${label}`.replace(/^\+0 /, '');
}

export function groupItemStats(attrs) {
  let res = [...attrs];

  const getVal = id => Number((res.find(a => Number(a.id) === id) || {values:[0]}).values[0] || 0);

  // Group All Resistances
  const vF = getVal(39);
  const vL = getVal(41);
  const vC = getVal(43);
  const vP = getVal(45);

  if (vF > 0 && vL > 0 && vC > 0 && vP > 0) {
    const minRes = Math.min(vF, vL, vC, vP);
    const idxs = [39, 41, 43, 45].map(id => res.findIndex(a => Number(a.id) === id)).filter(i => i >= 0);
    const insertIdx = Math.min(...idxs);

    res = res.map(a => {
      const numId = Number(a.id);
      if ([39, 41, 43, 45].includes(numId)) {
        const newVal = Number(a.values[0] || 0) - minRes;
        if (newVal <= 0) return null;
        return { ...a, values: [newVal] };
      }
      return a;
    }).filter(Boolean);

    res.splice(insertIdx, 0, { id: 'allresist', description: `All Resistances +${minRes}` });
  }

  // Group All Attributes
  const vS = getVal(0);
  const vE = getVal(1);
  const vD = getVal(2);
  const vV = getVal(3);

  if (vS > 0 && vE > 0 && vD > 0 && vV > 0) {
    const minAttr = Math.min(vS, vE, vD, vV);
    const idxs = [0, 1, 2, 3].map(id => res.findIndex(a => Number(a.id) === id)).filter(i => i >= 0);
    const insertIdx = Math.min(...idxs);

    res = res.map(a => {
      const numId = Number(a.id);
      if ([0, 1, 2, 3].includes(numId)) {
        const newVal = Number(a.values[0] || 0) - minAttr;
        if (newVal <= 0) return null;
        return { ...a, values: [newVal] };
      }
      return a;
    }).filter(Boolean);

    res.splice(insertIdx, 0, { id: 'allattr', description: `All Attributes +${minAttr}` });
  }

  return res;
}

function hasEtherealRawFlag(rawBytesHex) {
  const hex = typeof rawBytesHex === 'string' ? rawBytesHex.trim() : '';
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return false;

  // D2R items begin with flags; legacy JM items begin with 4a4d and
  // store flags immediately after that two-byte marker.
  const flagsHex = /^4a4d/i.test(hex) ? hex.slice(4, 12) : hex.slice(0, 8);
  if (flagsHex.length !== 8) return false;
  const flags = Number.parseInt(flagsHex.match(/../g).reverse().join(''), 16);
  return Number.isFinite(flags) && (flags & 0x00400000) !== 0;
}

export function isItemEthereal(item = {}) {
  return Boolean(item.ethereal || item.is_ethereal || hasEtherealRawFlag(item.rawBytesHex));
}

export function getItemDetails(item = {}) {
  const details = [];
  if (item.defense_rating != null || item.defense != null) details.push(`Defense: ${item.defense_rating ?? item.defense}`);
  if (item.current_durability != null || item.durability != null) {
    const max = item.max_durability ?? item.maxDurability;
    details.push(`Durability: ${item.current_durability ?? item.durability}${max != null ? ` of ${max}` : ''}`);
  }
  if (item.quantity != null) details.push(`Quantity: ${item.quantity}`);
  if (isItemEthereal(item)) details.push('Ethereal');
  if (item.item_level != null || item.level != null) details.push(`Item Level: ${item.item_level ?? item.level}`);
  return details;
}

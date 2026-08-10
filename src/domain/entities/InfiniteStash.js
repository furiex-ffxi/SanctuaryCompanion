// InfiniteStash.js - Vault persistence and catalog domain logic

const STORAGE_KEY = 'sanctuary_infinite_stash_v1';

export const ITEM_CATEGORIES = {
  WEAPON: 'Weapons',
  ARMOR: 'Armor',
  JEWELRY: 'Rings & Amulets',
  CHARM: 'Charms',
  RUNE_GEM: 'Runes & Gems',
  SET: 'Set Items',
  UNIQUE: 'Unique Items',
  OTHER: 'Other / Misc',
};

export function getVaultItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read vault items:', err);
    return [];
  }
}

export async function fetchVaultFromDisk() {
  try {
    const res = await fetch('/__vault_read');
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items)) {
        saveVaultItems(items);
        return items;
      }
    }
  } catch (err) {
    console.error('Disk vault fetch failed, using local storage fallback:', err);
  }
  return getVaultItems();
}

export function saveVaultItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    fetch('/__vault_write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    }).catch((err) => console.error('Disk vault write error:', err));
  } catch (err) {
    console.error('Failed to save vault items:', err);
  }
}

export function addVaultItem(item, sourceSave = 'Manual Upload') {
  const current = getVaultItems();
  const vaultId = 'stash_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const entry = {
    vaultId,
    stashedAt: new Date().toISOString(),
    sourceSave,
    itemData: item,
  };
  const updated = [entry, ...current];
  saveVaultItems(updated);
  return updated;
}

export function removeVaultItem(vaultId) {
  const current = getVaultItems();
  const updated = current.filter((i) => i.vaultId !== vaultId);
  saveVaultItems(updated);
  return updated;
}

export function clearVaultItems() {
  saveVaultItems([]);
  return [];
}

export function exportVaultJSON() {
  const items = getVaultItems();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(items, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `sanctuary_infinite_stash_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function importVaultJSON(jsonData) {
  if (!Array.isArray(jsonData)) {
    throw new Error('Invalid JSON format: Expected an array of stashed items.');
  }
  const current = getVaultItems();
  const existingVaultIds = new Set(current.map((i) => i.vaultId));
  
  let addedCount = 0;
  const merged = [...current];

  for (const entry of jsonData) {
    if (!entry.itemData) continue;
    let vId = entry.vaultId;
    if (!vId || existingVaultIds.has(vId)) {
      vId = 'stash_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    existingVaultIds.add(vId);
    merged.unshift({
      ...entry,
      vaultId: vId,
      stashedAt: entry.stashedAt || new Date().toISOString(),
    });
    addedCount++;
  }

  saveVaultItems(merged);
  return { updated: merged, addedCount };
}

import { constants as constants99 } from './static_constant_data.js';

export function getItemSlotCategory(item) {
  if (!item) return 'Misc';
  const type = (item.type || '').toLowerCase().trim();

  // 1. Jewellery, Charms, Runes & Gems
  if (type === 'rin') return 'Ring';
  if (type === 'amu') return 'Amulet';
  if (type === 'jew') return 'Jewel';
  if (type === 'cm1') return 'Small Charm';
  if (type === 'cm2') return 'Large Charm';
  if (type === 'cm3') return 'Grand Charm';
  if (/^r\d+$/.test(type)) return 'Rune';
  if (/^gp/.test(type) || ['gcv','gcb','gcg','gcr','gcw','gcy','skc','skb','skg','skr','skw','sky'].includes(type)) return 'Gem';

  // 2. Query @dschu012/d2s constants table for Helmets / Torso / Gloves / Boots / Belts / Shields
  if (['cap','skp','hlm','fhl','ghm','crn','msk','bhm','phm','dr1','dr2','dr3','dr4','dr5','ba1','ba2','ba3','ba4','ba5','xap','xkp','xlm','xhl','xhm','xrn','xsk','xhm','xr1','xr2','xr3','xr4','xr5','xa1','xa2','xa3','xa4','xa5','uap','ukp','ulm','uhl','uhm','urn','usk','uhm','ur1','ur2','ur3','ur4','ur5','ua1','ua2','ua3','ua4','ua5'].includes(type)) {
    return 'Head';
  }
  if (['qui','lea','hla','stu','rng','scl','chn','brs','spl','plt','fld','gth','full','gth','ltp','ful','aar','ltp','xui','xea','xla','xtu','xng','xcl','xhn','xrs','xpl','xlt','xfd','xth','xar','xlp','xul','xar','xlp','uui','uea','ula','utu','ung','ucl','uhn','urs','upl','ult','ufd','uth','uar','ulp','uul','uar','ulp'].includes(type)) {
    return 'Torso';
  }
  if (['lgl','vgl','mgl','tgl','hgl','xgl','xgv','xmg','xtg','xhg','ugl','ugv','umg','utg','uhg'].includes(type)) {
    return 'Gloves';
  }
  if (['lbt','vbt','mbt','tbt','hbt','xbt','xvb','xmb','xtb','xhb','ubt','uvb','umb','utb','uhb'].includes(type)) {
    return 'Boots';
  }
  if (['lbl','vbl','mbl','tbl','hbl','zlb','zvb','zmb','ztb','zhb','ulc','ulv','ulm','ult','ulh'].includes(type)) {
    return 'Belt';
  }
  if (['buc','sml','lrg','kit','tsh','gts','bsh','spk','bld','pa1','pa2','pa3','pa4','pa5','ne1','ne2','ne3','ne4','ne5','xuc','xml','xrg','xit','xsh','xts','xsh','xpk','xld','xp1','xp2','xp3','xp4','xp5','xn1','xn2','xn3','xn4','xn5','uuc','uml','urg','uit','ush','uts','ush','upk','uld','up1','up2','up3','up4','up5','un1','un2','un3','un4','un5'].includes(type)) {
    return 'Shield';
  }

  // 3. Query @dschu012/d2s weapons dictionary table directly
  if (constants99.weapons && (constants99.weapons[item.type] || constants99.weapons[type])) {
    return 'Weapon';
  }

  // 4. Query @dschu012/d2s armor dictionary table directly
  if (constants99.armor && (constants99.armor[item.type] || constants99.armor[type])) {
    return 'Armor';
  }

  // Fallback for runeword base types or custom items
  if (item.given_runeword_name || item.runeword_name) {
    if (item.type_name && (item.type_name.includes('Armor') || item.type_name.includes('Shield') || item.type_name.includes('Helm'))) {
      return 'Armor';
    }
    return 'Weapon';
  }

  return item.type_name || 'Misc';
}

export function extractUniqueSetsAndSlots(vaultEntries) {
  const setNames = new Set();
  const slots = new Set();
  const categories = new Set(['All', ...Object.values(ITEM_CATEGORIES)]);

  for (const entry of vaultEntries) {
    const item = entry.itemData;
    if (!item) continue;

    if (item.set_name) {
      setNames.add(item.set_name);
    }
    const slot = getItemSlotCategory(item);
    if (slot) slots.add(slot);
  }

  return {
    setNames: Array.from(setNames).sort(),
    slots: Array.from(slots).sort(),
    categories: Array.from(categories),
  };
}

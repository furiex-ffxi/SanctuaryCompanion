import React, { useEffect, useState } from 'react';

// Rune names & Nordic/D2 glyph representations
const RUNE_GLYPHS = {
  r01: { name: 'El', glyph: 'á›–' },
  r02: { name: 'Eld', glyph: 'á›š' },
  r03: { name: 'Tir', glyph: 'á›' },
  r04: { name: 'Nef', glyph: 'áš¾' },
  r05: { name: 'Eth', glyph: 'á›–' },
  r06: { name: 'Ith', glyph: 'á›' },
  r07: { name: 'Tal', glyph: 'á›' },
  r08: { name: 'Ral', glyph: 'áš±' },
  r09: { name: 'Ort', glyph: 'á›' },
  r10: { name: 'Thul', glyph: 'áš¦' },
  r11: { name: 'Amn', glyph: 'á›˜' },
  r12: { name: 'Sol', glyph: 'á›‹' },
  r13: { name: 'Shael', glyph: 'á›‹' },
  r14: { name: 'Dol', glyph: 'á›ž' },
  r15: { name: 'Hel', glyph: 'áš¼' },
  r16: { name: 'Io', glyph: 'á›' },
  r17: { name: 'Lum', glyph: 'á›š' },
  r18: { name: 'Ko', glyph: 'áš²' },
  r19: { name: 'Fal', glyph: 'áš ' },
  r20: { name: 'Lem', glyph: 'á›š' },
  r21: { name: 'Pul', glyph: 'á›ˆ' },
  r22: { name: 'Um', glyph: 'áš¢' },
  r23: { name: 'Mal', glyph: 'á›˜' },
  r24: { name: 'Ist', glyph: 'á›' },
  r25: { name: 'Gul', glyph: 'áš·' },
  r26: { name: 'Vex', glyph: 'áš ' },
  r27: { name: 'Ohm', glyph: 'áš©' },
  r28: { name: 'Lo', glyph: 'á›š' },
  r29: { name: 'Sur', glyph: 'á›‹' },
  r30: { name: 'Ber', glyph: 'á›’' },
  r31: { name: 'Jah', glyph: 'á›ƒ' },
  r32: { name: 'Cham', glyph: 'áš²' },
  r33: { name: 'Zod', glyph: 'á›‰' },
};

// Gem colors mapped by gem letter (w=Diamond, r=Ruby, b=Sapphire, g=Emerald, y=Topaz, a=Amethyst, sk=Skull)
const getGemColor = (type) => {
  const t = (type || '').toLowerCase();
  if (t.endsWith('w')) return '#ffffff'; // Diamond
  if (t.endsWith('r')) return '#ff3333'; // Ruby
  if (t.endsWith('b')) return '#3388ff'; // Sapphire
  if (t.endsWith('g')) return '#33cc33'; // Emerald
  if (t.endsWith('y')) return '#ffcc00'; // Topaz
  if (t.endsWith('a')) return '#aa33ff'; // Amethyst
  if (t.startsWith('sk')) return '#dddddd'; // Skull
  return '#ffcc00';
};

const isGemType = (type) => {
  const t = (type || '').toLowerCase();
  return /^(gp|gl|gs|gf|gc|sk)/.test(t);
};


import { constants as constants99 } from '../domain/entities/static_constant_data.js';

export const getBaseTypeName = (type) => {
  const t = (type || '').toLowerCase().trim();
  const itemData = constants99.weapon_items[t] || constants99.armor_items[t] || constants99.other_items[t];
  return itemData?.n || itemData?.nc || type;
};

export const getItemDisplayName = (item) => {
  if (!item) return '';
  if (item.runeword_name) return item.runeword_name;

  const typeName = item.type_name && item.type_name.toLowerCase() !== (item.type || '').toLowerCase()
    ? item.type_name
    : null;
  const baseType = typeName || getBaseTypeName(item.type) || 'Item';

  // D2R set items carry both the individual piece name (unique_name) and the
  // set/family name (set_name). The piece name is what the game shows as the
  // item's primary name; combining the family with an internal type code made
  // labels such as "Trang-Oul's Avatar uh9".
  if (item.quality === 5 && item.unique_name) return item.unique_name;
  if (item.quality === 5 && item.set_name) return item.set_name;
  if (item.quality === 7 && item.unique_name) return item.unique_name;
  if (item.unique_name) return item.unique_name;
  if (item.set_name) return item.set_name;
  
  const rare = [item.rare_name, item.rare_name2].filter(Boolean).join(' ');
  if (rare) return rare;

  const prefix = item.magic_prefix_name || '';
  const suffix = item.magic_suffix_name || '';

  if (prefix && suffix) {
    return `${prefix} ${baseType} ${suffix}`;
  }
  if (prefix) {
    return `${prefix} ${baseType}`;
  }
  if (suffix) {
    return `${baseType} ${suffix}`;
  }

  return baseType;
};


export default function ItemSprite({ item }) {
  const [imgError, setImgError] = useState(false);
  const invFile = (item?.image_key || item?.inv_file)?.toLowerCase();

  useEffect(() => {
    setImgError(false);
  }, [invFile]);

  if (!item) return null;

  const type = (item.type || '').toLowerCase();
  const isRune = /^r\d+$/.test(type);
  const runeInfo = isRune ? RUNE_GLYPHS[type] : null;

  const name = getItemDisplayName(item);


  // Quality border color
  let qualityColor = '#888';
  if (item.runeword_name) qualityColor = '#d0b070';
  else if (item.quality === 7 || item.quality === 8) qualityColor = '#a88858'; // Unique / Crafted
  else if (item.quality === 6) qualityColor = '#e8c838'; // Rare
  else if (item.quality === 5) qualityColor = '#18a018'; // Set
  else if (item.quality === 4) qualityColor = '#4850b8'; // Magic

  // 1. Try loading image file if available and not errored
  if (invFile && !imgError) {
    return (
      <div className="item-sprite-wrapper" style={{ borderColor: qualityColor }}>
        <div className="item-sprite-container">
          <img
            src={`/items/${encodeURIComponent(invFile)}.png`}
            alt={name}
            className="item-sprite-img"
            onError={() => setImgError(true)}
          />
          {item.socketed_items?.length > 0 && (
            <span className="sprite-socket-badge">({item.socketed_items.length})</span>
          )}
        </div>
        <span className="item-sprite-name" style={{ color: qualityColor }}>{name}</span>
      </div>
    );
  }

  // 2. Dynamic Fallback Graphic Engine
  return (
    <div className="item-sprite-wrapper fallback-sprite" style={{ borderColor: qualityColor }}>
      {isRune ? (
        <div className="rune-sprite">
          <div className="rune-stone">
            <span className="rune-glyph">{runeInfo?.glyph || 'á›'}</span>
          </div>
          <span className="rune-label">{runeInfo?.name || type.toUpperCase()}</span>
        </div>
      ) : isGemType(type) ? (
        <div className="gem-sprite" style={{ backgroundColor: getGemColor(type) }}>
          <div className="gem-facet" />
        </div>

      ) : type.startsWith('cm') ? (
        <div className={`charm-sprite charm-${type}`}>
          <div className="charm-pattern" />
          <span className="charm-label">{type.toUpperCase()}</span>
        </div>
      ) : type && ['hp5','mp5','rvs','rvl'].includes(type) ? (
        <div className={`potion-sprite potion-${type}`}>
          <div className="potion-cork" />
          <div className="potion-liquid" />
        </div>
      ) : type && ['tbk','ibk'].includes(type) ? (
        <div className="tome-sprite">
          <div className="tome-clasp" />
          <span className="tome-label">{type === 'tbk' ? 'TP' : 'ID'}</span>
        </div>
      ) : type === 'rin' ? (
        <div className="ring-sprite">
          <div className="ring-gem" />
        </div>
      ) : type === 'amu' ? (
        <div className="amulet-sprite">
          <div className="amulet-chain" />
          <div className="amulet-pendant" />
        </div>
      ) : item.equipped_id === 1 || ['cap','skp','hlm','fhl','ghm','crn','msk','bhm','xap','xkp','xlm','xhl','xhm','xrn','xsk','xh9','uap','ukp','ulm','uhl','uhm','urn','usk','uh9','dr1','dr2','dr3','dr4','dr5','ba1','ba2','ba3','ba4','ba5'].includes(type) ? (
        <div className="helm-fallback-sprite">
          <svg className="helm-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 6 C18 6 12 18 12 32 C12 44 20 54 32 58 C44 54 52 44 52 32 C52 18 46 6 32 6 Z" fill="url(#helmGrad)" stroke="#c0a060" strokeWidth="2"/>
            <path d="M20 28 H44 M32 20 V44 M26 34 L38 34" stroke="#e8c838" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="32" cy="18" r="3" fill="#30a0d0" />
            <defs>
              <linearGradient id="helmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3a2e24"/>
                <stop offset="100%" stopColor="#140e0a"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="item-sprite-name" style={{ color: qualityColor }}>{name}</span>
          {item.socketed_items?.length > 0 && (
            <span className="sprite-socket-badge">({item.socketed_items.length})</span>
          )}
        </div>
      ) : item.equipped_id === 5 || item.equipped_id === 12 || ['bsh','uml','xml','kit','sml','buc','spl','rnd','lrg','kbt','kit','lkt','mxs','hxs','nef','gow','ow1','ow2','ow3','ow4','ow5','pa1','pa2','pa3','pa4','pa5'].includes(type) ? (
        <div className="shield-fallback-sprite">
          <svg className="shield-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 10 L52 10 L48 38 L32 56 L16 38 Z" fill="url(#shieldGrad)" stroke="#c0a060" strokeWidth="2"/>
            <path d="M32 14 V48 M20 26 H44" stroke="#c0a060" strokeWidth="1.5" strokeDasharray="2 2"/>
            <polygon points="32,20 38,28 32,36 26,28" fill="#d0b070" stroke="#fff" strokeWidth="1"/>
            <defs>
              <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2c241c"/>
                <stop offset="100%" stopColor="#0d0907"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="item-sprite-name" style={{ color: qualityColor }}>{name}</span>
          {item.socketed_items?.length > 0 && (
            <span className="sprite-socket-badge">({item.socketed_items.length})</span>
          )}
        </div>
      ) : (
        <div className="generic-item-sprite">
          <span className="item-badge-name" style={{ color: qualityColor }}>{name}</span>
          {item.socketed_items?.length > 0 && (
            <span className="sprite-socket-badge">({item.socketed_items.length})</span>
          )}
        </div>
      )}
    </div>
  );
}

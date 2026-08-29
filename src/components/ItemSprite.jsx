import React, { useEffect, useState } from 'react';

// Rune names & Nordic/D2 glyph representations
const RUNE_GLYPHS = {
  r01: { name: 'El', glyph: '*' },
  r02: { name: 'Eld', glyph: '*' },
  r03: { name: 'Tir', glyph: '*' },
  r04: { name: 'Nef', glyph: '*' },
  r05: { name: 'Eth', glyph: '*' },
  r06: { name: 'Ith', glyph: '*' },
  r07: { name: 'Tal', glyph: '*' },
  r08: { name: 'Ral', glyph: '*' },
  r09: { name: 'Ort', glyph: '*' },
  r10: { name: 'Thul', glyph: '*' },
  r11: { name: 'Amn', glyph: '*' },
  r12: { name: 'Sol', glyph: '*' },
  r13: { name: 'Shael', glyph: '*' },
  r14: { name: 'Dol', glyph: '*' },
  r15: { name: 'Hel', glyph: '*' },
  r16: { name: 'Io', glyph: '*' },
  r17: { name: 'Lum', glyph: '*' },
  r18: { name: 'Ko', glyph: '*' },
  r19: { name: 'Fal', glyph: '*' },
  r20: { name: 'Lem', glyph: '*' },
  r21: { name: 'Pul', glyph: '*' },
  r22: { name: 'Um', glyph: '*' },
  r23: { name: 'Mal', glyph: '*' },
  r24: { name: 'Ist', glyph: '*' },
  r25: { name: 'Gul', glyph: '*' },
  r26: { name: 'Vex', glyph: '*' },
  r27: { name: 'Ohm', glyph: '*' },
  r28: { name: 'Lo', glyph: '*' },
  r29: { name: 'Sur', glyph: '*' },
  r30: { name: 'Ber', glyph: '*' },
  r31: { name: 'Jah', glyph: '*' },
  r32: { name: 'Cham', glyph: '*' },
  r33: { name: 'Zod', glyph: '*' },
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

export const getItemSocketCount = (item = {}) => {
  const total = Number(item.total_nr_of_sockets);
  if (Number.isFinite(total) && total >= 0) return total;
  return Array.isArray(item.socketed_items) ? item.socketed_items.length : 0;
};


export const getBaseTypeName = (type) => getItemTypeDisplayName({ type, type_name: type });

import { getDiabloColorFilter } from './itemColorTransforms.js';
import WORLDSTONE_SHARD_DATA_URLS from './worldstoneShardAssets.js';
import { getItemDisplayName, getItemTypeDisplayName, isItemEthereal } from '../domain/entities/ItemDisplay.js';

export { getItemDisplayName } from '../domain/entities/ItemDisplay.js';

export default function ItemSprite({ item }) {
  const [imgError, setImgError] = useState(false);
  const type = (item?.type || '').toLowerCase();
  const isSunderCharm = type === 'cs2' || (item?.magic_attributes || []).some((attribute) => [187, 189, 190, 191, 192, 193].includes(Number(attribute?.id)));
  const invFile = isSunderCharm ? 'invch3' : (item?.image_key || item?.inv_file)?.toLowerCase();
  const transformFilter = getDiabloColorFilter(item?.transform_color);
  const socketCount = getItemSocketCount(item);
  const isEthereal = isItemEthereal(item);

  useEffect(() => {
    setImgError(false);
  }, [invFile]);

  if (!item) return null;

  const isRune = /^r\d+$/.test(type);
  const runeInfo = isRune ? RUNE_GLYPHS[type] : null;

  const name = getItemDisplayName(item);
  const assetVersion = invFile?.startsWith('inv_worldstone_shard_') ? '?v=2' : '';
  const embeddedAsset = invFile ? WORLDSTONE_SHARD_DATA_URLS[invFile] : null;
  const imagePath = embeddedAsset || `/__d2r_item_image/${encodeURIComponent(invFile)}.png${assetVersion}`;


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
      <div className={`item-sprite-wrapper${isEthereal ? ' ethereal-item-sprite' : ''}`} style={{ borderColor: qualityColor }}>
        <div className="item-sprite-container">
          <img
            src={imagePath}
            alt={name}
            className="item-sprite-img"
            decoding="async"
            style={{ ...(transformFilter ? { filter: transformFilter } : {}), ...(isEthereal ? { opacity: 0.35 } : {}) }}
            onError={() => setImgError(true)}
          />
          {socketCount > 0 && (
            <span className="sprite-socket-badge">({socketCount})</span>
          )}
        </div>
        <span className="item-sprite-name" style={{ color: qualityColor }}>{name}</span>
      </div>
    );
  }

  // 2. Dynamic Fallback Graphic Engine
  return (
    <div className={`item-sprite-wrapper fallback-sprite${isEthereal ? ' ethereal-item-sprite' : ''}`} style={{ borderColor: qualityColor }}>
      {isRune ? (
        <div className="rune-sprite">
          <div className="rune-stone">
            <span className="rune-glyph">{runeInfo?.glyph || '*'}</span>
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
          {socketCount > 0 && (
            <span className="sprite-socket-badge">({socketCount})</span>
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
          {socketCount > 0 && (
            <span className="sprite-socket-badge">({socketCount})</span>
          )}
        </div>
      ) : (
        <div className="generic-item-sprite">
          <span className="item-badge-name" style={{ color: qualityColor }}>{name}</span>
          {socketCount > 0 && (
            <span className="sprite-socket-badge">({socketCount})</span>
          )}
        </div>
      )}
    </div>
  );
}

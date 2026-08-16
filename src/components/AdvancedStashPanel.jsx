import React from 'react';
import ItemSprite from './ItemSprite';
import { ItemTooltip } from './ItemTooltip';

const RUNE_CODES = Array.from({ length: 33 }, (_, i) => `r${(i + 1).toString().padStart(2, '0')}`);
const GEM_CODES = [
  'gcv', 'gfv', 'gsv', 'gzv', 'gpv', // Amethyst
  'gcy', 'gfy', 'gsy', 'gly', 'gpy', // Topaz
  'gcb', 'gfb', 'gsb', 'glb', 'gpb', // Sapphire
  'gcg', 'gfg', 'gsg', 'glg', 'gpg', // Emerald
  'gcr', 'gfr', 'gsr', 'glr', 'gpr', // Ruby
  'gcw', 'gfw', 'gsw', 'glw', 'gpw', // Diamond
  'skc', 'skf', 'sku', 'skl', 'skz', // Skull
];
const MATERIAL_CODES = [
  'xa1', 'xa2', 'xa3', 'xa4', 'xa5',
  'toa', 'tes', 'ceh', 'bet', 'fed',
  'pk1', 'pk2', 'pk3',
  'dhn', 'bey', 'mbr',
  'rvs', 'rvl'
];

const ADVANCED_STASH_SECTIONS = [
  { title: 'Runes', codes: RUNE_CODES },
  { title: 'Gems', codes: GEM_CODES },
  { title: 'Materials', codes: MATERIAL_CODES },
];

const ITEM_METADATA = {
  // Runes
  r01: { n: 'El Rune', img: 'invrel' }, r02: { n: 'Eld Rune', img: 'invreld' }, r03: { n: 'Tir Rune', img: 'invrtir' }, r04: { n: 'Nef Rune', img: 'invrnef' }, r05: { n: 'Eth Rune', img: 'invreth' },
  r06: { n: 'Ith Rune', img: 'invrith' }, r07: { n: 'Tal Rune', img: 'invrtal' }, r08: { n: 'Ral Rune', img: 'invrral' }, r09: { n: 'Ort Rune', img: 'invrort' }, r10: { n: 'Thul Rune', img: 'invrthul' },
  r11: { n: 'Amn Rune', img: 'invramn' }, r12: { n: 'Sol Rune', img: 'invrsol' }, r13: { n: 'Shael Rune', img: 'invrshae' }, r14: { n: 'Dol Rune', img: 'invrdol' }, r15: { n: 'Hel Rune', img: 'invrhel' },
  r16: { n: 'Io Rune', img: 'invrio' }, r17: { n: 'Lum Rune', img: 'invrlum' }, r18: { n: 'Ko Rune', img: 'invrko' }, r19: { n: 'Fal Rune', img: 'invrfal' }, r20: { n: 'Lem Rune', img: 'invrlem' },
  r21: { n: 'Pul Rune', img: 'invrpul' }, r22: { n: 'Um Rune', img: 'invrum' }, r23: { n: 'Mal Rune', img: 'invrmal' }, r24: { n: 'Ist Rune', img: 'invrist' }, r25: { n: 'Gul Rune', img: 'invrgul' },
  r26: { n: 'Vex Rune', img: 'invrvex' }, r27: { n: 'Ohm Rune', img: 'invrohm' }, r28: { n: 'Lo Rune', img: 'invrlo' }, r29: { n: 'Sur Rune', img: 'invrsur' }, r30: { n: 'Ber Rune', img: 'invrber' },
  r31: { n: 'Jah Rune', img: 'invrjo' }, r32: { n: 'Cham Rune', img: 'invrcham' }, r33: { n: 'Zod Rune', img: 'invrzod' },
  // Gems
  gcv: { n: 'Chipped Amethyst', img: 'inv_amethyst_chipped' }, gfv: { n: 'Flawed Amethyst', img: 'inv_amethyst_flawed' }, gsv: { n: 'Amethyst', img: 'inv_amethyst_standard' }, gzv: { n: 'Flawless Amethyst', img: 'inv_amethyst_flawless' }, gpv: { n: 'Perfect Amethyst', img: 'inv_amethyst_perfect' },
  gcy: { n: 'Chipped Topaz', img: 'inv_topaz_chipped' }, gfy: { n: 'Flawed Topaz', img: 'inv_topaz_flawed' }, gsy: { n: 'Topaz', img: 'inv_topaz_standard' }, gly: { n: 'Flawless Topaz', img: 'inv_topaz_flawless' }, gpy: { n: 'Perfect Topaz', img: 'inv_topaz_perfect' },
  gcb: { n: 'Chipped Sapphire', img: 'inv_sapphire_chipped' }, gfb: { n: 'Flawed Sapphire', img: 'inv_sapphire_flawed' }, gsb: { n: 'Sapphire', img: 'inv_sapphire_standard' }, glb: { n: 'Flawless Sapphire', img: 'inv_sapphire_flawless' }, gpb: { n: 'Perfect Sapphire', img: 'inv_sapphire_perfect' },
  gcg: { n: 'Chipped Emerald', img: 'inv_emerald_chipped' }, gfg: { n: 'Flawed Emerald', img: 'inv_emerald_flawed' }, gsg: { n: 'Emerald', img: 'inv_emerald_standard' }, glg: { n: 'Flawless Emerald', img: 'inv_emerald_flawless' }, gpg: { n: 'Perfect Emerald', img: 'inv_emerald_perfect' },
  gcr: { n: 'Chipped Ruby', img: 'inv_ruby_chipped' }, gfr: { n: 'Flawed Ruby', img: 'inv_ruby_flawed' }, gsr: { n: 'Ruby', img: 'inv_ruby_standard' }, glr: { n: 'Flawless Ruby', img: 'inv_ruby_flawless' }, gpr: { n: 'Perfect Ruby', img: 'inv_ruby_perfect' },
  gcw: { n: 'Chipped Diamond', img: 'inv_diamond_chipped' }, gfw: { n: 'Flawed Diamond', img: 'inv_diamond_flawed' }, gsw: { n: 'Diamond', img: 'inv_diamond_standard' }, glw: { n: 'Flawless Diamond', img: 'inv_diamond_flawless' }, gpw: { n: 'Perfect Diamond', img: 'inv_diamond_perfect' },
  skc: { n: 'Chipped Skull', img: 'inv_skull_chipped' }, skf: { n: 'Flawed Skull', img: 'inv_skull_flawed' }, sku: { n: 'Skull', img: 'inv_skull_standard' }, skl: { n: 'Flawless Skull', img: 'inv_skull_flawless' }, skz: { n: 'Perfect Skull', img: 'inv_skull_perfect' },
  // Materials
  xa1: { n: 'Western Worldstone Shard', img: 'none' }, xa2: { n: 'Eastern Worldstone Shard', img: 'none' }, xa3: { n: 'Southern Worldstone Shard', img: 'none' }, xa4: { n: 'Deep Worldstone Shard', img: 'none' }, xa5: { n: 'Northern Worldstone Shard', img: 'none' },
  toa: { n: 'Token of Absolution', img: 'inv_token_absolution' }, tes: { n: 'Twisted Essence of Suffering', img: 'inv_twisted_essence' }, ceh: { n: 'Charged Essence of Hatred', img: 'inv_charged_essence' }, bet: { n: 'Burning Essence of Terror', img: 'inv_burning_essence' }, fed: { n: 'Festering Essence of Destruction', img: 'inv_festering_essence' },
  pk1: { n: 'Key of Terror', img: 'inv_key_terror' }, pk2: { n: 'Key of Hate', img: 'inv_key_hate' }, pk3: { n: 'Key of Destruction', img: 'inv_key_destruction' },
  dhn: { n: "Diablo's Horn", img: 'inv_diablo_horn' }, bey: { n: "Baal's Eye", img: 'inv_baal_eye' }, mbr: { n: "Mephisto's Brain", img: 'inv_mephisto_brain' },
  rvs: { n: 'Rejuvenation Potion', img: 'invrvs' }, rvl: { n: 'Full Rejuvenation Potion', img: 'invrvl' },
};

export function AdvancedStashPanel({ items, onDeposit, highlightIdentity }) {
  const itemsByCode = {};
  for (const item of items) {
    const code = item.type.trim().toLowerCase();
    itemsByCode[code] = item;
  }

  return (
    <div className="advanced-stash-panel">
      {ADVANCED_STASH_SECTIONS.map((section) => (
        <div key={section.title} className="advanced-stash-section">
          <h3 className="section-title">{section.title}</h3>
          <div className="advanced-stash-grid">
            {section.codes.map((code) => {
              const item = itemsByCode[code];
              const count = item?.advanced_stash_stack_size || 0;
              const isEmpty = count === 0;
              const defaultMeta = ITEM_METADATA[code] || {};
              const typeName = item?.type_name || defaultMeta.n || code;
              const imageKey = defaultMeta.img === 'none' ? 'none' : (item?.image_key || defaultMeta.img);
              const displayItem = item ? { ...item, image_key: imageKey } : { type: code, image_key: imageKey, type_name: typeName };

              return (
                <div 
                  key={code} 
                  className={`advanced-stash-tile ${isEmpty ? 'empty' : 'filled'}`}
                  title={typeName}
                >
                  <div className="tile-image" style={{ opacity: isEmpty ? 0.3 : 1 }}>
                    <ItemSprite item={displayItem} />
                  </div>
                  <div className="tile-info">
                    <div className="tile-name">{typeName}</div>
                    <div className="tile-count">x{count}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

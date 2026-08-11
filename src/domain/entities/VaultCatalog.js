import { constants as constants99 } from './static_constant_data.js';

export function getItemSlotCategory(item) {
  if (!item) return 'Misc';
  const type = (item.type || '').toLowerCase().trim();

  if (type === 'rin') return 'Ring';
  if (type === 'amu') return 'Amulet';
  if (type === 'jew') return 'Jewel';
  if (type === 'cm1') return 'Small Charm';
  if (type === 'cm2') return 'Large Charm';
  if (type === 'cm3') return 'Grand Charm';
  if (/^r\d+$/.test(type)) return 'Rune';
  if (/^gp/.test(type) || ['gcv','gcb','gcg','gcr','gcw','gcy','skc','skb','skg','skr','skw','sky'].includes(type)) return 'Gem';

  if (['cap','skp','hlm','fhl','ghm','crn','msk','bhm','phm','dr1','dr2','dr3','dr4','dr5','ba1','ba2','ba3','ba4','ba5','xap','xkp','xlm','xhl','xhm','xrn','xsk','xr1','xr2','xr3','xr4','xr5','xa1','xa2','xa3','xa4','xa5','uap','ukp','uhl','uhm','urn','usk','ur1','ur2','ur3','ur4','ur5','ua1','ua2','ua3','ua4','ua5'].includes(type)) return 'Head';
  if (['qui','lea','hla','stu','rng','scl','chn','brs','spl','plt','fld','gth','full','ltp','ful','aar','xui','xea','xla','xtu','xng','xcl','xhn','xrs','xpl','xlt','xfd','xth','xar','xlp','xul','uui','uea','ula','utu','ung','ucl','uhn','urs','upl','ult','ufd','uth','uar','ulp','uul'].includes(type)) return 'Torso';
  if (['lgl','vgl','mgl','tgl','hgl','xgl','xgv','xmg','xtg','xhg','ugl','ugv','umg','utg','uhg'].includes(type)) return 'Gloves';
  if (['lbt','vbt','mbt','tbt','hbt','xbt','xvb','xmb','xtb','xhb','ubt','uvb','umb','utb','uhb'].includes(type)) return 'Boots';
  if (['lbl','vbl','mbl','tbl','hbl','zlb','zvb','zmb','ztb','zhb','ulc','ulv','ulm','ult','ulh'].includes(type)) return 'Belt';
  if (['buc','sml','lrg','kit','tsh','gts','bsh','spk','bld','pa1','pa2','pa3','pa4','pa5','ne1','ne2','ne3','ne4','ne5','xuc','xml','xrg','xit','xsh','xts','xpk','xld','xp1','xp2','xp3','xp4','xp5','xn1','xn2','xn3','xn4','xn5','uuc','uml','urg','uit','ush','uts','upk','uld','up1','up2','up3','up4','up5','un1','un2','un3','un4','un5'].includes(type)) return 'Shield';

  if (constants99.weapons && (constants99.weapons[item.type] || constants99.weapons[type])) return 'Weapon';
  if (constants99.armor && (constants99.armor[item.type] || constants99.armor[type])) return 'Armor';

  if (item.given_runeword_name || item.runeword_name) {
    if (item.type_name && (item.type_name.includes('Armor') || item.type_name.includes('Shield') || item.type_name.includes('Helm'))) return 'Armor';
    return 'Weapon';
  }

  return item.type_name || 'Misc';
}

// Domain Entity & Rules for Character Stats Calculation

/**
 * Sum a named attribute from an item's attributes list.
 */
export const sumAttr = (item, attrName) => {
  if (!item) return 0;

  const baseAttrs = item.magic_attributes || [];
  const rwAttrs = item.runeword_attributes || [];
  const setAttrs = (item.set_attributes || []).flat();
  const socketedAttrs = (item.socketed_items || []).flatMap(s => s.magic_attributes || []);

  const all = [...baseAttrs, ...rwAttrs, ...setAttrs, ...socketedAttrs];

  return all
    .filter(a => a && a.name === attrName)
    .reduce((acc, a) => acc + (a.values[0] || 0), 0);
};

export const calculateCharacterStats = (charData, isSwapped = false, difficulty = 'hell') => {
  if (!charData?.items) return { mf: 0, fcr: 0, fhr: 0, fr: 0, cr: 0, lr: 0, pr: 0, activeSets: [] };

  // Active equipped slots
  const activeSlotIds = isSwapped
    ? [1, 2, 3, 11, 12, 6, 7, 8, 9, 10]
    : [1, 2, 3,  4,  5, 6, 7, 8, 9, 10];

  let mf = 0, fcr = 0, fhr = 0, fr = 0, cr = 0, lr = 0, pr = 0;
  let maxFr = 0, maxCr = 0, maxLr = 0, maxPr = 0;

  // Set piece counts map (set_name -> count)
  const setCounts = {};

  // Base attributes from character save
  let strength = charData.attributes?.strength || 0;
  let dexterity = charData.attributes?.dexterity || 0;
  let vitality = charData.attributes?.vitality || 0;
  let energy = charData.attributes?.energy || 0;

  charData.items.forEach(item => {
    // ── Equipped gear ──────────────────────────────────────────────
    if (item.location_id === 1 && activeSlotIds.includes(item.equipped_id)) {
      const familyName = item.set_name?.includes('Tal Rasha') ? 'Tal Rasha' : item.set_name;
      if (familyName) {
        setCounts[familyName] = (setCounts[familyName] || 0) + 1;
      }

      // Blade of Ali Baba scales MF per character level (+1% per level)
      if (item.type === '9fc') {
        const lvl = charData.attributes?.level || charData.header?.level || 83;
        mf += lvl;
      }

      mf        += sumAttr(item, 'item_magicbonus');
      fcr       += sumAttr(item, 'item_fastercastrate');
      fhr       += sumAttr(item, 'item_fastergethitrate');
      fr        += sumAttr(item, 'fireresist');
      cr        += sumAttr(item, 'coldresist');
      lr        += sumAttr(item, 'lightresist');
      pr        += sumAttr(item, 'poisonresist');
      maxFr     += sumAttr(item, 'maxfireresist');
      maxCr     += sumAttr(item, 'maxcoldresist');
      maxLr     += sumAttr(item, 'maxlightresist');
      maxPr     += sumAttr(item, 'maxpoisonresist');
      strength  += sumAttr(item, 'strength');
      dexterity += sumAttr(item, 'dexterity');
      vitality  += sumAttr(item, 'vitality');
      energy    += sumAttr(item, 'energy');
    }

    // ── Charms in inventory (alt_position_id === 1) ─────────────────
    if (item.location_id === 0 && item.alt_position_id === 1 && item.type && ['cm1','cm2','cm3','cs1','cs2','cs3','cs4','cs5','cs6'].includes(item.type)) {
      const attrs = item.magic_attributes || [];
      attrs.forEach(a => {
        const v = a.values[0] || 0;
        if (a.name === 'item_magicbonus') mf        += v;
        if (a.name === 'fireresist')      fr        += v;
        if (a.name === 'coldresist')      cr        += v;
        if (a.name === 'lightresist')     lr        += v;
        if (a.name === 'poisonresist')    pr        += v;
        if (a.name === 'strength')        strength  += v;
        if (a.name === 'dexterity')       dexterity += v;
        if (a.name === 'vitality')        vitality  += v;
        if (a.name === 'energy')          energy    += v;
      });
    }
  });

  const activeSets = [];

  // Calculate generic Set Partial & Full Bonuses (e.g., Tal Rasha's 3-piece partial set gives +65% MF)
  Object.entries(setCounts).forEach(([setName, count]) => {
    const bonuses = [];
    if (setName && setName.includes('Tal Rasha')) {
      if (count >= 3) {
        mf  += 65;
        bonuses.push('+65% Magic Find (3 Pcs)');
      }
      if (count >= 4) {
        fhr += 25;
        bonuses.push('+25% Faster Hit Recovery (4 Pcs)');
      }
      if (count === 5) {
        fr += 50;
        cr += 50;
        lr += 50;
        pr += 50;
        bonuses.push('+50% All Resistances (Full Set)');
      }
    }
    if (bonuses.length > 0) {
      activeSets.push({ name: setName, count, bonuses });
    }
  });

  // Anya quest gives +10 res per difficulty completed
  // Difficulty penalties: Normal = 0, Nightmare = -40, Hell = -100
  let hellPenalty = -100;
  let anyaBonus = 30;

  if (difficulty === 'normal') {
    hellPenalty = 0;
    anyaBonus = 10;
  } else if (difficulty === 'nightmare') {
    hellPenalty = -40;
    anyaBonus = 20;
  } else {
    hellPenalty = -100;
    anyaBonus = 30;
  }

  const base = hellPenalty + anyaBonus;

  const rawFr = base + fr;
  const rawCr = base + cr;
  const rawLr = base + lr;
  const rawPr = base + pr;

  const finalFrCap = Math.min(95, 75 + maxFr);
  const finalCrCap = Math.min(95, 75 + maxCr);
  const finalLrCap = Math.min(95, 75 + maxLr);
  const finalPrCap = Math.min(95, 75 + maxPr);

  return {
    mf,
    fcr,
    fhr,
    fr: Math.min(finalFrCap, rawFr),
    cr: Math.min(finalCrCap, rawCr),
    lr: Math.min(finalLrCap, rawLr),
    pr: Math.min(finalPrCap, rawPr),
    frTotal: rawFr,
    crTotal: rawCr,
    lrTotal: rawLr,
    prTotal: rawPr,
    strength,
    dexterity,
    vitality,
    energy,
    activeSets,
  };
};

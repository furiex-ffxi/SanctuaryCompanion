import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItemTypeName, formatSkillTab, formatStat, getFriendlyBaseName, getItemDetails, getItemDisplayName, getItemTypeDisplayName, getSkillTabName, hasIdentifiedRawFlag, isItemIdentified, isItemUnidentified } from '../src/domain/entities/ItemDisplay.js';
import { getDerivedComparisonAttributes, compareItemStat, summarizeItemComparison } from '../src/domain/entities/ItemRollComparison.js';

test('resolves internal item codes to Diablo II base names', () => {
  assert.equal(getFriendlyBaseName({ type: 'rin', type_name: 'rin' }), 'Ring');
  assert.equal(getFriendlyBaseName({ type: 'r33', type_name: 'r33' }), 'Zod Rune');
  assert.equal(getFriendlyBaseName({ type: 'rin', type_name: 'Ring' }), 'Ring');
});

test('removes parser classification suffixes from every item base name', () => {
  assert.equal(cleanItemTypeName('Heavy Boots (2a-2)'), 'Heavy Boots');
  assert.equal(getItemTypeDisplayName({ type: 'vbt', type_name: 'Heavy Boots (2a-2)' }), 'Heavy Boots');
  assert.equal(getFriendlyBaseName({ type: 'vbt', type_name: 'vbt' }), 'Heavy Boots');
  assert.equal(getItemTypeDisplayName({ type: 'rin', type_name: 'Ring (raw-1)' }), 'Ring');
});

test('formats raw legacy stats conservatively when no worker description exists', () => {
  assert.equal(formatStat({ id: 39, values: [35], name: 'fireresist' }), '+35 Fire Resist');
  assert.equal(formatStat({ id: 80, values: [25] }), '+25 Better Chance of Getting Magic Items');
  assert.equal(formatStat({ id: 999, values: [2], name: 'item_some_bonus' }), 'Some bonus: 2');
});

test('keeps valid D2SSharp descriptions authoritative for every special stat path', () => {
  const cases = [
    { id: 188, name: 'item_addskill_tab', layer: 8, values: [2], description: 'Canonical skill tab wording' },
    { id: 83, name: 'item_addclassskills', layer: 1, values: [2], description: 'Canonical class skill wording' },
    { id: 107, name: 'item_singleskill', layer: 59, values: [1], description: 'Canonical single skill wording' },
  ];
  for (const attribute of cases) assert.equal(formatStat(attribute), attribute.description);
});

test('repairs only known malformed legacy skill descriptions', () => {
  assert.equal(formatStat({
    id: 83,
    name: 'item_addclassskills',
    values: [1, 2],
    description: '+2 %+d to Sorceress Skill Levels',
  }), '+2 to Sorceress Skill Levels');
});

test('decodes packed skill-tree layers instead of treating them as random tree ids', () => {
  assert.equal(getSkillTabName(56), 'Demon');
  assert.equal(getSkillTabName(57), 'Eldritch');
  assert.equal(getSkillTabName(58), 'Chaos');
  assert.equal(formatSkillTab(3, 56), '+3 to Demon Skills');
  assert.equal(formatSkillTab(2, 2), '+2 to Amazon Passive and Magic Skills');
  assert.equal(getSkillTabName(999), null);
});
test('recovers ethereal status from legacy raw item bytes', () => {
  assert.deepEqual(getItemDetails({ rawBytesHex: '00004000' }), ['Ethereal']);
  assert.deepEqual(getItemDetails({ rawBytesHex: '4a4d00004000' }), ['Ethereal']);
});
test('shows practical base item details in stash tooltips', () => {
  assert.deepEqual(getItemDetails({ defense: 120, durability: 10, max_durability: 14, ethereal: true, item_level: 85 }), [
    'Defense: 120', 'Durability: 10 of 14', 'Ethereal', 'Item Level: 85',
  ]);
});

test('identifies items from explicit properties and raw item byte flags', () => {
  assert.equal(isItemIdentified({ identified: 1 }), true);
  assert.equal(isItemIdentified({ identified: 0 }), false);
  assert.equal(isItemIdentified({ identified: false }), false);
  assert.equal(isItemIdentified({ is_identified: false }), false);
  assert.equal(isItemUnidentified({ identified: 0 }), true);
  assert.equal(isItemUnidentified({ identified: 1 }), false);

  // Flags bit 0x10 is Identified
  // Little-endian first byte 0x10: bit 4 is set
  assert.equal(hasIdentifiedRawFlag('10000000'), true);
  assert.equal(isItemIdentified({ rawBytesHex: '10000000' }), true);
  // Little-endian first byte 0x00: bit 4 is not set
  assert.equal(hasIdentifiedRawFlag('00000000'), false);
  assert.equal(isItemIdentified({ rawBytesHex: '00000000' }), false);
  // JM item header: 4a4d followed by flags
  assert.equal(hasIdentifiedRawFlag('4a4d10000000'), true);
  assert.equal(hasIdentifiedRawFlag('4a4d00000000'), false);

  // Default when neither property nor hex is supplied
  assert.equal(isItemIdentified({ type: 'rin' }), true);
});

test('does not spoil unidentified items in getItemDisplayName', () => {
  const unidUnique = {
    type: 'uap',
    type_name: 'Shako',
    quality: 7,
    unique_name: 'Harlequin Crest',
    identified: 0,
  };
  assert.equal(getItemDisplayName(unidUnique), 'Unidentified Shako');

  const idUnique = { ...unidUnique, identified: 1 };
  assert.equal(getItemDisplayName(idUnique), 'Harlequin Crest');

  const unidSet = {
    type: 'uar',
    type_name: 'Lacquered Plate',
    quality: 5,
    unique_name: "Tal Rasha's Guardianship",
    set_name: "Tal Rasha's Wrappings",
    identified: false,
  };
  assert.equal(getItemDisplayName(unidSet), 'Unidentified Lacquered Plate');

  const idSet = { ...unidSet, identified: true };
  assert.equal(getItemDisplayName(idSet), "Tal Rasha's Guardianship");

  const unidRare = {
    type: 'rin',
    type_name: 'Ring',
    quality: 6,
    rare_name: 'Bitter',
    rare_name2: 'Emblem',
    identified: 0,
  };
  assert.equal(getItemDisplayName(unidRare), 'Unidentified Ring');

  const idRare = { ...unidRare, identified: 1 };
  assert.equal(getItemDisplayName(idRare), 'Bitter Emblem');

  const unidMagic = {
    type: 'cm3',
    type_name: 'Grand Charm',
    quality: 4,
    magic_prefix_name: 'Ruby',
    magic_suffix_name: 'of Balance',
    identified: 0,
  };
  assert.equal(getItemDisplayName(unidMagic), 'Unidentified Grand Charm');

  const idMagic = { ...unidMagic, identified: 1 };
  assert.equal(getItemDisplayName(idMagic), 'Ruby Grand Charm of Balance');

  // Fallback to type code resolution when type_name is missing
  const unidNoTypeName = { type: 'rin', identified: 0 };
  assert.equal(getItemDisplayName(unidNoTypeName), 'Unidentified Ring');
});

test('handles flags bitmasks, numeric representations, and corrupt hex gracefully', () => {
  // Numeric flags bitmask: bit 4 (0x10) is Identified
  assert.equal(isItemIdentified({ flags: 0x10 }), true);
  assert.equal(isItemIdentified({ flags: 0x00 }), false);
  assert.equal(isItemIdentified({ flags: 0x1000 }), false);
  assert.equal(isItemIdentified({ flags: 0x1010 }), true);

  // Stringified numeric or boolean values
  assert.equal(isItemIdentified({ identified: '0' }), false);
  assert.equal(isItemIdentified({ identified: 'false' }), false);
  assert.equal(isItemIdentified({ identified: '1' }), true);
  assert.equal(isItemIdentified({ identified: 'true' }), true);

  // Corrupt / boundary rawBytesHex
  assert.equal(hasIdentifiedRawFlag(''), null);
  assert.equal(hasIdentifiedRawFlag('not-hex!'), null);
  assert.equal(hasIdentifiedRawFlag('0'), null);
  assert.equal(hasIdentifiedRawFlag(null), null);
  assert.equal(hasIdentifiedRawFlag(undefined), null);
  assert.equal(isItemIdentified({ rawBytesHex: 'corrupt' }), true);
});

test('suppresses roll comparison metrics for unidentified items and excludes them from peers', () => {
  const unidItem = {
    type: 'uap',
    identified: 0,
    base_defense: 140,
    magic_attributes: [{ id: 16, values: [100], name: 'item_armor_percent' }],
  };
  const idItemA = {
    type: 'uap',
    identified: 1,
    base_defense: 140,
    magic_attributes: [{ id: 16, values: [100], name: 'item_armor_percent' }],
  };
  const idItemB = {
    type: 'uap',
    identified: 1,
    base_defense: 140,
    magic_attributes: [{ id: 16, values: [80], name: 'item_armor_percent' }],
  };

  // Unidentified item returns no derived comparison attributes (total defense)
  assert.deepEqual(getDerivedComparisonAttributes(unidItem), []);
  // Identified item returns total defense
  assert.equal(getDerivedComparisonAttributes(idItemA).length, 1);

  // Unidentified item summary should be zeroed out
  assert.deepEqual(summarizeItemComparison(unidItem, [idItemA, idItemB]), {
    comparableCount: 0,
    bestCount: 0,
  });

  // When comparing identified item, unid item must NOT be counted as a comparable peer
  const comparison = compareItemStat(
    { id: 16, values: [100], itemType: 'uap' },
    [idItemA, unidItem]
  );
  // Only 1 identified peer, so values.length < 2 => comparison is null
  assert.equal(comparison, null);
});


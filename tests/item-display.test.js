import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItemTypeName, formatSkillTab, formatStat, getFriendlyBaseName, getItemDetails, getItemTypeDisplayName, getSkillTabName } from '../src/domain/entities/ItemDisplay.js';

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

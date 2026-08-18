import test from 'node:test';
import assert from 'node:assert/strict';
import { compareItemStat, getRollRange, summarizeItemComparison } from '../../src/domain/entities/ItemRollComparison.js';

const item = (fire, magicFind) => ({
  displayed_combined_magic_attributes: [
    { id: 39, values: [fire], description: `Fire Resist +${fire}%` },
    { id: 80, values: [magicFind], description: `${magicFind}% Better Chance of Getting Magic Items` },
  ],
});

test('summarizes best scalar stats across searched items', () => {
  const current = item(30, 20);
  const peers = [current, item(25, 20), item(30, 15)];
  assert.deepEqual(summarizeItemComparison(current, peers), { comparableCount: 2, bestCount: 2 });
  assert.deepEqual(compareItemStat(current.displayed_combined_magic_attributes[0], peers), {
    value: 30, best: 30, compared: 3, isBest: true, difference: 0,
  });
});

test('treats more-negative enemy resistance as the better roll', () => {
  const current = { id: 333, name: 'item_enemyfireresist', values: [-55] };
  const peers = [
    { magic_attributes: [current] },
    { magic_attributes: [{ id: 333, name: 'item_enemyfireresist', values: [-45] }] },
  ];
  assert.deepEqual(compareItemStat(current, peers), {
    value: -55, best: -55, compared: 2, isBest: true, difference: 0,
  });
});
test('does not compare compound values or a stat with only one candidate', () => {
  const compound = { id: 48, values: [1, 20] };
  assert.equal(compareItemStat(compound, [{ magic_attributes: [compound] }]), null);
  assert.equal(compareItemStat({ id: 39, values: [10] }, [item(10, 5)]), null);
});

test('uses explicit parser roll ranges and clamps the displayed percentile', () => {
  assert.deepEqual(getRollRange({ id: 39, values: [28], roll_range: { min: 21, max: 30 } }), {
    min: 21, max: 30, value: 28, percent: 78,
  });
  assert.equal(getRollRange({ id: 39, values: [28] }), null);
  assert.equal(getRollRange({ id: 48, values: [1, 20], range: [1, 20] }), null);
});

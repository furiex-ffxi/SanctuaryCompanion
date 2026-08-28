import test from 'node:test';
import assert from 'node:assert/strict';
import { compareItemStat, getRollRange, getTotalDefense, summarizeItemComparison } from '../../src/domain/entities/ItemRollComparison.js';

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

const armor = (type, defense, enhancedDefense) => ({
  type,
  defense,
  displayed_combined_magic_attributes: enhancedDefense == null ? [] : [{ id: 16, values: [enhancedDefense] }],
});

test('calculates rounded total defense with or without enhanced defense', () => {
  assert.equal(getTotalDefense(armor('uar', 101, null)), 101);
  assert.equal(getTotalDefense(armor('uar', 101, 33)), 134);
  assert.equal(getTotalDefense({ type: 'rin', defense: 999 }), null);
});

test('compares total defense and enhanced defense independently', () => {
  const current = armor('uar', 101, 33);
  const peer = armor('uar', 100, 40);
  const attrs = current.displayed_combined_magic_attributes;
  assert.deepEqual(compareItemStat({ id: 'total_defense', name: 'total_defense', values: [134], derived: true, itemType: 'uar' }, [current, peer]), {
    value: 134, best: 140, compared: 2, isBest: false, difference: 6,
  });
  assert.deepEqual(compareItemStat(attrs[0], [current, peer]), {
    value: 33, best: 40, compared: 2, isBest: false, difference: 7,
  });
  assert.equal(summarizeItemComparison(current, [current, peer]).comparableCount, 2);
});

test('compares enhanced damage percentage and separate minimum/maximum rolls', () => {
  const current = { type: '9cr', displayed_combined_magic_attributes: [
    { id: 25, values: [150] }, { id: 17, values: [170] }, { id: 18, values: [140] },
  ] };
  const peer = { type: '9cr', displayed_combined_magic_attributes: [
    { id: 25, values: [125] }, { id: 17, values: [180] }, { id: 18, values: [135] },
  ] };
  const summary = summarizeItemComparison(current, [current, peer]);
  assert.equal(summary.comparableCount, 3);
  assert.equal(summary.bestCount, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStat, getFriendlyBaseName, getItemDetails } from '../src/domain/entities/ItemDisplay.js';

test('resolves internal item codes to Diablo II base names', () => {
  assert.equal(getFriendlyBaseName({ type: 'rin', type_name: 'rin' }), 'Ring');
  assert.equal(getFriendlyBaseName({ type: 'r33', type_name: 'r33' }), 'Zod Rune');
  assert.equal(getFriendlyBaseName({ type: 'rin', type_name: 'Ring' }), 'Ring');
});

test('formats worker stats with familiar Diablo II wording', () => {
  assert.equal(formatStat({ id: 39, values: [35], name: 'fireresist' }), '+35 Fire Resist');
  assert.equal(formatStat({ id: 80, values: [25] }), '+25 Better Chance of Getting Magic Items');
  assert.equal(formatStat({ id: 999, values: [2], name: 'item_some_bonus' }), 'Some bonus: 2');
});

test('shows practical base item details in stash tooltips', () => {
  assert.deepEqual(getItemDetails({ defense: 120, durability: 10, max_durability: 14, ethereal: true, item_level: 85 }), [
    'Defense: 120', 'Durability: 10 of 14', 'Ethereal', 'Item Level: 85',
  ]);
});

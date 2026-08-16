import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveItemImageKey } from '../../src/components/itemImageKey.js';

test('all five Worldstone Shards use their metadata sprites instead of invtoa', () => {
  const shards = [
    ['xa1', 'inv_worldstone_shard_western'],
    ['xa2', 'inv_worldstone_shard_eastern'],
    ['xa3', 'inv_worldstone_shard_southern'],
    ['xa4', 'inv_worldstone_shard_deep'],
    ['xa5', 'inv_worldstone_shard_northern'],
  ];

  for (const [code, metadataImageKey] of shards) {
    assert.equal(resolveItemImageKey(code, 'invtoa', metadataImageKey), metadataImageKey);
  }
  assert.equal(resolveItemImageKey(' XA5 ', 'invtoa', 'inv_worldstone_shard_northern'), 'inv_worldstone_shard_northern');
});

test('only Worldstone Shards override parsed artwork', () => {
  assert.equal(resolveItemImageKey('xap', 'invxap', 'inv_helm_fallback'), 'invxap');
  assert.equal(resolveItemImageKey('xa6', 'invtoa', 'inv_other_xa6'), 'invtoa');
  assert.equal(resolveItemImageKey('toa', 'invtoa', 'inv_token_absolution'), 'invtoa');
});

test('image-key resolution falls back to metadata and then none', () => {
  assert.equal(resolveItemImageKey('xa3', '', 'inv_worldstone_shard_southern'), 'inv_worldstone_shard_southern');
  assert.equal(resolveItemImageKey('r01', '', 'invrel'), 'invrel');
  assert.equal(resolveItemImageKey('unknown', '', ''), 'none');
});
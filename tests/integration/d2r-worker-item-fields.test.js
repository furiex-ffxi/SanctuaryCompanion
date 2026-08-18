// @vitest-environment node
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const worker = process.env.D2R_WORKER || path.join(repoRoot, 'server', 'bin', 'D2RStashWorker.exe');
const d2rSharpRoot = process.env.D2R_SHARP_ROOT || path.resolve(repoRoot, '..', 'D2SSharp');
const fixtures = process.env.D2R_FIXTURES_ROOT || path.join(d2rSharpRoot, 'src', 'D2SSharp.Tests', 'Resources', '105');
const savesRoot = process.env.D2R_SAVES_ROOT || path.join(os.homedir(), 'Saved Games', 'Diablo II Resurrected');
const stressIterations = Number(process.env.D2R_STRESS_ITERATIONS || 20);
const skippedFields = new Set(['rawBytesHex', 'magic_attributes', 'runeword_attributes', 'set_attributes', 'displayed_combined_magic_attributes']);

async function runWorker(args) {
  const { stdout } = await execFileAsync(worker, args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}
function walk(value, visit) {
  if (value == null) return;
  if (Array.isArray(value)) return value.forEach((entry) => walk(entry, visit));
  if (typeof value !== 'object') return;
  visit(value);
  for (const [key, child] of Object.entries(value)) if (!skippedFields.has(key)) walk(child, visit);
}
function assertImageKeys(value, sourceName) {
  const assetRoot = process.env.D2R_ITEM_ASSET_DIR;
  if (!assetRoot) return;
  walk(value, (item) => {
    if (item.image_key) expect(requireAsset(assetRoot, item.image_key), `${sourceName}: ${item.image_key}`).toBe(true);
  });
}
function requireAsset(assetRoot, imageKey) {
  return existsSync(path.join(assetRoot, `${imageKey}.png`));
}
function assertLevelFields(value, sourceName) {
  walk(value, (item) => {
    if (!Object.hasOwn(item, 'equippable')) return;
    if (item.equippable) expect(Number(item.level_requirement), `${sourceName}: level requirement`).toBeGreaterThan(0);
    if (item.skill_tab_name) expect(item.skill_tab_name).not.toBe('Unknown');
    if (item.equippable && [4, 6, 8].includes(Number(item.quality))) expect(String(item.level_requirement_source)).toContain('affixes[');
    expect(Object.hasOwn(item, 'item_level'), `${sourceName}: item_level`).toBe(true);
  });
}
function assertFriendlySkillDescriptions(value, sourceName) {
  walk(value, (item) => {
    if (item.name === 'AddSkillTab') expect(item.description, sourceName).not.toMatch(/^AddSkillTab:/);
    if (item.name === 'SingleSkill') expect(item.description, sourceName).not.toMatch(/^SingleSkill:/);
  });
}
function assertCanonicalStatDisplays(value, sourceName) {
  walk(value, (item) => {
    if (!Array.isArray(item.displayed_combined_magic_attributes)) return;
    expect(item.stat_display_version, sourceName + ': stat display version').toBe(1);
    expect(item.item_format, sourceName + ': item format').toBeGreaterThan(0);
    for (const stat of item.displayed_combined_magic_attributes) {
      expect(stat.description, sourceName + ': stat ' + stat.id).toEqual(expect.any(String));
      expect(stat.description, sourceName + ': stat ' + stat.id).not.toMatch(/%[+]?d|^(?:AddSkillTab|AddClassSkills|SingleSkill|NonClassSkill):/i);
      if ([48, 50, 52, 54, 57].includes(Number(stat.id))) {
        expect(stat.values.length, sourceName + ': paired stat ' + stat.id).toBeGreaterThan(1);
      }
      if (Number(stat.id) === 17 && !/Maximum Damage/.test(stat.description)) {
        expect(stat.values.length, sourceName + ': grouped enhanced damage').toBeGreaterThan(1);
      }
      if (Number(stat.id) === 17 && stat.values.length === 1) expect(stat.description).toMatch(/Enhanced Maximum Damage/);
      if (Number(stat.id) === 18) expect(stat.description).toMatch(/Enhanced Minimum Damage/);
    }
  });
}

function assertArmorDetails(parsed, sourceName) {
  const armor = parsed.items.find((item) => item.type === 'uar');
  expect(armor, `${sourceName}: Sacred Armor fixture`).toBeDefined();
  expect(armor).toMatchObject({ defense: expect.any(Number), max_durability: expect.any(Number), durability: expect.any(Number) });
  expect(armor.defense).toBeGreaterThan(0);
}
function parse(output) { return JSON.parse(output); }

// This test intentionally runs in Node: it tests the worker process and file boundary, not the DOM.
describe('D2R worker integration contract', () => {
  test('covers fixture round trips, validity, mutations, repeated parsing, and item fields', async () => {
    const backupRoot = path.join(savesRoot, 'backups');
    await mkdir(backupRoot, { recursive: true });
    const tempRoot = await mkdtemp(path.join(backupRoot, 'D2R_JS_TEST_TEMP_'));
    try {
      const saveFixtures = ['Roka.d2s', 'ChaosSC.d2s', 'Soska.d2s'];
      const allFixtures = [...saveFixtures];
      for (const name of ['ModernSharedStashSoftCoreV2.d2i', 'SharedStashSoftCoreV2.d2i']) allFixtures.push(name);
      for (const name of allFixtures) await cp(path.join(fixtures, name), path.join(tempRoot, name));

      for (const name of allFixtures) {
        const source = path.join(tempRoot, name);
        const roundTrip = `${source}.roundtrip`;
        const mode = name.endsWith('.d2s') ? 'roundtrip_save' : 'roundtrip_stash';
        await runWorker([mode, source, roundTrip]);
        if (name.endsWith('.d2s')) {
          const verification = parse(await runWorker(['verify_save', roundTrip]));
          expect(verification.validChecksum, name).toBe(true);
          expect(verification.declaredFileSize, name).toBe(verification.actualFileSize);
          const parsed = parse(await runWorker(['parse_save', roundTrip]));
          assertImageKeys(parsed, name); assertLevelFields(parsed, name); assertFriendlySkillDescriptions(parsed, name); assertCanonicalStatDisplays(parsed, name);
          for (const field of ['contained_items', 'merc_items', 'corpse_items', 'iron_golem_item']) expect(Object.hasOwn(parsed, field), `${name}: ${field}`).toBe(true);
          if (name === 'Roka.d2s') assertArmorDetails(parsed, name);
        } else {
          const parsed = parse(await runWorker(['parse_stash', roundTrip]));
          assertImageKeys(parsed, name); assertLevelFields(parsed, name); assertFriendlySkillDescriptions(parsed, name); assertCanonicalStatDisplays(parsed, name);
        }
      }

      const saveSource = path.join(tempRoot, 'ChaosSC.d2s');
      const saveItem = parse(await runWorker(['parse_save', saveSource])).items[0];
      const reparsedItem = parse(await runWorker(['parse_item', saveItem.rawBytesHex, String(saveItem.item_format)]));
      expect(reparsedItem.stat_display_version).toBe(1);
      expect(reparsedItem.displayed_combined_magic_attributes).toEqual(saveItem.displayed_combined_magic_attributes);
      const saveRemoved = `${saveSource}.removed`; const saveRestored = `${saveSource}.restored`;
      await runWorker(['remove_save', saveSource, saveRemoved, String(saveItem.id)]);
      await runWorker(['add_save', saveRemoved, saveRestored, saveItem.rawBytesHex, '0', '0']);
      expect(parse(await runWorker(['verify_save', saveRestored])).validChecksum).toBe(true);

      const stashSource = path.join(tempRoot, 'ModernSharedStashSoftCoreV2.d2i');
      const stash = parse(await runWorker(['parse_stash', stashSource]));
      const stashItem = stash.pages.flatMap((page) => page.items).find(Boolean);
      const stashRemoved = `${stashSource}.removed`; const stashRestored = `${stashSource}.restored`;
      await runWorker(['remove', stashSource, stashRemoved, String(stashItem.id)]);
      await runWorker(['add', stashRemoved, stashRestored, stashItem.rawBytesHex, String(stashItem.alt_position_id), '0', '0']);
      expect(parse(await runWorker(['parse_stash', stashRestored]))).toBeTruthy();

      for (let i = 0; i < stressIterations; i++) {
        expect(parse(await runWorker(['parse_save', saveSource])).merc_items).toBeDefined();
        expect(parse(await runWorker(['parse_stash', stashSource])).pages).toBeDefined();
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120_000);
});

// The Bugdex is ranked rarest first: Legendary, Rare, Uncommon, Common, card order within a tier (client/src/barn/dexOrder.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../server/engine/creatures.js';
import { rarityOf } from '../server/engine/bug-types.js';
import { DEX_ORDER, DEX_TIERS } from '../client/src/barn/dexOrder.js';

test('the Bugdex lists every species once, rarest first', () => {
  assert.equal(DEX_ORDER.length, ROSTER.length);
  assert.deepEqual(new Set(DEX_ORDER.map((e) => e.bug.id)), new Set(ROSTER.map((b) => b.id)));
  const rarities = DEX_ORDER.map((e) => e.rarity);
  assert.deepEqual(rarities, rarities.toSorted((a, b) => b - a), 'never a commoner bug above a rarer one');
  assert.deepEqual(DEX_TIERS.map((t) => t.name), ['Legendary', 'Rare', 'Uncommon', 'Common']);
  assert.equal(DEX_TIERS.reduce((n, t) => n + t.bugs.length, 0), ROSTER.length);
  for (const e of DEX_ORDER) assert.equal(e.rarity, rarityOf(e.bug.id));
});

test('legendaries go by how rarely you meet one; every other tier keeps card order; numbers stay the same', () => {
  assert.deepEqual(DEX_TIERS[0].bugs.map((e) => e.bug.id), ['megachile', 'meganeura', 'dryococelus'], "Wallace's Giant Bee, Meganeura, then the Lord Howe Island stick insect");
  for (const tier of DEX_TIERS.slice(1)) { const nos = tier.bugs.map((e) => e.no); assert.deepEqual(nos, nos.toSorted((a, b) => a - b), tier.name); }
  for (const e of DEX_ORDER) assert.equal(ROSTER[e.no - 1], e.bug, 'its card number is still its place in the roster');
  assert.equal(DEX_ORDER.find((e) => e.bug.id === 'steeze').rarity, 2, 'STEEZE is with the Uncommons');
  assert.equal(DEX_ORDER[DEX_ORDER.length - 1].rarity, 1);
});

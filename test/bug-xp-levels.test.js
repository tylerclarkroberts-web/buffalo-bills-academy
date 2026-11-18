import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadedXp, fightXp, gapXp } from '../server/engine/bug-combat.js';
import { jarChance, caughtLevel } from '../server/pvp.js';

test('care XP is whole to level 5 and fades to 2 by level 10', () => {
  assert.deepEqual([1, 5, 6, 7, 8, 9, 10, 15].map((level) => fadedXp(12, level)), [12, 12, 10, 8, 6, 4, 2, 2]);
  assert.equal(fadedXp(0, 3), 0);
});

test('a win pays by the level beaten; a loss fades with your own level', () => {
  const win = (level, foeLevel) => fightXp({ won: true, base: 20, bonus: 30, level, foeLevel });
  assert.equal(win(6, 6), 50);
  assert.ok(win(6, 7) > win(6, 6) && win(6, 10) > win(6, 8));
  assert.deepEqual([win(6, 5), win(6, 4), win(6, 2)], [30, 15, 5]);
  assert.equal(gapXp(1, 10), 2);
  assert.deepEqual([3, 10].map((level) => fightXp({ won: false, base: 20, bonus: 30, level })), [20, 3]);
});

test('a jar is harder on a bug above yours, and it arrives at most two levels up', () => {
  assert.equal(jarChance(0.25), 0.35);
  assert.ok(Math.abs(jarChance(0.25, 2) - 0.35 * 0.6) < 1e-9);
  assert.ok(Math.abs(jarChance(0.25, 9) - 0.35 * 0.3) < 1e-9);
  assert.equal(jarChance(0.25, -3), 0.35);
  assert.equal(jarChance(0.5, 0), 0);
  assert.deepEqual([caughtLevel(10, 6), caughtLevel(7, 6), caughtLevel(3, 6)], [8, 7, 3]);
});

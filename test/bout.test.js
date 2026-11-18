// Barn combat is deterministic; player-joined wager flows are covered in barn-combat-api.test.js.
import { test } from 'node:test';
import { rarityOf } from '../server/engine/bug-types.js';
import assert from 'node:assert/strict';
import { simulateBout, line, MAX_ROUNDS, LUNCH_CAP } from '../server/engine/bout.js';
import { ROSTER } from '../server/engine/creatures.js';

const A = { species: ROSTER[0].id, name: 'A', level: 5, mood: 60 };
const B = { species: ROSTER[1].id, name: 'B', level: 5, mood: 60 };

test('bout sim is deterministic and keeps combat events and HP bounded', () => {
  const r1 = simulateBout(A, B, 'seed-1'), r2 = simulateBout(A, B, 'seed-1');
  assert.deepEqual(r1, r2);
  assert.ok(r1.rounds.length >= 1 && r1.rounds.length <= MAX_ROUNDS * 2);
  for (const r of r1.rounds) { r.hp.forEach((hp, i) => assert.ok(hp >= 0 && hp <= r1.maxHp[i])); assert.ok(r.dmg >= 0); assert.ok(r.line.length > 10); }
  assert.ok([0, 1, null].includes(r1.winner));
});

test('attack gear adds to the hits a bug lands, defense gear takes off the hits it takes, each capped at 6%', () => {
  // The first hit side A lands uses the same rolls whatever either bug is wearing, so only the gear differs.
  const plain = { plain: true }, first = (a, b, seed) => simulateBout({ ...a, ...plain }, { ...b, ...plain }, seed).rounds.find((r) => r.by === 0 && r.type === 'move' && r.hit && !r.critical && r.dmg > 0)?.dmg || 0;
  let base = 0, sharp = 0, plated = 0;
  for (let s = 0; s < 80; s++) {
    const seed = `gear${s}`, hit = first(A, B, seed), up = first({ ...A, gear: 0.06 }, B, seed), down = first(A, { ...B, defense: 0.06 }, seed);
    assert.ok(up >= hit && down <= hit, `${seed}: ${down} <= ${hit} <= ${up}`);
    base += hit; sharp += up; plated += down;
  }
  assert.ok(base > 0 && sharp / base > 1.04 && sharp / base < 1.08, `attack gear: ${sharp / base}`);
  assert.ok(plated / base > 0.92 && plated / base < 0.96, `defense gear: ${plated / base}`);
  assert.deepEqual(simulateBout(A, { ...B, defense: 0.5 }, 'cap'), simulateBout(A, { ...B, defense: 0.06 }, 'cap'), 'defense is capped');
  assert.deepEqual(simulateBout(A, { ...B, defense: -1 }, 'cap').rounds, simulateBout(A, B, 'cap').rounds, 'and is never a penalty');
});

test('a packed lunch is eaten once, below half health, for no more than it holds or the bug is missing', () => {
  let eaten = 0, ateIn = null;
  for (let s = 0; s < 60; s++) {
    const o = simulateBout({ ...A, lunch: { name: 'Bug Banquet', heal: LUNCH_CAP } }, B, `lunch${s}`);
    const meals = o.rounds.filter((r) => r.type === 'snack');
    if (meals.length) ateIn = `lunch${s}`;
    assert.ok(meals.length <= 1 && meals.every((r) => r.by === 0), 'one lunch, and only the bug that packed it');
    for (const r of meals) {
      const before = r.hp[0] - r.healed;
      assert.ok(before > 0 && before < o.maxHp[0] / 2, `${before} of ${o.maxHp[0]}: standing, below half`);
      assert.ok(r.healed >= 0 && r.healed <= LUNCH_CAP && r.hp[0] <= o.maxHp[0]);
      assert.ok(r.line.includes('Bug Banquet') && r.line.includes(`${r.healed} HP`));
      eaten++;
    }
  }
  assert.ok(eaten > 20, `eaten in ${eaten} of 60 fights`);
  const meal = (lunch) => simulateBout({ ...A, lunch }, B, ateIn).rounds.find((r) => r.type === 'snack');
  assert.equal(meal({ name: 'x', heal: 500 }).healed, meal({ name: 'x', heal: LUNCH_CAP }).healed, 'a lunch is capped');
  assert.deepEqual(simulateBout({ ...A, lunch: { name: 'x', heal: 0 } }, B, 'cap'), simulateBout(A, B, 'cap'), 'no lunch, no change');
  // a bug that walks in already below half eats before the first blow is over
  const hurt = simulateBout({ ...A, health: 30, lunch: { name: 'Leaf', heal: 3 } }, B, 'hurt');
  assert.ok(hurt.rounds.slice(0, 2).some((r) => r.type === 'snack' && r.healed === 3));
});

test('level 3 bouts use only what a level 3 bug has learned, and no species runs away with the field', () => {
  for (const mine of ROSTER) {
    let w = 0, n = 0;
    for (const theirs of ROSTER) if (theirs !== mine) for (let s = 0; s < 30; s++) {
      const o = simulateBout({ ...A, species: mine.id, level: 3 }, { ...B, species: theirs.id, level: 3 }, `f${s}`);
      for (const r of o.rounds) if (r.type === 'move') assert.ok(r.moveId === 'basic' || r.moveId === 'technique', 'level 3 has its strike and its technique');
      w += o.winner === 0 ? 1 : o.winner === null ? 0.5 : 0; n++;
    }
    assert.ok(w / n > 0.3 && w / n < (rarityOf(mine.id) === 4 ? 0.8 : 0.7), `${mine.id} wins ${Math.round((100 * w) / n)}% of level 3 bouts`);
  }
});

test('BARN_TEST_XP only works with dev login', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { createApp } = await import('../server/app.js');
  for (const devLogin of [true, false]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-bout-'));
    const r = createApp({ dataDir, now: () => 1, devLogin, env: { BARN_TEST_XP: '640', BARN_INCUBATE_MS: '1' } });
    assert.equal(r.service.barn.startXp, devLogin ? 640 : 0); r.shutdown();
  }
});

test('the line counts defense gear and a packed lunch, not only attack gear', () => {
  assert.equal(line(A, { ...A }), 0.5, 'a mirror match is even');
  assert.ok(line({ ...A, gear: 0.05 }, A) > 0.5);
  assert.ok(line({ ...A, defense: 0.06 }, A) > 0.5, 'armour moves the line');
  assert.ok(line({ ...A, lunch: { name: 'Bug Banquet', heal: LUNCH_CAP } }, A) > 0.5, 'so does a lunch');
  assert.equal(line(A, { ...A, lunch: { name: 'Bug Banquet', heal: LUNCH_CAP } }), (100 - Math.round(line({ ...A, lunch: { name: 'Bug Banquet', heal: LUNCH_CAP } }, A) * 100)) / 100, 'and the other corner sees the rest');
});

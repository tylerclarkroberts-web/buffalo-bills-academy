// Barn combat is deterministic; player-joined wager flows are covered in barn-combat-api.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBout, MAX_ROUNDS } from '../server/engine/bout.js';
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

test('level 3 bouts use only what a level 3 bug has learned, and no species runs away with the field', () => {
  for (const mine of ROSTER) {
    let w = 0, n = 0;
    for (const theirs of ROSTER) if (theirs !== mine) for (let s = 0; s < 30; s++) {
      const o = simulateBout({ ...A, species: mine.id, level: 3 }, { ...B, species: theirs.id, level: 3 }, `f${s}`);
      for (const r of o.rounds) if (r.type === 'move') assert.ok(r.moveId === 'basic' || r.moveId === 'technique', 'level 3 has its strike and its technique');
      w += o.winner === 0 ? 1 : o.winner === null ? 0.5 : 0; n++;
    }
    assert.ok(w / n > 0.3 && w / n < 0.7, `${mine.id} wins ${Math.round((100 * w) / n)}% of level 3 bouts`);
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

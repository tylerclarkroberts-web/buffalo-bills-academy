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

test('equal-level basic-only bouts retain balanced species traits and no locked moves', () => {
  let worst = 0;
  for (let i = 0; i < ROSTER.length; i += 3) for (let j = 1; j < ROSTER.length; j += 5) {
    if (i === j) continue;
    let w = 0; const N = 400;
    for (let s = 0; s < N; s++) {
      const o = simulateBout({ ...A, species: ROSTER[i].id, level: 3, battle: { stance: 'balanced', specials: [] } }, { ...B, species: ROSTER[j].id, level: 3, battle: { stance: 'balanced', specials: [] } }, `f${s}`);
      for (const r of o.rounds) assert.equal(r.moveId, 'basic', 'level 3 has only its basic move');
      if (o.winner === 0) w++;
    }
    worst = Math.max(worst, Math.abs(w / N - 0.5));
  }
  assert.ok(worst < 0.15, `worst pair ${worst}`);
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

// v31: barn bouts. Server-decided, deterministic, cosmetic: no money, no XP, level 5+ only, one an hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBout, BOUT_HP, MAX_ROUNDS } from '../server/engine/bout.js';
import { Barn, BOUT_COOLDOWN_MS } from '../server/barn.js';
import { ROSTER, xpFor } from '../server/engine/creatures.js';

const A = { species: ROSTER[0].id, name: 'A', level: 5, mood: 60 };
const B = { species: ROSTER[1].id, name: 'B', level: 5, mood: 60 };
const mem = () => { const d = {}; return { loadDoc: (k, f) => d[k] || f, saveDoc: (k, v) => { d[k] = JSON.parse(JSON.stringify(v)); } }; };

test('bout sim is deterministic, bounded, and HP only goes down', () => {
  const r1 = simulateBout(A, B, 'seed-1'), r2 = simulateBout(A, B, 'seed-1');
  assert.deepEqual(r1, r2);
  assert.ok(r1.rounds.length >= 1 && r1.rounds.length <= MAX_ROUNDS);
  let prev = [BOUT_HP, BOUT_HP];
  for (const r of r1.rounds) { assert.ok(r.hp[0] <= prev[0] && r.hp[1] <= prev[1]); assert.equal(r.hit, r.dmg > 0); assert.ok(r.line.length > 10); prev = r.hp; }
  const last = r1.rounds.at(-1).hp;
  assert.equal(r1.winner, last[0] === last[1] ? null : last[0] > last[1] ? 0 : 1);
});

test('bouts are fair: no species pair is lopsided, only unlocked abilities are used', () => {
  let worst = 0;
  for (let i = 0; i < ROSTER.length; i += 3) for (let j = 1; j < ROSTER.length; j += 5) {
    if (i === j) continue;
    let w = 0; const N = 400;
    for (let s = 0; s < N; s++) {
      const o = simulateBout({ ...A, species: ROSTER[i].id }, { ...B, species: ROSTER[j].id, level: 3 }, `f${s}`);
      for (const r of o.rounds) if (r.by === 1) assert.ok(r.tier <= 1, 'level 3 has no third ability');
      if (o.winner === 0) w++;
    }
    worst = Math.max(worst, Math.abs(w / N - 0.5));
  }
  assert.ok(worst < 0.15, `worst pair ${worst}`);
});

test('Barn.bout: level gate, cooldown, record, stored replay, stray when alone, no money anywhere', () => {
  const clock = { t: 1_700_000_000_000 };
  const store = mem();
  const b = new Barn({ store, now: () => clock.t, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 0 : 3 % n) });
  b.layEgg('p1');
  assert.throws(() => b.bout('p1'), /Eggs do not fight/);
  clock.t += 2000; b.view('p1');
  assert.throws(() => b.bout('p1'), /level 5/);
  assert.throws(() => b.bout('nobody'), /empty/);
  b.doc.pens.p1.xp = xpFor(5);
  const v = b.bout('p1').pen;
  assert.equal(v.record.w + v.record.l + v.record.d, 1);
  assert.ok(v.lastBout.them.stray, 'nobody else is level 5, so a stray turns up');
  assert.deepEqual(simulateBout(v.lastBout.you, v.lastBout.them, v.lastBout.seed).rounds, v.lastBout.rounds, 'the stored log is exactly the seeded sim');
  assert.equal(v.xp, xpFor(5), 'no XP from bouts');
  assert.ok(v.boutCoolMs > 0);
  assert.throws(() => b.bout('p1'), /icing/);
  // a second rancher at level 5: now they meet each other, and only the challenger's record moves
  b.layEgg('p2'); clock.t += 2000; b.view('p2'); b.doc.pens.p2.xp = xpFor(6);
  const v2 = b.bout('p2').pen;
  assert.equal(v2.lastBout.them.stray, false); assert.equal(v2.lastBout.them.name, b.doc.pens.p1.name);
  assert.equal(b.view('p1').pen.record.w + b.view('p1').pen.record.l + b.view('p1').pen.record.d, 1);
  clock.t += BOUT_COOLDOWN_MS; assert.ok(b.bout('p1').pen.lastBout);
  assert.ok(!JSON.stringify(store.loadDoc('barn', {})).match(/bankroll|chips|\$/));
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

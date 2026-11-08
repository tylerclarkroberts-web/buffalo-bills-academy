// v26: the KO ending is cosmetic. The server only picks which fatality to show (from the fight's seed, never the same
// twice running at a table) and only for a knock-out; money and checks are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../server/engine/fight.js';
import * as G from '../server/engine/game.js';
import { FATALITIES, FATALITY_NAMES, pickFatality } from '../server/engine/fatality.js';
import { makeTable } from './helpers.js';

test('pickFatality: six of them, deterministic per seed, never the same one twice running', () => {
  assert.equal(FATALITIES.length, 6);
  for (const k of FATALITIES) assert.ok(FATALITY_NAMES[k]);
  const seen = new Set(); let prev = -1;
  for (let s = 1; s < 400; s++) {
    const a = pickFatality(s * 2654435761 >>> 0, prev); assert.equal(a, pickFatality(s * 2654435761 >>> 0, prev));
    assert.ok(a >= 0 && a < 6); assert.notEqual(a, prev); seen.add(a); prev = a;
  }
  assert.equal(seen.size, 6, 'all six come up');
});

function idleKo(seed) { const st = F.createFight(seed); while (st.phase !== 'over') F.stepFight(st, 0); return st; }

test('only a knock-out gets a fatality; it is in the fight view, and the money is the same as any loss', () => {
  const mk = () => {
    const { t } = makeTable(['Ann', 'Bob', 'Cat'], { buyIn: 200, bigBlind: 20, smallBlind: 10 });
    t.econ = { debited: {}, credited: {} }; let now = 5000; const bank = { p0: 1000, p1: 1000, p2: 1000 };
    const ctx = () => ({ now, bankrollOf: (id) => bank[id] ?? 0 }); G.startGame(t, 'p0', ctx());
    return { t, ctx, tick: (ms) => { now += ms; } };
  };
  const a = mk(); const bb = a.t.seats[a.t.hand.bbSeat].playerId;
  G.startFight(a.t, bb, { id: 'k1', seed: 7 }, a.ctx());
  const st = idleKo(7); assert.equal(st.result, 'lose'); assert.ok(st.p.hp <= 0);
  a.tick(Math.ceil((st.f / F.FPS) * 1000) + 50);
  G.finishFight(a.t, bb, { id: 'k1', log: [], frames: st.f }, a.ctx());
  assert.equal(a.t.fight.status, 'lost'); assert.equal(a.t.fight.reason, 'was knocked out');
  assert.equal(a.t.fight.fatality, pickFatality(7, -1));
  assert.equal(G.viewFor(a.t, bb, 0).fight.fatality, a.t.fight.fatality, 'the fighter and watchers get the same pick');
  const stakeKo = a.t.fight.stake;

  const b = mk(); const bb2 = b.t.seats[b.t.hand.bbSeat].playerId;
  G.startFight(b.t, bb2, { id: 'f1', seed: 7 }, b.ctx()); G.forfeitFight(b.t, bb2, 'f1', b.ctx());
  assert.equal(b.t.fight.fatality, undefined); assert.equal(G.viewFor(b.t, bb2, 0).fight.fatality, null, 'no fatality on a forfeit');
  assert.equal(b.t.fight.stake, stakeKo, 'same 5% either way');
});

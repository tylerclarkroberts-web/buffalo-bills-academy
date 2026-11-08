// v29: the player's hidden finisher. Cosmetic only: picked from the seed on a verified win, triggered once by the
// fighter within a short window, visible to watchers; money, result and checks are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../server/engine/fight.js';
import * as G from '../server/engine/game.js';
import { GAGS, GAG_NAMES, FINALE_MS, pickGag } from '../server/engine/fatality.js';
import { makeTable } from './helpers.js';
import { makeBot, playBot } from './support/fightbots.js';

test('pickGag: three of them, deterministic per seed, never the same one twice running', () => {
  assert.equal(GAGS.length, 3); for (const k of GAGS) assert.ok(GAG_NAMES[k]);
  const seen = new Set(); let prev = -1;
  for (let s = 1; s < 300; s++) {
    const a = pickGag(s * 2654435761 >>> 0, prev); assert.equal(a, pickGag(s * 2654435761 >>> 0, prev));
    assert.ok(a >= 0 && a < 3); assert.notEqual(a, prev); seen.add(a); prev = a;
  }
  assert.equal(seen.size, 3);
});

function mk() {
  const { t } = makeTable(['Ann', 'Bob', 'Cat'], { buyIn: 200, bigBlind: 20, smallBlind: 10 });
  t.econ = { debited: {}, credited: {} }; let now = 5000; const bank = { p0: 1000, p1: 1000, p2: 1000 };
  const ctx = () => ({ now, bankrollOf: (id) => bank[id] ?? 0 }); G.startGame(t, 'p0', ctx());
  return { t, ctx, tick: (ms) => { now += ms; } };
}
function winSeed() { for (let s = 11; s < 400; s++) { const r = playBot(s, makeBot({ reaction: 1, seed: s })); if (r.result === 'win') return { s, r }; } throw new Error('no win'); }

test('a verified win gets a gag; finish-him is the fighter only, once, in the window; nothing about the money changes', () => {
  const { s, r } = winSeed();
  const a = mk(); const bb = a.t.seats[a.t.hand.bbSeat].playerId; const other = a.t.seats.find((x) => x && x.playerId !== bb).playerId;
  G.startFight(a.t, bb, { id: 'w1', seed: s }, a.ctx());
  a.tick(Math.ceil((r.frames / F.FPS) * 1000) + 50);
  G.finishFight(a.t, bb, { id: 'w1', log: r.log, frames: r.frames }, a.ctx());
  assert.equal(a.t.fight.status, 'won');
  assert.equal(a.t.fight.gag, pickGag(s, -1)); assert.equal(a.t.lastGag, a.t.fight.gag);
  assert.equal(a.t.fight.fatality, undefined, 'no Guntrad fatality on a win');
  const before = JSON.stringify({ seats: a.t.seats, ledger: a.t.ledger, book: a.t.fightBook, paid: a.t.fight.paid });
  assert.equal(G.viewFor(a.t, other, 0).fight.gag, a.t.fight.gag, 'watchers get the same gag');
  assert.equal(G.finaleOpen(a.t.fight, a.ctx().now), true);
  assert.throws(() => G.finishHim(a.t, other, 'w1', a.ctx()), /not your fight/);
  assert.throws(() => G.finishHim(a.t, bb, 'nope', a.ctx()), /No such fight/);
  G.finishHim(a.t, bb, 'w1', a.ctx()); assert.equal(a.t.fight.finale, true);
  G.finishHim(a.t, bb, 'w1', a.ctx()); // idempotent
  assert.equal(G.finaleOpen(a.t.fight, a.ctx().now), false);
  assert.equal(JSON.stringify({ seats: a.t.seats, ledger: a.t.ledger, book: a.t.fightBook, paid: a.t.fight.paid }), before, 'money untouched');
  assert.equal(G.viewFor(a.t, other, 0).fight.finale, true);

  // too late
  const b = mk(); const bb2 = b.t.seats[b.t.hand.bbSeat].playerId;
  G.startFight(b.t, bb2, { id: 'w2', seed: s }, b.ctx()); b.tick(Math.ceil((r.frames / F.FPS) * 1000) + 50);
  G.finishFight(b.t, bb2, { id: 'w2', log: r.log, frames: r.frames }, b.ctx());
  b.tick(FINALE_MS + 1); assert.equal(G.finaleOpen(b.t.fight, b.ctx().now), false);
  assert.throws(() => G.finishHim(b.t, bb2, 'w2', b.ctx()), /Too late/);
});

test('no finisher after a loss or forfeit', () => {
  const a = mk(); const bb = a.t.seats[a.t.hand.bbSeat].playerId;
  G.startFight(a.t, bb, { id: 'f1', seed: 7 }, a.ctx()); G.forfeitFight(a.t, bb, 'f1', a.ctx());
  assert.equal(G.viewFor(a.t, bb, 0).fight.gag, null);
  assert.throws(() => G.finishHim(a.t, bb, 'f1', a.ctx()), /Nothing to finish/);
});

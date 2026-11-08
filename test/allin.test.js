// lastHand.allInLosers: who went all in at showdown and won nothing (drives the client's "busted" animation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable, act, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };

test('all-in loser is flagged at showdown, winner is not', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  // deal order from seat 1: Bob, Cat, Ann x2. Bob: AA, Cat: 72o, Ann: KK
  const deal = ['As', '7c', 'Ks', 'Ah', '2d', 'Kh'];
  start(t, ctx, riggedDeck(deal, ['3c', '8d', '9s', 'Jh', '4d']));
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'allin'); act(t, 'Cat', 'fold');
  assert.equal(t.hand, null);
  assert.deepEqual(t.lastHand.allInLosers, [{ seat: 0, playerId: 'p0', name: 'Ann' }]);
  assert.equal(t.seats[0].stack, 0);
  const v = G.viewFor(t, 'p2', 3000);
  assert.deepEqual(v.lastHand.allInLosers.map((x) => x.name), ['Ann'], 'every viewer gets it');
});

test('all-in player who wins (or chops) is not a loser; no all-in means empty list', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  // heads-up: button Ann deals first? deal order from seat 1: Bob, Ann
  const deal = ['Ah', 'Kh', 'Ad', 'Kd'];
  start(t, ctx, riggedDeck(deal, ['2c', '3c', '9s', 'Jh', '4d']));
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'call');
  assert.equal(t.hand, null);
  const loserNames = t.lastHand.allInLosers.map((x) => x.name);
  const winnerNames = t.lastHand.winners.map((w) => w.name);
  for (const n of loserNames) assert.ok(!winnerNames.includes(n));
  assert.equal(loserNames.length, 1);

  const b = makeTable(['Ann', 'Bob']);
  start(b.t, b.ctx, riggedDeck(['Ah', 'Kh', 'Ad', 'Kd'], ['2c', '3c', '9s', 'Jh', '4d']));
  act(b.t, 'Ann', 'call'); act(b.t, 'Bob', 'check');
  for (let i = 0; i < 3; i++) { act(b.t, 'Bob', 'check'); act(b.t, 'Ann', 'check'); }
  assert.equal(b.t.hand, null);
  assert.deepEqual(b.t.lastHand.allInLosers, []);
});

test('bit timeline stays 4-6 seconds for 1-8 punchers; queue + once-only claim', async () => {
  const { bitPlan, bitQueue, claimBit, BIT_FRESH_MS } = await import('../client/src/table/fx.js');
  for (let n = 1; n <= 8; n++) {
    const p = bitPlan(n);
    assert.ok(p.total >= 4000 && p.total <= 6000, `n=${n} total ${p.total}`);
    assert.equal(p.punches.length, n);
    p.punches.forEach((x, i) => { assert.ok(x.start < x.hit && x.hit < x.end); if (i) assert.equal(x.start, p.punches[i - 1].end); });
  }
  const view = { lastHand: { number: 7, endedAt: 1000, allInLosers: [{ seat: 2, playerId: 'p2', name: 'Cat' }] } };
  assert.equal(bitQueue(view, 2000).length, 1);
  assert.equal(bitQueue(view, 1000 + BIT_FRESH_MS + 1).length, 0, 'stale hands do not replay');
  assert.equal(bitQueue({ lastHand: { number: 1, endedAt: 1, allInLosers: [] } }, 2).length, 0);
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(claimBit('ABC', 7, 2, store), true);
  assert.equal(claimBit('ABC', 7, 2, store), false, 'plays once');
  assert.equal(claimBit('ABC', 8, 2, store), true);
});

test('music: every bar of every public-domain tune adds up; shuffle never repeats back to back', async () => {
  const { TUNES, compile, shuffleOrder, midiOf } = await import('../client/src/table/tunes.js');
  assert.ok(TUNES.length >= 6);
  for (const t of TUNES) {
    assert.ok(t.year < 1929, `${t.title} must be public domain (pre-1929)`);
    const c = compile(t); // throws if a bar is the wrong length
    assert.ok(c.events.some((e) => e.voice === 'lead') && c.events.some((e) => e.voice === 'bass'));
  }
  assert.equal(midiOf('A4'), 69);
  for (let i = 0; i < 50; i++) { const o = shuffleOrder(TUNES.length, Math.random, 3); assert.notEqual(o[0], 3); assert.equal(new Set(o).size, TUNES.length); }
});

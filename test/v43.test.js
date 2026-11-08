// v43: the server action log carries sequence numbers and public-only replay events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable, act, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };
const evs = (t, k) => t.log.filter((e) => e.ev && (!k || e.ev.k === k));

test('every log entry has a strictly increasing seq', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx); act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  const seqs = t.log.map((e) => e.seq);
  assert.ok(seqs.every((s, i) => Number.isInteger(s) && (i === 0 || s > seqs[i - 1])));
});

test('actions, posts, deals and the pot push are structured events; amounts add up', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  // heads-up: button Ann is SB. deal order Bob, Ann, Bob, Ann
  start(t, ctx, riggedDeck(['As', '2c', 'Ad', '3d'], ['Kh', 'Qs', '9c', '7h', '4s']));
  act(t, 'Ann', 'raise', 60); act(t, 'Bob', 'call');
  const posts = evs(t, 'act').filter((e) => e.ev.a === 'post');
  assert.deepEqual(posts.map((e) => e.ev.amt), [10, 20]);
  const r = evs(t, 'act').find((e) => e.ev.a === 'raise');
  assert.equal(r.ev.amt, 50); assert.equal(r.ev.to, 60);
  const c = evs(t, 'act').find((e) => e.ev.a === 'call');
  assert.equal(c.ev.amt, 40); assert.equal(c.ev.pot, 120);
  const d = evs(t, 'deal')[0];
  assert.equal(d.ev.street, 'flop'); assert.deepEqual(d.ev.cards, t.hand.board.slice(0, 3)); assert.equal(d.ev.board, 3);
  for (let k = 0; k < 3; k++) { act(t, 'Bob', 'check'); act(t, 'Ann', 'check'); }
  const deals = evs(t, 'deal'); assert.deepEqual(deals.map((e) => e.ev.street), ['flop', 'turn', 'river']);
  const w = evs(t, 'win').at(-1); assert.equal(w.ev.showdown, true);
  assert.equal(w.ev.wins.reduce((a, x) => a + x.amt, 0), 120);
  assert.equal(w.ev.wins[0].seat, 1, 'Bob (aces) gets the pot pushed');
});

test('fold, all-in and auto-check are tagged', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { autoCheck: true });
  start(t, ctx);
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'fold');
  const a = evs(t, 'act');
  assert.equal(a.find((e) => /Ann/.test(e.text) && e.ev.a !== 'post').ev.a, 'allin');
  assert.equal(a.find((e) => /Bob folds/.test(e.text)).ev.a, 'fold');
  const { t: t2, ctx: c2 } = makeTable(['Ann', 'Bob'], { autoCheck: true, skipPreflop: true });
  start(t2, c2);
  const auto = evs(t2, 'act').filter((e) => e.ev.auto);
  assert.ok(auto.length >= 1 && auto.every((e) => e.ev.a === 'check'));
});

test('no card leaks: events before showdown never contain hole cards', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const holes = t.hand.players.filter(Boolean).flatMap((p) => p.hole);
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  const s = JSON.stringify(evs(t).map((e) => e.ev));
  for (const c of holes) assert.ok(!s.includes(`"${c}"`) || t.hand.board.includes(c), `hole card ${c} leaked`);
  const v = G.viewFor(t, null, 1000);
  assert.ok(v.log.every((e) => Number.isInteger(e.seq)), 'spectators get seq too');
});

test('flop-start table: replay shows posts then the flop deal, no preflop actions', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { skipPreflop: true });
  start(t, ctx);
  const kinds = evs(t).filter((e) => e.hand === t.handNumber).map((e) => e.ev.k + (e.ev.a ? ':' + e.ev.a : ''));
  assert.deepEqual(kinds, ['hand', 'act:post', 'act:post', 'deal']);
});

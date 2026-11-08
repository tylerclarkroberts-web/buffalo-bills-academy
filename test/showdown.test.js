// v49 cinematic showdown: the server's showdown record (reveal order, hand names, best-5, winners, split and side
// pots), per-player 'seen', and the rule that folded or uncontested cards are never stored or sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable, act, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };
const has = (obj, cards) => cards.filter((c) => JSON.stringify(obj).includes(`"${c}"`));
const checkDown = (t, names) => { for (let s = 0; s < 3; s++) for (const n of names) act(t, n, 'check'); };
// deal order from seat 1: Bob, Cat, Ann (x2)

test('showdown record: only players who reached showdown, left-of-button first when nobody bet the river; hand names + best 5', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  const deal = ['Ks', '7c', 'As', 'Kh', '2d', 'Ah']; // Bob KK, Cat 72o, Ann AA
  start(t, ctx, riggedDeck(deal, ['Kd', '7d', '9s', '3h', '4c']));
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  checkDown(t, ['Bob', 'Cat']);
  assert.equal(t.hand, null);
  const r = t.lastShowdown;
  assert.equal(r.kind, 'showdown'); assert.equal(r.firstBy, 'button');
  assert.deepEqual(r.order, [1, 2], 'Bob (left of the button) shows first, then clockwise');
  assert.deepEqual(r.reveals.map((x) => x.name), ['Bob', 'Cat']);
  assert.equal(r.reveals[0].hand, 'Three of a Kind, Kings');
  assert.equal(r.reveals[0].best.length, 5); assert.ok(r.reveals[0].best.includes('Kd'));
  assert.deepEqual(r.board, ['Kd', '7d', '9s', '3h', '4c']);
  assert.equal(r.pots.length, 1); assert.equal(r.pots[0].label, 'Main pot');
  assert.deepEqual(r.pots[0].winners.map((w) => [w.name, w.amount, w.hand]), [['Bob', 40, 'Three of a Kind, Kings']]);
  // Ann folded AA: never in the record, never in anyone's view (now or during the next hand)
  assert.deepEqual(has(r, ['As', 'Ah']), []);
  for (const id of ['p0', 'p1', 'p2', 'watcher']) assert.deepEqual(has(G.viewFor(t, id, 3000), ['As', 'Ah']), [], `${id} never sees Ann's folded AA`);
});

test('the last aggressor on the river shows first, then clockwise', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx, riggedDeck(['Ks', '7c', 'As', 'Kh', '2d', 'Ah'], ['Kd', '7d', '9s', '3h', '4c']));
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  for (let s = 0; s < 2; s++) for (const n of ['Bob', 'Cat', 'Ann']) act(t, n, 'check');
  act(t, 'Bob', 'check'); act(t, 'Cat', 'bet', 20); act(t, 'Ann', 'call'); act(t, 'Bob', 'call');
  const r = t.lastShowdown;
  assert.equal(r.firstBy, 'aggressor');
  assert.deepEqual(r.reveals.map((x) => x.name), ['Cat', 'Ann', 'Bob']);
});

test('split pot: both winners named with their share', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx, riggedDeck(['2c', '3d', '2h', '3s'], ['Ts', 'Js', 'Qd', 'Kh', 'Ac'])); // broadway on the board
  act(t, 'Ann', 'call'); act(t, 'Bob', 'check');
  for (let s = 0; s < 3; s++) { act(t, 'Bob', 'check'); act(t, 'Ann', 'check'); }
  const p = t.lastShowdown.pots[0];
  assert.equal(p.winners.length, 2);
  assert.deepEqual(p.winners.map((w) => w.amount).sort(), [20, 20]);
  assert.ok(p.winners.every((w) => /^Straight/.test(w.hand)));
});

test('side pots are announced separately with their own winners', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  t.seats[0].stack = 100; // Ann short
  start(t, ctx, riggedDeck(['Ks', '7c', 'As', 'Kh', '7d', 'Ah'], ['2d', '8h', '9s', '3h', '4c'])); // Ann AA, Bob KK, Cat 77
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'raise', 300); act(t, 'Cat', 'call');
  for (let s = 0; s < 3; s++) { act(t, 'Bob', 'check'); act(t, 'Cat', 'check'); }
  const pots = t.lastShowdown.pots;
  assert.deepEqual(pots.map((x) => x.label), ['Main pot', 'Side pot 1']);
  assert.deepEqual(pots[0].winners.map((w) => w.name), ['Ann']);
  assert.deepEqual(pots[1].winners.map((w) => w.name), ['Bob']);
  assert.equal(pots[0].amount + pots[1].amount, 100 * 3 + 200 * 2);
});

test('everyone folds: a short "takes the pot" record, no cards at all', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const holes = t.hand.players.filter(Boolean).flatMap((p) => p.hole);
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');
  const r = t.lastShowdown;
  assert.equal(r.kind, 'fold'); assert.equal(r.winner.name, 'Cat'); assert.equal(r.amount, t.lastHand.winners[0].amount);
  assert.deepEqual(has(r, holes), []);
  assert.equal(r.reveals, undefined);
});

test('seen is per player and only auto-plays once; the record survives until the next hand ends', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx);
  act(t, 'Ann', 'call'); act(t, 'Bob', 'check');
  for (let s = 0; s < 3; s++) { act(t, 'Bob', 'check'); act(t, 'Ann', 'check'); }
  const n = t.lastShowdown.number;
  assert.equal(G.viewFor(t, 'p0', 3000).showdownSeen, false);
  G.markShowdownSeen(t, 'p0', n);
  assert.equal(G.viewFor(t, 'p0', 3000).showdownSeen, true);
  assert.equal(G.viewFor(t, 'p1', 3000).showdownSeen, false, 'Bob has not seen it yet');
  G.markShowdownSeen(t, 'p1', n + 50); assert.equal(t.showdownSeen.p1, n, 'cannot mark a future hand seen');
  // the next hand is live: the last record is still there, and the live hand's hole cards are not in it
  if (t.hand) { const live = t.hand.players.filter(Boolean).flatMap((p) => p.hole); assert.deepEqual(has(G.viewFor(t, 'watcher', 3000).showdown, live), []); }
});

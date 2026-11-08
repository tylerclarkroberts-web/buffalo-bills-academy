// v42: "Skip first betting round" and "Auto-check" table settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable, act, toActName, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };
const chips = (t) => G.chipsOnTable(t);

test('settings: both off by default, stored when on', () => {
  assert.equal(G.normalizeSettings({}).skipPreflop, false);
  assert.equal(G.normalizeSettings({}).autoCheck, false);
  const s = G.normalizeSettings({ skipPreflop: true, autoCheck: true });
  assert.equal(s.skipPreflop, true); assert.equal(s.autoCheck, true);
  assert.equal(G.normalizeSettings({ skipPreflop: 'nope' }).skipPreflop, false);
});

test('skip preflop: blinds go in as dead money, flop is dealt at once, first seat left of the button acts', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan'], { skipPreflop: true });
  start(t, ctx);
  const h = t.hand;
  assert.equal(h.street, 'flop'); assert.equal(h.board.length, 3);
  assert.equal(h.blindPot, 30); assert.equal(h.currentBet, 0);
  assert.equal(t.seats[1].stack, 990); assert.equal(t.seats[2].stack, 980);
  assert.equal(toActName(t), 'Bob', 'small blind (left of the button) acts first on the flop');
  assert.ok(t.log.some((e) => /straight to the flop/.test(e.text)));
  assert.equal(chips(t), 4000);
  const v = G.viewFor(t, 'p3', 1000);
  assert.equal(v.hand.pot, 30); assert.equal(v.hand.skipped, true); assert.equal(v.seats[3].cards.length, 2);
  assert.equal(v.seats[0].cards, null, 'no card leaks');
});

test('skip preflop heads-up: big blind acts first on the flop; check-down splits dead money to the winner', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { skipPreflop: true });
  // deal order: Bob (left of button), Ann, Bob, Ann
  start(t, ctx, riggedDeck(['As', '2c', 'Ad', '3d'], ['Kh', 'Qs', '9c', '7h', '4s']));
  assert.equal(toActName(t), 'Bob');
  for (let k = 0; k < 3; k++) { act(t, 'Bob', 'check'); act(t, 'Ann', 'check'); }
  assert.equal(t.hand, null);
  assert.equal(t.seats[1].stack, 1010, 'Bob wins the 30 dead blinds (he posted 20)');
  assert.equal(t.seats[0].stack, 990);
});

test('skip preflop: a player who could only post part of a blind is all-in and can still win the blinds', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { skipPreflop: true });
  t.seats[2].stack = 5; // Cat is the big blind, all-in for 5
  start(t, ctx, riggedDeck(['2c', 'As', '3d', '7c', 'Ad', '8d'], ['Kh', 'Qs', '9c', '4h', '5s']));
  assert.equal(t.hand.players[2].allIn, true);
  assert.equal(t.hand.blindPot, 15);
  act(t, 'Bob', 'bet', 40); act(t, 'Ann', 'call');
  while (t.hand) { const n = toActName(t); act(t, n, 'check'); }
  assert.equal(t.seats[2].stack, 15, 'Cat wins only the blind pot');
  assert.equal(chips(t), 2005);
  assert.ok(t.lastHand.pots.length >= 2);
});

test('skip preflop: everyone folds to a bet -> bettor wins blinds; closing returns blinds', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { skipPreflop: true });
  start(t, ctx);
  act(t, 'Bob', 'bet', 20); act(t, 'Cat', 'fold'); act(t, 'Ann', 'fold');
  assert.equal(t.seats[1].stack, 1020);
  assert.equal(chips(t), 3000);
  G.tick(t, { now: 9000 });
  assert.ok(t.hand); const before = t.seats.filter(Boolean).map((s) => s.stack);
  G.closeTable(t, t.hostId, { now: 9100 });
  assert.equal(t.hand, null);
  assert.equal(Object.values(t.ledger).reduce((a, l) => a + l.cashOut, 0), 3000, 'every chip, blinds included, goes home');
  assert.ok(before.every((x) => x > 0));
});

test('auto-check: free checks are taken for humans; facing a bet they still decide', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { autoCheck: true });
  start(t, ctx);
  // preflop: Ann (button, UTG in 3-handed) faces the big blind
  assert.equal(toActName(t), 'Ann');
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call');
  // Cat (BB) could check for free: auto-checked, flop comes, all check free -> straight to the river and showdown
  assert.equal(t.hand, null, 'with everyone on auto-check and nobody betting the hand checks down');
  assert.ok(t.log.filter((e) => /checks \(auto-check\)$/.test(e.text)).length >= 7);
  assert.equal(chips(t), 3000);
});

test('auto-check: a player can untick it for this hand, and then gets real turns (and can bet)', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { autoCheck: true });
  start(t, ctx);
  G.setAutoCheck(t, 'p2', false, ctx);
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call');
  assert.equal(toActName(t), 'Cat', 'Cat opted out, so she keeps her option');
  assert.ok(G.viewFor(t, 'p2', 1).me.autoCheck === false); assert.ok(G.viewFor(t, 'p0', 1).me.autoCheck === true);
  assert.ok(G.viewFor(t, 'p0', 1).seats.every((x) => x?.autoCheck === undefined), 'nobody sees anyone else\'s box');
  act(t, 'Cat', 'check');
  // flop: Bob auto-checks, Cat bets, Ann must decide
  assert.equal(toActName(t), 'Cat');
  act(t, 'Cat', 'bet', 20);
  assert.equal(toActName(t), 'Ann');
  act(t, 'Ann', 'call'); act(t, 'Bob', 'fold');
  // turning auto-check back on while it's your free turn checks right away
  assert.equal(toActName(t), 'Cat');
  G.setAutoCheck(t, 'p2', true, { now: 3000 });
  assert.notEqual(t.hand?.toAct, 2);
});

test('auto-check + timeouts + all-ins: no turn clock is used for a free check', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { autoCheck: true, skipPreflop: true });
  start(t, ctx);
  assert.equal(t.hand, null, 'both auto-checked to showdown (no decisions needed)');
  assert.equal(chips(t), 2000);
  const { t: t2, ctx: c2 } = makeTable(['Ann', 'Bob'], { autoCheck: true });
  start(t2, c2);
  assert.equal(toActName(t2), 'Ann'); act(t2, 'Ann', 'allin');
  act(t2, 'Bob', 'call');
  assert.equal(t2.hand, null); assert.equal(G.chipsOnTable(t2), 2000);
});

test('v43: per-hand "Check if free": works on any table, private, resets every hand to the table default', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  assert.equal(G.viewFor(t, 'p0', 1).me.autoCheck, false, 'default off');
  G.setAutoCheck(t, 'p2', true, ctx); // Cat (BB) pre-ticks while waiting
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call');
  assert.notEqual(toActName(t), 'Cat', 'her free check was taken for her');
  assert.ok(t.log.some((e) => e.text === 'Cat checks (auto-check)'));
  assert.ok(!t.log.some((e) => /turned auto-check/.test(e.text)), 'ticking is not announced');
  act(t, 'Bob', 'bet', 20);
  assert.equal(toActName(t), 'Cat', 'facing a bet she decides');
  act(t, 'Cat', 'fold'); act(t, 'Ann', 'fold');
  ctx.now += 60e3; G.tick(t, ctx);
  assert.ok(t.hand && t.hand.number === 2);
  assert.equal(t.hand.players[2].autoCheck, false, 'reset at the new hand');
  const t4 = makeTable(['Ann', 'Bob'], { autoCheck: true });
  G.setAutoCheck(t4.t, 'p1', false, t4.ctx); // between hands: for the next hand only
  start(t4.t, t4.ctx);
  assert.equal(t4.t.hand.players[1].autoCheck, false); assert.equal(t4.t.hand.players[0].autoCheck, true);
  assert.equal(t4.t.seats[1].nextAutoCheck, undefined, 'used up');
});

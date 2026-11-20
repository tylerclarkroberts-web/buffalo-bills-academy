// All-in (or any bet that leaves a seat under the minimum) must deal and play immediately.
// A leftover under the min used to drop the seat out of "still needs to bet," so the hand
// sat on "waiting for the others" until the turn clock — default one day — ran out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';
import { canDo } from '../server/blackjack/game.js';
import { freshDeck } from '../server/blackjack/rules.js';
import { mulberry } from '../server/blackjack/sim.js';
function fixture(t, seed = 7) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-allin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) accounts.ensure(p);
  const r = mulberry(seed);
  f.store = store; f.P = store.players;
  f.bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: (n) => Math.floor(r() * n) });
  f.open = (settings, players = ['ann'], host = 'house') => {
    const v = f.bj.create(f.P[host], { settings: { buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20, ...settings } });
    for (const x of players) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P[host], v.code);
    return f.bj.table(v.code);
  };
  return f;
}
// pop order: the engine deals with deck.pop(); one seat gets p1, dealer up, p2, dealer hole
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

test('a solo all-in bet deals immediately instead of waiting on the turn clock', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', turnSec: 86400 }, ['ann']);
  tb.seats[0].chips = 25;
  tb.deck = rig('Th', '6c', '8d', '9s'); // 18 vs 15 — still the player's turn, not a blackjack
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  assert.equal(tb.seats[0].chips, 0, 'the whole stack is in the pot');
  assert.notEqual(tb.round.phase, 'betting', 'must not sit on "waiting for the others" until the one-day clock');
  assert.ok(tb.round.hands.length === 1 && tb.round.hands[0].cards.length === 2, 'the all-in seat is dealt a hand');
  assert.deepEqual(tb.round.hands[0].cards, ['Th', '8d']);
  assert.equal(tb.round.phase, 'play');
  assert.equal(tb.round.hands[0].seat, 0);
  assert.equal(tb.round.turn, 0);
  const v = f.bj.view(f.P.ann, tb.code);
  assert.equal(v.round.myTurn, true);
  assert.equal(v.round.can.double, false, 'no chips left to double');
  assert.equal(v.round.can.split, false, 'no chips left to split');
  assert.equal(f.bj.list(f.P.ann)[0].turnLabel, 'Your turn');
});

test('a bet that leaves the seat under the minimum also deals once everyone else is in', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 27; // leftover $2 is under the $5 min
  tb.deck = rig('Th', '7c', '8d', '9s');
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  assert.equal(tb.seats[0].chips, 2);
  assert.notEqual(tb.round.phase, 'betting');
  assert.equal(tb.round.phase, 'play');
});

test('an all-in does not skip a teammate who still needs to bet', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann', 'bob']);
  tb.seats[0].chips = 25;
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  assert.equal(tb.round.phase, 'betting', 'still waiting on bob');
  assert.equal(f.bj.list(f.P.ann)[0].turnLabel, 'Waiting for bets');
  assert.equal(f.bj.list(f.P.bob)[0].turnLabel, 'Place your bet');
  // two-seat deal order: ann, bob, dealer up, then ann, bob, dealer hole
  tb.deck = [...freshDeck().filter((c) => !['Ah', 'Th', '6c', 'Kd', '4s', '9d'].includes(c)), '9d', '4s', 'Kd', '6c', 'Th', 'Ah'];
  f.bj.bet(f.P.bob, tb.code, { bet: 10 });
  assert.equal(tb.round.phase, 'play');
  assert.equal(tb.round.hands.length, 2);
});

test('two all-ins at the same table deal as soon as the second bet is down', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann', 'bob']);
  tb.seats[0].chips = 25;
  tb.seats[1].chips = 15;
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  assert.equal(tb.round.phase, 'betting');
  tb.deck = [...freshDeck().filter((c) => !['Ah', 'Th', '6c', 'Kd', '4s', '9d'].includes(c)), '9d', '4s', 'Kd', '6c', 'Th', 'Ah'];
  f.bj.bet(f.P.bob, tb.code, { bet: 15 });
  assert.equal(tb.seats[0].chips, 0);
  assert.equal(tb.seats[1].chips, 0);
  assert.equal(tb.round.phase, 'play');
});

test('an all-in hand can hit and stand, and a win is paid back onto an empty stack', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 25;
  // 9+2 hit 10 = 21, dealer 6+9 stands 15, player wins
  tb.deck = rig('9h', '6c', '2d', '9s', ['Th']);
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  assert.equal(tb.round.phase, 'play');
  const can = canDo(tb, tb.round.hands[0]);
  assert.equal(can.double, false);
  assert.equal(can.split, false);
  f.bj.act(f.P.ann, tb.code, 'hit');
  // 21 auto-stands, the dealer plays, and a new betting round may already have started
  const last = tb.last;
  assert.ok(last.hands[0].cards.includes('Th'), 'the hit card was dealt');
  assert.ok(last, 'the hand settled');
  const res = last.results.find((x) => x.seat === 0);
  assert.equal(res.out, 'win');
  assert.equal(res.net, 25);
  // after a win of $25 the seat has $50 and a new betting round may be open
  const seat = tb.seats[0];
  if (tb.round?.phase === 'betting' && !tb.round.bets[0]) {
    assert.equal(seat.chips, 50);
  } else {
    assert.equal(seat.chips, 50);
  }
});

test('all-in blackjack pays 3:2 onto an empty stack', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 20;
  tb.deck = rig('Ah', '6c', 'Kd', '9d');
  f.bj.bet(f.P.ann, tb.code, { bet: 20 });
  // BJ auto-finishes and a new betting round may already have started
  assert.ok(tb.last, 'blackjack settled immediately');
  const res = tb.last.results.find((x) => x.seat === 0);
  assert.equal(res.out, 'blackjack');
  assert.equal(res.net, 30);
  assert.equal(tb.seats[0].chips, 50);
});

test('an all-in loss leaves the seat at zero and ends the game if they cannot cover the min', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 20;
  tb.deck = rig('Th', 'Kc', '9d', 'Qs'); // 19 vs 20
  f.bj.bet(f.P.ann, tb.code, { bet: 20 });
  f.bj.act(f.P.ann, tb.code, 'stand');
  const res = tb.last.results.find((x) => x.seat === 0);
  assert.equal(res.out, 'lose');
  assert.equal(res.net, -20);
  assert.equal(tb.seats[0].chips, 0);
  assert.equal(tb.status, 'over');
});

test('a split pair is refused when the seat is all-in; they can still hit or stand', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 20;
  tb.deck = rig('8h', '6c', '8d', '9s');
  f.bj.bet(f.P.ann, tb.code, { bet: 20 });
  const can = canDo(tb, tb.round.hands[0]);
  assert.equal(can.split, false);
  assert.equal(can.double, false);
  assert.throws(() => f.bj.act(f.P.ann, tb.code, 'split'), /chip|enough|split|double/i);
  f.bj.act(f.P.ann, tb.code, 'stand');
  assert.ok(tb.last);
});

test('all-in insurance: decline is fine, taking it is refused with no chips left', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  tb.seats[0].chips = 20;
  tb.deck = rig('Th', 'Ac', '9d', '8s');
  f.bj.bet(f.P.ann, tb.code, { bet: 20 });
  assert.equal(tb.round.phase, 'insurance');
  assert.equal(tb.seats[0].chips, 0);
  assert.throws(() => f.bj.insure(f.P.ann, tb.code, true), /chip|enough|insurance/i);
  f.bj.insure(f.P.ann, tb.code, false);
  assert.equal(tb.round.phase, 'play');
  f.bj.act(f.P.ann, tb.code, 'stand');
  assert.ok(tb.last);
});

test('continuous play: a solo all-in also deals immediately', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true }, ['ann']);
  tb.seats[0].chips = 25;
  tb.lanes[0].deck = rig('Th', '6c', '8d', '9s');
  f.bj.bet(f.P.ann, tb.code, { bet: 25 });
  const lane = tb.lanes[0];
  assert.notEqual(lane.round.phase, 'betting', 'continuous all-in must not wait on a missing teammate');
  assert.equal(lane.round.phase, 'play');
  assert.equal(tb.seats[0].chips, 0);
  assert.equal(f.bj.list(f.P.ann)[0].turnLabel, 'Your turn');
});

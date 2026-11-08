import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable, act, toActName, riggedDeck } from './helpers.js';

const start = (t, ctx, deck) => { if (deck) ctx.deck = deck; G.startGame(t, t.hostId, ctx); delete ctx.deck; };

test('heads-up: button posts small blind and acts first preflop, last after the flop', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx);
  const h = t.hand;
  assert.equal(h.buttonSeat, 0);
  assert.equal(h.sbSeat, 0);
  assert.equal(h.bbSeat, 1);
  assert.equal(t.seats[0].stack, 990);
  assert.equal(t.seats[1].stack, 980);
  assert.equal(toActName(t), 'Ann');
  act(t, 'Ann', 'call');
  assert.equal(toActName(t), 'Bob', 'big blind gets the option');
  act(t, 'Bob', 'check');
  assert.equal(t.hand.street, 'flop');
  assert.equal(t.hand.board.length, 3);
  assert.equal(toActName(t), 'Bob', 'big blind acts first after the flop heads-up');
});

test('3+ players: blinds left of button, under-the-gun acts first, button rotates', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan']);
  start(t, ctx);
  assert.deepEqual([t.hand.buttonSeat, t.hand.sbSeat, t.hand.bbSeat], [0, 1, 2]);
  assert.equal(toActName(t), 'Dan');
  act(t, 'Dan', 'fold'); act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');
  assert.equal(t.hand, null, 'Cat wins uncontested');
  assert.equal(t.seats[2].stack, 1010);
  G.tick(t, { now: 5000 });
  assert.deepEqual([t.hand.buttonSeat, t.hand.sbSeat, t.hand.bbSeat], [1, 2, 3]);
  assert.equal(toActName(t), 'Ann');
});

test('min-raise: must raise by at least the last raise; bets track correctly', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  // Ann (button) first preflop. BB=20.
  assert.throws(() => act(t, 'Ann', 'raise', 30), /Minimum raise is to 40/);
  act(t, 'Ann', 'raise', 60); // raise of 40
  assert.equal(t.hand.minRaise, 40);
  assert.throws(() => act(t, 'Bob', 'raise', 90), /Minimum raise is to 100/);
  act(t, 'Bob', 'raise', 100);
  assert.equal(G.legalActions(t, 2).minRaiseTo, 140);
  assert.throws(() => act(t, 'Cat', 'check'), /can't check/);
  act(t, 'Cat', 'call');
  act(t, 'Ann', 'call');
  assert.equal(t.hand.street, 'flop');
  assert.equal(t.hand.potBehind ?? G.viewFor(t, 'p0', 0).hand.pot, 300);
  // postflop: min bet is the big blind
  assert.equal(toActName(t), 'Bob');
  assert.equal(G.legalActions(t, 1).minRaiseTo, 20);
  act(t, 'Bob', 'bet', 20);
  act(t, 'Cat', 'raise', 40);
  assert.throws(() => act(t, 'Ann', 'raise', 50), /Minimum raise is to 60/);
});

test('big blind option: limped pot lets the BB raise', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call');
  assert.equal(toActName(t), 'Cat');
  const L = G.legalActions(t, 2);
  assert.equal(L.canCheck, true);
  assert.equal(L.canRaise, true);
  act(t, 'Cat', 'raise', 60);
  assert.equal(toActName(t), 'Ann');
});

test('short all-in raise does not reopen betting for players who already acted', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  t.seats[2].stack = 130; // Cat is short
  t.ledger.p2.buyIn = 130;
  start(t, ctx);
  // button Ann, SB Bob, BB Cat(130 -> 110 behind after posting 20)
  act(t, 'Ann', 'raise', 100); // full raise of 80
  act(t, 'Bob', 'call');
  act(t, 'Cat', 'allin'); // all-in to 130: only 30 more than 100, less than a full raise (80)
  assert.equal(t.hand.currentBet, 130);
  assert.equal(t.hand.minRaise, 80, 'min raise unchanged by the short all-in');
  assert.equal(toActName(t), 'Ann');
  const L = G.legalActions(t, 0);
  assert.equal(L.toCall, 30);
  assert.equal(L.canRaise, false, 'Ann already acted, so the short all-in does not reopen raising');
  assert.throws(() => act(t, 'Ann', 'raise', 300), /only call or fold/);
  act(t, 'Ann', 'call');
  assert.equal(G.legalActions(t, 1).canRaise, false);
  act(t, 'Bob', 'call');
  assert.equal(t.hand.street, 'flop');
});

test('short all-in does not block a player who has not acted yet', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan']);
  t.seats[0].stack = 50; t.ledger.p0.buyIn = 50;
  start(t, ctx);
  // button Ann(50), SB Bob, BB Cat, UTG Dan
  act(t, 'Dan', 'raise', 40);
  act(t, 'Ann', 'allin'); // to 50: short raise of 10
  // Bob has not acted yet -> may raise
  assert.equal(G.legalActions(t, 1).canRaise, true);
  assert.equal(G.legalActions(t, 1).minRaiseTo, 70, 'full raise is 50 + last full raise 20');
  act(t, 'Bob', 'fold');
  act(t, 'Cat', 'call');
  assert.equal(G.legalActions(t, 3).canRaise, false, 'Dan already acted and only faces a 10-chip short raise');
});

test('all-in for less than the call is a call', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  t.seats[1].stack = 300; t.ledger.p1.buyIn = 300;
  start(t, ctx);
  act(t, 'Ann', 'raise', 500);
  act(t, 'Bob', 'allin');
  // no one can bet: board runs out, showdown, hand over
  assert.equal(t.hand, null);
  assert.equal(t.lastHand.board.length, 5);
  assert.equal(t.seats[0].stack + t.seats[1].stack, 1300);
});

test('timeout rule: auto-check when nothing to call, auto-fold when facing a bet', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 30 });
  start(t, ctx);
  const d = t.hand.deadline;
  assert.equal(d, 1000 + 30000);
  assert.equal(G.tick(t, { now: d - 1 }), false, 'nothing happens before the deadline');
  assert.equal(G.tick(t, { now: d }), true);
  assert.match(t.log.at(-1).text, /Ann folds \(ran out of time\)/);
  act(t, 'Bob', 'call', undefined, d + 1);
  // Cat (BB) can check: timeout = check
  G.tick(t, { now: t.hand.deadline });
  assert.match(t.log.find((l) => /Cat checks \(ran out of time\)/.test(l.text)).text, /Cat/);
  assert.equal(t.hand.street, 'flop');
});

test('two timeouts in a row sit a player out; they get auto-acted instantly after that', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 10 });
  start(t, ctx);
  G.tick(t, { now: t.hand.deadline }); // Ann times out (fold)
  act(t, 'Bob', 'fold', undefined, 2000);
  assert.equal(t.hand, null);
  G.tick(t, { now: 99999 }); // next hand: button Bob, SB Cat, BB Ann, Bob acts first
  act(t, 'Bob', 'call', undefined, 100000); act(t, 'Cat', 'call', undefined, 100000);
  assert.equal(toActName(t), 'Ann');
  G.tick(t, { now: t.hand.deadline }); // second timeout: check, and sat out
  assert.equal(t.seats[0].sittingOut, true);
  // On the flop Ann's turn is auto-acted immediately
  act(t, 'Cat', 'bet', 20, 200000);
  assert.equal(t.hand.players[0].folded, true);
  assert.equal(toActName(t), 'Bob');
  G.setSittingOut(t, 'p0', false, { now: 200001 });
  assert.equal(t.seats[0].sittingOut, false);
});

test('side pots with three all-ins are awarded correctly', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat', 'Dan']);
  const stacks = [100, 300, 600, 1000];
  stacks.forEach((s, i) => { t.seats[i].stack = s; t.ledger[`p${i}`].buyIn = s; });
  // deal order from seat 1: Bob, Cat, Dan, Ann, Bob, Cat, Dan, Ann
  // Ann: quad aces (best), Bob: kings full, Cat: flush, Dan: worst
  const hole = { Ann: ['Ah', 'Ad'], Bob: ['Kh', 'Kd'], Cat: ['9c', '8c'], Dan: ['2h', '3d'] };
  const order = ['Bob', 'Cat', 'Dan', 'Ann'];
  const deal = [...order.map((n) => hole[n][0]), ...order.map((n) => hole[n][1])];
  start(t, ctx, riggedDeck(deal, ['As', 'Ac', 'Ks', '4c', 'Jc']));
  act(t, 'Dan', 'raise', 1000);
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'allin'); act(t, 'Cat', 'allin');
  assert.equal(t.hand, null);
  // main: 100*4=400 -> Ann. side1: 200*3=600 -> Bob (kings full beats flush). side2: 300*2=600 -> Cat (flush). Dan gets 400 uncalled back
  assert.deepEqual(t.seats.slice(0, 4).map((s) => s.stack), [400, 600, 600, 400]);
  assert.equal(G.chipsOnTable(t), 2000);
  assert.ok(t.log.some((l) => /Uncalled bet returned to Dan: 400/.test(l.text)));
  assert.equal(t.lastHand.pots.length, 4);
});

test('split pot with an odd chip goes to the first winner left of the button', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { smallBlind: 5, bigBlind: 10 });
  // deal order from seat 1: Bob, Cat, Ann x2. Bob & Cat tie with the board straight; Ann folds.
  const deal = ['2c', '2d', '7h', '3c', '3d', '8h'];
  start(t, ctx, riggedDeck(deal, ['Ts', 'Js', 'Qd', 'Kh', 'Ac']));
  // Ann calls 10 then folds later -> pot has an odd number after Bob/Cat
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check'); // pot 30
  act(t, 'Bob', 'bet', 15); act(t, 'Cat', 'call'); act(t, 'Ann', 'call'); // pot 75
  act(t, 'Bob', 'check'); act(t, 'Cat', 'check'); act(t, 'Ann', 'bet', 10); act(t, 'Bob', 'call'); act(t, 'Cat', 'call'); // pot 105
  act(t, 'Bob', 'check'); act(t, 'Cat', 'check'); act(t, 'Ann', 'check');
  assert.equal(t.hand, null);
  const res = t.lastHand.winners.map((w) => [w.name, w.amount]).sort();
  // all three play the board (Broadway on board) -> 3-way split 105 = 35 each
  assert.deepEqual(res, [['Ann', 35], ['Bob', 35], ['Cat', 35]]);
  assert.equal(G.chipsOnTable(t), 3000);
});

test('two-way split with odd chip', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { smallBlind: 5, bigBlind: 10 });
  // board: Kc Kd 7s 7h 2c. Bob & Cat have A kicker, Ann folds after putting chips in
  const deal = ['Ad', 'Ah', '3s', '4c', '5c', '9d'];
  start(t, ctx, riggedDeck(deal, ['Kc', 'Kd', '7s', '7h', '2c']));
  act(t, 'Ann', 'raise', 25); act(t, 'Bob', 'call'); act(t, 'Cat', 'call'); // pot 75
  act(t, 'Bob', 'bet', 10); act(t, 'Cat', 'call'); act(t, 'Ann', 'fold'); // pot 95
  act(t, 'Bob', 'check'); act(t, 'Cat', 'check');
  act(t, 'Bob', 'check'); act(t, 'Cat', 'check');
  assert.equal(t.hand, null);
  const won = Object.fromEntries(t.lastHand.winners.map((w) => [w.name, w.amount]));
  assert.deepEqual(won, { Bob: 48, Cat: 47 }, 'Bob is first left of the button (Ann) and gets the odd chip');
});

test('viewFor never leaks other players hole cards or the deck', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const v = G.viewFor(t, 'p1', 0);
  assert.equal(v.seats[1].cards.length, 2);
  assert.equal(v.seats[0].cards, null);
  assert.equal(v.seats[2].cards, null);
  const json = JSON.stringify(v);
  for (const i of [0, 2]) for (const c of t.hand.players[i].hole) assert.ok(!json.includes(`"${c}"`), `leaked ${c}`);
  assert.ok(!('deck' in v.hand));
  const outsider = G.viewFor(t, 'stranger', 0);
  assert.ok(outsider.seats.every((s) => !s || s.cards === null));
});

test('rebuy rules: only when below buy-in, not during your live hand, limited count', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { maxRebuys: 1 });
  start(t, ctx);
  assert.throws(() => G.rebuy(t, 'p0', ctx), /after this hand/);
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'call');
  const loser = t.seats.findIndex((s) => s && s.stack === 0); // empty seats are null (a chop leaves no loser)
  if (loser >= 0) {
    const id = t.seats[loser].playerId;
    G.rebuy(t, id, ctx);
    assert.equal(t.seats[loser].stack, 1000);
    assert.equal(t.ledger[id].buyIn, 2000);
    t.seats[loser].stack = 0; // pretend busted again
    assert.throws(() => G.rebuy(t, id, ctx), /used all 1 rebuys/);
  } else {
    assert.equal(t.seats[0].stack, 1000); // chopped
  }
  const off = makeTable(['A', 'B'], { maxRebuys: 0 });
  off.t.seats[0].stack = 0;
  assert.throws(() => G.rebuy(off.t, 'p0', off.ctx), /turned off/);
});

test('join while a hand is running waits for the next hand; seat limit enforced', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { maxPlayers: 3 });
  start(t, ctx);
  G.joinTable(t, { id: 'p9', name: 'Zed' }, undefined, ctx);
  assert.equal(t.seats[2].waiting, true);
  assert.equal(t.hand.players[2], null);
  assert.throws(() => G.joinTable(t, { id: 'p8', name: 'Yan' }, undefined, ctx), /full/);
  act(t, 'Ann', 'fold');
  G.tick(t, { now: 99999 });
  assert.ok(t.hand.players[2], 'Zed is dealt in on the next hand');
});

test('leave mid-hand cashes out after the hand; no kicking, a player who left can rejoin; close refunds the pot', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  G.leaveTable(t, 'p0', ctx); // Ann is to act: auto-folds right away
  assert.equal(t.hand.players[0].folded, true);
  assert.ok(t.seats[0], 'still seated until the hand ends');
  act(t, 'Bob', 'fold');
  assert.equal(t.seats[0], null);
  assert.equal(t.ledger.p0.cashOut, 1000);
  assert.equal(G.kickPlayer, undefined, 'kicking players was removed');
  assert.equal('banned' in t, false);
  G.joinTable(t, { id: 'p0', name: 'Ann' }, undefined, ctx); // host returns
  G.leaveTable(t, 'p1', ctx); G.joinTable(t, { id: 'p1', name: 'Bob' }, undefined, ctx); // leaving is voluntary and never locks you out
  G.tick(t, { now: 99999 });
  assert.ok(t.hand);
  G.closeTable(t, 'p0', ctx);
  assert.equal(t.status, 'closed');
  assert.equal(t.hand, null);
  assert.equal(G.totalCashedOut(t), G.totalBoughtIn(t), 'every chip is accounted for after closing');
});

test('host must start with at least 2 players; settings validated', () => {
  const { t, ctx } = makeTable(['Ann']);
  assert.throws(() => G.startGame(t, 'p0', ctx), /at least 2/);
  assert.throws(() => G.normalizeSettings({ maxPlayers: 10 }), /Seats/);
  assert.throws(() => G.normalizeSettings({ smallBlind: 50, bigBlind: 20 }), /Small blind/);
  assert.equal(G.normalizeSettings({ bigBlind: 50 }).smallBlind, 25);
  assert.equal(G.normalizeSettings({}).turnSeconds, 86400);
});

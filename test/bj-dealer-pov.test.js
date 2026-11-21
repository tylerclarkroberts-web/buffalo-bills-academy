// Dealer POV: tips (ledger, idempotency, refusals), manual deal vs autopilot on the same shoe,
// stall-to-autopilot, and the pit boss profanity hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';
import { freshDeck } from '../server/blackjack/rules.js';
import { STALL_MS, dealerPrompt } from '../server/blackjack/pace.js';
import { hasProfanity, SWEAR_LINE, PHONE_LINE, PIT_NAME } from '../server/blackjack/pitboss.js';
import { TIP_AMOUNTS } from '../server/blackjack/tips.js';
import { gestureFromLog, samplePose, revealDelay, isHitTap, isStandWave, isDoubleFinger, isSplitV } from '../client/src/bj/povGestures.js';
import { seatAvatar, seatsInOrder, occupiedSeats, seatFigureKey, isAway, seatLayout, seatSpacing, seatsClear, ARC, HAND_SPAN } from '../client/src/bj/povSeats.js';
import { mulberry } from '../server/blackjack/sim.js';

function fixture(t, seed = 11) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) { accounts.ensure(p); accounts.change(p, 4000, 'dev', 'test float', { save: false }); }
  accounts.save();
  const r = mulberry(seed);
  f.store = store; f.P = store.players; f.accounts = accounts;
  f.bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: (n) => Math.floor(r() * n) });
  f.open = (deck, { auto = true, players = ['ann'] } = {}) => {
    const v = f.bj.create(f.P.house, { settings: { house: 'me', buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20 } });
    for (const x of players) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P.house, v.code);
    const tb = f.bj.table(v.code);
    tb.house.autopilot = auto;
    if (deck) tb.deck = deck.slice();
    return tb;
  };
  f.money = () => Math.round(Object.values(f.P).reduce((a, p) => a + p.bankroll, 0) * 100) / 100;
  f.ledger = (id) => (f.P[id].txns || []).filter((x) => x.type === 'bj-tip');
  return f;
}
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

test('hasProfanity catches a real outburst and ignores clean table talk', () => {
  assert.equal(hasProfanity('this is shit'), true);
  assert.equal(hasProfanity('What a shitty deal'), true);
  assert.equal(hasProfanity('Nice hit, partner'), false);
  assert.equal(hasProfanity('I passed on that class'), false);
});

test('tip ledger: balance, idempotency, refuse self-tips, no-dealer tips, and over-balance', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  const before = f.money();
  const houseBefore = f.P.house.bankroll, annBefore = f.P.ann.bankroll;
  const v = f.bj.tip(f.P.ann, tb.code, { amount: 5, id: 'tip-a' });
  assert.equal(f.P.ann.bankroll, annBefore - 5);
  assert.equal(f.P.house.bankroll, houseBefore + 5);
  assert.equal(f.money(), before, 'tips are a transfer: the closed economy is conserved');
  assert.equal(v.tip.amount, 5);
  assert.equal(v.tip.thanks, 'Thanks for the tip');
  assert.equal(f.ledger('ann').length, 1);
  assert.equal(f.ledger('house').length, 1);
  assert.match(f.ledger('ann')[0].note, /Tip \$5 to house/);
  assert.match(f.ledger('house')[0].note, /Tip \$5 from ann/);
  // idempotent retry
  f.bj.tip(f.P.ann, tb.code, { amount: 5, id: 'tip-a' });
  assert.equal(f.P.ann.bankroll, annBefore - 5);
  assert.equal(f.P.house.bankroll, houseBefore + 5);
  assert.equal(f.ledger('ann').length, 1);
  assert.equal(f.money(), before);
  assert.throws(() => f.bj.tip(f.P.house, tb.code, { amount: 1, id: 'self' }), /can't tip yourself/);
  assert.throws(() => f.bj.tip(f.P.ann, tb.code, { amount: 7, id: 'bad' }), /Tips are \$1, \$5, \$25/);
  f.P.ann.bankroll = 2;
  assert.throws(() => f.bj.tip(f.P.ann, tb.code, { amount: 5, id: 'poor' }), /need \$5 for that tip|Not enough money/i);
  assert.equal(f.ledger('ann').length, 1);
  // no human dealing
  const g = f.bj.create(f.P.house, { settings: { house: 'guntrad', buyIn: 200, minBet: 5, maxBetX: 20 } });
  f.bj.join(f.P.bob, g.code, true);
  f.bj.start(f.P.house, g.code);
  assert.throws(() => f.bj.tip(f.P.bob, g.code, { amount: 1, id: 'g' }), /No one is dealing/);
  assert.ok(TIP_AMOUNTS.includes(25));
});

function snapshot(tb) {
  return {
    dealer: (tb.last || tb.round)?.dealer?.slice?.() || tb.round?.dealer?.slice(),
    hands: (tb.last?.hands || tb.round?.hands || []).map((h) => ({ seat: h.seat, cards: h.cards.slice(), bet: h.bet })),
    results: tb.last?.results?.map((x) => ({ seat: x.seat, out: x.out, net: x.net })),
    chips: tb.seats.map((s) => s && s.chips),
    bank: tb.house.bank,
  };
}

test('manual dealer actions cannot change outcomes vs autopilot given the same shoe', (t) => {
  const deck = rig('9h', '7c', '5d', '8s', ['4c']); // ann 9-5, dealer 7-8, no hits needed if she stands; dealer 15 would need a hit if we stood... 9+5=14, stand, dealer 7+8=15 hits 4 = 19, ann loses
  const auto = fixture(t, 3);
  const a = auto.open(deck, { auto: true });
  auto.bj.bet(auto.P.ann, a.code, { bet: 10 });
  assert.equal(a.round.phase, 'play');
  auto.bj.act(auto.P.ann, a.code, 'stand');
  const want = snapshot(a);

  const man = fixture(t, 3);
  const b = man.open(deck, { auto: false });
  man.bj.bet(man.P.ann, b.code, { bet: 10 });
  assert.equal(b.round.phase, 'dealing');
  assert.equal(man.bj.view(man.P.ann, b.code).round.dealer.length, 0, 'no cards shown until the dealer deals');
  // 4 steps: ann1, upcard, ann2, hole
  for (let i = 0; i < 4; i++) man.bj.dealerAct(man.P.house, b.code, 'deal');
  assert.equal(b.round.phase, 'play');
  const vis = man.bj.view(man.P.ann, b.code);
  assert.deepEqual(vis.round.hands[0].cards, ['9h', '5d']);
  assert.equal(vis.round.dealer[0], '7c');
  assert.equal(vis.round.dealer[1], null, 'hole stays down');
  man.bj.act(man.P.ann, b.code, 'stand');
  assert.equal(b.round.phase, 'dealer');
  man.bj.dealerAct(man.P.house, b.code, 'flip');
  if (b.round?.phase === 'dealer') man.bj.dealerAct(man.P.house, b.code, 'draw');
  const got = snapshot(b);
  assert.deepEqual(got.dealer, want.dealer);
  assert.deepEqual(got.hands, want.hands);
  assert.deepEqual(got.results, want.results);
  assert.deepEqual(got.chips, want.chips);
  assert.equal(got.bank, want.bank);
});

test('a stalled manual dealer is advanced after the timeout so the hand never sticks', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'), { auto: false });
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  assert.equal(tb.round.phase, 'dealing');
  assert.equal(tb.round.dealStep, 0);
  f.now += STALL_MS;
  f.bj.tick();
  assert.notEqual(tb.round.phase, 'dealing', 'the deal finished itself');
  assert.ok(['play', 'insurance', 'betting', 'done', 'dealer'].includes(tb.round.phase) || tb.last, `phase=${tb.round?.phase}`);
  // a pending hit also flushes
  const f2 = fixture(t, 5);
  const deck = rig('9h', '7c', '5d', '8s', ['4c']);
  const t2 = f2.open(deck, { auto: false });
  f2.bj.bet(f2.P.ann, t2.code, { bet: 10 });
  for (let i = 0; i < 4; i++) f2.bj.dealerAct(f2.P.house, t2.code, 'deal');
  f2.bj.act(f2.P.ann, t2.code, 'hit');
  assert.ok(t2.round.pending, 'the hit card waits on the dealer');
  const hidden = f2.bj.view(f2.P.ann, t2.code).round.hands[0].cards;
  assert.equal(hidden[hidden.length - 1], null);
  f2.now += STALL_MS;
  f2.bj.tick();
  assert.equal(t2.round.pending, null);
  const shown = f2.bj.view(f2.P.ann, t2.code).round.hands[0].cards;
  assert.equal(shown[shown.length - 1], '4c', 'the hit card is now face up');
  assert.ok(t2.round.phase === 'play' || t2.round.phase === 'dealer' || t2.last, `phase=${t2.round?.phase}`);
});

test('pit boss walks over and names a player who swears in chat', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.view(f.P.house, tb.code); // presence
  const v = f.bj.say(f.P.ann, tb.code, 'this is shit');
  assert.ok(v.pit, 'Brisk is on the felt');
  assert.equal(v.pit.name, PIT_NAME);
  assert.equal(v.pit.line, SWEAR_LINE('ann'));
  assert.equal(v.pit.targetName, 'ann');
  assert.equal(v.pit.kind, 'swear');
  assert.equal(v.chat.at(-1).swear, true);
  const clean = f.bj.say(f.P.ann, tb.code, 'nice hit');
  // a live visit may still be up; the clean line is not itself a swear
  assert.equal(clean.chat.at(-1).swear, false);
  assert.equal(clean.chat.at(-1).text, 'nice hit');
});

test('the all-in wait is unchanged: a solo all-in does not sit on a stuck deal', (t) => {
  // Regression guard for #192: an all-in under the min, already bet, must deal without waiting on the clock.
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'), { auto: true });
  const seat = tb.seats[0];
  seat.chips = 10; // exact all-in at the table min? min is 5. Leave them with 10, bet 10, chips 0 < min.
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  assert.ok(tb.round, 'a round is out');
  assert.notEqual(tb.round.phase, 'betting', 'the deal ran: we did not wait on an all-in for the others');
});


test('gestureFromLog reads hit, stand, double and split from the table log and ignores already-seen seqs', () => {
  const log = [
    { seq: 10, ev: { k: 'deal', seat: 0 } },
    { seq: 11, ev: { k: 'hit', seat: 0 } },
    { seq: 12, ev: { k: 'stand', seat: 1 } },
    { seq: 13, ev: { k: 'double', seat: 0 } },
    { seq: 14, ev: { k: 'split', seat: 2 } },
    { seq: 15, ev: { k: 'say', text: 'nice' } },
  ];
  assert.deepEqual(gestureFromLog(log, 10), { kind: 'hit', seat: 0, seq: 11, at: undefined });
  assert.equal(gestureFromLog(log, 11).kind, 'stand');
  assert.equal(gestureFromLog(log, 12).kind, 'double');
  assert.equal(gestureFromLog(log, 13).kind, 'split');
  assert.equal(gestureFromLog(log, 14), null);
  assert.equal(gestureFromLog([], 0), null);
});

test('hand-signal poses: hit taps, stand waves, double one finger, split a V, after a mid-gesture reveal delay', () => {
  const hit = samplePose('hit', 0.34);
  const stand = samplePose('stand', 0.4);
  const dbl = samplePose('double', 0.5);
  const split = samplePose('split', 0.5);
  assert.equal(isHitTap(hit), true);
  assert.equal(isStandWave(stand), true);
  assert.equal(isDoubleFinger(dbl), true);
  assert.equal(isSplitV(split), true);
  assert.equal(isHitTap(samplePose('stand', 0.4)), false);
  assert.ok(revealDelay('hit') < 900 && revealDelay('hit') > 200);
  assert.ok(revealDelay('split') > revealDelay('hit'));
});


test('dealer prompt says Autopilot is dealing when autopilot is on, never "Autopilot is off"', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'), { auto: true });
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  const on = dealerPrompt(tb);
  assert.equal(on.autopilot, true);
  assert.equal(on.label, 'Autopilot is dealing');
  assert.notEqual(on.label, 'Autopilot is off');
  tb.house.autopilot = false;
  const off = dealerPrompt(tb);
  assert.equal(off.autopilot, false);
  assert.notEqual(off.label, 'Autopilot is off');
  assert.match(off.label, /Waiting on a player|Waiting on bets|You.re dealing|Deal|Flip|Draw|Insurance|house is still/i);
});


test('avatar identity maps to the seat player id, gestures follow that seat\'s real action, and empty seats stay empty', () => {
  const seats = [
    { i: 0, id: 'ann', name: 'Ann', avatar: { kind: 'gen', seed: 'ann-hair' } },
    null,
    { i: 2, name: 'Cal', bot: true, avatar: { kind: 'gen', seed: 'bjbot:Cal', bot: true } },
    { i: 3, id: 'dee', name: 'Dee' },
  ];
  const ordered = seatsInOrder(seats, 5);
  assert.equal(ordered.length, 5);
  assert.equal(ordered[1], null);
  assert.equal(ordered[4], null);
  assert.deepEqual(occupiedSeats(seats, 5).map((s) => s.i), [0, 2, 3]);
  assert.equal(seatFigureKey(ordered[0]), 'ann');
  assert.equal(seatAvatar(ordered[0]).seed, 'ann-hair');
  assert.equal(seatAvatar(ordered[0]).kind, 'gen');
  assert.equal(seatFigureKey(ordered[2]), 'bot:Cal:2');
  assert.equal(seatAvatar(ordered[2]).seed, 'bjbot:Cal');
  assert.equal(seatAvatar(ordered[2]).bot, true);
  assert.equal(seatFigureKey(ordered[3]), 'dee');
  assert.equal(seatAvatar(ordered[3]).seed, 'dee');
  assert.equal(seatAvatar(null), null);
  assert.equal(isAway(ordered[0]), false);
  assert.equal(isAway({ ...ordered[0], away: true }), true);
  assert.equal(isAway(ordered[2], { watchers: { Cal: 1 }, now: 20_000, staleMs: 8000 }), false);

  const log = [
    { seq: 20, ev: { k: 'deal', seat: 0 } },
    { seq: 21, ev: { k: 'hit', seat: 2 } },
    { seq: 22, ev: { k: 'stand', seat: 0 } },
    { seq: 23, ev: { k: 'split', seat: 3 } },
  ];
  const hit = gestureFromLog(log, 20);
  assert.deepEqual({ kind: hit.kind, seat: hit.seat, seq: hit.seq }, { kind: 'hit', seat: 2, seq: 21 });
  const stand = gestureFromLog(log, 21);
  assert.deepEqual({ kind: stand.kind, seat: stand.seat }, { kind: 'stand', seat: 0 });
  const split = gestureFromLog(log, 22);
  assert.deepEqual({ kind: split.kind, seat: split.seat }, { kind: 'split', seat: 3 });
  assert.equal(gestureFromLog(log, 23), null);
});


test('seats are distributed on a 150-degree arc so neighboring hands do not overlap', () => {
  assert.ok(Math.abs(ARC - (150 * Math.PI / 180)) < 1e-9);
  const span = Math.abs(seatLayout(5, 0).yaw - seatLayout(5, 4).yaw);
  assert.ok(span > 2.5 && span < 2.7, `arc was ${span}`);
  assert.equal(seatsClear(5), true);
  assert.ok(seatSpacing(5) > HAND_SPAN + 0.08);
  const a = seatLayout(5, 0), b = seatLayout(5, 1);
  const d = Math.hypot(a.cardX - b.cardX, a.cardZ - b.cardZ);
  assert.ok(d > HAND_SPAN + 0.08, `adjacent circles ${d}`);
  // Empty seats keep their index so a hole leaves a gap, and no extra figure is invented.
  const ordered = seatsInOrder([{ i: 0, id: 'ann', name: 'Ann' }, null, { i: 2, id: 'cal', name: 'Cal' }], 5);
  assert.equal(ordered[1], null);
  assert.equal(ordered[3], null);
  assert.ok(Math.abs(seatLayout(5, 0).x - seatLayout(5, 2).x) > Math.abs(seatLayout(3, 0).x - seatLayout(3, 1).x) * 0.4);
});

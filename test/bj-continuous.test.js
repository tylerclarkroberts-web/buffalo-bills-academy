// Individual continuous play (each seat its own single-deck game vs one house bank) and the sneak-bet easter egg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';
import { basicStrategy, freshDeck } from '../server/blackjack/rules.js';
import { mulberry } from '../server/blackjack/sim.js';
import * as C from '../server/blackjack/continuous.js';

function fixture(t, seed = 7) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-cont-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob', 'cat', 'dan', 'eve', 'fay'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) accounts.ensure(p);
  const r = mulberry(seed);
  f.store = store; f.P = store.players;
  f.bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: (n) => Math.floor(r() * n) });
  f.open = (settings, players = ['ann', 'bob', 'cat'], host = 'house') => {
    const v = f.bj.create(f.P[host], { settings: { buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20, ...settings } });
    for (const x of players) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P[host], v.code);
    return f.bj.table(v.code);
  };
  // every dollar in the closed economy: bankrolls + chips on seats + a staked bank + stakes still on the felt
  f.money = (...tables) => {
    let open = 0, chips = 0, bank = 0;
    for (const t of tables) {
    const rounds = C.isContinuous(t) ? Object.values(t.lanes || {}).filter((l) => l.status === 'playing').map((l) => l.round) : [t.round];
    for (const r of rounds) {
      if (!r || ['done', 'over'].includes(r.phase)) continue;
      if (r.phase === 'betting') for (const b of Object.values(r.bets)) { if (!b.out) open += b.bet + (b.side.match || 0) + (b.side.pairs || 0); }
      else for (const h of r.hands) open += h.bet;
    }
    chips += t.seats.reduce((a, s) => a + (s && !s.left ? s.chips : 0), 0);
    bank += t.house.staked ? t.house.bank : 0;
    }
    return Math.round((Object.values(f.P).reduce((a, p) => a + p.bankroll, 0) + chips + bank + open) * 100) / 100;
  };
  return f;
}
// pop order: the engine deals with deck.pop(); one seat gets p1, dealer up, p2, dealer hole
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};
/** One basic-strategy move for a player, whatever their game is waiting on. Returns false when nothing to do. */
function step(f, t, id, bet = 10) {
  const p = f.P[id]; const v = f.bj.view(p, t.code); const r = v.round;
  if (!r || v.status !== 'playing' || v.mySeat < 0 || v.laneOver) return false;
  if (r.phase === 'betting' && !r.bets[v.mySeat]) {
    const b = Math.floor(Math.min(bet, v.limits.maxNow, v.seats[v.mySeat].chips));
    if (b < v.limits.min) return false;
    f.bj.bet(p, t.code, { bet: b }); return true;
  }
  if (r.myInsurance) { f.bj.insure(p, t.code, false); return true; }
  if (r.myTurn) {
    const h = r.hands[r.turn];
    f.bj.act(p, t.code, basicStrategy(h.cards, r.dealer[0], { ...r.can, double: r.can.double, split: r.can.split }));
    return true;
  }
  return false;
}

test('continuous: each seat runs its own single-deck rounds without waiting on anyone', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true });
  assert.equal(tb.round, null, 'no shared round');
  assert.deepEqual(Object.keys(tb.lanes).map(Number), [0, 1, 2]);
  for (const l of Object.values(tb.lanes)) { assert.equal(l.round.phase, 'betting'); assert.equal(l.deck.length, 52); }
  // ann plays ten rounds while bob and cat never bet
  let rounds = 0;
  while (tb.lanes[0].roundNo < 11 && rounds++ < 200) step(f, tb, 'ann');
  assert.ok(tb.lanes[0].roundNo >= 11, 'ann kept playing on her own');
  assert.equal(tb.lanes[1].roundNo, 1); assert.equal(tb.lanes[1].round.phase, 'betting');
  assert.equal(tb.lanes[2].roundNo, 1);
  assert.equal(tb.lanes[1].deck.length, 52, "bob's deck is untouched by ann's rounds");
  assert.ok(tb.lanes[0].shuffles >= 2, "ann's single deck reshuffles on its own schedule");
  // bob's view is his own game: round 1, his own deck, none of ann's cards
  const vb = f.bj.view(f.P.bob, tb.code);
  assert.equal(vb.continuous, true); assert.equal(vb.round.no, 1); assert.equal(vb.deckLeft, 52); assert.equal(vb.last, null);
  assert.ok(vb.log.every((e) => e.lane == null || e.lane === 1), "bob's log hides other seats' games");
  assert.equal(vb.lanes[0].no, tb.lanes[0].roundNo, 'a card-free line for everyone else');
  assert.equal(vb.lanes[0].cards, undefined);
  // two players' hands can be in play at the same moment
  const fresh = fixture(t, 99); const t2 = fresh.open({ house: 'me', continuous: true });
  t2.lanes[0].deck = rig('Th', '9c', '6d', '8s'); t2.lanes[1].deck = rig('Ts', '9d', '5d', '8h');
  fresh.bj.bet(fresh.P.ann, t2.code, { bet: 10 }); fresh.bj.bet(fresh.P.bob, t2.code, { bet: 10 });
  assert.equal(t2.lanes[0].round.phase, 'play'); assert.equal(t2.lanes[1].round.phase, 'play');
  fresh.bj.act(fresh.P.bob, t2.code, 'stand');
  assert.equal(t2.lanes[1].roundNo, 2, 'bob finished and moved on'); assert.equal(t2.lanes[0].round.phase, 'play', 'ann is still mid-hand');
  assert.throws(() => fresh.bj.sitOut(fresh.P.cat, t2.code), /Nobody's waiting/);
});

test('continuous: a human house runs N games at once against one bank, and money is conserved', (t) => {
  const f = fixture(t, 3);
  const tb = f.open({ house: 'me', continuous: true }, ['ann', 'bob', 'cat']);
  const start = f.money(tb);
  for (let n = 0; n < 1500 && tb.status === 'playing'; n++) {
    const who = ['ann', 'bob', 'cat'][n % 3];
    step(f, tb, who, 10 + (n % 4) * 5);
    assert.equal(f.money(tb), start, `conserved after step ${n}`);
  }
  const played = Object.values(tb.lanes).map((l) => l.roundNo);
  assert.ok(played.every((x) => x > 20), `every seat played its own rounds (${played})`);
  assert.ok(tb.house.bank !== 1000, 'one bank took every lane\'s wins and losses');
  f.bj.close(f.P.house, tb.code);
  assert.equal(tb.status, 'closed');
  assert.equal(f.money(tb), start);
  assert.ok(tb.seats.every((s) => !s || s.left), 'everyone cashed out');
  const e = ['house', 'ann', 'bob', 'cat'].reduce((a, id) => a + f.bj.earnings(id).net, 0);
  assert.ok(Math.abs(e) < 0.01, 'earnings net to zero across house and players');
});

test('continuous: the exposure cap refuses bets the bank could not cover alongside open hands', (t) => {
  const f = fixture(t);
  // $500 bank: bets max $50 (a tenth); each open $50 bet reserves $100 (a doubled win)
  const tb = f.open({ house: 'me', continuous: true, houseBank: 500, maxSeats: 6 }, ['ann', 'bob', 'cat', 'dan', 'eve', 'fay']);
  for (const [i, l] of Object.entries(tb.lanes)) l.deck = rig('Th', '9c', '6d', '8s'.replace('s', 'shdc'[i % 4]));
  for (const id of ['ann', 'bob', 'cat', 'dan', 'eve']) f.bj.bet(f.P[id], tb.code, { bet: 50 });
  assert.equal(C.freeBank(tb), 0, '5 × $100 reserved = the whole $500 bank');
  assert.equal(f.bj.view(f.P.fay, tb.code).limits.maxNow, 0, 'the bet bar shows nothing left to bet');
  const before = f.money(tb);
  assert.throws(() => f.bj.bet(f.P.fay, tb.code, { bet: 5 }), /can only cover \$0 more right now \(5 other hands in play\)/);
  assert.equal(f.money(tb), before); assert.equal(tb.lanes[5].round.bets[5], undefined, 'refused bets take no chips');
  // as soon as one hand settles its reserve comes back
  f.bj.act(f.P.ann, tb.code, 'stand');
  assert.ok(C.freeBank(tb) >= 100);
  f.bj.bet(f.P.fay, tb.code, { bet: 50 });
  // royal bets reserve their top payout: $5 Royal Match × 25 + $10 × 2 = $145
  const f2 = fixture(t); const t2 = f2.open({ house: 'me', continuous: true, houseBank: 500 }, ['ann', 'bob']);
  assert.equal(C.betReserve(t2, 10, { match: 5 }), 145);
  t2.lanes[0].deck = rig('Th', '9c', '6d', '8s');
  assert.throws(() => f2.bj.bet(f2.P.ann, t2.code, { bet: 50, royal: { match: 25 } }), /can only cover \$500 more/, '$100 + $625 > $500');
  f2.bj.bet(f2.P.ann, t2.code, { bet: 50, royal: { match: 10 } }); // $100 + $250 fits
  // T-6 is not suited: the royal bet settled at the deal ($10 to the bank), so only the $50 hand's $100 stays reserved
  assert.equal(t2.house.bank, 510); assert.equal(C.freeBank(t2), 410);
  assert.equal(C.laneMaxBet(t2, 1), 51, 'bob is held only by the usual tenth-of-the-bank rule ($510 / 10)');
  // Guntrad's bank is unlimited: no cap
  const f3 = fixture(t); const t3 = f3.open({ house: 'guntrad', continuous: true, bots: 3 }, ['ann']);
  assert.equal(C.freeBank(t3), Infinity);
  assert.equal(t3.settings.bots, 0, 'continuous tables have no bots');
  assert.ok(t3.seats.every((s) => !s || !s.bot));
});

test('continuous: a broke house ends the table, voids open bets and pays everyone back', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true, houseBank: 500 }, ['ann', 'bob']);
  const start = f.money(tb);
  // pretend earlier hands drained the bank to $55 (move the difference onto ann's chips so the total is unchanged)
  tb.house.bank = 55; tb.seats[0].chips += 445;
  tb.lanes[1].deck = rig('Th', '9c', '6d', '8s');
  f.bj.bet(f.P.bob, tb.code, { bet: 5 }); // bob's hand is mid-play
  tb.lanes[0].deck = rig('As', '9c', 'Kd', '8s');
  f.bj.bet(f.P.ann, tb.code, { bet: 5 }); // ann's blackjack pays $7.50 → bank $47.50, under 10 × the $5 minimum
  assert.equal(tb.status, 'over'); assert.match(tb.overReason, /house is out of money/);
  assert.ok(Object.values(tb.lanes).every((l) => l.status === 'over'));
  assert.equal(f.money(tb), start, "bob's voided $5 went back and the bank went home");
  assert.ok(tb.paidOut);
  assert.equal(tb.final.standings.length, 2);
});

test('continuous: leaving mid-hand waits; leaving between hands refunds the bet; a newcomer gets a fresh lane', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true }, ['ann', 'bob']);
  const start = f.money(tb);
  tb.lanes[0].deck = rig('Th', '9c', '6d', '8s');
  f.bj.bet(f.P.ann, tb.code, { bet: 20 });
  assert.throws(() => f.bj.leave(f.P.ann, tb.code), /Finish this round first/);
  f.bj.act(f.P.ann, tb.code, 'stand');
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.lanes[0], undefined);
  assert.equal(tb.status, 'playing', 'bob plays on');
  f.bj.join(f.P.cat, tb.code, true);
  assert.equal(tb.seats[0].id, 'cat'); assert.equal(tb.lanes[0].roundNo, 1); assert.equal(tb.lanes[0].deck.length, 52);
  assert.equal(f.money(tb), start);
  f.bj.leave(f.P.house, tb.code);
  assert.equal(tb.status, 'over'); assert.equal(f.money(tb), start);
});

// ---------------- sneak bet ----------------
function normalTable(f, house, deck, players = ['ann']) {
  const tb = f.open({ house, continuous: false, houseBank: 500 }, players);
  tb.deck = deck;
  return tb;
}
test('sneak bet: only against a player dealer, only after the deal, once per royal bet', (t) => {
  const f = fixture(t);
  const g = normalTable(f, 'guntrad', rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, g.code, { bet: 10 });
  assert.equal(f.bj.view(f.P.ann, g.code).round.sneak, null, 'Guntrad: no chips to tap');
  assert.throws(() => f.bj.sneak(f.P.ann, g.code, { royal: { match: 10 } }), /Bets are closed/);

  const h = normalTable(f, 'me', rig('Kh', '9c', 'Qh', '8s'));
  assert.throws(() => f.bj.sneak(f.P.ann, h.code, { royal: { match: 5 } }), /Bets are closed/, 'not during betting');
  f.bj.bet(f.P.ann, h.code, { bet: 10, royal: { pairs: 2 } });
  assert.equal(h.round.phase, 'play');
  assert.deepEqual(f.bj.view(f.P.ann, h.code).round.sneak, { match: true, pairs: false }, 'only royal bets not already riding');
  assert.equal(f.bj.view(f.P.house, h.code).round.sneak ?? null, null, 'the house sees nothing');
  assert.throws(() => f.bj.sneak(f.P.ann, h.code, { royal: { pairs: 2 } }), /already riding/);
  assert.throws(() => f.bj.sneak(f.P.ann, h.code, { royal: { match: 11 } }), /up to your main bet/);
  f.bj.sneak(f.P.ann, h.code, { royal: { match: 10 } });
  assert.throws(() => f.bj.sneak(f.P.ann, h.code, { royal: { match: 10 } }), /Bets are closed|already riding/);
  assert.throws(() => f.bj.sneak(f.P.house, h.code, { royal: { match: 10 } }), /Take a seat/);
});

test('sneak bet pays exactly what the same bet would have paid before the deal, from the player-dealer bank', (t) => {
  const cases = [
    ['Kh', 'Qh', { match: 10 }, 250], // K-Q suited 25:1
    ['Ah', '5h', { match: 10 }, 25], // any suited 5:2
    ['Kd', 'Ks', { pairs: 4 }, 100], // J/Q/K pair 25:1
    ['8d', '8s', { pairs: 4 }, 44], // other pair 11:1
    ['Kh', 'Qs', { match: 10 }, -10], // nothing: the house keeps it
  ];
  for (const [c1, c2, royal, net] of cases) {
    const f = fixture(t);
    const before = normalTable(f, 'me', rig(c1, '9c', c2, '7d'));
    const late = normalTable(f, 'me', rig(c1, '9c', c2, '7d'), ['bob']);
    const start = f.money(before, late);
    f.bj.bet(f.P.ann, before.code, { bet: 10, royal });
    f.bj.bet(f.P.bob, late.code, { bet: 10 });
    const chips0 = late.seats[0].chips; const bank0 = late.house.bank;
    f.bj.sneak(f.P.bob, late.code, { royal });
    assert.equal(late.seats[0].chips - chips0, net, `${c1}${c2} ${JSON.stringify(royal)} nets ${net}`);
    assert.equal(late.house.bank - bank0, -net, 'paid by the human house');
    assert.equal(late.seats[0].chips, before.seats[0].chips, 'same chips as betting it up front');
    assert.equal(late.house.bank, before.house.bank, 'same bank as betting it up front');
    assert.equal(f.money(before, late), start, 'conserved');
    if (net > 0) assert.ok(late.log.some((e) => e.ev?.k === 'royal' && e.ev.sneak), 'logged like any royal hit');
  }
});

test('sneak bet reads the dealt cards after a split, and works in continuous play against a player house', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true }, ['ann']);
  tb.lanes[0].deck = rig('8h', '6c', '8d', 'Ts', ['3h', '4s']);
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.act(f.P.ann, tb.code, 'split');
  assert.equal(tb.lanes[0].round.hands.length, 2);
  const chips = tb.seats[0].chips; const start = f.money(tb);
  f.bj.sneak(f.P.ann, tb.code, { royal: { pairs: 5, match: 3 } });
  assert.equal(tb.seats[0].chips - chips, 55 - 3, 'the 8-8 pair pays 11:1 even though the hands were split; no match');
  assert.equal(f.money(tb), start);
  const fg = fixture(t); const g = fg.open({ house: 'guntrad', continuous: true }, ['ann']);
  g.lanes[0].deck = rig('Kh', '9c', 'Qh', '8s');
  fg.bj.bet(fg.P.ann, g.code, { bet: 10 });
  assert.throws(() => fg.bj.sneak(fg.P.ann, g.code, { royal: { match: 10 } }), /Bets are closed/, 'never against Guntrad');
});

test('continuous: lanes survive a restart (plain JSON in blackjack.json)', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true }, ['ann', 'bob']);
  tb.lanes[0].deck = rig('Th', '9c', '6d', '8s');
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.save();
  const store = new Store(f.store.dir);
  const accounts = new Accounts({ store, now: () => f.now });
  const bj2 = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0 });
  const t2 = bj2.table(tb.code);
  assert.equal(t2.lanes[0].round.phase, 'play');
  bj2.act(store.players.ann, tb.code, 'stand');
  assert.equal(t2.lanes[0].roundNo, 2);
  assert.equal(bj2.view(store.players.bob, tb.code).round.no, 1);
});


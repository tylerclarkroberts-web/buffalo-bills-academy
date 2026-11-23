// Player-dealt blackjack tables stay open when the last seated player cashes out,
// as long as the human house can still cover the minimum, until the dealer closes the bank.
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
import { bjTurns } from '../server/slack.js';
import * as C from '../server/blackjack/continuous.js';

function fixture(t, seed = 7) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-keep-open-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob', 'cat'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) accounts.ensure(p);
  const r = mulberry(seed);
  f.store = store; f.P = store.players; f.accounts = accounts;
  f.bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: (n) => Math.floor(r() * n) });
  f.open = (settings, players = ['ann'], host = 'house') => {
    const v = f.bj.create(f.P[host], { settings: { buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20, bots: 0, turnSec: 30, ...settings } });
    for (const x of players) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P[host], v.code);
    return f.bj.table(v.code);
  };
  f.money = (tb) => {
    let open = 0, chips = 0;
    const rounds = C.isContinuous(tb) ? Object.values(tb.lanes || {}).filter((l) => l.status === 'playing').map((l) => l.round) : [tb.round];
    for (const r of rounds) {
      if (!r || ['done', 'over'].includes(r.phase)) continue;
      if (r.phase === 'betting') for (const b of Object.values(r.bets)) { if (!b.out) open += b.bet + (b.side.match || 0) + (b.side.pairs || 0); }
      else for (const h of r.hands) open += h.bet;
    }
    chips += tb.seats.reduce((a, s) => a + (s && !s.left ? s.chips : 0), 0);
    const bank = tb.house.staked ? tb.house.bank : 0;
    return Math.round((Object.values(f.P).reduce((a, p) => a + p.bankroll, 0) + chips + bank + open) * 100) / 100;
  };
  f.tick = (ms = 1000, n = 1) => {
    for (let i = 0; i < n; i++) { f.now += ms; f.bj.tick(); }
  };
  return f;
}

const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

function playOut(f, tb, id, bet = 10) {
  let steps = 0;
  while (steps++ < 40) {
    const p = f.P[id]; const v = f.bj.view(p, tb.code); const r = v.round;
    if (!r || v.status !== 'playing' || v.mySeat < 0 || v.laneOver) return v;
    if (r.phase === 'betting' && !r.bets[v.mySeat]) {
      const b = Math.floor(Math.min(bet, v.limits.maxNow, v.seats[v.mySeat].chips));
      if (b < v.limits.min) return v;
      f.bj.bet(p, tb.code, { bet: b }); continue;
    }
    if (r.myInsurance) { f.bj.insure(p, tb.code, false); continue; }
    if (r.myTurn) {
      const h = r.hands[r.turn];
      f.bj.act(p, tb.code, basicStrategy(h.cards, r.dealer[0], { ...r.can, double: r.can.double, split: r.can.split }));
      continue;
    }
    return v;
  }
  return f.bj.view(f.P[id], tb.code);
}

test('standard player-dealt table stays open when the last player cashes out, bank intact', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  const startBank = tb.house.bank;
  const startMoney = f.money(tb);
  const houseRoll = f.P.house.bankroll;
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.status, 'playing');
  assert.equal(tb.overReason, undefined);
  assert.equal(tb.paidOut, undefined);
  assert.equal(tb.house.staked, true);
  assert.equal(tb.house.bank, startBank);
  assert.equal(f.P.house.bankroll, houseRoll, 'house bank stays on the table, not returned yet');
  assert.ok(!tb.seats.some((s) => s && !s.left));
  assert.equal(f.money(tb), startMoney);
  const listing = f.bj.list(f.P.house)[0];
  assert.equal(listing.status, 'playing');
  assert.equal(listing.turnLabel, 'Waiting for players');
  assert.equal(listing.myTurn, false);
  assert.equal(listing.players, 0);
  const hv = f.bj.view(f.P.house, tb.code);
  assert.equal(hv.status, 'playing');
  assert.equal(hv.house.isMe, true);
  assert.ok(!hv.seats.some(Boolean));
  assert.deepEqual(bjTurns(tb, f.now), [], 'empty table must not spawn turn reminders');
});

test('standard: a later player can sit and play a round on the waiting table', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  const startMoney = f.money(tb);
  f.bj.leave(f.P.ann, tb.code);
  f.tick(1000, 5);
  assert.equal(tb.status, 'playing');
  f.bj.join(f.P.bob, tb.code, true);
  assert.equal(tb.status, 'playing');
  assert.equal(tb.seats.find((s) => s && !s.left).id, 'bob');
  const bv = f.bj.view(f.P.bob, tb.code);
  assert.equal(bv.mySeat, 0);
  assert.equal(bv.round?.phase, 'betting');
  assert.equal(bv.round.bets[bv.mySeat], undefined);
  tb.deck = rig('Th', '9c', '6d', '8s');
  const after = playOut(f, tb, 'bob', 10);
  assert.equal(tb.status, 'playing');
  assert.ok(tb.roundNo >= 1);
  assert.ok(tb.last, 'a hand was dealt and settled for the new player');
  assert.equal(tb.last.results[0].seat, bv.mySeat);
  assert.equal(after.round?.phase, 'betting', 'a new betting window opens after the hand');
  assert.equal(f.money(tb), startMoney);
});

test('continuous player-dealt table stays open when the last player cashes out, and a newcomer gets a fresh lane', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', continuous: true }, ['ann']);
  const startBank = tb.house.bank;
  const startMoney = f.money(tb);
  tb.lanes[0].deck = rig('Th', '9c', '6d', '8s');
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.act(f.P.ann, tb.code, 'stand');
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.status, 'playing');
  assert.equal(tb.house.staked, true);
  assert.ok(tb.house.bank !== startBank, 'the settled hand moved the bank');
  assert.equal(tb.lanes[0], undefined);
  assert.ok(!Object.keys(tb.lanes || {}).length);
  f.tick(1000, 5);
  assert.equal(tb.status, 'playing');
  assert.deepEqual(bjTurns(tb, f.now), []);
  assert.equal(f.bj.list(f.P.house)[0].turnLabel, 'Waiting for players');
  f.bj.join(f.P.cat, tb.code, true);
  assert.equal(tb.seats[0].id, 'cat');
  assert.equal(tb.lanes[0].roundNo, 1);
  assert.equal(tb.lanes[0].round.phase, 'betting');
  tb.lanes[0].deck = rig('As', '9c', 'Kd', '8s');
  playOut(f, tb, 'cat', 10);
  assert.equal(tb.status, 'playing');
  assert.ok(tb.lanes[0].last);
  assert.equal(f.money(tb), startMoney);
});

test('Guntrad table still ends when the last human leaves, even if a bot remains', (t) => {
  const f = fixture(t);
  // Host of a Guntrad table also sits, so open with Ann as host and only human.
  const tb = f.open({ house: 'guntrad', bots: 1 }, [], 'ann');
  assert.ok(tb.seats.some((s) => s && s.bot));
  assert.equal(tb.seats.filter((s) => s && !s.left && !s.bot).length, 1);
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.status, 'over');
  assert.equal(tb.overReason, 'Everyone left.');
  assert.ok(tb.paidOut);
  assert.throws(() => f.bj.join(f.P.bob, tb.code, true), /game is over/);
});

test('dealer closing the bank ends the waiting table and returns the remaining bank', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  const startMoney = f.money(tb);
  const bank = tb.house.bank;
  const roll = f.P.house.bankroll;
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.status, 'playing');
  f.bj.leave(f.P.house, tb.code);
  assert.equal(tb.status, 'over');
  assert.match(tb.overReason, /closed the bank/);
  assert.equal(tb.house.staked, false);
  assert.equal(tb.paidOut, true);
  assert.equal(f.P.house.bankroll, roll + bank);
  assert.equal(f.money(tb), startMoney);
  assert.throws(() => f.bj.join(f.P.bob, tb.code, true), /game is over/);
});

test('host Close ends a waiting player-dealt table and returns the bank', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me' }, ['ann']);
  const startMoney = f.money(tb);
  const bank = tb.house.bank;
  const roll = f.P.house.bankroll;
  f.bj.leave(f.P.ann, tb.code);
  f.bj.close(f.P.house, tb.code);
  assert.equal(tb.status, 'closed');
  assert.equal(tb.house.staked, false);
  assert.equal(f.P.house.bankroll, roll + bank);
  assert.equal(f.money(tb), startMoney);
});

test('clock ticks with 0 seated players do not crash or close a solvent player-dealt table', (t) => {
  const f = fixture(t);
  const standard = f.open({ house: 'me', turnSec: 30 }, ['ann']);
  f.bj.leave(f.P.ann, standard.code);
  const bank = standard.house.bank;
  assert.doesNotThrow(() => f.tick(30_000, 8));
  assert.equal(standard.status, 'playing');
  assert.equal(standard.house.bank, bank);
  assert.equal(standard.paidOut, undefined);

  const f2 = fixture(t, 11);
  const cont = f2.open({ house: 'me', continuous: true, turnSec: 30 }, ['bob']);
  f2.bj.leave(f2.P.bob, cont.code);
  const bank2 = cont.house.bank;
  assert.doesNotThrow(() => f2.tick(30_000, 8));
  assert.equal(cont.status, 'playing');
  assert.equal(cont.house.bank, bank2);
});

test('a broke human house still ends when the last player leaves', (t) => {
  const f = fixture(t);
  const tb = f.open({ house: 'me', houseBank: 1000, minBet: 5 }, ['ann']);
  // Bank too small to cover a tenth-rule min bet, as startRound / continuous check would treat it.
  tb.house.bank = 4;
  f.bj.leave(f.P.ann, tb.code);
  assert.equal(tb.status, 'over');
  assert.equal(tb.overReason, 'Everyone left.');
  assert.equal(tb.house.staked, false);
  assert.equal(tb.paidOut, true);
  assert.equal(f.P.house.bankroll, 4, 'the leftover $4 bank goes home');
});

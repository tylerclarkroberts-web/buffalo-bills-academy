// Multi-client stress and the POV kill switch. Does not change betting rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';
import { freshDeck } from '../server/blackjack/rules.js';
import { STALL_MS } from '../server/blackjack/pace.js';
import { isPovDisabled, setPovEnabled, POV_FLAG_FILE } from '../server/blackjack/povFlag.js';
import { mulberry } from '../server/blackjack/sim.js';

function fixture(t, seed = 11, { players = ['house', 'ann', 'bob'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-rel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000, dir };
  const store = new Store(dir);
  store.players = Object.fromEntries(players.map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) { accounts.ensure(p); accounts.change(p, 8000, 'dev', 'test float', { save: false }); }
  accounts.save();
  const r = mulberry(seed);
  f.store = store; f.P = store.players; f.accounts = accounts;
  f.bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: (n) => Math.floor(r() * n) });
  f.open = (deck, { auto = true, seated = ['ann'], buyIn = 200, houseBank = 2000 } = {}) => {
    const v = f.bj.create(f.P.house, { settings: { house: 'me', buyIn, houseBank, minBet: 5, maxBetX: 50 } });
    for (const x of seated) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P.house, v.code);
    const tb = f.bj.table(v.code);
    tb.house.autopilot = auto;
    if (deck) tb.deck = deck.slice();
    return tb;
  };
  f.economy = (tb) => {
    const roll = Object.values(f.P).reduce((a, p) => a + (p.bankroll || 0), 0);
    const chips = tb.seats.reduce((a, s) => a + (s && !s.left ? s.chips : 0), 0);
    const bank = tb.house.bank || 0;
    return Math.round((roll + chips + bank) * 100) / 100;
  };
  return f;
}

const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

const handCards = (tb, seat = 0) => (tb.round?.hands || []).filter((h) => h.seat === seat).map((h) => h.cards.slice());

function finishPending(f, tb) {
  let guard = 0;
  while (tb.round && (tb.round.phase === 'dealing' || tb.round.pending || (tb.round.phase === 'dealer' && tb.round.dealerAct))) {
    if (++guard > 60) throw new Error(`stuck finishing pending phase=${tb.round.phase}`);
    if (tb.house.autopilot === false) f.now += STALL_MS;
    f.bj.tick();
  }
}

function playOut(f, tb, { bet = 10, action = 'stand' } = {}) {
  if (tb.status !== 'playing') return { over: true };
  if (!tb.round || tb.round.phase === 'betting') f.bj.bet(f.P.ann, tb.code, { bet });
  finishPending(f, tb);
  let guard = 0;
  while (tb.status === 'playing' && tb.round && tb.round.phase !== 'betting') {
    if (++guard > 80) throw new Error(`stuck playOut phase=${tb.round.phase} no=${tb.round.no}`);
    const r = tb.round;
    if (r.phase === 'insurance') {
      try { f.bj.insure(f.P.ann, tb.code, false); } catch { f.now += 200; f.bj.tick(); }
      finishPending(f, tb);
      continue;
    }
    if (r.phase === 'play') {
      const h = r.hands?.[r.turn];
      if (h && tb.seats[h.seat]?.id === 'ann') {
        const act = r.can?.split && action === 'split' ? 'split' : (action === 'hit' && r.can?.hit !== false ? 'hit' : 'stand');
        try { f.bj.act(f.P.ann, tb.code, act); } catch { f.now += 200; f.bj.tick(); }
      } else {
        f.now += 200; f.bj.tick();
      }
      finishPending(f, tb);
      continue;
    }
    finishPending(f, tb);
    f.now += 200; f.bj.tick();
  }
  return { over: tb.status !== 'playing', last: tb.last };
}

test('the POV kill switch is a data-dir file and hides house.pov without a redeploy', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  const on = f.bj.view(f.P.house, tb.code);
  assert.equal(on.house.pov, true);
  assert.equal(f.bj.view(f.P.ann, tb.code).house.pov, false, 'players never get the dealer POV');
  assert.equal(f.bj.povDisabled(), false);
  const off = f.bj.setPovEnabled(false);
  assert.equal(off.enabled, false);
  assert.equal(isPovDisabled(f.dir), true);
  assert.ok(fs.existsSync(path.join(f.dir, POV_FLAG_FILE)));
  assert.equal(f.bj.view(f.P.house, tb.code).house.pov, false, 'house view drops POV when the flag is on');
  assert.equal(f.bj.view(f.P.house, tb.code).house.isMe, true, 'the house still is the house');
  assert.equal(f.bj.view(f.P.house, tb.code).status, 'playing');
  f.bj.setPovEnabled(true);
  assert.equal(f.bj.view(f.P.house, tb.code).house.pov, true);
  assert.equal(isPovDisabled(f.dir), false);
});

test('refresh or reconnect mid-hand returns the same server cards and does not change the shoe', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s', ['4c']));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  finishPending(f, tb);
  assert.equal(tb.round.phase, 'play');
  const before = {
    phase: tb.round.phase,
    dealer: tb.round.dealer.slice(),
    hands: handCards(tb, 0),
    deckLeft: tb.deck.length,
    chips: tb.seats[0].chips,
    bank: tb.house.bank,
    econ: f.economy(tb),
  };
  const house = f.bj.view(f.P.house, tb.code);
  const ann = f.bj.view(f.P.ann, tb.code);
  const house2 = f.bj.view(f.P.house, tb.code);
  assert.deepEqual(house.round.hands[0].cards, before.hands[0]);
  assert.deepEqual(ann.round.hands[0].cards, before.hands[0]);
  assert.deepEqual(house2.round.dealer, house.round.dealer);
  assert.equal(house.round.phase, 'play');
  assert.equal(tb.deck.length, before.deckLeft);
  assert.equal(f.economy(tb), before.econ);
});

test('join mid-hand seats the new player without touching the live cards; they can leave, the live seat cannot', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'), { seated: ['ann'] });
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  finishPending(f, tb);
  const cards = handCards(tb, 0);
  const econ = f.economy(tb);
  f.bj.join(f.P.bob, tb.code, true);
  assert.equal(tb.seats.some((s) => s && s.id === 'bob' && !s.left), true);
  assert.deepEqual(handCards(tb, 0), cards, 'Ann keeps her live hand');
  assert.equal((tb.round.hands || []).some((h) => tb.seats[h.seat]?.id === 'bob'), false, 'Bob has no hand this round');
  assert.throws(() => f.bj.leave(f.P.ann, tb.code), /Finish this round first/);
  f.bj.leave(f.P.bob, tb.code);
  assert.equal(tb.seats.some((s) => s && s.id === 'bob' && !s.left), false);
  assert.deepEqual(handCards(tb, 0), cards);
  assert.equal(f.economy(tb), econ, 'join then leave mid-hand conserves the closed economy (buy-in returns)');
});

test('a split mid-hand plays both hands and conserves money', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('8h', '6c', '8d', 'Ts', ['3h', '4s', '9d']));
  const econ = f.economy(tb);
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  finishPending(f, tb);
  const v = f.bj.view(f.P.ann, tb.code);
  assert.equal(v.round.can.split, true, '8-8 is a split');
  f.bj.act(f.P.ann, tb.code, 'split');
  finishPending(f, tb);
  assert.equal((tb.round.hands || []).filter((h) => h.seat === 0).length, 2);
  // Finish both hands and the dealer.
  playOut(f, tb, { action: 'stand' });
  assert.ok(tb.last || tb.round?.phase === 'betting', 'the split hand settled');
  assert.equal(f.economy(tb), econ);
  const house = f.bj.view(f.P.house, tb.code);
  const lastHands = (house.last?.hands || house.round?.hands || []).filter((h) => h.seat === 0);
  assert.ok(lastHands.length >= 2 || (tb.last?.results || []).filter((x) => x.seat === 0).length >= 2);
});

test('an all-in mid-table deals, can stand, and both clients see the same empty stack', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  tb.seats[0].chips = 15;
  f.bj.bet(f.P.ann, tb.code, { bet: 15 });
  finishPending(f, tb);
  assert.equal(tb.seats[0].chips, 0);
  assert.notEqual(tb.round.phase, 'betting');
  const house = f.bj.view(f.P.house, tb.code);
  const ann = f.bj.view(f.P.ann, tb.code);
  assert.equal(house.seats[0].chips, 0);
  assert.equal(ann.seats[0].chips, 0);
  f.bj.act(f.P.ann, tb.code, 'stand');
  finishPending(f, tb);
  assert.ok(tb.last || tb.round?.phase === 'betting' || tb.status === 'over');
});

test('rapid tips stay idempotent, conserved, and visible on the house view', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  const econ = f.economy(tb);
  const startAnn = f.P.ann.bankroll;
  const startHouse = f.P.house.bankroll;
  for (let i = 0; i < 20; i++) f.bj.tip(f.P.ann, tb.code, { amount: 1, id: `rapid-${i}` });
  f.bj.tip(f.P.ann, tb.code, { amount: 1, id: 'rapid-0' }); // replay
  assert.equal(f.P.ann.bankroll, startAnn - 20);
  assert.equal(f.P.house.bankroll, startHouse + 20);
  assert.equal(f.economy(tb), econ);
  const house = f.bj.view(f.P.house, tb.code);
  assert.ok(house.tip, 'house sees a tip toast');
  const ledger = (f.P.ann.txns || []).filter((x) => x.type === 'bj-tip');
  assert.equal(ledger.length, 20, 'replay does not double-write the ledger');
});

test('toggling autopilot mid-deal finishes the hand and does not stick', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('9h', '7c', '5d', '8s', ['4c']), { auto: false });
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  assert.equal(tb.round.phase, 'dealing');
  f.bj.dealerAct(f.P.house, tb.code, 'deal');
  f.bj.dealerAct(f.P.house, tb.code, 'deal');
  assert.equal(tb.round.phase, 'dealing');
  const econ = f.economy(tb);
  f.bj.setAutopilot(f.P.house, tb.code, true);
  assert.equal(tb.house.autopilot, true);
  finishPending(f, tb);
  assert.notEqual(tb.round.phase, 'dealing');
  f.bj.act(f.P.ann, tb.code, 'stand');
  finishPending(f, tb);
  f.bj.setAutopilot(f.P.house, tb.code, false);
  assert.equal(tb.house.autopilot, false);
  // Next hand: start a deal, toggle on again, it must flush.
  if (tb.status === 'playing' && (!tb.round || tb.round.phase === 'betting')) f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  if (tb.round?.phase === 'dealing') {
    f.bj.setAutopilot(f.P.house, tb.code, true);
    finishPending(f, tb);
    assert.notEqual(tb.round.phase, 'dealing');
  }
  assert.equal(f.economy(tb), econ);
});

test('50-hand autopilot soak: no errors, money conserved, memory stays bounded', (t) => {
  const f = fixture(t, 99);
  const tb = f.open(null, { auto: true, buyIn: 2000, houseBank: 10000 });
  const econ0 = f.economy(tb);
  const errors = [];
  const heaps = [];
  const sample = () => heaps.push(process.memoryUsage().heapUsed);
  sample();
  let hands = 0;
  for (let i = 0; i < 52; i++) {
    if (tb.status !== 'playing') break;
    try {
      playOut(f, tb, { bet: 10, action: 'stand' });
      hands += 1;
      assert.equal(f.economy(tb), econ0, `economy drifted on hand ${hands}`);
      if (i === 25) sample();
    } catch (e) {
      errors.push(String(e && e.message || e));
      break;
    }
  }
  sample();
  const mb = (n) => Math.round(n / 1048576 * 10) / 10;
  const trend = { samples: heaps.length, startMb: mb(heaps[0]), midMb: mb(heaps[1] || heaps[0]), endMb: mb(heaps.at(-1)), hands, errors: errors.length };
  fs.mkdirSync('/tmp/bba-pov-soak', { recursive: true });
  fs.writeFileSync('/tmp/bba-pov-soak/report.json', JSON.stringify({ ...trend, heaps, errors }, null, 2));
  console.log('soak', trend);
  assert.equal(errors.length, 0, errors.join('; '));
  assert.ok(hands >= 50, `only ${hands} hands completed`);
  assert.equal(tb.status, 'playing');
  // Generous cap: a 50-hand run should not leak tens of MB of heap on top of the fixture.
  assert.ok(heaps.at(-1) < heaps[0] + 40 * 1048576, `heap grew too much: ${trend.startMb}MB → ${trend.endMb}MB`);
});

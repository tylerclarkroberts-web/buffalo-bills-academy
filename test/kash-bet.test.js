// Kash Bet: the renamed sneak, a watching-dealer catch window, security collection, and the buried rule line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';
import { freshDeck } from '../server/blackjack/rules.js';
import { RULE_TEXT, KASH_RULE } from '../server/blackjack/table.js';
import { GUNTRAD_RULES } from '../server/blackjack/rules.js';
import { KASH_SEEN_MS, KASH_CATCH_MS, KASH_TELL_MS, KASH_EXTRA_MAX, planCollect, houseWasWatching, housePresent } from '../server/blackjack/kash.js';
import { mulberry } from '../server/blackjack/sim.js';

function fixture(t, seed = 7) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-kash-'));
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
  f.open = (deck, players = ['ann']) => {
    const v = f.bj.create(f.P.house, { settings: { house: 'me', buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20 } });
    for (const x of players) f.bj.join(f.P[x], v.code, true);
    f.bj.start(f.P.house, v.code);
    const tb = f.bj.table(v.code);
    if (deck) tb.deck = deck;
    return tb;
  };
  f.money = (tb) => {
    const chips = tb.seats.reduce((a, s) => a + (s && !s.left ? s.chips : 0), 0);
    const bank = tb.house.staked ? tb.house.bank : 0;
    return Math.round((Object.values(f.P).reduce((a, p) => a + p.bankroll, 0) + chips + bank) * 100) / 100;
  };
  f.ledger = (id) => (f.P[id].txns || []).map((x) => `${x.type}:${x.amount}:${x.note}`);
  return f;
}
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

test('Kash Bet rule sits in the middle of the house-rules list, not first or last', () => {
  const rows = RULE_TEXT(GUNTRAD_RULES);
  const i = rows.indexOf(KASH_RULE);
  assert.ok(i > 0 && i < rows.length - 1, `expected a middle index, got ${i} of ${rows.length}`);
  assert.match(KASH_RULE, /Kash Bet/);
  assert.match(KASH_RULE, /call security/);
  assert.match(KASH_RULE, /player dealer/);
});

test('planCollect caps the dealer-chosen extra at $300 and at what the cheater still has', () => {
  assert.deepEqual(planCollect({ won: 250, extra: 300, chips: 440, bankroll: 800 }), { extra: 300, extraAsked: 300, take: 550, fromChips: 440, fromBankroll: 110, won: 250 });
  assert.equal(planCollect({ won: 250, extra: 999, chips: 50, bankroll: 0 }).take, 50);
  assert.equal(planCollect({ won: 0, extra: 300, chips: 10, bankroll: 20 }).take, 30);
  assert.equal(planCollect({ won: 80, extra: -5, chips: 80, bankroll: 0 }).extra, 0);
});

test('a Kash Bet still pays from the player-dealer bank, never against Guntrad', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  const chips = tb.seats[0].chips, bank = tb.house.bank, start = f.money(tb);
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } }); // K-Q suited 25:1 = +250
  assert.equal(tb.seats[0].chips - chips, 250);
  assert.equal(tb.house.bank - bank, -250);
  assert.equal(f.money(tb), start);
  const g = f.bj.create(f.P.house, { settings: { house: 'guntrad', buyIn: 200, minBet: 5, maxBetX: 20 } });
  f.bj.join(f.P.bob, g.code, true);
  f.bj.start(f.P.house, g.code);
  const gt = f.bj.table(g.code);
  gt.deck = rig('Kh', '9c', 'Qh', '8s');
  f.bj.bet(f.P.bob, g.code, { bet: 10 });
  assert.equal(f.bj.view(f.P.bob, g.code).round.sneak, null);
  assert.throws(() => f.bj.sneak(f.P.bob, g.code, { royal: { match: 10 } }), /Bets are closed/);
});

test('the catch button is only for a dealer who was viewing when the Kash Bet was slid on', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  // house never polled: they did not see it
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } });
  assert.equal(houseWasWatching(tb, f.now), false);
  assert.equal(f.bj.viewOf(tb, 'house').kashCatch, undefined);
  assert.ok(f.bj.viewOf(tb, 'house').kashTell, 'a leftover glint may exist, but no catch');
  // a later look does not reopen the window
  f.now += 500;
  f.bj.view(f.P.house, tb.code);
  assert.equal(f.bj.viewOf(tb, 'house').kashCatch, undefined);
  assert.throws(() => f.bj.kashCatch(f.P.house, tb.code), /had to see it|no longer/);

  const tb2 = f.open(rig('Kh', '9c', 'Qh', '8s'), ['bob']);
  f.bj.bet(f.P.bob, tb2.code, { bet: 10 });
  f.bj.view(f.P.house, tb2.code); // watching
  f.bj.sneak(f.P.bob, tb2.code, { royal: { match: 10 } });
  const hv = f.bj.viewOf(tb2, 'house');
  assert.ok(hv.kashCatch, 'watching dealer gets the catch');
  assert.equal(hv.kashCatch.name, 'bob');
  assert.equal(hv.kashCatch.won, 250);
  assert.equal(f.bj.viewOf(tb2, 'bob').kashCatch, undefined, 'the cheater is not told they were seen');
  assert.throws(() => f.bj.kashCatch(f.P.bob, tb2.code), /Only the dealer/);
});

test('the catch window expires, and a stale view does not count as seeing it', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.view(f.P.house, tb.code);
  f.now += KASH_SEEN_MS + 1;
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } });
  assert.equal(f.bj.viewOf(tb, 'house').kashCatch, undefined, 'last look was too long ago');

  const tb2 = f.open(rig('Ah', '9c', '5h', '8s'), ['bob']); // suited 5:2 = +25 on $10
  f.bj.bet(f.P.bob, tb2.code, { bet: 10 });
  f.bj.view(f.P.house, tb2.code);
  f.bj.sneak(f.P.bob, tb2.code, { royal: { match: 10 } });
  assert.ok(f.bj.viewOf(tb2, 'house').kashCatch);
  f.now += KASH_CATCH_MS + 1;
  assert.equal(f.bj.viewOf(tb2, 'house').kashCatch, undefined);
  assert.throws(() => f.bj.kashCatch(f.P.house, tb2.code), /no longer/);
});

test('security collection claws back Kash winnings plus a dealer-chosen extra, capped, and writes the ledger', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.view(f.P.house, tb.code);
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } }); // +250
  const start = f.money(tb);
  const annChips = tb.seats[0].chips;
  const houseRoll = f.P.house.bankroll;
  const annRoll = f.P.ann.bankroll;
  f.bj.kashCatch(f.P.house, tb.code);
  const room = f.bj.viewOf(tb, 'house').kashRoom;
  assert.equal(room.role, 'dealer');
  assert.equal(room.cheaterName, 'ann');
  assert.equal(f.bj.viewOf(tb, 'ann').kashRoom.role, 'cheater');
  f.bj.kashHit(f.P.house, tb.code, { tool: 'pie', x: 0.5, y: 0.4 });
  assert.throws(() => f.bj.kashHit(f.P.ann, tb.code, { tool: 'punch' }), /Only the dealer/);
  const v = f.bj.kashFinish(f.P.house, tb.code, { extra: KASH_EXTRA_MAX });
  assert.equal(v.kashNotice.kind, 'collected');
  assert.equal(v.kashNotice.take, 250 + 300);
  // $440 on the felt (buy-in minus bets plus the $250 Kash win) plus $110 from bankroll
  assert.equal(tb.seats[0].chips, 0);
  assert.equal(f.P.ann.bankroll, annRoll - 110);
  assert.equal(f.P.house.bankroll, houseRoll + 550);
  assert.equal(f.money(tb), start, 'closed economy');
  const notes = f.ledger('house').join('\n');
  assert.match(notes, /Kash Bet: recovered \$550 from ann/);
  assert.match(f.ledger('ann').join('\n'), /security collected \$550/);
  const caught = f.bj.viewOf(tb, 'ann').kashNotice;
  assert.equal(caught.kind, 'caught');
  assert.equal(caught.take, 550);
  f.bj.kashDismiss(f.P.ann, tb.code);
  assert.equal(f.bj.viewOf(tb, 'ann').kashNotice, undefined);
  assert.ok(tb.log.some((e) => e.ev?.k === 'kash-collect' && e.ev.take === 550));
});

test('a losing Kash Bet still allows up to $300 extra, taken from chips then bankroll', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qs', '8s')); // unsuited K-Q: match loses
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.view(f.P.house, tb.code);
  const chips0 = tb.seats[0].chips;
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } });
  assert.ok(chips0 - tb.seats[0].chips === 10);
  // leave them almost broke on the felt so the extra dips into bankroll
  tb.seats[0].chips = 40;
  const start = f.money(tb);
  const annRoll = f.P.ann.bankroll;
  const houseRoll = f.P.house.bankroll;
  f.bj.kashCatch(f.P.house, tb.code);
  f.bj.kashFinish(f.P.house, tb.code, { extra: 300 });
  assert.equal(tb.seats[0].chips, 0);
  assert.equal(f.P.ann.bankroll, annRoll - 260);
  assert.equal(f.P.house.bankroll, houseRoll + 300);
  assert.equal(f.money(tb), start);
  assert.match(f.ledger('ann').join('\n'), /security collected \$300/);
});

test('bots never get a catch window of their own: only a human house who was watching can call security', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.view(f.P.house, tb.code);
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } });
  assert.equal(f.bj.viewOf(tb, 'ann').kashCatch, undefined);
  assert.ok(f.bj.viewOf(tb, 'house').kashCatch);
  // a bot is not the house and cannot collect
  assert.throws(() => f.bj.kashCatch(f.P.ann, tb.code), /Only the dealer/);
});


test('a player-dealer is present only after a real table view, and the list tells them to jump in', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  assert.equal(housePresent(tb, f.now), false);
  assert.equal(f.bj.viewOf(tb, 'house').house.present, false);
  const listed = f.bj.list(f.P.house).find((x) => x.code === tb.code);
  assert.equal(listed.isHouse, true);
  assert.equal(listed.canDeal, true);
  assert.equal(listed.turnLabel, 'Jump in to deal');
  // an action (the sneak itself) does not count as watching
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  assert.equal(housePresent(tb, f.now), false);
  f.bj.view(f.P.house, tb.code);
  assert.equal(housePresent(tb, f.now), true);
  assert.equal(f.bj.viewOf(tb, 'house').house.present, true);
  assert.equal(f.bj.viewOf(tb, 'ann').house.present, true, 'everyone can see the dealer is here');
  assert.equal(f.bj.list(f.P.house).find((x) => x.code === tb.code).turnLabel, "You're dealing");
  f.now += KASH_SEEN_MS + 1;
  assert.equal(housePresent(tb, f.now), false);
  assert.equal(f.bj.viewOf(tb, 'house').house.present, false);
  assert.equal(f.bj.list(f.P.house).find((x) => x.code === tb.code).turnLabel, 'Jump in to deal');
});

test('the present dealer keeps the Kash glint for the whole catch window; other seats only see the short tell', (t) => {
  const f = fixture(t);
  const tb = f.open(rig('Kh', '9c', 'Qh', '8s'));
  f.bj.bet(f.P.ann, tb.code, { bet: 10 });
  f.bj.view(f.P.house, tb.code);
  f.bj.sneak(f.P.ann, tb.code, { royal: { match: 10 } });
  const hv = f.bj.viewOf(tb, 'house');
  const av = f.bj.viewOf(tb, 'ann');
  assert.equal(hv.kashTell.hold, true);
  assert.equal(hv.kashTell.until, hv.kashCatch.until);
  assert.equal(av.kashTell.hold, undefined);
  assert.ok(av.kashTell.until < hv.kashTell.until);
  f.now += KASH_TELL_MS + 1;
  assert.equal(f.bj.viewOf(tb, 'ann').kashTell, undefined, 'the public glint has faded');
  assert.ok(f.bj.viewOf(tb, 'house').kashTell, 'the dealer still sees the seat');
  assert.ok(f.bj.viewOf(tb, 'house').kashCatch);
});

test('Guntrad tables still have no house presence or catch window', (t) => {
  const f = fixture(t);
  const g = f.bj.create(f.P.house, { settings: { house: 'guntrad', buyIn: 200, minBet: 5, maxBetX: 20 } });
  f.bj.join(f.P.ann, g.code, true);
  f.bj.start(f.P.house, g.code);
  f.bj.view(f.P.house, g.code);
  const v = f.bj.viewOf(f.bj.table(g.code), 'ann');
  assert.equal(v.house.mode, 'guntrad');
  assert.equal(v.house.present, undefined);
  assert.equal(v.kashCatch, undefined);
  const listed = f.bj.list(f.P.house).find((x) => x.code === g.code);
  assert.equal(listed.canDeal, false);
  assert.notEqual(listed.turnLabel, 'Jump in to deal');
});

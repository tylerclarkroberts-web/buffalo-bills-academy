// Async Scum title payouts on the real bankroll: King +$100, Queen +$50, Commoner $0, Baby Scum -$5, Scum -$10;
// From Scum to King takes the dethroned King's King payouts; under $10 you sit out until the mines pay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scum } from '../server/scum/index.js';
import { Accounts } from '../server/accounts.js';
import { classify, SOURCES } from '../server/admin/report.js';
import * as S from '../server/scum/rules.js';

function svc({ payouts = true, bank = {} } = {}) {
  const clock = { t: 1_800_000_000_000 };
  const docs = {}; const players = Object.fromEntries(['Ann', 'Bob', 'Cat', 'Dee', 'Eve'].map((n) => [n[0].toLowerCase(), { id: n[0].toLowerCase(), name: n }]));
  const store = { loadDoc: (n, d) => (docs[n] ||= d), saveDoc: (n, d) => { docs[n] = JSON.parse(JSON.stringify(d)); }, savePlayers: () => {} };
  const accounts = new Accounts({ store, now: () => clock.t });
  for (const p of Object.values(players)) { accounts.ensure(p); if (bank[p.id] != null) p.bankroll = bank[p.id]; }
  let k = 7; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
  const s = new Scum({ store, getPlayer: (id) => players[id], now: () => clock.t, rng, tickMs: 0, botMs: 1000, accounts, payouts });
  return { s, P: players, clock, accounts };
}
const open = (s, P, ids, bots = 0) => { const v = s.create(P[ids[0]], { settings: { bots, turnSec: 30 } }); for (const id of ids.slice(1)) s.join(P[id], v.code); s.start(P[ids[0]], v.code); return s.table(v.code); };
/** End the live round with this finishing order (seats), as if it had been played out. */
function finish(s, t, seats) { Object.assign(t.round, { phase: 'done', finished: seats, turn: null, pile: null, exchange: null }); s.finishRound(t); }
const bank = (P) => Object.fromEntries(Object.values(P).map((p) => [p.id, p.bankroll]));
const scumTx = (p) => (p.txns || []).filter((x) => x.type === 'scum');

test('titles pay out on the real bankroll: King +100, Queen +50, Commoner 0, Baby Scum -5, Scum -10', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b', 'c', 'd', 'e']);
  finish(s, t, [0, 1, 2, 3, 4]);
  assert.deepEqual(bank(P), { a: 1100, b: 1050, c: 1000, d: 995, e: 990 });
  assert.deepEqual(t.lastRound.finish.map((x) => [x.title, x.net]), [['king', 100], ['queen', 50], ['commoner', 0], ['babyScum', -5], ['scum', -10]]);
  assert.equal(scumTx(P.c).length, 0, 'commoners neither pay nor get paid');
  assert.match(scumTx(P.a)[0].note, /^SCUM: King payout/); assert.match(scumTx(P.e)[0].note, /Scum dues/);
  const v = s.view(P.a, t.code);
  assert.deepEqual(v.seats.slice(0, 5).map((x) => x.pay), [100, 50, 0, -5, -10], 'chips by the avatars');
  assert.equal(v.payouts.king, 100); assert.equal(v.bankroll, 1100);
  assert.match(t.log.findLast((e) => e.ev?.k === 'round').text, /King: Ann \(\+\$100\)/);
});

test('three players: King, Commoner, Scum', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b', 'c']);
  finish(s, t, [2, 0, 1]);
  assert.deepEqual([P.c.bankroll, P.a.bankroll, P.b.bankroll], [1100, 1000, 990]);
  assert.deepEqual(t.lastRound.finish.map((x) => x.title), ['king', 'commoner', 'scum']);
});

test('the admin ledger files it under its own source: SCUM', () => {
  assert.equal(SOURCES.scum, 'SCUM');
  assert.deepEqual(classify('scum', 'SCUM: King payout (Porch, round 2)'), { source: 'scum', sub: 'King payout' });
  assert.deepEqual(classify('scum', 'SCUM: Baby Scum dues (Porch, round 2)'), { source: 'scum', sub: 'Baby Scum dues' });
  assert.deepEqual(classify('scum', 'SCUM: Scum dues (Porch, round 2)'), { source: 'scum', sub: 'Scum dues' });
  assert.deepEqual(classify('scum', "SCUM: from Scum to King, took Ann's King payouts (Porch, round 3)").sub, 'Scum to King haul');
  assert.deepEqual(classify('scum', 'SCUM: dethroned by Dee, paid their King payouts (Porch, round 3)').sub, 'Dethroned King paid out');
});

test('From Scum to King: the new King takes all the dethroned King’s King payouts at this table', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b', 'c', 'd']);
  finish(s, t, [0, 1, 2, 3]); // Ann King, Dee Scum
  finish(s, t, [0, 2, 1, 3]); // Ann King again: $200 of King payouts here
  assert.equal(t.kingPay.a, 200);
  const before = bank(P);
  finish(s, t, [3, 1, 0, 2]); // Dee: Scum -> King
  assert.equal(P.d.bankroll - before.d, 100 + 200, 'King payout plus Ann’s $200');
  assert.equal(P.a.bankroll - before.a, -5 - 200, 'Ann (now Baby Scum) pays the dues and the $200');
  assert.equal(t.kingPay.a, 0, 'the dethroned King’s tally resets'); assert.equal(t.kingPay.d, 100, 'the haul is not King salary');
  assert.deepEqual(t.lastRound.s2k, { seat: 3, name: 'Dee', from: 0, fromName: 'Ann', amt: 200, owed: 200, house: false });
  const ev = t.log.findLast((e) => e.ev?.k === 's2k'); assert.equal(ev.ev.amt, 200); assert.match(ev.text, /FROM SCUM TO KING/);
  assert.match(scumTx(P.d).at(-1).note, /from Scum to King, took Ann's King payouts/);
  assert.match(scumTx(P.a).at(-1).note, /dethroned by Dee/);
  assert.equal(t.lastRound.finish.find((x) => x.seat === 3).net, 300); assert.equal(t.lastRound.finish.find((x) => x.seat === 0).net, -205);
});

test('Scum to King is capped at what the old King has; a bot King is paid out by the house', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b', 'c', 'd']);
  finish(s, t, [0, 1, 2, 3]); finish(s, t, [0, 1, 2, 3]);
  P.a.bankroll = 30; // Ann spent her winnings
  finish(s, t, [3, 1, 2, 0]); // Dee Scum -> King; Ann ends Scum
  assert.equal(t.lastRound.s2k.amt, 20, 'dues settle first ($10), then the haul takes the $20 she has left'); assert.equal(t.lastRound.s2k.owed, 200);
  assert.equal(P.a.bankroll, 0, 'never below zero');
  P.a.bankroll = 0; const c = svc({ bank: {} }); const t3 = open(c.s, c.P, ['a', 'b', 'c']);
  c.P.c.bankroll = 3; finish(c.s, t3, [0, 1, 2]);
  assert.equal(c.P.c.bankroll, 0); assert.equal(t3.lastRound.finish[2].net, -3); assert.equal(t3.lastRound.finish[2].short, true, 'spent below the dues mid-round: takes what is there');

  const b = svc(); const t2 = open(b.s, b.P, ['a', 'b'], 2); // Ann, Bob, bots Dusty (2) and Slim (3)
  finish(b.s, t2, [2, 0, 1, 3]); // Dusty King (house money, no bankroll), Slim Scum
  assert.equal(t2.kingPay['scumbot-0'], 100);
  finish(b.s, t2, [3, 0, 1, 2]); // Slim: Scum -> King, a bot; no human money moves for bots
  assert.deepEqual(t2.lastRound.s2k.house, true); assert.equal(t2.lastRound.s2k.amt, 100);
  assert.equal(scumTx(b.P.a).length + scumTx(b.P.b).length, 4, 'only the humans’ own titles moved money');
  const v = b.s.view(b.P.a, t2.code); assert.ok(v.seats[3].pay > 0 && v.seats[3].bot);
});

test('a human Scum who climbs to King over a bot takes the house-paid haul', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b'], 1); // Ann 0, Bob 1, Dusty 2
  finish(s, t, [2, 0, 1]); // Dusty King, Bob Scum
  const b0 = P.b.bankroll;
  finish(s, t, [1, 0, 2]);
  assert.equal(P.b.bankroll - b0, 200, '$100 King + Dusty’s $100 from the house');
});

test('under $10 you go to the mines: the seat is saved, you sit out, and you are dealt back in once you can pay', () => {
  const { s, P, clock } = svc({ bank: { d: 4 } });
  const t = open(s, P, ['a', 'b', 'c', 'd']);
  assert.equal(t.seats[3].broke, true); assert.ok(!t.round.order.includes(3), 'Dee was not dealt in');
  assert.equal(t.round.order.length, 3);
  const v = s.view(P.d, t.code); assert.equal(v.seats[3].broke, true); assert.equal(v.round.hand.length, 0); assert.equal(v.payouts.need, 10);
  assert.ok(t.log.some((e) => e.ev?.k === 'broke' && e.ev.seat === 3));
  assert.throws(() => s.play(P.d, t.code, ['2c']), /turn|cards/);
  finish(s, t, [0, 1, 2]);
  assert.equal(t.seats[3].broke, true, 'still broke: still out'); assert.ok(!t.round.order.includes(3));
  P.d.bankroll = 64; // a shift in the Acid Mines
  finish(s, t, t.round.order.slice());
  assert.ok(t.round.order.includes(3), 'dealt back in'); assert.ok(!t.seats[3].broke);
  assert.ok(t.log.some((e) => e.ev?.k === 'unbroke'));
  void clock;
});

test('too few funded players: the table holds (seats saved) and deals as soon as the mines pay', () => {
  const { s, P } = svc();
  const t = open(s, P, ['a', 'b', 'c']);
  P.c.bankroll = 10;
  finish(s, t, [0, 1, 2]); // Cat Scum pays her last $10
  assert.equal(P.c.bankroll, 0); assert.equal(t.round, null); assert.ok(t.hold); assert.equal(t.status, 'playing');
  const v = s.view(P.a, t.code); assert.equal(v.hold, true); assert.equal(v.seats[2].broke, true);
  assert.throws(() => s.pass(P.a, t.code), /Acid Mines/);
  s.tick(); assert.equal(t.round, null, 'still waiting');
  P.c.bankroll = 25; s.tick();
  assert.ok(t.round && t.round.order.length === 3, 'dealt'); assert.ok(!t.hold);
  assert.equal(t.round.phase, 'exchange', 'last round’s titles still swap cards');
});

test('cannot start when too few players can cover the dues', () => {
  const { s, P } = svc({ bank: { c: 9 } });
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code);
  assert.throws(() => s.start(P.a, v.code), (e) => e.status === 402 && /Cat needs \$10/.test(e.message));
  assert.equal(s.table(v.code).status, 'lobby');
});

test('bots never touch money; the payouts flag off moves nothing', () => {
  const { s, P } = svc({ payouts: false, bank: { c: 0 } });
  const t = open(s, P, ['a', 'b', 'c']);
  assert.ok(t.round.order.includes(2), 'no dues, no lockout');
  finish(s, t, [0, 1, 2]);
  assert.deepEqual([P.a.bankroll, P.b.bankroll, P.c.bankroll], [1000, 1000, 0]);
  assert.equal(s.view(P.a, t.code).payouts, null);
  assert.equal(S.PAY.commoner, 0); assert.equal(S.DUES_MAX, -S.PAY.scum);
});

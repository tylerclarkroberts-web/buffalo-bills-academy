import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/engine/game.js';
import { makeTable } from './helpers.js';

const DAY = 24 * 3600 * 1000;
const conserved = (t) => assert.equal(G.totalCashedOut(t) + G.chipsOnTable(t), G.totalBoughtIn(t), 'no chips created or lost');
const seatOfName = (t, n) => t.seats.findIndex((s) => s && s.name === n);
const lastLog = (t, re) => t.log.filter((l) => re.test(l.text)).at(-1);

/** Play the table forward. AFK players always time out; everyone else checks or calls. Stops when stop() is true. */
function run(t, afk, stop, clock = { now: 10_000 }, max = 400) {
  for (let n = 0; n < max && !stop(); n++) {
    clock.now += 1000;
    if (!t.hand) {
      const w = G.nextWakeAt(t);
      if (w === null) return clock;
      clock.now = Math.max(clock.now, w);
      G.tick(t, clock);
      continue;
    }
    const i = t.hand.toAct; const s = t.seats[i];
    if (afk.includes(s.name)) { clock.now = t.hand.deadline; G.tick(t, clock); continue; }
    const l = G.legalActions(t, i);
    G.act(t, s.playerId, { type: l.canCheck ? 'check' : 'call' }, clock);
  }
  return clock;
}

test('the AFK limit is a named constant of 3', () => {
  assert.equal(G.AFK_BOOT_AFTER, 3);
  assert.ok(G.AWAY_AFTER_TIMEOUTS < G.AFK_BOOT_AFTER);
});

test('streak: two timeouts sit out, the next hand dealt without them is miss 3 and frees the seat', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const bob = () => t.seats[seatOfName(t, 'Bob')];
  const seen = [];
  run(t, ['Bob'], () => { const s = bob(); if (s && seen.at(-1) !== s.timeouts) seen.push(s.timeouts); return !s; });
  assert.deepEqual(seen.filter((x) => x > 0).slice(0, 2), [1, 2]);
  assert.equal(seatOfName(t, 'Bob'), -1, 'Bob is unseated');
  assert.match(lastLog(t, /Bob was away/).text, /Bob was away for 3 turns and left the table/);
  assert.equal(t.afkMoved.p1.turns, 3);
  assert.equal(t.ledger.p1.cashOut, t.afkMoved.p1.chips, 'remaining stack goes back to the bankroll');
  conserved(t);
  // Ann and Cat keep playing
  const hands = t.handNumber;
  run(t, [], () => t.handNumber >= hands + 2);
  assert.ok(t.handNumber >= hands + 2);
  conserved(t);
});

test('any real action resets the streak', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const clock = { now: 10_000 };
  // Bob times out once, then acts on his next turn
  run(t, ['Bob'], () => t.seats[1].timeouts === 1, clock);
  run(t, [], () => t.seats[1].timeouts === 0 || false, clock, 1);
  let acted = false;
  for (let n = 0; n < 200 && !acted; n++) {
    clock.now += 1000;
    if (!t.hand) { clock.now = Math.max(clock.now, G.nextWakeAt(t)); G.tick(t, clock); continue; }
    const i = t.hand.toAct; const l = G.legalActions(t, i);
    G.act(t, t.seats[i].playerId, { type: l.canCheck ? 'check' : 'call' }, clock);
    if (i === 1) acted = true;
  }
  assert.ok(acted);
  assert.equal(t.seats[1].timeouts, 0);
  // sit-in after an auto sit-out resets, and so does rebuy
  t.seats[1].timeouts = 2; t.seats[1].sittingOut = true;
  G.setSittingOut(t, 'p1', false, clock);
  assert.equal(t.seats[1].timeouts, 0);
  t.seats[1].timeouts = 2;
  G.setSittingOut(t, 'p1', true, clock);
  assert.equal(t.seats[1].timeouts, 0, 'pressing sit out is a real action too');
});

test('3rd timeout mid-hand: folds, committed chips stay in the pot, rest is cashed out after the hand', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const i = t.hand.toAct; const s = t.seats[i]; const name = s.name;
  // put chips in first: the player calls, then goes AFK on the flop with 2 misses already
  G.act(t, s.playerId, { type: 'call' }, { now: 2000 });
  const committed = t.hand.players[i].total;
  assert.ok(committed > 0);
  run(t, [], () => t.hand?.street === 'flop' && t.hand.toAct === i);
  t.seats[i].timeouts = 2; // simulate two earlier misses without a sit-out in between
  const potBefore = t.hand.players.reduce((a, p) => a + (p ? p.total : 0), 0);
  G.tick(t, { now: t.hand.deadline });
  assert.equal(t.hand.players[i].folded, true, 'their hand is folded');
  assert.equal(t.seats[i].leaving, true, 'seat held only until the hand ends');
  const potAfter = t.hand.players.reduce((a, p) => a + (p ? p.total : 0), 0);
  assert.equal(potAfter, potBefore, 'committed chips stay in the pot');
  const stackLeft = t.seats[i].stack;
  conserved(t);
  run(t, [], () => !t.seats[i]);
  assert.equal(t.seats[i], null);
  assert.equal(t.ledger[s.playerId].cashOut, stackLeft);
  assert.match(lastLog(t, /was away/).text, new RegExp(`${name} was away for 3 turns`));
  conserved(t);
});

test("coming back before the hand ends cancels a pending boot", () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const i = t.hand.toAct;
  t.seats[i].timeouts = 2;
  G.tick(t, { now: t.hand.deadline });
  assert.equal(t.seats[i].leaving, true);
  G.setSittingOut(t, t.seats[i].playerId, false, { now: t.hand.deadline + 1 });
  assert.equal(t.seats[i].leaving, false);
  assert.match(t.log.at(-1).text, /is back and keeps the seat/);
  run(t, [], () => t.hand === null);
  assert.ok(t.seats[i], 'still seated after the hand');
});

test('heads-up: the AFK player is moved out after 3 turn clocks; the game waits for 2 players', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { turnSeconds: DAY / 1000 });
  G.startGame(t, t.hostId, ctx);
  const clock = run(t, ['Bob'], () => t.seats[1]?.sittingOut === true);
  assert.equal(t.seats[1].timeouts, 2);
  run(t, ['Bob'], () => t.hand === null, clock);
  // stalled: only Ann can be dealt in, so the turn clock keeps running for Bob
  const w = G.nextWakeAt(t);
  assert.ok(w > clock.now && w <= clock.now + DAY, 'wakes after one turn clock');
  G.tick(t, { now: w });
  assert.equal(t.seats[1], null, 'Bob is moved out on miss 3');
  assert.match(lastLog(t, /was away/).text, /Bob was away for 3 turns and left the table/);
  assert.equal(t.hand, null); assert.equal(t.nextHandAt, null);
  assert.equal(G.nextWakeAt(t), null, 'nothing scheduled with one player');
  assert.equal(t.status, 'playing');
  conserved(t);
  // Bob rejoins: no ban, the notice clears, and play resumes
  G.joinTable(t, { id: 'p1', name: 'Bob' }, undefined, { now: w + 5 });
  assert.equal(t.afkMoved.p1, undefined);
  assert.equal(G.viewFor(t, 'p1', w + 5).me.afkMoved ?? null, null);
  assert.ok(t.nextHandAt !== null || t.hand, 'a hand is scheduled again');
});

test('a wait-stall counts only for sitting-out players and resets when they come back', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { turnSeconds: 100 });
  G.startGame(t, t.hostId, ctx);
  run(t, [], () => t.hand === null);
  G.setSittingOut(t, 'p1', true, { now: 50_000 });
  if (t.nextHandAt) G.tick(t, { now: Math.max(50_000, t.nextHandAt) }); // the deal finds only 1 player
  assert.equal(t.hand, null);
  assert.ok(t.awayClockAt > 50_000);
  assert.equal(G.nextWakeAt(t), t.awayClockAt);
  G.tick(t, { now: t.awayClockAt });
  assert.equal(t.seats[1].timeouts, 1);
  assert.equal(t.seats[0].timeouts || 0, 0, 'the waiting player is not counted');
  G.setSittingOut(t, 'p1', false, { now: 60_000 });
  assert.equal(t.seats[1].timeouts, 0);
  assert.equal(t.awayClockAt, null);
});

test('host case: the host can be moved out but still owns the table and can close it', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const clock = run(t, ['Ann'], () => !t.seats[0]);
  assert.equal(t.seats[0], null);
  assert.equal(t.hostId, 'p0');
  const v = G.viewFor(t, 'p0', clock.now);
  assert.equal(v.me.afkMoved.turns, 3);
  conserved(t);
  G.closeTable(t, 'p0', clock);
  assert.equal(t.status, 'closed');
  conserved(t);
  assert.equal(G.chipsOnTable(t), 0);
});

test('rejoin: a moved-out player can take any open seat again', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { turnSeconds: 60 });
  G.startGame(t, t.hostId, ctx);
  const clock = run(t, ['Cat'], () => seatOfName(t, 'Cat') < 0);
  const v = G.viewFor(t, 'p2', clock.now);
  assert.ok(v.me.afkMoved);
  G.joinTable(t, { id: 'p2', name: 'Cat' }, undefined, clock);
  const i = seatOfName(t, 'Cat');
  assert.ok(i >= 0);
  assert.equal(t.seats[i].timeouts, 0);
  assert.equal(t.afkMoved.p2, undefined);
  conserved(t);
});

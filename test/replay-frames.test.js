import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../server/engine/game.js';
import { Store } from '../server/store.js';
import { PokerService } from '../server/service.js';
import { pickReplay } from '../client/src/table/replay.js';
import { makeTable, act, riggedDeck } from './helpers.js';

const contains = (value, card) => (JSON.stringify(value) || '').includes(`"${card}"`);
const frames = (t) => t.log.map((e) => e.frame).filter(Boolean);
const start = (t, ctx) => G.startGame(t, t.hostId, ctx);

test('deal and action frames have historical stacks and bets, never private cards or settings', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { autoCheck: false });
  start(t, ctx);
  const hole = t.hand.players.filter(Boolean).flatMap((p) => p.hole);
  const deal = t.log.find((e) => e.ev?.k === 'hand').frame;
  const blinds = t.log.filter((e) => e.ev?.a === 'post').map((e) => e.frame);
  assert.equal(deal.hand.pot, 0);
  assert.deepEqual(deal.seats.filter(Boolean).map((s) => s.stack), [1000, 1000]);
  assert.deepEqual(blinds.map((f) => f.hand.pot), [10, 30]);
  assert.deepEqual(blinds[1].seats.filter(Boolean).map((s) => s.bet), [10, 20]);
  const saved = structuredClone(frames(t));
  act(t, 'Ann', 'call');
  const call = t.log.at(-1).frame;
  assert.equal(call.hand.pot, 40);
  assert.equal(call.seats[0].stack, 980);
  assert.equal(call.seats[0].bet, 20);
  assert.deepEqual(frames(t).slice(0, saved.length), saved);
  for (const id of [null, 'p0', 'p1', 'watcher']) {
    const log = G.viewFor(t, id, 3000).log;
    for (const card of hole) assert.equal(contains(log, card), false);
    for (const key of ['deck', 'hole', 'muck', 'autoCheck', 'legal', 'token', 'bankroll']) assert.equal(JSON.stringify(log).includes(`"${key}"`), false, key);
  }
  assert.ok(frames(t).every((f) => !f.hand || f.hand.deadline === null));
});

test('all-in runouts keep each street and reveal in order before the pot is paid', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob'], { buyIn: 100 });
  ctx.deck = riggedDeck(['Ks', 'As', 'Kh', 'Ah'], ['2c', '3d', '7s', '8h', '9c']);
  start(t, ctx);
  const holes = t.hand.players.filter(Boolean).map((p) => p.hole.slice());
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'call');
  const deals = t.log.filter((e) => e.ev?.k === 'deal');
  assert.deepEqual(deals.map((e) => [e.frame.hand.street, e.frame.hand.board.length, e.frame.hand.pot]), [['flop', 3, 200], ['turn', 4, 200], ['river', 5, 200]]);
  assert.deepEqual(deals[0].frame.hand.board, ['2c', '3d', '7s']);
  const reveals = t.log.filter((e) => e.ev?.k === 'reveal');
  assert.deepEqual(reveals.map((e) => e.ev.seat), t.lastShowdown.order);
  assert.deepEqual(reveals.map((e) => e.frame.seats.filter((s) => s?.cards).length), [1, 2]);
  assert.ok(reveals.every((e) => e.frame.seats.filter(Boolean).every((s) => s.stack === 0)));
  for (const e of t.log.filter((e) => e.seq < reveals[0].seq)) for (const card of holes.flat()) assert.equal(contains(e.frame, card), false);
  const hiddenSeat = reveals[1].ev.seat;
  for (const card of holes[hiddenSeat]) assert.equal(contains(reveals[0].frame, card), false);
  const win = t.log.find((e) => e.ev?.k === 'win');
  assert.ok(win.seq > reveals.at(-1).seq);
  assert.equal(win.frame.hand, null);
  assert.equal(win.frame.lastHand.number, 1);
  assert.equal(win.frame.seats.filter(Boolean).reduce((sum, s) => sum + s.stack, 0), 200);
});

test('folded cards never enter frames, including after showdown', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  start(t, ctx);
  const hidden = t.hand.players[0].hole.slice();
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  while (t.hand) act(t, t.seats[t.hand.toAct].name, 'check');
  for (const card of hidden) assert.equal(contains(frames(t), card), false);
});

test('visual playback reveals the cards before announcing main, side or uncalled pots', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat'], { buyIn: 100 });
  t.seats[1].stack = 70; t.seats[2].stack = 50;
  start(t, ctx);
  act(t, 'Ann', 'allin'); act(t, 'Bob', 'call'); act(t, 'Cat', 'call');
  const prose = t.log.filter((e) => /^(Main pot|Side pot|Uncalled bet returned)/.test(e.text));
  assert.equal(prose.length, 3);
  assert.ok(prose.every((e) => e.frame === undefined), 'the hand log retains the breakdown without spoiling the visual replay');
  const steps = pickReplay(t.log);
  const runout = steps.filter((s) => s.seq >= steps.find((s) => s.k === 'deal').seq && s.seq <= steps.find((s) => s.k === 'win').seq);
  assert.deepEqual(runout.map((s) => s.k), ['deal', 'deal', 'deal', 'reveal', 'reveal', 'reveal', 'win']);
  assert.ok(!steps.slice(0, steps.findIndex((s) => s.k === 'reveal')).some((s) => /wins|returned to/.test(s.text)));
});

test('voluntary reveals cannot rewrite earlier frames or reveal the other card', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx);
  const cards = t.hand.players[1].hole.slice();
  act(t, 'Ann', 'fold');
  const before = structuredClone(frames(t));
  G.showCards(t, 'p1', 0, { now: 3000 }, 1);
  const first = t.log.at(-1).frame;
  assert.deepEqual(first.lastHand.shown[1].cards, [cards[0]]);
  assert.equal(contains(first, cards[1]), false);
  G.showCards(t, 'p1', 'both', { now: 3100 }, 1);
  assert.deepEqual(frames(t).slice(0, before.length), before);
  assert.deepEqual(first.lastHand.shown[1].cards, [cards[0]]);
  assert.deepEqual(t.log.at(-1).frame.lastHand.shown[1].cards, cards);
});

test('old-hand voluntary reveals have no visual frame once a new hand is running', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx); act(t, 'Ann', 'fold');
  G.tick(t, { now: 5000 });
  assert.equal(t.hand.number, 2);
  G.showCards(t, 'p1', 0, { now: 5100 }, 1);
  const e = t.log.at(-1);
  assert.equal(e.ev.number, 1);
  assert.equal(e.frame, undefined);
});

test('departures, replacement seats and speech are recorded at their own event', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  G.setSay(t, 'p1', 'Howdy', ctx);
  const speech = t.log.at(-1).frame;
  assert.equal(speech.seats[1].say.text, 'Howdy');
  G.leaveTable(t, 'p1', ctx);
  assert.equal(t.log.at(-1).frame.seats[1], null);
  G.joinTable(t, { id: 'new', name: 'Cat' }, 1, ctx);
  assert.equal(t.log.at(-1).frame.seats[1].playerId, 'new');
  assert.equal(speech.seats[1].playerId, 'p1');
  assert.equal(speech.seats[1].say.text, 'Howdy');
  assert.equal(t.log.at(-1).frame.seats[1].say, null);
});

test('a replacement occupant never inherits an old winner\'s public cards', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx); act(t, 'Ann', 'fold');
  G.showCards(t, 'p1', 'both', { now: 3000 }, 1);
  const shown = structuredClone(t.log.at(-1).frame);
  G.leaveTable(t, 'p1', { now: 3100 });
  G.joinTable(t, { id: 'new', name: 'Cat' }, 1, { now: 3200 });
  const frame = t.log.at(-1).frame;
  assert.equal(frame.seats[1].cards, null);
  assert.equal(frame.lastHand.shown[1], undefined);
  assert.equal(shown.lastHand.shown[1].playerId, 'p1');
  assert.equal(shown.lastHand.shown[1].cards.length, 2);
});

test('cancellation frames show returned bets once and do not reuse the previous board', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  start(t, ctx); act(t, 'Ann', 'fold');
  G.tick(t, { now: 5000 });
  G.closeTable(t, t.hostId, { now: 5100 });
  const frame = t.log.find((e) => e.text.includes('was cancelled')).frame;
  assert.equal(frame.handNumber, 2);
  assert.equal(frame.hand, null);
  assert.equal(frame.lastHand, null);
  assert.equal(frame.seats.filter(Boolean).reduce((sum, s) => sum + s.stack + s.bet, 0), 2000);
  assert.ok(t.log.at(-1).frame.seats.every((s) => s === null));
});

test('old saved logs coexist with new frames; bounded frames persist across restart', (test) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-frames-'));
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  for (const e of t.log) delete e.frame;
  new Store(dir).saveTable(t);
  const store = new Store(dir), restored = store.getTable(t.code);
  assert.ok(G.viewFor(restored, null, ctx.now).log.every((e) => !e.frame));
  G.setSay(restored, 'p0', 'New entry', ctx);
  assert.ok(restored.log.at(-1).frame);
  for (let i = 0; i < 305; i++) G.setSay(restored, 'p0', `Message ${i}`, ctx);
  assert.equal(restored.log.length, 300);
  assert.ok(restored.log.every((e) => e.frame));
  store.saveTable(restored);
  const reread = new Store(dir).getTable(t.code);
  assert.deepEqual(G.viewFor(reread, null, ctx.now).log, JSON.parse(JSON.stringify(restored.log)));
});

const smoke = (at, id = 'smoke1', from = 'p0') => ({ id, from, fromName: from === 'p0' ? 'Ann' : 'Bob',
  item: 'tob-cigar', name: 'Big Cigar', emoji: '🚬', art: 'cigar', at });

test('queued tobacco waits for its scheduled time without blocking poker or capturing an early frame', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  const seq = t.seq;
  G.recordTableMoment(t, 'smoke', { ...smoke(61000), hole: ['As', 'Ah'], token: 'secret', bankroll: 100 }, ctx);
  assert.equal(t.seq, seq);
  assert.equal(t.pendingSmokes.length, 1);
  assert.deepEqual(Object.keys(t.pendingSmokes[0]).sort(), ['k', 'id', 'from', 'fromName', 'seat', 'item', 'name', 'emoji', 'art', 'at'].sort());
  assert.equal(G.nextWakeAt(t), 61000, 'lobby schedules the pending moment');
  start(t, ctx); act(t, 'Ann', 'call');
  const action = t.log.at(-1);
  assert.equal(action.ev.k, 'act');
  assert.equal(G.nextWakeAt(t), 61000, 'the lighter wakes before the poker deadline');
  assert.equal(G.tick(t, { now: 60999 }), false);
  assert.equal(t.log.some((e) => e.ev?.id === 'smoke1'), false);
  const hand = structuredClone(t.hand);
  assert.equal(G.tick(t, { now: 62000 }), true);
  const lit = t.log.at(-1);
  assert.equal(lit.t, 62000, 'late wake records the actual frame time');
  assert.equal(lit.ev.at, 61000);
  assert.equal(lit.seq, action.seq + 1);
  assert.equal(lit.frame.hand.pot, 40, 'the frame includes the intervening call');
  assert.deepEqual(t.hand, hand, 'tobacco does not change the hand or deadline');
  assert.equal(t.pendingSmokes, undefined);
  assert.equal(G.tick(t, { now: 62000 }), false);
  assert.equal(t.log.filter((e) => e.ev?.id === 'smoke1').length, 1);
});

test('a queued sender who leaves never lights up at their replacement occupant', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  G.recordTableMoment(t, 'smoke', smoke(5000, 'leaving', 'p1'), ctx);
  G.leaveTable(t, 'p1', { now: 2000 });
  G.joinTable(t, { id: 'new', name: 'Cat' }, 1, { now: 3000 });
  G.tick(t, { now: 5000 });
  const lit = t.log.at(-1);
  assert.equal(lit.ev.from, 'p1');
  assert.equal(lit.ev.fromName, 'Bob');
  assert.equal(lit.ev.seat, -1);
  assert.equal(lit.frame.seats[1].playerId, 'new');
  assert.ok(!lit.frame.seats.some((s) => s?.playerId === 'p1'));
});

test('closing a table cancels its bounded pending tobacco queue', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  for (let i = 0; i < 5; i++) G.recordTableMoment(t, 'smoke', smoke(5000 + i * 60000, `pending${i}`), ctx);
  assert.equal(t.pendingSmokes.length, 5);
  G.closeTable(t, t.hostId, { now: 2000 });
  assert.equal(t.pendingSmokes, undefined);
  assert.equal(G.nextWakeAt(t), null);
  assert.equal(G.tick(t, { now: 1e6 }), false);
  assert.ok(!t.log.some((e) => e.ev?.k === 'smoke'));
});

test('the service wakes a persisted lobby smoke once after restart and notifies watchers', async (test) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-smoke-'));
  const services = [];
  test.after(() => { for (const service of services) service.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  G.recordTableMoment(t, 'smoke', smoke(5000), ctx);
  new Store(dir).saveTable(t);
  let now = 1000;
  const service = new PokerService({ dataDir: dir, now: () => now }); services.push(service);
  assert.ok(service.timer, 'lobby pending work arms the normal table timer');
  const changes = [];
  service.subscribe(t.code, (version) => changes.push(version));
  now = 5500;
  service.runDue();
  const recorded = service.getTable(t.code).log.filter((e) => e.ev?.id === 'smoke1');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].t, 5500);
  assert.equal(recorded[0].frame.status, 'lobby');
  assert.equal(changes.length, 1);
  service.shutdown();
  const restarted = new PokerService({ dataDir: dir, now: () => now }); services.push(restarted);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(restarted.getTable(t.code).log.filter((e) => e.ev?.id === 'smoke1').length, 1);
  assert.equal(restarted.getTable(t.code).pendingSmokes, undefined);
});

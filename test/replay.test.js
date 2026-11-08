// v43: client replay selection/timing (pure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickReplay, stepMs, frameAt } from '../client/src/table/replay.js';
import * as G from '../server/engine/game.js';
import { makeTable, act } from './helpers.js';

function table() {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.startGame(t, t.hostId, ctx);
  return { t, ctx };
}
test('player sees what happened since their own last action, not their own moves', () => {
  const { t } = table();
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  const bob = t.seats.findIndex((s) => s.name === 'Bob');
  // flop: Bob (SB) first
  act(t, 'Bob', 'bet', 40); act(t, 'Cat', 'call');
  const r = pickReplay(t.log, { mySeat: t.seats.findIndex((s) => s.name === 'Ann'), handNo: t.handNumber });
  assert.deepEqual(r.map((s) => s.k + ':' + (s.a || s.street)), ['act:call', 'act:check', 'deal:flop', 'act:bet', 'act:call']);
  const rb = pickReplay(t.log, { mySeat: bob, handNo: t.handNumber });
  assert.deepEqual(rb.map((s) => s.a), ['call']);
});
test('spectator first look: current hand from the start; then only new events', () => {
  const { t } = table();
  act(t, 'Ann', 'call');
  const r = pickReplay(t.log, { handNo: t.handNumber });
  assert.deepEqual(r.map((s) => s.a), ['post', 'post', 'call']);
  const last = r.at(-1).seq;
  act(t, 'Bob', 'fold');
  assert.deepEqual(pickReplay(t.log, { seen: last, handNo: t.handNumber }).map((s) => s.a), ['fold']);
});
test('returning after hours: condensed to the last pot push + this hand', () => {
  const { t, ctx } = table();
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');  // hand 1 over; Ann last acted (fold)
  ctx.now += 10 * 3600e3; G.tick(t, ctx); if (!t.hand) { ctx.now += 60e3; G.tick(t, ctx); }
  const ann = t.seats.findIndex((s) => s.name === 'Ann');
  const r = pickReplay(t.log, { mySeat: ann, handNo: t.handNumber });
  assert.ok(r[0].k === 'win' && r[0].hand === t.handNumber - 1, 'starts with the previous pot push');
  assert.ok(r.slice(1).every((s) => s.hand === t.handNumber));
});
test('timing: 0.5-0.8 s per action, about 4 s total cap', () => {
  assert.equal(stepMs(1), 800); assert.ok(stepMs(5) >= 500 && stepMs(5) <= 800);
  for (const n of [6, 10, 20, 40]) assert.ok(stepMs(n) * n <= 4000 + 220 * n * (stepMs(n) === 220) , `n=${n}`);
  assert.ok(stepMs(10) * 10 <= 4000);
});
test('frame: board grows one deal at a time; pot follows the events', () => {
  const steps = [{ k: 'act', a: 'call', pot: 30 }, { k: 'deal', street: 'flop', cards: ['a', 'b', 'c'], board: 3, pot: 30 }, { k: 'act', a: 'bet', pot: 70 }];
  assert.deepEqual(frameAt(steps, 0, 3, 70), { board: 0, pot: 30 });
  assert.deepEqual(frameAt(steps, 1, 3, 70), { board: 3, pot: 30 });
  assert.deepEqual(frameAt(steps, 2, 3, 70), { board: 3, pot: 70 });
});

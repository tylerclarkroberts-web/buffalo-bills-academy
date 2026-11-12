import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines } from '../server/mines.js';
import { CATALOG, ITEM } from '../server/catalog/index.js';
import { MINE_ITEMS, SHAFTS } from '../server/catalog/mine.js';

const version = { rulesVersion: 2 };
// payout roll 20000 = an ordinary bucket ($80 per 100 units with these pinned rolls); 0 = the motherlode.
function fixture(t, { own = {}, payout = 20000, pool = 99999, cave = 99, twin = 99 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-gear-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir); const accounts = new Accounts({ store, now: () => clock.now });
  const mines = new Mines({ store, accounts, now: () => clock.now, owned: () => own,
    randInt: (n) => (n === 100000 ? payout : 0), scareInt: (n) => n - 1, poolInt: () => pool, caveInt: () => cave, twinInt: () => twin, vein: () => ({ veinMs: 60000, cells: 7 }) });
  const player = store.players.miner = { id: 'miner', name: 'Miner' }; accounts.ensure(player);
  const call = (fn, s, extra) => mines[fn](player, s.shiftId, { ...version, poolId: s.currentPoolId, ...extra });
  /** Walk the chain, draining every pool, until the bucket settles. */
  const fill = (s) => {
    for (let guard = 0; guard < 5000 && !s.result; guard++) {
      const p = s.pools.find((x) => x.id === s.currentPoolId);
      if (p.quantity === null) { clock.now = Math.max(clock.now, s.readyAt); s = call('probe', s); continue; }
      call('extract', s, { action: 'start' }); clock.now += 500; s = call('extract', s, { action: 'continue' });
    }
    return s;
  };
  return { clock, mines, player, call, fill, start: (extra) => mines.start(player, { ...version, ...extra }) };
}

test('mine gear is in the store catalog and every shaft permit exists', () => {
  for (const x of MINE_ITEMS) assert.equal(CATALOG.includes(ITEM[x.id]), true);
  for (const s of SHAFTS) assert.ok(!s.permit || ITEM[s.permit], `${s.id}: no permit item`);
  assert.deepEqual(SHAFTS.map((s) => s.max), [100, 400, 800, 1000]);
});

test('Shaft 7 stays one plain bucket however much gear you own', (t) => {
  const f = fixture(t, { own: { 'mine-goldbucket': 1 } });
  const s = f.start();
  assert.equal(s.capacity, 100); assert.equal(s.shaft, '7'); assert.equal(f.player.bankroll, 1000);
  const done = f.fill(s);
  assert.equal(done.result.amount, 80); assert.equal(done.result.capacity, 100);
});

test('a deeper shaft needs its permit, charges the fare once and pays by the unit', (t) => {
  const locked = fixture(t, { own: { 'mine-bucket2': 1 } });
  assert.throws(() => locked.start({ shaft: '8' }), (e) => e.status === 403);
  assert.equal(locked.player.bankroll, 1000);

  const f = fixture(t, { own: { 'mine-bucket2': 1, 'mine-permit8': 1 } });
  assert.equal(f.mines.office(f.player).shafts.find((x) => x.id === '8').open, true);
  assert.equal(f.mines.office(f.player).shafts.find((x) => x.id === '12').open, false);
  let s = f.start({ shaft: '8' });
  assert.equal(s.capacity, 200); assert.equal(f.player.bankroll, 960);
  assert.equal(f.start({ shaft: '8' }).shiftId, s.shiftId, 'resuming is the same shift');
  assert.equal(f.player.bankroll, 960, 'resuming never charges again');
  f.clock.now = s.readyAt; s = f.call('probe', s);
  assert.equal(s.pools[0].quantity, 200, 'a full-fill roll is the whole 200-unit Shaft 8 bucket');
  const done = f.fill(s);
  assert.equal(done.result.collected, 200); assert.equal(done.result.amount, 160);
  assert.equal(f.player.bankroll, 960 + 160);
});

test('the elevator turns away a miner who cannot cover the fare', (t) => {
  const f = fixture(t, { own: { 'mine-permit8': 1 } });
  f.player.bankroll = 39;
  assert.throws(() => f.start({ shaft: '8' }), (e) => e.status === 402);
  assert.equal(f.player.bankroll, 39); assert.equal(f.mines.doc.active.miner, undefined);
});

test('the straw and the shop-vac only change how fast the bucket fills', (t) => {
  for (const [own, units] of [[{}, 2.5], [{ 'mine-straw': 1 }, 5], [{ 'mine-straw': 1, 'mine-shopvac': 1 }, 25]]) {
    const f = fixture(t, { own });
    let s = f.start(); assert.equal(s.extractionRate, units * 2);
    f.clock.now = s.readyAt; s = f.call('probe', s); // default roll fills the whole bucket
    f.call('extract', s, { action: 'start' }); f.clock.now += 500;
    assert.equal(f.call('extract', s, { action: 'continue' }).collected, units);
  }
});

test('a rare find is one find, whatever the bucket', (t) => {
  const f = fixture(t, { own: { 'mine-bucket2': 1, 'mine-permit8': 1 }, payout: 0 });
  const done = f.fill(f.start({ shaft: '8' }));
  assert.equal(done.result.outcome, 'motherlode'); assert.equal(done.result.collected, 200); assert.equal(done.result.amount, 10000);
});

test('the dowsing rod does not change an acid fill roll', (t) => {
  const plain = fixture(t, { pool: 0 }); let s = plain.start();
  plain.clock.now = s.readyAt; assert.equal(plain.call('probe', s).pools[0].quantity, 1);
  const f = fixture(t, { own: { 'mine-rod': 1 }, pool: 0 }); s = f.start();
  assert.equal(s.rod, true);
  f.clock.now = s.readyAt; assert.equal(f.call('probe', s).pools[0].quantity, 1, 'a 1% fill stays 1% with the rod');
});

test('permit shafts can cave in and spill a quarter of the bucket; Shaft 7 never does', (t) => {
  const safe = fixture(t, { cave: 0 }); let s = safe.start();
  assert.equal(safe.fill(s).result.amount, 80, 'Shaft 7 ignores the cave-in roll');
  const f = fixture(t, { own: { 'mine-permit8': 1, 'mine-goldbucket': 1 }, cave: 0, pool: 30000 }); s = f.start({ shaft: '8' });
  assert.equal(s.capacity, 400);
  assert.doesNotMatch(JSON.stringify(s), /"cave"/, 'the trap is never sent to the client');
  f.clock.now = s.readyAt; s = f.call('probe', s);
  assert.equal(s.pools[0].quantity, 200, 'halfway of a 400-unit bucket');
  assert.equal(s.spill, undefined, 'an empty bucket has nothing to spill');
  while (s.currentPoolId === 'p0') { f.call('extract', s, { action: 'start' }); f.clock.now += 500; s = f.call('extract', s, { action: 'continue' }); }
  const carried = s.collected;
  assert.equal(carried, 200);
  f.clock.now = Math.max(f.clock.now, s.readyAt); s = f.call('probe', s);
  assert.deepEqual(s.spill, { poolId: 'p1', lost: carried * 0.25 }); assert.equal(s.collected, carried * 0.75);
  assert.equal(s.pools[1].quantity, 200, 'the next fill is clamped only to remaining space, which is still 250');
  assert.deepEqual(f.call('probe', s).spill, s.spill, 'asking again does not spill again');
  const done = f.fill(s);
  assert.equal(done.result.collected, 400); assert.equal(done.result.amount, 320);
});

test('the other faun takes a third of a permit-shaft cheque; Shaft 7 never meets him', (t) => {
  const safe = fixture(t, { twin: 0 });
  assert.equal(safe.fill(safe.start()).result.amount, 80, 'Shaft 7 ignores the roll');
  const f = fixture(t, { own: { 'mine-permit8': 1 }, twin: 0 }); f.player.bankroll = 1000;
  const s = f.start({ shaft: '8' });
  assert.doesNotMatch(JSON.stringify(s), /twin/, 'he is never sent to the client ahead of time');
  const done = f.fill(s).result;
  assert.deepEqual(done.twin, { took: 26.66 }); assert.equal(done.amount, 53.34);
  assert.equal(f.player.bankroll, 1000 - 40 + 53.34, 'only the reduced cheque is paid');
  assert.equal(f.player.mining.earned, 53.34);
});

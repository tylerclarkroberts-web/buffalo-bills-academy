// Acid worms drink from the bucket you are carrying: after 1 s attached, 2 units a second, never below zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { dailyLayout, mineDay } from '../server/engine/daily-maze.js';
import { suckUnits, wormIsSucking, WORM_SUCK_DELAY_MS, WORM_SUCK_PER_SEC, WORM_SUCK_MAX_GAP_MS } from '../client/src/mines/worms.js';

const V = { rulesVersion: 2 };
const farPose = (s) => {
  const pool = s.pools[0];
  // Stand somewhere that is not in reach of the current pool (the lift is almost always far enough).
  const lift = { x: 1, y: 1 };
  const d = Math.hypot(lift.x - pool.x, lift.y - pool.y);
  if (d * 2.2 > 1.9) return lift;
  return { x: pool.x + 3, y: pool.y };
};

function fixture(t, { payout = 20000, wormInt } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-worms-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-12T19:00:00Z') };
  const store = new Store(dir), accounts = new Accounts({ store, now: () => clock.now });
  const barn = new Barn({ store, accounts, now: () => clock.now });
  const shop = new Shop({ store, accounts, barn, now: () => clock.now });
  const mines = new Mines({
    store, accounts, barn, now: () => clock.now,
    randInt: (n) => (n === 100000 ? payout : 0), scareInt: (n) => n - 1, poolInt: () => 5000,
    wormInt: wormInt || ((n) => n - 1), // quiet unless a test wants landings
    layout: (now) => dailyLayout(mineDay(now), 5), // Dead Man's Dig: worms are in play
  });
  const pvp = new Pvp({ store, accounts, mines, shop, barn, avatars: null, now: () => clock.now, randInt: (n) => Math.floor(n / 2) });
  const player = (id) => { const p = store.players[id] = { id, name: id, kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 }; accounts.ensure(p); p.mining.shifts = 10; store.savePlayers(); return p; };
  const ann = player('ann'), bob = player('bob');
  const fill = (p, units) => { const cur = mines.doc.active[p.id]; mines.commit(p.id, { ...cur, collected: Math.round(units * 1000), worth: Math.round(units * 1000) }); };
  const start = (p) => mines.start(p, V);
  const tick = (p, s, pos, extra = {}) => pvp.tick(p, { ...V, shiftId: s.shiftId, ...pos, ...extra });
  return { clock, mines, pvp, ann, bob, fill, start, tick, farPose };
}

test('suckUnits: nothing before the delay, then 2 units a second per worm, stacks, never bills a backwards window', () => {
  const w = { at: 0 };
  assert.equal(suckUnits([], 0, 5000), 0);
  assert.equal(suckUnits([w], 1000, 1000), 0);
  assert.equal(suckUnits([w], 2000, 1000), 0);
  assert.equal(suckUnits([w], 0, WORM_SUCK_DELAY_MS), 0, 'exactly one second on you is still the pause');
  assert.equal(suckUnits([w], 0, WORM_SUCK_DELAY_MS + 1000), WORM_SUCK_PER_SEC);
  assert.equal(suckUnits([w], WORM_SUCK_DELAY_MS, WORM_SUCK_DELAY_MS + 500), 1);
  assert.equal(suckUnits([w, { at: 0 }], WORM_SUCK_DELAY_MS, WORM_SUCK_DELAY_MS + 1000), 4, 'two worms stack');
  assert.equal(suckUnits([{ at: 5000 }], 0, 5500), 0, 'a worm that just landed does not drink yet');
  assert.equal(wormIsSucking(w, WORM_SUCK_DELAY_MS - 1), false);
  assert.equal(wormIsSucking(w, WORM_SUCK_DELAY_MS), true);
});

test('a latched worm starts drinking after 1 s at 2 drops a second, and the bucket never goes below zero', (t) => {
  const f = fixture(t);
  const s = f.start(f.ann);
  f.fill(f.ann, 10);
  const pose = farPose(s);
  f.clock.now += 8000; // past the landing grace
  let v = f.mines.tickWorms(f.ann, { pose, spawn: true });
  assert.equal(v.worms.length, 1);
  assert.equal(v.sucking, false);
  assert.equal(v.collected, 10);

  f.clock.now += WORM_SUCK_DELAY_MS;
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.collected, 10, 'still the pause');
  assert.equal(v.suckedJust, 0);
  assert.equal(v.sucking, true, 'the visor can show it is about to drink');

  f.clock.now += 1000;
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.collected, 8);
  assert.equal(v.suckedJust, 2);
  assert.equal(v.sucked, 2);
  assert.equal(f.mines.doc.active.ann.collected, 8000);
  assert.equal(f.mines.doc.active.ann.worth, 8000, 'quality scales down with the haul');

  // A late heartbeat only bills two seconds, so empty the rest in 2 s bites.
  f.clock.now += 2000;
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.collected, 4);
  f.clock.now += 2000;
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.collected, 0);
  assert.equal(v.suckedJust, 4);
  assert.equal(v.sucked, 10);
  assert.equal(v.sucking, false, 'nothing left to drink');
  assert.equal(f.mines.doc.active.ann.collected, 0);
  assert.equal(f.mines.doc.active.ann.worth, 0);

  f.clock.now += 1000;
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.collected, 0);
  assert.equal(v.suckedJust, 0);
  assert.equal(v.sucked, 10);
});

test('two worms stack, a cut one stops, and a late heartbeat is only billed for two seconds', (t) => {
  const f = fixture(t);
  const s = f.start(f.ann);
  f.fill(f.ann, 40);
  const pose = farPose(s);
  f.clock.now += 8000;
  f.mines.tickWorms(f.ann, { pose, spawn: true });
  f.mines.tickWorms(f.ann, { pose, spawn: true });
  f.clock.now += WORM_SUCK_DELAY_MS + 1000;
  let v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.worms.length, 2);
  assert.equal(v.collected, 36, '4 units: 2 worms × 2 / s for 1 s');

  const cut = v.worms[0].id;
  f.clock.now += 1000;
  v = f.mines.tickWorms(f.ann, { pose, slash: cut });
  assert.equal(v.worms.length, 1);
  assert.equal(v.collected, 32, 'both billed this beat (the cut one was still on you), then one remains');

  f.clock.now += 30_000; // a long AFK: cap at 2 s × 2 units for the remaining worm
  v = f.mines.tickWorms(f.ann, { pose });
  assert.equal(v.suckedJust, 2 * (WORM_SUCK_MAX_GAP_MS / 1000));
  assert.equal(v.collected, 28);
});

test('new worms will not land in reach of acid, but one already on you keeps drinking', (t) => {
  const f = fixture(t, { wormInt: () => 0 }); // rand 0: a tick would land one if allowed
  const s = f.start(f.ann);
  f.fill(f.ann, 20);
  const pose = farPose(s);
  f.clock.now += 8000;
  let v = f.mines.tickWorms(f.ann, { pose, spawn: true });
  const id = v.worms[0].id;
  const pool = f.mines.doc.active.ann.pools[0];
  const onPool = { x: pool.x, y: pool.y };
  f.clock.now += WORM_SUCK_DELAY_MS + 1000;
  v = f.mines.tickWorms(f.ann, { pose: onPool }); // in reach: no new landing, still drinks
  assert.equal(v.worms.length, 1);
  assert.equal(v.worms[0].id, id);
  assert.equal(v.collected, 18);

  // A miner with nothing on them, standing on the pool, does not pick up a new worm.
  const s2 = f.start(f.bob);
  f.fill(f.bob, 10);
  f.clock.now += 8000;
  const bobPool = f.mines.doc.active.bob.pools[0];
  f.mines.tickWorms(f.bob, { pose: { x: bobPool.x, y: bobPool.y } });
  f.clock.now += 1000;
  v = f.mines.tickWorms(f.bob, { pose: { x: bobPool.x, y: bobPool.y } });
  assert.equal(v.worms.length, 0);
  assert.equal(v.collected, 10);
});

test('the knife, a battle hold, clock-out and a raid all see the drained bucket; payouts use what is left', (t) => {
  const f = fixture(t, { payout: 20000 });
  const s = f.start(f.ann);
  f.fill(f.ann, 10);
  const pose = farPose(s);
  f.clock.now += 8000;
  f.mines.tickWorms(f.ann, { pose, spawn: true });
  f.clock.now += WORM_SUCK_DELAY_MS + 1000;
  f.mines.tickWorms(f.ann, { pose }); // 2 units
  f.clock.now += 1000; // settle bills the last second: 2 more
  const done = f.mines.quit(f.ann, s.shiftId, V);
  assert.equal(done.result.collected, 6);
  assert.equal(done.result.sucked, 4);
  // Ordinary acid: $80 (the pinned roll) × Dead Man's Dig hazard × 6/100 of a full bucket.
  assert.equal(done.result.hazard, 2);
  assert.equal(done.result.amount, 9.6);
  assert.equal(f.mines.swarms.has('ann'), false, 'the visor clears when the shift ends');

  const b = f.start(f.bob);
  const a2 = f.mines.start(f.ann, { ...V, afterShiftId: s.shiftId });
  f.fill(f.bob, 12);
  f.fill(f.ann, 5);
  const bobPose = farPose(b);
  f.clock.now += 8000;
  f.mines.tickWorms(f.bob, { pose: bobPose, spawn: true });
  f.clock.now += WORM_SUCK_DELAY_MS + 1000; // bob loses 2, has 10 left
  const raid = f.mines.applyRaid({ id: 'r1', loser: 'bob', winner: 'ann', loserShift: b.shiftId, winnerShift: a2.shiftId, at: f.clock.now, kind: 'ambush', winnerName: 'ANN' });
  assert.equal(raid.acid, 10);
  assert.equal(raid.gained, 10);
  assert.equal(f.mines.doc.active.ann.collected, 15000, 'ann keeps her 5 and takes bob\'s remaining 10');
  assert.ok(f.mines.doc.completed.bob);
  assert.equal(f.mines.doc.completed.bob.result.collected, 0, 'the victim is paid nothing');
  assert.equal(f.mines.swarms.has('bob'), false);
});

test('extract keeps draining a latched worm, and a PvP heartbeat carries the slash and the new total', (t) => {
  const f = fixture(t);
  const s = f.start(f.ann);
  f.fill(f.ann, 16);
  const pose = farPose(s);
  f.clock.now += 8000;
  const landed = f.mines.tickWorms(f.ann, { pose, spawn: true });
  const id = landed.worms[0].id;
  f.clock.now += WORM_SUCK_DELAY_MS + 1000;
  // inspect first: extract refuses an unseen pool, but still drains once you are mining
  f.mines.probe(f.ann, s.shiftId, { ...V, poolId: s.currentPoolId });
  const mid = f.mines.extract(f.ann, s.shiftId, { ...V, poolId: s.currentPoolId, action: 'start' });
  assert.equal(mid.collected, 14);
  assert.equal(mid.sucking, true);
  assert.ok(mid.worms.some((w) => w.id === id && w.sucking));

  f.clock.now += 1000;
  const view = f.tick(f.ann, s, pose, { slash: id });
  assert.equal(view.collected, 12, 'the last second before the cut still bills, then the worm is gone');
  assert.equal(view.worms.length, 0);
  assert.equal(view.suckedJust, 2);
});

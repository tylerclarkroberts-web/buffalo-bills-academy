// v79: five difficulty tiers for the daily mine (20% each), shared by everyone that day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines } from '../server/mines.js';
import { mineDay, daySeed, dailyLayout, dailyMine } from '../server/engine/daily-maze.js';
import { TIERS, dayTier, tierInfo, shiftMaze, tierLight, MIN_FOG } from '../server/engine/mine-tiers.js';
import { distFrom, makeMaze, bucketChain, RUBBLE, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { onTunnel } from '../server/engine/pvp-geometry.js';
import { WormSwarm, WORM_GRACE_MS } from '../client/src/mines/worms.js';
import { MINE_REACH, LEAVE_REACH } from '../client/src/mines/vein.js';

const DAY = 86400e3;
const NOON_UTC = Date.parse('2026-01-01T19:00:00Z');
const V2 = { rulesVersion: 2 };
const count = (g, v) => g.reduce((a, row) => a + row.filter((x) => x === v).length, 0);
const reach = (g) => { const d = distFrom(g, 1, 1); let n = 0; for (const row of d) for (const v of row) if (v >= 0) n++; return n; };

test('tiers: five rows from tiny to enormous, and everything that should get rougher does', () => {
  assert.deepEqual(TIERS.map((t) => t.tier), [1, 2, 3, 4, 5]);
  for (let i = 1; i < TIERS.length; i++) {
    const a = TIERS[i - 1], b = TIERS[i];
    assert.ok(b.cells > a.cells, 'bigger'); assert.ok(b.caves > a.caves, 'more cave-ins');
    assert.ok(b.lamp < a.lamp && b.fog < a.fog && b.ambient < a.ambient, 'darker');
    assert.ok(b.flicker > a.flicker && b.worms > a.worms && b.wormSize > a.wormSize, 'more flicker and worms');
    assert.ok(b.pay > a.pay, 'more hazard pay');
    assert.ok(FIRST_POOL_STEPS[b.cells], `size ${b.cells} has a first-pool distance`);
  }
  assert.equal(TIERS[0].worms, 0); assert.equal(TIERS[0].caves, 0); assert.equal(TIERS[0].flicker, 0);
  assert.equal(tierInfo(0), null); assert.equal(tierInfo(undefined), null); assert.equal(tierInfo(6), null);
});

test('the day picks its tier from its seed: about 20% each over many days, and always the same answer', () => {
  const counts = [0, 0, 0, 0, 0], N = 5000;
  for (let i = 0; i < N; i++) counts[dayTier(daySeed(mineDay(NOON_UTC + i * DAY))) - 1]++;
  for (const c of counts) assert.ok(Math.abs(c / N - 0.2) < 0.02, `tier share ${c}/${N}`);
  // a run of the same tier is possible but not a rut
  let longest = 0, run = 0, prev = 0;
  for (let i = 0; i < 365; i++) { const t = dayTier(daySeed(mineDay(NOON_UTC + i * DAY))); run = t === prev ? run + 1 : 1; prev = t; longest = Math.max(longest, run); }
  assert.ok(longest <= 6, `longest run ${longest}`);
  for (const day of ['2026-11-13', '2026-12-25', '2027-02-28']) {
    assert.deepEqual(dailyLayout(day), dailyLayout(day));
    const a = dailyMine(day), b = dailyMine(day);
    assert.deepEqual(a.maze.grid, b.maze.grid); assert.deepEqual(a.chain.map((p) => [p.x, p.y]), b.chain.map((p) => [p.x, p.y]));
    assert.deepEqual(shiftMaze({ seed: a.seed, cells: a.cells, tier: a.tier }).grid, a.maze.grid, 'browser and server dig the same tunnels');
  }
});

test('cave-ins never cut anything off: every tunnel, the elevator and every acid spot stay reachable, on every tier', () => {
  const rubble = [0, 0, 0, 0, 0];
  for (const t of TIERS) {
    for (let i = 0; i < 80; i++) {
      const day = mineDay(NOON_UTC + i * DAY), { maze, chain, cells, tier } = dailyMine(day, t.tier);
      assert.equal(tier, t.tier); assert.equal(cells, t.cells);
      const g = maze.grid, open = count(g, 0), piles = count(g, RUBBLE);
      rubble[t.tier - 1] += piles;
      assert.ok(piles <= t.caves, `${day} tier ${t.tier}: ${piles} cave-ins`);
      assert.equal(reach(g), open, `${day} tier ${t.tier}: a tunnel got cut off`);
      const d = distFrom(g, maze.start.x, maze.start.y);
      for (const p of chain) { assert.ok(d[p.y][p.x] > 0, `${day} tier ${t.tier}: acid at ${p.x},${p.y} unreachable`); assert.equal(g[p.y][p.x], 0); }
      assert.equal(g[1][1], 0, 'the elevator is never buried');
      for (const [dx, dy] of [[1, 0], [0, 1], [2, 0], [0, 2]]) assert.notEqual(g[1 + dy]?.[1 + dx], RUBBLE, 'nothing piled at the elevator');
      // rubble only ever sits in a hallway (rock on both sides), never in a junction or a dead end
      for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 1; x++) if (g[y][x] === RUBBLE) {
        const h = g[y][x - 1] !== 1 && g[y][x + 1] !== 1 && g[y - 1][x] === 1 && g[y + 1][x] === 1;
        const v = g[y - 1][x] !== 1 && g[y + 1][x] !== 1 && g[y][x - 1] === 1 && g[y][x + 1] === 1;
        assert.ok(h || v, `${day}: rubble at ${x},${y} is not in a hallway`);
      }
      // the server's PvP check treats rubble as rock: nobody stands in a cave-in
      for (let y = 0; y < g.length; y++) for (let x = 0; x < g.length; x++) if (g[y][x] === RUBBLE) assert.equal(onTunnel(g, { x, y }), false);
    }
  }
  assert.equal(rubble[0], 0, 'tier 1 has no cave-ins');
  for (let k = 1; k < 5; k++) assert.ok(rubble[k] > rubble[k - 1], `more cave-ins on tier ${k + 1}: ${rubble}`);
  assert.ok(rubble[4] / 80 >= 8, `Dead Man's Dig averages ${rubble[4] / 80} cave-ins`);
});

test('a maze without a tier is exactly the old maze (shifts dug before tiers keep their tunnels)', () => {
  for (const [seed, cells] of [[12345, 7], [999, 9], [4242, 11]]) {
    assert.deepEqual(shiftMaze({ seed, cells }).grid, makeMaze(seed, cells, FIRST_POOL_STEPS[cells]).grid);
    assert.equal(count(shiftMaze({ seed, cells }).grid, RUBBLE), 0);
  }
});

test('if you can see acid you can mine it: the darkest day never fogs out a pool in reach', () => {
  for (const t of TIERS) for (const fogFar of [17, 12, 8.5, 6, 25]) for (const lampReach of [11, 8, 6, 4.5, 18]) {
    const l = tierLight({ fogFar, lampReach }, t.tier);
    assert.ok(l.fogFar >= MIN_FOG && l.fogFar > LEAVE_REACH * 2, `tier ${t.tier}: fog at ${l.fogFar}`);
    assert.ok(l.lampReach > MINE_REACH, `tier ${t.tier}: lamp reaches ${l.lampReach}`);
  }
});

test('acid worms: none on tier 1, more and bigger as it gets rougher, and never while acid is in reach', () => {
  const seeded = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; };
  const landed = TIERS.map((t) => {
    const s = new WormSwarm(t, seeded(7)); let n = 0;
    for (let ms = 0; ms < 30 * 60e3; ms += 250) { if (s.tick(250)) n++; if (s.worms.length) s.slash(); } // cut them as they land
    return n;
  });
  assert.equal(landed[0], 0, 'tier 1: no worms');
  for (let k = 2; k < 5; k++) assert.ok(landed[k] > landed[k - 1], `worms by tier ${landed}`);
  assert.ok(Math.abs(landed[4] / 30 - TIERS[4].worms) < 1, `tier 5 lands about ${TIERS[4].worms} a minute (${landed[4]} in 30)`);
  // holding: at acid, in a battle, behind the door
  const held = new WormSwarm(TIERS[4], () => 0);
  for (let ms = 0; ms < 60e3; ms += 250) assert.equal(held.tick(250, { hold: true }), null);
  assert.equal(held.worms.length, 0);
  // a grace period after clock-in, and never more than the tier's max at once
  const busy = new WormSwarm(TIERS[3], () => 0);
  assert.equal(busy.tick(WORM_GRACE_MS - 1), null);
  for (let ms = 0; ms < 60e3; ms += 250) busy.tick(250);
  assert.equal(busy.worms.length, TIERS[3].wormMax);
  // bigger worms cover more
  const cover = TIERS.slice(1).map((t) => { const s = new WormSwarm(t, () => 0.5); s.spawn(); return s.cover(); });
  for (let k = 1; k < cover.length; k++) assert.ok(cover[k] > cover[k - 1]);
});

test('the bowie knife cuts a worm off and clears the view', () => {
  const s = new WormSwarm(TIERS[4], () => 0.5);
  const a = s.spawn(), b = s.spawn();
  assert.ok(s.cover() > 0);
  assert.equal(s.slash(b.id).id, b.id, 'tap or swipe cuts the one you hit');
  assert.deepEqual(s.worms.map((w) => w.id), [a.id]);
  assert.equal(s.slash().id, a.id, 'the knife button takes the oldest');
  assert.equal(s.worms.length, 0); assert.equal(s.cover(), 0); assert.equal(s.cuts, 2);
  assert.equal(s.slash(), null, 'nothing left to cut'); assert.equal(s.slash(999), null);
});

function fixture(t, tier, { payout = 20000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-tiers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-12T19:00:00Z') };
  const store = new Store(dir), accounts = new Accounts({ store, now: () => clock.now });
  const mines = new Mines({ store, accounts, now: () => clock.now, randInt: (n) => (n === 100000 ? payout : 0), scareInt: (n) => n - 1, poolInt: () => 5000,
    ...(tier !== undefined ? { layout: (now) => dailyLayout(mineDay(now), tier) } : {}) });
  const players = ['ann', 'bob'].map((id) => { const p = store.players[id] = { id, name: id }; accounts.ensure(p); return p; });
  const wet = (p) => {
    let s = mines.start(p, V2);
    while (s.pools.find((x) => x.id === s.currentPoolId).quantity === null) { clock.now = Math.max(clock.now, s.readyAt); s = mines.probe(p, s.shiftId, { ...V2, poolId: s.currentPoolId }); }
    return s;
  };
  const fill = (p, s) => {
    mines.extract(p, s.shiftId, { ...V2, poolId: s.currentPoolId, action: 'start' });
    for (let i = 0; i < 400 && !s.result; i++) { clock.now += 500; s = mines.extract(p, s.shiftId, { ...V2, poolId: s.currentPoolId, action: 'continue' }); }
    return s;
  };
  return { clock, mines, players, wet, fill };
}

test('everyone on shift the same day gets the same tier, size and cave-ins; the office shows it before clock-in', (t) => {
  const f = fixture(t);
  const day = dailyLayout('2026-11-12');
  const office = f.mines.office(f.players[0]);
  assert.deepEqual(office.today, { day: '2026-11-12', tier: day.tier, cells: day.cells, pay: tierInfo(day.tier).pay });
  const a = f.mines.start(f.players[0], V2); f.clock.now += 3600e3;
  const b = f.mines.start(f.players[1], V2);
  assert.equal(a.tier, day.tier); assert.equal(b.tier, day.tier); assert.equal(a.cells, tierInfo(day.tier).cells);
  assert.deepEqual(a.pools.map((p) => [p.x, p.y]), b.pools.map((p) => [p.x, p.y]));
  assert.deepEqual(shiftMaze(a).grid, shiftMaze(b).grid);
});

test('acid you reach is minable on every tier, and harder days pay more for ordinary acid', (t) => {
  const paid = [];
  for (const tt of TIERS) {
    const f = fixture(t, tt.tier);
    const s = f.wet(f.players[0]);
    assert.equal(s.tier, tt.tier);
    assert.ok(s.pools.find((p) => p.id === s.currentPoolId).remaining > 0, 'the acid is in');
    const end = f.fill(f.players[0], s); // no 425, no 409: in reach and in means minable
    assert.ok(end.result, `tier ${tt.tier} settled`);
    paid.push(end.result.amount);
    assert.equal(end.result.amount, Math.round(80 * tt.pay * 100) / 100);
    if (tt.pay > 1) assert.equal(end.result.hazard, tt.pay); else assert.equal(end.result.hazard, undefined);
  }
  for (let k = 1; k < paid.length; k++) assert.ok(paid[k] > paid[k - 1]);
});

test('hazard pay is for acid only: mud stays pity money and the rare finds stay fixed', (t) => {
  const mud = fixture(t, 5, { payout: 80 }); // rolls 0..79 are the rare finds, 80 is the first mud roll (OUTCOMES order)
  const m = mud.fill(mud.players[0], mud.wet(mud.players[0]));
  assert.equal(m.result.outcome, 'dud'); assert.equal(m.result.amount, 10); assert.equal(m.result.hazard, undefined);
  const lode = fixture(t, 5, { payout: 0 });
  const l = lode.fill(lode.players[0], lode.wet(lode.players[0]));
  assert.equal(l.result.outcome, 'motherlode'); assert.equal(l.result.amount, 10000);
});

test('a shift keeps its tier past midnight, and one dug before tiers keeps the plain maze and pay', (t) => {
  const f = fixture(t);
  f.clock.now = Date.parse('2026-11-13T06:50:00Z'); // 11:50 pm in Denver
  const a = f.mines.start(f.players[0], V2);
  f.clock.now += 20 * 60e3;
  const resumed = f.mines.start(f.players[0], V2);
  assert.equal(resumed.tier, a.tier); assert.equal(resumed.day, '2026-11-12');
  // an old save: no tier, no hazard
  const legacy = { ...f.mines.doc.active.ann }; delete legacy.tier; delete legacy.hazard;
  f.mines.doc.active.ann = legacy;
  const view = f.mines.start(f.players[0], V2);
  assert.equal(view.tier, undefined);
  assert.deepEqual(shiftMaze(view).grid, makeMaze(view.seed, view.cells, FIRST_POOL_STEPS[view.cells]).grid);
});

test('the pool chain still has enough acid spots on every tier', () => {
  for (const t of TIERS) for (let i = 0; i < 40; i++) {
    const { chain, maze, seed } = dailyMine(mineDay(NOON_UTC + i * DAY), t.tier);
    assert.ok(chain.length >= 5, `tier ${t.tier}: ${chain.length} pools`);
    assert.deepEqual(bucketChain(maze, seed).map((p) => [p.x, p.y]), chain.map((p) => [p.x, p.y]));
  }
});

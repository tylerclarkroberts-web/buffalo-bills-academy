// The daily mine: one maze and one set of acid spots per Mountain-time day, the same for everyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines, MIN_SHIFT_MS } from '../server/mines.js';
import { mineDay, daySeed, dailyLayout, dailyMine, DAY_CELL_MIX, MIN_DAY_POOLS } from '../server/engine/daily-maze.js';
import { distFrom, makeMaze, bucketChain, FIRST_POOL_STEPS } from '../server/engine/maze.js';

// Walking the first leg at full speed (2.2 m tiles at 3.6 m/s) plus a couple of seconds of turning, never before
// the server's 20 s floor: about when a good miner can first see acid.
const walkMs = (steps) => Math.max(MIN_SHIFT_MS, steps * (2.2 / 3.6) * 1000 + 2000);

const DAY = 86400e3;
const NOON_UTC = Date.parse('2026-01-01T19:00:00Z'); // noon in Denver

test('mine days roll over at midnight in Denver, through both daylight-saving changes', () => {
  assert.equal(mineDay(Date.parse('2026-11-13T06:59:59Z')), '2026-11-12'); // 11:59:59 pm MST
  assert.equal(mineDay(Date.parse('2026-11-13T07:00:00Z')), '2026-11-13');
  assert.equal(mineDay(Date.parse('2026-07-04T05:59:59Z')), '2026-07-03'); // 11:59:59 pm MDT
  assert.equal(mineDay(Date.parse('2026-07-04T06:00:00Z')), '2026-07-04');
  assert.equal(mineDay(Date.parse('2026-03-08T08:30:00Z')), '2026-03-08'); // the spring-forward night
  assert.equal(mineDay(Date.parse('2026-11-01T08:30:00Z')), '2026-11-01'); // the fall-back night
});

test('the day decides the seed: same day same maze, a new day a new one', () => {
  assert.equal(daySeed('2026-11-12'), daySeed('2026-11-12'));
  assert.deepEqual(dailyLayout('2026-11-12'), dailyLayout('2026-11-12'));
  const seeds = new Set();
  for (let i = 0; i < 400; i++) seeds.add(daySeed(mineDay(NOON_UTC + i * DAY)));
  assert.ok(seeds.size >= 399, 'a year of days should not repeat seeds');
  for (const s of seeds) assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 31);
  const a = dailyMine('2026-11-12'), b = dailyMine('2026-11-13');
  assert.notDeepEqual(a.maze.grid.map(String), b.maze.grid.map(String).concat(a.cells === b.cells ? [] : ['size']));
});

test('every day for two years: every acid spot is reachable, and the maze-size mix matches the old vein', () => {
  const counts = { 7: 0, 9: 0, 11: 0 }; let quick = 0;
  const N = 730;
  for (let i = 0; i < N; i++) {
    const day = mineDay(NOON_UTC + i * DAY), { cells, maze, chain } = dailyMine(day);
    counts[cells]++;
    const fromStart = distFrom(maze.grid, maze.start.x, maze.start.y);
    assert.ok(chain.length >= MIN_DAY_POOLS, `${day}: only ${chain.length} acid spots`);
    for (const p of chain) assert.ok(fromStart[p.y][p.x] > 0, `${day}: pool ${p.x},${p.y} unreachable`);
    assert.equal(new Set(chain.map((p) => `${p.x},${p.y}`)).size, chain.length, `${day}: two pools on one tile`);
    for (let k = 1; k < chain.length; k++) assert.ok(chain.legs[k] > 0);
    if (walkMs(chain.legs[0]) < 30000) quick++;
  }
  for (const [cells, w] of DAY_CELL_MIX) assert.ok(Math.abs(counts[cells] / N - w / 100) < 0.06, `${cells}-cell days: ${counts[cells]}/${N}`);
  // The share of first finds inside 30 s matches what random per-shift mazes gave (same size mix, any seed).
  let expected = 0;
  for (const [cells, w] of DAY_CELL_MIX) {
    let q = 0; for (let seed = 1; seed <= 300; seed++) { const m = makeMaze(seed * 7919, cells, FIRST_POOL_STEPS[cells]); if (walkMs(bucketChain(m, seed * 7919).legs[0]) < 30000) q++; }
    expected += (w / 100) * (q / 300);
  }
  assert.ok(Math.abs(quick / N - expected) < 0.08, `quick-first-find days ${quick}/${N} vs per-shift ${expected.toFixed(2)}`);
  assert.ok(quick / N >= 0.25, 'at least a quarter of days still allow acid inside 30 s');
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-daily-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-12T19:00:00Z') };
  const store = new Store(dir), accounts = new Accounts({ store, now: () => clock.now });
  let roll = 0;
  const mines = new Mines({ store, accounts, now: () => clock.now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => (roll += 7919) % 100000 });
  const players = ['ann', 'bob', 'cat'].map((id) => { const p = store.players[id] = { id, name: id }; accounts.ensure(p); return p; });
  return { clock, mines, players };
}

test('two miners clocking in the same day get the same maze and the same acid spots (their own fill rolls)', (t) => {
  const f = fixture(t);
  const a = f.mines.start(f.players[0], { rulesVersion: 2 });
  f.clock.now += 3 * 3600e3;
  const b = f.mines.start(f.players[1], { rulesVersion: 2 });
  assert.equal(a.day, '2026-11-12'); assert.equal(b.day, a.day);
  assert.equal(a.seed, b.seed); assert.equal(a.cells, b.cells);
  assert.deepEqual(a.pools.map(({ id, x, y }) => [id, x, y]), b.pools.map(({ id, x, y }) => [id, x, y]));
  const layout = dailyLayout(a.day);
  assert.equal(a.seed, layout.seed); assert.equal(a.cells, layout.cells);
  // The day after (past Denver midnight), a new layout.
  f.clock.now = Date.parse('2026-11-13T08:00:00Z');
  const c = f.mines.start(f.players[2], { rulesVersion: 2 });
  assert.equal(c.day, '2026-11-13');
  assert.notEqual(c.seed, a.seed);
  // How much each pool holds is still each miner's own roll, decided at clock-in and hidden until inspected.
  const raw = (id) => f.mines.doc.active[id].pools.map((p) => p.roll);
  assert.notDeepEqual(raw('ann'), raw('bob'));
  assert.ok(a.pools.every((p) => p.quantity === null));
});

test('a shift that started yesterday keeps yesterday\'s maze after midnight', (t) => {
  const f = fixture(t);
  f.clock.now = Date.parse('2026-11-13T06:50:00Z'); // 11:50 pm in Denver
  const a = f.mines.start(f.players[0], { rulesVersion: 2 });
  f.clock.now += 20 * 60e3; // 12:10 am
  const resumed = f.mines.start(f.players[0], { rulesVersion: 2 });
  assert.equal(resumed.shiftId, a.shiftId);
  assert.equal(resumed.seed, a.seed); assert.equal(resumed.day, '2026-11-12');
});

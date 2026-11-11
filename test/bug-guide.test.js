import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { makeMaze, FIRST_POOL_STEPS } from '../client/src/mines/maze.js';
import { BugGuide, pathBetween, stepToward } from '../client/src/mines/bugGuide.js';
import { bfs, tileOf, TILE } from '../client/src/mines/stalker.js';
import { createApp } from '../server/app.js';

const G = [
  '#########',
  '#.......#',
  '###.#####',
  '###.#####',
  '###.#####',
  '#.......#',
  '#########',
].map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));

async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-bugguide-'));
  const clock = { t: 1_700_000_000_000 };
  const r = createApp({
    dataDir, now: () => clock.t, devLogin: true,
    env: { BARN_INCUBATE_MS: 1, BARN_TEST_EGG: '1', ...env },
    vein: () => ({ veinMs: 20000, cells: 7 }),
    scareInt: () => 99, // no visitor
    randInt: (n) => (n === 100000 ? 50000 : 0),
  });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); };
  return { base, clock, stop, service: r };
}
async function login(base, email) {
  const r = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Guide', email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const req = async (m, u, b) => {
    const x = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    return { status: x.status, body: await x.json() };
  };
  return { post: (u, b) => req('POST', u, b || {}), get: (u) => req('GET', u) };
}

test('pathBetween walks open tiles from start to pool', () => {
  const path = pathBetween(G, 1, 1, 7, 1);
  assert.ok(path.length >= 7);
  assert.deepEqual(path[0], [1, 1]);
  assert.deepEqual(path.at(-1), [7, 1]);
  for (const [x, y] of path) assert.equal(G[y][x], 0);
});

test('stepToward descends the BFS distance field', () => {
  const dist = bfs(G, 7, 1);
  assert.deepEqual(stepToward(dist, 1, 1), [2, 1]);
  assert.deepEqual(stepToward(dist, 7, 1), [7, 1]);
});

test('BugGuide appears after delay, leads toward pool, waits when player lags', () => {
  const maze = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };
  const g = new BugGuide(maze, { armed: true, afterMs: 1000, bug: { species: 'candela', name: 'Pip' } });
  const p0 = { t: 0, x: 1 * TILE, z: 1 * TILE, yaw: 0, elapsedMs: 500 };
  g.update(0.05, p0);
  assert.equal(g.state, 'dormant');
  g.update(0.05, { ...p0, elapsedMs: 1100 });
  assert.equal(g.state, 'guiding');
  assert.equal(g.events.shift(), 'appear');
  for (let i = 0; i < 400; i++) g.update(0.05, { t: i * 0.05, x: 1 * TILE, z: 1 * TILE, yaw: 0, elapsedMs: 1100 + i * 50 });
  assert.equal(g.waiting, true, 'waits when the miner stays at the entrance');
  const [bx] = tileOf(g.x, g.z);
  assert.ok(bx > 1, 'moved some of the way toward the pool before waiting');
  const [bx0] = tileOf(g.x, g.z);
  for (let i = 0; i < 120; i++) g.update(0.05, { t: 20 + i * 0.05, x: g.x, z: g.z, yaw: 0, elapsedMs: 5000 + i * 50 });
  const [bx1] = tileOf(g.x, g.z);
  assert.ok(bx1 > bx0 || (bx1 === 7), `resumed after catch-up (${bx0} → ${bx1})`);
});

test('BugGuide stays dormant without a living bug', () => {
  const maze = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };
  const g = new BugGuide(maze, { armed: false, bug: null });
  g.update(0.05, { t: 0, x: TILE, z: TILE, yaw: 0, elapsedMs: 99999 });
  assert.equal(g.state, 'dormant');
  assert.equal(g.present, false);
});

const V2 = { rulesVersion: 2 }; // bucket shifts: every mine request names the rules it speaks
test('clock-in includes bug only when the barn holds a living creature', async () => {
  // Fresh player, forceEgg so the first shift also lays an egg; incubate 1ms so we can hatch.
  const s = await boot({ BARN_INCUBATE_MS: '1', BARN_TEST_EGG: '1' });
  try {
    const a = await login(s.base, 'guide-a@test');
    const start1 = await a.post('/api/mines/start', V2);
    assert.equal(start1.status, 200);
    // First clock-in: no living creature yet (egg may be on the floor).
    assert.equal(start1.body.bug, undefined);
    if (start1.body.egg) {
      const egg = await a.post('/api/mines/egg', { shiftId: start1.body.shiftId });
      assert.equal(egg.status, 200);
    }
    s.clock.t += 50; // hatch while still on shift
    // Draw a little acid before clocking out: an empty bucket earns a Foreman's lecture, which blocks the next clock-in.
    let shift = start1.body;
    for (let k = 0; !shift.pools.find((p) => p.id === shift.currentPoolId)?.remaining && k < 400; k++) {
      s.clock.t = Math.max(s.clock.t + 2500, shift.readyAt || 0);
      shift = (await a.post('/api/mines/probe', { ...V2, shiftId: shift.shiftId, poolId: shift.currentPoolId })).body;
    }
    const poolId = shift.currentPoolId;
    await a.post('/api/mines/extract', { ...V2, shiftId: shift.shiftId, poolId, action: 'start' });
    s.clock.t += 1000;
    const drawn = await a.post('/api/mines/extract', { ...V2, shiftId: shift.shiftId, poolId, action: 'stop' });
    const done1 = drawn.body.result ? drawn : await a.post('/api/mines/quit', { ...V2, shiftId: shift.shiftId });
    assert.equal(done1.status, 200, JSON.stringify(done1.body));
    const barn = await a.get('/api/barn');
    assert.equal(barn.body.pen?.stage, 'creature', JSON.stringify(barn.body.pen));
    const start2 = await a.post('/api/mines/start', { ...V2, afterShiftId: shift.shiftId }); // acknowledges the last pay slip
    assert.equal(start2.status, 200, JSON.stringify(start2.body));
    assert.ok(start2.body.bug, 'living barn bug rides along on clock-in');
    assert.equal(start2.body.bug.species, barn.body.pen.species);
    assert.equal(start2.body.bug.name, barn.body.pen.name);
    s.clock.t += 25_000;
    await a.post('/api/mines/quit', { ...V2, shiftId: start2.body.shiftId });
  } finally { await s.stop(); }
});

test('BugGuide reaches the pool on a real maze seed', () => {
  const maze = makeMaze(42, 7, FIRST_POOL_STEPS[7]);
  const g = new BugGuide(maze, { armed: true, afterMs: 0, bug: { species: 'x', name: 'X' } });
  g.update(0.01, { t: 0, x: maze.start.x * TILE, z: maze.start.y * TILE, yaw: 0, elapsedMs: 1 });
  assert.equal(g.state, 'guiding');
  for (let i = 0; i < 2000; i++) {
    g.update(0.05, { t: i * 0.05, x: g.x, z: g.z, yaw: 0, elapsedMs: 1 + i * 50 });
    const [tx, ty] = tileOf(g.x, g.z);
    if (tx === maze.pool.x && ty === maze.pool.y) break;
  }
  const [tx, ty] = tileOf(g.x, g.z);
  assert.equal(tx, maze.pool.x);
  assert.equal(ty, maze.pool.y);
});

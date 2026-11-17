import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { BugGuide, pathBetween, stepToward } from '../client/src/mines/bugGuide.js';
import { WALK_SPEED } from '../client/src/mines/controls.js';
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

test('orders: come to heel, lead to the lift, lead to the nearest other miner, and back to the acid', () => {
  const guide = new BugGuide({ grid: G, pool: { x: 7, y: 5 }, start: { x: 1, y: 1 } }, { armed: true, afterMs: 0, bug: { species: 'lamprima' } });
  const at = (x, y) => ({ t: 0, x: x * TILE, z: y * TILE, yaw: 0, elapsedMs: 1 });
  const run = (p, secs = 12) => { for (let i = 0; i < secs * 20; i++) guide.update(0.05, p); return tileOf(guide.x, guide.z); };
  assert.equal(guide.order('dance'), false, 'only the four it knows');
  assert.equal(guide.order('someone'), false, 'nobody else down here');
  assert.deepEqual(guide.events.splice(0), ['nobody']);
  // The miner waits in the top corridor; left to itself the bug heads for the acid and stops a few tiles ahead.
  run(at(2, 1), 4);
  const [ax, ay] = tileOf(guide.x, guide.z);
  assert.ok(bfs(G, 2, 1)[ay][ax] >= 2, 'it went on ahead');
  assert.equal(guide.order('come'), true);
  const [cx, cy] = run(at(2, 1));
  assert.ok(bfs(G, 2, 1)[cy][cx] <= 1 && guide.waiting, 'beside its miner, and staying');
  // Someone is at the far end of the bottom corridor: it leads there, waiting for its miner on the way.
  guide.setOthers([{ x: 1.2, y: 5.1 }]);
  assert.equal(guide.order('someone'), true);
  assert.deepEqual(guide.goal(2, 1), { x: 1, y: 5 });
  assert.deepEqual(run(at(1, 5), 30), [1, 5]); // the miner goes too; it is there when they arrive
  guide.setOthers([]); guide.update(0.05, at(1, 5));
  assert.deepEqual([guide.events.includes('nobody'), guide.mode], [true, 'come'], 'they clocked out: back to heel');
  assert.equal(guide.order('lift'), true);
  assert.deepEqual(run(at(1, 1), 30), [1, 1]);
  // Told to find acid it has already found, it settles until the vein moves.
  guide.acidFound(); assert.equal(guide.present, true, 'still on its errand');
  guide.order('acid'); assert.equal(guide.present, false);
  guide.setPool({ x: 1, y: 5 }); assert.equal(guide.present, true);
});

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

test('the guide matches walking speed when leading nearby, farther ahead, or catching up', () => {
  const maze = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };
  for (const [bugX, playerX] of [[2, 1], [3, 1], [4, 1], [1, 4]]) {
    const g = new BugGuide(maze, { armed: true, afterMs: 0, bug: { species: 'candela' } });
    const player = { x: playerX * TILE, z: TILE, elapsedMs: 1 };
    g.appear(player); g.x = bugX * TILE; g.z = TILE;
    g.update(.05, player);
    assert.ok(Math.abs(g.x - bugX * TILE - WALK_SPEED * .05) < 1e-9, `bug at ${bugX}, player at ${playerX}`);
    assert.equal(g.z, TILE);
  }
});

test('a walking miner keeps a constant gap to the guide down a straight tunnel', () => {
  const grid = [Array(23).fill(1), [1, ...Array(21).fill(0), 1], Array(23).fill(1)];
  const g = new BugGuide({ grid, pool: { x: 21, y: 1 }, start: { x: 1, y: 1 } }, { armed: true, afterMs: 0, bug: { species: 'candela' } });
  const player = { x: TILE, z: TILE, elapsedMs: 1 };
  g.appear(player); const gap = g.x - player.x;
  for (let i = 0; i < 60; i++) {
    player.x += WALK_SPEED * .05;
    g.update(.05, player);
    assert.ok(Math.abs(g.x - player.x - gap) < 1e-9, `constant lead after frame ${i}`);
  }
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

test('BugGuide retargets to the next acid after the current one is collected', () => {
  const maze = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };
  const g = new BugGuide(maze, { armed: true, afterMs: 0, bug: { species: 'candela', name: 'Pip' } });
  const follow = (fromX, fromZ, destX, destY) => {
    let x = fromX, z = fromZ;
    for (let i = 0; i < 2000; i++) {
      g.update(0.05, { t: i * 0.05, x, z, yaw: 0, elapsedMs: 1 + i * 50 });
      const [tx, ty] = tileOf(g.x, g.z);
      // stay on the bug's heels so it does not pause waiting for the miner
      x = g.x; z = g.z;
      if (tx === destX && ty === destY) return true;
    }
    return false;
  };
  g.update(0.01, { t: 0, x: TILE, z: TILE, yaw: 0, elapsedMs: 1 });
  assert.equal(g.state, 'guiding');
  assert.equal(follow(TILE, TILE, 7, 1), true, 'reaches the first acid');
  g.acidFound();
  assert.equal(g.state, 'done');
  assert.equal(g.events.includes('done'), true);
  const [atX, atZ] = [g.x, g.z];
  // A later pulse with no new pool must not wake the guide (mining the current hole).
  g.setPool({ x: 7, y: 1 });
  assert.equal(g.state, 'done', 'same pool does not resume the guide');
  g.setPool({ x: 1, y: 5 });
  assert.equal(g.state, 'guiding', 'a new remaining acid wakes the guide');
  assert.equal(g.events.at(-1), 'retarget');
  assert.equal(follow(atX, atZ, 1, 5), true, 'leads on to the next acid');
});


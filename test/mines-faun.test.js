// The mines faun: 20% of shifts, never with the visitor, solid, follows, and cannot trap the miner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines, rollScare, SCARE_CHANCE, FAUN_CHANCE } from '../server/mines.js';
import { FaunFollower, bfsAvoiding, APPEAR_AFTER_MS, FOLLOW_GAP, YIELD_S, PASS_S, BODY_RADIUS } from '../client/src/mines/faunFollower.js';
import { tileOf, TILE } from '../client/src/mines/stalker.js';
import { buildFaun } from '../client/src/mines/faunMesh.js';

test('encounter roll is 28% visitor, 20% faun, and never both', () => {
  let scare = 0, faun = 0, both = 0, neither = 0;
  for (let r = 0; r < 100000; r++) {
    const out = rollScare(() => r);
    if (out.scare && out.faun) both++;
    else if (out.scare) scare++;
    else if (out.faun) faun++;
    else neither++;
  }
  assert.equal(scare, SCARE_CHANCE);
  assert.equal(faun, FAUN_CHANCE);
  assert.equal(both, 0);
  assert.equal(scare + faun + neither, 100000);
  assert.deepEqual(rollScare(() => 0), { scare: true, faun: false });
  assert.deepEqual(rollScare(() => SCARE_CHANCE), { scare: false, faun: true });
  assert.deepEqual(rollScare(() => 99999), { scare: false, faun: false });
});

function minesFixture(t, scareInt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-faun-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  const accounts = new Accounts({ store, now: () => clock.now });
  const mines = new Mines({
    store, accounts, now: () => clock.now,
    randInt: (n) => (n === 100000 ? 50000 : 0),
    scareInt, vein: () => ({ veinMs: 60000, cells: 7 }),
  });
  const player = store.players.miner = { id: 'miner', name: 'Miner' };
  accounts.ensure(player);
  return { mines, player, start: () => mines.start(player, { rulesVersion: 2 }) };
}

test('clock-in sends faun on a faun roll and never with the visitor', (t) => {
  const faunShift = minesFixture(t, () => SCARE_CHANCE).start();
  assert.equal(faunShift.faun, true);
  assert.equal(faunShift.scare, null);

  const scareShift = minesFixture(t, () => 0).start();
  assert.ok(scareShift.scare);
  assert.equal(scareShift.faun, undefined);

  const quiet = minesFixture(t, (n) => n - 1).start();
  assert.equal(quiet.scare, null);
  assert.equal(quiet.faun, undefined);
});

// A one-wide north-south corridor ending in a dead end at (3,5), with a cross passage at (3,1).
const G = [
  '#########',
  '#.......#',
  '###.#####',
  '###.#####',
  '###.#####',
  '###.#####',
  '#########',
].map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
const MAZE = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };
const at = (tx, ty) => ({ x: tx * TILE, z: ty * TILE });

function feed(fn, p, dt = 1 / 60, frames = 1) {
  for (let i = 0; i < frames; i++) fn.update(dt, { t: i * dt, yaw: 0, elapsedMs: APPEAR_AFTER_MS + 500, pushing: false, ...p });
}

test('an unarmed faun never appears; an armed one trots in after the delay and bleats', () => {
  const off = new FaunFollower(MAZE, { armed: false });
  feed(off, { ...at(1, 1), elapsedMs: 99999 });
  assert.equal(off.state, 'off');
  assert.equal(off.blocks(off.x, off.z, 0.38), false);

  const fn = new FaunFollower(MAZE, { armed: true, afterMs: APPEAR_AFTER_MS, rand: () => 0 });
  fn.update(0.05, { t: 0, ...at(1, 1), yaw: -Math.PI / 2, elapsedMs: 500, pushing: false });
  assert.equal(fn.state, 'dormant');
  fn.update(0.05, { t: 1, ...at(1, 1), yaw: -Math.PI / 2, elapsedMs: APPEAR_AFTER_MS + 10, pushing: false });
  assert.equal(fn.state, 'following');
  assert.deepEqual(fn.events.filter((e) => e === 'appear' || e === 'bleat').slice(0, 2), ['appear', 'bleat']);
  const [tx, ty] = tileOf(fn.x, fn.z);
  assert.equal(G[ty][tx], 0, 'spawns on open tunnel');
  assert.ok(Math.abs(tx - MAZE.pool.x) + Math.abs(ty - MAZE.pool.y) > 1, 'not on the acid');
});

test('he is solid up close and you can stand beside him out of his body', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.update(0.05, { t: 0, ...at(1, 1), yaw: -Math.PI / 2, elapsedMs: APPEAR_AFTER_MS + 10, pushing: false });
  assert.equal(fn.blocks(fn.x, fn.z, 0.38), true);
  assert.equal(fn.blocks(fn.x + BODY_RADIUS + 0.38 + 0.05, fn.z, 0.38), false);
});

test('he follows the miner and stops a short distance away', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.update(0.05, { t: 0, ...at(1, 1), yaw: -Math.PI / 2, elapsedMs: APPEAR_AFTER_MS + 10, pushing: false });
  // Walk the miner down the top corridor, away from wherever he spawned.
  for (let i = 0; i < 240; i++) {
    const x = (1 + i * 0.03) * TILE;
    fn.update(1 / 60, { t: 1 + i / 60, x, z: 1 * TILE, yaw: -Math.PI / 2, elapsedMs: APPEAR_AFTER_MS + 1000 + i * 16, pushing: false });
  }
  const dist = Math.hypot(fn.x - 5 * TILE, fn.z - 1 * TILE);
  assert.ok(dist < FOLLOW_GAP + 1.2, `ended near the miner, dist=${dist.toFixed(2)}`);
  assert.ok(dist > FOLLOW_GAP - 0.6, 'did not close all the way into the miner');
});

test('in a one-wide dead end he steps back or lets the miner swap after a moment', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  // Place him by hand in the corridor, blocking the only way out of (3,5).
  fn.state = 'following'; fn.x = 3 * TILE; fn.z = 4 * TILE; fn.pass = 0;
  const p = { t: 10, x: 3 * TILE, z: 5 * TILE, yaw: 0, elapsedMs: 20000, pushing: true };
  assert.equal(fn.trapping(p.x, p.z), true, 'he is the only way out of the dead end');
  for (let i = 0; i < Math.ceil(YIELD_S / (1 / 60)) + 2; i++) fn.update(1 / 60, { ...p, t: 10 + i / 60 });
  assert.ok(fn.events.includes('yield'));
  const [tx, ty] = tileOf(fn.x, fn.z);
  assert.ok(!(tx === 3 && ty === 4) || fn.pass > 0, 'left the blocking tile or went passable');
  // After the yield, the dead-end tile's exit is open enough for the miner to leave.
  assert.equal(fn.trapping(p.x, p.z) && fn.pass <= 0 && tileOf(fn.x, fn.z).join(',') === '3,4', false);
  const exitOpen = !fn.blocks(3 * TILE, 4 * TILE, 0.38);
  assert.equal(exitOpen, true, 'the miner can walk out of the dead end');
});

test('if there is no tile to step onto he briefly stops being solid so the miner can swap', () => {
  // A two-tile alcove: only (1,1) and (1,2) are open.
  const tight = [
    '#####',
    '#.###',
    '#.###',
    '#####',
  ].map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
  const maze = { grid: tight, pool: { x: 1, y: 1 }, start: { x: 1, y: 2 } };
  const fn = new FaunFollower(maze, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 1 * TILE; fn.z = 1 * TILE; fn.pool = { x: 1, y: 1 };
  const p = { t: 10, x: 1 * TILE, z: 2 * TILE, yaw: 0, elapsedMs: 20000, pushing: true };
  for (let i = 0; i < Math.ceil(YIELD_S / (1 / 60)) + 2; i++) fn.update(1 / 60, { ...p, t: 10 + i / 60 });
  assert.ok(fn.events.includes('yield'));
  assert.ok(fn.pass > 0 || !fn.blocks(p.x, p.z - 0.5, 0.38), 'swap window or he has moved off the only exit');
  // During pass-through the body is not solid.
  fn.pass = PASS_S;
  assert.equal(fn.blocks(fn.x, fn.z, 0.38), false);
});

test('a faun standing on the acid steps off so the pool stays reachable', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 7 * TILE; fn.z = 1 * TILE; fn.pool = { x: 7, y: 1 };
  fn.update(1 / 60, { t: 10, x: 5 * TILE, z: 1 * TILE, yaw: -Math.PI / 2, elapsedMs: 20000, pushing: false });
  const [tx, ty] = tileOf(fn.x, fn.z);
  assert.ok(!(tx === 7 && ty === 1), `stepped off the pool onto ${tx},${ty}`);
});

test('bfsAvoiding treats the faun tile as a wall', () => {
  const clear = bfsAvoiding(G, 3, 5, -1, -1);
  const blocked = bfsAvoiding(G, 3, 5, 3, 3);
  assert.ok(clear[1][3] >= 0);
  assert.equal(blocked[1][3], -1);
  assert.ok(blocked[5][3] === 0);
});

test('the faun mesh is a low-poly figure with scarf, parcels, umbrella and goat legs', () => {
  const m = buildFaun();
  assert.ok(m.group);
  assert.ok(m.head && m.leftLeg && m.rightLeg && m.parcels && m.umbrella);
  assert.ok(m.mats.length >= 10);
  assert.equal(m.group.visible, false);
  let meshes = 0;
  m.group.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes >= 30, `expected a full papercraft figure, got ${meshes} meshes`);
});

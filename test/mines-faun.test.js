// The mines faun: 20% of shifts, never with the visitor, lingers between visits and steps aside for the miner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines, rollScare, SCARE_CHANCE, FAUN_CHANCE } from '../server/mines.js';
import { FaunFollower, APPEAR_AFTER_MS, FOLLOW_GAP, BODY_RADIUS, MOON_SECONDS, MOON_MIN_S } from '../client/src/mines/faunFollower.js';
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

test('bleats leave a quiet stretch and a distant faun stays inaudible', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  feed(fn, at(1, 1));
  fn.events.length = 0;
  feed(fn, at(1, 1), .05, 200);
  assert.ok(!fn.events.includes('bleat'));
  feed(fn, at(1, 1), .05, 50);
  assert.ok(fn.events.includes('bleat'));
  fn.events.length = 0; fn.nextBleat = 0;
  feed(fn, { x: 3 * TILE, z: 5 * TILE + .4 });
  assert.ok(!fn.events.includes('bleat'));
});

test('he is solid up close and you can stand beside him out of his body', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.update(0.05, { t: 0, ...at(1, 1), yaw: -Math.PI / 2, elapsedMs: APPEAR_AFTER_MS + 10, pushing: false });
  assert.equal(fn.blocks(fn.x, fn.z, 0.38), true);
  assert.equal(fn.blocks(fn.x + BODY_RADIUS + 0.38 + 0.05, fn.z, 0.38), false);
});

test('he lets the miner explore nearby, catches up at a distance, and lingers again', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = TILE; fn.z = TILE;
  for (const x of [3, 4, 3, 2, 5]) feed(fn, at(x, 1), .05, 40);
  assert.equal(fn.x, TILE);
  assert.equal(fn.facing, 0, 'small movements do not make him turn to track the miner');

  feed(fn, at(7, 1), .05, 150);
  const stopped = fn.x;
  assert.ok(Math.abs(7 * TILE - stopped - FOLLOW_GAP) < 1e-6);
  feed(fn, { x: 7 * TILE + .4, z: TILE }, .05, 40);
  assert.equal(fn.x, stopped, 'stays put as the miner moves off again');
});

test('he steps toward the wall before contact and stays aside for a slow walk out of a dead end', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 3 * TILE; fn.z = 4 * TILE;
  let z = 5 * TILE;
  for (let i = 0; i < 160; i++) {
    z -= .025;
    assert.equal(fn.blocks(3 * TILE, z, .38), false, 'centre of the passage stays walkable');
    feed(fn, { x: 3 * TILE, z }, .05);
    if (i === 32) {
      const offset = Math.abs(fn.x - 3 * TILE);
      assert.ok(offset > 0 && offset < TILE / 2, 'visible sidestep stays inside the tunnel');
      feed(fn, { x: 3 * TILE, z }, .05, 80); // stop partway through the pass
    }
  }
  assert.deepEqual(fn.events.filter(e => e === 'yield'), ['yield']);
  assert.equal(fn.z, 4 * TILE, 'no retreat down the middle of the same tunnel');
  assert.ok(Math.abs(fn.x - 3 * TILE) > .6);
  assert.equal(fn.blocks(fn.x, fn.z, .38), false, 'can turn around and walk right back');
});

test('he yields even in a two-tile alcove with the pool at his feet', () => {
  const tight = ['####', '#.##', '#.##', '####'].map(r => [...r].map(c => c === '#' ? 1 : 0));
  const fn = new FaunFollower({ grid: tight, pool: { x: 1, y: 1 } }, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = TILE; fn.z = TILE;
  feed(fn, at(1, 2), .05, 40);
  assert.equal(fn.blocks(TILE, TILE, .38), false);
  assert.equal(fn.z, TILE, 'does not swap onto the miner');
});

test('a faun standing on the acid steps off so the pool stays reachable', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 7 * TILE; fn.z = 1 * TILE; fn.pool = { x: 7, y: 1 };
  fn.update(1 / 60, { t: 10, x: 5 * TILE, z: 1 * TILE, yaw: -Math.PI / 2, elapsedMs: 20000, pushing: false });
  const [tx, ty] = tileOf(fn.x, fn.z);
  assert.ok(!(tx === 7 && ty === 1), `stepped off the pool onto ${tx},${ty}`);
});

test('the faun only moons occasionally while idle, then returns to his normal pose', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 3 * TILE; fn.z = TILE;
  const p = { x: fn.x + 1.7, z: fn.z };
  feed(fn, p, .05, MOON_MIN_S * 20 - 1);
  assert.equal(fn.moonLeft, 0, 'no gag immediately after arrival');
  feed(fn, p, .1);
  assert.equal(fn.moonLeft, MOON_SECONDS);
  feed(fn, p, .05, 12);
  assert.equal(fn.moon, 1, 'turns around and briefly holds the pose');
  assert.equal(fn.x, 3 * TILE); assert.equal(fn.z, TILE);
  assert.equal(fn.blocks(fn.x, fn.z, .38), true, 'gag does not change collision rules');
  feed(fn, p, .05, MOON_SECONDS * 20);
  assert.equal(fn.moon, 0);
  assert.ok(fn.nextMoon > 10, 'cooldown prevents repeated mooning');
});

test('mooning waits for mining and ends immediately for movement, mining or yielding', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = 3 * TILE; fn.z = TILE; fn.nextMoon = 0;
  const p = { x: fn.x + 1.7, z: fn.z };
  feed(fn, { ...p, busy: true }, .05, 40);
  assert.equal(fn.moonLeft, 0);
  feed(fn, p, .05, 12); assert.equal(fn.moon, 1);
  feed(fn, { ...p, busy: true }); assert.equal(fn.moon, 0);
  fn.moonLeft = 2;
  feed(fn, { ...p, x: 7 * TILE + .25 });
  assert.equal(fn.moon, 0); assert.ok(fn.moving, 'follows a departing miner without waiting for the gag');
  fn.moonLeft = 2; fn.yieldTo(p);
  assert.equal(fn.moon, 0, 'steps aside immediately');
});

test('a faun that follows to his normal stopping distance can settle and moon', () => {
  const fn = new FaunFollower(MAZE, { armed: true, rand: () => 0 });
  fn.state = 'following'; fn.x = TILE; fn.z = TILE;
  let mooned = false;
  for (let i = 0; i < 600; i++) {
    feed(fn, at(7, 1), .05);
    mooned ||= fn.moon > 0;
  }
  assert.ok(mooned, 'rounding at the follow gap must not keep him walking in place');
  assert.equal(fn.moving, false);
  assert.ok(Math.abs(7 * TILE - fn.x - FOLLOW_GAP) < 1e-6);
});

test('the faun mesh is a low-poly figure with scarf, parcels, umbrella and goat legs', () => {
  const m = buildFaun();
  assert.ok(m.group);
  assert.ok(m.head && m.leftLeg && m.rightLeg && m.parcels && m.umbrella);
  assert.ok(m.mats.length >= 10);
  assert.equal(m.group.visible, false);
  let meshes = 0;
  m.group.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes > 0 && meshes <= 40, `articulated figure stays within 40 meshes, got ${meshes}`);
});

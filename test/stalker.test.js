// The thing in the Acid Mines tunnels: when it may appear, how it follows, and that the acid makes it go away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMaze, rng } from '../client/src/mines/maze.js';
import { Stalker, isCorner, fastCornerTurn, bfs, tileOf, TILE, SPAWN_AFTER_MS, MIN_GAP, PLAYER_SPEED, FAST_TURN_RAD } from '../client/src/mines/stalker.js';

// A hand-drawn bit of tunnel: an L-corner at (3,1), a long corridor down x=3, a junction at (3,5).
const G = [
  '#########',
  '#.......#',
  '###.#####',
  '###.#####',
  '###.#####',
  '#.......#',
  '###.#####',
  '###.#####',
  '#########',
].map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
const MAZE = { grid: G, pool: { x: 7, y: 5 } };
const at = (tx, ty) => [tx * TILE, ty * TILE];

// A player run through the corner at (3,1): walk east along row 1, then swing the view 90° and go south.
function cornerRun({ speed = PLAYER_SPEED, turnS = 0.35, turn = Math.PI / 2, t0 = 0 } = {}) {
  const out = []; const dt = 1 / 60;
  let [x, z] = at(1, 1); let yaw = -Math.PI / 2; let t = t0; // facing east (+x)
  while (x < 3 * TILE) { x = Math.min(3 * TILE, x + speed * dt); t += dt; out.push({ t, x, z, yaw }); }
  const steps = Math.round(turnS / dt);
  for (let i = 0; i < steps; i++) { yaw -= turn / steps; z += speed * dt * 0.9; t += dt; out.push({ t, x, z, yaw }); }
  for (let i = 0; i < 20; i++) { z += speed * dt; t += dt; out.push({ t, x, z, yaw }); }
  return out;
}

test('corners and junctions are recognised; straight corridors and dead ends are not', () => {
  assert.equal(isCorner(G, 3, 1), true, 'T-junction on the top row');
  assert.equal(isCorner(G, 3, 5), true, 'crossing');
  assert.equal(isCorner(G, 3, 3), false, 'straight corridor');
  assert.equal(isCorner(G, 1, 1), false, 'dead end');
  assert.equal(isCorner(G, 0, 0), false, 'rock');
});

test('a fast turn needs a corner, a big enough turn, inside 0.7 s, at a walking pace', () => {
  const fast = cornerRun();
  assert.equal(fastCornerTurn(G, fast.slice(0, fast.length - 15)), true, 'quick 90° swing at full speed through a corner');
  assert.equal(fastCornerTurn(G, cornerRun({ turnS: 1.6 }).slice(0, -15)), false, 'a slow, careful turn');
  assert.equal(fastCornerTurn(G, cornerRun({ speed: PLAYER_SPEED * 0.4 }).slice(0, -15)), false, 'creeping');
  assert.equal(fastCornerTurn(G, cornerRun({ turn: FAST_TURN_RAD * 0.7 }).slice(0, -15)), false, 'a small glance');
  // the same swing in the middle of a straight corridor
  const mid = cornerRun().map((s) => ({ ...s, x: s.x, z: s.z + 2 * TILE }));
  assert.equal(fastCornerTurn(G, mid.slice(0, mid.length - 15)), false, 'not at a corner');
});

function feed(st, run, elapsedAtStart) { const t0 = run[0].t; for (const s of run) st.update(1 / 60, { ...s, elapsedMs: elapsedAtStart + (s.t - t0) * 1000 }); }

test('it only appears on an armed shift, after 30 s, on a fast corner', () => {
  const unarmed = new Stalker(MAZE, { armed: false }); feed(unarmed, cornerRun(), 40000);
  assert.equal(unarmed.state, 'off');
  const early = new Stalker(MAZE, { armed: true }); feed(early, cornerRun(), 20000);
  assert.equal(early.state, 'dormant', 'fast corner at 20 s: too early');
  feed(early, cornerRun({ t0: 5, turnS: 1.8 }), SPAWN_AFTER_MS + 1000);
  assert.equal(early.state, 'dormant', 'after 30 s but a slow turn');
  feed(early, cornerRun({ t0: 10 }), SPAWN_AFTER_MS + 5000);
  assert.equal(early.state, 'stalking', 'after 30 s and a fast corner');
  assert.deepEqual(early.events, ['appear']);
  // it stands on open tunnel, a few tiles off, not by the pool
  const [tx, ty] = tileOf(early.x, early.z); const last = early.samples.at(-1);
  const d = bfs(G, ...tileOf(last.x, last.z));
  assert.equal(G[ty][tx], 0); assert.ok(d[ty][tx] >= 4, `spawned ${d[ty][tx]} tiles away`);
  assert.ok(Math.abs(tx - MAZE.pool.x) + Math.abs(ty - MAZE.pool.y) > 1);
});

function stalking(seed = 1) {
  const st = new Stalker(MAZE, { armed: true, rand: rng(seed) });
  feed(st, cornerRun(), SPAWN_AFTER_MS + 1000); assert.equal(st.state, 'stalking'); return st;
}

test('it is solid, follows relentlessly when not watched, freezes when watched, never closer than the gap', () => {
  const st = stalking();
  assert.equal(st.blocks(st.x, st.z, 0.38), true); assert.equal(st.blocks(st.x + 3, st.z, 0.38), false);
  // the player stands at the far west end of the bottom corridor, looking west (away from it)
  const [px, pz] = at(1, 5); const away = { x: px, z: pz, yaw: Math.PI / 2 };
  st.x = 3 * TILE; st.z = 1 * TILE; st.next = null; // put it up at the top junction
  const d0 = Math.hypot(st.x - px, st.z - pz);
  for (let i = 0; i < 60 * 8; i++) st.update(1 / 60, { t: 100 + i / 60, ...away, elapsedMs: 99999 });
  const d1 = Math.hypot(st.x - px, st.z - pz);
  assert.ok(d1 < d0 - 3, `closed in from ${d0.toFixed(1)} to ${d1.toFixed(1)}`);
  for (let i = 0; i < 60 * 20; i++) st.update(1 / 60, { t: 110 + i / 60, ...away, elapsedMs: 99999 });
  const d2 = Math.hypot(st.x - px, st.z - pz);
  assert.ok(d2 >= MIN_GAP - 0.01 && d2 < MIN_GAP + 0.6, `trails close behind: ${d2.toFixed(2)} m`);
  // now the player turns to look straight at it: it doesn't move a hair
  const yawAt = Math.atan2(-(st.x - px), -(st.z - pz));
  st.x += 2; // step it back a bit down the corridor (still in view)
  const before = [st.x, st.z];
  for (let i = 0; i < 60 * 5; i++) st.update(1 / 60, { t: 140 + i / 60, x: px, z: pz, yaw: yawAt, elapsedMs: 99999 });
  assert.equal(st.seen, true); assert.deepEqual([st.x, st.z], before, 'statue-still under your gaze');
  // look away again and it comes
  for (let i = 0; i < 60 * 2; i++) st.update(1 / 60, { t: 150 + i / 60, x: px, z: pz, yaw: yawAt + Math.PI, elapsedMs: 99999 });
  assert.ok(Math.hypot(st.x - before[0], st.z - before[1]) > 0.5, 'moves when you look away');
});

test('it never traps the player: shoving into it sends it back down the trail', () => {
  const st = stalking(3);
  const [px, pz] = at(3, 3);
  st.trail = [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 5], [1, 5]];
  st.x = px; st.z = pz + MIN_GAP; // right in front of the player
  for (let i = 0; i < 60 * 3; i++) st.update(1 / 60, { t: 200 + i / 60, x: px, z: pz, yaw: Math.PI, pushing: true, elapsedMs: 99999 });
  assert.ok(st.events.includes('relocate'));
  const [tx, ty] = tileOf(st.x, st.z); const d = bfs(G, 3, 3);
  assert.ok(d[ty][tx] >= 3, 'reappears a few tiles away');
  assert.ok(!(ty > 3 && tx === 3), 'not in plain view down the corridor the player is facing');
});

test('finding the acid makes it vanish for the rest of the shift; finding it first means it never comes', () => {
  const st = stalking();
  st.acidFound();
  assert.equal(st.state, 'gone'); assert.equal(st.present, false); assert.equal(st.blocks(st.x, st.z, 1), false);
  assert.deepEqual(st.events, ['appear', 'vanish']);
  feed(st, cornerRun({ t0: 300 }), 99999); assert.equal(st.state, 'gone', 'no second visit');
  const calm = new Stalker(MAZE, { armed: true }); calm.acidFound(); feed(calm, cornerRun(), 99999);
  assert.equal(calm.state, 'gone');
});

test('works on real generated mazes: always spawns somewhere open and reaches the player', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const m = makeMaze(seed * 7919, 7, 26);
    const st = new Stalker(m, { armed: true, rand: rng(seed) });
    // find a corner tile and fake a fast swing there
    let c = null; for (let y = 1; y < m.size - 1 && !c; y++) for (let x = 1; x < m.size - 1 && !c; x++) if (isCorner(m.grid, x, y) && m.dist[y][x] > 6) c = [x, y];
    const [cx, cz] = at(...c); let yaw = 0; const s = [];
    for (let i = 0; i < 30; i++) { yaw -= 0.06; s.push({ t: i / 60, x: cx + (i - 15) * 0.06 * (i < 15 ? 1 : 0), z: cz + (i >= 15 ? (i - 15) * 0.06 : 0), yaw }); }
    for (const p of s) st.update(1 / 60, { ...p, elapsedMs: 40000 });
    assert.equal(st.state, 'stalking', `seed ${seed}`);
    const [tx, ty] = tileOf(st.x, st.z); assert.equal(m.grid[ty][tx], 0, `seed ${seed}: spawned in rock`);
    for (let i = 0; i < 60 * 60; i++) st.update(1 / 60, { t: 1 + i / 60, x: cx, z: cz, yaw: yaw + Math.PI * (i % 600 < 300 ? 1 : 0.3), elapsedMs: 40000 + i * 16 });
    assert.ok(Math.hypot(st.x - cx, st.z - cz) < MIN_GAP + 1.5, `seed ${seed}: it got to the player`);
  }
});

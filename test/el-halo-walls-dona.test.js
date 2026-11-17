// Canyon walls: a solid rock face on BOUNDS that players, enemies, the jeep, leaps, launches
// and lag correction cannot clip through; and La Doña (type id gordo) — same heavyweight stats,
// a new traditional-dress model, HUD name, and a ¡TORTA! shout on the slam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../client/src/mines/elhalo/logic.js';
import { Match, EYE } from '../server/elhalo/match.js';
import { BOUNDS, groundAt, terrain, collide, wallDist, insideSolid, inCanyon, clampInCanyon, canyonCollide, CANYON_WALLS } from '../server/elhalo/map.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const P_RADIUS = 0.38;

function setup(names = ['t'], seed = 7) {
  const m = new Match({ rnd: seeded(seed) });
  for (const n of names) assert.ok(m.join(n, { name: n.toUpperCase(), nowMs: 0 }).ok);
  assert.ok(m.begin(names[0]).ok);
  m.emptyWave = true; m.calm = true;
  m.wave = 0; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1);
  m.queue = []; m.enemies = [];
  return m;
}
const put = (m, id, x, z, y) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = y !== undefined ? y : groundAt(x, z, 50); p.groundY = p.y; p.airT = 0; p.hist = []; p.launched = false; return p; };
const foe = (m, type, x, z, extra = {}) => { const e = m.spawn(type); e.x = x; e.z = z; e.y = groundAt(x, z, 50); e.yaw = 0; e.hist = []; Object.assign(e, extra); return e; };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };

function alongWalls(step = 8) {
  const pts = [];
  for (let z = BOUNDS.z0 + 4; z <= BOUNDS.z1 - 4; z += step) {
    pts.push({ x: BOUNDS.x0 + 2, z, dx: -1, dz: 0, name: `west z=${z}` });
    pts.push({ x: BOUNDS.x1 - 2, z, dx: 1, dz: 0, name: `east z=${z}` });
  }
  for (let x = BOUNDS.x0 + 4; x <= BOUNDS.x1 - 4; x += step) {
    pts.push({ x, z: BOUNDS.z0 + 2, dx: 0, dz: -1, name: `north x=${x}` });
    pts.push({ x, z: BOUNDS.z1 - 2, dx: 0, dz: 1, name: `south x=${x}` });
  }
  // the four corners, pushing diagonally into the rock
  pts.push({ x: BOUNDS.x0 + 2, z: BOUNDS.z0 + 2, dx: -1, dz: -1, name: 'SW corner' });
  pts.push({ x: BOUNDS.x1 - 2, z: BOUNDS.z0 + 2, dx: 1, dz: -1, name: 'SE corner' });
  pts.push({ x: BOUNDS.x0 + 2, z: BOUNDS.z1 - 2, dx: -1, dz: 1, name: 'NW corner' });
  pts.push({ x: BOUNDS.x1 - 2, z: BOUNDS.z1 - 2, dx: 1, dz: 1, name: 'NE corner' });
  return pts;
}

test('the canyon wall is a solid on the visible face: collide, wallDist and insideSolid agree', () => {
  assert.equal(CANYON_WALLS.length, 4);
  const r = P_RADIUS;
  // a body shoved past each face is pushed back a radius inside
  for (const [x, z, face] of [[BOUNDS.x0 - 1, 0, 'west'], [BOUNDS.x1 + 1, 0, 'east'], [0, BOUNDS.z0 - 1, 'north'], [0, BOUNDS.z1 + 1, 'south']]) {
    const o = { x, z }; canyonCollide(o, r);
    assert.ok(inCanyon(o.x, o.z, r - 1e-6), `${face}: ended inside the face with radius (${o.x}, ${o.z})`);
  }
  const mid = { x: 0, z: 0 }; canyonCollide(mid, r);
  assert.deepEqual([mid.x, mid.z], [0, 0], 'the open floor is untouched');

  // collide uses the same face (and keeps a body radius inside)
  const c = { x: BOUNDS.x1 + 0.4, z: 8 }; collide(c, r, 2, 1.8);
  assert.ok(c.x <= BOUNDS.x1 - r + 1e-6, `collide insets the body (${c.x})`);

  // a shot aimed at the open rock face (high, ignoring the rising ground) hits the bound
  const hit = wallDist({ x: BOUNDS.x1 - 3, y: 12, z: -8 }, { x: 1, y: 0, z: 0 }, 140, true);
  assert.ok(Math.abs(hit - 3) < 0.08, `wallDist to the east face is 3 m from x=21, got ${hit}`);
  const hitW = wallDist({ x: BOUNDS.x0 + 3, y: 12, z: 8 }, { x: -1, y: 0, z: 0 }, 140, true);
  assert.ok(Math.abs(hitW - 3) < 0.08, `west face ${hitW}`);
  const hitN = wallDist({ x: 0, y: 12, z: BOUNDS.z0 + 3 }, { x: 0, y: 0, z: -1 }, 140, true);
  assert.ok(Math.abs(hitN - 3) < 0.08, `north face ${hitN}`);

  assert.equal(insideSolid({ x: BOUNDS.x1 + 0.5, y: 2, z: 0 }), true, 'just past the face is inside the rock');
  assert.equal(insideSolid({ x: 0, y: 2, z: 0 }), false, 'mid-canyon is open');
  assert.equal(insideSolid({ x: BOUNDS.x1 - 0.01, y: 2, z: 0 }), false, 'just inside the face is still the playable floor');
});

test('players cannot walk, sprint, jump or clip into the canyon walls at many points', () => {
  const m = setup();
  const t = m.players.get('t');
  let now = 2000;
  const send = (x, y, z) => m.input('t', { p: [x, y, z] }, (now += 100));
  for (const pt of alongWalls(8)) {
    put(m, 't', pt.x, pt.z);
    // walk, then a longer sprint-sized step, then a jump (higher y) into the face
    for (const step of [0.6, 1.6, 2.0]) {
      const y = t.y + (step === 2.0 ? 1.1 : 0);
      send(t.x + pt.dx * step, y, t.z + pt.dz * step);
      assert.ok(inCanyon(t.x, t.z, P_RADIUS - 0.02), `walk ${pt.name} step ${step}: (${t.x.toFixed(2)}, ${t.z.toFixed(2)}) still a body-radius inside the face`);
    }
  }
});

test('a Bufadora launch cannot carry a player through the canyon wall', () => {
  const m = setup();
  const p = put(m, 't', BOUNDS.x1 - 1.2, 0);
  let now = 4000;
  p.lastIn = now;
  p.launched = true;
  // try to fly a few metres past the east face, high in the air (dt=0.5 keeps the step inside the speed cap)
  const wantX = p.x + 3.5, wantY = p.y + 18;
  m.input('t', { p: [wantX, wantY, p.z] }, (now += 500));
  assert.ok(p.launched, 'still in the air');
  assert.ok(Math.abs(p.y - wantY) < 1e-9, `vertical launch is allowed (y=${p.y}, want ${wantY})`);
  assert.ok(inCanyon(p.x, p.z, P_RADIUS - 0.02), `launch stopped at the face (${p.x}, ${p.z})`);
  assert.ok(p.x < wantX - 0.5, 'did not keep the out-of-bounds pose');
});

test('the jeep cannot drive through the canyon wall', () => {
  const m = setup();
  const p = put(m, 't', 0, 0);
  m.spawnJeep();
  m.jeep.x = BOUNDS.x1 - 3; m.jeep.z = 4; m.jeep.y = groundAt(m.jeep.x, m.jeep.z, 50); m.jeep.yaw = -Math.PI / 2; // facing +x
  m.enterJeep(p);
  assert.equal(p.seat, 'd');
  let now = 6000;
  // ram the east face
  m.input('t', { p: [p.x, p.y, p.z], veh: [BOUNDS.x1 + 2, m.jeep.y, 4, -Math.PI / 2] }, (now += 100));
  assert.ok(inCanyon(m.jeep.x, m.jeep.z, 0.95), `jeep stays a metre inside the face (${m.jeep.x}, ${m.jeep.z})`);
});

test('enemies (including a leaping volador and La Doña) stay inside the rock face', () => {
  const m = setup();
  put(m, 't', 0, 0);
  // walk a luchador into the west wall
  const lu = foe(m, 'luchador', BOUNDS.x0 + 1.2, 10, { spd: 4, yaw: Math.PI / 2 });
  for (let i = 0; i < 30; i++) { lu.x += -0.4; m.stepEnemy(lu, -1, 0, 4, 0.1, m.players.get('t')); }
  assert.ok(inCanyon(lu.x, lu.z, lu.st.radius - 0.02), `luchador stopped (${lu.x}, ${lu.z})`);

  // La Doña, same type id, shoved into the east face
  const d = foe(m, 'gordo', BOUNDS.x1 - 1.5, -10, { spd: 0, lcool: 99 });
  d.x = BOUNDS.x1 + 1; collide(d, d.st.radius, d.y, d.st.height, true);
  assert.ok(inCanyon(d.x, d.z, d.st.radius - 0.02), `La Doña collide (${d.x})`);

  // a volador leap aimed past the south face lands inside
  const p = put(m, 't', 0, BOUNDS.z1 - 0.5);
  const v = foe(m, 'volador', 0, BOUNDS.z1 - 8, { lcool: 0, spd: 0 });
  for (let i = 0; i < 40 && !v.leapS?.to; i++) m.tick(0.05);
  if (v.leapS?.to) {
    assert.ok(inCanyon(v.leapS.to.x, v.leapS.to.z, v.st.radius - 0.02), `leap target inside (${JSON.stringify(v.leapS.to)})`);
    for (let i = 0; i < 40 && v.leapS; i++) m.tick(0.05);
    assert.ok(inCanyon(v.x, v.z, v.st.radius - 0.02), `volador landed inside (${v.x}, ${v.z})`);
  }
});

test('the visible rock face, ledge and darker foot band match the collider', () => {
  const world = src('client/src/mines/elhalo/world.js');
  assert.match(world, /solid, obvious canyon wall/);
  assert.match(world, /darker band/);
  assert.match(world, /ledge/);
  assert.match(world, /BOUNDS/, 'drawn on the same rectangle the server uses');
  assert.match(world, /no see-through gaps|thick backing/);
});

test('La Doña keeps the heavyweight stats, is named in the HUD, and shouts ¡TORTA! on the slam', () => {
  const G = L.ENEMIES.gordo, Lu = L.ENEMIES.luchador;
  assert.equal(G.hp, 700);
  assert.equal(G.hp, Lu.hp * 10);
  assert.ok(G.speed < Lu.speed * 0.5);
  assert.ok(G.heavy);
  assert.ok(G.head && G.head.y > 1.8 && G.head.r > 0.25);
  assert.ok(G.leap && G.leap.windup >= 1 && G.leap.damage >= 100);
  assert.ok(G.grab && G.grab.windup >= 0.8 && G.grab.damage >= 70);

  const game = src('client/src/mines/elhalo/game.js');
  assert.match(game, /gordo: 'LA DOÑA'/);
  assert.doesNotMatch(game, /EL GORDO/);
  assert.match(game, /¡TORTA!/);
  assert.match(game, /sfx\('torta'\)/);
  const audio = src('client/src/mines/elhalo/audio.js');
  assert.match(audio, /torta\(\)/);
  const models = src('client/src/mines/elhalo/models.js');
  assert.match(models, /La Doña/);
  assert.match(models, /huipil/);
  assert.match(models, /flower embroidery|flowers/);
  assert.match(models, /rebozo/);
  assert.match(models, /braid/);
  assert.match(models, /ribbon/);
  assert.match(models, /layered, flared skirt|skirtA/);
  assert.match(models, /barFg/);
  assert.match(models, /kind: 'gordo'/); // type id stays gordo for the roster, spawn hook and tests

  // a slam still emits the landing event with the "big" flag the client uses to shout
  const m = setup();
  const p = put(m, 't', 0, -30), g = foe(m, 'gordo', 0, -26, { lcool: 0 }); g.dmg = 1;
  m.events = [];
  for (let i = 0; i < 80 && g.state !== 'slam'; i++) m.tick(0.05);
  const lx = m.events.filter((e) => e[0] === 'lx');
  assert.ok(lx.length >= 1, 'the landing event fires');
  assert.equal(lx[0][5], 1, 'the big flag (La Doña) is set so the client shouts ¡TORTA!');
  assert.equal(lx[0][6], g.id);
});

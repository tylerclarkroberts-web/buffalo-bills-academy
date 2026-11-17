// Horror Night: the weekly window (Fridays 9 PM to midnight, Chicago time), the server stamping shifts, the dev
// override never existing in production, the scare cooldown, the calm (low-flashing) lamp, and the Last Crew
// staying scenery: capped, never in the acid, frozen when looked at, gone in the lamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { HORROR_SCHEDULE, LIGHTS_OUT_MS, inHorrorWindow, horrorWindow, lightsOutMs, localParts } from '../server/engine/horror.js';
import { ScareGate, SCARE, Flicker, CALM_FLOOR, Crew, CREW, TILE } from '../client/src/mines/horror.js';
import { createApp } from '../server/app.js';

const ct = (iso) => Date.parse(iso); // ISO strings below carry their own Chicago offset (-06:00 CST, -05:00 CDT)

test('schedule: Fridays 9 PM up to midnight, America/Chicago, and nothing else', () => {
  assert.deepEqual({ ...HORROR_SCHEDULE }, { timeZone: 'America/Chicago', weekday: 5, startHour: 21, endHour: 24 });
  assert.equal(inHorrorWindow(ct('2026-11-20T20:59:59-06:00')), false, '8:59 PM Friday');
  assert.equal(inHorrorWindow(ct('2026-11-20T21:00:00-06:00')), true, '9:00 PM Friday');
  assert.equal(inHorrorWindow(ct('2026-11-20T23:59:59-06:00')), true, '11:59 PM Friday');
  assert.equal(inHorrorWindow(ct('2026-11-21T00:00:00-06:00')), false, 'midnight: Saturday now');
  assert.equal(inHorrorWindow(ct('2026-11-19T22:00:00-06:00')), false, 'Thursday');
  assert.equal(inHorrorWindow(ct('2026-11-21T22:00:00-06:00')), false, 'Saturday');
  // summer time: still 9 PM local
  assert.equal(inHorrorWindow(ct('2026-07-10T21:30:00-05:00')), true, 'July Friday 9:30 PM CDT');
  assert.equal(inHorrorWindow(ct('2026-07-10T20:30:00-05:00')), false, 'July Friday 8:30 PM CDT');
  // the same instant somewhere else is not the point: Chicago's clock decides
  assert.equal(inHorrorWindow(ct('2026-11-21T03:30:00Z')), true, '03:30 UTC Saturday = 9:30 PM Friday in Chicago');
  assert.deepEqual(localParts(ct('2026-11-20T21:15:00-06:00')), { weekday: 5, hour: 21, minute: 15 });
});

test('schedule: the window reports when it ends and when the next one starts', () => {
  assert.deepEqual(horrorWindow(ct('2026-11-20T22:10:00-06:00')), { on: true, endsAt: ct('2026-11-21T00:00:00-06:00') });
  assert.deepEqual(horrorWindow(ct('2026-11-16T22:20:00-06:00')), { on: false, nextAt: ct('2026-11-20T21:00:00-06:00') });
  assert.deepEqual(horrorWindow(ct('2026-11-21T00:00:00-06:00')), { on: false, nextAt: ct('2026-11-27T21:00:00-06:00') });
  // a custom schedule (the constant is the only knob): Tuesdays 1–2 AM
  const tue = { ...HORROR_SCHEDULE, weekday: 2, startHour: 1, endHour: 2 };
  assert.equal(inHorrorWindow(ct('2026-11-17T01:30:00-06:00'), tue), true);
  assert.equal(inHorrorWindow(ct('2026-11-17T02:00:00-06:00'), tue), false);
});

test('lights go out 30–60 s into a horror shift, the same every time for that shift', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const id = `shift-${i}-${i * 7919}`, ms = lightsOutMs(id);
    assert.ok(ms >= LIGHTS_OUT_MS[0] && ms <= LIGHTS_OUT_MS[1], `${ms}`);
    assert.equal(lightsOutMs(id), ms); seen.add(Math.floor(ms / 5000));
  }
  assert.ok(seen.size >= 6, 'spread across the range');
});

test('scare gate: never before the lights go, never in the grace period, never inside the cooldown', () => {
  let r = 0; const g = new ScareGate({ rand: () => r });
  assert.equal(g.roll(0), false, 'not armed: lights still on');
  g.arm(1000);
  assert.equal(g.roll(1000 + SCARE.graceMs - 1), false, 'grace period');
  assert.equal(g.roll(1000 + SCARE.graceMs), true, 'rand 0 always hits once allowed');
  const t = 1000 + SCARE.graceMs;
  for (let dt = 0; dt < SCARE.cooldownMs; dt += 500) assert.equal(g.roll(t + dt), false, `cooldown at +${dt}`);
  assert.equal(g.roll(t + SCARE.cooldownMs), true, 'cooldown over');
});

test('scare gate: a small chance per chunk that creeps up with misses, capped', () => {
  let r = 0.99; const g = new ScareGate({ rand: () => r });
  g.arm(0); const t = SCARE.graceMs;
  assert.equal(g.odds(t), SCARE.chance);
  for (let i = 0; i < 100; i++) g.roll(t + i);
  assert.equal(g.odds(t + 200), SCARE.maxChance, 'capped');
  assert.ok(SCARE.chance <= 0.1 && SCARE.maxChance <= 0.4, 'small');
  // over a long simulated mining session (two chunks a second for ten minutes), scares stay spread out
  const sim = new ScareGate({ rand: Math.random }); sim.arm(0); const hits = [];
  for (let ms = 0; ms < 600000; ms += 500) if (sim.roll(ms)) hits.push(ms);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= SCARE.cooldownMs);
  assert.ok(hits.length >= 3 && hits.length <= 600000 / SCARE.cooldownMs + 1, `${hits.length} scares`);
});

test('lamp flicker: full mode really cuts out; calm mode never strobes or goes dark', () => {
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const full = new Flicker({ rand }); let min = 1;
  for (let i = 0; i < 60 * 60; i++) min = Math.min(min, full.step(1 / 60));
  assert.ok(min < 0.12, `nearly off at least once (${min})`);
  const calm = new Flicker({ calm: true, rand }); let prev = calm.step(1 / 60), cmin = 1, maxStep = 0;
  for (let i = 0; i < 60 * 120; i++) { const v = calm.step(1 / 60); cmin = Math.min(cmin, v); maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v; }
  assert.ok(cmin >= CALM_FLOOR - 1e-9, `calm floor (${cmin})`);
  assert.ok(maxStep < 0.02, `no sudden changes frame to frame (${maxStep})`);
});

// a little loop of tunnels: a 9x9 ring around a solid block
function ring() {
  const g = Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => (x === 0 || y === 0 || x === 8 || y === 8 ? 1 : (x === 1 || x === 7 || y === 1 || y === 7) ? 0 : 1)));
  return g;
}

test('the Last Crew: capped, never in the acid, never until the lights go', () => {
  const grid = ring(); let s = 1; const rand = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const pool = { x: 7, y: 7 };
  const crew = new Crew(grid, { max: CREW.maxPhone, rand, pool: () => pool });
  const p = { x: 1 * TILE, z: 1 * TILE, yaw: 0, lamp: 0 }; // lamp off: nothing vanishes
  crew.update(1, p); assert.equal(crew.members.length, 0, 'lights still on');
  crew.start();
  for (let i = 0; i < 60 * 90; i++) {
    p.yaw += 0.02; crew.update(1 / 60, p);
    const live = crew.members.filter((m) => m.state !== 'gone');
    assert.ok(live.length <= CREW.maxPhone, 'capped');
    for (const m of live) {
      const tx = Math.round(m.x / TILE), ty = Math.round(m.z / TILE);
      assert.equal(grid[ty][tx], 0, 'in a tunnel');
      if (m.state === 'in') assert.ok(m.dist >= CREW.gap - 1e-6, `keeps its distance (${m.dist})`);
    }
  }
  assert.equal(crew.members.length, CREW.maxPhone, 'they came');
  for (const m of crew.members) assert.notDeepEqual([Math.round(m.x / TILE), Math.round(m.z / TILE)], [pool.x, pool.y]);
  assert.equal(typeof crew.blocks, 'undefined', 'no body: the scene has nothing to collide with');
});

test('the Last Crew: frozen while looked at, gone in a working lamp beam, untouched by a dead one', () => {
  const grid = ring();
  const crew = new Crew(grid, { max: 1, rand: () => 0.5, pool: () => null });
  crew.start(); crew.next = 999;
  const p = { x: 1 * TILE, z: 1 * TILE, yaw: 0, lamp: 0.05 };
  // put one down the corridor at (3,1): straight east. Facing east is yaw = -PI/2 (forward = (-sin, -cos)).
  const d = crew.paths(1, 1);
  const m = crew.spawn(p, d); Object.assign(m, { x: 3 * TILE, z: 1 * TILE, alpha: 1 }); // 4.4 m: inside the beam's reach
  p.yaw = -Math.PI / 2;
  const at = [m.x, m.z];
  for (let i = 0; i < 120; i++) crew.update(1 / 60, p);
  assert.equal(m.state, 'in'); assert.ok(m.seen); assert.deepEqual([m.x, m.z], at, 'statue-still: the lamp is dead, but you are looking');
  p.yaw = Math.PI / 2; // turn your back
  for (let i = 0; i < 60; i++) crew.update(1 / 60, p);
  assert.ok(m.x < at[0], 'it walks while you look away');
  p.yaw = -Math.PI / 2; p.lamp = 0.9; // turn back with a working lamp
  for (let i = 0; i < 60; i++) crew.update(1 / 60, p);
  assert.notEqual(m.state, 'in', 'the beam took it');
});

test('server: shifts started in the window are stamped (same for everyone); outside, nothing changes; pay never sees it', async () => {
  const run = async (iso, force) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-horror-'));
    const clock = { t: ct(iso) };
    const fixed = (n) => Math.floor(n / 3);
    const r = createApp({ dataDir, now: () => clock.t, devLogin: true, env: {}, randInt: fixed, scareInt: () => 99, veinInt: fixed, poolInt: fixed });
    const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const login = async (email) => { const lr = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: email.split('@')[0], email }) }); return lr.headers.get('set-cookie').split(';')[0]; };
      const post = (cookie) => async (u, b) => { const x = await fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(b || {}) }); return { status: x.status, body: await x.json() }; };
      const a = post(await login('a@x.test')), b = post(await login('b@x.test'));
      if (force !== undefined) assert.equal((await a('/api/dev/horror', { on: force })).status, 200);
      const sa = (await a('/api/mines/start', { rulesVersion: 2 })).body, sb = (await b('/api/mines/start', { rulesVersion: 2 })).body;
      const doc = r.service.store.loadDoc('mines', {}).active;
      return { sa, sb, doc: Object.values(doc) };
    } finally { r.service.shutdown?.(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); fs.rmSync(dataDir, { recursive: true, force: true }); }
  };
  const fri = await run('2026-11-20T21:30:00-06:00');
  for (const s of [fri.sa, fri.sb]) { assert.ok(s.horror, 'stamped'); assert.ok(s.horror.lightsOutMs >= 30000 && s.horror.lightsOutMs <= 60000); }
  const mon = await run('2026-11-16T21:30:00-06:00');
  assert.equal(mon.sa.horror, undefined); assert.equal(mon.sb.horror, undefined);
  const forced = await run('2026-11-16T21:30:00-06:00', true);
  assert.ok(forced.sa.horror, 'dev override forces it on');
  // the same randomness gives the same shift either way: outcome, vein, pools, capacity (eggs roll from the barn's own source)
  const strip = ({ id, horror, startedAt, readyAt, egg, ...rest }) => ({ ...rest, pools: rest.pools.map(({ id: pid, ...p }) => ({ pid, ...p })) });
  assert.deepEqual(strip(forced.doc[0]), strip(mon.doc[0]));
  assert.deepEqual(forced.doc[0].outcome, mon.doc[0].outcome);
});

test('server: the override route does not exist without dev login (production)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-horror-prod-'));
  const r = createApp({ dataDir, env: {} });
  const server = await new Promise((res) => { const s = r.app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const p = await fetch(base + '/api/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Prod' }) }).then((x) => x.json());
    const x = await fetch(base + '/api/dev/horror', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${p.token}` }, body: JSON.stringify({ on: true }) });
    assert.equal(x.status, 404);
    assert.equal(r.service.mines.horrorForce, null);
  } finally { r.service.shutdown?.(); server.closeAllConnections?.(); await new Promise((res) => server.close(res)); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

// La Bufadora: the rocky blowhole at the south mouth of the creek. The server keeps one shared clock so everyone
// hears the rumble, then the same geyser; a player standing on it is launched and comes down with no fall damage.
// The /elhalo/dev/bufadora hook is for the local dev server only (404 in production).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Match } from '../server/elhalo/match.js';
import { BUFADORA, creekX, terrain, groundAt, BOUNDS } from '../server/elhalo/map.js';
import { BUFADORA_RULES as BF } from '../server/elhalo/rules.js';
import { createApp } from '../server/app.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

function setup(names = ['t', 'j'], seed = 7, { lobby = false } = {}) {
  const m = new Match({ rnd: seeded(seed) });
  for (const n of names) assert.ok(m.join(n, { name: n.toUpperCase(), nowMs: 0 }).ok);
  if (!lobby) { assert.equal(m.phase, 'lobby'); assert.ok(m.begin(names[0]).ok); }
  m.emptyWave = true; m.calm = true;
  return m;
}
const put = (m, id, x, z, y) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = y !== undefined ? y : groundAt(x, z, 50); p.groundY = p.y; p.airT = 0; p.hist = []; return p; };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
const evs = (m, k) => { const s = m.snapshot(); return s.ev.filter((e) => e[0] === k); };

test('La Bufadora sits in the creek just before Fortín Sur, near the south mouth', () => {
  assert.ok(Math.abs(BUFADORA.x - creekX(BUFADORA.z)) < 1e-9);
  assert.ok(BUFADORA.z > 40 && BUFADORA.z < 50, 'just before the south fort (z 48–58)');
  assert.ok(BUFADORA.r > 1.5 && BUFADORA.r < 3);
  assert.ok(BUFADORA.x > BOUNDS.x0 && BUFADORA.x < BOUNDS.x1);
  assert.equal(BF.period, 60);
  assert.ok(BF.warn >= 2 && BF.warn <= 6);
  assert.ok(BF.launchVy >= 20, 'high enough to feel like a launch');
  const world = src('client/src/mines/elhalo/world.js');
  assert.match(world, /buildBufadora/);
  assert.match(world, /BUFADORA/);
  const audio = src('client/src/mines/elhalo/audio.js');
  assert.match(audio, /rumble\(\)/);
  assert.match(audio, /gurgle\(\)/);
  assert.match(audio, /blow\(\)/);
  const game = src('client/src/mines/elhalo/game.js');
  const room = src('client/src/mines/elhalo/ElHaloRoom.jsx');
  assert.match(room, /hostRef\.current = document\.querySelector\('\.mines'\) \|\| document\.body/);
  assert.match(game, /k === 'bfw'/);
  assert.match(game, /k === 'bfb'/);
  assert.match(game, /k === 'bfl'/);
  assert.match(game, /sfx\('blow'\)/);
});

test('the first blow is one minute after the match leaves the lobby, with a rumble a few seconds before', () => {
  const m = setup();
  m.snapshot(); // drop 'go' / countdown events
  assert.equal(m.bfPh, 'idle');
  assert.ok(Math.abs(m.bufNext - BF.period) < 1e-6);
  run(m, BF.period - BF.warn - 0.2);
  assert.equal(m.bfPh, 'idle');
  assert.equal(m.snapshot().bf, 0);
  run(m, 0.3);
  assert.equal(m.bfPh, 'warn');
  const warn = evs(m, 'bfw');
  assert.equal(warn.length, 1);
  const sWarn = m.snapshot();
  assert.ok(Array.isArray(sWarn.bf) && sWarn.bf[0] === 0, 'warn: not blowing yet');
  assert.ok(sWarn.bf[1] <= BF.warn && sWarn.bf[1] > BF.warn - 1);
  run(m, BF.warn);
  assert.equal(m.bfPh, 'blow');
  const blow = evs(m, 'bfb');
  assert.equal(blow.length, 1);
  const sBlow = m.snapshot();
  assert.ok(sBlow.bf[0] === 1 && sBlow.bf[1] > 0 && sBlow.bf[1] <= BF.blast);
  run(m, BF.blast + 0.2);
  assert.equal(m.bfPh, 'idle');
  assert.equal(m.snapshot().bf, 0);
  // next one is another minute out
  assert.ok(Math.abs(m.bufNext - 2 * BF.period) < 0.5);
});

test('everyone sees the same clock: two players get one shared snapshot', () => {
  const m = setup(['t', 'j']);
  m.triggerBufadora();
  const a = m.snapshot(), b = m.snapshot({ events: false });
  assert.deepEqual(a.bf, b.bf);
  assert.equal(a.bf[0], 0);
  assert.ok(Math.abs(a.bf[1] - BF.warn) < 0.15);
});

test('a player standing on or over the hole is launched very high and lands with no fall damage', () => {
  const m = setup(['t']);
  const p = put(m, 't', BUFADORA.x, BUFADORA.z);
  const hp = p.P.health, sh = p.P.shield;
  m.triggerBufadora();
  run(m, BF.warn + 0.05);
  assert.equal(p.launched, true);
  const launch = evs(m, 'bfl');
  assert.equal(launch.length, 1);
  assert.equal(launch[0][1], 't');
  assert.equal(launch[0][2], BF.launchVy);

  let y = p.y, vy = BF.launchVy, maxY = y, dt = 0.05;
  for (let i = 0; i < 120; i++) {
    vy -= 16 * dt;
    y += vy * dt;
    const g = groundAt(p.x, p.z, y);
    if (y < g) y = g;
    m.move(p, p.x, y, p.z, dt);
    maxY = Math.max(maxY, p.y);
    m.tick(dt);
    if (!p.launched && p.y <= g + 0.4) break;
  }
  assert.ok(maxY > 18, `peaked at ${maxY.toFixed(1)} m`);
  assert.equal(p.P.health, hp, 'no fall damage (health)');
  assert.equal(p.P.shield, sh, 'no fall damage (shield)');
  assert.equal(p.state, 'alive');
  assert.equal(p.launched, false, 'cleared once they land');
  const g = groundAt(p.x, p.z, p.y);
  assert.ok(p.y <= g + 0.4, 'back on the ground');
});

test('only players on or just above the hole are launched; a jeep rider is left alone', () => {
  const m = setup(['t', 'j', 'k']);
  const g = groundAt(BUFADORA.x, BUFADORA.z, 50);
  const on = put(m, 't', BUFADORA.x, BUFADORA.z, g + 2.2); // a jump: still "over" it
  const far = put(m, 'j', 0, 0);
  const high = put(m, 'k', BUFADORA.x, BUFADORA.z, g + 5.2);
  m.triggerBufadora();
  run(m, BF.warn + 0.05);
  assert.equal(on.launched, true, 'standing / jumping over it');
  assert.equal(far.launched, undefined, 'far away');
  assert.equal(high.launched, undefined, 'well above the column does not count');
  evs(m, 'bfl'); // drain

  // someone sitting in EL TORO on the hole stays put
  const rider = put(m, 'j', BUFADORA.x, BUFADORA.z);
  rider.seat = 'd';
  rider.launched = false;
  m.bufNext = m.t + 0.05;
  m.bfPh = 'idle';
  run(m, 0.2);
  assert.equal(rider.launched, false, 'jeep rider is not launched');
});

test('grounded enemies on the hole are knocked skyward; flyers are not', () => {
  const m = setup(['t']);
  put(m, 't', 0, 0);
  const g = m.spawn('luchador');
  g.x = BUFADORA.x; g.z = BUFADORA.z; g.y = groundAt(g.x, g.z, 50); g.spd = 0; g.hist = [];
  const fly = m.spawn('lechuza');
  fly.x = BUFADORA.x; fly.z = BUFADORA.z; fly.y = groundAt(fly.x, fly.z, 50) + (fly.st.fly?.cruise || 4); fly.spd = 0; fly.hist = [];
  m.triggerBufadora();
  run(m, BF.warn + 0.05);
  const up = evs(m, 'bfe');
  assert.ok(up.some((e) => e[1] === g.id && e[2] === BF.enemyVy));
  assert.ok(!up.some((e) => e[1] === fly.id), 'a lechuza already flies');
  assert.ok(g.blowVy > 10, 'still rising or just launched');
  assert.ok(!fly.blowVy);

  let maxY = g.y;
  for (let i = 0; i < 80; i++) { m.tick(0.05); maxY = Math.max(maxY, g.y); }
  assert.ok(maxY > 14, `enemy peaked at ${maxY.toFixed(1)} m`);
  assert.ok(!g.dead, 'the landing does not kill them');
  assert.ok(!g.blowVy, 'back on the ground');
  const floor = groundAt(g.x, g.z, g.y);
  assert.ok(g.y <= floor + 0.4);
});

test('the dev hook starts the warning immediately; production always 404s', { timeout: 20000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bf-'));
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bf-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>El Halo</title><div id="app">app</div>');
  fs.mkdirSync(path.join(staticDir, 'elhalo'));
  fs.writeFileSync(path.join(staticDir, 'elhalo', 'thumb.webp'), 'webp');
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true }); });

  async function boot(devLogin) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bf-app-'));
    const { app, service, elhalo } = createApp({ dataDir: data, staticDir, env: { ...process.env, ELHALO_TICK_MS: '50' }, devLogin });
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    t.after(async () => { elhalo?.shutdown(); service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(data, { recursive: true, force: true }); });
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    return { origin, elhalo };
  }

  const prod = await boot(false);
  const r404 = await fetch(prod.origin + '/api/elhalo/dev/bufadora', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r404.status, 404, 'no hook in production, even signed out');
  // signed in, still 404 (and never 401 — the route must not leak that it exists)
  const made = await fetch(prod.origin + '/api/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tyler' }) });
  const body = await made.json();
  const r404in = await fetch(prod.origin + '/api/elhalo/dev/bufadora', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${body.token}` }, body: '{}' });
  assert.equal(r404in.status, 404);
  const rTest = await fetch(prod.origin + '/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${body.token}` }, body: JSON.stringify({ bufadora: true }) });
  assert.equal(rTest.status, 404);

  const srcApp = src('server/app.js');
  assert.match(srcApp, /app\.get\(\['\/elhalo', '\/elhalo\/'\]/);
  const page = await fetch(prod.origin + '/elhalo', { redirect: 'manual' });
  assert.equal(page.status, 200, '/elhalo is the game, not a 301 to /elhalo/');
  assert.equal(page.headers.get('location'), null);
  const html = await page.text();
  assert.match(html, /El Halo|id="app"/);
  const slash = await fetch(prod.origin + '/elhalo/', { redirect: 'manual' });
  assert.equal(slash.status, 200);
  const thumb = await fetch(prod.origin + '/elhalo/thumb.webp', { redirect: 'manual' });
  assert.equal(thumb.status, 200, 'the lobby thumb under /elhalo/ is still a static file');

  const dev = await boot(true);
  const mk = await fetch(dev.origin + '/api/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tyler' }) });
  const ty = await mk.json();
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${ty.token}` };
  await fetch(dev.origin + '/api/elhalo/join', { method: 'POST', headers: auth, body: '{}' });
  const ok = await fetch(dev.origin + '/api/elhalo/dev/bufadora', { method: 'POST', headers: auth, body: '{}' });
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.in, BF.warn);
  assert.equal(dev.elhalo.match.bfPh, 'warn');
});

// La Michoacana chili-pepper power-ups: one per wave, first eater keeps it,
// seven 30-second powers (or a one-shot wash), original art and audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { Match } from '../server/elhalo/match.js';
import { BUILDINGS, CASES, buildingAt, groundAt, BOUNDS } from '../server/elhalo/map.js';
import {
  CHILE, CHILE_SPOT, CHILE_POWERS, CHILE_IDS, CHILE_WINDOWS, CHILE_DURATION,
  pickChileAt, pickChileWindow, pickChilePower, isChilePower,
} from '../server/elhalo/chiles.js';
import { HEALTH, SHIELD, MELEE } from '../server/elhalo/rules.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

function setup(names = ['t', 'j'], seed = 7) {
  const m = new Match({ rnd: seeded(seed) });
  for (const n of names) assert.ok(m.join(n, { name: n.toUpperCase(), nowMs: 0 }).ok);
  assert.ok(m.begin(names[0]).ok);
  m.emptyWave = true; m.calm = true;
  run(m, 6);
  return m;
}
function run(m, secs, dt = 0.1) { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); }
const put = (m, id, x, z, y) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = y !== undefined ? y : groundAt(x, z, 50); p.groundY = p.y; p.airT = 0; p.hist = []; return p; };
const evs = (m, k) => m.snapshot().ev.filter((e) => e[0] === k);
const foe = (m, type, x, z) => { const e = m.spawn(type); e.x = x; e.z = z; e.y = groundAt(x, z, 50); e.spd = 0; return e; };

test('the pepper sits on the floor of La Michoacana, clear of the cases', () => {
  const shop = BUILDINGS.find((b) => b.id === 'michoacana');
  assert.ok(shop);
  assert.equal(buildingAt(CHILE_SPOT.x, CHILE_SPOT.z)?.id, 'michoacana');
  assert.ok(CHILE_SPOT.x > shop.x0 + 1 && CHILE_SPOT.x < shop.x1 - 1);
  assert.ok(CHILE_SPOT.z > shop.z0 + 1 && CHILE_SPOT.z < shop.z1 - 1);
  for (const c of CASES) {
    const inCase = CHILE_SPOT.x >= c.x0 && CHILE_SPOT.x <= c.x1 && CHILE_SPOT.z >= c.z0 && CHILE_SPOT.z <= c.z1;
    assert.equal(inCase, false, 'not inside a freezer case');
  }
});

test('each of the seven powers has its own name and a unique pepper color', () => {
  assert.equal(CHILE_POWERS.length, 7);
  assert.deepEqual(CHILE_IDS, ['invis', 'invuln', 'instakill', 'gigante', 'schnuttin', 'mazo', 'caballos']);
  assert.equal(CHILE_POWERS.find((p) => p.id === 'schnuttin').name, 'LAST MAN SCHNUTTIN HIS PANTS');
  const keys = new Set(CHILE_POWERS.map((p) => p.color.map((v) => v.toFixed(3)).join(',')));
  assert.equal(keys.size, 7);
  assert.equal(CHILE.duration, 30);
  assert.equal(CHILE_DURATION, 30);
  for (const id of CHILE_IDS) assert.ok(isChilePower(id));
  assert.equal(isChilePower('martillo'), false);
});

test('spawn time is never in the first minute: 60% minute 2, 20% minute 3, 20% minute 4', () => {
  assert.deepEqual(CHILE_WINDOWS.map((w) => [w.p, w.t0, w.t1]), [[0.6, 60, 120], [0.2, 120, 180], [0.2, 180, 240]]);
  const bins = { 2: 0, 3: 0, 4: 0 };
  let min = Infinity, max = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const t = pickChileAt(seeded(1000 + i * 17));
    assert.ok(t >= 60 && t < 240, t);
    min = Math.min(min, t); max = Math.max(max, t);
    if (t < 120) bins[2]++; else if (t < 180) bins[3]++; else bins[4]++;
  }
  assert.ok(min >= 60);
  assert.ok(max < 240);
  const p2 = bins[2] / N, p3 = bins[3] / N, p4 = bins[4] / N;
  assert.ok(p2 > 0.55 && p2 < 0.65, `minute 2 share ${p2}`);
  assert.ok(p3 > 0.15 && p3 < 0.25, `minute 3 share ${p3}`);
  assert.ok(p4 > 0.15 && p4 < 0.25, `minute 4 share ${p4}`);
});

test('powers are picked at random across all seven', () => {
  const counts = Object.fromEntries(CHILE_IDS.map((id) => [id, 0]));
  const N = 700;
  for (let i = 0; i < N; i++) counts[pickChilePower(seeded(i * 31 + 9))]++;
  for (const id of CHILE_IDS) assert.ok(counts[id] > 40, `${id} showed up ${counts[id]} times`);
});

test('the match schedules one pepper per wave and the first player to eat it takes it', () => {
  const m = setup(['t', 'j']);
  assert.equal(m.phase, 'wave');
  // keep one enemy on the field so the wave doesn't roll into the truck
  const decoy = foe(m, 'luchador', 12, -20); decoy.spd = 0;
  m.emptyWave = false;
  m.scheduleChile();
  assert.ok(m.chileAt > m.t);
  assert.ok(m.chileAt - m.t >= 60);
  assert.equal(m.chile, null);
  // force the scheduled time so we don't wait minutes
  m.chileAt = m.t + 0.2;
  run(m, 0.5);
  assert.ok(m.chile, 'pepper appeared');
  assert.equal(m.chile.x, CHILE_SPOT.x);
  assert.equal(m.chile.z, CHILE_SPOT.z);
  assert.ok(CHILE_IDS.includes(m.chile.power));
  const s = m.snapshot();
  assert.ok(s.ch);
  assert.equal(s.ch[1], m.chile.power);
  // two players walk in; the first tick of contact awards it, and it is gone
  const t = put(m, 't', CHILE_SPOT.x, CHILE_SPOT.z);
  const j = put(m, 'j', CHILE_SPOT.x + 0.2, CHILE_SPOT.z);
  const power = m.chile.power;
  run(m, 0.2);
  assert.equal(m.chile, null, 'gone once someone eats it');
  assert.equal(t.power?.id, power);
  assert.ok(!j.power, 'only the first eater gets it');
  assert.ok(t.power.until - m.t > 29 && t.power.until - m.t <= 30);
  const mine = m.personal('t');
  assert.equal(mine.pw, power);
  assert.ok(mine.pwl > 29);
  const ev = evs(m, 'eat');
  assert.equal(ev.length, 1);
  assert.equal(ev[0][1], 't');
});

test('an uneaten pepper is cleared when the wave ends, and a late schedule never fires after the wave', () => {
  const m = setup(['t']);
  run(m, 1);
  m.spawnChile('invis');
  assert.ok(m.chile);
  m.startTruck();
  assert.equal(m.chile, null);
  // a pending spawn after wave end does not plant a pepper
  m.phase = 'truck';
  m.chileAt = m.t + 0.1;
  m.chileWave = m.wave;
  run(m, 0.5);
  assert.equal(m.chile, null);
});

test('INVISIBLE: the horde does not see you or go for you', () => {
  const m = setup(['t', 'j']);
  run(m, 1);
  const t = put(m, 't', 0, 0);
  const j = put(m, 'j', 8, 0);
  const e = foe(m, 'luchador', 2, 0);
  e.retarget = 0;
  run(m, 0.2);
  assert.equal(e.target, t, 'closest player is the default target');
  m.grantPower(t, 'invis');
  e.retarget = 0;
  run(m, 0.2);
  assert.equal(e.target, j, 'skips the invisible player and goes for the other');
  m.grantPower(j, 'invis');
  e.retarget = 0;
  run(m, 0.2);
  assert.equal(e.target, null, 'idles when everyone is invisible');
});

test('INTOCABLE: the horde deals no damage, but another player still can', () => {
  const m = setup(['t', 'j']);
  m.calm = false;
  run(m, 1);
  const t = put(m, 't', 0, 0);
  const j = put(m, 'j', 2, 0);
  t.P.health = 100; t.P.shield = 100;
  m.grantPower(t, 'invuln');
  m.hurtPlayer(t, 80, { x: 1, z: 0 }, { type: 'luchador' }, 'hit');
  assert.equal(t.P.health, 100);
  assert.equal(t.P.shield, 100);
  m.hurtPlayer(t, 40, { x: j.x, z: j.z }, j, 'gun');
  assert.ok(t.P.shield < 100, 'PVP still hurts');
});

test('UN TIRO: one bullet kills a horde enemy, and it does not instakill another player', () => {
  const m = setup(['t', 'j']);
  m.calm = false;
  run(m, 1);
  const t = put(m, 't', 0, 0);
  const j = put(m, 'j', 2, 0);
  j.P.health = 100; j.P.shield = 100;
  m.grantPower(t, 'instakill');
  const e = foe(m, 'luchador', 0, -4);
  e.hp = 800; e.maxHp = 800;
  m.hurtEnemy(e, 8, 'gun', t, t);
  assert.ok(e.dead, 'one bullet drops the horde');
  m.hurtPlayer(j, 24, { x: t.x, z: t.z }, t, 'gun');
  assert.ok(!j.P.dead && j.state === 'alive');
  assert.ok(j.P.health + j.P.shield > 50, 'a regular pistol round, not an instakill, in PVP');
});

test('GIGANTISMO: health and shield go 5X, melee instakills the horde, then vitals clamp back', () => {
  const m = setup(['t']);
  run(m, 1);
  const t = put(m, 't', 0, 0);
  t.P.health = 80; t.P.shield = 60;
  m.grantPower(t, 'gigante');
  assert.equal(t.hpMax, HEALTH.max * 5);
  assert.equal(t.shMax, SHIELD.max * 5);
  assert.equal(t.P.health, 400);
  assert.equal(t.P.shield, 300);
  const e = foe(m, 'luchador', 0.4, 0);
  e.hp = 500; e.maxHp = 500;
  m.hurtEnemy(e, MELEE.damage, 'melee', t, t);
  assert.ok(e.dead);
  // expires after 30s
  run(m, 30.2);
  assert.equal(t.power, null);
  assert.equal(t.P.health, HEALTH.max);
  assert.equal(t.P.shield, SHIELD.max);
  assert.equal(t.hpMax, HEALTH.max);
});

test('LAST MAN SCHNUTTIN HIS PANTS: 4x speed and high jumps are allowed, and the power is tagged for the banner', () => {
  const m = setup(['t']);
  run(m, 1);
  const t = put(m, 't', 0, 0);
  // without the power, a 3m step in 0.1s is a teleport
  t.lastIn = 0;
  const rejected = m.input('t', { p: [t.x + 3, t.y, t.z], yaw: 0, ev: [] }, 100);
  assert.ok(rejected.ok);
  assert.ok(t.corr, 'server snaps a cheaty sprint back');
  t.corr = null;
  put(m, 't', 0, 0);
  m.grantPower(t, 'schnuttin');
  const ev = evs(m, 'schnuttin');
  assert.equal(ev[0][1], 't');
  t.lastIn = 0;
  const ok = m.input('t', { p: [t.x + 3, t.y, t.z], yaw: 0, ev: [] }, 100);
  assert.ok(ok.ok);
  assert.ok(Math.abs(t.x - 3) < 0.05, `accepted 4x sprint, x=${t.x}`);
  // a super jump of ~4 m is allowed
  t.lastIn = 0;
  const up = m.input('t', { p: [t.x, t.y + 4, t.z], yaw: 0, ev: [] }, 200);
  assert.ok(up.ok);
  assert.ok(t.y > 3.5);
});

test('EL MAZO DE LA FERIA flings horde enemies and they only pop when they hit something', () => {
  const m = setup(['t']);
  run(m, 1);
  const t = put(m, 't', 0, 0);
  t.yaw = 0; // facing -z
  m.grantPower(t, 'mazo');
  const e = foe(m, 'luchador', 0, -2);
  e.hp = 500; e.maxHp = 500;
  // first swing is on the grant tick? tickPowers runs on tick. Force a swing.
  t.power.swing = 0;
  run(m, 0.15);
  assert.ok(e.fling, 'blown away, still alive in the air');
  assert.equal(e.dead, false);
  // fly until they slam the ground (or a wall)
  let popped = false;
  for (let i = 0; i < 80 && !e.dead; i++) m.tick(0.1);
  assert.ok(e.dead, 'pop on impact, not on the blow itself');
  const how = evs(m, 'k').map((ev) => ev[7]);
  assert.ok(how.includes('mazo'), how.join(','));
});

test('CABALLOS DE AGUA washes away the horde on the map, not other human players', () => {
  const m = setup(['t', 'j']);
  m.calm = false;
  run(m, 1);
  const t = put(m, 't', 0, 0);
  const j = put(m, 'j', 4, 4);
  j.P.health = 80; j.P.shield = 80;
  const pack = [foe(m, 'luchador', -3, -3), foe(m, 'mariachi', 3, -3), foe(m, 'granjero', 0, 6)];
  m.grantPower(t, 'caballos');
  assert.ok(evs(m, 'caballos').length);
  assert.ok(pack.every((e) => e.dead));
  assert.equal(j.state, 'alive');
  assert.equal(j.P.health, 80);
  assert.equal(j.P.shield, 80);
  // a spawn after the wash is not auto-killed
  const late = foe(m, 'luchador', 1, 1);
  run(m, 0.3);
  assert.equal(late.dead, false);
});

test('a power lasts 30 seconds and ends if you go down', () => {
  const m = setup(['t']);
  m.calm = false;
  run(m, 1);
  const t = put(m, 't', 0, 0);
  m.grantPower(t, 'invis');
  run(m, 29.5);
  assert.equal(t.power?.id, 'invis');
  run(m, 1);
  assert.equal(t.power, null);
  m.grantPower(t, 'invuln');
  t.P.shield = 0;
  // a player-sourced hit bypasses invuln and can down you, which strips the power
  assert.ok(m.join('j', { name: 'J', nowMs: 0 }).ok);
  const jj = put(m, 'j', 1, 0);
  m.hurtPlayer(t, 999, { x: 1, z: 0 }, jj, 'gun');
  assert.ok(t.state === 'downed' || t.P.dead);
  // tick clears the power once you are not alive
  run(m, 0.2);
  assert.equal(t.power, null);
});

test('the client, HUD, audio and models ship original chili art — no borrowed names or assets', () => {
  const models = src('client/src/mines/elhalo/models.js');
  const audio = src('client/src/mines/elhalo/audio.js');
  const game = src('client/src/mines/elhalo/game.js');
  const room = src('client/src/mines/elhalo/ElHaloRoom.jsx');
  const css = src('client/src/mines/elhalo/elhalo.css');
  const world = src('client/src/mines/elhalo/world.js');
  assert.match(models, /export function makeChile/);
  assert.match(models, /export function makeFiestaMallet/);
  assert.match(models, /export function makeWaterHorse/);
  assert.match(audio, /mazoStart/);
  assert.match(audio, /schnuttin\(/);
  assert.match(audio, /spicy\(/);
  assert.match(audio, /caballos\(/);
  assert.match(game, /saySchnuttin/);
  assert.match(game, /speechSynthesis/);
  assert.match(game, /makeChile/);
  assert.match(game, /Last man schnuttin his pants/);
  assert.match(room, /data-test="elhalo-chile-timer"/);
  assert.match(room, /data-test="elhalo-schnuttin"/);
  assert.match(css, /\.elh-chile/);
  assert.match(css, /elhalo-chile|elh-chile/);
  // no shimmer regression and walls stay solid
  assert.match(game, /const CAM_NEAR = 0\.15/);
  assert.match(world, /faceDepth - 0\.04/);
  // parody mallet is an original carnival shape, not a licensed mascot hammer
  assert.match(models, /round candy-striped head|festive carnival mallet/i);
  assert.doesNotMatch(models, /super smash|smash bros|home.?run bat/i);
  assert.doesNotMatch(audio, /super smash|koopa|item box/i);
  assert.doesNotMatch(src('server/elhalo/chiles.js'), /energy sword|needler|plasma grenade/i);
});

test('mobile HUD keeps the chili timer out of the on-screen pad', () => {
  const css = src('client/src/mines/elhalo/elhalo.css');
  assert.match(css, /\.elh-chile[\s\S]*top:\s*74px/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.elh-chile[\s\S]*top:\s*58px/);
  const room = src('client/src/mines/elhalo/ElHaloRoom.jsx');
  assert.match(room, /data-test="elhalo-pad"/);
  assert.match(room, /data-test="elhalo-chile-timer"/);
});

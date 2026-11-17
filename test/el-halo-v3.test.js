// EL HALO v3: every building open (no boards), La Michoacana (sign, logo, freezer cases), the elote man, the street dogs
// (and the stuck pair), the luchador volador's eagle dive, and el gordo. All server-side and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../server/elhalo/rules.js';
import { Match, EYE } from '../server/elhalo/match.js';
import { BUILDINGS, OPENINGS, CASES, ELOTE, BOUNDS, MAP, STATIONS, creekX, groundAt, terrain, insideSolid, buildingAt } from '../server/elhalo/map.js';
import { dogsAt, DOG_COUNT, DOG_PLANS, PAIR_GAP, eloteShout, ELOTE_LINES } from '../server/elhalo/critters.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
function at(n = 1, names = ['t'], { calm = false } = {}) {
  const m = new Match({ rnd: seeded(7) });
  for (const id of names) m.join(id, { name: id.toUpperCase(), nowMs: 0 });
  m.begin(names[0]); m.emptyWave = true; m.calm = calm;
  m.wave = n - 1; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1);
  return m;
}
const put = (m, id, x, z) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = groundAt(x, z, 50); p.groundY = p.y; p.airT = 0; p.hist = []; p.corr = null; return p; };
const foe = (m, type, x, z, extra = {}) => { const e = m.spawn(type); e.x = x; e.z = z; e.y = groundAt(x, z, 50); e.yaw = 0; e.hist = []; Object.assign(e, extra); return e; };
const evs = (m, k) => { const out = m.events.filter((e) => e[0] === k); return out; };
const ang = (a) => ((a % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;

test('La Michoacana: one building is now a pink-and-white paletería with its sign, logo and freezer cases', () => {
  const b = BUILDINGS.find((q) => q.id === 'michoacana');
  assert.ok(b && b.name === 'LA MICHOACANA'); assert.ok(!BUILDINGS.some((q) => q.id === 'hacienda'), 'it took the hacienda\'s spot');
  const ops = OPENINGS.filter((o) => o.b === 'michoacana' && o.side === 'w');
  assert.ok(ops.some((o) => o.door) && ops.filter((o) => !o.door && o.w >= 2.4).length === 2, 'a storefront: door between two wide windows');
  const cases = MAP.boxes.filter((x) => x.k === 'case');
  assert.equal(cases.length, CASES.length); assert.ok(cases.every((c) => c.solid && buildingAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)?.id === 'michoacana'), 'freezer cases stand inside, solid');
  assert.ok(STATIONS.some((s) => s.b === 'michoacana'));
  const art = src('client/src/mines/elhalo/michoacana.js'), world = src('client/src/mines/elhalo/world.js');
  for (const t of ['La Michoacana', 'es... natural.', 'MICHOACANA']) assert.ok(art.includes(t), `the sign says ${t}`);
  assert.match(art, /function girl\(/, 'the logo girl is drawn on a canvas'); assert.match(art, /rebozo/);
  assert.doesNotMatch(art, /\.(png|jpe?g|webp|gif|svg)\b/i, 'no image files: it is all painted in code');
  assert.match(world, /signCanvas\(\)/); assert.match(world, /logoCanvas\(/); assert.match(world, /MPINK/); assert.match(world, /MWHITE/);
});

test('no boards anywhere, in the server, the client or the browser checks', () => {
  for (const f of ['server/elhalo/map.js', 'server/elhalo/match.js', 'server/elhalo/index.js', 'client/src/mines/elhalo/game.js', 'client/src/mines/elhalo/world.js', 'scripts/e2e-el-halo.mjs', 'scripts/e2e-el-halo-v2.mjs']) {
    assert.doesNotMatch(src(f), /BOARDS_MAX|CLAVA TABLAS|\.bars\b|'build'|buildSecs/, `${f} has no boards left`);
  }
  assert.ok(OPENINGS.every((o) => o.open));
});

test('the elote man: harmless scenery out front, ignored by the horde, bullets go through, a heal plus a once-per-wave ammo refill', () => {
  const g = groundAt(ELOTE.x, ELOTE.z, 50);
  assert.ok(!insideSolid({ x: ELOTE.x, y: g + 0.6, z: ELOTE.z }) && !buildingAt(ELOTE.x, ELOTE.z), 'standing in the open');
  assert.ok(ELOTE.x > BOUNDS.x0 && ELOTE.x < BOUNDS.x1);
  // bullets pass through him: a shot across his spot still reaches an enemy behind
  const m = at(1, ['t']);
  const t = put(m, 't', ELOTE.x - 6, ELOTE.z), e = foe(m, 'luchador', ELOTE.x + 4, ELOTE.z, { spd: 0, hp: 9999, maxHp: 9999 });
  const o = { x: t.x, y: t.y + EYE, z: t.z }, c = { x: e.x - o.x, y: e.y + 1 - o.y, z: e.z - o.z }, l = Math.hypot(c.x, c.y, c.z);
  const hits = m.castRay(t, o, { x: c.x / l, y: c.y / l, z: c.z / l });
  assert.equal(hits.hits[0]?.e, e, 'the shot goes past the cart and hits the luchador');
  // enemies only ever target players
  m.enemies = [];
  const lu = foe(m, 'luchador', ELOTE.x + 1, ELOTE.z + 1); run(m, 1);
  assert.equal(lu.target, t, 'the luchador goes for the player, not the elote man');
  // the heal + a full refill of the gun in hand, once per wave
  m.enemies = []; put(m, 't', ELOTE.x + 1, ELOTE.z); t.P.health = 40;
  t.P.weapons.rifle.mag = 3; t.P.weapons.rifle.reserve = 8; m.tick(0.1);
  assert.equal(m.personal('t').pr.k, 'elote');
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 1000); m.tick(0.1);
  assert.equal(t.P.health, 40 + L.MATCH.elote.heal);
  assert.equal(t.P.weapons.rifle.mag, L.WEAPONS.rifle.mag);
  assert.equal(t.P.weapons.rifle.reserve, L.WEAPONS.rifle.reserve);
  assert.ok(m.events.some((x) => x[0] === 'el' && x[1] === 't' && x[2] === 1));
  m.input('t', { p: [t.x, t.y, t.z], act: false }, 1200); m.tick(0.1); m.input('t', { p: [t.x, t.y, t.z], act: true }, 1400); m.tick(0.1);
  assert.equal(t.P.health, 40 + L.MATCH.elote.heal, 'once per wave');
  assert.equal(m.personal('t').pr.label, 'Ya comiste este round');
  assert.ok(L.MATCH.elote.heal <= 30 && L.MATCH.elote.cool >= 45, 'heal itself stayed modest');
  // the calls: a line every few seconds, the same for everyone
  const seen = new Set(); for (let s = 0; s < 60; s += 0.5) { const i = eloteShout(s); if (i >= 0) seen.add(ELOTE_LINES[i]); }
  assert.ok(seen.has('¡ELOTES!') && seen.has('¡ESQUITES!'));
  assert.equal(eloteShout(1), eloteShout(1)); assert.equal(eloteShout(ELOTE_LINES.length * 6.5 * 3 + 1), eloteShout(1));
});

test('street dogs: four wanderers plus the stuck pair, deterministic, harmless, never inside a wall', () => {
  assert.equal(dogsAt(0).length, DOG_PLANS.length + 2); assert.ok(DOG_COUNT.free >= 4 && DOG_COUNT.free <= DOG_PLANS.length && DOG_COUNT.phone < DOG_COUNT.free, 'fewer on phones');
  assert.deepEqual(dogsAt(37.25), dogsAt(37.25), 'the same for everyone at the same match time');
  const gaits = new Set();
  for (let t = 0; t < 140; t += 0.7) {
    const d = dogsAt(t);
    for (const g of d) {
      assert.ok(g.x > BOUNDS.x0 && g.x < BOUNDS.x1 && g.z > BOUNDS.z0 && g.z < BOUNDS.z1, `dog in bounds at ${t}`);
      assert.ok(!insideSolid({ x: g.x, y: terrain(g.x, g.z) + 0.35, z: g.z }) && !buildingAt(g.x, g.z), `dog not in a wall at ${t} (${g.x.toFixed(1)}, ${g.z.toFixed(1)})`);
      gaits.add(g.gait);
    }
    // the pair: tail to tail, facing opposite ways
    const [a, b] = d.slice(-2);
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 2 * PAIR_GAP) < 1e-6, 'stuck together');
    assert.ok(Math.abs(a.x - creekX(a.z)) > 3 && Math.abs(b.x - creekX(b.z)) > 3, 'the pair stays out of the creek');
    assert.ok(Math.abs(Math.abs(ang(a.yaw - b.yaw)) - Math.PI) < 1e-6, 'facing opposite ways');
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, fa = { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) };
    assert.ok((a.x - mid.x) * fa.x + (a.z - mid.z) * fa.z > 0, 'rear to rear (each faces away from the other)');
  }
  for (const g of [0, 1, 2, 3, 4]) assert.ok(gaits.has(g), `gait ${g} shows up (sniff, walk, trot, run, tug)`);
  const moved = dogsAt(10).map((d, i) => Math.hypot(d.x - dogsAt(20)[i].x, d.z - dogsAt(20)[i].z));
  assert.ok(moved.every((v) => v > 0.3), 'they all get around, the pair included');
  // in the match: the snapshot carries them, enemies and bullets ignore them
  const m = at(1); run(m, 3);
  const s = m.snapshot(); assert.equal(s.dg.length, 6);
  dogsAt(m.t).forEach((d, i) => { assert.ok(Math.abs(s.dg[i][0] - d.x) < 0.01 && Math.abs(s.dg[i][1] - d.z) < 0.01); });
  assert.doesNotMatch(src('server/elhalo/match.js').match(/castRay\([\s\S]*?\n  \}/)[0], /dog/i, 'dogs are not in the hit checks');
});

test('one luchador in five is a volador; the wave roster still adds up', () => {
  for (const n of [1, 2, 4, 6, 9, 13]) {
    const r = L.waveRoster(n, 2, seeded(n)), lu = r.filter((x) => x === 'luchador').length, vo = r.filter((x) => x === 'volador').length;
    assert.equal(r.length, L.waveSize(n, 2));
    assert.equal(vo, Math.floor((lu + vo) / 5), `wave ${n}: ${vo} voladores for ${lu + vo} luchadors`);
  }
  assert.ok(L.ENEMIES.volador.leap && L.ENEMIES.volador.leap.windup >= 0.6 && L.ENEMIES.volador.leap.cool >= 5, 'a telegraphed leap with a cooldown');
});

test('the volador: crouch and ¡ÁGUILA!, a high server-side arc to where you stood, a shockwave that knocks you back', () => {
  const m = at(1, ['t']);
  const p = put(m, 't', 0, -30), v = foe(m, 'volador', 0, -18, { lcool: 0 }); const Lp = v.st.leap;
  m.tick(0.1);
  assert.ok(m.events.some((e) => e[0] === 'ag' && e[1] === v.id), 'the shout'); assert.equal(v.state, 'windup');
  m.events = []; let peak = -Infinity, landed = null;
  const shield0 = p.P.shield;
  for (let i = 0; i < 40 && !landed; i++) {
    m.tick(0.05); peak = Math.max(peak, v.y - terrain(v.x, v.z));
    if (v.leapS?.ph === 'wind') assert.equal(p.P.shield, shield0, 'no damage during the windup');
    landed = m.events.find((e) => e[0] === 'lx');
  }
  const lp = m.events.find((e) => e[0] === 'lp');
  assert.ok(lp && Math.hypot(lp[2] - 0, lp[4] + 30) < 0.5, 'the landing spot is where the target stood');
  assert.ok(peak > 3, `a big high arc (${peak.toFixed(1)} m up)`);
  assert.ok(landed, 'it lands'); assert.ok(p.P.shield < shield0, 'the shockwave hurts');
  assert.ok(m.events.some((e) => e[0] === 'kb' && e[1] === 't') && Math.hypot(p.x, p.z + 30) > 1.5 && p.corr, 'and throws you back');
  // cooldown: it can't do it again right away
  m.events = []; run(m, 2); assert.ok(!m.events.some((e) => e[0] === 'ag'), 'cooldown');
});

test('the volador can be dodged: get out of the ring before it lands', () => {
  const m = at(1, ['t']);
  const p = put(m, 't', 0, -30), v = foe(m, 'volador', 0, -18, { lcool: 0 });
  for (let i = 0; i < 40 && !v.leapS?.to; i++) m.tick(0.05);
  assert.ok(v.leapS?.ph === 'air');
  put(m, 't', 5, -31); const sh = p.P.shield, hp = p.P.health; // sidestep 5 m
  for (let i = 0; i < 40 && v.leapS; i++) m.tick(0.05);
  assert.equal(p.P.shield, sh); assert.equal(p.P.health, hp);
});

test('the volador only jumps where it can: never through a wall into a building', () => {
  const m = at(1, ['t']);
  put(m, 't', 15.5, 3); // inside La Michoacana
  const v = foe(m, 'volador', 15.5, 14, { lcool: 0, spd: 0 });
  for (let i = 0; i < 20; i++) { m.tick(0.1); assert.ok(!v.leapS, 'no leap from outside into the shop'); }
});

test('el gordo: ten luchadors of health, slow, from wave 3 (1-3 a wave), with a head to shoot', () => {
  const G = L.ENEMIES.gordo, Lu = L.ENEMIES.luchador;
  assert.equal(G.hp, Lu.hp * 10); assert.ok(G.speed < Lu.speed * 0.5, 'noticeably slower'); assert.ok(G.head && G.head.y > 1.8);
  assert.deepEqual([1, 2, 3, 6, 7, 10, 11, 20].map(L.gordos), [0, 0, 1, 1, 2, 2, 3, 3]);
  for (const n of [1, 2, 3, 7, 11, 16]) assert.equal(L.waveRoster(n, 1, seeded(n)).filter((x) => x === 'gordo').length, L.gordos(n), `wave ${n}`);
  // a headshot lands on its head and counts as one
  const m = at(3, ['t'], { calm: true });
  const p = put(m, 't', 0, -22), g = foe(m, 'gordo', 0, -34, { spd: 0, lcool: 99 });
  const h = L.headOf('gordo', g.x, g.y, g.z, g.yaw), o = { x: p.x, y: p.y + EYE, z: p.z }, c = { x: h.x - o.x, y: h.y - o.y, z: h.z - o.z }, l = Math.hypot(c.x, c.y, c.z);
  const hp0 = g.hp; m.events = [];
  m.input('t', { p: [p.x, p.y, p.z], ev: [['s', o.x, o.y, o.z, c.x / l, c.y / l, c.z / l]] }, 5000);
  assert.ok(m.events.some((e) => e[0] === 'hm' && e[1] === 't' && e[2] === 1), 'headshot'); assert.ok(hp0 - g.hp > L.WEAPONS.rifle.damage, 'extra damage');
  // heavy: a grenade barely shoves it
  const x0 = g.x, z0 = g.z; m.hurtEnemy(g, 10, 'grenade', p, { x: g.x, z: g.z + 2 });
  assert.ok(Math.hypot(g.x - x0, g.z - z0) < 0.25, 'heavy');
});

test('el gordo belly-flops: a clear windup, then two flops down a full-health player', () => {
  const m = at(3, ['t']);
  m.wave = 1; // damage at its base value
  const p = put(m, 't', 0, -30), g = foe(m, 'gordo', 0, -26, { lcool: 0 }); g.dmg = 1;
  const hits = []; let told = false;
  for (let i = 0; i < 200 && p.state === 'alive'; i++) {
    m.tick(0.05); if (m.events.some((e) => e[0] === 'ag' && e[1] === g.id)) told = true;
    if (m.events.some((e) => e[0] === 'lx')) { hits.push(Math.round(p.P.shield + p.P.health)); put(m, 't', 0, -30); g.recover = 0; g.lcool = 0; g.x = 0; g.z = -26; g.y = groundAt(0, -26, 50); }
    if (g.leapS?.ph === 'air') assert.ok(told, 'the windup is announced before it flies');
    m.events = [];
  }
  assert.ok(L.ENEMIES.gordo.leap.windup >= 1, 'a long tell');
  assert.equal(p.state, 'downed', `downed by the flops (${hits.join(' → ')})`); assert.ok(hits.length >= 1 && hits.length <= 2, `in two hits or fewer (${hits.length})`);
});

test('el gordo bear hug: arms out for a beat, then a huge squeeze, unless you step away', () => {
  const m = at(3, ['t']); m.wave = 1;
  const p = put(m, 't', 0, -30), g = foe(m, 'gordo', 0, -28.4, { lcool: 99 }); g.dmg = 1; g.cool = 0;
  m.tick(0.1); assert.equal(g.state, 'grab'); assert.ok(m.events.some((e) => e[0] === 'gb'));
  const sh = p.P.shield; run(m, L.ENEMIES.gordo.grab.windup * 0.5); assert.equal(p.P.shield, sh, 'the windup does nothing yet');
  run(m, L.ENEMIES.gordo.grab.windup); assert.ok(sh - p.P.shield >= 60 || p.P.health < 100, 'the squeeze');
  // dodged: step out of reach during the windup
  const m2 = at(3, ['t']); m2.wave = 1;
  const p2 = put(m2, 't', 0, -30), g2 = foe(m2, 'gordo', 0, -28.4, { lcool: 99 }); g2.cool = 0;
  m2.tick(0.1); assert.equal(g2.state, 'grab');
  put(m2, 't', 0, -34); run(m2, L.ENEMIES.gordo.grab.windup + 0.1);
  assert.equal(p2.P.shield, 100, 'missed');
});

test('voladores and gordos are drawn: their own models, poses, a health bar and the landing ring', () => {
  const models = src('client/src/mines/elhalo/models.js'), game = src('client/src/mines/elhalo/game.js');
  for (const k of ['makeVolador', 'makeGordo', 'makeDog', 'makeEloteCart', 'makeBubble', 'makeLandRing']) assert.match(models, new RegExp(`export function ${k}\\(`));
  assert.match(models, /ENEMY_MAKERS\.volador = makeVolador; ENEMY_MAKERS\.gordo = makeGordo/);
  assert.match(models, /huipil/, 'La Doña wears a flowered huipil');
  assert.match(models, /rebozo/, 'and a rebozo shawl');
  assert.match(models, /braid/, 'and braids with ribbons');
  assert.match(game, /¡ÁGUILA!/); assert.match(game, /st === 'leap'/); assert.match(game, /m\.bar/); assert.match(game, /dogsAt\(/);
  assert.match(game, /touch \? DOG_COUNT\.phone : DOG_COUNT\.free/, 'fewer dogs on phones');
  assert.match(game, /LA DOÑA/, 'HUD and killfeed say La Doña');
  assert.match(game, /¡TORTA!/);
  assert.match(src('client/src/mines/elhalo/audio.js'), /torta\(\)/);
});

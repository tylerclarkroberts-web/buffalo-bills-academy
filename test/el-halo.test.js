// EL HALO (Hall of Doors): the horde match. The rules (shields, guns, waves), the canyon map, the server-side match
// (waves scale, boards, damage and friendly fire, late joiners, input checks), the door, and guard rails on the source
// (original names only, its own lazy chunk, free play with no money, only /api/elhalo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../client/src/mines/elhalo/logic.js';
import { Match, EYE } from '../server/elhalo/match.js';
import { BUILDINGS, OPENINGS, BOARDS_MAX, BOUNDS, ENEMY_SPAWNS, PLAYER_SPAWNS, STATIONS, TRUCK, groundAt, terrain, creekX, insideSolid } from '../server/elhalo/map.js';
import { HALL_DOORS } from '../client/src/mines/doorHall.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'client/src/mines/elhalo');
const SDIR = path.join(ROOT, 'server/elhalo');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// a match with players already standing where we want them (and past the lobby: the host hit start)
function setup(names = ['t', 'j'], seed = 7, { lobby = false } = {}) {
  const m = new Match({ rnd: seeded(seed) });
  for (const n of names) assert.ok(m.join(n, { name: n.toUpperCase(), nowMs: 0 }).ok);
  if (!lobby) { assert.equal(m.phase, 'lobby'); assert.ok(m.begin(names[0]).ok); }
  return m;
}
const put = (m, id, x, z) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = groundAt(x, z, 50, m.bars); p.hist = []; return p; };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
const toWave = (m, n) => { m.wave = n - 1; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1); assert.equal(m.wave, n); };
// a shot from a's eye at b's chest
function shotAt(a, b) {
  const o = { x: a.x, y: a.y + EYE, z: a.z }, c = { x: b.x - o.x, y: b.y + 1 - o.y, z: b.z - o.z }, l = Math.hypot(c.x, c.y, c.z);
  return ['s', o.x, o.y, o.z, c.x / l, c.y / l, c.z / l];
}

test('shield soaks damage first, the rest goes to health, and a big hit says the shield broke', () => {
  const p = L.createPlayer();
  let r = L.applyDamage(p, 30, 1);
  assert.deepEqual([p.shield, p.health, r.toShield, r.toHealth, r.shieldBroke], [70, 100, 30, 0, false]);
  r = L.applyDamage(p, 90, 2);
  assert.deepEqual([p.shield, p.health, r.toShield, r.toHealth, r.shieldBroke], [0, 80, 70, 20, true]);
  r = L.applyDamage(p, 10, 3);
  assert.equal(r.shieldBroke, false, 'already down');
  assert.equal(p.health, 70);
  r = L.applyDamage(p, 500, 4);
  assert.ok(r.dead && p.dead && p.health === 0);
  assert.equal(L.applyDamage(p, 5, 5).toHealth, 0, 'nothing more happens to the dead');
});

test('shield waits for the delay after the last hit, then recharges to full; health never regenerates', () => {
  const p = L.createPlayer();
  L.applyDamage(p, 150, 10); // shield 0, health 50
  assert.equal(L.tickShield(p, 10 + L.SHIELD.delay - 0.01, 0.1), null);
  assert.equal(p.shield, 0);
  assert.equal(L.tickShield(p, 10 + L.SHIELD.delay + 0.001, 0.5), 'charging');
  assert.ok(Math.abs(p.shield - L.SHIELD.rate * 0.5) < 1e-9);
  L.applyDamage(p, 5, 20); // a new hit restarts the wait
  assert.equal(L.tickShield(p, 21, 0.5), null);
  let t = 20 + L.SHIELD.delay, last = null;
  for (let i = 0; i < 200 && last !== 'full'; i++) { t += 0.1; last = L.tickShield(p, t, 0.1); }
  assert.equal(last, 'full'); assert.equal(p.shield, L.SHIELD.max);
  assert.equal(p.health, 50);
  L.heal(p, 70); assert.equal(p.health, L.HEALTH.max);
});

test('guns: fire rate, magazine, auto-reload from the reserve, swap cancels a reload', () => {
  const p = L.createPlayer(), w = L.WEAPONS.rifle;
  assert.equal(L.tryFire(p, 0), true);
  assert.equal(L.tryFire(p, 0.01), false, 'faster than the rate of fire');
  let t = 0, fired = 1;
  while (p.weapons.rifle.mag > 0) { t += 1 / w.rate; if (L.tryFire(p, t)) fired++; }
  assert.equal(fired, w.mag);
  assert.ok(L.reloading(p, t), 'empty magazine reloads by itself');
  assert.equal(L.tryFire(p, t + 0.1), false);
  L.tickReload(p, t + w.reload);
  assert.deepEqual([p.weapons.rifle.mag, p.weapons.rifle.reserve], [w.mag, w.reserve - w.mag]);
  // partial reload, then swapping mid-reload cancels it
  L.tryFire(p, t + w.reload + 1); assert.equal(L.startReload(p, t + 10), true);
  L.swapWeapon(p); assert.equal(p.current, 'pistol'); assert.equal(p.weapons.rifle.reloadUntil, 0);
  L.swapWeapon(p); assert.equal(p.weapons.rifle.mag, w.mag - 1);
  // out of everything
  const q = L.createPlayer(); q.weapons.rifle.mag = 0; q.weapons.rifle.reserve = 0;
  assert.equal(L.tryFire(q, 0), false); assert.equal(L.startReload(q, 0), false);
  L.addAmmo(q, 'rifle', 64); assert.equal(q.weapons.rifle.reserve, 64);
  L.addAmmo(q, 'rifle', 9999); assert.equal(q.weapons.rifle.reserve, w.reserve * 2, 'reserve is capped');
});

test('piñata grenades, splash falloff, smack cooldown', () => {
  const p = L.createPlayer();
  assert.equal(p.nades.frag, L.GRENADES.start); assert.equal(p.nades.sticky, L.STICKY.start);
  assert.ok(L.throwGrenade(p) && L.throwGrenade(p)); assert.equal(L.throwGrenade(p), false);
  assert.equal(L.throwGrenade(p, 'sticky'), false, 'no stickies until you find some');
  assert.equal(L.addGrenade(p, 10), L.GRENADES.max); assert.equal(L.addGrenade(p), 0);
  assert.equal(L.addGrenade(p, 5, 'sticky'), L.STICKY.max, 'a small carry cap'); assert.ok(L.throwGrenade(p, 'sticky'));
  assert.equal(L.splash(0), L.GRENADES.damage); assert.equal(L.splash(L.GRENADES.radius), 0);
  assert.ok(L.splash(1) > L.splash(3) && L.splash(3) > 0);
  assert.equal(L.tryMelee(p, 5), true); assert.equal(L.tryMelee(p, 5 + L.MELEE.cooldown / 2), false); assert.equal(L.tryMelee(p, 5 + L.MELEE.cooldown), true);
});

test('the horde: luchadors rush, mariachis shoot, farmers soak, priests bless; waves get bigger, tougher and more mixed', () => {
  assert.deepEqual([...L.ENEMY_TYPES].sort(), ['chupacabra', 'cucuy', 'granjero', 'lechuza', 'llorona', 'luchador', 'mariachi', 'nahual', 'padre']);
  assert.ok(L.ENEMIES.luchador.speed > L.ENEMIES.mariachi.speed && L.ENEMIES.luchador.tackle, 'luchadors are the fast tacklers');
  assert.ok(L.ENEMIES.mariachi.note, 'mariachis shoot notes');
  assert.ok(L.ENEMIES.granjero.hp > 2 * L.ENEMIES.luchador.hp && L.ENEMIES.granjero.tear < L.ENEMIES.luchador.tear, 'farmers are tanky and rip boards fast');
  assert.ok(L.ENEMIES.padre.bless, 'priests heal and hurry the others');
  assert.deepEqual([...new Set(L.waveRoster(1, 1, seeded()))].sort(), ['granjero', 'luchador']);
  assert.ok(L.waveRoster(2, 1, seeded()).includes('mariachi') && !L.waveRoster(3, 1, seeded()).includes('padre'));
  assert.ok(L.waveRoster(4, 1, seeded()).includes('padre'));
  assert.ok(!L.waveRoster(4, 1, seeded()).includes('chupacabra') && L.waveRoster(5, 1, seeded()).includes('chupacabra'), 'chupacabras from wave 5');
  for (let n = 1; n < 20; n++) {
    assert.ok(L.waveSize(n + 1) > L.waveSize(n) || L.waveSize(n) === 90, `wave ${n + 1} is bigger (until the cap)`);
    assert.ok(L.waveScale(n + 1).hp > L.waveScale(n).hp, `wave ${n + 1} is tougher`);
    assert.ok(L.waveScale(n + 1).gap <= L.waveScale(n).gap, `wave ${n + 1} comes faster`);
  }
  assert.ok(L.waveSize(5, 3) > L.waveSize(5, 1), 'more players, more enemies');
  assert.equal(L.waveRoster(6, 2, seeded()).length, L.waveSize(6, 2));
  assert.ok(L.killPoints('luchador', 'melee') > L.killPoints('luchador', 'gun'));
  assert.equal(L.waveBonus(3), 150);
});

test('geometry helpers: rays hit spheres and boxes, circles get pushed out of boxes', () => {
  const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: -1 };
  assert.ok(Math.abs(L.raySphere(o, d, { x: 0, y: 0, z: -10 }, 1) - 9) < 1e-9);
  assert.equal(L.raySphere(o, d, { x: 3, y: 0, z: -10 }, 1), Infinity);
  assert.equal(L.raySphere(o, d, { x: 0, y: 0, z: 10 }, 1), Infinity, 'behind you');
  const b = { x0: -1, x1: 1, y0: -1, y1: 1, z0: -6, z1: -4 };
  assert.ok(Math.abs(L.rayBox(o, d, b) - 4) < 1e-9);
  assert.equal(L.rayBox(o, { x: 1, y: 0, z: 0 }, b), Infinity);
  assert.deepEqual(L.pushOut(1.2, -5, 0.5, b), { x: 1.5, z: -5 });
  assert.equal(L.pushOut(3, -5, 0.5, b), null);
  const inside = L.pushOut(0.9, -5, 0.3, b); assert.ok(Math.abs(inside.x - 1.3) < 1e-9);
});

test('the canyon: two forts at the ends, a creek, three buildings with boardable windows, spawns in bounds', () => {
  assert.deepEqual(BUILDINGS.map((b) => b.id), ['mision', 'hacienda', 'mansion']);
  for (const b of BUILDINGS) {
    const ops = OPENINGS.filter((o) => o.b === b.id);
    assert.ok(ops.length >= 4, `${b.id} has ${ops.length} openings`);
    assert.ok(ops.some((o) => o.door), `${b.id} has a door`);
    assert.ok(STATIONS.some((s) => s.b === b.id && s.cost > 0), `${b.id} has a buy station`);
  }
  for (const z of [-40, -30, 20, 40]) { const c = creekX(z); assert.ok(terrain(c, z) < (terrain(c - 5, z) + terrain(c + 5, z)) / 2 - 0.5, `the creek runs low at z ${z}`); }
  for (const [x, z] of [...ENEMY_SPAWNS, ...PLAYER_SPAWNS]) {
    assert.ok(x >= BOUNDS.x0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1, `spawn ${x},${z}`);
    assert.ok(!insideSolid({ x, z, y: groundAt(x, z, 50) + 0.5 }), `spawn ${x},${z} is not inside a wall`);
  }
  assert.ok(PLAYER_SPAWNS.some(([, z]) => z < -30) && PLAYER_SPAWNS.some(([, z]) => z > 30), 'a base at each end');
});

test('match: first player starts a countdown, waves spawn, clear pays a bonus, and each wave is bigger', () => {
  const m = setup(['t']);
  assert.equal(m.phase, 'break');
  m.calm = true;
  run(m, L.MATCH.lobbyCountdown + 0.2);
  assert.equal(m.phase, 'wave'); assert.equal(m.wave, 1);
  const size1 = m.queue.length + m.enemies.length;
  assert.equal(size1, L.waveSize(1, 1));
  run(m, 20);
  assert.ok(m.enemies.length > 0 && m.enemies.length <= L.MATCH.maxAlive, 'enemies come out, capped');
  const t = m.players.get('t'), before = t.pts;
  m.queue = []; for (const e of m.enemies) e.dead = true; m.tick(0.1); m.tick(0.1);
  assert.equal(m.phase, 'truck', 'the supply truck comes through between waves'); assert.equal(t.pts, before + L.waveBonus(1));
  run(m, TRUCK.secs + L.MATCH.breakSecs + 0.4);
  assert.equal(m.wave, 2); assert.equal(m.queue.length + m.enemies.length, L.waveSize(2, 1));
  toWave(m, 9);
  const big = m.queue.length;
  run(m, 60);
  assert.ok(m.enemies.length <= L.MATCH.maxAlive, `never more than ${L.MATCH.maxAlive} alive (${m.enemies.length})`);
  assert.ok(big > size1 * 3, 'wave 9 is much bigger than wave 1');
  assert.ok(m.enemies.every((e) => e.maxHp >= Math.round(L.ENEMIES[e.type].hp * L.waveScale(9).hp)), 'and tougher');
});

test('match: the horde breaks boards, holding ACTION rebuilds one plank at a time for points (capped per round)', () => {
  const m = setup(['t']); toWave(m, 1); m.queue = []; m.enemies = []; m.calm = true;
  const far = m.spawn('granjero'); far.x = 0; far.z = 60; far.spd = 0; // keeps the wave open
  const op = OPENINGS.find((o) => o.b === 'hacienda' && !o.door);
  m.bars[op.i] = 0;
  const t = put(m, 't', op.in.x, op.in.z);
  m.tick(0.1);
  assert.equal(m.personal('t').pr.k, 'build');
  const pts = t.pts;
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 100);
  run(m, L.MATCH.buildSecs + 0.05);
  assert.equal(m.bars[op.i], 1, 'one plank after one build time');
  run(m, L.MATCH.buildSecs * 6);
  assert.equal(m.bars[op.i], BOARDS_MAX, 'stops at full');
  assert.equal(t.pts, pts + BOARDS_MAX * L.MATCH.points.board);
  // let go and nothing more happens; points per round are capped
  m.input('t', { p: [t.x, t.y, t.z], act: false }, 300);
  let total = BOARDS_MAX; m.bars[op.i] = 0; m.input('t', { p: [t.x, t.y, t.z], act: true }, 400);
  for (let k = 0; k < 12; k++) { run(m, L.MATCH.buildSecs * 5.2); total += m.bars[op.i]; m.bars[op.i] = 0; }
  assert.equal(t.pts, pts + L.MATCH.points.boardsPerRound * L.MATCH.points.board, 'board points cap per round');
  // a body in the window blocks the rebuild
  m.bars[op.i] = 0; const e = m.spawn('luchador'); e.x = op.x; e.z = op.z; e.spd = 0;
  run(m, 2);
  assert.equal(m.bars[op.i], 0, 'no boarding up through an enemy');
  // and enemies tear boards to get in
  const m2 = setup(['t']); toWave(m2, 1); m2.queue = []; m2.enemies = []; m2.calm = true;
  const in2 = put(m2, 't', 15.5, 3); // inside the hacienda
  const lu = m2.spawn('granjero'); lu.x = op.out.x; lu.z = op.out.z - 0.5; lu.y = groundAt(lu.x, lu.z, 50, m2.bars);
  run(m2, 6);
  assert.ok(m2.bars.some((b) => b < BOARDS_MAX), 'a farmer pulled planks off');
  assert.ok(in2);
});

test('match: shots hurt enemies and friends alike; a PVP down is credited; revive with ACTION; game over when everyone is down', () => {
  const m = setup(['t', 'j']); toWave(m, 1); m.queue = []; m.enemies = [];
  const t = put(m, 't', 3, -6), j = put(m, 'j', 3, 0);
  let now = 100;
  m.input('j', { p: [j.x, j.y, j.z], ev: [shotAt(j, t)] }, now += 100);
  assert.ok(t.P.shield < 100, 'friendly fire lands');
  for (let k = 0; k < 60 && t.state === 'alive'; k++) m.input('j', { p: [j.x, j.y, j.z], ev: [shotAt(j, t)] }, now += 150);
  assert.equal(t.state, 'downed');
  assert.equal(j.pvp, 1); assert.equal(t.deaths, 1);
  const s = m.snapshot();
  assert.ok(s.ev.some((e) => e[0] === 'pvp' && e[1] === 'j' && e[2] === 't'));
  assert.equal(s.pl.find((r) => r[0] === 't')[7] & 2, 2, 'snapshot flags him downed');
  // a downed player cannot shoot
  const jShield = j.P.shield; m.input('t', { p: [t.x, t.y, t.z], ev: [shotAt(t, j)] }, now += 150); assert.equal(j.P.shield, jShield);
  // Joe picks him up
  put(m, 'j', t.x + 1, t.z);
  m.input('j', { p: [j.x, j.y, j.z], act: true }, now += 100);
  run(m, L.MATCH.reviveSecs + 0.2);
  assert.equal(t.state, 'alive'); assert.ok(t.P.health > 0);
  // an enemy takes hits and dies for points
  const e = m.spawn('luchador'); e.x = 3; e.z = -12; e.y = groundAt(3, -12, 50, m.bars); e.spd = 0; e.hist = [];
  put(m, 'j', 3, -3); const pts = j.pts;
  for (let k = 0; k < 40 && !e.dead; k++) { const o = { x: j.x, y: j.y + EYE, z: j.z }, c = { x: e.x - o.x, y: e.y + 1 - o.y, z: e.z - o.z }, l = Math.hypot(c.x, c.y, c.z); m.input('j', { p: [j.x, j.y, j.z], ev: [['s', o.x, o.y, o.z, c.x / l, c.y / l, c.z / l]] }, now += 150); }
  assert.ok(e.dead, 'the luchador went down'); assert.equal(j.kills, 1); assert.ok(j.pts > pts + L.ENEMIES.luchador.points);
  // everyone down: game over, then a fresh match
  for (const p of [t, j]) { p.state = 'downed'; p.until = m.t + 99; }
  m.tick(0.1);
  assert.equal(m.phase, 'over'); assert.ok(m.last.board.length === 2 && m.last.wave === 1);
  run(m, L.MATCH.overSecs + 0.2);
  assert.equal(m.phase, 'lobby', 'back to the lobby for the next one'); assert.equal(m.wave, 0); assert.equal(j.kills, 0); assert.equal(t.state, 'alive');
});

test('match: a late joiner gets the live wave, enemies, boards and players in the very next snapshot', () => {
  const m = setup(['t']); m.calm = true; toWave(m, 3);
  run(m, 8);
  m.bars[7] = 1; m.bars[12] = 3;
  const k = m.join('k', { name: 'Kash', nowMs: 0 });
  assert.ok(k.ok); assert.equal(m.players.get('k').state, 'alive');
  const s = m.snapshot(), me = m.personal('k');
  assert.equal(s.wv, 3); assert.equal(s.ph, 'wave');
  assert.ok(s.en.length > 0 && s.en.length === m.enemies.length);
  assert.equal(s.bd[7], 1); assert.equal(s.bd[12], 3);
  assert.deepEqual(s.pl.map((r) => r[1]).sort(), ['Kash', 'T']);
  assert.ok(me.in && me.corr, 'the newcomer is told where they spawned');
  assert.ok(s.ev.some((e) => e[0] === 'j' && e[1] === 'k'));
  assert.ok(JSON.stringify(s).length < 7000, 'snapshot stays small');
  // nine is a crowd
  const full = setup(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.equal(full.join('i', { name: 'I' }).error, 'full');
  // leaving, dropping offline and an empty match resetting
  m.leave('k'); assert.equal(m.players.get('k').joined, false);
  m.setOnline('t', false); run(m, L.MATCH.offlineDropSecs + 0.2);
  assert.ok(!m.players.get('t')?.joined, 'gone quiet: dropped from the match');
  run(m, L.MATCH.emptyResetSecs + 0.2);
  assert.equal(m.phase, 'idle'); assert.equal(m.wave, 0); assert.equal(m.enemies.length, 0);
  assert.ok(m.bars.every((b, i) => b === (OPENINGS[i].open ? 0 : BOARDS_MAX)));
});

test('match: inputs are checked: speed, bounds, walls, junk, fire rate and message rate', () => {
  const m = setup(['t']); toWave(m, 1); m.queue = []; m.enemies = [];
  const t = put(m, 't', 2, -8); m.personal('t');
  let now = 1000;
  const send = (msg) => m.input('t', msg, (now += 100));
  // a normal step is fine
  send({ p: [2, groundAt(2, -8.6, 50), -8.6] }); assert.ok(Math.abs(t.z - -8.6) < 1e-9); assert.equal(m.personal('t').corr, undefined);
  // teleporting is refused and corrected
  send({ p: [2, t.y, 10] }); assert.ok(Math.abs(t.z - -8.6) < 1e-9); assert.ok(m.personal('t').corr);
  // out of the canyon
  put(m, 't', 23.5, -8); send({ p: [26, t.y, -8] }); assert.equal(t.x, 23.5);
  // through a mission wall (outside the west wall heading in, no opening there)
  const wallZ = -24, xOut = -20.8; put(m, 't', xOut, wallZ);
  send({ p: [xOut + 1.2, t.y + 0.1, wallZ] }); assert.equal(t.x, xOut, 'no walking through walls');
  send({ p: [xOut + 1.2, groundAt(xOut + 1.2, wallZ, 50), wallZ] }); assert.equal(t.x, xOut, 'no hopping up onto the roof');
  // through a full set of boards
  const op = OPENINGS.find((o) => o.b === 'hacienda' && !o.door); put(m, 't', op.out.x, op.out.z);
  send({ p: [op.in.x, groundAt(op.in.x, op.in.z, 50), op.in.z] }); assert.equal(t.x, op.out.x); assert.equal(t.z, op.out.z);
  // junk does no harm
  for (const junk of [null, 5, 'x', { p: ['a', 1, 2] }, { p: [NaN, 0, 0], yaw: Infinity }, { ev: [['s', 'x']] }, { ev: 'nope' }, { w: 'rocket' }]) assert.ok(m.input('t', junk, (now += 100)));
  assert.ok(Number.isFinite(t.x) && Number.isFinite(t.yaw) && t.w === 'rifle');
  // fire rate: 24 shots in one message only spend the bucket (and a full magazine is never more than that)
  const before = t.P.weapons.rifle.mag; send({ ev: Array.from({ length: 24 }, () => ['s', t.x, t.y + EYE, t.z, 0, 0, -1]) });
  assert.ok(before - t.P.weapons.rifle.mag <= 3, `burst capped (${before - t.P.weapons.rifle.mag} fired)`);
  // a shot from far away from your own head is ignored
  const j = m.join('j', { name: 'J' }).player; put(m, 'j', t.x, t.z - 4); const sh = j.P.shield;
  now += 2000; send({ ev: [['s', t.x, t.y + EYE + 6, t.z, 0, -0.8, -0.6]] }); assert.equal(j.P.shield, sh);
  // message rate: over 30 a second gets a 429
  let r; for (let k = 0; k < 40; k++) r = m.input('t', {}, now + k * 5);
  assert.equal(r.status, 429);
  assert.equal(m.input('nobody', {}, now).error, 'not in the match');
});

test('the door: El Halo opens its own lazily loaded room; free play, no money, only its own /api/elhalo', () => {
  const d = HALL_DOORS.find((x) => x.id === 'elhalo');
  assert.ok(d && d.open && d.name === 'EL HALO' && d.style === 'sol');
  assert.ok(!HALL_DOORS.some((x) => x.id === 'ringworld'));
  assert.equal(HALL_DOORS.filter((x) => !x.open).length, 6);
  assert.match(src('client/src/mines/mines.css'), /\.s-sol\s*\{/);
  const hall = src('client/src/mines/DoorHall.jsx');
  assert.match(hall, /lazy\(\(\) => import\('\.\/elhalo\/ElHaloRoom\.jsx'\)\)/);
  assert.doesNotMatch(hall, /^import .*elhalo/m, 'no static import of the game');
  assert.match(hall, /inside === 'elhalo'/);
  for (const [dir, f] of [...fs.readdirSync(DIR).map((f) => [DIR, f]), ...fs.readdirSync(SDIR).map((f) => [SDIR, f])]) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const u of s.match(/\/api\/[a-z/]*/g) || []) assert.match(u, /^\/api\/elhalo/, `${f} only talks to /api/elhalo (${u})`);
    assert.doesNotMatch(s, /bankroll|canBet|wager|\bbet\b|ledger|balance/i, `${f} has no money in it`);
    // the one recording is Tyler's own background track, served from client/public; everything else is generated
    assert.doesNotMatch(s.replaceAll('/elhalo/musica.mp3', ''), /\.(mp3|ogg|wav|m4a|glb|gltf|fbx)\b/i, `${f} loads no outside media; it is all generated`);
  }
  assert.doesNotMatch(src('server/mines.js'), /elhalo|el halo/i);
  assert.match(src('server/app.js'), /elhalo\.mount\(api, needPlayer\)/, 'signed-in players only');
});

test('El Halo is its own thing: no names, maps, characters or vehicles borrowed from any other shooter', () => {
  const banned = /master\s*chief|spartan|covenant|\belites?\b|\bgrunts?\b|\bjackals?\b|\bhunters?\b|warthog|ghost|banshee|scorpion|pelican|cortana|flood|forerunner|unsc|\bonis?\b|needler|plasma|energy sword|bungie|343|\bmjolnir\b|chief|blood\s*gulch|\bgulch\b|halo\s*(ce|2|3|infinite|reach)/i;
  for (const [dir, f] of [...fs.readdirSync(DIR).map((f) => [DIR, f]), ...fs.readdirSync(SDIR).map((f) => [SDIR, f])]) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), banned, f);
  assert.doesNotMatch(src('scripts/e2e-el-halo.mjs'), banned);
});

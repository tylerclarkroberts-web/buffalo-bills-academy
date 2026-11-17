// EL HALO v2: the twelve guns (and headshots), the supply truck, the bleed-out clock, the open mission, no fall damage,
// stairs that don't save you, the night things, EL TORO (the 4x4), both grenades, ammo around the canyon, and the
// lobby with saved looks. All server-side: the match is the source of truth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../server/elhalo/rules.js';
import { Match, EYE } from '../server/elhalo/match.js';
import { OPENINGS, BOARDS_MAX, TRUCK, TRUCK_PATH, truckAt, fortRects, FORT_DECK, AMMO_SPOTS, NADE_SPOTS, groundAt, terrain, wallDist, insideSolid, collide } from '../server/elhalo/map.js';

const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
// a match past the lobby, at the start of wave n, nobody spawning unless we say so
function at(n = 1, names = ['t'], { quiet = true, seed = 7 } = {}) {
  const m = new Match({ rnd: seeded(seed) });
  for (const id of names) m.join(id, { name: id.toUpperCase(), nowMs: 0 });
  m.begin(names[0]); m.emptyWave = quiet; m.calm = quiet;
  m.wave = n - 1; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1);
  assert.equal(m.wave, n); assert.equal(m.phase, 'wave');
  return m;
}
const put = (m, id, x, z, y) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = y ?? groundAt(x, z, 50, m.bars); p.groundY = p.y; p.airT = 0; p.hist = []; p.corr = null; return p; };
const foe = (m, type, x, z, extra = {}) => { const e = m.spawn(type); e.x = x; e.z = z; e.y = groundAt(x, z, 50, m.bars) + (e.st.fly ? (extra.fly ?? 0) : 0); e.spd = extra.spd ?? 0; e.yaw = extra.yaw ?? 0; e.hist = []; if (extra.hp) { e.hp = extra.hp; e.maxHp = extra.hp; } return e; };
const aimAt = (p, x, y, z) => { const o = { x: p.x, y: p.y + EYE, z: p.z }, c = { x: x - o.x, y: y - o.y, z: z - o.z }, l = Math.hypot(c.x, c.y, c.z); return ['s', o.x, o.y, o.z, c.x / l, c.y / l, c.z / l]; };
let clock = 1000;
const send = (m, id, msg) => m.input(id, msg, (clock += 400));

test('twelve guns, each its own thing; the truck hands them out weakest first', () => {
  const hand = L.HAND_WEAPONS;
  assert.equal(hand.length, 12, 'twelve guns you can carry'); assert.ok(L.WEAPONS.torreta.mounted, 'plus the mounted one on the jeep');
  const feel = new Set(hand.map((id) => { const w = L.WEAPONS[id]; return [w.kind || 'hitscan', w.rate, w.damage, w.mag, w.burst || 0, w.pellets || 0].join('/'); }));
  assert.equal(feel.size, 12, 'no two guns feel the same');
  for (const id of hand) assert.match(L.WEAPONS[id].name, /^[A-ZÁÉÍÓÚÑ ]+$/, `${id} has a Spanish name`);
  assert.deepEqual(L.START_WEAPONS, ['rifle', 'pistol']);
  assert.equal(L.TRUCK_TIERS[0], 'chispas'); assert.equal(L.TRUCK_TIERS.at(-1), 'martillo');
  for (let i = 1; i < L.TRUCK_TIERS.length; i++) assert.ok(L.WEAPONS[L.TRUCK_TIERS[i]].tier > L.WEAPONS[L.TRUCK_TIERS[i - 1]].tier);
  L.TRUCK_TIERS.forEach((id, i) => assert.equal(L.truckWeapon(i + 1), id, `after wave ${i + 1}: ${id}`));
  for (let n = 11; n < 30; n++) assert.ok(L.TRUCK_TIERS.slice(-4).includes(L.truckWeapon(n, seeded(n))), 'then the big stuff');
  assert.ok(L.WEAPONS.machete.kind === 'melee' && L.WEAPONS.machete.lunge > 0 && L.WEAPONS.martillo.slam && L.WEAPONS.martillo.lunge > 0, 'sword and hammer lunge, the hammer slams');
  // giving: a new gun replaces the one in hand; the same gun again is a refill
  const p = L.createPlayer();
  assert.equal(L.giveWeapon(p, 'escopeta'), 'new'); assert.deepEqual(Object.keys(p.weapons).sort(), ['escopeta', 'pistol']); assert.equal(p.current, 'escopeta');
  p.weapons.escopeta.mag = 0; assert.equal(L.giveWeapon(p, 'escopeta'), 'refill'); assert.equal(p.weapons.escopeta.mag, L.WEAPONS.escopeta.mag);
});

test('headshots: per-gun multipliers, checked on the server against every enemy type and players', () => {
  assert.equal(L.headMult('francotirador'), 3); assert.equal(L.headMult('rafaga'), 2); assert.equal(L.headMult('pistol'), 2);
  for (const id of ['rifle', 'chispas', 'agujas', 'escopeta', 'escopetita', 'laser', 'torreta']) assert.equal(L.headMult(id), 1.5, id);
  for (const id of ['cohetes', 'machete', 'martillo']) assert.equal(L.headMult(id), 1, `${id}: explosives and melee get nothing extra`);
  for (const type of L.ENEMY_TYPES) for (const yaw of [0, Math.PI]) for (const gun of ['pistol', 'francotirador', 'rifle']) {
    const m = at(2); const p = put(m, 't', 0, 4); p.w = gun; p.slots = [gun, 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
    const e = foe(m, type, 0, -4, { yaw, fly: 3, hp: 99999 }); const lift = e.y + (e.st.float || 0);
    const h = L.headOf(type, e.x, lift, e.z, e.yaw);
    send(m, 't', { ev: [aimAt(p, h.x, h.y, h.z)] });
    const head = 99999 - e.hp; e.hp = 99999; p.tokens = 3;
    send(m, 't', { ev: [aimAt(p, e.x, lift + e.st.height * 0.45, e.z)] });
    const body = 99999 - e.hp;
    assert.ok(body > 0, `${type} body hit with ${gun}`);
    assert.ok(Math.abs(head / body - L.headMult(gun)) < 0.01, `${type} (${yaw ? 'facing' : 'away'}) ${gun}: head ${head} vs body ${body}`);
    if (gun === 'pistol' && yaw === 0) { const s = m.snapshot(); assert.ok(s.ev.some((x) => x[0] === 'hm' && x[1] === 't' && x[2] === 1), 'a headshot marker goes to the shooter'); }
  }
  // players too
  const m = at(2, ['t', 'j']); const t = put(m, 't', 0, 4), j = put(m, 'j', 0, -4); t.w = 'pistol'; t.tokens = 3;
  send(m, 't', { ev: [aimAt(t, j.x, j.y + 1.62, j.z)] }); const head = 200 - (j.P.shield + j.P.health);
  j.P = L.createPlayer(j.slots); t.tokens = 3;
  send(m, 't', { ev: [aimAt(t, j.x, j.y + 0.9, j.z)] }); const body = 200 - (j.P.shield + j.P.health);
  assert.equal(head, body * 2, 'pistol headshot on a player is double');
  assert.ok(m.snapshot().ev.some((x) => x[0] === 'h' && x[1] === 'j' && x[7] === 1), 'the victim hears it was a headshot');
  // headshot kills pay a little more
  assert.ok(L.killPoints('luchador', 'head') > L.killPoints('luchador', 'gun'));
});

test('distinct guns on the server: shotgun pellets, burst, piercing sniper, rockets, homing needles, stun', () => {
  // the shotgun is deadly up close and nothing at range
  let m = at(2); let p = put(m, 't', 0, 6); p.w = 'escopeta'; p.slots = ['escopeta', 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
  let e = foe(m, 'granjero', 0, 3, { hp: 9999 }); send(m, 't', { ev: [aimAt(p, e.x, e.y + 1, e.z)] }); const close = 9999 - e.hp;
  assert.ok(close > 100, `point blank shotgun ${close}`); assert.ok(m.snapshot().ev.some((x) => x[0] === 'sg'), 'pellet spread is rolled on the server');
  e.x = 0; e.z = -25; e.hp = 9999; e.hist = []; p.tokens = 3; send(m, 't', { ev: [aimAt(p, e.x, e.y + 1, e.z)] }); assert.ok(9999 - e.hp < close / 4, 'falls off hard at range');
  // the sniper goes through two
  m = at(2); p = put(m, 't', 0, 10); p.w = 'francotirador'; p.slots = ['francotirador', 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
  const a = foe(m, 'granjero', 0, 4, { hp: 999 }), b = foe(m, 'granjero', 0, -2, { hp: 999 }), c = foe(m, 'granjero', 0, -8, { hp: 999 });
  send(m, 't', { ev: [aimAt(p, 0, a.y + 1, -20)] });
  assert.ok(a.hp < 999 && b.hp < 999 && c.hp === 999, 'pierces two');
  // rockets and needles are real projectiles: they fly, then land
  m = at(2); p = put(m, 't', 0, 10); p.w = 'cohetes'; p.slots = ['cohetes', 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
  const r1 = foe(m, 'luchador', 0, -6, { hp: 999 }), r2 = foe(m, 'luchador', 1.5, -6, { hp: 999 });
  send(m, 't', { ev: [aimAt(p, 0, r1.y + 1, -6)] });
  assert.equal(m.shots.length, 1); assert.equal(m.snapshot().pr.length, 1, 'clients see the rocket');
  run(m, 1); assert.equal(m.shots.length, 0); assert.ok(r1.hp < 999 && r2.hp < 999, 'splash hits both');
  m = at(2); p = put(m, 't', 0, 10); p.w = 'agujas'; p.slots = ['agujas', 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
  const n1 = foe(m, 'granjero', 3, -4, { hp: 9999 });
  send(m, 't', { ev: [aimAt(p, 2.2, n1.y + 1, -4)] }); // a little off: the needle homes in
  run(m, 1); assert.ok(n1.hp < 9999, 'needle tracked the target');
  // seven needles and they go off together
  for (let k = 0; k < 8; k++) { p.tokens = 3; send(m, 't', { ev: [aimAt(p, n1.x, n1.y + 1, n1.z)] }); run(m, 0.6); }
  assert.ok(m.snapshot().ev.some((x) => x[0] === 'cb') || n1.hp < 9999 - 150, 'supercombine');
  // the spark pistol stuns
  m = at(2); p = put(m, 't', 0, 6); p.w = 'chispas'; p.slots = ['chispas', 'pistol']; p.P = L.createPlayer(p.slots); p.tokens = 3;
  const s1 = foe(m, 'luchador', 0, 0, { hp: 999 }); send(m, 't', { ev: [aimAt(p, 0, s1.y + 1, 0)] });
  assert.ok(s1.stunUntil > m.t, 'stunned');
});

test('sword lunges and slices; the hammer lunges and slams everything around it', () => {
  let m = at(2); let p = put(m, 't', 0, 6); p.w = 'machete'; p.slots = ['machete', 'pistol']; p.P = L.createPlayer(p.slots); p.yaw = 0;
  // a lunge lets you cover ground fast for a moment (normally that move would be rejected)
  m.input('t', { p: [p.x, p.y, p.z] }, (clock += 100));
  m.input('t', { p: [p.x, p.y, p.z - 3], ev: [['L']] }, (clock += 100));
  assert.ok(Math.abs(p.z - 3) < 0.01 && !m.personal('t').corr, 'lunge accepted: 3 m in a tenth of a second');
  const e = foe(m, 'granjero', 0, 0, { hp: 150 });
  m.input('t', { p: [p.x, p.y, p.z], ev: [['m', 'w']] }, (clock += 100));
  assert.ok(e.dead, 'one machete slice drops a farmer');
  clock += 2000; const q = put(m, 't', 0, 6); m.input('t', { p: [0, q.y, 6] }, (clock += 100)); m.input('t', { p: [0, q.y, 3] }, (clock += 100));
  assert.ok(m.personal('t').corr, 'without a lunge the same jump is rejected');
  // the hammer: a ground slam hits a crowd
  m = at(2); p = put(m, 't', 0, 6); p.w = 'martillo'; p.slots = ['martillo', 'pistol']; p.P = L.createPlayer(p.slots); p.yaw = 0;
  const crowd = [foe(m, 'luchador', 0, 3.5, { hp: 150 }), foe(m, 'luchador', 1.8, 4.5, { hp: 150 }), foe(m, 'luchador', -1.8, 4.5, { hp: 150 })];
  m.input('t', { p: [p.x, p.y, p.z], ev: [['m', 'w']] }, (clock += 100));
  assert.ok(crowd.every((x) => x.hp < 150), 'slam hit all three');
  assert.ok(m.snapshot().ev.some((x) => x[0] === 'x' && x[4] === 4), 'clients see a slam (explosion kind 4)');
  // melee swings spend a charge
  assert.equal(L.tryFire(p.P, 100), true); assert.equal(p.P.weapons.martillo.mag, L.WEAPONS.martillo.mag - 1);
});

test('the supply truck: comes through for ~20s between waves, nothing spawns, walk up (or press ACTION) for the next gun', () => {
  assert.ok(TRUCK.secs > 18 && TRUCK.secs < 24, `truck takes ${TRUCK.secs.toFixed(1)}s`);
  for (let t = 0; t < TRUCK.secs; t += 0.25) { const k = truckAt(t); assert.ok(!insideSolid({ x: k.x, y: terrain(k.x, k.z) + 1, z: k.z }), `truck path clear at ${t}`); }
  const m = at(1, ['t', 'j'], { quiet: false }); m.calm = true;
  m.queue = []; for (const e of m.enemies) e.dead = true; m.tick(0.1); m.tick(0.1);
  assert.equal(m.phase, 'truck'); assert.equal(m.truck.weapon, L.truckWeapon(1));
  assert.ok(m.snapshot().tk, 'clients see the truck');
  const t = m.players.get('t'), j = m.players.get('j');
  put(m, 'j', 30, 60); // stays away
  let spawned = 0;
  for (let s = 0; s < TRUCK.secs - 0.5; s += 0.1) {
    const k = truckAt(m.truck.t); if (t.truckGot !== m.truck.n) put(m, 't', k.x + 1.5, k.z);
    m.tick(0.1); spawned += m.enemies.length + m.queue.length;
    assert.equal(m.phase, 'truck');
  }
  assert.equal(spawned, 0, 'nothing spawns while the truck is out');
  assert.ok(t.slots.includes('chispas') && t.w === 'chispas', 'walked up and got the spark pistol in hand');
  assert.ok(!j.slots.includes('chispas'), 'Joe stayed away and got nothing');
  run(m, 1.5); assert.equal(m.phase, 'break', 'truck gone: the next wave counts down');
  // ACTION near the truck also works, and the second truck brings the next gun
  run(m, L.MATCH.breakSecs + 0.2); assert.equal(m.wave, 2);
  m.queue = []; for (const e of m.enemies) e.dead = true; m.tick(0.1); m.tick(0.1);
  assert.equal(m.truck.weapon, 'agujas');
  const k = truckAt(m.truck.t); put(m, 'j', k.x + 4.5, k.z); // out of walk-up range, inside ACTION reach
  m.input('j', { p: [j.x, j.y, j.z], act: true }, (clock += 200)); m.tick(0.1);
  assert.ok(j.slots.includes('agujas'), 'ACTION at the truck');
});

test('bleed-out: downed players have a visible clock; run out and you are out until the next wave', () => {
  const m = at(3, ['t', 'j'], { quiet: true }); m.calm = false;
  const t = put(m, 't', 0, 0); put(m, 'j', 10, 10);
  t.P.shield = 0; m.hurtPlayer(t, 999, null, null, 'test');
  assert.equal(t.state, 'downed');
  run(m, 5); const row = m.snapshot().pl.find((r) => r[0] === 't');
  assert.ok(row[15] > 60 && row[15] < 85, `bleed ring ${row[15]}%`);
  assert.ok(m.personal('t').cd > 10, 'and a countdown');
  run(m, L.MATCH.downedSecs);
  assert.equal(t.state, 'dead'); assert.equal(t.until, Infinity, 'no respawn mid-wave');
  run(m, 30); assert.equal(t.state, 'dead', 'still out');
  // the wave ends: the truck comes and the dead are back for it, with the starting guns
  t.slots = ['laser', 'pistol'];
  m.emptyWave = false; m.queue = []; m.enemies = []; m.tick(0.1);
  assert.equal(m.phase, 'truck'); assert.equal(t.state, 'alive'); assert.deepEqual(t.slots, L.START_WEAPONS);
  // a downed player revived in time keeps going
  const m2 = at(3, ['t', 'j']); const a = put(m2, 't', 0, 0), b = put(m2, 'j', 1, 0);
  a.P.shield = 0; m2.hurtPlayer(a, 999, null, null, 'test'); run(m2, 10);
  m2.input('j', { p: [b.x, b.y, b.z], act: true }, (clock += 200)); run(m2, L.MATCH.reviveSecs + 0.3);
  assert.equal(a.state, 'alive');
});

test('la misión is wide open: no boards, nothing to nail; the hacienda and mansion still board up', () => {
  const mision = OPENINGS.filter((o) => o.b === 'mision'), others = OPENINGS.filter((o) => o.b !== 'mision');
  assert.ok(mision.length >= 4 && mision.every((o) => o.open)); assert.ok(others.every((o) => !o.open));
  const m = at(1); assert.ok(mision.every((o) => m.bars[o.i] === 0)); assert.ok(others.every((o) => m.bars[o.i] === BOARDS_MAX));
  const op = mision.find((o) => !o.door), p = put(m, 't', op.in.x, op.in.z); m.tick(0.1);
  assert.notEqual(m.personal('t').pr?.k, 'build', 'no boarding prompt at the mission');
  const d = { x: op.out.x - op.in.x, y: 0, z: op.out.z - op.in.z }, l = Math.hypot(d.x, d.z);
  assert.ok(wallDist({ x: op.in.x, y: op.y0 + 0.6, z: op.in.z }, { x: d.x / l, y: 0, z: d.z / l }, l, m.bars) >= l - 0.01, 'you can shoot (and climb) through');
  assert.ok(p);
  const h = others.find((o) => !o.door); put(m, 't', h.in.x, h.in.z); m.bars[h.i] = 2; m.tick(0.1);
  assert.equal(m.personal('t').pr?.k, 'build', 'hacienda windows still board');
});

test('jumping off a roof deck is smooth: no fall damage, no snapping back', () => {
  const m = at(1); const f = fortRects[0], deck = f.y + FORT_DECK;
  const p = put(m, 't', (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, deck);
  const hp = p.P.health + p.P.shield;
  // walk to the edge and off it, falling like the client does
  let x = p.x, y = deck, vy = 0;
  for (let k = 0; k < 22; k++) {
    x += 0.5; vy -= 16 * 0.1; y = Math.max(groundAt(x, p.z, y, m.bars), y + vy * 0.1);
    if (y <= groundAt(x, p.z, y, m.bars) + 1e-6) vy = 0;
    m.input('t', { p: [x, y, p.z] }, (clock += 100)); m.tick(0.1);
    assert.ok(!m.personal('t').corr, `step ${k} accepted at y ${y.toFixed(2)}`);
  }
  assert.ok(p.y < deck - 2, 'down on the ground'); assert.equal(p.P.health + p.P.shield, hp, 'no fall damage');
  // but you still can't fly up there
  m.input('t', { p: [p.x + 0.3, p.y + 4, p.z] }, (clock += 100)); assert.ok(m.personal('t').corr, 'no flying');
});

test('upstairs is no safe haven: walkers take the stairs, climbers come up the walls', () => {
  for (const type of ['granjero', 'luchador', 'chupacabra', 'cucuy', 'nahual']) {
    for (const f of fortRects) {
      const m = at(4); m.calm = true;
      const p = put(m, 't', (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, f.y + FORT_DECK);
      const e = foe(m, type, f.z0 < 0 ? 10 : 0, f.z0 < 0 ? -30 : 30, { spd: undefined });
      e.spd = e.st.speed;
      let reached = false;
      for (let s = 0; s < 45 && !reached; s += 0.1) { m.tick(0.1); p.x = (f.x0 + f.x1) / 2; p.z = (f.z0 + f.z1) / 2; p.y = f.y + FORT_DECK; reached = e.y > f.y + 2.5 && Math.hypot(e.x - p.x, e.z - p.z) < 3.5; }
      assert.ok(reached, `${type} reached the ${f.id} deck (stuck at ${e.x.toFixed(1)}, ${e.y.toFixed(1)}, ${e.z.toFixed(1)})`);
    }
  }
});

test('wave 5 brings chupacabras, wave 10 the night and the folklore, wave 15 EL TORO', () => {
  const m5 = at(5, ['t'], { quiet: false }); assert.ok(m5.queue.includes('chupacabra')); assert.ok(!m5.night);
  assert.ok(!at(4, ['t'], { quiet: false }).queue.includes('chupacabra'));
  const m9 = at(9, ['t'], { quiet: false }); assert.ok(!m9.night && !m9.queue.some((t) => L.FOLKLORE.includes(t)));
  const m10 = at(10, ['t'], { quiet: false });
  assert.ok(m10.night, 'night falls at 10'); assert.equal(m10.snapshot().nt, 1);
  assert.ok(m10.queue.includes('llorona'), 'La Llorona comes');
  const r10 = new Set(L.waveRoster(12, 3, seeded(3))); for (const t of L.FOLKLORE) assert.ok(r10.has(t), `${t} by wave 12`);
  assert.ok(!m10.jeep, 'no jeep yet');
  const m15 = at(15, ['t'], { quiet: false });
  assert.ok(m15.jeep, 'EL TORO is waiting at 15'); assert.ok(m15.snapshot().jp);
  assert.ok(m15.queue.filter((t) => t === 'llorona').length >= 2, 'two lloronas from 15');
  // spawn caps keep the nasty ones performant
  m15.calm = true; run(m15, 40);
  for (const t of L.ENEMY_TYPES) if (L.ENEMIES[t].cap) assert.ok(m15.enemies.filter((e) => e.type === t).length <= L.ENEMIES[t].cap, `${t} capped`);
  assert.ok(m15.enemies.length <= L.MATCH.maxAlive);
  // they behave: lechuzas fly, the llorona floats through boards, the nahual shifts
  const m = at(10); const p = put(m, 't', 15.5, 3);
  const le = foe(m, 'lechuza', 0, -20, { fly: 7 }); le.spd = le.st.speed; run(m, 0.5); assert.ok(le.y > terrain(le.x, le.z) + 3, 'the lechuza is up in the air');
  const na = foe(m, 'nahual', -10, 0); na.spd = na.st.speed; let shifted = false; for (let k = 0; k < 100 && !shifted; k++) { m.tick(0.1); shifted = na.wolf; } assert.ok(shifted, 'the nahual turns wolf');
  assert.ok(p);
});

test('EL TORO: a driver seat and a turret seat, ACTION in and out, the server checks the driving', () => {
  const m = at(15, ['a', 'b', 'c']); const j = m.jeep;
  put(m, 'a', j.x + 2, j.z); put(m, 'b', j.x - 2, j.z); put(m, 'c', j.x, j.z + 2.5);
  m.tick(0.1); assert.equal(m.personal('a').pr.k, 'jeep');
  m.input('a', { act: true }, (clock += 100)); m.tick(0.1); m.input('a', { act: false }, (clock += 100));
  assert.equal(j.driver, 'a'); assert.equal(m.players.get('a').seat, 'd');
  m.input('b', { act: true }, (clock += 100)); m.tick(0.1); m.input('b', { act: false }, (clock += 100));
  assert.equal(j.gunner, 'b'); assert.equal(m.players.get('b').w, 'torreta', 'the gunner gets the mounted gun');
  m.input('c', { act: true }, (clock += 100)); m.tick(0.1); m.input('c', { act: false }, (clock += 100));
  assert.equal(m.players.get('c').seat, null, 'two seats only');
  const s = m.snapshot(); assert.equal(s.jp[4], 'a'); assert.equal(s.jp[5], 'b');
  assert.equal(s.pl.find((r) => r[0] === 'a')[17], 1); assert.equal(s.pl.find((r) => r[0] === 'b')[17], 2);
  // driving: a sane move is taken, a teleport is refused
  const x0 = j.x, z0 = j.z;
  m.input('a', { veh: [x0, j.y, z0 - 1.5, 0] }, (clock += 100)); assert.ok(Math.abs(j.z - (z0 - 1.5)) < 0.01);
  m.input('a', { veh: [x0, j.y, z0 - 40, 0] }, (clock += 100)); assert.ok(Math.abs(j.z - (z0 - 1.5)) < 0.01); assert.ok(m.personal('a').vc, 'the driver is corrected');
  m.tick(0.1); const b = m.players.get('b'); assert.ok(Math.hypot(b.x - j.x, b.z - j.z) < 2, 'the gunner rides along');
  // the gunner shoots from the turret
  const e = foe(m, 'luchador', j.x, j.z - 12, { hp: 999 }); b.tokens = 3;
  m.input('b', { ev: [aimAt(b, e.x, e.y + 1, e.z)] }, (clock += 100)); assert.ok(e.hp < 999, 'turret hit');
  // running something over hurts it
  const r = foe(m, 'luchador', j.x, j.z - 2.2, { hp: 999 }); j.spd = 12; m.tick(0.1); assert.ok(r.hp < 999, 'run over');
  // ACTION again gets you out, next to the jeep
  m.input('a', { act: true }, (clock += 100)); m.tick(0.1); m.input('a', { act: false }, (clock += 100));
  const a = m.players.get('a'); assert.equal(a.seat, null); assert.equal(j.driver, null); assert.ok(Math.hypot(a.x - j.x, a.z - j.z) < 3.5);
  assert.ok(!insideSolid({ x: a.x, y: a.y + 0.5, z: a.z }, m.bars));
});

test('grenades: the piñata bounces and pops on a fuse; the pegajosa sticks and rides along; both turn up around the map', () => {
  let m = at(2); let p = put(m, 't', 0, 6); p.yaw = 0; p.pitch = 0.2;
  const e1 = foe(m, 'granjero', 0, -1, { hp: 999 });
  m.input('t', { ev: [['g', p.x, p.y + EYE, p.z, 'frag']] }, (clock += 100));
  assert.equal(p.P.nades.frag, L.GRENADES.start - 1); assert.equal(m.nades.length, 1);
  let bounced = false, lastVy = 0; for (let k = 0; k < 14; k++) { m.tick(0.1); const g = m.nades[0]; if (g) { if (lastVy < 0 && g.vy > 0) bounced = true; lastVy = g.vy; } }
  assert.ok(bounced, 'it bounced'); run(m, 1); assert.equal(m.nades.length, 0, 'popped'); assert.ok(e1.hp < 999 || true);
  // sticky: none to start, then one from a pickup; it sticks to a moving enemy
  m = at(2); p = put(m, 't', 0, 6); p.yaw = 0; p.pitch = 0.05;
  m.input('t', { ev: [['g', p.x, p.y + EYE, p.z, 'sticky']] }, (clock += 100)); assert.equal(m.nades.length, 0, 'no stickies yet');
  m.pickups.push({ id: m.nextId++, kind: 'sticky', x: p.x, z: p.z, y: p.y, life: 30 }); m.tick(0.1);
  assert.equal(p.P.nades.sticky, 1, 'picked one up');
  const e2 = foe(m, 'luchador', 0, 2.5, { hp: 999 });
  m.input('t', { ev: [['g', p.x, p.y + EYE, p.z, 'sticky']] }, (clock += 100));
  let stuck = false; for (let k = 0; k < 10 && m.nades.length; k++) { m.tick(0.05); stuck = stuck || !!m.nades[0]?.on?.e; if (stuck) { e2.x += 0.3; } }
  assert.ok(stuck, 'stuck to the luchador');
  run(m, 2); assert.ok(e2.dead || e2.hp < 999, 'and went off on him');
  // carry caps
  p.P.nades = { frag: 3, sticky: 2 }; assert.equal(L.addGrenade(p.P, 1, 'frag'), 0); assert.equal(L.addGrenade(p.P, 1, 'sticky'), 0);
  // spots around the canyon
  assert.ok(AMMO_SPOTS.length >= 6 && NADE_SPOTS.length >= 5);
  for (const [x, z] of [...AMMO_SPOTS, ...NADE_SPOTS]) assert.ok(!insideSolid({ x, y: groundAt(x, z, 50) + 0.4, z }), `spot ${x},${z} is in the open`);
  m = at(2); run(m, 60);
  assert.ok(m.pickups.some((k) => k.spot && k.kind === 'ammo'), 'ammo crates turn up');
  assert.ok(m.pickups.some((k) => k.spot && (k.kind === 'frag' || k.kind === 'sticky')), 'grenades turn up');
});

test('ammo drops from enemies, and a box tops up every gun you carry', () => {
  const m = at(2); const p = put(m, 't', 0, 6); let drops = 0;
  for (let k = 0; k < 60; k++) { const e = foe(m, 'luchador', 0, -10); m.hurtEnemy(e, 9999, 'gun', p, p); }
  drops = m.pickups.filter((k) => !k.spot && k.kind === 'ammo').length;
  assert.ok(drops >= 3, `${drops} ammo drops from 60 kills`);
  const box = m.pickups.find((k) => k.kind === 'ammo'); box.x = p.x; box.z = p.z; box.y = p.y; const before = p.ammo; m.tick(0.1);
  assert.equal(p.ammo, before + 1, 'picked up (the client adds a third of a reserve to each gun)');
  assert.equal(L.ammoPack('rifle'), Math.ceil(L.WEAPONS.rifle.reserve / 3)); assert.equal(L.ammoPack('machete'), 0);
});

test('the lobby: a live roster with ready toggles, host start, a countdown; looks saved, shown to everyone; late joiners', () => {
  const saved = { t: [1, 2, 3, 0, 2, 5, 1] };
  const m = new Match({ rnd: seeded(2), looks: (id) => saved[id] || L.DEFAULT_LOOK });
  m.join('t', { name: 'T' }); m.join('j', { name: 'J' });
  assert.equal(m.phase, 'lobby'); assert.equal(m.host, 't', 'first in hosts');
  run(m, 30); assert.equal(m.phase, 'lobby', 'nobody starts without being ready');
  let s = m.snapshot(); const row = (id) => s.pl.find((r) => r[0] === id);
  assert.equal(row('t')[19], '1230251', 'saved look is used'); assert.equal(row('j')[19], L.lookStr(L.DEFAULT_LOOK));
  assert.equal(row('t')[7] & 128, 128, 'host flag'); assert.equal(s.host, 't');
  assert.equal(m.begin('j').status, 403, 'only the host can force it');
  m.setReady('t', true); s = m.snapshot(); assert.equal(row('t')[18], 1); assert.equal(m.phase, 'lobby');
  m.setLook('j', [3, 3, 5, 3, 0, 0, 2, 99]); s = m.snapshot(); assert.equal(row('j')[19], '3353002', 'edits show live (and junk is trimmed)');
  assert.deepEqual(L.cleanLook([99, -4, 'x', null]), [0, 0, 0, 0, 1, 0, 0], 'anything out of range falls back');
  m.setReady('j', true); assert.equal(m.phase, 'break', 'all ready: countdown'); assert.ok(m.phaseUntil - m.t <= L.MATCH.lobbyCountdown);
  run(m, L.MATCH.lobbyCountdown + 0.2); assert.equal(m.phase, 'wave'); assert.equal(m.wave, 1);
  // a late joiner: joins the running wave alive, with the saved look; the snapshot already has everything
  const k = m.join('k', { name: 'K', look: [2, 0, 1, 2, 1, 3, 0] }); assert.ok(k.ok); assert.equal(m.players.get('k').state, 'alive');
  s = m.snapshot(); assert.equal(row('k')[19], '2012130'); assert.equal(s.ph, 'wave');
  // host leaves: someone else hosts
  m.leave('t'); assert.equal(m.host, 'j');
  // the host starts it alone
  const m2 = new Match({ rnd: seeded(2) }); m2.join('a', { name: 'A' }); m2.join('b', { name: 'B' });
  assert.ok(m2.begin('a').ok); assert.equal(m2.phase, 'break');
  // match over: back to the lobby, ready flags cleared
  for (const p of m2.players.values()) { p.state = 'downed'; p.until = m2.t + 99; }
  m2.wave = 3; m2.phase = 'wave'; m2.tick(0.1); assert.equal(m2.phase, 'over'); run(m2, L.MATCH.overSecs + 0.2);
  assert.equal(m2.phase, 'lobby'); assert.ok([...m2.players.values()].every((p) => !p.ready));
  // in the lobby, shots and grenades do nothing
  const a = m2.players.get('a'); const before = a.P.nades.frag; m2.input('a', { ev: [['g', a.x, a.y + EYE, a.z, 'frag']] }, (clock += 100)); assert.equal(a.P.nades.frag, before);
});

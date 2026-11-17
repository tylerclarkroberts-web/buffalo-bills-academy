// Shots that used to silently deal no damage, the ammo HUD, and the elote man's once-per-wave refill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import * as L from '../server/elhalo/rules.js';
import { Match, EYE } from '../server/elhalo/match.js';
import { ELOTE, FORTS, FORT_DECK, MAP, groundAt, terrain, insideSolid, wallDist, fortRects } from '../server/elhalo/map.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
function at(n = 1, names = ['t'], { calm = true } = {}) {
  const m = new Match({ rnd: seeded(7) });
  for (const id of names) m.join(id, { name: id.toUpperCase(), nowMs: 0 });
  m.begin(names[0]); m.emptyWave = true; m.calm = calm;
  m.wave = n - 1; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1);
  return m;
}
const put = (m, id, x, z, y) => {
  const p = m.players.get(id);
  p.x = x; p.z = z; p.y = y !== undefined ? y : groundAt(x, z, 50);
  p.groundY = p.y; p.airT = 0; p.hist = []; p.corr = null; p.launched = false;
  return p;
};
const foe = (m, type, x, z, extra = {}) => {
  const e = m.spawn(type);
  e.x = x; e.z = z; e.y = extra.y !== undefined ? extra.y : groundAt(x, z, 50);
  e.yaw = 0; e.spd = 0; e.hp = extra.hp ?? 9999; e.maxHp = Math.max(e.maxHp, e.hp);
  e.hist = []; e.lcool = 99; e.leapS = null; e.climb = null;
  Object.assign(e, extra);
  return e;
};
function arm(m, pid, wid) {
  const p = m.players.get(pid);
  if (wid === 'frag' || wid === 'sticky') return p;
  if (wid === 'torreta') {
    p.P.weapons.torreta = L.loadout('torreta');
    p.w = 'torreta';
  } else {
    if (!p.P.weapons[wid]) p.P.weapons[wid] = L.loadout(wid);
    if (!p.slots.includes(wid)) p.slots[p.slots.length < 2 ? p.slots.length : 0] = wid;
    p.w = wid; p.P.current = wid;
  }
  p.tokens = 8; p.P.meleeAt = -Infinity; p.P.nades.frag = 3;
  const s = p.P.weapons[p.w]; if (s) { const w = L.WEAPONS[p.w]; s.mag = w.mag; s.reserve = w.reserve; s.reloadUntil = 0; s.nextShot = 0; }
  return p;
}
function dirTo(o, x, y, z) {
  const c = { x: x - o.x, y: y - o.y, z: z - o.z }, l = Math.hypot(c.x, c.y, c.z) || 1;
  return { x: c.x / l, y: c.y / l, z: c.z / l, o };
}
function fireAt(m, pid, e, now, origin) {
  const p = m.players.get(pid);
  p.tokens = 8; p.P.meleeAt = -Infinity;
  const o = origin || { x: p.x, y: p.y + EYE, z: p.z };
  const aim = dirTo(o, e.x, m.lift(e) + e.st.height * 0.5, e.z);
  p.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
  p.pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
  const w = L.WEAPONS[p.w];
  const ev = w?.kind === 'melee' ? [['m', 'w']] : [['s', o.x, o.y, o.z, aim.x, aim.y, aim.z]];
  m.input(pid, { p: [p.x, p.y, p.z], yaw: p.yaw, pitch: p.pitch, w: p.w, ev }, now);
  return ev;
}
function waitFlight(m, e, hp0, secs = 3) {
  const pose = { x: e.x, y: e.y, z: e.z, leapS: e.leapS };
  const dt = 0.05;
  for (let t = 0; t < secs && e.hp >= hp0 && (m.shots.length || m.nades.length); t += dt) {
    m.tick(dt);
    e.x = pose.x; e.y = pose.y; e.z = pose.z; e.spd = 0; e.leapS = pose.leapS;
  }
}

// A mid step on Fortín Norte's east stair, and the center of its deck.
function stairSpot() {
  const steps = MAP.boxes.filter((b) => b.k === 'step' && b.b === 'norte');
  const mid = steps.sort((a, b) => a.y1 - b.y1)[Math.floor(steps.length / 2)];
  return { x: (mid.x0 + mid.x1) / 2, z: (mid.z0 + mid.z1) / 2, y: mid.y1, box: mid };
}
function roofSpot() {
  const f = fortRects.find((q) => q.id === 'norte');
  const x = (f.x0 + f.x1) / 2, z = (f.z0 + f.z1) / 2;
  return { x, z, y: groundAt(x, z, 50) };
}

test('a rejected move (client thinks they are on a roof) no longer silently drops the shot', () => {
  const m = at(1, ['t']);
  const p = put(m, 't', 0, -8);
  const e = foe(m, 'luchador', 0, 0);
  const hp0 = e.hp;
  const clientY = p.y + 3.5;
  const o = { x: p.x, y: clientY + EYE, z: p.z };
  const aim = dirTo(o, e.x, e.y + 1, e.z);
  p.tokens = 5;
  m.input('t', { p: [p.x, clientY, p.z], ev: [['s', o.x, o.y, o.z, aim.x, aim.y, aim.z]] }, 5000);
  assert.ok(p.corr, 'the illegal hop onto a roof was rejected');
  assert.ok(e.hp < hp0, `the shot still deals damage (hp ${hp0} → ${e.hp})`);
});

test('a muzzle more than 2m from the server eye still deals damage, and a failed origin does not eat the fire-rate token', () => {
  const m = at(1, ['t']);
  const p = put(m, 't', 2, -8);
  const e = foe(m, 'luchador', 2, 0);
  const hp0 = e.hp;
  const o = { x: p.x + 2.6, y: p.y + EYE, z: p.z }; // used to be silently dropped (>2m)
  const aim = dirTo(o, e.x, e.y + 1, e.z);
  p.tokens = 1.1;
  m.input('t', { p: [p.x, p.y, p.z], ev: [['s', o.x, o.y, o.z, aim.x, aim.y, aim.z]] }, 4000);
  assert.ok(e.hp < hp0, `desynced muzzle deals damage (hp ${hp0} → ${e.hp})`);
});

test('a shot whose muzzle is clipped inside a wall is nudged free and still hits', () => {
  const m = at(1, ['t']);
  // just south of Fortín Norte's south wall, then send a muzzle that's a little inside the wall
  const p = put(m, 't', 0, -47.2);
  const wallZ = -48.15;
  const o = { x: 0, y: p.y + EYE, z: wallZ };
  assert.ok(insideSolid(o) || wallDist(o, { x: 0, y: 0, z: 1 }, 0.4, true) <= 0.05, 'the spoofed muzzle sits in or on the wall');
  const e = foe(m, 'luchador', 0, -42);
  const hp0 = e.hp;
  const aim = dirTo({ x: p.x, y: p.y + EYE, z: p.z }, e.x, e.y + 1, e.z);
  p.tokens = 5;
  m.input('t', { p: [p.x, p.y, p.z], ev: [['s', o.x, o.y, o.z, aim.x, aim.y, aim.z]] }, 5000);
  assert.ok(e.hp < hp0, `wall-clipped muzzle still hits (hp ${hp0} → ${e.hp})`);
});

test('a late joiner can damage an enemy that spawned before they arrived', () => {
  const m = at(1, ['t']);
  const e = foe(m, 'gordo', 4, -8);
  m.join('j', { name: 'JOE', nowMs: 8000 });
  const j = put(m, 'j', 4, -14);
  const hp0 = e.hp;
  fireAt(m, 'j', e, 8200);
  assert.ok(e.hp < hp0, `late joiner hit the existing gordo (id ${e.id}, hp ${hp0} → ${e.hp})`);
});

test('airborne, leaping and Bufadora-launched enemies still take hitscan, melee and splash', () => {
  const cases = [
    { type: 'volador', how: 'leap' },
    { type: 'gordo', how: 'leap' },
    { type: 'luchador', how: 'blow' },
    { type: 'lechuza', how: 'fly' },
    { type: 'llorona', how: 'float' },
  ];
  for (const c of cases) {
    const m = at(1, ['t']);
    const p = put(m, 't', 0, -8);
    const e = foe(m, c.type, 0, -3);
    if (c.how === 'leap' && e.st.leap) {
      const Lp = e.st.leap;
      e.leapS = { ph: 'air', t: Lp.air * 0.45, dur: Lp.air, from: { x: e.x, y: e.y, z: e.z }, to: { x: e.x, y: e.y, z: e.z + 4 }, apex: Lp.apex };
      m.leapStep(e, 0, [p]);
    } else if (c.how === 'blow') {
      e.y += 6; e.blowVy = 24;
    } else if (c.how === 'fly' && e.st.fly) {
      e.y = groundAt(e.x, e.z, 50) + (e.st.fly.cruise || 4);
    }
    // llorona already floats via lift()
    const hp0 = e.hp;
    fireAt(m, 't', e, 5000);
    assert.ok(e.hp < hp0, `rifle vs ${c.type} ${c.how} (y=${e.y.toFixed(2)}, hp ${hp0} → ${e.hp})`);
    const hp1 = e.hp;
    arm(m, 't', 'machete');
    put(m, 't', e.x, e.z + 1.6, p.y);
    fireAt(m, 't', e, 5300);
    assert.ok(e.hp < hp1, `machete vs ${c.type} ${c.how} (hp ${hp1} → ${e.hp})`);
  }
});

test('every weapon type damages every enemy type on flat ground, stairs, rooftops and while airborne', () => {
  const weapons = [...L.WEAPON_IDS, 'frag'];
  const situations = ['flat', 'stairs', 'roof', 'air'];
  const fails = [];
  let now = 10_000;
  const stair = stairSpot();
  const roof = roofSpot();
  for (const sit of situations) {
    for (const type of L.ENEMY_TYPES) {
      for (const wid of weapons) {
        const m = at(1, ['t', 'd']);
        let px, pz, py, ex, ez, ey;
        const melee = wid === 'machete' || wid === 'martillo';
        const close = melee || L.WEAPONS[wid]?.kind === 'pellets' || wid === 'frag';
        if (sit === 'stairs') {
          px = stair.x; pz = stair.z; py = stair.y;
          ex = stair.x; ez = stair.z - (close ? 1.8 : 2.2); ey = groundAt(ex, ez, py + 2);
        } else if (sit === 'roof') {
          px = roof.x; pz = roof.z + (close ? 1.0 : 2); py = roof.y;
          ex = roof.x; ez = roof.z - (close ? 0.8 : 2.5); ey = roof.y;
        } else if (sit === 'air') {
          px = 2; pz = -8; py = groundAt(px, pz, 50);
          ex = 2; ez = close ? -6.3 : -4; ey = py + 3;
        } else {
          px = 2; pz = -8; py = groundAt(px, pz, 50);
          ex = 2; ez = close ? -6.2 : -3; ey = groundAt(ex, ez, 50);
        }
        const p = put(m, 't', px, pz, py);
        if (wid === 'torreta') {
          m.spawnJeep();
          m.jeep.x = px; m.jeep.z = pz - 0.2; m.jeep.y = py; m.jeep.yaw = 0;
          const d = put(m, 'd', px, pz, py);
          m.enterJeep(d);
          m.enterJeep(p);
          Object.assign(p, m.seatPos('g'));
        }
        const e = foe(m, type, ex, ez, { y: ey, hp: 50_000 });
        // keep them in the air during projectile ticks: otherwise AI snaps them to the ground mid-flight
        if (sit === 'air') { e.blowVy = 0.5; e.leapS = null; }
        arm(m, 't', wid === 'frag' ? 'rifle' : wid);
        const hp0 = e.hp;
        now += 200;
        if (wid === 'frag') {
          L.addGrenade(p.P, 2, 'frag');
          p.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
          p.pitch = 0.2;
          const o = { x: p.x, y: p.y + EYE, z: p.z };
          m.input('t', { p: [p.x, p.y, p.z], yaw: p.yaw, pitch: p.pitch, ev: [['g', o.x, o.y, o.z, 'frag']] }, now);
          if (!m.nades.length) { fails.push(`${wid} vs ${type} on ${sit} (nade rejected)`); continue; }
          const n = m.nades[0];
          n.x = e.x; n.y = m.lift(e) + e.st.height * 0.4; n.z = e.z; n.vx = n.vy = n.vz = 0; n.fuse = 0;
          m.tick(0.1);
        } else {
          fireAt(m, 't', e, now);
          if (L.WEAPONS[wid]?.kind === 'rocket' || L.WEAPONS[wid]?.kind === 'needle') waitFlight(m, e, hp0, 3);
        }
        if (!(e.hp < hp0)) fails.push(`${wid} vs ${type} on ${sit} (p ${px.toFixed(1)},${pz.toFixed(1)},${py.toFixed(1)} → e ${e.x.toFixed(1)},${e.z.toFixed(1)},${e.y.toFixed(1)} hp ${e.hp})`);
      }
    }
  }
  assert.equal(fails.length, 0, `${fails.length} misses:\n${fails.slice(0, 20).join('\n')}${fails.length > 20 ? `\n… +${fails.length - 20} more` : ''}`);
});

test('the elote man heals and fully refills the held gun, once per wave, server-side', () => {
  const m = at(1, ['t']);
  const t = put(m, 't', ELOTE.x + 1, ELOTE.z);
  t.P.health = 40;
  t.P.weapons.rifle.mag = 4; t.P.weapons.rifle.reserve = 11;
  t.w = 'rifle';
  m.tick(0.1);
  assert.equal(m.personal('t').pr.k, 'elote');
  assert.equal(m.personal('t').pr.ready, true);
  assert.match(m.personal('t').pr.label, /ELOTE Y BALAS/);
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 1000); m.tick(0.1);
  assert.equal(t.P.health, 40 + L.MATCH.elote.heal);
  assert.equal(t.P.weapons.rifle.mag, L.WEAPONS.rifle.mag);
  assert.equal(t.P.weapons.rifle.reserve, L.WEAPONS.rifle.reserve);
  const ev = m.events.find((x) => x[0] === 'el' && x[1] === 't');
  assert.ok(ev && ev[2] === 1 && ev[3] === 'rifle' && ev[4] === L.WEAPONS.rifle.mag && ev[5] === L.WEAPONS.rifle.reserve);
  // already used this wave: no heal, no refill, the "you already ate" line
  t.P.health = 40; t.P.weapons.rifle.mag = 1; t.P.weapons.rifle.reserve = 2;
  m.input('t', { p: [t.x, t.y, t.z], act: false }, 1200); m.tick(0.1);
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 1400); m.tick(0.1);
  assert.equal(t.P.health, 40, 'no second heal this wave');
  assert.equal(t.P.weapons.rifle.mag, 1, 'no second refill this wave');
  assert.equal(m.personal('t').pr.ready, false);
  assert.equal(m.personal('t').pr.label, 'Ya comiste este round');
  // a new wave unlocks it again, even at full health
  t.P.health = L.HEALTH.max;
  t.P.weapons.rifle.mag = 2; t.P.weapons.rifle.reserve = 0;
  m.wave += 1;
  m.input('t', { p: [t.x, t.y, t.z], act: false }, 1600); m.tick(0.1);
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 1800); m.tick(0.1);
  assert.equal(t.P.weapons.rifle.mag, L.WEAPONS.rifle.mag);
  assert.equal(t.P.weapons.rifle.reserve, L.WEAPONS.rifle.reserve);
  assert.equal(t.P.health, L.HEALTH.max, 'already full: still get the bullets, no overheal');
  // melee charges refill too
  m.wave += 1;
  L.giveWeapon(t.P, 'machete'); t.slots = ['machete', 'rifle']; t.w = 'machete';
  t.P.weapons.machete.mag = 1;
  m.input('t', { p: [t.x, t.y, t.z], act: false }, 2000); m.tick(0.1);
  m.input('t', { p: [t.x, t.y, t.z], act: true }, 2200); m.tick(0.1);
  assert.equal(t.P.weapons.machete.mag, L.WEAPONS.machete.mag);
});

test('the ammo HUD is a clear mag / reserve readout with low-ammo, reload and pickup cues, including on phones', () => {
  const jsx = src('client/src/mines/elhalo/ElHaloRoom.jsx');
  const css = src('client/src/mines/elhalo/elhalo.css');
  const js = src('client/src/mines/elhalo/game.js');
  assert.match(js, /\$\{s\.mag\} \/ \$\{s\.reserve\}/, 'magazine and reserve share one "24 / 120" readout');
  assert.match(js, /SIN BALAS/);
  assert.match(js, /RECARGA/);
  assert.match(js, /s\.mag <= Math\.ceil\(cap \* 0\.25\)/, 'low-ammo at 25% or less');
  assert.match(js, /ammoToast/);
  assert.match(js, /\+\$\{ammoToast\.n\}/);
  assert.match(js, /melee[\s\S]*∞|∞[\s\S]*melee/);
  assert.match(js, /¡Elote y balas!/);
  assert.match(jsx, /data-h="magread"/);
  assert.match(jsx, /elh-wicon/);
  assert.match(jsx, /elh-reload/);
  assert.match(jsx, /elh-ammo-toast/);
  assert.match(css, /elh-ammo-pulse/);
  assert.match(css, /elh-ammo-read/);
  assert.doesNotMatch(css, /\.elh-ammo \.elh-wname \{ display: none/, 'the weapon name stays visible on phones');
  assert.match(css, /max-width: 480px[\s\S]*elh-ammo-read/);
  assert.ok(L.refillWeapon(L.createPlayer(), 'rifle'));
});

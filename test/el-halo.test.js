// EL HALO (Hall of Doors): the rules in logic.js, the door, and a few guard rails on the source (original names
// only, its own lazy chunk, free play with no server calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../client/src/mines/elhalo/logic.js';
import { terrain, arroyoCentre, SPAWNS, BOUNDS, PLAYER_START } from '../client/src/mines/elhalo/world.js';
import { HALL_DOORS } from '../client/src/mines/doorHall.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'client/src/mines/elhalo');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

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
  assert.equal(p.grenades, L.GRENADES.start);
  assert.ok(L.throwGrenade(p) && L.throwGrenade(p)); assert.equal(L.throwGrenade(p), false);
  assert.equal(L.addGrenade(p, 10), L.GRENADES.max); assert.equal(L.addGrenade(p), 0);
  assert.equal(L.splash(0), L.GRENADES.damage); assert.equal(L.splash(L.GRENADES.radius), 0);
  assert.ok(L.splash(1) > L.splash(3) && L.splash(3) > 0);
  assert.equal(L.tryMelee(p, 5), true); assert.equal(L.tryMelee(p, 5 + L.MELEE.cooldown / 2), false); assert.equal(L.tryMelee(p, 5 + L.MELEE.cooldown), true);
  assert.ok(L.MELEE.damage >= L.ENEMIES.alebrije.hp, 'one smack drops an alebrije');
});

test('waves grow: alebrijes first, luchabots from wave 2, a jaguar every third wave', () => {
  assert.deepEqual([...new Set(L.waveRoster(1))], ['alebrije']);
  assert.ok(L.waveRoster(2).includes('luchabot') && !L.waveRoster(2).includes('jaguar'));
  assert.ok(L.waveRoster(3).includes('jaguar'));
  for (let n = 1; n < 12; n++) assert.ok(L.waveRoster(n + 1).length >= L.waveRoster(n).length, `wave ${n + 1} is no smaller`);
  assert.ok(L.killPoints('alebrije', 'melee') > L.killPoints('alebrije', 'gun'));
  assert.equal(L.waveBonus(3), 750);
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

test('the town: dry arroyo to the south, flat plaza, spawns inside the walls', () => {
  assert.equal(terrain(0, 0), 0); assert.equal(terrain(PLAYER_START.x, PLAYER_START.z), 0);
  assert.ok(terrain(0, arroyoCentre(0)) < -2, 'arroyo bed is sunk');
  assert.ok(terrain(10, arroyoCentre(10) + 5) < 0 && terrain(10, arroyoCentre(10) + 5) > -2.4, 'banks slope');
  for (const [x, z] of SPAWNS) assert.ok(x >= BOUNDS.x0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1, `spawn ${x},${z}`);
});

test('the door: El Halo replaces Ringworld, opens its own lazily loaded room; free play, no server', () => {
  const d = HALL_DOORS.find((x) => x.id === 'elhalo');
  assert.ok(d && d.open && d.name === 'EL HALO' && d.style === 'sol');
  assert.ok(!HALL_DOORS.some((x) => x.id === 'ringworld'));
  assert.equal(HALL_DOORS.filter((x) => !x.open).length, 6);
  assert.match(src('client/src/mines/mines.css'), /\.s-sol\s*\{/);
  const hall = src('client/src/mines/DoorHall.jsx');
  assert.match(hall, /lazy\(\(\) => import\('\.\/elhalo\/ElHaloRoom\.jsx'\)\)/);
  assert.doesNotMatch(hall, /^import .*elhalo/m, 'no static import of the game');
  assert.match(hall, /inside === 'elhalo'/);
  for (const f of fs.readdirSync(DIR)) {
    const s = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.doesNotMatch(s, /\/api\/|fetch\(|XMLHttpRequest|sendBeacon/, `${f} talks to no server`);
    assert.doesNotMatch(s, /bankroll|canBet|wager|\bbet\b/i, `${f} has no money in it`);
    assert.doesNotMatch(s, /\.(mp3|ogg|wav|m4a|glb|gltf|fbx)\b/i, `${f} loads no outside media; it is all generated`);
  }
  assert.doesNotMatch(src('server/mines.js'), /elhalo|el halo/i);
});

test('El Halo is its own thing: no names, characters or vehicles borrowed from any other shooter', () => {
  const banned = /master\s*chief|spartan|covenant|\belites?\b|\bgrunts?\b|\bjackals?\b|\bhunters?\b|warthog|ghost|banshee|scorpion|pelican|cortana|flood|forerunner|unsc|\bonis?\b|needler|plasma|energy sword|bungie|343|\bmjolnir\b|chief/i;
  for (const f of fs.readdirSync(DIR)) assert.doesNotMatch(fs.readFileSync(path.join(DIR, f), 'utf8'), banned, f);
});

// EL HALO (Hall of Doors): the rules, with no three.js and no DOM, so node:test can drive them. Times are seconds.
// An original arena shooter set in a sunset border town; nothing here is borrowed from any other game.

export const SHIELD = { max: 100, delay: 3.2, rate: 45 };   // waits `delay` after the last hit, then refills at `rate`/s
export const HEALTH = { max: 100 };                         // health never refills by itself: only botiquines do
export const GRENADES = { start: 2, max: 4, fuse: 1.7, radius: 5.5, damage: 120 };
export const MELEE = { damage: 60, range: 2.6, cooldown: 0.75 };

export const WEAPONS = {
  rifle: { id: 'rifle', name: 'LA CHICHARRA', mag: 32, reserve: 192, rate: 10, damage: 8, spread: 0.022, reload: 1.6, auto: true },
  pistol: { id: 'pistol', name: 'EL CHIFLÓN', mag: 10, reserve: 60, rate: 4, damage: 24, spread: 0.006, reload: 1.2, auto: false },
};

export const ENEMIES = {
  alebrije: { hp: 50, speed: 5.6, radius: 0.7, height: 1.1, bite: 12, biteEvery: 0.9, reach: 1.7, points: 100 },
  luchabot: { hp: 80, speed: 3.2, radius: 0.55, height: 1.9, bolt: 9, boltEvery: 1.7, boltSpeed: 20, keep: 12, points: 150 },
  jaguar: { hp: 260, speed: 2.6, radius: 1.1, height: 1.7, bite: 26, biteEvery: 1.3, reach: 2.4, points: 400 },
};

export function createPlayer() {
  return { health: HEALTH.max, shield: SHIELD.max, lastHit: -Infinity, grenades: GRENADES.start, dead: false, meleeAt: -Infinity,
    weapons: { rifle: loadout('rifle'), pistol: loadout('pistol') }, current: 'rifle', other: 'pistol' };
}
function loadout(id) { const w = WEAPONS[id]; return { id, mag: w.mag, reserve: w.reserve, nextShot: 0, reloadUntil: 0 }; }

// Shield takes the hit first; whatever is left over goes to health. Every hit restarts the recharge delay.
export function applyDamage(p, amount, now) {
  if (p.dead || amount <= 0) return { shieldBroke: false, dead: p.dead, toShield: 0, toHealth: 0 };
  const hadShield = p.shield > 0;
  const toShield = Math.min(p.shield, amount);
  p.shield -= toShield;
  const toHealth = Math.min(p.health, amount - toShield);
  p.health -= toHealth;
  p.lastHit = now;
  if (p.health <= 0) { p.health = 0; p.dead = true; }
  return { shieldBroke: hadShield && p.shield <= 0, dead: p.dead, toShield, toHealth };
}

// Returns 'charging' while it refills, 'full' on the tick it tops off, otherwise null.
export function tickShield(p, now, dt) {
  if (p.dead || p.shield >= SHIELD.max || now - p.lastHit < SHIELD.delay) return null;
  p.shield = Math.min(SHIELD.max, p.shield + SHIELD.rate * dt);
  return p.shield >= SHIELD.max ? 'full' : 'charging';
}

export const heal = (p, n) => { if (!p.dead) p.health = Math.min(HEALTH.max, p.health + n); };

export function reloading(p, now) { return p.weapons[p.current].reloadUntil > now; }

// One trigger pull. Returns true if a round left the barrel. An empty magazine starts a reload by itself.
export function tryFire(p, now) {
  const s = p.weapons[p.current], w = WEAPONS[s.id];
  if (p.dead || s.reloadUntil > now || now < s.nextShot) return false;
  if (s.mag <= 0) { startReload(p, now); return false; }
  s.mag -= 1; s.nextShot = now + 1 / w.rate;
  if (s.mag === 0) startReload(p, now);
  return true;
}

export function startReload(p, now) {
  const s = p.weapons[p.current], w = WEAPONS[s.id];
  if (s.reloadUntil > now || s.mag >= w.mag || s.reserve <= 0) return false;
  s.reloadUntil = now + w.reload;
  return true;
}

// Called every frame: a finished reload moves rounds from the reserve into the magazine.
export function tickReload(p, now) {
  for (const s of Object.values(p.weapons)) {
    if (s.reloadUntil && s.reloadUntil <= now) {
      const take = Math.min(WEAPONS[s.id].mag - s.mag, s.reserve);
      s.mag += take; s.reserve -= take; s.reloadUntil = 0;
    }
  }
}

export function swapWeapon(p) {
  const s = p.weapons[p.current]; s.reloadUntil = 0; // swapping cancels a reload, like you'd expect
  [p.current, p.other] = [p.other, p.current];
}

export function addAmmo(p, id, n) { const s = p.weapons[id]; s.reserve = Math.min(WEAPONS[id].reserve * 2, s.reserve + n); }
export function addGrenade(p, n = 1) { const before = p.grenades; p.grenades = Math.min(GRENADES.max, p.grenades + n); return p.grenades - before; }
export function throwGrenade(p) { if (p.dead || p.grenades <= 0) return false; p.grenades -= 1; return true; }
export function tryMelee(p, now) { if (p.dead || now - p.meleeAt < MELEE.cooldown) return false; p.meleeAt = now; return true; }

// Splash falls off linearly to nothing at the edge of the blast.
export const splash = (dist, radius = GRENADES.radius, damage = GRENADES.damage) => (dist >= radius ? 0 : Math.round(damage * (1 - dist / radius)));

// Who shows up in wave n (1-based): alebrijes from the start, luchabots from wave 2, a big winged jaguar every third wave.
export function waveRoster(n) {
  const out = [];
  const beasts = 3 + Math.floor(n * 1.5);
  const bots = n < 2 ? 0 : 1 + Math.floor((n - 1) * 0.9);
  const jaguars = n % 3 === 0 ? Math.floor(n / 3) : 0;
  for (let i = 0; i < beasts; i++) out.push('alebrije');
  for (let i = 0; i < bots; i++) out.push('luchabot');
  for (let i = 0; i < jaguars; i++) out.push('jaguar');
  return out;
}

export const waveBonus = (n) => 250 * n;
export const killPoints = (type, how) => ENEMIES[type].points * (how === 'melee' ? 2 : how === 'grenade' ? 1.5 : 1);

// Ray (origin o, unit direction d) against a sphere: distance to the hit or Infinity.
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? 0 : Infinity;
}

// Ray against an axis-aligned box {x0,x1,y0,y1,z0,z1}: entry distance or Infinity (slab method).
export function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (const [oa, da, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return Infinity; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Push a circle (x, z, r) out of a box's footprint. Returns the corrected position.
export function pushOut(x, z, r, b) {
  const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; return { x: x + dx * k, z: z + dz * k }; }
  // centre is inside the box: leave by the nearest face
  const opts = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]];
  opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
  return { x: x + opts[0][0], z: z + opts[0][1] };
}

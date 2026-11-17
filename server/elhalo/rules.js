// EL HALO rules, shared by the server match (server/elhalo/match.js) and the client (client/src/mines/elhalo).
// No three.js and no DOM, so node:test drives them. Times are seconds. An original game; nothing borrowed.

export const SHIELD = { max: 100, delay: 3.2, rate: 45 };   // waits `delay` after the last hit, then refills at `rate`/s
export const HEALTH = { max: 100 };                         // health never refills by itself: drops, revives and new rounds do
export const GRENADES = { start: 2, max: 4, fuse: 1.7, radius: 5.5, damage: 120, speed: 15, lift: 4.5 };
export const MELEE = { damage: 60, range: 2.6, cooldown: 0.75 };

export const WEAPONS = {
  rifle: { id: 'rifle', name: 'LA CHICHARRA', mag: 32, reserve: 192, rate: 10, damage: 8, spread: 0.022, reload: 1.6, auto: true },
  pistol: { id: 'pistol', name: 'EL CHIFLÓN', mag: 10, reserve: 60, rate: 4, damage: 24, spread: 0.006, reload: 1.2, auto: false },
};

// The horde. Cartoon party-crashers, not monsters: everyone bursts into confetti and marigolds.
//   luchador  fast, grabby, tackles from a few metres out
//   mariachi  keeps their distance and lobs musical notes (a trumpet blast up close)
//   granjero  a farmer with a pitchfork: slow, tanky, pulls boards off fast
//   padre     a padre with a censer: blesses nearby foes (heals them, hurries them along), weak in a scrap
export const ENEMIES = {
  luchador: { hp: 70, speed: 4.9, radius: 0.45, height: 1.9, hit: 12, every: 0.85, reach: 1.55, tackle: { range: 7, speed: 2.3, time: 0.6, damage: 22, cool: 4 }, tear: 1.2, points: 100 },
  mariachi: { hp: 60, speed: 3.1, radius: 0.42, height: 1.85, hit: 7, every: 1.0, reach: 1.5, note: { damage: 10, every: 1.9, speed: 16, keep: 11, range: 30 }, tear: 1.4, points: 120 },
  granjero: { hp: 170, speed: 2.5, radius: 0.5, height: 1.95, hit: 20, every: 1.3, reach: 2.1, tear: 0.6, points: 130 },
  padre: { hp: 120, speed: 2.7, radius: 0.46, height: 1.95, hit: 8, every: 1.1, reach: 1.5, bless: { every: 3.5, radius: 8, heal: 0.3, haste: 1.25, time: 3 }, keep: 6, tear: 1.4, points: 160 },
};
export const ENEMY_TYPES = Object.keys(ENEMIES);

export const MATCH = {
  tickHz: 10, maxAlive: 30, maxPlayers: 8, breakSecs: 8, firstBreakSecs: 5, overSecs: 9,
  downedSecs: 18, reviveSecs: 3, reviveRange: 1.9, respawnSecs: 22, buildSecs: 0.8, buildRange: 2.2, buyRange: 1.8,
  offlineDropSecs: 20, emptyResetSecs: 20, pickupLife: 25,
  points: { hit: 5, board: 10, boardsPerRound: 30, revive: 60, pvpKill: 100 },
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

// ---- waves. Round n with `players` people in the match. Deterministic given rnd.
export function waveSize(n, players = 1) {
  const base = 6 + 2.6 * n + 0.25 * n * n;
  return Math.min(90, Math.round(base * (1 + 0.5 * (Math.max(1, players) - 1))));
}
export function waveScale(n) {
  return { hp: 1 + 0.15 * (n - 1), speed: Math.min(1.45, 1 + 0.035 * (n - 1)), damage: Math.min(1.8, 1 + 0.05 * (n - 1)), gap: Math.max(0.35, 1.5 - 0.08 * n) };
}
export function waveMix(n) { // shares of each type for round n
  const mariachi = n < 2 ? 0 : Math.min(0.35, 0.12 + 0.025 * n);
  const padre = n < 4 ? 0 : Math.min(0.14, 0.06 + 0.01 * n);
  const granjero = n < 2 ? 0.25 : Math.min(0.3, 0.2 + 0.01 * n);
  return { luchador: 1 - mariachi - padre - granjero, mariachi, granjero, padre };
}
export function waveRoster(n, players = 1, rnd = Math.random) {
  const size = waveSize(n, players), mix = waveMix(n), out = [];
  for (const t of ENEMY_TYPES) for (let i = 0; i < Math.round(size * mix[t]); i++) out.push(t);
  if (n >= 4 && !out.includes('padre')) out[out.length - 1] = 'padre';
  while (out.length < size) out.push('luchador');
  out.length = size;
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const waveBonus = (n) => 50 * n;
export const killPoints = (type, how) => Math.round(ENEMIES[type].points * (how === 'melee' ? 1.6 : how === 'grenade' ? 1.25 : 1));

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
export { rayBox, pushOut } from './map.js';

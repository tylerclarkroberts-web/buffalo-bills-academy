// EL HALO rules, shared by the server match (server/elhalo/match.js) and the client (client/src/mines/elhalo).
// No three.js and no DOM, so node:test drives them. Times are seconds. An original game; nothing borrowed.

export const SHIELD = { max: 100, delay: 3.2, rate: 45 };   // waits `delay` after the last hit, then refills at `rate`/s
export const HEALTH = { max: 100 };                         // health never refills by itself: drops, revives and new rounds do
// Grenades. Piñatas (frags) bounce and go off on a timer; pegajosas stick to whatever they touch first.
export const GRENADES = { start: 2, max: 3, fuse: 1.7, radius: 5.5, damage: 120, speed: 15, lift: 4.5 };
export const STICKY = { start: 0, max: 2, fuse: 2.4, stuckFuse: 1.1, radius: 4.6, damage: 170, speed: 14, lift: 4, grab: 0.75 };
export const NADE_KINDS = ['frag', 'sticky'];
export const MELEE = { damage: 60, range: 2.6, cooldown: 0.75 };

// The armory. Every gun is an original low-poly design that plays like a familiar archetype.
//   kind: hitscan (default) | pellets (server spreads the pellets) | needle (homing crystals, server projectiles)
//         rocket (server projectile, splash) | beam (charge, then a piercing line) | melee (lunge + strike, no ammo,
//         a charge that runs down per swing)
//   head: headshot multiplier. Precision guns hit hardest; explosives and melee weapons get nothing extra.
//   tier: the order the supply truck hands them out (0 = what you start with).
export const WEAPONS = {
  pistol: { id: 'pistol', name: 'PISTOLA', mag: 10, reserve: 60, rate: 4, damage: 24, spread: 0.006, reload: 1.2, auto: false, range: 80, head: 2, tier: 0 },
  rifle: { id: 'rifle', name: 'RIFLE DE ASALTO', mag: 32, reserve: 192, rate: 10, damage: 8, spread: 0.022, reload: 1.6, auto: true, range: 60, head: 1.5, tier: 0 },
  chispas: { id: 'chispas', name: 'PISTOLA DE CHISPAS', mag: 24, reserve: 72, rate: 5, damage: 17, spread: 0.01, reload: 1.4, auto: false, range: 50, head: 1.5, stun: 0.8, tier: 1 },
  agujas: { id: 'agujas', name: 'AGUJAS', mag: 21, reserve: 84, rate: 9, damage: 7, spread: 0.03, reload: 1.8, auto: true, range: 45, head: 1.5, kind: 'needle', combine: 7, combineDamage: 150, combineRadius: 3.2, speed: 30, tier: 2 },
  rafaga: { id: 'rafaga', name: 'RIFLE DE RÁFAGA', mag: 36, reserve: 216, rate: 2.6, burst: 3, burstGap: 0.07, damage: 15, spread: 0.004, reload: 1.8, auto: false, range: 95, head: 2, tier: 3 },
  escopeta: { id: 'escopeta', name: 'ESCOPETA', mag: 6, reserve: 36, rate: 1.15, pellets: 9, damage: 16, spread: 0.075, reload: 2.4, auto: false, range: 14, head: 1.5, kind: 'pellets', tier: 4 },
  escopetita: { id: 'escopetita', name: 'LA ESCOPETITA', mag: 5, reserve: 30, rate: 2.2, pellets: 6, damage: 15, spread: 0.095, reload: 1.6, auto: false, range: 9, head: 1.5, kind: 'pellets', tier: 5 },
  francotirador: { id: 'francotirador', name: 'FRANCOTIRADOR', mag: 4, reserve: 24, rate: 1.1, damage: 110, spread: 0, reload: 2.2, auto: false, range: 220, head: 3, pierce: 2, zoom: 3.2, tier: 6 },
  machete: { id: 'machete', name: 'MACHETE DE ENERGÍA', mag: 12, reserve: 0, rate: 1.7, damage: 160, reach: 2.9, lunge: 6.5, auto: false, head: 1, kind: 'melee', tier: 7 },
  laser: { id: 'laser', name: 'CAÑÓN LÁSER', mag: 5, reserve: 10, rate: 0.75, damage: 320, spread: 0, reload: 2.6, auto: false, range: 160, head: 1.5, kind: 'beam', charge: 0.8, pierce: 6, tier: 8 },
  cohetes: { id: 'cohetes', name: 'LANZACOHETES', mag: 2, reserve: 8, rate: 1, damage: 230, radius: 5.5, speed: 34, reload: 2.8, auto: false, head: 1, kind: 'rocket', tier: 9 },
  martillo: { id: 'martillo', name: 'MARTILLO DE GRAVEDAD', mag: 10, reserve: 0, rate: 0.95, damage: 210, radius: 4.6, reach: 2.6, lunge: 5, auto: false, head: 1, kind: 'melee', slam: true, tier: 10 },
  // the jeep's mounted gun: endless belt, it just gets hot
  torreta: { id: 'torreta', name: 'AMETRALLADORA', mag: 60, reserve: 0, rate: 11, damage: 13, spread: 0.018, reload: 2.2, auto: true, range: 90, head: 1.5, mounted: true, tier: -1 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const HAND_WEAPONS = WEAPON_IDS.filter((id) => !WEAPONS[id].mounted);
export const START_WEAPONS = ['rifle', 'pistol'];
// The supply truck's list, weakest first. After the last one it keeps bringing the big stuff.
export const TRUCK_TIERS = HAND_WEAPONS.filter((id) => WEAPONS[id].tier > 0).sort((a, b) => WEAPONS[a].tier - WEAPONS[b].tier);
export function truckWeapon(waveCleared, rnd = Math.random) {
  const i = Math.max(0, waveCleared - 1);
  if (i < TRUCK_TIERS.length) return TRUCK_TIERS[i];
  const top = TRUCK_TIERS.slice(-4);
  return top[Math.floor(rnd() * top.length) % top.length];
}
export const headMult = (id) => WEAPONS[id]?.head ?? 1;
// damage at a distance: full out to 40% of the range, then down to a quarter at the range (pellets drop to nothing past 1.5x)
export function falloff(id, dist) {
  const w = WEAPONS[id]; if (!w.range) return 1;
  if (dist <= w.range * 0.4) return 1;
  if (dist >= w.range) return w.kind === 'pellets' ? Math.max(0, 0.25 * (1 - (dist - w.range) / (w.range * 0.5))) : 0.5;
  return 1 - 0.75 * (dist - w.range * 0.4) / (w.range * 0.6);
}

// The horde. Cartoon party-crashers at first; from wave 5 the canyon gets uglier, and from wave 10 it gets dark.
//   luchador   fast, grabby, tackles from a few metres out
//   mariachi   keeps their distance and lobs musical notes
//   granjero   a farmer with a pitchfork: slow, tanky
//   volador    one luchador in five: a winged mask and a long cape. Crouches, shouts, then sails high across the
//              canyon in a diving-eagle arc and lands on you with a shockwave (an original move)
//   gordo      (wave 3+) La Doña, the heavyweight: a huge woman in a flowered huipil, ten times a luchador's toughness, slow.
//              Belly-flops on you from a few metres out (and shouts ¡TORTA! when she lands), or wraps you in a bear hug up close.
//              Both wind up first, so you can get out of the way
//   padre      blesses nearby foes (heals them, hurries them along), weak in a scrap
//   chupacabra (wave 5+) gaunt, spiny and horribly fast, twitchy, pounces, climbs the fort walls
//   llorona    (wave 10+) floats, weeps, drifts through walls, wails, appears behind you
//   cucuy      (wave 10+) a hulking thing from under the bed: slow, huge hits
//   nahual     (wave 10+) a shapeshifter: a cloaked man that drops onto all fours as a wolf and runs you down
//   lechuza    (wave 10+) an owl-witch that circles high over the canyon and dives at your head
// head: where the head hitbox sits (height above the feet, radius, how far forward of the middle).
export const ENEMIES = {
  luchador: { hp: 70, speed: 4.9, radius: 0.45, height: 1.9, hit: 12, every: 0.85, reach: 1.55, tackle: { range: 7, speed: 2.3, time: 0.6, damage: 22, cool: 4 }, points: 100, climb: true, head: { y: 1.8, r: 0.3, f: 0 } },
  mariachi: { hp: 60, speed: 3.1, radius: 0.42, height: 1.85, hit: 7, every: 1.0, reach: 1.5, note: { damage: 10, every: 1.9, speed: 16, keep: 11, range: 30 }, points: 120, head: { y: 1.8, r: 0.3, f: 0 } },
  granjero: { hp: 170, speed: 2.5, radius: 0.5, height: 1.95, hit: 20, every: 1.3, reach: 2.1, points: 130, head: { y: 1.82, r: 0.3, f: 0 } },
  padre: { hp: 120, speed: 2.7, radius: 0.46, height: 1.95, hit: 8, every: 1.1, reach: 1.5, bless: { every: 3.5, radius: 8, heal: 0.3, haste: 1.25, time: 3 }, keep: 6, points: 160, head: { y: 1.82, r: 0.3, f: 0 } },
  chupacabra: { hp: 55, speed: 9.2, radius: 0.42, height: 1.15, hit: 13, every: 0.5, reach: 1.5, tackle: { range: 7.5, speed: 2.2, time: 0.45, damage: 20, cool: 2.6 }, points: 150, climb: true, jitter: true, head: { y: 0.95, r: 0.25, f: 0.55 } },
  llorona: { hp: 420, speed: 2.6, radius: 0.45, height: 2.1, hit: 18, every: 1.2, reach: 1.8, float: 0.55, etereo: true, wail: { every: 7, radius: 10, damage: 8 }, blink: { every: 10, dist: 6, min: 11 }, points: 500, cap: 2, head: { y: 1.85, r: 0.28, f: 0 } },
  cucuy: { hp: 320, speed: 3.4, radius: 0.62, height: 2.65, hit: 34, every: 1.4, reach: 2.3, points: 350, cap: 3, head: { y: 2.38, r: 0.36, f: 0.05 } },
  nahual: { hp: 120, speed: 6.6, radius: 0.5, height: 1.4, hit: 16, every: 0.7, reach: 1.7, tackle: { range: 8, speed: 2.1, time: 0.5, damage: 22, cool: 3.2 }, shift: { man: 0.55, wolf: 1.2, every: 4.5 }, points: 200, climb: true, cap: 6, head: { y: 1.1, r: 0.27, f: 0.6 } },
  // leap: min/range to start it, windup (the tell), air time, apex height, landing radius, damage at the middle, cooldown,
  // knockback (m), recover (stands there after landing), dy (most height difference it will jump)
  volador: { hp: 85, speed: 4.6, radius: 0.45, height: 1.9, hit: 12, every: 0.85, reach: 1.55, leap: { min: 6, range: 17, windup: 0.8, air: 1.15, apex: 5.5, radius: 2.5, damage: 42, cool: 7, push: 2.2, recover: 0.7, dy: 3.5 }, points: 180, climb: true, head: { y: 1.8, r: 0.3, f: 0 } },
  // ten luchadors' worth of health; heavy (barely shoved by hits) and only fits through doors
  gordo: { hp: 700, speed: 2.1, radius: 0.78, height: 2.15, hit: 0, every: 1, reach: 1.9, grab: { windup: 0.85, damage: 80, reach: 2.2, cool: 2.4 },
    leap: { min: 2.6, range: 6.5, windup: 1.1, air: 0.6, apex: 1.5, radius: 2.8, damage: 115, cool: 4.5, push: 2.8, recover: 1.0, dy: 1.0 }, heavy: true, doors: true, points: 800, cap: 3, head: { y: 2.0, r: 0.33, f: 0.05 } },
  lechuza: { hp: 70, speed: 7.5, radius: 0.5, height: 1.0, hit: 15, every: 1.5, reach: 1.7, fly: { cruise: 7, swoop: 11, near: 9 }, points: 220, cap: 4, head: { y: 0.8, r: 0.26, f: 0.2 } },
};
export const ENEMY_TYPES = Object.keys(ENEMIES);
export const FOLKLORE = ['llorona', 'cucuy', 'nahual', 'lechuza'];
// where an enemy's head is, given its pose (yaw: facing (-sin, -cos) like everything else; lift for floaters/flyers)
export function headOf(type, x, y, z, yaw = 0) {
  const h = ENEMIES[type].head;
  return { x: x - Math.sin(yaw) * h.f, y: y + h.y, z: z - Math.cos(yaw) * h.f, r: h.r };
}

// La Bufadora: a shared, server-timed geyser. Everyone sees the same rumble, then the same blast.
// period is seconds between blows (from the moment the match leaves the lobby); warn is the gurgle lead-in.
export const BUFADORA_RULES = { period: 300, warn: 4, blast: 2.4, launchVy: 28, enemyVy: 24 };

export const MATCH = {
  tickHz: 10, maxAlive: 30, maxPlayers: 8, breakSecs: 4, firstBreakSecs: 5, overSecs: 9,
  downedSecs: 20, reviveSecs: 3, reviveRange: 1.9, buyRange: 1.8, elote: { heal: 30, cool: 60 },
  offlineDropSecs: 20, emptyResetSecs: 20, pickupLife: 25,
  lobbyCountdown: 5, truck: { grab: 3.4, reach: 5 }, chupaWave: 5, nightWave: 10, jeepWave: 15, gordoWave: 3, voladorEvery: 5,
  jeep: { enter: 3.2, maxSpeed: 19, runOver: 260, hp: 1200 },
  spots: { ammoEvery: 18, nadeEvery: 26, maxAmmo: 4, maxNades: 3 },
  points: { hit: 5, revive: 60, pvpKill: 100, head: 5 },
};

// ---- your look: picked in the lobby, saved to your profile, worn in the match. Each slot is an option index.
export const LOOK = {
  poncho: ['ROSA', 'TURQUESA', 'MARIGOLD', 'NEGRO', 'ARCOÍRIS', 'ZIGZAG'],
  sombrero: ['CHARRO', 'RANCHERO', 'SOMBRERÓN', 'NINGUNO'],
  hatColor: ['PAJA', 'NEGRO', 'BLANCO', 'ROJO', 'VERDE', 'AZUL'],
  bigote: ['MANUBRIO', 'HERRADURA', 'LÁPIZ', 'NINGUNO'],
  cuello: ['NINGUNO', 'PALIACATE', 'SARAPE'],
  cuelloColor: ['ROJO', 'AZUL', 'NEGRO', 'MORADO', 'VERDE', 'NARANJA'],
  botas: ['CAFÉ', 'NEGRAS', 'PITÓN'],
};
export const LOOK_KEYS = Object.keys(LOOK);
export const DEFAULT_LOOK = [0, 0, 0, 0, 1, 0, 0];
// anything that came off the wire, made into a valid look (unknowns fall back to the default)
export function cleanLook(a) {
  const src = typeof a === 'string' ? [...a].map(Number) : Array.isArray(a) ? a : [];
  return LOOK_KEYS.map((k, i) => { const v = Math.floor(Number(src[i])); return Number.isFinite(v) && v >= 0 && v < LOOK[k].length ? v : DEFAULT_LOOK[i]; });
}
export const lookStr = (a) => cleanLook(a).join('');

export function createPlayer(slots = START_WEAPONS) {
  const weapons = {}; for (const id of slots) weapons[id] = loadout(id);
  return { health: HEALTH.max, shield: SHIELD.max, lastHit: -Infinity, nades: { frag: GRENADES.start, sticky: STICKY.start }, dead: false, meleeAt: -Infinity,
    weapons, current: slots[0], other: slots[1] };
}
export function loadout(id) { const w = WEAPONS[id]; return { id, mag: w.mag, reserve: w.reserve, nextShot: 0, reloadUntil: 0 }; }
// swap the gun in hand for a new one (or top up the one you already carry). Returns 'new' | 'refill'.
export function giveWeapon(p, id) {
  if (p.weapons[id]) { const s = p.weapons[id], w = WEAPONS[id]; s.mag = w.mag; s.reserve = Math.max(s.reserve, w.reserve); return 'refill'; }
  delete p.weapons[p.current]; p.weapons[id] = loadout(id); p.current = id; return 'new';
}

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
export function reloading(p, now) { return (p.weapons[p.current]?.reloadUntil || 0) > now; }

// One trigger pull. Returns true if a round left the barrel. An empty magazine starts a reload by itself.
// Melee weapons spend one charge per swing and never reload.
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
  if (s.reloadUntil > now || s.mag >= w.mag) return false;
  if (w.mounted) { s.reloadUntil = now + w.reload; return true; } // the belt cools down instead
  if (s.reserve <= 0) return false;
  s.reloadUntil = now + w.reload;
  return true;
}
export function tickReload(p, now) {
  for (const s of Object.values(p.weapons)) {
    if (s.reloadUntil && s.reloadUntil <= now) {
      const w = WEAPONS[s.id];
      if (w.mounted) { s.mag = w.mag; s.reloadUntil = 0; continue; }
      const take = Math.min(w.mag - s.mag, s.reserve);
      s.mag += take; s.reserve -= take; s.reloadUntil = 0;
    }
  }
}
export function swapWeapon(p) {
  const s = p.weapons[p.current]; if (s) s.reloadUntil = 0; // swapping cancels a reload, like you'd expect
  [p.current, p.other] = [p.other, p.current];
}
export function addAmmo(p, id, n) { const s = p.weapons[id]; if (!s || !WEAPONS[id].reserve) return; s.reserve = Math.min(WEAPONS[id].reserve * 2, s.reserve + n); }
// top up one gun (or melee charges) to a full magazine and at least a full reserve; cancels a reload in progress
export function refillWeapon(p, id) {
  const w = WEAPONS[id], s = p.weapons[id];
  if (!w || !s) return false;
  s.mag = w.mag;
  if (w.reserve) s.reserve = Math.max(s.reserve, w.reserve);
  s.reloadUntil = 0;
  return true;
}
// one ammo box: about a third of a full reserve for each gun you carry (melee charges don't come in boxes)
export const ammoPack = (id) => Math.ceil((WEAPONS[id]?.reserve || 0) / 3);
export function addGrenade(p, n = 1, kind = 'frag') {
  const cap = kind === 'sticky' ? STICKY.max : GRENADES.max;
  const before = p.nades[kind] || 0; p.nades[kind] = Math.min(cap, before + n); return p.nades[kind] - before;
}
export function throwGrenade(p, kind = 'frag') { if (p.dead || !(p.nades[kind] > 0)) return false; p.nades[kind] -= 1; return true; }
export function tryMelee(p, now, cooldown = MELEE.cooldown) { if (p.dead || now - p.meleeAt < cooldown) return false; p.meleeAt = now; return true; }

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
  const mariachi = n < 2 ? 0 : Math.min(0.3, 0.12 + 0.025 * n);
  const padre = n < 4 ? 0 : Math.min(0.12, 0.06 + 0.01 * n);
  const granjero = n < 2 ? 0.25 : Math.min(0.25, 0.2 + 0.01 * n);
  const chupacabra = n < MATCH.chupaWave ? 0 : Math.min(0.2, 0.1 + 0.015 * (n - MATCH.chupaWave));
  const night = n >= MATCH.nightWave;
  const cucuy = night ? 0.05 : 0, nahual = night ? 0.08 : 0, lechuza = night ? 0.07 : 0;
  const llorona = 0; // placed by hand below: one a wave at night, two from the jeep wave on
  const mix = { mariachi, granjero, padre, chupacabra, llorona, cucuy, nahual, lechuza, volador: 0, gordo: 0 }; // voladores and gordos are placed by hand
  const rest = Object.values(mix).reduce((a, b) => a + b, 0);
  if (rest > 0.85) for (const k of Object.keys(mix)) mix[k] *= 0.85 / rest; // luchadors never vanish entirely
  mix.luchador = 1 - Object.values(mix).reduce((a, b) => a + b, 0);
  return mix;
}
// the heavyweights: one from wave 3, two from wave 7, three from wave 11 on
export const gordos = (n) => (n < MATCH.gordoWave ? 0 : Math.min(3, 1 + Math.floor((n - MATCH.gordoWave) / 4)));
export function waveRoster(n, players = 1, rnd = Math.random) {
  const size = waveSize(n, players), mix = waveMix(n), out = [];
  for (const t of ENEMY_TYPES) for (let i = 0; i < Math.round(size * mix[t]); i++) out.push(t);
  while (out.length < size) out.push('luchador');
  out.length = size;
  const must = [];
  if (n >= 4) must.push('padre');
  if (n >= MATCH.chupaWave) must.push('chupacabra', 'chupacabra');
  if (n >= MATCH.nightWave) must.push('llorona', 'cucuy', 'nahual', 'lechuza');
  if (n >= MATCH.jeepWave) must.push('llorona');
  for (let i = 0; i < gordos(n); i++) must.push('gordo');
  for (const t of must) { const have = out.filter((x) => x === t).length, need = must.filter((x) => x === t).length; if (have < need) { let i = out.lastIndexOf('luchador'); if (i < 0) i = out.findLastIndex((x) => !must.includes(x)); if (i >= 0) out[i] = t; } }
  // one luchador in every five is a volador
  let lu = 0; for (let i = 0; i < out.length; i++) if (out[i] === 'luchador' && ++lu % MATCH.voladorEvery === 0) out[i] = 'volador';
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const waveBonus = (n) => 50 * n;
export const killPoints = (type, how) => Math.round(ENEMIES[type].points * (how === 'melee' ? 1.6 : how === 'grenade' ? 1.25 : how === 'head' ? 1.3 : 1));

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

// The Bug Gym, behind the Barn. Five ways to make a bug stronger, from honest to illegal. Everything here is pure: the
// Barn (server/barn.js, train) stores the result on the bug as `pen.gym`, and bugs that never set foot in the gym have
// no `gym` at all, which reads as all zeros (old barn.json rows need nothing).
//
//   fit     0..FIT_CAP   conditioning and technique: earned, and kept for good
//   roid    0..100       roid load: what is still in it from the vial. Fades by the hour; cool-downs flush it faster
//   strain  0..100       overwork: fades by the hour; cool-downs flush it faster
//
// Roid load is the dirty edge itself: its power comes and goes with the load, so working it off tapers the edge too.
// Load and strain make a bug unruly: slower and balky as a mine guide, slower off the mark in a fight, and liable to
// roid rage, which in the mine means it finishes off a knocked-out wild bug before anyone can jar it (server/pvp.js).
export const FIT_CAP = 0.2;             // clean work tops out at +20% damage
export const ROID_POWER = 0.006;        // damage per point of roid load: +60% at a full load
export const ROID_BULK = 0.002;         // and health: +20% at a full load
export const POWER_CAP = FIT_CAP + 100 * ROID_POWER;
export const DECAY_PER_HOUR = { roid: 0.75, strain: 1.5 }; // a full load is gone in about five and a half days, strain in under three
export const STRAIN_LIMIT = 90;         // past this it will not lift for overtime
export const HUNGER_FLOOR = 10;         // nor train at all on an empty stomach
export const RAGE_CAP = 0.85;
export const SLOWEST = 0.4;             // a mine guide never drops below this share of its pace

/**
 * The paths. Needs deltas apply to the bug's Fed / Mood / Clean meters; `fit` adds to conditioning, `roid` and `strain`
 * to the loads. XP is before fading by level (as care XP is). Cooldowns run per path, on the wall clock.
 */
export const PATHS = {
  clean: { name: 'Cardio & Drills', blurb: 'Laps of the water trough. Honest work.', cooldownMs: 30 * 60e3, cost: 0, xp: 9,
    fit: 0.01, needs: { mood: 6, hunger: -4, clean: -4 }, strain: -5 },
  spar: { name: 'Sparring Pit', blurb: 'Three rounds with a lesser bug from the woodpile.', cooldownMs: 45 * 60e3, cost: 0,
    needs: { hunger: -8, clean: -10 }, sharpOdds: 60,
    sharp: { xp: 14, fit: 0.02, needs: { mood: -2 } },  // a sharp bout
    rough: { xp: 8, fit: 0.01, needs: { mood: -6 } } }, // a rough scrap
  overwork: { name: 'Double Shift', blurb: 'Past the safe limit. The coach is not licensed.', cooldownMs: 15 * 60e3, cost: 0, xp: 12,
    fit: 0.035, needs: { mood: -20, hunger: -12, clean: -10 }, strain: 30 },
  roids: { name: 'Back-Alley Roids', blurb: 'A vial from a man behind the feed shed. Do not ask what is in it.', cooldownMs: 60 * 60e3, cost: 25, xp: 0,
    needs: { mood: -40 }, roid: 40 },
  cooldown: { name: 'Cool Down & Stretch', blurb: 'Ice bath, long stretch, a talk about feelings.', cooldownMs: 30 * 60e3, cost: 0, xp: 0,
    needs: { mood: 4 }, roid: -20, strain: -35 },
};
export const PATH_IDS = Object.keys(PATHS);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Wall-clock ms until `path` can be used again: none for a path never used. */
const coolLeft = (gym, path, now) => { const at = Number(gym?.cool?.[path]); return Number.isFinite(at) && at > 0 ? Math.max(0, at + PATHS[path].cooldownMs - now) : 0; };

/** The bug's gym loads at `now`, with the hourly fade applied. A bug with no `gym` is all zeros. */
export function gymAt(gym, now) {
  const g = gym && typeof gym === 'object' ? gym : {};
  const hours = Math.max(0, (num(now) - num(g.at || now)) / 3600e3);
  return {
    fit: clamp(num(g.fit), 0, FIT_CAP),
    roid: clamp(num(g.roid) - DECAY_PER_HOUR.roid * hours, 0, 100),
    strain: clamp(num(g.strain) - DECAY_PER_HOUR.strain * hours, 0, 100),
  };
}

/** What the loads add up to: combat power, unruliness, how it walks in the mine and its roid rage chance. */
export function gymEffects({ fit = 0, roid = 0, strain = 0 } = {}) {
  const power = clamp(fit + roid * ROID_POWER, 0, POWER_CAP);
  const bulk = clamp(roid * ROID_BULK, 0, 100 * ROID_BULK);
  const unruly = clamp(Math.round(roid * 0.7 + strain * 0.5), 0, 100);
  const mineSpeed = Math.round(clamp(1 - unruly * 0.006, SLOWEST, 1) * 100) / 100;
  const rage = roid > 0 || strain > 50 ? Math.round(clamp(roid * 0.006 + Math.max(0, strain - 50) * 0.004, 0, RAGE_CAP) * 100) / 100 : 0;
  const balk = Math.round((unruly / 100) * 0.5 * 100) / 100; // a guide's chance, each check, of stopping dead
  const slow = Math.round((unruly / 100) * 0.15 * 1000) / 1000; // off the mark in a fight: this much less likely to go first
  return { power: Math.round(power * 1000) / 1000, bulk: Math.round(bulk * 1000) / 1000, unruly, mineSpeed, rage, balk, slow };
}

/** Everything a page shows about one bug's gym record. */
export function gymView(gym, now) {
  const at = gymAt(gym, now), fx = gymEffects(at);
  const cool = Object.fromEntries(PATH_IDS.map((id) => [id, coolLeft(gym, id, now)]));
  return { fit: Math.round(at.fit * 1000) / 1000, roid: Math.round(at.roid), strain: Math.round(at.strain), ...fx, juiced: at.roid >= 1, cool,
    sessions: num(gym?.sessions), last: gym?.last || null };
}

/** What a fighter snapshot carries into the ring (engine/bout.js reads it): nothing at all for an untrained bug. */
export function gymFighter(gym, now) {
  if (!gym) return {};
  const fx = gymEffects(gymAt(gym, now));
  return { ...(fx.power ? { gym: fx.power } : {}), ...(fx.bulk ? { bulk: fx.bulk } : {}), ...(fx.slow ? { slow: fx.slow } : {}) };
}

/**
 * One session. `needs` are the bug's meters now; `roll(n)` picks 0..n-1 (sparring only). Returns the new `gym`, the
 * deltas for each meter, XP before fading, and how it went. Refusals throw `Error` with a player-facing message.
 */
export function trainStep(path, { gym, needs, now, roll = () => 0 }) {
  const p = PATHS[path];
  if (!p) throw new Error('The gym does not have that machine.');
  const at = gymAt(gym, now);
  const left = coolLeft(gym, path, now);
  if (left > 0) throw Object.assign(new Error(`${p.name} is still recovering. Give it ${Math.ceil(left / 60e3)} min.`), { status: 429 });
  if (path !== 'cooldown' && path !== 'roids' && needs.hunger < HUNGER_FLOOR) throw new Error('Too hungry to lift. Feed it first.');
  if (path === 'overwork' && at.strain >= STRAIN_LIMIT) throw new Error('It will not lift. It is lying under the bench, staring at the ceiling.');
  if (path === 'roids' && at.roid >= 100) throw new Error('There is no room left in it for more juice.');
  if (path === 'cooldown' && at.roid < 1 && at.strain < 1) throw new Error('Nothing to cool down from. It is as calm as a bug gets.');
  let outcome = null, xp = p.xp, fit = p.fit || 0, needsDelta = { ...p.needs };
  if (path === 'spar') {
    outcome = roll(100) < p.sharpOdds ? 'sharp' : 'rough';
    const o = p[outcome]; xp = o.xp; fit = o.fit;
    for (const [k, v] of Object.entries(o.needs)) needsDelta[k] = (needsDelta[k] || 0) + v;
  }
  const next = { fit: clamp(at.fit + fit, 0, FIT_CAP), roid: clamp(at.roid + (p.roid || 0), 0, 100), strain: clamp(at.strain + (p.strain || 0), 0, 100) };
  const after = {}, delta = {};
  for (const k of ['hunger', 'mood', 'clean']) { after[k] = clamp(num(needs[k]) + (needsDelta[k] || 0), 0, 100); delta[k] = Math.round(after[k] - num(needs[k])); }
  const before = gymEffects(at), now2 = gymEffects(next);
  return {
    gym: { ...next, at: now, cool: { ...(gym?.cool || {}), [path]: now }, sessions: num(gym?.sessions) + 1, last: { path, at: now, ...(outcome ? { outcome } : {}) } },
    needs: after, delta, xp, cost: p.cost, outcome,
    change: { power: Math.round((now2.power - before.power) * 1000) / 1000, unruly: now2.unruly - before.unruly, rage: Math.round((now2.rage - before.rage) * 100) / 100, mineSpeed: Math.round((now2.mineSpeed - before.mineSpeed) * 100) / 100 },
  };
}

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
// One workout a day: each bug picks ONE of the five paths per America/Los_Angeles calendar day.
// The stamp lives on the bug (`pen.gymLastAt`); a bug that has none (every bug before this rule) may train right away.
// The daily lock lifts at the next Pacific midnight after that workout (DST-correct). Per-path cooldowns still apply
// and can outlast the daily lock when a bug trains close to midnight.
export const GYM_TZ = 'America/Los_Angeles';
export const CREATINE_MS = 12 * 3600e3; // creatine: unlock at lastAt+12h if that comes before midnight PT

/**
 * Gym gear (sold in the General Store, catalog/bug.js). Worn by one bug for `days`; stored on the bug as
 * `gym.gear = { id: untilMs }` and dead the moment `untilMs` passes. Every boost stays inside the existing caps:
 * clean conditioning still tops out at FIT_CAP (+20% damage) and the GLP-1 health bonus counts toward the same
 * +20% HP ceiling the roids share. Creatine is not here: it is one dose, kept on the bug (server/barn.js).
 */
export const GEAR = {
  salts: { name: 'Smelling Salts', emoji: '🧂', days: 14, sharpOdds: 85 },          // the Sparring Pit: 60% sharp bouts -> 85%
  prework: { name: 'Pre-Workout', emoji: '⚡', days: 21, fitMult: 1.5 },            // +50% power from Cardio, Sparring and Double Shift
  mask: { name: 'Breathing Mask', emoji: '😷', days: 21, xpMult: 1.5, cardioFit: 0.005 }, // +50% XP everywhere, Cardio +0.5% more power
  banana: { name: 'Banana', emoji: '🍌', days: 14, moodKeep: 0.5 },                   // mood losses halved (not the vial: nothing fixes that)
  brace: { name: 'Knee Brace', emoji: '🦵', days: 28, overworkStrain: 18, strainLimit: 100 }, // Double Shift: +18 strain, not +30, and lifts until 100
  glp1: { name: 'GLP-1', emoji: '🖊️', days: 28, fadeMult: 2, bulk: 0.05, sulk: -3 }, // loads fade twice as fast, +5% HP; it sulks (-3 mood a workout)
  sweatband: { name: 'Sweatband', emoji: '🎽', days: 14, flush: 1.5 },     // Cool Down & Stretch flushes 50% more
};
export const GEAR_IDS = Object.keys(GEAR);
/** The gear still working on this bug at `now`: { id: msLeft }. */
export function gearOn(gym, now) {
  const out = {};
  for (const [id, until] of Object.entries(gym?.gear || {})) if (GEAR[id] && Number(until) > now) out[id] = Number(until) - now;
  return out;
}
const gymDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: GYM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const gymPartFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: GYM_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const gymParts = (ms) => Object.fromEntries(gymPartFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
const nextDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

/** The gym's calendar day ('YYYY-MM-DD') in America/Los_Angeles. */
export function gymDay(now) { return gymDayFmt.format(new Date(now)); }

/** UTC instant of 00:00:00 America/Los_Angeles on the calendar day `YYYY-MM-DD`. Verified with Intl, so DST is exact. */
export function gymMidnight(day) {
  for (const off of ['-08:00', '-07:00']) {
    const ms = Date.parse(`${day}T00:00:00${off}`);
    if (!Number.isFinite(ms)) continue;
    const p = gymParts(ms);
    if (`${p.year}-${p.month}-${p.day}` === day && p.hour === '00' && p.minute === '00' && p.second === '00') return ms;
  }
  throw new Error(`no Pacific midnight for ${day}`);
}

/** The next Pacific midnight strictly after `now`. An instant that is itself midnight waits until the following one. */
export function nextGymMidnight(now) { return gymMidnight(nextDate(gymDay(now))); }

/** When a bug last stamped at `lastAt` may train again: 0 when it never has (or the stamp is junk). */
/** `short`: creatine was in it for that workout (or went in after), so it unlocks at lastAt+12h or midnight PT, whichever is sooner. */
export const gymReadyAt = (lastAt, short = false) => {
  const at = Number(lastAt);
  if (!Number.isFinite(at) || at <= 0) return 0;
  const midnight = nextGymMidnight(at);
  return short ? Math.min(at + CREATINE_MS, midnight) : midnight;
};
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
  const from = num(g.at || now);
  // GLP-1 doubles the fade for the hours it was on the bug (from the last session to now, or to when it ran out)
  const glp = Math.max(0, Math.min(num(now), num(g.gear?.glp1)) - from) / 3600e3;
  const hours = Math.max(0, (num(now) - from) / 3600e3) + glp * (GEAR.glp1.fadeMult - 1);
  return {
    fit: clamp(num(g.fit), 0, FIT_CAP),
    roid: clamp(num(g.roid) - DECAY_PER_HOUR.roid * hours, 0, 100),
    strain: clamp(num(g.strain) - DECAY_PER_HOUR.strain * hours, 0, 100),
  };
}

/** What the loads add up to: combat power, unruliness, how it walks in the mine and its roid rage chance. */
export function gymEffects({ fit = 0, roid = 0, strain = 0 } = {}, on = {}) {
  const power = clamp(fit + roid * ROID_POWER, 0, POWER_CAP);
  const bulk = clamp(roid * ROID_BULK + (on.glp1 ? GEAR.glp1.bulk : 0), 0, 100 * ROID_BULK);
  const unruly = clamp(Math.round(roid * 0.7 + strain * 0.5), 0, 100);
  const mineSpeed = Math.round(clamp(1 - unruly * 0.006, SLOWEST, 1) * 100) / 100;
  const rage = roid > 0 || strain > 50 ? Math.round(clamp(roid * 0.006 + Math.max(0, strain - 50) * 0.004, 0, RAGE_CAP) * 100) / 100 : 0;
  const balk = Math.round((unruly / 100) * 0.5 * 100) / 100; // a guide's chance, each check, of stopping dead
  const slow = Math.round((unruly / 100) * 0.15 * 1000) / 1000; // off the mark in a fight: this much less likely to go first
  return { power: Math.round(power * 1000) / 1000, bulk: Math.round(bulk * 1000) / 1000, unruly, mineSpeed, rage, balk, slow };
}

/** Everything a page shows about one bug's gym record. */
export function gymView(gym, now) {
  const on = gearOn(gym, now), at = gymAt(gym, now), fx = gymEffects(at, on);
  const cool = Object.fromEntries(PATH_IDS.map((id) => [id, coolLeft(gym, id, now)]));
  return { fit: Math.round(at.fit * 1000) / 1000, roid: Math.round(at.roid), strain: Math.round(at.strain), ...fx, juiced: at.roid >= 1, cool,
    sessions: num(gym?.sessions), last: gym?.last || null, gear: on };
}

/** What a fighter snapshot carries into the ring (engine/bout.js reads it): nothing at all for an untrained bug. */
export function gymFighter(gym, now) {
  if (!gym) return {};
  const fx = gymEffects(gymAt(gym, now), gearOn(gym, now));
  return { ...(fx.power ? { gym: fx.power } : {}), ...(fx.bulk ? { bulk: fx.bulk } : {}), ...(fx.slow ? { slow: fx.slow } : {}) };
}

/**
 * One session. `needs` are the bug's meters now; `roll(n)` picks 0..n-1 (sparring only). Returns the new `gym`, the
 * deltas for each meter, XP before fading, and how it went. Refusals throw `Error` with a player-facing message.
 */
export function trainStep(path, { gym, needs, now, roll = () => 0 }) {
  const p = PATHS[path];
  if (!p) throw new Error('The gym does not have that machine.');
  const at = gymAt(gym, now), on = gearOn(gym, now);
  const left = coolLeft(gym, path, now);
  if (left > 0) throw Object.assign(new Error(`${p.name} is still recovering. Give it ${Math.ceil(left / 60e3)} min.`), { status: 429 });
  if (path !== 'cooldown' && path !== 'roids' && needs.hunger < HUNGER_FLOOR) throw new Error('Too hungry to lift. Feed it first.');
  if (path === 'overwork' && at.strain >= (on.brace ? GEAR.brace.strainLimit : STRAIN_LIMIT)) throw new Error('It will not lift. It is lying under the bench, staring at the ceiling.');
  if (path === 'roids' && at.roid >= 100) throw new Error('There is no room left in it for more juice.');
  if (path === 'cooldown' && at.roid < 1 && at.strain < 1) throw new Error('Nothing to cool down from. It is as calm as a bug gets.');
  const helped = [], help = (id, what) => helped.push({ id, name: GEAR[id].name, emoji: GEAR[id].emoji, what });
  let outcome = null, xp = p.xp, fit = p.fit || 0, needsDelta = { ...p.needs }, roid = p.roid || 0, strain = p.strain || 0;
  if (path === 'spar') {
    const odds = on.salts ? GEAR.salts.sharpOdds : p.sharpOdds;
    outcome = roll(100) < odds ? 'sharp' : 'rough';
    if (on.salts) help('salts', `${odds}% odds of a sharp bout`);
    const o = p[outcome]; xp = o.xp; fit = o.fit;
    for (const [k, v] of Object.entries(o.needs)) needsDelta[k] = (needsDelta[k] || 0) + v;
  }
  if (on.mask && path === 'clean') { fit += GEAR.mask.cardioFit; }
  if (on.prework && fit > 0) { fit *= GEAR.prework.fitMult; help('prework', `+${Math.round((GEAR.prework.fitMult - 1) * 100)}% power gain`); }
  if (on.mask && (xp > 0 || path === 'clean')) { xp = Math.round(xp * GEAR.mask.xpMult); help('mask', path === 'clean' ? `+50% XP, +${GEAR.mask.cardioFit * 100}% power` : '+50% XP'); }
  if (on.brace && path === 'overwork') { strain = GEAR.brace.overworkStrain; help('brace', `+${strain} strain, not +${p.strain}`); }
  if (on.sweatband && path === 'cooldown') { roid = Math.round(roid * GEAR.sweatband.flush); strain = Math.round(strain * GEAR.sweatband.flush); help('sweatband', '+50% flush'); }
  if (on.banana && path !== 'roids' && (needsDelta.mood || 0) < 0) { needsDelta.mood = Math.round(needsDelta.mood * GEAR.banana.moodKeep); help('banana', 'half the mood loss'); }
  if (on.glp1) { needsDelta.mood = (needsDelta.mood || 0) + GEAR.glp1.sulk; help('glp1', `sulks: ${GEAR.glp1.sulk} mood`); }
  const next = { fit: clamp(at.fit + fit, 0, FIT_CAP), roid: clamp(at.roid + roid, 0, 100), strain: clamp(at.strain + strain, 0, 100) };
  const after = {}, delta = {};
  for (const k of ['hunger', 'mood', 'clean']) { after[k] = clamp(num(needs[k]) + (needsDelta[k] || 0), 0, 100); delta[k] = Math.round(after[k] - num(needs[k])); }
  const before = gymEffects(at, on), now2 = gymEffects(next, on);
  return {
    gym: { ...next, at: now, cool: { ...(gym?.cool || {}), [path]: now }, sessions: num(gym?.sessions) + 1, last: { path, at: now, ...(outcome ? { outcome } : {}) }, ...(gym?.gear ? { gear: gym.gear } : {}) },
    needs: after, delta, xp, cost: p.cost, outcome, helped,
    change: { power: Math.round((now2.power - before.power) * 1000) / 1000, unruly: now2.unruly - before.unruly, rage: Math.round((now2.rage - before.rage) * 100) / 100, mineSpeed: Math.round((now2.mineSpeed - before.mineSpeed) * 100) / 100 },
  };
}

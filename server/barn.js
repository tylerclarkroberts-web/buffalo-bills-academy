// The Barn (v30): one egg or creature per account, raised in real time. The server decides everything:
// whether a mine shift has an egg (mines.js), which creature is inside (rolled at pickup, hidden until it hatches),
// when it hatches, how its needs decay, and its level. No money in or out here, no selling and no trading.
// v33: residents are real bugs (engine/bugs.js); old hybrid rows are migrated once, quietly, on load.
// v33: bugs can die of neglect, tamagotchi-style, but only slowly: STARVE_MS (21 days) after the last feed (or the
// end of an automatic feeder's run). Warnings start at 7 days. Death is computed from stored times, never a timer,
// so a server restart can't cause or skip one. A dead bug leaves a gravestone until it's laid to rest; then the
// stall is empty and a new egg can turn up in the mines.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { ROSTER, BY_ID, ABILITY_LEVELS, levelFor, xpFor } from './engine/creatures.js';
import { simulateBout } from './engine/bout.js';

export const EGG_CHANCE = 6000; // out of 100,000 shifts (6%), for players with an empty barn
export const DEFAULT_INCUBATE_MS = 3 * 24 * 3600e3;
// Needs decay gently: from full to empty in about a week (hunger, v33: was 2 days), 2.5 days (mood) and 3 days
// (cleanliness). Hunger is only the gauge; what kills is time since the last feed (STARVE_MS), not the gauge at zero.
export const DECAY_PER_HOUR = { hunger: 0.6, mood: 1.6, clean: 1.4 };
const DAY = 24 * 3600e3;
export const STARVE_MS = 21 * DAY;     // no food at all for three weeks
export const WARN_MS = [7 * DAY, 14 * DAY, 18 * DAY]; // hungry, weak, critical
export const MIN_LIFE_MS = 7 * DAY;    // belt and braces: never dies in its first week, whatever the clocks say
export const CARE = {
  feed: { stat: 'hunger', gain: 35, cooldownMs: 20 * 60e3, word: 'fed' },
  play: { stat: 'mood', gain: 30, cooldownMs: 20 * 60e3, word: 'played with' },
  clean: { stat: 'clean', gain: 45, cooldownMs: 40 * 60e3, word: 'hosed down' },
};
export const CARE_XP = 12;   // per care action...
export const CARE_XP_PER_DAY = 120; // ...up to this much a day (UTC), so a week of steady care reaches level 5
export const DAY_XP = 10;    // per full day since hatching, while it's not neglected
export const BOOST_XP = 6;   // a store mister or heat lamp: half a care action, inside the same daily cap
export const FEEDER_DAY_XP = 12; // per full day an automatic feeder covers: one feed's worth, so paying for it still levels the bug
export const BOUT_LEVEL = 5;
export const BOUT_COOLDOWN_MS = 60 * 60e3; // one bout an hour
const STATS = ['hunger', 'mood', 'clean'];
const ORDINALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => (n <= 10 ? ORDINALS[n - 1] : String(n));

export class Barn {
  constructor({ store, now, incubateMs, eggInt, forceEgg = false, startXp = 0, starveMs } = {}) {
    // starveMs: dev/e2e only (BARN_TEST_STARVE_MS), shrinks the whole neglect timeline proportionally
    this.starveMs = Number(starveMs) > 0 ? Number(starveMs) : STARVE_MS; this.k = this.starveMs / STARVE_MS;
    this.store = store; this.now = now; this.forceEgg = !!forceEgg; this.startXp = Math.max(0, Number(startXp) || 0);
    this.incubateMs = Number(incubateMs) > 0 ? Number(incubateMs) : DEFAULT_INCUBATE_MS;
    this.eggInt = eggInt || ((n) => crypto.randomInt(n)); // its own random source: never the mine's pay or vein ones
    this.doc = store.loadDoc('barn', { pens: {}, names: {}, count: {} });
    this.doc.pens ||= {}; this.doc.names ||= {}; this.doc.count ||= {}; this.doc.graves ||= {};
    if (this.migrate()) this.save();
  }
  /** v33: hybrid eggs and creatures become randomly chosen bugs. Level, XP, needs, record and cooldowns are kept;
   * the name follows the new species; the feeding clock restarts so nobody's bug is suddenly starving. */
  migrate() {
    let n = 0; const now = this.now();
    for (const [id, pen] of Object.entries(this.doc.pens)) {
      if (BY_ID[pen.species]) continue;
      const bug = ROSTER[this.eggInt(ROSTER.length)];
      pen.oldSpecies = pen.species; pen.species = bug.id; pen.migratedAt = now; n++;
      if (pen.stage === 'creature') {
        pen.name = this.newName(id, bug);
        pen.fedAt = Math.max(pen.fedAt || 0, now);
        delete pen.lastBout; // its replay names a species that no longer exists
      }
    }
    return n;
  }
  newName(playerId, bug) {
    const nick = bug.sci.split(' ')[0];
    const n = (this.doc.count[bug.id] || 0) + 1;
    let name = `${nick} ${roman(n)}`.trim();
    while (this.doc.names[name.toLowerCase()]) name = `${nick} ${roman(n + 1)}-${crypto.randomInt(1000)}`; // belt and braces
    this.doc.count[bug.id] = n;
    this.doc.names[name.toLowerCase()] = playerId;
    return name;
  }
  /** When it dies if nobody feeds it (ms epoch). Automatic feeder time counts as fed. */
  deathAt(pen) {
    const fed = Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    return Math.max(fed + this.starveMs, (pen.bornAt || 0) + MIN_LIFE_MS * this.k, (pen.migratedAt || 0) + MIN_LIFE_MS * this.k);
  }
  starving(pen, now) { // 0 fine, 1 hungry, 2 weak, 3 critical
    const since = now - Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    return WARN_MS.filter((w) => since >= w * this.k).length;
  }
  save() { this.store.saveDoc('barn', this.doc); }
  has(playerId) { return !!this.doc.pens[playerId]; }

  /** At clock-in: does this shift have an egg in it? Only ever for a player whose barn is empty. */
  rollEgg(playerId) { return !this.has(playerId) && (this.forceEgg || this.eggInt(100000) < EGG_CHANCE); }

  /** Picking the egg up in the mine. Which creature is inside is decided now and kept secret until it hatches. */
  layEgg(playerId) {
    if (this.has(playerId)) throw new GameError('Your barn already has a resident. One per rancher.', 409);
    const now = this.now();
    const species = ROSTER[this.eggInt(ROSTER.length)].id;
    this.doc.pens[playerId] = { stage: 'egg', species, eggAt: now, hatchAt: now + this.incubateMs, warmedAt: 0 };
    this.save();
    return this.view(playerId);
  }

  /** Needs right now, from the last stored value and how long it's been (computed, never ticked on a timer). */
  needs(pen, now) {
    const out = {};
    for (const s of STATS) {
      const v = pen.stats[s];
      let dt = Math.max(0, now - v.at);
      if (s === 'hunger' && pen.feederUntil) dt -= Math.max(0, Math.min(now, pen.feederUntil) - Math.max(v.at, pen.feederFrom || 0)); // the feeder keeps the bowl full
      out[s] = Math.max(0, Math.min(100, v.v - (DECAY_PER_HOUR[s] * Math.max(0, dt)) / 3600e3));
    }
    return out;
  }
  hatchIfDue(playerId, pen, now) {
    if (pen.stage !== 'egg' || now < pen.hatchAt) return false;
    const at = pen.hatchAt;
    const name = this.newName(playerId, BY_ID[pen.species]);
    Object.assign(pen, { stage: 'creature', name, bornAt: at, fedAt: at, xp: this.startXp, dayXpAt: at, cool: {},
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 80, at }])) });
    return true;
  }
  /** Day bonus: every full day alive adds DAY_XP, if its needs averaged at least 25 at the end of that day. */
  accrue(pen, now) {
    now = Math.min(now, pen.diedAt || Infinity);
    while (now - pen.dayXpAt >= 24 * 3600e3) {
      pen.dayXpAt += 24 * 3600e3;
      const n = this.needs(pen, pen.dayXpAt);
      if ((n.hunger + n.mood + n.clean) / 3 >= 25) pen.xp += DAY_XP;
      if ((pen.feederUntil || 0) >= pen.dayXpAt && (pen.feederFrom || 0) < pen.dayXpAt) pen.xp += FEEDER_DAY_XP;
    }
  }
  refresh(playerId) {
    const pen = this.doc.pens[playerId]; if (!pen) return null;
    const now = this.now();
    let dirty = this.hatchIfDue(playerId, pen, now);
    if (pen.stage === 'creature') {
      const before = pen.xp; const dies = this.deathAt(pen);
      if (now >= dies) { pen.diedAt = dies; }
      this.accrue(pen, now); dirty ||= pen.xp !== before;
      if (pen.diedAt) { pen.stage = 'dead'; dirty = true; }
    }
    if (dirty) this.save();
    return pen;
  }

  view(playerId) {
    const pen = this.refresh(playerId);
    const now = this.now();
    if (!pen) return { pen: null, serverNow: now };
    if (pen.stage === 'egg') return { pen: { stage: 'egg', eggAt: pen.eggAt, hatchAt: pen.hatchAt, warmCoolMs: Math.max(0, (pen.warmedAt || 0) + CARE.play.cooldownMs - now) }, serverNow: now };
    const c = BY_ID[pen.species];
    if (pen.stage === 'dead') return { pen: { stage: 'dead', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp), record: pen.record || { w: 0, l: 0, d: 0 } }, serverNow: now };
    const level = levelFor(pen.xp);
    const needs = this.needs(pen, now);
    const cool = Object.fromEntries(Object.entries(CARE).map(([k, a]) => [k, Math.max(0, (pen.cool[k] || 0) + a.cooldownMs - now)]));
    const dies = this.deathAt(pen); const warn = this.starving(pen, now);
    return { pen: { stage: 'creature', species: c.id, speciesName: c.name, sci: c.sci, name: pen.name, bornAt: pen.bornAt,
      fedAt: pen.fedAt, feederUntil: pen.feederUntil || 0, style: this.looksOf(playerId) || null, gearBonus: this.styleOf?.(playerId).gearBonus || 0, starving: warn, diesInMs: warn ? Math.max(0, dies - now) : null,
      level, xp: pen.xp, xpThis: xpFor(level), xpNext: level >= 10 ? null : xpFor(level + 1),
      needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, Math.round(v)])), cool,
      abilities: c.abilities.map((name, i) => ({ name, level: ABILITY_LEVELS[i], unlocked: level >= ABILITY_LEVELS[i] })),
      arena: level >= BOUT_LEVEL, mood: moodWord(needs), record: pen.record || { w: 0, l: 0, d: 0 },
      boutCoolMs: Math.max(0, (pen.boutAt || 0) + BOUT_COOLDOWN_MS - now), lastBout: pen.lastBout || null }, serverNow: now };
  }

  /** Feed, play or clean. Free, on a cooldown. */
  care(playerId, action) {
    const a = CARE[action];
    if (!a) throw new GameError('The barn does not know how to do that.', 400);
    const pen = this.refresh(playerId);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    const now = this.now();
    if (pen.stage === 'egg') {
      // The only thing you can do for an egg is keep it warm. It's for you; the egg doesn't care. Hatch time is fixed.
      if (action !== 'play') throw new GameError('It is an egg. Maybe just keep it warm.', 409);
      if (now - (pen.warmedAt || 0) < a.cooldownMs) throw new GameError('The egg is toasty. Give it a minute.', 429);
      pen.warmedAt = now; this.save();
      return this.view(playerId);
    }
    if (pen.stage === 'dead') throw new GameError('It is past caring now.', 409);
    if (now - (pen.cool[action] || 0) < a.cooldownMs) throw new GameError(`You just ${a.word} it. Give it a minute.`, 429);
    const n = this.needs(pen, now);
    const day = Math.floor(now / 86400e3);
    if (pen.xpDay !== day) { pen.xpDay = day; pen.xpToday = 0; }
    for (const s of STATS) pen.stats[s] = { v: n[s], at: now }; // re-base all three, then bump one
    const toy = action === 'play' ? (this.styleOf?.(playerId).toyMood || 0) : 0; // store toy: capped at +20
    pen.stats[a.stat].v = Math.min(100, n[a.stat] + a.gain + toy);
    pen.cool[action] = now;
    if (action === 'feed') pen.fedAt = now;
    const gain = Math.min(CARE_XP, CARE_XP_PER_DAY - pen.xpToday);
    if (gain > 0) { pen.xp += gain; pen.xpToday += gain; }
    this.save();
    return this.view(playerId);
  }

  /**
   * A bout: the server picks the opponent (another rancher's level-5+ creature at random, or a travelling stray when
   * there isn't one), rolls a seed, runs the deterministic sim and stores the log so it replays the same everywhere.
   * Cosmetic: no money, no XP. Only the challenger's record changes; the other rancher is never notified.
   */
  bout(playerId) {
    const pen = this.refresh(playerId);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    if (pen.stage === 'dead') throw new GameError('It is resting. For good.', 409);
    if (pen.stage !== 'creature') throw new GameError('Eggs do not fight. Mostly.', 409);
    const now = this.now();
    const level = levelFor(pen.xp);
    if (level < BOUT_LEVEL) throw new GameError(`Bouts open at level ${BOUT_LEVEL}.`, 409);
    if (now - (pen.boutAt || 0) < BOUT_COOLDOWN_MS) throw new GameError('It is still icing its ego. Try again later.', 429);
    const low = (n) => Math.round(Math.min(n.hunger, n.mood, n.clean));
    const rivals = Object.entries(this.doc.pens).filter(([id, p]) => id !== playerId && p.stage === 'creature' && now < this.deathAt(p) && levelFor(p.xp) >= BOUT_LEVEL);
    let them;
    if (rivals.length) {
      const [id, p] = rivals[this.eggInt(rivals.length)];
      them = { species: p.species, name: p.name, level: levelFor(p.xp), mood: low(this.needs(p, now)), stray: false, gear: this.styleOf?.(id).gearBonus || 0, style: this.looksOf(id) };
    } else {
      const k = ROSTER[this.eggInt(ROSTER.length)];
      them = { species: k.id, name: `Stray ${k.name}`, level: BOUT_LEVEL, mood: 60, stray: true };
    }
    const you = { species: pen.species, name: pen.name, level, mood: low(this.needs(pen, now)), gear: this.styleOf?.(playerId).gearBonus || 0, style: this.looksOf(playerId) };
    const seed = `${now}:${this.eggInt(1e9)}`;
    const { rounds, winner } = simulateBout(you, them, seed);
    pen.record ||= { w: 0, l: 0, d: 0 };
    pen.record[winner === 0 ? 'w' : winner === 1 ? 'l' : 'd'] += 1;
    pen.boutAt = now;
    pen.lastBout = { at: now, seed, you, them, rounds, result: winner === 0 ? 'won' : winner === 1 ? 'lost' : 'draw' };
    this.save();
    return this.view(playerId);
  }

  /** Cosmetic store looks for a bug (skin palette, hat, accessory), for drawing only. */
  looksOf(playerId) {
    const st = this.styleOf?.(playerId) || {};
    const o = {}; for (const k of ['bugskin', 'bughat', 'bugacc']) if (st[k]) o[k] = st[k];
    return Object.keys(o).length ? o : undefined;
  }
  /** After a death: lay it to rest. The stall empties (a new egg can turn up in the mines); a small grave record stays. */
  bury(playerId) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'dead') throw new GameError('There is nothing to bury. Good.', 409);
    (this.doc.graves[playerId] ||= []).push({ name: pen.name, species: pen.species, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp) });
    this.doc.graves[playerId] = this.doc.graves[playerId].slice(-10);
    delete this.doc.pens[playerId]; this.save();
    return { ...this.view(playerId), graves: this.doc.graves[playerId] };
  }
  /** A store consumable: bump one need and earn `xp` care XP inside the daily cap (food also counts as a feed). */
  boost(playerId, { stat, gain, fed = false, xp = fed ? CARE_XP : 0 }) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    const now = this.now(); const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats[stat].v = Math.min(100, n[stat] + Math.max(0, Math.min(100, gain)));
    if (fed) pen.fedAt = now;
    if (xp > 0) {
      const day = Math.floor(now / 86400e3);
      if (pen.xpDay !== day) { pen.xpDay = day; pen.xpToday = 0; }
      const g = Math.min(xp, CARE_XP_PER_DAY - pen.xpToday);
      if (g > 0) { pen.xp += g; pen.xpToday += g; }
    }
    this.save();
    return this.view(playerId);
  }
  /** Automatic feeder (bought in the General Store): keeps the bowl full and the starvation clock paused for `ms`. */
  addFeeder(playerId, ms) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('The feeder needs a hatched bug to feed.', 409);
    const now = this.now();
    const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats.hunger.v = 100;
    if (!pen.feederUntil || pen.feederUntil < now) { pen.feederFrom = now; pen.feederUntil = now; }
    pen.feederUntil += ms; this.save();
    return this.view(playerId);
  }
  forget(playerId) { // account deleted: the barn goes with it; its name stays retired so it's never reused
    if (!this.doc.pens[playerId]) return;
    delete this.doc.pens[playerId]; delete this.doc.graves[playerId]; this.save();
  }
}
function moodWord(n) {
  const low = Math.min(n.hunger, n.mood, n.clean);
  if (low >= 70) return 'thriving';
  if (low >= 40) return 'content';
  if (low >= 15) return n.hunger === low ? 'peckish' : n.mood === low ? 'bored' : 'grubby';
  return 'sulking';
}

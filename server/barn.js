// The Barn: a few stalls of eggs and bugs per account, raised in real time. One of them is the partner (doc.pens):
// the bug beside its owner in the mine and the terrarium. The rest wait in stalls (doc.bench), where a bug's needs,
// hunger and day XP run BENCH_SLOW times slower. The server decides everything:
// whether a mine shift has an egg (mines.js), which creature is inside (rolled at pickup, hidden until it hatches),
// when it hatches, how its needs decay, and its level. Bouts stake play money; bugs change hands only at the trading post (server/trades.js).
// v33: residents are real bugs (engine/bugs.js); old hybrid rows are migrated once, quietly, on load.
// v33: bugs can die of neglect, tamagotchi-style, but only slowly: STARVE_MS (21 days) after the last feed (or the
// end of an automatic feeder's run). Warnings start at 7 days. Death is computed from stored times, never a timer,
// so a server restart can't cause or skip one. A dead bug occupies its stall until its gravestone is laid to rest.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { ROSTER, BY_ID, givenName, levelFor, rawLevel, xpFor, formOf, PAUSED_AT, STAGE_CAPS } from './engine/creatures.js';
import { Fights } from './fights.js';
import { movesFor, battleFor, combatStats, traitFor, STANCES, riskFor, fadedXp, fightXp } from './engine/bug-combat.js';
import { QUIRKS, MAN_QUIRKS } from './engine/bout.js';
import { line } from './engine/bout.js';
import { rarityOf, LEGENDARY } from './engine/bug-types.js';
import { isSteeze, STEEZE_STUCK } from './engine/steeze.js';
import { cents } from './accounts.js';
import { PATHS, GEAR, gymAt, gymEffects, gymView, gymFighter, trainStep, gymReadyAt, gearOn } from './engine/gym.js';
import { varietyFor, cleanVariety } from './engine/variety.js';

export const EGG_CHANCE = 15000; // out of 100,000 shifts (15%) with an empty barn
export const STALLS = 3;                        // every barn starts with room for three
export const STALL_COSTS = [1500, 4000, 10000]; // the fourth, fifth and sixth stall
export const BENCH_SLOW = 5;                    // a stalled bug lives this many times slower than the partner
export const isHeesheeHeld = (pen) => !!(pen && (pen.heesheeHeld || pen.heesheeHeldAt)); // taken by the Heeshee; still in the barn, just away
/** Shown whenever a lost bug would start or join a fight. */
export const HEESHEE_NO_BATTLE = "You can't battle a bug, your bug is lost.";
/** Stolen on the live shift, or held on the barn row. Either flag is enough. */
export function bugLostToHeeshee(barn, playerId, mines = barn?.mines) {
  if (!playerId || !barn) return false;
  if (typeof barn.heesheeHoldOf === 'function' ? barn.heesheeHoldOf(playerId) : null) return true;
  if ((typeof barn.heesheeHolds === 'function' ? barn.heesheeHolds(playerId) : [])?.length) return true;
  const cur = mines?.doc?.active?.[playerId];
  return !!(cur && !cur.settlement && cur.heesheeStolen);
}

const STRAYS_KEPT = 50;                         // released bugs loose in the mines at once; the oldest wander off for good
/** What names one bug among its owner's: when its egg was picked up (rows from before stalls: when it hatched). */
export const idOf = (pen) => pen.eggAt || pen.bornAt;
/** The Bugdex entries a kept bug stands for: itself as hatched and every stage it has evolved through. An egg is still a secret. */
const formsOf = (pen) => (pen.stage === 'egg' ? [] : Array.from({ length: (pen.evo || 0) + 1 }, (_, evo) => formOf(pen.species, evo)));
const idOk = (v) => v === undefined || Number.isFinite(v);
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
export const CARE_XP = 9;   // per care action. No daily cap: the care cooldowns are the only brake
export const DAY_XP = 8;    // per full day since hatching, while it's not neglected
export const BOOST_XP = 5;   // a mister or heat lamp (no longer sold; ones already held still work): half a care action
export const FEEDER_DAY_XP = 9; // per full day an automatic feeder covers: one feed's worth, so paying for it still levels the bug
export const BOUT_LEVEL = 1; // any hatched bug: they could already fight in the mine
export const BOUT_XP = 15;
export const BOUT_WIN_XP = 8; // on top, for the winner of an even fight; an underdog's win pays up to 18, a favourite's as little as 2 (upsetXp)
export const FIND_XP = 1;      // each acid pool a guide bug leads its miner to. ponytail: uncapped (pool travel time is the brake); cap it if someone farms shifts
export const BOUT_OPEN_MS = 60 * 60e3;
export const MAX_BOUT_STAKE = 10000;
export const BOUT_STAKE_STEP = 10; // a named stake is $0, $10, $20…: never cents
// Both mine bugs that fight to a verdict earn BATTLE_XP; the winner gets a bonus scaled by the line.
export const BATTLE_XP = 15;
export const WIN_BONUS_XP = 22;
export const RECOVER_MS = 60 * 60e3;
export const FAST_HEAL_COST = 50;
// Evolution. A partner whose XP has reached EVOLVE_FROM may find purple acid on a mine shift: one shift in four at
// first, certain by EVOLVE_BY. It comes home sick, and the Bug Center visit that follows rebuilds it for BILL_SHARE of
// its owner's cash. One rebuild in BOTCH_ODDS goes wrong: the bug still evolves, with one of the QUIRKS (engine/bout.js) for good.
export const EVOLVE_FROM = 10, EVOLVE_BY = 13, BILL_SHARE = 0.5, BOTCH_ODDS = 15;
// The second evolution. A stage two partner with the XP for MECH_FROM may leave a mine shift with the specialist:
// one shift in four at first, certain by MECH_BY. It is gone until its owner claims it at the Bug Center, where the
// rebuild costs one of their other bugs for parts (or BILL_SHARE of their cash if they keep no other). Same odds of a botch.
export const MECH_FROM = 23, MECH_BY = 26;
const RANGES = [[EVOLVE_FROM, EVOLVE_BY], [MECH_FROM, MECH_BY]];
// A one-time recap for the first Stage II rebuild, which ran from a stale heal tab and skipped the specialist's
// panels. Matched only on this Empusa: no barn.json edit is required on deploy, and nobody else is offered the news.
export const EVO_NEWS_PLAYER = '9dbf29cf-9704-44e7-bdf3-b6d5cd241853';
export const EVO_NEWS_AT = 1795475094187;
export const EVO_NEWS_BILL = { had: 10853.56, took: 5426.78, left: 5426.78 };
const EVO_NEWS_LEVELS = { levelBefore: 9, levelAfter: 10 };
export const purpleChance = (xp, stage = 0) => Math.max(0, Math.min(1, (rawLevel(xp) - RANGES[stage][0] + 1) / (RANGES[stage][1] - RANGES[stage][0] + 1)));
/** Outside a fight only a knockout persists. Older standing bugs with saved damage recover here too. */
export function healthOf(pen) {
  return pen && !pen.faintedAt ? 100 : 0;
}
export const CHALLENGE_OPEN_MS = 24 * 3600e3; // a challenge waits a day: nothing is held, so it can afford to

/** Whole-dollar stakes as $100, otherwise two decimals. */
export const stakeText = (n) => {
  const v = cents(n);
  return `$${v % 1 ? v.toFixed(2) : String(Math.round(v))}`;
};

/**
 * Turn a ready() error about `rival` into a third-person line for the player who is accepting.
 * Never uses "your" to mean the other owner.
 */
export function rivalBusyMessage(rival, error, { opponent } = {}) {
  const name = rival?.name || 'Someone';
  const msg = error?.message || '';
  if (msg === 'One of your bugs is in the ring right now.') {
    return opponent ? `${name} is already in a fight with ${opponent}.` : `${name} is already in a fight.`;
  }
  const fainted = /^(.+) fainted\./.exec(msg);
  if (fainted) return `${name}'s ${fainted[1]} fainted — they need the Bug Center first.`;
  if (msg === HEESHEE_NO_BATTLE) return `${name}'s bug is with the Heeshee Mazode.`;
  if (msg.includes('It is resting. For good')) return `${name}'s bug is gone.`;
  if (msg.includes('Eggs do not fight')) return `${name}'s bug has not hatched yet.`;
  if (msg.includes('Bouts open at level') || msg.includes('too young')) return `${name}'s bug is too young to fight.`;
  if (msg.includes('barn is empty')) return `${name} has no bug to fight.`;
  return `${name}'s bug is not ready.`;
}

export const FIGHT_LOG = 20;                  // recent fights anyone can watch
const RING_KINDS = ['barn', 'circuit'];        // fights the Barn page follows live (the circuit's are played from its tab)
const STATS = ['hunger', 'mood', 'clean'];
const ORDINALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => (n <= 10 ? ORDINALS[n - 1] : String(n));


/** How many trainers the leaderboard highlight names (the champion, plus up to two runners-up). */
export const BUG_TRAINER_TOP = 3;

/** A living hatched bug's standing: displayed level first (the same level combat uses), then XP, then wins. */
export function strengthOf(pen) {
  if (!pen || pen.stage !== 'creature') return null;
  const xp = Math.max(0, Number(pen.xp) || 0);
  const rec = pen.record || {};
  return {
    name: givenName(pen.species, pen.name),
    species: pen.species || '',
    speciesName: BY_ID[pen.species]?.name || pen.species || '',
    level: levelFor(xp, pen.cap),
    xp,
    record: { w: Math.max(0, Number(rec.w) || 0), l: Math.max(0, Number(rec.l) || 0), d: Math.max(0, Number(rec.d) || 0) },
  };
}

export function compareTrainerBugs(a, b) {
  if (!a || !b) return 0;
  return (b.level - a.level) || (b.xp - a.xp) || (b.record.w - a.record.w)
    || (a.name || '').localeCompare(b.name || '') || (a.species || '').localeCompare(b.species || '');
}

/** Strongest living hatched bug per eligible trainer, best first. Eggs, graves and hidden players do not count. */
export function strongestTrainers(barn, { players = barn?.store?.players, limit = BUG_TRAINER_TOP, eligible } = {}) {
  const rows = [];
  for (const p of Object.values(players || {})) {
    if (!p || p.hidden) continue;
    if (eligible && !eligible(p)) continue;
    let best = null;
    for (const pen of (barn?.bugs?.(p.id) || [])) {
      const s = strengthOf(pen);
      if (s && (!best || compareTrainerBugs(best, s) > 0)) best = s;
    }
    if (best) rows.push({ id: p.id, name: p.name, picture: p.google?.picture || null, player: p, bug: best });
  }
  rows.sort((a, b) => compareTrainerBugs(a.bug, b.bug) || (a.name || '').localeCompare(b.name || '') || String(a.id).localeCompare(String(b.id)));
  return rows.slice(0, Math.max(0, Number(limit) || 0));
}

export class Barn {
  constructor({ store, accounts, now, incubateMs, eggInt, evoInt, gymInt, forceEgg = false, startXp = 0, starveMs, fights } = {}) {
    // starveMs: dev/e2e only (BARN_TEST_STARVE_MS), shrinks the whole neglect timeline proportionally
    this.starveMs = Number(starveMs) > 0 ? Number(starveMs) : STARVE_MS; this.k = this.starveMs / STARVE_MS;
    this.store = store; this.accounts = accounts; this.now = now; this.forceEgg = !!forceEgg; this.startXp = Math.max(0, Number(startXp) || 0);
    this.incubateMs = Number(incubateMs) > 0 ? Number(incubateMs) : DEFAULT_INCUBATE_MS;
    this.eggInt = eggInt || ((n) => crypto.randomInt(n)); // its own random source: never the mine's pay or vein ones
    this.evoInt = evoInt || ((n) => crypto.randomInt(n)); // evolution's own source, for the same reason
    this.gymInt = gymInt || ((n) => crypto.randomInt(n)); // the sparring pit's
    this.doc = store.loadDoc('barn', { pens: {}, names: {}, count: {} });
    this.doc.pens ||= {}; this.doc.names ||= {}; this.doc.count ||= {}; this.doc.graves ||= {};
    this.doc.challenges ||= []; this.doc.fights ||= []; this.doc.bench ||= {}; this.doc.stalls ||= {}; this.doc.dex ||= {};
    this.fights = fights || new Fights({ now }); // the mine shares this one (server/app.js)
    let dirty = this.migrate() > 0;
    // The Bugdex. Every fight anywhere starts in `fights`, so that is where bugs are met, each in the form it fought in
    // (an evolved bug's stage is in its style); what the barn already knows (bugs kept, graves, the fights still on
    // the board) counts from before it existed.
    const fought = (fighters) => fighters.map((f) => formOf(f.species, f.style?.evo));
    this.fights.onStart = ({ players, fighters }) => { this.saw(players, fought(fighters)); };
    for (const pid of new Set([...Object.keys(this.doc.pens), ...Object.keys(this.doc.bench), ...Object.keys(this.doc.graves)])) {
      dirty = this.saw(pid, [...this.bugs(pid).flatMap(formsOf), ...(this.doc.graves[pid] || []).map((grave) => grave.species)]) || dirty;
    }
    for (const { sides } of this.doc.fights) dirty = this.saw(sides.map((side) => side.ownerId).filter((id) => store.players?.[id]), fought(sides.map((side) => side.fighter))) || dirty; // not an account since deleted
    if (dirty) this.save();
  }
  /**
   * These players have met these forms (`formOf`): kept one, been in a fight with one, or spotted one down the mine.
   * A species as hatched and each of its evolved stages are met separately. True when it is news. It only marks: a
   * fight's start is in the middle of committing its stakes, so the write is the caller's, or the fight's own ending.
   * ponytail: a restart before the barn is next saved forgets a meeting; the next boot gets it back if the fight
   * made the board.
   */
  saw(players, species) {
    let news = false; const now = this.now();
    for (const pid of [players].flat()) {
      if (!pid) continue;
      for (const id of [species].flat()) if (BY_ID[String(id).replace(/:[12]$/, '')] && !this.doc.dex[pid]?.[id]) { (this.doc.dex[pid] ||= {})[id] = now; news = true; }
    }
    return news;
  }
  /** v33: hybrid eggs and creatures become randomly chosen bugs. Level, XP, needs, record and cooldowns are kept;
   * the name follows the new species; the feeding clock restarts so nobody's bug is suddenly starving. */
  migrate() {
    let n = 0; const now = this.now();
    for (const [id, pen] of Object.entries(this.doc.pens)) {
      if (pen.stage === 'creature' && !pen.combatVersion) {
        pen.legacyAbilities = [1, 3, 5].filter((level) => levelFor(pen.xp, pen.cap) >= level).length;
        pen.combatVersion = 1; n++;
      }
      if (pen.stage === 'creature' && BY_ID[pen.species]?.fixedName && pen.name !== BY_ID[pen.species].name) {
        pen.name = BY_ID[pen.species].name; n++;
      }
      if (BY_ID[pen.species]) continue;
      const bug = ROSTER[this.eggInt(ROSTER.length)];
      pen.oldSpecies = pen.species; pen.species = bug.id; pen.migratedAt = now; n++;
      if (pen.stage === 'creature') {
        pen.name = this.newName(id, bug);
        pen.fedAt = Math.max(pen.fedAt || 0, now);
        delete pen.lastBout; // its replay names a species that no longer exists
      }
    }
    // Variety (engine/variety.js): every bug and egg gets its own look once, from its id, and keeps it from then on.
    // Nothing else on the pen changes, and the look is the one it would have been given anyway.
    for (const pen of [...Object.values(this.doc.pens), ...Object.values(this.doc.bench).flat()]) {
      if (!pen || !['egg', 'creature'].includes(pen.stage) || !BY_ID[pen.species] || !idOf(pen) || cleanVariety(pen.variety)) continue;
      pen.variety = varietyFor(idOf(pen), pen.species); n++;
    }
    return n;
  }
  newName(playerId, bug, records = this.doc) {
    if (bug?.fixedName) {
      records.count[bug.id] = (records.count[bug.id] || 0) + 1;
      return bug.name;
    }
    const nick = bug.sci.split(' ')[0];
    const n = (records.count[bug.id] || 0) + 1;
    let name = `${nick} ${roman(n)}`.trim();
    while (records.names[name.toLowerCase()]) name = `${nick} ${roman(n + 1)}-${crypto.randomInt(1000)}`; // belt and braces
    records.count[bug.id] = n;
    records.names[name.toLowerCase()] = playerId;
    return name;
  }
  /** When it dies if nobody feeds it (ms epoch). Automatic feeder time counts as fed. */
  deathAt(pen) {
    const fed = Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    let starves = fed + this.starveMs; // on the bug's own clock; a stalled bug's runs slow
    if (pen.benchedAt && starves > pen.benchedAt) starves = pen.benchedAt + (starves - pen.benchedAt) * BENCH_SLOW;
    return Math.max(starves, (pen.bornAt || 0) + MIN_LIFE_MS * this.k, (pen.migratedAt || 0) + MIN_LIFE_MS * this.k);
  }
  starving(pen, now) { // 0 fine, 1 hungry, 2 weak, 3 critical
    const since = this.own(pen, now) - Math.max(pen.fedAt || pen.bornAt || 0, pen.feederUntil || 0);
    return WARN_MS.filter((w) => since >= w * this.k).length;
  }
  /**
   * A bug's own clock. Its needs, hunger and day XP are kept in this time: the wall's for the partner, BENCH_SLOW
   * times slower in a stall. ponytail: a store feeder's dates stay on the wall clock, so one bought for a bug that is
   * later stalled covers fewer of its slow days than it would as partner; put those on this clock if anyone minds.
   */
  own(pen, now) { return pen.benchedAt ? pen.benchedAt + Math.max(0, now - pen.benchedAt) / BENCH_SLOW : now; }
  /** Leaving a stall: the slow clock is settled into its times, so its needs carry on from where they are. */
  unstall(pen) {
    if (!pen.benchedAt) return pen;
    const now = this.now(), late = now - this.own(pen, now), { benchedAt: _benchedAt, ...out } = structuredClone(pen);
    for (const s of STATS) out.stats[s].at += late;
    out.fedAt += late; out.dayXpAt += late;
    return out;
  }
  save() { this.store.saveDoc('barn', this.doc); }
  /** Every bug a player keeps, partner first. */
  bugs(playerId) { const partner = this.doc.pens[playerId]; return [...(partner ? [partner] : []), ...(this.doc.bench[playerId] || [])]; }
  /** Champion plus runners-up for the leaderboard, from this barn's live pens and stalls. */
  strongestTrainers(opts) { return strongestTrainers(this, opts); }
  /** One of them by id; with no id, the partner. */
  penOf(playerId, bug) { return bug == null ? this.doc.pens[playerId] || null : this.bugs(playerId).find((pen) => idOf(pen) === Number(bug)) || null; }
  /** The change that puts `pen` back where it lives: its stall, or the partner's place. */
  slot(playerId, pen) {
    const partner = this.doc.pens[playerId], bench = this.doc.bench[playerId] || [], same = (other) => idOf(other) === idOf(pen);
    if (bench.some(same) && !(partner && same(partner))) return { bench: { ...this.doc.bench, [playerId]: bench.map((other) => (same(other) ? pen : other)) } };
    return { pens: { ...this.doc.pens, [playerId]: pen } };
  }
  commitPen(playerId, pen) { this.commitDoc(this.slot(playerId, pen)); }
  /** Written before it replaces what is in memory, so a failed write leaves the last saved barn in place. */
  commitDoc(changes) {
    const next = { ...this.doc, ...changes };
    this.store.saveDoc('barn', next);
    this.doc = next;
  }
  has(playerId) { return this.bugs(playerId).length > 0; }
  stalls(playerId) { return STALLS + (this.doc.stalls[playerId] || 0); }
  /** A stall is free. An egg, a bug and a grave not yet laid to rest each take one. */
  room(playerId) { return this.bugs(playerId).length < this.stalls(playerId); }

  rollEgg(playerId) { return !this.has(playerId) && (this.forceEgg || this.eggInt(100000) < EGG_CHANCE); }

  /** Picking the egg up in the mine. Which creature is inside is decided now and kept secret until it hatches. */
  layEgg(playerId) {
    if (this.has(playerId)) throw new GameError('Mine eggs only turn up for an empty barn.', 409);
    const now = this.now();
    const commons = ROSTER.filter((bug) => rarityOf(bug.id) === 1); // an egg is always a common: the rest are met down the mine
    const species = commons[this.eggInt(commons.length)].id;
    const egg = { stage: 'egg', species, eggAt: now, hatchAt: now + this.incubateMs, warmedAt: 0, variety: varietyFor(now, species) };
    this.commitPen(playerId, egg);
    return this.view(playerId);
  }
  wildCaught(id, battleId) {
    const caught = this.doc.wildCatches?.[id];
    return battleId === undefined ? !!caught : caught === battleId;
  }
  /** A wild bug jarred in the mine takes a free stall at the level it was caught, at full health. */
  adopt(playerId, { wildId, battleId, species, level, name = null }) { // `name`: a released stray keeps the one it had
    if (!wildId || !battleId || this.wildCaught(wildId)) throw new GameError('There is nothing wild here.', 409);
    if (!this.room(playerId)) throw new GameError('Every stall is taken. Nowhere to put it.', 409);
    const now = this.now(), stalled = !!this.doc.pens[playerId];
    let at = now; while (this.bugs(playerId).some((pen) => idOf(pen) === at || pen.bornAt === at)) at++; // its id, and the bornAt its fight receipts go by
    const changes = { names: { ...this.doc.names }, count: { ...this.doc.count }, wildCatches: { ...this.doc.wildCatches, [wildId]: battleId } };
    if (name) changes.names[name.toLowerCase()] = playerId;
    const pen = { stage: 'creature', species, name: givenName(species, name || this.newName(playerId, BY_ID[species], changes)), eggAt: at, bornAt: at, caughtAt: now, fedAt: now, xp: xpFor(level), dayXpAt: now, cool: {}, combatVersion: 1,
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 60, at: now }])), variety: varietyFor(at, species), ...(stalled ? { benchedAt: now } : {}) };
    if (stalled) changes.bench = { ...this.doc.bench, [playerId]: [...(this.doc.bench[playerId] || []), pen] };
    else changes.pens = { ...this.doc.pens, [playerId]: pen };
    this.commitDoc(changes); // ownership and removal from the mine survive a restart together
    return pen;
  }
  /** Another stall, paid for on the spot. */
  buildStall(playerId) {
    const built = this.doc.stalls[playerId] || 0, cost = STALL_COSTS[built];
    if (cost === undefined) throw new GameError('The barn has no room for another stall.', 409);
    const player = this.accounts.ensure(this.store.players[playerId]);
    this.accounts.requireFunds(player, cost, 'a new stall');
    this.accounts.change(player, -cost, 'barn-stall', 'Barn: built a stall');
    this.commitDoc({ stalls: { ...this.doc.stalls, [playerId]: built + 1 } });
    return this.view(playerId);
  }
  /** Choose the bug that comes with you. The old partner takes its stall, and its clock slows from now. */
  setPartner(playerId, bug) {
    this.refresh(playerId);
    const pen = this.refresh(playerId, bug), partner = this.doc.pens[playerId];
    if (!pen || pen.stage !== 'creature') throw new GameError('Only a hatched, living bug can be your partner.', 409);
    if (pen === partner) return this.view(playerId);
    if (this.fights.fightOf(playerId)) throw new GameError('Not while one of your bugs is in a fight.', 409);
    const stalled = partner.stage === 'creature' ? { ...partner, benchedAt: this.now() } : partner;
    this.commitDoc({ pens: { ...this.doc.pens, [playerId]: this.unstall(pen) }, bench: { ...this.doc.bench, [playerId]: this.doc.bench[playerId].map((other) => (other === pen ? stalled : other)) } });
    return this.view(playerId);
  }
  /** The partner's place is never left empty while a stall has someone in it: the first living bug steps up. */
  promote(playerId) {
    const bench = this.doc.bench[playerId];
    if (this.doc.pens[playerId] || !bench?.length) return;
    const next = bench.find((pen) => pen.stage === 'creature') || bench[0];
    this.commitDoc({ pens: { ...this.doc.pens, [playerId]: this.unstall(next) }, bench: { ...this.doc.bench, [playerId]: bench.filter((pen) => pen !== next) } });
  }

  /** Needs right now, from the last stored value and how long it's been (computed, never ticked on a timer). */
  needs(pen, now) { return this.needsAt(pen, this.own(pen, now)); }
  /** The same at a moment on the bug's own clock. */
  needsAt(pen, now) {
    const out = {};
    for (const s of STATS) {
      const v = pen.stats[s];
      let dt = Math.max(0, now - v.at);
      if (pen.feederUntil) dt -= Math.max(0, Math.min(now, pen.feederUntil) - Math.max(v.at, pen.feederFrom || 0)); // the feeder keeps all three where they were
      out[s] = Math.max(0, Math.min(100, v.v - (DECAY_PER_HOUR[s] * Math.max(0, dt)) / 3600e3));
    }
    return out;
  }
  hatchIfDue(playerId, pen, now, stalled = false) {
    if (pen.stage !== 'egg' || now < pen.hatchAt) return false;
    const at = pen.hatchAt;
    const name = this.newName(playerId, BY_ID[pen.species]);
    Object.assign(pen, { stage: 'creature', name, bornAt: at, fedAt: at, xp: this.startXp, dayXpAt: at, cool: {}, combatVersion: 1,
      stats: Object.fromEntries(STATS.map((s) => [s, { v: 80, at }])), ...(stalled ? { benchedAt: at } : {}) });
    return true;
  }
  /** Day bonus: every full day alive (on its own clock) adds DAY_XP, if its needs averaged at least 25 at the end of that day, and `toyXp` for the toy it is left with. */
  accrue(pen, now, toyXp = 0) {
    now = this.own(pen, Math.min(now, pen.diedAt || Infinity));
    while (now - pen.dayXpAt >= 24 * 3600e3) {
      pen.dayXpAt += 24 * 3600e3;
      const n = this.needsAt(pen, pen.dayXpAt);
      const level = levelFor(pen.xp, pen.cap); // each day's XP fades by the level it had that day
      if ((n.hunger + n.mood + n.clean) / 3 >= 25) pen.xp += fadedXp(DAY_XP, level);
      pen.xp += fadedXp(toyXp, level);
      if ((pen.feederUntil || 0) >= pen.dayXpAt && (pen.feederFrom || 0) < pen.dayXpAt) pen.xp += fadedXp(FEEDER_DAY_XP, level);
    }
  }
  /** Bring one bug up to date (the partner, or the one named) and hand it back. */
  refresh(playerId, bug) {
    this.applyBoutReward(playerId);
    this.promote(playerId);
    const pen = this.penOf(playerId, bug);
    if (!pen) { if (bug != null) throw new GameError('That bug is not in your barn.', 404); return null; }
    const now = this.now();
    let dirty = this.hatchIfDue(playerId, pen, now, pen !== this.doc.pens[playerId]);
    dirty = this.saw(playerId, formsOf(pen)) || dirty; // the Bugdex: hatched, caught or evolved, its owner has met it
    // the top level it can show, by its stage: held at PAUSED_AT until it evolves. Stamped here so every level lookup can read it off the bug.
    const cap = STAGE_CAPS[pen.evo || 0] ?? PAUSED_AT; if (pen.cap !== cap) { pen.cap = cap; dirty = true; }
    if (pen.stage === 'creature' && !isHeesheeHeld(pen)) {
      const before = pen.xp; const dies = this.deathAt(pen);
      if (now >= dies) { pen.diedAt = dies; }
      this.accrue(pen, now, pen === this.doc.pens[playerId] ? this.styleOf?.(playerId).toyXp || 0 : 0); dirty ||= pen.xp !== before; // the toy is in the terrarium, with the partner
      if (pen.diedAt) { pen.stage = 'dead'; dirty = true; }
    }
    if (dirty) this.save();
    return pen;
  }

  /** `seen` is the Barn page itself asking: it clears the "decided while you were away" flag and reports it once. */
  view(playerId, { seen = false } = {}) {
    this.fights.sweep();
    this.expireBouts();
    try { this.trades?.settle(); } catch (error) { console.error('Trade settle failed:', error.message); } // expired offers' cash goes home
    const player = this.store.players?.[playerId], unseenBout = seen && !!player?.barnBouts?.unseen;
    if (unseenBout) this.store.commitPlayerDrafts([{ ...player, barnBouts: { ...player.barnBouts, unseen: null } }]);
    const stable = this.stable(playerId);
    // `pen` is the partner, as every page that knows one bug expects; `lastBout` the newest fight of any of them.
    const evoNews = this.evoNewsOf(playerId);
    return { pen: stable.bugs.find((bug) => bug.partner) || null, serverNow: this.now(), stable, lastBout: stable.bugs.map((bug) => bug.lastBout).filter(Boolean).sort((a, b) => b.at - a.at)[0] || null,
      ...this.board(playerId), ...this.ring(playerId), unseenBout, live: this.fights.fightOf(playerId)?.id || null, dex: Object.keys(this.doc.dex[playerId] || {}), tradeWaiting: this.trades?.count(playerId) || 0, ...(evoNews ? { evoNews } : {}) };
  }
  /** The stalls: how many, what the next one costs, and every bug in them as its owner sees it, partner first. */
  stable(playerId) {
    this.refresh(playerId);
    return { stalls: this.stalls(playerId), nextStall: STALL_COSTS[this.doc.stalls[playerId] || 0] ?? null, slow: BENCH_SLOW,
      bugs: this.bugs(playerId).map((pen) => idOf(pen)).map((id) => this.petView(playerId, id).pen) };
  }

  /** The ring: every living bug, the caller's challenges and the recent fights. The same for a player with no bug. */
  ring(playerId) {
    const now = this.now(), players = this.store.players || {}, corner = this.corner(playerId);
    const roster = Object.keys(this.doc.pens).flatMap((ownerId) => this.bugs(ownerId).flatMap((pen) => {
      const owner = players[ownerId];
      if (!owner || owner.hidden || pen.stage !== 'creature' || now >= this.deathAt(pen)) return [];
      const level = levelFor(pen.xp, pen.cap), theirs = ownerId !== playerId && !pen.faintedAt && !isHeesheeHeld(pen) && level >= BOUT_LEVEL && corner.length ? this.fighter(ownerId, pen) : null;
      // What a visitor to the owner's room could already see, plus the record: never needs, XP or care history.
      return [{ id: idOf(pen), ownerId, owner: owner.name, name: pen.name, species: pen.species, level, style: this.looksOf(ownerId, pen) || null,
        record: pen.record || { w: 0, l: 0, d: 0 }, fights: level >= BOUT_LEVEL && !isHeesheeHeld(pen), health: healthOf(pen), fainted: !!pen.faintedAt, ...(isHeesheeHeld(pen) ? { heesheeHeld: true } : {}),
        ...(this.fights.fightOf(ownerId) ? { inRing: true } : {}),
        ...(theirs ? { line: Object.fromEntries(corner.map(([id, mine]) => [id, line(mine, theirs)])) } : {}) }];
    })).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    // A challenge names both bugs (one sent before stalls means each owner's partner).
    const named = c => { const mine = this.penOf(c.from, c.fromBug), theirs = this.penOf(c.to, c.toBug);
      // `line` is the challenger's chance as the two stand now; `risk` what the challenged would put up against the stake
      const p = mine?.stage === 'creature' && theirs?.stage === 'creature' ? line(this.fighter(c.from, mine), this.fighter(c.to, theirs)) : null;
      const wait = this.challengeWait(c);
      return { ...c, fromName: players[c.from]?.name || 'Someone', toName: players[c.to]?.name || 'Someone', fromBug: mine ? idOf(mine) : null, toBug: theirs ? idOf(theirs) : null, fromBugName: mine?.name || 'A bug', toBugName: theirs?.name || 'a bug',
        ...(p ? { line: p, risk: riskFor(c.stake, p) } : {}), ...(wait ? { wait } : {}) }; };
    return { roster,
      challenges: { incoming: this.doc.challenges.filter(c => c.to === playerId).map(named), outgoing: this.doc.challenges.filter(c => c.from === playerId).map(named) },
      fights: this.doc.fights.map(({ id, at, stake, pot, winner, sides }) => ({ id, at, pot: pot ?? cents(stake * 2), winner, sides: sides.map(({ ownerId, owner, fighter }) => ({ ownerId, owner, name: fighter.name, species: fighter.species, level: fighter.level })) })) };
  }

  /** The Barn button's count: challenges to this player, a fight decided while they were away, and (with a bug fit to fight) bouts anyone else has open. */
  challengeCount(playerId) {
    const now = this.now(), players = this.store.players || {};
    const canFight = this.bugs(playerId).some((pen) => pen.stage === 'creature' && !pen.faintedAt && !isHeesheeHeld(pen) && levelFor(pen.xp, pen.cap) >= BOUT_LEVEL && now < this.deathAt(pen));
    return this.doc.challenges.filter(c => c.to === playerId && now < c.expiresAt).length + (players[playerId]?.barnBouts?.unseen ? 1 : 0) + (this.fights.fightOf(playerId) ? 1 : 0)
      + (canFight ? Object.values(players).filter(p => p.id !== playerId && p.barnBouts?.open && now < p.barnBouts.open.expiresAt).length : 0)
      + (this.trades?.count(playerId) || 0); // trade offers waiting on them, and answers to theirs
  }

  /** A recent fight as anyone may watch it: the bugs as drawn and the blows, without setups, condition or wallets. */
  fight(id) {
    const found = this.doc.fights.find(fight => fight.id === id);
    if (!found) throw new GameError('That fight has left the record.', 404);
    const [you, them] = found.sides.map(({ owner, fighter }) => ({ owner, name: fighter.name, species: fighter.species, level: fighter.level, style: fighter.style }));
    return { id: found.id, at: found.at, you, them, rounds: found.rounds, maxHp: found.maxHp, ...(found.startHp ? { startHp: found.startHp } : {}), pot: found.pot ?? cents(found.stake * 2),
      result: found.winner === null ? 'draw' : found.winner === 0 ? 'won' : 'lost' };
  }

  petView(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    const now = this.now();
    if (!pen) return { pen: null, serverNow: now };
    const which = { id: idOf(pen), partner: pen === this.doc.pens[playerId] };
    if (pen.stage === 'egg') return { pen: { ...which, stage: 'egg', eggAt: pen.eggAt, hatchAt: pen.hatchAt, warmCoolMs: Math.max(0, (pen.warmedAt || 0) + CARE.play.cooldownMs - now) }, serverNow: now };
    const c = BY_ID[pen.species];
    if (pen.stage === 'dead') return { pen: { ...which, stage: 'dead', species: c.id, speciesName: c.name, sci: c.sci, name: givenName(pen.species, pen.name), bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp, pen.cap), record: pen.record || { w: 0, l: 0, d: 0 } }, serverNow: now };
    const level = levelFor(pen.xp, pen.cap);
    const needs = this.needs(pen, now);
    const cool = Object.fromEntries(Object.entries(CARE).map(([k, a]) => [k, Math.max(0, (pen.cool[k] || 0) + a.cooldownMs - now)]));
    const dies = this.deathAt(pen); const warn = this.starving(pen, now);
    return { pen: { ...which, stage: 'creature', species: c.id, speciesName: c.name, sci: c.sci, name: givenName(pen.species, pen.name), bornAt: pen.bornAt,
      fedAt: pen.fedAt, feederUntil: pen.feederUntil || 0, lunch: pen.lunch || null, style: this.looksOf(playerId, pen) || null, gearBonus: this.styleOf?.(playerId, idOf(pen)).gearBonus || 0, starving: warn, diesInMs: warn ? Math.max(0, dies - now) : null,
      level, xp: pen.xp, xpThis: xpFor(level), xpNext: level >= (pen.cap || PAUSED_AT) ? null : xpFor(level + 1), cap: pen.cap || PAUSED_AT,
      evo: pen.evo || 0, ...(pen.botched ? { botched: pen.botched } : {}), ...(pen.sick ? { sick: true } : {}), ...(pen.taken ? { taken: true, donors: this.donors(playerId, pen).map((d) => ({ id: idOf(d), name: d.name, species: d.species, level: levelFor(d.xp, d.cap) })) } : {}),
      needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, Math.round(v)])), cool,
      abilities: movesFor(c.id, level, pen.legacyAbilities || 0), trait: traitFor(c.id),
      battle: battleFor(c.id, level, pen.legacyAbilities || 0, pen.battle),
      combat: { ...combatStats(level), stats: c.stats },
      arena: level >= BOUT_LEVEL, arenaLevel: BOUT_LEVEL, careXp: fadedXp(CARE_XP, level), mood: moodWord(needs), record: pen.record || { w: 0, l: 0, d: 0 },
      title: pen.record?.w >= 5 ? 'Barn Menace' : null,
      fainted: !!pen.faintedAt, ...(pen.faintedAt ? { recoverMs: Math.max(0, pen.faintedAt + RECOVER_MS - now), healCost: FAST_HEAL_COST, faintedAt: pen.faintedAt, faintedBy: pen.faintedBy || null, faintedIn: pen.faintedIn || 'mines' } : {}),
      ...(isHeesheeHeld(pen) ? { heesheeHeld: true, heesheeHeldAt: pen.heesheeHeldAt || null } : {}),
      ...this.hpOf(pen, level),
      mineRecord: pen.mineRecord || { w: 0, l: 0 },
      gym: { ...gymView(pen.gym, now), readyAt: gymReadyAt(pen.gymLastAt, pen.gymShort), readyIn: Math.max(0, gymReadyAt(pen.gymLastAt, pen.gymShort) - now),
        creatine: !!pen.gymCreatine, short: !!pen.gymShort && gymReadyAt(pen.gymLastAt, true) > now },
      gymReadyAt: gymReadyAt(pen.gymLastAt, pen.gymShort),
      lastBout: pen.lastBout || null }, serverNow: now };
  }

  /** HP for display: percent, points out of the level's max, and whether a nurse visit would help. */
  hpOf(pen, level = levelFor(pen.xp, pen.cap)) {
    const health = healthOf(pen), maxHp = combatStats(level).maxHp;
    return { health, hp: health === 0 ? 0 : maxHp, maxHp, hurt: health === 0 };
  }

  /** Feed, play or clean. Free, on a cooldown. */
  care(playerId, action, bug) {
    const a = CARE[action];
    if (!a) throw new GameError('The barn does not know how to do that.', 400);
    const pen = this.refresh(playerId, bug);
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
    if (isHeesheeHeld(pen)) throw new GameError(`Your bug is nowhere to be found. The Heeshee Mazode took it.`, 409);
    if (pen.sick) throw new GameError(`${pen.name} is not well. The Bug Center, now.`, 409);
    if (pen.taken) throw new GameError(`${pen.name} is not here. There is a ticket. The Bug Center has the rest.`, 409);
    if (now - (pen.cool[action] || 0) < a.cooldownMs) throw new GameError(`You just ${a.word} it. Give it a minute.`, 429);
    const n = this.needs(pen, now), own = this.own(pen, now); // needs and feeds are kept on the bug's own clock; cooldowns on the wall's
    for (const s of STATS) pen.stats[s] = { v: n[s], at: own }; // re-base all three, then bump one
    const toy = action === 'play' ? (this.styleOf?.(playerId).toyMood || 0) : 0; // store toy: capped at +20
    pen.stats[a.stat].v = Math.min(100, n[a.stat] + a.gain + toy);
    pen.cool[action] = now;
    if (action === 'feed') pen.fedAt = own;
    pen.xp += fadedXp(CARE_XP, levelFor(pen.xp, pen.cap));
    this.save();
    return this.view(playerId);
  }

  /** One bug's gym loads and what they do, now (all zeros for a bug that never trained). Pvp reads `rage` from here. */
  gymOf(pen) { return gymEffects(gymAt(pen?.gym, this.now())); }
  /**
   * The Bug Gym (engine/gym.js): one session on one path for a living, standing bug. Needs move by the path's deltas
   * (re-based on the bug's own clock, as care does), XP fades by level, and the vial costs cash. Returns the barn view
   * plus `gym`: the session's outcome with before/after numbers, for the page's result card.
   */
  train(playerId, path, bug) {
    const p = PATHS[path];
    if (!p) throw new GameError('The gym does not have that machine.', 400);
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    if (pen.stage === 'egg') throw new GameError('Eggs do not lift. Mostly.', 409);
    if (pen.stage === 'dead') throw new GameError('It is past training now.', 409);
    if (isHeesheeHeld(pen) || (pen === this.doc.pens[playerId] && bugLostToHeeshee(this, playerId))) throw new GameError('Your bug is nowhere to be found. The Heeshee Mazode took it.', 409);
    if (pen.sick) throw new GameError(`${pen.name} is not well. The Bug Center, now.`, 409);
    if (pen.taken) throw new GameError(`${pen.name} is not here. There is a ticket. The Bug Center has the rest.`, 409);
    if (pen.faintedAt) throw new GameError(`${pen.name} fainted. Take it to the Bug Center first.`, 409);
    if (this.fights.fightOf(playerId)) throw new GameError('Not while one of your bugs is in a fight.', 409);
    const now = this.now(), own = this.own(pen, now), n = this.needs(pen, now), level = levelFor(pen.xp, pen.cap);
    // one workout per bug per 24 hours, any path (Cool Down & Stretch included). A blocked try costs nothing.
    const readyAt = gymReadyAt(pen.gymLastAt, pen.gymShort);
    if (readyAt > now) {
      const left = readyAt - now, h = Math.floor(left / 3600e3), m = Math.ceil((left % 3600e3) / 60e3);
      throw Object.assign(new GameError(`${pen.name} already trained today. Next workout in ${m === 60 ? `${h + 1}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`}.`, 409), { code: 'gym_cooldown', data: { readyAt, readyIn: left } });
    }
    let step;
    try { step = trainStep(path, { gym: pen.gym, needs: n, now, roll: (k) => this.gymInt(k) }); } catch (e) { throw new GameError(e.message, e.status || 409); }
    const player = step.cost ? this.accounts.ensure(this.store.players[playerId]) : null;
    if (player) this.accounts.requireFunds(player, step.cost, p.name.toLowerCase());
    const before = { needs: Object.fromEntries(STATS.map((s) => [s, Math.round(n[s])])), ...gymView(pen.gym, now) };
    const next = structuredClone(pen);
    for (const s of STATS) next.stats[s] = { v: step.needs[s], at: own };
    next.gym = step.gym;
    next.gymLastAt = now;
    // a creatine dose waiting in it goes into this workout: the lock after it is 12 hours
    const creatine = !!pen.gymCreatine;
    if (creatine) next.gymShort = true; else delete next.gymShort;
    delete next.gymCreatine;
    const helped = [...(step.helped || []), ...(creatine ? [{ id: 'creatine', name: 'Creatine', emoji: '🥛', what: 'next workout in 12h' }] : [])];
    const xp = step.xp > 0 ? fadedXp(step.xp, level) : 0;
    next.xp += xp;
    if (player) this.accounts.change(player, -step.cost, 'barn-gym', `Bug Gym: ${p.name}`);
    this.commitPen(playerId, next);
    const after = { needs: Object.fromEntries(STATS.map((s) => [s, Math.round(step.needs[s])])), ...gymView(next.gym, now) };
    return { ...this.view(playerId), gym: { path, name: p.name, bug: idOf(next), bugName: next.name, outcome: step.outcome, xp, cost: step.cost, delta: step.delta, change: step.change, before, after, helped } };
  }

  /**
   * Gym gear from the General Store (engine/gym.js GEAR, plus creatine). `gymGearFor` checks a purchase before any
   * money moves; `fitGymGear` puts it on. Gear on a bug runs `days` and cannot be doubled up: a second one waits
   * until the first runs out. Creatine is one dose: bought while the bug is locked, it shortens that lock to 12 hours
   * from the workout's start (and is used up); otherwise the bug carries it into its next workout.
   */
  gymGearFor(playerId, bug, gear) {
    const pen = this.penOf(playerId, bug);
    if (!pen) throw new GameError(bug == null ? 'Your barn is empty.' : 'That bug is not in your barn.', 404);
    if (pen.stage !== 'creature') throw new GameError(pen.stage === 'dead' ? 'It is past training now.' : 'Eggs do not lift. Mostly.', 409);
    const now = this.now();
    if (gear === 'creatine') {
      if (pen.gymCreatine) throw new GameError(`${pen.name} already has a scoop waiting for its next workout.`, 409);
      if (pen.gymShort && gymReadyAt(pen.gymLastAt, true) > now) throw new GameError(`${pen.name} is already on the 12 hour clock. One scoop at a time.`, 409);
      return pen;
    }
    if (!GEAR[gear]) throw new GameError('The gym does not stock that.', 404);
    const left = gearOn(pen.gym, now)[gear];
    if (left) throw new GameError(`${pen.name} already has ${GEAR[gear].name}: ${Math.ceil(left / 86400e3)} days left. One at a time.`, 409);
    return pen;
  }
  fitGymGear(playerId, pen, gear) {
    const now = this.now(), next = structuredClone(pen);
    let note;
    if (gear === 'creatine') {
      if (!next.gymShort && gymReadyAt(next.gymLastAt) > now) { next.gymShort = true; note = gymReadyAt(next.gymLastAt, true) > now ? 'locked' : 'ready'; } // in it now: this lock is 12h
      else { next.gymCreatine = now; note = 'held'; }
    } else {
      // settle the loads first, so the gear only counts from now (GLP-1's faster fade never runs backwards)
      const at = gymAt(pen.gym, now), gearNow = Object.fromEntries(Object.entries(pen.gym?.gear || {}).filter(([, until]) => Number(until) > now));
      next.gym = { ...(pen.gym || {}), ...(pen.gym ? at : {}), at: now, gear: { ...gearNow, [gear]: now + GEAR[gear].days * 86400e3 } };
      note = 'on';
    }
    this.commitPen(playerId, next);
    return { bug: idOf(next), name: next.name, note };
  }

  /** Save an owned bug's unlocked moves; settings and fight rewards persist before becoming visible. */
  setBattle(playerId, settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.keys(settings).some((key) => key !== 'stance' && key !== 'bug') || !idOk(settings.bug)
      || typeof settings.stance !== 'string' || !Object.hasOwn(STANCES, settings.stance)) throw new GameError('Choose a stance: balanced, aggressive or defensive.', 400);
    const pen = this.refresh(playerId, settings.bug);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    this.expireBouts();
    if (this.store.players?.[playerId]?.barnBouts?.open) throw new GameError('Cancel your open bout before changing its setup.', 409);
    this.commitPen(playerId, { ...pen, battle: { stance: settings.stance } });
    return this.view(playerId);
  }

  bout() {
    throw new GameError('Choose an open bout or post your own on the bout board.', 409);
  }

  fighter(playerId, pen) {
    const level = levelFor(pen.xp, pen.cap);
    return { species: pen.species, name: givenName(pen.species, pen.name), level, health: healthOf(pen),
      mood: Math.round(Math.min(...Object.values(this.needs(pen, this.now())))),
      gear: this.styleOf?.(playerId, idOf(pen)).gearBonus || 0, defense: this.styleOf?.(playerId, idOf(pen)).defenseBonus || 0, lunch: pen.lunch || null, style: this.looksOf(playerId, pen),
      legacyAbilities: pen.legacyAbilities || 0, battle: battleFor(pen.species, level, pen.legacyAbilities || 0, pen.battle), ...(pen.botched ? { botched: pen.botched } : {}),
      ...gymFighter(pen.gym, this.now()) };
  }

  /** Alive, standing and old enough to fight: the partner, or the bug named. One fight at a time per owner. */
  ready(playerId, bug) {
    if (bugLostToHeeshee(this, playerId)) throw new GameError(HEESHEE_NO_BATTLE, 409);
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. Keep an eye out in the mines.', 404);
    if (pen.stage === 'dead') throw new GameError('It is resting. For good.', 409);
    if (pen.stage !== 'creature') throw new GameError('Eggs do not fight. Mostly.', 409);
    const level = levelFor(pen.xp, pen.cap);
    if (isHeesheeHeld(pen) || bugLostToHeeshee(this, playerId)) throw new GameError(HEESHEE_NO_BATTLE, 409);
    if (pen.faintedAt) throw new GameError(`${pen.name} fainted. Take it to the Bug Center first.`, 409);
    if (this.fights.fightOf(playerId)) throw new GameError('One of your bugs is in the ring right now.', 409);
    if (level < BOUT_LEVEL) throw new GameError(`Bouts open at level ${BOUT_LEVEL}.`, 409);
    return pen;
  }

  /** Money of theirs the barn is holding: bout stakes, and cash offered in open bug trades. Counts toward net worth. */
  escrow(player) { return cents((player?.barnBouts?.open?.stake || 0) + (player?.barnBouts?.live?.stake || 0) + (this.trades?.escrow(player) || 0)); }

  /** The caller's bugs that could step into the ring now, as the ring would take them: what each line on the board is worked out against. */
  corner(playerId) {
    const now = this.now();
    return this.bugs(playerId).filter((pen) => pen.stage === 'creature' && !pen.faintedAt && !isHeesheeHeld(pen) && levelFor(pen.xp, pen.cap) >= BOUT_LEVEL && now < this.deathAt(pen)).map((pen) => [idOf(pen), this.fighter(playerId, pen)]);
  }
  /**
   * Both stakes for a fight: side 0 named `stake`, side 1's follows the line as the two bugs stand now. When the
   * page says what its owner `agreed` to put up, it must still be that.
   */
  terms(stake, fighters, agreed) {
    const risk = riskFor(stake, line(...fighters));
    if (agreed !== undefined && agreed !== risk) throw new GameError(`The line moved: your stake is now $${risk.toFixed(2)}. Look again.`, 409);
    return [stake, risk];
  }

  board(playerId) {
    const player = this.store.players?.[playerId], corner = this.corner(playerId);
    const bouts = Object.values(this.store.players || {}).flatMap(p => {
      const open = p.barnBouts?.open;
      if (!open) return [];
      const { petBornAt, ...shown } = open;
      const posted = this.bugs(p.id).find((kept) => kept.bornAt === petBornAt);
      const fighter = { ...open.fighter, health: healthOf(posted) };
      // for someone else's bout: each of your bugs' chance against it, and what joining with that bug would cost
      const host = p.id !== playerId && corner.length && posted && { ...fighter, lunch: posted.lunch || null };
      return [{ ...shown, fighter, hostName: p.name, ...(host ? { terms: Object.fromEntries(corner.map(([id, mine]) => { const q = line(host, mine); return [id, { win: (100 - Math.round(q * 100)) / 100, risk: riskFor(open.stake, q) }]; })) } : {}) }];
    }).sort((a, b) => a.openedAt - b.openedAt);
    return { bouts, openBout: bouts.find(bout => bout.hostId === playerId) || null,
      bankroll: player?.bankroll ?? null, maxStake: MAX_BOUT_STAKE, stakeStep: BOUT_STAKE_STEP };
  }

  /** The wallet receipt commits with the payout; the pet catches up once even after a restart. */
  applyBoutReward(playerId) {
    const receipt = this.store.players?.[playerId]?.barnBouts?.lastBout;
    const pen = receipt && this.bugs(playerId).find((kept) => kept.bornAt === receipt.petBornAt); // whichever of them fought
    if (!pen || pen.settledBoutId === receipt.id) return;
    const { petBornAt: _petBornAt, ...replay } = receipt;
    const next = structuredClone(pen);
    next.xp += receipt.xpEarned;
    next.record ||= { w: 0, l: 0, d: 0 };
    next.record[receipt.result === 'won' ? 'w' : receipt.result === 'lost' ? 'l' : 'd']++;
    if (receipt.healthAfter === 0) {
      next.faintedAt = receipt.at;
      next.faintedBy = receipt.owners?.[1]?.name || receipt.them?.name || null;
      next.faintedIn = 'ring';
    }
    next.lastBout = replay;
    next.settledBoutId = receipt.id;
    // The ring's public record rides on the first pet reward, so it needs no write of its own and survives the
    // same failures: whichever participant catches up first records the fight, as seen from their corner.
    const logged = !receipt.owners || this.doc.fights.some(fight => fight.id === receipt.id);
    const fights = logged ? this.doc.fights : [{ id: receipt.id, at: receipt.at, pot: cents(receipt.stake + (receipt.against ?? receipt.stake)), maxHp: receipt.maxHp, ...(receipt.startHp ? { startHp: receipt.startHp } : {}), rounds: receipt.rounds,
      winner: receipt.result === 'won' ? 0 : receipt.result === 'lost' ? 1 : null,
      sides: [receipt.you, receipt.them].map((fighter, i) => ({ ownerId: receipt.owners[i].id, owner: receipt.owners[i].name, fighter })) }, ...this.doc.fights].slice(0, FIGHT_LOG);
    this.commitDoc({ ...this.slot(playerId, next), fights });
  }

  refundOpen(player) {
    const open = player.barnBouts.open;
    const draft = { ...player, barnBouts: { ...player.barnBouts, open: null, closedId: open.id } };
    if (open.stake) this.accounts.change(draft, open.stake, 'barn-refund', 'Barn bout: stake returned', { save: false });
    this.store.commitPlayerDrafts([draft]);
  }

  /** The other owner in this player's unfinished fight, if they have a name. */
  fightOpponentName(playerId) {
    const fight = this.fights.fightOf(playerId);
    if (!fight) return null;
    const otherId = (fight.players || []).find((id) => id && id !== playerId);
    return (otherId && this.store.players[otherId]?.name) || null;
  }

  /**
   * Why an incoming challenge cannot be accepted right now, as a short chip, or null if it can.
   * A temporary block (already in a fight, a posted bout, a faint, a short bankroll) is only a wait: the challenge stays.
   */
  challengeWait(c) {
    const from = this.store.players?.[c.from], name = from?.name || 'Someone';
    const mine = this.penOf(c.from, c.fromBug);
    if (!from || !mine || mine.stage !== 'creature' || this.now() >= this.deathAt(mine)) return 'That challenge has expired.';
    if (this.fights.fightOf(c.from)) return `Waiting — ${name} is in a fight`;
    if (from.barnBouts?.open) return `Waiting — ${name} has a bout posted`;
    if (mine.faintedAt) return `Waiting — ${name}'s ${mine.name} needs the Bug Center`;
    if (isHeesheeHeld(mine) || bugLostToHeeshee(this, c.from)) return `Waiting — ${name}'s bug is with the Heeshee`;
    if ((from.bankroll ?? 0) + 1e-9 < (c.stake || 0)) return `Waiting — ${name} can't cover ${stakeText(c.stake)}`;
    return null;
  }

  expireBouts() {
    for (const player of Object.values(this.store.players || {})) {
      const live = player.barnBouts?.live;
      if (live && !this.fights.get(live.id)) this.refundLive(player);
      const open = player.barnBouts?.open;
      if (!open) continue;
      const pen = this.bugs(player.id).find((kept) => kept.bornAt === open.petBornAt);
      if (this.now() >= open.expiresAt || !pen || pen.stage !== 'creature' || pen.faintedAt || this.now() >= this.deathAt(pen)) this.refundOpen(player);
    }
    // Challenges hold no money. Drop only what can never start: past its day, or either bug gone or dead.
    // A fight, a faint or a short bankroll is temporary, so those challenges stay and the ring shows a wait instead.
    const alive = (id, bug) => { const pen = this.penOf(id, bug); return !!this.store.players?.[id] && pen?.stage === 'creature' && this.now() < this.deathAt(pen); };
    const kept = this.doc.challenges.filter(c => this.now() < c.expiresAt && alive(c.from, c.fromBug) && alive(c.to, c.toBug));
    if (kept.length !== this.doc.challenges.length) this.commitDoc({ challenges: kept });
  }

  /** Call out another player's bug. Nothing is held: both stakes are checked and taken only if the owner accepts. */
  challenge(playerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['to', 'stake', 'bug', 'their'].includes(key)) || typeof body.to !== 'string' || !idOk(body.bug) || !idOk(body.their)
      || typeof body.stake !== 'number' || !Number.isFinite(body.stake) || body.stake < 0 || body.stake > MAX_BOUT_STAKE || body.stake % BOUT_STAKE_STEP !== 0) {
      throw new GameError(`Name a bug's owner and a stake from $0 to $${MAX_BOUT_STAKE}, in steps of $${BOUT_STAKE_STEP}.`, 400);
    }
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]), target = this.store.players[body.to];
    if (body.to === playerId) throw new GameError('Your bug cannot fight itself. It has tried.', 409);
    const theirs = target && !target.hidden ? this.penOf(body.to, body.their) : null;
    if (!theirs || theirs.stage !== 'creature' || this.now() >= this.deathAt(theirs)) throw new GameError('There is no bug there to challenge.', 404);
    if (theirs.faintedAt) throw new GameError(`${theirs.name} fainted. They need the Bug Center first.`, 409);
    if (isHeesheeHeld(theirs)) throw new GameError('That bug is with the Heeshee Mazode.', 409);
    if (levelFor(theirs.xp, theirs.cap) < BOUT_LEVEL) throw new GameError(`That bug is too young. Bouts open at level ${BOUT_LEVEL}.`, 409);
    const pen = this.ready(playerId, body.bug);
    const mine = this.doc.challenges.filter(c => c.from === playerId), same = mine.find(c => c.to === body.to && this.penOf(c.to, c.toBug) === theirs);
    if (same) {
      if (same.stake !== body.stake) throw new GameError('Withdraw your challenge to that bug before changing it.', 409);
      return this.view(playerId);
    }
    this.accounts.requireFunds(player, body.stake, 'this challenge');
    const now = this.now(), made = { id: crypto.randomUUID(), from: playerId, to: body.to, fromBug: idOf(pen), toBug: idOf(theirs), stake: body.stake, at: now, expiresAt: now + CHALLENGE_OPEN_MS };
    this.commitDoc({ challenges: [...this.doc.challenges, made] });
    // Tell the owner, if they have alerts on. The challenge is already saved, so a failed alert changes nothing.
    try {
      this.onChallenge?.({ id: made.id, toId: body.to, from: player.name, bug: pen.name, species: BY_ID[pen.species].name, level: levelFor(pen.xp, pen.cap), yours: theirs.name, stake: made.stake,
        risk: riskFor(made.stake, line(this.fighter(playerId, pen), this.fighter(body.to, theirs))) });
    } catch { /* an alert must never undo or fail a challenge */ }
    return this.view(playerId);
  }

  /** Withdraw a challenge you sent or decline one you were sent. Asking twice is harmless. */
  dropChallenge(playerId, id) {
    const found = this.doc.challenges.find(c => c.id === id);
    if (found && found.from !== playerId && found.to !== playerId) throw new GameError('That is not your challenge.', 404);
    if (found) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
    return this.view(playerId);
  }

  /** The challenged owner takes it: both stakes are checked now and the fight is decided at once. */
  acceptChallenge(playerId, id, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'risk') || (body.risk !== undefined && typeof body.risk !== 'number')) throw new GameError('Accept the stake as shown.', 400);
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    const found = this.doc.challenges.find(c => c.id === id);
    if (this.fights.fightOf(playerId)?.id === id) return this.view(playerId); // a second tap while it is on
    if (player.barnBouts?.lastBout?.id === id) { // a retry after the fight was paid
      if (found) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
      return this.view(playerId);
    }
    if (!found || found.to !== playerId) throw new GameError('That challenge has expired or been withdrawn.', 409);
    const rival = this.accounts.ensure(this.store.players[found.from]);
    if (player.barnBouts?.open) throw new GameError('Cancel your open bout before taking a challenge.', 409);
    if (rival.barnBouts?.open) throw new GameError(`${rival.name} has a bout posted and cannot take this one yet.`, 409);
    let rivalPen;
    try { rivalPen = this.ready(found.from, found.fromBug); } catch (error) {
      if (!(error instanceof GameError)) throw error;
      throw new GameError(rivalBusyMessage(rival, error, { opponent: this.fightOpponentName(found.from) }), error.status);
    }
    const pen = this.ready(playerId, found.toBug);
    const fighters = [this.fighter(found.from, rivalPen), this.fighter(playerId, pen)], stakes = this.terms(found.stake, fighters, body.risk);
    this.accounts.requireFunds(player, stakes[1], 'this bout');
    if (rival.bankroll + 1e-9 < found.stake) throw new GameError(`${rival.name} can't cover ${stakeText(found.stake)} right now.`, 409);
    this.startFight(id, [{ player: rival, pen: rivalPen, fighter: fighters[0] }, { player, pen, fighter: fighters[1] }], stakes, false, playerId);
    return this.view(playerId);
  }

  /**
   * Both bugs go to the ring. Every stake is held now, in one players.json write, so nobody can spend theirs while
   * the fight is on. Side 0 posted the bout or sent the challenge and named `stakes[0]`; `held` says that is already
   * in escrow. `stakes[1]` is what the line asked of the other corner (terms).
   * `watcher` took the fight and is looking at it; the other owner's bug fights on its own until they turn up.
   */
  startFight(id, sides, stakes, held, watcher) {
    const now = this.now(), seed = `${now}:${this.eggInt(1e9)}`;
    const drafts = sides.map(({ player: p }, side) => {
      const stake = stakes[side], draft = { ...p, barnBouts: { ...p.barnBouts, open: null, live: { id, stake, at: now } } };
      if (stake && (side === 1 || !held)) this.accounts.change(draft, -stake, 'barn-stake', 'Barn bout: stake held', { save: false });
      return draft;
    });
    this.store.commitPlayerDrafts(drafts);
    if (this.doc.challenges.some(c => c.id === id)) this.commitDoc({ challenges: this.doc.challenges.filter(c => c.id !== id) });
    const entrants = sides.map(({ player, pen, fighter }) => ({ id: player.id, bornAt: pen.bornAt, fighter }));
    this.fights.start({ id, kind: 'barn', players: entrants.map(e => e.id), fighters: entrants.map(e => e.fighter), seed, watching: [watcher],
      onFinish: (fight) => this.settle(fight, entrants, stakes, seed) });
  }

  /**
   * The fight is over: pay the pot and write both reward receipts in one players.json write, then let each pet catch
   * up. An owner who was not watching at the end gets the result flagged until they open the Barn.
   */
  settle(fight, entrants, stakes, seed) {
    const now = this.now(), id = fight.id, winner = fight.over.winner, { rounds, maxHp, startHp, hp: endHp } = fight.S;
    const fighters = entrants.map(e => e.fighter);
    entrants.forEach((e, side) => { if (fight.S.side[side].ate) this.lunchEaten(e.id, e.bornAt); });
    const drafts = entrants.flatMap((e, side) => {
      const p = this.store.players[e.id];
      if (!p) return []; // the account was deleted mid-fight
      const kept = this.bugs(e.id).find((bug) => bug.bornAt === e.bornAt), xp = kept?.xp || 0, cap = kept?.cap;
      const stake = stakes[side], against = stakes[1 - side], odds = this.fights.lineOf(fight, side); // this bug's chance as it walked in
      const xpEarned = fightXp({ won: winner === side, base: BOUT_XP, bonus: BOUT_WIN_XP, odds, level: levelFor(xp, cap), foeLevel: fighters[1 - side].level });
      const payout = winner === null ? stake : winner === side ? cents(stake + against) : 0;
      const healthAfter = endHp[side] > 0 ? 100 : 0;
      const receipt = { version: 5, id, at: now, seed, petBornAt: e.bornAt, healthAfter,
        startHp: side === 0 ? startHp : [...startHp].reverse(),
        you: fighters[side], them: fighters[1 - side],
        rounds: side === 0 ? rounds : rounds.map(round => ({ ...round, by: 1 - round.by, hp: [...round.hp].reverse() })),
        maxHp: side === 0 ? maxHp : [...maxHp].reverse(), xpEarned,
        levelBefore: levelFor(xp, cap), levelAfter: levelFor(xp + xpEarned, cap),
        result: winner === null ? 'draw' : winner === side ? 'won' : 'lost', line: odds, stake, against, payout, net: cents(payout - stake),
        owners: [side, 1 - side].map(i => ({ id: entrants[i].id, name: this.store.players[entrants[i].id]?.name || 'A former member' })) };
      const draft = { ...this.accounts.ensure(p), barnBouts: { ...p.barnBouts, live: null, lastBout: receipt, ...(fight.over.watched[side] ? {} : { unseen: id }) } };
      if (payout) this.accounts.change(draft, payout, winner === null ? 'barn-refund' : 'barn-win', winner === null ? 'Barn bout: draw, stake returned' : 'Barn bout: won the pot', { save: false });
      return [draft];
    });
    // Both wallets and their reward receipts must land in the same atomic players.json write.
    this.store.commitPlayerDrafts(drafts);
    for (const e of entrants) this.applyBoutReward(e.id);
  }

  /** A held stake whose fight is gone (the server restarted mid-fight): nobody won, so it goes back. */
  refundLive(player) {
    const live = player.barnBouts.live;
    const draft = { ...player, barnBouts: { ...player.barnBouts, live: null } };
    if (live.stake) this.accounts.change(draft, live.stake, 'barn-refund', 'Barn bout: called off, stake returned', { save: false });
    this.store.commitPlayerDrafts([draft]);
  }

  /** The fight your bug is in (or just finished), from your corner. `have` is how many blows the page already holds. */
  liveFight(playerId, id, have) {
    this.fights.sweep();
    const fight = this.fights.get(String(id || '')) || this.fights.fightOf(playerId);
    if (!fight || !RING_KINDS.includes(fight.kind) || this.fights.sideOf(fight, playerId) < 0) return { fight: null };
    return { fight: this.fights.view(fight, playerId, have) };
  }
  /** Line up your bug's next moves (up to three). It picks for itself whenever the list is empty or a move is not ready. */
  lineUp(playerId, id, body) {
    this.fights.sweep();
    const fight = this.fights.get(String(id || ''));
    if (!fight || fight.over || !RING_KINDS.includes(fight.kind) || this.fights.sideOf(fight, playerId) < 0) throw new GameError('That fight is over.', 409);
    if (!body || typeof body !== 'object' || !this.fights.line(fight, playerId, body.moves)) throw new GameError('Line up to three of your bug\'s own moves.', 400);
    return { fight: this.fights.view(fight, playerId, body.have) };
  }

  openBout(playerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'stake' && key !== 'bug') || !idOk(body.bug)
      || typeof body.stake !== 'number' || !Number.isFinite(body.stake) || body.stake < 0 || body.stake > MAX_BOUT_STAKE || body.stake % BOUT_STAKE_STEP !== 0) {
      throw new GameError(`Choose a stake from $0 to $${MAX_BOUT_STAKE}, in steps of $${BOUT_STAKE_STEP}.`, 400);
    }
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.open) {
      if (player.barnBouts.open.stake !== body.stake) throw new GameError('Cancel your open bout before posting another.', 409);
      return this.view(playerId);
    }
    const pen = this.ready(playerId, body.bug);
    this.accounts.requireFunds(player, body.stake, 'this bout');
    const now = this.now();
    const open = { id: crypto.randomUUID(), hostId: playerId, fighter: this.fighter(playerId, pen),
      petBornAt: pen.bornAt, stake: body.stake, openedAt: now, expiresAt: now + BOUT_OPEN_MS };
    const draft = { ...player, barnBouts: { ...player.barnBouts, open } };
    if (open.stake) this.accounts.change(draft, -open.stake, 'barn-stake', 'Barn bout: stake held', { save: false });
    this.store.commitPlayerDrafts([draft]);
    return this.view(playerId);
  }

  cancelBout(playerId, id) {
    this.expireBouts();
    const player = this.store.players[playerId];
    if (player.barnBouts?.closedId === id) return this.view(playerId);
    if (player.barnBouts?.open?.id !== id) throw new GameError('That is not your open bout.', 404);
    this.refundOpen(player);
    return this.view(playerId);
  }

  joinBout(playerId, id, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'bug' && key !== 'risk') || !idOk(body.bug) || (body.risk !== undefined && typeof body.risk !== 'number')) throw new GameError('Join the posted stake as shown.', 400);
    this.expireBouts();
    const player = this.accounts.ensure(this.store.players[playerId]);
    if (player.barnBouts?.lastBout?.id === id || this.fights.fightOf(playerId)?.id === id) return this.view(playerId);
    const host = Object.values(this.store.players).find(p => p.barnBouts?.open?.id === id);
    if (!host) throw new GameError('That bout has already filled, expired or been cancelled.', 409);
    if (host.id === playerId) throw new GameError('Your bug cannot fight itself. It has tried.', 409);
    if (player.barnBouts?.open) throw new GameError('Cancel your open bout before joining another.', 409);
    const open = host.barnBouts.open, posted = this.bugs(host.id).find((kept) => kept.bornAt === open.petBornAt);
    const hostPen = this.ready(host.id, posted && idOf(posted)), guestPen = this.ready(playerId, body.bug);
    const fighters = [{ ...open.fighter, health: healthOf(hostPen), lunch: hostPen.lunch || null }, this.fighter(playerId, guestPen)], stakes = this.terms(open.stake, fighters, body.risk);
    this.accounts.requireFunds(player, stakes[1], 'this bout');
    this.startFight(id, [{ player: host, pen: hostPen, fighter: fighters[0] }, { player, pen: guestPen, fighter: fighters[1] }], stakes, true, playerId);
    return this.view(playerId);
  }

  /** Can this bug fight or guide right now? (hatched, alive, not fainted, not held by the Heeshee) */
  fit(playerId) {
    const pen = this.doc.pens[playerId];
    return pen?.stage === 'creature' && !pen.faintedAt && !isHeesheeHeld(pen) && !(this.now() >= this.deathAt(pen));
  }

  /** Public view of a hold: the bug is still in the barn, just away with the Heeshee Mazode. */
  heesheeHoldOf(playerId, bug) {
    const pen = this.penOf(playerId, bug);
    if (!isHeesheeHeld(pen) || pen.stage !== 'creature') return null;
    return { name: pen.name, species: pen.species, id: idOf(pen), fromShift: pen.heesheeHeldFromShift || null, at: pen.heesheeHeldAt || null };
  }
  heesheeHolds(playerId) { return this.bugs(playerId).filter(isHeesheeHeld).map((pen) => this.heesheeHoldOf(playerId, idOf(pen))).filter(Boolean); }
  /**
   * Mark the partner as taken. The row is never deleted. Idempotent if it is already held.
   * Returns the hold, or null if there is no living partner to take.
   */
  holdHeeshee(playerId, { shiftId, at } = {}) {
    const pen = this.doc.pens[playerId];
    if (!pen || pen.stage !== 'creature') return null;
    if (isHeesheeHeld(pen)) return this.heesheeHoldOf(playerId);
    this.commitPen(playerId, { ...pen, heesheeHeld: true, heesheeHeldAt: at || this.now(), heesheeHeldFromShift: shiftId || null });
    return this.heesheeHoldOf(playerId);
  }
  /**
   * The Foreman brought them back. Clocks resume from now so the absence is not a hunger or XP penalty.
   * `exceptFromShift` (optional) leaves a hold from that shift in place.
   */
  releaseHeeshee(playerId, { exceptFromShift } = {}) {
    const now = this.now(), released = [];
    for (const pen of this.bugs(playerId).filter((p) => isHeesheeHeld(p) && p.heesheeHeldFromShift !== exceptFromShift)) {
      const { heesheeHeld: _h, heesheeHeldAt: _a, heesheeHeldFromShift: _s, ...rest } = pen;
      const stats = rest.stats && typeof rest.stats === 'object'
        ? Object.fromEntries(Object.entries(rest.stats).map(([k, v]) => [k, v && typeof v === 'object' ? { ...v, at: now } : v]))
        : rest.stats;
      this.commitPen(playerId, { ...rest, stats, ...(rest.fedAt != null ? { fedAt: now } : {}) });
      released.push({ name: pen.name, species: pen.species, id: idOf(pen) });
    }
    return released;
  }
  /** Is the partner due an evolution out of `stage`? Hatched, well, at that stage, with the XP for the range's first level. */
  due(playerId, stage = 0) {
    const pen = this.doc.pens[playerId];
    return this.fit(playerId) && (pen.evo || 0) === stage && !pen.sick && !pen.taken && rawLevel(pen.xp || 0) >= RANGES[stage][0] ? pen : null;
  }
  /** Rolled at clock-in, from evolution's own source: does the specialist come for the partner at the end of this shift? */
  rollCollect(playerId) {
    const pen = this.due(playerId, 1);
    return !!pen && this.evoInt(1000) < Math.round(1000 * purpleChance(pen.xp, 1));
  }
  /** It left with him. Out like a knockout, with a ticket in its stall, until the Bug Center. Returns its name, or null if it was never due. */
  collect(playerId) {
    const pen = this.due(playerId, 1);
    if (!pen) return null;
    this.commitPen(playerId, { ...pen, taken: this.now(), faintedAt: this.now(), faintedBy: null, faintedIn: 'collected' });
    return pen.name;
  }
  /** The bugs he would take for parts: the owner's other living, hatched bugs that are home. Never a legendary: there is only the one. */
  donors(playerId, pen) {
    return this.bugs(playerId).filter((d) => d !== pen && d.stage === 'creature' && !d.taken && !d.sick && !isHeesheeHeld(d) && rarityOf(d.species) !== LEGENDARY);
  }
  /**
   * The Bug Center visit for a collected bug: stage three. He is paid in parts, one of the owner's other bugs, which does
   * not come back. An owner with no other bug pays BILL_SHARE of their cash. No refusing, no refund.
   */
  rebuild(playerId, pen, donorId) {
    if (this.fights.fightOf(playerId)) throw new GameError('Not while one of your bugs is in a fight.', 409);
    const donors = this.donors(playerId, pen), donor = donors.find((d) => idOf(d) === Number(donorId)) || null;
    if (donors.length && !donor) throw new GameError('He does not want money. He wants parts. Pick one of your other bugs.', 409);
    const player = this.accounts.ensure(this.store.players[playerId]);
    const had = cents(player.bankroll), took = donor ? 0 : Math.floor(had * 100 * BILL_SHARE) / 100;
    const botched = this.evoInt(BOTCH_ODDS) === 0 ? MAN_QUIRKS[this.evoInt(MAN_QUIRKS.length)] : null;
    const levelBefore = levelFor(pen.xp, pen.cap);
    const { taken: _t, faintedAt: _f, faintedBy: _b, faintedIn: _i, health: _h, ...rest } = pen;
    const next = { ...rest, evo: 2, evolvedAt: this.now(), ...(botched ? { botched } : {}), ...(donor ? { parts: donor.name } : {}) };
    // The rebuilt bug and the missing donor are one write, and the cash (if any) is taken after it: a crash costs the house.
    const changes = { ...this.slot(playerId, next) };
    if (donor) {
      changes.bench = { ...(changes.bench || this.doc.bench), [playerId]: (changes.bench || this.doc.bench)[playerId].filter((kept) => idOf(kept) !== idOf(donor)) };
      const grave = { name: donor.name, species: donor.species, bornAt: donor.bornAt, diedAt: this.now(), level: levelFor(donor.xp, donor.cap), parts: pen.name };
      changes.graves = { ...this.doc.graves, [playerId]: [...(this.doc.graves[playerId] || []), grave].slice(-10) };
    }
    this.commitDoc(changes);
    if (took > 0) this.accounts.change(player, -took, 'barn-evolve', 'Bug Center: the specialist');
    const view = this.view(playerId), now = view.stable.bugs.find((bug) => bug.id === idOf(pen));
    return { ...view, healed: true, cost: took, evolved: { id: idOf(pen), stage: 2, name: pen.name, species: pen.species, botched, levelBefore, levelAfter: now?.level ?? levelBefore,
      donor: donor ? { name: donor.name, species: donor.species } : null, bill: { had, took, left: cents(had - took) } } };
  }
  /** Rolled at clock-in, from evolution's own source: does this shift have purple acid in it? */
  rollPurple(playerId) {
    const pen = this.due(playerId);
    return !!pen && this.evoInt(1000) < Math.round(1000 * purpleChance(pen.xp));
  }
  /** The partner drank it. It is out, like a knockout, until the Bug Center sees it. Returns its name, or null if it was never due. */
  fallSick(playerId) {
    const pen = this.due(playerId);
    if (!pen) return null;
    this.commitPen(playerId, { ...pen, sick: this.now(), faintedAt: this.now(), faintedBy: null, faintedIn: 'purple' });
    return pen.name;
  }
  /** The Bug Center visit for a sick bug: it evolves, clean or botched, and its owner pays BILL_SHARE of their cash. No refusing, no refund. */
  evolve(playerId, pen) {
    const player = this.accounts.ensure(this.store.players[playerId]);
    const had = cents(player.bankroll), took = Math.floor(had * 100 * BILL_SHARE) / 100;
    const botched = this.evoInt(BOTCH_ODDS) === 0 ? QUIRKS[this.evoInt(QUIRKS.length)] : null; // which way it went wrong is its own roll
    const levelBefore = levelFor(pen.xp, pen.cap);
    const { sick: _s, faintedAt: _f, faintedBy: _b, faintedIn: _i, health: _h, ...rest } = pen;
    // The bug is saved evolved before the bill is taken, so a crash between the two costs the house, never the bug.
    this.commitPen(playerId, { ...rest, evo: 1, evolvedAt: this.now(), ...(botched ? { botched } : {}) });
    if (took > 0) this.accounts.change(player, -took, 'barn-evolve', 'Bug Center: the specialist');
    const view = this.view(playerId), now = view.stable.bugs.find((bug) => bug.id === idOf(pen));
    return { ...view, healed: true, cost: took, evolved: { id: idOf(pen), name: pen.name, species: pen.species, botched, levelBefore, levelAfter: now?.level ?? levelBefore, bill: { had, took, left: cents(had - took) } } };
  }
  /** A guide bug led its miner to a pool with acid in it: a little XP. */
  foundAcid(playerId) {
    if (!this.fit(playerId)) return;
    const pen = this.doc.pens[playerId];
    this.commitPen(playerId, { ...pen, xp: (pen.xp || 0) + FIND_XP });
  }
  /**
   * A mine bug battle's result for one bug (pvp.js calls this while settling the raid). Idempotent per battle id, and
   * only for the same bug that fought (`bornAt`): a bug laid to rest and replaced since gets nothing. The winner gains
   * a win bonus; a loser that fought to the end gains BATTLE_XP even if it was knocked out.
   */
  battleResult(playerId, { battleId, bornAt, won, fought = true, fainted = false, foeName = null, odds = 0.5, place = 'mines', foeLevel }) {
    const pen = this.bugs(playerId).find((kept) => kept.stage === 'creature' && kept.bornAt === bornAt); // the partner, or the stalled bug its owner sent in
    if (!pen) return { xp: 0, fainted: false, skipped: true };
    if ((pen.mineBattles || []).includes(battleId)) return { xp: pen.lastMineBattle?.xp || 0, fainted, levelBefore: pen.lastMineBattle?.levelBefore, levelAfter: pen.lastMineBattle?.levelAfter, repeat: true };
    const next = structuredClone(pen);
    const levelBefore = levelFor(next.xp || 0, next.cap);
    // a win pays by the line (`odds`: this bug's chance) and the level it beat; a loss fought to the end pays less the higher its own level
    const xp = won || fought ? fightXp({ won, base: BATTLE_XP, bonus: WIN_BONUS_XP, odds, level: levelBefore, foeLevel: foeLevel ?? levelBefore }) : 0, bonus = won ? Math.max(0, xp - BATTLE_XP) : 0;
    next.xp = (next.xp || 0) + xp;
    if (place === 'mines') next.mineRecord = { w: (next.mineRecord?.w || 0) + (won ? 1 : 0), l: (next.mineRecord?.l || 0) + (won ? 0 : 1) };
    if (fainted) { next.faintedAt = this.now(); next.faintedBy = foeName; next.faintedIn = place; }
    next.mineBattles = [...(next.mineBattles || []), battleId].slice(-20);
    next.lastMineBattle = { id: battleId, won, xp, levelBefore, levelAfter: levelFor(next.xp, next.cap), at: this.now() };
    this.commitPen(playerId, next);
    return { xp, bonus, fainted, levelBefore, levelAfter: levelFor(next.xp, next.cap) };
  }
  /** XP for one living bug (`bornAt`), outside a fight: a circuit ribbon. Returns the levels it went between. */
  grantXp(playerId, bornAt, xp) {
    const pen = this.bugs(playerId).find((kept) => kept.stage === 'creature' && kept.bornAt === bornAt);
    if (!pen) return null;
    const levelBefore = levelFor(pen.xp || 0, pen.cap);
    this.commitPen(playerId, { ...structuredClone(pen), xp: (pen.xp || 0) + xp });
    return { levelBefore, levelAfter: levelFor((pen.xp || 0) + xp, pen.cap) };
  }
  /**
   * Pending one-time recap of a Stage II rebuild the owner missed. Built from the live pen plus the historical bill;
   * nothing is written until ackEvoNews stamps evoNewsSeen.
   */
  evoNewsOf(playerId) {
    if (playerId !== EVO_NEWS_PLAYER) return null;
    const pen = this.bugs(playerId).find((bug) => bug.species === 'empusa' && (bug.evo || 0) === 1 && bug.evolvedAt === EVO_NEWS_AT);
    if (!pen || pen.evoNewsSeen) return null;
    return {
      id: idOf(pen), name: pen.name, species: pen.species, botched: pen.botched || null, stage: 1, copy: true,
      levelBefore: EVO_NEWS_LEVELS.levelBefore, levelAfter: EVO_NEWS_LEVELS.levelAfter, bill: { ...EVO_NEWS_BILL },
    };
  }
  /**
   * The owner has seen the recap. Stamps evoNewsSeen only: no bill, no ledger, no XP, no stage change.
   * Idempotent if the news is already gone or was never pending.
   */
  ackEvoNews(playerId) {
    const news = this.evoNewsOf(playerId);
    if (!news) return this.view(playerId);
    const pen = this.bugs(playerId).find((bug) => idOf(bug) === news.id);
    if (!pen || pen.evoNewsSeen) return this.view(playerId);
    this.commitPen(playerId, { ...pen, evoNewsSeen: this.now() });
    return this.view(playerId);
  }
  /** The nurse treats a knockout for free after RECOVER_MS or immediately for FAST_HEAL_COST. */
  heal(playerId, { pay = false, bug, donor, mode, confirmEvolve, specialist, normalHeal } = {}) {
    const pen = this.refresh(playerId, bug);
    if (!pen) throw new GameError('Your barn is empty. The nurse has nobody to heal.', 404);
    if (pen.stage === 'egg') throw new GameError('Eggs do not faint. The nurse pats it anyway.', 409);
    if (pen.stage === 'dead') throw new GameError('The Bug Center cannot help with that one. Lay it to rest.', 409);
    // The ordinary heal button (mode: 'heal') must never run the specialist's rebuild. A stale Bug Center tab can
    // otherwise evolve a newly sick or collected bug behind the 3-second pod and skip the panels, receipt and reveal.
    // Bare /barn/heal (and existing tests) still go through to evolve/rebuild; only the heal UI opts into the guard.
    const fromHeal = mode === 'heal' || normalHeal === true;
    const fromSpecialist = confirmEvolve === true || specialist === true || mode === 'specialist';
    if ((pen.sick || pen.taken) && fromHeal && !fromSpecialist) {
      const err = new GameError(`${pen.name} needs the specialist. Talk to Nurse Hikari first.`, 409);
      err.code = 'specialist_required';
      throw err;
    }
    if (pen.sick) return this.evolve(playerId, pen);
    if (pen.taken) return this.rebuild(playerId, pen, donor);
    const was = !!pen.faintedAt;
    const waitMs = pen.faintedAt ? pen.faintedAt + RECOVER_MS - this.now() : 0;
    let cost = 0;
    if (waitMs > 0) {
      if (!pay) throw new GameError(`${pen.name} needs ${Math.ceil(waitMs / 60e3)} more minutes of rest. Or $${FAST_HEAL_COST} gets it up now.`, 409);
      const player = this.accounts.ensure(this.store.players[playerId]);
      this.accounts.requireFunds(player, FAST_HEAL_COST, 'expedited recovery');
      this.accounts.change(player, -FAST_HEAL_COST, 'barn-heal', 'Bug Center: expedited recovery');
      cost = FAST_HEAL_COST;
    }
    if (was) {
      const { faintedAt: _f, faintedBy: _b, faintedIn: _i, health: _h, ...rest } = pen;
      this.commitPen(playerId, { ...rest, healedAt: this.now(), heals: (pen.heals || 0) + 1 });
    }
    return { ...this.view(playerId), healed: was, cost };
  }
  /** What one bug wears from the store (skin palette, hat, accessory, battle gear), for drawing only. With no bug, the partner. */
  looksOf(playerId, pen) {
    const st = this.styleOf?.(playerId, pen ? idOf(pen) : undefined) || {};
    const o = {}; for (const k of ['bugskin', 'bughat', 'bugacc']) if (st[k]) o[k] = st[k];
    for (const k of ['gear', 'defense']) if (typeof st[k] === 'string' && st[k].startsWith('gear-')) o[k] = { id: st[k], shape: st[k].slice(5) };
    const evolved = pen || this.doc?.pens?.[playerId]; // an evolved bug's arm is part of how it looks, everywhere it is drawn
    if (evolved?.evo) { o.evo = evolved.evo; if (evolved.botched) o.botched = evolved.botched; }
    // its own base, ailments, faint fruit and colouring (engine/variety.js): stored, or what it would be given
    const variety = evolved && (cleanVariety(evolved.variety) || (idOf(evolved) && BY_ID[evolved.species] ? varietyFor(idOf(evolved), evolved.species) : null));
    if (variety) o.variety = variety;
    return Object.keys(o).length ? o : undefined;
  }
  /** After a death: lay it to rest. The stall empties (a new egg can turn up in the mines); a small grave record stays. */
  bury(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    if (!pen || pen.stage !== 'dead') throw new GameError('There is nothing to bury. Good.', 409);
    (this.doc.graves[playerId] ||= []).push({ name: pen.name, species: pen.species, bornAt: pen.bornAt, diedAt: pen.diedAt, level: levelFor(pen.xp, pen.cap) });
    this.doc.graves[playerId] = this.doc.graves[playerId].slice(-10);
    if (pen === this.doc.pens[playerId]) delete this.doc.pens[playerId]; else this.doc.bench[playerId] = this.doc.bench[playerId].filter((kept) => kept !== pen);
    this.save();
    return { ...this.view(playerId), graves: this.doc.graves[playerId] };
  }
  /**
   * Let a living bug go. It leaves the barn for the mines as a stray: some days it turns up among the wild bugs under
   * its own name and level, and anyone can jar it, its old owner included. The stall it leaves is empty at once.
   */
  release(playerId, bug) {
    const pen = this.refresh(playerId, bug);
    if (!pen || pen.stage !== 'creature') throw new GameError('Only a hatched, living bug can be let go.', 409);
    if (this.fights.fightOf(playerId)) throw new GameError('Not while one of your bugs is in a fight.', 409);
    if (pen.taken) throw new GameError(`${pen.name} is not here to let go.`, 409);
    if (rarityOf(pen.species) === LEGENDARY) throw new GameError('A legendary cannot be let go. There is only the one.', 409);
    if (isSteeze(pen.species)) throw new GameError(STEEZE_STUCK, 409);
    const stray = { id: `stray:${playerId}:${pen.bornAt}`, species: pen.species, name: pen.name, level: levelFor(pen.xp, pen.cap), owner: this.store.players[playerId]?.name || 'Somebody', at: this.now() };
    const changes = { strays: [...(this.doc.strays || []), stray].slice(-STRAYS_KEPT) };
    if (pen === this.doc.pens[playerId]) { changes.pens = { ...this.doc.pens }; delete changes.pens[playerId]; }
    else changes.bench = { ...this.doc.bench, [playerId]: this.doc.bench[playerId].filter((kept) => kept !== pen) };
    this.commitDoc(changes); // gone from the barn and loose in the mines in one write
    this.promote(playerId);
    return this.view(playerId);
  }
  /** Whether any living bug of this species is in somebody's barn, or loose as a stray: a legendary is one of a kind. */
  holds(species) {
    const kept = (pen) => pen?.species === species && pen.stage !== 'dead';
    return Object.values(this.doc.pens).some(kept) || Object.values(this.doc.bench || {}).some((bench) => bench.some(kept)) || this.strays().some((stray) => stray.species === species);
  }
  /** Whether this miner already has a living STEEZE (or any named species) in a stall. Others can still catch their own. */
  ownerHolds(playerId, species) {
    return this.bugs(playerId).some((pen) => pen?.species === species && pen.stage !== 'dead');
  }
  /** Released bugs nobody has caught yet. */
  strays() { return (this.doc.strays || []).filter((stray) => !this.wildCaught(stray.id)); }
  /** A fight is over and this bug ate its packed lunch in it: the lunch is gone. Only for the bug that fought. */
  lunchEaten(playerId, bornAt) {
    const pen = this.bugs(playerId).find((kept) => kept.bornAt === bornAt); // a stalled bug can step into a Barn bout
    if (!pen?.lunch) return;
    const { lunch: _lunch, ...rest } = pen;
    this.commitPen(playerId, rest);
  }
  /**
   * A store consumable: bump one need and earn `xp` care XP (food also counts as a feed). Food leaves a `lunch`
   * ({ name, heal }) for the bug's next fight; it carries one, and keeps the bigger.
   */
  boost(playerId, { stat, gain, fed = false, xp = fed ? CARE_XP : 0, lunch = null }) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('You need a hatched bug for that.', 409);
    const now = this.now(); const n = this.needs(pen, now);
    for (const st of STATS) pen.stats[st] = { v: n[st], at: now };
    pen.stats[stat].v = Math.min(100, n[stat] + Math.max(0, Math.min(100, gain)));
    if (fed) pen.fedAt = now;
    if (xp > 0) pen.xp += fadedXp(xp, levelFor(pen.xp, pen.cap));
    if (lunch?.heal > 0 && lunch.heal >= (pen.lunch?.heal || 0)) pen.lunch = { name: lunch.name, heal: lunch.heal };
    this.save();
    return this.view(playerId);
  }
  /** Automatic feeder (bought in the General Store): fills Fed, Mood and Clean, keeps them full and pauses the starvation clock for `ms`. */
  addFeeder(playerId, ms) {
    const pen = this.refresh(playerId);
    if (!pen || pen.stage !== 'creature') throw new GameError('The feeder needs a hatched bug to feed.', 409);
    const now = this.now();
    for (const st of STATS) pen.stats[st] = { v: 100, at: now };
    if (!pen.feederUntil || pen.feederUntil < now) { pen.feederFrom = now; pen.feederUntil = now; }
    pen.feederUntil += ms; this.save();
    return this.view(playerId);
  }
  forget(playerId) { // account deleted: the barn goes with it; its name stays retired so it's never reused
    if (!this.has(playerId) && !this.doc.dex[playerId]) return;
    delete this.doc.pens[playerId]; delete this.doc.bench[playerId]; delete this.doc.stalls[playerId]; delete this.doc.graves[playerId]; delete this.doc.dex[playerId]; this.save();
  }
}
function moodWord(n) {
  const low = Math.min(n.hunger, n.mood, n.clean);
  if (low >= 70) return 'thriving';
  if (low >= 40) return 'content';
  if (low >= 15) return n.hunger === low ? 'peckish' : n.mood === low ? 'bored' : 'grubby';
  return 'sulking';
}

// The Acid Mines: the only faucet in the closed economy. The server decides every payout.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { bucketChain, rng, farthest } from './engine/maze.js';
import { shiftMaze, tierInfo } from './engine/mine-tiers.js';
import { ROSTER, PAUSED_AT } from './engine/creatures.js';
import { MINE_ITEMS, SHAFTS, PART_ITEMS, PLUNGER, DRILL } from './catalog/mine.js';
import { dayKey } from './fawn.js';
import { mineDay, daySeed, dailyLayout } from './engine/daily-maze.js';
import { inHorrorWindow, lightsOutMs } from './engine/horror.js';
import { roamRoute } from './engine/wild-roam.js';
import { rarityOf, WILD_ODDS, RARE_TIER, LEGENDARY } from './engine/bug-types.js';
import { HEESHEE_RETURN } from './foreman.js';
import { HEESHEE_APPEAR_MS } from './foremanTyping.js';
import { STEEZE_ID, STEEZE_LEVEL, STEEZE_DAYS, isSteeze } from './engine/steeze.js';
import { WormSwarm, suckUnits, wormPublic, WORM_SUCK_MAX_GAP_MS, WORM_TILE, WORM_MINE_REACH } from './engine/worms.js';

// INTERNAL: never shown to players (the odds are a secret; there is no API that exposes them).
// Probabilities are out of 100,000 so 0.01% is exact. The three rare finds are each worth the same on average:
// the bigger the envelope, the rarer it is.
export const OUTCOMES = [
  { id: 'motherlode', odds: 50, amount: 10000, title: 'THE MOTHERLODE',
    text: 'Your pick goes through the wall and the whole tunnel glows. Fifty tons of premium acid. Payroll does not believe you. Payroll pays anyway.' },
  { id: 'aliens', odds: 20, amount: 25000, title: 'ALIEN SKELETONS',
    text: 'Three long skulls, one tiny saucer, zero explanation. Two agents in black suits appear behind you, hand you an envelope of cash and say you saw nothing. You saw nothing.' },
  { id: 'diamonds', odds: 10, amount: 50000, title: 'A DIAMOND WELL',
    text: 'An old wishing well at the bottom of a shaft, packed with uncut diamonds and a hand-drawn treasure map. Some kids got here first in the 80s. They left you plenty.' },
  { id: 'dud', odds: 10000, amount: 10, title: 'MOSTLY MUD',
    text: 'It was a puddle. The foreman pays you $10 out of pity and tells you to get back in there.' },
  { id: 'normal', odds: 89920, min: 80, max: 120, title: 'SHIFT COMPLETE',
    text: null },
];
const NORMAL_LINES = [
  'You mined acid. It was exactly as fun as last time.',
  'Another bucket of glowing goo for the company store. Again.',
  'Your helmet light flickers. Your soul flickers. You get paid.',
  'Level 1 acid deposit cleared. Only about 4,000 more to go.',
  'The foreman nods. That is the most emotion he has ever shown.',
  'You hum the mine song. Nobody else knows the mine song.',
  'You found acid where acid usually is. Groundbreaking.',
  'The hole is empty. Payroll considers this an improvement.',
];
const TOTAL = OUTCOMES.reduce((a, o) => a + o.odds, 0); // 100000

/** Expected value per full plain bucket, in dollars. */
export function expectedPayout() {
  return OUTCOMES.reduce((a, o) => a + (o.odds / TOTAL) * (o.amount ?? (o.min + o.max) / 2), 0);
}

/** Roll one shift. `randInt(n)` returns an integer in [0, n). */
export function rollOutcome(randInt = (n) => crypto.randomInt(n)) {
  let r = randInt(TOTAL);
  for (const o of OUTCOMES) {
    if (r < o.odds) {
      const amount = o.amount ?? o.min + randInt(o.max - o.min + 1);
      const text = o.text ?? NORMAL_LINES[randInt(NORMAL_LINES.length)];
      return { outcome: o.id, amount, title: o.title, text };
    }
    r -= o.odds;
  }
  throw new Error('unreachable');
}


// Encounters (internal, not shown to players), decided by the server when the shift starts, from its own random
// source, never the payout one. One roll, at most one figure: about 28% of shifts get the visitor (Nosferatu),
// 20% the faun, 20% the Heeshee Mazode, and the rest none. The visitor's 28% and the faun's 20% are unchanged;
// the Heeshee takes the next 20,000 of the remaining 52,000, so they never share a shift and nothing is squeezed.
// The visitor can't show up before SCARE_AFTER_MS, and then only when the player takes a corner fast
// (client/src/mines/stalker.js). The faun trots in after clock-in (faunFollower.js). The Heeshee bumbles the
// tunnels and, if you brought a hatched bug guide, may snatch it (heeshee.js); pay and acid timing ignore it.
export const SCARE_CHANCE = 28000; // out of 100,000
export const FAUN_CHANCE = 20000; // out of 100,000: overall 20% of shifts, never with the visitor or the Heeshee
export const HEESHEE_CHANCE = 20000; // out of 100,000: overall 20% of shifts, never with the visitor or the faun
export const SCARE_AFTER_MS = 30000;
export const HEESHEE_SHAKEN_MS = 90_000; // purely cosmetic twitch after the Foreman returns the bug
/** Shown in the HUD and on any recall (BUG / V / COME HERE) while the guide is away. */
export const HEESHEE_GONE = 'Your bug is nowhere to be found. The Heeshee Mazode took it.';
export const PURPLE_AFTER_MS = [45000, 90000]; // a purple shift's backstop: the bug wanders off and finds the pool by then, wherever the miner is
/** Where the day's purple pool lies: about halfway along the shortest walk from the lift to the first acid pool, so every miner passes it. */
export function purpleSpot(maze, first) {
  let p = { x: first.x, y: first.y }; const at = (q) => maze.dist[q.y]?.[q.x] ?? -1, stop = Math.max(3, Math.round(at(p) / 2));
  while (at(p) > stop) {
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })).find((q) => at(q) === at(p) - 1);
    if (!next) break;
    p = next;
  }
  return at(p) >= 3 && at(p) < at(first) ? p : null;
}
export const EGG_WINDOW_MS = 30000; // an egg (when there is one) lies near the start for the first 30 s of the shift
// One roll, three mutually exclusive encounters.
// 0..27999 the visitor (28%), 28000..47999 the faun (20%), 48000..67999 the Heeshee (20%), else none (32%).
export function rollScare(randInt = (n) => crypto.randomInt(n)) {
  const r = randInt(100000);
  if (r < SCARE_CHANCE) return { scare: true, faun: false, heeshee: false };
  if (r < SCARE_CHANCE + FAUN_CHANCE) return { scare: false, faun: true, heeshee: false };
  if (r < SCARE_CHANCE + FAUN_CHANCE + HEESHEE_CHANCE) return { scare: false, faun: false, heeshee: true };
  return { scare: false, faun: false, heeshee: false };
}
export const MAX_SHIFT_MS = 30 * 60 * 1000;
/** A cave-in in a permit shaft knocks this share of what is in the bucket onto the floor. */
export const CAVE_IN_SPILL = 0.25;
/** The other faun waits at the elevator of a permit shaft and helps himself to this share of the cheque. */
export const TWIN_CUT = 1 / 3;
/** Acid is richer the deeper the shaft (its `quality`) and the farther its pool is from the lift. The first RICH_FREE
 *  tiles of walk pay the shaft's rate; past that, ordinary acid pays that rate again for every RICH_STEPS tiles (so about 140 tiles out is double, 200 triple). Mud and the rare
 *  finds are what they are anywhere. Tuned with scripts/mine-timing.mjs so Shaft 7 pays about what it did per minute
 *  before the shafts grew, and each deeper shaft a little more. */
export const RICH_FREE = 80, RICH_STEPS = 62;
export const richAt = (steps, quality = 1) => Math.round(quality * (1000 + 1000 * Math.max(0, steps - RICH_FREE) / RICH_STEPS)); // thousandths, like every quantity here
/** What the bucket is worth as plain acid: units weighted by how rich each pool was. Shifts dug before richness count plain. */
const worthOf = (s) => s.worth ?? s.collected;
const MAX_SHIFTS_PER_HOUR = 120;
export const BUCKET_CAPACITY = 100;
export const EXTRACTION_RATE = 5;
export const PULSE_GAP_MS = 1000;
const CAPACITY = BUCKET_CAPACITY * 1000; // Integer thousandths keep pulse frequency from changing the yield.
// Gear is fixed on the shift at clock-in; shifts started before gear existed fall back to the plain bucket.
const cap = (s) => s.capacity ?? CAPACITY;
const rate = (s) => s.rate ?? EXTRACTION_RATE;

// The nephew (a General Store hire) works one shift a day by himself and brings back about what a real one pays,
// once he has some days behind him: a $1 raise for each day worked, up to `raiseCap`. Each line adds to his record.
export const NEPHEW_PAY = { min: 40, max: 90, raiseCap: 30 };
const NEPHEW_LINES = [
  ['HE FOUND A FROG. HE WOULD NOT STOP TALKING ABOUT THE FROG.', 'FROGS'],
  ['HE SPILLED MOST OF IT ON THE WAY UP. HE SAYS THE BUCKET DID IT.', 'SPILLS'],
  ['HE MINED FOR ELEVEN MINUTES AND ATE LUNCH FOR THE REST.', 'LUNCHES'],
  ['HE ASKED THE ACID A LOT OF QUESTIONS. THE ACID DID NOT ANSWER.', 'QUESTIONS'],
  ['HE CAME BACK WITH ONE SHOE. THE PAY IS FOR THE ACID, NOT THE SHOE.', 'SHOES LOST'],
  ['THE FOREMAN IS PROUD OF HIM. THE FOREMAN IS THE ONLY ONE.', 'PROUD UNCLES'],
];

/**
 * How much of the bucket an acid deposit fills, from that pool's stored roll (0..99999).
 * 5% of rolls fill 1% of capacity, 25% fill the bucket entirely, 50% fill it halfway,
 * and 20% fill a uniform random 1–100%. The amount is clamped to remaining space.
 * Clock-in stores the roll, so a later probe cannot be rerolled or client-supplied.
 */
export function acidFillAmount(capacity, roll, remaining = capacity) {
  const r = Math.max(0, Math.min(99999, Number(roll) | 0));
  let pct;
  if (r < 5000) pct = 1;
  else if (r < 30000) pct = 100;
  else if (r < 80000) pct = 50;
  else pct = Math.floor((r - 80000) / 200) + 1; // 80000..99999 → 1..100 evenly
  const amount = (capacity * pct) / 100;
  return Math.max(0, Math.min(amount, remaining));
}

function reloadRequired() {
  const error = new GameError('The mine has changed. Reload before starting or continuing this shift.', 409);
  error.code = 'mine_reload'; return error;
}

export class Mines {
  constructor({ store, accounts, now, randInt, scareInt, poolInt, caveInt, twinInt, wormInt, vein, barn, foreman, owned, layout }) {
    this.owned = owned || (() => ({})); // player id -> General Store items they own (wired to the shop in app.js)
    this.foreman = foreman || null; // v45
    this.store = store; this.accounts = accounts; this.now = now; this.randInt = randInt;
    this.barn = barn || null; // v30: eggs (its own random source; see barn.js)
    // Separate random source for scares, so a scare can never influence what a shift pays.
    this.scareInt = scareInt || ((n) => crypto.randomInt(n));
    this.vein = vein; // Existing test fixtures can pin the maze size and tier.
    this.poolInt = poolInt || ((n) => crypto.randomInt(n));
    this.caveInt = caveInt || ((n) => crypto.randomInt(n)); // cave-ins have their own source too: they never see the payout roll
    this.twinInt = twinInt || ((n) => crypto.randomInt(n)); // ...and so does the other faun
    // The day's tunnels (engine/daily-maze.js): every miner who clocks in on the same Mountain-time day gets the same
    // maze and the same acid spots. A test that pins `vein` keeps the maze size it asked for; the seed is still the day's.
    const dug = new Map(); // a big shaft takes a moment to dig: once per day and shaft is plenty
    this.layout = layout || ((now, shaft = null) => {
      const day = mineDay(now), key = day + '/' + (shaft?.id || '');
      if (!dug.has(key)) { if (dug.size > 8) dug.clear(); dug.set(key, dailyLayout(day, null, shaft)); }
      return dug.get(key);
    });
    this.wildRosters = new Map();
    this.busy = () => false; // set by the PvP module: no mining while your bug is mid-battle
    this.doc = store.loadDoc('mines', { active: {} });
    this.holds = new Map(); // Never resume a held button after a disconnect or restart.
    this.wormInt = wormInt || ((n) => crypto.randomInt(n)); // worms have their own source: they never see the payout roll
    this.swarms = new Map(); // in-memory only: a restart starts with a clean visor, same as before
    // Horror Night (engine/horror.js): the clock decides. horrorForce (true/false) overrides it; only the dev-login
    // test route in app.js ever sets it, and that route is never mounted in production.
    this.horrorForce = null;
    this.heesheeForce = null;
    // Per-player only: a forced stick insect never joins the shared daily roster.
    this.stickForce = new Map();
    this.steezeForce = new Map();
  }
  /** Is it Horror Night right now? Cosmetic only: nothing that pays, times or rolls a shift reads it. */
  horrorOn(now = this.now()) { return this.horrorForce ?? inHorrorWindow(now); }
  save() { this.store.saveDoc('mines', this.doc); }
  commit(playerId, shift, completed) {
    const next = { ...this.doc, active: { ...this.doc.active } };
    if (shift) next.active[playerId] = shift; else delete next.active[playerId];
    if (completed) next.completed = { ...this.doc.completed, [playerId]: completed };
    this.store.saveDoc('mines', next); this.doc = next;
  }
  /** What a player's mine gear adds up to: the fastest filler, the lamp and rod, and the shafts they hold permits for. */
  gear(playerId) {
    const own = this.owned(playerId) || {}; const has = MINE_ITEMS.filter((x) => own[x.id]);
    return { rate: Math.max(1, ...has.map((x) => x.rate || 0)),
      lamp: has.some((x) => x.lamp), rod: has.some((x) => x.rod), nephew: has.some((x) => x.nephew), shafts: SHAFTS.filter((s) => !s.permit || own[s.permit]) };
  }
  /** The mech part on the partner, if it is evolved and fit to come down: 'lamp', 'plunger', 'hoist' or 'drill' (catalog/mine.js). */
  part(playerId) {
    try { return this.barn?.fit?.(playerId) && this.barn.doc.pens[playerId].evo ? PART_ITEMS.find((x) => x.id === this.barn.styleOf?.(playerId)?.part)?.part || null : null; } catch { return null; }
  }
  /** The shift office: what you would clock in with, and every shaft with whether your permit opens it. */
  office(player) {
    const g = this.gear(player.id);
    const today = this.layout(this.now(), SHAFTS[0]), t = tierInfo(today.tier);
    const hold = this.barn?.heesheeHoldOf?.(player.id);
    return { capacity: BUCKET_CAPACITY, extractionRate: EXTRACTION_RATE * g.rate, lamp: g.lamp, rod: g.rod, nephew: this.nephew(player.id),
      ...(t ? { today: { day: today.day, tier: t.tier, cells: today.cells, pay: t.pay } } : {}),
      shafts: SHAFTS.map((s) => ({ id: s.id, name: s.name, fare: s.fare, quality: s.quality, open: g.shafts.includes(s) })),
      ...(hold ? { heesheeHold: { name: hold.name, line: HEESHEE_GONE } } : {}) };
  }
  /** Null unless hired; otherwise whether he can still go down today (the faun's UTC day), what he brought back, and
   *  his record: days worked, total and best day, the raise he has earned, and a tally of what he did instead of mining. */
  nephew(playerId) {
    if (!this.gear(playerId).nephew) return null;
    const row = this.doc.nephew?.[playerId], days = row?.days || 0, worked = row?.day === dayKey(this.now());
    return { ready: !worked, today: worked ? { amount: row.amount, line: row.line } : null,
      days, total: row?.total || 0, best: row?.best || 0, raise: Math.min(NEPHEW_PAY.raiseCap, days), tally: { ...row?.tally } };
  }
  /** One small payout a day, fixed by player and day so it cannot be re-rolled. */
  sendNephew(player) {
    const state = this.nephew(player.id);
    if (!state) throw new GameError('The nephew does not work for you. The General Store handles hiring.', 403);
    if (!state.ready) throw new GameError('The nephew has done his shift for today.', 409);
    const day = dayKey(this.now()), h = crypto.createHash('sha256').update(`${player.id}:${day}:nephew-v1`).digest();
    const [line, stat] = NEPHEW_LINES[h[2] % NEPHEW_LINES.length];
    const amount = NEPHEW_PAY.min + h.readUInt16BE(0) % (NEPHEW_PAY.max - NEPHEW_PAY.min + 1) + state.raise;
    const row = { day, amount, line, days: state.days + 1, total: state.total + amount, best: Math.max(state.best, amount), tally: { ...state.tally, [stat]: (state.tally[stat] || 0) + 1 } };
    // Mark the day worked on disk before paying, so a crash can never pay the same day twice.
    const next = { ...this.doc, nephew: { ...this.doc.nephew, [player.id]: row } };
    this.store.saveDoc('mines', next); this.doc = next;
    this.accounts.change(player, row.amount, 'mine', 'Acid Mines: the nephew\'s shift');
    return { nephew: this.nephew(player.id), bankroll: player.bankroll };
  }
  requireVersion(request) { if (request?.rulesVersion !== 2) throw reloadRequired(); }
  current(player, shiftId) {
    const cur = this.doc.active[player.id];
    if (typeof shiftId !== 'string' || !cur || cur.id !== shiftId) throw new GameError('That shift is not yours or already ended. Start a new shift.', 409);
    return cur;
  }
  completed(player, shiftId, request) {
    const receipt = this.doc.completed?.[player.id];
    if (!receipt || receipt.shiftId !== shiftId) return null;
    this.requireVersion(request);
    return this.completionView(player, receipt);
  }
  completionView(player, receipt) {
    const pending = this.foreman?.doc.lastMineShift?.[player.id] === receipt.shiftId ? this.foreman.view(player.id).pending : null;
    const gone = { ...(receipt.sick ? { sick: receipt.sick } : {}), ...(receipt.taken ? { taken: receipt.taken } : {}) };
    if (!receipt.result) return { pending, ...gone };
    const heeshee = receipt.heeshee ? { id: `heeshee-${receipt.shiftId}`, reason: 'heeshee', lines: HEESHEE_RETURN } : null;
    const foreman = heeshee || (receipt.reason === 'mud' && pending ? pending : null);
    return { ...gone, result: { ...receipt.result, bankroll: player.bankroll, ...(foreman ? { foreman } : {}), ...(receipt.heeshee ? { bugReturned: true, bugShaken: true } : {}) } };
  }

  start(player, request = {}) {
    const now = this.now();
    const cur = this.doc.active[player.id];
    if (cur?.rulesVersion === 2) {
      this.requireVersion(request);
      if (cur.settlement || now - cur.startedAt >= MAX_SHIFT_MS || cur.collected >= cap(cur)) return this.settle(player, cur);
    }
    const last = this.doc.completed?.[player.id];
    if (!cur && last?.result && request?.afterShiftId !== last.shiftId) {
      this.requireVersion(request); return this.completionView(player, last);
    }
    if (this.foreman?.pending(player.id)) { const e = new GameError('The foreman is waiting on an answer before you clock in again.', 409); e.code = 'foreman'; throw e; }
    if (cur && now - cur.startedAt < MAX_SHIFT_MS) { this.holds.delete(player.id); const live = this.noteHeesheeAppearance(cur, player.id); return this.publicShift(live, true, player.id, this.guideBug(player.id)); }
    this.requireVersion(request);
    const recent = (player.mining?.recentStarts || []).filter((t) => now - t < 3600e3);
    if (recent.length >= MAX_SHIFTS_PER_HOUR) throw new GameError('The foreman says you have worked enough shifts this hour. Come back later.', 429);
    const gear = this.gear(player.id);
    const shaft = request.shaft == null ? SHAFTS[0] : gear.shafts.find((s) => s.id === String(request.shaft));
    if (!shaft) throw new GameError('The elevator operator wants to see a permit for that shaft.', 403);
    if (shaft.fare) this.accounts.requireFunds(player, shaft.fare, `the elevator to ${shaft.name}`);
    const day = this.layout(now, shaft); // each shaft digs its own tunnels, bigger the deeper it is
    const pinned = this.vein?.(); // a test that pins the size gets plain tunnels unless it pins a tier too
    let encounter = rollScare(this.scareInt);
    if (this.heesheeForce === true) encounter = { scare: false, faun: false, heeshee: true };
    else if (this.heesheeForce === false) encounter = { ...encounter, heeshee: false };
    const shift = { id: crypto.randomBytes(12).toString('base64url'), startedAt: now, ...encounter, seed: day.seed, day: day.day, cells: pinned?.cells || day.cells };
    const tier = tierInfo(pinned?.cells ? pinned.tier : day.tier); // The shift keeps its tier (and hazard pay) past midnight.
    if (tier) Object.assign(shift, { tier: tier.tier, ...(tier.pay !== 1 ? { hazard: tier.pay } : {}) });
    const maze = shiftMaze(shift);
    const chain = bucketChain(maze, shift.seed, pinned?.cells ? 8 : day.pools || 8), far = farthest(maze), out = (p) => maze.dist[p.y][p.x];
    Object.assign(shift, { rulesVersion: 2, shaft: shaft.id, capacity: CAPACITY, rate: EXTRACTION_RATE * gear.rate,
      ...(gear.lamp ? { lamp: true } : {}), ...(gear.rod ? { rod: true } : {}), ...(this.part(player.id) ? { part: this.part(player.id) } : {}),
      ...(shaft.twin && this.twinInt(100) < shaft.twin ? { twin: true } : {}), collected: 0, worth: 0, index: 0, outcome: rollOutcome(this.randInt),
      // The roof is looser the farther out a pool is: nothing at the lift, the shaft's rate halfway, double it at the far end.
      pools: chain.map((p, i) => ({ id: `p${i}`, x: p.x, y: p.y, rich: richAt(out(p), shaft.quality), roll: this.poolInt(100000), quantity: null, remaining: null,
        ...(shaft.caveIn && this.caveInt(100) < shaft.caveIn * 2 * out(p) / far ? { cave: true } : {}) })) }); // decided now, sprung on arrival
    const purplePool = purpleSpot(maze, chain[0]); if (purplePool) shift.purplePool = purplePool; // the same tile for everyone in this shaft today
    if (this.horrorOn(now)) shift.horror = { lightsOutMs: lightsOutMs(shift.id) }; // stamped at clock-in: the whole shift is one kind of night
    if (this.barn?.rollEgg(player.id)) shift.egg = true; // rolled last and from the barn's own source: pay and visitor never see it
    // Everyone sees the purple pool. Only a partner due to evolve (server/barn.js), on a shift that rolled for it, drinks: when its miner
    // walks past, or PURPLE_AFTER_MS in at the latest. The shift ends there.
    if (shift.purplePool && this.barn?.rollPurple?.(player.id)) shift.purple = { afterMs: PURPLE_AFTER_MS[0] + this.scareInt(PURPLE_AFTER_MS[1] - PURPLE_AFTER_MS[0]) };
    if (!shift.purple && this.barn?.rollCollect?.(player.id)) shift.collect = true; // the second evolution: he is waiting at the lift when this shift ends
    // The fare and the clock-in are one write; it is never refunded (a crash right here costs the fare, not a payout).
    const draft = { ...player, mining: { ...player.mining, recentStarts: [...recent, now] } };
    if (shaft.fare) this.accounts.change(draft, -shaft.fare, 'mine', `Acid Mines: elevator fare, ${shaft.name.toLowerCase()}`, { save: false });
    this.store.commitPlayerDrafts([draft]);
    if (this.wildsFor(shift).some((w) => w.species === STICK_ID)) shift.stick = true;
    const guide = this.guideBug(player.id);
    if (shift.heeshee && this.livingGuide(player.id, guide)) shift.heesheeHadBug = true;
    this.commit(player.id, shift); this.holds.delete(player.id);
    try { this.onShiftStart?.(player.id, shift, shaft.fare || 0); } catch { /* admin stats only */ }
    return this.publicShift(shift, false, player.id, guide);
  }
  /** Living hatched Barn bug the player can bring into the tunnels as a guide (v64). */
  guideBug(playerId) {
    if (!this.barn) return null;
    try {
      // Prefer the public view (hatches eggs, applies style). Fall back to the raw pen if view throws on a corrupt row.
      let pen = null, style = null;
      try {
        const v = this.barn.view(playerId);
        pen = v?.pen || null;
        style = pen?.style || null;
      } catch {
        const raw = this.barn.doc?.pens?.[playerId];
        if (raw?.stage === 'creature') pen = { stage: 'creature', species: raw.species, name: raw.name, speciesName: raw.species };
      }
      if (!pen || pen.stage !== 'creature') return null;
      if (pen.fainted) return { fainted: true, name: pen.name, species: pen.species }; // v75: it stays home until the Bug Center heals it
      // Held after a steal (this shift, or leftover from a quit): still in the barn, just not a guide.
      if (pen.heesheeHeld || this.barn.isHeesheeHeld?.(pen) || this.barn.heesheeHoldOf?.(playerId)) {
        return { held: true, name: pen.name, species: pen.species, speciesName: pen.speciesName || pen.species, style };
      }
      // the Bug Gym: an overworked or juiced guide walks slower, balks, and may go berserk on a knocked-out wild bug
      const g = pen.gym, gym = g && (g.unruly > 0 || g.rage > 0) ? { unruly: g.unruly, mineSpeed: g.mineSpeed, balk: g.balk, rage: g.rage, roid: g.roid, strain: g.strain } : null;
      return { species: pen.species, name: pen.name, speciesName: pen.speciesName || pen.species, style, ...(gym ? { gym } : {}) };
    } catch { return null; }
  }
  shakenUntil(playerId) { return (this.doc.shaken?.[playerId] || 0) > this.now(); }
  livingGuide(playerId, guide = this.guideBug(playerId)) {
    return !!(guide && !guide.fainted && !guide.held);
  }
  /**
   * Stamp that the Heeshee has appeared on this shift. `force` is the client reporting
   * first sight; otherwise the server stamps once the appear delay has elapsed so a
   * refresh, tab close, or quick quit after spawn cannot dodge the record.
   */
  noteHeesheeAppearance(cur, playerId, { force = false } = {}) {
    if (!cur?.heeshee || cur.settlement) return cur;
    if (!force && !cur.heesheeSeen && (this.now() - cur.startedAt < HEESHEE_APPEAR_MS)) return cur;
    const had = cur.heesheeHadBug || this.livingGuide(playerId);
    if (cur.heesheeSeen && !!cur.heesheeHadBug === !!had) return cur;
    const next = { ...cur, heesheeSeen: true, heesheeSeenAt: cur.heesheeSeenAt || this.now(), ...(had ? { heesheeHadBug: true } : {}) };
    this.commit(playerId, next);
    return next;
  }
  seeHeeshee(player, shiftId) {
    const cur = this.current(player, shiftId);
    if (cur.settlement) throw new GameError('That shift has already ended.', 409);
    if (!cur.heeshee) throw new GameError('There is no Heeshee Mazode on this shift.', 409);
    const next = this.noteHeesheeAppearance(cur, player.id, { force: true });
    return this.publicShift(next, true, player.id, this.guideBug(player.id));
  }
  /** Saw the Heeshee, then bailed (empty quit / expire) before a steal or a paid finish. */
  shouldTypingTest(cur, receipt) {
    if (!this.foreman?.scoldTyping || !cur?.heeshee || cur.heesheeStolen || cur.heesheeFreed) return false;
    if (receipt?.result || receipt?.heeshee) return false;
    const appeared = !!(cur.heesheeSeen || (this.now() - cur.startedAt >= HEESHEE_APPEAR_MS));
    return !!(appeared && cur.heesheeHadBug);
  }

  /**
   * The Heeshee grabbed the guide. The barn row is never deleted: a hold is stamped so a quit or disconnect
   * cannot hand the bug back free. Finding acid on this same shift (or a later completed acid shift) releases
   * it and the Foreman brings it back. Or chase it down, hit it and answer its three riddles (server/mazodeChase.js). Idempotent.
   */
  stealBug(player, shiftId) {
    const cur = this.current(player, shiftId);
    if (cur.settlement) throw new GameError('That shift has already ended.', 409);
    if (!cur.heeshee) throw new GameError('There is no Heeshee Mazode on this shift.', 409);
    const guide = this.guideBug(player.id);
    if (!guide || guide.fainted || (guide.held && !cur.heesheeStolen)) throw new GameError('You have no bug for it to take.', 409);
    if (cur.heesheeStolen) {
      try { this.barn?.holdHeeshee?.(player.id, { shiftId: cur.id, at: cur.heesheeStolenAt || this.now() }); } catch { /* hold is best-effort */ }
      return this.publicShift(this.chase?.current(player.id, cur.id) || cur, true, player.id, this.guideBug(player.id) || guide);
    }
    // Won back off it already (server/mazodeChase.js): it is sulking somewhere and does not come back this shift.
    if (cur.heesheeFreed) throw new GameError('It already gave your bug back. It is sulking somewhere.', 409);
    const next = { ...cur, heesheeStolen: true, heesheeStolenAt: this.now() };
    const chase = this.chase?.begin(player.id, cur); if (chase) next.chase = chase; // it bolts, and you can go after it
    this.commit(player.id, next);
    try { this.barn?.holdHeeshee?.(player.id, { shiftId: cur.id, at: next.heesheeStolenAt }); } catch { /* the shift flag is enough until migrate */ }
    return this.publicShift(next, true, player.id, this.guideBug(player.id) || { ...guide, held: true });
  }
  /**
   * Any recall (BUG / V / COME HERE / an order) while the guide is stolen or held. The guide path is
   * client-side, but the server refuses the order so a patched client cannot officially call it back.
   */
  orderBug(player, shiftId, request = {}) {
    this.requireVersion(request);
    const cur = this.doc.active?.[player.id];
    const stolenHere = !!(cur && cur.id === shiftId && cur.heesheeStolen);
    const held = !!this.barn?.heesheeHoldOf?.(player.id);
    if (stolenHere || held) throw new GameError(HEESHEE_GONE, 409);
    return { ok: true, order: request.order || null };
  }
  /** Read-only: live mid-shift steals that would have been restored for free under the old quit path. */
  auditHeesheeSteals() {
    const ids = Object.entries(this.doc.active || {}).filter(([, s]) => s?.heesheeStolen && !s.settlement).map(([id]) => id);
    const held = this.barn?.doc?.pens
      ? Object.values(this.barn.doc.pens).flatMap((row) => {
          const pens = row && typeof row === 'object' && !row.stage ? Object.values(row) : [row];
          return pens.filter((p) => p && (p.heesheeHeld || p.heesheeHeldAt));
        }).length
      : 0;
    return { activeStolen: ids.length, ids, barnHeld: held };
  }
  /** Stamp a barn hold on any in-progress steal so a restart plus quit cannot restore the bug free. */
  migrateHeesheeSteals() {
    const audit = this.auditHeesheeSteals();
    let stamped = 0;
    for (const playerId of audit.ids) {
      const shift = this.doc.active[playerId];
      if (this.barn?.heesheeHoldOf?.(playerId)) continue;
      try {
        if (this.barn?.holdHeeshee?.(playerId, { shiftId: shift.id, at: shift.heesheeStolenAt || this.now() })) stamped++;
      } catch { /* leave the shift flag; settle still knows */ }
    }
    return { ...audit, stamped };
  }
  eggAvailable(s, playerId) { return !!(s?.egg && !s.eggTaken && this.barn && !this.barn.has(playerId)); }

  publicShift(s, resumed, playerId, guide = null) {
    const taken = !!(s.heesheeStolen || guide?.held);
    const bug = guide?.fainted || taken ? null : (guide ? { ...guide, ...(this.shakenUntil(playerId) ? { shaken: true } : {}) } : guide);

    const wilds = this.wildsFor(s, playerId);
    const egg = this.eggAvailable(s, playerId);
    return { shiftId: s.id, seed: s.seed, ...(s.day ? { day: s.day } : {}), startedAt: s.startedAt, minMs: 0, cells: s.cells || 7, ...(s.tier ? { tier: s.tier } : {}), resumed, serverNow: this.now(), scare: s.scare || s.scareAt ? { afterMs: SCARE_AFTER_MS } : null, ...(s.faun ? { faun: true } : {}), ...(s.heeshee ? { heeshee: true } : {}), ...(taken ? { bugStolen: { name: guide?.name || 'Your bug', line: HEESHEE_GONE } } : {}), ...(s.horror ? { horror: { lightsOutMs: s.horror.lightsOutMs } } : {}), ...(egg ? { egg: true } : {}), ...(s.purplePool ? { purplePool: s.purplePool } : {}), ...(s.purple ? { purple: { afterMs: s.purple.afterMs } } : {}), wilds, ...(wilds.length ? { wild: wilds[0] } : {}), ...(s.chase && this.chase ? { mazode: this.chase.view({ ...s, chase: this.chase.advance(playerId, s.chase) }, playerId, { route: true }) } : {}), ...(bug ? { bug } : {}), ...(guide?.fainted ? { bugFainted: { name: guide.name } } : {}),
      ...(s.rulesVersion === 2 ? { rulesVersion: 2, capacity: cap(s) / 1000, extractionRate: rate(s), shaft: s.shaft || '7', lamp: !!s.lamp, rod: !!s.rod, ...(s.part ? { part: s.part } : {}), ...(s.plunged ? { plunged: s.plunged } : {}), ...(s.caught ? { caught: s.caught } : {}),
        ...(s.part === 'lamp' && s.pools[s.index].quantity === null ? { peek: acidFillAmount(cap(s), s.pools[s.index].roll, cap(s) - s.collected) / 1000 } : {}), ...(s.spill ? { spill: { poolId: s.spill.poolId, lost: s.spill.lost / 1000 } } : {}), collected: s.collected / 1000, rich: s.collected > 0 ? Math.round(100 * worthOf(s) / s.collected) / 100 : 1, currentPoolId: s.pools[s.index].id, readyAt: s.startedAt,
        pools: s.pools.map(({ id, x, y, quantity, remaining, rich }) => ({ id, x, y, quantity: quantity === null ? null : quantity / 1000, remaining: remaining === null ? null : remaining / 1000, ...(quantity !== null && rich > 1000 ? { rich: rich / 1000 } : {}) })), ...this.wormFields(s),
        ...(this.npcs ? { npcs: this.npcs.view(s, playerId), smokes: this.npcs.smokes(playerId) } : {}) } : {}) }; // the old-timers (server/npcMiners.js)
  }

  target(s, poolId) {
    const i = s.pools.findIndex((p) => p.id === poolId);
    if (i < 0 || i > s.index) throw new GameError('Follow the current pool. This one is not ready to mine.', 409);
    return i;
  }
  advance(s) {
    if (s.pools[s.index].remaining === 0 && s.index < s.pools.length - 1) {
      s.index++;
    }
  }

  /** Resolve a v2 deposit once; legacy probes retain their response shape with acid always available. */
  probe(player, shiftId, request = {}) {
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion === 2) {
      this.requireVersion(request);
      if (cur.settlement || cur.collected >= cap(cur) || this.now() - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
      const i = this.target(cur, request.poolId);
      if (i < cur.index || cur.pools[i].quantity !== null) return this.publicShift(cur, true, player.id);
      const next = structuredClone(cur), pool = next.pools[i];
      if (pool.cave && next.collected > 0 && next.part === 'hoist') next.caught = pool.id; // the roof comes down and the bug holds the bucket out of it
      else if (pool.cave && next.collected > 0) { // the roof comes down as you arrive; the fill roll is then clamped to what's left
        const lost = Math.floor(next.collected * CAVE_IN_SPILL);
        next.worth = worthOf(next) * (next.collected - lost) / next.collected; next.collected -= lost; next.spill = { poolId: pool.id, lost };
      }
      // Acid fill is a share of this shift's bucket, not the old time-based sizes or shaft scale.
      pool.quantity = pool.remaining = acidFillAmount(cap(next), pool.roll, cap(next) - next.collected);
      // The plunger, once a shift: a pool that rolled nearly dry gives half a bucket (or whatever room is left).
      if (next.part === 'plunger' && !next.plunged && acidFillAmount(cap(next), pool.roll) < cap(next) * PLUNGER.under) {
        const more = Math.min(cap(next) * PLUNGER.gives, cap(next) - next.collected);
        if (more > pool.quantity) { pool.quantity = pool.remaining = more; next.plunged = pool.id; }
      }
      this.advance(next); this.commit(player.id, next);
      // the shift is already saved, so a barn hiccup costs the bug 2 XP, not the miner a pool
      if (pool.quantity > 0) try { this.barn?.foundAcid?.(player.id); } catch { /* XP only */ }
      return this.publicShift(next, true, player.id);
    }
    return { flowing: true, seeping: false };
  }

  extract(player, shiftId, request = {}) {
    this.requireVersion(request);
    if (!['start', 'continue', 'stop'].includes(request.action)) throw new GameError('Choose a valid mining action.', 400);
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    this.tickWorms(player, { hold: true }); // already-latched worms keep drinking while you mine; new ones still wait
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion !== 2) throw reloadRequired();
    const now = this.now();
    if (cur.settlement || cur.collected >= cap(cur) || now - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
    const i = this.target(cur, request.poolId);
    if (i < cur.index) return this.publicShift(cur, true, player.id);
    if (cur.pools[i].remaining === null) throw new GameError('Inspect the pool before mining.', 425);
    if (this.busy(player.id)) { this.holds.delete(player.id); throw new GameError('Your bug is mid-battle. Mining can wait.', 409); }
    const hold = this.holds.get(player.id);
    const live = hold?.shiftId === shiftId && hold.poolId === request.poolId && now >= hold.at && now - hold.at <= PULSE_GAP_MS;
    if (request.action === 'start') {
      if (!live) this.holds.set(player.id, { shiftId, poolId: request.poolId, at: now });
      return this.publicShift(cur, true, player.id);
    }
    if (!live) {
      this.holds.delete(player.id);
      if (request.action === 'continue') throw new GameError('Mining stopped. Hold Mine again.', 409);
      return this.publicShift(cur, true, player.id);
    }
    let next = cur;
    if (now > hold.at) {
      next = structuredClone(cur);
      const amount = Math.min((now - hold.at) * rate(next), next.pools[i].remaining, cap(next) - next.collected);
      next.worth = worthOf(next) + amount * (next.pools[i].rich || 1000) / 1000 * (next.part === 'drill' ? 1 + DRILL : 1); next.collected += amount; next.pools[i].remaining -= amount;
      this.advance(next); this.commit(player.id, next);
    }
    if (request.action === 'stop' || next.index !== i || next.collected >= cap(next)) this.holds.delete(player.id);
    else this.holds.set(player.id, { shiftId, poolId: request.poolId, at: now });
    if (next.collected >= cap(next)) return this.settle(player, next);
    return this.publicShift(next, true, player.id);
  }

  /** All shafts share the day's roster. Catches retire a bug for everyone; other encounters end for this shift. */
  wildsFor(shift, playerId = null) {
    if (shift?.rulesVersion !== 2) return [];
    const day = shift.day || mineDay(shift.startedAt);
    const key = `${day}:${shift.seed}:${shift.cells}:${shift.tier || 0}:${shift.shaft || '7'}`;
    if (!this.wildRosters.has(key)) {
      this.wildRosters.set(key, dailyWilds(day, shift, this.barn?.strays?.() || [], (species) => !!this.barn?.holds?.(species)));
      if (this.wildRosters.size > 8) this.wildRosters.delete(this.wildRosters.keys().next().value);
    }
    // Every one of the day's bugs is down here at once. A catch retires one for everyone; a fight that ends any other way ends it for this shift.
    let list = this.wildRosters.get(key).filter(({ id }) => !this.barn?.wildCaught?.(id) && !shift.wildsGone?.includes(id));
    if (playerId && this.stickForce.get(playerId) === true && !list.some((w) => w.species === STICK_ID)) {
      const forced = placeStick(shift, `legend:${STICK_ID}:force:${playerId}`);
      list = [...list, { ...forced, force: true }];
    }
    if (playerId && this.stickForce.get(playerId) === false) list = list.filter((w) => w.species !== STICK_ID);
    // STEEZE is not unique: each miner can catch their own. Hide him from a miner who already has one,
    // and give each viewer their own wild id so one catch does not retire him for everyone.
    if (playerId && this.barn?.ownerHolds?.(playerId, STEEZE_ID)) list = list.filter((w) => w.species !== STEEZE_ID);
    else if (playerId) list = list.map((w) => isSteeze(w.species) && !w.force ? { ...w, id: `${w.id}:${playerId}` } : w);
    if (playerId && this.steezeForce.get(playerId) === true && !this.barn?.ownerHolds?.(playerId, STEEZE_ID) && !list.some((w) => w.species === STEEZE_ID)) {
      list = [...list, placeSteeze(shift, `steeze:force:${playerId}`)];
    }
    if (playerId && this.steezeForce.get(playerId) === false) list = list.filter((w) => w.species !== STEEZE_ID);
    return list;
  }
  /** Dev/admin screenshot hook: only this miner sees STEEZE. Unlike the stick, he can still be jarred. */
  forceSteeze(playerId, on) {
    if (on === true || on === false) this.steezeForce.set(playerId, on);
    else this.steezeForce.delete(playerId);
    return { force: this.steezeForce.has(playerId) ? this.steezeForce.get(playerId) : null };
  }
  /** Today's stick-insect roll: hard days only, 50%, its own seed. Does not look at a per-player force. */
  stickDayInfo(today = null) {
    const day = today || this.layout(this.now(), SHAFTS[0]);
    const t = tierInfo(day.tier), hard = isHardTier(day.tier), rolled = stickToday(day.day, day.tier);
    const held = !!this.barn?.holds?.(STICK_ID);
    return { hard, rolled, present: rolled && !held, held, stickName: 'Lord Howe Island Stick Insect',
      tierName: t?.name || null, tier: day.tier, day: day.day };
  }
  /** Dev/admin screenshot hook: only this miner sees the insect. It cannot be jarred, and it never writes the shared roster. */
  forceStick(playerId, on) {
    if (on === true || on === false) this.stickForce.set(playerId, on);
    else this.stickForce.delete(playerId);
    return { force: this.stickForce.has(playerId) ? this.stickForce.get(playerId) : null, ...this.stickDayInfo() };
  }
  wildGone(playerId, shiftId, wildId) {
    const cur = this.doc.active[playerId];
    if (cur?.id === shiftId && this.wildsFor(cur).some(({ id }) => id === wildId)) {
      this.commit(playerId, { ...cur, wildsGone: [...(cur.wildsGone || []), wildId] });
    }
  }
  /** v30: pick up the egg lying in this shift's tunnels. Touches nothing about the shift itself (clock, vein, pay). */
  takeEgg(player, shiftId) {
    const cur = this.current(player, shiftId);
    if (cur.settlement) throw new GameError('That shift has already ended.', 409);
    if (!cur.egg || cur.eggTaken || !this.barn) throw new GameError('There is nothing here to pick up.', 409);
    if (this.now() - cur.startedAt > EGG_WINDOW_MS + 3000) throw new GameError('It rolled into a crack. Gone.', 409); // allow a little extra for the network
    const r = this.barn.layEgg(player.id);
    this.commit(player.id, { ...cur, eggTaken: true });
    return r;
  }

  /** Cash out confirmed v2 material; empty and legacy quits keep the Foreman's lecture. */
  quit(player, shiftId, request = {}) {
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion === 2) { this.requireVersion(request); return this.settle(player, cur); }
    this.commit(player.id, null);
    return this.foreman ? this.foreman.scold(player.id, 'quit') : { pending: null };
  }

  finish(player, shiftId, request = {}) {
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    const now = this.now();
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion === 2) {
      this.requireVersion(request);
      if (cur.settlement || cur.collected >= cap(cur) || now - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
      throw new GameError('Fill the bucket or clock out with what you have.', 409);
    }
    const elapsed = now - cur.startedAt;
    if (elapsed > MAX_SHIFT_MS) { delete this.doc.active[player.id]; this.save(); throw new GameError('Your shift timed out. Start a new one.', 410); }
    // Close the shift on disk *before* paying, so a crash can never let the same shift pay twice.
    delete this.doc.active[player.id];
    this.save();
    const r = rollOutcome(this.randInt);
    this.accounts.recordShift(player, { ...r, at: now, ms: elapsed });
    const foreman = r.outcome === 'dud' && this.foreman ? this.foreman.scold(player.id, 'mud').pending : null; // v45: mud is not acid
    return { ...r, bankroll: player.bankroll, ...(foreman ? { foreman } : {}) };
  }

  settle(player, shift) {
    this.holds.delete(player.id);
    this.tickWorms(player, { hold: true });
    this.dropSwarm(player.id);
    let cur = this.doc.active[player.id] || shift;
    if (!cur.settlement) {
      const r = cur.outcome, full = cap(cur);
      // Everything pays by the share of the bucket filled. (`per` only differs for a shift dug when buckets came in sizes.)
      const per = r.amount >= 10000 ? full : CAPACITY;
      // v79: hazard pay on ordinary acid for a rough day (tier 2 up). Mud stays pity money; the rare finds are fixed.
      const hazard = r.outcome === 'normal' && cur.hazard > 1 ? cur.hazard : 1;
      // Better acid (a deeper shaft, a pool far from the lift) counts for more, on ordinary acid only: the same rule as hazard pay.
      // Mud is pity money and a rare find is one find, wherever they turn up.
      const rich = r.outcome === 'normal' && cur.collected > 0 ? worthOf(cur) / cur.collected : 1;
      const result = cur.collected > 0 ? { ...r, shiftId: cur.id, collected: cur.collected / 1000, capacity: full / 1000,
        amount: Math.round(r.amount * hazard * rich * 100 * cur.collected / per) / 100, ...(hazard > 1 ? { hazard } : {}), ...(rich > 1.004 ? { rich: Math.round(rich * 100) / 100 } : {}),
        ...(cur.sucked > 0 ? { sucked: cur.sucked / 1000 } : {}),
        ...(r.outcome === 'dud' && cur.collected < full ? { text: 'Mostly mud. The foreman pays for what you brought and questions your judgment.' } : {}) } : null;
      if (result && cur.twin) { // decided at clock-in, never sent to the browser, met only on the way out
        const took = Math.floor(result.amount * 100 * TWIN_CUT) / 100;
        result.amount = Math.round((result.amount - took) * 100) / 100; result.twin = { took };
      }
      // However a purple shift ends, the bug drank: it goes home sick. The acid already in the bucket is paid as usual.
      // A held bug was not in the tunnels to drink; skip sickness so the hold is not also a health penalty.
      let sick = null; if (cur.purple && !cur.heesheeStolen && !this.barn?.heesheeHoldOf?.(player.id)) try { sick = this.barn?.fallSick?.(player.id) || null; } catch { /* the pay must not wait on the barn */ }
      // A stage two bug that was due leaves with him at the lift, whatever the shift made. Not one the Heeshee has.
      let taken = null; if (cur.collect && !sick && !cur.heesheeStolen && !this.barn?.heesheeHoldOf?.(player.id)) try { taken = this.barn?.collect?.(player.id) || null; } catch { /* the pay must not wait on the barn */ }
      // Return the bug only after a successful acid find (this steal shift, or a later one that still has a leftover hold).
      // Quitting, disconnecting, or settling empty must not hand it back free.
      const leftover = !!this.barn?.heesheeHoldOf?.(player.id);
      const shouldReturn = !!result && !!(cur.heesheeStolen || leftover);
      cur = { ...cur, settlement: { shiftId: cur.id, result, reason: sick || taken ? null : result ? (r.outcome === 'dud' ? 'mud' : null) : 'quit', at: this.now(), ms: this.now() - cur.startedAt, ...(sick ? { sick } : {}), ...(taken ? { taken } : {}), ...(shouldReturn ? { heeshee: true } : {}) } };
      this.commit(player.id, cur);
      if (shouldReturn) {
        try { this.barn?.releaseHeeshee?.(player.id); } catch { /* the receipt still returns it visually */ }
        const next = { ...this.doc, shaken: { ...this.doc.shaken, [player.id]: this.now() + HEESHEE_SHAKEN_MS } };
        this.store.saveDoc('mines', next); this.doc = next;
      } else if (cur.heesheeStolen) {
        try { this.barn?.holdHeeshee?.(player.id, { shiftId: cur.id, at: cur.heesheeStolenAt || this.now() }); } catch { /* already held, or no barn */ }
      }
      try { this.onShiftEnd?.(player.id, cur, cur.settlement); } catch { /* admin stats only */ }
    }
    const receipt = cur.settlement;
    if (receipt.result) this.accounts.recordShift(player, { ...receipt.result, at: receipt.at, ms: receipt.ms });
    if (this.shouldTypingTest(cur, receipt)) this.foreman.scoldTyping(player.id, cur.id);
    else if (receipt.reason) this.foreman?.scold(player.id, receipt.reason, cur.id);
    this.commit(player.id, null, receipt);
    return this.completionView(player, receipt);
  }

  /** The live shift for a player as the browser sees it, settling a full or expired bucket first. */
  stateFor(player) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.rulesVersion !== 2) return null;
    if (cur.settlement || cur.collected >= cap(cur) || this.now() - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
    const live = this.noteHeesheeAppearance(cur, player.id);
    return this.publicShift(live, true, player.id, this.guideBug(player.id));
  }

  /**
   * PvP (server/pvp.js): the loser's shift ends with a receipt that pays nothing and the winner's bucket takes the
   * loser's acid (capped by the winner's space; the rest spills). One mines.json write, recorded under the raid's id
   * so a retry after a crash cannot apply it twice. Money and tobacco are moved by their own owners.
   */
  applyRaid(rec) {
    if (this.doc.raids?.[rec.id]) return this.doc.raids[rec.id];
    if (this.doc.active[rec.loser]) this.tickWorms({ id: rec.loser }, { hold: true });
    if (this.doc.active[rec.winner]) this.tickWorms({ id: rec.winner }, { hold: true });
    this.dropSwarm(rec.loser);
    const next = { ...this.doc, active: { ...this.doc.active }, completed: { ...this.doc.completed }, raids: { ...this.doc.raids } };
    const lost = next.active[rec.loser], won = next.active[rec.winner];
    let taken = 0, gained = 0;
    if (lost && lost.id === rec.loserShift && lost.rulesVersion === 2 && !lost.settlement) {
      taken = lost.collected;
      delete next.active[rec.loser];
      const battle = rec.kind === 'battle';
      next.completed[rec.loser] = { shiftId: lost.id, reason: null, at: rec.at, ms: rec.at - lost.startedAt, pvp: rec.id,
        result: { outcome: battle ? 'defeated' : 'ambushed', shiftId: lost.id, amount: 0, collected: 0, capacity: cap(lost) / 1000,
          title: battle ? 'YOUR BUG LOST' : 'AMBUSHED',
          text: battle ? `${rec.winnerName}'s bug beat yours fair and square. They took your bucket${rec.tobacco?.length ? ' and your smokes' : ''}. Your bug will live. Your pride is on a feeding tube.`
            : `${rec.winnerName} crept up behind you in the dark. You never saw them. Payroll does not cover this.`,
          pvp: { kind: rec.kind, by: rec.winnerName, cash: rec.cash, acid: taken / 1000, tobacco: rec.tobaccoNames || [], ...(rec.bugs?.loser && rec.bugs.loser.fainted !== false ? { fainted: rec.bugs.loserBug || true } : {}) } } };
    }
    if (won && won.id === rec.winnerShift && won.rulesVersion === 2 && !won.settlement) {
      gained = Math.max(0, Math.min(taken, cap(won) - won.collected));
      if (gained) next.active[rec.winner] = { ...won, collected: won.collected + gained, worth: worthOf(won) + worthOf(lost) * gained / taken }; // stolen acid is as rich as it was
    }
    const out = { acid: taken / 1000, gained: gained / 1000, spilled: (taken - gained) / 1000 };
    next.raids[rec.id] = out;
    const ids = Object.keys(next.raids); if (ids.length > 300) for (const id of ids.slice(0, ids.length - 300)) delete next.raids[id];
    this.store.saveDoc('mines', next); this.doc = next;
    this.holds.delete(rec.loser);
    if (lost && next.completed[rec.loser]?.pvp === rec.id) { try { this.onShiftEnd?.(rec.loser, lost, next.completed[rec.loser]); } catch { /* admin stats only */ } }
    return out;
  }

  forget(playerId) {
    const next = { ...this.doc, active: { ...this.doc.active }, completed: { ...this.doc.completed }, nephew: { ...this.doc.nephew } };
    delete next.active[playerId]; delete next.completed[playerId]; delete next.nephew[playerId];
    this.store.saveDoc('mines', next); this.doc = next; this.holds.delete(playerId);
    this.dropSwarm(playerId);
  }

  dropSwarm(playerId) { this.swarms.delete(playerId); }

  /** In-reach of the current pool, same 1.9 m the MINE button uses (pose is in tiles). */
  acidInReach(shift, pose) {
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y) || shift?.rulesVersion !== 2) return false;
    const pool = shift.pools?.[shift.index];
    if (!pool || pool.remaining === 0) return false;
    return Math.hypot((pose.x - pool.x) * WORM_TILE, (pose.y - pool.y) * WORM_TILE) <= WORM_MINE_REACH;
  }

  wormRow(playerId, shift) {
    let row = this.swarms.get(playerId);
    if (!row || row.shiftId !== shift.id) {
      const swarm = new WormSwarm(tierInfo(shift.tier), () => this.wormInt(1_000_000) / 1_000_000);
      const elapsed = Math.max(0, this.now() - shift.startedAt);
      swarm.clock = elapsed; // grace is from clock-in, not from this process's first heartbeat
      row = { shiftId: shift.id, swarm, lastAt: this.now(), frac: 0 };
      this.swarms.set(playerId, row);
    }
    return row;
  }

  /** Fields the browser draws: the live worms and whether they are drinking. */
  wormFields(shift) {
    if (!shift) return {};
    let found = null;
    for (const r of this.swarms.values()) if (r.shiftId === shift.id) { found = r; break; }
    const worms = found ? found.swarm.worms.map((w) => wormPublic(w, found.swarm.clock)) : [];
    const sucking = worms.some((w) => w.sucking) && shift.collected > 0;
    return { worms, sucking, sucked: (shift.sucked || 0) / 1000 };
  }

  /**
   * Advance this miner's worms and drain the bucket they are carrying.
   * `pose` is in tiles (the PvP heartbeat). `slash` is one worm id or a list, applied before the drain.
   * `hold` (or acid in reach, or a bug battle) stops new landings; already-latched worms keep drinking.
   * A late or skipped heartbeat is billed for at most WORM_SUCK_MAX_GAP_MS.
   */
  tickWorms(player, { pose = null, slash = null, hold = false, spawn = false } = {}) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.rulesVersion !== 2 || cur.settlement) { this.dropSwarm(player.id); return { worms: [] }; }
    const now = this.now();
    const row = this.wormRow(player.id, cur);
    const swarm = row.swarm;
    const t0 = swarm.clock;
    const gap = Math.min(WORM_SUCK_MAX_GAP_MS, Math.max(0, now - row.lastAt));
    // Bill first, including a worm you just cut: it was on you for this beat. Then slash, then maybe land a new one.
    const units = suckUnits(swarm.worms, t0, t0 + gap);
    if (slash != null) {
      const ids = Array.isArray(slash) ? slash : [slash];
      for (const id of ids) swarm.slash(Number(id) || 0);
    }
    const maze = shiftMaze(cur);
    const far = farthest(maze);
    const tx = pose && Number.isFinite(pose.x) ? Math.round(pose.x) : null;
    const ty = pose && Number.isFinite(pose.y) ? Math.round(pose.y) : null;
    const out = tx != null && ty != null ? maze.dist[ty]?.[tx] : undefined;
    const scale = out >= 0 ? 2 * out / far : 1;
    const noLand = hold || this.acidInReach(cur, pose) || this.busy(player.id);
    if (gap > 0) swarm.tick(gap, { hold: noLand || spawn, scale });
    if (spawn) swarm.spawn();
    row.lastAt = now;
    row.frac = (row.frac || 0) + units * 1000;
    const take = Math.min(cur.collected, Math.floor(row.frac));
    // Only the sub-thousandth remainder carries to the next beat. A worm that drinks more than the bucket holds (an empty
    // or nearly empty bucket) gets nothing for the rest: it must not run up a tab that eats the next acid you mine.
    row.frac = take < Math.floor(row.frac) ? 0 : row.frac - take;
    let suckedJust = 0;
    if (take > 0) {
      const next = structuredClone(cur);
      next.worth = next.collected > 0 ? worthOf(next) * (next.collected - take) / next.collected : 0;
      next.collected -= take;
      next.sucked = (next.sucked || 0) + take;
      this.commit(player.id, next);
      suckedJust = take;
    }
    const live = this.doc.active[player.id] || cur;
    const worms = swarm.worms.map((w) => wormPublic(w, swarm.clock));
    const sucking = worms.some((w) => w.sucking) && live.collected > 0;
    return { worms, collected: live.collected / 1000, rich: live.collected > 0 ? Math.round(100 * worthOf(live) / live.collected) / 100 : 1,
      sucked: (live.sucked || 0) / 1000, suckedJust: suckedJust / 1000, sucking };
  }

  /** Dev/e2e only (app.js mounts this behind DEV_LOGIN): fill the bucket and/or stick a worm on the visor. */
  debugWorm(player, body = {}) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.rulesVersion !== 2 || cur.settlement) throw new GameError('Clock in first.', 409);
    if (body.fill) {
      const next = structuredClone(cur);
      const add = Math.min(cap(next) - next.collected, Math.round(Number(body.fill) * 1000));
      if (add > 0) { next.collected += add; next.worth += add; this.commit(player.id, next); }
    }
    const pose = body.pose && Number.isFinite(body.pose.x) ? body.pose : { x: 0, y: 0 };
    const drained = this.tickWorms(player, { pose, spawn: !!body.spawn, hold: !!body.hold });
    return { ...this.publicShift(this.doc.active[player.id], true, player.id, this.guideBug(player.id)), ...drained };
  }
}

export const WILD_STRONG = 8; // one wild bug in this many is a strong one
/** A wild bug's level on a day of tier `at` (deeper shafts count as rougher days). Most are low: 1 to 3 on a calm day, 3 to 5 on the
 *  roughest. A strong one is `at` + 3 to 5, so a level past 5 is a lucky find, not the usual. */
export const wildLevel = (at, pick) => Math.min(PAUSED_AT, pick(WILD_STRONG) === 0 ? at + 3 + pick(3) : 1 + Math.floor((at - 1) / 2) + pick(3));
export const WILDS_A_DAY = [5, 8]; // fewest and most in a day, all of them out at once
// A released bug (a stray, Barn.release) is down here about one day in STRAY_DAYS, the same day for every miner, at most
// STRAYS_A_DAY of them at once. It keeps its name and level and says whose it was; jarring it ends it for everyone.
export const STRAY_DAYS = 3, STRAYS_A_DAY = 3;
// A legendary is down the mine on one day in LEGEND_DAYS at its easiest: Shaft 7 on a tier 1 day. Every tier the day is
// rougher and every permit shaft deeper multiplies that by LEGEND_GROWTH, so Earl's Level on a tier 5 day has one
// about one day in seven. One roll decides the day for everybody, so a legendary in an upper shaft is in every deeper
// one too. It is at level LEGEND_LEVEL, and only a species nobody in the Academy holds: jarred, it is gone until its
// holder parts with it.
export const LEGEND_DAYS = 120, LEGEND_GROWTH = 1.5, LEGEND_LEVEL = 10;
// The Lord Howe Island stick insect is not on that shared roll. It only appears on hard mining days — The Badlands
// (tier 4) and Dead Man's Dig (tier 5) — and then only if a 50% roll for that Mountain-time date comes up. The roll
// has its own seed, so it never touches payouts, scares or the other two legendaries. When the day has it, it is in
// every shaft, at level STICK_LEVEL, the same insect for every miner, until someone jars it.
export { STEEZE_ID, STEEZE_LEVEL, STEEZE_DAYS } from './engine/steeze.js';
export const STICK_ID = 'dryococelus', STICK_LEVEL = 30, STICK_DAY_CHANCE = 0.5, HARD_TIERS = [4, 5];
export const isHardTier = (tier) => HARD_TIERS.includes(Number(tier));
export const stickToday = (day, tier = 1) => isHardTier(tier) && rng(daySeed(`legend:stick:${day}`))() < STICK_DAY_CHANCE;
/** One day in STEEZE_DAYS, any tier, its own seed. */
export const steezeToday = (day) => Math.floor(rng(daySeed(`steeze:${day}`))() * STEEZE_DAYS) === 0;
const SHAFT_DEPTH = ['7', '8', '12', 'earl']; // each permit shaft below Shaft 7 holds one more bug than the one above, and a better one
export const depthOf = (shaft) => Math.max(0, SHAFT_DEPTH.indexOf(String(shaft || '7')));
export const legendChance = (tier = 1, depth = 0) => Math.min(1, LEGEND_GROWTH ** (Math.max(1, tier) - 1 + depth) / LEGEND_DAYS);
export const legendToday = (day, tier = 1, depth = 0) => rng(daySeed(`legend:${day}`))() < legendChance(tier, depth);
// How rare a wild bug is, by how rough its day or shaft is (`tier`): commons hold steady, uncommons gain a share every
// tier, and rares start at RARE_TIER and gain one every tier after.
export const wildOdds = (tier) => ({ 1: WILD_ODDS[1], 2: WILD_ODDS[2] + tier - 1, 3: tier >= RARE_TIER ? WILD_ODDS[3] * (tier - RARE_TIER + 1) : 0 });
function dailyWilds(day, shift, strays = [], held = () => false) {
  const maze = shiftMaze(shift), spots = [], pool = (p) => shift.pools.some((q) => q.x === p.x && q.y === p.y);
  const depth = (p) => maze.dist[p.y]?.[p.x] ?? -1;
  for (let y = 0; y < maze.size; y++) for (let x = 0; x < maze.size; x++) {
    if (maze.dist[y][x] >= 6 && !pool({ x, y })) spots.push({ x, y });
  }
  spots.sort((a, b) => depth(a) - depth(b));
  const random = rng(daySeed(`wild:${day}`)), pick = (n) => Math.floor(random() * n);
  const count = Math.min(WILDS_A_DAY[0] + pick(WILDS_A_DAY[1] - WILDS_A_DAY[0] + 1), spots.length), tier = shift.tier || 1;
  // First how rare (WILD_ODDS; a rare only on a day rough enough), then a species of that rarity not yet out today.
  const left = Object.fromEntries([1, 2, 3].map((rarity) => [rarity, ROSTER.filter((bug) => rarityOf(bug.id) === rarity && bug.id !== STEEZE_ID)]));
  const species = (at = tier, roll01 = random, choose = pick) => {
    const odds = wildOdds(at), open = [1, 2, 3].filter((rarity) => left[rarity].length && odds[rarity] > 0);
    let roll = roll01() * open.reduce((sum, rarity) => sum + odds[rarity], 0);
    const rarity = open.find((r) => (roll -= odds[r]) < 0) ?? open.at(-1);
    return left[rarity].splice(choose(left[rarity].length), 1)[0].id;
  };
  // Its level sets how far in it lives: level 1 in the tunnels nearest the lift, level 6 and up in the deepest fifth.
  const spotFor = (level) => {
    const n = spots.length, lo = Math.floor(Math.min(1, (level - 1) / 5) * 0.8 * n), band = Math.min(n - lo, Math.ceil(n / 5));
    return spots.splice(lo + pick(band), 1)[0];
  };
  // it starts on its spot and roams 6 to 12 tiles from there, out of the acid and never more than 3 tiles nearer the lift
  const route = (wild) => ({ ...wild, path: roamRoute(wild, 6 + pick(7), (p) => depth(p) >= Math.max(3, depth(wild) - 3) && !pool(p), pick) });
  const out = Array.from({ length: count }, (_, i) => {
    const level = wildLevel(tier, pick);
    return { id: `${day}:${i + 1}`, species: species(), level };
  }).map((wild) => route({ ...wild, ...spotFor(wild.level) })); // who is out today is rolled before any spot, so every shaft's tunnels hold the same bugs
  // Strays roll from their own seed, so letting one go never reshuffles the day's wild bugs.
  const today = strays.filter((stray) => Math.floor(rng(daySeed(`${stray.id}:${day}`))() * STRAY_DAYS) === 0).slice(0, STRAYS_A_DAY);
  const loose = [];
  for (const stray of today) {
    if (!spots.length) break;
    loose.push(route({ id: stray.id, species: stray.species, level: stray.level, stray: { name: stray.name, owner: stray.owner }, ...spotFor(stray.level) }));
  }
  // The deeper shafts: one more bug for each permit shaft down to this one, rolled as if the day were that many tiers
  // rougher. Each has its own seed, so the bugs every shaft shares are the same whoever looks.
  const deep = [];
  for (let k = 1; k <= depthOf(shift.shaft) && spots.length; k++) {
    const roll = rng(daySeed(`wild:${day}:deep:${k}`)), choose = (n) => Math.floor(roll() * n), at = tier + k;
    const level = wildLevel(at, choose);
    deep.push(route({ id: `${day}:deep${k}`, species: species(at, roll, choose), level, ...spotFor(level) }));
  }
  // Which of the other two legendaries: one of those nobody holds, picked by the day. The stick insect has its own roll.
  const free = ROSTER.filter((bug) => rarityOf(bug.id) === LEGENDARY && bug.id !== STICK_ID && !held(bug.id)), legends = [];
  if (free.length && spots.length && legendToday(day, tier, depthOf(shift.shaft))) {
    const bug = free[Math.floor(rng(daySeed(`legend:which:${day}`))() * free.length)];
    legends.push(route({ id: `legend:${bug.id}:${day}`, species: bug.id, level: LEGEND_LEVEL, ...spotFor(LEGEND_LEVEL) }));
  }
  if (!held(STICK_ID) && stickToday(day, tier)) {
    const at = spots.length ? spotFor(STICK_LEVEL) : { x: 1, y: 1 };
    legends.push(route({ id: `legend:${STICK_ID}:${day}`, species: STICK_ID, level: STICK_LEVEL, ...at }));
  }
  if (steezeToday(day) && spots.length) {
    legends.push(route({ id: `steeze:${day}`, species: STEEZE_ID, level: STEEZE_LEVEL, ...spotFor(STEEZE_LEVEL) }));
  }
  return [...loose, ...out, ...deep, ...legends];
}

/** A per-player forced stick: deepest open tile, its own path, never the day's shared id. */
function placeStick(shift, id) {
  const maze = shiftMaze(shift), spots = [];
  const pool = (p) => (shift.pools || []).some((q) => q.x === p.x && q.y === p.y);
  const depth = (p) => maze.dist[p.y]?.[p.x] ?? -1;
  for (let y = 0; y < maze.size; y++) for (let x = 0; x < maze.size; x++) {
    if (depth({ x, y }) >= 6 && !pool({ x, y })) spots.push({ x, y });
  }
  spots.sort((a, b) => depth(b) - depth(a));
  const start = spots[0] || { x: Math.max(1, (maze.size >> 1)), y: Math.max(1, (maze.size >> 1)) };
  const pick = (n) => Math.floor(rng(daySeed(id))() * n);
  return { id, species: STICK_ID, level: STICK_LEVEL, ...start, path: roamRoute({ ...start }, 8, (p) => depth(p) >= Math.max(3, depth(start) - 3) && !pool(p), pick) };
}

/** Mid-tunnel, feet on the floor, a short roam so he stays findable. */
function placeSteeze(shift, id) {
  const maze = shiftMaze(shift), spots = [];
  const pool = (p) => (shift.pools || []).some((q) => q.x === p.x && q.y === p.y);
  const depth = (p) => maze.dist[p.y]?.[p.x] ?? -1;
  for (let y = 0; y < maze.size; y++) for (let x = 0; x < maze.size; x++) {
    if (depth({ x, y }) >= 4 && !pool({ x, y })) spots.push({ x, y });
  }
  spots.sort((a, b) => depth(a) - depth(b));
  const start = spots[Math.floor(spots.length * 0.35)] || spots[0] || { x: Math.max(1, (maze.size >> 1)), y: Math.max(1, (maze.size >> 1)) };
  const pick = (n) => Math.floor(rng(daySeed(id))() * n);
  return { id, species: STEEZE_ID, level: STEEZE_LEVEL, ...start, path: roamRoute({ ...start }, 6, (p) => depth(p) >= Math.max(3, depth(start) - 3) && !pool(p), pick) };
}

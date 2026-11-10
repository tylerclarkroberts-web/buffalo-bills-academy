// The Acid Mines: the only faucet in the closed economy. The server decides every payout.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';

// INTERNAL: never shown to players (the odds are a secret; there is no API that exposes them).
// Probabilities are out of 100,000 so 0.05% is exact.
export const OUTCOMES = [
  { id: 'motherlode', odds: 50, amount: 10000, title: 'THE MOTHERLODE',
    text: 'Your pick goes through the wall and the whole tunnel glows. Fifty tons of premium acid. Payroll does not believe you. Payroll pays anyway.' },
  { id: 'aliens', odds: 50, amount: 10000, title: 'ALIEN SKELETONS',
    text: 'Three long skulls, one tiny saucer, zero explanation. Two agents in black suits appear behind you, hand you an envelope of cash and say you saw nothing. You saw nothing.' },
  { id: 'diamonds', odds: 50, amount: 10000, title: 'A DIAMOND WELL',
    text: 'An old wishing well at the bottom of a shaft, packed with uncut diamonds and a hand-drawn treasure map. Some kids got here first in the 80s. They left you plenty.' },
  { id: 'dud', odds: 10000, amount: 10, title: 'MOSTLY MUD',
    text: 'It was a puddle. The foreman pays you $10 out of pity and tells you to get back in there.' },
  { id: 'normal', odds: 89850, min: 80, max: 120, title: 'SHIFT COMPLETE',
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
  'The deposit respawns behind you. It always respawns.',
];
const TOTAL = OUTCOMES.reduce((a, o) => a + o.odds, 0); // 100000

/** Expected value per shift, in dollars (documented in DECISIONS.md). */
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

export const MIN_SHIFT_MS = 20000;

// The visitor (internal, not shown to players): about 28% of shifts get one, decided by the server when the shift
// starts, from its own random source. He can't show up before SCARE_AFTER_MS into the shift, and then only when the
// player takes a corner fast (the client's job: client/src/mines/stalker.js). He's harmless: pay and timing ignore him.
export const SCARE_CHANCE = 28000; // out of 100,000
export const SCARE_AFTER_MS = 30000;
export const EGG_WINDOW_MS = 30000; // an egg (when there is one) lies near the start for the first 30 s of the shift
export function rollScare(randInt = (n) => crypto.randomInt(n)) {
  return { scare: randInt(100000) < SCARE_CHANCE };
}
// The vein (internal, not shown to players): how long this shift's acid takes to show up. The server rolls it at
// clock-in from its own random source (never the payout one), keeps it to itself, and won't pay a shift before it.
// Heavy-tailed on purpose: about a quarter of shifts hit acid under 30 s (small maze), most still under 2 minutes,
// a real chunk take 3-5. Documented in DECISIONS.md.
//   25%  lucky vein   uniform 20-30 s (the floor: MIN_SHIFT_MS still applies; cells=7 so the walk fits)
//   42%  quick vein   log-normal, median 55 s, sigma 0.42, clamped to 40-120 s
//   13%  slow vein    uniform 120-180 s
//   20%  deep vein    uniform 180-300 s
// The maze grows with the vein (7, 9 or 11 cells a side) so the walk matches the wait; dry pools on the way are decoys.
export const VEIN_MIX = [
  { id: 'lucky', w: 25, min: 20000, max: 30000 },
  { id: 'quick', w: 42, median: 55000, sigma: 0.42, min: 40000, max: 120000 },
  { id: 'slow', w: 13, min: 120000, max: 180000 },
  { id: 'deep', w: 20, min: 180000, max: 300000 },
];
export const SEEP_MS = 30000; // standing at a dry pool this close to the vein time: "it's seeping in, wait here"
export function rollVein(randInt = (n) => crypto.randomInt(n)) {
  const u = () => (randInt(1_000_000) + 1) / 1_000_001;
  let r = randInt(100), b = VEIN_MIX[VEIN_MIX.length - 1];
  for (const m of VEIN_MIX) { if (r < m.w) { b = m; break; } r -= m.w; }
  let ms;
  if (b.median) {
    const z = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    ms = Math.min(b.max, Math.max(b.min, Math.round(b.median * Math.exp(b.sigma * z))));
  } else ms = b.min + Math.floor(u() * (b.max - b.min));
  const cells = b.id === 'lucky' ? 7 : ms < 75000 ? (randInt(5) === 0 ? 9 : 7) : ms < 150000 ? 9 : 11;
  return { veinMs: ms, cells };
}
const MAX_SHIFT_MS = 30 * 60 * 1000;
const MAX_SHIFTS_PER_HOUR = 120;

export class Mines {
  constructor({ store, accounts, now, randInt, scareInt, veinInt, vein, barn, foreman }) {
    this.foreman = foreman || null; // v45
    this.store = store; this.accounts = accounts; this.now = now; this.randInt = randInt;
    this.barn = barn || null; // v30: eggs (its own random source; see barn.js)
    // Separate random source for scares, so a scare can never influence what a shift pays.
    this.scareInt = scareInt || ((n) => crypto.randomInt(n));
    // ...and another for the vein, so how long a shift takes can never influence what it pays either.
    this.veinInt = veinInt || ((n) => crypto.randomInt(n));
    this.vein = vein || (() => rollVein(this.veinInt)); // tests can pin it
    this.doc = store.loadDoc('mines', { active: {} });
  }
  save() { this.store.saveDoc('mines', this.doc); }

  start(player) {
    const now = this.now();
    const cur = this.doc.active[player.id];
    if (this.foreman?.pending(player.id)) { const e = new GameError('The foreman is waiting on an answer before you clock in again.', 409); e.code = 'foreman'; throw e; }
    if (cur && now - cur.startedAt < MAX_SHIFT_MS) return this.publicShift(cur, true, player.id);
    const recent = (player.mining?.recentStarts || []).filter((t) => now - t < 3600e3);
    if (recent.length >= MAX_SHIFTS_PER_HOUR) throw new GameError('The foreman says you have worked enough shifts this hour. Come back later.', 429);
    const shift = { id: crypto.randomBytes(12).toString('base64url'), seed: crypto.randomInt(2 ** 31), startedAt: now, ...rollScare(this.scareInt), ...this.vein() };
    if (this.barn?.rollEgg(player.id)) shift.egg = true; // rolled last and from the barn's own source: pay, vein and visitor never see it
    this.doc.active[player.id] = shift;
    this.accounts.touchMining(player, { recentStarts: [...recent, now] });
    this.save();
    return this.publicShift(shift, false, player.id);
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
      return { species: pen.species, name: pen.name, speciesName: pen.speciesName || pen.species, style };
    } catch { return null; }
  }
  publicShift(s, resumed, playerId) {
    const bug = playerId != null ? this.guideBug(playerId) : null;
    return { shiftId: s.id, seed: s.seed, startedAt: s.startedAt, minMs: MIN_SHIFT_MS, cells: s.cells || 7, resumed, serverNow: this.now(), scare: s.scare || s.scareAt ? { afterMs: SCARE_AFTER_MS } : null, ...(s.egg && !s.eggTaken ? { egg: true } : {}), ...(bug ? { bug } : {}) }; // (scareAt: shifts started before v19)
  }

  /** Standing at a pool: is the acid there yet? Only ever says yes / seeping / no, never the vein time. */
  probe(player, shiftId) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.id !== shiftId) throw new GameError('That shift is not yours or already ended. Start a new shift.', 409);
    const left = Math.max(MIN_SHIFT_MS, cur.veinMs || 0) - (this.now() - cur.startedAt);
    return { flowing: left <= 0, seeping: left > 0 && left <= SEEP_MS };
  }

  /** v30: pick up the egg lying in this shift's tunnels. Touches nothing about the shift itself (clock, vein, pay). */
  takeEgg(player, shiftId) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.id !== shiftId) throw new GameError('That shift is not yours or already ended.', 409);
    if (!cur.egg || cur.eggTaken || !this.barn) throw new GameError('There is nothing here to pick up.', 409);
    if (this.now() - cur.startedAt > EGG_WINDOW_MS + 3000) throw new GameError('It rolled into a crack. Gone.', 409); // allow a little extra for the network
    const r = this.barn.layEgg(player.id);
    cur.eggTaken = true; this.save();
    return r;
  }

  /** v45: clock out early with no acid. The shift ends unpaid and the foreman wants a word. */
  quit(player, shiftId) {
    const cur = this.doc.active[player.id];
    if (!cur || cur.id !== shiftId) throw new GameError('That shift is not yours or already ended.', 409);
    delete this.doc.active[player.id]; this.save();
    return this.foreman ? this.foreman.scold(player.id, 'quit') : { pending: null };
  }

  finish(player, shiftId) {
    const now = this.now();
    const cur = this.doc.active[player.id];
    if (!cur || cur.id !== shiftId) throw new GameError('That shift is not yours or already ended. Start a new shift.', 409);
    const elapsed = now - cur.startedAt;
    if (elapsed > MAX_SHIFT_MS) { delete this.doc.active[player.id]; this.save(); throw new GameError('Your shift timed out. Start a new one.', 410); }
    if (elapsed < MIN_SHIFT_MS) throw new GameError(`Keep digging: a shift lasts at least ${Math.ceil(MIN_SHIFT_MS / 1000)} seconds.`, 425);
    if (elapsed < (cur.veinMs || 0)) throw new GameError('No acid here yet. Keep digging.', 425);
    // Close the shift on disk *before* paying, so a crash can never let the same shift pay twice.
    delete this.doc.active[player.id];
    this.save();
    const r = rollOutcome(this.randInt);
    this.accounts.recordShift(player, { ...r, at: now, ms: elapsed });
    const foreman = r.outcome === 'dud' && this.foreman ? this.foreman.scold(player.id, 'mud').pending : null; // v45: mud is not acid
    return { ...r, bankroll: player.bankroll, ...(foreman ? { foreman } : {}) };
  }
}

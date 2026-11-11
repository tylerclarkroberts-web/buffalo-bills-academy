// The Acid Mines: the only faucet in the closed economy. The server decides every payout.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { makeMaze, bucketChain, FIRST_POOL_STEPS } from './engine/maze.js';
import { MINE_ITEMS, SHAFTS } from './catalog/mine.js';
import { dayKey } from './fawn.js';

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
// clock-in from its own random source (never the payout one). Legacy shifts wait for it; v2 deposits mature toward it.
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
export const MAX_SHIFT_MS = 30 * 60 * 1000;
/** A cave-in in a permit shaft knocks this share of what is in the bucket onto the floor. */
export const CAVE_IN_SPILL = 0.25;
/** The other faun waits at the elevator of a permit shaft and helps himself to this share of the cheque. */
export const TWIN_CUT = 1 / 3;
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

export function poolQuantity(elapsed, veinMs, roll) {
  const p = Math.max(0, Math.min(1, elapsed / Math.max(MIN_SHIFT_MS, veinMs)));
  // How long the shift has run shifts the odds from dry holes and puddles toward full pools; it never decides the
  // payout. Big finds (80, and the 100-unit gusher: a whole plain bucket from one pool) are possible from the first
  // pool and common late, and puddles are unlikely by then. The weights run about a tenth quicker than the first
  // bucket rules (`npm run sim:mines`): there is more in the store to save up for. The bands are ordered so the lowest
  // roll is always dry and the highest always a 60.
  const early = [7, 66, 19, 4, 1, 1, 2], mature = [1, 6, 22, 28, 8, 10, 25], amounts = [0, 10, 20, 35, 80, 100, 60];
  let remaining = roll / 1000;
  for (let i = 0; i < amounts.length; i++) {
    remaining -= early[i] + (mature[i] - early[i]) * p;
    if (remaining < 0) return amounts[i];
  }
  return 60;
}

export function poolTravelMs(steps, first = false) {
  // Allow diagonal/corner cutting and mining reach; this is a travel floor, not position verification.
  return Math.max(0, Math.floor((steps * 2.2 - (first ? 1.9 : 3.8)) / (3.6 * Math.SQRT2) * 1000));
}

function reloadRequired() {
  const error = new GameError('The mine has changed. Reload before starting or continuing this shift.', 409);
  error.code = 'mine_reload'; return error;
}

export class Mines {
  constructor({ store, accounts, now, randInt, scareInt, veinInt, poolInt, caveInt, twinInt, vein, barn, foreman, owned }) {
    this.owned = owned || (() => ({})); // player id -> General Store items they own (wired to the shop in app.js)
    this.foreman = foreman || null; // v45
    this.store = store; this.accounts = accounts; this.now = now; this.randInt = randInt;
    this.barn = barn || null; // v30: eggs (its own random source; see barn.js)
    // Separate random source for scares, so a scare can never influence what a shift pays.
    this.scareInt = scareInt || ((n) => crypto.randomInt(n));
    // ...and another for the vein, so how long a shift takes can never influence what it pays either.
    this.veinInt = veinInt || ((n) => crypto.randomInt(n));
    this.vein = vein || (() => rollVein(this.veinInt)); // tests can pin it
    this.poolInt = poolInt || ((n) => crypto.randomInt(n));
    this.caveInt = caveInt || ((n) => crypto.randomInt(n)); // cave-ins have their own source too: they never see the payout roll
    this.twinInt = twinInt || ((n) => crypto.randomInt(n)); // ...and so does the other faun
    this.doc = store.loadDoc('mines', { active: {} });
    this.holds = new Map(); // Never resume a held button after a disconnect or restart.
  }
  save() { this.store.saveDoc('mines', this.doc); }
  commit(playerId, shift, completed) {
    const next = { ...this.doc, active: { ...this.doc.active } };
    if (shift) next.active[playerId] = shift; else delete next.active[playerId];
    if (completed) next.completed = { ...this.doc.completed, [playerId]: completed };
    this.store.saveDoc('mines', next); this.doc = next;
  }
  /** What a player's mine gear adds up to: biggest bucket, fastest filler, and the shafts they hold permits for. */
  gear(playerId) {
    const own = this.owned(playerId) || {}; const has = MINE_ITEMS.filter((x) => own[x.id]);
    return { cap: Math.max(BUCKET_CAPACITY, ...has.map((x) => x.cap || 0)), rate: Math.max(1, ...has.map((x) => x.rate || 0)),
      lamp: has.some((x) => x.lamp), rod: has.some((x) => x.rod), nephew: has.some((x) => x.nephew), shafts: SHAFTS.filter((s) => !s.permit || own[s.permit]) };
  }
  /** The shift office: what you would clock in with, and every shaft with whether your permit opens it. */
  office(player) {
    const g = this.gear(player.id);
    return { capacity: g.cap, extractionRate: EXTRACTION_RATE * g.rate, lamp: g.lamp, rod: g.rod, nephew: this.nephew(player.id),
      shafts: SHAFTS.map((s) => ({ id: s.id, name: s.name, fare: s.fare, max: s.max, open: g.shafts.includes(s) })) };
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
    if (!receipt.result) return { pending };
    return { result: { ...receipt.result, bankroll: player.bankroll, ...(receipt.reason === 'mud' && pending ? { foreman: pending } : {}) } };
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
    if (cur && now - cur.startedAt < MAX_SHIFT_MS) { this.holds.delete(player.id); return this.publicShift(cur, true, player.id); }
    this.requireVersion(request);
    const recent = (player.mining?.recentStarts || []).filter((t) => now - t < 3600e3);
    if (recent.length >= MAX_SHIFTS_PER_HOUR) throw new GameError('The foreman says you have worked enough shifts this hour. Come back later.', 429);
    const gear = this.gear(player.id);
    const shaft = request.shaft == null ? SHAFTS[0] : gear.shafts.find((s) => s.id === String(request.shaft));
    if (!shaft) throw new GameError('The elevator operator wants to see a permit for that shaft.', 403);
    if (shaft.fare) this.accounts.requireFunds(player, shaft.fare, `the elevator to ${shaft.name}`);
    const shift = { id: crypto.randomBytes(12).toString('base64url'), seed: crypto.randomInt(2 ** 31), startedAt: now, ...rollScare(this.scareInt), ...this.vein() };
    const maze = makeMaze(shift.seed, shift.cells || 7, FIRST_POOL_STEPS[shift.cells || 7]);
    const chain = bucketChain(maze, shift.seed);
    Object.assign(shift, { rulesVersion: 2, shaft: shaft.id, scale: shaft.scale, capacity: Math.min(gear.cap, shaft.max) * 1000, rate: EXTRACTION_RATE * gear.rate,
      ...(gear.lamp ? { lamp: true } : {}), ...(gear.rod ? { rod: true } : {}),
      ...(shaft.twin && this.twinInt(100) < shaft.twin ? { twin: true } : {}), collected: 0, index: 0, outcome: rollOutcome(this.randInt),
      readyAt: now + Math.max(MIN_SHIFT_MS, poolTravelMs(chain.legs[0], true)),
      pools: chain.map((p, i) => ({ id: `p${i}`, x: p.x, y: p.y, steps: chain.legs[i], roll: this.poolInt(100000), quantity: null, remaining: null,
        ...(shaft.caveIn && this.caveInt(100) < shaft.caveIn ? { cave: true } : {}) })) }); // decided now, sprung on arrival
    if (this.barn?.rollEgg(player.id)) shift.egg = true; // rolled last and from the barn's own source: pay, vein and visitor never see it
    // The fare and the clock-in are one write; it is never refunded (a crash right here costs the fare, not a payout).
    const draft = { ...player, mining: { ...player.mining, recentStarts: [...recent, now] } };
    if (shaft.fare) this.accounts.change(draft, -shaft.fare, 'mine', `Acid Mines: elevator fare, ${shaft.name.toLowerCase()}`, { save: false });
    this.store.commitPlayerDrafts([draft]);
    this.commit(player.id, shift); this.holds.delete(player.id);
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
    return { shiftId: s.id, seed: s.seed, startedAt: s.startedAt, minMs: MIN_SHIFT_MS, cells: s.cells || 7, resumed, serverNow: this.now(), scare: s.scare || s.scareAt ? { afterMs: SCARE_AFTER_MS } : null, ...(s.egg && !s.eggTaken ? { egg: true } : {}), ...(bug ? { bug } : {}),
      ...(s.rulesVersion === 2 ? { rulesVersion: 2, capacity: cap(s) / 1000, extractionRate: rate(s), shaft: s.shaft || '7', lamp: !!s.lamp, rod: !!s.rod, ...(s.spill ? { spill: { poolId: s.spill.poolId, lost: s.spill.lost / 1000 } } : {}), collected: s.collected / 1000, currentPoolId: s.pools[s.index].id, readyAt: s.readyAt,
        pools: s.pools.map(({ id, x, y, quantity, remaining }) => ({ id, x, y, quantity: quantity === null ? null : quantity / 1000, remaining: remaining === null ? null : remaining / 1000 })) } : {}) };
  }

  target(s, poolId) {
    const i = s.pools.findIndex((p) => p.id === poolId);
    if (i < 0 || i > s.index) throw new GameError('Follow the current pool. This one is not ready to mine.', 409);
    return i;
  }
  advance(s, now) {
    if (s.pools[s.index].remaining === 0 && s.index < s.pools.length - 1) {
      s.index++; s.readyAt = now + poolTravelMs(s.pools[s.index].steps);
    }
  }

  /** Resolve a v2 deposit once; legacy probes retain their original availability response. */
  probe(player, shiftId, request = {}) {
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion === 2) {
      this.requireVersion(request);
      if (cur.settlement || cur.collected >= cap(cur) || this.now() - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
      const i = this.target(cur, request.poolId);
      if (i < cur.index || cur.pools[i].quantity !== null || this.now() < cur.readyAt) return this.publicShift(cur, true);
      const next = structuredClone(cur), pool = next.pools[i];
      const scale = 1000 * (cur.scale || 1); // deeper shafts: the same deposits, several times the size
      let quantity = poolQuantity(this.now() - cur.startedAt, cur.veinMs, pool.roll) * scale;
      if (cur.rod) quantity = Math.max(quantity, 20 * scale); // the dowsing rod never walks you to a dry hole or a puddle
      if (pool.cave && next.collected > 0) { // the roof comes down as you arrive; the last pool still tops the bucket up
        const lost = Math.floor(next.collected * CAVE_IN_SPILL);
        next.collected -= lost; next.spill = { poolId: pool.id, lost };
      }
      if (i === next.pools.length - 1) quantity = Math.max(quantity, cap(next) - next.collected);
      pool.quantity = pool.remaining = quantity;
      this.advance(next, this.now()); this.commit(player.id, next);
      return this.publicShift(next, true);
    }
    const left = Math.max(MIN_SHIFT_MS, cur.veinMs || 0) - (this.now() - cur.startedAt);
    return { flowing: left <= 0, seeping: left > 0 && left <= SEEP_MS };
  }

  extract(player, shiftId, request = {}) {
    this.requireVersion(request);
    if (!['start', 'continue', 'stop'].includes(request.action)) throw new GameError('Choose a valid mining action.', 400);
    const completed = this.completed(player, shiftId, request); if (completed) return completed;
    const cur = this.current(player, shiftId);
    if (cur.rulesVersion !== 2) throw reloadRequired();
    const now = this.now();
    if (cur.settlement || cur.collected >= cap(cur) || now - cur.startedAt >= MAX_SHIFT_MS) return this.settle(player, cur);
    const i = this.target(cur, request.poolId);
    if (i < cur.index) return this.publicShift(cur, true);
    if (now < cur.readyAt || cur.pools[i].remaining === null) throw new GameError('Reach and inspect the pool before mining.', 425);
    const hold = this.holds.get(player.id);
    const live = hold?.shiftId === shiftId && hold.poolId === request.poolId && now >= hold.at && now - hold.at <= PULSE_GAP_MS;
    if (request.action === 'start') {
      if (!live) this.holds.set(player.id, { shiftId, poolId: request.poolId, at: now });
      return this.publicShift(cur, true);
    }
    if (!live) {
      this.holds.delete(player.id);
      if (request.action === 'continue') throw new GameError('Mining stopped. Hold Mine again.', 409);
      return this.publicShift(cur, true);
    }
    let next = cur;
    if (now > hold.at) {
      next = structuredClone(cur);
      const amount = Math.min((now - hold.at) * rate(next), next.pools[i].remaining, cap(next) - next.collected);
      next.collected += amount; next.pools[i].remaining -= amount;
      this.advance(next, now); this.commit(player.id, next);
    }
    if (request.action === 'stop' || next.index !== i || next.collected >= cap(next)) this.holds.delete(player.id);
    else this.holds.set(player.id, { shiftId, poolId: request.poolId, at: now });
    if (next.collected >= cap(next)) return this.settle(player, next);
    return this.publicShift(next, true);
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

  settle(player, shift) {
    this.holds.delete(player.id);
    let cur = shift;
    if (!cur.settlement) {
      const r = cur.outcome, full = cap(cur);
      // Acid and mud pay by the unit, so a bigger bucket is a bigger cheque. The rare finds are one find however big
      // the bucket: a full bucket of any size pays the same $10,000, and a partial one its fraction.
      const per = r.amount >= 10000 ? full : CAPACITY;
      const result = cur.collected > 0 ? { ...r, shiftId: cur.id, collected: cur.collected / 1000, capacity: full / 1000,
        amount: Math.round(r.amount * 100 * cur.collected / per) / 100,
        ...(r.outcome === 'dud' && cur.collected < full ? { text: 'Mostly mud. The foreman pays for what you brought and questions your judgment.' } : {}) } : null;
      if (result && cur.twin) { // decided at clock-in, never sent to the browser, met only on the way out
        const took = Math.floor(result.amount * 100 * TWIN_CUT) / 100;
        result.amount = Math.round((result.amount - took) * 100) / 100; result.twin = { took };
      }
      cur = { ...cur, settlement: { shiftId: cur.id, result, reason: result ? (r.outcome === 'dud' ? 'mud' : null) : 'quit', at: this.now(), ms: this.now() - cur.startedAt } };
      this.commit(player.id, cur);
    }
    const receipt = cur.settlement;
    if (receipt.result) this.accounts.recordShift(player, { ...receipt.result, at: receipt.at, ms: receipt.ms });
    if (receipt.reason) this.foreman?.scold(player.id, receipt.reason, cur.id);
    this.commit(player.id, null, receipt);
    return this.completionView(player, receipt);
  }

  forget(playerId) {
    const next = { ...this.doc, active: { ...this.doc.active }, completed: { ...this.doc.completed }, nephew: { ...this.doc.nephew } };
    delete next.active[playerId]; delete next.completed[playerId]; delete next.nephew[playerId];
    this.store.saveDoc('mines', next); this.doc = next; this.holds.delete(playerId);
  }
}

// The General Store (v34): spend play money (never real money) on cosmetics, gags, oddities and bug supplies.
// Server-authoritative: the catalog, prices, ownership, equip slots and every effect live here. Purchases go
// through Accounts.change without `force`, so a balance can never go below zero; no refunds, no selling, no trading.
// One-of-a-kind items (`unique`) have a single owner recorded in `doc.unique`; buy() checks and writes it in one
// synchronous step, so two buyers can never both get the Moon.
// Gags (v36, formerly pranks) are one-time-use cartoon table effects with rate limits, a per-player opt-out and a
// per-table host switch. Avatar items can be re-fitted per player (nudge + size), stored here and drawn everywhere.
import { GameError } from './engine/game.js';
import { CATALOG, ITEM, TABS, AVATAR_SLOTS, BUG_SLOTS, GAG_RENAME, TOBACCO_NOTICE } from './catalog/index.js';
import { GEAR_CAP } from './engine/bout.js';
import { BOOST_XP } from './barn.js';

export const CONFIRM_OVER = 1000;          // purchases above this need { confirm: true }
export const MAX_STACK = 20;               // consumables you can hold of one kind
const MIN = 60e3, DAY = 86400e3;
export const USE_COOLDOWN_MS = { food: 15 * MIN, clean: 30 * MIN, mood: 30 * MIN, feeder: 0 };
export const FEEDER_MAX_AHEAD_MS = 60 * DAY;
export const GAG = { senderGapMs: 15e3, pairGapMs: 45e3, targetPerMin: 4, showMs: 6000 };
/** v37 tobacco moments: one per table per minute; extra ones queue (up to 5 ahead); kept 24h so a first-time
 *  viewer still sees each one once. showMs is how long the cartoon plays. */
export const SMOKE = { gapMs: 60e3, keepMs: 24 * 3600e3, maxAhead: 5, showMs: 9000 };
/** v52 spectacles: one per table per minute (no queue: a refused one is kept), and how long the overlay plays. */
export const SHOW = { gapMs: 60e3, showMs: 6000 };
export const FIT = { min: 0.4, max: 2.5, move: 24 };   // fit editor: size 40%..250%, nudge +-24 head units
const FIT_SLOTS = ['hat', 'eyes', 'face', 'neck', 'body', 'acc']; // not 'skin' (a shirt colour has nothing to place)
const CONSUMABLE = (x) => !!x.use;
/** One-time-use items (gags, tobacco): you can hold at most one of each, and using it uses it up. */
export const ONCE = (x) => !!x?.once;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** What a client needs to draw an equipped item (no catalog on the client): avatar look, bug palette or bug overlay. */
export function lookOf(id) {
  const x = ITEM[id]; if (!x) return null;
  if (x.look) return { id, ...x.look };
  if (x.pal) return { id, pal: x.pal };
  if (x.shape) return { id, shape: x.shape };
  return { id };
}

export class Shop {
  constructor({ store, accounts, barn, now }) {
    this.store = store; this.accounts = accounts; this.barn = barn; this.now = now;
    this.doc = store.loadDoc('shop', { inv: {}, tablesOff: {}, smokes: {}, smokeOff: {} });
    this.doc.inv ||= {}; this.doc.unique ||= {}; this.doc.tablesOff ||= {}; this.doc.smokes ||= {}; this.doc.smokeOff ||= {};
    this.migrate();
    this.gags = new Map(); // table code -> recent gag events (memory only; they're gone in seconds anyway)
    this.gagLog = new Map();
    this.showAt = new Map(); // table code -> when its last spectacle played (memory only, like the gag rate limits)
  }
  /** v36: pranks became one-time-use gags. Old prank ids are renamed (rubber chicken -> spaghetti noodle) and
   *  capped at one of each; the old opt-out carries over. Also repairs faun cigarettes stored under the bare id
   *  'filtered' (unusable) as 'tob-filtered'. Idempotent; runs on every boot. */
  migrate() {
    let dirty = false;
    for (const [pid, iv] of Object.entries(this.doc.inv)) {
      iv.own ||= {}; iv.eq ||= {}; iv.used ||= {}; iv.fit ||= {};
      for (const [old, id] of Object.entries({ ...GAG_RENAME, filtered: 'tob-filtered' })) if (iv.own[old]) { iv.own[id] = Math.max(iv.own[id] || 0, iv.own[old]); delete iv.own[old]; dirty = true; }
      for (const id of Object.keys(iv.own)) if (ONCE(ITEM[id]) && iv.own[id] > 1) { iv.own[id] = 1; dirty = true; }
      // anything bought before it became one of a kind: the first owner on file is the owner
      for (const id of Object.keys(iv.own)) if (ITEM[id]?.unique && !this.doc.unique[id]) { this.doc.unique[id] = pid; dirty = true; }
      if ('noPranks' in iv) { iv.noGags = !!iv.noPranks; delete iv.noPranks; dirty = true; }
    }
    if (dirty) this.save();
  }
  save() { this.store.saveDoc('shop', this.doc); }
  inv(pid) { const iv = (this.doc.inv[pid] ||= { own: {}, eq: {}, used: {}, fit: {}, noGags: false }); iv.fit ||= {}; return iv; }
  hatched(pid) { return this.barn.view(pid).pen?.stage === 'creature'; }

  /** What the store page needs. Bug tabs and items only once your egg has hatched. */
  view(p) {
    const iv = this.inv(p.id); const hatched = this.hatched(p.id);
    const tabs = TABS.filter((t) => hatched || !t.bug);
    const items = CATALOG.filter((x) => hatched || x.kind !== 'bug');
    this.accounts.ensure(p);
    // who holds each one-of-a-kind item (a name only; hidden and departed owners stay anonymous)
    const taken = Object.fromEntries(Object.entries(this.doc.unique).map(([id, pid]) => { const o = this.store.players?.[pid]; return [id, o && !o.hidden ? o.name : 'somebody']; }));
    return { tabs, items, taken, own: iv.own, eq: iv.eq, hatched, bankroll: p.bankroll, noGags: !!iv.noGags, noSmoke: !!iv.noSmoke, tobaccoNotice: TOBACCO_NOTICE, confirmOver: CONFIRM_OVER, serverNow: this.now(), used: iv.used, fit: iv.fit, fitLimits: FIT };
  }
  buy(p, id, { confirm = false } = {}) {
    const x = ITEM[id];
    if (!x) throw new GameError('The shopkeeper has never heard of that.', 404);
    const iv = this.inv(p.id);
    if (x.kind === 'bug' && !this.hatched(p.id)) throw new GameError('Bug supplies are for folks with a hatched bug.', 409);
    if (ONCE(x)) { if (iv.own[id]) throw new GameError('One at a time: use the one you have first.', 409); }
    else if (CONSUMABLE(x)) { if ((iv.own[id] || 0) >= MAX_STACK) throw new GameError(`You can only hold ${MAX_STACK} of those.`, 409); }
    else if (iv.own[id]) throw new GameError('You already own that.', 409);
    if (x.unique && this.doc.unique[id]) throw new GameError('There was only ever the one, and it is spoken for.', 409);
    if (x.price > CONFIRM_OVER && confirm !== true) throw new GameError(`That costs $${x.price.toLocaleString('en-US')}. Please confirm.`, 428);
    this.accounts.requireFunds(p, x.price, x.name);
    this.accounts.change(p, -x.price, 'shop', `General Store: ${x.name}`); // never forced: can't go below zero
    iv.own[id] = (iv.own[id] || 0) + 1;
    if (x.unique) this.doc.unique[id] = p.id;
    if (x.slot && !iv.eq[x.slot]) iv.eq[x.slot] = id; // first one in a slot goes straight on
    this.save();
    return this.view(p);
  }
  equip(p, { id, slot }) {
    const iv = this.inv(p.id);
    if (id == null) { // take off
      if (![...AVATAR_SLOTS, ...BUG_SLOTS].includes(slot)) throw new GameError('No such slot.', 400);
      delete iv.eq[slot]; this.save(); return this.view(p);
    }
    const x = ITEM[id];
    if (!x || !iv.own[id]) throw new GameError('You don\'t own that.', 404);
    if (!x.slot) throw new GameError('That isn\'t something you wear.', 400);
    if (BUG_SLOTS.includes(x.slot) && !this.hatched(p.id)) throw new GameError('You need a hatched bug for that.', 409);
    iv.eq[x.slot] = id; this.save();
    return this.view(p);
  }
  /** Use a consumable on your bug: food (a real feed), feeder (pauses the starvation clock), mister, heat lamp. */
  use(p, id) {
    const x = ITEM[id]; const iv = this.inv(p.id);
    if (!x || !CONSUMABLE(x)) throw new GameError('That can\'t be used.', 400);
    if (!iv.own[id]) throw new GameError('You don\'t have any of those.', 404);
    if (!this.hatched(p.id)) throw new GameError('You need a hatched bug for that.', 409);
    const now = this.now(); const cd = USE_COOLDOWN_MS[x.use] || 0;
    if (cd && now - (iv.used[x.use] || 0) < cd) throw new GameError('Your bug needs a little while before the next one.', 429);
    // `days` (the feeder, and Golden Ambrosia) keeps the bowl full that long; checked before anything is spent
    if (x.days && Math.max(now, this.barn.view(p.id).pen.feederUntil || 0) + x.days * DAY - now > FEEDER_MAX_AHEAD_MS) throw new GameError('The feeder is already stocked for the next two months.', 409);
    if (x.use !== 'feeder') this.barn.boost(p.id, x.use === 'food' ? { stat: 'hunger', gain: x.food, fed: true } : { stat: x.use === 'clean' ? 'clean' : 'mood', gain: 40, xp: BOOST_XP });
    if (x.days) this.barn.addFeeder(p.id, x.days * DAY);
    iv.own[id] -= 1; if (!iv.own[id]) delete iv.own[id];
    iv.used[x.use] = now; this.save();
    return this.view(p);
  }
  setNoGags(p, on) { this.inv(p.id).noGags = !!on; this.save(); return this.view(p); }
  /** v37: don't show me tobacco moments at tables (default: shown). */
  setNoSmoke(p, on) { this.inv(p.id).noSmoke = !!on; this.save(); return this.view(p); }
  /** Fit editor: nudge (x, y in head/body units) and size (40%..250%) of one avatar item you own; reset clears it. */
  setFit(p, { id, x, y, s, reset }) {
    const it = ITEM[id]; const iv = this.inv(p.id);
    if (!it || !iv.own[id]) throw new GameError('You don\'t own that.', 404);
    if (!FIT_SLOTS.includes(it.slot)) throw new GameError('That item has nothing to adjust.', 400);
    if (reset) delete iv.fit[id];
    else {
      const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      const f = { x: Math.round(clamp(n(x, 0), -FIT.move, FIT.move) * 2) / 2, y: Math.round(clamp(n(y, 0), -FIT.move, FIT.move) * 2) / 2, s: Math.round(clamp(n(s, 1), FIT.min, FIT.max) * 100) / 100 };
      if (!f.x && !f.y && f.s === 1) delete iv.fit[id]; else iv.fit[id] = f;
    }
    this.save(); return this.view(p);
  }

  /** For avatars everywhere: the ids worn in each avatar slot (only things you still own). */
  wearOf(pid) {
    const iv = this.doc.inv[pid]; if (!iv) return null;
    const w = {}; for (const s of AVATAR_SLOTS) if (iv.eq[s] && iv.own[iv.eq[s]]) { w[s] = lookOf(iv.eq[s]); const f = iv.fit?.[iv.eq[s]]; if (f) w[s].fit = f; }
    return Object.keys(w).length ? w : null;
  }
  /** For the barn: the bug's equipped looks and bonuses, capped. */
  bugStyle(pid) {
    const iv = this.doc.inv[pid]; if (!iv) return {};
    const out = {}; for (const s of BUG_SLOTS) if (iv.eq[s] && iv.own[iv.eq[s]]) out[s] = iv.eq[s];
    for (const s of ['bugskin', 'bughat', 'bugacc']) if (out[s]) out[s] = lookOf(out[s]);
    out.gearBonus = Math.min(GEAR_CAP, ITEM[out.gear]?.gear || 0);
    out.toyMood = Math.min(20, ITEM[out.toy]?.mood || 0);
    return out;
  }
  /** A deleted account's one-of-a-kind items go back on the shelf. */
  forget(pid) { delete this.doc.inv[pid]; for (const [id, owner] of Object.entries(this.doc.unique)) if (owner === pid) delete this.doc.unique[id]; this.save(); }

  // ----- gags (one-time use) -----
  tableInfo(code, viewerId) {
    const now = this.now();
    const list = (this.gags.get(code) || []).filter((e) => now - e.at < GAG.showMs);
    this.gags.set(code, list);
    const iv = this.doc.inv[viewerId];
    const mine = (kind, f) => (viewerId ? CATALOG.filter((x) => x.kind === kind && iv?.own[x.id]).map(f) : []);
    return {
      gagsOff: !!this.doc.tablesOff[code], gags: list, myGags: mine('gag', (x) => ({ id: x.id, name: x.name, emoji: x.emoji, pix: x.pix })), noGags: !!iv?.noGags,
      myShows: mine('spectacle', (x) => ({ id: x.id, name: x.name, emoji: x.emoji, fx: x.fx, price: x.price })),
      smokeOff: !!this.doc.smokeOff[code], smokes: this.smokesAt(code), mySmokes: mine('tobacco', (x) => ({ id: x.id, name: x.name, emoji: x.emoji, art: x.art })), noSmoke: !!iv?.noSmoke, smokeGapMs: SMOKE.gapMs,
    };
  }
  /** Tobacco moments at a table from the last 24h (older ones are dropped). Each has `at`, when it plays. */
  smokesAt(code) {
    const now = this.now(); const all = this.doc.smokes[code] || [];
    const keep = all.filter((e) => now - e.at < SMOKE.keepMs);
    if (keep.length !== all.length) { if (keep.length) this.doc.smokes[code] = keep; else delete this.doc.smokes[code]; this.save(); }
    return keep;
  }
  setSmokeOff(t, p, off) {
    if (t.hostId !== p.id) throw new GameError('Only the host can change that.', 403);
    if (off) this.doc.smokeOff[t.code] = true; else delete this.doc.smokeOff[t.code];
    this.save();
  }
  /** Light up a tobacco item at a table you're seated at: it is used up, and everyone watching the table sees the
   *  moment once. One per table per minute; if one is already playing, it waits its turn (queued, up to 5 ahead).
   *  Every check runs first, so a refused one (host switch, not seated, queue full) is kept. Touches nothing else. */
  smoke(t, p, { item }) {
    const x = ITEM[item];
    if (!x || x.kind !== 'tobacco') throw new GameError('That isn\'t from the Smoke Shop.', 400);
    const iv = this.doc.inv[p.id];
    if (!iv?.own[item]) throw new GameError('Buy one at the Smoke Shop in the General Store first. It\'s one-time use.', 403);
    if (this.doc.smokeOff[t.code]) throw new GameError('The host has turned the Smoke Shop off at this table.', 403);
    if (!t.seats.some((s) => s && s.playerId === p.id)) throw new GameError('Take a seat first.', 403);
    if (t.status === 'closed') throw new GameError('This table is closed.', 409);
    const now = this.now(); const list = this.smokesAt(t.code);
    const lastAt = list.reduce((m, e) => Math.max(m, e.at), -Infinity);
    const at = Math.max(now, lastAt + SMOKE.gapMs);
    if (list.filter((e) => e.at + SMOKE.showMs > now).length >= SMOKE.maxAhead) throw new GameError('Guntrad\'s lighter is booked up. Try again in a few minutes.', 429);
    delete iv.own[item]; // one-time use
    const ev = { id: `s${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, at, made: now, from: p.id, fromName: p.name, item: x.id, name: x.name, art: x.art, emoji: x.emoji };
    this.doc.smokes[t.code] = [...list, ev].slice(-40);
    this.save();
    return ev;
  }
  /** v52: put on a spectacle at a table you're seated at. It is used up and everyone at the table sees it once.
   *  It follows the gag switches: the host's per-table switch, and it is hidden (not refused) for players who opted
   *  out. One per table per minute. Every check runs first, so a refused one is kept. Touches nothing else. */
  spectacle(t, p, { item }) {
    const x = ITEM[item];
    if (!x || x.kind !== 'spectacle') throw new GameError('That isn\'t a spectacle.', 400);
    const iv = this.doc.inv[p.id];
    if (!iv?.own[item]) throw new GameError('Buy one in the Spectacles department of the General Store first. It\'s one-time use.', 403);
    if (this.doc.tablesOff[t.code]) throw new GameError('The host has turned gags and spectacles off at this table.', 403);
    if (!t.seats.some((s) => s && s.playerId === p.id)) throw new GameError('Take a seat first.', 403);
    if (t.status === 'closed') throw new GameError('This table is closed.', 409);
    const now = this.now(); const last = this.showAt.get(t.code) || -Infinity;
    if (now - last < SHOW.gapMs) throw new GameError(`One spectacle at a time. The crew needs ${Math.ceil((SHOW.gapMs - (now - last)) / 1000)} more seconds to sweep up.`, 429);
    this.showAt.set(t.code, now);
    delete iv.own[item]; this.save(); // one-time use
    return { id: `v${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, at: now, from: p.id, fromName: p.name, item: x.id, name: x.name, emoji: x.emoji, fx: x.fx, line: x.line };
  }
  setTableOff(t, p, off) {
    if (t.hostId !== p.id) throw new GameError('Only the host can change that.', 403);
    if (off) this.doc.tablesOff[t.code] = true; else delete this.doc.tablesOff[t.code];
    this.save();
  }
  /** Fire a gag at a seated player: it is used up. Returns the event to broadcast. Touches nothing at the table.
   *  Every check runs before the item is spent, so a refused gag (rate limit, opt-out, host switch) is kept. */
  gag(t, p, { item, target }) {
    const x = ITEM[item];
    if (!x || x.kind !== 'gag') throw new GameError('That isn\'t a gag.', 400);
    const iv = this.doc.inv[p.id];
    if (!iv?.own[item]) throw new GameError('Buy one at the General Store first. Gags are one-time use.', 403);
    if (this.doc.tablesOff[t.code]) throw new GameError('The host has turned gags off at this table.', 403);
    const seated = (id) => t.seats.some((s) => s && s.playerId === id);
    if (!seated(p.id)) throw new GameError('Take a seat first.', 403);
    if (!seated(target) || target === p.id) throw new GameError('Pick someone else at the table.', 400);
    if (this.doc.inv[target]?.noGags) throw new GameError('They\'ve opted out of gags.', 403);
    const now = this.now(); const key = (a) => (this.gagLog.get(a) || []).filter((e) => now - e.at < 60e3);
    const mine = key(p.id);
    if (mine.length && now - mine[mine.length - 1].at < GAG.senderGapMs) throw new GameError('Reloading… give it a few seconds.', 429);
    if (mine.some((e) => e.to === target && now - e.at < GAG.pairGapMs)) throw new GameError('Give them a moment to dry off.', 429);
    const theirs = [...this.gagLog.values()].flat().filter((e) => e.to === target && now - e.at < 60e3);
    if (theirs.length >= GAG.targetPerMin) throw new GameError('They\'ve been gagged plenty this minute.', 429);
    this.gagLog.set(p.id, [...mine, { at: now, to: target }]);
    delete iv.own[item]; this.save(); // one-time use
    const ev = { id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, at: now, from: p.id, fromName: p.name, to: target, effect: x.effect, item: x.id, emoji: x.emoji, pix: x.pix };
    const list = (this.gags.get(t.code) || []).filter((e) => now - e.at < GAG.showMs);
    list.push(ev); this.gags.set(t.code, list.slice(-12));
    return ev;
  }
}

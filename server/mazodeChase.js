// Chasing the Heeshee Mazode after it takes your bug (engine/mazode-chase.js has the geometry and the numbers).
// Everything that counts happens here: the route it runs, where it is at any moment, whether you kept up, whether your
// pick landed, which riddles it asks, whether you got them right and in time, and handing the bug back. The answers
// never leave this file before you have answered. The chase lives on the shift (mines.json), so a refresh or a second
// tab sees the same chase; a refresh puts you back at the lift, which in practice means it got away.
// No money, no ledger lines: the only thing at stake is the bug, and the barn's own hold (server/barn.js) is what keeps it.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { shiftMaze } from './engine/mine-tiers.js';
import { CHASE_SPEED, SLOW_AFTER_MS, CHASE_MAX_MS, LOSE_TILES, LOSE_MS, LEFT_MS, HIT_REACH, HIT_TILES, HIT_GAP_MS, POSE_FRESH_MS,
  LAUGH_MS, BEAT_MS, RIDDLE_MS, ANSWER_GRACE_MS, FLEE_LAUGH_MS, FLEE_MS, chaseRoute, chaseDistance, mazodeAt, tunnelGap } from './engine/mazode-chase.js';
import { RIDDLES, TIERS, RIDDLE_BY_ID } from './engine/mazode-riddles.js';

const RECENT = 15; // riddles per tier a player won't see again for a while (each pool has 25+)

export const CAUGHT_LINES = [
  'Heeheehee. A pickaxe. How sweet. Only the Foreman is strong enough to take me in a wrestle.',
  'Oh, it wants to FIGHT. Heeheeheehee. Only the Foreman can take me in a wrestle, and he has to stretch first.',
  'Hee. Hee. Hee. You tickle, little miner. Only the Foreman is strong enough to wrestle me.',
  'You? Hit ME? Heeheehee. Only the Foreman is strong enough to take me in a wrestle. You are not the Foreman.',
  'That was adorable. Heehee. Do it again. No. Only the Foreman is strong enough to take me in a wrestle.',
];
export const OFFER_LINE = 'But I like games. Answer three riddles and the bug goes home.';
export const RIGHT_LINES = ['Hm. Lucky.', 'Fine. A harder one.', 'Who told you that?'];
export const LAST_LINE = 'Last one. I have been saving it.';
export const WRONG_LINE = 'HEEHEEHEEHEE. Wrong. The bug is MINE.';
export const SLOW_LINE = 'Too slow. Heeheehee. The bug is MINE.';
export const FREED_LINE = '...Fine. Take your bug. It bites, you know.';
export const GONE_LINES = { lost: 'IT GOT AWAY. YOUR BUG WENT WITH IT.', left: 'IT GOT AWAY. YOUR BUG WENT WITH IT.', bored: 'IT GOT BORED OF YOU AND VANISHED. YOUR BUG WENT WITH IT.' };

const hash32 = (s) => crypto.createHash('sha256').update(s).digest().readUInt32BE(0);

export class MazodeChase {
  constructor({ store, mines, now = () => Date.now(), randInt = (n) => crypto.randomInt(n) }) {
    this.store = store; this.mines = mines; this.now = now; this.randInt = randInt;
    this.doc = store.loadDoc('mazode', { seen: {} }); this.doc.seen ||= {};
    this.pose = null;          // (playerId, shiftId) -> { x, y, at } in tiles from the PvP heartbeat (wired in app.js)
    this.live = new Map();     // playerId -> { seenAt, lostSince, swingAt }: heartbeat bookkeeping, never written to disk
    this.routes = new Map();   // shiftId -> route (fixed by the seed: rebuilt the same after a restart)
  }
  save() { this.store.saveDoc('mazode', this.doc); }
  grid(shift) { return shiftMaze(shift).grid; }
  route(shift) {
    const c = shift.chase; if (!c) return null;
    const key = `${shift.id}:${c.seed}`;
    if (!this.routes.has(key)) { if (this.routes.size > 64) this.routes.clear(); this.routes.set(key, chaseRoute(this.grid(shift), c.start, c.seed)); }
    return this.routes.get(key);
  }

  /** The steal just happened: it bolts from where the server last had you. Null if the server has no fix on you. */
  begin(playerId, shift) {
    const at = this.pose?.(playerId, shift.id); if (!at) return null;
    const now = this.now(), start = { x: Math.round(at.x), y: Math.round(at.y) };
    if (this.grid(shift)[start.y]?.[start.x] !== 0) return null;
    this.live.set(playerId, { seenAt: now, lostSince: null, swingAt: 0 });
    return { phase: 'chase', startedAt: now, speed: CHASE_SPEED, seed: hash32(`${shift.id}:${now}:mazode`), start };
  }

  /** Move a chase on to wherever the clock says it is now. Pure apart from the heartbeat memory; returns the new row. */
  advance(playerId, c, now = this.now()) {
    if (!c) return c;
    if (c.phase === 'chase') {
      const live = this.live.get(playerId) || { seenAt: c.startedAt, lostSince: null };
      const ends = [[c.startedAt + CHASE_MAX_MS, 'bored'], [live.seenAt + LEFT_MS, 'left'], ...(live.lostSince != null ? [[live.lostSince + LOSE_MS, 'lost']] : [])]
        .filter(([t]) => now >= t).sort((a, b) => a[0] - b[0]);
      if (ends.length) return { ...c, phase: 'gone', reason: ends[0][1], endedAt: ends[0][0] };
    }
    if (c.phase === 'caught' && now > c.deadline + ANSWER_GRACE_MS) {
      return { ...c, phase: 'flee', reason: 'timeout', answers: [...(c.answers || []), { n: c.idx, ok: false, timeout: true }], fleeAt: c.deadline + FLEE_LAUGH_MS };
    }
    if (c.phase === 'flee' && now >= c.fleeAt + FLEE_MS) return { ...c, phase: 'gone', endedAt: c.fleeAt + FLEE_MS };
    return c;
  }
  /** The live shift with its chase brought up to date (and saved if anything changed), or null. */
  current(playerId, shiftId) {
    const shift = this.mines.doc.active?.[playerId];
    if (!shift?.chase || (shiftId != null && shift.id !== String(shiftId)) || shift.settlement) return null;
    const c = this.advance(playerId, shift.chase);
    if (c === shift.chase) return shift;
    const next = { ...shift, chase: c }; this.mines.commit(playerId, next); return next;
  }

  /** The page's copy. The riddle comes with its question and options in display order, never which one is right. */
  view(shift, playerId, { route = false } = {}) {
    const c = shift?.chase; if (!c) return null;
    const now = this.now(), r = c.riddles?.[c.idx], riddle = c.phase === 'caught' && r ? RIDDLE_BY_ID[r.id] : null;
    const last = c.answers?.[c.answers.length - 1];
    const lost = c.phase === 'chase' && this.live.get(playerId)?.lostSince != null ? now - this.live.get(playerId).lostSince : 0;
    return {
      phase: c.phase, startedAt: c.startedAt, speed: c.speed, slowAt: c.startedAt + SLOW_AFTER_MS, endsAt: c.startedAt + CHASE_MAX_MS, serverNow: now,
      ...(c.caughtAt ? { caughtAt: c.caughtAt, caughtDist: c.caughtDist, laugh: CAUGHT_LINES[c.laugh || 0], offer: OFFER_LINE } : {}),
      ...(c.fleeAt ? { fleeAt: c.fleeAt, fleeUntil: c.fleeAt + FLEE_MS } : {}),
      ...(c.reason ? { reason: c.reason } : {}), ...(c.endedAt ? { endedAt: c.endedAt } : {}),
      ...(lost ? { lostMs: lost, loseMs: LOSE_MS } : {}),
      ...(riddle ? { riddle: { n: c.idx, of: TIERS.length, tier: riddle.tier, q: riddle.q, options: r.order.map((i) => riddle.options[i]), askedAt: c.askedAt, deadline: c.deadline,
        ...(c.idx > 0 ? { intro: c.idx === TIERS.length - 1 ? LAST_LINE : RIGHT_LINES[(c.laugh || 0) % RIGHT_LINES.length] } : {}) } } : {}),
      ...(last ? { last: { n: last.n, ok: last.ok, ...(last.timeout ? { timeout: true } : {}), answer: RIDDLE_BY_ID[c.riddles[last.n].id].options[0] } } : {}),
      say: c.phase === 'freed' ? FREED_LINE : c.phase === 'flee' || (c.phase === 'gone' && c.reason === 'timeout') ? (c.reason === 'timeout' ? SLOW_LINE : WRONG_LINE) : c.phase === 'gone' && c.reason !== 'wrong' ? GONE_LINES[c.reason] || null : null,
      ...(route ? { route: this.route(shift) } : {}),
    };
  }

  /** The heartbeat (server/pvp.js tick): did you keep up? Returns the chase view while there is one. */
  tick(player, pose) {
    let shift = this.current(player.id); if (!shift) return null;
    if (shift.chase.phase === 'chase' && pose) {
      const now = this.now(), live = this.live.get(player.id) || { seenAt: shift.chase.startedAt, lostSince: null, swingAt: 0 };
      const at = mazodeAt(shift.chase, this.route(shift), pose.at ?? now);
      const gap = tunnelGap(this.grid(shift), pose, at);
      live.seenAt = now; live.lostSince = gap > LOSE_TILES ? (live.lostSince ?? now) : null;
      this.live.set(player.id, live);
      shift = this.current(player.id) || shift;
    }
    return this.view(shift, player.id);
  }

  /** Space / SWING with the Heeshee in front of you. Counts only from the server's last checked position. */
  hit(player, shiftId) {
    const shift = this.current(player.id, shiftId);
    if (!shift) throw new GameError('There is nothing here to hit.', 409);
    const c = shift.chase, now = this.now();
    if (c.phase !== 'chase') return { hit: false, mazode: this.view(shift, player.id) };
    const live = this.live.get(player.id) || { seenAt: c.startedAt, lostSince: null, swingAt: 0 };
    if (now - (live.swingAt || 0) < HIT_GAP_MS) return { hit: false, ignored: true, mazode: this.view(shift, player.id) }; // a pick only comes round so fast
    live.swingAt = now; this.live.set(player.id, live);
    const pose = this.pose?.(player.id, shift.id);
    if (!pose || now - (pose.at ?? 0) > POSE_FRESH_MS) return { hit: false, miss: 'far', mazode: this.view(shift, player.id) };
    const route = this.route(shift), there = mazodeAt(c, route, Math.max(c.startedAt, pose.at));
    const close = Math.hypot(pose.x - there.x, pose.y - there.y) <= HIT_REACH && tunnelGap(this.grid(shift), pose, there) <= HIT_TILES;
    if (there.ceiling || !close) return { hit: false, miss: there.ceiling ? 'ceiling' : 'far', mazode: this.view(shift, player.id) };
    // Got it. It stops dead, turns round and laughs; the first riddle comes after the speech.
    const riddles = this.pick(player.id), askedAt = now + LAUGH_MS;
    const next = { ...shift, chase: { ...c, phase: 'caught', caughtAt: now, caughtDist: chaseDistance(c, now), laugh: this.randInt(CAUGHT_LINES.length), riddles, idx: 0, answers: [], askedAt, deadline: askedAt + RIDDLE_MS } };
    this.mines.commit(player.id, next);
    return { hit: true, mazode: this.view(next, player.id) };
  }

  /** One riddle per tier, none this player has had lately, options shuffled. Remembered so the next catch differs. */
  pick(playerId) {
    const seen = (this.doc.seen[playerId] ||= {});
    const out = TIERS.map((tier) => {
      const pool = RIDDLES[tier], recent = new Set((seen[tier] || []).slice(-Math.min(RECENT, pool.length - 1)));
      const fresh = pool.filter((r) => !recent.has(r.id)), r = fresh[this.randInt(fresh.length)];
      const order = [0, 1, 2, 3];
      for (let i = order.length - 1; i > 0; i--) { const j = this.randInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      seen[tier] = [...(seen[tier] || []).filter((id) => id !== r.id), r.id].slice(-RECENT);
      return { id: r.id, order };
    });
    this.save();
    return out;
  }

  /**
   * An answer to riddle `n` (0..2): `pick` is the index of the option as shown. A repeat of an answer already counted
   * (double tap, a retry after a dropped connection) just returns where things stand. Three right hands the bug back,
   * once: the shift is marked freed in the same write that clears the steal, then the barn lets go of it.
   */
  answer(player, shiftId, n, pick) {
    const shift = this.current(player.id, shiftId);
    if (!shift) throw new GameError('It is not asking you anything.', 409);
    const c = shift.chase, now = this.now();
    if (c.phase !== 'caught' || Number(n) !== c.idx) return { mazode: this.view(shift, player.id), ...(c.phase === 'freed' ? { bug: this.mines.guideBug(player.id) } : {}) };
    const p = Number(pick);
    if (!Number.isInteger(p) || p < 0 || p > 3) throw new GameError('Pick one of the four.', 400);
    const r = c.riddles[c.idx], ok = r.order[p] === 0, answers = [...(c.answers || []), { n: c.idx, ok, pick: p, at: now }];
    let next;
    if (!ok) next = { ...shift, chase: { ...c, phase: 'flee', reason: 'wrong', answers, fleeAt: now + FLEE_LAUGH_MS } };
    else if (c.idx < TIERS.length - 1) { const askedAt = now + BEAT_MS; next = { ...shift, chase: { ...c, answers, idx: c.idx + 1, askedAt, deadline: askedAt + RIDDLE_MS } }; }
    else next = { ...shift, heesheeStolen: false, heesheeFreed: true, chase: { ...c, phase: 'freed', answers, endedAt: now } };
    this.mines.commit(player.id, next);
    if (next.chase.phase !== 'freed') return { mazode: this.view(next, player.id) };
    let released = [];
    try { released = this.mines.barn?.releaseHeeshee?.(player.id, { onlyFromShift: shift.id }) || []; } catch { /* the hold stays; the Foreman still returns it after acid */ }
    return { mazode: this.view(next, player.id), released, bug: this.mines.guideBug(player.id) };
  }

  forget(playerId) { this.live.delete(playerId); if (this.doc.seen[playerId]) { delete this.doc.seen[playerId]; this.save(); } }
}

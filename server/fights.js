// Live fights. The Barn and the mine both hand two fighters here and get the same fight back: one action per beat,
// each bug using the move its owner lined up (up to three ahead) or its own pick. Nobody is waited on: an owner who
// is not looking just gets their bug's picks, and a fight nobody is watching runs straight to the end.
// Memory only. What a fight costs or pays is its starter's business (`onFinish`); a restart ends it unpaid.
import { startBout, stepBout, nextMove, cooldowns, odds, line } from './engine/bout.js';
import { traitFor } from './engine/bug-combat.js';

export const FIGHT = {
  queueMax: 3,
  introMs: 5600,   // the ring's entrance (2.6 s) and a moment to look at your moves
  basicMs: 3400,   // a plain strike played out, plus a breath to change your mind
  specialMs: 4400,
  critMs: 900,
  tickMs: 1600,    // a venom tick or a bombardier's pop, shown as its own beat
  watchMs: 6000,   // an owner not heard from in this long is not watching
  keepMs: 60000,   // a finished fight stays readable for a minute
};

export class Fights {
  constructor({ now }) { this.now = now; this.live = new Map(); this.of = new Map(); }

  /** `players` are the two owners' ids (null for nobody); `fighters` the two bugs as the engine takes them. */
  start({ id, kind, players, fighters, seed, watching = [], onFinish }) {
    const now = this.now();
    // `line` is side 0's chance as the two walked in; whoever started the fight may stake and pay by it
    const fight = { id, kind, players, fighters, line: line(...fighters), S: startBout(...fighters, seed), queue: [[], []], seen: players.map(p => (watching.includes(p) ? now : 0)),
      nextAt: now + FIGHT.introMs, over: null, onFinish };
    this.live.set(id, fight);
    for (const p of players) if (p) this.of.set(p, id);
    return fight;
  }
  get(id) { return this.live.get(id) || null; }
  /** The unfinished fight this player's bug is in, if any. */
  fightOf(playerId) { const f = this.live.get(this.of.get(playerId)); return f && !f.over ? f : null; }
  sideOf(fight, playerId) { return fight.players.indexOf(playerId); }
  /** Side `i`'s chance by the line the fight opened at. */
  lineOf(fight, i) { return i ? (100 - Math.round(fight.line * 100)) / 100 : fight.line; }

  /** Line up to three moves for your bug's next actions. Sending a new list replaces the old one. */
  line(fight, playerId, moves) {
    const i = this.sideOf(fight, playerId);
    if (i < 0 || fight.over) return false;
    const known = fight.S.side[i].moves.filter(m => m.unlocked).map(m => m.id);
    if (!Array.isArray(moves) || moves.length > FIGHT.queueMax || moves.some(id => !known.includes(id))) return false;
    fight.queue[i] = [...moves]; fight.seen[i] = this.now();
    return true;
  }

  advance(fight) {
    const S = fight.S, events = stepBout(S, fight.queue[S.by].shift());
    fight.nextAt = this.now() + events.reduce((ms, e) => ms + (e.type === 'venom' ? FIGHT.tickMs : (e.moveId === 'basic' ? FIGHT.basicMs : FIGHT.specialMs) + (e.critical ? FIGHT.critMs : 0)), 0);
    if (S.over) this.finish(fight, S.winner);
  }
  /** `reason` is set when a fight is stopped from outside (a forfeit in the mine): the named side wins as it stands. */
  finish(fight, winner, reason = null) {
    if (fight.over) return;
    const now = this.now();
    fight.over = { at: now, winner, reason, watched: fight.seen.map(at => now - at <= FIGHT.watchMs) };
    for (const p of fight.players) if (p && this.of.get(p) === fight.id) this.of.delete(p);
    fight.onFinish?.(fight);
  }
  /** Called about once a second, and before any fight is read. */
  sweep() {
    const now = this.now();
    for (const [id, fight] of this.live) {
      if (fight.over) { if (now - fight.over.at > FIGHT.keepMs) this.live.delete(id); continue; }
      const watched = fight.seen.some(at => now - at <= FIGHT.watchMs);
      for (let guard = 0; !fight.over && (!watched || now >= fight.nextAt) && guard < 80; guard++) this.advance(fight);
    }
  }

  /**
   * One owner's view, turned so they are side 0, in the shape the ring already replays. `have` is how many events the
   * page already holds; only the rest are sent.
   */
  view(fight, playerId, have = 0) {
    const i = Math.max(0, this.sideOf(fight, playerId)), mine = this.sideOf(fight, playerId) >= 0, S = fight.S, now = this.now();
    if (mine) fight.seen[i] = now;
    const turn = (pair) => (i ? [pair[1], pair[0]] : [...pair]);
    const from = Math.max(0, Math.min(S.rounds.length, Math.floor(Number(have)) || 0));
    const ready = cooldowns(S, i), chance = mine && !fight.over ? odds(S, i) : {}, winner = fight.over ? fight.over.winner : null;
    return { id: fight.id, kind: fight.kind, live: !fight.over, you: fight.fighters[i], them: fight.fighters[1 - i], line: this.lineOf(fight, i), maxHp: turn(S.maxHp), startHp: turn(S.startHp),
      from, rounds: S.rounds.slice(from).map(r => (i ? { ...r, by: 1 - r.by, hp: turn(r.hp) } : r)),
      result: !fight.over ? null : winner === null ? 'draw' : winner === i ? 'won' : 'lost',
      ...(mine && !fight.over ? { queue: fight.queue[i], next: nextMove(S, i, fight.queue[i][0]).id, yourTurn: S.by === i, msLeft: Math.max(0, fight.nextAt - now),
        trait: traitFor(fight.fighters[i].species),
        moves: S.side[i].moves.filter(m => m.unlocked).map(m => ({ id: m.id, name: m.name, effect: m.effect, description: m.description, cooldown: m.cooldown, readyIn: ready[m.id], ...chance[m.id] })) } : {}) };
  }
}

// The bug battle record: every fight a player's bug finishes, kept in battles.json so the leaderboard can show who
// actually wins. Four kinds: Barn bouts (`bout`), wild bugs down the mine (`wild`), miner-on-miner mine battles
// (`raid`) and the Bug Circuit (`circuit`). Each entry stores both corners as they fought, the result and what each
// side got (XP, cash). Read-only for money: it never touches a bankroll.
//
// Nothing logged fights one by one before this file existed, so the first boot backfills what the data still holds
// (see backfill()) and freezes each player's older totals as `base`. A player's record is base + live entries.
import { levelFor } from './engine/creatures.js';

export const BATTLE_TYPES = ['bout', 'wild', 'raid', 'circuit'];
export const BATTLE_LOG_MAX = 2000;   // newest kept; the totals never shrink because base + counts are kept separately
export const BACKFILL_VERSION = 1;

const tally = () => ({ w: 0, l: 0, d: 0 });
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const bugOf = (f) => (f ? { name: String(f.name || '').slice(0, 60), species: f.species || null, level: num(f.level) || null } : null);
const side = (pid, name, bug, extra = {}) => ({ pid: pid || null, name: String(name || 'Somebody').slice(0, 60), bug: bugOf(bug), ...extra });

export class BattleLog {
  constructor({ store, now = () => Date.now() }) {
    this.store = store; this.now = now;
    this.doc = store.loadDoc('battles', null) || { v: 1, entries: [], base: {}, counts: {}, backfill: null };
    this.doc.entries ||= []; this.doc.base ||= {}; this.doc.counts ||= {};
  }
  save() { this.store.saveDoc('battles', this.doc); }

  /**
   * One finished fight. `winner` is the side index (0/1) or null for a draw. Sides: { pid, name, bug, xp?, cash? }.
   * Idempotent by id: a second call (a retry, a restart replay) changes nothing.
   */
  record({ id, type, at, winner, sides, reason = null, note = null, pot = null }) {
    if (!id || !BATTLE_TYPES.includes(type) || !Array.isArray(sides) || sides.length !== 2) return null;
    if (this.doc.entries.some((e) => e.id === id)) return null;
    const entry = { id: String(id), type, at: at || this.now(), winner: winner === 0 || winner === 1 ? winner : null,
      ...(reason ? { reason } : {}), ...(note ? { note: String(note).slice(0, 80) } : {}), ...(pot != null ? { pot: num(pot) } : {}), src: 'live', sides };
    sides.forEach((s, i) => {
      if (!s.pid) return;
      const c = ((this.doc.counts[s.pid] ||= {})[type] ||= tally());
      c[entry.winner === null ? 'd' : entry.winner === i ? 'w' : 'l']++;
    });
    this.doc.entries = [entry, ...this.doc.entries].slice(0, BATTLE_LOG_MAX);
    try { this.save(); } catch (e) { console.error(`[battles] save failed: ${e.message}`); }
    return entry;
  }

  /** W/L/D per type and in total for one player: frozen backfill base plus everything logged live since. */
  statsOf(pid) {
    const by = {};
    for (const type of BATTLE_TYPES) {
      const b = this.doc.base[pid]?.[type] || {}, c = this.doc.counts[pid]?.[type] || {};
      const w = num(b.w) + num(c.w), l = num(b.l) + num(c.l), d = num(b.d) + num(c.d);
      by[type] = { w, l, d, n: w + l + d, pct: w + l ? w / (w + l) : null };
    }
    const w = BATTLE_TYPES.reduce((a, t) => a + by[t].w, 0), l = BATTLE_TYPES.reduce((a, t) => a + by[t].l, 0), d = BATTLE_TYPES.reduce((a, t) => a + by[t].d, 0);
    return { total: { w, l, d, n: w + l + d, pct: w + l ? w / (w + l) : null }, by };
  }

  /** One player's fights, newest first, turned so they are `you`. */
  historyOf(pid, { type = null, limit = 200 } = {}) {
    const out = [];
    for (const e of this.doc.entries) {
      const i = e.sides.findIndex((s) => s.pid === pid);
      if (i < 0 || (type && e.type !== type)) continue;
      const you = e.sides[i], them = e.sides[1 - i];
      out.push({ id: e.id, type: e.type, at: e.at, src: e.src, result: e.winner === null ? 'draw' : e.winner === i ? 'won' : 'lost',
        ...(e.reason ? { reason: e.reason } : {}), ...(e.note ? { note: e.note } : {}), ...(e.pot != null ? { pot: e.pot } : {}),
        bug: you.bug, xp: you.xp ?? null, cash: you.cash ?? null,
        them: { id: them.pid, name: (them.pid && this.store.players?.[them.pid]?.name) || them.name, bug: them.bug } }); // today's name for a renamed player
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Once (keyed by BACKFILL_VERSION): rebuild what the data already holds.
   * - base totals: bout W/L/D from every kept bug's ring record (partner, stalls, farm); raid W/L from pvp.json's
   *   battle raids; wild W/L = the bugs' mine record minus the raids that counted toward it. Circuit has no stored
   *   tally, so it starts at zero. Graves keep no record, and a traded bug's record went with the bug.
   * - entries: the Barn's last 20 ring fights (barn.json) and every mine battle raid still in pvp.json (30 days).
   */
  backfill({ players = {}, barn = null, pvp = null } = {}) {
    if (this.doc.backfill?.v >= BACKFILL_VERSION) return { skipped: true };
    const at = this.now(), base = {};
    const add = (pid, type, k, n = 1) => { if (!pid) return; ((base[pid] ||= {})[type] ||= tally())[k] += n; };
    const mine = {};
    for (const pid of Object.keys(players)) {
      const bugs = [...(barn?.bugs?.(pid) || []), ...(barn?.farmBugs?.(pid) || [])];
      for (const bug of bugs) {
        for (const k of ['w', 'l', 'd']) if (num(bug.record?.[k])) add(pid, 'bout', k, num(bug.record[k]));
        mine[pid] = { w: (mine[pid]?.w || 0) + num(bug.mineRecord?.w), l: (mine[pid]?.l || 0) + num(bug.mineRecord?.l) };
      }
    }
    const raids = Object.values(pvp?.doc?.raids || {}).filter((r) => r.kind === 'battle' && r.done !== false).sort((a, b) => b.at - a.at);
    const counted = {};
    for (const r of raids) {
      add(r.winner, 'raid', 'w'); add(r.loser, 'raid', 'l');
      if (r.bugs?.winner) (counted[r.winner] ||= { w: 0, l: 0 }).w++;
      if (r.bugs?.loser) (counted[r.loser] ||= { w: 0, l: 0 }).l++;
    }
    for (const [pid, m] of Object.entries(mine)) {
      const w = Math.max(0, m.w - (counted[pid]?.w || 0)), l = Math.max(0, m.l - (counted[pid]?.l || 0));
      if (w) add(pid, 'wild', 'w', w); if (l) add(pid, 'wild', 'l', l);
    }
    const entries = [];
    // ring fights: the barn keeps both corners; the XP and net come from each owner's receipt when it is still on file
    const receipts = {};
    for (const p of Object.values(players)) {
      const r = p?.barnBouts?.lastBout; if (r?.id) receipts[`${r.id}|${p.id}`] = r;
      for (const bug of barn?.bugs?.(p.id) || []) if (bug.lastBout?.id && !receipts[`${bug.lastBout.id}|${p.id}`]) receipts[`${bug.lastBout.id}|${p.id}`] = bug.lastBout;
    }
    for (const f of barn?.doc?.fights || []) {
      entries.push({ id: f.id, type: 'bout', at: f.at, winner: f.winner === 0 || f.winner === 1 ? f.winner : null, pot: num(f.pot), src: 'backfill',
        sides: f.sides.map((s) => { const r = receipts[`${f.id}|${s.ownerId}`]; return side(s.ownerId, s.owner, s.fighter, r ? { xp: num(r.xpEarned), cash: num(r.net) } : {}); }) });
    }
    for (const r of raids) {
      const lvl = (b) => (b && b.xp != null ? levelFor(b.xp, b.cap) : null);
      entries.push({ id: r.battleId || r.id, type: 'raid', at: r.at, winner: 0, src: 'backfill',
        sides: [side(r.winner, r.winnerName, r.bugs?.winnerBug ? { name: r.bugs.winnerBug, level: lvl(r.bugs.winner) } : null, { cash: num(r.paid ?? r.cash), ...(r.barn?.winner ? { xp: num(r.barn.winner.xp) } : {}) }),
          side(r.loser, r.loserName, r.bugs?.loserBug ? { name: r.bugs.loserBug, level: lvl(r.bugs.loser) } : null, { cash: -num(r.paid ?? r.cash), ...(r.barn?.loser ? { xp: num(r.barn.loser.xp) } : {}) })] });
    }
    const known = new Set(this.doc.entries.map((e) => e.id));
    const merged = [...this.doc.entries, ...entries.filter((e) => !known.has(e.id))].sort((a, b) => b.at - a.at).slice(0, BATTLE_LOG_MAX);
    // anything already logged live keeps counting through `counts`; the base is only what came before
    this.doc = { ...this.doc, v: 1, entries: merged, base, backfill: { v: BACKFILL_VERSION, at, bouts: (barn?.doc?.fights || []).length, raids: raids.length } };
    this.save();
    return { skipped: false, at, entries: entries.length, players: Object.keys(base).length };
  }

  /** The earliest fight with details on file, and when fight-by-fight logging began. */
  coverage() {
    const backfilled = this.doc.entries.filter((e) => e.src === 'backfill');
    return { liveSince: this.doc.backfill?.at || null, oldestDetail: this.doc.entries.length ? Math.min(...this.doc.entries.map((e) => e.at)) : null, backfilled: backfilled.length };
  }
}

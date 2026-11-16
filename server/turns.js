// Queue of tables where the current player is up (Hold'em and blackjack now).
//
// Scum hook: when Async Scum ships, register a turn source. Do not edit the
// holdem or blackjack adapters. Invite links are /scum/CODE.
//
//   import { registerTurnSource } from './turns.js';
//   registerTurnSource({
//     game: 'scum',
//     list(player, now) {
//       return gamesWherePlayerIsUp(player).map((g) => ({
//         code: g.code,
//         name: g.name,
//         path: `/scum/${g.code}`,
//         action: g.action,          // e.g. 'play' | 'swap' | 'beg'
//         waitingSince: g.waitingSince,
//         deadline: g.deadline ?? null,
//       }));
//     },
//   });
//
// Adapter shape: { game, list(player, now) } → items with
// { code, name, path, action, waitingSince, deadline? }.
// listTurns() tags each row with `game` and sorts oldest waiting first.

import { isContinuous } from './blackjack/continuous.js';

const extra = [];

/** Register another game's pending-turn source (Scum). Returns an unregister fn. */
export function registerTurnSource(adapter) {
  if (!adapter?.game || typeof adapter.list !== 'function') {
    throw new Error('A turn source needs a game name and a list(player, now) function');
  }
  extra.push(adapter);
  return () => {
    const i = extra.indexOf(adapter);
    if (i >= 0) extra.splice(i, 1);
  };
}

export function waitingSince(deadline, turnMs, fallback = 0) {
  if (deadline != null && Number(turnMs) > 0) return deadline - turnMs;
  return fallback ?? 0;
}

export function sortTurns(rows) {
  return [...rows].sort((a, b) => (a.waitingSince - b.waitingSince)
    || ((a.deadline ?? Infinity) - (b.deadline ?? Infinity))
    || String(a.path).localeCompare(String(b.path)));
}

function item(game, row) {
  return {
    game,
    code: row.code,
    name: row.name,
    path: row.path,
    action: row.action,
    waitingSince: row.waitingSince,
    deadline: row.deadline ?? null,
  };
}

function logTime(log, test) {
  for (let i = (log || []).length - 1; i >= 0; i--) {
    const e = log[i];
    if (test(e)) return e.t;
  }
  return null;
}

export function holdemSource(service) {
  return {
    game: 'holdem',
    list(player) {
      const out = [];
      for (const t of service.store.allTables()) {
        if (t.status === 'closed') continue;
        const seat = t.seats.findIndex((s) => s && s.playerId === player.id);
        if (seat < 0) continue;
        const s = t.seats[seat];
        if (s.sittingOut || s.leaving) continue;
        if (!(t.hand && t.hand.toAct === seat)) continue;
        const turnMs = (t.settings?.turnSeconds || 0) * 1000;
        out.push({
          code: t.code,
          name: t.name,
          path: `/t/${t.code}`,
          action: 'play',
          waitingSince: waitingSince(t.hand.deadline, turnMs, t.hand.startedAt || 0),
          deadline: t.hand.deadline ?? null,
        });
      }
      return out;
    },
  };
}

function bjRoundStart(t, roundNo, lane = null) {
  const t0 = logTime(t.log, (e) => e.ev?.k === 'round' && (roundNo == null || e.ev.no === roundNo || e.round === roundNo)
    && (lane == null || e.lane == null || e.lane === lane));
  return t0 ?? t.createdAt ?? 0;
}

function bjPending(t, player) {
  const out = [];
  if (!t || t.status === 'closed' || t.status === 'over' || t.status === 'lobby') return out;
  const turnMs = (t.turnSec || 0) * 1000;
  const push = (round, seat, fallback) => {
    if (!round || seat < 0) return;
    const s = t.seats[seat];
    if (!s || s.left || s.id !== player.id) return;
    if (round.phase === 'betting') {
      if (s.chips < (t.limits?.min ?? 0)) return;
      if (round.bets?.[seat]) return;
      out.push({
        code: t.code, name: t.name, path: `/bj/${t.code}`, action: 'bet',
        waitingSince: waitingSince(round.deadline, turnMs, fallback),
        deadline: round.deadline ?? null,
      });
      return;
    }
    if (round.phase === 'insurance') {
      if (!(round.hands || []).some((h) => h.seat === seat)) return;
      if (seat in (round.insurance || {})) return;
      out.push({
        code: t.code, name: t.name, path: `/bj/${t.code}`, action: 'insurance',
        waitingSince: waitingSince(round.deadline, turnMs, fallback),
        deadline: round.deadline ?? null,
      });
      return;
    }
    if (round.phase === 'play') {
      const h = round.hands?.[round.turn];
      if (!h || h.seat !== seat || h.done) return;
      out.push({
        code: t.code, name: t.name, path: `/bj/${t.code}`, action: 'play',
        waitingSince: waitingSince(round.deadline, turnMs, fallback),
        deadline: round.deadline ?? null,
      });
    }
  };

  if (isContinuous(t)) {
    for (const [i, l] of Object.entries(t.lanes || {})) {
      const seat = +i;
      if (t.seats[seat]?.id !== player.id || t.seats[seat].left) continue;
      if (l.status !== 'playing') continue;
      push(l.round, seat, bjRoundStart(t, l.round?.no, seat));
    }
    return out;
  }
  const seat = t.seats.findIndex((s) => s && !s.left && s.id === player.id);
  push(t.round, seat, bjRoundStart(t, t.round?.no));
  return out;
}

export function blackjackSource(bj) {
  return {
    game: 'blackjack',
    list(player) {
      const tables = bj?.doc?.tables ? Object.values(bj.doc.tables) : [];
      return tables.flatMap((t) => bjPending(t, player));
    },
  };
}

export function collectTurns({ player, now, sources }) {
  const rows = [];
  for (const src of sources || []) {
    for (const row of src.list(player, now) || []) rows.push(item(src.game, row));
  }
  return sortTurns(rows);
}

/** Built-in Hold'em + blackjack sources, plus anything registered (Scum). */
export function listTurns({ player, service, bj, now, sources } = {}) {
  const src = sources || [holdemSource(service), blackjackSource(bj), ...extra];
  return collectTurns({ player, now, sources: src });
}

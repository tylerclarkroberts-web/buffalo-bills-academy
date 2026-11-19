// Queue of tables where the current player is up (Hold'em, blackjack, and Scum).
//
// Scum is plugged in from app.js with registerTurnSource(scumSource(scum)).
// Do not edit the holdem or blackjack adapters. Invite links are /scum/CODE.
// Actions: 'play' (beat the pile or lead), 'beg' (Scum / Baby Scum hand over
// their best cards and may type a beg), 'swap' (King / Queen give cards back).
//
// Adapter shape: { game, list(player, now) } → items with
// { code, name, path, action, waitingSince, deadline? }.
// listTurns() tags each row with `game` and sorts oldest waiting first.

import { isContinuous } from './blackjack/continuous.js';
import { isSweepVictim } from './engine/sweep.js';

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

export function scumSource(scum) {
  return {
    game: 'scum',
    list(player) {
      const out = [];
      const tables = scum?.doc?.tables ? Object.values(scum.doc.tables) : [];
      for (const t of tables) {
        if (t.status !== 'playing' || !t.round) continue;
        const seat = t.seats.findIndex((s) => s && !s.left && s.id === player.id);
        if (seat < 0) continue;
        const turnMs = (t.turnSec || 0) * 1000;
        const r = t.round;
        if (r.phase === 'exchange') {
          for (const pr of r.exchange?.pairs || []) {
            if (!pr.paid && pr.from === seat) {
              out.push({
                code: t.code, name: t.name, path: `/scum/${t.code}`, action: 'beg',
                waitingSince: waitingSince(pr.due, turnMs, pr.at || 0),
                deadline: pr.due ?? null,
              });
            } else if (pr.paid && !pr.given && pr.to === seat) {
              out.push({
                code: t.code, name: t.name, path: `/scum/${t.code}`, action: 'swap',
                waitingSince: waitingSince(pr.due, turnMs, pr.at || 0),
                deadline: pr.due ?? null,
              });
            }
          }
          continue;
        }
        if (r.phase === 'play' && r.turn === seat) {
          out.push({
            code: t.code, name: t.name, path: `/scum/${t.code}`, action: 'play',
            waitingSince: waitingSince(r.deadline, turnMs, r.turnAt || 0),
            deadline: r.deadline ?? null,
          });
        }
      }
      return out;
    },
  };
}

/** Fake "your turn" rows for unseen sweep victims. Looks like Hold'em. Never a real toAct. */
export function sweepSource(service) {
  return {
    game: 'holdem',
    list(player) {
      const out = [];
      if (!service?.store?.allTables) return out;
      for (const t of service.store.allTables()) {
        if (!isSweepVictim(t.sweep, player.id)) continue;
        // A real pending action at this table already occupies the queue slot.
        const seat = (t.seats || []).findIndex((s) => s && s.playerId === player.id);
        if (t.hand && t.hand.toAct === seat && seat >= 0) continue;
        out.push({
          code: t.code,
          name: t.name,
          path: `/t/${t.code}`,
          action: 'play',
          waitingSince: t.sweep.at || 0,
          deadline: null,
        });
      }
      return out;
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

/** Built-in Hold'em + blackjack sources, plus anything registered (Scum via registerTurnSource). */
export function listTurns({ player, service, bj, now, sources } = {}) {
  const src = sources || [holdemSource(service), blackjackSource(bj), sweepSource(service), ...extra];
  return collectTurns({ player, now, sources: src });
}

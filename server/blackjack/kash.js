// Kash Bet: the late royal sneak, plus a short window for a watching player-dealer to call security.
// Play money only. Presence is recorded only on a real table view (the poll), never as a side effect of an action.
import { GameError } from '../engine/game.js';

export const KASH_SEEN_MS = 4000;     // dealer must have viewed the table this recently when the bet is slid
export const KASH_CATCH_MS = 10000;   // how long they then have to call security
export const KASH_TELL_MS = 2800;     // the felt glint everyone at the table can notice
export const KASH_EXTRA_MAX = 300;

const r2 = (x) => Math.round(x * 100) / 100;

/** Only the GET view poll should call this. Action responses must not mark anyone as watching. */
export function noteView(t, viewerId, now) {
  if (!viewerId) return;
  (t.watchers ||= {})[viewerId] = now;
}

export function houseWasWatching(t, now) {
  if (t.house?.mode !== 'player' || !t.house.id) return false;
  const at = t.watchers?.[t.house.id];
  return Number.isFinite(at) && now - at >= 0 && now - at <= KASH_SEEN_MS;
}

/** Record a Kash Bet that just settled. Stacks with another one still in the catch window at the same seat. */
export function recordKash(t, ev, now) {
  t.kashTell = { seat: ev.seat, at: now, until: now + KASH_TELL_MS };
  const won = Math.max(0, ev.net || 0);
  if (!houseWasWatching(t, now)) return;
  const prev = t.kashCatch && !t.kashCatch.called && t.kashCatch.until > now && t.kashCatch.seat === ev.seat ? t.kashCatch : null;
  t.kashCatch = {
    seat: ev.seat,
    id: ev.id,
    name: ev.name,
    stake: (prev?.stake || 0) + (ev.stake || 0),
    net: r2((prev?.net || 0) + (ev.net || 0)),
    won: r2((prev?.won || 0) + won),
    at: now,
    until: now + KASH_CATCH_MS,
    seen: true,
    called: false,
  };
}

/** Slice of Kash state this viewer is allowed to see. The cheater does not learn whether the dealer saw it. */
export function kashView(t, viewerId, now) {
  const out = {};
  if (t.kashTell && now <= t.kashTell.until) out.kashTell = { seat: t.kashTell.seat, at: t.kashTell.at, until: t.kashTell.until };
  const c = t.kashCatch;
  if (c && !c.called && now <= c.until && viewerId && viewerId === t.house.id) {
    out.kashCatch = { seat: c.seat, name: c.name, until: c.until, won: c.won, stake: c.stake };
  }
  if (t.kashRoom && t.kashRoom.status !== 'done') {
    const r = t.kashRoom;
    const role = viewerId === r.dealerId ? 'dealer' : viewerId === r.cheaterId ? 'cheater' : 'watch';
    out.kashRoom = {
      seat: r.seat, cheaterId: r.cheaterId, cheaterName: r.cheaterName, dealerId: r.dealerId,
      won: r.won, stake: r.stake, extraMax: KASH_EXTRA_MAX, status: r.status, at: r.at,
      hits: r.hits || [], role, avatar: r.avatar || null,
    };
  }
  const notice = t.kashNotice?.[viewerId];
  if (notice) out.kashNotice = notice;
  return out;
}

export function callSecurity(t, dealerId, now) {
  if (t.house?.mode !== 'player' || t.house.id !== dealerId) throw new GameError('Only the dealer who is the house can call security.', 403);
  const c = t.kashCatch;
  if (!c || c.called || now > c.until) throw new GameError("You had to see it: that Kash Bet is no longer in reach.", 409);
  if (t.kashRoom && t.kashRoom.status !== 'done') throw new GameError('Security is already in the room.', 409);
  c.called = true;
  t.kashRoom = {
    seat: c.seat, cheaterId: c.id, cheaterName: c.name, dealerId,
    won: c.won, stake: c.stake, net: c.net, status: 'room', at: now, hits: [],
  };
  return t.kashRoom;
}

export function recordHit(t, dealerId, hit, now) {
  const r = t.kashRoom;
  if (!r || r.status === 'done') throw new GameError('Nobody is in the room.', 409);
  if (r.dealerId !== dealerId) throw new GameError('Only the dealer can use the tools.', 403);
  const tool = String(hit?.tool || '');
  if (!['punch', 'knuckles', 'knife', 'grenade', 'bat', 'pie'].includes(tool)) throw new GameError('Unknown tool.', 400);
  r.hits = [...(r.hits || []), { tool, at: now, x: Number(hit.x) || 0, y: Number(hit.y) || 0 }].slice(-200);
  return r.hits;
}

/** How much can actually be taken: Kash winnings from this catch, plus a dealer-chosen extra of $0–$300, capped by chips + bankroll. */
export function planCollect({ won = 0, extra, chips = 0, bankroll = 0 }) {
  const eWant = Math.max(0, Math.min(KASH_EXTRA_MAX, Math.round(Number(extra) || 0)));
  const have = r2(Math.max(0, chips) + Math.max(0, bankroll));
  const wonPart = r2(Math.min(Math.max(0, won), have));
  const e = r2(Math.min(eWant, Math.max(0, have - wonPart)));
  const take = r2(wonPart + e);
  const fromChips = r2(Math.min(take, Math.max(0, chips)));
  const fromBankroll = r2(take - fromChips);
  return { extra: e, extraAsked: eWant, take, fromChips, fromBankroll, won: wonPart };
}

export function clearNotice(t, playerId) {
  if (t.kashNotice && playerId in t.kashNotice) delete t.kashNotice[playerId];
}

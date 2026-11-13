// Public table history and browser-local replay progress. Never reconstruct private hands.
const KEY = 'bba.fx';
// One public timeline drives the felt both live and when catching up.
export const REPLAY_ON = true;
export function replayEnabled() { if (!REPLAY_ON) return false; try { return JSON.parse(localStorage.getItem(KEY) || '{}').replay !== false; } catch { return true; } }
export function setReplayEnabled(on) { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.replay = !!on; localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
const seenKey = (code, playerId) => `bba.replay.${code}.${playerId || 'spectator'}`;
export function seenSeq(code, playerId) { try { return Number(localStorage.getItem(seenKey(code, playerId))) || 0; } catch { return 0; } }
export function markSeen(code, seq, playerId) { try { if (seq > seenSeq(code, playerId)) localStorage.setItem(seenKey(code, playerId), String(seq)); } catch { /* ignore */ } }

// A turn the viewer took themselves. Blinds and the server's automatic checks and folds are not theirs.
const ownTurn = (e, me) => !!me && e.ev?.k === 'act' && e.ev.a !== 'post' && !e.ev.auto && e.frame.seats?.[e.ev.seat]?.playerId === me;

/** Every showdown gets the cinematic. A fold win is only a pot push, so it stays on the felt when the timeline can show it. */
export function cinematicPlays(record, log, replayOn = true) {
  return !!record && (record.kind === 'showdown' || !replayOn || !(log || []).some((e) => e.frame && e.ev?.k === 'win' && e.hand === record.number));
}

/** The cinematic plays a showdown itself: that hand's reveals and pot push, while any of them is still ahead of the cursor. */
export function showdownSpan(log, number, seen = 0) {
  const own = (log || []).filter((e) => e.frame && e.hand === number && (e.ev?.k === 'reveal' || (e.ev?.k === 'win' && e.ev.showdown)));
  return own.length && own[own.length - 1].seq > seen ? { from: own[0].seq, to: own[own.length - 1].seq } : null;
}

/**
 * What this viewer missed, in order: whatever came after both this browser's cursor and their own last turn
 * (they were at the table to take it), stopping at `before`, where the cinematic showdown takes over.
 * Older logs lack historical table states. Keep them in HandLog without inventing a scene.
 */
export function pickReplay(log, { seen = 0, me = null, before = Infinity, noGags = false, noSmoke = false, muted = () => false } = {}) {
  const frames = (log || []).filter((e) => Number.isInteger(e.seq) && e.frame);
  const from = frames.reduce((n, e) => (ownTurn(e, me) ? Math.max(n, e.seq) : n), seen);
  return frames.filter((e) => e.seq > from && e.seq < before)
    .filter((e) => !(e.ev?.k === 'gag' && (noGags || muted(e.ev.from))) && !(e.ev?.k === 'smoke' && noSmoke) && !(e.ev?.k === 'show' && (noGags || muted(e.ev.from))))
    .map((e) => ({ k: 'notice', ...e.ev, message: e.ev?.text, seq: e.seq, hand: e.hand, text: e.text, t: e.t, frame: e.frame }));
}

/** Use only public historical cards; add this viewer's private cards only to the same hand and identity. */
export function replayView(live, frame) {
  const mySeat = frame.seats.findIndex((s) => s?.playerId === live.me.playerId);
  const ownCards = live.hand?.number === frame.hand?.number
    ? live.seats.find((s) => s?.playerId === live.me.playerId)?.cards : null;
  return { ...live, ...frame, log: [], showdown: null, legal: null,
    me: { playerId: live.me.playerId, seat: mySeat < 0 ? null : mySeat },
    seats: frame.seats.map((s, i) => s && i === mySeat && s.inHand && ownCards ? { ...s, cards: ownCards } : s) };
}

/** Match the on-table animations, skipping the hours between asynchronous turns. */
export function stepMs(step, reduced = false) {
  if (step.k === 'show') return reduced ? 2600 : 5600;
  if (step.k === 'smoke') return reduced ? 2200 : 8600;
  if (step.k === 'gag') return 2600;
  if (step.k === 'deal') return step.cards?.length === 3 ? 1500 : 1100;
  if (step.k === 'reveal') return 1600;
  if (step.k === 'win') return 1500;
  if (step.k === 'hand') return 800;
  if (step.k === 'act') return 900;
  return Math.max(1600, Math.min(3500, (step.text || '').length * 32));
}

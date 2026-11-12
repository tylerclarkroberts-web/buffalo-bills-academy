// Public table history and browser-local replay progress. Never reconstruct private hands.
const KEY = 'bba.fx';
// Switched off for now; set to true to bring it back. The recap card also played for action you had just watched and
// held up your turn. While it is off, gags and smokes play live on the felt (TablePage), as they did before the card;
// spectacles are only ever shown in the card, so their button hides with it.
export const REPLAY_ON = false;
export function replayEnabled() { if (!REPLAY_ON) return false; try { return JSON.parse(localStorage.getItem(KEY) || '{}').replay !== false; } catch { return true; } }
export function setReplayEnabled(on) { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.replay = !!on; localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
const seenKey = (code, playerId) => `bba.replay.${code}.${playerId || 'spectator'}`;
export function seenSeq(code, playerId) { try { return Number(localStorage.getItem(seenKey(code, playerId))) || 0; } catch { return 0; } }
export function markSeen(code, seq, playerId) { try { if (seq > seenSeq(code, playerId)) localStorage.setItem(seenKey(code, playerId), String(seq)); } catch { /* ignore */ } }

/**
 * Replay every retained unseen public entry, including earlier hands and text-only updates.
 * An action taken by this player is not evidence that they watched the preceding activity.
 */
export function pickReplay(log, { seen = 0, noGags = false, noSmoke = false, muted = () => false } = {}) {
  return (log || []).filter((e) => Number.isInteger(e.seq) && e.seq > seen)
    .filter((e) => !(e.ev?.k === 'gag' && (noGags || muted(e.ev.from))) && !(e.ev?.k === 'smoke' && noSmoke) && !(e.ev?.k === 'show' && (noGags || muted(e.ev.from))))
    .map((e) => ({ k: 'notice', ...e.ev, seq: e.seq, hand: e.hand, text: e.text, t: e.t }));
}

/** Keep the recap brisk without making longer public messages unreadable. */
export function stepMs(step, reduced = false) {
  if (step.k === 'show') return reduced ? 2600 : 5600; // v52 spectacles: the overlay's length (Spectacle.jsx)
  return Math.max(reduced ? 1400 : 900, Math.min(3500, (step.text || '').length * 32), ['smoke', 'gag'].includes(step.k) ? 1600 : 0); }

// v43: visual turn replay. Pure helpers (tested in node) + the tiny per-device settings/state.
// The server log carries {seq, hand, ev}; ev is public only (actions, posts, deals of board cards, pot pushes).
const KEY = 'bba.fx';
export function replayEnabled() { try { return JSON.parse(localStorage.getItem(KEY) || '{}').replay !== false; } catch { return true; } }
export function setReplayEnabled(on) { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.replay = !!on; localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
export function seenSeq(code) { try { return Number(localStorage.getItem(`bba.replay.${code}`)) || 0; } catch { return 0; } }
export function markSeen(code, seq) { try { if (seq > seenSeq(code)) localStorage.setItem(`bba.replay.${code}`, String(seq)); } catch { /* ignore */ } }

/**
 * Which events to replay. Players: everything since their own last action (or what this device last showed, whichever
 * is later), skipping their own moves. Spectators/new viewers: since last shown, or the start of the current hand.
 * Only the current hand and the pot push of the hand before it are kept (the condensed "while you were away").
 */
export function pickReplay(log, { mySeat = null, seen = 0, handNo = null } = {}) {
  const evs = (log || []).filter((e) => e.ev && Number.isInteger(e.seq));
  if (!evs.length) return [];
  const maxSeq = evs.at(-1).seq;
  let from = seen;
  if (mySeat !== null && mySeat !== undefined) {
    const mine = evs.filter((e) => e.ev.k === 'act' && e.ev.seat === mySeat && e.ev.a !== 'post').at(-1);
    if (mine) from = Math.max(from, mine.seq);
  }
  if (!from) { // first look at this table on this device: just the current hand
    const start = evs.filter((e) => e.ev.k === 'hand').at(-1);
    from = start ? start.seq - 1 : maxSeq;
  }
  const cur = handNo ?? evs.at(-1).hand;
  return evs.filter((e) => e.seq > from && (e.hand === cur || (e.hand === cur - 1 && e.ev.k === 'win')) && !(e.ev.k === 'act' && e.ev.seat === mySeat) && e.ev.k !== 'hand')
    .map((e) => ({ seq: e.seq, hand: e.hand, ...e.ev }));
}

/** Per-step duration: 0.5-0.8 s each, the whole thing capped near 4 s (faster when there are many). */
export function stepMs(n) { if (!n) return 0; return Math.round(Math.max(220, Math.min(800, 4000 / n, n <= 3 ? 800 : 650))); }

/** What the felt should show at step i (0-based, during step i): how many board cards and the pot. */
export function frameAt(steps, i, finalBoard, finalPot) {
  let board = null; let pot = null;
  for (let k = 0; k <= i && k < steps.length; k++) { if (steps[k].k === 'deal') board = steps[k].board; if (steps[k].pot !== undefined) pot = steps[k].pot; }
  if (board === null) { const d = steps.find((s) => s.k === 'deal'); board = d ? d.board - d.cards.length : finalBoard; }
  if (pot === null) pot = finalPot;
  return { board, pot };
}

export function label(s) {
  if (s.k === 'deal') return s.street[0].toUpperCase() + s.street.slice(1);
  if (s.k === 'win') return 'Pot';
  return { fold: 'Fold', check: s.auto ? 'auto-check' : 'Check', call: `Call ${s.amt}`, bet: `Bet ${s.amt}`, raise: `Raise to ${s.to}`, allin: `All-in ${s.amt}`, post: `Blind ${s.amt}` }[s.a] || s.a;
}

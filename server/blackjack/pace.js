// Manual dealing is only a presentation clock over the same engine.
// Autopilot (the default) is today's automatic dealing. A stalled manual dealer
// is advanced after STALL_MS so a hand never sticks. The shoe still decides every card.
export const STALL_MS = 8000;

/** True only on a classic (non-continuous) table with a human house who turned autopilot off. */
export function isManual(t) {
  return t.house?.mode === 'player' && t.house.autopilot === false && !t.settings?.continuous;
}

/** Interlaced deal order: a card to each hand, the upcard, a second card to each hand, the hole. */
export function buildDealQueue(r) {
  const q = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < r.hands.length; i++) q.push({ k: 'h', hand: i, n: pass + 1 });
    q.push({ k: 'd', n: pass + 1, down: pass === 1 });
  }
  return q;
}

/** How many cards of the initial deal are already shown. Null when not in the paced-deal phase. */
export function paceShown(r) {
  if (!r || r.phase !== 'dealing' || !r.dealQueue) return null;
  const shown = { d: 0, hands: {} };
  for (let i = 0; i < (r.dealStep || 0); i++) {
    const ev = r.dealQueue[i];
    if (ev.k === 'd') shown.d = ev.n;
    else shown.hands[ev.hand] = ev.n;
  }
  return shown;
}

/** Button / status for the dealer: what their next manual action is. */
export function dealerPrompt(t) {
  const r = t.round;
  if (!isManual(t) || !r) return { autopilot: false, action: null, label: 'Autopilot is off', stallAt: r?.deadline || null };
  if (r.phase === 'dealing') {
    const ev = r.dealQueue?.[r.dealStep];
    const label = !ev ? 'Dealt' : ev.k === 'd' && ev.down ? 'Slide the hole card' : ev.k === 'd' ? 'Deal the upcard' : 'Deal the next card';
    return { autopilot: false, action: ev ? 'deal' : null, label, stallAt: r.deadline || null, step: r.dealStep || 0, total: r.dealQueue?.length || 0 };
  }
  if (r.pending) {
    return { autopilot: false, action: 'flip', label: r.pending.k === 'split' ? 'Give the split hand its card' : 'Flip their card', stallAt: r.deadline || null };
  }
  if (r.phase === 'dealer' && r.dealerAct) {
    const flip = r.dealerAct === 'flip' || r.dealerAct === 'flip-bj';
    return { autopilot: false, action: flip ? 'flip' : 'draw', label: flip ? 'Flip the hole card' : 'Draw to the house rule', stallAt: r.deadline || null };
  }
  return { autopilot: false, action: null, label: r.phase === 'betting' ? 'Waiting on bets' : r.phase === 'play' ? 'Waiting on a player' : r.phase === 'insurance' ? 'Insurance is out' : 'The house is still', stallAt: r.deadline || null };
}

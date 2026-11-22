// Table "fun" settings and the all-in-loser bit's timeline. Pure helpers (tested in node) + localStorage.
import { getModes } from '../modes/store.js';

const KEY = 'bba.fx';
const SEEN = 'bba.bitSeen';

export function bitEnabled() { try { return JSON.parse(localStorage.getItem(KEY) || '{}').bit !== false; } catch { return true; } }
export function setBitEnabled(on) { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.bit = !!on; localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

/** Once per losing all-in per device: returns true the first time this (table, hand, seat) is claimed. */
/** Fight gore (cartoon blood and the KO fatalities). Default on; off gives a harmless knock-out with no blood. Family Mode forces off on this device. */
export function goreEnabled() {
  try { if (getModes().safe) return false; } catch { /* store unavailable */ }
  try { return JSON.parse(localStorage.getItem(KEY) || '{}').gore !== false; } catch { return true; }
}
export function setGoreEnabled(on) { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.gore = !!on; localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
export function claimBit(code, number, seat, store = globalThis.localStorage) {
  const k = `${code}:${number}:${seat}`;
  try {
    const seen = JSON.parse(store.getItem(SEEN) || '[]');
    if (seen.includes(k)) return false;
    seen.push(k);
    store.setItem(SEEN, JSON.stringify(seen.slice(-60)));
    return true;
  } catch { return true; }
}

/** Which losers to show now: fresh (ended in the last 15 minutes), not seen yet. */
export const BIT_FRESH_MS = 15 * 60 * 1000;
export function bitQueue(view, now) {
  const lh = view?.lastHand;
  if (!lh?.allInLosers?.length || !lh.endedAt || now - lh.endedAt > BIT_FRESH_MS) return [];
  return lh.allInLosers.map((l) => ({ ...l, number: lh.number }));
}

/**
 * Timeline (ms) for one bit with n punchers: climb onto the table, spread 'em, each puncher takes a turn
 * (walk in, wind up, POW, walk back), then a dazed finale. 4-6 seconds total whatever the table size.
 */
export function bitPlan(n) {
  const climb = 1100, spread = 550, finale = 900;
  const slot = n ? Math.max(420, Math.min(1500, 3000 / n)) : 0;
  const punches = [];
  let t = climb + spread;
  for (let i = 0; i < n; i++) { punches.push({ start: t, hit: t + slot * 0.55, end: t + slot }); t += slot; }
  return { climb: [0, climb], spread: [climb, climb + spread], punches, finale: [t, t + finale], total: t + finale };
}

const SWEEP_SEEN = 'bba.sweepSeen';

/**
 * Timeline for the clean-sweep sit-down. n is how many busted avatars the winner visits
 * (close-up is always 1). Tight enough for phones; not so fast the squat is a blink.
 */
export function sweepPlan(n, { closeup = false } = {}) {
  const count = Math.max(0, n | 0);
  const intro = closeup ? 420 : 900;
  const approach = closeup ? 180 : 420;
  const bags = 5;
  const bag = 170;
  const settle = 160;
  const outro = closeup ? 600 : 500;
  const visits = [];
  let t = intro;
  for (let i = 0; i < count; i++) {
    const start = t;
    const bag0 = t + approach;
    const end = bag0 + bags * bag + settle;
    visits.push({ i, start, bag0, bags, bag, end });
    t = end;
  }
  return { intro: [0, intro], visits, outro: [t, t + outro], total: t + outro, closeup };
}

/** Once per sweep id per device (server also records seen per player). */
export function claimSweep(code, id, store = globalThis.localStorage) {
  if (!id) return true;
  const k = `${code}:${id}`;
  try {
    const seen = JSON.parse(store.getItem(SWEEP_SEEN) || '[]');
    if (seen.includes(k)) return false;
    seen.push(k);
    store.setItem(SWEEP_SEEN, JSON.stringify(seen.slice(-40)));
    return true;
  } catch { return true; }
}

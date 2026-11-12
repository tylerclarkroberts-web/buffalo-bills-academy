// Pure helpers for the table-side hatched-bug companion (Hold'em + blackjack).
export const MASSAGE_MIN_MS = 20_000;
export const MASSAGE_MAX_MS = 45_000;
export const MASSAGE_ANIM_MS = 3_600;
export const MASSAGE_RETRY_MS = 4_000;

export function showTableBug(bug) {
  return !!(bug && bug.species);
}

/** No massages while the viewer has an action prompt, during a showdown/deal reveal, or when motion is reduced. */
export function canStartMassage({ reduced = false, myAction = false, busy = false } = {}) {
  return !reduced && !myAction && !busy;
}

export function nextMassageDelay(rand = Math.random) {
  const span = MASSAGE_MAX_MS - MASSAGE_MIN_MS;
  const t = typeof rand === 'function' ? rand() : Number(rand);
  const u = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return MASSAGE_MIN_MS + Math.min(span, Math.floor(u * (span + 1)));
}

/** First wait, staggered by seat so neighbouring bugs are not in lockstep. */
export function initialMassageDelay(playerId, rand = Math.random) {
  const s = String(playerId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const span = MASSAGE_MAX_MS - MASSAGE_MIN_MS;
  return MASSAGE_MIN_MS + (h % (span + 1) + Math.floor((typeof rand === 'function' ? rand() : 0) * 1_000)) % (span + 1);
}

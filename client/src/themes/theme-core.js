// Pure rules for the multi-table themes (no DOM, no React) so node --test can check them.
// The theme follows how many tables are open together in the multi-table view:
//   1 = saloon (the normal look), 2 = jade (a second palette), 3 = anime, 4 = arcade (the free-console room).
export const THEMES = {
  saloon: { name: 'Saloon', tables: 1 },
  jade: { name: 'Jade Lounge', tables: 2 },
  anime: { name: 'Anime', tables: 3 },
  arcade: { name: 'Arcade', tables: 4 },
};
export const MAX_TABLES = 4;

/** Theme for n tables in view. Plain mode (themes switched off) always gives the normal saloon look. */
export function themeForCount(n, { plain = false } = {}) {
  if (plain || !(n >= 2)) return 'saloon';
  if (n === 2) return 'jade';
  if (n === 3) return 'anime';
  return 'arcade';
}

/** Which of my tables go into the multi view: the ones asked for (if I'm seated there), else all seated tables. Max 4. */
export function pickTables(myTables, wanted = []) {
  const open = myTables.filter((t) => t.seated && t.status !== 'closed');
  const byCode = new Map(open.map((t) => [t.code, t]));
  const chosen = wanted.length ? wanted.map((c) => byCode.get(String(c).toUpperCase())).filter(Boolean) : open;
  return [...new Set(chosen.map((t) => t.code))].slice(0, MAX_TABLES);
}

/** The next pane waiting on me, after the one in focus (wraps around). null if none. */
export function nextTurn(codes, turns, focus) {
  if (!codes.length) return null;
  const start = Math.max(0, codes.indexOf(focus));
  for (let k = 1; k <= codes.length; k++) {
    const c = codes[(start + k) % codes.length];
    if (turns[c]) return c;
  }
  return null;
}

/**
 * Anime emotes per seat, from the table view alone: { seat: ['sweat'] , ... }.
 * fold = sweat drop, win = sparkles (+ blush on a big pot), showdown loss or bust = anger vein,
 * all-in = speed lines, a big pot still in play = shock lines for everyone still in it.
 */
export const EMOTES = ['sweat', 'anger', 'sparkle', 'blush', 'shock', 'speed'];
export function emotesFor(view) {
  const out = {};
  if (!view) return out;
  const bb = view.settings?.bigBlind || 1;
  const big = (n) => n >= 20 * bb;
  const hand = view.hand;
  if (hand) {
    view.seats.forEach((s, i) => {
      if (!s) return;
      if (s.folded) out[i] = ['sweat'];
      else if (s.allIn) out[i] = ['speed'];
      else if (big(hand.pot) && s.inHand) out[i] = ['shock'];
    });
    return out;
  }
  const lh = view.lastHand;
  if (!lh) return out;
  const won = new Map((lh.winners || []).map((w) => [w.seat, w.amount]));
  const bust = new Set((lh.allInLosers || []).map((l) => l.seat));
  view.seats.forEach((s, i) => {
    if (!s) return;
    if (won.has(i)) out[i] = big(won.get(i)) ? ['sparkle', 'blush'] : ['sparkle'];
    else if (bust.has(i) || lh.shown?.[i]) out[i] = ['anger'];
  });
  return out;
}

/** The geisha brings tea every few hands (on hands 5, 10, 15, ...). */
export const TEA_EVERY = 5;
export const teaDue = (handNumber, every = TEA_EVERY) => Number.isInteger(handNumber) && handNumber >= every && handNumber % every === 0;

/** Arcade Guntrad's robot moments: a deterministic little schedule so it's testable. */
export const ROBOT_MOVES = ['glitch', 'beep', 'spin', 'servo', 'sparks'];
export function robotMove(n, reduced = false) {
  if (reduced) return 'beep'; // no motion: just the speech bubble
  return ROBOT_MOVES[((n * 7) + 3) % ROBOT_MOVES.length];
}

/** Japanese line bank check: only Japanese script, Japanese punctuation and full-width forms (no ASCII at all). */
export const JA_ONLY = /^[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF\uFF01-\uFF5E]+$/u;

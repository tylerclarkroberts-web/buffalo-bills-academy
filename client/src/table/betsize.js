// Bet sizing for the raise panel: steps, pot presets and a slider that is precise where it matters.
// Pure functions (no DOM) so the rounding rules can be tested with node --test.
//
// The old slider ran in a straight line from the minimum raise to all-in. With a 5,000 stack on a phone that is
// about 25 chips per pixel, so "raise to 45" was impossible to hit. Here the slider is curved: most of its travel
// covers the small sizes, and the − / + buttons move one small blind (or one big blind) at a time.

export const SLIDER_MAX = 1000;

const clampTo = (v, min, max) => Math.max(min, Math.min(max, v));

/** Keep an amount inside the legal range, as a whole number of chips. Anything unreadable becomes the minimum. */
export function clampBet(v, min, max) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clampTo(n, min, max) : min;
}

/**
 * Move to the next multiple of `step` in the direction of `dir` (+1 / -1). An off-grid amount (a pot preset such
 * as 333) lands on the grid first: +5 gives 335, -5 gives 330. The minimum and all-in are always reachable.
 */
export function stepBet(amount, dir, step, min, max) {
  const s = Math.max(1, Math.round(step));
  const a = clampBet(amount, min, max);
  const next = dir > 0 ? Math.floor(a / s) * s + s : Math.ceil(a / s) * s - s;
  return clampTo(next, min, max);
}

// A straight line is fine while the range is small; past this ratio the low end gets too cramped to use.
const CURVE_FROM = 8;
const curved = (min, max) => min > 0 && max / min > CURVE_FROM;

/** Slider position (0..SLIDER_MAX) to an amount, snapped to `step`. Both ends are exact. */
export function sliderToBet(pos, min, max, step = 1) {
  if (!(max > min)) return min;
  const p = clampTo(Number(pos) || 0, 0, SLIDER_MAX) / SLIDER_MAX;
  if (p <= 0) return min;
  if (p >= 1) return max;
  const raw = curved(min, max) ? min * (max / min) ** p : min + (max - min) * p;
  const s = Math.max(1, Math.round(step));
  return clampTo(Math.round(raw / s) * s, min, max);
}

/** The slider position that shows a given amount. */
export function betToSlider(amount, min, max) {
  if (!(max > min)) return 0;
  const a = clampTo(Number(amount) || min, min, max);
  const p = curved(min, max) ? Math.log(a / min) / Math.log(max / min) : (a - min) / (max - min);
  return Math.round(clampTo(p, 0, 1) * SLIDER_MAX);
}

/**
 * Quick sizes: [label, amount] pairs. Pot sizes are "raise to" amounts measured after calling, rounded to `step`.
 * Sizes that fall outside the legal range collapse onto Min or All-in, so duplicates are dropped.
 */
export function betPresets({ min, max, pot, toCall, currentBet, step = 1 }) {
  const s = Math.max(1, Math.round(step));
  const after = pot + toCall;
  const size = (f) => clampTo(Math.round((currentBet + after * f) / s) * s, min, max);
  const all = [['Min', min], ['½ pot', size(0.5)], ['¾ pot', size(0.75)], ['Pot', size(1)], ['All-in', max]];
  const seen = new Set([min, max]);
  return all.filter(([, v], i) => {
    if (i === 0) return true;
    if (i === all.length - 1) return max !== min;
    if (seen.has(v)) return false;
    seen.add(v); return true;
  });
}

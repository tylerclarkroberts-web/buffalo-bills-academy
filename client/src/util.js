export function formatLeft(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}
export function formatDuration(sec) {
  if (sec % 86400 === 0) return `${sec / 86400} day${sec === 86400 ? '' : 's'}`;
  if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? '' : 's'}`;
  if (sec % 60 === 0) return `${sec / 60} minute${sec === 60 ? '' : 's'}`;
  return `${sec} seconds`;
}
export const chips = (n) => Number(n).toLocaleString();
const DENOMS = [[1, '#f2ede4'], [5, '#e0352b'], [25, '#1f8a5b'], [100, '#151515'], [500, '#7c5cff'], [1000, '#e8b04a']];
/**
 * An amount as piles of chips on the felt: [[colour, count], ...], smallest chip first, `cap` chips to a pile.
 * Each colour keeps its change plus one bigger chip broken down, so 525 is four real piles instead of two chips.
 */
export function chipPiles(amount, cap = 10) {
  const out = []; let left = Math.max(0, Math.floor(amount));
  DENOMS.forEach(([v, c], i) => {
    const up = DENOMS[i + 1]?.[0];
    // ponytail: the top chip stops at three piles, so past ~30k the picture stops growing. Add a bigger chip if tables get there.
    let n = up ? (left % up) / v : Math.min(left / v, cap * 3);
    if (up && left - n * v >= up && n + up / v <= cap) n += up / v;
    left -= n * v;
    for (; n > 0; n -= cap) out.push([c, Math.min(n, cap)]);
  });
  return out;
}
export const signed =(n) => (n > 0 ? `+${chips(n)}` : n < 0 ? `−${chips(-n)}` : '0');
export const money = (n, { sign = false } = {}) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : sign && n > 0 ? '+' : ''}$${s}`;
};
export const price = (p) => {
  if (p === null || p === undefined) return '—';
  if (p >= 1) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  if (p <= 0) return '$0';
  // tiny coin prices: keep about 3 significant digits without scientific notation
  return `$${p.toFixed(Math.min(12, 3 - Math.floor(Math.log10(p))))}`;
};
export const units = (u) => (u >= 1000 ? u.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Number(u.toPrecision(6)).toString());
export const pct = (x) => `${(x * 100).toFixed(1)}%`;

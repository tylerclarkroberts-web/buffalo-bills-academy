// Pure, testable core of Guntrad's line picker (no JSON import so node --test can load it).
// A "shuffle bag" per set: every line comes up once before any repeats, and never the same line twice in a row.
export function makeSayer(BANK) {
  const bags = new Map();
  return function guntradSays(set = 'lines', { maxLen = Infinity, mix = 0, rand = Math.random } = {}) {
    if (mix && set !== 'lines' && rand() < mix) set = 'lines'; // sometimes reach into the general bank
    const pool = (BANK[set] || BANK.lines).filter((l) => l.length <= maxLen);
    const key = `${set}|${maxLen}`;
    let b = bags.get(key);
    if (!b || !b.left.length) {
      const left = pool.slice();
      for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
      if (b?.last && left.length > 1 && left.at(-1) === b.last) left.unshift(left.pop());
      b = { left, last: b?.last }; bags.set(key, b);
    }
    b.last = b.left.pop();
    return b.last;
  };
}

/** Local calendar day number (days since 1970-01-01 in the viewer's own time zone). */
export function localDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
}

/**
 * Guntrad's factoid of the day: one line per calendar day, the same for everyone in the same day.
 * Days walk a fixed shuffled order of the bank, so no line repeats until the whole bank has been used.
 */
export function dailyLine(lines, date = new Date()) {
  const n = lines.length; if (!n) return '';
  const order = [...lines.keys()];
  let s = 0x9e3779b9;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const d = localDayNumber(date);
  return lines[order[((d % n) + n) % n]];
}

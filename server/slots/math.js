// v39 slot math: "Three Lil' Squatches" (5 reels x 3 rows, 243 ways, play money). Pure and deterministic given `rng`,
// so the server (crypto RNG) and the simulator (fast seeded RNG) run exactly the same code.
// rng(n) must return a uniform integer in [0, n).
//   cells are numbered reel*3 + row (reel 0..4, row 0..2)
// Features
//   - Acorn Stash (hold & spin): 6+ golden acorns -> they stick, 3 respins, every new acorn sticks and resets to 3.
//     Acorns carry bet multiples or Mini/Minor/Major; all 15 = the Grand.
//   - Rat King Rampage / "The Great Toot": the giant King Rat sometimes waddles in on a base spin, drops extra houses
//     and FARTS every house apart; the squatch who lived in each one is left standing (straw: Pip, sticks: Bramble,
//     stone: Boulder), so the screen fills with the top symbols.
//   - Mansion Upgrade (free spins): 3+ deeds -> 8 free spins (+2 per extra deed). Houses landed fill the meter; each level
//     the rat toots the houses up: L2 every house pays as a stone lodge, L3 as Bramble, L4 MANSIONS (pay as Boulder, and
//     wild on the middle reel). +2 spins a level.
export const LOW = ['acorn', 'shroom', 'cone', 'berry'];
export const HOUSES = ['straw', 'sticks', 'stone'];
export const SQUATCH = ['pip', 'bramble', 'boulder'];
export const PAYING = [...LOW, ...HOUSES, ...SQUATCH];
export const WILD = 'W', DEED = 'S', GOLD = 'G';
export const PAYS_RAW = { // x bet, per way, for 3/4/5 of a kind (scaled by PAY_SCALE)
  acorn: [0.1, 0.2, 0.5], shroom: [0.1, 0.2, 0.5], cone: [0.1, 0.25, 0.6], berry: [0.15, 0.3, 0.75],
  straw: [0.2, 0.5, 1], sticks: [0.25, 0.6, 1.25], stone: [0.3, 0.75, 1.5],
  pip: [0.4, 1, 2.5], bramble: [0.5, 1.5, 4], boulder: [0.75, 2, 6],
};
export const CFG = {
  payScale: 4.65,
  // per-cell weights per reel (x10 integers below)
  base: {
    acorn: [14, 14, 14, 14, 14], shroom: [14, 14, 14, 14, 14], cone: [13, 13, 13, 13, 13], berry: [13, 13, 13, 13, 13],
    straw: [8, 8, 8, 8, 8], sticks: [7, 7, 7, 7, 7], stone: [6, 6, 6, 6, 6],
    pip: [4, 4, 4, 4, 4], bramble: [3.5, 3.5, 3.5, 3.5, 3.5], boulder: [3, 3, 3, 3, 3],
    W: [0, 2.5, 2.5, 2.5, 0], S: [2.5, 2.5, 2.5, 2.5, 2.5], G: [11, 11, 11, 11, 11],
  },
  freeExtraHouse: -4,     // free spins: no deeds or acorns, and fewer houses (the upgrades make each one count)
  tootOdds: 160,          // 1 in N base spins
  tootAdd: [5, 9],        // houses the rat drops before the toot
  stashMin: 6, respins: 3, respinHit: 55, // per empty cell, per respin, out of 1000
  acornVals: [[1, 300], [2, 250], [3, 150], [5, 120], [8, 80], [10, 50], [15, 30], ['MINI', 12], ['MINOR', 4], ['MAJOR', 0.8]],
  jackpots: { MINI: 20, MINOR: 50, MAJOR: 200, GRAND: 1000 },
  freeSpins: 8, freeMin: 3, levelAt: [6, 14, 24], levelBonus: 2,
  maxWin: 2500,
};

function table(weights) { // -> { syms, cum, total } per reel, integer weights
  return [0, 1, 2, 3, 4].map((r) => {
    const syms = []; const cum = []; let t = 0;
    for (const [s, w] of Object.entries(weights)) { const v = Math.round(w[r] * 10); if (v > 0) { t += v; syms.push(s); cum.push(t); } }
    return { syms, cum, total: t };
  });
}
function pick(tb, rng) { const x = rng(tb.total); let i = 0; while (tb.cum[i] <= x) i++; return tb.syms[i]; }
function pickVal(vals, total, rng) { let x = rng(total); for (const [v, w] of vals) { x -= w; if (x < 0) return v; } return vals[0][0]; }

export function build(cfg = CFG) {
  const free = {}; for (const [s, w] of Object.entries(cfg.base)) free[s] = [...w];
  free.S = [0, 0, 0, 0, 0]; free.G = [0, 0, 0, 0, 0];
  for (const h of HOUSES) free[h] = free[h].map((w) => w + cfg.freeExtraHouse);
  const acornVals = cfg.acornVals.map(([v, w]) => [v, Math.round(w * 10)]);
  return { cfg, base: table(cfg.base), free: table(free), acornVals, acornTotal: acornVals.reduce((a, [, w]) => a + w, 0), pays: Object.fromEntries(Object.entries(PAYS_RAW).map(([k, v]) => [k, v.map((x) => x * cfg.payScale)])) };
}
export const M = build();

const valX = (v, cfg) => (typeof v === 'number' ? v : cfg.jackpots[v]);

/** 243-ways evaluation. Wilds substitute for every paying symbol; an all-wild way pays as Boulder. */
export function evaluate(grid, m = M) {
  const wins = []; let total = 0;
  const wc = [0, 0, 0, 0, 0];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (grid[r * 3 + k] === WILD) wc[r]++;
  for (const s of PAYING) {
    let ways = 1, wild = 1, n = 0;
    for (let r = 0; r < 5; r++) {
      let c = 0; for (let k = 0; k < 3; k++) if (grid[r * 3 + k] === s) c++;
      if (c + wc[r] === 0) break;
      ways *= c + wc[r]; wild *= wc[r]; n++;
    }
    const real = ways - wild; // ways with at least one real symbol (all-wild ways are paid once, as Boulder, below)
    if (n >= 3 && real > 0) { const pay = m.pays[s][n - 3] * real; wins.push({ sym: s, n, ways: real, pay }); total += pay; }
  }
  let n = 0, ways = 1; for (let r = 0; r < 5 && wc[r]; r++) { ways *= wc[r]; n++; }
  if (n >= 3) { const pay = m.pays.boulder[n - 3] * ways; const w = wins.find((x) => x.sym === 'boulder'); if (w) { w.ways += ways; w.pay += pay; } else wins.push({ sym: 'boulder', n, ways, pay }); total += pay; }
  return { wins, total };
}

function draw(tb, rng, m) {
  const grid = new Array(15); const vals = new Array(15).fill(null);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) {
    const s = pick(tb[r], rng); grid[r * 3 + k] = s;
    if (s === GOLD) vals[r * 3 + k] = pickVal(m.acornVals, m.acornTotal, rng);
  }
  return { grid, vals };
}

/** One paid spin. Returns everything the client needs to replay it, amounts in bet multiples (x). */
export function spin(rng, m = M) {
  const { cfg } = m;
  const { grid, vals } = draw(m.base, rng, m);
  const base = evaluate(grid, m);
  const out = { grid, vals, wins: base.wins, baseX: base.total, toot: null, stash: null, free: null };
  let x = base.total;
  // The Great Toot (base game only, not when the spin already triggers a bonus, so features never stack)
  const golds = grid.filter((s) => s === GOLD).length; const deeds = grid.filter((s) => s === DEED).length;
  if (golds < cfg.stashMin && deeds < cfg.freeMin && rng(cfg.tootOdds) === 0) {
    const g2 = [...grid]; const open = []; for (let i = 0; i < 15; i++) if (!HOUSES.includes(g2[i]) && g2[i] !== GOLD && g2[i] !== DEED && g2[i] !== WILD) open.push(i);
    const add = cfg.tootAdd[0] + rng(cfg.tootAdd[1] - cfg.tootAdd[0] + 1); const dropped = [];
    for (let j = 0; j < add && open.length; j++) { const i = open.splice(rng(open.length), 1)[0]; g2[i] = HOUSES[rng(3)]; dropped.push(i); }
    // each house is farted apart and the squatch who lived in it is left standing (straw: Pip, sticks: Bramble, stone: Boulder)
    const blown = []; const g3 = g2.map((s, i) => { const h = HOUSES.indexOf(s); if (h >= 0) { blown.push(i); return SQUATCH[h]; } return s; });
    const ev = evaluate(g3, m);
    out.toot = { dropped, withHouses: g2, blown, grid: g3, wins: ev.wins, x: ev.total };
    x = ev.total; // the toot result replaces the base result (it is the same spin, rearranged)
    out.baseX = 0; out.wins = [];
  }
  if (golds >= cfg.stashMin) {
    const held = vals.map((v, i) => (grid[i] === GOLD ? v : null)); const steps = []; let left = cfg.respins;
    while (left > 0 && held.some((v) => v === null)) {
      const add = []; for (let i = 0; i < 15; i++) if (held[i] === null && rng(1000) < cfg.respinHit) { held[i] = pickVal(m.acornVals, m.acornTotal, rng); add.push({ cell: i, v: held[i] }); }
      left = add.length ? cfg.respins : left - 1; steps.push({ add, left });
    }
    const full = held.every((v) => v !== null);
    let sx = held.reduce((a, v) => a + (v === null ? 0 : valX(v, cfg)), 0); if (full) sx += cfg.jackpots.GRAND;
    out.stash = { start: held.map((v, i) => (grid[i] === GOLD ? vals[i] : null)), steps, held, full, x: sx };
    x += sx;
  }
  if (deeds >= cfg.freeMin) {
    let spinsLeft = cfg.freeSpins + (deeds - cfg.freeMin) * 2; let level = 1, meter = 0; const spins = []; let fx = 0;
    while (spinsLeft > 0 && spins.length < 60) {
      spinsLeft--;
      const d = draw(m.free, rng, m); const g = d.grid;
      const landed = g.filter((s) => HOUSES.includes(s)).length;
      // the upgrade: L2 every house is a stone lodge, L3 Bramble's, L4 MANSIONS (Boulder's; wild on the middle reel)
      const shown = level === 1 ? g : g.map((s, i) => (HOUSES.includes(s) ? (level === 2 ? 'stone' : level === 3 ? 'bramble' : (i >= 6 && i < 9 ? WILD : 'boulder')) : s));
      const ev = evaluate(shown, m);
      fx += ev.total; meter += landed;
      let up = 0; while (level < 4 && meter >= cfg.levelAt[level - 1]) { level++; up++; spinsLeft += cfg.levelBonus; }
      spins.push({ grid: g, shown, wins: ev.wins, x: ev.total, landed, meter, level, up, left: spinsLeft });
    }
    out.free = { deeds, spins, x: fx, level };
    x += fx;
  }
  out.capped = x > cfg.maxWin; out.x = Math.min(x, cfg.maxWin);
  return out;
}

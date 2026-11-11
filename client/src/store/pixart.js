// v36: original pixel-art icons for the General Store's oddities and gags (and, in v37, tobacco), in the spirit of
// 2000s handheld RPG item icons: 32x32, a small palette per icon, a dark outline and a single highlight, scaled up with
// nearest-neighbour. Every icon is drawn here from primitives (no image files, no borrowed sprites).
// pixGrid(name) -> { w, h, px: Array<string|null> } (pure, so tests and a node preview can use it too).
const N = 32;
const OUT = '#281c24';

function canvas() {
  const px = new Array(N * N).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c; };
  const g = {
    px, set,
    rect: (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); return g; },
    ell: (cx, cy, rx, ry, c, f = () => true) => { for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) { const d = ((i - cx) / (rx + 0.35)) ** 2 + ((j - cy) / (ry + 0.35)) ** 2; if (d <= 1 && f(i, j)) set(i, j, c); } return g; },
    ring: (cx, cy, r0, r1, c, f = () => true) => { for (let j = Math.floor(cy - r1); j <= Math.ceil(cy + r1); j++) for (let i = Math.floor(cx - r1); i <= Math.ceil(cx + r1); i++) { const d = Math.hypot(i - cx, j - cy); if (d >= r0 && d <= r1 + 0.3 && f(i, j)) set(i, j, c); } return g; },
    poly: (pts, c) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); for (let j = Math.floor(Math.min(...ys)); j <= Math.ceil(Math.max(...ys)); j++) for (let i = Math.floor(Math.min(...xs)); i <= Math.ceil(Math.max(...xs)); i++) { let inn = false; const x = i + 0.5, y = j + 0.5; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inn = !inn; } if (inn) set(i, j, c); } return g; },
    line: (x0, y0, x1, y1, c, w = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n; if (w <= 1) set(x, y, c); else for (let j = -w; j <= w; j++) for (let i = -w; i <= w; i++) if (i * i + j * j <= (w / 2) ** 2 + 0.25) set(x + i, y + j, c); } return g; },
    dots: (list, c) => { for (const [x, y] of list) set(x, y, c); return g; },
  };
  return g;
}
/** Dark outline around everything drawn (4-neighbour), like a GBA item sprite. */
function outline(px) {
  const o = px.slice();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (px[y * N + x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < N && Y < N && px[Y * N + X] && px[Y * N + X] !== OUT; })) o[y * N + x] = OUT;
  }
  return o;
}

const ART = {
  // ---------- oddities ----------
  lamp: (g) => { g.ell(15, 21, 10, 5, '#c89838').ell(13, 19, 6, 2, '#f0d070').poly([[22, 18], [30, 15], [30, 17], [24, 22]], '#c89838').rect(12, 25, 8, 3, '#8a6020').ring(5, 20, 2, 3.5, '#8a6020', (i) => i < 7).rect(29, 13, 1, 2, '#e8e0d0').rect(29, 11, 1, 2, '#6a6a6a'); g.dots([[11, 22], [12, 23], [18, 23]], '#8a6020'); },
  wagon: (g) => { g.ell(15, 15, 12, 10, '#f0ead8', (i, j) => j <= 15).rect(3, 15, 25, 6, '#a0602c').rect(3, 15, 25, 1, '#c88040'); for (const x of [8, 14, 20]) g.line(x, 6, x, 15, '#c8bea0'); g.ring(8, 24, 2, 4, '#5a3818').ring(23, 24, 2, 4, '#5a3818').dots([[8, 24], [23, 24]], '#5a3818').line(28, 19, 31, 22, '#5a3818'); g.dots([[9, 9], [10, 8], [11, 8]], '#ffffff'); },
  vaccine: (g) => { g.line(6, 26, 9, 23, '#9a9aa8', 1).line(9, 23, 21, 11, '#d8ecf8', 5).line(11, 21, 17, 15, '#e05050', 3).line(21, 11, 24, 8, '#8a8a98', 3).line(24, 8, 27, 5, '#5a5a6a', 1).line(26, 3, 29, 6, '#5a5a6a', 2).line(4, 28, 6, 26, '#b8b8c8'); g.dots([[12, 18], [14, 16]], '#ffffff'); },
  anvil: (g) => { g.poly([[3, 9], [26, 9], [29, 12], [22, 14], [20, 14], [20, 19], [11, 19], [11, 14], [8, 14]], '#5a5e6e').rect(8, 19, 15, 3, '#4a4e5c').rect(6, 22, 19, 5, '#3c3f4c').rect(4, 9, 22, 1, '#9aa0b4').rect(12, 15, 7, 1, '#7a7f92').rect(7, 23, 17, 1, '#5a5e6e'); },
  deed: (g) => { g.rect(6, 6, 20, 20, '#f0e0b0').rect(4, 4, 24, 3, '#d8c088').rect(4, 25, 24, 3, '#d8c088').rect(4, 4, 24, 1, '#f8f0d0'); for (const y of [10, 13, 16]) g.rect(9, y, 14, 1, '#a89060'); g.ell(20, 21, 4, 4, '#f0d040').ell(19, 20, 1, 1, '#c8a020').dots([[22, 22], [21, 23]], '#c8a020').line(15, 22, 13, 28, '#c03030', 1).line(16, 22, 18, 29, '#c03030', 1); },
  spittoon: (g) => { g.ell(16, 21, 10, 7, '#c8902c').ell(16, 11, 9, 3, '#e0b048').ell(16, 11, 6, 1.5, '#4a2c10').rect(11, 13, 10, 3, '#a87420').ell(16, 28, 7, 1.5, '#8a5c18').rect(9, 18, 2, 5, '#f8e090').rect(8, 20, 1, 2, '#f8e090'); },
  rock: (g) => { g.poly([[4, 24], [7, 13], [13, 8], [21, 9], [27, 15], [29, 25], [22, 28], [10, 28]], '#8a8a90').poly([[8, 15], [13, 10], [19, 10], [14, 15]], '#b4b4bc').dots([[20, 19], [12, 22], [24, 23], [17, 25], [9, 19]], '#6a6a72').rect(5, 25, 24, 3, '#6e6e76'); },
  telegraph: (g) => { g.rect(2, 22, 28, 6, '#8a5428').rect(2, 22, 28, 1, '#b07038').line(7, 19, 25, 15, '#d0a040', 2).rect(6, 17, 3, 5, '#a07028').ell(25, 13, 4, 2.5, '#2a2a30').ell(24, 12, 1.5, 0.7, '#6a6a78').rect(16, 19, 3, 3, '#b0b0b8').rect(20, 25, 2, 1, '#d0a040').rect(10, 25, 2, 1, '#d0a040'); },
  snakeoil: (g) => { g.rect(13, 3, 6, 4, '#a07040').rect(12, 7, 8, 4, '#3a8a4a').poly([[12, 11], [20, 11], [25, 16], [25, 28], [7, 28], [7, 16]], '#3a8a4a').rect(9, 16, 14, 9, '#f0e0b0').line(11, 22, 13, 19, '#c03030').line(13, 19, 16, 22, '#c03030').line(16, 22, 19, 19, '#c03030').rect(20, 19, 1, 1, '#c03030').rect(9, 12, 2, 3, '#a0e0a8').rect(8, 16, 1, 9, '#a0e0a8'); },
  piano: (g) => { g.rect(3, 10, 26, 12, '#f2ead6').rect(3, 10, 26, 2, '#ffffff').rect(1, 8, 4, 16, '#7a4a22').rect(27, 8, 4, 16, '#7a4a22').rect(1, 8, 4, 1, '#a06838').rect(27, 8, 4, 1, '#a06838'); g.dots([[7, 13], [8, 13], [11, 15], [14, 13], [15, 17], [18, 14], [19, 14], [21, 18], [23, 15], [24, 19], [9, 18], [12, 19], [17, 19]], '#3a3040'); g.rect(3, 21, 26, 1, '#c8bea0').poly([[12, 22], [20, 22], [22, 29], [10, 29]], '#f2ead6'); },
  horseshoe: (g) => { g.ring(16, 14, 5, 11, '#8a90a0', (i, j) => j <= 14).rect(5, 14, 6, 13, '#8a90a0').rect(21, 14, 6, 13, '#8a90a0').ring(16, 14, 9, 11, '#c0c6d4', (i, j) => j <= 8 && i < 16).dots([[7, 18], [7, 22], [24, 18], [24, 22], [9, 8], [22, 8], [16, 4]], '#3a3e48').rect(5, 26, 6, 1, '#5a5e6e').rect(21, 26, 6, 1, '#5a5e6e'); },
  sheriffbadge: (g) => { g.rect(3, 6, 26, 20, '#e8dcb8').rect(3, 6, 26, 3, '#4a6ab0').rect(3, 6, 26, 1, '#7a9ad8'); g.poly([[6, 16], [10, 13], [16, 15], [20, 13], [20, 19], [16, 17], [10, 19]], '#5aa0c8').dots([[9, 15]], '#1a1a2a'); for (const y of [21, 23]) g.rect(6, y, 12, 1, '#a89878'); g.ring(24, 19, 2, 4, '#c03030').line(21, 22, 27, 16, '#c03030'); },
  bigrock: (g) => { g.poly([[1, 27], [3, 12], [10, 4], [22, 3], [29, 10], [31, 26], [24, 30], [6, 30]], '#7a7a82').poly([[5, 13], [10, 6], [18, 5], [12, 12]], '#a8a8b2').dots([[20, 16], [11, 20], [25, 22], [16, 25], [7, 17], [23, 9], [14, 14]], '#5e5e66').rect(2, 27, 28, 3, '#5e5e66'); },
  railroad: (g) => { g.rect(2, 5, 28, 22, '#e6eed6').rect(2, 5, 28, 1, '#f6faee').rect(3, 6, 26, 1, '#3a6a4a').rect(3, 25, 26, 1, '#3a6a4a').rect(3, 6, 1, 20, '#3a6a4a').rect(28, 6, 1, 20, '#3a6a4a'); g.rect(8, 13, 11, 5, '#2a2a30').rect(16, 10, 5, 8, '#2a2a30').rect(9, 10, 2, 3, '#2a2a30').rect(17, 11, 3, 2, '#f0d040').dots([[10, 19], [14, 19], [18, 19]], '#5a5a6a').rect(6, 20, 20, 1, '#8a6a4a'); for (const y of [22, 23]) g.rect(8, y, 12, 1, '#a0a890'); g.line(4, 26, 28, 7, '#c03030', 1); },
  // ---------- one of a kind ----------
  charter: (g) => { g.rect(6, 5, 20, 22, '#f0e0b0').ell(16, 5, 11, 1.5, '#d8c088').ell(16, 27, 11, 1.5, '#d8c088').rect(10, 9, 12, 2, '#6a4a2a'); for (const y of [13, 15, 17, 19]) g.rect(9, y, 14, 1, '#a89060'); g.line(9, 23, 15, 22, '#3a3a50').ell(22, 23, 3, 3, '#b03030').ell(21, 22, 1, 1, '#e06060').rect(21, 26, 1, 4, '#b03030').rect(23, 26, 1, 3, '#b03030'); },
  skull: (g) => { g.line(9, 10, 3, 8, '#d8cdb4', 1).line(3, 8, 2, 3, '#d8cdb4', 1).line(23, 10, 29, 8, '#d8cdb4', 1).line(29, 8, 30, 3, '#d8cdb4', 1).poly([[9, 8], [23, 8], [25, 15], [20, 28], [12, 28], [7, 15]], '#ece4d0').rect(10, 9, 12, 1, '#fffaf0').ell(11.5, 15, 2, 2, '#3a2c2c').ell(20.5, 15, 2, 2, '#3a2c2c').rect(15, 21, 1, 5, '#b8a890').rect(17, 21, 1, 5, '#b8a890').dots([[13, 27], [15, 27], [17, 27], [19, 27]], '#b8a890'); },
  pickaxe: (g) => { g.line(7, 28, 21, 9, '#8a5a2c').line(8, 28, 22, 9, '#a8743a').line(9, 28, 23, 9, '#8a5a2c').poly([[8, 7], [17, 3], [27, 7], [30, 15], [26, 10], [18, 8], [10, 10]], '#f0c030').line(11, 7, 18, 4, '#fff0a0').line(18, 4, 25, 7, '#fff0a0').dots([[29, 13], [9, 9]], '#c89818').dots([[4, 4], [28, 2], [13, 13]], '#ffffff'); },
  // ---------- seasonal ----------
  jackolantern: (g) => { g.ell(16, 18, 12, 9, '#e07a28').ell(16, 18, 5, 9, '#f29a40').rect(15, 5, 3, 5, '#5a7a30').poly([[8, 16], [13, 16], [11, 12]], '#ffe070').poly([[19, 16], [24, 16], [21, 12]], '#ffe070').poly([[9, 20], [23, 20], [20, 25], [12, 25]], '#ffe070').dots([[13, 20], [13, 21], [18, 24], [18, 25]], '#e07a28'); },
  ghost: (g) => { g.ell(16, 12, 9, 9, '#f4f2ea').rect(7, 12, 19, 14, '#f4f2ea').rect(23, 13, 2, 12, '#d8d4c8'); for (const x of [10, 16, 22]) g.ell(x, 26, 3, 2, '#f4f2ea'); g.ell(12, 13, 1.5, 2.5, '#2a2430').ell(20, 13, 1.5, 2.5, '#2a2430').rect(9, 29, 5, 2, '#5c4028').rect(18, 29, 5, 2, '#5c4028'); },
  cornucopia: (g) => { g.line(4, 10, 3, 6, '#b07a3a').poly([[4, 10], [10, 7], [20, 12], [27, 18], [27, 27], [18, 26], [10, 20]], '#b07a3a').line(9, 9, 12, 19, '#8a5a24').line(15, 10, 17, 23, '#8a5a24').ell(23, 22, 4, 5, '#6a4420').ell(23, 24, 3, 3, '#e07a28').ell(28, 26, 2.5, 2.5, '#d8c040').ell(20, 27, 2.5, 2, '#7a9a3a').rect(27, 19, 3, 4, '#f8f4e8'); },
  turkey: (g) => { g.ring(14, 17, 0, 13, '#b8552a', (i, j) => j <= 17).ring(14, 17, 11, 13, '#e8c060', (i, j) => j <= 17).ell(15, 20, 8, 7, '#7a4a2a').line(21, 18, 24, 13, '#8a5a36', 1).ell(25, 11, 3, 3, '#8a5a36').poly([[28, 10], [31, 12], [28, 13]], '#e8b030').rect(27, 14, 1, 3, '#c03030').dots([[26, 10]], '#1a1a1a').line(12, 27, 12, 30, '#e8b030').line(18, 27, 18, 30, '#e8b030'); },
  stocking: (g) => { g.ell(15, 4, 3, 2, '#2a2a30').rect(11, 8, 9, 14, '#c03030').ell(18, 24, 8, 4, '#c03030').rect(11, 15, 9, 2, '#2a7a3a').ell(24, 24, 2, 3, '#f4f2ea').rect(9, 5, 13, 5, '#f4f2ea').line(22, 5, 25, 2, '#c8a040'); },
  tumbletree: (g) => { let r = 11; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647); g.rect(13, 27, 7, 3, '#8a5428').ell(16, 18, 10, 9, '#8a6a34', () => rnd() < 0.5).ring(16, 18, 6, 7, '#6e4c24').ring(16, 18, 9, 10, '#6e4c24').dots([[10, 14], [24, 20], [18, 18]], '#e0483c').dots([[21, 12], [13, 23]], '#f0d040').dots([[8, 20], [20, 24], [14, 11]], '#4a8ad8').poly([[16, 2], [19, 8], [13, 8]], '#f0d040').rect(12, 5, 9, 1, '#f0d040'); },
  // ---------- mine hires ----------
  nephew: (g) => { g.rect(9, 26, 14, 5, '#4a6a9a').rect(14, 26, 4, 5, '#c05a30').ell(16, 20, 7, 7, '#e8b890').ell(16, 12, 11, 8, '#f0c030', (i, j) => j <= 13).rect(3, 13, 26, 3, '#d8a820').rect(6, 13, 20, 1, '#fff0a0').ell(16, 8, 2.5, 2.5, '#fff8d0').dots([[13, 20], [19, 20]], '#2a2030').rect(13, 24, 6, 1, '#a04a3a').dots([[10, 22], [22, 22]], '#f0a088'); },
  // ---------- gags ----------
  squirt: (g) => { g.rect(6, 10, 18, 6, '#40c040').rect(24, 11, 5, 3, '#2a8a2a').poly([[8, 16], [14, 16], [12, 27], [5, 27]], '#40c040').rect(14, 16, 4, 4, '#2a8a2a').rect(7, 11, 15, 1, '#a0f0a0').rect(9, 5, 7, 5, '#f08020').rect(10, 6, 2, 2, '#ffd0a0').dots([[30, 10], [31, 9], [30, 14]], '#60b8f8'); },
  soaker: (g) => { g.rect(4, 13, 22, 6, '#f0c020').rect(26, 14, 5, 3, '#e05020').ell(13, 8, 8, 4, '#3080e0').ell(11, 7, 3, 1, '#a0d0ff').rect(6, 19, 5, 9, '#e05020').rect(18, 19, 3, 5, '#e05020').rect(4, 13, 22, 1, '#fff090').rect(1, 14, 3, 4, '#e05020').dots([[13, 12]], '#3080e0'); },
  confetti: (g) => { g.poly([[3, 29], [14, 10], [22, 18]], '#a050d0').line(7, 24, 16, 15, '#f0d040').line(10, 26, 19, 18, '#f0d040').ell(18, 14, 4, 2, '#7a30a8').dots([[22, 6], [26, 10], [19, 4], [28, 15], [24, 3], [29, 7], [21, 10], [26, 18]], '#e04040').dots([[23, 8], [27, 13], [20, 7], [25, 5], [29, 11]], '#40b0f0').dots([[18, 9], [28, 4], [22, 13], [30, 18]], '#40c040'); },
  spaghetti: (g) => { g.line(4, 28, 27, 4, '#f0d890', 2).line(5, 26, 26, 4, '#fff4c8').dots([[15, 17], [16, 16]], '#c8a050').dots([[19, 18], [21, 20], [12, 13]], '#ffffff'); },
  pie: (g) => { g.poly([[3, 20], [29, 20], [26, 27], [6, 27]], '#b0b4c0').rect(3, 20, 26, 1, '#e0e4ec').ell(16, 17, 12, 5, '#fff8f0', (i, j) => j <= 20).ell(9, 13, 3, 3, '#ffffff').ell(16, 11, 4, 4, '#ffffff').ell(23, 13, 3, 3, '#ffffff').rect(4, 19, 24, 1, '#d8a050').ell(16, 7, 1.5, 1.5, '#e03040'); },
  mariachi: (g) => { g.ell(16, 26, 14, 3.5, '#e0c070').poly([[9, 26], [11, 16], [16, 13], [21, 16], [23, 26]], '#e8cc80').rect(10, 22, 12, 2, '#c03020').dots([[6, 26], [12, 27], [20, 27], [26, 26]], '#c03020'); g.line(4, 9, 18, 6, '#f0c040', 1).ell(21, 5, 3, 4, '#f0c040').ell(21, 5, 1.5, 2, '#a07820').rect(9, 7, 2, 3, '#c89020').rect(13, 6, 2, 3, '#c89020'); g.dots([[27, 9], [28, 8], [28, 9], [28, 10], [28, 11], [27, 11], [26, 11], [26, 12]], '#3a3040').dots([[4, 15], [5, 14], [5, 15], [5, 16], [4, 16]], '#3a3040'); },
  tumbleweed: (g) => { let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647); g.ell(16, 17, 10, 9, '#6e4c24', () => rnd() < 0.18); for (let k = 0; k < 26; k++) { const a = rnd() * 6.28, b = a + 1 + rnd() * 2, rr = 4 + rnd() * 7; let px = 16 + Math.cos(a) * rr, py = 17 + Math.sin(a) * rr * 0.9; for (let t = a; t < b; t += 0.25) { const x = 16 + Math.cos(t) * rr, y = 17 + Math.sin(t) * rr * 0.9; g.line(px, py, x, y, k % 3 ? '#b08848' : '#d8b070'); px = x; py = y; } } g.line(16, 27, 14, 30, '#6e4c24'); },
};

const cache = new Map();
export const PIX_NAMES = Object.keys(ART);
export function pixGrid(name) {
  if (cache.has(name)) return cache.get(name);
  const f = ART[name]; if (!f) return null;
  const g = canvas(); f(g);
  const out = { w: N, h: N, px: outline(g.px) };
  cache.set(name, out); return out;
}

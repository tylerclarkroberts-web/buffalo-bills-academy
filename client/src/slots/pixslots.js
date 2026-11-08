// v41: the slot machine's art as original 8-bit handheld-RPG style pixel sprites (in the spirit of 2000s GBA item and
// overworld sprites, like the General Store's v36 oddities): 32x32 symbols (48x48 for the big King Rat, 64x40 for the
// cloud), a small palette per sprite, a dark 1-px outline, one highlight, scaled up with nearest-neighbour
// (image-rendering: pixelated). Every sprite is drawn here from primitives: no image files, no borrowed characters.
// slotPix(name) -> { w, h, px: Array<string|null> } (pure, so tests and a node preview can use it too).
const OUT = '#20141c';

function canvas(W, H) {
  const px = new Array(W * H).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
  const g = {
    W, H, px, set,
    rect: (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); return g; },
    ell: (cx, cy, rx, ry, c, f = () => true) => { for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) { const d = ((i - cx) / (rx + 0.35)) ** 2 + ((j - cy) / (ry + 0.35)) ** 2; if (d <= 1 && f(i, j)) set(i, j, c); } return g; },
    poly: (pts, c) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); for (let j = Math.floor(Math.min(...ys)); j <= Math.ceil(Math.max(...ys)); j++) for (let i = Math.floor(Math.min(...xs)); i <= Math.ceil(Math.max(...xs)); i++) { let inn = false; const x = i + 0.5, y = j + 0.5; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inn = !inn; } if (inn) set(i, j, c); } return g; },
    line: (x0, y0, x1, y1, c, w = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n; if (w <= 1) set(x, y, c); else for (let j = -w; j <= w; j++) for (let i = -w; i <= w; i++) if (i * i + j * j <= (w / 2) ** 2 + 0.25) set(x + i, y + j, c); } return g; },
    dots: (list, c) => { for (const [x, y] of list) set(x, y, c); return g; },
  };
  return g;
}
/** Dark outline around everything drawn (4-neighbour), like a GBA sprite. */
function outline(px, W, H) {
  const o = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < W && Y < H && px[Y * W + X] && px[Y * W + X] !== OUT; })) o[y * W + x] = OUT;
  }
  return o;
}

// ---------- pieces ----------
function acorn(g, gold) {
  const [b, bd, bl, c, cd] = gold ? ['#f8c838', '#d09018', '#fff4a0', '#b07810', '#805008'] : ['#c87838', '#985020', '#f0b070', '#6a4020', '#4a2810'];
  g.ell(16, 19, 9, 10, b).ell(18, 22, 6, 6, bd, (i, j) => i > 17 && j > 20).poly([[9, 15], [23, 15], [16, 30]], b).ell(16, 19, 9, 10, b, (i, j) => j < 18);
  g.ell(16, 12, 12, 5, c).rect(4, 12, 25, 3, c).rect(5, 14, 23, 1, cd);
  for (let x = 6; x < 28; x += 3) g.dots([[x, 11], [x + 1, 13]], cd);
  g.rect(15, 4, 2, 4, '#4a2810').rect(17, 3, 2, 1, '#4a2810');
  g.rect(11, 17, 2, 5, bl).rect(12, 23, 1, 2, bl);
  if (gold) g.dots([[25, 5], [24, 6], [26, 6], [25, 7], [5, 24], [5, 26], [4, 25], [6, 25]], '#ffffff');
}
function shroom(g) {
  g.rect(12, 17, 8, 12, '#f0e2c4').rect(17, 17, 3, 12, '#d0bc98').rect(11, 27, 10, 2, '#d0bc98');
  g.ell(16, 13, 13, 9, '#d83828', (i, j) => j <= 17).rect(3, 16, 27, 2, '#a82018');
  g.ell(9, 10, 2.5, 2, '#ffffff').ell(18, 7, 2.5, 2, '#ffffff').ell(24, 13, 2, 1.6, '#ffffff').ell(14, 14, 1.6, 1.3, '#ffffff');
  g.dots([[7, 7], [8, 6], [6, 9]], '#ff8070');
}
function cone(g) {
  g.ell(16, 17, 9, 13, '#8a5428');
  for (let r = 0; r < 6; r++) for (let k = -3; k <= 3; k++) { const x = 16 + k * 3 + (r % 2 ? 1.5 : 0), y = 7 + r * 4; if (((x - 16) / 9) ** 2 + ((y - 17) / 13) ** 2 < 0.8) g.dots([[x, y], [x - 1, y + 1], [x + 1, y + 1]], '#5a3014').dots([[x, y + 1]], '#c08040'); }
  g.rect(15, 2, 2, 3, '#4a7a28').dots([[17, 2], [18, 1]], '#6aa83a').rect(10, 12, 1, 6, '#d09858');
}
function frank(g) {
  // frankfurter in a bun with a mustard zig-zag (v41: re-skins the old "berry" low symbol; same payouts)
  g.poly([[3, 20], [7, 15], [27, 9], [30, 12], [28, 17], [8, 26]], '#e8b060').poly([[4, 21], [8, 25], [28, 16], [29, 14]], '#c88838');
  g.line(4, 17, 28, 9, '#c84830', 3).line(4, 16, 27, 8, '#e06848').dots([[3, 18], [29, 9]], '#a83020');
  g.line(6, 14, 25, 8, '#ff9a80');
  for (let k = 0; k < 7; k++) { const x = 6 + k * 3, y = 16 - k * 0.9; g.dots([[x, y], [x + 1, y - 2], [x + 2, y]], '#f8e040'); }
  g.rect(9, 22, 14, 1, '#f0c878');
}
function house(g, kind, broken) {
  const P = { straw: ['#f0c848', '#c89828', '#f8e488', '#e8b838', '#b88820'], sticks: ['#8a5428', '#5a3414', '#b07840', '#a06830', '#6a4018'], stone: ['#7a7a88', '#50505c', '#a8a8b8', '#a0a0ac', '#70707c'] }[kind];
  const [roof, roofD, roofL, wall, wallD] = P;
  const ry = broken ? -3 : 0, rx = broken ? -4 : 0, wx = broken ? 2 : 0;
  // walls
  g.rect(6 + wx, 15, 20, 14, wall).rect(6 + wx, 27, 20, 2, wallD);
  if (kind === 'straw') for (const y of [18, 21, 24]) g.rect(7 + wx, y, 18, 1, wallD);
  if (kind === 'sticks') for (const x of [8, 12, 20, 24]) g.rect(x + wx, 16, 1, 12, wallD);
  if (kind === 'stone') for (const [x, y] of [[7, 16], [13, 16], [19, 16], [7, 20], [21, 20], [9, 24], [20, 24]]) g.rect(x + wx, y, 4, 2, wallD);
  g.rect(13 + wx, 20, 6, 9, '#4a2810').rect(13 + wx, 20, 6, 1, '#6a4020').dots([[17 + wx, 25]], '#f0c848');
  if (broken) g.line(10 + wx, 15, 14 + wx, 22, OUT).line(22 + wx, 15, 20 + wx, 21, OUT);
  // roof
  g.poly([[2 + rx, 16 + ry], [16 + rx, 4 + ry], [30 + rx, 16 + ry]], roof).rect(3 + rx, 15 + ry, 26, 2, roofD);
  g.line(8 + rx, 12 + ry, 16 + rx, 5 + ry, roofL);
  if (kind === 'straw') for (const x of [9, 13, 19, 23]) g.line(x + rx, 15 + ry, 16 + rx + (x - 16) * 0.3, 8 + ry, roofD);
  if (kind === 'sticks') for (const y of [9, 12]) g.rect(16 - (y - 4) + rx, y + ry, (y - 4) * 2, 1, roofD);
  if (kind === 'stone') g.rect(22 + rx, 5 + ry, 3, 6, '#5a5a66').rect(22 + rx, 5 + ry, 3, 1, '#a8a8b8');
  if (broken) g.dots([[4, 6], [28, 4], [30, 8], [2, 10]], roofD);
}
function squatch(g, who) {
  const [fur, furD, furL, face] = { pip: ['#d08040', '#a05820', '#f0a868', '#f8d0a0'], bramble: ['#8a5028', '#603010', '#b07040', '#e0b088'], boulder: ['#6a5444', '#463428', '#8e7662', '#c8ae92'] }[who];
  const s = who === 'pip' ? 0 : who === 'bramble' ? 1 : 2;
  // body
  g.ell(16, 26 - s * 0.3, 9 + s, 7 + s * 0.5, fur).ell(16, 29, 7 + s, 3, furD, (i, j) => j > 28);
  for (const [x, y] of [[9 - s, 24], [22 + s, 24], [12, 27], [20, 27]]) g.dots([[x, y], [x + 1, y - 1]], furD);
  g.ell(7 - s, 24, 2, 3, fur).ell(25 + s, 24, 2, 3, fur);
  // head
  const hy = 13 - s * 0.6, hr = 8 + s * 0.6;
  g.ell(16, hy, hr, hr - 0.5, fur).dots([[9, hy - 6], [10, hy - 7], [22, hy - 7], [23, hy - 6]], fur);
  g.ell(16, hy + 1.5, 5.5, 4.5, face);
  g.rect(13, hy, 2, 2, '#1c1010').rect(18, hy, 2, 2, '#1c1010').dots([[13, hy], [18, hy]], '#ffffff');
  g.rect(15, hy + 3, 3, 1, '#4a2810');
  if (who === 'boulder') g.rect(12, hy - 2, 9, 1, '#1c1010').rect(14, hy + 5, 5, 1, '#4a2810');
  else g.dots([[14, hy + 5], [15, hy + 6], [16, hy + 6], [17, hy + 6], [18, hy + 5]], '#4a2810');
  g.dots([[11, hy - 5], [12, hy - 6]], furL);
  if (who === 'pip') g.ell(19, hy - 9, 3, 1.6, '#58b840').line(16, hy - 8, 18, hy - 9, '#3a7a28');
  if (who === 'bramble') g.line(28, 30, 29, 6, '#5a3414', 2).ell(29, 5, 2, 2, '#58b840').rect(12, hy - 3, 9, 1, '#4a2810');
}
function ratHead(g, x0 = 0, y0 = 0, k = 1) {
  const X = (v) => x0 + v * k, Y = (v) => y0 + v * k;
  g.ell(X(8), Y(13), 5 * k, 5 * k, '#8a8896').ell(X(8), Y(13), 2.5 * k, 2.5 * k, '#e898a8');
  g.ell(X(24), Y(13), 5 * k, 5 * k, '#8a8896').ell(X(24), Y(13), 2.5 * k, 2.5 * k, '#e898a8');
  g.ell(X(16), Y(19), 9 * k, 8 * k, '#8a8896').ell(X(16), Y(24), 5 * k, 4 * k, '#a8a6b2');
  g.rect(X(11), Y(17), 3 * k, 3 * k, '#d01830').rect(X(19), Y(17), 3 * k, 3 * k, '#d01830').dots([[X(11), Y(17)], [X(19), Y(17)]], '#ffb0b8');
  g.rect(X(15), Y(24), 3 * k, 2 * k, '#e898a8').rect(X(15), Y(27), 1 * k, 2 * k, '#ffffff').rect(X(17), Y(27), 1 * k, 2 * k, '#ffffff');
  g.line(X(9), Y(24), X(3), Y(23), '#4a4850').line(X(9), Y(26), X(3), Y(27), '#4a4850').line(X(23), Y(24), X(29), Y(23), '#4a4850').line(X(23), Y(26), X(29), Y(27), '#4a4850');
  // crown
  g.poly([[X(9), Y(12)], [X(9), Y(5)], [X(12), Y(8)], [X(16), Y(2)], [X(20), Y(8)], [X(23), Y(5)], [X(23), Y(12)]], '#f0c040').rect(X(9), Y(10), 15 * k, 2 * k, '#c08818').rect(X(15), Y(6), 2 * k, 2 * k, '#d01830').dots([[X(10), Y(7)], [X(11), Y(9)]], '#fff0a0');
}
function bigRat(g, toot) {
  // 48x48: fat grey rat, red cape, pink tail, gold crown (original design); toot = a green puff at his rear
  g.line(10, 40, 4, 34, '#e898a8', 2).line(4, 34, 5, 27, '#e898a8', 2);
  g.poly([[11, 46], [13, 26], [24, 20], [36, 26], [38, 46]], '#b81c38').poly([[13, 44], [14, 30], [18, 27], [16, 44]], '#801028');
  g.ell(25, 36, 10, 9, '#8a8896').ell(25, 38, 6, 6, '#c8c4d0').ell(18, 45, 4, 2, '#8a8896').ell(32, 45, 4, 2, '#8a8896');
  ratHead(g, 9, -1, 1);
  g.dots([[26, 31], [27, 32]], '#e0dce8');
  if (toot) { g.ell(5, 41, 5, 4, '#90e040').ell(3, 34, 3, 3, '#b0f060').ell(8, 46, 3, 2, '#70c030'); g.dots([[2, 39], [5, 37], [7, 42], [1, 43]], '#e0ffa0'); }
}
function deed(g) {
  g.rect(6, 6, 20, 20, '#f0e0b0').rect(4, 4, 24, 3, '#d8c088').rect(4, 25, 24, 3, '#d8c088').rect(4, 4, 24, 1, '#f8f0d0');
  for (const y of [10, 13, 16]) g.rect(9, y, 14, 1, '#a89060');
  g.ell(20, 21, 4, 4, '#d03828').dots([[19, 21], [20, 22], [21, 21], [22, 20]], '#ffffff').line(16, 23, 14, 29, '#d03828').line(23, 23, 25, 29, '#d03828');
}
function cloud(g) {
  const puffs = [[16, 22, 12, 10], [30, 16, 14, 12], [46, 22, 12, 10], [24, 30, 12, 7], [40, 30, 13, 7], [56, 28, 7, 6], [7, 28, 6, 5]];
  for (const [x, y, rx, ry] of puffs) g.ell(x, y, rx, ry, '#78c830');
  for (const [x, y, rx, ry] of puffs) g.ell(x - 1, y - 1, rx - 3, ry - 3, '#a0e050');
  for (const [x, y, rx] of puffs) g.ell(x - rx / 3, y - 4, rx / 3, 2, '#d0ff90');
  g.dots([[20, 30], [34, 32], [48, 30], [12, 24]], '#58a020');
}

const ART = {
  acorn: [32, 32, (g) => acorn(g, false)], G: [32, 32, (g) => acorn(g, true)],
  shroom: [32, 32, shroom], cone: [32, 32, cone], frank: [32, 32, frank],
  straw: [32, 32, (g) => house(g, 'straw')], sticks: [32, 32, (g) => house(g, 'sticks')], stone: [32, 32, (g) => house(g, 'stone')],
  'straw-broken': [32, 32, (g) => house(g, 'straw', true)], 'sticks-broken': [32, 32, (g) => house(g, 'sticks', true)], 'stone-broken': [32, 32, (g) => house(g, 'stone', true)],
  pip: [32, 32, (g) => squatch(g, 'pip')], bramble: [32, 32, (g) => squatch(g, 'bramble')], boulder: [32, 32, (g) => squatch(g, 'boulder')],
  W: [32, 32, (g) => ratHead(g, 0, 1, 1)], S: [32, 32, deed],
  rat: [48, 48, (g) => bigRat(g, false)], 'rat-toot': [48, 48, (g) => bigRat(g, true)],
  cloud: [64, 40, cloud],
};
// the server's symbol keys stay as they are (math unchanged); "berry" is drawn as the frankfurter
const ALIAS = { berry: 'frank' };
export const SLOT_PIX = Object.keys(ART);
const cache = new Map();
export function slotPix(name) {
  name = ALIAS[name] || name;
  if (cache.has(name)) return cache.get(name);
  const a = ART[name]; if (!a) return null;
  const [W, H, f] = a; const g = canvas(W, H); f(g);
  const out = { w: W, h: H, px: outline(g.px, W, H) };
  cache.set(name, out); return out;
}
const urls = new Map();
/** A PNG data URL for a sprite (browser only). */
export function slotPixUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const g = slotPix(name); if (!g || typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h; const x = c.getContext('2d');
  g.px.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i % g.w, Math.floor(i / g.w), 1, 1); } });
  const u = c.toDataURL('image/png'); urls.set(name, u); return u;
}

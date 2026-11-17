// Barn bugs (v33): original pixel-art sprites, drawn procedurally from each bug's `look` (no image assets).
// GBA-era style: a 64x64 grid, a small palette per bug (outline, dark, base, light, accent + eye/glint), a dark
// one-pixel outline and simple top-left lighting, then scaled up with nearest-neighbour so the pixels stay crisp.
// Pure functions: spriteGrid() returns the colour grid (used by the client canvas and the node tests alike).
import { MAX_LEVEL } from '../../../server/engine/creatures.js';
export const SPRITE = 64;
// Big sprites are drawn on a grid FINE times as dense: the same shapes, written in the same 64-grid coordinates, with
// smoother edges, a thinner outline and two more tones of shading. Small ones (thumbnails, far-off billboards) keep 64.
export const FINE = 2;
/** The grid to draw a sprite on when it will be shown `s` pixels across: the fine one once each of its pixels gets a whole screen pixel. */
export const fineFor = (s) => (s >= SPRITE * FINE ? FINE : 1);

// Missing levels keep the existing adult presentation for older callers and replays.
export function bugScale(level = MAX_LEVEL) {
  const bounded = Number.isFinite(level) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) : MAX_LEVEL;
  return 1 - (MAX_LEVEL - bounded) * 0.025;
}

// Development follows species, not adult silhouette: Mantispa is a lacewing; the Picasso bug is not a beetle.
const YOUNG_FORMS = {
  ceroplophana: 'grub', trachelophorus: 'legless-grub', eupholus: 'legless-grub', pachyrhynchus: 'legless-grub',
  chrysochroa: 'borer', lamprima: 'grub', onymacris: 'crawler', brachinus: 'crawler', macrodontia: 'borer',
  sagra: 'grub', manticora: 'crawler', polyphylla: 'grub', phanaeus: 'grub',
  mantispa: 'jawed-larva', nemoptera: 'jawed-larva', helicopsyche: 'caddis',
};
export const youngForm = (bug, level) => Number.isFinite(level) && level < 3 ? YOUNG_FORMS[bug.id] : undefined;

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };

/** Materials: each is a 3-step ramp [shadow, base, light]. */
function ramps(pal) {
  const [o, d, b, l, a] = pal;
  return {
    o, // outline
    B: [d, b, l],                                   // body
    D: [mix(o, d, 0.5), d, b],                      // dark parts: legs, joints
    A: [mix(a, o, 0.45), a, mix(a, '#ffffff', 0.35)], // accent
    L: [b, l, mix(l, '#ffffff', 0.5)],              // pale parts
    E: ['#000000', '#141414', '#ffffff'],           // eyes
    W: [mix(b, '#ffffff', 0.35), mix(l, '#ffffff', 0.55), '#ffffff'], // glassy wing
  };
}

// Every shape below is written in 64-grid coordinates. `f` is how many grid pixels each of those gets a side: at 1
// this is the 64x64 sprite as it always was; at 2 the same shapes are sampled twice as finely.
function canvas(f = 1) {
  const N = SPRITE * f, g = Array.from({ length: N }, () => new Array(N).fill(null));
  // which shape each pixel came from (0: a loose pixel), so the fine grid can crease where one body part overlaps another
  const part = Array.from({ length: N }, () => new Array(N).fill(0)); let shape = 0, cur = 0;
  const etch = Array.from({ length: N }, () => new Array(N).fill(false)); // 'T': a faint line engraved on whatever is there
  const at = (X) => (X + 0.5) / f - 0.5; // a grid pixel's centre, in 64-grid coordinates
  const one = (X, Y, m) => { if (X < 0 || X >= N) return; if (m === 'T') { etch[Y][X] = g[Y][X] !== null; return; } g[Y][X] = m; part[Y][X] = cur; etch[Y][X] = false; };
  const set = (X, Y, m, mirror) => { if (Y < 0 || Y >= N) return; one(X, Y, m); if (mirror) one(N - 1 - X, Y, m); };
  // one whole 64-grid pixel (an eye glint, a seam, a stripe): an f-by-f block
  const put = (x, y, m) => { cur = 0; const X = Math.round(x * f), Y = Math.round(y * f); for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) set(X + a, Y + b, m); };
  const sym = (x, y, m) => { put(x, y, m); put(SPRITE - 1 - x, y, m); };
  const ell = (cx, cy, rx, ry, m, mirror = true) => {
    cur = ++shape;
    for (let Y = Math.floor((cy - ry) * f) - f; Y <= Math.ceil((cy + ry) * f) + f; Y++) for (let X = Math.floor((cx - rx) * f) - f; X <= Math.ceil((cx + rx) * f) + f; X++) {
      const dx = (at(X) - cx) / rx, dy = (at(Y) - cy) / ry; if (dx * dx + dy * dy <= 1.0) set(X, Y, m, mirror);
    }
  };
  const line = (x0, y0, x1, y1, m, w = 1, mirror = true) => {
    cur = ++shape;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2 * f, k = w >> 1;
    for (let i = 0; i <= n; i++) { const u = (x0 + ((x1 - x0) * i) / n - k) * f, v = (y0 + ((y1 - y0) * i) / n - k) * f;
      for (let a = 0; a < w * f; a++) for (let b = 0; b < w * f; b++) { const Y = Math.round(v + b); set(Math.round(u + a), Y, m); if (mirror) set(Math.round(N - 1 - u - a), Y, m); } }
  };
  // a line one grid pixel wide, through 64-grid points: only the fine grid has room for it (grooves, claws, veins)
  const hair = (pts, m, mirror = true) => {
    if (f === 1) return;
    cur = 0;
    for (let j = 0; j + 1 < pts.length; j++) { const [x0, y0] = pts[j], [x1, y1] = pts[j + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 0.5) * 2 * f;
      for (let i = 0; i <= n; i++) { const X = Math.round((x0 + ((x1 - x0) * i) / n + 0.5) * f - 0.5); set(X, Math.round((y0 + ((y1 - y0) * i) / n + 0.5) * f - 0.5), m, mirror); } }
  };
  const poly = (pts, m, mirror = true) => { // scanline fill
    cur = ++shape;
    const ys = pts.map((p) => p[1]);
    for (let Y = Math.floor(Math.min(...ys) * f) - f; Y <= Math.ceil(Math.max(...ys) * f) + f; Y++) { const y = at(Y), xs = [];
      for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax)); }
      xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let X = Math.ceil((xs[i] + 0.5) * f - 0.5); X <= Math.floor((xs[i + 1] + 0.5) * f - 0.5); X++) set(X, Y, m, mirror); }
  };
  return { g, f, part, etch, put, sym, ell, line, hair, poly };
}

// Six legs, drawn first so the body sits on top. `spread` widens them; `long` stretches them.
function legs(c, { y = 34, spread = 1, long = 1, m = 'D', fore = null } = {}) {
  const L = (x0, y0, x1, y1, x2, y2) => { c.line(x0, y0, x1, y1, m, 2); c.line(x1, y1, x2, y2, m, 1);
    const up = y2 < y1 ? -1 : 1; c.hair([[x2 - 1.4, y2 + 1.6 * up], [x2, y2 + 0.4 * up], [x2 + 1.2, y2 + 1.8 * up]], m); }; // two claws
  const s = spread, k = long;
  if (fore !== 'raptor') L(26, y - 6, 26 - 9 * s, y - 12 * k, 26 - 11 * s, y - 18 * k);
  L(25, y, 25 - 12 * s, y + 2, 25 - 15 * s, y + 9 * k);
  L(26, y + 6, 26 - 10 * s, y + 13 * k, 26 - 12 * s, y + 21 * k);
}
function antennae(c, { x = 29, y = 14, len = 10, bend = 4, m = 'D', fan = false, feather = false } = {}) {
  c.line(x, y, x - bend, y - len * 0.6, m, 1); c.line(x - bend, y - len * 0.6, x - bend - 3, y - len, m, 1);
  if (fan) { for (let i = 0; i < 4; i++) c.line(x - bend - 3, y - len, x - bend - 8 + i, y - len - 4 + i * 2, 'A', 1); }
  if (feather) { for (let i = 1; i < 5; i++) { const t = i / 5; c.put(x - bend * t - 2, y - len * 0.6 * t, m); c.sym(x - bend * t - 2, y - len * 0.6 * t, m); } }
}
/** Grooves down a wing case, following its curve (the fine grid only). */
function grooves(c, cy, rx, ry) {
  for (const t of [0.36, 0.68]) { const pts = [];
    for (let y = cy - ry * 0.72; y <= cy + ry * 0.86; y += 1) pts.push([31.5 - rx * t * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 0.5, y]);
    c.hair(pts, 'T'); }
}
function eyes(c, x, y, r = 2) { c.ell(x, y, r, r, 'E'); c.sym(x - Math.floor(r / 2), y - Math.floor(r / 2), 'G'); }

const KINDS = {
  beetle(c, L, opt = {}) {
    const { ry = 15, rx = 14, cy = 38, headY = 17, pron = 7 } = opt;
    legs(c, { y: cy - 4, spread: L.frogleg ? 0.9 : 1 });
    if (L.frogleg) { c.line(22, cy + 6, 10, cy + 14, 'B', 4); c.line(10, cy + 14, 8, cy + 24, 'B', 3); c.line(8, cy + 24, 3, cy + 26, 'D', 2); }
    antennae(c, { y: headY - 2, fan: L.fan });
    c.ell(32, cy, rx, ry, 'B'); // elytra
    grooves(c, cy, rx, ry);
    for (let y = cy - ry + 3; y < cy + ry - 1; y++) c.put(31.5, y, 'S'); // the seam
    c.ell(32, cy - ry - 1, rx - 3, pron, 'B'); // pronotum
    c.ell(32, headY, 6, 5, 'B'); // head
    eyes(c, 28, headY - 1, 1.5);
    if (L.sheen) for (let y = cy - ry + 4; y < cy + 6; y++) c.put(32 - rx * 0.5 + (y - cy) * 0.12, y, 'H');
    if (L.stripe) for (let y = cy - ry + 2; y < cy + ry - 2; y++) { c.put(32 - rx * 0.55, y, 'A'); }
    if (L.grooves) for (let k = 0; k < 3; k++) for (let y = cy; y < cy + ry - 2; y += 1) if (y % 2) c.put(32 - 3 - k * 3, y, 'S');
    if (L.marbled) [[24, 32], [27, 41], [22, 45], [28, 28], [25, 50], [20, 38]].forEach(([x, y]) => { c.ell(x, y, 2, 1.5, 'L'); });
    if (L.rings) [[24, 32], [32, 29], [26, 41], [32, 46], [22, 49]].forEach(([x, y]) => { c.ell(x, y, 2.5, 2.5, 'A'); c.sym(x, y, 'B'); });
    if (L.lights) {}
  },
};

/** Builds the sprite grid for one bug: rows of hex colours (or null for transparent), 64 a side, or 64 x `fine`. */
const lookOf = (bug, level) => ({ ...(bug.look || {}), kind: youngForm(bug, level) || (bug.id === 'helicopsyche' ? 'caddisfly' : bug.look?.kind) });
/** Where the bug's eyes are on the 64 grid: the row through them, their middle, and the right-hand eye's column. Null if it shows none. */
function eyeSpot(bug, level) {
  const c = canvas(); draw(c, lookOf(bug, level));
  const at = []; c.g.forEach((row, y) => row.forEach((m, x) => { if (m === 'E' || m === 'G') at.push([x, y]); }));
  if (!at.length) return null;
  const mid = (list, k) => (Math.min(...list.map((p) => p[k])) + Math.max(...list.map((p) => p[k]))) / 2, x = mid(at, 0);
  return { x: Math.round(x), y: Math.round(mid(at, 1)), right: Math.round(mid(at.filter((p) => p[0] >= x), 0)) };
}
export function spriteGrid(bug, level, fine = 1) {
  const L = lookOf(bug, level);
  const R = ramps(L.pal || ['#111111', '#333333', '#666666', '#999999', '#cc3333']);
  const c = canvas(fine);
  draw(c, L);
  return shade(c.g, R, c.part, c.etch);
}

function draw(c, L) {
  const k = L.kind;
  if (k === 'grub' || k === 'legless-grub') {
    if (k === 'grub') for (let i = 0; i < 3; i++) c.line(29 + i * 5, 28 + i * 2, 28 + i * 4, 35 + i * 2, 'D', 2, false);
    [[37, 48], [44, 42], [46, 33], [41, 25], [32, 23], [25, 28]].forEach(([x, y]) => c.ell(x, y, 7, 7, 'W', false));
    c.ell(24, 35, 7, 6, 'D', false); c.ell(21, 34, 1.5, 1.5, 'E', false); c.put(20, 33, 'G');
    c.line(21, 40, 18, 44, 'D', 2, false); c.line(26, 40, 23, 44, 'D', 2, false);
  } else if (k === 'borer' || k === 'crawler' || k === 'jawed-larva') {
    const wideHead = k === 'jawed-larva' || (k === 'crawler' && L.jaws);
    if (k !== 'borer') for (let i = 0; i < 3; i++) { c.line(27, 25 + i * 5, 21, 27 + i * 5, 'D', 1); c.line(21, 27 + i * 5, 19, 30 + i * 5, 'D', 1); }
    for (let i = 7; i >= 0; i--) c.ell(32, 25 + i * 4, Math.max(3, 7 - Math.max(0, i - 4)), 3.5, i % 2 ? 'W' : 'L');
    c.ell(32, 21, k === 'borer' ? 9 : 6, 5, 'L'); c.ell(32, 15, wideHead ? 8 : 5, 5, 'D'); eyes(c, wideHead ? 26 : 28, 14, 1);
    c.line(29, 11, 26, wideHead ? 4 : 8, 'D', 2); c.line(26, wideHead ? 4 : 8, 29, wideHead ? 2 : 6, 'D', 1);
  } else if (k === 'caddisfly') {
    legs(c, { y: 35, spread: 0.65, long: 0.75 }); c.ell(32, 40, 4, 14, 'D');
    c.poly([[31, 24], [23, 28], [17, 54], [30, 57]], 'B'); c.line(28, 29, 22, 51, 'L', 1);
    for (let y = 34; y <= 51; y += 4) c.line(22 - (y - 34) * 0.15, y, 19 - (y - 34) * 0.15, y + 1, 'L', 1);
    c.ell(32, 22, 5, 5, 'D'); eyes(c, 28, 21, 1); antennae(c, { y: 18, len: 15, bend: 6 });
  } else if (['chafer', 'jewel', 'darkling', 'ground', 'dung', 'shield', 'frogleg'].includes(k)) {
    if (L.spray) { for (let i = 0; i < 7; i++) c.ell(32 + (i % 2 ? 6 : -6), 58 - i * 0.5, 3 + (i % 3), 2, 'W'); }
    const opt = k === 'jewel' ? { rx: 11, ry: 17, cy: 38 } : k === 'ground' ? { rx: 10, ry: 13, cy: 40, headY: 19 } : k === 'shield' ? { rx: 16, ry: 15, cy: 38, pron: 8 }
      : k === 'darkling' ? { rx: 13, ry: 15, cy: 39 } : k === 'frogleg' ? { rx: 10, ry: 13, cy: 34, headY: 15 } : {};
    KINDS.beetle(c, L, opt);
    if (L.horn === 'clypeal') { c.line(32, 14, 32, 6, 'A', 2, false); c.line(32, 6, 34, 3, 'A', 1, false); c.sym(28, 12, 'A'); }
    if (L.horn === 'tall') { c.poly([[30, 15], [34, 15], [32, 2]], 'A', false); }
    if (k === 'dung') c.poly([[22, 20], [42, 20], [36, 24], [28, 24]], 'A', true);
    if (k === 'shield') c.poly([[24, 22], [40, 22], [32, 32]], 'A', false);
  } else if (k === 'stag' || k === 'tiger' || k === 'longhorn') {
    legs(c, { y: 36, spread: k === 'tiger' ? 1.15 : 1, long: k === 'longhorn' ? 1.2 : 1 });
    if (k === 'longhorn') { c.line(28, 15, 16, 4, 'D', 1); c.line(16, 4, 6, 8, 'D', 1); }
    else antennae(c, { y: 15, len: 9 });
    c.ell(32, 41, k === 'tiger' ? 11 : 12, 15, 'B'); grooves(c, 41, k === 'tiger' ? 11 : 12, 15); for (let y = 30; y < 54; y++) c.put(31.5, y, 'S');
    c.ell(32, 25, 9, 5, 'B'); c.ell(32, 17, 7, 5, 'B'); eyes(c, 27, 16, 1.5);
    if (L.sheen) for (let y = 30; y < 46; y++) c.put(26 + (y - 30) * 0.1, y, 'H');
    // mandibles
    const m = L.jaws ? 'A' : 'B';
    if (k === 'longhorn') { c.line(28, 13, 22, 4, m, 2); c.line(22, 4, 26, 0, m, 1); c.sym(23, 7, 'o'); }
    else if (k === 'tiger') { c.line(29, 13, 25, 7, m, 2); c.line(25, 7, 30, 4, m, 1); c.sym(26, 9, 'o'); }
    else { c.line(29, 13, 24, 6, m, 2); c.line(24, 6, 27, 2, m, 1); c.sym(25, 7, 'S'); }
  } else if (k === 'weevil') {
    legs(c, { y: 40, long: 1.05 });
    c.ell(32, 42, 11, 13, 'B'); if (!L.neck) grooves(c, 42, 11, 13);
    if (L.neck) { c.line(32, 30, 32, 10, 'D', 4, false); c.ell(32, 9, 4, 3, 'D'); eyes(c, 29, 8, 1); c.line(29, 8, 25, 4, 'D', 1); }
    else { c.ell(32, 27, 7, 5, 'B'); c.ell(32, 20, 4, 4, 'B'); c.line(32, 22, 32, 12, 'D', 3, false); eyes(c, 29, 20, 1.5); c.line(30, 15, 24, 11, 'D', 1); }
    if (L.bands) [36, 44, 50].forEach((y) => { for (let x = 22; x <= 32; x++) c.sym(x, y, 'A'); });
    if (L.dots) [[26, 36], [32, 41], [25, 46], [30, 51], [32, 32]].forEach(([x, y]) => c.ell(x, y, 2, 2, 'A'));
    if (L.neck) for (let y = 32; y < 53; y++) c.put(31.5, y, 'S');
    if (L.neck) c.ell(32, 42, 10, 12, 'A');
  } else if (k === 'treehopper' || k === 'leafhopper') {
    legs(c, { y: 44, long: 0.8 });
    c.poly([[32, 22], [22, 34], [24, 52], [32, 56]], 'B'); c.ell(32, 30, 9, 6, 'B'); eyes(c, 25, 30, 1.5);
    if (L.globes) { c.line(32, 24, 32, 10, 'D', 1, false); c.line(32, 12, 22, 6, 'D', 1); [[22, 6], [27, 4], [20, 12]].forEach(([x, y]) => { c.ell(x, y, 2.5, 2.5, 'L'); }); c.ell(32, 9, 2, 2, 'L', false); }
    if (L.thorn) { c.poly([[26, 30], [38, 30], [34, 6], [31, 5]], 'B', false); for (let y = 10; y < 30; y += 3) c.put(31, y, 'A'); }
    if (L.stripes) for (let y = 36; y < 54; y += 4) for (let x = 24; x <= 32; x++) c.sym(x, y, 'A');
    if (k === 'leafhopper') c.ell(32, 26, 7, 4, 'L');
  } else if (k === 'lanternfly') {
    c.poly([[30, 26], [8, 40], [10, 52], [30, 46]], 'B'); // forewing
    c.ell(16, 46, 5, 4, 'A');
    legs(c, { y: 40, long: 0.7 });
    c.ell(32, 40, 5, 13, 'D'); c.ell(32, 25, 6, 5, 'B'); eyes(c, 27, 25, 1.5);
    if (L.snout === 'long') { c.line(32, 20, 32, 4, 'A', 3, false); for (let y = 6; y < 20; y += 4) c.put(31, y, 'L'); }
    else { c.ell(32, 14, 4, 7, 'L', false); c.line(32, 8, 28, 3, 'A', 1); c.line(32, 8, 32, 2, 'A', 1, false); c.sym(30, 5, 'A'); }
  } else if (k === 'assassin') {
    legs(c, { y: 38, spread: 1.2, long: 1.2 });
    c.ell(32, 42, 10, 13, 'B'); c.poly([[26, 26], [38, 26], [36, 32], [28, 32]], 'B', false); c.ell(32, 20, 4, 6, 'B'); eyes(c, 28, 19, 1.5);
    c.line(32, 14, 32, 8, 'D', 1, false); antennae(c, { y: 15, len: 12, bend: 6 });
    if (L.spots) { c.ell(26, 40, 3, 3, 'A'); }
    if (L.cloak) { [[26, 36], [32, 33], [37, 38], [24, 44], [31, 42], [38, 46], [28, 50], [35, 51]].forEach(([x, y], i) => { c.ell(x, y, 3, 2, i % 2 ? 'L' : 'D', false); }); c.ell(32, 42, 2, 2, 'A', false); }
  } else if (k === 'caddis') {
    c.ell(32, 40, 15, 15, 'L'); c.ell(32, 40, 10, 10, 'B'); c.ell(32, 40, 5, 5, 'L'); c.ell(32, 40, 2, 2, 'D');
    c.ell(32, 22, 6, 5, 'D'); eyes(c, 29, 21, 1); c.line(27, 25, 21, 30, 'D', 2); c.line(28, 26, 24, 33, 'D', 1);
  } else if (k === 'larva') {
    for (let i = 0; i < 10; i++) c.ell(32, 14 + i * 4.6, 8 - (i > 7 ? (i - 7) * 1.5 : 0), 3, i % 2 ? 'B' : 'D');
    c.ell(32, 10, 6, 4, 'B'); eyes(c, 29, 10, 1);
    c.ell(28, 7, 1.5, 1.5, 'A'); // red head lamps
    for (let i = 1; i < 10; i++) c.ell(25, 14 + i * 4.6, 1.5, 1, 'L');
  } else if (k === 'mantis' || k === 'stick') {
    const wide = L.leaf;
    if (L.eyespot) { c.ell(19, 44, 10, 13, 'L'); c.ell(19, 44, 4, 4, 'A'); c.ell(19, 44, 2, 2, 'S'); }
    legs(c, { y: 40, spread: 1, long: 1.3, fore: k === 'mantis' ? 'raptor' : null });
    c.ell(32, 46, wide ? 12 : k === 'stick' ? 9 : 6, k === 'stick' ? 14 : 12, 'B');
    if (wide) c.poly([[24, 24], [40, 24], [36, 36], [28, 36]], 'B', false), c.poly([[22, 26], [24, 24], [28, 36], [22, 32]], 'B');
    c.line(32, 34, 32, 22, 'B', wide ? 5 : 3, false); // prothorax
    c.poly([[24, 12], [40, 12], [32, 21]], 'B', false); eyes(c, 25, 12, 2);
    if (k === 'mantis') { c.line(29, 24, 22, 30, 'B', 2); c.line(22, 30, 24, 18, 'B', 2); for (let y = 20; y < 29; y += 2) c.sym(25, y, 'A'); }
    if (L.cone) c.poly([[30, 11], [34, 11], [33, 1], [31, 1]], 'A', false);
    antennae(c, { x: 29, y: 10, len: 9, bend: 5, feather: L.cone });
    if (L.spines) for (let y = 34; y < 60; y += 3) { c.sym(22 + ((y / 3) % 2), y, 'A'); }
    if (k === 'stick') c.ell(32, 44, 4, 8, 'A', false);
  } else if (k === 'lacewing') {
    if (L.spoons) { c.line(28, 40, 14, 60, 'D', 1); c.ell(13, 59, 3, 2.5, 'A'); }
    c.poly([[30, 26], [6, 22], [4, 36], [30, 38]], 'W'); for (let x = 8; x < 30; x += 4) c.line(x, 24, x, 37, 'L', 1);
    c.ell(32, 40, 3, 13, 'B'); c.ell(32, 25, 4, 4, 'B'); c.ell(32, 19, 4, 3, 'A'); eyes(c, 29, 19, 1.5);
    antennae(c, { y: 16, len: 12, bend: 4 }); legs(c, { y: 30, spread: 0.5, long: 0.7 });
  } else if (k === 'waterbug') {
    legs(c, { y: 44, spread: 1.3, long: 1.1, fore: 'raptor' });
    c.line(24, 30, 14, 26, 'D', 3); c.line(14, 26, 18, 16, 'D', 2); c.line(18, 16, 22, 15, 'A', 1);
    c.ell(32, 42, 14, 16, 'B'); grooves(c, 42, 14, 16); for (let y = 34; y < 57; y++) c.put(31.5, y, 'S'); c.ell(32, 26, 10, 5, 'B'); c.ell(32, 20, 5, 4, 'B'); eyes(c, 27, 19, 2);
  } else {
    KINDS.beetle(c, L);
  }
}

function shade(g, R, part, etch) {
  const N = g.length, fine = N > SPRITE; const out = Array.from({ length: N }, () => new Array(N).fill(null));
  const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] !== null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = g[y][x];
    if (m === null) { // outline any empty pixel touching the sprite
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = R.o;
      continue;
    }
    if (m === 'o') { out[y][x] = R.o; continue; }
    if (m === 'S') { out[y][x] = R.B[0]; continue; }         // seams and grooves: body shadow
    if (m === 'H') { out[y][x] = R.L[2]; continue; }         // sheen streak
    if (m === 'G') { out[y][x] = '#ffffff'; continue; }      // eye glint
    const ramp = R[m] || R.B;
    // top-left light: lit if the pixel up-left is outside the same material, shaded if down-right is
    const same = (dx, dy) => filled(x + dx, y + dy) && g[y + dy][x + dx] === m;
    let lvl = 1;
    if (!fine) {
      if (!same(-1, -1) || !same(0, -2)) lvl = 2; else if (!same(1, 1) || !same(0, 2) || !same(2, 0)) lvl = 0;
      if (m === 'E') lvl = lvl === 2 ? 1 : lvl;
      out[y][x] = ramp[lvl];
      continue;
    }
    // The fine grid: the same top-left light, its rims twice as many pixels deep so they weigh what they did, a
    // half-tone easing each rim into the base, and a crease where one part of the body overlaps another.
    const lit = !same(-1, -1) || !same(-2, -2) || !same(0, -2) || !same(0, -3), dim = !same(1, 1) || !same(2, 2) || !same(0, 3) || !same(3, 0);
    const p = part[y][x], over = (dx, dy) => same(dx, dy) && part[y + dy][x + dx] && part[y + dy][x + dx] !== p;
    if (m === 'E') out[y][x] = ramp[dim && !lit ? 0 : 1];
    else if (lit) out[y][x] = ramp[2];
    else if (dim || (p && (over(0, 1) || over(1, 0)))) out[y][x] = ramp[0];
    else if (!same(-3, -3) || !same(-4, -4) || !same(0, -5) || !same(-5, -1)) out[y][x] = mix(ramp[1], ramp[2], 0.5);
    else if (!same(3, 3) || !same(4, 4) || !same(0, 5) || !same(5, 0) || !same(5, 2)) out[y][x] = mix(ramp[1], ramp[0], 0.5);
    else out[y][x] = ramp[1];
    if (etch[y][x] && !lit) out[y][x] = mix(out[y][x], ramp[0], 0.45);
  }
  return out;
}

/** Draws the sprite into a canvas context, scaled with nearest-neighbour, centred in (x, y, size). */
export function paintSprite(ctx, grid, x, y, size) {
  const N = grid.length, px = Math.max(1, Math.floor(size / N)); const s = px * N;
  const ox = Math.round(x + (size - s) / 2), oy = Math.round(y + (size - s) / 2);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = grid[r][c]; if (v) { ctx.fillStyle = v; ctx.fillRect(ox + c * px, oy + r * px, px, px); } }
  return { px, s, ox, oy };
}

// ---- canvas helpers for the Barn and bouts (v33) ----
const cache = new Map();
// v34: store looks. A skin swaps the bug's palette; hats and accessories are tiny pixel overlays placed on the
// sprite's own outline (top of the head, eye line, middle). All cosmetic.
const WEARPIX = {
  tophat: { at: 'top', p: ['..kkkkkk..', '..kkkkkk..', '..kkkkkk..', '..rrrrrr..', 'kkkkkkkkkk'], k: { k: '#1c1a1c', r: '#b02030' } },
  cowboy: { at: 'top', p: ['...bbbb...', '..bbbbbb..', '..dddddd..', 'bbbbbbbbbb', '.bb....bb.'], k: { b: '#c8a26a', d: '#6a4a2a' } },
  crown: { at: 'top', p: ['y..y..y..y', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yrryybbyyy', 'yyyyyyyyyy'], k: { y: '#f8d040', r: '#d03040', b: '#3080ff' } },
  party: { at: 'top', p: ['....w.....', '....p.....', '...ppp....', '...yyy....', '..ppppp...', '.yyyyyyy..'], k: { p: '#ff5fa0', y: '#ffe060', w: '#ffffff' } },
  bow: { at: 'topside', p: ['pp...pp', 'pppppp.', '.ppWpp.', 'pppppp.', 'pp...pp'], k: { p: '#ff4f90', W: '#ffd0e0' } },
  monocle: { at: 'eye', p: ['.yyy.', 'yccy.', 'yccy.', '.yyy.', '...y.', '...y.'], k: { y: '#e0b040', c: '#cfefff' } },
  shades: { at: 'eye', p: ['kkkkkkkkkkkk', 'kkkkk..kkkkk', '.kkk....kkk.'], k: { k: '#111111' } },
  bandana: { at: 'mid', p: ['rrrrrrrrrrrr', '.rrwrrrrwrr.', '..rrrrrrrr..', '....rrrr....'], k: { r: '#c02a2a', w: '#ffffff' } },
  cape: { at: 'back', p: ['rr', 'rrr', 'rrrr', 'rrrr', 'rrrrr', 'rrrrr', 'rrrrrr', 'rrrrrr'], k: { r: '#c02030' } },
  scarf: { at: 'mid', p: ['tttttttttttt', 'tttttttttttt', '........tt..', '........tt..', '........tt..'], k: { t: '#21a7a0' } },
  dapper: { at: 'lip', with: 'monocle', p: ['kk..kkkk..kk', '.kkkk..kkkk.'], k: { k: '#f0e6d0' } }, // the monocle, and a moustache under the eyes (pale: a dark one vanishes into the outline)
};
function bounds(grid) {
  let top = SPRITE, bot = 0, l = SPRITE, r = 0;
  for (let y = 0; y < SPRITE; y++) for (let x = 0; x < SPRITE; x++) if (grid[y][x]) { top = Math.min(top, y); bot = Math.max(bot, y); l = Math.min(l, x); r = Math.max(r, x); }
  let tl = SPRITE, tr = 0; for (let y = top; y < top + 4 && y < SPRITE; y++) for (let x = 0; x < SPRITE; x++) if (grid[y][x]) { tl = Math.min(tl, x); tr = Math.max(tr, x); }
  return { top, bot, l, r, cx: Math.round((tl + tr) / 2) };
}
function overlay(ctx, grid, shape, eye) {
  const w = WEARPIX[shape]; if (!w) return;
  if (w.with) overlay(ctx, grid, w.with, eye);
  const b = bounds(grid); const pw = Math.max(...w.p.map((r) => r.length)), ph = w.p.length;
  const hgt = b.bot - b.top;
  let x = b.cx - Math.floor(pw / 2), y = b.top - ph + 1;
  if (w.at === 'topside') { x = b.cx + 2; y = b.top - 2; }
  // by the eyes (a bug that shows none: about where a face would be). A wide piece (shades) goes across both, a narrow
  // one (a monocle) on the right-hand eye, each with its lens on its second row; 'lip' is centred a little below them.
  const E = eye || { x: b.cx, y: b.top + Math.round(hgt * 0.22) + 1, right: b.cx + 4 };
  if (w.at === 'eye') { y = E.y - 1; x = pw > 6 ? E.x - Math.floor(pw / 2) : E.right - 1; }
  if (w.at === 'lip') { x = E.x - Math.floor(pw / 2); y = E.y + 4; }
  if (w.at === 'mid') y = b.top + Math.round(hgt * 0.42);
  if (w.at === 'back') { x = b.l - 2; y = b.top + Math.round(hgt * 0.3); }
  x = Math.max(0, Math.min(SPRITE - pw, x)); y = Math.max(0, Math.min(SPRITE - ph, y));
  w.p.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') { ctx.fillStyle = w.k[ch]; ctx.fillRect(x + c, y + r, 1, 1); } }));
}
// v35: battle gear shows too, fitted to the sprite's own body (its centre run of pixels) and leg tips.
const bodyRun = (grid, y) => { if (!grid[y]?.[31]) return null; let a = 31, b = 32; while (a > 0 && grid[y][a - 1]) a--; while (b < SPRITE - 1 && grid[y][b + 1]) b++; return [a, b]; };
const legTip = (grid, y0, y1) => { let best = null; for (let y = Math.max(0, y0); y <= Math.min(SPRITE - 1, y1); y++) { const x = grid[y].findIndex(Boolean); if (x >= 0 && x < 31 && (!best || x < best[0])) best = [x, y]; } return best; };
function stamp(ctx, p, k, x, y, mirror = false) {
  p.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') return; ctx.fillStyle = k[ch]; ctx.fillRect(x + c, y + r, 1, 1); if (mirror) ctx.fillRect(SPRITE - 1 - x - c, y + r, 1, 1); }));
}
export const GEAR_SHAPES = ['shell', 'claws', 'boots', 'helmet', 'shield', 'mandibles', 'armor', 'bandage'];
function gearOverlay(ctx, grid, shape) {
  const b = bounds(grid), h = b.bot - b.top, at = (f) => b.top + Math.round(h * f);
  let head = b.top; while (head < b.bot && (bodyRun(grid, head)?.reduce((l, r) => r - l) ?? 0) < 5) head++;
  switch (shape) {
    case 'armor': { // legs join the body run on some rows, so plates stop at the body's usual width
      const widths = []; for (let y = at(0.35); y <= at(0.85); y++) { const run = bodyRun(grid, y); if (run) widths.push(run[1] - run[0]); }
      const half = Math.ceil((widths.sort((p, q) => p - q)[widths.length >> 1] || 8) / 2);
      for (let band = 0; band < 3; band++) for (let i = 0; i < 3; i++) {
        const y = at(0.4) + band * 5 + i, run = bodyRun(grid, y); if (!run || run[1] - run[0] < 4) continue;
        const l = Math.max(run[0], 32 - half) + 1, r = Math.min(run[1], 31 + half) - 1;
        ctx.fillStyle = ['#e2e6ea', '#a2a8b0', '#5e646c'][i]; ctx.fillRect(l, y, r - l + 1, 1);
        if (i === 1) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(l + 1, y, 1, 1); ctx.fillRect(r - 1, y, 1, 1); }
      } break;
    }
    case 'shell': [[-6, 0.46], [5, 0.6], [-3, 0.78]].forEach(([dx, f]) => { const x = 32 + dx, y = at(f); if (grid[y]?.[x]) stamp(ctx, ['..w..', '..w..', 'wwyww', '..w..', '..w..'], { w: '#fff2b0', y: '#ffffff' }, x - 2, y - 2); }); break;
    case 'boots': [[0.22, 0.45], [0.46, 0.68], [0.69, 1]].forEach(([f0, f1]) => { const t = legTip(grid, at(f0), at(f1)); if (t) stamp(ctx, ['.BB', '.Bb', 'bbb', 'sss'], { B: '#d08848', b: '#9a5226', s: '#3a2010' }, t[0] - 1, t[1] - 2, true); }); break;
    case 'claws': { const t = legTip(grid, b.top, at(0.42)); if (t) stamp(ctx, ['s...', 'ss..', '.sS.', '.sSS', '..SS'], { s: '#f4f8fc', S: '#8a929c' }, t[0] - 2, t[1] - 3, true); break; }
    case 'mandibles': stamp(ctx, ['g..........g', 'gg........gg', 'Ggg......ggG', '.GGg....gGG.', '..GGg..gGG..'], { g: '#ffe070', G: '#b08a20' }, 26, head - 4); break;
    case 'helmet': stamp(ctx, ['.....ss.....', '...kkkkkk...', '.kkKkKkKkkk.', 'kKkKkKkKkKkk', 'kkkkkkkkkkkk', '.hhhhhhhhhh.'], { k: '#9a6e40', K: '#5c4028', s: '#4a3018', h: '#c89a5a' }, 26, head - 3); break;
    case 'shield': { const t = legTip(grid, at(0.38), at(0.52)) || [b.l, at(0.42)];
      stamp(ctx, ['...gg...', '..gggg..', '.ggVggg.', 'gggVgggG', 'ggggVggG', 'gggVgggG', '.ggVggG.', '..gVgG..', '...gG...', '...s....', '...s....'], { g: '#7cc050', G: '#3e7a2a', V: '#d8f0b0', s: '#5c4028' }, Math.max(0, t[0] - 5), t[1] - 4); break; }
    case 'bandage': stamp(ctx, ['......ww', '.....wpw', '....wppw', '...wrrw.', '..wrrw..', '.wppw...', 'wpw.....', 'ww......'], { w: '#f4ecdc', p: '#e0b098', r: '#c8433e' }, 33, at(0.48)); break;
    default: break;
  }
}
/** Scale2x (EPX): doubles a pixel grid, rounding its stair-step diagonals. An empty cell counts as a colour. */
function scale2x(src) {
  const n = src.length, at = (x, y) => src[y]?.[x] ?? null, out = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(null));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = src[y][x], a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
    out[y * 2][x * 2] = c === a && c !== d && a !== b ? a : p;
    out[y * 2][x * 2 + 1] = a === b && a !== c && b !== d ? b : p;
    out[y * 2 + 1][x * 2] = d === c && d !== b && c !== a ? c : p;
    out[y * 2 + 1][x * 2 + 1] = b === d && b !== a && d !== c ? d : p;
  }
  return out;
}
/**
 * Hats and gear on the fine sprite. They are 64-grid pixel art (`wear`, one colour or null a cell): doubled with
 * their diagonals rounded, lit from the top left like the bug, and outlined wherever they stand clear of it.
 * ponytail: Scale2x doubles, so this is for FINE = 2 only; another factor needs another scaler.
 */
function paintWear(ctx, wear, body, outline) {
  const big = scale2x(wear), N = big.length, on = (x, y) => !!big[y]?.[x];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = big[y][x];
    if (v) ctx.fillStyle = !on(x, y - 1) || !on(x - 1, y) ? mix(v, '#ffffff', 0.3) : !on(x, y + 1) || !on(x + 1, y) ? mix(v, '#000000', 0.3) : v;
    else if (!body[y][x] && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) ctx.fillStyle = outline;
    else continue;
    ctx.fillRect(x, y, 1, 1);
  }
}
/**
 * The bug's sprite, cached by species, life stage and look, with its accessories: 64x64, or 64 x `fine` a side for
 * a big drawing (fineFor). Hats and gear are placed by the 64-grid outline either way.
 */
export function spriteCanvas(bug, style, level, fine = 1) {
  const key = `${bug.id}|${youngForm(bug, level) || ''}|${style?.bugskin?.id || ''}|${style?.bughat?.shape || ''}|${style?.bugacc?.shape || ''}|${style?.gear?.shape || ''}|${style?.defense?.shape || ''}|${fine}`;
  if (cache.has(key)) return cache.get(key);
  const b = style?.bugskin?.pal ? { ...bug, look: { ...(bug.look || {}), pal: style.bugskin.pal } } : bug;
  const grid = spriteGrid(b, level), N = SPRITE * fine;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const ctx = c.getContext('2d'), body = fine === 1 ? grid : spriteGrid(b, level, fine);
  paintSprite(ctx, body, 0, 0, N);
  // overlays write 64-grid pixels: straight onto the 64 canvas, or onto a layer the fine canvas then redraws
  const wear = Array.from({ length: SPRITE }, () => new Array(SPRITE).fill(null)); let ink = null;
  const x = fine === 1 ? ctx : { set fillStyle(v) { ink = v; }, fillRect(px, py, w, h) { for (let r = py; r < py + h; r++) for (let q = px; q < px + w; q++) if (r >= 0 && r < SPRITE && q >= 0 && q < SPRITE) wear[r][q] = ink; } };
  if (style?.defense?.shape) gearOverlay(x, grid, style.defense.shape); // defense gear goes on first, the attack item over it
  if (style?.gear?.shape) gearOverlay(x, grid, style.gear.shape);
  if (style?.bugacc?.shape) overlay(x, grid, style.bugacc.shape, eyeSpot(b, level));
  if (style?.bughat?.shape) overlay(x, grid, style.bughat.shape);
  if (fine !== 1 && (style?.gear?.shape || style?.defense?.shape || style?.bugacc?.shape || style?.bughat?.shape)) paintWear(ctx, wear, body, b.look?.pal?.[0] || '#111111');
  cache.set(key, c);
  return c;
}
/**
 * A three.js texture of the bug for a 3D scene (pass the THREE module): the fine sprite up close, with the 64 one
 * as its only smaller level, so a bug drawn small or far off looks exactly as it always did. Both stay pixel-crisp.
 */
export function bugTexture(THREE, bug, style, level) {
  const levels = [spriteCanvas(bug, style, level, FINE), spriteCanvas(bug, style, level)], map = new THREE.CanvasTexture(levels[0]);
  map.mipmaps = levels; map.generateMipmaps = false; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
/** Draws a growing bug with nearest-neighbour pixels, a little idle bob and a hop when poked. */
export function drawBug(ctx, bug, { w, h, t = 0, still = false, poke = 0, flip = false, fill = 0.82, style = null, level }) {
  const adultSize = Math.max(1, Math.floor((Math.min(w, h) * fill) / SPRITE)) * SPRITE;
  const s = Math.round(adultSize * bugScale(level)), px = s / SPRITE;
  const bob = still ? 0 : Math.round(Math.sin(t / 420) * px * 1.2);
  const hop = Math.round(Math.sin(Math.min(1, poke) * Math.PI) * px * 6);
  const ox = Math.round((w - s) / 2), oy = Math.round((h - adultSize) / 2 + h * 0.03) + adultSize - s + bob - hop;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(w / 2, (h + adultSize) / 2 + h * 0.02, s * 0.36 * (1 - hop / (s || 1)), s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(spriteCanvas(bug, style, level, fineFor(s)), ox, oy, s, s);
  ctx.restore();
  return { px, s, ox, oy };
}
const GRAVE = [
  '....oooooooo....', '..ooSSSSSSSSoo..', '.oSSSSSSSSSSHHo.', '.oSSSDDSSDDSSHo.', 'oSSSSSDDDDSSSSHo', 'oSSSSSSDDSSSSSHo',
  'oSSSSSSDDSSSSSHo', 'oSSSSSSDDSSSSSHo', 'oSSSSSSSSSSSSSHo', 'oSSDDDDDDDDDSSHo', 'oSSSSSSSSSSSSSHo', 'oSSDDDDDDDSSSSHo',
  'oSSSSSSSSSSSSSHo', 'oSSSSSSSSSSSSSHo', 'oGgGGgGGgGGGgGGo', 'gggggggggggggggg',
];
const GPAL = { o: '#1a1410', S: '#8a8f96', H: '#b8bec6', D: '#4e535a', G: '#4a8a2a', g: '#2e5e1a' };
/** A small pixel-art headstone for a bug that has died. */
export function drawGrave(ctx, { w, h }) {
  const px = Math.max(2, Math.floor((Math.min(w, h) * 0.62) / 16)); const s = px * 16;
  const ox = Math.round((w - s) / 2), oy = Math.round((h - s) / 2);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) { const k = GRAVE[r][c]; if (k !== '.') { ctx.fillStyle = GPAL[k]; ctx.fillRect(ox + c * px, oy + r * px, px, px); } }
}

// Barn bugs: palette-tinted Stage I WebPs with procedural pixel art for evolutions and loading fallbacks.
// GBA-era style: a 64x64 grid, a small palette per bug (outline, dark, base, light, accent + eye/glint), a dark
// one-pixel outline and simple top-left lighting, then scaled up with nearest-neighbour so the pixels stay crisp.
// Pure functions: spriteGrid() returns the colour grid (used by the client canvas and the node tests alike).
import { MAX_LEVEL } from '../../../server/engine/creatures.js';
import { drawEvolution } from './evolutionArt.js';
import { loadSpriteImage, notifySpriteReady, onSpriteReady } from './spriteLoader.js';
import { stage1Meta, tintImageData } from './stage1Art.js';
export { onSpriteReady, stage1Meta };
export const SPRITE = 64;
// Big sprites are drawn on a grid FINE times as dense: the same shapes, written in the same 64-grid coordinates, with
// smoother edges, a thinner outline and two more tones of shading. Small ones (thumbnails, far-off billboards) keep 64.
export const FINE = 2;
export const HI_COARSE = 256;
export const HI_FINE = 512;
/** The grid to draw a sprite on when it will be shown `s` pixels across: the fine one once each of its pixels gets a whole screen pixel. */
export const fineFor = (s) => (s >= SPRITE * FINE ? FINE : 1);

// Missing levels keep the existing adult presentation for older callers and replays.
export function bugScale(level = MAX_LEVEL, species) {
  const n = Number.isFinite(level) ? Math.floor(level) : MAX_LEVEL;
  // The Lord Howe Island stick insect is a level-30 legendary: clearly larger than a regular bug.
  if (species === 'dryococelus') return 1.15 + Math.min(20, Math.max(0, n - 10)) * 0.03;
  const bounded = Math.max(1, Math.min(MAX_LEVEL, n));
  return 1 - (MAX_LEVEL - bounded) * 0.025;
}

// Development follows species, not adult silhouette: Mantispa is a lacewing; the Picasso bug is not a beetle.
const YOUNG_FORMS = {
  ceroplophana: 'grub', trachelophorus: 'legless-grub', eupholus: 'legless-grub', pachyrhynchus: 'legless-grub',
  chrysochroa: 'borer', lamprima: 'grub', onymacris: 'crawler', brachinus: 'crawler', macrodontia: 'borer',
  sagra: 'grub', manticora: 'crawler', polyphylla: 'grub', phanaeus: 'grub',
  mantispa: 'jawed-larva', nemoptera: 'jawed-larva', helicopsyche: 'caddis',
  pheropsophus: 'crawler', melanophila: 'borer', dytiscus: 'crawler', gyrinus: 'crawler', solenopsis: 'legless-grub', bertholdia: 'grub',
  phloeodes: 'borer', photuris: 'crawler', odontomachus: 'legless-grub', colobopsis: 'legless-grub', dasymutilla: 'legless-grub', ampulex: 'legless-grub', megachile: 'legless-grub',
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
    M: ['#373641', '#747180', '#b6b1ae'],             // iron
    J: ['#69402d', '#bc7a3f', '#f8bf68'],             // brass
    P: ['#746963', '#cabea4', '#f5ead3'],             // porcelain
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
  beetle(c, head, L, opt = {}) {
    const { ry = 15, rx = 14, cy = 38, headY = 17, pron = 7 } = opt;
    legs(c, { y: cy - 4, spread: L.frogleg ? 0.9 : 1 });
    if (L.frogleg) { c.line(22, cy + 6, 10, cy + 14, 'B', 4); c.line(10, cy + 14, 8, cy + 24, 'B', 3); c.line(8, cy + 24, 3, cy + 26, 'D', 2); }
    antennae(head, { y: headY - 2, fan: L.fan });
    if (L.rim) c.ell(32, cy, rx + 1.3, ry + 1.3, 'A'); // a pale margin round the wing cases
    c.ell(32, cy, rx, ry, 'B'); // elytra
    grooves(c, cy, rx, ry);
    for (let y = cy - ry + 3; y < cy + ry - 1; y++) c.put(31.5, y, 'S'); // the seam
    c.ell(32, cy - ry - 1, rx - 3, pron, 'B'); // pronotum
    head.ell(32, headY, 6, 5, 'B');
    eyes(head, 28, headY - 1, 1.5);
    if (L.sheen) for (let y = cy - ry + 4; y < cy + 6; y++) c.put(32 - rx * 0.5 + (y - cy) * 0.12, y, 'H');
    if (L.stripe) for (let y = cy - ry + 2; y < cy + ry - 2; y++) { c.put(32 - rx * 0.55, y, 'A'); }
    if (L.grooves) for (let k = 0; k < 3; k++) for (let y = cy; y < cy + ry - 2; y += 1) if (y % 2) c.put(32 - 3 - k * 3, y, 'S');
    if (L.marbled) [[24, 32], [27, 41], [22, 45], [28, 28], [25, 50], [20, 38]].forEach(([x, y]) => { c.ell(x, y, 2, 1.5, 'L'); });
    if (L.rings) [[24, 32], [32, 29], [26, 41], [32, 46], [22, 49]].forEach(([x, y]) => { c.ell(x, y, 2.5, 2.5, 'A'); c.sym(x, y, 'B'); });
    if (L.blots) { c.ell(25, cy - 4, 3, 3, 'A'); c.ell(26, cy + 7, 2.2, 2.2, 'A'); }
    if (L.knobs) [[25, 29], [28, 35], [22, 38], [27, 43], [23, 47], [28, 51]].forEach(([x, y]) => c.ell(x, y, 1.7, 1.3, 'L')); // a rough, knobbly shell
    if (L.lamp) c.ell(32, cy + ry - 3, rx * 0.62, 3.6, 'A'); // a firefly's lantern, at the tail
  },
};

const lookOf = (bug, level) => ({ ...(bug.look || {}), kind: youngForm(bug, level) || (bug.id === 'helicopsyche' ? 'caddisfly' : bug.look?.kind) });
/** Where the bug's eyes are on the 64 grid: the row through them, their middle, and the right-hand eye's column. Null if it shows none. */
function eyeSpot(grid) {
  const at = []; grid.forEach((row, y) => row.forEach((m, x) => { if (m === 'E' || m === 'G') at.push([x, y]); }));
  if (!at.length) return null;
  const mid = (list, k) => (Math.min(...list.map((p) => p[k])) + Math.max(...list.map((p) => p[k]))) / 2, x = mid(at, 0);
  return { x: Math.round(x), y: Math.round(mid(at, 1)), right: Math.round(mid(at.filter((p) => p[0] >= x), 0)) };
}
function spriteArt(L, fine, stage = 0, botched = false) {
  const c = canvas(fine);
  if (stage) {
    drawEvolution(c, stage, botched);
    if (!botched) fitHead(c, L);
  } else draw(c, L);
  return c;
}

/** Builds the natural sprite grid: rows of hex colours (or null for transparent), 64 x `fine` a side. */
export function spriteGrid(bug, level, fine = 1) {
  const L = lookOf(bug, level);
  const c = spriteArt(L, fine);
  return shade(c.g, ramps(L.pal ?? DEFAULT_PAL), c.part, c.etch);
}

const DEFAULT_PAL = ['#111111', '#333333', '#666666', '#999999', '#cc3333'];
const BODY_OFF = { ell() {}, line() {}, poly() {}, put() {}, sym() {}, hair() {} };
/** Seat the species' own head at the machine's neck, scaling down only long antennae or horns that need the space. */
function fitHead(c, L) {
  const head = canvas(c.f);
  draw(head, L, true);
  const { top, bot, l, r } = bounds(head.g), w = r - l + 1, h = bot - top + 1;
  const scale = Math.min(1, 34 * c.f / w, 19 * c.f / h);
  const left = Math.floor((c.g.length - Math.ceil(w * scale)) / 2), neck = 21 * c.f;
  for (let y = top; y <= bot; y++) for (let x = l; x <= r; x++) {
    const material = head.g[y][x];
    if (!material) continue;
    const X = left + Math.floor((x - l) * scale), Y = neck - Math.floor((bot - y) * scale);
    // Thin antennae survive the forward mapping. Keep eyes when pixels land on the same cell.
    if (c.g[Y][X] === 'G' || (c.g[Y][X] === 'E' && material !== 'G')) continue;
    c.g[Y][X] = material;
    c.part[Y][X] = -head.part[y][x];
  }
}

function draw(head, L, headOnly = false) {
  const c = headOnly ? BODY_OFF : head;
  const k = L.kind;
  if (k === 'grub' || k === 'legless-grub') {
    if (k === 'grub') for (let i = 0; i < 3; i++) c.line(29 + i * 5, 28 + i * 2, 28 + i * 4, 35 + i * 2, 'D', 2, false);
    [[37, 48], [44, 42], [46, 33], [41, 25], [32, 23], [25, 28]].forEach(([x, y]) => c.ell(x, y, 7, 7, 'W', false));
    head.ell(24, 35, 7, 6, 'D', false); head.ell(21, 34, 1.5, 1.5, 'E', false); head.put(20, 33, 'G');
    head.line(21, 40, 18, 44, 'D', 2, false); head.line(26, 40, 23, 44, 'D', 2, false);
  } else if (k === 'borer' || k === 'crawler' || k === 'jawed-larva') {
    const wideHead = k === 'jawed-larva' || (k === 'crawler' && L.jaws);
    if (k !== 'borer') for (let i = 0; i < 3; i++) { c.line(27, 25 + i * 5, 21, 27 + i * 5, 'D', 1); c.line(21, 27 + i * 5, 19, 30 + i * 5, 'D', 1); }
    for (let i = 7; i >= 0; i--) c.ell(32, 25 + i * 4, Math.max(3, 7 - Math.max(0, i - 4)), 3.5, i % 2 ? 'W' : 'L');
    c.ell(32, 21, k === 'borer' ? 9 : 6, 5, 'L'); head.ell(32, 15, wideHead ? 8 : 5, 5, 'D'); eyes(head, wideHead ? 26 : 28, 14, 1);
    head.line(29, 11, 26, wideHead ? 4 : 8, 'D', 2); head.line(26, wideHead ? 4 : 8, 29, wideHead ? 2 : 6, 'D', 1);
  } else if (k === 'caddisfly') {
    legs(c, { y: 35, spread: 0.65, long: 0.75 }); c.ell(32, 40, 4, 14, 'D');
    c.poly([[31, 24], [23, 28], [17, 54], [30, 57]], 'B'); c.line(28, 29, 22, 51, 'L', 1);
    for (let y = 34; y <= 51; y += 4) c.line(22 - (y - 34) * 0.15, y, 19 - (y - 34) * 0.15, y + 1, 'L', 1);
    head.ell(32, 22, 5, 5, 'D'); eyes(head, 28, 21, 1); antennae(head, { y: 18, len: 15, bend: 6 });
  } else if (['chafer', 'jewel', 'darkling', 'ground', 'dung', 'shield', 'frogleg'].includes(k)) {
    if (L.spray) { for (let i = 0; i < 7; i++) c.ell(32 + (i % 2 ? 6 : -6), 58 - i * 0.5, 3 + (i % 3), 2, 'W'); }
    const opt = k === 'jewel' ? { rx: 11, ry: 17, cy: 38 } : k === 'ground' ? { rx: 10, ry: 13, cy: 40, headY: 19 } : k === 'shield' ? { rx: 16, ry: 15, cy: 38, pron: 8 }
      : k === 'darkling' ? { rx: 13, ry: 15, cy: 39 } : k === 'frogleg' ? { rx: 10, ry: 13, cy: 34, headY: 15 } : {};
    KINDS.beetle(c, head, L, opt);
    if (L.horn === 'clypeal') { head.line(32, 14, 32, 6, 'A', 2, false); head.line(32, 6, 34, 3, 'A', 1, false); head.sym(28, 12, 'A'); }
    if (L.horn === 'tall') { head.poly([[30, 15], [34, 15], [32, 2]], 'A', false); }
    if (k === 'dung') c.poly([[22, 20], [42, 20], [36, 24], [28, 24]], 'A', true);
    if (k === 'shield') c.poly([[24, 22], [40, 22], [32, 32]], 'A', false);
  } else if (k === 'stag' || k === 'tiger' || k === 'longhorn') {
    legs(c, { y: 36, spread: k === 'tiger' ? 1.15 : 1, long: k === 'longhorn' ? 1.2 : 1 });
    if (k === 'longhorn') { head.line(28, 15, 16, 4, 'D', 1); head.line(16, 4, 6, 8, 'D', 1); }
    else antennae(head, { y: 15, len: 9 });
    c.ell(32, 41, k === 'tiger' ? 11 : 12, 15, 'B'); grooves(c, 41, k === 'tiger' ? 11 : 12, 15); for (let y = 30; y < 54; y++) c.put(31.5, y, 'S');
    c.ell(32, 25, 9, 5, 'B'); head.ell(32, 17, 7, 5, 'B'); eyes(head, 27, 16, 1.5);
    if (L.sheen) for (let y = 30; y < 46; y++) c.put(26 + (y - 30) * 0.1, y, 'H');
    // mandibles
    const m = L.jaws ? 'A' : 'B';
    if (k === 'longhorn') { head.line(28, 13, 22, 4, m, 2); head.line(22, 4, 26, 0, m, 1); head.sym(23, 7, 'o'); }
    else if (k === 'tiger') { head.line(29, 13, 25, 7, m, 2); head.line(25, 7, 30, 4, m, 1); head.sym(26, 9, 'o'); }
    else { head.line(29, 13, 24, 6, m, 2); head.line(24, 6, 27, 2, m, 1); head.sym(25, 7, 'S'); }
  } else if (k === 'weevil') {
    legs(c, { y: 40, long: 1.05 });
    c.ell(32, 42, 11, 13, 'B'); if (!L.neck) grooves(c, 42, 11, 13);
    if (L.neck) { head.line(32, 30, 32, 10, 'D', 4, false); head.ell(32, 9, 4, 3, 'D'); eyes(head, 29, 8, 1); head.line(29, 8, 25, 4, 'D', 1); }
    else { c.ell(32, 27, 7, 5, 'B'); head.ell(32, 20, 4, 4, 'B'); head.line(32, 22, 32, 12, 'D', 3, false); eyes(head, 29, 20, 1.5); head.line(30, 15, 24, 11, 'D', 1); }
    if (L.bands) [36, 44, 50].forEach((y) => { for (let x = 22; x <= 32; x++) c.sym(x, y, 'A'); });
    if (L.dots) [[26, 36], [32, 41], [25, 46], [30, 51], [32, 32]].forEach(([x, y]) => c.ell(x, y, 2, 2, 'A'));
    if (L.neck) for (let y = 32; y < 53; y++) c.put(31.5, y, 'S');
    if (L.neck) c.ell(32, 42, 10, 12, 'A');
  } else if (k === 'treehopper' || k === 'leafhopper') {
    legs(c, { y: 44, long: 0.8 });
    c.poly([[32, 22], [22, 34], [24, 52], [32, 56]], 'B'); head.ell(32, 30, 9, 6, 'B'); eyes(head, 25, 30, 1.5);
    if (L.globes) { head.line(32, 24, 32, 10, 'D', 1, false); head.line(32, 12, 22, 6, 'D', 1); [[22, 6], [27, 4], [20, 12]].forEach(([x, y]) => { head.ell(x, y, 2.5, 2.5, 'L'); }); head.ell(32, 9, 2, 2, 'L', false); }
    if (L.thorn) { head.poly([[26, 30], [38, 30], [34, 6], [31, 5]], 'B', false); for (let y = 10; y < 30; y += 3) head.put(31, y, 'A'); }
    if (L.stripes) for (let y = 36; y < 54; y += 4) for (let x = 24; x <= 32; x++) c.sym(x, y, 'A');
    if (k === 'leafhopper') head.ell(32, 26, 7, 4, 'L');
  } else if (k === 'lanternfly') {
    c.poly([[30, 26], [8, 40], [10, 52], [30, 46]], 'B'); // forewing
    c.ell(16, 46, 5, 4, 'A');
    legs(c, { y: 40, long: 0.7 });
    c.ell(32, 40, 5, 13, 'D'); head.ell(32, 25, 6, 5, 'B'); eyes(head, 27, 25, 1.5);
    if (L.snout === 'long') { head.line(32, 20, 32, 4, 'A', 3, false); for (let y = 6; y < 20; y += 4) head.put(31, y, 'L'); }
    else { head.ell(32, 14, 4, 7, 'L', false); head.line(32, 8, 28, 3, 'A', 1); head.line(32, 8, 32, 2, 'A', 1, false); head.sym(30, 5, 'A'); }
  } else if (k === 'assassin') {
    legs(c, { y: 38, spread: 1.2, long: 1.2 });
    c.ell(32, 42, 10, 13, 'B'); c.poly([[26, 26], [38, 26], [36, 32], [28, 32]], 'B', false); head.ell(32, 20, 4, 6, 'B'); eyes(head, 28, 19, 1.5);
    head.line(32, 14, 32, 8, 'D', 1, false); antennae(head, { y: 15, len: 12, bend: 6 });
    if (L.spots) { c.ell(26, 40, 3, 3, 'A'); }
    if (L.cloak) { [[26, 36], [32, 33], [37, 38], [24, 44], [31, 42], [38, 46], [28, 50], [35, 51]].forEach(([x, y], i) => { c.ell(x, y, 3, 2, i % 2 ? 'L' : 'D', false); }); c.ell(32, 42, 2, 2, 'A', false); }
  } else if (k === 'caddis') {
    c.ell(32, 40, 15, 15, 'L'); c.ell(32, 40, 10, 10, 'B'); c.ell(32, 40, 5, 5, 'L'); c.ell(32, 40, 2, 2, 'D');
    head.ell(32, 22, 6, 5, 'D'); eyes(head, 29, 21, 1); head.line(27, 25, 21, 30, 'D', 2); head.line(28, 26, 24, 33, 'D', 1);
  } else if (k === 'larva') {
    if (L.threads) for (const [x, n] of [[7, 6], [14, 9], [20, 5]]) { c.line(x, 4, x, 4 + n * 6, 'W', 1); for (let i = 1; i <= n; i++) c.ell(x, 4 + i * 6, 1.3, 1.3, 'L'); } // a glowworm's snares: silk lines beaded with glue
    for (let i = 0; i < 10; i++) c.ell(32, 14 + i * 4.6, 8 - (i > 7 ? (i - 7) * 1.5 : 0), 3, i % 2 ? 'B' : 'D');
    head.ell(32, 10, 6, 4, 'B'); eyes(head, 29, 10, 1);
    if (L.threads) c.ell(32, 55, 5, 4.5, 'A'); // its one light, at the tail
    else { head.ell(28, 7, 1.5, 1.5, 'A'); for (let i = 1; i < 10; i++) c.ell(25, 14 + i * 4.6, 1.5, 1, 'L'); } // a railroad worm's red head lamps, and the row down each side
  } else if (k === 'tree-lobster') {
    // Top-down Dryococelus australis, after the dorsal museum reference: a long thin segmented
    // body, a small head, long antennae, slim fore/mid legs, and thick curved spiny hind femora.
    const joint = (x0, y0, x1, y1, x2, y2, w1 = 2, w2 = 1) => {
      c.line(x0, y0, x1, y1, 'D', w1); c.line(x1, y1, x2, y2, 'D', w2);
      c.hair([[x2 - 1.2, y2 + 1.4], [x2, y2 + 0.2], [x2 + 1.1, y2 + 1.6]], 'D');
    };
    joint(29, 20, 24, 14, 21, 8, 1, 1);           // fore
    joint(29, 28, 22, 30, 16, 34, 2, 1);           // mid
    c.line(29, 36, 20, 42, 'D', 4);                // hind femur, swollen
    c.line(20, 42, 15, 50, 'D', 3);
    c.line(15, 50, 13, 58, 'D', 2);                // hind tibia
    c.hair([[12, 59.5], [13, 58.2], [14.2, 59.7]], 'D');
    c.put(22, 40, 'A'); c.put(20, 43, 'A'); c.put(18, 46, 'A'); // femoral spines
    // Body: small head, long thorax, eight tapering abdominal segments.
    head.ell(32, 8, 3.4, 3.6, 'B');
    eyes(head, 29, 8, 1);
    head.line(31, 5, 28, 1, 'D', 1);
    antennae(head, { x: 30, y: 5, len: 10, bend: 2 });
    c.ell(32, 13, 3.2, 3.2, 'B');                  // prothorax
    c.ell(32, 20.5, 4.2, 5.6, 'B');                // mesothorax
    c.ell(32, 28, 4.6, 3.8, 'B');                  // metathorax
    const abs = [4.6, 4.8, 4.6, 4.2, 3.7, 3.1, 2.4, 1.7];
    let ay = 32.2;
    abs.forEach((rx, i) => {
      const ry = 2.15;
      c.ell(32, ay, rx, ry, i % 2 ? 'B' : 'D');
      ay += 3.15;
    });
    c.line(31, 56, 31, 61, 'D', 1); c.line(33, 56, 33, 61, 'D', 1); // cerci
    // A short glossy gleam on the thorax only — a full-length zipper reads as a skeleton.
    for (let y = 16; y < 30; y += 2) c.put(32, y, 'L');
  } else if (k === 'mantis' || k === 'stick') {
    const wide = L.leaf;
    if (L.eyespot) { c.ell(19, 44, 10, 13, 'L'); c.ell(19, 44, 4, 4, 'A'); c.ell(19, 44, 2, 2, 'S'); }
    legs(c, { y: 40, spread: 1, long: 1.3, fore: k === 'mantis' ? 'raptor' : null });
    c.ell(32, 46, wide ? 12 : k === 'stick' ? 9 : 6, k === 'stick' ? 14 : 12, 'B');
    if (wide) c.poly([[24, 24], [40, 24], [36, 36], [28, 36]], 'B', false), c.poly([[22, 26], [24, 24], [28, 36], [22, 32]], 'B');
    c.line(32, 34, 32, 22, 'B', wide ? 5 : 3, false); // prothorax
    head.poly([[24, 12], [40, 12], [32, 21]], 'B', false); eyes(head, 25, 12, 2);
    if (k === 'mantis') { c.line(29, 24, 22, 30, 'B', 2); c.line(22, 30, 24, 18, 'B', 2); for (let y = 20; y < 29; y += 2) c.sym(25, y, 'A'); }
    if (L.cone) head.poly([[30, 11], [34, 11], [33, 1], [31, 1]], 'A', false);
    antennae(head, { x: 29, y: 10, len: 9, bend: 5, feather: L.cone });
    if (L.spines) for (let y = 34; y < 60; y += 3) { c.sym(22 + ((y / 3) % 2), y, 'A'); }
    if (k === 'stick') c.ell(32, 44, 4, 8, 'A', false);
  } else if (k === 'lacewing') {
    if (L.spoons) { c.line(28, 40, 14, 60, 'D', 1); c.ell(13, 59, 3, 2.5, 'A'); }
    c.poly([[30, 26], [6, 22], [4, 36], [30, 38]], 'W'); for (let x = 8; x < 30; x += 4) c.line(x, 24, x, 37, 'L', 1);
    c.ell(32, 40, 3, 13, 'B'); c.ell(32, 25, 4, 4, 'B'); head.ell(32, 19, 4, 3, 'A'); eyes(head, 29, 19, 1.5);
    antennae(head, { y: 16, len: 12, bend: 4 }); legs(c, { y: 30, spread: 0.5, long: 0.7 });
  } else if (k === 'waterbug') {
    const rx = L.oars ? 9 : 14; // the rowers (a backswimmer, a water boatman) are slim, with oar legs and no grabbing arms
    legs(c, { y: 44, spread: L.oars ? 0.9 : 1.3, long: L.oars ? 0.8 : 1.1, fore: 'raptor' });
    if (L.oars) { c.line(23, 46, 5, 43, 'D', 2); c.ell(5, 43, 3.5, 1.6, 'A'); }
    else { c.line(24, 30, 14, 26, 'D', 3); c.line(14, 26, 18, 16, 'D', 2); c.line(18, 16, 22, 15, 'A', 1); }
    c.ell(32, 42, rx, 16, 'B'); grooves(c, 42, rx, 16); for (let y = 34; y < 57; y++) c.put(31.5, y, 'S'); c.ell(32, 26, rx - 4 + (L.oars ? 3 : 0), 5, 'B'); head.ell(32, 20, 5, 4, 'B'); eyes(head, 27, 19, 2);
  } else if (k === 'ant') {
    if (L.wings) { c.poly([[29, 25], [13, 33], [9, 50], [18, 55], [28, 38]], 'W'); c.line(27, 28, 13, 48, 'L', 1); } // a wasp's wings, swept back
    legs(c, { y: 30, spread: 1.15, long: 1.15 });
    if (L.thighs) { c.line(25, 30, 11, 32, 'A', 2); c.line(26, 36, 15, 45, 'A', 2); } // red thighs on the back two pairs
    head.line(29, 12, 22, 6, 'D', 1); head.line(22, 6, 16, 10, 'D', 1); // elbowed antennae
    c.ell(32, 47, 8, 10, 'B'); band(c, 47, 8, 10, [44, 49]); // the gaster
    if (L.goo) c.ell(32, 47, 5, 6.5, 'A'); // what an exploding ant keeps in it
    c.poly([[31, 56], [33, 56], [32, 61]], 'A', false); // and its sting
    c.ell(32, 35, 2.5, 2.5, 'D'); // the waist
    c.ell(32, 28, 5, 6, 'B'); head.ell(32, 16, 6.5, 6, 'B'); eyes(head, 27, 16, 1.5);
    if (L.fuzz) { c.ell(32, 28, 4, 5, 'A'); c.ell(32, 44, 6.5, 3.5, 'A'); c.ell(32, 52, 5, 2.5, 'A'); } // velvet: red on the thorax and in bands across the gaster
    if (L.trap) { head.line(29, 11, 17, 9, 'A', 2); head.line(17, 9, 15, 6, 'A', 1); head.hair([[30, 10], [28, 4]], 'D'); } // jaws held open at 180 degrees, and a trigger hair
    else { head.line(29, 10, 26, 6, 'A', 2); head.line(26, 6, 30, 4, 'A', 1); } // mandibles
  } else if (k === 'antlion') {
    legs(c, { y: 32, spread: 0.85, long: 0.7 });
    c.ell(32, 44, 12, 13, 'B'); band(c, 44, 12, 13, [37, 42, 47, 52]); // a very plump abdomen
    for (const [x, y] of [[21, 38], [19, 45], [21, 52]]) c.hair([[x, y], [x - 3, y + 1]], 'D'); // bristles
    c.ell(32, 29, 6, 4.5, 'B'); head.ell(32, 21, 5.5, 4.5, 'D'); eyes(head, 28, 20, 1); // a small thorax and a flat head
    head.line(29, 18, 21, 13, 'A', 2); head.line(21, 13, 21, 6, 'A', 1); head.line(21, 6, 25, 3, 'A', 1); // sickle jaws
  } else if (k === 'moth') {
    c.poly([[30, 24], [4, 30], [8, 50], [29, 44]], 'B'); c.poly([[29, 40], [12, 50], [18, 58], [30, 52]], 'L'); // forewing over hindwing
    c.poly([[25, 30], [12, 34], [20, 42]], 'W'); // the clear window in the forewing
    for (const [x, y] of [[9, 37], [15, 45]]) c.ell(x, y, 1.5, 1.5, 'A');
    c.ell(32, 40, 4, 14, 'L'); band(c, 40, 4, 14, [34, 38, 42, 46]); // a furry body
    head.ell(32, 24, 5, 4, 'D'); eyes(head, 28, 23, 1.5); antennae(head, { y: 20, len: 12, bend: 6, feather: true });
  } else if (k === 'cicada') {
    legs(c, { y: 30, spread: 0.8, long: 0.8 });
    c.poly([[26, 24], [16, 30], [13, 46], [19, 62], [27, 57]], 'W'); // long glassy wings, folded back past the tail
    c.line(25, 27, 17, 44, 'L', 1); c.line(17, 44, 21, 60, 'L', 1); c.line(24, 34, 23, 55, 'L', 1); // their veins
    c.ell(32, 38, 7, 13, 'B'); band(c, 38, 7, 13, [34, 39, 44, 48]);
    c.ell(32, 25, 10, 6, 'B'); head.ell(32, 17, 9, 4.5, 'D'); eyes(head, 26, 17, 2); // a broad head, the eyes set wide
    head.ell(32, 14, 1.5, 1.5, 'A', false); antennae(head, { x: 29, y: 13, len: 4, bend: 2 });
  } else if (k === 'skater') {
    c.line(29, 26, 13, 11, 'D', 1); c.line(13, 11, 5, 13, 'D', 1); // short forelegs
    c.line(28, 32, 7, 30, 'D', 1); c.line(7, 30, 1, 22, 'D', 1); // the middle legs it rows with
    c.line(28, 38, 11, 52, 'D', 1); c.line(11, 52, 5, 61, 'D', 1); // hind legs, trailing
    for (const [x, y] of [[4, 14], [2, 21], [6, 61]]) c.ell(x, y, 2.5, 1, 'W'); // dimples where its feet rest on the water
    c.ell(32, 34, 5, 9, 'B'); c.ell(32, 33, 2.5, 6, 'L'); head.ell(32, 23, 4, 3.5, 'B'); eyes(head, 28, 22, 1.5);
    antennae(head, { x: 30, y: 20, len: 8, bend: 5 });
  } else if (k === 'roach') {
    legs(c, { y: 34, spread: 1.05, long: 0.9 });
    head.line(29, 12, 20, 2, 'D', 1); head.line(20, 2, 8, 6, 'D', 1); // long antennae
    c.ell(32, 42, 12, 16, 'B'); band(c, 42, 12, 16, [33, 38, 43, 48, 53]); for (let y = 30; y < 57; y++) c.put(31.5, y, 'S'); // armoured segments, no wings
    c.ell(32, 22, 11, 7, 'D'); c.ell(27, 21, 2, 1.5, 'B'); // the shield over its head, with the male's two bumps
    head.ell(32, 14, 4, 3, 'D'); eyes(head, 29, 14, 1);
  } else if (k === 'dragonfly') {
    c.poly([[30, 23], [3, 15], [1, 23], [29, 29]], 'W'); c.poly([[30, 30], [4, 33], [2, 42], [29, 36]], 'W'); // two pairs of wings, held straight out
    c.line(29, 25, 4, 18, 'L', 1); c.line(29, 32, 5, 36, 'L', 1); // the leading vein of each
    for (let x = 8; x < 28; x += 5) { c.hair([[x, 17 + (x - 3) * 0.24], [x + 1, 24 + (x - 3) * 0.2]], 'L'); c.hair([[x, 34 - (x - 4) * 0.1], [x + 1, 41 - (x - 4) * 0.22]], 'L'); } // and the net of veins it is named for
    for (const [x, y] of [[6, 18], [7, 36]]) c.ell(x, y, 2, 1, 'A'); // a dark spot near each tip
    legs(c, { y: 24, spread: 0.45, long: 0.5, fore: 'raptor' }); // its front pair is tucked under the head
    c.ell(32, 44, 2.6, 18, 'B'); band(c, 44, 2.6, 18, [31, 36, 41, 46, 51, 56]); // a long, thin abdomen
    c.ell(32, 27, 5, 6.5, 'B'); // the thorax the wings hang from
    head.ell(32, 16, 6, 4.5, 'D'); eyes(head, 27, 15, 2.5); // a head that is mostly eyes
  } else if (k === 'cricket') {
    legs(c, { y: 36, spread: 0.8, long: 0.75, fore: 'raptor' });
    c.line(26, 24, 17, 21, 'B', 4); c.poly([[18, 16], [10, 14], [8, 22], [12, 26], [18, 24]], 'A'); // shovel forelegs
    c.line(30, 58, 26, 63, 'D', 1); // cerci
    c.ell(32, 46, 7, 13, 'L'); band(c, 46, 7, 13, [42, 46, 50, 54]);
    c.ell(32, 36, 6, 6, 'W'); c.ell(32, 25, 8, 8, 'B'); // short wings under a big collar
    head.ell(32, 15, 5, 4, 'B'); eyes(head, 28, 14, 1.5); antennae(head, { y: 12, len: 7, bend: 4 });
  } else {
    KINDS.beetle(c, head, L);
  }
}
/** Bands across an oval body part, at the rows given: segment lines, kept inside its edge. */
function band(c, cy, rx, ry, rows) {
  for (const y of rows) { const w = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)); for (let x = Math.ceil(33 - w); x <= 31; x++) c.sym(x, y, 'S'); }
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
// Hat brim [x, y] and eye centers [left x, right x, y] on the WebPs' equivalent 64-pixel grid.
const STAGE1_WEAR_ANCHORS = {
  'stage1-aquatic': { crown: [32, 9], eyes: [28, 36, 12] },
  'stage1-beetle': { crown: [32, 16], eyes: [26, 38, 20] },
  'stage1-crawler': { crown: [32, 8], eyes: [27, 37, 11] },
  'stage1-flier': { crown: [32, 13], eyes: [29, 35, 15] },
  'stage1-grub': { crown: [32, 6], eyes: [27, 38, 10] },
  'stage1-hopper': { crown: [32, 13], eyes: [27, 37, 17] },
  'stage1-larva': { crown: [33, 6], eyes: [30, 35, 9] },
  'stage1-mantis': { crown: [32, 8], eyes: [29, 35, 10] },
  'stage1-shield': { crown: [32, 10], eyes: [27, 37, 13] },
  'stage1-weevil': { crown: [32, 13], eyes: [29, 35, 15] },
};
function bounds(grid) {
  const n = grid.length;
  let top = n, bot = 0, l = n, r = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (grid[y][x]) { top = Math.min(top, y); bot = Math.max(bot, y); l = Math.min(l, x); r = Math.max(r, x); }
  let tl = n, tr = 0; for (let y = top; y < top + 4 && y < n; y++) for (let x = 0; x < n; x++) if (grid[y][x]) { tl = Math.min(tl, x); tr = Math.max(tr, x); }
  return { top, bot, l, r, cx: Math.round((tl + tr) / 2) };
}
function overlay(ctx, grid, shape, eye, crown) {
  const w = WEARPIX[shape]; if (!w) return;
  if (w.with) overlay(ctx, grid, w.with, eye, crown);
  const b = bounds(grid); const pw = Math.max(...w.p.map((r) => r.length)), ph = w.p.length;
  const hgt = b.bot - b.top;
  const [headX, headY] = crown ?? [b.cx, b.top];
  let x = headX - Math.floor(pw / 2), y = headY - ph + 1;
  let scaleX = 1;
  if (w.at === 'topside') { x = headX + 2; y = headY - 2; }
  // by the eyes (a bug that shows none: about where a face would be). A wide piece (shades) goes across both, a narrow
  // one (a monocle) on the right-hand eye, each with its lens on its second row; 'lip' is centred a little below them.
  const E = eye || { x: b.cx, y: b.top + Math.round(hgt * 0.22) + 1, right: b.cx + 4 };
  if (w.at === 'eye') {
    // The wide frame has seven cells between its lens centers.
    if (pw > 6 && E.left !== undefined) scaleX = Math.max(0.5, (E.right - E.left) / 7);
    y = E.y - 1;
    x = pw > 6 ? E.x - Math.floor(pw * scaleX / 2) : E.right - 1;
  }
  if (w.at === 'lip') { x = E.x - Math.floor(pw / 2); y = E.y + 4; }
  if (w.at === 'mid') y = b.top + Math.round(hgt * 0.42);
  if (w.at === 'back') { x = b.l - 2; y = b.top + Math.round(hgt * 0.3); }
  x = Math.max(0, Math.min(SPRITE - Math.round(pw * scaleX), Math.round(x)));
  y = Math.max(0, Math.min(SPRITE - ph, y));
  w.p.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const left = Math.round(c * scaleX), right = Math.round((c + 1) * scaleX);
    ctx.fillStyle = w.k[ch];
    ctx.fillRect(x + left, y + r, right - left, 1);
  }));
}
// v35: battle gear shows too, fitted to the sprite's own body (its centre run of pixels) and leg tips.
const bodyRun = (grid, y) => { if (!grid[y]?.[31]) return null; let a = 31, b = 32; while (a > 0 && grid[y][a - 1]) a--; while (b < SPRITE - 1 && grid[y][b + 1]) b++; return [a, b]; };
const legTip = (grid, y0, y1) => { let best = null; for (let y = Math.max(0, y0); y <= Math.min(SPRITE - 1, y1); y++) { const x = grid[y].findIndex(Boolean); if (x >= 0 && x < 31 && (!best || x < best[0])) best = [x, y]; } return best; };
function stamp(ctx, p, k, x, y, mirror = false) {
  p.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') return; ctx.fillStyle = k[ch]; ctx.fillRect(x + c, y + r, 1, 1); if (mirror) ctx.fillRect(SPRITE - 1 - x - c, y + r, 1, 1); }));
}
export const GEAR_SHAPES = ['shell', 'claws', 'boots', 'helmet', 'shield', 'mandibles', 'armor', 'bandage'];
function gearOverlay(ctx, grid, shape, evolved, crown) {
  const b = bounds(grid), h = b.bot - b.top, at = (f) => b.top + Math.round(h * f);
  let head = crown?.[1] ?? b.top;
  if (!crown) while (head < b.bot && (bodyRun(grid, head)?.reduce((l, r) => r - l) ?? 0) < 5) head++;
  const headX = crown?.[0] ?? 32;
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
    case 'boots': (evolved ? [[0.86, 1]] : [[0.22, 0.45], [0.46, 0.68], [0.69, 1]]).forEach(([f0, f1]) => { const t = legTip(grid, at(f0), at(f1)); if (t) stamp(ctx, ['.BB', '.Bb', 'bbb', 'sss'], { B: '#d08848', b: '#9a5226', s: '#3a2010' }, t[0] - 1, t[1] - 2, true); }); break;
    case 'claws': { const t = legTip(grid, b.top, at(0.42)); if (t) stamp(ctx, ['s...', 'ss..', '.sS.', '.sSS', '..SS'], { s: '#f4f8fc', S: '#8a929c' }, t[0] - 2, t[1] - 3, true); break; }
    case 'mandibles': stamp(ctx, ['g..........g', 'gg........gg', 'Ggg......ggG', '.GGg....gGG.', '..GGg..gGG..'], { g: '#ffe070', G: '#b08a20' }, headX - 6, head - 4); break;
    case 'helmet': stamp(ctx, ['.....ss.....', '...kkkkkk...', '.kkKkKkKkkk.', 'kKkKkKkKkKkk', 'kkkkkkkkkkkk', '.hhhhhhhhhh.'], { k: '#9a6e40', K: '#5c4028', s: '#4a3018', h: '#c89a5a' }, headX - 6, head - 3); break;
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
function paintWearScaled(ctx, wear, body, outline, N, fine) {
  const big = fine !== 1 ? scale2x(wear) : wear, M = big.length, step = N / M, on = (x, y) => !!big[y]?.[x];
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const v = big[y][x];
    if (v) ctx.fillStyle = !on(x, y - 1) || !on(x - 1, y) ? mix(v, '#ffffff', 0.3) : !on(x, y + 1) || !on(x + 1, y) ? mix(v, '#000000', 0.3) : v;
    else if (!body?.[y]?.[x] && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) ctx.fillStyle = outline;
    else continue;
    ctx.fillRect(x * step, y * step, step, step);
  }
}

/** True when this bug/style/level resolves to an enabled pre-rendered high-res WebP sprite. */
export function isHiResSprite(bug, style, level) {
  const stage = style?.evo === 2 ? 2 : style?.evo === 1 ? 1 : 0;
  if (stage !== 0 || !bug) return false;
  return !!stage1Meta(bug, youngForm(bug, level))?.src;
}

/**
 * The bug's sprite, cached by species, life stage and look, with its accessories: 64x64, or 64 x `fine` a side for
 * a big drawing (fineFor); high-res Stage I bugs upgrade cleanly to tinted 256/512 WebPs once loaded.
 */
export function spriteCanvas(bug, style, level, fine = 1) {
  const stage = style?.evo === 2 ? 2 : style?.evo === 1 ? 1 : 0;
  const botched = stage > 0 && !!style?.botched;
  const artLevel = stage ? undefined : level;
  const young = youngForm(bug, artLevel);
  const s1 = stage === 0 ? stage1Meta(bug, young) : null;
  const hiAsset = !!s1?.src;
  const key = `${bug.id}|${young || ''}|${style?.bugskin?.id || ''}|${style?.bughat?.shape || ''}|${style?.bugacc?.shape || ''}|${style?.gear?.shape || ''}|${style?.defense?.shape || ''}|${stage}|${botched}|${hiAsset ? s1.key : ''}|${fine}`;
  if (cache.has(key)) return cache.get(key);
  const L = lookOf(bug, artLevel), pal = style?.bugskin?.pal ?? L.pal ?? DEFAULT_PAL, R = ramps(pal);
  const art = spriteArt(L, fine, stage, botched), N = hiAsset ? (fine > 1 ? HI_FINE : HI_COARSE) : SPRITE * fine;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const ctx = c.getContext('2d'), body = shade(art.g, R, art.part, art.etch);
  paintSprite(ctx, body, 0, 0, N);
  const hasWear = !!(style?.defense?.shape || style?.gear?.shape || style?.bugacc?.shape || style?.bughat?.shape);
  const paintOverlays = (grid, eye, crown, loaded = false) => {
    // Overlays write 64-grid pixels, then scale to the fine or hi-res layer.
    const direct = !hiAsset && fine === 1;
    const wear = direct ? null : Array.from({ length: SPRITE }, () => new Array(SPRITE).fill(null));
    let ink = null;
    const x = direct ? ctx : { set fillStyle(v) { ink = v; }, fillRect(px, py, w, h) { for (let r = py; r < py + h; r++) for (let q = px; q < px + w; q++) if (r >= 0 && r < SPRITE && q >= 0 && q < SPRITE) wear[r][q] = ink; } };
    if (style?.defense?.shape) gearOverlay(x, grid, style.defense.shape, stage, crown); // defense gear goes on first, the attack item over it
    if (style?.gear?.shape) gearOverlay(x, grid, style.gear.shape, stage, crown);
    if (style?.bugacc?.shape) overlay(x, grid, style.bugacc.shape, eye, crown);
    if (style?.bughat?.shape) overlay(x, grid, style.bughat.shape, eye, crown);
    if (hiAsset) paintWearScaled(ctx, wear, loaded ? null : body, R.o, N, fine);
    else if (fine !== 1) paintWear(ctx, wear, body, R.o);
  };
  let grid, proceduralEye;
  if (hasWear) {
    const coarse = fine === 1 ? art : spriteArt(L, 1, stage, botched);
    grid = fine === 1 ? body : shade(coarse.g, R, coarse.part, coarse.etch);
    proceduralEye = style?.bugacc?.shape ? eyeSpot(coarse.g) : null;
    paintOverlays(grid, proceduralEye);
  }
  c._rev = 0;
  c._hiRes = false;
  cache.set(key, c);
  if (hiAsset) {
    const paintHiRes = (img, notify) => {
      ctx.clearRect(0, 0, N, N);
      ctx.save?.();
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, N, N);
      ctx.restore?.();
      const anchors = STAGE1_WEAR_ANCHORS[s1.key];
      let artMask;
      if (typeof ctx.getImageData === 'function') {
        const imgData = ctx.getImageData(0, 0, N, N);
        tintImageData(imgData.data, pal);
        ctx.putImageData(imgData, 0, 0);
        if (hasWear && anchors) {
          const step = N / SPRITE, half = step / 2;
          artMask = Array.from({ length: SPRITE }, (_, row) => Array.from({ length: SPRITE }, (_, col) => (
            imgData.data[((row * step + half) * N + col * step + half) * 4 + 3] >= 128
          )));
        }
      }
      if (artMask) {
        const [left, right, y] = anchors.eyes;
        paintOverlays(artMask, { x: (left + right) / 2, left, right, y }, anchors.crown, true);
      } else if (hasWear) paintOverlays(grid, proceduralEye, undefined, true);
      c._hiRes = true;
      c._rev = (c._rev || 0) + 1;
      if (notify) notifySpriteReady(c);
    };
    let sync = true;
    loadSpriteImage(s1.src, (img) => paintHiRes(img, !sync));
    sync = false;
  }
  return c;
}
/**
 * A three.js texture of the bug for a 3D scene (pass the THREE module): procedural stages use pixel-crisp mipmaps
 * (`NearestFilter`); high-res WebP sprites use smooth mipmapped filtering and refresh automatically when loaded.
 */
export function bugTexture(THREE, bug, style, level) {
  if (!isHiResSprite(bug, style, level)) {
    const levels = [spriteCanvas(bug, style, level, FINE), spriteCanvas(bug, style, level)], map = new THREE.CanvasTexture(levels[0]);
    map.mipmaps = levels; map.generateMipmaps = false; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter;
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const img = spriteCanvas(bug, style, level, FINE), map = new THREE.CanvasTexture(img);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.colorSpace = THREE.SRGBColorSpace;
  const unsub = onSpriteReady((ready) => { if (ready === img) map.needsUpdate = true; });
  map.addEventListener('dispose', unsub);
  return map;
}
/** Draws a growing bug (nearest-neighbour for procedural pixel art, high-quality smoothed for hi-res WebPs). */
export function drawBug(ctx, bug, { w, h, t = 0, still = false, poke = 0, flip = false, fill = 0.82, style = null, level }) {
  const hiRes = isHiResSprite(bug, style, level);
  const adultSize = hiRes
    ? Math.max(SPRITE, Math.round(Math.min(w, h) * fill))
    : Math.max(1, Math.floor((Math.min(w, h) * fill) / SPRITE)) * SPRITE;
  const s = Math.round(adultSize * bugScale(level, bug.id)), px = s / SPRITE;
  const bob = still ? 0 : Math.round(Math.sin(t / 420) * px * 1.2);
  const hop = Math.round(Math.sin(Math.min(1, poke) * Math.PI) * px * 6);
  const ox = Math.round((w - s) / 2), oy = Math.round((h - adultSize) / 2 + h * 0.03) + adultSize - s + bob - hop;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(w / 2, (h + adultSize) / 2 + h * 0.02, s * 0.36 * (1 - hop / (s || 1)), s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = hiRes;
  if (hiRes && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
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

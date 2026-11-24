// 16-bit (SNES-era) item icons for the Bug Gym and its General Store gear: 16x16, one shared limited palette, a 1px
// dark outline and light from the top left, drawn here from primitives (no image files, no borrowed sprites).
// Shown only at whole multiples of 16 CSS px with nearest-neighbour scaling, so every pixel stays square.
// gymPixGrid(name) -> { w, h, px: Array<string|null> } is pure, so tests and a node preview can use it.
export const GPX = 16;
export const OUTLINE = '#1a1220';
export const PAL = {
  w: '#fbf6e9', l: '#c9cbd6', g: '#8b8fa3', d: '#555a6e', k: '#2a2034',
  y: '#ffe066', Y: '#e8b52e', o: '#9a6418', a: '#e0952c',
  r: '#f05a48', R: '#a8283a', p: '#ff9aa8',
  b: '#7cc4ff', B: '#3a74d4', N: '#22408a',
  c: '#dff4ff', C: '#8fd0f0', S: '#4a9ac8',
  G: '#86dc5e', H: '#3a8f3c', L: '#d4f26a', M: '#8cb83a',
  n: '#8a5430', m: '#563020', t: '#f2c99a', T: '#c98d5a',
};
const N = GPX;

function canvas() {
  const px = new Array(N * N).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c ? PAL[c] || c : null; };
  const g = {
    px, set,
    rect: (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); return g; },
    dots: (c, ...pts) => { for (const [x, y] of pts) set(x, y, c); return g; },
    row: (y, x0, s) => { [...s].forEach((ch, i) => { if (ch !== ' ') set(x0 + i, y, ch === '.' ? null : ch); }); return g; },
    ell: (cx, cy, rx, ry, c, f = () => true) => { for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) if (((i - cx) / (rx + 0.3)) ** 2 + ((j - cy) / (ry + 0.3)) ** 2 <= 1 && f(i, j)) set(i, j, c); return g; },
  };
  return g;
}
/** A pixel map: rows of palette letters ('.' or ' ' is empty), placed at x0, y0. */
const map = (g, rows, x0 = 0, y0 = 0) => { rows.forEach((s, j) => g.row(y0 + j, x0, s)); return g; };
/** The dark outline around everything drawn (4-neighbour), the 16-bit item-sprite look. */
function outline(px) {
  const o = px.slice();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (px[y * N + x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < N && Y < N && px[Y * N + X] && px[Y * N + X] !== OUTLINE; })) o[y * N + x] = OUTLINE;
  }
  return o;
}

const ART = {
  // ---------- gym gear ----------
  salts: (g) => map(g, [
    '          c  ',
    '    TT   c   ',
    '    tT    c  ',
    '    ka   c   ',
    '   aYaa      ',
    '  aYyYao     ',
    '  awwwwo     ',
    '  awRRwo     ',
    '  awRRwo     ',
    '  awwwwo     ',
    '  aYaaao     ',
    '  aYaaao     ',
    '  oooooo     ',
  ], 2, 1),
  prework: (g) => map(g, [
    ' NNNNNNNNNNNN ',
    ' NbbbbbbbbbBN ',
    ' kNNNNNNNNNNk ',
    '  bBBBBBBBBN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bwwwwwwwwN  ',
    '  bBBBBBBBBN  ',
    '   NNNNNNNN   ',
  ], 1, 1).dots('Y', [8, 5], [7, 6], [6, 7], [7, 7], [8, 8], [7, 9], [7, 10]).dots('a', [9, 5], [8, 6], [8, 7], [9, 7], [9, 8], [8, 9]),
  mask: (g) => map(g, [
    '    dddddd    ',
    '  ddggggggdd  ',
    ' dggggggggggd ',
    ' dgCCggggCCgd ',
    'kdgcCggggcCgdk',
    ' dgCCggggCCgd ',
    ' dgggddddgggd ',
    '  ddgllllgdd  ',
    '   dlkkkkld   ',
    '   dlllllld   ',
    '   dlkkkkld   ',
    '    dddddd    ',
  ], 1, 2),
  banana: (g) => map(g, [
    '           m  ',
    '          nY  ',
    '          YY  ',
    '         yYo  ',
    '        yYYo  ',
    '       yyYo   ',
    '     yyyYYo   ',
    '  myyyyYYo    ',
    '   oYYYYoo    ',
    '    ooooo     ',
  ], 1, 3),
  brace: (g) => map(g, [
    '    ttT    ',
    '    ttT    ',
    '   lllllll ',
    '   NbBBBBN ',
    '   NbdkdBN ',
    '   NbkwkBN ',
    '   NbdkdBN ',
    '   NbBBBBN ',
    '   lllllll ',
    '    ttT    ',
    '    ttT    ',
    '    ttT    ',
    '    tttTTT ',
    '    ttttTTT',
  ], 2, 1),
  glp1: (g) => map(g, [
    '           kd  ',
    '          kgd  ',
    '         Ngd   ',
    '        NBb    ',
    '       NBbN    ',
    '      NBbN     ',
    '     NBbN      ',
    '    acaN       ',
    '   aYcN        ',
    '  oYaN         ',
    '  ooa          ',
    '  l            ',
  ], 0, 2),
  sweatband: (g) => map(g, [
    '   MMMMMMMM   ',
    ' MMLLLLLLLLMM ',
    'MLLMMkkkkMMLLM',
    'MLLLLMMMMLLLLM',
    'MwwwwwwwwwwwwM',
    'MLLLLLLLLLLLMM',
    'MwwwwwwwwwwwwM',
    'MLLLLLLLLLLLMM',
    ' MMLLLLLLLLMM ',
    '   MMMMMMMM   ',
  ], 1, 3),
  creatine: (g) => map(g, [
    '     w      ',
    '   wwwwl    ',
    '  wwwwwwl   ',
    ' wwwwwwwwl  ',
    'bbbbbbbbbbB ',
    'bBBBBBBBBBNkkkk',
    ' bBBBBBBBNkgggk',
    '  NNNNNNN  kkk ',
  ], 0, 5),
  // ---------- the five paths ----------
  clean: (g) => map(g, [
    '   rrrr       ',
    '   rRwr       ',
    '   rrwrr      ',
    '   rRwrrr     ',
    '  rrrrrrrrr   ',
    '  rRRRRrrrrrr ',
    ' wwwwwwwwwwwww',
    ' llllllllllll ',
  ], 0, 5),
  spar: (g) => map(g, [
    '    rrrrr    ',
    '   rpprrrr   ',
    '  rpprrrrrR  ',
    '  rprrrrrrR  ',
    '  rrrrrrrrR  ',
    ' rrRrrrrrrR  ',
    ' rpRrrrrrRR  ',
    ' rrRRrrrRR   ',
    '  rrRRRRR    ',
    '   wwwwww    ',
    '   lllllw    ',
    '   llllll    ',
  ], 1, 2),
  overwork: (g) => map(g, [
    ' dd        dd ',
    'dggd      dggd',
    'dgld      dgld',
    'dglllllllllgld',
    'dgddddddddddgd',
    'dggd      dggd',
    'dgdd      dggd',
    ' dd        dd ',
  ], 1, 4),
  roids: (g) => map(g, [
    '          d   ',
    '         dld  ',
    '        lld   ',
    '       lccl   ',
    '      lcGcl   ',
    '     lcGGl    ',
    '    lcGGl     ',
    '   lGGGl      ',
    '  ggGGl       ',
    ' g ggl        ',
    'g  g          ',
  ], 1, 2),
  cooldown: (g) => map(g, [
    '   cccccccc  ',
    '  cwwccccCS  ',
    ' cwcccccCSS  ',
    ' CCCCCCCCSS  ',
    ' CwCCCCCCSS  ',
    ' CwCCCCCCSS  ',
    ' CCCCCCCCSS  ',
    ' CCCCCCCCS   ',
    ' SSSSSSSS    ',
  ], 1, 3),
};
export const GYM_PIX = Object.keys(ART);
const grids = new Map();
export function gymPixGrid(name) {
  if (!ART[name]) return null;
  if (!grids.has(name)) { const g = canvas(); ART[name](g); grids.set(name, { w: N, h: N, px: outline(g.px) }); }
  return grids.get(name);
}

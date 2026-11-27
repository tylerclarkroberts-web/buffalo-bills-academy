// Stage II, redrawn (v2): every evolved species is its own monster, in the style of the GBA-era handheld monster
// games: a front-facing hero pose, one bold silhouette, a strong dominant colour of its own, small close-set beady eyes, and
// cel shading in two or three flat tones with a dark outline. A few quiet built details sit on top of that: thin panel
// seams and rivets on the shell, steel caps on the joints and feeler tips, one tiny glowing lens in place of one
// bead, and a mining tool: a robotic arm on species with clear forelimbs, or a plated tail or body mount on a few where an arm would look wrong. The drawing is native on a 64 or 128
// grid and only ever scaled up with nearest-neighbour, so every pixel stays crisp at any size.
// Everything is drawn with the sprite canvas from sprite.js (64-grid coordinates, materials by letter); celShade()
// turns the material grid into colours. Original art: inspired by the era, nothing copied from any game.

// ---- palettes: [outline, dark, base, light, accent]. The base is the colour the species reads as from across a room.
export const STAGE_TWO_PAL = {
  ceroplophana: ['#1f0e04', '#8a4210', '#d87a1c', '#ffc457', '#3fd0ff'],
  bocydium: ['#1c1206', '#6e5426', '#b89a5a', '#efdca0', '#ff3fa4'],
  phrictus: ['#220406', '#8c1020', '#e0303a', '#ff9a6a', '#ffd23a'],
  pyrops: ['#06180c', '#1c6a2e', '#3cb04a', '#a8ec7a', '#ff8a1a'],
  graphocephala: ['#060a24', '#1a36a8', '#3a74ff', '#9cc4ff', '#ff3a3a'],
  umbonia: ['#0c1a04', '#4a8a10', '#8ad62a', '#e2ff8a', '#ff3a4a'],
  trachelophorus: ['#1c0404', '#960e12', '#e8232a', '#ff8a6a', '#26242c'],
  eupholus: ['#041820', '#0a6a8a', '#1ec4d8', '#a8fff4', '#141826'],
  pachyrhynchus: ['#0a0614', '#2a1c54', '#4a3a94', '#8a7ad8', '#ff9a1a'],
  platymeris: ['#040406', '#1a1a20', '#33333e', '#6c6c7c', '#ff3a20'],
  acanthaspis: ['#1a0a04', '#6a3210', '#a85a22', '#e0a060', '#ffd84a'],
  helicopsyche: ['#1a1408', '#7a6436', '#c8aa6a', '#fff0c0', '#4ac0a0'],
  chrysochroa: ['#021808', '#0a7a3a', '#1ed06a', '#9affb0', '#ff4ae0'],
  lamprima: ['#1a1404', '#8a7010', '#e0c020', '#fff7a0', '#30e090'],
  onymacris: ['#04060c', '#1a1c26', '#30343e', '#5a6070', '#6ae0ff'],
  brachinus: ['#1c0a02', '#b04a0c', '#ff8a1a', '#ffd07a', '#1a8a8a'],
  phrixothrix: ['#0a0806', '#2e2620', '#4e4238', '#82725e', '#b8ff3a'],
  macrodontia: ['#1a0a02', '#6a3412', '#a86028', '#e8b880', '#fff2d0'],
  sagra: ['#1a0418', '#7a1a78', '#c83ac0', '#ff9af0', '#ffd43a'],
  manticora: ['#06080a', '#3a4048', '#646c78', '#a8b0bc', '#f4f0e0'],
  heteropteryx: ['#061404', '#2a8a1a', '#5ae02a', '#cfff8a', '#ff4aa0'],
  mantispa: ['#1a1204', '#a07814', '#f0c030', '#fff0a0', '#7ad8ff'],
  nemoptera: ['#141004', '#a08a10', '#f8e030', '#fffbb0', '#2a2010'],
  pseudocreobotra: ['#04140c', '#3aa070', '#8af0b8', '#f4fff4', '#ff6a2a'],
  deroplatys: ['#1a0a02', '#7a3a12', '#c06a2a', '#f0b070', '#3a1a0a'],
  empusa: ['#1a0a18', '#9a4a9a', '#e08ae0', '#ffd4ff', '#5ad07a'],
  polyphylla: ['#120604', '#4a2214', '#7c4024', '#c07a50', '#ffffff'],
  phanaeus: ['#1a0404', '#901818', '#e04020', '#ff9a60', '#3aff8a'],
  lethocerus: ['#0c0e04', '#4a5418', '#7a8a2a', '#c0d070', '#ffcf3a'],
  sphaerocoris: ['#0c1404', '#8a9a10', '#d8e02a', '#fffc9a', '#2a6aff'],
  pheropsophus: ['#0a0806', '#1e1a16', '#33302a', '#5e584e', '#ffc81a'],
  melanophila: ['#040406', '#18181e', '#2c2c36', '#545466', '#ff6a1a'],
  solenopsis: ['#200602', '#a82a0a', '#ff5a1a', '#ffb070', '#ffe04a'],
  pyrrhocoris: ['#140202', '#8a0a10', '#e01828', '#ff7a6a', '#0e0a0a'],
  brevisana: ['#04140e', '#1a6a4e', '#36a882', '#a0f0d0', '#ff8a2a'],
  micronecta: ['#1a1004', '#8a6a1c', '#d8a84a', '#ffe8a8', '#2a6ab0'],
  bertholdia: ['#200e06', '#a8562a', '#f09a5a', '#ffe0c0', '#fff8f0'],
  gromphadorhina: ['#140402', '#4e140a', '#86281a', '#d06a48', '#f0a060'],
  gryllotalpa: ['#140c06', '#5a3c22', '#9a6c42', '#dcb08a', '#ff7a3a'],
  dytiscus: ['#040e08', '#0e3a24', '#1c6a40', '#5ab080', '#ffd03a'],
  notonecta: ['#081010', '#5a7a7a', '#a8c8c0', '#f0fff8', '#ff2a3a'],
  gyrinus: ['#040612', '#162452', '#2c4690', '#7a9ae0', '#bff0ff'],
  halobates: ['#020a1a', '#0a3a8a', '#1a74e0', '#8ac8ff', '#f0fbff'],
  phloeodes: ['#0a0a0c', '#4a4a54', '#7c7c88', '#c0c0cc', '#ff9a3a'],
  photuris: ['#0e0a06', '#3e2e1e', '#6a5236', '#a88a62', '#e8ff3a'],
  arachnocampa: ['#020e10', '#0e4a52', '#1e8a90', '#7ae8e8', '#c0fff4'],
  myrmeleon: ['#140e06', '#7a6038', '#b89860', '#f0dcae', '#5a2a1a'],
  odontomachus: ['#1a0804', '#8a3a10', '#d0661c', '#ffb066', '#fff0c0'],
  dasymutilla: ['#140204', '#a00a28', '#ff2850', '#ff9ab0', '#140808'],
  peruphasma: ['#040406', '#121218', '#24242e', '#4c4c5c', '#ff1a3a'],
  ampulex: ['#021412', '#0a6a68', '#14b8ae', '#8afff0', '#ff3a2a'],
  colobopsis: ['#1a0e02', '#8a5410', '#d89020', '#ffd880', '#fff23a'],
  dryococelus: ['#0a0402', '#2e1a0e', '#56341c', '#9a6a3e', '#ffd25a'],
  megachile: ['#060404', '#1c1814', '#36302a', '#f8f0dc', '#ffb81a'],
  meganeura: ['#04140a', '#0e6030', '#20a050', '#a0ffc0', '#ffcc3a'],
  menacanthus: ['#1a1004', '#8a6416', '#e0b440', '#fff0b0', '#e02a1a'],
};
export const stageTwoPal = (id) => STAGE_TWO_PAL[id] || null;

// ---- the drawing kit ----
const M = 31.5; // the middle column
let SPECIES = null; // the species being drawn, so the shared eye and joint helpers can pick a fitting lens
const JOINTS = []; // servo caps stamped after the body, so a hip socket sits on top of the shell

/** Cyan or red, whichever sits further from this species' body colour. */
function lensHue(id) {
  const pal = STAGE_TWO_PAL[id];
  if (!pal) return 'C';
  const col = pal[2], r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
  if (sat < 0.2) return r + g + b < 300 ? 'C' : 'X';
  let hue = 0;
  const d = max - min;
  if (max === r) hue = 60 * (((g - b) / d) % 6);
  else if (max === g) hue = 60 * ((b - r) / d + 2);
  else hue = 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  return (hue < 95 || hue > 330) ? 'C' : 'X';
}
function speciesHash(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0; return h; }

/** One small, glossy, beady eye: a dark round bead and a single bright highlight. No sclera, no lid. */
function oneBead(c, x, y, r = 1.8) {
  c.ell(x, y, r, r, 'E', false);
  // a tiny catchlight, upper-left, so the pair glances the same way and looks a little shifty
  c.ell(x - r * 0.32, y - r * 0.38, 0.55, 0.55, 'G', false);
}
/** A tiny glowing lens in the same circle as a bead: a steel rim, a red or cyan core, and a catchlight. */
function oneLens(c, x, y, r, glow) {
  c.ell(x, y, r, r, 'Z', false);
  const cr = Math.max(0.7, r * 0.62);
  c.ell(x, y, cr, cr, glow, false);
  c.ell(x - r * 0.28, y - r * 0.32, 0.5, 0.5, 'G', false);
}
/** A left/right pair; when a species is in play, one of the two is a glowing lens and the other stays a bead. */
function pairEyes(c, xL, y, r) {
  const right = 63 - xL;
  if (!SPECIES) { oneBead(c, xL, y, r); oneBead(c, right, y, r); return; }
  const glow = lensHue(SPECIES), lensRight = speciesHash(SPECIES) % 2 === 0;
  if (lensRight) { oneBead(c, xL, y, r); oneLens(c, right, y, r, glow); }
  else { oneLens(c, xL, y, r, glow); oneBead(c, right, y, r); }
}
/** A pair of small, close-set beady eyes, in the style of the GBA-era handheld bug monsters.
 *  `x, y` is the left one's original middle; both are nudged toward the midline so they sit a little close. */
function eyes(c, x, y, { w = 3, h = 2.4 } = {}) {
  const r = Math.max(1.65, Math.min(2.2, Math.min(w, h) * 0.85 + 0.35));
  const xL = x + (31.5 - x) * 0.32;
  pairEyes(c, xL, y + 0.15, r);
}
/** Beady eyes on a wide head: still set on each side, just smaller and a little closer together. */
function bugEyes(c, x, y, r = 2.6) {
  const br = Math.max(1.8, Math.min(2.3, r * 0.58));
  const xL = x + Math.min(3.2, (31.5 - x) * 0.22);
  pairEyes(c, xL, y, br);
}

/** Recolour already-drawn pixels only: a small steel servo cap with a highlight. Never grows the silhouette.
 *  Steel is only stamped onto dark limb pixels, so a cap never punches a hole in the shell and shifts its lighting.
 *  A joint that lands on the shell gets a tiny etched socket instead. */
function servo(c, x, y, r = 1.05, mirror = true) {
  const f = c.f, N = c.g.length, steel = 'DZK';
  const stamp = (cx, cy) => {
    for (let Y = Math.floor((cy - r) * f) - 1; Y <= Math.ceil((cy + r) * f) + 1; Y++) {
      for (let X = Math.floor((cx - r) * f) - 1; X <= Math.ceil((cx + r) * f) + 1; X++) {
        if (Y < 0 || Y >= N || X < 0 || X >= N || !c.g[Y][X]) continue;
        const dx = (X + 0.5) / f - 0.5 - cx, dy = (Y + 0.5) / f - 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const m = c.g[Y][X];
        if (steel.includes(m)) {
          c.g[Y][X] = 'Z';
          const hx = dx + r * 0.35, hy = dy + r * 0.35;
          if (hx * hx + hy * hy <= (r * 0.32) * (r * 0.32)) c.shine[Y][X] = c.part[Y][X] || 1;
        }
      }
    }
  };
  stamp(x, y);
  if (mirror) stamp(63 - x, y);
}

/** Thin etched panel lines across the largest shell, with a few one-pixel steel rivets. Recolours only. */
function panelSeams(c) {
  const f = c.f, N = c.g.length, seen = new Uint8Array(N * N);
  let best = null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (c.g[y][x] !== 'B' || seen[y * N + x]) continue;
    const q = [[x, y]]; seen[y * N + x] = 1; const cells = [];
    let minx = x, maxx = x, miny = y, maxy = y;
    while (q.length) {
      const [u, v] = q.pop(); cells.push([u, v]);
      minx = Math.min(minx, u); maxx = Math.max(maxx, u); miny = Math.min(miny, v); maxy = Math.max(maxy, v);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = u + dx, b = v + dy;
        if (a < 0 || b < 0 || a >= N || b >= N || seen[b * N + a] || c.g[b][a] !== 'B') continue;
        seen[b * N + a] = 1; q.push([a, b]);
      }
    }
    if (!best || cells.length > best.cells.length) best = { cells, minx, maxx, miny, maxy };
  }
  if (!best || best.cells.length < 40 * f * f) return;
  const { minx, maxx, miny, maxy, cells } = best, inBest = new Set(cells.map(([x, y]) => y * N + x));
  const h = maxy - miny + 1, n = cells.length;
  const rows = [Math.round((miny + h * 0.42) / f) * f];
  if (h >= 22 * f && n >= 180 * f * f) {
    const yB = Math.round((miny + h * 0.64) / f) * f;
    if (Math.abs(yB - rows[0]) >= 5 * f) rows.push(yB);
  }
  const rivetAt = [];
  for (const Y of rows) {
    const y64 = Math.round(Y / f), y0 = y64 * f, y1 = y0 + f;
    let lo = N, hi = -1;
    for (let yy = y0; yy < y1; yy++) for (let x = minx; x <= maxx; x++) if (inBest.has(yy * N + x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    const inset = 3 * f;
    if (hi - lo < 10 * f) continue;
    const x0 = lo + inset, x1 = hi - inset;
    if (x1 - x0 < 5 * f) continue;
    for (let yy = y0; yy < y1; yy++) for (let x = x0; x <= x1; x++) if (inBest.has(yy * N + x) && c.g[yy][x] === 'B') c.etch[yy][x] = true;
    const spots = [x0 + f, x1 - f];
    if (x1 - x0 >= 18 * f) spots.push(Math.round(((x0 + x1) / 2) / f) * f);
    for (const X of spots) rivetAt.push([Math.round(X / f), y64]);
  }
  const painted = new Set();
  for (const [x64, y64] of rivetAt) {
    const key = x64 + ',' + y64; if (painted.has(key)) continue; painted.add(key);
    const X = x64 * f, Y = y64 * f;
    let ok = false;
    for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) {
      const xx = X + a, yy = Y + b;
      if (yy >= 0 && yy < N && xx >= 0 && xx < N && c.g[yy][xx] && !'eEGCXo'.includes(c.g[yy][xx])) ok = true;
    }
    if (!ok) continue;
    for (let a = 0; a < f; a++) for (let b = 0; b < f; b++) {
      const xx = X + a, yy = Y + b;
      if (yy < 0 || yy >= N || xx < 0 || xx >= N || !c.g[yy][xx] || 'eEGCXo'.includes(c.g[yy][xx])) continue;
      c.etch[yy][xx] = true;
    }
  }
}

const chain = (c, pts, m, w = 1, mirror = true) => {
  for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], m, w, mirror);
  if (m === 'D' && w <= 2) JOINTS.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], r: 0.85, mirror });
};
/** A jointed limb through the points, thicker at the top, with a claw at the end. */
function limb(c, pts, { m = 'D', w = 3, tip = 'claw', mirror = true, taper = true, mech = false } = {}) {
  if (mech && SPECIES && mirror) {
    limb(c, pts.map(([x, y]) => [63 - x, y]), { m, w, tip, mirror: false, taper, mech: false });
    MECH_Q.push({ pts, w });
    return;
  }
  for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], m, Math.max(1, taper ? w - i : w), mirror);
  const [x, y] = pts[pts.length - 1], [px, py] = pts[pts.length - 2], dx = Math.sign(x - px) || -1;
  if (tip === 'claw') c.poly([[x - 1.6, y - 0.6], [x + 1.4, y - 0.6], [x + dx * 2.2, y + 2.2], [x + dx * 0.2, y + 1]], m, mirror);
  if (tip === 'foot') c.poly([[x - 2.4, y - 1], [x + 2.2, y - 1], [x + 2.6, y + 1.2], [x - 3, y + 1.2]], m, mirror);
  if (tip === 'fist') c.ell(x, y, w * 0.75, w * 0.7, m, mirror);
  for (let i = 0; i < pts.length - 1; i++) {
    const ww = Math.max(1, taper ? w - i : w);
    JOINTS.push({ x: pts[i][0], y: pts[i][1], r: Math.min(0.95, ww * 0.28 + 0.35), mirror });
  }
}
/** Two sturdy legs planted wide, feet on the ground (row 61). `hip`: where they leave the body. */
function stance(c, K, { hipX = 25, hipY = 46, kneeX = 19, kneeY = 52, w = 4, m = 'D', feet = 'foot' } = {}) {
  if (K.nolegs) return;
  limb(c, [[hipX, hipY], [kneeX, kneeY], [kneeX + 1, 60]], { m, w, tip: feet });
}
/** An arc of a ring (angles in radians, 0 = right, clockwise as y grows). */
function ring(c, cx, cy, rx, ry, m, w = 2, a0 = 0, a1 = Math.PI * 2) { const n = 28; let prev = null;
  for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n, p = [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]; if (prev) c.line(prev[0], prev[1], p[0], p[1], m, w, false); prev = p; } }
const wing = (c, pts, m = 'W', mirror = true) => c.poly(pts, m, mirror);
const centred = (c, cy, rx, ry, m) => c.ell(M, cy, rx, ry, m, false);
/** A stripe of accent across a round part, from one side to the other at height `y`. */
function band(c, cy, rx, ry, y, m = 'A', w = 2) { const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 0.6; if (half > 1) c.line(M - half, y, M + half, y, m, w, false); }

/** The mining tool built into this species' art (not the old variety layer), and where it is mounted. */
export const STAGE_TWO_TOOL = {
  ceroplophana: 'pick', bocydium: 'shovel', phrictus: 'lamp-pick', pyrops: 'lamp-pick', graphocephala: 'spike',
  umbonia: 'drill', trachelophorus: 'drill', eupholus: 'core', pachyrhynchus: 'saw', platymeris: 'grabber',
  acanthaspis: 'drill', helicopsyche: 'shovel', chrysochroa: 'saw', lamprima: 'pick', onymacris: 'shovel',
  brachinus: 'jackhammer', phrixothrix: 'lamp-pick', macrodontia: 'jackhammer', sagra: 'grabber', manticora: 'jackhammer',
  heteropteryx: 'sledge', mantispa: 'grabber', nemoptera: 'saw', pseudocreobotra: 'sledge', deroplatys: 'saw',
  empusa: 'saw', polyphylla: 'saw', phanaeus: 'sledge', lethocerus: 'grabber', sphaerocoris: 'saw',
  pheropsophus: 'jackhammer', melanophila: 'lamp-pick', solenopsis: 'pick', pyrrhocoris: 'spike', brevisana: 'jackhammer',
  micronecta: 'spike', bertholdia: 'lamp-pick', gromphadorhina: 'sledge', gryllotalpa: 'shovel', dytiscus: 'spike',
  notonecta: 'spike', gyrinus: 'core', halobates: 'grabber', phloeodes: 'jackhammer', photuris: 'lamp-pick',
  arachnocampa: 'lamp-pick', myrmeleon: 'drill', odontomachus: 'pick', dasymutilla: 'drill', peruphasma: 'core',
  ampulex: 'pick', colobopsis: 'spike', dryococelus: 'pick', megachile: 'shovel', meganeura: 'drill', menacanthus: 'grabber',
};

export const STAGE_TWO_MOUNT = {
  ceroplophana: 'arm', bocydium: 'arm', phrictus: 'arm', pyrops: 'body', graphocephala: 'arm',
  umbonia: 'body', trachelophorus: 'arm', eupholus: 'arm', pachyrhynchus: 'body', platymeris: 'arm',
  acanthaspis: 'arm', helicopsyche: 'arm', chrysochroa: 'arm', lamprima: 'arm', onymacris: 'arm',
  brachinus: 'body', phrixothrix: 'tail', macrodontia: 'arm', sagra: 'arm', manticora: 'arm',
  heteropteryx: 'arm', mantispa: 'arm', nemoptera: 'arm', pseudocreobotra: 'arm', deroplatys: 'arm',
  empusa: 'arm', polyphylla: 'arm', phanaeus: 'arm', lethocerus: 'arm', sphaerocoris: 'arm',
  pheropsophus: 'arm', melanophila: 'arm', solenopsis: 'arm', pyrrhocoris: 'arm', brevisana: 'arm',
  micronecta: 'arm', bertholdia: 'arm', gromphadorhina: 'body', gryllotalpa: 'arm', dytiscus: 'arm',
  notonecta: 'arm', gyrinus: 'body', halobates: 'arm', phloeodes: 'arm', photuris: 'arm',
  arachnocampa: 'tail', myrmeleon: 'arm', odontomachus: 'arm', dasymutilla: 'arm', peruphasma: 'tail',
  ampulex: 'arm', colobopsis: 'arm', dryococelus: 'arm', megachile: 'arm', meganeura: 'arm',
  menacanthus: 'arm',
};

const MECH_MOUNT = {
  // tail
  phrixothrix: { x: 16, y: 56, dx: -0.75, dy: 0.65 },
  arachnocampa: { x: 36, y: 56, dx: 0.45, dy: 0.9 },
  peruphasma: { x: 31.5, y: 56, dx: -0.35, dy: 0.94 },
  // body
  pyrops: { x: 37, y: 8, dx: 0.28, dy: -0.96 },
  umbonia: { x: 31.5, y: 14, dx: 0, dy: -1 },
  pachyrhynchus: { x: 16, y: 36, dx: -0.95, dy: -0.15 },
  brachinus: { x: 50, y: 12, dx: 0.55, dy: -0.84 },
  gromphadorhina: { x: 15, y: 44, dx: -1, dy: 0.05 },
  gyrinus: { x: 31.5, y: 50, dx: 0, dy: 1 },
};


// Species with no mirrored organic arm to replace: a hanging left-side pose, shoulder to wrist.
const MECH_FALLBACK = {
  onymacris: [[22, 26], [12, 22], [6, 16]],
  phrictus: [[22, 36], [11, 44], [5, 52]],
  helicopsyche: [[22, 48], [12, 44], [5, 38]],
  nemoptera: [[24, 32], [13, 38], [6, 46]],
  bertholdia: [[22, 32], [12, 38], [5, 46]],
  megachile: [[22, 34], [12, 40], [5, 48]],
  meganeura: [[26, 28], [16, 36], [8, 44]],
  acanthaspis: [[22, 38], [12, 44], [6, 52]],
  notonecta: [[22, 28], [12, 24], [6, 18]],
};

// Optional pose overrides, used even when an organic arm was replaced, to keep silhouettes distinct.
const MECH_POSE_OVER = {
  pachyrhynchus: [[16, 36], [8, 26], [5, 16]],
};

const MECH_Q = []; // robotic arms queued during the draw, stamped on top at the end

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const flipPts = (pts) => pts.map(([x, y]) => [63 - x, y]);
const rightPoly = (c, pts, m) => c.poly(flipPts(pts), m, false);
const rightLine = (c, x0, y0, x1, y1, m, w = 1) => c.line(63 - x0, y0, 63 - x1, y1, m, w, false);

function poseMech(pts) {
  const s = pts[0], last = pts[pts.length - 1];
  const mid = pts.length >= 3 ? pts[1] : [(s[0] + last[0]) / 2, (s[1] + last[1]) / 2];
  const dx = last[0] - mid[0], dy = last[1] - mid[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, ex = last[0] + ux * 11, ey = last[1] + uy * 11;
  if (ex >= 1.8 && ex <= 62.2 && ey >= 1.8 && ey <= 62.2) return [s, mid, last];
  const up = uy < -0.35;
  const elbow = [clamp(s[0] - 8, 5, 30), clamp(s[1] + (up ? -4 : 5), 8, 54)];
  const wrist = [clamp(elbow[0] - 5, 3, 28), clamp(elbow[1] + (up ? -7 : 6), 7, 52)];
  return [s, elbow, wrist];
}

function rivet(c, x, y, r = 1.15) {
  c.ell(x, y, r, r, 'Z', false);
  c.ell(x, y, r * 0.42, r * 0.42, 'K', false);
  c.ell(x - r * 0.3, y - r * 0.32, r * 0.22, r * 0.22, 'G', false);
}

function piston(c, ax, ay, bx, by) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ox = (-(by - ay) / len) * 2.2, oy = ((bx - ax) / len) * 2.2;
  c.line(ax + ox, ay + oy, bx + ox, by + oy, 'Z', 1.2, false);
  c.ell(ax + ox + (bx - ax) * 0.55, ay + oy + (by - ay) * 0.55, 1.25, 1.25, 'Z', false);
}

function aimTool(x, y, ux, uy, want) {
  let r = want;
  while (r > 3.5) {
    const nx = x + ux * r, ny = y + uy * r;
    if (nx >= 1.6 && nx <= 62.4 && ny >= 1.6 && ny <= 62.4) return [r, ux, uy];
    r -= 0.8;
  }
  for (const ang of [0.45, -0.45, 0.9, -0.9, 1.25, -1.25, 1.7, -1.7]) {
    const ca = Math.cos(ang), sa = Math.sin(ang), rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
    const nx = x + rx * want, ny = y + ry * want;
    if (nx >= 1.6 && nx <= 62.4 && ny >= 1.6 && ny <= 62.4) return [want, rx, ry];
  }
  return [Math.max(3.2, r), ux, uy];
}

function drawMechTool(c, x, y, ux, uy, tool) {
  const [R, u, v] = aimTool(x, y, ux, uy, tool === 'sledge' || tool === 'jackhammer' ? 9 : tool === 'saw' ? 8 : 12);
  const px = -v, py = u; // perpendicular
  const at = (t, a = 0) => [x + u * R * t + px * a, y + v * R * t + py * a];
  if (tool === 'drill' || tool === 'spike') {
    const thick = tool === 'drill' ? 2.9 : 1.9;
    c.poly([at(0, thick), at(0, -thick), at(1, 0)], 'K', false);
    if (tool === 'drill') {
      c.poly([at(0.08, thick * 0.55), at(0.08, -thick * 0.35), at(0.9, 0)], 'K', false);
      for (const t of [0.26, 0.48, 0.68]) c.ell(...at(t), 2.3 - t, 1.5 - t * 0.5, 'J', false);
      c.line(...at(0.06, 0.8), ...at(0.72, 0.2), 'Z', 1, false);
    } else {
      c.ell(...at(0.35), 1.4, 1.0, 'Z', false);
      c.line(...at(0.05, 0.55), ...at(0.7, 0.15), 'Z', 1, false);
    }
    return;
  }
  if (tool === 'core') {
    c.line(x, y, ...at(0.42), 'Z', 3.2, false);
    const [cx, cy] = at(0.72);
    ring(c, cx, cy, 5.2, 5.2, 'Z', 2.4);
    ring(c, cx, cy, 5.2, 5.2, 'K', 1);
    rivet(c, cx, cy, 1.1);
    return;
  }
  if (tool === 'pick' || tool === 'lamp-pick') {
    c.line(x, y, ...at(0.55), 'Z', 2.2, false);
    const [hx, hy] = at(0.55);
    c.poly([[hx + u * 1.6, hy + v * 1.6], [hx - u * 1.8, hy - v * 1.8], [hx + px * 8.5, hy + py * 8.5]], 'Z', false);
    c.poly([[hx + u * 1.2, hy + v * 1.2], [hx - u * 1.4, hy - v * 1.4], [hx - px * 4.5, hy - py * 4.5]], 'K', false);
    c.ell(hx + px * 3, hy + py * 3, 0.7, 0.7, 'G', false);
    if (tool === 'lamp-pick') { c.ell(hx - px * 2.2, hy - py * 2.2, 2.4, 2.4, 'A', false); c.ell(hx - px * 2.2, hy - py * 2.2, 1.2, 1.2, 'G', false); }
    return;
  }
  if (tool === 'jackhammer') {
    c.poly([at(0, 2.6), at(0, -2.6), at(0.55, -2.2), at(0.55, 2.2)], 'Z', false);
    c.poly([at(0.08, 1.6), at(0.08, -1.6), at(0.4, -1.3), at(0.4, 1.3)], 'K', false);
    c.ell(...at(0.28), 1.5, 1.5, 'B', false);
    rivet(c, ...at(0.28), 1.0);
    c.line(...at(0.55), ...at(1), 'K', 2.2, false);
    c.poly([at(0.92, 1.3), at(0.92, -1.3), at(1.02, 0)], 'Z', false);
    return;
  }
  if (tool === 'grabber') {
    c.line(x, y, ...at(0.35), 'Z', 3, false);
    rivet(c, ...at(0.35), 1.2);
    const [hx, hy] = at(0.35);
    for (const sign of [1, -1]) {
      const ax = u * 0.45 + px * sign * 0.75, ay = v * 0.45 + py * sign * 0.75;
      const al = Math.hypot(ax, ay) || 1;
      c.line(hx, hy, hx + (ax / al) * 7.5, hy + (ay / al) * 7.5, 'Z', 2, false);
      c.poly([
        [hx + (ax / al) * 6.2 + (sign * px - u) * 0.3, hy + (ay / al) * 6.2 + (sign * py - v) * 0.3],
        [hx + (ax / al) * 6.2 - (sign * px - u) * 0.3, hy + (ay / al) * 6.2 - (sign * py - v) * 0.3],
        [hx + (ax / al) * 9.2, hy + (ay / al) * 9.2],
      ], 'K', false);
    }
    return;
  }
  if (tool === 'saw') {
    c.line(x, y, ...at(0.35), 'Z', 2.6, false);
    const [cx, cy] = at(0.62);
    c.ell(cx, cy, 6.2, 6.2, 'Z', false);
    c.ell(cx, cy, 4.4, 4.4, 'K', false);
    c.ell(cx, cy, 2.2, 2.2, 'Z', false);
    rivet(c, cx, cy, 1.0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, tx = Math.cos(a), ty = Math.sin(a);
      c.poly([[cx + tx * 5.2 - ty * 0.9, cy + ty * 5.2 + tx * 0.9], [cx + tx * 5.2 + ty * 0.9, cy + ty * 5.2 - tx * 0.9], [cx + tx * 7.0, cy + ty * 7.0]], 'Z', false);
    }
    return;
  }
  if (tool === 'shovel') {
    c.line(x, y, ...at(0.42), 'Z', 2.2, false);
    c.poly([at(0.38, 1.4), at(0.38, -1.4), at(0.55, -4.2), at(1, -3.4), at(1, 3.4), at(0.55, 4.2)], 'Z', false);
    c.poly([at(0.62, 2.6), at(0.62, -2.6), at(0.95, -2.2), at(0.95, 2.2)], 'L', false);
    return;
  }
  if (tool === 'sledge') {
    c.line(x, y, ...at(0.42), 'Z', 2.4, false);
    c.poly([at(0.4, 3.4), at(0.4, -3.4), at(0.95, -3.6), at(0.95, 3.6)], 'K', false);
    c.poly([at(0.48, 2.4), at(0.48, -2.4), at(0.82, -2.5), at(0.82, 2.5)], 'Z', false);
    c.ell(...at(0.62, 1.2), 0.6, 0.6, 'G', false);
    return;
  }
  // fallback: drill
  c.poly([at(0, 2.6), at(0, -2.6), at(1, 0)], 'K', false);
}

function drawMechArm(c, pts, tool = 'drill', w = 4) {
  const [s, mid, e] = poseMech(pts);
  const plateW = Math.max(4.2, w);
  c.ell(s[0], s[1], plateW * 0.85, plateW * 0.8, 'B', false);
  rivet(c, s[0], s[1], 1.2);
  c.line(s[0], s[1], mid[0], mid[1], 'B', plateW, false);
  piston(c, s[0], s[1], mid[0], mid[1]);
  c.ell(mid[0], mid[1], 3.15, 3.15, 'B', false);
  c.ell(mid[0], mid[1], 2.2, 2.2, 'Z', false);
  rivet(c, mid[0], mid[1], 1.25);
  c.line(mid[0], mid[1], e[0], e[1], 'B', Math.max(3.6, plateW - 0.6), false);
  piston(c, mid[0], mid[1], e[0], e[1]);
  c.ell(e[0], e[1], 2.6, 2.6, 'B', false);
  c.ell(e[0], e[1], 1.8, 1.8, 'Z', false);
  rivet(c, e[0], e[1], 1.05);
  const dx = e[0] - mid[0], dy = e[1] - mid[1], len = Math.hypot(dx, dy) || 1;
  drawMechTool(c, e[0], e[1], dx / len, dy / len, tool);
}

/** A short plated collar with rivets, then the mining tool, used for tail and body mounts. */
function drawMechCollar(c, x, y, ux, uy, scale = 1) {
  const px = -uy, py = ux, s = scale;
  c.ell(x, y, 3.5 * s, 3.1 * s, 'B', false);
  c.ell(x, y, 2.3 * s, 2.1 * s, 'Z', false);
  rivet(c, x + px * 1.7 * s, y + py * 1.7 * s, 1.05);
  rivet(c, x - px * 1.7 * s, y - py * 1.7 * s, 1.05);
  const ex = x + ux * 3.3 * s, ey = y + uy * 3.3 * s;
  c.line(x, y, ex, ey, 'B', 4.2 * s, false);
  piston(c, x, y, ex, ey);
  c.ell(ex, ey, 2.3 * s, 2.3 * s, 'Z', false);
  rivet(c, ex, ey, 1.05);
  return [ex, ey];
}

function drawMechMount(c, spec, tool = 'drill') {
  const len = Math.hypot(spec.dx, spec.dy) || 1;
  const ux = spec.dx / len, uy = spec.dy / len;
  const [tx, ty] = drawMechCollar(c, spec.x, spec.y, ux, uy, spec.scale || 1);
  drawMechTool(c, tx, ty, ux, uy, tool);
}


// The default hand a mining tool goes in: the end of its right arm.
const HAND = { x: 50.5, y: 39 };

// ---- the monsters. `K`: { nolegs, body } — nolegs when a variety base carries it; body when only the body is wanted.
const D = {};

D.ceroplophana = { hand: { x: 51, y: 41 }, draw(c, K) { // Bronze Rhino Knight: a stocky barrel of a beetle under one great hooked horn
  stance(c, K, { hipX: 24, hipY: 48, kneeX: 18, kneeY: 54, w: 5 });
  centred(c, 42, 15, 14, 'B'); centred(c, 45, 9, 8, 'L');
  if (!K.body) { limb(c, [[17, 36], [11, 42], [13, 47]], { w: 5, tip: 'fist', mech: true }); }
  centred(c, 25, 12, 8.5, 'B');
  if (!K.body) c.poly([[27, 21], [36, 21], [40, 12], [45, 2], [41, 5], [35, 12]], 'L', false); // the horn, sweeping up and over
  centred(c, 43, 2.4, 2.4, 'A'); // a blue gem set in its chest
  eyes(c, 26, 26, { w: 3, h: 2.2, slant: 1.4 });
} };

D.lamprima = { hand: { x: 51, y: 38 }, draw(c, K) { // Golden Stag Crown: mandibles rising like a crown over a gold torso
  stance(c, K, { hipX: 25, hipY: 48, kneeX: 20, kneeY: 54, w: 4 });
  centred(c, 41, 13, 15, 'B'); centred(c, 41, 4, 12, 'L');
  if (!K.body) {
    limb(c, [[19, 34], [12, 39], [13, 45]], { w: 4, tip: 'claw', mech: true });
    c.poly([[24, 20], [19, 12], [16, 3], [21, 6], [23, 11], [26, 9], [24, 14], [28, 19]], 'A'); // both mandibles, up and in
  }
  centred(c, 23, 10, 7, 'B');
  eyes(c, 26.5, 23.5, { w: 2.8, h: 2.1, slant: 1.2 });
} };

D.trachelophorus = { hand: { x: 49, y: 44 }, draw(c, K) { // Crane Weevil: a tall periscope neck, a red shield of a body
  stance(c, K, { hipX: 26, hipY: 50, kneeX: 21, kneeY: 55, w: 3 });
  centred(c, 46, 13, 11, 'B'); band(c, 46, 13, 11, 46, 'L', 1);
  if (!K.body) {
    limb(c, [[20, 42], [13, 46], [14, 51]], { w: 3, mech: true });
    c.line(M, 36, M, 14, 'A', 4, false); c.line(M - 1, 34, M - 1, 16, 'D', 1, false); // the neck
  }
  centred(c, 11, 6, 4.5, 'B'); c.poly([[M - 2, 13], [M + 2, 13], [M + 1, 19], [M - 1, 19]], 'A', false);
  eyes(c, 28.5, 11, { w: 2, h: 1.7, slant: 1 });
} };

D.graphocephala = { hand: { x: 51, y: 40 }, draw(c, K) { // Candy Dart: a needle-nosed arrowhead in electric blue, racing stripes
  stance(c, K, { hipX: 27, hipY: 50, kneeX: 22, kneeY: 55, w: 3 });
  if (!K.body) wing(c, [[M, 20], [14, 40], [10, 56], [20, 50], [M, 54]], 'B');
  c.poly([[M, 8], [40, 30], [38, 52], [M, 56], [25, 52], [23, 30]], 'B', false);
  for (const y of [32, 39, 46]) c.poly([[22, y + 4], [M, y - 1], [41, y + 4], [41, y + 6.5], [M, y + 1.5], [22, y + 6.5]], 'A', false); // chevrons
  if (!K.body) limb(c, [[24, 34], [16, 38], [16, 44]], { w: 3, mech: true });
  eyes(c, 27.5, 22, { w: 2.6, h: 2, slant: 1.8 });
} };

D.mantispa = { hand: { x: 50, y: 30 }, draw(c, K) { // Hornet Reaper: a wasp-waisted reaper, glass wings, two raised scythes
  if (!K.body) wing(c, [[29, 30], [8, 12], [4, 24], [14, 38], [28, 38]], 'W');
  stance(c, K, { hipX: 28, hipY: 48, kneeX: 23, kneeY: 54, w: 2 });
  centred(c, 51, 5, 8, 'B'); band(c, 51, 5, 8, 49, 'D', 1); band(c, 51, 5, 8, 53, 'D', 1);
  c.line(M, 30, M, 44, 'B', 4, false); // the long thorax
  if (!K.body) {
    limb(c, [[27, 30], [19, 34], [18, 22]], { w: 3, tip: 'none', mech: true });
    rightPoly(c, [[17, 22], [21, 23], [19, 14], [15, 6], [16, 15]], 'L'); // the remaining organic scythe
  }
  c.poly([[22, 18], [41, 18], [36, 26], [M, 29], [27, 26]], 'B', false);
  eyes(c, 26.5, 20.5, { w: 2.6, h: 2, slant: 2 });
  if (!K.body) chain(c, [[29, 17], [26, 10], [20, 6]], 'D');
} };

D.halobates = { hand: { x: 52, y: 44 }, draw(c, K) { // Tide Strider: a star of long legs on its own ring of ripples
  if (!K.body) { c.ell(M, 58, 28, 4.2, 'L', false); c.ell(M, 58, 24, 2.8, 'B', false); }
  if (!K.nolegs) { limb(c, [[26, 44], [10, 36], [3, 52]], { w: 2, tip: 'none' }); limb(c, [[27, 47], [16, 50], [14, 58]], { w: 2, tip: 'none' }); }
  if (!K.body) limb(c, [[25, 38], [14, 26], [9, 32]], { w: 2, tip: 'claw', mech: true });
  centred(c, 43, 7.5, 9, 'B'); centred(c, 42, 3, 6, 'L');
  centred(c, 30, 8.5, 6.5, 'B');
  eyes(c, 27.5, 30, { w: 2.6, h: 2, slant: 1.2 });
  if (!K.body) chain(c, [[29, 25], [24, 16], [20, 14]], 'D');
} };


D.chrysochroa = { draw(c, K) { // Emerald Bullet: a tall jewel-cut bullet of green with magenta racing stripes
  stance(c, K, { hipX: 26, hipY: 50, kneeX: 21, kneeY: 55, w: 3 });
  c.poly([[M, 14], [41, 24], [43, 40], [38, 54], [M, 58], [25, 54], [20, 40], [22, 24]], 'B', false);
  c.poly([[24, 27], [26.5, 26], [26, 52], [23.5, 50]], 'A');
  if (!K.body) { limb(c, [[22, 32], [15, 38], [17, 44]], { w: 3, mech: true }); chain(c, [[28, 13], [25, 6], [21, 5]], 'D'); }
  centred(c, 17, 7, 5, 'B');
  eyes(c, 27.5, 18, { w: 2.4, h: 1.9, slant: 1.6 });
} };

D.melanophila = { draw(c, K) { // Cinder Beetle: soot-black, with flames licking up from its shoulders
  if (!K.body) { c.poly([[24, 34], [13, 22], [16, 12], [20, 20], [22, 7], [28, 22]], 'A'); c.poly([[22, 30], [18, 22], [21, 17], [24, 24]], 'Y'); }
  stance(c, K, { hipX: 25, hipY: 50, kneeX: 19, kneeY: 55, w: 4 });
  centred(c, 43, 12, 13, 'B'); centred(c, 46, 3.2, 4.4, 'A');
  if (!K.body) limb(c, [[19, 36], [12, 42], [14, 47]], { w: 4, tip: 'fist', mech: true });
  centred(c, 26, 9, 6.5, 'B'); c.poly([[M - 3, 21], [M, 11], [M + 3, 21]], 'A', false);
  eyes(c, 27, 26.5, { w: 2.6, h: 2, slant: 1.8 });
} };

D.onymacris = { hand: { x: 50, y: 30 }, draw(c, K) { // Mist Stilt: stands on its head on stilts, catching the fog in drops on its back
  if (!K.nolegs) { limb(c, [[24, 30], [12, 42], [11, 61]], { w: 2, tip: 'foot' }); limb(c, [[27, 34], [21, 48], [21, 61]], { w: 2, tip: 'foot' }); }
  centred(c, 24, 13, 11, 'B'); centred(c, 20, 6, 4, 'L');
  if (!K.body) { c.ell(46, 13, 3.2, 3.8, 'A', false); c.poly([[43.6, 11], [46, 5], [48.4, 11]], 'A', false); c.ell(19, 9, 1.8, 2.2, 'A', false); }
  centred(c, 38, 7, 5.5, 'B');
  eyes(c, 27.5, 38.5, { w: 2.4, h: 1.9, slant: 1.5 });
  if (!K.body) chain(c, [[28, 42], [23, 48], [19, 47]], 'D');
} };

D.brachinus = { hand: { x: 18, y: 42 }, draw(c, K) { // Blast Cannon: an orange gunner with a teal shell and a smoking tail cannon
  if (!K.body) { c.line(38, 32, 46, 18, 'A', 5, false); c.ell(49, 13, 5, 4, 'Z', false); c.ell(55, 8, 4, 3.4, 'Z', false); c.ell(44, 7.5, 3, 2.6, 'Z', false); }
  stance(c, K, { hipX: 25, hipY: 50, kneeX: 19, kneeY: 55, w: 4 });
  centred(c, 43, 13, 13, 'A'); c.line(M, 32, M, 55, 'o', 1, false);
  if (!K.body) limb(c, [[18, 36], [12, 42], [14, 47]], { w: 4, tip: 'fist' });
  centred(c, 25, 9, 7, 'B');
  eyes(c, 27, 25.5, { w: 2.6, h: 2, slant: 1.6 });
} };

D.pheropsophus = { draw(c, K) { // Hazard Mortar: black-and-yellow, twin mortar tubes on its back
  if (!K.body) { c.line(22, 30, 15, 13, 'D', 4); c.ell(15, 12, 2.8, 1.6, 'A'); c.ell(13, 7, 2.6, 2, 'Z'); }
  stance(c, K, { hipX: 25, hipY: 50, kneeX: 19, kneeY: 55, w: 4 });
  centred(c, 43, 14, 13, 'B'); c.ell(24.5, 40, 4, 4.4, 'A'); centred(c, 51, 4, 3, 'A');
  if (!K.body) limb(c, [[17, 36], [11, 42], [13, 47]], { w: 4, tip: 'fist', mech: true });
  centred(c, 25, 9, 6.5, 'B'); c.poly([[M - 4, 19], [M + 4, 19], [M, 23]], 'A', false);
  eyes(c, 26.5, 26, { w: 2.6, h: 2, slant: 1.6 });
} };

D.macrodontia = { draw(c, K) { // Saber Fang: sabre-tooth jaws hanging down, feelers swept back like a mane
  if (!K.body) chain(c, [[27, 15], [15, 6], [3, 11]], 'D', 2);
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 19, kneeY: 56, w: 4 });
  centred(c, 45, 13, 12, 'B'); c.poly([[22, 40], [M, 46], [41, 40], [41, 43], [M, 49], [22, 43]], 'L', false);
  if (!K.body) limb(c, [[19, 37], [12, 43], [14, 48]], { w: 4, mech: true });
  centred(c, 22, 10, 7, 'B');
  if (!K.body) c.poly([[25, 26], [29, 27], [27, 39], [23, 44], [24, 36]], 'L');
  eyes(c, 26, 21.5, { w: 2.8, h: 2.1, slant: 1.8 });
} };

D.sagra = { hand: { x: 50, y: 36 }, draw(c, K) { // Leap Titan: a small magenta chest on two enormous frog thighs
  if (!K.nolegs) { c.ell(16, 48, 8, 7, 'B'); limb(c, [[12, 52], [11, 60]], { w: 3, tip: 'foot' }); }
  centred(c, 37, 11, 12, 'B'); centred(c, 40, 6, 6, 'A');
  if (!K.body) limb(c, [[22, 32], [16, 36], [17, 41]], { w: 2, mech: true });
  centred(c, 21, 8, 6, 'B');
  eyes(c, 27.5, 21.5, { w: 2.4, h: 1.9, slant: 1.4 });
  if (!K.body) chain(c, [[28, 16], [25, 9], [22, 7]], 'D');
} };

D.manticora = { hand: { x: 50, y: 44 }, draw(c, K) { // Scissor Jaw: gunmetal, behind two enormous crossed white jaws
  stance(c, K, { hipX: 25, hipY: 52, kneeX: 19, kneeY: 56, w: 4 });
  centred(c, 47, 12, 10, 'B');
  if (!K.body) limb(c, [[20, 43], [14, 47], [15, 52]], { w: 3, mech: true });
  centred(c, 28, 11, 9, 'B');
  if (!K.body) { c.poly([[22, 33], [12, 31], [5, 22], [10, 20], [16, 26], [27, 31]], 'A', false); c.poly([[41, 33], [53, 35], [60, 25], [55, 22], [50, 30], [36, 31]], 'A', false); }
  eyes(c, 26, 26, { w: 2.8, h: 2.2, slant: 2.2 });
} };

D.polyphylla = { draw(c, K) { // Plume Crown: chocolate, marbled white, under two great feathered fans
  if (!K.body) { c.poly([[26, 18], [11, 3], [8, 9], [8, 15], [11, 20]], 'A'); c.line(26, 18, 9, 9, 'L', 1); c.line(26, 18, 8.5, 15, 'L', 1); }
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 19, kneeY: 56, w: 4 });
  centred(c, 43, 13, 14, 'B'); c.ell(25, 38, 2.6, 2, 'A'); c.ell(27, 48, 2.2, 1.8, 'A'); centred(c, 43, 2, 1.6, 'A');
  if (!K.body) limb(c, [[18, 36], [12, 42], [14, 47]], { w: 4, mech: true });
  centred(c, 25, 8.5, 6, 'B');
  eyes(c, 27.5, 25.5, { w: 2.4, h: 1.9, slant: 1.4 });
} };

D.phanaeus = { draw(c, K) { // Prism Horn: copper-red under a green shield, one horn swept back like a scythe
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 19, kneeY: 56, w: 5 });
  centred(c, 45, 14, 12, 'B');
  if (!K.body) limb(c, [[17, 37], [11, 43], [12, 48]], { w: 4, tip: 'fist', mech: true });
  c.poly([[8, 29], [20, 24], [43, 24], [55, 29], [40, 37], [23, 37]], 'A', false);
  centred(c, 24, 7, 5, 'B');
  if (!K.body) c.poly([[28, 20], [34, 20], [33, 11], [25, 2], [29, 11]], 'B', false);
  eyes(c, 28, 24.5, { w: 2.2, h: 1.8, slant: 1.6 });
} };

D.bocydium = { draw(c, K) { // Signal Orb: a squat tan body flying four hot-pink orbs from a mast on its back
  if (!K.body) { c.line(M, 32, M, 12, 'D', 2, false); c.line(M, 13, 20, 8, 'D', 1); c.line(M, 15, 25.5, 4, 'D', 1); c.ell(20, 8, 3.6, 3.6, 'A'); c.ell(25.5, 4.2, 3, 3, 'A'); }
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 20, kneeY: 56, w: 3 });
  centred(c, 45, 12, 11, 'B');
  if (!K.body) limb(c, [[21, 40], [15, 44], [16, 49]], { w: 3, mech: true });
  centred(c, 30, 9, 6.5, 'B');
  eyes(c, 27, 30.5, { w: 2.6, h: 2, slant: 1.4 });
} };

D.phrictus = { draw(c, K) { // Dragon Lantern: crimson bat-wings and a spiked dragon snout
  if (!K.body) { c.poly([[26, 30], [6, 17], [3, 30], [8, 40], [14, 37], [18, 46], [27, 42]], 'B'); c.ell(11, 29, 2.8, 2.8, 'A'); }
  stance(c, K, { hipX: 26, hipY: 50, kneeX: 21, kneeY: 55, w: 3 });
  centred(c, 42, 9, 12, 'B'); centred(c, 44, 5, 8, 'L');
  centred(c, 26, 7, 5.5, 'B');
  if (!K.body) { c.poly([[27, 22], [36, 22], [35, 14], [37, 8], [34, 2], [M, 10], [28, 14]], 'B', false); c.poly([[28, 16], [23.5, 13], [28, 13]], 'A', false); c.poly([[35, 11], [40, 8], [35, 8.5]], 'A', false); }
  eyes(c, 28, 26.5, { w: 2.2, h: 1.8, slant: 2 });
} };

D.pyrops = { hand: { x: 50, y: 46 }, draw(c, K) { // Candlewick: a green cloak of wings and a long snout that burns at the tip
  stance(c, K, { hipX: 27, hipY: 54, kneeX: 23, kneeY: 57, w: 2 });
  c.poly([[22, 27], [12, 40], [14, 56], [M, 58], [49, 56], [51, 40], [41, 27]], 'B', false); c.ell(19, 46, 2.2, 2.2, 'A'); c.ell(23, 53, 1.6, 1.6, 'A');
  centred(c, 26, 7, 5.5, 'B');
  if (!K.body) { chain(c, [[M, 21], [34, 13], [37, 8], [38, 6]], 'A', 3, false); c.ell(38.5, 4.2, 2.2, 3, 'Y', false); }
  eyes(c, 28, 26.5, { w: 2.2, h: 1.8, slant: 1.4 });
} };

D.umbonia = { draw(c, K) { // Thornback: one towering thorn, shark-fin high, with a red stripe up it
  if (!K.body) { c.poly([[21, 34], [M, 2], [42, 34]], 'B', false); c.line(M, 8, M, 30, 'A', 2, false); c.poly([[29.5, 9], [M, 2], [33.5, 9]], 'L', false); }
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 20, kneeY: 56, w: 3 });
  centred(c, 43, 13, 12, 'B'); centred(c, 42, 8, 6.5, 'L');
  if (!K.body) limb(c, [[19, 44], [13, 48], [14, 53]], { w: 3 });
  eyes(c, 27, 41, { w: 2.6, h: 2, slant: 1.6 });
} };

D.helicopsyche = { draw(c, K) { // Spiral Hermit: wears its snail-shell house on its back and peeks out from under it
  c.ell(30, 26, 17, 16, 'B', false); c.ell(31, 27, 11, 10.5, 'L', false); c.ell(32, 28, 6.5, 6, 'B', false); c.ell(32.5, 28.5, 2.6, 2.4, 'L', false);
  stance(c, K, { hipX: 25, hipY: 52, kneeX: 20, kneeY: 56, w: 2 });
  if (!K.body) chain(c, [[28, 42], [14, 38], [6, 26]], 'D');
  centred(c, 46, 8, 6, 'A');
  eyes(c, 28, 46.5, { w: 2.4, h: 1.9, slant: 1.2 });
} };

D.nemoptera = { draw(c, K) { // Ribbon Dancer: lemon wings and two long spoon ribbons trailing to the floor
  if (!K.body) {
    c.poly([[28, 26], [8, 13], [4, 21], [12, 30], [28, 32]], 'B'); c.line(11, 17, 13, 28, 'A', 2);
    chain(c, [[27, 36], [20, 46], [14, 55]], 'B', 2); c.ell(13, 57.5, 3.2, 2.6, 'B'); c.ell(13, 57.5, 1.4, 1.1, 'A');
  }
  if (!K.nolegs) limb(c, [[29, 42], [25, 50], [25, 60]], { w: 2, tip: 'foot' });
  c.line(M, 26, M, 44, 'B', 4, false); centred(c, 46, 3, 6, 'B'); band(c, 46, 3, 6, 45, 'A', 1);
  centred(c, 22, 6, 5, 'B');
  eyes(c, 28, 22.5, { w: 2.2, h: 1.8, slant: 1.4 });
  if (!K.body) chain(c, [[29, 18], [26, 10], [24, 4]], 'D');
} };

D.brevisana = { draw(c, K) { // Siren Cicada: jade, tented glass wings, an orange drum on its chest that sings
  if (!K.body) { c.poly([[24, 24], [6, 44], [10, 54], [20, 50], [29, 36]], 'W'); c.line(23, 27, 9, 46, 'D', 1); for (const y of [13, 16, 19]) c.put(y === 16 ? 6 : 7, y, 'A'), c.put(63 - (y === 16 ? 6 : 7), y, 'A'); }
  stance(c, K, { hipX: 25, hipY: 51, kneeX: 20, kneeY: 56, w: 3 });
  centred(c, 40, 11, 13, 'B'); centred(c, 40, 4.5, 4.5, 'A'); centred(c, 40, 2, 2, 'L');
  if (!K.body) limb(c, [[21, 34], [14, 38], [15, 43]], { w: 3, mech: true });
  centred(c, 22, 12, 6, 'B');
  bugEyes(c, 21, 21, 3, { slant: 1.4 });
} };

D.bertholdia = { draw(c, K) { // Cinnabar Fluff: a round moth in peach fur, with a white ruff and feathered feelers
  if (!K.body) { c.ell(14, 30, 12, 13, 'B'); c.ell(16, 46, 9, 7, 'L'); c.ell(13, 28, 3, 3, 'L'); c.poly([[28, 15], [20, 2], [25, 4], [29.5, 12]], 'L'); }
  stance(c, K, { hipX: 26, hipY: 52, kneeX: 21, kneeY: 56, w: 3 });
  centred(c, 42, 8, 12, 'B'); band(c, 42, 8, 12, 46, 'L', 1);
  centred(c, 30, 10, 5, 'A');
  centred(c, 22, 7, 5.5, 'B');
  eyes(c, 28.5, 22.5, { w: 2.2, h: 1.8, slant: 1.2 });
} };

D.meganeura = { draw(c, K) { // Sky Lance: four glass wings the width of the frame, a long green lance of a tail
  if (!K.body) { c.poly([[28, 22], [2, 14], [1, 19.5], [28, 27]], 'W'); c.poly([[28, 28], [3, 30], [4, 35.5], [28, 31.5]], 'W'); c.ell(3.5, 16.5, 2.2, 2, 'A'); c.ell(5, 32.5, 2.2, 2, 'A'); }
  c.line(M, 30, M, 59, 'B', 3, false); for (const y of [40, 47, 54]) c.line(M - 1.5, y, M + 1.5, y, 'A', 1, false);
  if (!K.nolegs) limb(c, [[28, 30], [23, 35], [22, 39]], { w: 1, tip: 'claw' });
  centred(c, 25, 5, 6, 'B');
  centred(c, 15, 8, 5, 'B');
  bugEyes(c, 25.5, 13.5, 3.6, { slant: 1.6 });
} };

D.ampulex = { hand: { x: 50, y: 32 }, draw(c, K) { // Jade Stinger: a glittering teal wasp with red thighs and a waist like a wire
  if (!K.body) c.poly([[27, 28], [12, 8], [8, 14], [16, 30]], 'W');
  if (!K.nolegs) { c.line(25, 37, 17, 47, 'A', 3); limb(c, [[17, 47], [19, 60]], { w: 2, tip: 'foot' }); }
  centred(c, 31, 8, 7, 'B'); c.line(M, 37, M, 42, 'D', 2, false); centred(c, 50, 7, 9, 'B'); band(c, 50, 7, 9, 48, 'L', 1);
  if (!K.body) limb(c, [[24, 30], [16, 26], [14, 32]], { w: 2, mech: true });
  centred(c, 20, 7, 6, 'B');
  eyes(c, 28, 20.5, { w: 2.4, h: 1.9, slant: 2 });
  if (!K.body) chain(c, [[29, 15], [24, 6], [18, 3]], 'D');
} };

D.megachile = { draw(c, K) { // Titan Bee: a heavy black bee in a cream fur collar, with gold jaws
  if (!K.body) c.poly([[24, 27], [8, 14], [6, 22], [18, 31]], 'W');
  stance(c, K, { hipX: 25, hipY: 53, kneeX: 20, kneeY: 57, w: 3 });
  centred(c, 48, 12, 10, 'B'); band(c, 48, 12, 10, 44, 'L', 2); band(c, 48, 12, 10, 51, 'L', 2);
  centred(c, 33, 12, 6, 'L');
  centred(c, 22, 9, 6.5, 'B');
  if (!K.body) c.poly([[24, 26], [20, 34], [16, 36], [18, 31], [22, 25]], 'A');
  eyes(c, 27, 21.5, { w: 2.6, h: 2, slant: 1.8 });
} };

D.pseudocreobotra = { hand: { x: 49, y: 42 }, draw(c, K) { // Bloom Eye: flares two white petal-wings, each painted with a great staring eye
  if (!K.body) { c.ell(16, 24, 11, 13, 'L'); c.ell(16, 24, 6.4, 6.4, 'B'); c.ell(16, 24, 4, 4, 'A'); c.ell(16, 24, 1.6, 1.6, 'E'); }
  if (!K.nolegs) limb(c, [[29, 46], [24, 52], [24, 60]], { w: 2, tip: 'foot' });
  c.line(M, 28, M, 42, 'B', 4, false); centred(c, 48, 5, 9, 'B'); band(c, 48, 5, 9, 46, 'A', 1);
  if (!K.body) { limb(c, [[28, 31], [22, 37], [24, 27]], { w: 2, tip: 'none', mech: true }); rightPoly(c, [[22, 27], [25, 27], [24, 19], [22, 15]], 'B'); }
  c.poly([[24, 14], [39, 14], [M, 25]], 'B', false); c.poly([[29.5, 14], [M, 9], [33.5, 14]], 'A', false);
  eyes(c, 27.5, 16.5, { w: 2.2, h: 1.7, slant: 1.8 });
} };

D.deroplatys = { hand: { x: 50, y: 46 }, draw(c, K) { // Leaf Warden: a dead-leaf shield wider than it is tall, scythes raised over it
  if (!K.nolegs) limb(c, [[26, 50], [19, 55], [18, 61]], { w: 2, tip: 'foot' });
  c.poly([[24, 44], [39, 44], [36, 56], [M, 60], [27, 56]], 'L', false);
  c.poly([[M, 14], [46, 23], [51, 32], [44, 40], [M, 45], [19, 40], [12, 32], [17, 23]], 'B', false);
  c.line(M, 18, M, 42, 'D', 1, false); c.line(M, 27, 21, 33, 'D', 1);
  if (!K.body) { limb(c, [[18, 30], [9, 23], [11, 13]], { w: 3, tip: 'none', mech: true }); rightPoly(c, [[9.5, 13], [13, 13], [11, 5], [8, 3]], 'D'); }
  c.poly([[24, 7], [39, 7], [M, 17]], 'B', false);
  eyes(c, 28, 9.5, { w: 2, h: 1.6, slant: 1.8 });
} };

D.empusa = { hand: { x: 49, y: 40 }, draw(c, K) { // Cone Oracle: lavender, crowned with a tall spire, leafy lobes on its legs
  if (!K.nolegs) { limb(c, [[29, 48], [23, 53], [23, 61]], { w: 2, tip: 'foot' }); c.ell(25.5, 51, 2.2, 1.5, 'A'); }
  c.line(M, 26, M, 42, 'B', 3, false); centred(c, 50, 6, 9, 'B'); c.ell(25, 50, 2.6, 4, 'A');
  if (!K.body) { limb(c, [[28, 30], [20, 34], [21, 24]], { w: 2, tip: 'none', mech: true }); rightPoly(c, [[19, 24], [22, 24], [21, 16], [19, 13]], 'L'); }
  c.poly([[24, 16], [39, 16], [M, 26]], 'B', false);
  if (!K.body) c.poly([[27, 17], [30, 6], [34, 0.5], [33, 8], [36, 17]], 'L', false);
  eyes(c, 27.5, 19, { w: 2.2, h: 1.7, slant: 2 });
} };

D.heteropteryx = { draw(c, K) { // Thorn Bastion: a broad green fortress bristling with a few great spines
  if (!K.body) { c.poly([[16, 37], [3, 27], [16, 31]], 'L'); c.poly([[17, 46], [4, 50], [17, 52]], 'L'); c.poly([[22, 31], [17, 16], [26, 29]], 'L'); }
  stance(c, K, { hipX: 24, hipY: 51, kneeX: 18, kneeY: 56, w: 5 });
  centred(c, 42, 15, 14, 'B'); c.ell(24, 42, 2.2, 2.2, 'A'); centred(c, 50, 2.4, 2.2, 'A');
  if (!K.body) limb(c, [[16, 38], [10, 44], [11, 49]], { w: 4, tip: 'fist', mech: true });
  centred(c, 24, 9, 6.5, 'B');
  if (!K.body) { c.poly([[25, 19], [24, 12], [28, 18]], 'L'); c.poly([[M - 1.6, 18], [M, 10], [M + 1.6, 18]], 'L', false); }
  eyes(c, 27, 24.5, { w: 2.6, h: 2, slant: 1.6 });
} };

D.peruphasma = { hand: { x: 50, y: 33 }, draw(c, K) { // Night Blade: a jet-black katana of a stick insect, red scarf-wings, yellow eyes
  if (!K.nolegs) { limb(c, [[29, 46], [20, 52], [18, 61]], { w: 2, tip: 'foot' }); limb(c, [[29, 39], [18, 43], [12, 52]], { w: 2, tip: 'claw' }); }
  if (!K.body) c.poly([[30, 22], [19, 17], [17, 26], [29, 28]], 'A');
  c.line(M, 14, M, 58, 'B', 4, false);
  if (!K.body) { limb(c, [[29, 26], [19, 35], [13, 29]], { w: 2 }); chain(c, [[29, 9], [22, 3], [14, 2]], 'D'); }
  centred(c, 12, 5, 4.5, 'B');
  eyes(c, 28.5, 12, { w: 2, h: 1.6, slant: 2, iris: 'Y' });
} };

D.dryococelus = { hand: { x: 51, y: 38 }, draw(c, K) { // Ancient Lobster: a gold-trimmed living fossil on two colossal thighs
  if (!K.nolegs) { c.ell(15, 50, 7.5, 5.5, 'B'); limb(c, [[12, 53], [12, 60]], { w: 4, tip: 'foot' }); }
  centred(c, 45, 10, 9, 'B'); band(c, 45, 10, 9, 42, 'A', 1); centred(c, 32, 8, 6, 'B'); band(c, 32, 8, 6, 33, 'A', 1);
  if (!K.body) limb(c, [[22, 32], [13, 36], [12, 44]], { w: 5, tip: 'claw', mech: true });
  centred(c, 21, 7, 5.5, 'B');
  if (!K.body) c.poly([[26, 17], [28, 12], [M, 15], [35, 12], [37, 17]], 'A', false);
  eyes(c, 28, 21.5, { w: 2.4, h: 1.9, slant: 1.8, iris: 'A' });
} };

D.solenopsis = { draw(c, K) { // Blaze Legion: a fire-red ant with a crest of flame on its head
  if (!K.nolegs) limb(c, [[27, 37], [16, 44], [14, 60]], { w: 2, tip: 'foot' });
  centred(c, 50, 10, 9, 'B'); band(c, 50, 10, 9, 48, 'D', 1); c.ell(M, 41, 2.5, 2, 'D', false); centred(c, 34, 6, 5, 'B');
  if (!K.body) limb(c, [[27, 32], [18, 28], [14, 34]], { w: 2, mech: true });
  if (!K.body) c.poly([[26, 14], [28, 5], [M, 9], [35, 3], [37, 14]], 'A', false);
  centred(c, 20, 10, 8, 'B'); c.poly([[24, 25], [22, 31], [27, 29]], 'D');
  eyes(c, 26.5, 20, { w: 2.6, h: 2, slant: 2 });
} };

D.odontomachus = { draw(c, K) { // Snap Trap: rust-orange, its long white jaws cocked wide open, end to end
  if (!K.nolegs) limb(c, [[27, 37], [16, 44], [14, 60]], { w: 2, tip: 'foot' });
  centred(c, 49, 10, 9, 'B'); c.ell(M, 40, 2.5, 2, 'D', false); centred(c, 33, 6, 5, 'B');
  if (!K.body) { limb(c, [[27, 32], [18, 28], [15, 34]], { w: 2, mech: true }); c.line(25, 22, 6, 21, 'A', 2); c.poly([[3, 17], [7, 19], [7, 23], [3, 25]], 'A'); }
  centred(c, 19, 8, 7.5, 'B');
  eyes(c, 27, 19, { w: 2.6, h: 2, slant: 1.8 });
} };

D.dasymutilla = { draw(c, K) { // Velvet Fury: a puff of red velvet with a black face, all fluff and sting
  if (!K.nolegs) limb(c, [[27, 37], [17, 46], [16, 60]], { w: 2, tip: 'foot' });
  centred(c, 46, 12, 11, 'B'); for (const [x, y] of [[20, 40], [19, 49], [24, 56], [24, 36]]) c.ell(x, y, 3, 3, 'B'); band(c, 46, 12, 11, 44, 'A', 2);
  centred(c, 31, 7, 5, 'A');
  if (!K.body) limb(c, [[25, 30], [17, 27], [14, 32]], { w: 2, mech: true });
  centred(c, 19, 8, 7, 'A'); c.ell(24, 13, 2.6, 2.6, 'B'); centred(c, 12, 2.6, 2.6, 'B');
  eyes(c, 27, 19.5, { w: 2.6, h: 2, slant: 1.8, iris: 'B' });
} };

D.colobopsis = { draw(c, K) { // Plug Bomb: a flat door of a head and a glowing yellow bomb of a body
  if (!K.nolegs) limb(c, [[27, 38], [17, 45], [16, 60]], { w: 2, tip: 'foot' });
  centred(c, 48, 11, 10, 'A'); band(c, 48, 11, 10, 47, 'L', 1); centred(c, 33, 6, 4.5, 'B');
  if (!K.body) { limb(c, [[26, 31], [18, 28], [15, 33]], { w: 2, mech: true }); c.ell(M, 60, 1.6, 1.6, 'A', false); }
  c.poly([[18, 11], [45, 11], [43, 24], [M, 28], [20, 24]], 'B', false); c.poly([[20, 11], [43, 11], [42.5, 14], [20.5, 14]], 'L', false);
  eyes(c, 27, 19.5, { w: 2.6, h: 2, slant: 1.4 });
} };

D.myrmeleon = { draw(c, K) { // Sand Pit King: a squat dune-coloured ambusher under two great sickle jaws
  if (!K.nolegs) { limb(c, [[19, 50], [12, 56], [12, 61]], { w: 3, tip: 'foot' }); limb(c, [[24, 54], [22, 61]], { w: 3, tip: 'foot' }); }
  centred(c, 42, 16, 14, 'B'); c.ell(24, 45, 2.6, 2.6, 'A');
  if (!K.body) limb(c, [[17, 38], [10, 40], [9, 46]], { w: 3, mech: true });
  centred(c, 26, 9, 6, 'B');
  if (!K.body) c.poly([[26, 22], [19, 12], [21, 3], [25, 2], [22, 10], [29, 20]], 'D');
  eyes(c, 27, 27, { w: 2.4, h: 1.8, slant: 1.8 });
} };

D.platymeris = { hand: { x: 49, y: 44 }, draw(c, K) { // Night Stalker: a lean black hunter, forelegs raised to strike, two red spots
  if (!K.nolegs) limb(c, [[26, 52], [18, 56], [17, 61]], { w: 2, tip: 'foot' });
  c.poly([[M, 28], [42, 34], [38, 54], [M, 58], [25, 54], [21, 34]], 'B', false); c.ell(26, 44, 3.4, 3.4, 'A');
  if (!K.body) { limb(c, [[23, 34], [13, 26], [14, 14]], { w: 3, mech: true }); chain(c, [[29, 13], [24, 6], [18, 4]], 'D'); }
  c.poly([[27, 12], [36, 12], [35, 24], [M, 28], [28, 24]], 'B', false);
  eyes(c, 28.5, 18, { w: 2, h: 1.7, slant: 2.2 });
} };

D.acanthaspis = { hand: { x: 50, y: 42 }, draw(c, K) { // Shroud Ninja: a ragged hooded cloak, two yellow eyes in the dark of the hood
  if (!K.nolegs) limb(c, [[26, 52], [25, 60]], { w: 2, tip: 'foot' });
  c.poly([[M, 4], [44, 22], [50, 54], [44, 52], [40, 58], [M, 54], [23, 58], [19, 52], [13, 54], [19, 22]], 'B', false);
  centred(c, 21, 7.5, 7, 'D');
  if (!K.body) limb(c, [[44, 38], [50, 42]], { w: 3, mirror: false });
  eyes(c, 28, 21.5, { w: 2.4, h: 1.8, slant: 2.2 });
} };

D.gromphadorhina = { draw(c, K) { // Iron Hisser: three heavy mahogany plates, two horn bumps, hissing steam
  if (!K.body) { chain(c, [[27, 34], [14, 29], [6, 19]], 'D', 1); c.ell(8, 41, 2.6, 2, 'Z'); c.ell(4.5, 36, 1.7, 1.5, 'Z'); }
  if (!K.nolegs) limb(c, [[20, 52], [15, 58], [16, 61]], { w: 3, tip: 'foot' });
  centred(c, 45, 17, 13, 'B'); band(c, 45, 17, 13, 43, 'D', 1); band(c, 45, 17, 13, 51, 'D', 1);
  centred(c, 30, 14, 8, 'B'); c.ell(26, 24, 2.8, 2.6, 'L');
  eyes(c, 26.5, 31, { w: 2.6, h: 2, slant: 1.6 });
} };

D.gryllotalpa = { draw(c, K) { // Burrow Brawler: a velvet-brown digger with two shovel fists
  stance(c, K, { hipX: 25, hipY: 52, kneeX: 20, kneeY: 56, w: 3 });
  centred(c, 46, 11, 12, 'B'); centred(c, 31, 11, 8, 'L');
  if (!K.body) { limb(c, [[20, 32], [12, 36]], { w: 4, tip: 'none', mech: true }); rightPoly(c, [[13, 32], [4, 29], [2, 35], [5, 37], [3, 42], [9, 42], [14, 40]], 'D'); rightLine(c, 3, 31, 6, 34, 'A', 1); rightLine(c, 3, 39, 6, 38, 'A', 1); }
  centred(c, 20, 7, 5.5, 'B');
  eyes(c, 27.5, 20.5, { w: 2.4, h: 1.8, slant: 1.6 });
} };

D.menacanthus = { draw(c, K) { // Gobbler Louse: a flat golden louse with a red wattle, clinging tight
  if (!K.nolegs) limb(c, [[19, 50], [12, 54], [11, 60]], { w: 3, tip: 'foot' });
  centred(c, 44, 15, 12, 'B'); band(c, 44, 15, 12, 41, 'D', 1); band(c, 44, 15, 12, 48, 'D', 1);
  if (!K.body) limb(c, [[18, 41], [10, 39], [8, 44]], { w: 3, mech: true });
  centred(c, 25, 12, 8, 'B'); c.ell(M, 33, 2, 3, 'A', false);
  eyes(c, 26, 24.5, { w: 2.6, h: 2, slant: 1.4 });
} };

D.eupholus = { draw(c, K) { // Drill Sapphire: turquoise with black bands, its long snout bent down like a drill
  stance(c, K, { hipX: 25, hipY: 52, kneeX: 19, kneeY: 56, w: 4 });
  centred(c, 44, 14, 13, 'B'); band(c, 44, 14, 13, 40, 'A', 2); band(c, 44, 14, 13, 50, 'A', 2);
  if (!K.body) limb(c, [[18, 38], [12, 44], [13, 49]], { w: 4, mech: true });
  centred(c, 24, 8, 6, 'B');
  c.poly([[28, 27], [35, 27], [34, 35], [M, 38], [29, 35]], 'B', false);
  if (!K.body) { chain(c, [[29, 31], [22, 28], [20, 20]], 'D'); c.ell(20, 19, 1.4, 1.7, 'D'); }
  eyes(c, 27.5, 23.5, { w: 2.4, h: 1.8, slant: 1.6 });
} };

D.pachyrhynchus = { draw(c, K) { // Egg Fortress: a perfect glossy indigo egg, dotted in neon orange
  if (!K.nolegs) limb(c, [[22, 53], [19, 61]], { w: 4, tip: 'foot' });
  centred(c, 40, 17, 17, 'B'); c.ell(22, 34, 3, 3, 'A'); centred(c, 47, 3.4, 3, 'A'); c.ell(22, 48, 2.4, 2.4, 'A');
  if (!K.body) limb(c, [[16, 36], [10, 40], [11, 44]], { w: 3, tip: 'fist' });
  centred(c, 20, 6, 5, 'B');
  eyes(c, 28, 20.5, { w: 2.2, h: 1.8, slant: 1.4 });
} };

D.phrixothrix = { hand: { x: 51, y: 46 }, draw(c, K) { // Night Express: a coiled railway of a worm, lit windows down its side, a red headlamp
  for (const [x, y, r] of [[16, 56, 4], [23, 58, 4.6], [31, 57.5, 5], [39, 55, 5.2], [45, 49, 5.4], [44, 41, 5.4], [38, 36, 5.4], [33, 31, 5.2], [M, 25, 5.4]]) { c.ell(x, y, r, r * 0.9, 'B', false); c.ell(x - r * 0.3, y, r * 0.3, r * 0.26, 'A', false); }
  centred(c, 15, 8, 6.5, 'B');
  c.ell(M, 9.5, 2.2, 1.6, 'R', false);
  eyes(c, 28, 16, { w: 2.4, h: 1.8, slant: 1.8 });
} };

D.arachnocampa = { draw(c, K) { // Lantern Weaver: hangs a curtain of glowing beaded silk, and glows at the tail
  if (!K.body) for (const [x, n] of [[7, 22], [13, 30], [19, 18]]) { c.line(x, 1, x, n, 'L', 1); for (let y = 6; y <= n; y += 6) c.ell(x, y, 1.3, 1.3, 'A'); }
  centred(c, 52, 7, 5.5, 'A'); centred(c, 52, 4, 3, 'L');
  centred(c, 40, 10, 9, 'B'); band(c, 40, 10, 9, 44, 'D', 1);
  centred(c, 26, 8, 6.5, 'B');
  eyes(c, 28, 26.5, { w: 2.4, h: 1.8, slant: 1.2 });
} };

D.lethocerus = { hand: { x: 50, y: 30 }, draw(c, K) { // Tide Crusher: a flat olive bruiser with two crab-sized pincers raised
  if (!K.nolegs) limb(c, [[22, 52], [14, 58], [12, 61]], { w: 3, tip: 'foot' });
  centred(c, 44, 15, 13, 'B'); c.poly([[M, 36], [42, 52], [M, 56], [21, 52]], 'L', false);
  if (!K.body) { limb(c, [[18, 34], [8, 30], [7, 21]], { w: 5, tip: 'none', mech: true }); rightPoly(c, [[3, 21], [11, 20], [10, 12], [6, 7], [6.5, 14]], 'D'); }
  centred(c, 26, 7, 5, 'B');
  eyes(c, 27.5, 26, { w: 2.4, h: 1.8, slant: 1.8, iris: 'A' });
} };

D.micronecta = { hand: { x: 50, y: 34 }, draw(c, K) { // Oar Rower: a boat-shaped sandy rower pulling two long blue oars
  if (!K.nolegs) { c.line(22, 40, 6, 54, 'D', 2); c.poly([[3, 52], [8, 51], [8, 58], [2, 59]], 'A'); }
  c.poly([[M, 18], [42, 26], [42, 46], [M, 56], [21, 46], [21, 26]], 'B', false); c.line(M, 26, M, 52, 'A', 1, false);
  if (!K.body) limb(c, [[23, 30], [16, 28], [14, 32]], { w: 2, mech: true });
  centred(c, 20, 7, 5.5, 'B');
  eyes(c, 27.5, 20.5, { w: 2.4, h: 1.8, slant: 1.6 });
} };

D.notonecta = { hand: { x: 50, y: 50 }, draw(c, K) { // Moon Diver: swims on its back, silver keel up, red eyes looking the right way round
  if (!K.body) { c.line(24, 24, 7, 10, 'D', 2); c.ell(5.5, 7.5, 3, 4, 'L'); c.ell(12, 52, 1.6, 1.6, 'L'); c.ell(9, 47, 1.1, 1.1, 'L'); }
  if (!K.nolegs) limb(c, [[25, 40], [18, 48], [16, 54]], { w: 2 });
  c.poly([[M, 6], [42, 18], [40, 38], [M, 44], [23, 38], [21, 18]], 'B', false); c.line(M, 9, M, 41, 'L', 2, false);
  centred(c, 48, 8, 6, 'B');
  eyes(c, 28, 48.5, { w: 2.4, h: 1.8, slant: 1.6 });
} };

D.dytiscus = { draw(c, K) { // Torrent Diver: a sleek deep-green torpedo rimmed in gold, with fringed oar legs
  if (!K.nolegs) { c.line(18, 48, 6, 56, 'D', 3); c.poly([[2, 53], [8, 54], [7, 60], [3, 60]], 'L'); }
  centred(c, 40, 15, 18, 'A'); centred(c, 40, 13.5, 16.5, 'B'); c.line(M, 32, M, 55, 'o', 1, false);
  if (!K.body) limb(c, [[17, 30], [10, 26], [9, 31]], { w: 2, mech: true });
  centred(c, 19, 7.5, 5, 'B');
  eyes(c, 27.5, 19.5, { w: 2.4, h: 1.8, slant: 1.8 });
} };

D.gyrinus = { draw(c, K) { // Whirl Spinner: a glossy steel-blue pebble spinning in its own whirlpool, four eyes
  if (!K.body) { ring(c, M, 49, 27, 7, 'A', 2, 0, Math.PI); ring(c, M, 49, 27, 7, 'L', 1, Math.PI, Math.PI * 2); }
  if (!K.nolegs) limb(c, [[19, 44], [12, 50], [11, 54]], { w: 2 });
  centred(c, 37, 15, 15, 'B');
  eyes(c, 27, 30.5, { w: 2.6, h: 2, slant: 1.8 });
  oneBead(c, 27.4, 38.8, 1.6);
  oneBead(c, 63 - 27.4, 38.8, 1.6);
} };

D.sphaerocoris = { draw(c, K) { // Canvas Shield: a lime shield painted with two bold blue targets
  stance(c, K, { hipX: 26, hipY: 52, kneeX: 21, kneeY: 56, w: 2 });
  c.poly([[16, 26], [24, 20], [39, 20], [47, 26], [46, 40], [M, 58], [17, 40]], 'B', false);
  c.ell(24, 35, 4.6, 4.6, 'A'); c.ell(24, 35, 2.4, 2.4, 'L'); centred(c, 47, 3.2, 3.2, 'A'); centred(c, 47, 1.4, 1.4, 'L');
  if (!K.body) limb(c, [[17, 32], [10, 36], [11, 41]], { w: 2, mech: true });
  centred(c, 17, 7, 5, 'B');
  eyes(c, 27.5, 17, { w: 2.4, h: 1.8, slant: 1.6 });
} };

D.pyrrhocoris = { hand: { x: 49, y: 30 }, draw(c, K) { // Mask Guard: a tall scarlet shield painted with a black mask, fists up
  stance(c, K, { hipX: 25, hipY: 52, kneeX: 20, kneeY: 56, w: 3 });
  c.poly([[M, 20], [42, 28], [42, 50], [M, 58], [21, 50], [21, 28]], 'B', false);
  c.poly([[M, 29], [37, 35], [M, 41], [26, 35]], 'A', false); c.ell(25.5, 46, 2.6, 2.6, 'A'); c.poly([[25, 52], [M, 55], [38, 52], [38, 54], [M, 57.5], [25, 54]], 'A', false);
  if (!K.body) { limb(c, [[22, 32], [14, 30], [15, 22]], { w: 3, tip: 'fist', mech: true }); chain(c, [[29, 11], [23, 4], [18, 2]], 'D'); }
  centred(c, 16, 6.5, 5, 'A');
  eyes(c, 27.5, 16, { w: 2.4, h: 1.8, slant: 1.8, iris: 'B' });
} };

D.phloeodes = { draw(c, K) { // Iron Bastion: a blocky stone-grey fortress, studded with knobs
  if (!K.nolegs) limb(c, [[18, 55], [16, 61]], { w: 4, tip: 'foot' });
  c.poly([[15, 28], [48, 28], [51, 56], [12, 56]], 'B', false); c.ell(19, 36, 2.4, 2, 'L'); c.ell(25, 47, 2.4, 2, 'L'); centred(c, 40, 2.4, 2, 'L');
  if (!K.body) limb(c, [[15, 34], [9, 40], [10, 45]], { w: 4, tip: 'fist', mech: true });
  centred(c, 22, 9, 6, 'B');
  eyes(c, 27.5, 22.5, { w: 2.4, h: 1.8, slant: 1.8 });
} };

D.photuris = { draw(c, K) { // Lantern Hunter: dusky wings spread, a big glowing lantern of a body
  if (!K.body) c.poly([[26, 24], [11, 30], [13, 44], [27, 40]], 'B');
  stance(c, K, { hipX: 27, hipY: 54, kneeX: 22, kneeY: 57, w: 2 });
  centred(c, 48, 11, 11, 'A'); centred(c, 48, 8, 9, 'Y');
  centred(c, 31, 8, 7, 'B');
  if (!K.body) limb(c, [[24, 32], [16, 36], [16, 41]], { w: 2, mech: true });
  centred(c, 20, 7, 6, 'L');
  eyes(c, 27.5, 20.5, { w: 2.4, h: 1.8, slant: 1.8 });
  if (!K.body) chain(c, [[28, 15], [24, 8], [20, 6]], 'D');
} };

export const STAGE_TWO = D;
/** The species' Stage II monster, or false if it has none (then the old drawing stands). */
export function drawStageTwo(c, L, kit = {}) {
  const d = D[L.id]; if (!d) return false;
  SPECIES = L.id; JOINTS.length = 0; MECH_Q.length = 0;
  try {
    d.draw(c, { nolegs: !!kit.nolegs, body: !!kit.body });
    for (const j of JOINTS) servo(c, j.x, j.y, j.r, j.mirror);
    panelSeams(c);
    if (!kit.body) {
      const mount = STAGE_TWO_MOUNT[L.id] || 'arm';
      const tool = STAGE_TWO_TOOL[L.id] || 'drill';
      if (mount === 'arm') {
        const job = MECH_Q[0] || (MECH_FALLBACK[L.id] ? { pts: MECH_FALLBACK[L.id], w: 4 } : null);
        if (job) drawMechArm(c, MECH_POSE_OVER[L.id] || job.pts, tool, job.w);
      } else if (MECH_MOUNT[L.id]) {
        drawMechMount(c, MECH_MOUNT[L.id], tool);
      }
    }
  } finally { SPECIES = null; JOINTS.length = 0; MECH_Q.length = 0; }
  return true;
}
export const stageTwoHandOf = (id) => (D[id] ? D[id].hand || HAND : null);

// ---- shading: flat cel tones, lit from the top left, outlined in the bug's own darkest colour ----
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };

/** Material grid (sprite.js canvas) to colours: each solid piece gets a lit side, a base and a shadow side, a dark line where a piece sits over another, and a crisp outline. */
export function celShade({ g, part, etch, shine }, R) {
  const N = g.length, f = N / 64, comp = new Int32Array(N * N).fill(-1), info = [];
  const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] !== null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x] === null || comp[y * N + x] >= 0) continue;
    const k = info.length, m = g[y][x], p = part[y][x], q = [[x, y]]; comp[y * N + x] = k;
    let l = x, r = x, t = y, b = y, n = 0;
    while (q.length) { const [u, v] = q.pop(); n++; l = Math.min(l, u); r = Math.max(r, u); t = Math.min(t, v); b = Math.max(b, v);
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = u + du, e = v + dv; if (filled(a, e) && comp[e * N + a] < 0 && g[e][a] === m && part[e][a] === p) { comp[e * N + a] = k; q.push([a, e]); } } }
    info.push({ cx: (l + r + 1) / 2, cy: (t + b + 1) / 2, hw: Math.max(1, (r - l + 1) / 2), hh: Math.max(1, (b - t + 1) / 2), n, p });
  }
  const big = (k) => k >= 0 && info[k].n >= 5 * f * f;
  const line = R.D[0], out = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = g[y][x];
    if (m === null) { if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) out[y][x] = R.o; continue; }
    if (m === 'o') { out[y][x] = R.o; continue; }
    if (m === 'G') { out[y][x] = '#ffffff'; continue; }
    if (m === 'S') { out[y][x] = R.B[0]; continue; }
    if (m === 'H') { out[y][x] = R.L[2]; continue; }
    if (m === 'C') { out[y][x] = filled(x, y - 1) && g[y - 1][x] === 'C' ? '#7af6ff' : '#1ad0e8'; continue; }
    if (m === 'X') { out[y][x] = filled(x, y - 1) && g[y - 1][x] === 'X' ? '#ff6a72' : '#e01830'; continue; }
    if (m === 'J') { out[y][x] = '#c4842e'; continue; }
    if (m === 'K') { out[y][x] = '#1e1e26'; continue; }
    const ramp = R[m] || R.B, k = comp[y * N + x], I = info[k];
    if (m === 'E') { out[y][x] = ramp[1]; continue; }
    if (m === 'e') { out[y][x] = filled(x, y - 1) && g[y - 1][x] === 'e' ? ramp[1] : ramp[0]; continue; }
    let tone = 1;
    if (big(k)) {
      // each piece shaded as if it were a rounded solid: a crescent of shadow low on the right, a lit cap high on the left
      const nx = (x + 0.5 - I.cx) / I.hw, ny = (y + 0.5 - I.cy) / I.hh, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
      const lum = -0.42 * nx - 0.58 * ny + 0.7 * nz;
      tone = lum > 0.8 ? 2 : lum < 0.28 ? 0 : 1;
      // a piece drawn over this one throws a dark line along its edge
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!filled(a, b)) continue; const j = comp[b * N + a];
        if (j !== k && big(j) && info[j].p > I.p && !'eEGo'.includes(g[b][a])) { tone = -1; break; } }
      // gloss: a small hard highlight high on the lit side of a big shell
      if (tone === 2 && 'BA'.includes(m) && I.n >= 60 * f * f) { const hx = (nx + 0.42) / 0.2, hy = (ny + 0.5) / 0.15; if (hx * hx + hy * hy <= 1) tone = 3; }
    } else {
      const same = (dx, dy) => filled(x + dx, y + dy) && g[y + dy][x + dx] === m;
      tone = !same(-1, -1) || !same(0, -1) ? 2 : !same(1, 1) || !same(0, 1) ? 0 : 1;
    }
    out[y][x] = tone === -1 ? line : tone === 3 ? mix(ramp[2], '#ffffff', 0.6) : ramp[tone];
    if (etch[y][x] && tone > 0) out[y][x] = ramp[0];
    if (shine[y][x]) out[y][x] = mix(ramp[2], '#ffffff', 0.5);
  }
  return out;
}
/** A colour grid scaled up by nearest-neighbour to `n` a side. */
export function upscale(src, n) {
  const m = src.length; if (m === n) return src;
  return Array.from({ length: n }, (_, y) => { const row = src[Math.floor((y * m) / n)]; return Array.from({ length: n }, (_, x) => row[Math.floor((x * m) / n)]); });
}

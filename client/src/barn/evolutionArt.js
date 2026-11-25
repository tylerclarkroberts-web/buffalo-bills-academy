// Evolved bodies, on the adult sprite's grid and in its materials. Every species keeps something of its own:
// at stage two its whole body, with a mining rig built for its kind let into its back; at stage three its shell as
// a breastplate (and its wings, if it has them) on a frame built for its kind. Its head and colours come along.
// `kit.draw(target, look, 'body' | 'head')` is the species' own drawing (sprite.js).
import { outfitOf } from './evolutionWear.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// What a bug is built like decides what it is rebuilt as.
const PLANS = { mantis: ['mantis', 'stick', 'tree-lobster'], flier: ['dragonfly', 'lacewing', 'moth', 'cicada', 'caddisfly'], aquatic: ['waterbug', 'skater'],
  hopper: ['treehopper', 'leafhopper', 'lanternfly', 'frogleg', 'cricket'], weevil: ['weevil'], shield: ['shield', 'ground'], larva: ['larva'], crawler: ['ant', 'assassin', 'roach', 'antlion'] };
const BY_KIND = Object.fromEntries(Object.entries(PLANS).flatMap(([plan, kinds]) => kinds.map((kind) => [kind, plan])));
const BY_SPECIES = { ampulex: 'flier', megachile: 'flier', dytiscus: 'aquatic', gyrinus: 'aquatic' }; // a wasp and a bee fly; two beetles dive
const planOf = (L) => BY_SPECIES[L.id] || BY_KIND[L.kind] || 'beetle';

/** How far a drawing reaches, in 64-grid coordinates: the same calls a canvas takes, only measured. */
function reach(fn) {
  let l = 99, r = -99, t = 99, b = -99;
  const hit = (x, y, rx, ry, mirror) => { for (const u of mirror ? [x, 63 - x] : [x]) { l = Math.min(l, u - rx); r = Math.max(r, u + rx); } t = Math.min(t, y - ry); b = Math.max(b, y + ry); };
  fn({ f: 1, ell: (x, y, rx, ry, m, mirror = true) => hit(x, y, rx, ry, mirror),
    line: (x0, y0, x1, y1, m, w = 1, mirror = true) => { hit(x0, y0, w / 2, w / 2, mirror); hit(x1, y1, w / 2, w / 2, mirror); },
    poly: (pts, m, mirror = true) => pts.forEach(([x, y]) => hit(x, y, 0, 0, mirror)), hair: (pts, m, mirror = true) => pts.forEach(([x, y]) => hit(x, y, 0, 0, mirror)),
    put: (x, y) => hit(x, y, 0.5, 0.5, false), sym: (x, y) => hit(x, y, 0.5, 0.5, true) });
  return { l, r, t, b, w: r - l, h: b - t };
}

/**
 * The canvas again, with everything drawn through it shrunk by `s` about the middle column, and source row `sy` landing
 * on row `cy`. `limb`: 'M' turns the bug's thin dark limbs to iron with brass knees; 'none' leaves them off.
 */
function view(c, { s = 1, sy = 32, cy = 32, limb = null } = {}) {
  const X = (x) => 31.5 + (x - 31.5) * s, Y = (y) => cy + (y - sy) * s, W = (w) => Math.max(1, Math.round(w * s));
  const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]), thin = (m) => limb && m === 'D';
  return { f: c.f,
    ell: (x, y, rx, ry, m, mirror = true) => { if (!(thin(m) && rx <= 2 && limb === 'none')) c.ell(X(x), Y(y), rx * s, ry * s, thin(m) && rx <= 2 ? 'J' : m, mirror); }, // a knee
    line: (x0, y0, x1, y1, m, w = 1, mirror = true) => {
      if (thin(m) && limb === 'none') return;
      c.line(X(x0), Y(y0), X(x1), Y(y1), thin(m) ? 'M' : m, W(w), mirror);
      if (thin(m) && w >= 2) c.ell(X(x1), Y(y1), 1.1, 1.1, 'J', mirror);
    },
    poly: (pts, m, mirror = true) => c.poly(P(pts), m, mirror),
    hair: (pts, m, mirror = true) => { if (!(thin(m) && limb === 'none')) c.hair(P(pts), thin(m) ? 'M' : m, mirror); },
    put: (x, y, m) => c.put(X(x), Y(y), m),
    sym: (x, y, m) => { c.put(X(x), Y(y), m); c.put(X(63 - x), Y(y), m); } };
}

/** The species' own body, fitted into a box `w` by `h` with its lowest point on row `bottom` (or its middle on `mid`). */
function ownBody(c, L, kit, { w, h, bottom, mid, limb, most = 0.84 }) {
  const b = reach((r) => kit.draw(view(r, { limb }), L, 'body'));
  if (!(b.w > 0)) return;
  const s = Math.min(most, w / b.w, h / b.h);
  kit.draw(view(c, mid === undefined ? { s, sy: b.b, cy: bottom, limb } : { s, sy: (b.t + b.b) / 2, cy: mid, limb }), L, 'body');
}
/** Its own head, seated on the machine's neck: only long feelers, horns and snouts are scaled down to fit. */
function seatHead(c, L, kit, neck = 21, w = 36, h = 20) {
  const b = reach((r) => kit.draw(r, L, 'head'));
  if (!(b.w > 0)) return null;
  const seat = { s: Math.min(1, w / b.w, h / b.h), sy: b.b, cy: neck };
  kit.draw(view(c, seat), L, 'head');
  return seat;
}
/** Where a hat sits on a seated head: the middle, top row and half-width of the biggest solid part of it. */
function crownOf(L, kit, seat) {
  let best = null;
  const take = (x, top, half, area, m) => { if ('BDLA'.includes(m) && (!best || area > best.area)) best = { x, top, half, area }; };
  kit.draw({ f: 1, line() {}, hair() {}, put() {}, sym() {},
    ell: (x, y, rx, ry, m, mirror = true) => { if (!mirror || Math.abs(x - 31.5) < rx) take(mirror ? 31.5 : x, y - ry, rx, Math.PI * rx * ry, m); },
    poly: (pts, m, mirror = true) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys);
      if (!mirror || (l < 31.5 && r > 31.5)) take((l + r) / 2, t, (r - l) / 2, ((r - l) * (Math.max(...ys) - t)) / 2, m); } }, L, 'head');
  return best && { x: 31.5 + (best.x - 31.5) * seat.s, y: Math.max(6, seat.cy + (best.top - seat.sy) * seat.s), w: Math.max(4.5, Math.min(8, best.half * seat.s)) };
}
/** The canvas, drawing on one side only: for what a bug wears or holds. */
const solo = (c) => ({ f: c.f, put: c.put, ell: (x, y, rx, ry, m) => c.ell(x, y, rx, ry, m, false), line: (x0, y0, x1, y1, m, w = 1) => c.line(x0, y0, x1, y1, m, w, false),
  poly: (pts, m) => c.poly(pts, m, false), hair: (pts, m) => c.hair(pts, m, false) });

/** A cap of its own shell on a joint, marked the way its shell was: striped, spotted, rimmed or plain. */
function shellCap(c, L, x, y, rx, ry, mirror = true) {
  const striped = L.stripes || L.bands || L.stripe || L.grooves || L.thighs, spotted = L.rings || L.dots || L.spots || L.blots || L.marbled || L.knobs || L.eyespot || L.cloak || L.fuzz || L.lights;
  if (!striped && !spotted && (L.sheen || L.rim || L.lamp)) c.ell(x, y, rx + 0.9, ry + 0.9, 'A', mirror);
  c.ell(x, y, rx, ry, 'B', mirror);
  if (striped) for (const k of [-0.45, 0.25]) { const half = rx * Math.sqrt(1 - k * k) - 0.8; c.line(x - half, y + k * ry, x + half, y + k * ry, 'A', 1, mirror); }
  else if (spotted) for (const [dx, dy] of [[-0.42, -0.1], [0.34, 0.3], [0.2, -0.5]]) c.ell(x + dx * rx, y + dy * ry, Math.max(0.8, rx * 0.2), Math.max(0.8, ry * 0.24), 'A', mirror);
}
// A rivet is a glint with a shadow under it: marks on the plate, so the plate around it is lit as one piece.
const rivet = (c, x, y, mirror = true) => { if (c.f < 3) return; c.ell(x + 0.3, y + 0.3, 0.5, 0.5, 'T', mirror); c.ell(x, y, 0.45, 0.45, 'I', mirror); };
const seam = (c, pts, mirror = true) => c.hair(pts, 'T', mirror);
/** A row of `n` rivets from one point to another. */
const rivets = (c, x0, y0, x1, y1, n, mirror = true) => { for (let i = 0; i < n; i++) rivet(c, x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1), mirror); };
/** A run of pipe or hose through the points given. */
const pipe = (c, pts, m, w = 1) => { for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], m, w, false); };

// What goes on the end of the working arm. `x, y` is the wrist; `d` is -1 when the arm is on the other side.
const TOOLS = {
  claw(c, x, y, d, up = false) { // an ore grab: a hub and two hooked fingers
    const t = up ? -1 : 1;
    c.ell(x, y, 4.5, 3.5, 'M', false); c.ell(x, y, 2, 2, 'J', false);
    for (const k of [-1, 1]) c.poly([[x + k, y + t * 2], [x + k * 4, y + t * 2], [x + k * 6, y + t * 6], [x + k * 5, y + t * 10], [x + k * 2, y + t * 11], [x + k * 3, y + t * 7]], 'M', false);
    if (c.f >= 3) for (const k of [-1, 1]) c.hair([[x + k * 4.6, y + t * 4], [x + k * 5, y + t * 8]], 'T', false);
  },
  drill(c, x, y) { // a rock drill: the chuck, the bit and its flutes
    c.line(x - 3.5, y, x + 3.5, y, 'K', 3, false);
    c.poly([[x - 4.6, y + 1.5], [x + 4.6, y + 1.5], [x + 0.6, y + 13], [x - 0.6, y + 13]], 'M', false);
    for (const t of [0.14, 0.38, 0.62, 0.84]) c.line(x - 4.2 * (1 - t), y + 2.8 + 11 * t, x + 4.2 * (1 - t), y + 1 + 11 * t, 'J', 1, false);
  },
  pick(c, x, y, d) { // a pick head across the wrist
    c.line(x, y - 1, x, y + 4, 'J', 3, false);
    c.poly([[x - 9 * d, y + 9], [x - 6 * d, y + 3.5], [x, y + 1.5], [x + 6 * d, y + 3.5], [x + 9 * d, y + 9], [x + 5 * d, y + 6], [x, y + 5], [x - 5 * d, y + 6]], 'M', false);
    seam(c, [[x - 5 * d, y + 4.6], [x + 5 * d, y + 4.6]], false);
  },
  hammer(c, x, y) { // a jackhammer: the barrel, its collar, the chisel
    c.line(x, y - 1, x, y + 6, 'M', 7, false);
    c.line(x - 3.5, y + 1, x + 3.5, y + 1, 'J', 2, false); c.line(x - 3.5, y + 7.5, x + 3.5, y + 7.5, 'K', 2, false);
    c.poly([[x - 1.8, y + 8.5], [x + 1.8, y + 8.5], [x + 0.6, y + 14], [x - 0.6, y + 14]], 'K', false);
    if (c.f >= 3) for (const v of [3, 4.5]) c.hair([[x - 2.5, y + v], [x + 2.5, y + v]], 'T', false);
  },
  blade(c, x, y, d) { // a dozer blade
    c.line(x, y - 1, x, y + 2, 'K', 3, false);
    c.poly([[x - 8, y + 2], [x + 7, y + 1], [x + 8, y + 10], [x - 9, y + 11]], 'M', false);
    c.line(x - 8.5, y + 10, x + 7.5, y + 9.2, 'J', 2, false);
    seam(c, [[x - 4 * d, y + 2.5], [x - 4.6 * d, y + 9]], false); seam(c, [[x + 3 * d, y + 2], [x + 3.4 * d, y + 9]], false);
    rivet(c, x - 6.5, y + 4, false); rivet(c, x + 5.5, y + 3.4, false);
  },
  saw(c, x, y) { // a rock saw
    c.line(x, y - 1, x, y + 3, 'K', 3, false);
    for (let a = 0; a < 12; a++) c.ell(x + Math.cos(a * Math.PI / 6) * 6.6, y + 7 + Math.sin(a * Math.PI / 6) * 6.6, 1, 1, 'M', false);
    c.ell(x, y + 7, 6.2, 6.2, 'M', false); c.ell(x, y + 7, 4.2, 4.2, 'K', false); c.ell(x, y + 7, 3.4, 3.4, 'M', false); c.ell(x, y + 7, 1.6, 1.6, 'J', false);
  },
  lamp(c, x, y) { // a cage lantern
    c.line(x, y - 1, x, y + 2, 'K', 2, false);
    c.ell(x, y + 7, 4.6, 5.2, 'J', false); c.ell(x, y + 7, 3.2, 3.8, 'Y', false);
    c.line(x - 4, y + 6.5, x + 4, y + 6.5, 'J', 1, false); c.line(x - 0.5, y + 2.5, x - 0.5, y + 11.5, 'J', 1, false);
  },
  nozzle(c, x, y) { // an acid pump, with a sight glass
    c.line(x, y - 1, x, y + 7, 'M', 6, false);
    c.ell(x, y + 3.5, 1.7, 2.6, 'V', false); c.ell(x, y + 9, 4.2, 1.9, 'J', false);
    c.poly([[x - 2.2, y + 10], [x + 2.2, y + 10], [x + 1, y + 13], [x - 1, y + 13]], 'K', false); c.ell(x, y + 15, 1, 1.4, 'V', false);
  },
  scoop(c, x, y) { // a bucket with teeth
    c.line(x, y - 1, x, y + 2, 'K', 3, false);
    c.poly([[x - 6.5, y + 2], [x + 6.5, y + 2], [x + 5, y + 11], [x - 5, y + 11]], 'M', false);
    c.line(x - 6.5, y + 2.5, x + 6.5, y + 2.5, 'J', 2, false);
    for (const k of [-3.6, 0, 3.6]) c.poly([[x + k - 1.4, y + 11], [x + k + 1.4, y + 11], [x + k, y + 14]], 'K', false);
    seam(c, [[x - 4.4, y + 6.5], [x + 4.4, y + 6.5]], false);
  },
};
const TOOL_OF = { beetle: ['claw', 'scoop'], shield: ['blade', 'hammer'], weevil: ['drill', 'saw'], crawler: ['saw', 'drill'], hopper: ['hammer', 'pick'],
  mantis: ['pick', 'pick'], flier: ['lamp', 'nozzle'], aquatic: ['nozzle', 'claw'], larva: ['scoop', 'lamp'] };
const toolOf = (plan, n) => TOOL_OF[plan][n % 2];

// What rides on its back, drawn first so only what stands clear of it shows. `n` varies it by species.
const BACK = {
  stack(c, n) { // exhaust stacks: one, or one and a short one
    for (const [x, top] of n % 3 ? [[41, 9]] : [[40, 8], [45.5, 13]]) {
      c.line(x, top, x, 26, 'K', 4, false); c.ell(x, top, 2.8, 1.5, 'M', false); c.line(x - 2, top + 5, x + 2, top + 5, 'J', 1, false);
      rivets(c, x - 1.2, top + 3.4, x + 1.2, top + 3.4, 2, false); c.hair([[x - 1.4, top + 7], [x - 1.4, 25]], 'M', false); // a rolled seam down it
    }
  },
  tanks(c) { // air, in two bottles
    c.line(21.5, 11, 21.5, 26, 'J', 5); c.ell(21.5, 10, 2.6, 2, 'M'); c.line(19.5, 16, 23.5, 16, 'K', 1); c.line(19.5, 21, 23.5, 21, 'K', 1);
  },
  pods(c) { // a thruster on each shoulder
    c.ell(18, 19.5, 4.2, 4.6, 'M'); c.ell(18, 18.6, 2.6, 2.8, 'K'); c.ell(18, 18.6, 1.5, 1.6, 'Y');
  },
  mast(c, n) { // a signal mast and its lamp
    const x = n % 2 ? 43 : 20;
    c.line(x, 6, x, 26, 'K', 1, false); c.ell(x + 0.4, 5.5, 1.7, 1.7, 'Y', false); c.line(x - 2, 11, x + 3, 11, 'K', 1, false);
  },
  wheel(c, n) { // a hoist wheel over one shoulder
    const x = n % 2 ? 48 : 15;
    c.hair([[x + (n % 2 ? 5.6 : -5.6), 16], [x + (n % 2 ? 5.6 : -5.6), 25]], 'K', false); // its cable, paid out
    c.ell(x, 15, 6, 6, 'D', false); c.ell(x, 15, 4.2, 4.2, 'J', false); c.line(x, 11, x, 19, 'M', 2, false); c.line(x - 4, 15, x + 4, 15, 'M', 2, false); c.ell(x, 15, 1.2, 1.2, 'K', false);
    if (c.f >= 3) for (let a = 0; a < 8; a++) c.ell(x + Math.cos(a * Math.PI / 4 + 0.4) * 5.1, 15 + Math.sin(a * Math.PI / 4 + 0.4) * 5.1, 0.45, 0.45, 'J', false);
  },
  none() {},
};

// Stage two: half the bug it was. `w`: half the boiler's width; `arm`: how thick the working arm is.
const RIG = {
  beetle: { w: 9, arm: 6, back: 'stack' }, shield: { w: 10.5, arm: 7, back: 'stack', pauldron: 1.5 }, weevil: { w: 8, arm: 6, back: 'stack' },
  crawler: { w: 7.5, arm: 5, back: 'mast' }, hopper: { w: 8, arm: 5, back: 'wheel' }, mantis: { w: 5.5, arm: 4, back: 'mast', scythes: true },
  flier: { w: 6.5, arm: 4, back: 'pods' }, aquatic: { w: 8.5, arm: 5, back: 'tanks' }, larva: { w: 8.5, arm: 6, back: 'stack', treads: true },
};
const CHEST = [
  (c) => { c.ell(31.5, 27.5, 3.3, 3.3, 'J', false); c.ell(31.5, 27.5, 2.4, 2.4, 'P', false); c.hair([[31.5, 27.5], [33, 26]], 'o', false); c.put(31, 27, 'o'); // a pressure gauge, and its scale
    if (c.f >= 3) for (const a of [-2.6, -1.9, -1.2]) c.hair([[31.5 + Math.cos(a) * 1.6, 27.5 + Math.sin(a) * 1.6], [31.5 + Math.cos(a) * 2.2, 27.5 + Math.sin(a) * 2.2]], 'o', false); },
  (c) => { c.poly([[27.5, 25], [35.5, 25], [35.5, 30.5], [27.5, 30.5]], 'K', false); for (const x of [28.6, 31, 33.4]) c.line(x, 25.8, x, 29.8, 'Y', 1, false); }, // the firebox
  (c) => { c.ell(31.5, 27.8, 2.9, 4.1, 'J', false); c.ell(31.5, 27.8, 1.9, 3.1, 'V', false); }, // a vial of the purple
  (c) => { for (const y of [25, 27.2, 29.4]) c.line(27.5, y, 35, y, 'K', 1, false); rivet(c, 26, 23.6, false); rivet(c, 37, 23.6, false); }, // louvres
];

function stageTwo(c, L, kit, flip) {
  const plan = planOf(L), n = hash(L.id), rig = RIG[plan], w = rig.w, X = (x) => (flip ? 63 - x : x), d = flip ? -1 : 1;
  BACK[rig.back](c, n);
  if (rig.treads) { // a grub gets tracks to keep up
    c.line(15.5, 43, 15.5, 59, 'K', 7);
    for (const y of [45.5, 51.5, 57.5]) { c.ell(16, y, 2.3, 2.3, 'M'); c.ell(16, y, 1, 1, 'J'); }
    for (let y = 41; y < 63; y += 2) c.hair([[12.4, y], [13.6, y]], 'M');
  }
  ownBody(c, L, kit, { w: 58, h: 37, bottom: 62.4, limb: 'M', most: 0.9 });
  // the turret ring the machine turns on, let into the bug's back
  c.ell(31.5, 38.4, w + 3.2, 3.5, 'K', false); c.ell(31.5, 37.6, w + 2.2, 2.7, 'M', false);
  for (let k = -1; k <= 1.01; k += 0.25) rivet(c, 31.5 + k * (w + 0.6), 37.6 + (1 - Math.abs(k)) * 1.2, false);

  if (rig.scythes) { // a mantis keeps its reach: both arms fold up and carry a pick blade
    c.line(32 - w, 25, 17, 20, 'M', 4); c.line(17, 20, 11, 29, 'M', 3); c.ell(17, 20, 2.4, 2.4, 'J');
    c.poly([[8.5, 28], [13, 28.5], [15.5, 36], [14.5, 46], [10.5, 37]], 'M'); c.ell(11, 29, 2, 2, 'J');
    for (const y of [32, 35.5, 39]) c.put(13.6 + (y - 32) * 0.12, y, 'A');
    seam(c, [[10.5, 30.5], [12.6, 37], [13.8, 44]]);
  } else {
    const sh = [X(32 - w), 25.5], el = [X(15), 31], wr = [X(9), 37], a = rig.arm;
    c.line(sh[0], sh[1], el[0], el[1], 'M', a, false); c.line(el[0], el[1], wr[0], wr[1], 'M', a, false);
    c.line(sh[0] - d, sh[1] + 1.5, el[0] + 2 * d, el[1] - 0.5, 'J', 2, false); // the piston that lifts it
    c.ell(el[0], el[1], a * 0.62, a * 0.62, 'D', false); c.ell(el[0], el[1], a * 0.36, a * 0.36, 'J', false);
    seam(c, [[sh[0] - 2 * d, sh[1] + 3.4], [el[0] + 0.5 * d, el[1] + 2.6]], false); // and the cable that tells it to
    seam(c, [[(el[0] + wr[0]) / 2 - a * 0.36 * d, (el[1] + wr[1]) / 2 - a * 0.36], [(el[0] + wr[0]) / 2 + a * 0.36 * d, (el[1] + wr[1]) / 2 + a * 0.36]], false);
    TOOLS[toolOf(plan, n)](c, wr[0], wr[1] + 1.5, d);
    const s2 = [X(31 + w), 26], e2 = [X(47.5), 32], h2 = [X(50.5), 39]; // and a lighter arm for the fiddly work
    c.line(s2[0], s2[1], e2[0], e2[1], 'M', 4, false); c.line(e2[0], e2[1], h2[0], h2[1], 'M', 3, false); c.ell(e2[0], e2[1], 2.3, 2.3, 'J', false);
    c.line(h2[0], h2[1], h2[0] + 3 * d, h2[1] + 4, 'M', 2, false); c.line(h2[0], h2[1], h2[0] - 2 * d, h2[1] + 5, 'M', 2, false); c.ell(h2[0], h2[1], 1.6, 1.6, 'K', false);
  }

  c.ell(31.5, 29.8, w + 1.2, 10, 'K', false); c.ell(31.5, 29, w, 9, 'M', false); // the boiler
  for (const y of [23.5, 33.6]) { const half = w * Math.sqrt(1 - ((y - 29) / 9) ** 2) - 0.6; c.line(31.5 - half, y, 31.5 + half, y, 'J', 1, false); }
  for (const y of [24.7, 32.5]) rivets(c, 31.5 - w * 0.66, y, 31.5 + w * 0.66, y, 5, false);
  seam(c, [[31.5 - w * 0.5, 24.4], [31.5 - w * 0.58, 33]]); // plate joints
  CHEST[(n >>> 3) % CHEST.length](c);
  seam(c, [[31.5 - w + 2.4, 25], [31.5 - w + 1.6, 29.5], [31.5 - w + 2.6, 33]]); // plate edges
  for (const y of [25.5, 31.5]) rivet(c, 31.5 - w + 1.5, y);
  if (!rig.scythes) pipe(c, [[X(32.5 - w), 33.5], [X(19.5), 37], [X(12.5), 35.6]], 'V'); // the purple, piped to the working arm
  // shoulders, capped in its own shell
  const p = rig.pauldron || 1;
  shellCap(c, L, X(32 - w), 24, 5 * p, 4 * p, false); shellCap(c, L, X(31 + w), 24.6, 4 * p, 3.4 * p, false);
  if (rig.pauldron) for (const x of [X(32 - w), X(31 + w)]) c.poly([[x - 3, 21], [x, 18], [x + 3, 21], [x, 20]], 'A', false); // a shield bug wears its shoulders high
  c.line(31.5, 19, 31.5, 22, 'M', 5, false); c.ell(31.5, 21.8, 4.6, 1.7, 'J', false); // neck and collar
}

// Stage three: a frame built for the kind of bug it was. `sx`: where the shoulders sit; `sr` how big; `ct`, `cb`:
// half the chest's width at the top and at the bottom; `wr` waist; `hip`; `ua`, `fa`, `th`, `sh`: how thick the upper
// arm, forearm, thigh and shin are.
const BUILD = {
  beetle: { sx: 11, sr: 8.5, ct: 17.5, cb: 7.5, wr: 6.5, hip: 8, ua: 10, fa: 9, th: 9, sh: 6, back: 'wheel' },
  shield: { sx: 10.5, sr: 9.5, ct: 18.5, cb: 9, wr: 7.5, hip: 9, ua: 10, fa: 9, th: 9, sh: 7, back: 'stack', crest: true },
  weevil: { sx: 13, sr: 7.5, ct: 16, cb: 8.5, wr: 7, hip: 8, ua: 8, fa: 9, th: 8, sh: 6, back: 'stack' },
  crawler: { sx: 14.5, sr: 6.5, ct: 14.5, cb: 6, wr: 5, hip: 7, ua: 7, fa: 6, th: 7, sh: 5, back: 'mast', arms4: true },
  hopper: { sx: 14, sr: 6.5, ct: 14.5, cb: 6.5, wr: 5.5, hip: 8.5, ua: 7, fa: 7, th: 10, sh: 5, back: 'wheel', digi: true },
  mantis: { sx: 16.5, sr: 5.5, ct: 12.5, cb: 5, wr: 4, hip: 6, ua: 5, fa: 4, th: 6, sh: 4, back: 'mast', scythes: true },
  flier: { sx: 15.5, sr: 6, ct: 13.5, cb: 5.5, wr: 4.5, hip: 6.5, ua: 6, fa: 6, th: 7, sh: 5, back: 'none', wings: true },
  aquatic: { sx: 13, sr: 7.5, ct: 16, cb: 9.5, wr: 8, hip: 8.5, ua: 8, fa: 8, th: 8, sh: 6, back: 'tanks', fins: true },
  larva: { sx: 14, sr: 7, ct: 15, cb: 10, wr: 8.5, hip: 9, ua: 8, fa: 8, th: 9, sh: 7, back: 'stack', rolls: true },
};

function stageThree(c, L, kit, flip) {
  const plan = planOf(L), n = hash(L.id), S = BUILD[plan], { sx, ct, cb } = S, X = (x) => (flip ? 63 - x : x), d = flip ? -1 : 1;
  const hipX = 31.5 - S.hip * 0.42, knee = 31.5 - S.hip * 0.92, wear = outfitOf(L.id), o = solo(c);
  if (S.wings) ownBody(c, L, kit, { w: 70, h: 46, mid: 27, limb: 'none', most: 1.12 }); // its wings, still on its back
  BACK[S.back](c, n);

  if (S.digi) { // a hopper's legs bend the other way, and are mostly thigh
    c.poly([[knee - 7, 61], [knee - 6, 58], [knee + 1, 56], [knee + 6, 58], [knee + 6, 61]], 'M'); c.line(knee - 5, 60, knee + 4, 60, 'J', 2);
    c.line(knee - 4, 47, knee + 2, 56, 'M', S.sh); c.line(knee - 2.6, 48.5, knee + 1.6, 54.5, 'J', 2);
    c.line(hipX + 1, 40, knee - 4, 46, 'M', S.th); c.line(hipX, 41.5, knee - 3, 45.5, 'J', 3);
    c.ell(knee - 4.5, 46.6, 4.4, 4, 'D'); c.ell(knee - 4.5, 46.6, 2.4, 2.4, 'J'); c.sym(Math.round(knee - 4.5), 47, 'o');
  } else {
    c.poly([[knee - 11, 61], [knee - 9, 57], [knee - 5, 55], [knee + 3, 55], [knee + 5, 58], [knee + 5, 61]], 'M'); c.line(knee - 9, 60, knee + 3, 60, 'J', 2);
    if (S.fins) c.poly([[knee - 11, 61], [knee - 16, 59.5], [knee - 15, 57], [knee - 9, 57.5]], 'K'); // flippers
    else { c.line(knee - 6, 60, knee - 6, 61, 'o'); c.line(knee - 2, 60, knee - 2, 61, 'o'); }
    c.line(knee - 1, 55, knee, 49, 'M', S.sh); c.line(knee - 2, 54, knee - 1, 50, 'J', 2);
    c.line(knee + 1, 47, hipX, 40, 'M', S.th); c.line(knee + 1, 46, hipX - 1, 41, 'J', 3);
    if (S.th >= 7) { c.line(knee + 0.4, 45.4, hipX - 1.6, 41.4, 'B', S.th - 5); c.line(knee - 0.6, 45.8, knee + S.th - 5.6, 45.8, 'A', 1); } // a thigh plate of its own shell
    c.ell(knee, 48, 4.5, 4, 'D'); c.ell(knee, 48, 2.5, 2.5, 'J'); c.sym(Math.round(knee), 48, 'o');
    c.ell(knee - 1, 55, 1.7, 1.3, 'J'); seam(c, [[knee - 8.8, 58.2], [knee - 5.4, 56.3], [knee + 2.6, 56.3], [knee + 4.2, 58.4]]); // an ankle pin, and the toe cap
    seam(c, [[knee - 3.4, 52.4], [knee + 1.8, 51.8]]); rivet(c, hipX, 40.8);
    if (S.rolls) for (const [x, y] of [[knee - 0.4, 52], [knee + 2.2, 43.6]]) c.line(x - S.sh / 2, y, x + S.sh / 2, y, 'K', 1); // a grub is rings all the way down
  }
  // hips, then the winch drum it has for a waist, with the purple in a glass at the buckle
  c.poly([[33 - S.hip, 37], [30 + S.hip, 37], [32 + S.hip, 41], [31 - S.hip, 41]], 'M', false);
  rivet(c, 34 - S.hip, 38.2); rivet(c, 33.4 - S.hip, 40);
  c.ell(31.5, 34, S.wr, 4, 'D', false);
  for (const y of [32, 34, 36]) c.line(32.5 - S.wr, y, 30.5 + S.wr, y, 'J', 1, false);
  c.ell(31.5, 34.4, 2.3, 2.9, 'J', false); c.ell(31.5, 34.4, 1.4, 2, 'V', false);
  c.poly([[28.6, 37.4], [34.4, 37.4], [33.6, 41.6], [31.5, 43.6], [29.4, 41.6]], 'B', false); c.line(29.6, 38.6, 33.4, 38.6, 'A', 1, false); // a tasset of shell
  c.line(31.5, 18, 31.5, 24, 'M', Math.min(8, Math.round(ct / 2)), false); // neck

  if (S.arms4) { // six limbs: an ant keeps a second pair of arms
    c.line(30.5 - cb, 30, 26 - cb, 36, 'M', 4); c.line(26 - cb, 36, 27 - cb, 42, 'M', 3); c.ell(26 - cb, 36, 2, 2, 'J');
    c.line(27 - cb, 42, 25 - cb, 45, 'M', 2); c.line(27 - cb, 42, 29.4 - cb, 45, 'M', 2);
  }
  if (S.scythes) { // a mantis folds its arms: down to the elbow, back up, and the blade hanging from the wrist
    c.line(sx, 26, sx - 1, 36, 'M', S.ua); c.line(sx - 1, 36, sx - 7.5, 27, 'M', S.fa);
    c.ell(sx - 1, 37, 2.8, 2.8, 'D'); c.ell(sx - 1, 37, 1.6, 1.6, 'J');
    c.poly([[sx - 10, 26], [sx - 5.6, 26.6], [sx - 4.6, 36], [sx - 6, 49], [sx - 9, 39]], 'M'); c.ell(sx - 7.6, 27.4, 2.2, 2.2, 'J');
    for (const y of [31, 34.5, 38, 41.5]) c.put(sx - 5.4 - (y - 31) * 0.04, y, 'A');
    seam(c, [[sx - 8, 29.5], [sx - 6.8, 38], [sx - 6.4, 46]]);
  } else {
    c.line(sx - 1, 27, sx - 3, 36, 'M', S.ua); // biceps: a bundle of pistons
    c.line(sx - 3, 28, sx - 4, 35, 'J', 2); c.line(sx + 1, 28, sx, 35, 'J', 2); seam(c, [[sx - 0.6, 28], [sx - 1.8, 35.6]]);
    c.line(sx - 4, 39, sx - 5, 47, 'M', S.fa); c.line(sx - 5, 40, sx - 6, 46, 'J', 2);
    c.line(sx - 5.6, 41.5, sx - 6.2, 45, 'B', Math.max(3, S.fa - 4)); c.line(sx - 4.6 - S.fa / 2, 46.4, sx - 6.4 + S.fa / 2, 46.4, 'A', 1); // a vambrace of its own shell
    c.ell(sx - 4, 38, S.ua / 2, 4, 'D'); c.ell(sx - 4, 38, 2.5, 2.5, 'J'); c.sym(Math.round(sx - 4), 38, 'o');
    seam(c, [[sx - 3.4 - S.fa / 2, 40.8], [sx - 5.4 + S.fa / 2, 40.8]]);
    if (S.rolls) for (const [x, y] of [[sx - 2, 31.5], [sx - 4.5, 43]]) c.line(x - S.fa / 2, y, x + S.fa / 2, y, 'K', 1);
  }

  // the chest: a wedge of plate from shoulder to shoulder, and its own shell bolted on for a breastplate
  c.poly([[31.5 - ct, 21], [31.5 + ct, 21], [31.5 + ct, 28], [31.5 + cb, 33], [31.5 - cb, 33], [31.5 - ct, 28]], 'M', false);
  seam(c, [[31.5 - ct + 1.5, 27.6], [31.5 - cb + 0.5, 32]]);
  rivets(c, 37 - ct, 22.2, 27.5, 22.2, 4);
  if (S.wings) CHEST[(n >>> 3) % CHEST.length](c); // its wings are behind it, so the chest carries an instrument instead
  else ownBody(c, L, kit, { w: ct * 2 - 11, h: 11, mid: 26.8, limb: 'none', most: 0.6 });
  rivet(c, 31.5 - ct + 2.5, 22.6); rivet(c, 31.5 - cb + 1, 31.4);
  wear.under?.(c, o, S, X);
  // shoulder housings, capped in shell
  c.ell(sx, 23, S.sr, S.sr - 1, 'M'); shellCap(c, L, sx, 21, S.sr - 2, S.sr - 4); c.sym(Math.round(sx), 27, 'J');
  if (S.crest) c.poly([[sx - 4, 18], [sx, 13.5], [sx + 4, 18], [sx, 16.5]], 'A'); // a shield bug wears its shoulders high
  seam(c, [[sx - S.sr + 1.5, 25], [sx, 26.6], [sx + S.sr - 1.5, 25]]);
  for (const a of [0.22, 0.5, 0.78]) rivet(c, sx - Math.cos(a * Math.PI) * (S.sr - 1.3), 23 + Math.sin(a * Math.PI) * (S.sr - 2.3));
  wear.over?.(c, o, S, X);

  if (!S.scythes) {
    const hand = sx - 5, tool = toolOf(plan, n);
    c.ell(X(63 - hand), 50, 5.5, 5, 'M', false); c.line(X(63 - hand) - 3, 51, X(63 - hand) + 3, 51, 'J', 2, false); // a fist
    seam(c, [[X(63 - hand) - 3, 48.4], [X(63 - hand) + 3, 48.4]], false);
    for (const k of [-1.9, 0, 1.9]) seam(c, [[X(63 - hand) + k, 52.4], [X(63 - hand) + k, 54.4]], false); // knuckles
    TOOLS[tool](c, X(hand), tool === 'claw' ? 48 : 46.5, d);
    pipe(c, [[X(31.5 - cb), 31.5], [X(sx + 3.5), 33.5], [X(sx - 1.5), 40], [X(hand + 1), 45.5]], 'V'); // the purple, piped to the working hand
    wear.prop?.(o, X(63 - hand), d);
  }
}

function crookedFrame(c) {
  c.line(30, 37, 23, 49, 'M', 4, false);
  c.ell(23, 49, 3.5, 3, 'J', false);
  c.line(23, 50, 23, 57, 'M', 4, false);
  c.line(23, 56, 17, 60, 'D', 4, false);
  c.line(35, 38, 38, 47, 'M', 5, false);
  c.ell(38, 47, 3.5, 3, 'J', false);
  c.line(38, 48, 37, 57, 'M', 4, false);
  c.line(37, 58, 43, 59, 'D', 4, false);
  c.line(32, 20, 35, 30, 'M', 5, false);
  c.line(34, 26, 30, 38, 'M', 6, false);
  c.line(36, 26, 35, 37, 'J', 3, false);
  c.poly([[27, 34], [37, 36], [39, 40], [29, 42], [26, 39]], 'B', false);
  c.line(29, 24, 22, 32, 'M', 4, false);
  c.line(22, 32, 19, 39, 'M', 3, false);
  c.ell(22, 32, 2, 2, 'J', false);
  c.line(19, 39, 16, 43, 'D', 2, false);
  c.line(19, 40, 20, 44, 'M', 2, false);
  c.line(37, 24, 46, 31, 'M', 5, false);
  c.ell(46, 31, 3.5, 3, 'J', false);
  c.line(46, 32, 49, 43, 'M', 6, false);
  TOOLS.claw(c, 49, 43, 1, true);
}

function porcelainHead(c) {
  c.line(28, 8, 25, 4, 'D', 2, false);
  c.line(25, 5, 25, 3, 'A', 2, false);
  c.ell(32.5, 11, 9, 7, 'B', false);
  c.poly([[25, 9], [31, 7], [38, 8], [40, 14], [38, 20], [34, 22], [29, 21], [25, 16]], 'P', false);
  c.ell(29, 11, 3.2, 2.8, 'M', false);
  c.ell(36, 12, 2.4, 2.4, 'J', false);
  c.ell(29, 11, 2.2, 1.8, 'E', false);
  c.ell(36, 12, 1.4, 1.4, 'E', false);
  c.put(29, 10, 'G');
  c.put(36, 12, 'G');
  c.put(33, 14, 'M');
  c.poly([[27, 15], [32, 16], [38, 15], [37, 19], [33, 20], [29, 19]], 'o', false);
  for (const x of [28, 30, 32, 34, 36]) c.put(x, x === 32 ? 17 : 16, 'P');
  for (const x of [31, 35]) c.put(x, 19, 'P');
}

/** `L` is the species' look (with its `id`); a botched rebuild has its arms on the wrong sides and a porcelain face over its own. */
export function drawEvolution(c, stage, botched, L, kit) {
  if (stage === 2) stageThree(c, L, kit, botched);
  else if (botched) { ownBody(c, L, kit, { w: 40, h: 30, mid: 33, limb: 'none', most: 0.7 }); crookedFrame(c); } // it still carries its old shell on its back
  else stageTwo(c, L, kit, false);
  const seat = seatHead(c, L, kit); // under the porcelain its feelers and horns still show
  if (botched) porcelainHead(c);
  else if (stage === 2 && seat && !kit.capless) { const at = crownOf(L, kit, seat); if (at) outfitOf(L.id).hat?.(solo(c), at.x, at.y, at.w); } // a hat it was sold goes on instead
}

/**
 * For bug variety (varietyArt.js), Stage II only: just the bug's own body as the machine carries it, placed exactly as
 * drawEvolution places it (to find where its base goes), and the right hand a tool can be put in (null: none free).
 */
export function stageTwoBody(c, botched, L, kit) {
  if (botched) ownBody(c, L, kit, { w: 40, h: 30, mid: 33, limb: 'none', most: 0.7 });
  else ownBody(c, L, kit, { w: 58, h: 37, bottom: 62.4, limb: 'M', most: 0.9 });
}
export const stageTwoHand = (L, botched) => (botched || RIG[planOf(L)].scythes ? null : { x: 50.5, y: 39 });

// v79: the acid "worm": a grotesque low-poly trilobite with a human face. It is flat-shaded and faceted like the faun
// and the bugs. It has an armoured, segmented shell with the classic three lobes (a raised axial ridge between two
// pleural lobes), a wide shield of a head with genal spines sweeping back, and a tail shield. Under it are far too many
// small jointed legs that skitter and twitch as it clings to your goggles. The shell glistens, slimy and pitted, in
// acid green and bile yellow; it oozes drips, and a pale wet fleshy underside shows at the edges. Antennae twitch.
// The uncanny part: two wet human eyes, set too close on the head, follow your finger, and a small human mouth with
// teeth opens and closes on a fleshy lip under the front rim. It moves slightly wrong: two rhythms that never line
// up, a stutter now and then as if the film skipped, and a twitch. Gross but not gory: no blood. Cut it and it
// cracks into shell pieces and loose twitching legs. No DOM here (node --test builds it); WormLayer.js draws it.
//
// Budget per worm: 6 meshes (smear, shell, limbs, eye whites, irises, mouth), at most 520 triangles. Units: it lives
// in a 1×1 box (its on-screen size), +y up the screen (the head end), +z toward the player.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const MAX_TRIS = 520, MAX_MESHES = 6;
const C = (h) => new THREE.Color(h);
const ACID = C('#8fd61c'), ACID_D = C('#5f9a10'), BILE = C('#d9c62c'), GROOVE = C('#2f4a08'), PIT = C('#3f5c0c'),
  FLESH = C('#e8d6b4'), FLESH_W = C('#d7b7a0'), LEG = C('#d9cf9c'), JOINT = C('#6f7a26'), DRIP = C('#c6e83a');

/** Shared materials (one set for every creature): a glossy wet shell, wet limbs, wet eyes. */
export function wormMaterials() {
  return {
    body: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 55, specular: '#a8c860', emissive: '#142a06', side: THREE.DoubleSide }),
    limb: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: '#fff6d0', emissive: '#1c1a08', side: THREE.DoubleSide }),
    smear: new THREE.MeshBasicMaterial({ color: '#8ee63a', transparent: true, opacity: 0.38, depthWrite: false }),
    eye: new THREE.MeshPhongMaterial({ color: '#f3efe6', flatShading: true, shininess: 140, specular: '#ffffff', emissive: '#2a2a22' }),
    iris: new THREE.MeshBasicMaterial({ vertexColors: true }),
    mouth: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  };
}

const tint = (geo, color) => {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
};
const flat = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; };
const part = (geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const g = flat(geo); g.scale(sx, sy, sz); g.translate(x, y, z); return tint(g, C(color)); };

// The shell, row by row from the tail tip (s 0) to the front rim (s 1): half width, height, and what the row is.
// Each thorax segment is a front row and a back row (its back edge pokes out as a pleural spine); between segments
// is a dark groove where the plates overlap.
export const THORAX = 7;
const rows = [{ s: 0, hw: 0.035, h: 0.35, part: 'pyg' }, { s: 0.09, hw: 0.11, h: 0.75, part: 'pyg' }, { s: 0.19, hw: 0.15, h: 0.85, part: 'pyg' }];
for (let k = 0; k < THORAX; k++) {
  const s0 = 0.215 + k * 0.08, hw = 0.165 + k * 0.012;
  rows.push({ s: s0, hw, h: 0.72, part: 'th', seg: k, front: true }, { s: s0 + 0.064, hw: hw * 1.04, h: 1, part: 'th', seg: k, back: true });
}
rows.push({ s: 0.8, hw: 0.255, h: 0.9, part: 'ceph', genal: true }, { s: 0.87, hw: 0.255, h: 1.25, part: 'ceph' }, { s: 0.94, hw: 0.2, h: 1.05, part: 'ceph' }, { s: 1, hw: 0.1, h: 0.45, part: 'ceph', rim: true });
export const SHELL_ROWS = rows;
export const HEAD_ROW = rows.findIndex((r) => r.part === 'ceph');
const LEN = 0.74, ZMAX = 0.075;
// across the shell: edge, pleural lobe, axial furrow, axial ridge (and mirrored)
const U = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1], UZ = [-0.1, 0.5, 0.3, 1, 0.3, 0.5, -0.1];
export const LEG_PAIRS = 9, ANT_SEGS = 4, DRIPS = 3;

/** How wide the shell is along its length (0 tail .. 1 head): a tail shield, a tapering thorax, a wide head shield. */
export function shellHalfWidth(s) {
  for (let i = 1; i < rows.length; i++) if (s <= rows[i].s) { const a = rows[i - 1], b = rows[i], t = (s - a.s) / (b.s - a.s || 1); return a.hw + (b.hw - a.hw) * t; }
  return rows[rows.length - 1].hw;
}

/**
 * The writhe: two rhythms that never line up (2.1 and 3.37 rad/s), a stutter now and then (it freezes for a beat,
 * as if the film skipped) and a twitch (the head snaps aside and creeps back, the legs scrabble). rand: 0..1.
 */
export class Writhe {
  constructor(rand = Math.random, { reduce = false } = {}) {
    this.rand = rand; this.reduce = reduce; this.t = rand() * 20; this.legT = rand() * 10; this.stutter = 0; this.twitch = 0; this.scrabble = 0;
    this.stutters = 0; this.twitches = 0;
  }
  step(dt) {
    if (this.reduce) { this.t += dt * 0.35; this.legT += dt * 0.8; return this; }
    if (this.stutter > 0) this.stutter -= dt; else {
      this.t += dt; this.legT += dt * (5 + this.scrabble * 22);
      if (this.rand() < dt * 0.55) { this.stutter = 0.08 + this.rand() * 0.22; this.stutters++; }
    }
    this.twitch *= Math.exp(-dt * 7); this.scrabble *= Math.exp(-dt * 3);
    if (this.rand() < dt * 0.45) { this.twitch = (this.rand() < 0.5 ? -1 : 1) * (0.5 + this.rand() * 0.5); this.scrabble = 1; this.twitches++; }
    return this;
  }
  /** How the body bends at s (0 tail .. 1 head): a trilobite is stiff, so a slow sway plus the twitch. */
  bend(s) {
    const a = this.reduce ? 0.3 : 1, t = this.t;
    return a * (0.5 * Math.sin(2.1 * t - 3.2 * s) + 0.25 * Math.sin(3.37 * t - 6.1 * s + 1.3)) + this.twitch * s ** 2 * 1.2;
  }
  /** The plates breathe: they part and close up the body, a little out of time with the sway. */
  swell(s) { return 1 + (this.reduce ? 0.03 : 0.1) * Math.sin(2.9 * this.t - 11 * s); }
  /** A leg's angle off its rest pose (i: pair 0 tail .. head, side ±1): a ripple up each side, wilder when it twitches. */
  leg(i, side) {
    const amp = (this.reduce ? 0.12 : 0.3) * (1 + 1.6 * Math.abs(this.twitch));
    return amp * Math.sin(this.legT * 2.2 + i * 0.85 + (side > 0 ? Math.PI : 0)) + (this.reduce ? 0 : 0.15 * this.scrabble * Math.sin(this.legT * 13 + i * 2.7 * side));
  }
  /** Antenna bend (side ±1, segment k): a quiver and a flick on each twitch. */
  antenna(side, k) { return (this.reduce ? 0.1 : 0.25) * Math.sin(this.t * 4.3 + k * 0.9 + side) + this.twitch * side * 0.5 * (k + 1) / ANT_SEGS; }
  /** Mouth: opens a crack and closes, on its own clock. 0..1 */
  mouth() { return Math.max(0, Math.sin(this.t * 1.31 + 0.7)) ** 3; }
  /** A blink every few seconds (it does blink, which is worse). 0 open .. 1 shut */
  blink() { const k = (this.t * 0.27) % 1; return k > 0.965 ? Math.sin((k - 0.965) / 0.035 * Math.PI) : 0; }
}

/** Where every shell row is right now: centre, direction (toward the head), half width, height. Centred in the box. */
export function pose(writhe, out = []) {
  let y = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i) y += (r.s - rows[i - 1].s) * LEN * (r.front ? writhe.swell(r.s) : 1);
    out[i] = { x: 0.035 * writhe.bend(r.s), y, hw: r.hw * (r.part === 'th' ? 1 + 0.03 * Math.sin(writhe.t * 2.3 + i) : 1), h: r.h, dir: Math.PI / 2 };
  }
  for (let i = 0; i < rows.length; i++) { const a = out[Math.max(0, i - 1)], b = out[Math.min(rows.length - 1, i + 1)]; out[i].dir = Math.atan2(b.y - a.y, b.x - a.x); }
  let mx = 0, my = 0; for (const p of out) { mx += p.x; my += p.y; } mx /= rows.length; my /= rows.length;
  for (const p of out) { p.x -= mx; p.y -= my + 0.02; }
  return out;
}

/** Eyes on the glass: where the irises sit (local, ≤ maxOff) to look from the head toward a point. */
export function gaze(head, target, faceAngle, maxOff = 0.011) {
  if (!target) return { x: 0, y: 0 }; // nothing to follow: it stares straight at you
  const dx = target.x - head.x, dy = target.y - head.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const c = Math.cos(-faceAngle), s = Math.sin(-faceAngle), k = Math.min(1, d / 0.6) * maxOff / d;
  return { x: (dx * c - dy * s) * k, y: (dx * s + dy * c) * k };
}

const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const lat = (p) => [Math.sin(p.dir), -Math.cos(p.dir)]; // +u is the creature's right

/** A writer for flat-coloured triangles into position/colour arrays. */
function writer(pos, col, o = 0) {
  return {
    get o() { return o; },
    tri(a, b, c, k) { for (const v of [a, b, c]) { pos[o * 3] = v[0]; pos[o * 3 + 1] = v[1]; pos[o * 3 + 2] = v[2]; col[o * 3] = k.r; col[o * 3 + 1] = k.g; col[o * 3 + 2] = k.b; o++; } },
    quad(a, b, c, d, k) { this.tri(a, c, b, k); this.tri(b, c, d, k); },
  };
}

function shellVertex(p, r, j) {
  const [lx, ly] = lat(p); let w = U[j] * p.hw, back = 0;
  if (r.back && Math.abs(U[j]) === 1) { w *= 1.13; back = 0.022; } // the pleural spine on each segment's back edge
  return [p.x + lx * w - Math.cos(p.dir) * back, p.y + ly * w - Math.sin(p.dir) * back, UZ[j] * p.h * ZMAX];
}

/** Shell triangles for rows [from, to] (a whole creature, or one cracked-off piece of it). */
function shellTriangles(pts, from, to, W) {
  const k = new THREE.Color();
  for (let i = from; i < to; i++) {
    const r = rows[i], n = rows[i + 1], groove = r.back && n.front;
    for (let j = 0; j < U.length - 1; j++) {
      const axial = j === 2 || j === 3, pit = hash(i, j) < 0.2;
      if (groove) k.copy(GROOVE);
      else if (n.rim || r.rim) k.copy(BILE);
      else if (axial) k.copy(BILE).lerp(ACID, r.part === 'ceph' ? 0.15 : 0.45);
      else k.copy(j % 2 ? ACID : ACID_D);
      if (pit && !groove) k.lerp(PIT, 0.7); // pitted, like it's been sitting in acid
      W.quad(shellVertex(pts[i], r, j), shellVertex(pts[i], r, j + 1), shellVertex(pts[i + 1], n, j), shellVertex(pts[i + 1], n, j + 1), k);
    }
    // the pale wet underside, just showing past the edges
    const a = pts[i], b = pts[i + 1], [ax, ay] = lat(a), [bx, by] = lat(b), wa = a.hw * 1.07, wb = b.hw * 1.07;
    W.quad([a.x - ax * wa, a.y - ay * wa, -0.02], [a.x + ax * wa, a.y + ay * wa, -0.02], [b.x - bx * wb, b.y - by * wb, -0.02], [b.x + bx * wb, b.y + by * wb, -0.02], i % 2 ? FLESH : FLESH_W);
  }
  // genal spines: the head shield's corners sweep back past the first segments
  if (to >= HEAD_ROW + 1 && from <= HEAD_ROW) {
    const p = pts[HEAD_ROW], q = pts[HEAD_ROW + 1], back = pts[Math.max(0, HEAD_ROW - 5)];
    for (const side of [-1, 1]) {
      const e = (P, f) => { const [lx, ly] = lat(P); return [P.x + lx * P.hw * side * f, P.y + ly * P.hw * side * f, -0.005]; };
      const b0 = e(p, 1), b1 = e(q, 1), tip = e(back, 1.38), ridge = [(b0[0] + b1[0]) / 2 - side * 0.02 * 0, (b0[1] + b1[1]) / 2, 0.03];
      W.tri(b0, ridge, tip, BILE); W.tri(ridge, b1, tip, ACID_D);
    }
  }
  return W.o;
}
const shellVertexCount = (from, to) => (to - from) * ((U.length - 1) * 6 + 6) + (to >= HEAD_ROW + 1 && from <= HEAD_ROW ? 12 : 0);

// Limbs: legs along both sides, two antennae, and drips of ooze. All in one mesh, rebuilt each frame.
const legRows = () => { const out = [1]; for (let k = 0; k < THORAX; k++) out.push(3 + k * 2 + 1); out.push(HEAD_ROW + 1); return out; };
const LEG_AT = legRows(); // one pair per tail shield, thorax segment and head shield: nine pairs
function segment(W, a, b, wa, wb, k) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  W.quad([a[0] + nx * wa, a[1] + ny * wa, a[2]], [a[0] - nx * wa, a[1] - ny * wa, a[2] + wa], [b[0] + nx * wb, b[1] + ny * wb, b[2]], [b[0] - nx * wb, b[1] - ny * wb, b[2] + wb], k);
}
function legGeometry(W, pts, writhe, i, side) {
  const p = pts[LEG_AT[i]], [lx, ly] = lat(p), fx = Math.cos(p.dir), fy = Math.sin(p.dir);
  const rest = (i / (LEG_PAIRS - 1) - 0.45) * 1.3; // front legs reach forward, back legs trail
  const a = rest + writhe.leg(i, side), ca = Math.cos(a), sa = Math.sin(a);
  const out = [(lx * ca + fx * sa) * side, (ly * ca + fy * sa) * side];
  const root = [p.x + lx * side * p.hw * 0.6, p.y + ly * side * p.hw * 0.6, -0.03];
  const L1 = p.hw * 0.4 + 0.07, knee = [root[0] + out[0] * L1, root[1] + out[1] * L1, 0.02];
  const b = a - 0.9 - 0.3 * Math.sin(writhe.legT * 2.2 + i), cb = Math.cos(b), sb = Math.sin(b);
  const out2 = [(lx * cb + fx * sb) * side, (ly * cb + fy * sb) * side], foot = [knee[0] + out2[0] * 0.07, knee[1] + out2[1] * 0.07, 0];
  segment(W, root, knee, 0.012, 0.008, LEG); segment(W, knee, foot, 0.008, 0.002, JOINT);
}
function limbTriangles(pts, writhe, drips, W) {
  for (let i = 0; i < LEG_PAIRS; i++) for (const side of [-1, 1]) legGeometry(W, pts, writhe, i, side);
  const f = pts[rows.length - 1], [lx, ly] = lat(f);
  for (const side of [-1, 1]) { // antennae: thin whips off the front rim
    let a = f.dir - side * 0.35, P = [f.x + lx * side * 0.05, f.y + ly * side * 0.05, 0.01];
    for (let k = 0; k < ANT_SEGS; k++) { a += writhe.antenna(side, k) - side * 0.12; const Q = [P[0] + Math.cos(a) * 0.045, P[1] + Math.sin(a) * 0.045, 0.01]; segment(W, P, Q, 0.006 * (1 - k / ANT_SEGS) + 0.002, 0.005 * (1 - (k + 1) / ANT_SEGS) + 0.0015, k % 2 ? JOINT : LEG); P = Q; }
  }
  for (const d of drips) { // ooze: a drip stretches off the shell's edge, lets go, falls and shrinks
    const p = pts[d.row], [dx, dy] = lat(p), ph = ((writhe.t + d.phase) / d.period) % 1;
    const top = [p.x + dx * d.side * p.hw * 1.02, p.y + dy * d.side * p.hw * 1.02, 0.01];
    const r = ph < 0.8 ? 0.008 + 0.012 * ph / 0.8 : 0.02 * (1 - (ph - 0.8) / 0.2), fall = ph < 0.8 ? 0 : (ph - 0.8) * 0.9, len = 0.015 + 0.06 * Math.min(1, ph / 0.8);
    const c = [top[0], top[1] - len - fall, 0.012], start = ph < 0.8 ? top : [c[0], c[1] + r * 1.4, c[2]], bot = [c[0], c[1] - r * 1.3, c[2]];
    const ring = [0, 1, 2].map((k) => [c[0] + Math.cos(k * 2.09) * r, c[1], c[2] + Math.sin(k * 2.09) * r]);
    for (let k = 0; k < 3; k++) { W.tri(start, ring[k], ring[(k + 1) % 3], DRIP); W.tri(ring[k], bot, ring[(k + 1) % 3], BILE); }
  }
  return W.o;
}
const LIMB_VERTS = (LEG_PAIRS * 2 * 2 + 2 * ANT_SEGS) * 6 + DRIPS * 18;

/** The face: eye whites, irises (moved together to look) and the mouth, each one merged geometry centred on itself. */
function faceGeometries() {
  const E = 0.026, gap = 0.05; // eyes a bit too close together, like a person drawn from memory
  const eyes = mergeGeometries([part(new THREE.IcosahedronGeometry(E, 0), '#fff', -gap / 2, 0, 0.012, 1, 0.82, 0.7), part(new THREE.IcosahedronGeometry(E, 0), '#fff', gap / 2, 0, 0.012, 1, 0.82, 0.7)]);
  const iris = [];
  for (const x of [-gap / 2, gap / 2]) {
    iris.push(part(new THREE.CircleGeometry(E * 0.62, 8), '#6b8a3a', x, 0, 0.032)); // a hazel-green human iris
    iris.push(part(new THREE.CircleGeometry(E * 0.3, 6), '#050505', x, 0, 0.033));
    iris.push(part(new THREE.CircleGeometry(E * 0.13, 4), '#ffffff', x + E * 0.22, E * 0.22, 0.034)); // the wet glint
  }
  // the mouth sits on a pale fleshy lip that bulges out under the front rim; it's upside down to you, which is worse
  const mouth = [part(new THREE.CircleGeometry(0.036, 8), '#e2c6ae', 0, 0, 0.0, 1, 0.62, 1),
    part(new THREE.RingGeometry(0.017, 0.026, 8, 1), '#b8807a', 0, 0, 0.004, 1, 0.5, 1),
    part(new THREE.CircleGeometry(0.019, 8), '#2a0808', 0, 0, 0.003, 1, 0.42, 1)];
  const tooth = (x, y, down, k) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x - 0.0042, y, 0.006, x + 0.0042, y, 0.006, x, y + down * 0.0085, 0.006], 3)); return tint(g, C(k)); };
  for (let k = 0; k < 4; k++) mouth.push(tooth(-0.0135 + k * 0.009, 0.0075, -1, '#efe6c8'));
  for (let k = 0; k < 3; k++) mouth.push(tooth(-0.009 + k * 0.009, -0.0075, 1, '#ddd0a6'));
  return { eyes, iris: mergeGeometries(iris), mouth: mergeGeometries(mouth) };
}
/** A slime smear on the glass: an irregular faceted blob. */
function smearGeometry(rand) {
  const n = 11, pos = [];
  const pts = Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2, r = 0.36 + rand() * 0.14; return [Math.cos(a) * r, Math.sin(a) * r * 0.9]; });
  for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; pos.push(0, 0, -0.05, a[0], a[1], -0.05, b[0], b[1], -0.05); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
const dynamic = (n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); return g; };

/** One creature: a group sized to its on-screen box, with update() for the writhe and pieces() for the knife. */
export function buildWorm(mats, { rand = Math.random, reduce = false } = {}) {
  const group = new THREE.Group(), writhe = new Writhe(rand, { reduce });
  const smear = new THREE.Mesh(smearGeometry(rand), mats.smear); smear.renderOrder = 0; group.add(smear);
  const geo = dynamic(shellVertexCount(0, rows.length - 1)), body = new THREE.Mesh(geo, mats.body); body.frustumCulled = false; group.add(body);
  const lgeo = dynamic(LIMB_VERTS), limbs = new THREE.Mesh(lgeo, mats.limb); limbs.frustumCulled = false; group.add(limbs);
  const drips = Array.from({ length: DRIPS }, () => ({ row: 3 + Math.floor(rand() * THORAX) * 2 + 1, side: rand() < 0.5 ? -1 : 1, phase: rand() * 4, period: 2.2 + rand() * 1.8 }));
  const f = faceGeometries(), face = new THREE.Group();
  const eyes = new THREE.Mesh(f.eyes, mats.eye), iris = new THREE.Mesh(f.iris, mats.iris), mouth = new THREE.Mesh(f.mouth, mats.mouth);
  const lids = new THREE.Group(); lids.add(eyes, iris); mouth.position.y = 0.075; face.add(lids, mouth); group.add(face);
  let pts = [];
  const api = {
    group, writhe, body, limbs, face, smear,
    /** Advance the writhe by dt seconds; target: where to look (box-local), or null to stare at you. */
    update(dt, target = null) {
      writhe.step(dt); pts = pose(writhe, pts);
      shellTriangles(pts, 0, rows.length - 1, writer(geo.attributes.position.array, geo.attributes.color.array));
      limbTriangles(pts, writhe, drips, writer(lgeo.attributes.position.array, lgeo.attributes.color.array));
      for (const g of [geo, lgeo]) { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
      const h = pts[HEAD_ROW + 1], ang = h.dir - Math.PI / 2;
      face.position.set(h.x, h.y, ZMAX * h.h + 0.012); face.rotation.z = ang; face.scale.setScalar(2.2);
      const g = gaze(h, target, ang); iris.position.set(g.x, g.y, 0);
      lids.scale.y = 1 - 0.9 * writhe.blink(); mouth.scale.y = 0.7 + writhe.mouth() * 1.2;
      return api;
    },
    /** Head position (box-local) for the eyes. */
    head() { return pts[HEAD_ROW + 1] || { x: 0, y: 0 }; },
    /**
     * The knife: it cracks into shell pieces (tail shield, three runs of segments, the head shield, which keeps its
     * face) and loose legs that keep twitching.
     */
    pieces() {
      const grab = (n, fill, at) => { const g = dynamic(n); fill(writer(g.attributes.position.array, g.attributes.color.array)); g.translate(-at.x, -at.y, 0); return g; };
      const cuts = [[0, 3], [3, 7], [7, 11], [11, HEAD_ROW], [HEAD_ROW, rows.length - 1]];
      const shell = cuts.map(([a, b], i) => { const mid = pts[Math.floor((a + b) / 2)]; return { geometry: grab(shellVertexCount(a, b), (W) => shellTriangles(pts, a, b, W), mid), x: mid.x, y: mid.y, head: i === cuts.length - 1, leg: false }; });
      const legs = [[1, -1], [3, 1], [5, -1], [7, 1]].map(([i, side]) => {
        const p = pts[LEG_AT[i]], [lx, ly] = lat(p), at = { x: p.x + lx * side * p.hw, y: p.y + ly * side * p.hw };
        return { geometry: grab(12, (W) => legGeometry(W, pts, writhe, i, side), at), x: at.x, y: at.y, head: false, leg: true };
      });
      return [...legs, ...shell];
    },
    dispose() { geo.dispose(); lgeo.dispose(); smear.geometry.dispose(); f.eyes.dispose(); f.iris.dispose(); f.mouth.dispose(); },
  };
  return api.update(0);
}

/** Triangles a creature draws (for the budget). */
export function wormTriangles(w) {
  let t = 0; w.group.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t;
}

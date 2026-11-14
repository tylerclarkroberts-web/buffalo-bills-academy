// v79: the acid worm, low-poly and a little too human. Flat-shaded and faceted like the faun and the bugs: a
// hexagonal segmented body that writhes slightly wrong (two rhythms that never line up, now and then a stutter
// or a twitch), a sickly translucent acid-green skin, two wet human eyes set a bit too close that follow your
// finger, and a small human mouth with a neat row of teeth. It presses against your goggles like glass, leaving a
// smear. Cut it and it comes apart in faceted chunks. No DOM here (node --test builds it); WormLayer.js draws it.
//
// Budget per worm: 5 meshes (smear, body, eye whites, irises, mouth), well under 400 triangles. Units: the worm
// lives in a 1×1 box (its on-screen size), +y up the screen, +z toward the player.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const RINGS = 12, SIDES = 6, BODY_LEN = 0.74;
export const MAX_TRIS = 400, MAX_MESHES = 5;
const SKIN = new THREE.Color('#9be22e'), BAND = new THREE.Color('#4f8f12'), FLESH = new THREE.Color('#c9d99a');

/** Shared materials (one set for every worm): the body is see-through and wet. */
export function wormMaterials() {
  return {
    body: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.9, shininess: 80, specular: '#e8ffb0', emissive: '#16300a', side: THREE.DoubleSide, forceSinglePass: true }), // forceSinglePass: one draw call on phones, not two
    smear: new THREE.MeshBasicMaterial({ color: '#7dff3a', transparent: true, opacity: 0.38, depthWrite: false }),
    eye: new THREE.MeshPhongMaterial({ color: '#f3efe6', flatShading: true, shininess: 140, specular: '#ffffff', emissive: '#2a2a22' }),
    iris: new THREE.MeshBasicMaterial({ vertexColors: true }),
    mouth: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
}

const tint = (geo, color) => {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
};
const flat = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; };
const part = (geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const g = flat(geo); g.scale(sx, sy, sz); g.translate(x, y, z); return tint(g, new THREE.Color(color)); };

/** How fat the body is along its length (0 tail .. 1 head): a thin tail, a swollen middle, a neck, a big head. */
export function ringRadius(s) {
  return 0.02 + 0.065 * Math.sin(Math.min(s, 0.75) / 0.75 * Math.PI / 2) ** 0.8 - 0.014 * Math.exp(-(((s - 0.86) / 0.04) ** 2)) + (s > 0.88 ? 0.03 * Math.sin((s - 0.88) / 0.12 * Math.PI / 2) : 0);
}

/**
 * The writhe: two rhythms that never line up (2.1 and 3.37 rad/s), a stutter now and then (it freezes for a beat,
 * as if the film skipped) and a twitch (the head snaps aside and creeps back). rand: 0..1.
 */
export class Writhe {
  constructor(rand = Math.random, { reduce = false } = {}) {
    this.rand = rand; this.reduce = reduce; this.t = rand() * 20; this.stutter = 0; this.twitch = 0; this.stutters = 0; this.twitches = 0;
  }
  step(dt) {
    if (this.reduce) { this.t += dt * 0.35; return this; }
    if (this.stutter > 0) this.stutter -= dt; else {
      this.t += dt;
      if (this.rand() < dt * 0.55) { this.stutter = 0.08 + this.rand() * 0.22; this.stutters++; }
    }
    this.twitch *= Math.exp(-dt * 7);
    if (this.rand() < dt * 0.45) { this.twitch = (this.rand() < 0.5 ? -1 : 1) * (0.5 + this.rand() * 0.5); this.twitches++; }
    return this;
  }
  /** Where the spine bends at s (0 tail .. 1 head), in radians. */
  bend(s) {
    const a = this.reduce ? 0.35 : 1, t = this.t;
    return a * (0.85 * Math.sin(2.1 * t - 5.2 * s) + 0.35 * Math.sin(3.37 * t - 9.1 * s + 1.3)) * (0.35 + s * 0.65) + this.twitch * s ** 3 * 1.4;
  }
  /** Peristalsis: bulges creeping up the body, a little out of time with the bend. */
  swell(s) { return 1 + (this.reduce ? 0.04 : 0.13) * Math.sin(2.9 * this.t - 11 * s); }
  /** Mouth: opens a crack and closes, on its own clock. 0..1 */
  mouth() { return Math.max(0, Math.sin(this.t * 1.31 + 0.7)) ** 3; }
  /** A blink every few seconds (it does blink, which is worse). 0 open .. 1 shut */
  blink() { const k = (this.t * 0.27) % 1; return k > 0.965 ? Math.sin((k - 0.965) / 0.035 * Math.PI) : 0; }
}

/** Spine points and tangents from tail to head for the current writhe, centred in the box. */
export function spine(writhe, out = []) {
  const step = BODY_LEN / (RINGS - 1);
  let x = 0, y = 0, a = Math.PI / 2.6; // the tail starts low left; the body climbs up and right
  for (let i = 0; i < RINGS; i++) {
    const s = i / (RINGS - 1);
    const dir = a + writhe.bend(s) * 0.55;
    out[i] = { x, y, dir, r: ringRadius(s) * writhe.swell(s) };
    x += Math.cos(dir) * step; y += Math.sin(dir) * step;
    a += 0.08;
  }
  // centre on the box (nudged down so the face stays on screen)
  let mx = 0, my = 0; for (const p of out) { mx += p.x; my += p.y; } mx /= RINGS; my /= RINGS;
  for (const p of out) { p.x -= mx; p.y -= my + 0.05; }
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

/** Body triangles for rings [from, to] (a whole worm, or one chunk of it), written into `pos`/`col`. */
function bodyTriangles(pts, from, to, pos, col, o = 0) {
  const ring = (p, k) => { const a = (k / SIDES) * Math.PI * 2 + 0.3, nx = -Math.sin(p.dir), ny = Math.cos(p.dir);
    return [p.x + nx * Math.cos(a) * p.r, p.y + ny * Math.cos(a) * p.r, Math.sin(a) * p.r * 0.75 + p.r * 0.2]; };
  const put = (v, c) => { pos[o * 3] = v[0]; pos[o * 3 + 1] = v[1]; pos[o * 3 + 2] = v[2]; col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; o++; };
  const tmp = new THREE.Color();
  for (let i = from; i < to; i++) {
    const s = i / (RINGS - 1); tmp.copy(i % 2 ? BAND : SKIN).lerp(FLESH, Math.max(0, (s - 0.8) / 0.2) * 0.75);
    for (let k = 0; k < SIDES; k++) {
      const a = ring(pts[i], k), b = ring(pts[i], (k + 1) % SIDES), c = ring(pts[i + 1], k), d = ring(pts[i + 1], (k + 1) % SIDES);
      put(a, tmp); put(c, tmp); put(b, tmp); put(b, tmp); put(c, tmp); put(d, tmp);
    }
  }
  // caps: a blunt tail and a round crown on the head
  for (const [i, sign] of [[from, -1], [to, 1]]) {
    const p = pts[i], tip = [p.x + Math.cos(p.dir) * p.r * 0.9 * sign, p.y + Math.sin(p.dir) * p.r * 0.9 * sign, p.r * 0.2];
    const c = i === RINGS - 1 ? FLESH : (i % 2 ? BAND : SKIN);
    for (let k = 0; k < SIDES; k++) { const a = ring(p, k), b = ring(p, (k + 1) % SIDES); if (sign > 0) { put(a, c); put(b, c); put(tip, c); } else { put(b, c); put(a, c); put(tip, c); } }
  }
  return o;
}
export const bodyVertexCount = (from, to) => ((to - from) * SIDES * 6) + 2 * SIDES * 3;

/** The face: eye whites, irises (moved together to look) and the mouth with teeth, each one merged geometry. */
function faceGeometries() {
  const E = 0.026, gap = 0.05; // eyes a bit too close together, like a person drawn from memory
  const eyes = mergeGeometries([part(new THREE.IcosahedronGeometry(E, 0), '#fff', -gap / 2, 0.025, 0.012, 1, 0.82, 0.7), part(new THREE.IcosahedronGeometry(E, 0), '#fff', gap / 2, 0.025, 0.012, 1, 0.82, 0.7)]);
  const iris = [];
  for (const x of [-gap / 2, gap / 2]) {
    iris.push(part(new THREE.CircleGeometry(E * 0.62, 8), '#6b8a3a', x, 0.025, 0.032)); // a hazel-green human iris
    iris.push(part(new THREE.CircleGeometry(E * 0.3, 6), '#050505', x, 0.025, 0.033));
    iris.push(part(new THREE.CircleGeometry(E * 0.13, 4), '#ffffff', x + E * 0.22, 0.025 + E * 0.22, 0.034)); // the wet glint
  }
  const mouth = [part(new THREE.TorusGeometry(0.024, 0.0075, 3, 8), '#b8807a', 0, -0.042, 0.03, 1, 0.5, 0.6),
    part(new THREE.CircleGeometry(0.022, 8), '#2a0808', 0, -0.042, 0.028, 1, 0.42, 1)];
  for (let k = 0; k < 4; k++) mouth.push(part(new THREE.BoxGeometry(0.008, 0.008, 0.004), '#efe6c8', -0.0135 + k * 0.009, -0.038, 0.031));
  for (let k = 0; k < 3; k++) mouth.push(part(new THREE.BoxGeometry(0.008, 0.007, 0.004), '#e4dab8', -0.009 + k * 0.009, -0.0465, 0.031));
  return { eyes, iris: mergeGeometries(iris), mouth: mergeGeometries(mouth) };
}
/** A slime smear on the glass: an irregular faceted blob. */
function smearGeometry(rand) {
  const n = 11, pos = [];
  const pts = Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2, r = 0.36 + rand() * 0.14; return [Math.cos(a) * r, Math.sin(a) * r * 0.9]; });
  for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; pos.push(0, 0, -0.05, a[0], a[1], -0.05, b[0], b[1], -0.05); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

/** One worm: a group sized to its on-screen box, with update() for the writhe and pieces() for the knife. */
export function buildWorm(mats, { rand = Math.random, reduce = false } = {}) {
  const group = new THREE.Group(), writhe = new Writhe(rand, { reduce });
  const smear = new THREE.Mesh(smearGeometry(rand), mats.smear); smear.renderOrder = 0; group.add(smear);
  const n = bodyVertexCount(0, RINGS - 1), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const body = new THREE.Mesh(geo, mats.body); body.renderOrder = 1; body.frustumCulled = false; group.add(body);
  const f = faceGeometries(), face = new THREE.Group();
  const eyes = new THREE.Mesh(f.eyes, mats.eye), iris = new THREE.Mesh(f.iris, mats.iris), mouth = new THREE.Mesh(f.mouth, mats.mouth);
  const lids = new THREE.Group(); lids.add(eyes, iris); face.add(lids, mouth); face.renderOrder = 2; group.add(face);
  let pts = [];
  const api = {
    group, writhe, body, face, smear,
    /** Advance the writhe by dt seconds; target: where to look (box-local), or null to stare at you. */
    update(dt, target = null) {
      writhe.step(dt); pts = spine(writhe, pts);
      bodyTriangles(pts, 0, RINGS - 1, geo.attributes.position.array, geo.attributes.color.array);
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      const h = pts[RINGS - 1], ang = h.dir - Math.PI / 2;
      face.position.set(h.x - Math.cos(h.dir) * h.r * 0.05, h.y - Math.sin(h.dir) * h.r * 0.05, h.r * 0.95);
      face.rotation.z = ang; face.scale.setScalar(h.r / 0.1 * 1.85);
      const g = gaze(h, target, ang); iris.position.set(g.x, g.y, 0);
      lids.scale.y = 1 - 0.9 * writhe.blink(); mouth.scale.y = 0.75 + writhe.mouth() * 1.1;
      return api;
    },
    /** Head position (box-local) for the eyes. */
    head() { return pts[RINGS - 1] || { x: 0, y: 0 }; },
    /** The knife: faceted chunks of the body as it is right now (the head keeps its face). */
    pieces() {
      const cuts = [[0, 2], [2, 4], [4, 6], [6, 8], [8, RINGS - 1]];
      return cuts.map(([a, b], i) => {
        const m = bodyVertexCount(a, b), g = new THREE.BufferGeometry(), pp = new Float32Array(m * 3), cc = new Float32Array(m * 3);
        bodyTriangles(pts, a, b, pp, cc); g.setAttribute('position', new THREE.BufferAttribute(pp, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        const mid = pts[Math.floor((a + b) / 2)]; g.translate(-mid.x, -mid.y, 0);
        return { geometry: g, x: mid.x, y: mid.y, head: i === cuts.length - 1 };
      });
    },
    dispose() { geo.dispose(); smear.geometry.dispose(); f.eyes.dispose(); f.iris.dispose(); f.mouth.dispose(); },
  };
  return api.update(0);
}

/** Triangles a worm draws (for the budget). */
export function wormTriangles(w) {
  let t = 0; w.group.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t;
}

// EL HALO: the town. A sunset border town built from a few hundred low-poly boxes merged into a handful of meshes:
// adobe houses with vigas and parapets round the edge, a plaza with a tiled fountain, a mercado under papel picado,
// a dry arroyo to the south, a mission bell tower and mountains on the skyline. Also the colliders the game walks on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BOUNDS = { x0: -38, x1: 38, z0: -36, z1: 39 };
export const STEP = 0.45; // what you can walk up without jumping
export const SPAWNS = [[-36, 2], [36, -2], [0, -34], [-34, 31], [34, 29], [-31, -31], [31, -31], [0, 37]];
export const PLAYER_START = { x: 0, z: 9, yaw: 0 };

const C = {
  sand: [0.86, 0.66, 0.44], sand2: [0.8, 0.58, 0.38], mud: [0.55, 0.38, 0.27], mud2: [0.47, 0.31, 0.22],
  tile: [0.78, 0.42, 0.28], tile2: [0.7, 0.36, 0.24], stone: [0.82, 0.74, 0.62],
  adobe: [[0.85, 0.55, 0.38], [0.92, 0.7, 0.5], [0.88, 0.48, 0.45], [0.95, 0.78, 0.55], [0.8, 0.5, 0.32], [0.98, 0.62, 0.55]],
  trim: [[0.1, 0.6, 0.62], [0.95, 0.85, 0.3], [0.85, 0.2, 0.42], [0.25, 0.45, 0.8], [1, 1, 1]],
  wood: [0.42, 0.26, 0.15], dark: [0.16, 0.09, 0.07], teal: [0.12, 0.62, 0.62], cactus: [0.32, 0.55, 0.3], rock: [0.62, 0.5, 0.42],
};
export const PICADO = [[0.95, 0.2, 0.55], [1, 0.62, 0.1], [0.2, 0.75, 0.85], [0.55, 0.85, 0.2], [0.98, 0.9, 0.2], [0.6, 0.35, 0.9]];

// The arroyo meanders east-west across the south; everything else is flat ground.
export const arroyoCentre = (x) => 29 + 2.5 * Math.sin(x * 0.12);
export function terrain(x, z) {
  const d = Math.abs(z - arroyoCentre(x));
  if (d < 3.5) return -2.4;
  if (d < 7.5) { const t = (d - 3.5) / 4; return -2.4 * (1 - t * t * (3 - 2 * t)); }
  return 0;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function paint(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function buildWorld(scene, { lowEnd = false } = {}) {
  const R = rng(1987);
  const parts = [];        // merged into one vertex-coloured mesh
  const colliders = [];    // boxes { x0,x1,y0,y1,z0,z1 } and circles { x,z,r,y0,y1 }
  const box = (x0, x1, y0, y1, z0, z1, col, solid = true) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(paint(g, col)); if (solid) colliders.push({ x0, x1, y0, y1, z0, z1 });
  };
  const cyl = (x, z, r0, r1, y0, y1, col, seg = 10, solid = false) => {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z);
    parts.push(paint(g.index ? g.toNonIndexed() : g, col)); if (solid) colliders.push({ x, z, r: Math.max(r0, r1), y0, y1 });
  };
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  // ---- adobe house: walls, roof slab, parapet, vigas, a door and windows on the side that faces the plaza
  const house = (x0, x1, z0, z1, h, face) => {
    const col = pick(C.adobe), trim = pick(C.trim);
    box(x0, x1, 0, h, z0, z1, col);
    box(x0 - 0.1, x1 + 0.1, h, h + 0.12, z0 - 0.1, z1 + 0.1, col.map((v) => v * 0.9), false);
    const p = 0.25; // parapet lip
    box(x0, x1, h, h + 0.5, z0, z0 + p, col, false); box(x0, x1, h, h + 0.5, z1 - p, z1, col, false);
    box(x0, x0 + p, h, h + 0.5, z0, z1, col, false); box(x1 - p, x1, h, h + 0.5, z0, z1, col, false);
    const w = x1 - x0, d = z1 - z0;
    const along = face === 'n' || face === 's' ? w : d;
    const fz = face === 'n' ? z0 - 0.06 : face === 's' ? z1 + 0.06 : 0, fx = face === 'w' ? x0 - 0.06 : face === 'e' ? x1 + 0.06 : 0;
    const at = (u, y0, y1, half, c) => { // a flat panel on the facade at position u along it
      if (face === 'n' || face === 's') box(x0 + u - half, x0 + u + half, y0, y1, fz - 0.06, fz + 0.06, c, false);
      else box(fx - 0.06, fx + 0.06, y0, y1, z0 + u - half, z0 + u + half, c, false);
    };
    const door = along * (0.3 + R() * 0.4);
    at(door, 0, 2.2, 0.6, C.dark); at(door, 2.2, 2.4, 0.75, trim);
    for (let u = 1.6; u < along - 1.2; u += 2.8) if (Math.abs(u - door) > 1.6) { at(u, 1.1, 2.1, 0.45, C.dark); at(u, 0.95, 1.1, 0.6, trim); }
    if (h > 4.2) for (let u = 1.6; u < along - 1.2; u += 2.8) { at(u, 3.2, 4.0, 0.4, C.dark); at(u, 3.05, 3.2, 0.55, trim); }
    // vigas: roof beams poking out of the wall under the roofline
    for (let u = 0.8; u < along - 0.4; u += 1.2) {
      if (face === 'n' || face === 's') { const s = face === 'n' ? -1 : 1; const zz = face === 'n' ? z0 : z1; box(x0 + u - 0.1, x0 + u + 0.1, h - 0.45, h - 0.25, Math.min(zz, zz + s * 0.6), Math.max(zz, zz + s * 0.6), C.wood, false); }
      else { const s = face === 'w' ? -1 : 1; const xx = face === 'w' ? x0 : x1; box(Math.min(xx, xx + s * 0.6), Math.max(xx, xx + s * 0.6), h - 0.45, h - 0.25, z0 + u - 0.1, z0 + u + 0.1, C.wood, false); }
    }
  };

  // perimeter streets of houses (a ring around the plaza with gaps for the alleys enemies run in through)
  const rowX = (x0, x1, z0, z1, face) => { let x = x0; while (x < x1 - 2) { const w = 5 + Math.floor(R() * 4), xe = Math.min(x1, x + w); house(x, xe, z0, z1, 3.2 + Math.floor(R() * 3) * 1.1, face); x = xe + (R() < 0.25 ? 0.6 : 0); } };
  const rowZ = (z0, z1, x0, x1, face) => { let z = z0; while (z < z1 - 2) { const w = 5 + Math.floor(R() * 4), ze = Math.min(z1, z + w); house(x0, x1, z, ze, 3.2 + Math.floor(R() * 3) * 1.1, face); z = ze + (R() < 0.25 ? 0.6 : 0); } };
  rowX(-40, -3, -44, -36, 's'); rowX(3, 40, -44, -36, 's');           // north street (gap at x≈0)
  rowZ(-40, -2, -48, -38, 'e'); rowZ(6, 18, -48, -38, 'e');            // west (gap at z≈2)
  rowZ(-40, -6, 38, 48, 'w'); rowZ(2, 18, 38, 48, 'w');                // east (gap at z≈-2)
  // the farmacia: a low house inside the square with crates stacked up to its roof
  house(22, 30, -16, -8, 3.1, 'w');
  box(20.4, 21.8, 0, 0.8, -10.6, -9.2, C.wood); box(20.4, 21.8, 0, 1.6, -12.2, -10.6, C.wood); box(20.4, 21.8, 0, 2.4, -13.8, -12.2, C.wood);
  // a couple of low walls and planters for cover
  box(-22, -14, 0, 1.1, 8, 8.7, pick(C.adobe)); box(12, 18, 0, 1.1, 10, 10.7, pick(C.adobe));
  box(-28, -27.3, 0, 1.1, -12, -4, pick(C.adobe)); box(-24, -18, 0, 2.8, -30, -26, pick(C.adobe));
  house(-30, -22, 12, 17, 3.3, 'n');

  // ---- plaza: fountain in tiers, benches, lamps
  cyl(0, 0, 3.2, 3.2, 0, 0.7, C.stone, 14, true); cyl(0, 0, 3.0, 3.0, 0.7, 0.8, C.teal, 14);
  cyl(0, 0, 0.5, 0.5, 0.8, 2.0, C.stone, 8); cyl(0, 0, 1.3, 1.1, 2.0, 2.3, C.teal, 10); cyl(0, 0, 0.3, 0.25, 2.3, 3.0, C.stone, 6);
  for (const [x, z, r] of [[-7, 0, 0], [7, 0, 0], [0, -7, 1], [0, 7, 1]]) {
    if (r) box(x - 1.3, x + 1.3, 0, 0.45, z - 0.3, z + 0.3, C.wood); else box(x - 0.3, x + 0.3, 0, 0.45, z - 1.3, z + 1.3, C.wood);
  }
  const lampPos = [[-9, -9], [9, -9], [-9, 9], [9, 9]];
  for (const [x, z] of lampPos) { cyl(x, z, 0.12, 0.08, 0, 3.6, C.dark, 6, true); box(x - 0.25, x + 0.25, 3.6, 4.1, z - 0.25, z + 0.25, C.dark, false); }

  // ---- mercado: two rows of stalls with striped awnings
  const stall = (x, z, rot) => {
    const col = pick(PICADO), col2 = pick(PICADO);
    box(x - 1.3, x + 1.3, 0, 0.95, z - 0.6, z + 0.6, C.wood);
    for (const [dx, dz] of [[-1.25, -0.55], [1.25, -0.55], [-1.25, 0.55], [1.25, 0.55]]) box(x + dx - 0.05, x + dx + 0.05, 0.95, 2.4, z + dz - 0.05, z + dz + 0.05, C.wood, false);
    for (let i = 0; i < 4; i++) box(x - 1.45 + i * 0.725, x - 1.45 + (i + 1) * 0.725, 2.4, 2.55, z - 0.85 + rot * 0.1, z + 0.85 + rot * 0.1, i % 2 ? col : col2, false);
    for (let i = 0; i < 5; i++) { const fx = x - 1.0 + i * 0.5; cyl(fx, z, 0.17, 0.17, 0.95, 1.2, pick([[0.95, 0.5, 0.1], [0.9, 0.15, 0.15], [0.4, 0.75, 0.2], [0.98, 0.85, 0.2]]), 6); }
  };
  for (let x = -14; x <= 14; x += 4) { stall(x, -17, 1); stall(x, -24, -1); }

  // ---- arroyo dressing: rocks, nopales, ocotillo, and a little footbridge
  for (let i = 0; i < 26; i++) {
    const x = -36 + R() * 72, z = arroyoCentre(x) + (R() - 0.5) * 13, y = terrain(x, z), s = 0.4 + R() * 0.9;
    const g = new THREE.DodecahedronGeometry(s, 0); g.scale(1, 0.6, 1); g.translate(x, y + s * 0.3, z); parts.push(paint(g.toNonIndexed(), C.rock.map((v) => v * (0.85 + R() * 0.25))));
    if (s > 0.9) colliders.push({ x, z, r: s * 0.9, y0: y, y1: y + s * 0.6 });
  }
  for (let i = 0; i < 14; i++) {
    const x = -36 + R() * 72, z = 16 + R() * 22, y = terrain(x, z);
    if (Math.abs(z - arroyoCentre(x)) < 3) continue;
    if (R() < 0.5) { // nopal: a stack of flat paddles
      for (let k = 0; k < 4; k++) { const g = new THREE.SphereGeometry(0.42, 5, 3); g.scale(1, 1.3, 0.3); g.rotateY(R() * 3); g.translate(x + (R() - 0.5) * 0.8, y + 0.45 + k * 0.45, z + (R() - 0.5) * 0.4); parts.push(paint(g.toNonIndexed(), C.cactus)); }
      colliders.push({ x, z, r: 0.6, y0: y, y1: y + 1.9 });
    } else { // ocotillo: thin whips
      for (let k = 0; k < 6; k++) { const g = new THREE.CylinderGeometry(0.03, 0.06, 2.6, 4); g.translate(0, 1.3, 0); g.rotateZ((R() - 0.5) * 0.7); g.rotateY(k); g.translate(x, y, z); parts.push(paint(g.toNonIndexed(), [0.35, 0.3, 0.2])); }
    }
  }
  // dirt bank wall at the far south edge so the arroyo doesn't run off the world
  for (let x = -44; x < 44; x += 4) { const h = 2 + R() * 2.5; box(x, x + 4.2, -1, h, 39.5, 42, C.rock.map((v) => v * (0.8 + R() * 0.2))); }

  // ---- skyline: mission bell tower, water tank, mountains (no collision, beyond the walls)
  box(-6, 6, 0, 9, -62, -54, [0.95, 0.9, 0.82], false); box(-2.2, 2.2, 9, 15, -60, -56, [0.95, 0.9, 0.82], false);
  box(-1, 1, 11.5, 13.5, -56.1, -55.9, C.dark, false); cyl(0, -58, 2.2, 0.1, 15, 17.5, [0.95, 0.9, 0.82], 4);
  box(-0.12, 0.12, 17.5, 19.2, -58.12, -57.88, C.dark, false); box(-0.6, 0.6, 18.4, 18.65, -58.12, -57.88, C.dark, false);
  cyl(52, -20, 2.5, 2.5, 9, 13, [0.6, 0.62, 0.66], 10); for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(52 + dx - 0.12, 52 + dx + 0.12, 0, 9, -20 + dz - 0.12, -20 + dz + 0.12, [0.4, 0.4, 0.44], false);

  const geom = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const town = new THREE.Mesh(geom, mat); scene.add(town);

  // ---- ground with plaza tiles, street dirt and the cracked arroyo bed
  const seg = lowEnd ? 48 : 72;
  const gg = new THREE.PlaneGeometry(110, 110, seg, seg); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrain(gp.getX(i), gp.getZ(i)) + (R() - 0.5) * 0.05);
  const ng = gg.toNonIndexed(); ng.computeVertexNormals();
  const np = ng.attributes.position, gc = new Float32Array(np.count * 3);
  for (let t = 0; t < np.count; t += 3) {
    const cx = (np.getX(t) + np.getX(t + 1) + np.getX(t + 2)) / 3, cz = (np.getZ(t) + np.getZ(t + 1) + np.getZ(t + 2)) / 3, cy = (np.getY(t) + np.getY(t + 1) + np.getY(t + 2)) / 3;
    let c;
    if (Math.hypot(cx, cz) < 12.5) c = (Math.floor(cx / 1.53) + Math.floor(cz / 1.53)) & 1 ? C.tile : C.tile2;
    else if (cy < -1.6) c = R() < 0.5 ? C.mud : C.mud2;
    else c = R() < 0.5 ? C.sand : C.sand2;
    const k = 0.94 + R() * 0.08;
    for (let j = 0; j < 3; j++) { gc[(t + j) * 3] = c[0] * k; gc[(t + j) * 3 + 1] = c[1] * k; gc[(t + j) * 3 + 2] = c[2] * k; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const ground = new THREE.Mesh(ng, mat); scene.add(ground);

  // ---- fountain water, lamp glows
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.9, 16).rotateX(-Math.PI / 2).translate(0, 0.72, 0), new THREE.MeshLambertMaterial({ color: 0x3ec7d6, emissive: 0x0a3a44 }));
  scene.add(water);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (const [x, z] of lampPos) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat); m.position.set(x, 3.85, z); scene.add(m); }

  // ---- papel picado: strings of cut-paper flags over the mercado and across the plaza
  const picado = buildPicado(R, [
    [[-16, 3.9, -20.5], [16, 3.9, -20.5]], [[-16, 3.6, -14.5], [16, 3.6, -14.5]], [[-16, 3.6, -27], [16, 3.6, -27]],
    [[-9, 4.1, -9], [9, 4.1, 9]], [[9, 4.1, -9], [-9, 4.1, 9]],
  ]);
  scene.add(picado);

  // ---- sky dome, sun, mountains
  const sky = new THREE.SphereGeometry(300, 24, 12), sp = sky.attributes.position, sc = new Float32Array(sp.count * 3);
  const stops = [[-0.2, [0.98, 0.55, 0.3]], [0.02, [1, 0.62, 0.32]], [0.12, [0.93, 0.38, 0.45]], [0.35, [0.5, 0.22, 0.5]], [1, [0.12, 0.08, 0.26]]];
  for (let i = 0; i < sp.count; i++) {
    const t = sp.getY(i) / 300; let a = stops[0], b = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) if (t >= stops[k][0] && t <= stops[k + 1][0]) { a = stops[k]; b = stops[k + 1]; break; }
    const f = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    for (let j = 0; j < 3; j++) sc[i * 3 + j] = a[1][j] + (b[1][j] - a[1][j]) * f;
  }
  sky.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 20), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
  sun.position.set(-250, 22, 60); sun.lookAt(0, 22, 0); scene.add(sun);
  const mts = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + R() * 0.2, r = 190 + R() * 30, h = 18 + R() * 30;
    const g = new THREE.ConeGeometry(25 + R() * 25, h, 5); g.translate(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); mts.push(paint(g.toNonIndexed(), [0.32 + R() * 0.06, 0.18, 0.3 + R() * 0.06]));
  }
  for (const g of mts) { g.deleteAttribute('uv'); }
  scene.add(new THREE.Mesh(mergeGeometries(mts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));

  scene.fog = new THREE.Fog(0xd9876e, 35, 120);
  scene.add(new THREE.HemisphereLight(0xffc49a, 0x7a4a3a, 2.1));
  const sunLight = new THREE.DirectionalLight(0xffb070, 2.2); sunLight.position.set(-60, 25, 25); scene.add(sunLight);

  return { colliders, water, picado };
}

// Each flag is a quad with a cut-paper texture (holes via alphaTest), coloured per vertex; one draw call for all of them.
function buildPicado(R, strings) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 80; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 70);
  for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 8, 70); x.lineTo(i * 8 + 4, 80); x.lineTo(i * 8 + 8, 70); x.fill(); }
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(32, 32, 11, 0, Math.PI * 2); x.fill();               // a sun in the middle
  x.globalCompositeOperation = 'source-over'; x.beginPath(); x.arc(32, 32, 6, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.beginPath(); x.arc(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18, 3, 0, Math.PI * 2); x.fill(); }
  for (const [px, py] of [[8, 8], [56, 8], [8, 58], [56, 58]]) { x.beginPath(); x.moveTo(px, py - 5); x.lineTo(px + 5, py); x.lineTo(px, py + 5); x.lineTo(px - 5, py); x.fill(); }
  x.fillRect(4, 3, 56, 2);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
  const quads = [];
  for (const [a, b] of strings) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.floor(len / 0.8), dir = [(b[0] - a[0]) / len, (b[2] - a[2]) / len];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, sag = Math.sin(t * Math.PI) * 0.5;
      const g = new THREE.PlaneGeometry(0.62, 0.78); g.translate(0, -0.39, 0);
      g.rotateY(Math.atan2(-dir[1], dir[0]) + (R() - 0.5) * 0.25); g.rotateX((R() - 0.5) * 0.2);
      g.translate(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t);
      quads.push(paint(g, PICADO[i % PICADO.length]));
    }
  }
  return new THREE.Mesh(mergeGeometries(quads), new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }));
}

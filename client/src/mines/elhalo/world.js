// EL HALO: the canyon. Drawn from the shared map (server/elhalo/map.js) so what you see is what the server collides
// with: a long box canyon at sunset, cliff walls, a shallow creek winding down the middle over rolling grass, an adobe
// fort at each end, and three places to hole up: la misión (bell tower), la hacienda (ranch house) and la mansión.
// A few hundred low-poly boxes merged into a handful of vertex-coloured meshes, plus the boards on every opening.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOUNDS, BUILDINGS, MAP, OPENINGS, STATIONS, BOARDS_MAX, ENEMY_SPAWNS, creekX, terrain, fortRects, rng } from '../../../../server/elhalo/map.js';

export { BOUNDS, terrain };
export const PICADO = [[0.95, 0.2, 0.55], [1, 0.62, 0.1], [0.2, 0.75, 0.85], [0.55, 0.85, 0.2], [0.98, 0.9, 0.2], [0.6, 0.35, 0.9]];
const C = {
  grass: [0.62, 0.6, 0.3], grass2: [0.55, 0.55, 0.27], dry: [0.78, 0.64, 0.4], sand: [0.86, 0.7, 0.48], mud: [0.5, 0.36, 0.26],
  rock: [0.62, 0.38, 0.3], rock2: [0.72, 0.46, 0.34], rock3: [0.52, 0.3, 0.26], tile: [0.78, 0.42, 0.28], tile2: [0.7, 0.36, 0.24],
  wood: [0.42, 0.26, 0.15], dark: [0.16, 0.09, 0.07], roof: [0.72, 0.3, 0.2], cactus: [0.32, 0.55, 0.3], agave: [0.45, 0.62, 0.55],
};
const WALL = { mision: [0.96, 0.91, 0.82], hacienda: [0.88, 0.56, 0.4], mansion: [0.98, 0.7, 0.68], norte: [0.84, 0.64, 0.44], sur: [0.84, 0.64, 0.44] };

function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// beyond the playable bounds the ground climbs into cliffs
function cliff(x, z, R) {
  const ox = Math.max(0, BOUNDS.x0 - x, x - BOUNDS.x1), oz = Math.max(0, BOUNDS.z0 - z, z - BOUNDS.z1);
  const o = Math.max(ox, oz);
  if (o <= 0) return 0;
  return smooth(o / 4) * (13 + 5 * Math.sin(z * 0.21 + x * 0.1) + 3 * Math.sin(z * 0.53)) + o * 0.8 + R() * 0.9;
}

export function buildWorld(scene, { lowEnd = false } = {}) {
  const R = rng(1987);
  const parts = [];
  const box = (x0, x1, y0, y1, z0, z1, col) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parts.push(paint(g, col)); };
  const cyl = (x, z, r0, r1, y0, y1, col, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); parts.push(paint(g, col)); };
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const tint = (c, k) => c.map((v) => Math.min(1, v * k));

  // ---- walls, sills, lintels, roofs, the tower, fort decks and stairs, straight from the map
  for (const b of MAP.boxes) {
    const base = WALL[b.b] || C.sand;
    const col = b.k === 'roof' ? C.roof : b.k === 'step' ? tint(base, 0.85) : b.k === 'deck' ? tint(base, 0.92) : b.k === 'sill' ? tint(base, 0.9) : b.k === 'lintel' ? tint(base, 0.95) : base;
    box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, col);
  }
  // window and door frames in a trim colour, so the openings read from far away
  const TRIM = { mision: [0.35, 0.22, 0.14], hacienda: [0.1, 0.55, 0.55], mansion: [1, 1, 1] };
  for (const o of OPENINGS) {
    const t = TRIM[o.b], horiz = o.nz !== 0, hw = o.w / 2 + 0.12, d = 0.08;
    const along = (u0, u1, y0, y1) => (horiz ? box(o.x + u0, o.x + u1, y0, y1, o.z + o.nz * 0.25 - d, o.z + o.nz * 0.25 + d, t) : box(o.x + o.nx * 0.25 - d, o.x + o.nx * 0.25 + d, y0, y1, o.z + u0, o.z + u1, t));
    along(-hw, hw, o.y1, o.y1 + 0.14); along(-hw, -hw + 0.12, o.y0, o.y1); along(hw - 0.12, hw, o.y0, o.y1);
    if (!o.door) along(-hw, hw, o.y0 - 0.1, o.y0);
  }
  // building dressing
  for (const b of BUILDINGS) {
    const y = OPENINGS.find((o) => o.b === b.id).y;
    // tiled floor inside
    box(b.x0 + 0.4, b.x1 - 0.4, y - 0.02, y + 0.03, b.z0 + 0.4, b.z1 - 0.4, b.id === 'mansion' ? [0.92, 0.9, 0.86] : C.tile);
    if (b.id === 'mision') {
      box(-12.6, -9.4, y + 8.6, y + 8.9, -33.6, -30.4, [0.9, 0.85, 0.76]);                       // tower cap
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(-11 + dx - 0.3, -11 + dx + 0.3, y + 8.9, y + 11, -32 + dz - 0.3, -32 + dz + 0.3, WALL.mision); // belfry posts
      box(-12.8, -9.2, y + 11, y + 11.4, -33.8, -30.2, WALL.mision); cyl(-11, -32, 1.3, 0.2, y + 11.4, y + 12.6, WALL.mision, 4);
      cyl(-11, -32, 0.55, 0.3, y + 9.3, y + 10.5, [0.75, 0.55, 0.2], 8);                          // the bell
      box(-11.07, -10.93, y + 12.6, y + 13.6, -32.07, -31.93, C.dark); box(-11.4, -10.6, y + 13.1, y + 13.25, -32.07, -31.93, C.dark);
      // stepped gable over the front (east) wall
      for (let i = 0; i < 4; i++) box(-10.5, -9.9, y + 4.6 + i * 0.5, y + 5.1 + i * 0.5, -27.5 + i * 0.9, -20.5 - i * 0.9, WALL.mision);
      cyl(-10.2, -24, 0.5, 0.5, y + 5.4, y + 5.5, [0.35, 0.6, 0.85], 12);                         // round window
      for (let z = -29; z <= -20; z += 1.6) { box(-17.5, -16.1, y, y + 0.45, z, z + 0.5, C.wood); box(-13.9, -12.5, y, y + 0.45, z, z + 0.5, C.wood); } // pews
      box(-19.3, -18.3, y, y + 1.0, -25.5, -22.5, [0.95, 0.9, 0.8]); box(-19.3, -18.3, y + 1.0, y + 1.05, -25.5, -22.5, [0.85, 0.2, 0.3]);
      for (let i = 0; i < 5; i++) cyl(-18.8, -25.2 + i * 0.6, 0.04, 0.04, y + 1.05, y + 1.3, [1, 0.95, 0.85], 4);
    }
    if (b.id === 'hacienda') {
      for (let x = b.x0; x < b.x1; x += 1.1) box(x, x + 0.2, y + b.h - 0.4, y + b.h - 0.2, b.z0 - 0.7, b.z1 + 0.7, C.wood); // vigas through the walls
      // porch on the creek side: posts and a little roof
      for (let z = b.z0 + 0.5; z <= b.z1; z += 3.2) box(b.x0 - 2.3, b.x0 - 2.05, y, y + 2.8, z, z + 0.25, C.wood);
      box(b.x0 - 2.6, b.x0, y + 2.8, y + 2.95, b.z0, b.z1, [0.65, 0.35, 0.2]);
      box(10, 11.4, y, y + 0.8, 5.8, 7.4, C.wood); box(18.5, 21, y, y + 0.75, 5.6, 7.4, [0.9, 0.8, 0.45]); // table, hay
      // corral fence to the north (decoration you can hop) and an agave patch to the south
      for (let x = 9; x <= 22; x += 1.6) box(x, x + 0.15, 0, terrain(x, -6.5) + 1.1, -6.6, -6.45, C.wood);
      for (const yy of [0.5, 0.95]) for (let x = 9; x < 22; x += 3.2) box(x, x + 3.25, terrain(x, -6.5) + yy, terrain(x, -6.5) + yy + 0.1, -6.62, -6.5, C.wood);
      for (let i = 0; i < 18; i++) { const x = 10 + (i % 6) * 2.1 + R() * 0.4, z = 11.5 + Math.floor(i / 6) * 2.2, yy = terrain(x, z); for (let k = 0; k < 7; k++) { const g = new THREE.ConeGeometry(0.09, 0.9, 3); g.translate(0, 0.45, 0); g.rotateZ(0.5 + R() * 0.3); g.rotateY((k / 7) * Math.PI * 2); g.translate(x, yy, z); parts.push(paint(g, C.agave)); } }
    }
    if (b.id === 'mansion') {
      for (const z of [23, 25.6, 30.4, 33]) cyl(-7.4, z, 0.22, 0.2, y, y + 4.6, [1, 1, 1], 8);       // porch columns
      box(-7.8, -6.8, y + 4.6, y + 4.9, 22, 34, [1, 1, 1]); box(-21.2, -7.8, y + 2.7, y + 2.85, 21.8, 34.2, [1, 1, 1]); // cornice, band
      for (const z of [24, 26.8, 29.2, 32]) box(-7.98, -7.9, y + 3.3, y + 4.5, z - 0.5, z + 0.5, C.dark); // upper windows
      for (const x of [-19, -16, -13, -10]) { box(x - 0.5, x + 0.5, y + 3.3, y + 4.5, 21.9, 21.98, C.dark); box(x - 0.5, x + 0.5, y + 3.3, y + 4.5, 34.02, 34.1, C.dark); }
      cyl(-14.5, 28, 0.9, 0.6, y + 4.3, y + 4.5, [1, 0.85, 0.3], 8); cyl(-14.5, 28, 0.03, 0.03, y + 4.5, y + 5.2, C.dark, 4); // chandelier
      box(-20.4, -19.4, y, y + 0.9, 24, 26.5, [0.55, 0.15, 0.25]); box(-15.5, -13.5, y, y + 0.75, 27, 29, C.wood); // sofa, table
    }
  }
  // fort dressing: merlons round the deck, a flagpole
  for (const f of fortRects) {
    for (let x = f.x0; x < f.x1; x += 1.2) { box(x, x + 0.6, f.y + f.h, f.y + f.h + 0.55, f.z0, f.z0 + 0.4, WALL[f.id]); box(x, x + 0.6, f.y + f.h, f.y + f.h + 0.55, f.z1 - 0.4, f.z1, WALL[f.id]); }
    for (let z = f.z0; z < f.z1; z += 1.2) { box(f.x0, f.x0 + 0.4, f.y + f.h, f.y + f.h + 0.55, z, z + 0.6, WALL[f.id]); box(f.x1 - 0.4, f.x1, f.y + f.h, f.y + f.h + 0.55, z, z + 0.6, WALL[f.id]); }
    const fx = (f.x0 + f.x1) / 2, fz = (f.z0 + f.z1) / 2;
    cyl(fx, fz, 0.06, 0.05, f.y + f.h, f.y + f.h + 5, C.dark, 5);
    const flag = f.id === 'norte' ? [0.1, 0.62, 0.62] : [0.95, 0.3, 0.5];
    box(fx + 0.05, fx + 1.8, f.y + f.h + 3.9, f.y + f.h + 4.9, fz - 0.03, fz + 0.03, flag);
  }
  // spawn caves in the cliff walls (the canyon ends are just the hills going over the top)
  for (const [x, z] of ENEMY_SPAWNS) {
    if (Math.abs(x) < 20) continue;
    const s = Math.sign(x), y = terrain(x, z);
    box(s > 0 ? x + 1.2 : x - 2.2, s > 0 ? x + 2.2 : x - 1.2, y - 0.5, y + 3.2, z - 1.6, z + 1.6, [0.08, 0.04, 0.05]);
    box(s > 0 ? x + 1.0 : x - 2.4, s > 0 ? x + 2.4 : x - 1.0, y + 3.2, y + 3.7, z - 2, z + 2, C.rock3);
    for (const dz of [-1.9, 1.9]) box(s > 0 ? x + 1.0 : x - 2.4, s > 0 ? x + 2.4 : x - 1.0, y - 0.5, y + 3.2, z + dz - 0.3, z + dz + 0.3, C.rock3);
  }
  // boulders, cacti, a few dead logs by the creek
  for (const c of MAP.circles) { const g = new THREE.DodecahedronGeometry(c.r, 0); g.scale(1, 0.75, 1); g.translate(c.x, c.y0 + 0.5 + c.r * 0.45, c.z); parts.push(paint(g, tint(C.rock2, 0.85 + R() * 0.25))); }
  for (let i = 0, tries = 0; i < 26 && tries < 300; tries++) {
    const x = BOUNDS.x0 + 1 + R() * (BOUNDS.x1 - BOUNDS.x0 - 2), z = BOUNDS.z0 + 3 + R() * (BOUNDS.z1 - BOUNDS.z0 - 6);
    if (Math.abs(x - creekX(z)) < 3.5 || BUILDINGS.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3) || fortRects.some((b) => x > b.x0 - 4 && x < b.x1 + 4 && z > b.z0 - 3 && z < b.z1 + 3)) continue;
    const y = terrain(x, z); i++;
    if (R() < 0.45) { // saguaro
      const h = 2.2 + R() * 1.8; cyl(x, z, 0.24, 0.2, y - 0.2, y + h, C.cactus, 7);
      for (const s of [-1, 1]) if (R() < 0.8) { const ah = y + h * (0.4 + R() * 0.25); box(x + s * 0.2, x + s * 0.7, ah, ah + 0.3, z - 0.13, z + 0.13, C.cactus); cyl(x + s * 0.6, z, 0.13, 0.12, ah, ah + 0.9 + R() * 0.6, C.cactus, 6); }
    } else if (R() < 0.6) { // nopal
      for (let k = 0; k < 4; k++) { const g = new THREE.SphereGeometry(0.42, 5, 3); g.scale(1, 1.3, 0.3); g.rotateY(R() * 3); g.translate(x + (R() - 0.5) * 0.8, y + 0.4 + k * 0.42, z + (R() - 0.5) * 0.4); parts.push(paint(g, C.cactus)); }
    } else { // dry shrub
      const g = new THREE.IcosahedronGeometry(0.5 + R() * 0.4, 0); g.scale(1, 0.6, 1); g.translate(x, y + 0.2, z); parts.push(paint(g, [0.55, 0.5, 0.28]));
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const town = new THREE.Mesh(mergeGeometries(parts), mat); scene.add(town);

  // ---- ground: rolling grass, creek bed, sand banks, and the cliffs climbing out of it all
  const step = lowEnd ? 2 : 1.5, W = 92, Hl = 172;
  const nx = Math.round(W / step), nz = Math.round(Hl / step);
  const gg = new THREE.PlaneGeometry(W, Hl, nx, nz); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    const cx = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), cz = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z));
    const inside = cx === x && cz === z;
    gp.setY(i, terrain(cx, cz) + cliff(x, z, R) + (inside ? (R() - 0.5) * 0.04 : 0));
  }
  const ng = gg.toNonIndexed(); ng.computeVertexNormals();
  const np = ng.attributes.position, nn = ng.attributes.normal, gc = new Float32Array(np.count * 3);
  for (let t = 0; t < np.count; t += 3) {
    const cx = (np.getX(t) + np.getX(t + 1) + np.getX(t + 2)) / 3, cz = (np.getZ(t) + np.getZ(t + 1) + np.getZ(t + 2)) / 3, cy = (np.getY(t) + np.getY(t + 1) + np.getY(t + 2)) / 3;
    const out = cx < BOUNDS.x0 - 0.5 || cx > BOUNDS.x1 + 0.5 || cz < BOUNDS.z0 - 0.5 || cz > BOUNDS.z1 + 0.5;
    const flat = nn.getY(t);
    const cd = Math.abs(cx - creekX(cz));
    let c;
    if (out || flat < 0.72) c = cy > 9 ? C.rock2 : R() < 0.5 ? C.rock : C.rock3;
    else if (cd < 1.9) c = C.mud;
    else if (cd < 3.6) c = C.sand;
    else if (fortRects.some((f) => cx > f.x0 - 2 && cx < f.x1 + 2 && cz > f.z0 - 1 && cz < f.z1 + 1)) c = C.dry;
    else c = (Math.sin(cx * 0.4) + Math.sin(cz * 0.33) > 0.9) ? C.dry : R() < 0.5 ? C.grass : C.grass2;
    const k = 0.93 + R() * 0.1;
    for (let j = 0; j < 3; j++) { gc[(t + j) * 3] = c[0] * k; gc[(t + j) * 3 + 1] = c[1] * k; gc[(t + j) * 3 + 2] = c[2] * k; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  scene.add(new THREE.Mesh(ng, mat));

  // ---- the creek: a ribbon of water following its bed
  const pts = [];
  for (let z = BOUNDS.z0 - 6; z <= BOUNDS.z1 + 6; z += 2) { const x = creekX(z), y = terrain(x, Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z))) + 0.4; pts.push([x - 2.1, y, z], [x + 2.1, y, z]); }
  const wg = new THREE.BufferGeometry(), wpos = [];
  for (let i = 0; i + 3 < pts.length; i += 2) { const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]; wpos.push(...a, ...c, ...b, ...b, ...c, ...d); }
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x3ec7d6, emissive: 0x0a3a44, transparent: true, opacity: 0.82 }));
  scene.add(water);

  // ---- the boards on every opening: BOARDS_MAX planks each, shown according to the live count
  const plankMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const boards = OPENINGS.map((o) => {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); if (o.nx !== 0) g.rotation.y = Math.PI / 2;
    const planks = [];
    for (let k = 0; k < BOARDS_MAX; k++) {
      const yy = o.y0 + 0.2 + (k / (BOARDS_MAX - 1)) * (o.y1 - o.y0 - 0.4);
      const geo = paint(new THREE.BoxGeometry(o.w + 0.35, 0.2, 0.07), k % 2 ? [0.62, 0.42, 0.24] : [0.55, 0.36, 0.2]);
      const m = new THREE.Mesh(geo, plankMat); m.rotation.z = (k % 2 ? 1 : -1) * (0.12 + 0.05 * k);
      m.position.set(0, yy, -(o.nx || o.nz) * 0.32); // nailed across the inside face, where the defenders work
      g.add(m); planks.push(m);
    }
    scene.add(g);
    return { o, g, planks, shown: BOARDS_MAX };
  });

  // ---- wall crates: buy ammo or piñatas with points
  const stations = STATIONS.map((s) => {
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z);
    const crate = new THREE.Mesh(paint(new THREE.BoxGeometry(0.9, 0.7, 0.6), s.kind === 'ammo' ? [0.1, 0.55, 0.55] : [0.95, 0.35, 0.6]), plankMat); crate.position.y = 0.35; g.add(crate);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const x = cv.getContext('2d');
    x.fillStyle = '#2a1420'; x.fillRect(0, 0, 256, 96); x.strokeStyle = '#ffc23a'; x.lineWidth = 6; x.strokeRect(4, 4, 248, 88);
    x.fillStyle = '#ffc23a'; x.font = 'bold 40px VT323, monospace'; x.textAlign = 'center'; x.fillText(s.label, 128, 46); x.fillStyle = '#fff'; x.font = '30px VT323, monospace'; x.fillText(`${s.cost} PTS`, 128, 80);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    sign.position.y = 1.5;
    const b = BUILDINGS.find((q) => q.id === s.b);
    const d = [[s.x - b.x0, Math.PI / 2], [b.x1 - s.x, -Math.PI / 2], [s.z - b.z0, 0], [b.z1 - s.z, Math.PI]].sort((p, q) => p[0] - q[0])[0];
    sign.rotation.y = d[1]; g.add(sign); scene.add(g);
    return g;
  });

  // ---- papel picado strung between things
  const picado = buildPicado(R, [
    [[-9.6, 4.1, -27], [-3, 3.6, -27]], [[-9.6, 4.1, -21], [-3, 3.6, -21]],
    [[6.5, 3.8, -1.5], [6.5, 3.8, 8]], [[8.9, 4.1, 0], [3, 3.5, 4]],
    [[-7.4, 4.4, 23], [-2, 3.7, 26]], [[-7.4, 4.4, 33], [-2, 3.7, 30]],
    [[-6, 4.6, -48], [6, 4.6, -48]], [[-6, 4.6, 48], [6, 4.6, 48]],
  ].map(([a, b]) => [[a[0], a[1] + terrain(a[0], a[2]), a[2]], [b[0], b[1] + terrain(b[0], b[2]), b[2]]]));
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

  scene.fog.near = 45; scene.fog.far = 160;
  return { water, picado, boards, stations };
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

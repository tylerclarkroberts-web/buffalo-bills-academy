// three.js renderer for one Acid Mines shift: low-res first-person tunnels, headlamp, glowing pool, drips.
import * as THREE from 'three';
import { rng, distFrom, pathSteps } from './maze.js';
import { MIN_GAP } from './stalker.js';
import { buildFind } from './finds.js';

export const TILE = 2.2, WALL_H = 2.6, EYE = 1.35, RADIUS = 0.38, SPEED = 3.6, TURN = 2.3;

// How each shaft looks, in elevator order (7, 8, 12, Earl's Level): the deeper the permit, the worse the place.
// `rock` multiplies the grey speckle in the wall and floor textures. The acid stays green everywhere. How far you
// can see is the caller's business (fogFar, lampReach): a headlamp changes that, never the colour of the rock.
// `acid` is the colour the shaft's acid leans toward: still acid-green, with something of the rock in it.
const LOOKS = [
  { bg: '#020402', ambient: '#3a5a2a', ambientI: 0.55, lamp: '#d9ffc2', rock: [1, 1.1, 0.9], rockBase: '#1b1f18', floorBase: '#10130e', ceil: '#7a8a70', beam: '#3b2f1d' },
  { bg: '#010405', ambient: '#1f4a55', ambientI: 0.42, acid: '#4fd0ff', lamp: '#c8f2ff', rock: [0.7, 1.05, 1.2], rockBase: '#141d20', floorBase: '#0b1113', ceil: '#6a868c', beam: '#2a2c26' }, // damper
  { bg: '#050301', ambient: '#5e4318', ambientI: 0.3, acid: '#ffc832', lamp: '#ffe2a8', rock: [1.45, 1.05, 0.5], rockBase: '#231a0e', floorBase: '#150f08', ceil: '#8a7350', beam: '#2e2416' }, // sulphur
  { bg: '#050101', ambient: '#571a1a', ambientI: 0.18, acid: '#ff4a2a', lamp: '#ffc4b0', rock: [1.5, 0.45, 0.45], rockBase: '#200d0d', floorBase: '#120707', ceil: '#7a4a4a', beam: '#1c1210' }, // Earl's
];

/** A shaft's own shade of acid: the usual green pulled part of the way toward the shaft's colour. */
function acidOf(look) {
  const to = look.acid && new THREE.Color(look.acid);
  return (hex) => { const c = new THREE.Color(hex); return to ? c.lerp(to, 0.4) : c; };
}
const plainAcid = acidOf({});

function canvasTex(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rockTexture(r, look, acid = plainAcid) {
  const [tr, tg, tb] = look.rock;
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = look.rockBase; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = 18 + Math.floor(r() * 40); g.fillStyle = `rgb(${Math.round(v * tr)},${Math.round(v * tg)},${Math.round(v * tb)})`; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, Math.floor(r() * h), w, 1); }
    for (let i = 0; i < 4; i++) { // acid streaks
      const x = Math.floor(r() * w); let y = 0; g.globalAlpha = 0.55; g.fillStyle = `#${acid('#78ff3c').getHexString()}`;
      const len = 10 + r() * 40; for (; y < len; y++) g.fillRect(x + (r() < 0.1 ? 1 : 0), y, 1, 1);
      g.globalAlpha = 0.8; g.fillStyle = `#${acid('#aaff5a').getHexString()}`; g.fillRect(x - 1, y, 3, 2); g.globalAlpha = 1;
    }
  });
}
function floorTexture(r, look) {
  const [tr, tg, tb] = look.rock;
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = look.floorBase; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const v = 12 + Math.floor(r() * 26); g.fillStyle = `rgb(${Math.round(v * tr)},${Math.round(v * tg)},${Math.round(v * tb)})`; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 1); }
    g.fillStyle = 'rgba(30,40,24,.9)'; g.fillRect(28, 0, 2, h); g.fillRect(36, 0, 2, h); // rails
  });
}
function hazardTexture() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#0b0b06'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e6ff00'; g.beginPath(); g.moveTo(32, 6); g.lineTo(60, 56); g.lineTo(4, 56); g.closePath(); g.fill();
    g.fillStyle = '#0b0b06'; g.beginPath(); g.moveTo(32, 16); g.lineTo(52, 51); g.lineTo(12, 51); g.closePath(); g.fill();
    g.fillStyle = '#e6ff00'; g.fillRect(30, 24, 4, 16); g.fillRect(30, 43, 4, 4);
  });
}
// The door behind where you clock in: a plain riveted steel bulkhead, dark and easy to miss. Original art.
function doorTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#23211d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { const v = 28 + Math.floor(Math.random() * 18); g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 2, 1); }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(4, 40, w - 8, 2); g.fillRect(4, 86, w - 8, 2); // panel seams
    g.fillStyle = '#4a463d'; for (const y of [8, 36, 46, 82, 92, 120]) for (const x of [8, 22, 42, 56]) g.fillRect(x, y, 2, 2); // rivets
    g.fillStyle = '#3b3830'; g.fillRect(48, 60, 9, 4); // handle
    g.fillStyle = 'rgba(160,120,60,.45)'; g.font = 'bold 9px monospace'; g.fillText('B-7', 24, 66); // faded stencil
    g.fillStyle = 'rgba(80,40,10,.35)'; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(Math.random() * w), 100 + Math.floor(Math.random() * 20), 1, 8); // rust runs
  });
}
function poolTexture(acid = plainAcid) {
  const lo = acid('#28c814'), hi = acid('#a0ff3c');
  return canvasTex(64, 64, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.4) + Math.sin(y * 0.33 + x * 0.1) + Math.sin((x + y) * 0.21);
      g.fillStyle = `#${lo.clone().lerp(hi, (v + 3) / 6).getHexString()}`; g.fillRect(x, y, 1, 1);
    }
  });
}

function disposeMeshes(root, textures = true) {
  const resources = new Set();
  root.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    for (const material of [].concat(o.material || [])) {
      resources.add(material);
      if (textures && material.map) resources.add(material.map);
    }
  });
  for (const resource of resources) resource.dispose();
}

// The visitor: bald, pale, hollow-eyed, a long black coat, arms that hang too low and fingers that go on too
// long. About 2.3 m: his head nearly scrapes the 2.6 m ceiling. Built from plain shapes; front is +z.
function buildVisitor() {
  // the fog swallows the black coat but not the face and hands: far off, he's a pale face hanging in the dark
  const skin = new THREE.MeshLambertMaterial({ color: '#d4cfbb', emissive: '#24221a', transparent: true, fog: false });
  const coat = new THREE.MeshLambertMaterial({ color: '#0b0a0a', emissive: '#030303', transparent: true });
  const hollow = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, fog: false });
  const mats = [skin, coat, hollow];
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const leg = new THREE.CylinderGeometry(0.045, 0.05, 0.4, 6);
  add(leg, coat, -0.09, 0.2, 0); add(leg, coat, 0.09, 0.2, 0);
  add(new THREE.CylinderGeometry(0.17, 0.36, 1.58, 10), coat, 0, 1.08, 0, 0.04); // the coat, a touch hunched
  add(new THREE.SphereGeometry(0.24, 10, 6), coat, 0, 1.84, 0.02, 0.15, 0, 0, 1.05, 0.42, 0.72); // narrow shoulders
  add(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 6), skin, 0, 1.94, 0.06, 0.5);
  const head = new THREE.Group(); head.position.set(0, 2.08, 0.1); g.add(head);
  const h = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); head.add(m); return m; };
  h(new THREE.SphereGeometry(0.15, 12, 10), skin, 0, 0.02, 0, 0, 0, 0, 0.84, 1.38, 1);           // long bald skull
  const sock = new THREE.SphereGeometry(0.034, 8, 6);
  h(sock, hollow, -0.052, 0.05, 0.128, 0, 0, 0, 1, 0.8, 0.5); h(sock, hollow, 0.052, 0.05, 0.128, 0, 0, 0, 1, 0.8, 0.5); // hollow eyes
  h(new THREE.ConeGeometry(0.02, 0.09, 5), skin, 0, -0.005, 0.15, 1.9);                          // hooked nose
  h(new THREE.BoxGeometry(0.06, 0.006, 0.01), hollow, 0, -0.07, 0.132);                          // thin mouth
  const tooth = new THREE.BoxGeometry(0.009, 0.022, 0.006);
  h(tooth, skin, -0.009, -0.082, 0.136); h(tooth, skin, 0.009, -0.082, 0.136);                   // two small pale teeth
  const ear = new THREE.ConeGeometry(0.03, 0.13, 5);
  h(ear, skin, -0.13, 0.07, -0.02, -0.5, 0, 0.5); h(ear, skin, 0.13, 0.07, -0.02, -0.5, 0, -0.5); // pointed ears
  const arm = new THREE.CylinderGeometry(0.038, 0.042, 0.52, 6);
  const fing = new THREE.CylinderGeometry(0.009, 0.013, 0.24, 4);
  const hands = [];
  for (const side of [-1, 1]) {
    add(arm, coat, side * 0.25, 1.56, 0.04, 0.08, 0, side * 0.06);
    add(arm, coat, side * 0.27, 1.1, 0.1, -0.12, 0, side * -0.03);
    const hand = new THREE.Group(); hand.position.set(side * 0.27, 0.82, 0.12); g.add(hand); hands.push(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.03), skin); hand.add(palm);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(fing, skin); f.position.set((k - 1.5) * 0.016, -0.16 - (k === 1 || k === 2 ? 0.02 : 0), 0.01 + k * 0.002); f.rotation.x = 0.12 + k * 0.03; hand.add(f); }
  }
  g.visible = false;
  return { group: g, head, hands, mats };
}

export class MineScene {
  constructor(canvas, maze, { onNear, onStep, stalker, localStart, reduceMotion = false, onDread, onEvent, fogFar = 17, lampReach = 11, depth = 0 } = {}) {
    this.maze = maze; this.onNear = onNear; this.onStep = onStep;
    this.stalker = stalker || null; this.localStart = localStart ?? Date.now(); this.reduce = reduceMotion; this.onDread = onDread; this.onEvent = onEvent;
    const r = rng(maze.grid.length * 7919 + maze.pool.x * 31 + maze.pool.y);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scale = 0.34; // render small, upscale with pixelated CSS for the CRT look
    this.scene = new THREE.Scene();
    const look = LOOKS[depth] || LOOKS[0], acid = this.acid = acidOf(look);
    this.scene.background = new THREE.Color(look.bg);
    this.scene.fog = new THREE.Fog(look.bg, 2.5, fogFar); // deeper shafts are darker; a headlamp pushes it back
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(look.ambient, look.ambientI));
    this.lamp = new THREE.PointLight(look.lamp, 18, lampReach, 1.6);
    this.camera.add(this.lamp);

    const { grid, size } = maze;
    const wallMat = new THREE.MeshLambertMaterial({ map: rockTexture(r, look, acid) });
    this.wallMaterial = wallMat;
    let n = 0; for (const row of grid) for (const v of row) n += v;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), wallMat, n);
    const m = new THREE.Matrix4(); let i = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y][x]) { m.makeTranslation(x * TILE, WALL_H / 2, y * TILE); walls.setMatrixAt(i++, m); }
    this.scene.add(walls);
    const floorT = floorTexture(r, look); floorT.repeat.set(size, size);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size * TILE, size * TILE), new THREE.MeshLambertMaterial({ map: floorT }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((size - 1) * TILE / 2, 0, (size - 1) * TILE / 2); this.scene.add(floor);
    this.floor = floor;
    const ceilT = rockTexture(r, look, acid); ceilT.repeat.set(size, size);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size * TILE, size * TILE), new THREE.MeshLambertMaterial({ map: ceilT, color: look.ceil }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(floor.position.x, WALL_H, floor.position.z); this.scene.add(ceil);

    // Support beams every few tiles of open corridor, and hazard signs on some walls.
    const beamMat = new THREE.MeshLambertMaterial({ color: look.beam });
    const hazMat = new THREE.MeshBasicMaterial({ map: hazardTexture(), transparent: false });
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      if (grid[y][x]) continue;
      const horiz = !grid[y][x - 1] && !grid[y][x + 1] && grid[y - 1][x] && grid[y + 1][x];
      const vert = !grid[y - 1][x] && !grid[y + 1][x] && grid[y][x - 1] && grid[y][x + 1];
      if ((horiz || vert) && r() < 0.45) {
        const g = new THREE.Group();
        const post = new THREE.BoxGeometry(0.16, WALL_H, 0.16);
        const a = new THREE.Mesh(post, beamMat), b = new THREE.Mesh(post, beamMat), top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.18, 0.18), beamMat);
        a.position.set(-TILE / 2 + 0.1, WALL_H / 2, 0); b.position.set(TILE / 2 - 0.1, WALL_H / 2, 0); top.position.set(0, WALL_H - 0.12, 0);
        g.add(a, b, top); g.position.set(x * TILE, 0, y * TILE); if (horiz) g.rotation.y = Math.PI / 2; this.scene.add(g);
      }
      if (r() < 0.07) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => grid[y + dy][x + dx]);
        if (dirs.length) {
          const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
          const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), hazMat);
          s.position.set(x * TILE + dx * (TILE / 2 - 0.01), 1.5, y * TILE + dy * (TILE / 2 - 0.01));
          s.lookAt(x * TILE, 1.5, y * TILE); this.scene.add(s);
        }
      }
    }

    // The acid pool.
    const { pool } = maze;
    this.poolPos = new THREE.Vector3(pool.x * TILE, 0, pool.y * TILE);
    this.poolTex = poolTexture(acid); this.poolTex.repeat.set(2, 2);
    const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ map: this.poolTex, color: '#ffffff' }));
    poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.copy(this.poolPos).setY(0.02); this.scene.add(poolMesh);
    this.poolMesh = poolMesh; this.crystals = [];
    this.poolLight = new THREE.PointLight(acid('#7dff3a'), 14, 9, 1.4); this.poolLight.position.copy(this.poolPos).setY(0.6); this.scene.add(this.poolLight);
    // crystals around the pool
    const crystalMat = new THREE.MeshBasicMaterial({ color: acid('#8dff5a') });
    for (let k = 0; k < 7; k++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 + r() * 0.12, 0), crystalMat);
      const a = r() * Math.PI * 2; c.position.set(this.poolPos.x + Math.cos(a) * (0.95 + r() * 0.15), 0.1, this.poolPos.z + Math.sin(a) * (0.95 + r() * 0.15)); c.scale.y = 2.2; this.scene.add(c); this.crystals.push(c);
    }

    // The door (v27): on the wall behind the start, so you only see it if you turn all the way around.
    // Purely decorative as far as the shift goes: it opens a side room in the page and never talks to the server.
    {
      const behindX = maze.facing === 0; // facing +x down the first corridor: the door is on the -x wall, else the -z wall
      const face = TILE / 2 - 0.02;
      const door = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.05), new THREE.MeshLambertMaterial({ map: doorTexture(), emissive: '#0b0805' }));
      slab.position.y = 1.025; slab.name = 'mine-door'; door.add(slab);
      const seamMat = new THREE.MeshBasicMaterial({ color: '#ff6a2a', transparent: true, opacity: 0.7 });
      for (const [w, h, x, y] of [[1.1, 0.025, 0, 2.06], [0.025, 2.06, -0.54, 1.03], [0.025, 2.06, 0.54, 1.03], [1.1, 0.02, 0, 0.01]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), seamMat); m.position.set(x, y, 0.004); door.add(m);
      }
      if (behindX) { door.position.set(maze.start.x * TILE - face, 0, maze.start.y * TILE); door.rotation.y = Math.PI / 2; }
      else { door.position.set(maze.start.x * TILE, 0, maze.start.y * TILE - face); }
      this.scene.add(door);
      this.door = { group: door, slab, seamMat, normal: behindX ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1) };
      this.doorLight = new THREE.PointLight('#ff5a1f', 1.6, 2.2, 2); this.doorLight.position.set(door.position.x + this.door.normal.x * 0.3, 0.3, door.position.z + this.door.normal.y * 0.3); this.scene.add(this.doorLight);
      this.raycaster = new THREE.Raycaster();
    }

    // Dripping acid: small glowing drops that fall from the ceiling and respawn.
    this.drops = [];
    const dropGeo = new THREE.SphereGeometry(0.035, 4, 3); const dropMat = new THREE.MeshBasicMaterial({ color: acid('#a8ff5e') });
    const open = []; for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (!grid[y][x]) open.push([x, y]);
    for (let k = 0; k < 70; k++) {
      const [x, y] = open[Math.floor(r() * open.length)];
      const d = new THREE.Mesh(dropGeo, dropMat); d.scale.y = 2.4;
      d.userData = { x: x * TILE + (r() - 0.5) * TILE * 0.8, z: y * TILE + (r() - 0.5) * TILE * 0.8, v: 0, wait: r() * 3 };
      d.position.set(d.userData.x, WALL_H, d.userData.z); this.scene.add(d); this.drops.push(d);
    }
    this.puddleGlints = [];
    for (const [x, y] of open) if (r() < 0.06) { // puddle glints
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.18 + r() * 0.2, 8), new THREE.MeshBasicMaterial({ color: acid('#3c8a1c') }));
      p.rotation.x = -Math.PI / 2; p.position.set(x * TILE + (r() - 0.5), 0.015, y * TILE + (r() - 0.5)); this.scene.add(p);
      p.userData.tile = `${x},${y}`; this.puddleGlints.push(p);
    }

    if (this.stalker) { this.visitor = buildVisitor(); this.scene.add(this.visitor.group); this.fade = 0; this.flick = 0; this.nextFlick = 1; this.lastDread = -1; }
    this.pos = new THREE.Vector2(maze.start.x * TILE, maze.start.y * TILE);
    this.yaw = -maze.facing - Math.PI / 2; this.pitch = 0;
    this.input = { f: 0, s: 0, t: 0 };
    this.bob = 0; this.mining = false; this.t0 = performance.now(); this.last = this.t0;
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }
  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(160, Math.round(w * this.scale)), Math.max(100, Math.round(h * this.scale)), false);
    this.camera.aspect = w / h;
    // Keep at least ~76° of horizontal view, so tunnel walls stay visible on tall phone screens.
    const minH = (76 * Math.PI) / 180;
    this.baseFov = this.camera.fov = Math.min(105, Math.max(72, (2 * Math.atan(Math.tan(minH / 2) / this.camera.aspect) * 180) / Math.PI));
    this.camera.updateProjectionMatrix();
  }
  blocked(x, z) {
    const g = this.maze.grid;
    for (const [ox, oz] of [[RADIUS, RADIUS], [-RADIUS, RADIUS], [RADIUS, -RADIUS], [-RADIUS, -RADIUS]]) {
      const tx = Math.round((x + ox) / TILE), tz = Math.round((z + oz) / TILE);
      if (g[tz]?.[tx] !== 0) return true;
    }
    return !!this.stalker?.blocks(x, z, RADIUS); // he takes up room: walk around him
  }
  updateVisitor(now, dt) {
    const st = this.stalker, v = this.visitor;
    st.update(dt, { t: now / 1000, x: this.pos.x, z: this.pos.y, yaw: this.yaw, elapsedMs: Date.now() - this.localStart, pushing: this.pushing });
    while (st.events.length) { const e = st.events.shift(); if (e === 'vanish') this.fade = 1; this.onEvent?.(e); }
    const g = v.group;
    if (st.present) {
      g.visible = true; g.position.set(st.x, 0, st.z); g.rotation.y = st.facing;
      for (const m of v.mats) m.opacity = 1;
      if (!st.seen && !this.reduce) {
        // out of your gaze he isn't quite still: a twitch of the head, fingers flexing, the odd frame he isn't there
        v.head.rotation.z = Math.random() < 0.05 ? (Math.random() - 0.5) * 0.5 : v.head.rotation.z * 0.9;
        v.head.rotation.x = 0.18 + (Math.random() < 0.03 ? (Math.random() - 0.5) * 0.3 : 0);
        for (const hnd of v.hands) hnd.rotation.x = Math.sin(now / 160 + hnd.position.x * 9) * 0.12;
        this.nextFlick -= dt;
        if (this.nextFlick <= 0) { this.flick = 0.05 + Math.random() * 0.07; this.nextFlick = 0.8 + Math.random() * 2.2; }
        if (this.flick > 0) { this.flick -= dt; g.visible = false; }
        g.position.x += st.moving ? Math.sin(now / 240) * 0.02 : 0;
      } else { v.head.rotation.set(0.18, 0, 0); } // looked at: perfectly, unnaturally still
    } else if (this.fade > 0) { // the acid is found: he thins out and is gone
      this.fade = Math.max(0, this.fade - dt / (this.reduce ? 0.9 : 0.6));
      g.visible = this.reduce ? true : Math.random() < this.fade;
      for (const m of v.mats) m.opacity = this.fade;
      if (!this.fade) g.visible = false;
    } else g.visible = false;
    // camera unease: a slow breath in the field of view as he gets close
    const level = st.dread(this.pos.x, this.pos.y);
    this.dreadLevel = level;
    const fov = this.baseFov + (this.reduce ? 0 : level * 5 + Math.sin(now / 900) * 1.2 * level);
    if (Math.abs(this.camera.fov - fov) > 0.02) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (Math.abs(level - this.lastDread) > 0.02) { this.lastDread = level; this.onDread?.(level); }
  }
  /** The vein moved on: leave a dry crater where the glow was and light up the next pool. */
  setPool(x, y) {
    const crater = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: '#2a2a1e' }));
    crater.rotation.x = -Math.PI / 2; crater.position.copy(this.poolPos).setY(0.015); this.scene.add(crater);
    const to = new THREE.Vector3(x * TILE, 0, y * TILE); const dx = to.x - this.poolPos.x, dz = to.z - this.poolPos.z;
    this.poolPos.copy(to);
    this.poolMesh.position.copy(to).setY(0.02); this.poolLight.position.copy(to).setY(0.6);
    for (const c of this.crystals) { c.position.x += dx; c.position.z += dz; }
  }
  /** Finite deposits share their liquid texture; confirmations only move the liquid surface. */
  setDeposits(pools, currentPoolId) {
    this.deposits ||= new Map();
    this.poolMesh.visible = false;
    for (const crystal of this.crystals) crystal.visible = false;
    const visible = pools.filter((p) => p.quantity !== null || p.id === currentPoolId);
    const ids = new Set(visible.map((p) => p.id));
    for (const [id, deposit] of this.deposits) if (!ids.has(id)) {
      this.scene.remove(deposit.group); disposeMeshes(deposit.group, false); this.deposits.delete(id);
    }
    for (const pool of visible) {
      let deposit = this.deposits.get(pool.id);
      if (!deposit) {
        const group = new THREE.Group(); group.name = `mine-deposit-${pool.id}`;
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.68, 1, 20, 1, true), new THREE.MeshLambertMaterial({ map: this.wallMaterial.map, color: '#66704c', emissive: '#111a08', side: THREE.BackSide }));
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshLambertMaterial({ color: '#28321c', emissive: '#0b1506' }));
        const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.08, 20), new THREE.MeshLambertMaterial({ color: '#53643a', emissive: '#172509' }));
        const liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ map: this.poolTex, color: '#ffffff' }));
        for (const mesh of [bottom, rim, liquid]) mesh.rotation.x = -Math.PI / 2;
        rim.position.y = 0.012;
        group.add(wall, bottom, rim, liquid); this.scene.add(group);
        deposit = { group, wall, bottom, rim, liquid }; this.deposits.set(pool.id, deposit);
      }
      const units = pool.quantity > 0 ? pool.quantity : 35;
      const radius = 0.48 + Math.min(100, units) * 0.0052;
      const depth = pool.quantity === 0 ? 0.18 : 0.16 + Math.min(100, units) * 0.005;
      const fraction = pool.quantity === null ? 0.6 : pool.quantity > 0 ? Math.max(0, Math.min(1, pool.remaining / pool.quantity)) : 0;
      deposit.radius = radius; deposit.depth = depth;
      deposit.group.position.set(pool.x * TILE, 0, pool.y * TILE);
      deposit.wall.scale.set(radius, depth, radius); deposit.wall.position.y = -depth / 2;
      deposit.bottom.scale.setScalar(radius * 0.68); deposit.bottom.position.y = -depth + 0.005;
      deposit.rim.scale.setScalar(radius);
      deposit.liquid.position.y = -depth + 0.015 + fraction * (depth - 0.07);
      deposit.liquid.scale.setScalar(radius * (0.68 + 0.32 * (deposit.liquid.position.y + depth) / depth) * 0.98);
      deposit.liquid.visible = pool.quantity === null || pool.remaining > 0;
      deposit.liquid.material.color.set(pool.quantity === null ? '#8a9a6a' : '#ffffff'); // not looked at yet: duller
    }
    const floorKey = visible.map((p) => `${p.id}:${p.x},${p.y}:${this.deposits.get(p.id).radius}`).join('|');
    if (floorKey !== this.depositFloorKey) {
      this.depositFloorKey = floorKey;
      const extent = this.maze.size * TILE, half = extent / 2, center = (this.maze.size - 1) * TILE / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-half, -half); shape.lineTo(half, -half); shape.lineTo(half, half); shape.lineTo(-half, half); shape.closePath();
      for (const pool of visible) {
        const hole = new THREE.Path();
        hole.absarc(pool.x * TILE - center, center - pool.y * TILE, this.deposits.get(pool.id).radius, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      const geometry = new THREE.ShapeGeometry(shape, 5), position = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / extent + 0.5, position.getY(i) / extent + 0.5);
      this.floor.geometry.dispose(); this.floor.geometry = geometry;
      const tiles = new Set(visible.map((p) => `${p.x},${p.y}`));
      for (const glint of this.puddleGlints || []) glint.visible = !tiles.has(glint.userData.tile);
    }
    const target = pools.find((p) => p.id === currentPoolId);
    this.hasPoolTarget = !!target; this.poolLight.visible = !!target;
    if (target) {
      this.poolPos.set(target.x * TILE, 0, target.y * TILE);
      this.poolLight.position.copy(this.poolPos).setY(0.6);
      this.maze.pool = { x: target.x, y: target.y };
      if (this.stalker) this.stalker.pool = this.maze.pool;
    }
  }
  /** v30: this shift's egg (only when the server put one in it). Against a wall, never in the way: no collision. */
  addEgg(spot) {
    const g = new THREE.Group();
    const tex = canvasTex(32, 32, (c, w, h) => { c.fillStyle = '#e6d8b8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 46; i++) { c.fillStyle = i % 3 ? '#6a4a2a' : '#5a9a3a'; c.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 2, 2); } });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#4a3a1a') }));
    mesh.scale.set(1, 1.32, 1); mesh.position.y = 0.3; g.add(mesh);
    const nest = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 5, 10), new THREE.MeshLambertMaterial({ color: '#7a5a22', emissive: new THREE.Color('#1a1206') }));
    nest.rotation.x = -Math.PI / 2; nest.position.y = 0.07; g.add(nest);
    const light = new THREE.PointLight('#ffd890', 2.4, 3.4); light.position.set(0, 0.8, 0); g.add(light);
    g.position.set((spot.x + spot.ox) * TILE, 0, (spot.y + spot.oy) * TILE);
    this.scene.add(g); this.egg = { group: g, mesh, light, gone: 0, goneAt: 0 };
  }
  /** Things other people left down here (see finds.js), each against the wall its spot names. Scenery: no collision. */
  addFinds(spots) {
    for (const s of spots) {
      const g = buildFind(s.id, canvasTex, (this.acid || plainAcid)('#8dff5a')); if (!g) continue;
      g.position.set((s.x + s.dx / 2) * TILE, 0, (s.y + s.dy / 2) * TILE); g.rotation.y = Math.atan2(-s.dx, -s.dy);
      g.name = `mine-find-${s.id}`; this.scene.add(g);
    }
  }
  eggView() {
    if (!this.egg || this.egg.gone) return { dist: 99, facing: -1 };
    const p = this.egg.group.position, dx = p.x - this.pos.x, dz = p.z - this.pos.y, d = Math.hypot(dx, dz) || 1;
    return { dist: d, facing: (-Math.sin(this.yaw) * dx + -Math.cos(this.yaw) * dz) / d };
  }
  /** 'take': it lifts toward you and is gone. 'sink': it settles into a crack in the floor. */
  removeEgg(how) { if (this.egg && !this.egg.gone) { this.egg.gone = how === 'take' ? 1 : 2; this.egg.goneAt = performance.now(); } }
  hitsEgg(clientX, clientY) {
    if (!this.egg || this.egg.gone) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObject(this.egg.mesh, false)[0];
    return !!hit && hit.distance < 3.5;
  }
  stepEgg(now) {
    const e = this.egg; if (!e || !e.group.visible) return;
    if (!e.gone) { e.mesh.rotation.z = this.reduce ? 0 : Math.sin(now / 160) * 0.16 * Math.max(0, Math.sin(now / 1300)); e.light.intensity = 2.2 + (this.reduce ? 0 : Math.sin(now / 500) * 0.4); return; }
    const a = Math.min(1, (now - e.goneAt) / (this.reduce ? 1 : 650));
    if (e.gone === 1) { e.group.position.y = a * 1.1; e.group.scale.setScalar(1 - a * 0.7); } else { e.group.position.y = -a * 0.45; e.light.intensity = 2.2 * (1 - a); }
    if (a >= 1) e.group.visible = false;
  }
  /** How far the door is and whether you're looking at it (1 = straight at it). */
  doorView() {
    if (!this.door) return { dist: 99, facing: -1 };
    const p = this.door.group.position, dx = p.x - this.pos.x, dz = p.z - this.pos.y, d = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    return { dist: d, facing: (fx * dx + fz * dz) / d };
  }
  /** Did a tap at this screen point land on the door (and close enough to reach)? */
  hitsDoor(clientX, clientY) {
    if (!this.door) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObject(this.door.slab, false)[0];
    return !!hit && hit.distance < 4.5;
  }
  /** Behind the door: stop drawing (and stop the visitor) until you come back. The shift clock is the server's and keeps going. */
  setPaused(p) {
    if (p === !!this.paused) return;
    this.paused = p;
    if (p) cancelAnimationFrame(this.raf); else { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }
  distanceToPool() { return this.deposits && !this.hasPoolTarget ? 99 : Math.hypot(this.pos.x - this.poolPos.x, this.pos.y - this.poolPos.z); }
  /** Tiles to walk to the current pool through the tunnels: what the geiger reads. Reach stays straight-line (distanceToPool). */
  pathToPool() {
    if (this.deposits && !this.hasPoolTarget) return 99;
    const x = Math.round(this.poolPos.x / TILE), y = Math.round(this.poolPos.z / TILE), key = `${x},${y}`;
    if (this.poolDistKey !== key) { this.poolDistKey = key; this.poolDist = distFrom(this.maze.grid, x, y); }
    return pathSteps(this.poolDist, this.pos.x / TILE, this.pos.y / TILE);
  }
  loop(now) {
    if (this.paused) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { f, s, t } = this.input;
    this.yaw -= t * TURN * dt;
    if (!this.mining && (f || s)) {
      const sp = SPEED * dt * (f && s ? 0.75 : 1);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // right
      const dx = (fx * f + rx * s) * sp, dz = (fz * f + rz * s) * sp;
      const bx = this.blocked(this.pos.x + dx, this.pos.y), bz = this.blocked(this.pos.x, this.pos.y + dz);
      if (!bx) this.pos.x += dx;
      if (!bz) this.pos.y += dz;
      this.pushing = f > 0 && (bx || bz) && !!this.stalker?.blocks(this.pos.x + dx * 4, this.pos.y + dz * 4, RADIUS);
      this.bob += dt * 9; this.onStep?.();
    } else this.pushing = false;
    if (this.stalker) this.updateVisitor(now, dt);
    const swing = this.mining ? Math.sin(now / 70) * 0.04 : 0;
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.bob) * 0.045 + swing, this.pos.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const dread = this.dreadLevel || 0;
    const dip = !this.reduce && Math.random() < 0.004 + dread * 0.02 ? -10 - dread * 4 : 0;
    this.lamp.intensity = 16 + Math.sin(now / 90) * 0.6 + dip; // a tired headlamp (more tired when he's near)
    this.poolLight.intensity = 11 + (this.reduce ? 0 : Math.sin(now / 380) * 4);
    if (!this.reduce) this.poolTex.offset.set(now / 9000, now / 13000);
    if (this.door) { const k = this.reduce ? 0.7 : 0.55 + 0.25 * Math.sin(now / 700); this.door.seamMat.opacity = k; this.doorLight.intensity = 1.2 + k; }
    for (const d of this.drops) {
      const u = d.userData;
      if (u.wait > 0) { u.wait -= dt; d.position.y = WALL_H - 0.02; continue; }
      u.v += 9.8 * dt; d.position.y -= u.v * dt;
      if (d.position.y < 0) { u.v = 0; u.wait = 0.6 + Math.random() * 3; d.position.y = WALL_H; }
    }
    this.stepEgg(now);
    this.onNear?.(this.distanceToPool(), this.pathToPool());
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    disposeMeshes(this.scene);
    this.renderer.dispose();
  }
}
export const MINE_REACH = 1.9;

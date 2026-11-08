// three.js renderer for one Acid Mines shift: low-res first-person tunnels, headlamp, glowing pool, drips.
import * as THREE from 'three';
import { rng } from './maze.js';
import { MIN_GAP } from './stalker.js';

const TILE = 2.2, WALL_H = 2.6, EYE = 1.35, RADIUS = 0.38, SPEED = 3.6, TURN = 2.3;

function canvasTex(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rockTexture(r) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#1b1f18'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = 18 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v + 6},${v - 4})`; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, Math.floor(r() * h), w, 1); }
    for (let i = 0; i < 4; i++) { // acid streaks
      const x = Math.floor(r() * w); let y = 0; g.fillStyle = 'rgba(120,255,60,.55)';
      const len = 10 + r() * 40; for (; y < len; y++) g.fillRect(x + (r() < 0.1 ? 1 : 0), y, 1, 1);
      g.fillStyle = 'rgba(170,255,90,.8)'; g.fillRect(x - 1, y, 3, 2);
    }
  });
}
function floorTexture(r) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#10130e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const v = 12 + Math.floor(r() * 26); g.fillStyle = `rgb(${v},${v + 4},${v})`; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 1); }
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
function poolTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.4) + Math.sin(y * 0.33 + x * 0.1) + Math.sin((x + y) * 0.21);
      const k = (v + 3) / 6; g.fillStyle = `rgb(${Math.floor(40 + 120 * k)},${Math.floor(200 + 55 * k)},${Math.floor(20 + 40 * k)})`; g.fillRect(x, y, 1, 1);
    }
  });
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
  constructor(canvas, maze, { onNear, onStep, stalker, localStart, reduceMotion = false, onDread, onEvent } = {}) {
    this.maze = maze; this.onNear = onNear; this.onStep = onStep;
    this.stalker = stalker || null; this.localStart = localStart ?? Date.now(); this.reduce = reduceMotion; this.onDread = onDread; this.onEvent = onEvent;
    const r = rng(maze.grid.length * 7919 + maze.pool.x * 31 + maze.pool.y);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scale = 0.34; // render small, upscale with pixelated CSS for the CRT look
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#020402');
    this.scene.fog = new THREE.Fog('#020402', 2.5, 17);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight('#3a5a2a', 0.55));
    this.lamp = new THREE.PointLight('#d9ffc2', 18, 11, 1.6);
    this.camera.add(this.lamp);

    const { grid, size } = maze;
    const wallMat = new THREE.MeshLambertMaterial({ map: rockTexture(r) });
    let n = 0; for (const row of grid) for (const v of row) n += v;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, WALL_H, TILE), wallMat, n);
    const m = new THREE.Matrix4(); let i = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y][x]) { m.makeTranslation(x * TILE, WALL_H / 2, y * TILE); walls.setMatrixAt(i++, m); }
    this.scene.add(walls);
    const floorT = floorTexture(r); floorT.repeat.set(size, size);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size * TILE, size * TILE), new THREE.MeshLambertMaterial({ map: floorT }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((size - 1) * TILE / 2, 0, (size - 1) * TILE / 2); this.scene.add(floor);
    const ceilT = rockTexture(r); ceilT.repeat.set(size, size);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size * TILE, size * TILE), new THREE.MeshLambertMaterial({ map: ceilT, color: '#7a8a70' }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(floor.position.x, WALL_H, floor.position.z); this.scene.add(ceil);

    // Support beams every few tiles of open corridor, and hazard signs on some walls.
    const beamMat = new THREE.MeshLambertMaterial({ color: '#3b2f1d' });
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
    this.poolTex = poolTexture(); this.poolTex.repeat.set(2, 2);
    const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ map: this.poolTex, color: '#b6ff7a' }));
    poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.copy(this.poolPos).setY(0.02); this.scene.add(poolMesh);
    this.poolMesh = poolMesh; this.crystals = [];
    this.poolLight = new THREE.PointLight('#7dff3a', 14, 9, 1.4); this.poolLight.position.copy(this.poolPos).setY(0.6); this.scene.add(this.poolLight);
    // crystals around the pool
    const crystalMat = new THREE.MeshBasicMaterial({ color: '#8dff5a' });
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
    const dropGeo = new THREE.SphereGeometry(0.035, 4, 3); const dropMat = new THREE.MeshBasicMaterial({ color: '#a8ff5e' });
    const open = []; for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (!grid[y][x]) open.push([x, y]);
    for (let k = 0; k < 70; k++) {
      const [x, y] = open[Math.floor(r() * open.length)];
      const d = new THREE.Mesh(dropGeo, dropMat); d.scale.y = 2.4;
      d.userData = { x: x * TILE + (r() - 0.5) * TILE * 0.8, z: y * TILE + (r() - 0.5) * TILE * 0.8, v: 0, wait: r() * 3 };
      d.position.set(d.userData.x, WALL_H, d.userData.z); this.scene.add(d); this.drops.push(d);
    }
    for (const [x, y] of open) if (r() < 0.06) { // puddle glints
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.18 + r() * 0.2, 8), new THREE.MeshBasicMaterial({ color: '#3c8a1c' }));
      p.rotation.x = -Math.PI / 2; p.position.set(x * TILE + (r() - 0.5), 0.015, y * TILE + (r() - 0.5)); this.scene.add(p);
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
  distanceToPool() { return Math.hypot(this.pos.x - this.poolPos.x, this.pos.y - this.poolPos.z); }
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
    this.poolLight.intensity = 11 + Math.sin(now / 380) * 4;
    this.poolTex.offset.set(now / 9000, now / 13000);
    if (this.door) { const k = this.reduce ? 0.7 : 0.55 + 0.25 * Math.sin(now / 700); this.door.seamMat.opacity = k; this.doorLight.intensity = 1.2 + k; }
    for (const d of this.drops) {
      const u = d.userData;
      if (u.wait > 0) { u.wait -= dt; d.position.y = WALL_H - 0.02; continue; }
      u.v += 9.8 * dt; d.position.y -= u.v * dt;
      if (d.position.y < 0) { u.v = 0; u.wait = 0.6 + Math.random() * 3; d.position.y = WALL_H; }
    }
    this.stepEgg(now);
    this.onNear?.(this.distanceToPool());
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
    this.renderer.dispose();
  }
}
export const MINE_REACH = 1.9;

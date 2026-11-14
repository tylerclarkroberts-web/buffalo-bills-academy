// v79: draws the acid worms (grotesque trilobites, see wormMesh.js) in 3D on their own small transparent canvas over the tunnel view (wormMesh.js has the
// worm). One orthographic camera in CSS pixels, so a worm sits exactly in its on-screen box (worms.js decides where
// and how big; the DOM keeps an invisible hit box there for taps and swipes). Drawn at half resolution with crisp
// pixels like the mine, and only while a worm or a chunk is on screen. createWormLayer() returns null when WebGL
// is not available, and the page falls back to the flat worms.
import * as THREE from 'three';
import { buildWorm, wormMaterials } from './wormMesh.js';

export const LAYER_SCALE = 0.5;
const GRAVITY = 1800; // px/s²: chunks fall off the glass

export function createWormLayer(canvas, opts) {
  try { return new WormLayer(canvas, opts); } catch { return null; }
}

/** The box a worm fills on screen (same rule as the CSS hit box). */
export const wormBox = (w, W, H) => Math.min(w.size * Math.max(W, H), 0.92 * Math.min(W, H));

export class WormLayer {
  constructor(canvas, { reduce = false, onLost } = {}) {
    this.canvas = canvas; this.reduce = reduce;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', premultipliedAlpha: true });
    if (!this.renderer.getContext()) throw new Error('no webgl');
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
    this.camera.position.z = 1000;
    this.scene.add(new THREE.AmbientLight('#b8d8a0', 0.75));
    const key = new THREE.DirectionalLight('#fffbe8', 1.9); key.position.set(-0.4, 0.7, 1); this.scene.add(key); // your lantern, on the glass
    const rim = new THREE.DirectionalLight('#7dff3a', 0.7); rim.position.set(0.6, -0.5, 0.4); this.scene.add(rim); // the acid's own glow
    this.mats = wormMaterials();
    this.worms = new Map(); this.chunks = []; this.pointer = null; this.raf = 0; this.last = 0;
    this.loop = this.loop.bind(this);
    this.lost = () => onLost?.();
    canvas.addEventListener('webglcontextlost', this.lost);
    this.resize();
  }
  resize() {
    const W = this.canvas.clientWidth || window.innerWidth, H = this.canvas.clientHeight || window.innerHeight;
    this.W = W; this.H = H;
    this.renderer.setPixelRatio(LAYER_SCALE); this.renderer.setSize(W, H, false);
    Object.assign(this.camera, { left: 0, right: W, top: 0, bottom: -H }); this.camera.updateProjectionMatrix();
    for (const w of this.worms.values()) this.place(w);
    this.kick();
  }
  place(w) {
    const S = wormBox(w.spec, this.W, this.H);
    w.mesh.group.position.set(w.spec.x * this.W, -w.spec.y * this.H, 0);
    w.mesh.group.rotation.z = -w.spec.rot * Math.PI / 180;
    w.mesh.group.scale.set(S * (w.spec.flip ? -1 : 1), S, S);
  }
  /** The worms on screen now (worms.js objects): add the new ones (they leap on), drop the gone ones. */
  sync(list) {
    const ids = new Set(list.map((w) => w.id));
    for (const [id, w] of this.worms) if (!ids.has(id)) { this.scene.remove(w.mesh.group); w.mesh.dispose(); this.worms.delete(id); }
    for (const spec of list) if (!this.worms.has(spec.id)) {
      let seed = spec.id * 9301 + 49297; const rand = () => ((seed = (seed * 233280 + 49297) % 2147483647) / 2147483647);
      const w = { spec, mesh: buildWorm(this.mats, { rand, reduce: this.reduce }), age: 0 };
      this.place(w); this.scene.add(w.mesh.group); this.worms.set(spec.id, w);
    }
    this.kick();
  }
  /** Where the finger or cursor is (CSS px); the eyes follow it for a couple of seconds. */
  setPointer(x, y) { this.pointer = { x, y, at: performance.now() }; this.kick(); }
  /** The knife went through worm `id` along screen direction (dx, dy): it comes apart and falls away. */
  cut(id, dx = 1, dy = -1) {
    const w = this.worms.get(id); if (!w) return false;
    const g = w.mesh.group, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = -dy / len; // screen y down -> world y up
    const nx = -uy, ny = ux; // the cut's normal: the two sides fly apart along it
    const S = Math.abs(g.scale.y), flip = Math.sign(g.scale.x), rz = g.rotation.z, c = Math.cos(rz), s = Math.sin(rz);
    for (const p of w.mesh.pieces()) {
      const lx = p.x * S * flip, ly = p.y * S, wx = g.position.x + lx * c - ly * s, wy = g.position.y + lx * s + ly * c;
      const side = Math.sign((wx - g.position.x) * nx + (wy - g.position.y) * ny) || (p.head ? 1 : -1);
      const mat = (p.leg ? this.mats.limb : this.mats.body).clone(); mat.transparent = true; mat.opacity = 1;
      const m = new THREE.Mesh(p.geometry, mat); m.scale.copy(g.scale); m.rotation.z = rz; m.position.set(wx, wy, 0);
      if (p.head) { const f = w.mesh.face.clone(); f.traverse((o) => { if (o.isMesh) o.geometry = o.geometry.clone(); }); f.position.x -= p.x; f.position.y -= p.y; m.add(f); }
      this.scene.add(m);
      const kick = S * (0.9 + Math.random() * 0.7);
      this.chunks.push({ m, mat, vx: (nx * side * kick + ux * S * (Math.random() - 0.3) * 1.2), vy: (ny * side * kick + uy * S * (Math.random() - 0.3) * 1.2) + S * 0.6,
        spin: (Math.random() - 0.5) * (p.leg ? 22 : 12), tumble: (Math.random() - 0.5) * 10, life: 0, leg: p.leg, ph: Math.random() * 6 });
    }
    g.updateMatrixWorld(true);
    const smear = new THREE.Mesh(w.mesh.smear.geometry.clone(), this.mats.smear.clone()); smear.applyMatrix4(w.mesh.smear.matrixWorld); this.scene.add(smear);
    this.chunks.push({ m: smear, mat: smear.material, fadeOnly: true, life: 0 });
    this.scene.remove(g); this.worms.delete(id); w.mesh.dispose();
    this.kick(); return true;
  }
  kick() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); } }
  loop(now) {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const p = this.pointer && now - this.pointer.at < 2500 ? this.pointer : null;
    for (const w of this.worms.values()) {
      w.age += dt;
      const g = w.mesh.group; this.place(w);
      // the leap: up from below in an arc, a squash on the glass, a wobble, then it keeps pressing against it
      const t = this.reduce ? 1 : Math.min(1, w.age / 0.42), since = w.age - 0.42;
      if (t < 1) { g.position.y -= (1 - t) ** 2 * this.H * 0.7; g.scale.multiplyScalar(0.3 + 0.7 * t); }
      else if (!this.reduce) {
        const q = 0.14 * Math.exp(-since * 8) * Math.cos(since * 28) + 0.025 * Math.sin(w.age * 1.7 + w.spec.id);
        g.scale.x *= 1 + q; g.scale.y *= 1 - q * 0.8;
      }
      w.mesh.smear.scale.setScalar(this.reduce ? 1 : Math.min(1, Math.max(0.05, (w.age - 0.3) / 0.25)));
      // eyes: toward the finger, in the worm's own box
      let target = null;
      if (p) {
        const lx = p.x - g.position.x, ly = -p.y - g.position.y, c = Math.cos(-g.rotation.z), s = Math.sin(-g.rotation.z);
        target = { x: (lx * c - ly * s) / g.scale.x, y: (lx * s + ly * c) / g.scale.y };
      }
      w.mesh.update(dt, target);
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const k = this.chunks[i]; k.life += dt;
      if (!k.fadeOnly) { k.vy -= GRAVITY * dt; k.m.position.x += k.vx * dt; k.m.position.y += k.vy * dt; k.m.rotation.z += k.spin * dt; k.m.rotation.x += k.tumble * dt; }
      if (k.leg && !this.reduce) k.m.rotation.y = 0.6 * Math.sin(k.life * 38 + k.ph); // a loose leg keeps twitching
      k.mat.opacity = Math.max(0, (k.fadeOnly ? 0.38 : 1) * (1 - k.life / (k.fadeOnly ? 0.5 : 0.9)));
      if (k.life > (k.fadeOnly ? 0.5 : 0.9)) { this.scene.remove(k.m); this.drop(k); this.chunks.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
    if (this.worms.size || this.chunks.length) this.raf = requestAnimationFrame(this.loop);
  }
  drop(k) { k.m.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); k.mat.dispose(); }
  /** Draw calls right now (for the budget check in the browser test). */
  get calls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }
  dispose() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    for (const w of this.worms.values()) w.mesh.dispose();
    for (const k of this.chunks) this.drop(k);
    for (const m of Object.values(this.mats)) m.dispose();
    this.renderer.dispose();
  }
}

// v45: the Foreman, a separate character from Guntrad. Huge, absurdly top-heavy low-poly body (barrel torso, ham
// arms, a hard hat) on tiny stubby legs, with his face as a flat low-poly mesh built from foreman-face.json (made by
// scripts/make-foreman.mjs with the avatar pipeline). The jaw is every face vertex below mouthY: it drops with
// `mouth` (0..1) so it flaps with the grunts. Motion: a stomp-bob, arm waving, and a lurch on yells. With reduced
// motion he stands still and only the mouth moves (a small amount).
import * as THREE from 'three';
import FACE from './foreman-face.json';

export class ForemanScene {
  constructor(canvas, { still = false } = {}) {
    this.still = still; this.mouth = 0; this.yell = 0; this.t = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * 0.5); // chunky low-res look
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); this.cam.position.set(0, 1.55, 7.2); this.cam.lookAt(0, 1.45, 0);
    this.scene.add(new THREE.HemisphereLight('#fff4dc', '#3a2a1a', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4); sun.position.set(2, 4, 5); this.scene.add(sun);
    const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const shirt = M('#c8562c'), denim = M('#3d4f6e'), skin = M('#d79a74'), boot = M('#2b1d14'), hat = M('#e8b81e');
    const rig = (this.rig = new THREE.Group()); this.scene.add(rig);
    const mesh = (geo, mat, x, y, z, parent = rig) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    // stubby legs and boots
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.32, 6), denim, s * 0.32, 0.26, 0); mesh(new THREE.BoxGeometry(0.42, 0.16, 0.56), boot, s * 0.32, 0.08, 0.08); }
    // massive torso: a wide low-poly barrel, overalls bib, belly
    const torso = mesh(new THREE.IcosahedronGeometry(1, 1), shirt, 0, 1.35, 0); torso.scale.set(1.45, 1.0, 0.95);
    const bib = mesh(new THREE.BoxGeometry(1.1, 0.8, 0.2), denim, 0, 1.1, 0.86); bib.rotation.x = -0.12;
    // ham arms on shoulder pivots
    this.arms = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 1.45, 1.85, 0); rig.add(p);
      const up = mesh(new THREE.CylinderGeometry(0.34, 0.28, 1.0, 6), shirt, 0, -0.45, 0, p); up.rotation.z = s * 0.2;
      const fist = mesh(new THREE.IcosahedronGeometry(0.3, 0), skin, s * 0.12, -1.05, 0, p); fist.scale.set(1, 1.1, 1);
      p.userData.s = s; return p;
    });
    // head: the face mesh on a skin-colored egg, with a hard hat. Big.
    const head = (this.head = new THREE.Group()); head.position.set(0, 2.85, 0.15); rig.add(head);
    const skull = mesh(new THREE.IcosahedronGeometry(0.78, 1), skin, 0, 0, -0.2, head); skull.scale.set(0.95, 1.12, 0.8);
    const brim = mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.08, 10), hat, 0, 0.58, -0.12, head); brim.rotation.x = -0.08;
    mesh(new THREE.SphereGeometry(0.74, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0.6, -0.18, head);
    this.face = this.buildFace(); this.face.position.set(0, -0.04, 0.46); head.add(this.face);
    this.resize(); this.raf = 0; this.last = performance.now();
    const loop = (now) => { this.raf = requestAnimationFrame(loop); this.frame(Math.min(0.05, (now - this.last) / 1000)); this.last = now; };
    this.raf = requestAnimationFrame(loop);
  }
  buildFace() {
    const { w, h, mouthY, tris } = FACE, n = tris.length / 9, S = 1.4 / h;
    const pos = new Float32Array(n * 9), col = new Float32Array(n * 9);
    this.base = new Float32Array(n * 9); this.jawW = new Float32Array(n * 3); const m = mouthY * h;
    for (let i = 0; i < n; i++) {
      const t = tris.slice(i * 9, i * 9 + 9);
      for (let v = 0; v < 3; v++) {
        const x = t[v * 2], y = t[v * 2 + 1], k = i * 9 + v * 3;
        this.base[k] = (x - w / 2) * S; this.base[k + 1] = (h / 2 - y) * S; this.base[k + 2] = 0;
        this.jawW[i * 3 + v] = y > m ? (y - m) / (h - m) : 0; // 0 at the mouth line, 1 at the chin
        col[k] = t[6] / 255; col[k + 1] = t[7] / 255; col[k + 2] = t[8] / 255;
      }
    }
    pos.set(this.base);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }
  resize() {
    const c = this.renderer.domElement, w = c.clientWidth || 300, h = c.clientHeight || 300;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h;
    // keep the whole body in frame on tall and wide screens
    const t = Math.tan((this.cam.fov / 2) * Math.PI / 180), a = w / h; // fit ~4.3 tall x 4.9 wide (arms waving), with margin
    this.cam.position.set(0, 1.9, Math.max(2.25 / t, 2.5 / (t * a))); this.cam.lookAt(0, 1.9, 0); this.cam.updateProjectionMatrix();
  }
  frame(dt) {
    this.t += dt; const t = this.t, still = this.still;
    this.yell = Math.max(0, this.yell - dt * 2.5);
    const open = Math.min(1, this.mouth) * (still ? 0.5 : 1), drop = open * 0.22;
    const p = this.face.geometry.attributes.position;
    for (let i = 0, n = this.jawW.length; i < n; i++) p.array[i * 3 + 1] = this.base[i * 3 + 1] - this.jawW[i] * drop;
    p.needsUpdate = true;
    if (!still) {
      const stomp = Math.abs(Math.sin(t * 5));
      this.rig.position.y = stomp * 0.12 + this.yell * 0.15; this.rig.rotation.z = Math.sin(t * 5) * 0.05;
      this.rig.rotation.x = -this.yell * 0.12;
      for (const a of this.arms) a.rotation.z = a.userData.s * (0.5 + Math.sin(t * 7 + a.userData.s) * 0.6 + this.yell * 1.2);
      this.head.rotation.z = Math.sin(t * 9) * 0.06 * (0.4 + open);
    }
    this.renderer.render(this.scene, this.cam);
  }
  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); this.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
}

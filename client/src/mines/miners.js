// v71: the other miners on today's shift. The server says where they are (about four times a second);
// this draws each one as a little hard-hat miner with their own face, eases them toward the latest report,
// and labels them. Their front is +z like the faun; from behind you see a hard hat and the back of a head.
import * as THREE from 'three';
import { headParts, looks } from '../avatar/genbust.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { spriteCanvas } from '../barn/sprite.js';
import { danceId } from '../../../server/engine/dances.js';
import { resetPose, danceStep } from './dance.js';

const TILE = 2.2;
const mat = (color, extras = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extras });
const canvas = (w, h) => (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null);

/** The generated face (or their photo) on a canvas texture. */
function faceTexture(id, avatar) {
  const c = canvas(120, 144); if (!c) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const ctx = c.getContext('2d');
  const drawParts = () => {
    const P = headParts(id); ctx.save(); ctx.scale(2, 2);
    for (const list of [P.ears, P.skin, P.hair, P.beard]) for (const f of list) { ctx.fillStyle = f.fill; ctx.fill(new Path2D(f.d)); }
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(23, 35, 2.2, 0, 7); ctx.arc(37, 35, 2.2, 0, 7); ctx.fill();
    ctx.fillRect(25, 47, 10, 1.6); ctx.restore(); tex.needsUpdate = true;
  };
  if (avatar?.kind === 'photo' && typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => { ctx.save(); ctx.beginPath(); ctx.ellipse(60, 72, 50, 64, 0, 0, 7); ctx.clip(); ctx.drawImage(img, 0, 0, 120, 144); ctx.restore(); tex.needsUpdate = true; };
    img.onerror = drawParts; img.src = `/api/avatars/${encodeURIComponent(id)}.png?v=${avatar.v || 0}`;
  } else drawParts();
  return tex;
}

function nameTag(text) {
  const c = canvas(256, 64); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(250, ctx.measureText(text).width + 24);
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(128 - w / 2, 10, w, 44);
  ctx.fillStyle = '#d8ff9a'; ctx.fillText(text, 128, 33, 230);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.2, 0.3, 1); return s;
}

/**
 * A hard-hat miner. v89: jointed so it can dance. Legs and arms hang from hip and shoulder pivots, the upper body
 * pivots at the hips and the head on the neck; `body` carries everything but the name tag and the bug, so a spin or a
 * drop to the floor never drags the label along. Front is +z.
 */
export function buildMiner({ id, name, avatar, bug }) {
  const L = looks(id);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const add = (parent, geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const denim = mat('#2d3c5a'), boot = mat('#2a1c14'), shirt = mat(L.shirt), skin = mat(L.skin), hair = mat(L.hair), hat = mat('#e8b923');
  const HIP = 0.78, SHOULDER = 1.32 - HIP, NECK = 1.56 - HIP;
  const legL = pivot(body, -0.1, HIP, 0), legR = pivot(body, 0.1, HIP, 0);
  for (const leg of [legL, legR]) {
    add(leg, new THREE.CylinderGeometry(0.08, 0.07, 0.78, 6), denim, 0, -0.39, 0);
    add(leg, new THREE.BoxGeometry(0.14, 0.08, 0.24), boot, 0, -0.74, 0.04);
  }
  const upper = pivot(body, 0, HIP, 0);
  add(upper, new THREE.CylinderGeometry(0.2, 0.17, 0.62, 7), shirt, 0, 1.08 - HIP, 0);
  const armL = pivot(upper, -0.26, SHOULDER, 0), armR = pivot(upper, 0.26, SHOULDER, 0);
  for (const arm of [armL, armR]) add(arm, new THREE.CylinderGeometry(0.055, 0.05, 0.56, 5), shirt, 0, -0.26, 0);
  const head = pivot(upper, 0, NECK, 0);
  add(head, new THREE.SphereGeometry(0.17, 10, 8), hair, 0, 0.01, -0.01); // back of the head
  const tex = faceTexture(id, avatar);
  add(head, new THREE.PlaneGeometry(0.3, 0.36), tex ? new THREE.MeshLambertMaterial({ map: tex, transparent: true }) : skin, 0, 0, 0.16);
  const dome = add(head, new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0.1, 0);
  const brim = add(head, new THREE.CylinderGeometry(0.25, 0.25, 0.025, 12), hat, 0, 0.1, 0.03);
  // the headlamp stays visible past the fog: you see a light bobbing in the dark before you see who it is
  const lamp = add(head, new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }), 0, 0.18, 0.19);
  const tag = nameTag(String(name || 'A MINER').toUpperCase()); if (tag) { tag.position.set(0, 2.08, 0); g.add(tag); }
  let pet = null;
  const species = bug && BY_ID[bug.species];
  if (species && typeof document !== 'undefined') {
    const t = new THREE.CanvasTexture(spriteCanvas(species, null));
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    pet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    pet.position.set(0.45, 0.32, 0.2); g.add(pet);
  }
  return { group: g, body, upper, head, legL, legR, armL, armR, lamp, tag, pet, hat: [dome, brim, lamp] }; // `hat`: what comes off at the picnic
}

/** Walking (or standing): swing the legs and arms from the joints, and put everything a dance moved back. */
export function walkPose(m, phase, moving, reduce) {
  resetPose(m);
  const sw = moving && !reduce ? Math.sin(phase) * 0.45 : 0;
  m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.8; m.armR.rotation.x = sw * 0.8;
  m.body.position.y = moving && !reduce ? Math.abs(Math.sin(phase)) * 0.03 : 0;
}

/** All of them, keyed by player id. `set()` takes the server's list; `update()` runs every frame. */
export class OtherMiners {
  /** `tile` scales the server's coordinates to metres; `ground(x, z)` is the floor height (the mine's is flat). */
  constructor(scene, { reduceMotion = false, tile = TILE, ground = () => 0 } = {}) { this.scene = scene; this.reduce = reduceMotion; this.tile = tile; this.ground = ground; this.map = new Map(); }
  set(list = []) {
    const seen = new Set();
    for (const o of list) {
      seen.add(o.id);
      let m = this.map.get(o.id);
      const key = `${o.avatar?.kind || ''}:${o.avatar?.v || 0}:${o.bug?.species || ''}:${o.name}`;
      if (m && m.key !== key) { this.remove(o.id); m = null; }
      if (!m) {
        m = { ...buildMiner(o), key, x: o.x * this.tile, z: o.y * this.tile, yaw: o.yaw, walk: 0 };
        this.scene.add(m.group); this.map.set(o.id, m);
      }
      m.tx = o.x * this.tile; m.tz = o.y * this.tile; m.tyaw = o.yaw; m.shield = o.shield; m.cooling = o.cooling;
      const d = danceId(o.dance); if (d !== (m.dance || null)) { m.dance = d; m.danceT = 0; }
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this.remove(id);
  }
  remove(id) {
    const m = this.map.get(id); if (!m) return;
    this.scene.remove(m.group);
    m.group.traverse((o) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const x of ms) { x.map?.dispose?.(); x.dispose?.(); } });
    this.map.delete(id);
  }
  update(dt, now, cameraYaw) {
    const k = 1 - Math.exp(-dt * 9);
    for (const m of this.map.values()) {
      const dx = m.tx - m.x, dz = m.tz - m.z, far = Math.hypot(dx, dz);
      if (far > TILE * 3) { m.x = m.tx; m.z = m.tz; } else { m.x += dx * k; m.z += dz * k; }
      let dy = m.tyaw - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.yaw += dy * k;
      m.group.position.set(m.x, this.ground(m.x, m.z), m.z); m.group.rotation.y = m.yaw + Math.PI;
      const moving = far > 0.05;
      m.walk += moving && !this.reduce ? dt * 9 : 0;
      if (m.dance && !moving) { m.danceT += dt; danceStep(m, m.dance, m.danceT, { reduce: this.reduce }); } // v89: the server says they're dancing
      else walkPose(m, m.walk, moving, this.reduce);
      if (m.pet) { m.pet.rotation.y = cameraYaw - m.group.rotation.y; m.pet.position.y = 0.32 + (this.reduce ? 0 : Math.sin(now / 300) * 0.04); }
    }
  }
  dispose() { for (const id of [...this.map.keys()]) this.remove(id); }
}

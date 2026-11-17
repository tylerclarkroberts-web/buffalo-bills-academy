// v71: the other miners on today's shift. The server says where they are (about four times a second);
// this draws each one as a little hard-hat miner with their own face, eases them toward the latest report,
// and labels them. Their front is +z like the faun; from behind you see a hard hat and the back of a head.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { headParts, looks, shade } from '../avatar/genbust.js';
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
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const ctx = c.getContext('2d');
  let disposed = false, img;
  tex.addEventListener('dispose', () => { disposed = true; if (img) img.onload = img.onerror = null; });
  const drawParts = () => {
    if (disposed) return;
    const P = headParts(avatar?.seed || id); ctx.clearRect(0, 0, c.width, c.height); ctx.save(); ctx.scale(2, 2);
    for (const list of [P.ears, P.skin, P.beard, P.hair]) for (const f of list) { ctx.fillStyle = f.fill; ctx.fill(new Path2D(f.d)); }
    if (P.L.brows) { ctx.fillStyle = P.L.hair; ctx.fillRect(19, 31, 8, 1.5); ctx.fillRect(33, 31, 8, 1.5); }
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(23, 36, 2.2, 0, 7); ctx.arc(37, 36, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = shade(P.L.skin, -.18); ctx.fill(new Path2D('M30 37 L27.5 44 L32 44Z'));
    ctx.strokeStyle = shade(P.L.skin, -.45); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(25, 49); ctx.quadraticCurveTo(30, 51.5, 35, 49); ctx.stroke();
    ctx.restore(); tex.needsUpdate = true;
  };
  drawParts(); // Keep a recognizable face while a photo loads, including failed requests.
  if (avatar?.kind === 'photo' && typeof Image !== 'undefined') {
    img = new Image();
    img.onload = () => {
      if (disposed) return;
      ctx.clearRect(0, 0, c.width, c.height); ctx.save(); ctx.beginPath(); ctx.ellipse(60, 72, 50, 64, 0, 0, 7); ctx.clip();
      ctx.drawImage(img, 0, 0, 120, 144); ctx.restore(); tex.needsUpdate = true;
    };
    img.onerror = drawParts; img.src = `/api/avatars/${encodeURIComponent(id)}.png?v=${avatar.v || 0}`;
  }
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
  const L = looks(avatar?.seed || id);
  const g = new THREE.Group(); g.name = 'mine-miner';
  const pivot = (parent, name, x, y, z) => { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; };
  const body = pivot(g, 'miner-body', 0, 0, 0);
  const denim = mat('#35445b'), boot = mat('#513627'), trim = mat('#252a30'), metal = mat('#a9a49a');
  const shirt = mat(L.shirt), skin = mat(L.skin), hair = mat(L.hair), hat = mat('#e8b923');
  const materials = { denim, boot, trim, metal, shirt, skin, hair, hat };
  for (const [name, material] of Object.entries(materials)) material.name = `miner-${name}`;
  const shapes = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(1, 8, 6), limb: new THREE.CylinderGeometry(.85, 1, 1, 6) };
  const geometry = new Set(Object.values(shapes));
  const add = (parent, shape, material, x, y, z, sx = 1, sy = sx, sz = sx) => {
    const geo = typeof shape === 'string' ? shapes[shape] : shape; geometry.add(geo);
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const HIP = 0.78, SHOULDER = 1.32 - HIP, NECK = 1.56 - HIP;
  const legL = pivot(body, 'miner-leg-left', -.105, HIP, 0), legR = pivot(body, 'miner-leg-right', .105, HIP, 0);
  for (const [leg, side] of [[legL, 'left'], [legR, 'right']]) {
    add(leg, 'limb', denim, 0, -.285, 0, .1, .58, .095);
    add(leg, 'box', trim, 0, -.36, .082, .125, .17, .035); // Reinforced knees.
    add(leg, 'box', denim, side === 'left' ? -.086 : .086, -.15, .005, .045, .17, .13);
    add(leg, 'box', trim, 0, -.56, 0, .18, .055, .17);
    const foot = pivot(leg, `miner-boot-${side}`, 0, -.675, .035);
    add(foot, 'box', boot, 0, .02, -.025, .17, .15, .18);
    add(foot, 'box', boot, 0, -.025, .052, .185, .105, .23);
    add(foot, 'box', trim, 0, -.0825, .03, .2, .045, .29);
    add(foot, 'box', trim, 0, -.005, .14, .19, .075, .04);
    for (const y of [.015, .052]) add(foot, 'box', metal, 0, y, .072, .09, .012, .015);
  }
  const upper = pivot(body, 'miner-upper', 0, HIP, 0);
  add(upper, new THREE.CylinderGeometry(.22, .17, .49, 8), shirt, 0, .325, 0, 1, 1, .69);
  add(upper, 'box', denim, 0, .035, 0, .35, .13, .25);
  add(upper, 'box', trim, 0, .085, 0, .365, .055, .27);
  add(upper, 'box', metal, 0, .085, .145, .07, .055, .025);
  for (const side of [-1, 1]) {
    add(upper, 'box', denim, side * .105, .025, -.137, .12, .1, .025);
    add(upper, 'box', trim, side * .135, .35, .143, .043, .41, .02); // Suspenders, front and back.
    add(upper, 'box', trim, side * .135, .35, -.143, .043, .41, .02);
    add(upper, 'box', metal, side * .135, .42, .157, .052, .045, .018);
    add(upper, 'box', shirt, side * .075, .61, .045, .1, .07, .12).rotation.z = side * .3;
  }
  add(upper, 'box', denim, -.052, .34, .157, .11, .12, .022);
  add(upper, 'box', metal, -.052, .395, .172, .025, .014, .012);
  add(upper, 'limb', skin, 0, .66, 0, .073, .15, .07);
  const armL = pivot(upper, 'miner-arm-left', -.26, SHOULDER, 0), armR = pivot(upper, 'miner-arm-right', .26, SHOULDER, 0);
  for (const [arm, side, sign] of [[armL, 'left', -1], [armR, 'right', 1]]) {
    add(arm, 'ball', shirt, 0, -.035, 0, .1, .105, .095);
    add(arm, 'limb', shirt, 0, -.14, 0, .08, .22, .08);
    add(arm, 'box', trim, 0, -.245, 0, .145, .047, .145);
    add(arm, 'limb', skin, 0, -.35, .004, .061, .2, .06);
    const hand = pivot(arm, `miner-hand-${side}`, 0, -.485, .012);
    add(hand, 'box', skin, 0, 0, 0, .105, .125, .085);
    add(hand, 'box', skin, -sign * .055, .015, .027, .04, .068, .055).rotation.z = -sign * .3;
    for (const x of [-.028, .004, .035]) add(hand, 'box', skin, x, -.058, .008, .026, .035, .075);
  }
  const head = pivot(upper, 'miner-head', 0, NECK, 0);
  add(head, 'ball', skin, 0, -.02, -.005, .145 * L.wide, .17, .13);
  add(head, 'ball', hair, 0, L.style === 'bald' ? -.05 : .015, -.06, .147 * L.wide, L.style === 'bald' ? .075 : .155, .105);
  if (L.style === 'long') add(head, 'box', hair, 0, -.1, -.11, .29, .2, .1);
  if (L.style === 'bun') add(head, 'ball', hair, 0, .025, -.175, .065);
  for (const side of [-1, 1]) add(head, 'ball', skin, side * .148 * L.wide, -.035, -.005, .035, .052, .032);
  const helmet = pivot(head, 'miner-hardhat', 0, .1, 0);
  add(helmet, new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0, 0, .195, .175, .18);
  add(helmet, new THREE.CylinderGeometry(1, 1, 1, 12), hat, 0, .005, .025, .235, .03, .22);
  add(helmet, 'box', hat, 0, .135, 0, .05, .07, .235);
  add(helmet, 'box', trim, 0, .058, -.17, .13, .08, .05);
  add(helmet, 'box', trim, 0, .075, .176, .115, .105, .065);
  add(helmet, 'box', metal, 0, .075, .211, .087, .08, .015);

  // Batch fixed details by joint and material; only the dance joints need separate transforms.
  const joints = []; g.traverse(o => { if (o.isGroup) joints.push(o); });
  for (const joint of joints) for (const material of Object.values(materials)) {
    const pieces = joint.children.filter(o => o.isMesh && o.material === material); if (!pieces.length) continue;
    const baked = pieces.map(piece => { piece.updateMatrix(); const copy = piece.geometry.clone().applyMatrix4(piece.matrix); joint.remove(piece); return copy; });
    joint.add(new THREE.Mesh(mergeGeometries(baked), material)); baked.forEach(geo => geo.dispose());
  }
  geometry.forEach(geo => geo.dispose());

  const tex = faceTexture(id, avatar);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.34, .4), tex ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: .05 }) : skin);
  face.position.set(0, -.005, .135); head.add(face);
  // the headlamp stays visible past the fog: you see a light bobbing in the dark before you see who it is
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 5), new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }));
  lamp.position.set(0, .175, .225); lamp.scale.z = .45; head.add(lamp);
  const tag = nameTag(String(name || 'A MINER').toUpperCase()); if (tag) { tag.position.set(0, 2.08, 0); g.add(tag); }
  let pet = null;
  const species = bug && BY_ID[bug.species];
  if (species && typeof document !== 'undefined') {
    const t = new THREE.CanvasTexture(spriteCanvas(species, null));
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    pet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    pet.position.set(0.45, 0.32, 0.2); g.add(pet);
  }
  return { group: g, body, upper, head, legL, legR, armL, armR, lamp, tag, pet };
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
  constructor(scene, { reduceMotion = false } = {}) { this.scene = scene; this.reduce = reduceMotion; this.map = new Map(); }
  set(list = []) {
    const seen = new Set();
    for (const o of list) {
      seen.add(o.id);
      let m = this.map.get(o.id);
      const key = `${o.avatar?.kind || ''}:${o.avatar?.seed || o.id}:${o.avatar?.v || 0}:${o.bug?.species || ''}:${o.name}`;
      if (m && m.key !== key) { this.remove(o.id); m = null; }
      if (!m) {
        m = { ...buildMiner(o), key, x: o.x * TILE, z: o.y * TILE, yaw: o.yaw, walk: 0 };
        this.scene.add(m.group); this.map.set(o.id, m);
      }
      m.tx = o.x * TILE; m.tz = o.y * TILE; m.tyaw = o.yaw; m.shield = o.shield; m.cooling = o.cooling;
      const d = danceId(o.dance); if (d !== (m.dance || null)) { m.dance = d; m.danceT = 0; }
    }
    for (const id of [...this.map.keys()]) if (!seen.has(id)) this.remove(id);
  }
  remove(id) {
    const m = this.map.get(id); if (!m) return;
    this.scene.remove(m.group);
    const resources = new Set();
    m.group.traverse(o => {
      if (o.isMesh) resources.add(o.geometry); // Three owns the shared geometry of name-tag sprites.
      for (const material of [].concat(o.material || [])) { resources.add(material); if (material.map) resources.add(material.map); }
    });
    resources.forEach(resource => resource.dispose());
    this.map.delete(id);
  }
  update(dt, now, cameraYaw) {
    const k = 1 - Math.exp(-dt * 9);
    for (const m of this.map.values()) {
      const dx = m.tx - m.x, dz = m.tz - m.z, far = Math.hypot(dx, dz);
      if (far > TILE * 3) { m.x = m.tx; m.z = m.tz; } else { m.x += dx * k; m.z += dz * k; }
      let dy = m.tyaw - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.yaw += dy * k;
      m.group.position.set(m.x, 0, m.z); m.group.rotation.y = m.yaw + Math.PI;
      const moving = far > 0.05;
      m.walk += moving && !this.reduce ? dt * 9 : 0;
      if (m.dance && !moving) { m.danceT += dt; danceStep(m, m.dance, m.danceT, { reduce: this.reduce }); } // v89: the server says they're dancing
      else walkPose(m, m.walk, moving, this.reduce);
      if (m.pet) { m.pet.rotation.y = cameraYaw - m.group.rotation.y; m.pet.position.y = 0.32 + (this.reduce ? 0 : Math.sin(now / 300) * 0.04); }
    }
  }
  dispose() { for (const id of [...this.map.keys()]) this.remove(id); }
}

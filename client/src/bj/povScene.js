// First-person 3D dealer table. Low-poly, same three.js stack as the mines and Heeshee scenes.
// Presentation only: every card, chip and gesture is driven by the existing table view.
import * as THREE from 'three';
import { looks, shade, headParts } from '../avatar/genbust.js';
import { shirtOf } from '../avatar/wear.js';
import { gestureFromLog, gestureDuration, revealDelay, samplePose, REST } from './povGestures.js';

export const FELT_Y = 0.76;
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const CHIP_COLOR = { r: '#b01c2c', g: '#1c7a3a', k: '#1a1a1a', b: '#1c4a9a' };
const CHIP_DENOM = [[100, 'b'], [25, 'k'], [5, 'g'], [1, 'r']];

export function canPovWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

const std = (color, extras = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extras });
const canv = (w, h) => (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null);

function feltTexture() {
  const c = canv(512, 512); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0e4a2c'; ctx.fillRect(0, 0, 512, 512);
  const g = ctx.createRadialGradient(256, 220, 40, 256, 240, 380);
  g.addColorStop(0, 'rgba(40,140,80,.35)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2;
  for (let y = 16; y < 512; y += 28) {
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 28) ctx.lineTo(x, y + ((x / 28) % 2 ? 8 : 0));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(212,175,80,.18)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(256, 270, 200, 150, 0, 0, 7); ctx.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function woodTexture() {
  const c = canv(256, 128); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a2e18'; ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(20,8,4,${0.08 + (i % 5) * 0.04})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath(); ctx.moveTo(0, 6 + i * 3); ctx.bezierCurveTo(80, 2 + i * 3, 160, 14 + i * 3, 256, 8 + i * 3); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function cardFace(code) {
  const c = canv(256, 360);
  const ctx = c.getContext('2d');
  const r = !code ? '' : (code[0] === 'T' ? '10' : code[0]);
  const s = code ? SUIT[code[1]] : '';
  const red = code && (code[1] === 'h' || code[1] === 'd');
  ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = '#d9c6a0'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 244, 348);
  ctx.fillStyle = red ? '#b01c2c' : '#16120e';
  ctx.font = 'bold 72px "Times New Roman", serif'; ctx.textBaseline = 'top';
  ctx.fillText(r, 18, 16);
  ctx.font = '64px "Times New Roman", serif'; ctx.fillText(s, 18, 90);
  ctx.save(); ctx.translate(128, 200); ctx.font = '140px "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, 0); ctx.restore();
  ctx.save(); ctx.translate(238, 344); ctx.rotate(Math.PI); ctx.font = 'bold 72px "Times New Roman", serif'; ctx.textBaseline = 'top'; ctx.fillText(r, 0, 0); ctx.font = '64px "Times New Roman", serif'; ctx.fillText(s, 0, 74); ctx.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

function cardBack() {
  const c = canv(256, 360);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a1020'; ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 236, 340);
  ctx.strokeStyle = 'rgba(201,162,39,.45)'; ctx.lineWidth = 2;
  for (let y = 28; y < 340; y += 22) {
    ctx.beginPath();
    for (let x = 24; x < 236; x += 22) { ctx.moveTo(x, y - 6); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 8, y); ctx.closePath(); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function faceTexture(id, avatar) {
  const c = canv(120, 144); if (!c) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  const ctx = c.getContext('2d');
  let disposed = false, img;
  tex.addEventListener('dispose', () => { disposed = true; if (img) img.onload = img.onerror = null; });
  const drawParts = () => {
    if (disposed) return;
    const P = headParts(avatar?.seed || id, avatar?.skinTone); ctx.clearRect(0, 0, c.width, c.height); ctx.save(); ctx.scale(2, 2);
    for (const list of [P.ears, P.skin, P.beard, P.hair]) for (const f of list) { ctx.fillStyle = f.fill; ctx.fill(new Path2D(f.d)); }
    if (P.L.brows) { ctx.fillStyle = P.L.hair; ctx.fillRect(19, 31, 8, 1.5); ctx.fillRect(33, 31, 8, 1.5); }
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(23, 36, 2.2, 0, 7); ctx.arc(37, 36, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = shade(P.L.skin, -0.18); ctx.fill(new Path2D('M30 37 L27.5 44 L32 44Z'));
    ctx.strokeStyle = shade(P.L.skin, -0.45); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(25, 49); ctx.quadraticCurveTo(30, 51.5, 35, 49); ctx.stroke();
    ctx.restore(); tex.needsUpdate = true;
  };
  drawParts();
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

function namePlate(text) {
  const c = canv(256, 64); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(12,8,4,.78)'; ctx.fillRect(8, 10, 240, 44);
  ctx.strokeStyle = 'rgba(242,198,90,.45)'; ctx.strokeRect(8, 10, 240, 44);
  ctx.fillStyle = '#f4efe4'; ctx.font = '600 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').slice(0, 16), 128, 33, 220);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

function chipBreakdown(amount) {
  let n = Math.max(0, Math.round(Number(amount) || 0));
  const out = [];
  for (const [d, k] of CHIP_DENOM) { const c = Math.floor(n / d); n -= c * d; for (let i = 0; i < c && out.length < 24; i++) out.push(k); }
  return out;
}

export function seatLayout(n, i) {
  const count = Math.max(1, n);
  const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
  const spread = count === 1 ? 0 : 1.05;
  const x = t * spread * 1.55;
  const z = 1.48 - Math.abs(t) * 0.16;
  const yaw = -t * 0.55;
  return { x, y: FELT_Y, z, yaw };
}

function add(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, rot) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const pivot = (parent, name, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

function applyCurl(fingers, curl) {
  const [idx, mid, ring, pnk, th] = curl;
  const set = (f, c) => { if (!f) return; f.rotation.x = 0.15 + c * 1.15; };
  set(fingers[0], idx); set(fingers[1], mid); set(fingers[2], ring); set(fingers[3], pnk);
  if (fingers[4]) { fingers[4].rotation.z = 0.4 + th * 0.5; fingers[4].rotation.y = 0.4; }
}

function applyPose(person, pose) {
  const a = pose || REST;
  const set3 = (n, v) => { if (!n || !v) return; n.rotation.set(v[0] || 0, v[1] || 0, v[2] || 0); };
  set3(person.armL, a.armL); set3(person.elL, [a.elL?.[0] || 0, 0, 0]); set3(person.wrL, a.wrL);
  set3(person.armR, a.armR); set3(person.elR, [a.elR?.[0] || 0, 0, 0]); set3(person.wrR, a.wrR);
  applyCurl(person.fingersL, a.curlL || REST.curlL);
  applyCurl(person.fingersR, a.curlR || REST.curlR);
  if (person.stackPush) person.stackPush.position.z = 0.02 + (a.push || 0) * 0.07;
}

function buildHand(parent, skin, sign) {
  const wr = pivot(parent, 'wr', 0, -0.16, 0);
  add(wr, new THREE.BoxGeometry(1, 1, 1), skin, 0, -0.02, 0.01, 0.055, 0.035, 0.07);
  const fingers = [];
  const xs = [-0.02, -0.005, 0.01, 0.025];
  for (const x of xs) {
    const f = pivot(wr, 'f', x, -0.03, 0.03);
    add(f, new THREE.BoxGeometry(1, 1, 1), skin, 0, -0.02, 0.01, 0.01, 0.04, 0.012);
    fingers.push(f);
  }
  const th = pivot(wr, 'th', sign * -0.03, -0.005, 0.01);
  add(th, new THREE.BoxGeometry(1, 1, 1), skin, sign * -0.008, -0.01, 0.01, 0.012, 0.028, 0.014);
  fingers.push(th);
  return { wr, fingers };
}

function buildSeated({ id, name, avatar }) {
  const L = looks(avatar?.seed || id, avatar?.skinTone);
  const shirtHex = shirtOf?.(avatar?.wear, L.shirt) || L.shirt;
  const skin = std(L.skin), shirt = std(shirtHex), pants = std('#2a2433'), shoe = std('#1b1512'), hair = std(L.hair);
  const wood = std('#3a2416'), pad = std('#2a1c14');
  const g = new THREE.Group(); g.name = 'seat-player';
  // Chair behind the rail.
  add(g, new THREE.BoxGeometry(0.32, 0.06, 0.32), pad, 0, 0.47, 0.16);
  add(g, new THREE.BoxGeometry(0.34, 0.42, 0.05), wood, 0, 0.7, 0.30);
  add(g, new THREE.BoxGeometry(0.04, 0.47, 0.04), wood, -0.14, 0.23, 0.04);
  add(g, new THREE.BoxGeometry(0.04, 0.47, 0.04), wood, 0.14, 0.23, 0.04);
  add(g, new THREE.BoxGeometry(0.04, 0.47, 0.04), wood, -0.14, 0.23, 0.28);
  add(g, new THREE.BoxGeometry(0.04, 0.47, 0.04), wood, 0.14, 0.23, 0.28);
  const hips = pivot(g, 'hips', 0, 0.5, 0.14);
  add(hips, new THREE.BoxGeometry(0.26, 0.1, 0.2), pants, 0, 0.02, 0);
  // Legs tuck under the table, toward +z (away from dealer).
  for (const s of [-1, 1]) {
    const leg = pivot(hips, 'leg', s * 0.07, 0, 0.02);
    add(leg, new THREE.CylinderGeometry(0.04, 0.045, 0.32, 6), pants, 0, -0.16, 0.06, 1, 1, 1, [0.5, 0, 0]);
    add(leg, new THREE.BoxGeometry(0.08, 0.05, 0.14), shoe, 0, -0.28, 0.14);
  }
  const torso = pivot(hips, 'torso', 0, 0.08, -0.02);
  torso.rotation.x = 0.18; // lean over the felt
  add(torso, new THREE.CylinderGeometry(0.13, 0.15, 0.34, 8), shirt, 0, 0.2, 0, 1, 1, 0.85);
  add(torso, new THREE.BoxGeometry(0.22, 0.04, 0.16), shirt, 0, 0.04, 0.02); // belt line
  const armL = pivot(torso, 'armL', -0.16, 0.28, 0);
  const armR = pivot(torso, 'armR', 0.16, 0.28, 0);
  const makeArm = (arm, sign) => {
    add(arm, new THREE.SphereGeometry(0.045, 8, 6), shirt, 0, 0, 0);
    add(arm, new THREE.CylinderGeometry(0.035, 0.04, 0.16, 6), shirt, 0, -0.08, 0);
    const el = pivot(arm, 'el', 0, -0.16, 0);
    add(el, new THREE.SphereGeometry(0.03, 8, 6), skin, 0, 0, 0);
    add(el, new THREE.CylinderGeometry(0.025, 0.03, 0.15, 6), skin, 0, -0.08, 0);
    const hand = buildHand(el, skin, sign);
    return { el, wr: hand.wr, fingers: hand.fingers };
  };
  const Larm = makeArm(armL, -1), Rarm = makeArm(armR, 1);
  const neck = pivot(torso, 'neck', 0, 0.38, 0);
  add(neck, new THREE.CylinderGeometry(0.04, 0.045, 0.07, 6), skin, 0, 0.02, 0);
  const head = pivot(neck, 'head', 0, 0.08, 0);
  add(head, new THREE.SphereGeometry(0.09, 10, 8), skin, 0, 0.07, 0.01, L.wide, 1, 0.82);
  if (L.style !== 'bald') add(head, new THREE.SphereGeometry(0.092, 10, 8), hair, 0, 0.1, -0.01, L.wide, L.style === 'buzz' ? 0.55 : 0.75, 0.85);
  if (L.style === 'long') add(head, new THREE.BoxGeometry(0.16, 0.14, 0.06), hair, 0, 0.0, 0.08);
  if (L.style === 'bun') add(head, new THREE.SphereGeometry(0.04, 8, 6), hair, 0, 0.12, 0.09);
  const tex = faceTexture(id, avatar);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), tex
    ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, emissive: '#2a1c14', emissiveMap: tex, emissiveIntensity: 0.35 })
    : skin);
  face.position.set(0, 0.07, -0.12); face.rotation.y = Math.PI; head.add(face);
  const plate = namePlate(name);
  if (plate) {
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: plate, transparent: true, depthWrite: false }));
    tag.position.set(0, 1.22, 0); tag.scale.set(0.32, 0.08, 1); g.add(tag);
  }
  const stackPush = pivot(g, 'stackPush', -0.1, FELT_Y - 0.5, -0.12);
  const person = {
    group: g, hips, torso, head, armL, armR, elL: Larm.el, elR: Rarm.el, wrL: Larm.wr, wrR: Rarm.wr,
    fingersL: Larm.fingers, fingersR: Rarm.fingers, stackPush, seed: (id || name || 'p').length,
    gesture: null, dispose: () => { tex?.dispose(); plate?.dispose(); },
  };
  applyPose(person, REST);
  return person;
}

function buildDealerArms(skinMat, sleeveMat) {
  const g = new THREE.Group(); g.name = 'dealer-arms';
  const make = (sign) => {
    const arm = pivot(g, sign < 0 ? 'L' : 'R', sign * 0.26, -0.38, -0.32);
    arm.rotation.set(0.2, sign * -0.12, sign * 0.2);
    arm.scale.setScalar(0.85);
    add(arm, new THREE.CylinderGeometry(0.035, 0.045, 0.28, 6), sleeveMat, 0, 0.08, 0);
    const el = pivot(arm, 'el', 0, -0.14, 0);
    add(el, new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), skinMat, 0, -0.06, 0);
    const hand = buildHand(el, skinMat, sign);
    return { arm, el, wr: hand.wr, fingers: hand.fingers };
  };
  const L = make(-1), R = make(1);
  return { group: g, ...L, armL: L.arm, elL: L.el, wrL: L.wr, fingersL: L.fingers, armR: R.arm, elR: R.el, wrR: R.wr, fingersR: R.fingers, flick: 0 };
}

function buildBrisk() {
  const g = new THREE.Group(); g.name = 'brisk';
  const coat = std('#161822'), pant = std('#12141c'), tie = std('#7a1c28'), skin = std('#c4a07a'), hair = std('#1a1410'), board = std('#d9c6a0'), gold = std('#c9a227', { metalness: 0.6, roughness: 0.35 });
  add(g, new THREE.CylinderGeometry(0.09, 0.11, 0.42, 8), coat, 0, 1.15, 0, 1, 1, 0.7);
  add(g, new THREE.BoxGeometry(0.04, 0.22, 0.02), tie, 0, 1.22, 0.07);
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6), pant, s * 0.055, 0.62, 0);
    add(g, new THREE.BoxGeometry(0.07, 0.05, 0.12), std('#1a1512'), s * 0.055, 0.32, 0.03);
    const arm = pivot(g, s < 0 ? 'aL' : 'aR', s * 0.16, 1.28, 0);
    add(arm, new THREE.CylinderGeometry(0.03, 0.035, 0.32, 6), coat, 0, -0.14, 0);
    if (s < 0) {
      add(arm, new THREE.BoxGeometry(0.08, 0.1, 0.01), board, -0.05, -0.32, 0.02, 1, 1, 1, [0.2, 0, 0.4]);
    }
  }
  const head = pivot(g, 'head', 0, 1.42, 0);
  add(head, new THREE.SphereGeometry(0.09, 8, 6), skin, 0, 0.07, 0, 0.95, 1, 0.9);
  add(head, new THREE.SphereGeometry(0.092, 8, 6), hair, 0, 0.1, -0.01, 0.95, 0.7, 0.85);
  const tex = faceTexture('pit-boss-brisk', { seed: 'pit-boss-brisk', skinTone: '#c4a07a' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.18), tex
    ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05 })
    : skin);
  face.position.set(0, 0.07, -0.11); face.rotation.y = Math.PI; head.add(face);
  add(head, new THREE.SphereGeometry(0.012, 6, 6), gold, 0.09, 0.08, 0.02); // earpiece
  g.userData.tex = tex; g.userData.head = head;
  return g;
}

function buildTable(res) {
  const root = new THREE.Group(); root.name = 'table';
  const feltMap = feltTexture(); const woodMap = woodTexture();
  res.textures.push(feltMap, woodMap);
  const feltMat = new THREE.MeshLambertMaterial({ color: '#146038', map: feltMap });
  const woodMat = new THREE.MeshLambertMaterial({ color: '#6a3a22', map: woodMap, flatShading: true });
  // A compact half-oval of felt, dealer on -Z, built from a plane (cheaper than a bevelled extrude).
  const felt = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32, 0, Math.PI), feltMat);
  felt.rotation.x = -Math.PI / 2; felt.position.set(0, FELT_Y, 0.55); felt.scale.set(1.05, 0.95, 1);
  felt.receiveShadow = true; felt.castShadow = false; root.add(felt);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.7), feltMat);
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, FELT_Y, 0.18); apron.receiveShadow = true; root.add(apron);
  const rail = (w, d, x, z) => add(root, new THREE.BoxGeometry(w, 0.055, d), woodMat, x, FELT_Y + 0.018, z);
  rail(2.5, 0.08, 0, 1.42);
  rail(0.07, 1.15, -1.22, 0.82);
  rail(0.07, 1.15, 1.22, 0.82);
  rail(2.5, 0.07, 0, -0.16);
  const leg = std('#2a1a10');
  for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3], [-1.1, 0], [1.1, 0]]) add(root, new THREE.BoxGeometry(0.08, FELT_Y, 0.08), leg, x, FELT_Y / 2, z);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std('#1a0e0c', { roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), std('#1c1014', { roughness: 0.95 }));
  wall.position.set(0, 2, 2.4); root.add(wall);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std('#140c0e'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.6; root.add(ceil);
  // Pendant lamp.
  const lamp = new THREE.Group(); lamp.position.set(0, 2.55, 0.45);
  add(lamp, new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), std('#2a2018'), 0, 0.35, 0);
  add(lamp, new THREE.CylinderGeometry(0.22, 0.32, 0.16, 10, 1, true), std('#3a2410', { side: THREE.DoubleSide, roughness: 0.5 }), 0, 0.02, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe8b8' }));
  bulb.position.y = -0.02; lamp.add(bulb);
  root.add(lamp);
  // Shoe, left of the dealer.
  const shoe = new THREE.Group(); shoe.position.set(-0.4, FELT_Y + 0.035, 0.08); shoe.name = 'shoe';
  add(shoe, new THREE.BoxGeometry(0.09, 0.055, 0.13), std('#2a1a12'), 0, 0, 0);
  add(shoe, new THREE.BoxGeometry(0.07, 0.04, 0.015), std('#7a1028'), 0, 0.008, -0.065);
  add(shoe, new THREE.BoxGeometry(0.07, 0.04, 0.01), std('#f4efe4'), 0, 0.008, -0.072);
  root.add(shoe);
  const tray = new THREE.Group(); tray.position.set(0.4, FELT_Y + 0.025, 0.08); tray.name = 'tray';
  add(tray, new THREE.BoxGeometry(0.2, 0.02, 0.1), std('#1a0e08'), 0, -0.006, 0);
  add(tray, new THREE.BoxGeometry(0.19, 0.012, 0.09), std('#3a2214'), 0, 0.004, 0);
  root.add(tray);
  // Betting circles (drawn on a thin decal plane — actual stacks sit on them).
  return { root, shoe, tray, lamp };
}

function makeCardMesh(frontTex, backTex) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.074, 0.104), new THREE.MeshLambertMaterial({ map: frontTex }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.074, 0.104), new THREE.MeshLambertMaterial({ map: backTex }));
  back.rotation.y = Math.PI;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.104, 0.002), std('#f4efe4', { flatShading: true }));
  face.position.z = 0.0012; back.position.z = -0.0012;
  face.castShadow = back.castShadow = edge.castShadow = true;
  g.add(edge, face, back);
  g.userData.face = face;
  return g;
}

export function createPovScene(canvas, opts = {}) {
  try { return new PovScene(canvas, opts); } catch (err) { console.error('pov create', err); return null; }
}

export class PovScene {
  constructor(canvas, { reduced = false, onFps, onGesture, onLost } = {}) {
    this.canvas = canvas; this.reduced = reduced; this.onFps = onFps; this.onGesture = onGesture;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!this.renderer.getContext()) throw new Error('no webgl');
    this.software = this._isSoftware();
    this.renderer.setClearColor(0x10080c, 1);
    this.renderer.shadowMap.enabled = !this.software;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!this.software) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.08, 20);
    this._baseCam = new THREE.Vector3(0, 1.56, -0.08);
    this._look = new THREE.Vector3(0, 0.88, 1.12);
    this.camera.position.copy(this._baseCam);
    this.camera.lookAt(this._look);
    this.yaw = 0; this.pitch = 0; this._drag = null;
    this.res = { geos: [], mats: [], textures: [], meshes: [] };
    this.scene.add(new THREE.AmbientLight(0x4a3828, 0.7));
    this.scene.add(new THREE.HemisphereLight(0x6a5040, 0x1a2218, 0.65));
    const fill = new THREE.DirectionalLight(0xffe8c0, 0.85); fill.position.set(0, 1.8, -1.2); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x4a3028, 0.35); rim.position.set(0.4, 1.2, 2); this.scene.add(rim);
    this.lamp = new THREE.SpotLight(0xffe6b8, 12, 10, 0.7, 0.75, 1.4);
    this.lamp.position.set(0, 2.4, 0.45);
    this.lamp.target.position.set(0, FELT_Y, 0.5);
    this.lamp.castShadow = !this.software;
    const map = this._mobile() || this.software ? 256 : 512;
    this.lamp.shadow.mapSize.set(map, map);
    this.lamp.shadow.bias = -0.00015; this.lamp.shadow.normalBias = 0.02;
    this.lamp.shadow.camera.near = 0.3; this.lamp.shadow.camera.far = 5;
    this.scene.add(this.lamp, this.lamp.target);
    const table = buildTable(this.res);
    this.scene.add(table.root); this.shoe = table.shoe; this.tray = table.tray;
    this.backTex = cardBack(); this.res.textures.push(this.backTex);
    this.faceCache = new Map();
    this.cards = new THREE.Group(); this.scene.add(this.cards);
    this.players = new Map();
    this.playerRoot = new THREE.Group(); this.scene.add(this.playerRoot);
    this.flying = [];
    this.chipMesh = this._buildChips();
    this.dealerSkin = std('#c4a07a'); this.dealerSleeve = std('#1a1420');
    this.dealerArms = buildDealerArms(this.dealerSkin, this.dealerSleeve);
    this.camera.add(this.dealerArms.group);
    const faceFill = new THREE.PointLight(0xffe6c8, 0.8, 3, 2); faceFill.position.set(0, 0.05, 0.15); this.camera.add(faceFill);
    this.scene.add(this.camera);
    this.brisk = buildBrisk(); this.brisk.visible = false; this.scene.add(this.brisk);
    this.tipChips = [];
    this.seenSeq = 0; this.gesture = null; this.pendingView = null; this.holdUntil = 0;
    this.fps = 60; this._frames = 0; this._fpsAt = 0; this._fpsWindow = [];
    this.clock = new THREE.Clock();
    this.raf = 0;
    this.onLost = onLost;
    this._onLost = (ev) => { ev?.preventDefault?.(); this.onLost?.(); };
    canvas.addEventListener('webglcontextlost', this._onLost);
    this._bindLook();
    this._onResize = () => this.resize();
    this.ro = new ResizeObserver(this._onResize);
    this.ro.observe(canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }
  _mobile() { return (this.canvas.clientWidth || window.innerWidth) < 720; }
  _isSoftware() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      return /swiftshader|llvmpipe|software|microsoft basic/i.test(name);
    } catch { return false; }
  }
  _bindLook() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    const down = (e) => { this._drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!this._drag) return;
      const dx = (e.clientX - this._drag.x) / 240;
      const dy = (e.clientY - this._drag.y) / 240;
      this.yaw = Math.max(-0.4, Math.min(0.4, this._drag.yaw - dx));
      this.pitch = Math.max(-0.22, Math.min(0.18, this._drag.pitch - dy));
    };
    const up = () => { this._drag = null; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this._lookUnbind = () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    // Optional gyro: only if the browser already delivers events (no permission prompt).
    this._orient = (e) => {
      if (this._drag || e.gamma == null) return;
      this.yaw = Math.max(-0.4, Math.min(0.4, (-e.gamma) * Math.PI / 180 * 0.25));
      this.pitch = Math.max(-0.22, Math.min(0.18, (e.beta - 45) * Math.PI / 180 * 0.15));
    };
    window.addEventListener('deviceorientation', this._orient);
  }
  resize() {
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 640);
    const h = Math.max(1, this.canvas.clientHeight || 400);
    if (this.software) {
      const aspect = w / Math.max(1, h);
      const rw = Math.min(720, w);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(rw, Math.max(1, Math.round(rw / aspect)), false);
    } else {
      const cap = this._mobile() ? 1.15 : 1.35;
      this.renderer.setPixelRatio(Math.min(cap, window.devicePixelRatio || 1));
      this.renderer.setSize(w, h, false);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  _face(code) {
    const key = code || 'back';
    if (!this.faceCache.has(key)) { const t = cardFace(code); this.faceCache.set(key, t); this.res.textures.push(t); }
    return this.faceCache.get(key);
  }
  _card() {
    const m = makeCardMesh(this._face(null), this.backTex);
    this.cards.add(m);
    return m;
  }
  _buildChips() {
    const geo = new THREE.CylinderGeometry(0.016, 0.016, 0.0046, 12);
    const stripe = new THREE.CylinderGeometry(0.0162, 0.0162, 0.0008, 12);
    const groups = {};
    for (const [k, color] of Object.entries(CHIP_COLOR)) {
      const mesh = new THREE.InstancedMesh(geo, std(color, { roughness: 0.4, metalness: 0.12, flatShading: false }), 160);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.count = 0;
      this.scene.add(mesh);
      const rim = new THREE.InstancedMesh(stripe, std('#f4efe4', { roughness: 0.5 }), 160);
      rim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rim.count = 0;
      this.scene.add(rim);
      groups[k] = { mesh, rim, dummy: new THREE.Object3D(), n: 0 };
    }
    this._chipGroups = groups;
    return groups;
  }
  _resetChips() { for (const g of Object.values(this._chipGroups)) g.n = 0; }
  _placeChip(kind, x, y, z) {
    const g = this._chipGroups[kind]; if (!g || g.n >= 160) return;
    const d = g.dummy; d.position.set(x, y, z); d.rotation.set(0, (g.n * 0.37) % 1, 0); d.updateMatrix();
    g.mesh.setMatrixAt(g.n, d.matrix);
    d.position.y = y + 0.0024; d.updateMatrix();
    g.rim.setMatrixAt(g.n, d.matrix);
    g.n++;
  }
  _flushChips() {
    for (const g of Object.values(this._chipGroups)) {
      g.mesh.count = g.n; g.rim.count = g.n;
      g.mesh.instanceMatrix.needsUpdate = true; g.rim.instanceMatrix.needsUpdate = true;
    }
  }
  _stack(amount, x, z) {
    const chips = chipBreakdown(amount);
    chips.forEach((k, i) => this._placeChip(k, x, FELT_Y + 0.003 + i * 0.0048, z));
  }

  setView(payload) {
    if (!payload) return;
    try { this._setView(payload); } catch (err) { console.error('pov setView', err); }
  }
  _setView(payload) {
    const { v, dealerCards, handsOf, turnSeat, tip } = payload;
    const ev = gestureFromLog(v?.log, this.seenSeq);
    if (ev) {
      this.seenSeq = ev.seq;
      const dur = gestureDuration(ev.kind);
      const next = { ...ev, t0: performance.now(), dur };
      if (this.gesture && (performance.now() - this.gesture.t0) < this.gesture.dur) {
        this._gestureQueue = this._gestureQueue || [];
        this._gestureQueue.push(next);
      } else {
        this.gesture = next;
        this.onGesture?.(ev);
      }
      this.holdUntil = performance.now() + revealDelay(ev.kind);
      this.pendingView = payload;
    }
    if (this.holdUntil && performance.now() < this.holdUntil) {
      this.pendingView = payload;
      this._syncPlayers(v, turnSeat);
      this._syncPit(v);
      this._syncTip(tip, v);
      return;
    }
    this.pendingView = null; this.holdUntil = 0;
    this._applyView(payload);
  }

  _applyView(payload) {
    const { v, dealerCards, handsOf, turnSeat, tip } = payload;
    this._view = payload;
    this._syncPlayers(v, turnSeat);
    this._layoutCards(v, dealerCards, handsOf);
    this._layoutChips(v, handsOf);
    this._syncPit(v);
    this._syncTip(tip, v);
    this._dealFlick = !!(payload.dealing);
  }

  _syncPlayers(v, turnSeat) {
    const seats = (v?.seats || []).map((s, i) => s && { ...s, i }).filter(Boolean);
    const keep = new Set();
    seats.forEach((s, order) => {
      const key = s.id || `bot:${s.name}:${s.i}`;
      keep.add(key);
      let p = this.players.get(key);
      if (!p) {
        p = buildSeated({ id: s.id || key, name: s.name, avatar: s.avatar });
        this.players.set(key, p);
        this.playerRoot.add(p.group);
      }
      p.seat = s.i;
      const lay = seatLayout(seats.length, order);
      p.group.position.set(lay.x, 0, lay.z);
      p.group.rotation.y = lay.yaw; // face the dealer (−Z): face is on −local Z
      p.turn = s.i === turnSeat;
    });
    for (const [k, p] of this.players) {
      if (keep.has(k)) continue;
      this.playerRoot.remove(p.group); p.dispose?.(); this.players.delete(k);
    }
  }

  _layoutCards(v, dealerCards, handsOf) {
    // Recycle card meshes.
    const need = [];
    const seats = (v?.seats || []).map((s, i) => s && { ...s, i }).filter(Boolean);
    seats.forEach((s, order) => {
      const lay = seatLayout(seats.length, order);
      const hs = handsOf?.(s.i) || [];
      hs.forEach((h, hi) => {
        const cards = h.cards || [];
        const baseX = lay.x + (hi - (hs.length - 1) / 2) * 0.16;
        const baseZ = lay.z - 0.34;
        cards.forEach((c, ci) => {
          need.push({ code: c, x: baseX + ci * 0.04, y: FELT_Y + 0.012 + ci * 0.001, z: baseZ + ci * 0.016, rotX: -Math.PI / 2 + 0.4, rotY: 0, rotZ: (ci - 1) * 0.04, down: !c, scale: 1.35 });
        });
      });
    });
    (dealerCards || []).forEach((c, ci) => {
      const n = dealerCards.length;
      const x = (ci - (n - 1) / 2) * 0.11;
      need.push({ code: c, x, y: FELT_Y + 0.02, z: 0.58 + ci * 0.012, rotX: -Math.PI / 2 + 0.62, rotY: 0, rotZ: 0, down: !c, dealer: true, scale: 1.65 });
    });
    while (this.cards.children.length < need.length) this._card();
    this.cards.children.forEach((m, i) => {
      if (i >= need.length) { m.visible = false; return; }
      const d = need[i]; m.visible = true;
      const face = m.userData.face;
      const tex = d.down ? this.backTex : this._face(d.code);
      if (face.material.map !== tex) { face.material.map = tex; face.material.needsUpdate = true; }
      // Face-down: show the back by flipping 180 on Y while lying on the felt.
      m.position.set(d.x, d.y, d.z);
      m.rotation.set(d.rotX, d.rotY + (d.down ? Math.PI : 0), d.rotZ);
      const sc = d.scale || 1; m.scale.set(sc, sc, sc);
    });
    this._cardTargets = need;
  }

  _layoutChips(v, handsOf) {
    this._resetChips();
    const seats = (v?.seats || []).map((s, i) => s && { ...s, i }).filter(Boolean);
    seats.forEach((s, order) => {
      const lay = seatLayout(seats.length, order);
      const bet = v.round?.bets?.[s.i];
      const hs = handsOf?.(s.i) || [];
      if (bet && !bet.out && !hs.length) this._stack(bet.bet, lay.x, lay.z - 0.28);
      hs.forEach((h, hi) => {
        const x = lay.x + (hi - (hs.length - 1) / 2) * 0.16 - 0.08;
        this._stack(h.bet || bet?.bet || 0, x, lay.z - 0.28);
        if (h.doubled) this._stack(h.bet / 2 || 0, x - 0.05, lay.z - 0.22);
      });
    });
    // Tray inventory — decorative, not the house bank count to the chip.
    const bank = Math.min(80, Math.max(12, Math.round((v?.house?.bank || 200) / 25)));
    for (let i = 0; i < bank; i++) {
      const col = i % 5; const row = Math.floor(i / 5);
      const kind = ['r', 'g', 'k', 'b', 'r'][col];
      this._placeChip(kind, 0.42 + col * 0.036, FELT_Y + 0.01 + (row % 6) * 0.0048, 0.0 + Math.floor(row / 6) * 0.036);
    }
    this._flushChips();
  }

  _syncPit(v) {
    const pit = v?.pit;
    this._pit = pit || null;
    this.brisk.visible = !!pit;
  }
  _syncTip(tip, v) {
    if (tip && tip.at !== this._tipAt) {
      this._tipAt = tip.at;
      this._tipFly = { t0: performance.now(), amount: tip.amount, from: tip.from };
    }
    if (!tip) { this._tipFly = null; this._tipAt = null; }
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    try {
      const dt = Math.min(0.05, this.clock.getDelta());
      const now = performance.now();
      if (this.pendingView && now >= this.holdUntil) this._applyView(this.pendingView);
      this._tickCamera(now, dt);
      this._tickPeople(now, dt);
      this._tickPit(now, dt);
      this._tickDealerHands(now, dt);
      this._tickTip(now);
      this._tickFps(now);
      this.renderer.render(this.scene, this.camera);
    } catch (err) { console.error('pov loop', err); }
  }
  _tickCamera(now, dt) {
    const t = now / 1000;
    const bob = this.reduced ? 0 : 1;
    const y = this._baseCam.y + Math.sin(t * 1.15) * 0.01 * bob;
    const x = this._baseCam.x + Math.sin(t * 0.7) * 0.006 * bob;
    const z = this._baseCam.z + Math.cos(t * 1.15) * 0.004 * bob;
    this.camera.position.set(x, y, z);
    const look = this._look.clone();
    look.x += this.yaw * 0.85; look.y += this.pitch * 0.7;
    look.y += Math.sin(t * 0.9) * 0.008 * bob;
    this.camera.lookAt(look);
  }
  _tickPeople(now, dt) {
    const g = this.gesture;
    const u = g ? Math.min(1, (now - g.t0) / g.dur) : 1;
    if (g && u >= 1) {
      const queued = this._gestureQueue?.shift();
      if (queued) { queued.t0 = now; this.gesture = queued; this.onGesture?.(queued); }
      else { this.gesture = null; this.onGesture?.(null); }
    }
    for (const p of this.players.values()) {
      const t = now / 1000 + p.seed;
      p.torso.position.y = 0.08 + (this.reduced ? 0 : Math.sin(t * 1.5) * 0.006);
      p.head.rotation.y = this.reduced ? 0 : Math.sin(t * 0.35) * 0.18;
      p.head.rotation.x = this.reduced ? 0 : Math.sin(t * 0.5) * 0.04;
      const pose = (g && g.seat === p.seat) ? samplePose(g.kind, u) : REST;
      applyPose(p, pose);
      // Fidget with chips when idle.
      if (!g || g.seat !== p.seat) {
        p.wrR.rotation.z += (this.reduced ? 0 : Math.sin(t * 2.2) * 0.08 - p.wrR.rotation.z) * 0.05;
      }
    }
  }
  _tickPit(now, dt) {
    if (!this._pit) { this.brisk.visible = false; this._pitPlaced = false; this._pitLoomed = false; return; }
    this.brisk.visible = true;
    const st = this._pit.state;
    // Stand beside the far seat, far enough back that head and shoes both fit.
    const dest = new THREE.Vector3(0.54, 0, 1.32);
    const start = new THREE.Vector3(1.55, 0, 1.55);
    const loom = new THREE.Vector3(0.44, 0, 1.22);
    if (!this._pitPlaced) { this.brisk.position.copy(start); this._pitPlaced = true; }
    let target = dest, lean = 0;
    if (st === 'approach') { target = dest; }
    else if (st === 'loom' || this._pit.loom) {
      target = loom; lean = 0.10;
      if (!this._pitLoomed) { this.brisk.position.copy(loom); this._pitLoomed = true; }
    }
    else if (st === 'talk') { target = this._pit.loom ? loom : dest; lean = this._pit.loom ? 0.10 : 0; }
    else if (st === 'leave') { target = new THREE.Vector3(1.9, 0, 1.0); this._pitLoomed = false; }
    if (st !== 'loom' && !this._pit.loom) this._pitLoomed = false;
    this.brisk.position.lerp(target, 1 - Math.pow(0.12, dt * 60));
    const toCam = this.camera.position.clone().sub(this.brisk.position);
    this.brisk.rotation.y += ((Math.atan2(toCam.x, toCam.z)) - this.brisk.rotation.y) * 0.08;
    this.brisk.userData.head.rotation.x = lean;
    // Walk cycle when far from the target.
    const moving = this.brisk.position.distanceTo(target) > 0.08 && st !== 'loom';
    const phase = now / 180;
    const swing = moving && !this.reduced ? Math.sin(phase) * 0.35 : 0;
    const aL = this.brisk.getObjectByName('aL'), aR = this.brisk.getObjectByName('aR');
    if (aL) aL.rotation.x = swing; if (aR) aR.rotation.x = -swing;
    this.brisk.position.y = moving && !this.reduced ? Math.abs(Math.sin(phase)) * 0.02 : 0;
  }
  _tickDealerHands(now, dt) {
    const flick = this._dealFlick || (this._view?.dealing);
    const t = now / 1000;
    const arms = this.dealerArms;
    if (flick && !this.reduced) {
      const u = (Math.sin(t * 10) * 0.5 + 0.5);
      arms.armR.rotation.x = 0.35 - u * 0.8;
      arms.armR.rotation.z = 0.25 - u * 0.2;
    } else {
      arms.armR.rotation.x += (0.35 + Math.sin(t * 1.2) * 0.03 - arms.armR.rotation.x) * 0.08;
      arms.armL.rotation.x += (0.35 + Math.sin(t * 1.1) * 0.03 - arms.armL.rotation.x) * 0.08;
    }
  }
  _tickTip(now) {
    if (!this._tipFly) {
      if (this._tipMesh) this._tipMesh.visible = false;
      return;
    }
    if (!this._tipMesh) {
      const kind = this._tipFly.amount >= 25 ? 'k' : this._tipFly.amount >= 5 ? 'g' : 'r';
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 12), std(CHIP_COLOR[kind], { roughness: 0.4, metalness: 0.12 }));
      m.castShadow = true; this.scene.add(m); this._tipMesh = m;
    }
    const u = Math.min(1, (now - this._tipFly.t0) / 1400);
    const p0 = new THREE.Vector3(0, FELT_Y + 0.2, 1.0);
    const p2 = new THREE.Vector3(0.15, FELT_Y + 0.01, 0.15);
    const p1 = new THREE.Vector3(0.05, FELT_Y + 0.55, 0.5);
    const a = p0.clone().lerp(p1, u), b = p1.clone().lerp(p2, u);
    this._tipMesh.position.copy(a.lerp(b, u));
    this._tipMesh.rotation.x = u * 4; this._tipMesh.visible = u < 1;
    if (u >= 1) this._tipFly = null;
  }
  _tickFps(now) {
    this._frames++;
    if (!this._fpsAt) this._fpsAt = now;
    if (now - this._fpsAt >= 500) {
      const fps = (this._frames * 1000) / (now - this._fpsAt);
      this._frames = 0; this._fpsAt = now;
      this._fpsWindow.push(fps); if (this._fpsWindow.length > 10) this._fpsWindow.shift();
      this.fps = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length;
      this.onFps?.(this.fps);
      if (this.canvas.dataset) this.canvas.dataset.fps = String(Math.round(this.fps));
      // If software GL is struggling, drop shadows rather than the scene.
      if (this.fps < 28 && this.lamp.castShadow) { this.lamp.castShadow = false; this.renderer.shadowMap.enabled = false; }
    }
  }
  getFps() { return this.fps; }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this._lookUnbind?.();
    window.removeEventListener('deviceorientation', this._orient);
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    for (const p of this.players.values()) p.dispose?.();
    this.res.textures.forEach((t) => t?.dispose?.());
    this.faceCache.forEach((t) => t?.dispose?.());
    this.backTex?.dispose?.();
    this.renderer.dispose();
  }
}

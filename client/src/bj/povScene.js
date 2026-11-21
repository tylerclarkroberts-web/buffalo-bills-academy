// First-person 3D dealer table. Low-poly, same three.js stack as the mines and Heeshee scenes.
// Presentation only: every card, chip and gesture is driven by the existing table view.
// Gestures and visual card lag live on the dealer's canvas alone — they never pause the server.
import * as THREE from 'three';
import { looks, shade, headParts } from '../avatar/genbust.js';
import { shirtOf } from '../avatar/wear.js';
import { gestureFromLog, gestureDuration, revealDelay, samplePose, REST } from './povGestures.js';

export const FELT_Y = 0.78;
export const TABLE_R = 1.52;
export const RAIL_R = 1.56;
export const SEAT_R = 1.86;
export const CARD_R = 1.18;
export const CHIP_R = 1.34;
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

export function seatLayout(n, i) {
  const count = Math.max(1, n);
  const spread = count <= 1 ? 0 : count === 2 ? 0.4 : count === 3 ? 0.54 : 0.66;
  const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
  const yaw = t * spread;
  const at = (r) => ({ x: Math.sin(yaw) * r, z: Math.cos(yaw) * r });
  const seat = at(SEAT_R), card = at(CARD_R), chip = at(CHIP_R);
  return { x: seat.x, z: seat.z, y: 0, yaw, cardX: card.x, cardZ: card.z, chipX: chip.x, chipZ: chip.z };
}

function feltTexture() {
  const S = 1024;
  const c = canv(S, S); if (!c) return null;
  const ctx = c.getContext('2d');
  // Bright casino green — the pool of light is baked in so software GL still reads as a lit table.
  ctx.fillStyle = '#15663a'; ctx.fillRect(0, 0, S, S);
  const pool = ctx.createRadialGradient(S * 0.5, S * 0.58, 40, S * 0.5, S * 0.55, S * 0.55);
  pool.addColorStop(0, '#2faf5e');
  pool.addColorStop(0.35, '#1c8a47');
  pool.addColorStop(1, '#0e4a2a');
  ctx.fillStyle = pool; ctx.fillRect(0, 0, S, S);
  // Felt nap.
  ctx.strokeStyle = 'rgba(0,40,16,.16)'; ctx.lineWidth = 1.2;
  for (let y = 8; y < S; y += 14) {
    ctx.beginPath();
    for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + ((x / 16) % 2 ? 5 : 0));
    ctx.stroke();
  }
  // Gold diamond stitch, faint.
  ctx.strokeStyle = 'rgba(232,196,96,.16)'; ctx.lineWidth = 1;
  for (let y = 40; y < S; y += 36) {
    ctx.beginPath();
    for (let x = 24; x < S; x += 36) { ctx.moveTo(x, y - 5); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 6, y); ctx.closePath(); }
    ctx.stroke();
  }
  // Half-disc UVs: origin (dealer edge) is mid-texture; the far player arc maps to the bottom of the canvas.
  const cx = S / 2, cy = S / 2;
  ctx.strokeStyle = 'rgba(232,196,96,.75)'; ctx.lineWidth = 6;
  // Visible half is the BOTTOM of the canvas (UV v=0 at the far arc).
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.40, 0, Math.PI, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.28, 0.15, Math.PI - 0.15, true); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * (0.18 + i * 0.16));
    const x = cx + Math.cos(a) * S * 0.34, y = cy + Math.sin(a) * S * 0.34;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.stroke();
  }
  const gold = ctx.createLinearGradient(0, 0, S, 0);
  gold.addColorStop(0, 'rgba(232,196,96,.15)'); gold.addColorStop(0.5, 'rgba(255,224,140,.95)'); gold.addColorStop(1, 'rgba(232,196,96,.15)');
  ctx.fillStyle = gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = (text, font, y) => {
    ctx.save(); ctx.translate(cx, y); ctx.rotate(Math.PI); ctx.font = font; ctx.fillText(text, 0, 0); ctx.restore();
  };
  label("BUFFALO BILL'S PAYS 3 TO 2", '700 34px "Times New Roman", serif', cy + S * 0.14);
  label('INSURANCE PAYS 2 TO 1', '600 24px "Times New Roman", serif', cy + S * 0.19);
  label('HOUSE STANDS ON ALL 17s', '700 22px "Times New Roman", serif', cy + S * 0.08);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

function leatherTexture() {
  const c = canv(256, 256); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2218'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(90,40,28,${0.08 + (i % 5) * 0.04})`;
    ctx.beginPath(); ctx.ellipse((i * 37) % 256, (i * 53) % 256, 18, 10, i, 0, 7); ctx.fill();
  }
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,210,160,.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function woodTexture() {
  const c = canv(256, 128); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6a3a1c'; ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(30,12,4,${0.1 + (i % 5) * 0.05})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath(); ctx.moveTo(0, 6 + i * 3); ctx.bezierCurveTo(80, 2 + i * 3, 160, 14 + i * 3, 256, 8 + i * 3); ctx.stroke();
  }
  const hl = ctx.createLinearGradient(0, 0, 0, 128);
  hl.addColorStop(0, 'rgba(255,200,120,.18)'); hl.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function roomTexture() {
  const c = canv(512, 256); if (!c) return null;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#1a0c10'); bg.addColorStop(0.45, '#12080c'); bg.addColorStop(1, '#070406');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 256);
  // Soft out-of-focus chandelier / sconce lights (fake bokeh, not a post pass).
  const blobs = [
    [40, 70, 22, '#e8b45a'], [90, 50, 14, '#f0d08a'], [150, 80, 18, '#c46a3a'],
    [220, 40, 12, '#f4e0a8'], [280, 64, 20, '#d4a04a'], [340, 48, 10, '#ffc878'],
    [400, 72, 16, '#a83828'], [460, 44, 11, '#e8c070'],
    [70, 120, 8, '#c9a227'], [190, 110, 9, '#f2c65a'], [310, 130, 7, '#ffd59a'], [430, 118, 10, '#c46a3a'],
  ];
  for (const [x, y, r, col] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, col); g.addColorStop(0.35, col + 'cc'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

function cardFace(code) {
  const c = canv(256, 360);
  const ctx = c.getContext('2d');
  const r = !code ? '' : (code[0] === 'T' ? '10' : code[0]);
  const s = code ? SUIT[code[1]] : '';
  const red = code && (code[1] === 'h' || code[1] === 'd');
  ctx.fillStyle = '#f7f1e4'; ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = '#d9c6a0'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, 244, 348);
  ctx.fillStyle = red ? '#b01c2c' : '#16120e';
  ctx.font = 'bold 86px "Times New Roman", serif'; ctx.textBaseline = 'top';
  ctx.fillText(r, 16, 14);
  ctx.font = '76px "Times New Roman", serif'; ctx.fillText(s, 16, 100);
  ctx.save(); ctx.translate(128, 210); ctx.font = '160px "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, 0, 0); ctx.restore();
  ctx.save(); ctx.translate(240, 346); ctx.rotate(Math.PI); ctx.font = 'bold 86px "Times New Roman", serif'; ctx.textBaseline = 'top'; ctx.fillText(r, 0, 0); ctx.font = '76px "Times New Roman", serif'; ctx.fillText(s, 0, 86); ctx.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

function cardBack() {
  const c = canv(256, 360);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a1424'; ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 12; ctx.strokeRect(10, 10, 236, 340);
  ctx.strokeStyle = 'rgba(232,192,112,.5)'; ctx.lineWidth = 2;
  for (let y = 28; y < 340; y += 22) {
    ctx.beginPath();
    for (let x = 24; x < 236; x += 22) { ctx.moveTo(x, y - 6); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 8, y); ctx.closePath(); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function faceTexture(id, avatar) {
  const c = canv(160, 192); if (!c) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  const ctx = c.getContext('2d');
  let disposed = false, img;
  tex.addEventListener('dispose', () => { disposed = true; if (img) img.onload = img.onerror = null; });
  const drawParts = () => {
    if (disposed) return;
    const P = headParts(avatar?.seed || id, avatar?.skinTone);
    ctx.clearRect(0, 0, c.width, c.height);
    // Warm skin wash so the billboard doesn't go muddy.
    ctx.fillStyle = shade(P.L.skin, 0.08);
    ctx.beginPath(); ctx.ellipse(80, 96, 70, 88, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.scale(2.66, 2.66);
    for (const list of [P.ears, P.skin, P.beard, P.hair]) for (const f of list) { ctx.fillStyle = f.fill; ctx.fill(new Path2D(f.d)); }
    if (P.L.brows) { ctx.fillStyle = P.L.hair; ctx.fillRect(19, 31, 8, 1.8); ctx.fillRect(33, 31, 8, 1.8); }
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.arc(23, 36, 2.6, 0, 7); ctx.arc(37, 36, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#f4efe4'; ctx.beginPath(); ctx.arc(22.2, 35.4, 0.7, 0, 7); ctx.arc(36.2, 35.4, 0.7, 0, 7); ctx.fill();
    ctx.fillStyle = shade(P.L.skin, -0.18); ctx.fill(new Path2D('M30 37 L27.5 44 L32 44Z'));
    ctx.strokeStyle = shade(P.L.skin, -0.5); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(25, 49); ctx.quadraticCurveTo(30, 52, 35, 49); ctx.stroke();
    ctx.restore(); tex.needsUpdate = true;
  };
  drawParts();
  if (avatar?.kind === 'photo' && typeof Image !== 'undefined') {
    img = new Image();
    img.onload = () => {
      if (disposed) return;
      ctx.clearRect(0, 0, c.width, c.height); ctx.save(); ctx.beginPath(); ctx.ellipse(80, 96, 70, 88, 0, 0, 7); ctx.clip();
      ctx.drawImage(img, 0, 0, 160, 192); ctx.restore(); tex.needsUpdate = true;
    };
    img.onerror = drawParts; img.src = `/api/avatars/${encodeURIComponent(id)}.png?v=${avatar.v || 0}`;
  }
  return tex;
}

function namePlate(text) {
  const c = canv(256, 64); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(12,8,4,.82)'; ctx.fillRect(8, 10, 240, 44);
  ctx.strokeStyle = 'rgba(242,198,90,.55)'; ctx.strokeRect(8, 10, 240, 44);
  ctx.fillStyle = '#f4efe4'; ctx.font = '700 28px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').slice(0, 16), 128, 33, 220);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

function chipBreakdown(amount) {
  let n = Math.max(0, Math.round(Number(amount) || 0));
  const out = [];
  for (const [d, k] of CHIP_DENOM) { const c = Math.floor(n / d); n -= c * d; for (let i = 0; i < c && out.length < 28; i++) out.push(k); }
  return out;
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
  const wr = pivot(parent, 'wr', 0, -0.18, 0);
  add(wr, new THREE.BoxGeometry(1, 1, 1), skin, 0, -0.02, 0.01, 0.06, 0.04, 0.08);
  const fingers = [];
  const xs = [-0.022, -0.006, 0.01, 0.026];
  for (const x of xs) {
    const f = pivot(wr, 'f', x, -0.03, 0.03);
    add(f, new THREE.BoxGeometry(1, 1, 1), skin, 0, -0.024, 0.012, 0.012, 0.05, 0.014);
    fingers.push(f);
  }
  const th = pivot(wr, 'th', sign * -0.03, -0.005, 0.01);
  add(th, new THREE.BoxGeometry(1, 1, 1), skin, sign * -0.008, -0.012, 0.012, 0.014, 0.032, 0.016);
  fingers.push(th);
  return { wr, fingers };
}

function buildSeated({ id, name, avatar }) {
  const L = looks(avatar?.seed || id, avatar?.skinTone);
  const shirtHex = shirtOf?.(avatar?.wear, L.shirt) || L.shirt;
  const skin = std(L.skin), shirt = std(shirtHex), pants = std('#2a2433'), hair = std(L.hair);
  const g = new THREE.Group(); g.name = 'seat-player';
  // No chair — the body sits behind the padded rail, torso and head above it.
  const hips = pivot(g, 'hips', 0, 0.72, 0.08);
  add(hips, new THREE.BoxGeometry(0.28, 0.12, 0.22), pants, 0, 0.02, 0.04);
  for (const s of [-1, 1]) {
    const leg = pivot(hips, 'leg', s * 0.08, 0, 0.06);
    add(leg, new THREE.CylinderGeometry(0.045, 0.05, 0.28, 6), pants, 0, -0.12, 0.08, 1, 1, 1, [0.7, 0, 0]);
  }
  const torso = pivot(hips, 'torso', 0, 0.1, -0.02);
  torso.rotation.x = 0.22;
  add(torso, new THREE.CylinderGeometry(0.14, 0.16, 0.38, 8), shirt, 0, 0.22, 0, 1, 1, 0.88);
  add(torso, new THREE.BoxGeometry(0.24, 0.04, 0.16), shirt, 0, 0.04, 0.02);
  const armL = pivot(torso, 'armL', -0.17, 0.3, 0);
  const armR = pivot(torso, 'armR', 0.17, 0.3, 0);
  const makeArm = (arm, sign) => {
    add(arm, new THREE.SphereGeometry(0.048, 8, 6), shirt, 0, 0, 0);
    add(arm, new THREE.CylinderGeometry(0.038, 0.044, 0.2, 6), shirt, 0, -0.1, 0);
    const el = pivot(arm, 'el', 0, -0.2, 0);
    add(el, new THREE.SphereGeometry(0.032, 8, 6), skin, 0, 0, 0);
    add(el, new THREE.CylinderGeometry(0.028, 0.032, 0.18, 6), skin, 0, -0.1, 0);
    const hand = buildHand(el, skin, sign);
    return { el, wr: hand.wr, fingers: hand.fingers };
  };
  const Larm = makeArm(armL, -1), Rarm = makeArm(armR, 1);
  const neck = pivot(torso, 'neck', 0, 0.42, 0);
  add(neck, new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6), skin, 0, 0.02, 0);
  const head = pivot(neck, 'head', 0, 0.1, 0);
  add(head, new THREE.SphereGeometry(0.1, 12, 10), skin, 0, 0.08, 0.01, L.wide, 1, 0.88);
  if (L.style !== 'bald') add(head, new THREE.SphereGeometry(0.104, 12, 10), hair, 0, 0.11, 0.0, L.wide, L.style === 'buzz' ? 0.55 : 0.78, 0.9);
  if (L.style === 'long') add(head, new THREE.BoxGeometry(0.18, 0.16, 0.07), hair, 0, 0.0, 0.09);
  if (L.style === 'bun') add(head, new THREE.SphereGeometry(0.045, 8, 6), hair, 0, 0.14, 0.1);
  const tex = faceTexture(id, avatar);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), tex
    ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, emissive: '#3a2418', emissiveMap: tex, emissiveIntensity: 0.45 })
    : skin);
  face.position.set(0, 0.08, 0.12);
  head.add(face);
  const plate = namePlate(name);
  let tag = null;
  if (plate) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: plate, transparent: true, depthWrite: false }));
    tag.position.set(0, 1.55, 0.02); tag.scale.set(0.42, 0.1, 1); g.add(tag);
  }
  const stackPush = pivot(g, 'stackPush', -0.12, FELT_Y, -0.4);
  const person = {
    group: g, hips, torso, head, armL, armR, elL: Larm.el, elR: Rarm.el, wrL: Larm.wr, wrR: Rarm.wr,
    fingersL: Larm.fingers, fingersR: Rarm.fingers, stackPush, faceBillboard: face, seed: (id || name || 'p').length,
    gesture: null, dispose: () => { tex?.dispose(); plate?.dispose(); },
  };
  applyPose(person, REST);
  return person;
}

function buildDealerArms(skinMat, sleeveMat) {
  const g = new THREE.Group(); g.name = 'dealer-arms';
  const make = (sign) => {
    const arm = pivot(g, sign < 0 ? 'L' : 'R', sign * 0.28, -0.42, -0.28);
    arm.rotation.set(0.25, sign * -0.12, sign * 0.2);
    arm.scale.setScalar(0.95);
    add(arm, new THREE.CylinderGeometry(0.038, 0.048, 0.3, 6), sleeveMat, 0, 0.08, 0);
    const el = pivot(arm, 'el', 0, -0.15, 0);
    add(el, new THREE.CylinderGeometry(0.028, 0.032, 0.18, 6), skinMat, 0, -0.06, 0);
    const hand = buildHand(el, skinMat, sign);
    return { arm, el, wr: hand.wr, fingers: hand.fingers };
  };
  const L = make(-1), R = make(1);
  return { group: g, ...L, armL: L.arm, elL: L.el, wrL: L.wr, fingersL: L.fingers, armR: R.arm, elR: R.el, wrR: R.wr, fingersR: R.fingers, flick: 0 };
}

function buildBrisk() {
  const g = new THREE.Group(); g.name = 'brisk';
  const coat = std('#161822'), pant = std('#12141c'), tie = std('#7a1c28'), skin = std('#c4a07a'), hair = std('#1a1410'), board = std('#d9c6a0'), gold = std('#c9a227');
  add(g, new THREE.CylinderGeometry(0.09, 0.11, 0.42, 8), coat, 0, 1.15, 0, 1, 1, 0.7);
  add(g, new THREE.BoxGeometry(0.04, 0.22, 0.02), tie, 0, 1.22, 0.07);
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6), pant, s * 0.055, 0.62, 0);
    add(g, new THREE.BoxGeometry(0.07, 0.05, 0.12), std('#1a1512'), s * 0.055, 0.32, 0.03);
    const arm = pivot(g, s < 0 ? 'aL' : 'aR', s * 0.16, 1.28, 0);
    add(arm, new THREE.CylinderGeometry(0.03, 0.035, 0.32, 6), coat, 0, -0.14, 0);
    if (s < 0) add(arm, new THREE.BoxGeometry(0.08, 0.1, 0.01), board, -0.05, -0.32, 0.02, 1, 1, 1, [0.2, 0, 0.4]);
  }
  const head = pivot(g, 'head', 0, 1.42, 0);
  add(head, new THREE.SphereGeometry(0.09, 10, 8), skin, 0, 0.07, 0, 0.95, 1, 0.9);
  add(head, new THREE.SphereGeometry(0.092, 10, 8), hair, 0, 0.1, -0.01, 0.95, 0.7, 0.85);
  const tex = faceTexture('pit-boss-brisk', { seed: 'pit-boss-brisk', skinTone: '#c4a07a' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), tex
    ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, emissive: '#2a1c14', emissiveMap: tex, emissiveIntensity: 0.35 })
    : skin);
  face.position.set(0, 0.07, 0.11); head.add(face);
  add(head, new THREE.SphereGeometry(0.012, 6, 6), gold, 0.09, 0.08, 0.02);
  g.userData.tex = tex; g.userData.head = head; g.userData.face = face;
  g.scale.setScalar(0.92);
  return g;
}

function railCurve(radius, y) {
  const pts = [];
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI;
    pts.push(new THREE.Vector3(-Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function buildTable(res) {
  const root = new THREE.Group(); root.name = 'table';
  const feltMap = feltTexture(); const woodMap = woodTexture(); const leatherMap = leatherTexture(); const roomMap = roomTexture();
  res.textures.push(feltMap, woodMap, leatherMap, roomMap);
  const feltMat = new THREE.MeshLambertMaterial({ color: '#d8ffe0', map: feltMap });
  const woodMat = new THREE.MeshLambertMaterial({ color: '#c48a50', map: woodMap, flatShading: true });
  const leatherMat = new THREE.MeshLambertMaterial({ color: '#c07050', map: leatherMap, flatShading: true });
  // Half-moon felt, dealer on the diameter at z=0, players on the +Z arc.
  const felt = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R, 48, Math.PI, Math.PI), feltMat);
  felt.rotation.x = -Math.PI / 2; felt.position.set(0, FELT_Y, 0);
  felt.receiveShadow = true; felt.castShadow = false; root.add(felt);
  // Thick wood body under the felt so the table is a volume, not a plane.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.05, TABLE_R + 0.03, 0.14, 32, 1, true, Math.PI, Math.PI), woodMat);
  body.position.set(0, FELT_Y - 0.09, 0); body.castShadow = true; body.receiveShadow = true; root.add(body);
  // Dealer-side apron (the flat diameter) with real thickness.
  add(root, new THREE.BoxGeometry((TABLE_R + 0.06) * 2, 0.16, 0.1), woodMat, 0, FELT_Y - 0.08, -0.02);
  add(root, new THREE.BoxGeometry((TABLE_R + 0.04) * 2, 0.03, 0.08), woodMat, 0, FELT_Y + 0.01, -0.04);
  // Padded leather rail on the player arc, sitting on the felt edge — chairs stay behind it.
  const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve(RAIL_R, FELT_Y + 0.07), 32, 0.055, 8, false), leatherMat);
  rail.castShadow = true; rail.receiveShadow = true; root.add(rail);
  const railUnder = new THREE.Mesh(new THREE.TubeGeometry(railCurve(RAIL_R, FELT_Y + 0.02), 32, 0.035, 6, false), woodMat);
  railUnder.castShadow = true; root.add(railUnder);
  // End caps on the dealer-side corners of the rail.
  for (const s of [-1, 1]) add(root, new THREE.SphereGeometry(0.06, 8, 6), leatherMat, s * RAIL_R, FELT_Y + 0.07, 0);
  // A short leather cushion along the dealer edge, with a gap for the tray and shoe.
  add(root, new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), leatherMat, -0.95, FELT_Y + 0.06, -0.02, 1, 1, 1, [0, 0, Math.PI / 2]);
  add(root, new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), leatherMat, 0.95, FELT_Y + 0.06, -0.02, 1, 1, 1, [0, 0, Math.PI / 2]);
  const leg = std('#2a1a10');
  for (const [x, z] of [[-1.15, 0.15], [1.15, 0.15], [-0.55, 1.15], [0.55, 1.15]]) {
    add(root, new THREE.BoxGeometry(0.09, FELT_Y - 0.02, 0.09), leg, x, (FELT_Y - 0.02) / 2, z);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), std('#1a0e0c'));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  // Dark casino room with baked bokeh lights — a plane behind the far arc and side walls.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshLambertMaterial({ map: roomMap, color: '#c8a080' }));
  back.position.set(0, 1.8, 3.4); root.add(back);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshLambertMaterial({ map: roomMap, color: '#a08070' }));
    wall.position.set(s * 4.2, 1.8, 1.2); wall.rotation.y = -s * Math.PI / 2; root.add(wall);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), std('#12080c'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.5; root.add(ceil);
  // Overhead pendant — the key light hangs from this.
  const lamp = new THREE.Group(); lamp.position.set(0, 2.62, 0.7);
  add(lamp, new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), std('#2a2018'), 0, 0.4, 0);
  add(lamp, new THREE.CylinderGeometry(0.26, 0.38, 0.16, 12, 1, true), std('#5a3a18', { side: THREE.DoubleSide }), 0, 0.02, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe8b0' }));
  bulb.position.y = -0.02; lamp.add(bulb);
  root.add(lamp);
  // Shoe, left foreground; chip tray, right foreground.
  const shoe = new THREE.Group(); shoe.position.set(-0.42, FELT_Y + 0.04, 0.16); shoe.name = 'shoe';
  add(shoe, new THREE.BoxGeometry(0.14, 0.07, 0.18), std('#2a1a12'), 0, 0, 0);
  add(shoe, new THREE.BoxGeometry(0.1, 0.05, 0.02), std('#7a1028'), 0, 0.01, -0.09);
  add(shoe, new THREE.BoxGeometry(0.1, 0.05, 0.014), std('#f4efe4'), 0, 0.01, -0.1);
  root.add(shoe);
  const tray = new THREE.Group(); tray.position.set(0.46, FELT_Y + 0.03, 0.16); tray.name = 'tray';
  add(tray, new THREE.BoxGeometry(0.32, 0.03, 0.18), std('#1a0e08'), 0, -0.008, 0);
  add(tray, new THREE.BoxGeometry(0.3, 0.016, 0.16), std('#4a2a16'), 0, 0.006, 0);
  root.add(tray);
  return { root, shoe, tray, lamp };
}

function makeCardMesh(frontTex, backTex) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.12), new THREE.MeshLambertMaterial({ map: frontTex }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.12), new THREE.MeshLambertMaterial({ map: backTex }));
  back.rotation.y = Math.PI;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.12, 0.0024), std('#f4efe4', { flatShading: true }));
  face.position.z = 0.0014; back.position.z = -0.0014;
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
    this.renderer.setClearColor(0x140a0c, 1);
    this.renderer.shadowMap.enabled = !this.software;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.software ? 1.35 : 1.2;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 24);
    this._baseCam = new THREE.Vector3(0, 1.4, -0.62);
    this._look = new THREE.Vector3(0, 0.86, 1.28);
    this.camera.position.copy(this._baseCam);
    this.camera.lookAt(this._look);
    this.yaw = 0; this.pitch = 0; this._drag = null;
    this.res = { geos: [], mats: [], textures: [], meshes: [] };
    this.scene.add(new THREE.AmbientLight(0xffe6c8, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xffe4b8, 0x2a1a18, 1.05));
    const fill = new THREE.DirectionalLight(0xfff0d4, 1.05); fill.position.set(0, 1.7, -1.6); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc8a0, 0.35); rim.position.set(0.6, 1.4, 2.2); this.scene.add(rim);
    this.lamp = new THREE.SpotLight(0xffe2a8, this.software ? 18 : 28, 12, 0.72, 0.55, 1.2);
    this.lamp.position.set(0, 2.55, 0.7);
    this.lamp.target.position.set(0, FELT_Y, 0.7);
    this.lamp.castShadow = !this.software;
    const map = this._mobile() || this.software ? 256 : 512;
    this.lamp.shadow.mapSize.set(map, map);
    this.lamp.shadow.bias = -0.00015; this.lamp.shadow.normalBias = 0.02;
    this.lamp.shadow.camera.near = 0.3; this.lamp.shadow.camera.far = 6;
    this.scene.add(this.lamp, this.lamp.target);
    // Face fill along the far rail so avatars stay readable.
    const faceFill = new THREE.PointLight(0xffe6c8, 2.4, 5, 1.4); faceFill.position.set(0, 1.35, 1.15); this.scene.add(faceFill);
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
    const handFill = new THREE.PointLight(0xffe6c8, 0.6, 2.5, 2); handFill.position.set(0, 0.02, 0.1); this.camera.add(handFill);
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
    const mobile = h > w || this._mobile();
    this.camera.fov = mobile ? 72 : 62;
    if (this.software) {
      const aspect = w / Math.max(1, h);
      const rw = Math.min(800, w);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(rw, Math.max(1, Math.round(rw / aspect)), false);
    } else {
      const cap = this._mobile() ? 1.2 : 1.4;
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
    const geo = new THREE.CylinderGeometry(0.018, 0.018, 0.0056, 12);
    const stripe = new THREE.CylinderGeometry(0.0184, 0.0184, 0.001, 12);
    const groups = {};
    for (const [k, color] of Object.entries(CHIP_COLOR)) {
      const mesh = new THREE.InstancedMesh(geo, std(color, { flatShading: false }), 200);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.count = 0;
      this.scene.add(mesh);
      const rim = new THREE.InstancedMesh(stripe, std('#f4efe4'), 200);
      rim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rim.count = 0;
      this.scene.add(rim);
      groups[k] = { mesh, rim, dummy: new THREE.Object3D(), n: 0 };
    }
    this._chipGroups = groups;
    return groups;
  }
  _resetChips() { for (const g of Object.values(this._chipGroups)) g.n = 0; }
  _placeChip(kind, x, y, z) {
    const g = this._chipGroups[kind]; if (!g || g.n >= 200) return;
    const d = g.dummy; d.position.set(x, y, z); d.rotation.set(0, (g.n * 0.37) % 1, 0); d.updateMatrix();
    g.mesh.setMatrixAt(g.n, d.matrix);
    d.position.y = y + 0.003; d.updateMatrix();
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
    chips.forEach((k, i) => this._placeChip(k, x, FELT_Y + 0.004 + i * 0.0058, z));
  }

  setView(payload) {
    if (!payload) return;
    try { this._setView(payload); } catch (err) { console.error('pov setView', err); }
  }
  _setView(payload) {
    const { v, turnSeat, tip } = payload;
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
      // Visual lag is dealer-canvas only. The server and other clients already have the event.
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
      p.group.rotation.y = lay.yaw;
      p.turn = s.i === turnSeat;
    });
    for (const [k, p] of this.players) {
      if (keep.has(k)) continue;
      this.playerRoot.remove(p.group); p.dispose?.(); this.players.delete(k);
    }
  }

  _layoutCards(v, dealerCards, handsOf) {
    const need = [];
    const seats = (v?.seats || []).map((s, i) => s && { ...s, i }).filter(Boolean);
    seats.forEach((s, order) => {
      const lay = seatLayout(seats.length, order);
      const hs = handsOf?.(s.i) || [];
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      hs.forEach((h, hi) => {
        const cards = h.cards || [];
        const mid = (hs.length - 1) / 2;
        const ox = (hi - mid) * 0.18 * px, oz = (hi - mid) * 0.18 * pz;
        cards.forEach((c, ci) => {
          need.push({
            code: c,
            x: lay.cardX + ox + Math.sin(lay.yaw) * ci * 0.012 + px * (ci - 0.5) * 0.05,
            y: FELT_Y + 0.014 + ci * 0.0012,
            z: lay.cardZ + oz + Math.cos(lay.yaw) * ci * 0.012 + pz * (ci - 0.5) * 0.05,
            rotX: -Math.PI / 2 + 0.42,
            rotY: lay.yaw,
            rotZ: (ci - 1) * 0.03,
            down: !c,
            scale: 2.4,
          });
        });
      });
    });
    (dealerCards || []).forEach((c, ci) => {
      const n = dealerCards.length;
      const x = (ci - (n - 1) / 2) * 0.14;
      need.push({ code: c, x, y: FELT_Y + 0.02, z: 0.38 + ci * 0.014, rotX: -Math.PI / 2 + 0.32, rotY: 0, rotZ: 0, down: !c, dealer: true, scale: 2.7 });
    });
    while (this.cards.children.length < need.length) this._card();
    this.cards.children.forEach((m, i) => {
      if (i >= need.length) { m.visible = false; return; }
      const d = need[i]; m.visible = true;
      const face = m.userData.face;
      const tex = d.down ? this.backTex : this._face(d.code);
      if (face.material.map !== tex) { face.material.map = tex; face.material.needsUpdate = true; }
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
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      // Bankroll stack (presentation of s.chips) plus the bet, so the rail has real height.
      this._stack(Math.min(36, s.chips || 0), lay.chipX + px * 0.08, lay.chipZ + pz * 0.08);
      if (bet && !bet.out && !hs.length) this._stack(bet.bet, lay.chipX, lay.chipZ);
      hs.forEach((h, hi) => {
        const mid = (hs.length - 1) / 2;
        const x = lay.chipX + (hi - mid) * 0.16 * px;
        const z = lay.chipZ + (hi - mid) * 0.16 * pz;
        this._stack(h.bet || bet?.bet || 0, x, z);
        if (h.doubled) this._stack(h.bet / 2 || 0, x + px * 0.06, z + pz * 0.06);
      });
    });
    const bank = Math.min(40, Math.max(16, Math.round((v?.house?.bank || 200) / 25)));
    for (let i = 0; i < bank; i++) {
      const col = i % 5; const row = Math.floor(i / 5);
      const kind = ['r', 'g', 'k', 'b', 'r'][col];
      this._placeChip(kind, 0.34 + col * 0.042, FELT_Y + 0.02 + (row % 8) * 0.0058, 0.1 + Math.floor(row / 8) * 0.042);
    }
    this._flushChips();
  }

  _syncPit(v) {
    const pit = v?.pit;
    if (!!pit !== !!this._pit) { this._pitPlaced = false; this._pitLoomed = false; }
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
    this.camera.position.set(
      this._baseCam.x + Math.sin(t * 0.7) * 0.006 * bob,
      this._baseCam.y + Math.sin(t * 1.15) * 0.01 * bob,
      this._baseCam.z + Math.cos(t * 1.15) * 0.004 * bob,
    );
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
      p.torso.position.y = 0.1 + (this.reduced ? 0 : Math.sin(t * 1.5) * 0.006);
      p.head.rotation.y = this.reduced ? 0 : Math.sin(t * 0.35) * 0.12;
      p.head.rotation.x = this.reduced ? 0 : Math.sin(t * 0.5) * 0.03;
      if (p.faceBillboard) p.faceBillboard.lookAt(this.camera.position);
      const pose = (g && g.seat === p.seat) ? samplePose(g.kind, u) : REST;
      applyPose(p, pose);
      if (!g || g.seat !== p.seat) {
        p.wrR.rotation.z += (this.reduced ? 0 : Math.sin(t * 2.2) * 0.08 - p.wrR.rotation.z) * 0.05;
      }
    }
  }
  _tickPit(now, dt) {
    if (!this._pit) { this.brisk.visible = false; this._pitPlaced = false; this._pitLoomed = false; return; }
    this.brisk.visible = true;
    // Stand on the dealer's right, behind the rail, fully in the mobile frame.
    const dest = new THREE.Vector3(0.88, 0, 1.42);
    const start = new THREE.Vector3(1.55, 0, 1.85);
    const loom = new THREE.Vector3(0.78, 0, 1.28);
    if (!this._pitPlaced) { this.brisk.position.copy(start); this._pitPlaced = true; }
    const st = this._pit.state;
    let target = dest, lean = 0;
    if (st === 'approach') target = dest;
    else if (st === 'loom') {
      target = loom; lean = 0.08;
      if (!this._pitLoomed) { this.brisk.position.copy(loom); this._pitLoomed = true; }
    } else if (st === 'talk') { target = this._pit.loom ? loom : dest; lean = this._pit.loom ? 0.08 : 0; }
    else if (st === 'leave') target = start;
    this.brisk.position.lerp(target, 1 - Math.pow(0.12, dt * 60));
    const toCam = this.camera.position.clone().sub(this.brisk.position);
    this.brisk.rotation.y += ((Math.atan2(toCam.x, toCam.z)) - this.brisk.rotation.y) * 0.08;
    this.brisk.userData.head.rotation.x = lean;
    if (this.brisk.userData.face) this.brisk.userData.face.lookAt(this.camera.position);
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
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 12), std(CHIP_COLOR[kind]));
      m.castShadow = true; this.scene.add(m); this._tipMesh = m;
    }
    const u = Math.min(1, (now - this._tipFly.t0) / 1400);
    const p0 = new THREE.Vector3(0, FELT_Y + 0.25, 1.15);
    const p2 = new THREE.Vector3(0.2, FELT_Y + 0.04, 0.2);
    const p1 = new THREE.Vector3(0.08, FELT_Y + 0.7, 0.6);
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

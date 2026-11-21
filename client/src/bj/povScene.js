// First-person 3D dealer table. Low-poly, same three.js stack as the mines and Heeshee scenes.
// Presentation only: every card, chip and gesture is driven by the existing table view.
// Gestures and visual card lag live on the dealer's canvas alone — they never pause the server.
import * as THREE from 'three';
import { looks, shade, headParts } from '../avatar/genbust.js';
import { shirtOf } from '../avatar/wear.js';
import { gestureFromLog, gestureDuration, revealDelay, samplePose, REST, easeInOut, easeOutBack, easeOutCubic } from './povGestures.js';
import { seatAvatar, seatsInOrder, seatFigureKey, isAway, seatLayout, SEAT_R, CARD_R, CHIP_R } from './povSeats.js';

export const FELT_Y = 0.78;
export const TABLE_R = 1.52;
export const RAIL_R = 1.58;
export { SEAT_R, CARD_R, CHIP_R, seatLayout };
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
  // Five betting circles along the 150° far arc, at the card radius (CARD_R / TABLE_R of the half-texture).
  const cr = S * 0.5 * (CARD_R / TABLE_R);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + ((i / 4) - 0.5) * (150 * Math.PI / 180);
    const x = cx + Math.cos(a) * cr, y = cy + Math.sin(a) * cr;
    ctx.beginPath(); ctx.arc(x, y, 36, 0, 7); ctx.stroke();
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
  // Same GenHead / photo art as Bust in the top bar and seat ovals, just drawn onto a canvas
  // so the dealer can read it on a camera-facing sprite in front of the head.
  const W = 256, H = 320;
  const c = canv(W, H); if (!c) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  const ctx = c.getContext('2d');
  let disposed = false, img;
  tex.addEventListener('dispose', () => { disposed = true; if (img) img.onload = img.onerror = null; });
  const drawParts = () => {
    if (disposed) return;
    const P = headParts(avatar?.seed || id, avatar?.skinTone);
    const { L, cx, cy } = P;
    ctx.clearRect(0, 0, W, H);
    // Match Bust's GenHead viewBox="-4 -12 68 84"
    ctx.save();
    ctx.scale(W / 68, H / 84);
    ctx.translate(4, 12);
    for (const list of [P.ears, P.skin, P.beard, P.hair]) {
      for (const f of list) {
        ctx.fillStyle = f.fill;
        ctx.strokeStyle = f.fill;
        ctx.lineWidth = 0.3;
        const path = new Path2D(f.d);
        ctx.fill(path); ctx.stroke(path);
      }
    }
    if (L.brows) {
      ctx.strokeStyle = shade(L.hair, -0.3); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 11, cy - 5); ctx.lineTo(cx - 4, cy - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 11, cy - 5); ctx.lineTo(cx + 4, cy - 6); ctx.stroke();
    }
    ctx.fillStyle = '#1b1512';
    ctx.beginPath(); ctx.ellipse(cx - 7, cy, 2, 2.3, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 7, cy, 2, 2.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(L.skin, -0.18);
    ctx.fill(new Path2D(`M${cx} ${cy + 1} L${cx - 2.5} ${cy + 8} L${cx + 2} ${cy + 8} Z`));
    ctx.strokeStyle = shade(L.skin, -0.45); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 5, cy + 13); ctx.quadraticCurveTo(cx, cy + 15.5, cx + 5, cy + 13); ctx.stroke();
    ctx.restore();
    tex.needsUpdate = true;
  };
  drawParts();
  if (avatar?.kind === 'photo' && id && typeof Image !== 'undefined') {
    img = new Image();
    img.onload = () => {
      if (disposed) return;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.46, H * 0.48, 0, 0, 7); ctx.clip();
      ctx.drawImage(img, 0, 0, W, H);
      ctx.restore();
      tex.needsUpdate = true;
    };
    img.onerror = drawParts;
    img.src = `/api/avatars/${encodeURIComponent(id)}.png?v=${avatar.v || 0}`;
  }
  return tex;
}

function paintNamePlate(tex, text, away = false) {
  const c = tex.image; if (!c?.getContext) return tex;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = away ? 'rgba(60,60,66,.94)' : 'rgba(20,12,6,.92)';
  ctx.fillRect(4, 8, 248, 48);
  ctx.strokeStyle = away ? 'rgba(180,180,188,.7)' : 'rgba(242,198,90,.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 8, 248, 48);
  ctx.fillStyle = away ? '#d8d8de' : '#fff6e8';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = away ? `${String(text || '').slice(0, 12)} · away` : String(text || '').slice(0, 16);
  ctx.fillText(label, 128, 33, 220);
  tex.needsUpdate = true;
  return tex;
}

function namePlate(text, away = false) {
  const c = canv(256, 64); if (!c) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return paintNamePlate(tex, text, away);
}


function blobShadow() {
  const c = canv(64, 64); if (!c) return null;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }));
  s.rotation.x = -Math.PI / 2; // sprite rotation may not flatten; keep as a ground blob in XY
  s.center.set(0.5, 0.5);
  return s;
}

function labelTexture(text, color = '#f4efe4', bg = 'rgba(10,8,6,.86)', chip = false) {
  const c = canv(chip ? 128 : 256, chip ? 128 : 64); if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.beginPath();
  if (chip) {
    ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(242,198,90,.7)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '700 58px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').slice(0, 3), 64, 68);
  } else {
    if (ctx.roundRect) { ctx.roundRect(16, 10, 224, 44, 12); } else { ctx.rect(16, 10, 224, 44); }
    ctx.fill();
    ctx.fillStyle = color; ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').slice(0, 16), 128, 32, 210);
  }
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
  if (person.torso) person.torso.rotation.x = 0.22 + (a.lean || 0) * 0.55;
  if (person.hips) person.hips.position.z = 0.08 - (a.lean || 0) * 0.24;
  if (person.armR) person.armR.position.z = -(a.reachR || 0) * 0.26;
  if (person.armL) person.armL.position.z = -(a.reachL || 0) * 0.26;
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
  // Skull sits slightly back so the face sprite is the front of the head, not a sticker in front of a hat.
  add(head, new THREE.SphereGeometry(0.1, 12, 10), skin, 0, 0.08, 0.03, L.wide, 1, 0.8);
  if (L.style !== 'bald') add(head, new THREE.SphereGeometry(0.104, 12, 10), hair, 0, 0.14, 0.05, L.wide, L.style === 'buzz' ? 0.48 : 0.68, 0.72);
  if (L.style === 'long') add(head, new THREE.BoxGeometry(0.18, 0.16, 0.07), hair, 0, 0.0, 0.12);
  if (L.style === 'bun') add(head, new THREE.SphereGeometry(0.045, 8, 6), hair, 0, 0.17, 0.08);
  const tex = faceTexture(id, avatar);
  let face = null;
  if (tex) {
    face = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }));
    face.center.set(0.5, 0.46);
    face.position.set(0, 0.09, -0.085);
    face.scale.set(0.28, 0.36, 1);
    head.add(face);
  }
  const plate = namePlate(name, false);
  let tag = null;
  if (plate) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: plate, transparent: true, depthWrite: false }));
    tag.position.set(0, 1.28, -0.08); tag.scale.set(0.42, 0.11, 1); g.add(tag);
  }
  const blob = blobShadow();
  if (blob) { blob.position.set(0, 0.02, 0.06); blob.scale.set(0.58, 0.22, 1); g.add(blob); }
  const stackPush = pivot(g, 'stackPush', -0.12, FELT_Y, -0.4);
  const person = {
    group: g, hips, torso, head, armL, armR, elL: Larm.el, elR: Rarm.el, wrL: Larm.wr, wrR: Rarm.wr,
    fingersL: Larm.fingers, fingersR: Rarm.fingers, stackPush, faceBillboard: face, tag, plate, name,
    seed: (id || name || 'p').length, avatarKey: `${avatar?.kind || 'gen'}:${avatar?.seed || id}:${avatar?.v || 0}`,
    gesture: null, away: false, dispose: () => { tex?.dispose(); plate?.dispose(); },
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
  for (const [x, z] of [[-0.55, 1.15], [0.55, 1.15]]) {
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
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.12), new THREE.MeshBasicMaterial({ map: frontTex }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.12), new THREE.MeshBasicMaterial({ map: backTex }));
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
  constructor(canvas, { reduced = false, onFps, onGesture, onLost, onSfx } = {}) {
    this.canvas = canvas; this.reduced = reduced; this.onFps = onFps; this.onGesture = onGesture; this.onSfx = onSfx;
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
    this._baseCam = new THREE.Vector3(0, 2.45, -1.15);
    this._look = new THREE.Vector3(0, 0.78, 1.00);
    this.camera.position.copy(this._baseCam);
    this.camera.lookAt(this._look);
    this.yaw = 0; this.pitch = 0; this._drag = null;
    this._panX = 0; this._turnX = 0; this._zoom = 0;
    this._introT0 = performance.now();
    this._introFrom = new THREE.Vector3(0, 3.15, 2.45);
    this._introLook = new THREE.Vector3(0, 0.9, 0.85);
    this.res = { geos: [], mats: [], textures: [], meshes: [] };
    this.scene.add(new THREE.AmbientLight(0xffe6c8, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xffe4b8, 0x2a1a18, 1.05));
    const fill = new THREE.DirectionalLight(0xfff0d4, 1.05); fill.position.set(0, 1.7, -1.6); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0b0, 0.62); rim.position.set(0.4, 1.55, 2.3); this.scene.add(rim);
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
    const faceFill = new THREE.PointLight(0xffe6c8, 2.4, 5, 1.4); faceFill.position.set(0, 1.35, 1.15); this.scene.add(faceFill); this.faceFill = faceFill;
    const table = buildTable(this.res);
    this.scene.add(table.root); this._tableRoot = table.root; this._pendant = table.lamp; this.shoe = table.shoe; this.tray = table.tray;
    this.backTex = cardBack(); this.res.textures.push(this.backTex);
    this.faceCache = new Map();
    this.cards = new THREE.Group(); this.scene.add(this.cards);
    this.labels = new THREE.Group(); this.scene.add(this.labels);
    this._cardById = new Map();
    this._labelById = new Map();
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
  /** Portrait phones get a deeper, narrower table so a correct-aspect camera can fill the frame. Avatars stay unscaled. */
  _stageScale() { return this._portrait ? { sx: 0.68, sz: 2.40 } : { sx: 1, sz: 1 }; }
  _xz(x, z) { const { sx, sz } = this._stageScale(); return { x: x * sx, z: z * sz }; }
  _lay(n, i) {
    const lay = seatLayout(n, i);
    const p = this._xz(lay.x, lay.z);
    const c = this._xz(lay.cardX, lay.cardZ);
    const h = this._xz(lay.chipX, lay.chipZ);
    const yaw = Math.atan2(p.x, p.z);
    return { ...lay, x: p.x, z: p.z, cardX: c.x, cardZ: c.z, chipX: h.x, chipZ: h.z, yaw };
  }
  _applyStageScale() {
    const { sx, sz } = this._stageScale();
    if (this._tableRoot) this._tableRoot.scale.set(sx, 1, sz);
    // Keep shoe, tray, and the pendant from turning into ovals under the table scale.
    const inv = (o) => { if (o) o.scale.set(sx ? 1 / sx : 1, 1, sz ? 1 / sz : 1); };
    inv(this.shoe); inv(this.tray); inv(this._pendant);
    if (this._pendant) this._pendant.visible = !this._portrait;

    if (this.lamp) this.lamp.position.set(0, 2.55, 0.7 * sz);
    if (this.lamp?.target) this.lamp.target.position.set(0, FELT_Y, 0.7 * sz);
    if (this.faceFill) this.faceFill.position.set(0, 1.35, 1.15 * sz);
  }

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
    this._portrait = h >= w * 0.92;
    // Dealer eye just behind the rail, looking down ~40–45°. On portrait the table is
    // deepened and narrowed so a physically correct (unstretched) camera can still
    // fill the lower ~65% of a tall phone with felt, and the player arc sits in the upper third.
    if (this._portrait) {
      this._baseCam.set(0, 2.45, -0.20); this._look.set(0, 0.70, 1.70); this.camera.fov = 58;
      this._introFrom.set(0, 3.40, 3.80); this._introLook.set(0, 0.90, 1.50);
    } else {
      this._baseCam.set(0, 2.55, -1.20); this._look.set(0, 0.78, 1.00); this.camera.fov = 48;
      this._introFrom.set(0, 3.15, 2.45); this._introLook.set(0, 0.9, 0.85);
    }
    this._applyStageScale();
    if (this.software) {
      const aspect = w / Math.max(1, h);
      const rw = Math.min(720, w);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(rw, Math.max(1, Math.round(rw / aspect)), false);
    } else {
      const cap = this._mobile() ? 1.15 : 1.25;
      this.renderer.setPixelRatio(Math.min(cap, window.devicePixelRatio || 1));
      this.renderer.setSize(w, h, false);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._applyContentFrustum();
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
    const { v, dealerCards, handsOf, turnSeat, tip, fxFor, chat } = payload;
    const prevShuf = this._view?.v?.shuffles;
    this._view = payload;
    this._syncPlayers(v, turnSeat);
    this._layoutCards(v, dealerCards, handsOf);
    this._layoutChips(v, handsOf);
    this._syncPit(v);
    this._syncTip(tip, v);
    this._syncLabels(v, handsOf, fxFor, turnSeat);
    this._syncChat(chat || v?.chat);
    this._dealFlick = !!(payload.dealing);
    if (v?.shuffles && v.shuffles !== prevShuf) this._shuffleT0 = performance.now();
    const lastNo = v?.last?.no;
    if (lastNo && lastNo !== this._paidNo && (v.last.results || []).length) {
      this._paidNo = lastNo;
      this._payout = { t0: performance.now(), results: v.last.results, last: v.last };
      this.onSfx?.('chip');
    }
  }

  _syncPlayers(v, turnSeat) {
    const ordered = seatsInOrder(v?.seats, v?.maxSeats);
    const cap = Math.max(1, ordered.length);
    const keep = new Set();
    this._turnX = 0;
    ordered.forEach((s) => {
      if (!s) return; // empty seats stay empty — no invented figure
      const key = seatFigureKey(s);
      if (!key) return;
      keep.add(key);
      const avatar = seatAvatar(s);
      const avatarKey = `${avatar?.kind || 'gen'}:${avatar?.seed || s.id || key}:${avatar?.v || 0}`;
      let p = this.players.get(key);
      if (p && p.avatarKey !== avatarKey) {
        this.playerRoot.remove(p.group); p.dispose?.(); this.players.delete(key); p = null;
      }
      if (!p) {
        p = buildSeated({ id: s.id || (avatar?.seed) || key, name: s.name, avatar });
        p.avatarKey = avatarKey;
        this.players.set(key, p);
        this.playerRoot.add(p.group);
      }
      p.seat = s.i;
      const lay = this._lay(cap, s.i);
      const away = isAway(s);
      p.away = away;
      p.group.position.set(lay.x, away ? -0.05 : 0, lay.z);
      p.group.rotation.y = lay.yaw;
      p.turn = s.i === turnSeat;
      if (p.turn) { this._turnX = lay.x; this._turnZ = lay.z; }
      if (p.plate && p.tag && p._awayPlate !== away) {
        paintNamePlate(p.plate, p.name, away);
        p._awayPlate = away;
        p.tag.material.opacity = away ? 0.78 : 1;
      }
    });
    for (const [k, p] of this.players) {
      if (keep.has(k)) continue;
      this.playerRoot.remove(p.group); p.dispose?.(); this.players.delete(k);
    }
  }

  _shoePos() {
    if (this.shoe) { const w = new THREE.Vector3(); this.shoe.getWorldPosition(w); w.y = FELT_Y + 0.08; return w; }
    const p = this._xz(-0.42, 0.16); return new THREE.Vector3(p.x, FELT_Y + 0.08, p.z);
  }
  _trayPos() {
    if (this.tray) { const w = new THREE.Vector3(); this.tray.getWorldPosition(w); w.y = FELT_Y + 0.08; return w; }
    const p = this._xz(0.46, 0.16); return new THREE.Vector3(p.x, FELT_Y + 0.08, p.z);
  }

  _layoutCards(v, dealerCards, handsOf) {
    const need = [];
    const ordered = seatsInOrder(v?.seats, v?.maxSeats);
    const cap = Math.max(1, ordered.length);
    let stagger = 0;
    const tilt = -Math.PI / 2 - 0.28; // flatter for a downward dealer-eye camera so ranks stay readable
    ordered.forEach((s) => {
      if (!s) return;
      const lay = this._lay(cap, s.i);
      const hs = handsOf?.(s.i) || [];
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      hs.forEach((h, hi) => {
        const cards = h.cards || [];
        const mid = (hs.length - 1) / 2;
        const ox = (hi - mid) * 0.26 * px, oz = (hi - mid) * 0.26 * pz;
        cards.forEach((c, ci) => {
          const fan = (ci - (cards.length - 1) / 2) * 0.13;
          need.push({
            id: `p:${s.i}:${hi}:${ci}`,
            seat: s.i, hand: hi, idx: ci,
            code: c,
            x: lay.cardX + ox + px * fan,
            y: FELT_Y + 0.018 + ci * 0.0015,
            z: lay.cardZ + oz + pz * fan,
            rotX: tilt,
            rotY: lay.yaw * 0.15,
            rotZ: (ci - (cards.length - 1) / 2) * 0.06,
            down: !c,
            scale: 2.4,
            stagger: (stagger++) * 70,
          });
        });
      });
    });
    (dealerCards || []).forEach((c, ci) => {
      const n = dealerCards.length;
      const p = this._xz((ci - (n - 1) / 2) * 0.20, 0.12 + ci * 0.008);
      need.push({
        id: `d:${ci}`, dealer: true, idx: ci, code: c,
        x: p.x, y: FELT_Y + 0.02, z: p.z,
        rotX: -Math.PI / 2 - 0.28, rotY: 0, rotZ: 0,
        down: !c, scale: 3.3, stagger: (stagger++) * 70,
      });
    });
    this._setCardTargets(need);
    this._cardTargets = need;
  }

  _setCardTargets(need) {
    const now = performance.now();
    const keep = new Set();
    need.forEach((d) => {
      keep.add(d.id);
      let m = this._cardById.get(d.id);
      if (!m) {
        m = this._card();
        m.userData.id = d.id;
        m.position.copy(this._shoePos());
        m.rotation.order = 'YXZ';
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.userData.anim = { mode: 'deal', t0: now + (d.stagger || 0), dur: this.reduced ? 80 : 560 };
        this._cardById.set(d.id, m);
        if (!this.reduced) this.onSfx?.('deal');
      } else if (m.userData.down && !d.down) {
        m.userData.anim = { mode: 'flip', t0: now, dur: this.reduced ? 80 : 640, mid: false };
        if (!this.reduced) this.onSfx?.('flip');
      }
      m.userData.target = d;
      m.userData.down = d.down;
      m.visible = true;
      if (!m.userData.anim || m.userData.anim.mode === 'idle') this._applyCardPose(m, d, 1);
    });
    for (const [id, m] of this._cardById) {
      if (keep.has(id)) continue;
      const d = m.userData.target || {};
      m.userData.anim = { mode: 'sweep', t0: now, dur: this.reduced ? 80 : 480, from: m.position.clone() };
      m.userData.target = { ...d, x: this._trayPos().x, y: this._trayPos().y, z: this._trayPos().z, rotX: -Math.PI / 2, rotY: 0, rotZ: 0, scale: d.scale || 2.4 };
      this._cardById.delete(id);
    }
  }

  _applyCardPose(m, d, u = 1, extraY = 0, spin = 0) {
    if (!d) { m.visible = false; return; }
    m.visible = true;
    m.position.set(d.x, d.y + extraY, d.z);
    m.rotation.order = 'YXZ';
    m.rotation.set(d.rotX || 0, (d.rotY || 0) + spin, d.rotZ || 0);
    const sc = d.scale || 1; m.scale.set(sc, sc, sc);
    const face = m.userData.face;
    const tex = d.down ? this.backTex : this._face(d.code);
    if (face && face.material.map !== tex) { face.material.map = tex; face.material.needsUpdate = true; }
  }

  _tickCards(now) {
    const shoe = this._shoePos(), tray = this._trayPos();
    const live = new Set(this._cardById.values());
    this.cards.children.forEach((m) => {
      const d = m.userData.target;
      const a = m.userData.anim;
      if (!a) {
        if (d) this._applyCardPose(m, d, 1);
        else m.visible = false;
        return;
      }
      const u = Math.max(0, Math.min(1, (now - a.t0) / (a.dur || 1)));
      if (u <= 0) {
        if (a.mode === 'deal') { m.position.copy(shoe); m.visible = true; }
        return;
      }
      if (a.mode === 'deal') {
        const e = easeOutCubic(u);
        const mid = new THREE.Vector3((shoe.x + d.x) * 0.5, FELT_Y + 0.42, (shoe.z + d.z) * 0.5);
        const p = shoe.clone().lerp(mid, e).lerp(mid.clone().lerp(new THREE.Vector3(d.x, d.y, d.z), e), e);
        const bounce = u > 0.8 ? Math.sin((u - 0.8) / 0.2 * Math.PI) * 0.03 * (1 - (u - 0.8) / 0.2) : 0;
        const spin = (1 - e) * 1.15;
        this._applyCardPose(m, { ...d, x: p.x, y: p.y + bounce, z: p.z }, 1, 0, spin);
        if (u >= 1) { m.userData.anim = null; this._applyCardPose(m, d, 1); }
      } else if (a.mode === 'flip') {
        const e = easeInOut(u);
        const lift = Math.sin(e * Math.PI) * 0.1;
        const spin = e * Math.PI;
        const mid = e >= 0.5;
        if (mid && !a.mid) { a.mid = true; }
        this._applyCardPose(m, { ...d, down: !mid && d.down ? true : d.down, y: d.y + lift, rotY: (d.rotY || 0) + (mid ? 0 : Math.PI) }, 1);
        // During the first half show the back; after midpoint, the face.
        const face = m.userData.face;
        const tex = e < 0.5 ? this.backTex : this._face(d.code);
        if (face && face.material.map !== tex) { face.material.map = tex; face.material.needsUpdate = true; }
        m.rotation.set(d.rotX, d.rotY || 0, spin);
        if (u >= 1) { m.userData.anim = null; this._applyCardPose(m, d, 1); }
      } else if (a.mode === 'sweep') {
        const e = easeInOut(u);
        const from = a.from || m.position;
        const to = tray;
        const midY = Math.max(from.y, to.y) + 0.28;
        const x = from.x + (to.x - from.x) * e;
        const z = from.z + (to.z - from.z) * e;
        const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * midY + e * e * to.y;
        m.position.set(x, y, z);
        m.rotation.z = e * 0.8;
        m.visible = u < 1;
        if (u >= 1) { m.visible = false; m.userData.anim = null; m.userData.target = null; }
      } else {
        m.userData.anim = null;
        if (d) this._applyCardPose(m, d, 1);
      }
    });
  }

  _layoutChips(v, handsOf) {
    this._resetChips();
    const ordered = seatsInOrder(v?.seats, v?.maxSeats);
    const cap = Math.max(1, ordered.length);
    ordered.forEach((s) => {
      if (!s) return;
      const lay = this._lay(cap, s.i);
      const bet = v.round?.bets?.[s.i];
      const hs = handsOf?.(s.i) || [];
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      // Real bet in the betting circle, slightly toward the rail from the cards. Bankroll is a shorter stack behind it.
      this._stack(Math.min(20, s.chips || 0), lay.chipX + px * 0.1, lay.chipZ + pz * 0.1);
      if (bet && !bet.out && !hs.length) this._stack(bet.bet, lay.chipX, lay.chipZ);
      hs.forEach((h, hi) => {
        const mid = (hs.length - 1) / 2;
        const x = lay.chipX + (hi - mid) * 0.18 * px;
        const z = lay.chipZ + (hi - mid) * 0.18 * pz;
        this._stack(h.bet || bet?.bet || 0, x, z);
        if (h.doubled) this._stack(h.bet / 2 || 0, x + px * 0.06, z + pz * 0.06);
      });
    });
    const bank = Math.min(24, Math.max(12, Math.round((v?.house?.bank || 200) / 25)));
    for (let i = 0; i < bank; i++) {
      const col = i % 5; const row = Math.floor(i / 5);
      const kind = ['r', 'g', 'k', 'b', 'r'][col];
      { const p = this._xz(0.34 + col * 0.042, 0.1 + Math.floor(row / 8) * 0.042); this._placeChip(kind, p.x, FELT_Y + 0.02 + (row % 8) * 0.0058, p.z); }
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
      this._tickCards(now);
      this._tickLabels(now);
      this._tickPit(now, dt);
      this._tickDealerHands(now, dt);
      this._tickTip(now);
      this._tickPayout(now);
      this._tickFps(now);
      this.renderer.render(this.scene, this.camera);
    } catch (err) { console.error('pov loop', err); }
  }
  _tickCamera(now, dt) {
    const t = now / 1000;
    const bob = this.reduced ? 0 : 1;
    const introU = this.reduced ? 1 : easeInOut((now - (this._introT0 || 0)) / 1200);
    const wantZoom = 0;
    this._zoom += (wantZoom - this._zoom) * Math.min(1, (dt || 0.016) * 1.6);
    const dest = this._baseCam.clone();
    dest.x += this._panX * 0.25;
    const lookDest = this._look.clone();
    this._panX += ((this._turnX || 0) * 0.05 - this._panX) * Math.min(1, (dt || 0.016) * 2.0);
    lookDest.x += this.yaw * 0.85 + this._panX;
    lookDest.y += this.pitch * 0.7;
    // Subtle zoom toward the acting seat.
    const fwd = lookDest.clone().sub(dest).normalize();
    dest.add(fwd.multiplyScalar(this._zoom));
    let pos = dest, look = lookDest;
    if (introU < 1 && this._introFrom) {
      pos = this._introFrom.clone().lerp(dest, introU);
      look = (this._introLook || lookDest).clone().lerp(lookDest, introU);
    }
    // Pit-boss push-in.
    const pit = this._pit;
    if (pit && (pit.state === 'loom' || pit.loom) && !this.reduced) {
      const push = 0.16;
      pos = pos.clone().lerp(look, push * 0.35);
    }
    pos.x += Math.sin(t * 0.7) * 0.007 * bob;
    pos.y += Math.sin(t * 1.15) * 0.011 * bob;
    pos.z += Math.cos(t * 1.15) * 0.005 * bob;
    look.y += Math.sin(t * 0.9) * 0.008 * bob;
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this._applyContentFrustum();
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
      if (p.away) {
        applyPose(p, REST);
        p.torso.rotation.x = 0.58;
        p.torso.position.y = 0.06;
        p.head.rotation.x = 0.48;
        p.head.rotation.y = 0.18;
        continue;
      }
      p.torso.position.y = 0.1 + (this.reduced ? 0 : Math.sin(t * 1.5) * 0.008);
      // Glance at the acting seat, or down at their own cards, then back.
      const glance = this.reduced ? 0 : Math.sin(t * 0.45) * 0.1;
      let headY = glance;
      if (this._turnX != null && !p.turn) {
        const dx = (this._turnX || 0) - p.group.position.x;
        headY += Math.max(-0.45, Math.min(0.45, Math.atan2(dx, 0.8) * 0.5));
      }
      if (p.turn) headY += Math.sin(t * 0.8) * 0.04;
      p.head.rotation.y = headY;
      p.head.rotation.x = this.reduced ? 0 : (p.turn ? 0.12 : 0) + Math.sin(t * 0.5) * 0.03;
      const pose = (g && g.seat === p.seat) ? samplePose(g.kind, u) : REST;
      applyPose(p, pose);
      if (!g || g.seat !== p.seat) {
        p.wrR.rotation.z += (this.reduced ? 0 : Math.sin(t * 2.2) * 0.08 - p.wrR.rotation.z) * 0.05;
      }
    }
  }

  _syncLabels(v, handsOf, fxFor, turnSeat) {
    const now = performance.now();
    const ordered = seatsInOrder(v?.seats, v?.maxSeats);
    const cap = Math.max(1, ordered.length);
    const want = [];
    if (this.gesture) {
      const lay = this._lay(cap, this.gesture.seat);
      want.push({ id: `act:${this.gesture.seq}`, text: String(this.gesture.kind || '').toUpperCase(), x: lay.x, y: 1.78, z: lay.z - 0.08, color: '#f2c65a', until: this.gesture.t0 + this.gesture.dur + 200, scale: 0.5 });
    }
    ordered.forEach((s) => {
      if (!s) return;
      const lay = this._lay(cap, s.i);
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      const hs = handsOf?.(s.i) || [];
      hs.forEach((h, hi) => {
        const mid = (hs.length - 1) / 2;
        const x = lay.cardX + (hi - mid) * 0.26 * px;
        const z = lay.cardZ + (hi - mid) * 0.26 * pz;
        if (h.bj) want.push({ id: `bj:${s.i}:${hi}`, text: 'BLACKJACK', x, y: 1.55, z, color: '#f2c65a', until: now + 2400, scale: 0.55 });
        else if (h.bust) want.push({ id: `bust:${s.i}:${hi}`, text: 'BUST', x, y: 1.5, z, color: '#f0b0a0', until: now + 2000, scale: 0.48 });
        if (h.total && (h.cards || []).some(Boolean)) {
          want.push({ id: `tot:${s.i}:${hi}`, text: String(h.total), x: x + px * 0.18, y: FELT_Y + 0.14, z: z + pz * 0.12, color: '#f4efe4', bg: 'rgba(20,12,6,.94)', until: now + 8000, scale: 0.34, chip: true });
        }
      });
    });
    const keep = new Set(want.map((d) => d.id));
    want.forEach((d) => {
      let s = this._labelById.get(d.id);
      if (!s || s.userData.text !== d.text) {
        if (s) { this.labels.remove(s); s.userData.tex?.dispose?.(); this._labelById.delete(d.id); }
        const tex = labelTexture(d.text, d.color, d.bg, !!d.chip);
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.userData.tex = tex; s.userData.text = d.text; s.userData.chip = !!d.chip;
        this.labels.add(s);
        this._labelById.set(d.id, s);
      }
      s.position.set(d.x, d.y, d.z);
      if (d.chip) s.scale.set(0.18, 0.18, 1);
      else s.scale.set(d.scale || 0.45, (d.scale || 0.45) * 0.28, 1);
      s.userData.until = d.until;
      s.visible = true;
    });
    for (const [id, s] of this._labelById) {
      if (keep.has(id) || id.startsWith('chat:')) continue;
      if ((s.userData.until || 0) < now && !id.startsWith('tot:')) {
        this.labels.remove(s); s.userData.tex?.dispose?.(); this._labelById.delete(id);
      }
    }
  }

  _tickLabels(now) {
    for (const [id, s] of this._labelById) {
      const left = (s.userData.until || 0) - now;
      if (s.material) s.material.opacity = left < 400 ? Math.max(0, left / 400) : 1;
      if (left < 0 && !id.startsWith('tot:')) {
        this.labels.remove(s); s.userData.tex?.dispose?.(); this._labelById.delete(id);
      }
    }
  }

  _syncChat(chat) {
    const now = performance.now();
    const rows = (chat || []).slice(-4);
    rows.forEach((m) => {
      const id = `chat:${m.at}:${m.id || m.name}`;
      if (this._labelById.has(id)) return;
      let pos = null;
      for (const p of this.players.values()) {
        if (p.name === m.name) { pos = p.group.position; break; }
      }
      if (!pos) return;
      const tex = labelTexture(m.text, '#f4efe4', 'rgba(12,10,8,.9)');
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.position.set(pos.x, 1.85, pos.z); s.scale.set(0.62, 0.18, 1);
      s.userData = { tex, until: now + 2800 };
      this.labels.add(s); this._labelById.set(id, s);
    });
  }

  _tickPayout(now) {
    const p = this._payout;
    if (!p) return;
    const u = (now - p.t0) / 1600;
    if (u >= 1) { this._payout = null; if (this._payChips) { this._payChips.forEach((m) => this.scene.remove(m)); this._payChips = null; } return; }
    if (!this._payChips) {
      this._payChips = [];
      const cap = Math.max(1, (this._view?.v?.maxSeats) || 5);
      (p.results || []).forEach((r) => {
        const lay = this._lay(cap, r.seat);
        const win = (r.net || 0) >= 0;
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10), std(win ? '#1c7a3a' : '#b01c2c'));
          m.userData = { win, lay, i, phase: i * 0.12 };
          this.scene.add(m); this._payChips.push(m);
        }
      });
      const hasBj = (p.last?.hands || []).some((h) => h.bj);
      if (hasBj) this.onSfx?.('bj');
    }
    const tray = this._trayPos();
    this._payChips.forEach((m) => {
      const { win, lay, phase } = m.userData;
      const e = easeInOut(Math.max(0, Math.min(1, u - phase)));
      const from = win ? tray : new THREE.Vector3(lay.chipX, FELT_Y + 0.04, lay.chipZ);
      const to = win ? new THREE.Vector3(lay.chipX, FELT_Y + 0.04, lay.chipZ) : tray;
      const x = from.x + (to.x - from.x) * e, z = from.z + (to.z - from.z) * e;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * (FELT_Y + 0.45) + e * e * to.y;
      m.position.set(x, y, z);
      m.rotation.x = e * 6;
      m.visible = e > 0 && e < 1;
    });
  }

  _tickPit(now, dt) {
    if (!this._pit) { this.brisk.visible = false; this._pitPlaced = false; this._pitLoomed = false; return; }
    this.brisk.visible = true;
    // Stand on the dealer's right, behind the rail, fully in the mobile frame.
    const dest = ((p) => new THREE.Vector3(p.x, 0, p.z))(this._xz(1.2, 1.15));
    const start = ((p) => new THREE.Vector3(p.x, 0, p.z))(this._xz(1.85, 1.7));
    const loom = ((p) => new THREE.Vector3(p.x, 0, p.z))(this._xz(1.05, 0.98));
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
    const phase = now / 150;
    const step = Math.sin(phase);
    const swing = moving && !this.reduced ? step * 0.55 : 0;
    const aL = this.brisk.getObjectByName('aL'), aR = this.brisk.getObjectByName('aR');
    if (aL) aL.rotation.x = swing; if (aR) aR.rotation.x = -swing;
    this.brisk.position.y = moving && !this.reduced ? Math.abs(step) * 0.04 : 0;
    this.brisk.rotation.z = moving && !this.reduced ? step * 0.04 : 0;
  }
  _tickDealerHands(now, dt) {
    const t = now / 1000;
    const arms = this.dealerArms;
    const dealing = [...(this._cardById?.values() || [])].some((m) => m.userData.anim?.mode === 'deal' && now >= (m.userData.anim.t0 || 0));
    const flipping = [...(this._cardById?.values() || [])].some((m) => m.userData.anim?.mode === 'flip');
    const sweeping = [...(this._cardById?.values() || [])].some((m) => m.userData.anim?.mode === 'sweep');
    if (this._shuffleT0 && this.shoe) {
      const u = (now - this._shuffleT0) / 800;
      if (u < 1) this.shoe.rotation.y = Math.sin(u * 16) * 0.14;
      else { this.shoe.rotation.y = 0; this._shuffleT0 = 0; }
    }
    if (!this.reduced && (dealing || this._dealFlick || this._view?.dealing)) {
      const u = (Math.sin(t * 9) * 0.5 + 0.5);
      arms.armR.rotation.x = 0.15 - u * 1.05;
      arms.armR.rotation.z = 0.3 - u * 0.25;
      arms.armL.rotation.x = 0.4;
      arms.wrR.rotation.x = u * 0.4;
    } else if (!this.reduced && flipping) {
      arms.armR.rotation.x = -0.2;
      arms.armR.rotation.z = 0.05;
      arms.wrR.rotation.x = Math.sin(t * 8) * 0.2;
    } else if (!this.reduced && sweeping) {
      arms.armR.rotation.x = -0.15;
      arms.armL.rotation.x = -0.1;
      arms.armR.rotation.z = 0.45;
    } else {
      arms.armR.rotation.x += (0.35 + Math.sin(t * 1.2) * 0.03 - arms.armR.rotation.x) * 0.08;
      arms.armL.rotation.x += (0.35 + Math.sin(t * 1.1) * 0.03 - arms.armL.rotation.x) * 0.08;
      arms.armR.rotation.z += (0.2 - arms.armR.rotation.z) * 0.08;
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
    const p0 = ((p) => new THREE.Vector3(p.x, FELT_Y + 0.25, p.z))(this._xz(0, 1.15));
    const p2 = ((p) => new THREE.Vector3(p.x, FELT_Y + 0.04, p.z))(this._xz(0.2, 0.2));
    const p1 = ((p) => new THREE.Vector3(p.x, FELT_Y + 0.7, p.z))(this._xz(0.08, 0.6));
    const a = p0.clone().lerp(p1, u), b = p1.clone().lerp(p2, u);
    this._tipMesh.position.copy(a.lerp(b, u));
    this._tipMesh.rotation.x = u * 8; this._tipMesh.rotation.z = u * 3; this._tipMesh.visible = u < 1;
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

  _framePoints() {
    const pts = [];
    const cap = Math.max(4, this._view?.v?.maxSeats || 5);
    for (let i = 0; i < cap; i++) {
      const lay = this._lay(cap, i);
      const px = Math.cos(lay.yaw), pz = -Math.sin(lay.yaw);
      pts.push(new THREE.Vector3(lay.x, 1.42, lay.z));
      pts.push(new THREE.Vector3(lay.x + px * 0.2, 1.26, lay.z + pz * 0.04));
      pts.push(new THREE.Vector3(lay.x - px * 0.2, 1.26, lay.z - pz * 0.04));
      pts.push(new THREE.Vector3(lay.cardX, FELT_Y + 0.02, lay.cardZ));
    }
    const at = (x, y, z) => { const p = this._xz(x, z); return new THREE.Vector3(p.x, y, p.z); };
    pts.push(at(-0.2, FELT_Y + 0.03, 0.12));
    pts.push(at(0.2, FELT_Y + 0.03, 0.12));
    pts.push(at(0, FELT_Y, 0.02));
    pts.push(at(-0.7, FELT_Y, 0.02));
    pts.push(at(0.7, FELT_Y, 0.02));
    return pts;
  }
  _applyContentFrustum() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(cam.matrixWorldInverse);
    const v = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this._framePoints()) {
      v.copy(p).applyMatrix4(inv);
      const z = -v.z;
      if (z < 0.1) continue;
      const x = v.x / z, y = v.y / z;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX) || maxX - minX < 1e-4 || maxY - minY < 1e-4) return;
    const padX = (maxX - minX) * 0.10 + 0.02;
    const padTop = (maxY - minY) * 0.18 + 0.03;
    const padBot = (maxY - minY) * 0.14 + 0.04;
    minX -= padX; maxX += padX;
    minY -= padBot; maxY += padTop;
    // Keep the canvas aspect so a tall phone does not vertically stretch figures.
    // Extra room goes above the heads (pit atmosphere), not under the rail.
    const wPx = this.canvas.clientWidth || this.renderer?.domElement?.clientWidth || 1;
    const hPx = this.canvas.clientHeight || this.renderer?.domElement?.clientHeight || 1;
    const aspect = Math.max(0.2, Math.min(4, wPx / hPx));
    let left = minX, right = maxX, bottom = minY, top = maxY;
    const spanX = right - left, spanY = top - bottom;
    if (spanX / spanY > aspect) {
      const extra = spanX / aspect - spanY;
      top += extra * 0.88;
      bottom -= extra * 0.12;
    } else {
      const extra = spanY * aspect - spanX;
      left -= extra / 2;
      right += extra / 2;
    }
    const near = cam.near || 0.08, far = cam.far || 24;
    cam.projectionMatrix.makePerspective(left * near, right * near, top * near, bottom * near, near, far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  getFraming() {
    this.camera.updateMatrixWorld();
    this._applyContentFrustum();
    const rect = this.canvas.getBoundingClientRect();
    const project = (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).project(this.camera);
      return {
        ndcX: p.x, ndcY: p.y, ndcZ: p.z,
        x: rect.left + (p.x + 1) * 0.5 * rect.width,
        y: rect.top + (1 - p.y) * 0.5 * rect.height,
        visible: p.x >= -0.98 && p.x <= 0.98 && p.y >= -0.98 && p.y <= 0.98 && p.z <= 1,
      };
    };
    const seats = [];
    for (const p of this.players.values()) {
      const wp = new THREE.Vector3();
      if (p.head) p.head.getWorldPosition(wp);
      else wp.set(p.group.position.x, 1.36, p.group.position.z);
      seats.push({ name: p.name, seat: p.seat, head: project(wp.x, wp.y, wp.z) });
    }
    const dealerCards = [];
    for (const [id, m] of this._cardById || []) {
      if (!String(id).startsWith('d:')) continue;
      const wp = new THREE.Vector3();
      m.getWorldPosition(wp);
      dealerCards.push({ id, ...project(wp.x, wp.y, wp.z) });
    }
    return {
      canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      seats,
      dealerCards,
    };
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

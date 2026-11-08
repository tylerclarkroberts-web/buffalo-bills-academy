// Draws the fight on a canvas laid over the card table: two low-poly fighters on the felt, hit sparks,
// combo text and cartoon stars. Pure drawing: the fight itself is server/engine/fight.js.
import { PMOVES, GMOVES, RIP_AT } from '../../../server/engine/fight.js';
import { headParts, looks, shade } from '../avatar/genbust.js';
import { makeFatal, makeBlood } from './fatal.js';
import { makeGag } from './gag.js';

const lerp = (a, b, t) => a + (b - a) * t;
const lp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** A generated head as an image (same art as the seat busts). */
export function genHeadImage(seed) {
  const h = headParts(seed); const { L, cx, cy } = h;
  const paths = [...h.ears, ...h.skin, ...h.beard, ...h.hair].map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.fill}" stroke-width=".3"/>`).join('');
  const brows = L.brows ? `<g stroke="${shade(L.hair, -0.3)}" stroke-width="1.6" stroke-linecap="round"><path d="M${cx - 11} ${cy - 5} L${cx - 4} ${cy - 6}"/><path d="M${cx + 11} ${cy - 5} L${cx + 4} ${cy - 6}"/></g>` : '';
  const face = `<ellipse cx="${cx - 7}" cy="${cy}" rx="2" ry="2.3" fill="#1b1512"/><ellipse cx="${cx + 7}" cy="${cy}" rx="2" ry="2.3" fill="#1b1512"/><path d="M${cx} ${cy + 1} L${cx - 2.5} ${cy + 8} L${cx + 2} ${cy + 8} Z" fill="${shade(L.skin, -0.18)}"/><path d="M${cx - 5} ${cy + 13} Q${cx} ${cy + 15.5} ${cx + 5} ${cy + 13}" stroke="${shade(L.skin, -0.45)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -12 68 84" width="136" height="168">${paths}${brows}${face}</svg>`;
  const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img;
}

// ---- poses: joint positions in fighter units (facing +x, y up from the floor) ----
const BASE = { hip: [0, 88], sh: [4, 150], head: [7, 177], fe: [26, 128], fh: [36, 152], be: [-6, 124], bh: [16, 146], fk: [16, 46], ff: [24, 0], bk: [-12, 46], bf: [-22, 0] };
const CROUCH = { hip: [0, 50], sh: [10, 108], head: [14, 134], fe: [30, 92], fh: [38, 114], be: [-2, 88], bh: [20, 108], fk: [30, 40], ff: [34, 0], bk: [-16, 30], bf: [-28, 0] };
const AIR = { ...BASE, fk: [24, 60], ff: [10, 34], bk: [-6, 56], bf: [-22, 34] };
const poses = {
  block: { fe: [26, 142], fh: [22, 176], be: [20, 130], bh: [16, 168] },
  cblock: { fe: [30, 104], fh: [24, 136], be: [24, 94], bh: [20, 128] },
  jab: { sh: [10, 150], fe: [56, 152], fh: [96, 154] },
  lp: { fe: [54, 104], fh: [88, 104] },
  kick: { sh: [-6, 150], head: [-4, 176], fk: [52, 92], ff: [112, 112], bk: [-8, 46], bf: [-14, 0] },
  sw: { sh: [-4, 100], head: [-4, 126], fk: [46, 20], ff: [112, 6], bk: [-14, 34], bf: [-26, 0] },
  jk: { fk: [40, 62], ff: [96, 40], bk: [-8, 66], bf: [-24, 50], fe: [10, 168], fh: [-8, 180] },
  sp: { sh: [14, 156], head: [16, 184], fe: [36, 196], fh: [44, 240], fk: [26, 60], ff: [30, 18] },
  hay0: { sh: [-6, 152], head: [-6, 178], fe: [-30, 176], fh: [-44, 206] },
  hay: { sh: [18, 148], head: [20, 174], fe: [62, 196], fh: [112, 150] },
  throw: { sh: [16, 148], fe: [50, 150], fh: [84, 156], be: [44, 132], bh: [80, 138] },
  dash: { hip: [6, 86], sh: [30, 142], head: [38, 166], fe: [60, 140], fh: [96, 142] },
  hit: { sh: [-16, 146], head: [-24, 170], fe: [8, 160], fh: [-4, 190], be: [-30, 140], bh: [-46, 160] },
  burst: { fe: [40, 176], fh: [60, 210], be: [-30, 176], bh: [-50, 210] },
};
// ---- Guntrad after the rip: a gangly, shredded, grey night-creature. Hunched, leaning back from the hips,
// knuckles almost on the felt. ONLY the body changes: his face is the same dealer portrait, drawn by the same code.
const GB = { hip: [-12, 102], sh: [20, 158], head: [40, 174], fe: [46, 104], fh: [60, 26], be: [6, 100], bh: [20, 22], fk: [28, 56], ff: [40, 0], bk: [-30, 52], bf: [-42, 0] };
const GBC = { hip: [-6, 64], sh: [24, 120], head: [42, 138], fe: [46, 80], fh: [58, 14], be: [2, 76], bh: [16, 12], fk: [38, 36], ff: [42, 0], bk: [-28, 30], bf: [-38, 0] };
const gposes = {
  block: { fe: [36, 150], fh: [28, 198], be: [26, 140], bh: [18, 190] },
  cblock: { fe: [40, 110], fh: [32, 152], be: [30, 100], bh: [24, 146] },
  jab: { sh: [20, 166], fe: [62, 168], fh: [104, 170] },
  reach: { sh: [24, 164], head: [26, 188], fe: [64, 168], fh: [108, 168] },
  dash: { hip: [8, 96], sh: [36, 156], head: [46, 178], fe: [70, 156], fh: [110, 158] },
  hay0: { sh: [-6, 170], head: [6, 192], fe: [-30, 208], fh: [-52, 252] },
  hay: { sh: [22, 162], head: [30, 186], fe: [64, 214], fh: [112, 150] },
  sweep: { hip: [0, 70], sh: [26, 128], head: [36, 150], fe: [64, 64], fh: [112, 14] },
  throw: { sh: [18, 162], fe: [52, 152], fh: [88, 150], be: [48, 138], bh: [84, 140] },
  thr0: { hip: [-26, 98], sh: [28, 158], head: [40, 180], fe: [20, 110], fh: [6, 60], be: [0, 112], bh: [-16, 66] },
  thr: { hip: [30, 98], sh: [-18, 164], head: [-8, 188], fe: [-34, 196], fh: [-22, 236], be: [-38, 184], bh: [-34, 226], fk: [44, 50], ff: [40, 0], bk: [-18, 50], bf: [-32, 0] },
  hit: { sh: [-20, 160], head: [-24, 184], fe: [8, 146], fh: [-4, 104], be: [-36, 146], bh: [-52, 112] },
  burst: { fe: [44, 190], fh: [70, 230], be: [-34, 190], bh: [-60, 230] },
};
function beastPose(o, t, d) {
  const bob = Math.sin(t / 300 + 1.3) * 3; const sway = Math.sin(t / 520) * 4;
  if (o.pose) return { p: { ...GB, ...o.pose }, stretch: o.stretch || 0, blade: o.blade || 0 }; // the fatality scenes pose him directly
  if (o.st === 'down') return { p: GB, down: true };
  const inAir = o.y > 0;
  let base = (o.crouch || (o.st === 'atk' && o.mv === 'sweep')) ? GBC : GB;
  base = { ...base, sh: [base.sh[0] + sway * 0.4, base.sh[1] + bob], head: [base.head[0] + sway * 0.4, base.head[1] + bob], fh: [base.fh[0] + sway, base.fh[1] + Math.abs(bob)], bh: [base.bh[0] - sway * 0.5, base.bh[1]] };
  if (inAir) base = { ...base, fk: [34, 70], ff: [16, 36], bk: [-8, 64], bf: [-28, 36] };
  if (!inAir && o.st === 'idle' && o.walking) { const s = Math.sin(t / 80) * 18; base = { ...base, fk: [30 + s, 56], ff: [38 + s * 1.5, 0], bk: [-26 - s, 54], bf: [-38 - s * 1.5, 0], fh: [base.fh[0] - s * 0.6, base.fh[1] + 6], bh: [base.bh[0] + s * 0.6, base.bh[1] + 6] }; }
  if (o.st === 'hit') return { p: mix(base, gposes.hit, 1) };
  if (o.st === 'burst') return { p: mix(base, gposes.burst, 1), ring: true };
  if (o.st === 'dizzy') return { p: mix(base, gposes.hit, 0.4 + Math.sin(t / 120) * 0.3), stars: true };
  if (o.guard > 0) return { p: mix(base, o.crouch ? gposes.cblock : gposes.block, 1) };
  if (o.st === 'atk' && o.mv) {
    const m = GMOVES[o.mv]; const e = ext(o, m);
    let p;
    if (o.mv === 'hay') p = o.mf < m.su ? mix(base, gposes.hay0, e) : mix(base, gposes.hay, e);
    else if (o.mv === 'thrust') p = o.mf < m.su ? mix(base, gposes.thr0, e) : mix(base, gposes.thr, e);
    else p = mix(base, gposes[o.mv] || {}, e);
    let stretch = 0;
    if (m.stretch && o.mf >= m.su - 3) { // Mr. Fantastic: the arm reaches all the way to you
      const target = (Math.min(d, m.rg) - 24) / 1.16;
      const hx = p.fh[0];
      if (target > hx + 10) {
        const k2 = o.mf < m.su ? 0.35 : e; const nx = hx + (target - hx) * k2 * k2 * (3 - 2 * k2);
        const ny = o.mv === 'sweep' ? 14 : o.mv === 'hay' ? lerp(p.fh[1], 120, k2) : p.fh[1];
        stretch = nx - hx;
        p = { ...p, fh: [nx, ny], fe: [lerp(p.sh[0], nx, 0.5), lerp(p.sh[1], ny, 0.5) + Math.sin(t / 26) * Math.min(10, stretch / 12)] };
      }
    }
    return { p, heavy: o.mf < m.su, stretch, thrust: o.mv === 'thrust' && o.mf >= m.su && o.mf < m.su + m.ac + 6 };
  }
  return { p: base };
}

function mix(base, over, t) { const o = {}; for (const k in base) o[k] = over[k] ? lp2(base[k], over[k], t) : base[k]; return o; }
function ext(o, m) { if (!m) return 0; const f = o.mf; if (f < m.su) return f / m.su; if (f < m.su + m.ac) return 1; return m.re ? Math.max(0, 1 - (f - m.su - m.ac) / m.re) : 1; }

function poseOf(o, who, t) {
  const bob = Math.sin(t / 260 + (who === 'g' ? 1.3 : 0)) * 2;
  if (o.st === 'down') return { p: mix(BASE, {}, 0), down: true };
  const inAir = o.y > 0;
  let base = inAir ? AIR : o.crouch || (o.st === 'atk' && ['lp', 'sw', 'sweep'].includes(o.mv)) ? CROUCH : BASE;
  base = { ...base, sh: [base.sh[0], base.sh[1] + bob], head: [base.head[0], base.head[1] + bob] };
  if (!inAir && !o.crouch && o.st === 'idle' && o.walking) { const s = Math.sin(t / 90) * 16; base = { ...base, fk: [16 + s, 46], ff: [24 + s * 1.4, 0], bk: [-12 - s, 46], bf: [-22 - s * 1.4, 0] }; }
  if (o.st === 'hit') return { p: mix(base, poses.hit, 1) };
  if (o.st === 'burst') return { p: mix(base, poses.burst, 1), ring: true };
  if (o.st === 'dizzy') return { p: mix(base, poses.hit, 0.4 + Math.sin(t / 120) * 0.3), stars: true };
  if (o.st === 'bs' || (o.block && o.st === 'idle') || (who === 'g' && o.guard > 0)) return { p: mix(base, o.crouch ? poses.cblock : poses.block, 1) };
  if (o.st === 'atk' && o.mv) {
    const M = who === 'g' ? GMOVES : PMOVES; const m = M[o.mv]; const e = ext(o, m);
    if (who === 'g' && o.mv === 'hay') return { p: o.mf < m.su ? mix(base, poses.hay0, e) : mix(base, poses.hay, e), heavy: o.mf < m.su };
    const key = who === 'g' && o.mv === 'sweep' ? 'sw' : o.mv;
    return { p: mix(base, poses[key] || {}, e), card: o.mv === 'sp', heavy: who === 'g' && o.mf < m.su };
  }
  return { p: base };
}

function cloth(c, shape, col) { // a torn piece of the pit boss outfit (screen-up coordinates)
  const P = { vestL: [[-14, -30], [10, -26], [6, 30], [-16, 26]], vestR: [[-10, -26], [14, -30], [16, 26], [-6, 30]], shirt: [[-22, -24], [22, -20], [18, 22], [-20, 26]], sleeve: [[-24, -7], [24, -9], [22, 7], [-22, 9]], trim: [[-20, -2], [20, -3], [20, 2], [-20, 3]] }[shape];
  if (shape === 'tie') { poly(c, [[0, 0], [-14, -8], [-14, 9]], col); poly(c, [[0, 0], [14, -8], [14, 9]], shade(col, -0.15)); joint(c, [0, 0], 4, shade(col, -0.3)); return; }
  poly(c, P, col); poly(c, [P[0], P[1], [(P[1][0] + P[2][0]) / 2, (P[1][1] + P[2][1]) / 2]], shade(col, -0.15));
}
function poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
/** A limb segment as two faceted halves, low-poly style. */
function seg(ctx, a, b, w, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
  poly(ctx, [[a[0] + nx, a[1] + ny], [b[0] + nx * 0.85, b[1] + ny * 0.85], b, a], shade(col, 0.12));
  poly(ctx, [a, b, [b[0] - nx * 0.85, b[1] - ny * 0.85], [a[0] - nx, a[1] - ny]], shade(col, -0.14));
  joint(ctx, b, w * 0.45, col);
}
function joint(ctx, c, r, col) { const pts = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } poly(ctx, pts, col); }

const G_BEAST = { skin: '#c4c7d2', dark: '#8c90a3', deep: '#555a6e', line: '#2b2d3a', vein: '#7a5f9e', pants: '#1d1519', shoe: '#0e0a0b', claw: '#f4efe4', belt: '#2a1b14', buckle: '#f2c65a' };
const G_LOOK = { skin: '#d9a77f', sleeve: '#cfd0d6', vest: '#7a1530', trim: '#f2c65a', pants: '#1d1519', shoe: '#0e0a0b', tie: '#ff3d8b' };

export function makeRenderer(canvas, { gImg, pImg, pSeed, gore = true, reduced = false, low = false, lens = null }) {
  const ctx = canvas.getContext('2d');
  const L = looks(pSeed || 'x');
  const P_LOOK = { skin: L.skin, sleeve: L.shirt, vest: L.shirt, pants: '#2b2436', shoe: '#140f12' };
  const fx = []; // sparks + floating text: {x, y, t0, kind, text, col}
  let shake = 0; let flash = 0; let camX = null;

  function fighter(o, who, sx, gy, k, t, st) {
    if (who === 'g' && (st.phase !== 'intro' || st.f >= RIP_AT)) return beast(o, sx, gy, k, t, Math.abs(st.g.x - st.p.x));
    const scale = who === 'g' ? 1.16 : 1; const C = who === 'g' ? G_LOOK : P_LOOK;
    const trem = who === 'g' && st.phase === 'intro' && st.f > RIP_AT - 34 ? (st.f - (RIP_AT - 34)) / 34 : 0; // straining at the seams
    const { p, down, stars, ring, card, heavy } = poseOf(o, who, t);
    ctx.save();
    ctx.translate(sx + (trem ? Math.sin(t / 14) * 3 * trem : 0), gy - o.y * k);
    // shadow on the felt
    ctx.save(); ctx.translate(0, o.y * k); ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, 0, 46 * k * scale, 9 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.scale(o.face * k * scale * (1 + trem * 0.06), -k * scale * (1 + trem * 0.03)); // units: x toward the opponent, y up
    if (down) { ctx.rotate(Math.PI / 2 * 0.94); ctx.translate(-30, -60); }
    if (who === 'p' && o.st === 'hit') ctx.globalAlpha = (Math.floor(t / 60) % 2) ? 0.75 : 1;
    // back limbs
    seg(ctx, p.hip, p.bk, 20, shade(C.pants, -0.2)); seg(ctx, p.bk, p.bf, 17, shade(C.pants, -0.2)); poly(ctx, [[p.bf[0] - 6, 0], [p.bf[0] + 16, 0], [p.bf[0] + 12, 8], [p.bf[0] - 6, 9]].map((q) => [q[0], q[1] + p.bf[1]]), C.shoe);
    seg(ctx, p.sh, p.be, 15, shade(C.sleeve, -0.22)); seg(ctx, p.be, p.bh, 13, shade(C.sleeve, -0.22)); joint(ctx, p.bh, 8, shade(C.skin, -0.15));
    // torso
    const w = who === 'g' ? 34 : 24;
    const torso = [[p.hip[0] - w * 0.8, p.hip[1]], [p.hip[0] + w * 0.8, p.hip[1]], [p.sh[0] + w, p.sh[1]], [p.sh[0] - w, p.sh[1]]];
    poly(ctx, torso, C.sleeve);
    poly(ctx, [torso[0], [p.hip[0], p.hip[1]], [(p.sh[0] + p.hip[0]) / 2, (p.sh[1] + p.hip[1]) / 2], torso[3]], shade(C.sleeve, -0.16));
    if (who === 'g') { // the waistcoat over his shirt, gold trim, pink bow tie
      const n = [p.sh[0] + 4, p.sh[1] - 4]; const v = lp2(p.sh, p.hip, 0.45);
      poly(ctx, [torso[0], [v[0], v[1] - 4], [n[0] - 10, n[1]], torso[3]], shade(C.vest, -0.1));
      poly(ctx, [torso[1], torso[2], [n[0] + 10, n[1]], [v[0], v[1] - 4]], C.vest);
      ctx.strokeStyle = C.trim; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(n[0] - 10, n[1]); ctx.lineTo(v[0], v[1] - 4); ctx.lineTo(n[0] + 10, n[1]); ctx.stroke();
      poly(ctx, [[n[0], n[1] - 2], [n[0] - 13, n[1] + 6], [n[0] - 13, n[1] - 10]], C.tie); poly(ctx, [[n[0], n[1] - 2], [n[0] + 13, n[1] + 6], [n[0] + 13, n[1] - 10]], shade(C.tie, -0.15)); joint(ctx, [n[0], n[1] - 2], 4, shade(C.tie, -0.3));
    } else {
      poly(ctx, [[p.sh[0] - 8, p.sh[1]], [p.sh[0] + 8, p.sh[1]], [p.sh[0], p.sh[1] - 12]], shade(C.skin, -0.1));
    }
    // front leg + shoe
    seg(ctx, p.hip, p.fk, 21, C.pants); seg(ctx, p.fk, p.ff, 18, C.pants);
    const fd = [p.ff[0] - p.fk[0], p.ff[1] - p.fk[1]]; const fl = Math.hypot(...fd) || 1;
    ctx.save(); ctx.translate(p.ff[0], p.ff[1]); ctx.rotate(Math.atan2(fd[1], fd[0]) + Math.PI / 2); poly(ctx, [[-8, -4], [-10, 6], [18, 6], [16, -4]], C.shoe); ctx.restore(); void fl;
    // head
    const hr = who === 'g' ? 25 : 24;
    ctx.save(); ctx.translate(p.head[0], p.head[1]); ctx.scale(o.face, -1); // undo the flip so faces read the right way round
    const img = who === 'g' ? gImg : pImg;
    if (who === 'p') pHead(hr);
    else if (img?.complete && img.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.02, hr * 1.26, 0, 0, Math.PI * 2); ctx.clip(); const s = (hr * 2.04) / 158; ctx.drawImage(img, 136, 42, 158, 196, -hr * 1.02, -hr * 1.26, 158 * s, 196 * s); ctx.restore(); }
    else joint(ctx, [0, 0], hr, C.skin);
    if (stars) for (let i = 0; i < 4; i++) { const a = t / 260 + (i * Math.PI) / 2; star(ctx, Math.cos(a) * 34, -hr - 14 + Math.sin(a) * 7, 7, '#ffe27a'); }
    ctx.restore();
    // front arm + fist (over the body)
    seg(ctx, p.sh, p.fe, 16, C.sleeve); seg(ctx, p.fe, p.fh, 14, C.sleeve); joint(ctx, p.fh, heavy ? 12 : 9, C.skin);
    if (heavy) { ctx.strokeStyle = 'rgba(255,90,90,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.fh[0], p.fh[1], 17 + Math.sin(t / 40) * 3, 0, Math.PI * 2); ctx.stroke(); }
    if (card) { ctx.save(); ctx.translate(p.fh[0], p.fh[1] + 16); ctx.rotate(0.3); ctx.shadowColor = '#f2c65a'; ctx.shadowBlur = 18; ctx.fillStyle = '#fbf4ea'; ctx.fillRect(-11, -15, 22, 30); ctx.fillStyle = '#c4203a'; ctx.font = 'bold 15px serif'; ctx.scale(1, -1); ctx.fillText('A', -5, 6); ctx.restore(); }
    if (ring) { ctx.strokeStyle = 'rgba(242,198,90,.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 110, 70 + (t % 300) / 6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  /** The player's head at the current (upright) transform: their avatar photo or generated head. */
  function pHead(hr = 24) {
    const img = pImg;
    if (img?.complete && img.naturalWidth) {
      if (img.src.startsWith('data:')) ctx.drawImage(img, -hr * 1.3, -hr * 1.7, hr * 2.6, hr * 3.2);
      else { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.05, hr * 1.25, 0, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, -hr * 1.25, -hr * 1.4, hr * 2.5, hr * 2.75); ctx.restore(); }
    } else joint(ctx, [0, 0], hr, P_LOOK.skin);
  }
  /** v29: Guntrad's face at a screen point (same crop as gHead, upright), for the balloon gag. */
  function gFace(x, y, hr) {
    ctx.save(); ctx.translate(x, y);
    if (gImg?.complete && gImg.naturalWidth) { ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.02, hr * 1.26, 0, 0, Math.PI * 2); ctx.clip(); const s = (hr * 2.04) / 158; ctx.drawImage(gImg, 136, 42, 158, 196, -hr * 1.02, -hr * 1.26, 158 * s, 196 * s); }
    else joint(ctx, [0, 0], hr, G_LOOK.skin);
    ctx.restore();
  }
  /** Guntrad's head: the dealer portrait crop, exactly as before the rip (same size, same crop, upright). */
  function gHead(p, o, hr, stars) {
    ctx.save(); ctx.translate(p.head[0], p.head[1]); ctx.scale(o.face, -1);
    if (gImg?.complete && gImg.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.02, hr * 1.26, 0, 0, Math.PI * 2); ctx.clip(); const s = (hr * 2.04) / 158; ctx.drawImage(gImg, 136, 42, 158, 196, -hr * 1.02, -hr * 1.26, 158 * s, 196 * s); ctx.restore(); }
    else joint(ctx, [0, 0], hr, G_LOOK.skin);
    if (stars) for (let i = 0; i < 4; i++) { const a = performance.now() / 260 + (i * Math.PI) / 2; star(ctx, Math.cos(a) * 34, -hr - 14 + Math.sin(a) * 7, 7, '#ffe27a'); }
    ctx.restore();
  }
  /** A long sinewy arm: shoulder, elbow, claw hand, with veins. Stretched arms get rubbery rings. */
  function beastArm(p0, p1, p2, w, col, C, stretch, t) {
    const w2 = w * (stretch > 40 ? 0.72 : 0.86);
    seg(ctx, p0, p1, w + 4, C.line); seg(ctx, p1, p2, w2 + 4, C.line); // dark outline
    seg(ctx, p0, p1, w, col); seg(ctx, p1, p2, w2, col);
    const mid = lp2(p0, p1, 0.5); joint(ctx, mid, w * 0.68, shade(col, 0.1)); joint(ctx, lp2(p0, p1, 0.42), w * 0.42, shade(col, 0.2)); // bicep
    joint(ctx, p0, w * 0.95, shade(col, 0.06)); // delt
    ctx.save(); ctx.strokeStyle = C.vein; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
    for (const [a, b] of [[p0, p1], [p1, p2]]) { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const q = lp2(a, b, 0.1 + i * 0.13); const n = (i % 2 ? 1 : -1) * w * 0.16; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; const x = q[0] - (dy / L) * n, y = q[1] + (dx / L) * n; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.restore();
    if (stretch > 40) { // stretch rings along the rubbery forearm
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6;
      for (let i = 1; i <= 4; i++) { const q = lp2(p1, p2, i / 5); ctx.beginPath(); ctx.arc(q[0], q[1], w * 0.42, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    // claw hand: knuckle + three pale talons
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L;
    joint(ctx, p2, w * 0.62, shade(C.skin, -0.1));
    for (let i = -1; i <= 1; i++) { const bx = p2[0] + ux * w * 0.4 - uy * i * w * 0.32, by = p2[1] + uy * w * 0.4 + ux * i * w * 0.32; poly(ctx, [[bx - uy * 2.4, by + ux * 2.4], [bx + uy * 2.4, by - ux * 2.4], [bx + ux * w * 0.95 + i * uy * 3, by + uy * w * 0.95 - i * ux * 3]], C.claw); }
  }
  function beast(o, sx, gy, k, t, d) {
    const scale = 1.16; const C = G_BEAST;
    const { p, down, stars, ring, heavy, stretch = 0, thrust, blade = 0 } = beastPose(o, t, d);
    ctx.save();
    ctx.translate(sx, gy - o.y * k);
    ctx.save(); ctx.translate(0, o.y * k); ctx.fillStyle = 'rgba(0,0,0,.36)'; ctx.beginPath(); ctx.ellipse(0, 0, 54 * k * scale, 10 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.scale(o.face * k * scale, -k * scale);
    if (down) { ctx.rotate(Math.PI / 2 * 0.94); ctx.translate(-30, -60); }
    // back leg + back arm (shadowed)
    seg(ctx, p.hip, p.bk, 18, shade(C.pants, -0.2)); seg(ctx, p.bk, p.bf, 15, shade(C.pants, -0.2)); poly(ctx, [[p.bf[0] - 6, p.bf[1]], [p.bf[0] + 18, p.bf[1]], [p.bf[0] + 14, p.bf[1] + 8], [p.bf[0] - 6, p.bf[1] + 9]], C.shoe);
    beastArm(p.sh, p.be, p.bh, 13, shade(C.skin, -0.2), C, 0, t);
    // torso: broad lats, tiny waist, shredded
    const ax = p.sh[0] - p.hip[0], ay = p.sh[1] - p.hip[1], AL = Math.hypot(ax, ay) || 1; const ux = ax / AL, uy = ay / AL; const nx = -uy, ny = ux;
    const at = (u, v) => [p.hip[0] + ax * u + nx * v, p.hip[1] + ay * u + ny * v];
    const shape = [at(0, -16), at(0, 16), at(0.5, 21), at(0.82, 40), at(1.04, 38), at(1.1, 0), at(1.04, -38), at(0.82, -40), at(0.5, -21)];
    ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = C.line; ctx.lineWidth = 4; ctx.beginPath(); shape.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke(); ctx.restore();
    poly(ctx, shape, C.dark); // lats / sides in shadow
    poly(ctx, [at(0.02, -13), at(0.02, 13), at(0.62, 17), at(0.62, -17)], C.skin); // the stomach
    poly(ctx, [at(0.02, -13), at(0.02, 0), at(0.62, 0), at(0.62, -17)], shade(C.skin, -0.07));
    ctx.save(); ctx.strokeStyle = C.deep; ctx.lineCap = 'round'; ctx.lineWidth = 1.8; // six-pack: a centre line and three curved rows
    ctx.beginPath(); { const a0 = at(0.04, 0), a1 = at(0.62, 0); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); } ctx.stroke();
    for (let r = 0; r < 3; r++) for (const sgn of [1, -1]) { const u = 0.2 + r * 0.16; const a0 = at(u, sgn * 2), m = at(u + 0.03, sgn * 7), a1 = at(u, sgn * 12); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(m[0], m[1], a1[0], a1[1]); ctx.stroke(); }
    ctx.restore();
    for (const sgn of [1, -1]) { // pecs: two big plates, lit from above, shadow underneath
      poly(ctx, [at(0.66, sgn * 1.5), at(0.62, sgn * 26), at(0.8, sgn * 37), at(1.02, sgn * 33), at(1.03, sgn * 1.5)], C.skin);
      poly(ctx, [at(0.66, sgn * 1.5), at(0.62, sgn * 26), at(0.68, sgn * 30), at(0.7, sgn * 3)], C.deep);
    }
    ctx.save(); ctx.strokeStyle = C.deep; ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) for (const sgn of [1, -1]) { ctx.beginPath(); const a = at(0.34 + i * 0.09, sgn * (17 + i * 3)), b = at(0.42 + i * 0.09, sgn * (27 + i * 3)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } ctx.restore(); // serratus
    // neck in shadow so the portrait sits on top unchanged
    poly(ctx, [at(1.02, -10), at(1.02, 10), [p.head[0] + 9, p.head[1] - 14], [p.head[0] - 9, p.head[1] - 14]], C.deep);
    // trousers + belt (PG: the shirt and vest are gone, the trousers stay)
    poly(ctx, [at(-0.06, -19), at(-0.06, 19), at(0.06, 18), at(0.06, -18)], C.belt); joint(ctx, at(0, 0), 4.5, C.buckle);
    seg(ctx, p.hip, p.fk, 19, C.pants); seg(ctx, p.fk, p.ff, 16, C.pants);
    ctx.save(); ctx.translate(p.ff[0], p.ff[1]); const fd = [p.ff[0] - p.fk[0], p.ff[1] - p.fk[1]]; ctx.rotate(Math.atan2(fd[1], fd[0]) + Math.PI / 2); poly(ctx, [[-8, -4], [-10, 6], [20, 6], [18, -4]], C.shoe); ctx.restore();
    gHead(p, o, 25, stars);
    beastArm(p.sh, p.fe, p.fh, 15, C.skin, C, stretch, t);
    if (blade) { // a long bone blade grown out of the claw (fatality only)
      const dx = p.fh[0] - p.fe[0], dy = p.fh[1] - p.fe[1], L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L; const nx = -uy, ny = ux;
      const b0 = p.fh, tip = [p.fh[0] + ux * blade, p.fh[1] + uy * blade];
      poly(ctx, [[b0[0] + nx * 7, b0[1] + ny * 7], [tip[0] + nx * 2, tip[1] + ny * 2], tip, [b0[0] - nx * 5, b0[1] - ny * 5]], C.line);
      poly(ctx, [[b0[0] + nx * 5, b0[1] + ny * 5], [tip[0] + nx * 1, tip[1] + ny * 1], tip, [b0[0] - nx * 3, b0[1] - ny * 3]], '#f4efe4');
      poly(ctx, [[b0[0] + nx * 5, b0[1] + ny * 5], [tip[0] + nx * 1, tip[1] + ny * 1], tip, b0], '#d8d2c4');
    }
    if (heavy) { ctx.strokeStyle = 'rgba(255,90,90,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.fh[0], p.fh[1], 17 + Math.sin(t / 40) * 3, 0, Math.PI * 2); ctx.stroke(); }
    if (thrust) { ctx.save(); ctx.strokeStyle = 'rgba(255,208,222,.8)'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(p.hip[0] - 40 - i * 8, p.hip[1] - 14 + i * 14); ctx.lineTo(p.hip[0] - 74 - i * 10, p.hip[1] - 14 + i * 14); ctx.stroke(); } ctx.restore(); }
    if (ring) { ctx.strokeStyle = 'rgba(242,198,90,.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 120, 74 + (t % 300) / 6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function star(c, x, y, r, col) { const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } poly(c, pts, col); }

  const blood = makeBlood(ctx, poly, { reduced, low, lens });
  let goreOn = gore; let sound = () => {};
  const HITP = poses.hit;
  let gagSound = () => {};
  const gagR = makeGag({ ctx, poly, joint, star, beast, gFace, sound: (n) => gagSound(n), blood });
  const fin = makeFatal({ ctx, poly, seg, joint, shade, star, beast, pHead, BASE, HIT: HITP, look: P_LOOK, sound: (n) => sound(n) }, blood);
  let lastT = null;

  return {
    /** The KO ending (see fatal.js). */
    finisher: {
      start: (st, now) => fin.start({ pX: st.p.x, gX: st.g.x, now, gore: goreOn }),
      act: (kind, now) => fin.act(kind, now),
      stop: () => fin.stop(),
      get active() { return fin.active; },
    },
    /** v29: the player's finisher gag (gag.js) after a verified win. */
    gag: {
      start: (kind, st, now) => { fin.stop(); if (reduced) { fx.length = 0; shake = 0; } gagR.start({ kind, pX: st.p.x, gX: st.g.x, now, gore: goreOn, reduced, low }); },
      stop: () => gagR.stop(),
      setSound: (fn) => { gagSound = fn || (() => {}); },
      get active() { return gagR.active; },
    },
    setGore(v) { goreOn = !!v; if (!goreOn) blood.clear(); },
    /** Reduced motion + gore: one still frame of the aftermath at FATALITY (no moving particles). */
    goreStill(st) {
      if (!goreOn) return; const x = st.p.x, f = Math.sign(st.g.x - st.p.x) || 1;
      blood.pool(x, 90); blood.pool(x - f * 110, 60); blood.splatter(x, 16);
      blood.sheet(x, 150, -f * 400, 160, { len: 0.8, wid: 1.2, hold: true }); blood.sheet(x, 120, -f * 300, -60, { len: 0.6, hold: true });
      const [fx, fy] = blood.toScreen(x, 150); blood.splash(4, fx, fy - 0.1, { hold: true });
    },
    setSound(fn) { sound = fn || (() => {}); },
    /** Feed one simulated frame's events (for sparks/shake). */
    events(st, evs, now) {
      for (const e of evs) {
        const at = e.who === 'p' ? st.p : st.g;
        if (e.k === 'hit' && goreOn) { // cartoon blood: a spray off the victim, splats on the felt
          const big = e.counter || e.mv === 'sp' || e.mv === 'hay' || e.mv === 'thrust'; const dir = e.who === 'p' ? -Math.sign(st.g.x - st.p.x) || -1 : Math.sign(st.g.x - st.p.x) || 1;
          const y = at.crouch ? 90 : 150;
          blood.emit(at.x, y, dir * 380, 300, big ? 28 : 11, 0.7, 1, big);
          blood.splatter(at.x + dir * 60, big ? 4 : 1, dir);
          if (big) { blood.pool(at.x + dir * 30, 18 + Math.random() * 12); if (Math.random() < 0.45) blood.splash(1, ...blood.toScreen(at.x, y)); }
          if (big && e.mv === 'sp' && Math.random() < 0.5) blood.sheet(at.x, y, dir * 400, 120, { len: 0.5, wid: 0.7 });
        }
        if (e.k === 'hit') { fx.push({ x: at.x, y: (at.crouch ? 90 : 140), t0: now, kind: 'spark', col: e.who === 'g' ? '#ffe27a' : '#ff6b8a', big: e.counter || e.mv === 'sp' || e.mv === 'hay' }); shake = Math.max(shake, e.who === 'p' ? 9 : e.n >= 5 ? 6 : 2); if (e.counter) fx.push({ x: at.x, y: 260, t0: now, kind: 'num', text: 'COUNTER!', col: '#2ee6d6' }); }
        if (e.k === 'block') fx.push({ x: at.x, y: 150, t0: now, kind: 'block' });
        if (e.k === 'breaker') { fx.push({ x: st.g.x, y: 260, t0: now, kind: 'num', text: 'COMBO BREAKER', col: '#f2c65a' }); shake = 10; }
        if (e.k === 'finished' || e.k === 'ko') { shake = 16; flash = now; if (goreOn) { const v = e.k === 'finished' || e.who === 'g' ? st.g : st.p; blood.emit(v.x, 150, 0, 520, 30, 1.1, 1, true); blood.splash(2, ...blood.toScreen(v.x, 150)); } }
        if (e.k === 'rip') { // the pit boss clothes fly off in pieces
          shake = 12; flash = now; const f = st.g.face;
          const bits = [['vestL', '#5f1026', -1.1, 1.5], ['vestR', '#7a1530', 1.2, 1.7], ['shirt', '#cfd0d6', -0.4, 2.2], ['sleeve', '#cfd0d6', -1.6, 1.1], ['sleeve', '#bfc0c7', 1.7, 1.2], ['tie', '#ff3d8b', 0.3, 2.6], ['trim', '#f2c65a', -0.8, 2.4]];
          for (const [shape, col, vx, vy] of bits) fx.push({ kind: 'cloth', shape, col, x: st.g.x, y: 150, vx: vx * 260 * f + (Math.random() - 0.5) * 60, vy: vy * 260, spin: (Math.random() - 0.5) * 14, t0: now });
          fx.push({ x: st.g.x, y: 300, t0: now, kind: 'num', text: 'RIIIP!', col: '#ff3d8b' });
        }
        if (e.k === 'thrust') { shake = 12; fx.push({ kind: 'wave', x: st.g.x + st.g.face * 50, y: 100, t0: now }); }
      }
    },
    draw(st, now) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      // a follow camera, like the arcade games: zoom in on narrow screens, but always keep both fighters in view
      const tall = w < h;
      const kh = ((tall ? 0.36 : 0.5) * h) / 180;
      const gx = gagR.active ? gagR.gx : fin.active ? fin.gx : st.g.x, px = gagR.active ? gagR.px : fin.active ? fin.px : st.p.x;
      const viewW = Math.min(1000, Math.max(tall ? 500 : h > 560 ? 780 : 620, w / kh, Math.abs(gx - px) + 320));
      const k = w / viewW;
      const mid = Math.max(viewW / 2, Math.min(1000 - viewW / 2, (px + gx) / 2));
      camX = camX == null || gagR.active ? mid : camX + (mid - camX) * 0.12; // (the finisher gag is a hard cut)
      camX = Math.max(viewW / 2, Math.min(1000 - viewW / 2, camX));
      const gy = h * (tall ? 0.76 : 0.9);
      const X = (x) => (x - (camX - viewW / 2)) * k;
      blood.setView(X, gy, k, w, h);
      shake = Math.max(shake, fin.active ? fin.shake : 0, gagR.active ? gagR.shake : 0); if (gagR.active && gagR.flash > flash) flash = gagR.flash;
      const dts = lastT == null ? 0 : Math.min(0.05, (now - lastT) / 1000); lastT = now;
      shake *= 0.86; if (reduced && gagR.active) shake = 0; // the reduced-motion still must not jitter
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      ctx.save(); ctx.translate(sx, sy);
      // whoever is attacking draws on top
      if (gagR.active) gagR.draw(now, X, gy, k, w, h, (sx) => fighter({ ...st.p, st: 'idle', y: 0, crouch: false, face: Math.sign(gagR.gx - gagR.px) || 1 }, 'p', sx, gy, k, gagR.frozenAt ?? now, st));
      else if (fin.active) fin.draw(now, X, gy, k);
      else {
        if (goreOn) { blood.step(dts); blood.drawFloor(X, gy, k); }
        const order = st.g.st === 'atk' ? ['p', 'g'] : ['g', 'p'];
        for (const who of order) fighter(who === 'g' ? st.g : st.p, who, X(who === 'g' ? st.g.x : st.p.x), gy, k, now, st);
        if (goreOn) { blood.drawDrops(X, gy, k); blood.drawSheets(now); }
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const e = fx[i]; const a = (now - e.t0) / (e.kind === 'num' ? 900 : e.kind === 'cloth' ? 1500 : e.kind === 'wave' ? 600 : 260);
        if (a >= 1) { fx.splice(i, 1); continue; }
        const x = X(e.x), y = gy - e.y * k;
        if (e.kind === 'cloth') { const s = (now - e.t0) / 1000; const cx = X(e.x + e.vx * s), cy = gy - (e.y + e.vy * s - 520 * s * s) * k; ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.spin * s); ctx.globalAlpha = Math.min(1, (1 - a) * 3); ctx.scale(k * 1.16, k * 1.16); cloth(ctx, e.shape, e.col); ctx.restore(); continue; }
        if (e.kind === 'wave') { ctx.save(); ctx.globalAlpha = 1 - a; for (let r = 0; r < 3; r++) { const rr = (30 + a * 220 - r * 26) * k; if (rr <= 0) continue; ctx.strokeStyle = r % 2 ? '#f2c65a' : '#ff8fb8'; ctx.lineWidth = 5 - r; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); continue; }
        if (e.kind === 'spark') { ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2); ctx.globalAlpha = 1 - a; star(ctx, 0, 0, (e.big ? 38 : 22) * (0.6 + a), e.col); star(ctx, 0, 0, (e.big ? 18 : 10) * (0.6 + a), '#fff'); ctx.restore(); }
        else if (e.kind === 'block') { ctx.save(); ctx.globalAlpha = 1 - a; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 18 + a * 26, -1.2, 1.2); ctx.stroke(); ctx.restore(); }
        else { ctx.save(); ctx.globalAlpha = 1 - a * a; ctx.font = `900 ${Math.round(Math.max(14, 22 * k * 1.6))}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a0710'; ctx.strokeText(e.text, x, y - a * 40); ctx.fillStyle = e.col; ctx.fillText(e.text, x, y - a * 40); ctx.restore(); }
      }
      ctx.restore();
      blood.drawLens(now);
      if (flash && now - flash < 220) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - (now - flash) / 220)})`; ctx.fillRect(0, 0, w, h); }
    },
  };
}

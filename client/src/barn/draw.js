// The Barn (v30): procedural low-poly creatures. Flat facets, lopsided eyes, warts, drool: hideous on purpose,
// cartoon only (no blood, no gore). One function per body plan returns anchor points; accessories hang off those.
const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join(''); // hex, so a shade can be shaded again
}

export function drawCreature(ctx, c, { w, h, t = 0, still = false, poke = 0 }) {
  const L = c.look; const R = rng(hash(c.id));
  const u = Math.min(w, h) / 220;
  const T = still ? 0 : t / 1000;
  const breathe = 1 + Math.sin(T * 2.1) * 0.025;
  const sway = Math.sin(T * 0.9) * 3 * u;
  const blink = !still && (T % 4.3) < 0.13;
  const jolt = poke ? Math.sin(poke * 30) * poke * 6 * u : 0;
  const cx = w / 2 + sway + jolt, base = h * 0.9;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(w / 2, base + 2 * u, 70 * u, 10 * u, 0, 0, TAU); ctx.fill();

  const poly = (pts, fill, line = true) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2 * u; ctx.stroke(); } };
  // A faceted blob: a jittered ring fanned into triangles, lit from the top left.
  const blob = (x, y, rx, ry, col, n = 9, jit = 0.12, rot = 0) => {
    const pts = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; const j = 1 + (R() - 0.5) * jit * 2; pts.push([x + Math.cos(a) * rx * j, y + Math.sin(a) * ry * j]); }
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const mx = (p[0] + q[0]) / 2 - x, my = (p[1] + q[1]) / 2 - y; const lit = (-mx / rx - my / ry) * 0.18; poly([[x, y], p, q], shade(col, lit + (R() - 0.5) * 0.06), false); }
    poly(pts, 'rgba(0,0,0,0)'); return pts;
  };
  const limb = (x1, y1, x2, y2, wd, col) => { const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2; const dx = Math.cos(a) * wd / 2, dy = Math.sin(a) * wd / 2; poly([[x1 + dx, y1 + dy], [x2 + dx * 0.7, y2 + dy * 0.7], [x2 - dx * 0.7, y2 - dy * 0.7], [x1 - dx, y1 - dy]], shade(col, -0.08)); };
  const wart = (x, y, r) => { ctx.fillStyle = shade(L.skin, 0.25); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = shade(L.skin, -0.3); ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r * 0.35, 0, TAU); ctx.fill(); };
  const eye = (x, y, r, look = 0) => {
    ctx.fillStyle = '#f4ecc6'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,40,40,0.55)'; ctx.lineWidth = 0.7 * u; // bloodshot veins (cartoon)
    for (let i = 0; i < 3; i++) { const a = R() * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); ctx.stroke(); }
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(x + look * r * 0.3, y, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + look * r * 0.35, y, r * 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + look * r * 0.3 - r * 0.2, y - r * 0.25, r * 0.14, 0, TAU); ctx.fill();
    if (blink) { ctx.fillStyle = shade(L.skin, -0.15); ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, TAU); ctx.fill(); ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  };
  const mouth = (x, y, mw, open = 0.3) => {
    poly([[x - mw, y], [x - mw * 0.4, y + mw * open], [x + mw * 0.5, y + mw * open * 0.8], [x + mw, y - mw * 0.05]], '#2a0d10');
    ctx.fillStyle = '#efe6b8'; // snaggle teeth
    for (const [dx, up] of [[-0.6, 1], [-0.1, 0], [0.55, 1]]) { ctx.beginPath(); const tx = x + dx * mw; if (up) { ctx.moveTo(tx - 2 * u, y); ctx.lineTo(tx + 2 * u, y); ctx.lineTo(tx, y + 6 * u); } else { ctx.moveTo(tx - 2 * u, y + mw * open * 0.9); ctx.lineTo(tx + 2 * u, y + mw * open * 0.9); ctx.lineTo(tx, y + mw * open * 0.9 - 5 * u); } ctx.fill(); }
    // a drool string that stretches and snaps back
    const d = still ? 6 : 4 + ((T * 0.7) % 1) * 12; ctx.strokeStyle = 'rgba(200,240,210,0.75)'; ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.moveTo(x + mw * 0.35, y + mw * open * 0.6); ctx.lineTo(x + mw * 0.38, y + mw * open * 0.6 + d * u); ctx.stroke();
    ctx.fillStyle = 'rgba(200,240,210,0.85)'; ctx.beginPath(); ctx.arc(x + mw * 0.38, y + mw * open * 0.6 + d * u, 1.8 * u, 0, TAU); ctx.fill();
  };
  const face = (hx, hy, hr, o = {}) => {
    const big = hr * (o.eyeBig || 0.32), small = big * 0.68, look = still ? 0 : Math.sin(T * 0.6) * 0.8;
    if (!o.noEyes) { eye(hx - hr * 0.38, hy - hr * 0.12, o.cyclops ? big * 1.5 : big, look); if (!o.cyclops) eye(hx + hr * 0.36, hy - hr * 0.05, small, look); }
    if (!o.noMouth) mouth(hx + (o.mx || 0) * hr, hy + hr * (o.my || 0.42), hr * (o.mw || 0.42), o.open || 0.35);
    wart(hx + hr * 0.62, hy + hr * 0.25, hr * 0.09); wart(hx - hr * 0.7, hy + hr * 0.3, hr * 0.06);
  };
  const a = {}; // anchors: head {x,y,r}, top, chin, tail, feet
  const S = L.skin, F = L.fur;
  const bt = breathe;
  switch (L.body) {
    case 'ape': case 'sloth': {
      const sl = L.body === 'sloth';
      limb(cx - 30 * u, base - 50 * u, cx - 34 * u, base, 16 * u, F); limb(cx + 30 * u, base - 50 * u, cx + 36 * u, base, 16 * u, F);
      const feet = L.acc.includes('bigfeet') ? 2 : 1;
      blob(cx - 38 * u, base - 3 * u, 18 * u * feet, 7 * u, shade(S, -0.1), 7); blob(cx + 40 * u, base - 3 * u, 18 * u * feet, 7 * u, shade(S, -0.1), 7);
      blob(cx, base - 90 * u * bt, 56 * u, 58 * u * bt, F, 11, 0.16);
      const armSw = still ? 0 : Math.sin(T * 1.3) * 6 * u;
      limb(cx - 50 * u, base - 120 * u, cx - 66 * u + armSw, base - 30 * u, 17 * u, F); limb(cx + 50 * u, base - 120 * u, cx + 64 * u - armSw, base - 26 * u, 17 * u, F);
      for (const s of [-1, 1]) { const hx = cx + s * 65 * u, hy = base - 26 * u; for (let k = 0; k < 3; k++) limb(hx, hy, hx + s * (k - 1) * 6 * u, hy + (sl ? 24 : 12) * u, 3.5 * u, sl ? '#e8e0c8' : shade(S, -0.2)); }
      blob(cx, base - 92 * u * bt, 32 * u, 34 * u, S, 8, 0.2); // bare belly
      if (L.acc.includes('bellymouth')) mouth(cx, base - 90 * u, 22 * u, 0.6);
      a.head = { x: cx + 3 * u, y: base - 160 * u * bt, r: 32 * u };
      blob(a.head.x, a.head.y, 34 * u, 31 * u, F, 9); blob(a.head.x + 2 * u, a.head.y + 6 * u, 25 * u, 21 * u, S, 8);
      face(a.head.x + 2 * u, a.head.y + 2 * u, 25 * u, { cyclops: L.acc.includes('cyclops') });
      break; }
    case 'quad': {
      for (const [lx, ph] of [[-40, 0], [-22, 1], [26, 2], [44, 3]]) { const k = still ? 0 : Math.sin(T * 1.5 + ph) * 3 * u; limb(cx + lx * u, base - 55 * u, cx + lx * u + k, base, 11 * u, shade(F, ph % 2 ? -0.15 : 0)); blob(cx + lx * u + k, base - 2 * u, 8 * u, 4 * u, '#2a2420', 5); }
      blob(cx, base - 70 * u * bt, 62 * u, 34 * u * bt, F, 11, 0.15);
      blob(cx, base - 60 * u, 40 * u, 18 * u, S, 8);
      limb(cx - 58 * u, base - 72 * u, cx - 92 * u, base - 92 * u + (still ? 0 : Math.sin(T * 3) * 8 * u), 7 * u, F); // tail
      a.tail = { x: cx - 92 * u, y: base - 92 * u };
      a.head = { x: cx + 66 * u, y: base - 108 * u * bt, r: 30 * u };
      blob(a.head.x, a.head.y, 30 * u, 26 * u, S, 8); blob(a.head.x + 22 * u, a.head.y + 10 * u, 16 * u, 11 * u, shade(S, -0.1), 6);
      face(a.head.x - 2 * u, a.head.y - 2 * u, 26 * u, { mx: 0.6, my: 0.5 });
      break; }
    case 'serpent': {
      for (const [hx, hr] of [[-58, 22], [-14, 28], [32, 22]]) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, base); ctx.clip(); blob(cx + hx * u, base, hr * u * 1.3, hr * u * 1.5 * bt, F, 9); ctx.restore(); }
      ctx.fillStyle = 'rgba(80,140,200,0.35)'; ctx.fillRect(cx - 100 * u, base - 4 * u, 200 * u, 6 * u); // the water line
      const nb = still ? 0 : Math.sin(T * 1.1) * 6 * u;
      const neck = [[cx + 50 * u, base], [cx + 66 * u + nb * 0.3, base - 50 * u], [cx + 62 * u + nb, base - 100 * u], [cx + 50 * u + nb, base - 140 * u]];
      for (let i = 0; i < neck.length - 1; i++) limb(neck[i][0], neck[i][1], neck[i + 1][0], neck[i + 1][1], (26 - i * 4) * u, i % 2 ? F : shade(F, 0.08));
      a.head = { x: cx + 58 * u + nb, y: base - 158 * u, r: 26 * u };
      blob(a.head.x, a.head.y, 30 * u, 22 * u, S, 8); blob(a.head.x + 26 * u, a.head.y + 8 * u, 15 * u, 10 * u, shade(S, -0.1), 6);
      face(a.head.x, a.head.y, 22 * u, { mx: 0.8, my: 0.45, eyeBig: 0.38 });
      a.tail = { x: cx - 80 * u, y: base - 10 * u };
      break; }
    case 'bird': case 'owl': case 'ptero': {
      const flap = still ? 0 : Math.sin(T * (L.body === 'ptero' ? 2.4 : 1.6)) * 0.25;
      for (const s of [-1, 1]) {
        const wx = cx + s * 40 * u, wy = base - 120 * u;
        const tip = [wx + s * 80 * u, wy - 50 * u + flap * 60 * u * s * s];
        poly([[wx, wy - 18 * u], tip, [wx + s * 66 * u, wy + 22 * u], [wx + s * 30 * u, wy + 40 * u], [wx, wy + 26 * u]], L.body === 'ptero' ? shade(S, -0.05) : shade(F, -0.05));
        if (L.body === 'ptero') { ctx.strokeStyle = shade(S, -0.4); ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(wx, wy - 12 * u); ctx.lineTo(...tip); ctx.moveTo(wx, wy); ctx.lineTo(wx + s * 66 * u, wy + 22 * u); ctx.stroke(); }
      }
      for (const s of [-1, 1]) { limb(cx + s * 16 * u, base - 40 * u, cx + s * 20 * u, base, 6 * u, '#c7a24a'); for (let k = -1; k <= 1; k++) limb(cx + s * 20 * u, base, cx + s * 20 * u + k * 8 * u, base + 2 * u, 3 * u, '#c7a24a'); }
      blob(cx, base - 95 * u * bt, 44 * u, 58 * u * bt, F, 10);
      blob(cx, base - 85 * u, 28 * u, 38 * u, shade(F, 0.25), 8);
      a.head = { x: cx, y: base - 165 * u * bt, r: 32 * u };
      blob(a.head.x, a.head.y, 34 * u, 30 * u, L.body === 'owl' ? F : S, 9);
      if (L.body === 'owl') { face(a.head.x, a.head.y, 30 * u, { eyeBig: 0.42, noMouth: true }); poly([[a.head.x - 5 * u, a.head.y + 8 * u], [a.head.x + 5 * u, a.head.y + 8 * u], [a.head.x, a.head.y + 22 * u]], '#d8a03a'); }
      else { face(a.head.x - 6 * u, a.head.y, 26 * u, { noMouth: true }); poly([[a.head.x + 18 * u, a.head.y - 4 * u], [a.head.x + (L.body === 'ptero' ? 74 : 48) * u, a.head.y + 8 * u], [a.head.x + 16 * u, a.head.y + 16 * u]], '#d8b04a'); mouth(a.head.x + 22 * u, a.head.y + 10 * u, 10 * u, 0.4); }
      if (L.body === 'ptero') poly([[a.head.x - 20 * u, a.head.y - 18 * u], [a.head.x - 62 * u, a.head.y - 40 * u], [a.head.x - 8 * u, a.head.y - 30 * u]], shade(S, 0.1));
      a.tail = { x: cx, y: base - 40 * u };
      break; }
    case 'moth': {
      const flap = still ? 0 : Math.sin(T * 3) * 0.15;
      for (const s of [-1, 1]) {
        poly([[cx, base - 120 * u], [cx + s * 100 * u, base - (190 - flap * 80) * u], [cx + s * 92 * u, base - 90 * u], [cx + s * 20 * u, base - 80 * u]], shade(F, -0.05));
        poly([[cx, base - 90 * u], [cx + s * 72 * u, base - 60 * u], [cx + s * 50 * u, base - 20 * u], [cx + s * 10 * u, base - 50 * u]], shade(F, -0.18));
        ctx.fillStyle = '#ff3a2a'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx + s * 62 * u, base - 140 * u, 9 * u, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        a.wing = { x: cx + 60 * u, y: base - 140 * u };
      }
      for (const s of [-1, 1]) limb(cx + s * 10 * u, base - 50 * u, cx + s * 18 * u, base, 4 * u, '#2a2420');
      blob(cx, base - 85 * u * bt, 24 * u, 60 * u * bt, S, 9);
      a.head = { x: cx, y: base - 160 * u, r: 26 * u }; blob(a.head.x, a.head.y, 26 * u, 24 * u, S, 8);
      for (const s of [-1, 1]) { ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(a.head.x + s * 8 * u, a.head.y - 20 * u); ctx.quadraticCurveTo(a.head.x + s * 30 * u, a.head.y - 60 * u, a.head.x + s * 40 * u, a.head.y - 54 * u); ctx.stroke(); }
      face(a.head.x, a.head.y, 22 * u, { eyeBig: 0.4 });
      break; }
    case 'saurop': {
      for (const lx of [-40, -18, 22, 42]) limb(cx + lx * u, base - 50 * u, cx + lx * u, base, 16 * u, shade(S, -0.1));
      limb(cx - 50 * u, base - 60 * u, cx - 100 * u, base - 20 * u, 14 * u, S);
      blob(cx, base - 70 * u * bt, 64 * u, 38 * u * bt, S, 11);
      const nb = still ? 0 : Math.sin(T * 0.8) * 5 * u;
      limb(cx + 48 * u, base - 90 * u, cx + 70 * u + nb, base - 160 * u, 20 * u, S);
      a.head = { x: cx + 76 * u + nb, y: base - 172 * u, r: 20 * u }; blob(a.head.x, a.head.y, 24 * u, 17 * u, S, 8);
      face(a.head.x + 4 * u, a.head.y, 18 * u, { mx: 0.5, eyeBig: 0.4 });
      a.tail = { x: cx - 100 * u, y: base - 20 * u }; a.neck = { x: cx + 62 * u, y: base - 130 * u };
      break; }
    case 'squid': {
      for (let i = 0; i < 6; i++) { const x0 = cx + (i - 2.5) * 16 * u; const wv = still ? 0 : Math.sin(T * 2 + i) * 10 * u; ctx.strokeStyle = shade(S, -0.1 - (i % 2) * 0.1); ctx.lineWidth = 11 * u; ctx.beginPath(); ctx.moveTo(x0, base - 60 * u); ctx.quadraticCurveTo(x0 + wv, base - 30 * u, x0 + (i - 2.5) * 10 * u - wv, base); ctx.stroke(); for (let k = 0; k < 3; k++) { ctx.fillStyle = '#f2d0d8'; ctx.beginPath(); ctx.arc(x0 + (i - 2.5) * 3 * u * k, base - 50 * u + k * 16 * u, 2.2 * u, 0, TAU); ctx.fill(); } }
      blob(cx, base - 120 * u * bt, 50 * u, 70 * u * bt, S, 11, 0.1);
      a.head = { x: cx, y: base - 92 * u, r: 40 * u };
      face(cx, base - 104 * u, 36 * u, { my: 0.6 });
      a.top = { x: cx, y: base - 190 * u };
      break; }
    case 'hopper': {
      const hop = still ? 0 : Math.max(0, Math.sin(T * 2.2)) * 6 * u;
      blob(cx - 28 * u, base - 8 * u, 26 * u, 10 * u, F, 7); blob(cx + 28 * u, base - 8 * u, 26 * u, 10 * u, F, 7);
      blob(cx, base - 62 * u * bt - hop, 50 * u, 52 * u * bt, F, 11);
      blob(cx, base - 56 * u - hop, 30 * u, 32 * u, shade(F, 0.25), 8);
      a.head = { x: cx, y: base - 132 * u - hop, r: 32 * u };
      for (const s of [-1, 1]) { const len = s > 0 && L.acc.includes('shortear') ? 34 : 64; const tw = still ? 0 : Math.sin(T * 1.7 + s) * 0.12; ctx.save(); ctx.translate(a.head.x + s * 14 * u, a.head.y - 22 * u); ctx.rotate(s * 0.25 + tw); poly([[-8 * u, 0], [-6 * u, -len * u], [6 * u, -len * u], [8 * u, 0]], F); poly([[-4 * u, -4 * u], [-3 * u, -(len - 6) * u], [3 * u, -(len - 6) * u], [4 * u, -4 * u]], '#e8a0a8', false); ctx.restore(); }
      blob(a.head.x, a.head.y, 34 * u, 30 * u, F, 9);
      face(a.head.x, a.head.y + 2 * u, 28 * u, { my: 0.5 });
      // duck wings for the wolpertinger-style ones
      if (L.acc.includes('antlers')) for (const s of [-1, 1]) poly([[cx + s * 40 * u, base - 80 * u - hop], [cx + s * 74 * u, base - 96 * u - hop], [cx + s * 66 * u, base - 64 * u - hop]], shade(F, -0.25));
      break; }
    case 'blob': {
      blob(cx, base - 48 * u * bt, 78 * u, 50 * u * bt, S, 12, 0.18);
      for (const s of [-1, 1]) poly([[cx + s * 50 * u, base - 30 * u], [cx + s * 88 * u, base - 4 * u], [cx + s * 54 * u, base - 4 * u]], shade(S, -0.15));
      a.head = { x: cx + 10 * u, y: base - 104 * u * bt, r: 34 * u };
      blob(a.head.x, a.head.y, 36 * u, 30 * u, S, 9);
      face(a.head.x, a.head.y - 6 * u, 28 * u, { my: 0.3 });
      break; }
    case 'spade': {
      poly([[cx - 40 * u, base], [cx - 26 * u, base - 100 * u], [cx + 26 * u, base - 100 * u], [cx + 40 * u, base]], F);
      for (const s of [-1, 1]) limb(cx + s * 26 * u, base - 90 * u, cx + s * 44 * u, base - 40 * u, 6 * u, S);
      a.head = { x: cx, y: base - 128 * u, r: 24 * u };
      const glow = still ? 0.5 : 0.4 + Math.sin(T * 2.5) * 0.2;
      ctx.fillStyle = `rgba(120,255,140,${glow * 0.25})`; ctx.beginPath(); ctx.arc(a.head.x, a.head.y, 70 * u, 0, TAU); ctx.fill();
      poly([[cx, base - 210 * u], [cx + 56 * u, base - 140 * u], [cx + 34 * u, base - 96 * u], [cx - 34 * u, base - 96 * u], [cx - 56 * u, base - 140 * u]], shade(F, -0.1));
      blob(a.head.x, a.head.y, 24 * u, 26 * u, S, 8);
      face(a.head.x, a.head.y, 22 * u, { eyeBig: 0.4 });
      break; }
    case 'worm': {
      const segs = 6; let px = cx - 70 * u, py = base - 12 * u;
      for (let i = 0; i < segs; i++) { const wv = still ? 0 : Math.sin(T * 2 - i * 0.8) * 5 * u; const x = cx - 70 * u + i * 24 * u, y = base - 14 * u - i * i * 3.4 * u + wv; blob(x, y, (18 + i * 2) * u, (16 + i * 2) * u, i % 2 ? S : shade(S, 0.1), 8); px = x; py = y; }
      for (const s of [-1, 1]) { limb(px - 12 * u + s * 14 * u, py + 10 * u, px - 10 * u + s * 20 * u, base, 7 * u, shade(S, -0.15)); }
      a.head = { x: px + 10 * u, y: py - 30 * u, r: 30 * u };
      blob(a.head.x, a.head.y, 32 * u, 28 * u, S, 9);
      face(a.head.x + 4 * u, a.head.y, 26 * u, { my: 0.45 });
      a.tail = { x: cx - 80 * u, y: base - 12 * u };
      break; }
    case 'kappa': {
      for (const s of [-1, 1]) { limb(cx + s * 18 * u, base - 50 * u, cx + s * 24 * u, base, 11 * u, S); blob(cx + s * 26 * u, base - 2 * u, 14 * u, 5 * u, shade(S, -0.15), 6); }
      blob(cx - 6 * u, base - 82 * u * bt, 50 * u, 46 * u * bt, F, 10); // shell behind
      blob(cx + 6 * u, base - 80 * u * bt, 34 * u, 40 * u, shade(S, 0.15), 9);
      for (const s of [-1, 1]) limb(cx + s * 32 * u, base - 104 * u, cx + s * 52 * u, base - 60 * u, 9 * u, S);
      a.head = { x: cx + 4 * u, y: base - 146 * u * bt, r: 30 * u };
      blob(a.head.x, a.head.y, 30 * u, 28 * u, S, 9);
      poly([[a.head.x + 4 * u, a.head.y + 6 * u], [a.head.x + 30 * u, a.head.y + 12 * u], [a.head.x + 4 * u, a.head.y + 22 * u]], '#c8a83a');
      face(a.head.x - 6 * u, a.head.y - 4 * u, 24 * u, { noMouth: true });
      a.shell = { x: cx - 6 * u, y: base - 82 * u };
      break; }
    case 'spindly': default: {
      for (const s of [-1, 1]) { limb(cx + s * 8 * u, base - 60 * u, cx + s * 16 * u, base, 4 * u, S); limb(cx + s * 8 * u, base - 92 * u, cx + s * 40 * u, base - 40 * u + (still ? 0 : Math.sin(T * 1.4 + s) * 6 * u), 4 * u, S); }
      blob(cx, base - 76 * u * bt, 16 * u, 30 * u * bt, S, 8);
      a.head = { x: cx, y: base - 150 * u * bt, r: 46 * u };
      blob(a.head.x, a.head.y, 50 * u, 46 * u, S, 11, 0.08);
      face(a.head.x, a.head.y + 8 * u, 34 * u, { eyeBig: 0.4, my: 0.55, mw: 0.3 });
      break; }
  }
  accessories(ctx, L, a, { u, T, still, R, poly, limb, blob, shade, cx, base });
  ctx.restore();
  return a;
}

function accessories(ctx, L, a, k) {
  const { u, T, still, poly, limb, blob, cx, base } = k; const H = a.head; if (!H) return;
  const has = (n) => L.acc.includes(n);
  const top = H.y - H.r;
  ctx.save();
  if (has('unibrow')) { ctx.fillStyle = '#1a0f0a'; ctx.beginPath(); ctx.moveTo(H.x - H.r * 1.0, H.y - H.r * 0.4); ctx.quadraticCurveTo(H.x, H.y - H.r * 0.62, H.x + H.r * 0.8, H.y - H.r * 0.42); ctx.lineTo(H.x + H.r * 0.8, H.y - H.r * 0.32); ctx.quadraticCurveTo(H.x, H.y - H.r * 0.48, H.x - H.r, H.y - H.r * 0.3); ctx.fill(); }
  if (has('flowercrown')) for (let i = 0; i < 5; i++) { const x = H.x + (i - 2) * H.r * 0.42, y = top + 4 * u + Math.abs(i - 2) * 3 * u; for (let p = 0; p < 5; p++) { ctx.fillStyle = ['#e8344a', '#f0a020', '#c03090', '#e8344a', '#f6d02a'][i]; ctx.beginPath(); ctx.arc(x + Math.cos(p * 1.26) * 4 * u, y + Math.sin(p * 1.26) * 4 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(x, y, 2.4 * u, 0, Math.PI * 2); ctx.fill(); }
  if (has('longbeard') || has('hugebeard') || has('pointybeard') || has('forkbeard')) {
    const len = has('hugebeard') ? 2.4 : has('longbeard') ? 1.9 : 1.1; const col = has('forkbeard') ? '#4a3a2a' : has('pointybeard') ? '#3a2a1a' : '#e6e2d6';
    const sw = still ? 0 : Math.sin(T * 1.2) * 3 * u;
    if (has('forkbeard')) { poly([[H.x - H.r * 0.5, H.y + H.r * 0.55], [H.x - H.r * 0.25 + sw, H.y + H.r * 1.6], [H.x, H.y + H.r * 0.75], [H.x + H.r * 0.25 + sw, H.y + H.r * 1.6], [H.x + H.r * 0.5, H.y + H.r * 0.55]], col); }
    else poly([[H.x - H.r * 0.7, H.y + H.r * 0.4], [H.x - H.r * 0.4, H.y + H.r * len], [H.x + sw, H.y + H.r * (len + 0.25)], [H.x + H.r * 0.4, H.y + H.r * len], [H.x + H.r * 0.7, H.y + H.r * 0.4]], col);
    if (has('finches')) for (let i = 0; i < 3; i++) { const fx = H.x + (i - 1) * H.r * 0.4, fy = H.y + H.r * (1.1 + (i % 2) * 0.4) + (still ? 0 : Math.sin(T * 5 + i) * 2 * u); k.blob(fx, fy, 5 * u, 4 * u, ['#c89a3a', '#8a6a3a', '#d8b04a'][i], 6); poly([[fx + 4 * u, fy], [fx + 8 * u, fy + 1 * u], [fx + 4 * u, fy + 2 * u]], '#333', false); }
  }
  if (has('sketchwings') && a.wing) { ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 1 * u; for (const s of [-1, 1]) { const x = cx + s * 58 * u, y = base - 150 * u; ctx.beginPath(); ctx.ellipse(x, y, 16 * u, 6 * u, s * 0.3, 0, Math.PI * 2); ctx.moveTo(x - 14 * u, y + 10 * u); ctx.lineTo(x + 14 * u, y + 10 * u); ctx.moveTo(x, y - 6 * u); ctx.lineTo(x, y - 20 * u); ctx.moveTo(x - 10 * u, y - 20 * u); ctx.lineTo(x + 10 * u, y - 20 * u); ctx.stroke(); } }
  if (has('curlywig') || has('powderwig')) { const col = has('powderwig') ? '#f4f2ee' : '#efeae0'; for (const s of [-1, 1]) for (let i = 0; i < 4; i++) blob(H.x + s * H.r * 0.95, H.y - H.r * 0.4 + i * H.r * 0.38, H.r * 0.28, H.r * 0.22, col, 7); blob(H.x, top + H.r * 0.1, H.r * 0.95, H.r * 0.42, col, 9); if (has('powderwig')) { limb(H.x - H.r * 0.1, H.y + H.r * 0.2, H.x - H.r * 1.3, H.y + H.r * 0.9, 5 * u, '#222'); } }
  if (has('spines')) for (let i = 0; i < 6; i++) { const x = cx - 50 * u + i * 18 * u, y = base - 100 * u - Math.sin(i / 5 * Math.PI) * 6 * u; poly([[x - 5 * u, y + 6 * u], [x, y - 18 * u], [x + 5 * u, y + 6 * u]], '#1e2a14'); }
  if (has('batwings')) for (const s of [-1, 1]) { const f = still ? 0 : Math.sin(T * 2) * 12 * u; poly([[cx + s * 10 * u, base - 96 * u], [cx + s * 70 * u, base - 150 * u - f], [cx + s * 90 * u, base - 110 * u], [cx + s * 60 * u, base - 100 * u], [cx + s * 40 * u, base - 84 * u]], '#2a2a28'); }
  if (has('glow')) { const g = still ? 0.5 : 0.4 + Math.sin(T * 3) * 0.2; const gr = ctx.createRadialGradient(cx, base - 80 * u, 10 * u, cx, base - 80 * u, 120 * u); gr.addColorStop(0, `rgba(160,255,100,${0.3 * g})`); gr.addColorStop(1, 'rgba(160,255,100,0)'); ctx.fillStyle = gr; ctx.fillRect(cx - 130 * u, base - 210 * u, 260 * u, 220 * u); }
  if (has('bun')) blob(H.x - H.r * 0.2, top - 2 * u, H.r * 0.4, H.r * 0.32, '#5a4a3a', 7);
  if (has('wildhair')) for (let i = 0; i < 11; i++) { const ang = -Math.PI + (i / 10) * Math.PI; const len = H.r * (0.7 + ((i * 37) % 10) / 20) + (still ? 0 : Math.sin(T * 4 + i) * 2 * u); poly([[H.x + Math.cos(ang) * H.r * 0.8 - 4 * u, H.y + Math.sin(ang) * H.r * 0.8], [H.x + Math.cos(ang) * (H.r + len), H.y + Math.sin(ang) * (H.r + len)], [H.x + Math.cos(ang) * H.r * 0.8 + 4 * u, H.y + Math.sin(ang) * H.r * 0.8]], '#c9c2b4', false); }
  if (has('scowl')) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(H.x - H.r * 0.7, H.y - H.r * 0.55); ctx.lineTo(H.x - H.r * 0.1, H.y - H.r * 0.3); ctx.moveTo(H.x + H.r * 0.7, H.y - H.r * 0.5); ctx.lineTo(H.x + H.r * 0.15, H.y - H.r * 0.3); ctx.stroke(); }
  if (has('eyeliner')) { ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2.6 * u; for (const [ex, er] of [[-0.38, 0.38], [0.36, 0.26]]) { ctx.beginPath(); ctx.moveTo(H.x + (ex - er) * H.r * 0.9, H.y - H.r * 0.1); ctx.lineTo(H.x + (ex + er * 1.9) * H.r * 0.9, H.y - H.r * 0.34); ctx.stroke(); } }
  if (has('crown') || has('tinycrown')) { const s = has('tinycrown') ? 0.5 : 0.9; const y = top + 2 * u; poly([[H.x - H.r * s, y], [H.x - H.r * s, y - 18 * u * s], [H.x - H.r * s * 0.5, y - 8 * u * s], [H.x, y - 24 * u * s], [H.x + H.r * s * 0.5, y - 8 * u * s], [H.x + H.r * s, y - 18 * u * s], [H.x + H.r * s, y]], '#f2c230'); ctx.fillStyle = '#c0203a'; ctx.beginPath(); ctx.arc(H.x, y - 6 * u * s, 3 * u * s + 1, 0, Math.PI * 2); ctx.fill(); }
  if (has('moustache') || has('droopstache') || has('bushystache') || has('frostache')) {
    const col = has('bushystache') ? '#f4f2ea' : has('frostache') ? '#dfeaf2' : '#1e1612'; const droop = has('droopstache') ? 1.4 : has('bushystache') ? 1.0 : 0.6;
    for (const s of [-1, 1]) poly([[H.x, H.y + H.r * 0.3], [H.x + s * H.r * 0.7, H.y + H.r * (0.3 + droop * 0.4)], [H.x + s * H.r * 0.55, H.y + H.r * (0.5 + droop * 0.3)], [H.x + s * H.r * 0.1, H.y + H.r * 0.45]], col);
    if (has('frostache')) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(H.x + (i - 1.5) * H.r * 0.3, H.y + H.r * 0.6); ctx.lineTo(H.x + (i - 1.5) * H.r * 0.3 + 2 * u, H.y + H.r * 0.6); ctx.lineTo(H.x + (i - 1.5) * H.r * 0.3 + 1 * u, H.y + H.r * 0.85); ctx.fill(); } }
  }
  if (has('coil')) { const x = a.tail?.x ?? cx, y = (a.tail?.y ?? base - 40 * u) + 10 * u; ctx.strokeStyle = '#c87a3a'; ctx.lineWidth = 3 * u; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x, y + i * 6 * u, 14 * u, 4 * u, 0, 0, Math.PI * 2); ctx.stroke(); } if (!still && (T % 1.7) < 0.25) { ctx.strokeStyle = '#a8f4ff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(x, y - 4 * u); ctx.lineTo(x + 10 * u, y - 18 * u); ctx.lineTo(x - 4 * u, y - 26 * u); ctx.lineTo(x + 12 * u, y - 44 * u); ctx.stroke(); } }
  if (has('lacecollar') || has('ruff')) { const y = H.y + H.r * (has('ruff') ? 0.95 : 0.9) + (a.neck ? 30 * u : 0); const x = a.neck ? a.neck.x : H.x; for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; ctx.fillStyle = i % 2 ? '#f6f2e6' : '#e2dccc'; ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * H.r * 0.8, y + Math.sin(ang) * H.r * 0.22, H.r * 0.3, H.r * 0.16, ang, 0, Math.PI * 2); ctx.fill(); } }
  if (has('cards')) for (let i = 0; i < 4; i++) { const x = cx - 40 * u + i * 22 * u, y = base - 80 * u - (i % 2) * 8 * u; ctx.fillStyle = '#efe6cc'; ctx.fillRect(x, y, 14 * u, 9 * u); ctx.fillStyle = '#333'; for (let j = 0; j < 3; j++) ctx.fillRect(x + 2 * u + j * 4 * u, y + 2 * u + ((i + j) % 2) * 3 * u, 2 * u, 2 * u); }
  if (has('earring')) { ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(H.x - H.r * 0.95, H.y + H.r * 0.3, 5 * u, 0, Math.PI * 2); ctx.stroke(); }
  if (has('baldtop')) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(H.x - H.r * 0.2, (a.top?.y ?? top) + 30 * u, 14 * u, 6 * u, -0.3, 0, Math.PI * 2); ctx.fill(); }
  if (has('antlers')) for (const s of [-1, 1]) { const x = H.x + s * H.r * 0.5, y = top + 6 * u; ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 3.5 * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 18 * u, y - 34 * u); ctx.moveTo(x + s * 8 * u, y - 14 * u); ctx.lineTo(x + s * 22 * u, y - 16 * u); ctx.moveTo(x + s * 14 * u, y - 26 * u); ctx.lineTo(x + s * 6 * u, y - 40 * u); ctx.stroke(); }
  if (has('strawhat')) { poly([[H.x - H.r * 1.5, top + 8 * u], [H.x + H.r * 1.5, top + 4 * u], [H.x + H.r * 0.7, top - 4 * u], [H.x - H.r * 0.7, top - 2 * u]], '#e6c86a'); poly([[H.x - H.r * 0.7, top - 2 * u], [H.x - H.r * 0.55, top - 22 * u], [H.x + H.r * 0.55, top - 24 * u], [H.x + H.r * 0.7, top - 4 * u]], '#d8b850'); }
  if (has('swirls')) { ctx.strokeStyle = 'rgba(250,220,60,0.8)'; ctx.lineWidth = 2.4 * u; for (let i = 0; i < 4; i++) { const x = cx - 30 * u + (i % 2) * 50 * u, y = base - 50 * u - Math.floor(i / 2) * 30 * u; const r0 = still ? 0 : T * 1.5 + i; ctx.beginPath(); for (let q = 0; q < 24; q++) { const ang = r0 + q * 0.5, rr = q * 0.5 * u; q ? ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : ctx.moveTo(x, y); } ctx.stroke(); } }
  if (has('veil')) { ctx.fillStyle = 'rgba(15,10,15,0.55)'; ctx.beginPath(); ctx.moveTo(H.x - H.r * 0.9, top + 6 * u); ctx.quadraticCurveTo(H.x, top - 6 * u, H.x + H.r * 0.9, top + 6 * u); ctx.lineTo(H.x + H.r * 1.3, H.y + H.r * 1.3); ctx.lineTo(H.x - H.r * 1.3, H.y + H.r * 1.3); ctx.fill(); }
  if (has('frown')) { ctx.strokeStyle = '#2a0d10'; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(H.x, H.y + H.r * 0.9, H.r * 0.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  if (has('goldcoat')) { poly([[cx - 20 * u, base - 50 * u], [cx + 40 * u, base - 70 * u], [cx + 50 * u, base - 30 * u], [cx - 10 * u, base - 14 * u]], 'rgba(230,180,50,0.85)'); ctx.fillStyle = '#fff3c0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + 10 * u + i * 12 * u, base - 50 * u + i * 2 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill(); } }
  if (has('raven')) { const rx = H.x + H.r * 0.2, ry = top - 4 * u + (still ? 0 : Math.abs(Math.sin(T * 1.3)) * -3 * u); blob(rx, ry - 10 * u, 16 * u, 10 * u, '#111', 7); blob(rx + 14 * u, ry - 20 * u, 8 * u, 7 * u, '#111', 6); poly([[rx + 20 * u, ry - 21 * u], [rx + 32 * u, ry - 18 * u], [rx + 20 * u, ry - 16 * u]], '#3a3a3a', false); ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(rx + 16 * u, ry - 22 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill(); }
  if (has('stink')) { ctx.strokeStyle = 'rgba(150,200,80,0.6)'; ctx.lineWidth = 2.2 * u; for (let i = 0; i < 3; i++) { const x = cx - 60 * u + i * 60 * u, y0 = base - 60 * u - (still ? 0 : ((T * 18 + i * 20) % 50) * u); ctx.beginPath(); ctx.moveTo(x, y0); ctx.bezierCurveTo(x + 8 * u, y0 - 8 * u, x - 8 * u, y0 - 16 * u, x, y0 - 24 * u); ctx.stroke(); } }
  if (has('spectacles') || has('roundglasses') || has('goggles')) { const g = has('goggles'); ctx.strokeStyle = g ? '#5a3a1a' : '#2a2a2a'; ctx.lineWidth = (g ? 4 : 2) * u; ctx.fillStyle = g ? 'rgba(160,220,255,0.35)' : 'rgba(255,255,255,0.12)'; for (const [ex, sz] of [[-0.38, 0.4], [0.36, 0.32]]) { ctx.beginPath(); if (has('spectacles')) ctx.rect(H.x + ex * H.r - sz * H.r * 0.8, H.y - H.r * 0.3, sz * H.r * 1.6, sz * H.r * 1.1); else ctx.arc(H.x + ex * H.r, H.y - H.r * 0.1, sz * H.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(H.x - H.r * 0.05, H.y - H.r * 0.15); ctx.lineTo(H.x + H.r * 0.08, H.y - H.r * 0.15); ctx.stroke(); }
  if (has('kite')) { const x = (a.tail?.x ?? cx - 80 * u) - 10 * u, y = base - 190 * u + (still ? 0 : Math.sin(T * 1.1) * 10 * u); ctx.strokeStyle = 'rgba(240,240,220,0.7)'; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(a.tail?.x ?? cx, a.tail?.y ?? base); ctx.lineTo(x, y + 16 * u); ctx.stroke(); poly([[x, y - 16 * u], [x + 12 * u, y], [x, y + 16 * u], [x - 12 * u, y]], '#e84a3a'); ctx.fillStyle = '#ffef8a'; ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, Math.PI * 2); ctx.fill(); }
  if (has('sidehair')) for (const s of [-1, 1]) blob(H.x + s * H.r * 0.95, H.y - H.r * 0.05, H.r * 0.28, H.r * 0.55, '#e8e2d0', 7);
  if (has('flycap')) { ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(H.x, H.y - H.r * 0.15, H.r * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); for (const s of [-1, 1]) poly([[H.x + s * H.r * 0.9, H.y - H.r * 0.2], [H.x + s * H.r * 1.05, H.y + H.r * 0.5], [H.x + s * H.r * 0.75, H.y + H.r * 0.4]], '#5a3a1e'); }
  if (has('scarf')) { const f = still ? 0 : Math.sin(T * 6) * 6 * u; poly([[H.x - H.r * 0.6, H.y + H.r * 0.9], [H.x + H.r * 0.6, H.y + H.r * 0.9], [H.x + H.r * 0.5, H.y + H.r * 1.2], [H.x - H.r * 0.6, H.y + H.r * 1.2]], '#f2f2ea'); poly([[H.x - H.r * 0.5, H.y + H.r * 1.0], [H.x - H.r * 2.2, H.y + H.r * 0.7 + f], [H.x - H.r * 2.1, H.y + H.r * 1.1 - f], [H.x - H.r * 0.5, H.y + H.r * 1.25]], '#f2f2ea'); }
  if (has('redwig')) { for (let i = 0; i < 9; i++) blob(H.x + (i - 4) * H.r * 0.24, top + 2 * u + Math.abs(i - 4) * 2.6 * u, H.r * 0.22, H.r * 0.2, '#d8481a', 6); }
  if (has('pearls')) { ctx.fillStyle = '#f6f2ea'; for (let i = 0; i < 11; i++) { const ang = Math.PI * (0.15 + (i / 10) * 0.7); ctx.beginPath(); ctx.arc(H.x + Math.cos(ang) * H.r * 1.0, H.y + H.r * 1.25 + Math.sin(ang) * H.r * 0.45, 2.8 * u, 0, Math.PI * 2); ctx.fill(); } }
  if (has('balaclava')) { ctx.fillStyle = 'rgba(90,60,40,0.95)'; ctx.beginPath(); ctx.arc(H.x, H.y, H.r * 1.08, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); }
  if (has('boat')) { const x = a.tail?.x ?? cx - 80 * u, y = (a.tail?.y ?? base) - 14 * u; poly([[x - 22 * u, y], [x + 22 * u, y], [x + 14 * u, y + 10 * u], [x - 14 * u, y + 10 * u]], '#8a5a2a'); ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(x - 4 * u, y); ctx.lineTo(x - 18 * u, y - 14 * u); ctx.stroke(); }
  if (has('dish')) { ctx.fillStyle = '#d8d0b8'; ctx.beginPath(); ctx.ellipse(H.x, top + 3 * u, H.r * 0.65, H.r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); const sl = still ? 0 : Math.sin(T * 2.2) * 2 * u; ctx.fillStyle = 'rgba(90,170,230,0.85)'; ctx.beginPath(); ctx.ellipse(H.x + sl, top + 2 * u, H.r * 0.5, H.r * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
  if (has('topknot')) blob(H.x + H.r * 0.5, top - 4 * u, H.r * 0.18, H.r * 0.22, '#1a1a1a', 6);
  if (has('waveshell') && a.shell) { ctx.strokeStyle = '#e8f0f8'; ctx.lineWidth = 3 * u; ctx.beginPath(); const x = a.shell.x - 44 * u, y = a.shell.y + 10 * u; ctx.moveTo(x, y); ctx.bezierCurveTo(x + 10 * u, y - 40 * u, x + 50 * u, y - 46 * u, x + 54 * u, y - 18 * u); ctx.quadraticCurveTo(x + 40 * u, y - 30 * u, x + 36 * u, y - 14 * u); ctx.stroke(); }
  if (has('horns')) for (const s of [-1, 1]) poly([[H.x + s * H.r * 0.3, top + 6 * u], [H.x + s * H.r * 0.9, top - 22 * u], [H.x + s * H.r * 0.6, top + 8 * u]], '#e8e0c0');
  if (has('whitesuit')) { poly([[cx - 50 * u, base - 90 * u], [cx + 50 * u, base - 90 * u], [cx + 40 * u, base - 52 * u], [cx - 40 * u, base - 52 * u]], 'rgba(244,244,236,0.9)'); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(cx + 40 * u, base - 90 * u); ctx.lineTo(cx + 52 * u, base - 82 * u); ctx.lineTo(cx + 40 * u, base - 74 * u); ctx.fill(); }
  if (has('cowl')) { ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(H.x, H.y + 2 * u, H.r * 1.3, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(H.x + H.r * 1.25, H.y + H.r * 1.2); ctx.lineTo(H.x - H.r * 1.25, H.y + H.r * 1.2); ctx.closePath(); ctx.ellipse(H.x + 2 * u, H.y + 3 * u, H.r * 0.92, H.r * 0.86, 0, 0, TAU); ctx.fill('evenodd'); }
  if (has('peas')) { for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#7ac040' : '#5a9a2a'; ctx.beginPath(); ctx.arc(cx - 70 * u + i * 6 * u + (still ? 0 : Math.sin(T * 3 + i) * 1.5 * u), base - 30 * u - (i % 3) * 5 * u, 3.2 * u, 0, Math.PI * 2); ctx.fill(); } }
  if (has('meloncap')) { ctx.strokeStyle = 'rgba(80,60,40,0.4)'; ctx.lineWidth = 1.5 * u; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(H.x, H.y, Math.abs(i) * H.r * 0.22 + 1, H.r * 0.98, 0, Math.PI, Math.PI * 2); ctx.stroke(); } }
  if (has('laurel')) for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const ang = Math.PI * (1.5 + s * (0.12 + i * 0.12)); const x = H.x + Math.cos(ang) * H.r * 1.02, y = H.y + Math.sin(ang) * H.r * 1.02; ctx.fillStyle = '#5a8a2a'; ctx.beginPath(); ctx.ellipse(x, y, 6 * u, 3 * u, ang + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); }
  if (has('towel')) poly([[cx - 56 * u, base - 70 * u], [cx + 56 * u, base - 74 * u], [cx + 50 * u, base - 40 * u], [cx - 52 * u, base - 36 * u]], 'rgba(240,240,255,0.92)');
  if (has('telescope')) { ctx.save(); ctx.translate(H.x - H.r * 0.38, H.y - H.r * 0.12); ctx.rotate(-0.25); poly([[0, -6 * u], [34 * u, -9 * u], [34 * u, 9 * u], [0, 6 * u]], '#8a6a3a'); poly([[34 * u, -10 * u], [42 * u, -11 * u], [42 * u, 11 * u], [34 * u, 10 * u]], '#c8a050'); ctx.restore(); }
  ctx.restore();
}

/** The egg: speckled, wobbling, cracking more as hatch time nears (`p` 0..1). */
export function drawEgg(ctx, { w, h, t = 0, p = 0, still = false, poke = 0 }) {
  const u = Math.min(w, h) / 220, T = still ? 0 : t / 1000;
  const cx = w / 2, base = h * 0.86;
  const wob = (still ? 0 : Math.sin(T * (1.5 + p * 4)) * (0.03 + p * 0.08)) + (poke ? Math.sin(poke * 25) * poke * 0.25 : 0);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, base + 2 * u, 50 * u, 9 * u, 0, 0, Math.PI * 2); ctx.fill();
  // straw nest
  ctx.strokeStyle = '#c8a04a'; ctx.lineWidth = 2 * u; for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI; ctx.beginPath(); ctx.moveTo(cx - 60 * u + i * 4.6 * u, base); ctx.lineTo(cx - 54 * u + i * 4.6 * u + Math.cos(a * 7) * 8 * u, base - 14 * u - Math.sin(a) * 6 * u); ctx.stroke(); }
  ctx.translate(cx, base - 6 * u); ctx.rotate(wob);
  const g = ctx.createRadialGradient(-14 * u, -84 * u, 6 * u, 0, -56 * u, 70 * u); g.addColorStop(0, '#f4f0d8'); g.addColorStop(1, '#a8a07a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -56 * u, 42 * u, 56 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5 * u; ctx.stroke();
  const R = rng(0xe66); ctx.fillStyle = 'rgba(90,110,50,0.55)';
  for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()); ctx.beginPath(); ctx.arc(Math.cos(a) * r * 34 * u, -56 * u + Math.sin(a) * r * 46 * u, (2 + R() * 5) * u, 0, Math.PI * 2); ctx.fill(); }
  // a vein or two pulsing under the shell (gross, not gory)
  ctx.strokeStyle = `rgba(150,60,90,${0.25 + (still ? 0 : Math.sin(T * 2.4) * 0.1)})`; ctx.lineWidth = 1.6 * u;
  ctx.beginPath(); ctx.moveTo(-20 * u, -30 * u); ctx.bezierCurveTo(-8 * u, -50 * u, 10 * u, -40 * u, 14 * u, -70 * u); ctx.stroke();
  const cracks = Math.floor(p * 5);
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.8 * u;
  for (let c = 0; c < cracks; c++) { const sx = (-24 + c * 12) * u, sy = (-70 + (c % 2) * 18) * u; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6 * u, sy + 6 * u); ctx.lineTo(sx + 2 * u, sy + 12 * u); ctx.lineTo(sx + 9 * u, sy + 18 * u); ctx.stroke(); }
  if (p > 0.6) { ctx.fillStyle = '#ffef8a'; const blinkOn = still || (T % 3) > 0.15; if (blinkOn) { ctx.beginPath(); ctx.arc(-4 * u, -62 * u, 3 * u, 0, Math.PI * 2); ctx.fill(); } } // something in there is looking out
  ctx.restore();
}

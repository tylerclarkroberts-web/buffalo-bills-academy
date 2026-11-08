// Guntrad's KO ending: the FINISH HIM freeze, one of six fatalities on the player's low-poly avatar, the FATALITY
// pose, and the cartoon blood used during the fight. Pure drawing, after the result is already decided (and checked
// by the server): nothing here feeds back into the fight. Stylized arcade gore: flat low-poly shapes, no realism.
// Gore off: a harmless knock-out (stars, a fall, no blood).

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ph = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const lp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const BLOOD = ['#d10a1f', '#a3001a', '#ff2a3d', '#8e0014'];

/** Action lengths (ms) after the FINISH HIM freeze; then the FATALITY pose. */
export const FREEZE_MS = 1300;
export const ACT_MS = { limbs: 3800, spine: 3400, heart: 3800, halves: 3300, uppercut: 3200, drain: 3800, ko: 1300 };
export const FLEX_MS = 2100;

/** Is this a small or low-power device? (fewer blood particles) */
export function lowPower() {
  try {
    const n = navigator.hardwareConcurrency || 8, m = navigator.deviceMemory || 8;
    return n <= 4 || m <= 4 || Math.min(window.innerWidth, window.innerHeight) < 500;
  } catch { return false; }
}

/**
 * Cartoon blood, Kill Bill / old kung fu film style (v28): flat low-poly shapes in a few reds, never realistic.
 *   drops   diamond droplets stretched along their speed, with gravity, that land as spiky splats on the felt
 *   pools   thick two-tone puddles that spread
 *   sheets  long tapered brush strokes across the screen that wipe in, drip, and fade (screen space)
 *   lens    fat drops on the "camera" (a canvas over the whole fight screen, HUD included) that run and fade
 * Units are fight units except sheets and lens drops (pixels). Reduced motion: no moving particles at all; blood
 * goes straight to still splats, sheets and lens drops simply appear and disappear. Caps are lower on low power.
 */
export function makeBlood(ctx, poly, { reduced = false, low = false, lens = null } = {}) {
  const MAXD = low ? 260 : 720, MAXS = low ? 80 : 160, MAXL = low ? 8 : 16, MAXH = low ? 3 : 6;
  const scale = low ? 0.6 : 1;
  const drops = []; const splats = []; const sheets = []; const lensDrops = [];
  const lctx = lens ? lens.getContext('2d') : null; let lensDirty = false;
  const view = { X: (x) => x, gy: 0, k: 1, w: 0, h: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const col = () => BLOOD[(Math.random() * 4) | 0];
  function splat(x, w, dir = 0) {
    if (splats.length >= MAXS) { const i = splats.findIndex((q) => !q.pool); if (i < 0) return; splats.splice(i, 1); }
    splats.push({ x, w, seed: Math.random() * 10, t: 1, n: 7 + ((Math.random() * 5) | 0), smear: dir * rnd(0.4, 1.4), c: Math.random() < 0.5 ? '#9b0016' : '#a3001a' });
  }
  const B = {
    drops, splats, sheets, lensDrops, low, reduced,
    /** the renderer tells us the current camera, so world points can be turned into screen points */
    setView(X, gy, k, w, h) { view.X = X; view.gy = gy; view.k = k; view.w = w; view.h = h; },
    emit(x, y, vx, vy, n, spread = 0.6, speed = 1, big = false) {
      n = Math.max(1, Math.round(n * scale));
      if (reduced) { // still: where it would have landed
        const m = Math.min(n, 6); for (let i = 0; i < m; i++) splat(x + Math.sign(vx || 1) * rnd(0, 120) * speed, rnd(4, big ? 16 : 10), Math.sign(vx));
        return;
      }
      for (let i = 0; i < n && drops.length < MAXD; i++) {
        const a = Math.atan2(vy, vx) + (Math.random() - 0.5) * spread * 2; const v = Math.hypot(vx, vy) * (0.45 + Math.random() * 0.75) * speed;
        drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: (big ? 3.2 : 2.4) + Math.random() * (big ? 4.2 : 3.6), c: col(), dust: false });
      }
    },
    dust(x, y, n) { if (reduced) return; for (let i = 0; i < n && drops.length < MAXD; i++) drops.push({ x: x + (Math.random() - 0.5) * 40, y: y + Math.random() * 60, vx: (Math.random() - 0.5) * 160, vy: Math.random() * 120, s: 2 + Math.random() * 4, c: ['#8b7355', '#6e5d48', '#a68d6c'][(Math.random() * 3) | 0], dust: true }); },
    pool(x, w) { splats.push({ x, w: w * 1.35, pool: true, t: reduced ? 1 : 0, seed: Math.random() * 10 }); },
    /** a spray of splatter on the felt around x (on a pulse, a landing) */
    splatter(x, n = 5, dir = 0) { for (let i = 0; i < Math.round(n * scale); i++) splat(x + (Math.random() - 0.5) * 140 + dir * rnd(0, 80), rnd(4, 14), dir); },
    /** a long stroke across the screen, from world point (x, y) heading along (dx, dy) (world, y up) */
    sheet(x, y, dx, dy, { len = 0.7, wid = 1, hold = false } = {}) {
      if (sheets.length >= MAXH) sheets.shift();
      const sx = view.X(x), sy = view.gy - y * view.k; const L = Math.hypot(dx, dy) || 1;
      const D = Math.max(view.w, view.h) * len * rnd(0.8, 1.15);
      const drips = []; for (let i = 0; i < 3; i++) drips.push({ u: rnd(0.15, 0.8), max: rnd(18, 60), w: rnd(2.5, 5) });
      sheets.push({ x0: sx, y0: sy, ux: dx / L, uy: -dy / L, D, W: Math.max(12, Math.min(view.w, view.h) * 0.055) * wid * rnd(0.8, 1.2), seed: Math.random() * 10, bend: Math.random() < 0.5 ? -1 : 1, t0: performance.now(), drips, hold, c: Math.random() < 0.5 ? '#a3001a' : '#d10a1f' });
    },
    /** fat drops on the screen itself; fx/fy in 0..1 (default: anywhere in the middle band) */
    splash(n = 1, fx = null, fy = null, { hold = false } = {}) {
      if (!lctx) return;
      for (let i = 0; i < n; i++) {
        if (lensDrops.length >= MAXL) lensDrops.shift();
        // anywhere on the glass (HUD included), kept off the middle where the fighters are
        let x = rnd(0.03, 0.97); if (Math.abs(x - 0.5) < 0.22) x = x < 0.5 ? rnd(0.03, 0.28) : rnd(0.72, 0.97);
        lensDrops.push({ fx: x, fy: rnd(0.03, 0.62), r: rnd(9, 26), t0: performance.now(), seed: Math.random() * 10, v: rnd(10, 32), hold });
      }
    },
    /** the "camera" position of a world point, 0..1 */
    toScreen(x, y) { return [view.w ? view.X(x) / view.w : 0.5, view.h ? (view.gy - y * view.k) / view.h : 0.5]; },
    clear() { drops.length = 0; splats.length = 0; sheets.length = 0; lensDrops.length = 0; B.drawLens(performance.now()); },
    step(dt) {
      if (reduced) return;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.vy -= 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y <= 0) {
          if (!d.dust && Math.random() < 0.6) splat(d.x, d.s * 3 + Math.random() * 7, Math.sign(d.vx) * Math.min(1, Math.abs(d.vx) / 400));
          drops.splice(i, 1);
        }
      }
      for (const s of splats) if (s.pool) s.t = Math.min(1, s.t + dt * 0.4);
    },
    /** Floor splats and pools (draw before the fighters): spiky star splats with a smear, thick two-tone pools. */
    drawFloor(X, gy, k) {
      for (const s of splats) {
        const w = (s.pool ? s.w * ease(s.t) : s.w) * k; if (w < 1) continue;
        const cx = X(s.x), pts = [];
        if (s.pool) {
          for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const j = 0.72 + 0.28 * Math.sin(s.seed + i * 2.3); pts.push([cx + Math.cos(a) * w * j, gy + Math.sin(a) * w * 0.24 * j]); }
          poly(ctx, pts, '#7d0012');
          if (w > 10) poly(ctx, pts.map(([x, y]) => [cx + (x - cx) * 0.62 - w * 0.12, gy + (y - gy) * 0.55 - 1]), '#9b0016');
          if (w > 18) poly(ctx, [[cx - w * 0.5, gy - w * 0.07], [cx - w * 0.2, gy - w * 0.12], [cx - w * 0.28, gy - w * 0.03]], '#c0001c');
        } else {
          const n = s.n; const sm = s.smear || 0;
          for (let i = 0; i < n * 2; i++) {
            const a = (i / (n * 2)) * Math.PI * 2; const spike = i % 2 === 0 ? 1.25 + 0.5 * Math.sin(s.seed * 3 + i) : 0.5;
            const ex = Math.cos(a); const stretch = 1 + Math.max(0, ex * sm) * 1.6;
            pts.push([cx + ex * w * spike * 0.8 * stretch, gy + Math.sin(a) * w * 0.3 * spike]);
          }
          poly(ctx, pts, s.c || '#9b0016');
        }
      }
    },
    drawDrops(X, gy, k) {
      for (const d of drops) {
        const x = X(d.x), y = gy - d.y * k, s = d.s * k * 1.1;
        if (d.dust) { poly(ctx, [[x - s, y], [x, y - s], [x + s, y], [x, y + s]], d.c); continue; }
        // a diamond stretched back along its velocity: a streak, not a dot
        const sp = Math.hypot(d.vx, d.vy) || 1; const ux = d.vx / sp, uy = -d.vy / sp;
        const tail = s * (1.5 + Math.min(6, sp / 140)); const wd = 0.5;
        poly(ctx, [[x + ux * s, y + uy * s], [x - uy * s * wd, y + ux * s * wd], [x - ux * tail, y - uy * tail], [x + uy * s * wd, y - ux * s * wd]], d.c);
      }
    },
    /** Sheets go over the fighters (screen space). */
    drawSheets(now) {
      for (let i = sheets.length - 1; i >= 0; i--) {
        const h = sheets[i]; const age = (now - h.t0) / 1000;
        if (!h.hold && age > 2.6) { sheets.splice(i, 1); continue; }
        const grow = reduced ? 1 : ease(age / 0.13);
        const alpha = reduced || h.hold ? 1 : 1 - clamp01((age - 1.7) / 0.9);
        const N = 14, top = [], bot = []; const nx = -h.uy, ny = h.ux;
        for (let j = 0; j <= N; j++) {
          const u = (j / N) * grow; const half = h.W * Math.pow(1 - u, 0.6) * (0.75 + 0.25 * Math.sin(h.seed + u * 11)) * (u < 0.06 ? 0.55 + u * 7 : 1);
          const arc = Math.sin(u * Math.PI) * h.D * 0.09 * h.bend; const bx = h.x0 + h.ux * h.D * u + nx * arc, by = h.y0 + h.uy * h.D * u + ny * arc + Math.sin(h.seed + u * 4) * h.W * 0.4;
          top.push([bx + nx * half, by + ny * half]); bot.unshift([bx - nx * half * 0.8, by - ny * half * 0.8]);
        }
        ctx.save(); ctx.globalAlpha = alpha;
        poly(ctx, top.concat(bot), h.c);
        // a darker core and spatter beads along the stroke
        const core = top.map(([x, y], j) => { const b = bot[N - j]; return [x * 0.65 + b[0] * 0.35, y * 0.65 + b[1] * 0.35]; });
        poly(ctx, core.concat(bot.map(([x, y], j) => { const t = top[N - j]; return [x * 0.75 + t[0] * 0.25, y * 0.75 + t[1] * 0.25]; })), '#8e0014');
        for (const d of h.drips) { // drips run down off the stroke
          if (d.u > grow) continue;
          const arc = Math.sin(d.u * Math.PI) * h.D * 0.09 * h.bend; const bx = h.x0 + h.ux * h.D * d.u + nx * arc, by = h.y0 + h.uy * h.D * d.u + ny * arc + Math.sin(h.seed + d.u * 4) * h.W * 0.4 + h.W * 0.3;
          const L = (reduced ? 0.6 : Math.min(1, Math.max(0, age - 0.15) / 1.2)) * d.max * (h.W / 14);
          if (L > 1) poly(ctx, [[bx - d.w, by], [bx + d.w, by], [bx + d.w * 0.45, by + L], [bx, by + L + d.w * 1.2], [bx - d.w * 0.45, by + L]], h.c);
        }
        ctx.restore();
      }
    },
    /** The drops on the screen (own canvas, over the HUD). */
    drawLens(now) {
      if (!lctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1); const w = lens.clientWidth, hh = lens.clientHeight;
      if (lens.width !== Math.round(w * dpr) || lens.height !== Math.round(hh * dpr)) { lens.width = Math.round(w * dpr); lens.height = Math.round(hh * dpr); lensDirty = true; }
      if (!lensDrops.length && !lensDirty) return;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.clearRect(0, 0, w, hh); lensDirty = lensDrops.length > 0;
      const r0 = Math.min(w, hh) / 420;
      for (let i = lensDrops.length - 1; i >= 0; i--) {
        const d = lensDrops[i]; const age = (now - d.t0) / 1000;
        if (!d.hold && age > 3.2) { lensDrops.splice(i, 1); continue; }
        const alpha = reduced || d.hold ? 1 : 1 - clamp01((age - 2.4) / 0.8);
        const x = d.fx * w, y0 = d.fy * hh, r = d.r * Math.max(0.7, r0);
        const run = reduced ? 0 : Math.max(0, age - 0.35) * d.v * Math.max(0.7, r0);
        const y = y0 + run;
        lctx.globalAlpha = alpha;
        if (run > 1) poly(lctx, [[x - r * 0.42, y0], [x + r * 0.42, y0], [x + r * 0.36, y], [x - r * 0.36, y]], '#a3001a');
        const pts = []; for (let j = 0; j < 11; j++) { const a = (j / 11) * Math.PI * 2; const q = r * (0.82 + 0.18 * Math.sin(d.seed + j * 2.1)); pts.push([x + Math.cos(a) * q, y0 + Math.sin(a) * q * 0.92]); }
        poly(lctx, pts, '#a3001a');
        poly(lctx, pts.map(([px, py]) => [x + (px - x) * 0.66 + r * 0.08, y0 + (py - y0) * 0.66 + r * 0.06]), '#d10a1f');
        if (run > 1) { const b = []; for (let j = 0; j < 8; j++) { const a = (j / 8) * Math.PI * 2; b.push([x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.55]); } poly(lctx, b, '#a3001a'); }
        for (let j = 0; j < 3; j++) { const a = d.seed * 5 + j * 2.2; const q = r * (1.25 + 0.3 * j); const bx = x + Math.cos(a) * q, by = y0 + Math.sin(a) * q; const br = r * (0.16 - j * 0.03); poly(lctx, [[bx - br, by], [bx, by - br], [bx + br, by], [bx, by + br]], '#a3001a'); }
        poly(lctx, [[x - r * 0.45, y0 - r * 0.38], [x - r * 0.2, y0 - r * 0.52], [x - r * 0.28, y0 - r * 0.22]], 'rgba(255,190,200,.75)');
      }
      lctx.globalAlpha = 1;
    },
  };
  return B;
}

/**
 * The ending scene. api: drawing helpers from draw.js (ctx, poly, seg, joint, shade, star, beast, pHead, BASE,
 * HIT, look) and sound(name).
 */
export function makeFatal(api, blood) {
  const { ctx, poly, seg, joint, shade, star, beast, pHead, BASE, HIT, look, sound } = api;
  let S = null; // scene state

  const C0 = { skin: look.skin, sleeve: look.sleeve, pants: look.pants, shoe: look.shoe };
  const HUSK = { skin: '#8b7355', sleeve: '#6e6152', pants: '#3a332c', shoe: '#231d18' };
  const tintC = (k) => (k <= 0 ? C0 : Object.fromEntries(Object.keys(C0).map((n) => [n, mixHex(C0[n], HUSK[n], k)])));

  function shoe(P, knee, foot, C) {
    const fd = [foot[0] - knee[0], foot[1] - knee[1]];
    ctx.save(); ctx.translate(foot[0], foot[1]); ctx.rotate(Math.atan2(fd[1], fd[0]) + Math.PI / 2); poly(ctx, [[-8, -4], [-10, 6], [18, 6], [16, -4]], C.shoe); ctx.restore();
  }
  function stump(pt, r = 7) { if (!S.gore) return; joint(ctx, pt, r, '#a3001a'); joint(ctx, pt, r * 0.42, '#f4efe4'); }
  /** One body part of the player, in player-local units (x toward Guntrad, y up). */
  function part(name, P, C, o = {}) {
    if (name === 'bl') { seg(ctx, P.hip, P.bk, 20, shade(C.pants, -0.2)); seg(ctx, P.bk, P.bf, 17, shade(C.pants, -0.2)); shoe(P, P.bk, P.bf, C); }
    else if (name === 'ba') { seg(ctx, P.sh, P.be, 15, shade(C.sleeve, -0.22)); seg(ctx, P.be, P.bh, 13, shade(C.sleeve, -0.22)); joint(ctx, P.bh, 8, shade(C.skin, -0.15)); }
    else if (name === 'torso') {
      const w = 24; const t = [[P.hip[0] - w * 0.8, P.hip[1]], [P.hip[0] + w * 0.8, P.hip[1]], [P.sh[0] + w, P.sh[1]], [P.sh[0] - w, P.sh[1]]];
      poly(ctx, t, C.sleeve); poly(ctx, [t[0], P.hip, lp2(P.sh, P.hip, 0.5), t[3]], shade(C.sleeve, -0.16));
      poly(ctx, [[P.sh[0] - 8, P.sh[1]], [P.sh[0] + 8, P.sh[1]], [P.sh[0], P.sh[1] - 12]], shade(C.skin, -0.1));
      if (o.hole && S.gore) { const c = lp2(P.hip, P.sh, 0.72); const h = []; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; h.push([c[0] + 6 + Math.cos(a) * 9, c[1] + Math.sin(a) * 10 * (0.8 + 0.2 * Math.sin(i * 3))]); } poly(ctx, h, '#5a000c'); joint(ctx, [c[0] + 7, c[1] - 2], 4, '#a3001a'); }
    }
    else if (name === 'fl') { seg(ctx, P.hip, P.fk, 21, C.pants); seg(ctx, P.fk, P.ff, 18, C.pants); shoe(P, P.fk, P.ff, C); }
    else if (name === 'head') {
      if (o.spine) { // the spine hangs from the head: ivory vertebrae, a little red between them
        for (let i = 0; i < o.spine; i += 9) { const q = [P.head[0] - 2 + Math.sin(i / 14) * 3, P.head[1] - 22 - i]; if (S.gore) joint(ctx, [q[0], q[1] + 4], 3.2, '#a3001a'); joint(ctx, q, 5.2 - i / 60, '#efe6d2'); joint(ctx, [q[0] - 1, q[1] + 1], 2.4, '#cfc4ab'); }
      }
      ctx.save(); ctx.translate(P.head[0], P.head[1]); ctx.scale(S.pf, -1); pHead(24);
      if (o.husk) { ctx.globalAlpha = o.husk * 0.78; ctx.fillStyle = '#7a6142'; ctx.beginPath(); ctx.ellipse(0, 0, 25, 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (o.stars) for (let i = 0; i < 4; i++) { const a = S.now / 260 + (i * Math.PI) / 2; star(ctx, Math.cos(a) * 34, -24 - 14 + Math.sin(a) * 7, 7, '#ffe27a'); }
      if (o.xEyes) { ctx.strokeStyle = '#1b1512'; ctx.lineWidth = 2.4; for (const ex of [-7, 7]) { ctx.beginPath(); ctx.moveTo(ex - 3, -3); ctx.lineTo(ex + 3, 3); ctx.moveTo(ex + 3, -3); ctx.lineTo(ex - 3, 3); ctx.stroke(); } }
      ctx.restore();
    }
    else if (name === 'fa') { seg(ctx, P.sh, P.fe, 16, C.sleeve); seg(ctx, P.fe, P.fh, 14, C.sleeve); joint(ctx, P.fh, 9, C.skin); }
  }
  const ORDER = ['bl', 'ba', 'torso', 'fl', 'head', 'fa'];
  const PIVOT = { fa: 'sh', ba: 'sh', fl: 'hip', bl: 'hip', head: 'head' };
  const pivotOf = (name, P) => (name === 'head' ? [P.head[0], P.head[1] - 22] : P[PIVOT[name]]);

  // ---- coordinates ----
  /** player local (after the body's fall rotation/drop) → world */
  const bodyW = (j) => { const r = rot(j, S.body.rot); return [S.pX + S.body.dx + S.pf * r[0], r[1] + S.body.drop]; };
  const gW = (j) => [S.gx + S.gf * 1.16 * j[0], 1.16 * j[1]];
  const toG = (w) => [(w[0] - S.gx) / (S.gf * 1.16), w[1] / 1.16];
  const elbow = (sh, fh, out = 1) => { const m = lp2(sh, fh, 0.5); const d = [fh[0] - sh[0], fh[1] - sh[1]]; const L = Math.hypot(...d) || 1; return [m[0] + (d[1] / L) * 18 * out, m[1] - (d[0] / L) * 18 * out]; };
  const GSH = [20, 158], GBSH = [20, 158];
  const reachTo = (w) => { const fh = toG(w); return { fh, fe: elbow(GSH, fh) }; };

  // ---- pieces (detached body parts) ----
  function detach(names, P, { pivot, held = false, spine = 0 } = {}) {
    const pv = pivot || pivotOf(names[0], P);
    const w = bodyW(pv);
    const pc = { names, P: JSON.parse(JSON.stringify(P)), pivot: pv, x: w[0], y: w[1], vx: 0, vy: 0, rot: S.body.rot, vr: 0, held, spine, landed: false };
    for (const n of names) S.missing.add(n);
    S.pieces.push(pc); return pc;
  }
  function toss(pc, vx, vy, vr) { pc.held = false; pc.vx = vx; pc.vy = vy; pc.vr = vr; }
  function stepPieces(dt) {
    for (const pc of S.pieces) {
      if (pc.held) continue;
      if (pc.landed) continue;
      pc.vy -= 1500 * dt; pc.x += pc.vx * dt; pc.y += pc.vy * dt; pc.rot += pc.vr * dt;
      if (pc.y < 12 && pc.vy < 0) {
        pc.y = 12; pc.vy = -pc.vy * 0.28; pc.vx *= 0.45; pc.vr *= 0.35;
        if (S.gore) { blood.emit(pc.x, 14, 0, 200, 6, 1.4); if (!pc.splat) { pc.splat = true; blood.pool(pc.x, 26); } }
        sound('thump');
        if (Math.abs(pc.vy) < 90) { pc.vy = 0; pc.landed = true; }
      }
    }
  }
  function drawPiece(pc, X, gy, k) {
    ctx.save(); ctx.translate(X(pc.x), gy - pc.y * k); ctx.scale(S.pf * k, -k); ctx.rotate(pc.rot); ctx.translate(-pc.pivot[0], -pc.pivot[1]);
    for (const n of ORDER) if (pc.names.includes(n)) part(n, pc.P, S.C, { spine: n === 'head' ? pc.spine : 0, xEyes: n === 'head' });
    stump(pc.pivot, pc.names[0] === 'head' ? 8 : 6);
    ctx.restore();
  }

  // ---- the player's body (what's left of it) ----
  function drawBody(P, X, gy, k, o = {}) {
    const b = S.body;
    ctx.save(); ctx.translate(X(S.pX + b.dx), gy - b.drop * k); ctx.scale(S.pf * k, -k); ctx.rotate(b.rot);
    if (b.sx !== 1 || b.sy !== 1) ctx.scale(b.sx, b.sy);
    if (o.pivotY != null) { ctx.translate(0, o.pivotY); ctx.rotate(o.r2); ctx.translate(0, -o.pivotY); }
    if (o.clip) { ctx.beginPath(); if (o.clip === 'below') ctx.rect(-300, -300, 600, 300 + o.at); else ctx.rect(-300, o.at, 600, 600); ctx.clip(); }
    for (const n of ORDER) if (!S.missing.has(n)) part(n, P, S.C, { hole: S.hole, husk: S.husk, stars: o.stars, xEyes: o.xEyes });
    for (const n of S.missing) if (n !== 'torso' && !(n === 'head' && S.headGoneSilent)) stump(pivotOf(n, P), n === 'head' ? 9 : 7);
    ctx.restore();
  }
  function heart(w, X, gy, k, beat) {
    const x = X(w[0]), y = gy - w[1] * k, s = 11 * k * (1 + 0.22 * beat);
    const pts = [[0, 0.95], [-0.95, 0.05], [-0.85, -0.55], [-0.4, -0.85], [0, -0.5], [0.4, -0.85], [0.85, -0.55], [0.95, 0.05]].map(([a, b]) => [x + a * s, y + b * s]);
    poly(ctx, pts, '#c0001c'); poly(ctx, [pts[0], pts[1], pts[2], pts[3], pts[4]], '#e01530'); poly(ctx, [[x - 0.55 * s, y - 0.55 * s], [x - 0.25 * s, y - 0.7 * s], [x - 0.3 * s, y - 0.35 * s]], '#ff8a99');
    ctx.strokeStyle = '#6a0010'; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.moveTo(x + 0.1 * s, y - 0.7 * s); ctx.lineTo(x + 0.3 * s, y - 1.25 * s); ctx.stroke();
  }

  // scripted events: fire once when the timeline passes them
  function at(t, name, fn) { if (S.t >= t && !S.fired.has(name)) { S.fired.add(name); fn(); } }
  function spurt(w, dir, n, spread = 0.35, speed = 1, big = false) { if (S.gore) blood.emit(w[0], w[1], dir[0], dir[1], n, spread, speed, big); }
  /** a one-shot burst (v28): a big spray, a stroke across the screen, drops on the screen, splatter on the felt */
  function gush(w, dir, { n = 40, sheets = 1, lens = 2, len = 0.75 } = {}) {
    if (!S.gore) return;
    blood.emit(w[0], w[1], dir[0], dir[1], n, 0.55, 1.25, true);
    for (let i = 0; i < sheets; i++) blood.sheet(w[0], w[1], dir[0] + (Math.random() - 0.5) * 260, dir[1] * (0.25 + Math.random() * 0.5) + (i ? -120 : 60), { len, wid: 1.25 - i * 0.3 });
    const [fx, fy] = blood.toScreen(w[0], w[1]); blood.splash(lens, fx + Math.sign(dir[0]) * 0.12, fy - 0.1);
    blood.splatter(w[0], 6, Math.sign(dir[0]));
  }

  function wobbleP(tsec) { const P = {}; const m = 0.3 + 0.12 * Math.sin(tsec * 7); for (const key in BASE) P[key] = HIT[key] ? lp2(BASE[key], HIT[key], m) : BASE[key]; return P; }

  /** Drive one kind; returns Guntrad's pose override for this frame. */
  function script(kind, t, P, dt) {
    const B = S.body; const g = { };
    const idleArms = () => ({});
    if (kind === 'ko') {
      B.rot = 1.45 * ph(t, 0, 0.5); B.drop = 0;
      return idleArms();
    }
    if (kind === 'limbs') {
      const rips = [['fa', 'fh'], ['ba', 'bh'], ['fl', 'fk'], ['bl', 'bk']];
      let pose = {};
      rips.forEach(([name, grab], i) => {
        const s0 = i * 0.8; const tt = t - s0;
        if (tt < 0 || tt > 0.8) return;
        const grabW = bodyW(P[grab]);
        if (tt < 0.4) { const r = reachTo(lp2(gW([60, 40]), grabW, ease(tt / 0.4))); pose = r; }
        at(s0 + 0.4, `rip${i}`, () => { const pc = detach([name], P, { held: true }); S.heldPiece = pc; sound('rip'); sound('squelch'); gush(bodyW(pivotOf(name, P)), [S.pf * 260, 320], { n: 46, sheets: 1, lens: i === 0 ? 2 : 1 }); S.spurts.push({ name, until: s0 + 1.6 }); });
        if (tt >= 0.4) {
          const k2 = ph(tt, 0.4, 0.75); const hand = lp2(grabW, add(gW([10, 210]), [0, 0]), k2);
          pose = reachTo(hand);
          const pc = S.heldPiece; if (pc && pc.held) { pc.x = hand[0]; pc.y = hand[1]; pc.rot = lerp(pc.rot, 2.4, k2 * 0.2); }
        }
        at(s0 + 0.75, `toss${i}`, () => { const pc = S.heldPiece; if (pc) toss(pc, S.pf * (260 + Math.random() * 240), 520 + Math.random() * 200, (Math.random() - 0.5) * 16); });
      });
      // the body: tips once a leg is gone, drops when both are
      if (S.missing.has('bl')) { const k2 = ph(t, 2.8, 3.25); B.drop = lerp(0, -70, k2); B.rot = lerp(0.12, 1.5, k2); }
      else if (S.missing.has('fl')) B.rot = 0.12 * ph(t, 2.0, 2.3);
      at(3.25, 'torsoland', () => { sound('thump'); if (S.gore) { blood.pool(S.pX, 90); blood.emit(S.pX, 20, 0, 340, 30, 1.3); blood.splatter(S.pX, 10); blood.splash(2); } });
      return pose;
    }
    if (kind === 'spine') {
      const headW = bodyW(P.head);
      let pose;
      if (t < 0.5) pose = reachTo(lp2(gW([60, 60]), add(headW, [0, 14]), ease(t / 0.5)));
      at(0.6, 'grab', () => { const pc = detach(['head'], P, { held: true }); S.heldPiece = pc; sound('rip'); sound('crunch'); });
      if (t >= 0.5) {
        const k2 = ph(t, 0.55, 1.15); const high = gW([64, 268]);
        const hand = lp2(add(headW, [0, 14]), high, k2); pose = reachTo(hand);
        const pc = S.heldPiece; if (pc) { pc.x = hand[0]; pc.y = hand[1] - 14 - 22; pc.spine = Math.min(84, 84 * ph(t, 0.6, 1.0)); pc.rot = Math.sin(t * 3) * 0.12; pc.pivot = [P.head[0], P.head[1] - 22]; }
        if (t > 1.1 && pc && S.gore && Math.random() < 0.5) blood.emit(pc.x, pc.y - pc.spine - 4, 0, -20, 1, 0.3);
      }
      at(0.62, 'neck', () => { S.spurts.push({ name: 'head', until: 2.4, up: true }); gush(bodyW([P.head[0], P.head[1] - 22]), [S.pf * 60, 760], { n: 56, sheets: 2, lens: 3 }); });
      B.rot = 1.45 * ph(t, 1.3, 1.9); B.drop = 0;
      at(1.9, 'fall', () => { sound('thump'); if (S.gore) blood.pool(S.pX - S.pf * 90, 80); });
      return pose;
    }
    if (kind === 'heart') {
      const chest = bodyW([14, 136]); let pose;
      if (t < 0.45) pose = { fh: lerp2v([60, 40], [-14, 150], ease(t / 0.45)), fe: [-6, 130] };
      else if (t < 0.6) pose = reachTo(lp2(gW([-14, 150]), chest, ease((t - 0.45) / 0.15)));
      else if (t < 1.4) { const j = Math.sin(t * 60) * 3; pose = reachTo(add(chest, [j, j * 0.5])); }
      at(0.58, 'punch', () => { sound('squelch'); sound('thump'); gush(chest, [-S.pf * 380, 220], { n: 54, sheets: 2, lens: 3 }); S.shake = 10; });
      at(1.4, 'pull', () => { S.hole = true; S.heart = true; sound('squelch'); gush(chest, [S.pf * 220, 300], { n: 36, sheets: 1, lens: 1 }); S.spurts.push({ chest: true, until: 2.3 }); });
      if (t >= 1.4) { const hand = lp2(chest, gW([66, 252]), ph(t, 1.4, 2.0)); pose = reachTo(hand); S.trophy = hand; }
      for (const b of [1.7, 2.35, 3.0, 3.6]) at(b, `beat${b}`, () => { sound('beat'); if (S.gore && S.trophy) { blood.emit(S.trophy[0], S.trophy[1] + 8, (Math.random() - 0.5) * 300, 420, 22, 0.9, 1, true); blood.splatter(S.trophy[0], 4); if (b === 1.7) blood.splash(1, ...blood.toScreen(S.trophy[0], S.trophy[1])); } });
      S.beat = Math.max(0, 1 - ((t - 1.7) % 0.65) / 0.18) * (t > 1.6 ? 1 : 0);
      if (S.heart && S.gore && Math.random() < 0.35) blood.emit(S.trophy[0], S.trophy[1] - 12, 0, -10, 1, 0.3);
      B.rot = 1.45 * ph(t, 2.3, 2.9);
      at(2.9, 'fall', () => { sound('thump'); if (S.gore) blood.pool(S.pX - S.pf * 90, 80); });
      return pose;
    }
    if (kind === 'halves') {
      let pose, blade = 0, stretch = 0;
      const back = { fh: [-30, 176], fe: [-6, 150] };
      if (t < 0.6) { blade = 120 * ph(t, 0, 0.5); pose = back; }
      else if (t < 0.9) {
        const k2 = ease((t - 0.6) / 0.3); blade = 120;
        const from = gW([-30, 176]), to = [S.pX - S.pf * 70, 100];
        const hand = [lerp(from[0], to[0], k2), lerp(from[1], 102, Math.min(1, k2 * 2.2))];
        pose = reachTo(hand); stretch = 60;
        S.trail.push({ x: hand[0], y: hand[1], t: S.t });
      } else { blade = 120 * (1 - ph(t, 1.3, 1.8)); const hand = lp2([S.pX - S.pf * 70, 102], gW([60, 40]), ph(t, 1.0, 1.7)); pose = reachTo(hand); stretch = 60 * (1 - ph(t, 1.0, 1.6)); }
      at(0.75, 'slash', () => { sound('slash'); S.cut = true; S.shake = 8; });
      if (S.cut && t > 1.25) { // upper half slides off and falls; the legs follow
        S.upper.dx = -S.pf * 50 * ph(t, 1.25, 1.9); S.upper.rot = 1.35 * ph(t, 1.3, 1.95); S.upper.drop = -100 * ph(t, 1.45, 1.95) * ph(t, 1.45, 1.95);
        at(1.3, 'split', () => { sound('squelch'); S.spurts.push({ cut: 'up', until: 2.7 }, { cut: 'low', until: 2.9 }); gush([S.pX, 104], [-S.pf * 320, 380], { n: 60, sheets: 2, lens: 3, len: 0.9 }); });
        at(1.95, 'uland', () => { sound('thump'); if (S.gore) blood.pool(S.pX - S.pf * 110, 70); });
        B.rot = -1.4 * ph(t, 2.2, 2.7);
        at(2.7, 'lland', () => { sound('thump'); if (S.gore) blood.pool(S.pX + S.pf * 60, 50); });
      }
      return { ...pose, blade, stretch };
    }
    if (kind === 'uppercut') {
      let pose;
      const headW = bodyW(P.head);
      if (t < 0.35) pose = { hip: [-6, 70], sh: [24, 128], head: [42, 148], fe: [44, 60], fh: [56, 24] };
      else if (t < 0.6) { const k2 = ease((t - 0.35) / 0.25); const hand = lp2(gW([56, 24]), add(headW, [S.gf * -6, 70]), k2); pose = { ...reachTo(hand), sh: [22, 166], head: [34, 186] }; }
      else { const k2 = ph(t, 1.2, 1.7); const hand = lp2(add(headW, [S.gf * -6, 70]), gW([60, 40]), k2); pose = { ...reachTo(hand), sh: [22, lerp(166, 158, k2)], head: [34, lerp(186, 174, k2)] }; }
      at(0.5, 'pop', () => { const pc = detach(['head'], P, {}); toss(pc, -S.pf * 140, 1650, S.pf * 14); sound('crunch'); sound('thump'); S.shake = 14; gush(bodyW([P.head[0], P.head[1] - 22]), [-S.pf * 80, 900], { n: 64, sheets: 2, lens: 4, len: 0.85 }); S.spurts.push({ name: 'head', until: 2.3, up: true, strong: true }); S.flying = pc; });
      B.rot = t > 1.4 ? 1.45 * ph(t, 1.4, 2.0) : Math.sin(t * 9) * 0.05;
      at(2.0, 'fall', () => { sound('thump'); if (S.gore) blood.pool(S.pX - S.pf * 90, 80); });
      return pose;
    }
    if (kind === 'drain') {
      const sh = bodyW(P.sh), neck = bodyW([P.head[0] - 4, P.head[1] - 20]);
      let pose = {};
      const lean = ph(t, 0, 0.5) * (1 - ph(t, 2.6, 3.0));
      const hand = lp2(gW([60, 40]), sh, lean), bh = lp2(gW([20, 22]), add(sh, [S.pf * 12, -16]), lean);
      const gHead = toG(lp2(gW([40, 174]), add(neck, [S.gf * -14, 8]), lean * 0.95));
      pose = { ...reachTo(hand), bh: toG(bh), be: elbow(GBSH, toG(bh), -1), head: gHead, sh: lp2([20, 158], [gHead[0] - 18, gHead[1] - 14], lean * 0.8) };
      at(0.5, 'bite', () => { sound('crunch'); spurt(neck, [S.pf * 160, 200], 24, 1, 1, true); if (S.gore) blood.splash(1, ...blood.toScreen(neck[0], neck[1])); });
      if (t > 0.5 && t < 2.6) { // the stream: droplets running from the neck into his mouth
        S.husk = ph(t, 0.6, 2.6); S.C = tintC(S.husk); B.sx = 1 - 0.22 * S.husk; B.sy = 1 - 0.14 * S.husk;
        if (S.gore && Math.random() < 0.7) { const m = gW(gHead); blood.emit(neck[0], neck[1], (m[0] - neck[0]) * 2.2, (m[1] - neck[1]) * 2.2 + 300, 1, 0.08); }
        for (let i = 0; i < 4; i++) at(0.7 + i * 0.5, `slurp${i}`, () => sound('slurp'));
      }
      B.rot = 1.45 * ph(t, 2.75, 3.15);
      at(3.15, 'crumble', () => { sound('thump'); sound('crunch'); S.crumbled = true; blood.dust(S.pX - S.pf * 80, 0, 70); });
      return pose;
    }
    return {};
  }
  function lerp2v(a, b, t) { return lp2(a, b, t); }

  return {
    get active() { return !!S; },
    get gx() { return S?.gx; },
    get px() { return S?.pX; },
    get shake() { const v = S?.shake || 0; if (S) S.shake *= 0.85; return v; },
    /** The KO: freeze on FINISH HIM, the player wobbles back up, Guntrad walks over. */
    start({ pX, gX, now, gore }) {
      const pf = Math.sign(gX - pX) || 1;
      S = { pX, gx: gX, g0: gX, pf, gf: -pf, t0: now, now, last: now, gore, kind: null, ta: 0, t: 0, missing: new Set(), pieces: [], spurts: [], fired: new Set(), body: { rot: 1.3, drop: 0, dx: 0, sx: 1, sy: 1 }, upper: { dx: 0, rot: 0, drop: 0 }, C: C0, husk: 0, hole: false, heart: false, trail: [], shake: 0, beat: 0, trophy: null, cut: false };
    },
    act(kind, now) {
      if (!S) return; S.kind = kind; S.ta = now; S.fired = new Set();
      const dist = { limbs: 96, spine: 90, heart: 94, halves: 235, uppercut: 82, drain: 62, ko: 150 }[kind] || 100;
      S.gTarget = S.pX + S.pf * dist; S.gFrom = S.gx;
      if (kind === 'ko') S.body.rot = 0;
    },
    stop() { S = null; },
    draw(now, X, gy, k) {
      if (!S) return;
      const dt = Math.min(0.05, (now - S.last) / 1000); S.last = now; S.now = now;
      const tf = (now - S.t0) / 1000;
      const P0 = wobbleP(tf);
      let gpose = {}; let walking = false;
      if (!S.kind) { // FINISH HIM: get back up, wobble; he walks in
        S.body.rot = 1.3 * (1 - ph(tf, 0, 0.35));
        const tgt = S.pX + S.pf * 130; S.gx = lerp(S.g0, tgt, ph(tf, 0.1, 1.0)); walking = tf > 0.1 && tf < 1.0;
      } else {
        S.t = (now - S.ta) / 1000; const t = S.t;
        S.gx = lerp(S.gFrom, S.gTarget, ph(t, 0, 0.25)); walking = t < 0.25;
        gpose = script(S.kind, t, P0, dt) || {};
        const D = (ACT_MS[S.kind] || 3000) / 1000;
        if (t > D) { // FATALITY: the flex
          const f = ph(t, D, D + 0.35); const bob = Math.sin(t * 5) * 4;
          const flex = { fe: [64, 176 + bob], fh: [56, 232 + bob], be: [-18, 176 + bob], bh: [-10, 232 + bob], head: [40, 180], sh: [20, 162] };
          if (S.kind === 'spine' || S.kind === 'heart') { flex.fe = [58, 214]; flex.fh = [66, 262 + bob]; }
          const out = {}; for (const key of Object.keys(flex)) out[key] = gpose[key] ? lp2(gpose[key], flex[key], f) : flex[key];
          gpose = { ...gpose, ...out, blade: 0, stretch: 0 };
          if (S.trophy && S.kind === 'heart') S.trophy = gW([66, 262 + bob]);
          if (S.heldPiece && S.heldPiece.held && S.kind === 'spine') { const h = gW([66, 262 + bob]); S.heldPiece.x = h[0]; S.heldPiece.y = h[1] - 36; }
          at(D + 0.05, 'fatality', () => sound('fatality'));
        }
      }
      if (walking) { const s = Math.sin(now / 80) * 18; gpose = { ...gpose, fk: [30 + s, 56], ff: [38 + s * 1.5, 0], bk: [-26 - s, 54], bf: [-38 - s * 1.5, 0] }; }
      // spurts from stumps: pressurized arterial fountains that pulse on a heartbeat and arc down (v28)
      if (S.gore) for (const sp of S.spurts) {
        if (sp.t0 == null) sp.t0 = S.t;
        if (S.t > sp.until + 1.2) continue;
        const tt = S.t - sp.t0; const env = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2.6 * tt + 1.2)), 4);
        const fade = S.t > sp.until ? 1 - (S.t - sp.until) / 1.2 : 1; const e = env * fade;
        const base = sp.strong ? 3 : 2; const n = Math.round(base * (0.25 + 3.4 * e)); const sp1 = 0.7 + 0.6 * e;
        let from, dir, spread = 0.16 + 0.12 * e;
        if (sp.name) { from = bodyW(pivotOf(sp.name, P0)); const r = rot(sp.up ? [0, 1] : [0.3, 1], S.body.rot); dir = [S.pf * r[0] * 420 + S.pf * 90, r[1] * (sp.strong ? 820 : 600)]; }
        else if (sp.chest) { from = bodyW([14, 136]); dir = [S.pf * 300, 260]; spread = 0.4; }
        else if (sp.cut === 'low') { from = bodyW([0, 104]); dir = [S.pf * 90, 640]; }
        else { from = [S.pX + S.upper.dx, 104 + S.upper.drop]; dir = [-S.pf * 340, 360]; }
        if (n > 0) spurt(from, dir, n, spread, sp1, e > 0.5);
        if (e > 0.85 && !sp.hi) { sp.hi = true; blood.splatter(from[0] + Math.sign(dir[0]) * 120, 3, Math.sign(dir[0])); if (Math.random() < 0.3) blood.splash(1, ...blood.toScreen(from[0], from[1])); }
        else if (e < 0.2) sp.hi = false;
      }
      blood.step(dt); stepPieces(dt);
      // draw: floor, body, pieces, Guntrad, drops on top
      blood.drawFloor(X, gy, k);
      const stars = !S.kind || S.kind === 'ko';
      if (S.crumbled) { const cx = X(S.pX - S.pf * 70); poly(ctx, [[cx - 46 * k, gy], [cx - 20 * k, gy - 18 * k], [cx + 8 * k, gy - 24 * k], [cx + 40 * k, gy - 10 * k], [cx + 52 * k, gy]], '#6e5d48'); poly(ctx, [[cx - 20 * k, gy - 18 * k], [cx + 8 * k, gy - 24 * k], [cx + 4 * k, gy]], '#8b7355'); }
      else if (S.cut) {
        drawBody(P0, X, gy, k, { clip: 'below', at: 104 });
        if (S.gore) { ctx.save(); ctx.translate(X(S.pX), gy); ctx.scale(S.pf * k, -k); ctx.rotate(S.body.rot); ctx.fillStyle = '#a3001a'; ctx.fillRect(-22, 100, 44, 6); ctx.restore(); }
        const B = S.body; const save = { ...B }; Object.assign(B, { dx: S.upper.dx, rot: 0, drop: S.upper.drop });
        drawBody(P0, X, gy, k, { clip: 'above', at: 104, xEyes: S.t > 1.3, pivotY: 104, r2: S.upper.rot });
        if (S.gore) { ctx.save(); ctx.translate(X(S.pX + S.upper.dx), gy - (S.upper.drop + 104) * k); ctx.scale(S.pf * k, -k); ctx.rotate(S.upper.rot); ctx.fillStyle = '#a3001a'; ctx.fillRect(-24, -3, 48, 6); ctx.restore(); }
        Object.assign(B, save);
        if (!S.cutLine && S.gore && S.t < 1.3) { ctx.save(); ctx.strokeStyle = '#ff2a3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(S.pX) - 26 * k, gy - 104 * k); ctx.lineTo(X(S.pX) + 26 * k, gy - 104 * k); ctx.stroke(); ctx.restore(); }
      } else drawBody(P0, X, gy, k, { stars, xEyes: S.kind && S.kind !== 'ko' ? S.t > 0.6 : false });
      for (const pc of S.pieces) drawPiece(pc, X, gy, k);
      beast({ x: S.gx, y: 0, face: S.gf, st: 'idle', pose: gpose, stretch: gpose.stretch || 0, blade: gpose.blade || 0 }, X(S.gx), gy, k, now, Math.abs(S.gx - S.pX));
      if (S.heart && S.trophy) heart(S.trophy, X, gy, k, S.beat);
      // slash trail
      if (S.trail.length) { ctx.save(); ctx.lineCap = 'round'; for (let i = 1; i < S.trail.length; i++) { const a = S.trail[i - 1], b = S.trail[i]; const age = S.t - b.t; if (age > 0.35) continue; ctx.globalAlpha = 1 - age / 0.35; ctx.strokeStyle = '#fff6e4'; ctx.lineWidth = 10 * k * (1 - age / 0.35) + 1; ctx.beginPath(); ctx.moveTo(X(a.x), gy - a.y * k); ctx.lineTo(X(b.x), gy - b.y * k); ctx.stroke(); } ctx.restore(); }
      blood.drawDrops(X, gy, k);
      if (S.gore) blood.drawSheets(now);
    },
  };
}

function mixHex(a, b, t) {
  const p = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const A = p(a), B = p(b); return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

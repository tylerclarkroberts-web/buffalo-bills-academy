// v29: the player's hidden finisher after a genuine, server-checked win. Three cartoon gags (no show branding,
// all original): THE GUNTRAD SHOW (studio, couch yank, desk smash, fake applause, zoom + lower-third), HOUSE RULES:
// BONK (ceiling mallet drives him into the felt like a nail, then he bursts into poker chips) and FULL OF HOT AIR
// (balloon head, table flip, confetti cannon, pop). Purely cosmetic: it runs after the money is settled.
// Gore off = no blood at all. Reduced motion = one still frame per gag (plus the DOM banners).
export const GAG_KINDS = ['show', 'hammer', 'balloon'];
export const GAG_MS = 4600;
const CHIP = ['#c4203a', '#1f5fbf', '#1d8a4a', '#1a1a1a', '#f2c65a'];
const CONF = ['#ff3d8b', '#2ee6d6', '#f2c65a', '#7cff6b', '#9f7bff', '#ffffff'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const back = (v) => { v = clamp(v); const s = 1.7; return 1 + (s + 1) * (v - 1) ** 3 + s * (v - 1) ** 2; };
const STILL = { show: 2350, hammer: 2500, balloon: 2550 };
// Guntrad sitting on a couch / dazed upright, in his own units (x toward the player, y up)
const SIT = { hip: [0, 64], sh: [-8, 128], head: [-6, 156], fe: [16, 98], fh: [34, 80], be: [-16, 100], bh: [-2, 78], fk: [44, 66], ff: [48, 0], bk: [36, 62], bf: [38, 0] };
const LIMP = { hip: [0, 80], sh: [2, 140], head: [4, 166], fe: [12, 104], fh: [16, 74], be: [-10, 104], bh: [-8, 74], fk: [6, 40], ff: [10, 0], bk: [-8, 40], bf: [-12, 0] };

export function makeGag({ ctx, poly, joint, star, beast, gFace, sound, blood }) {
  let S = null;
  const parts = []; // chips / confetti / cards: {x,y,vx,vy,r,spin,a,col,kind,t0}
  const said = new Set();
  const once = (key, fn) => { if (!said.has(key)) { said.add(key); fn(); } };
  const sfx = (n) => { if (!S.reduced) sound(n); };
  function burst(kind, x, y, n, sp = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI - Math.PI, v = (240 + Math.random() * 520) * sp;
      parts.push({ kind, x, y, vx: Math.cos(a) * v * (kind === 'chip' ? 1.3 : 1), vy: Math.abs(Math.sin(a)) * v * 1.25 + 120, r: kind === 'chip' ? 9 + Math.random() * 4 : 4 + Math.random() * 4, spin: (Math.random() - 0.5) * 18, a: Math.random() * 6, col: (kind === 'chip' ? CHIP : CONF)[i % (kind === 'chip' ? CHIP.length : CONF.length)], rest: false });
    }
  }
  function stepParts(dt) {
    for (const p of parts) {
      if (p.rest) continue;
      p.vy -= (p.kind === 'conf' ? 380 : 1500) * dt; if (p.kind === 'conf') { p.vx *= 0.985; p.vy = Math.max(p.vy, -160); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.spin * dt;
      if (p.y <= 2) { p.y = 2; if (p.kind === 'chip' && Math.abs(p.vy) > 160) { p.vy = -p.vy * 0.35; p.vx *= 0.6; } else { p.vy = 0; p.vx *= 0.8; if (Math.abs(p.vx) < 8) p.rest = true; } }
    }
  }
  function drawParts(X, gy, k) {
    for (const p of parts) {
      const x = X(p.x), y = gy - p.y * k;
      ctx.save(); ctx.translate(x, y);
      if (p.kind === 'chip') { const sq = p.rest ? 0.32 : Math.abs(Math.cos(p.a)) * 0.85 + 0.15; ctx.scale(1, sq); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.r * k * 1.6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fbf4ea'; ctx.setLineDash([3 * k, 3 * k]); ctx.lineWidth = 2.4 * k; ctx.beginPath(); ctx.arc(0, 0, p.r * k * 1.25, 0, Math.PI * 2); ctx.stroke(); }
      else if (p.kind === 'card') { ctx.rotate(p.a); ctx.fillStyle = '#fbf4ea'; ctx.fillRect(-9 * k, -13 * k, 18 * k, 26 * k); ctx.fillStyle = '#c4203a'; ctx.fillRect(-4 * k, -4 * k, 8 * k, 8 * k); }
      else { ctx.rotate(p.a); ctx.scale(1, Math.abs(Math.cos(p.a * 1.7)) + 0.2); ctx.fillStyle = p.col; ctx.fillRect(-p.r * k, -p.r * 0.6 * k, p.r * 2 * k, p.r * 1.2 * k); }
      ctx.restore();
    }
  }
  const txt = (s, x, y, size, col, rot = 0, a = 1) => { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot); ctx.font = `900 ${Math.round(size)}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = '#1a0710'; ctx.strokeText(s, 0, 0); ctx.fillStyle = col; ctx.fillText(s, 0, 0); ctx.restore(); };
  const G = (o) => ({ x: S.gX, y: 0, face: S.gf, st: 'idle', ...o });

  // ---------- THE GUNTRAD SHOW ----------
  function desk(x, gy, k, rot = 0, lift = 0) { // a low-poly talk-show desk, front panel faces us
    ctx.save(); ctx.translate(x, gy - lift * k); ctx.rotate(rot);
    const w = 150 * k, h = 92 * k;
    poly(ctx, [[-w / 2, 0], [w / 2, 0], [w / 2 + 8 * k, -h], [-w / 2 - 8 * k, -h]], '#6b3a1c');
    poly(ctx, [[-w / 2 - 8 * k, -h], [w / 2 + 8 * k, -h], [w / 2 + 2 * k, -h - 12 * k], [-w / 2 - 2 * k, -h - 12 * k]], '#8f5428');
    poly(ctx, [[-w / 2 + 10 * k, -16 * k], [w / 2 - 10 * k, -16 * k], [w / 2 - 6 * k, -h + 12 * k], [-w / 2 + 6 * k, -h + 12 * k]], '#4a2410');
    ctx.fillStyle = '#f2c65a'; ctx.font = `900 ${Math.round(14 * k)}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('THE GUNTRAD', 0, -h * 0.62); ctx.fillText('SHOW', 0, -h * 0.36);
    joint(ctx, [w / 2 - 22 * k, -h - 20 * k], 6 * k, '#cfd0d6'); poly(ctx, [[w / 2 - 24 * k, -h - 12 * k], [w / 2 - 20 * k, -h - 12 * k], [w / 2 - 21 * k, -h - 20 * k]], '#5a5c66'); // the desk mic
    ctx.restore();
  }
  function couch(x, gy, k) {
    const w = 190 * k; ctx.save(); ctx.translate(x, gy);
    poly(ctx, [[-w / 2, -14 * k], [w / 2, -14 * k], [w / 2, -64 * k], [-w / 2, -64 * k]], '#c2427a');
    poly(ctx, [[-w / 2 + 6 * k, -64 * k], [w / 2 - 6 * k, -64 * k], [w / 2 - 14 * k, -128 * k], [-w / 2 + 14 * k, -128 * k]], '#a8326a');
    for (const s of [-1, 1]) poly(ctx, [[s * w / 2, -14 * k], [s * (w / 2 + 16 * k), -14 * k], [s * (w / 2 + 16 * k), -92 * k], [s * w / 2, -92 * k]], '#8e2558');
    for (const s of [-1, 1]) poly(ctx, [[s * w * 0.4, 0], [s * w * 0.36, 0], [s * w * 0.36, -14 * k], [s * w * 0.4, -14 * k]], '#2a1410');
    ctx.restore();
  }
  function drawShow(t, X, gy, k, w, h, drawP) {
    const away = S.gf; // +1: from Guntrad, away from the player is -face... (he faces the player)
    const out = -away; // the side away from the player
    const zIn = ease((t - 1150) / 600) - ease((t - 3500) / 700); const z = 1 + 0.45 * zIn;
    const cx = X(S.gX), cy = gy - 150 * k;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
    // studio light: a dark wash with a spotlight on the guest
    const dim = ease(t / 400) * 0.55; ctx.fillStyle = `rgba(14,4,22,${dim})`; ctx.fillRect(-w, -h, w * 3, h * 3);
    const sg = ctx.createRadialGradient(cx, gy - 60 * k, 10, cx, gy - 60 * k, 260 * k); sg.addColorStop(0, `rgba(255,236,170,${0.32 * ease(t / 500)})`); sg.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = sg; ctx.fillRect(cx - 300 * k, gy - 420 * k, 600 * k, 460 * k);
    // the couch slides in under him, then gets yanked out (2.3 s)
    const couchIn = back((t - 250) / 550); const yank = ease((t - 2250) / 260);
    const couchX = S.gX + out * (700 * (1 - couchIn) + 900 * yank);
    couch(X(couchX), gy, k);
    // Guntrad: down → yanked up onto the couch (0.8 s) → drops (2.4 s) → under the desk (3.15 s)
    const deskT = (t - 2750) / 420; const landed = deskT >= 1;
    if (!landed) {
      if (t < 800) beast(G({ st: 'down' }), X(S.gX), gy, k, S.now, 300);
      else if (t < 2350) { const pop = back((t - 800) / 260); beast(G({ pose: SIT, y: 0 }), X(S.gX), gy - (pop - 1) * 30 * k, k, S.now, 300); }
      else { const fall = ease((t - 2350) / 200); beast(G({ pose: SIT }), X(S.gX), gy + fall * 26 * k, k, S.now, 300); }
    } else beast(G({ st: 'down' }), X(S.gX + out * 30), gy, k, S.now, 300); // pinned: only his legs show past the desk
    if (t > 800 && t < 2350) for (let i = 0; i < 3; i++) { const a = S.now / 240 + (i * Math.PI * 2) / 3; star(ctx, X(S.gX) + Math.cos(a) * 30 * k, gy - 214 * k + Math.sin(a) * 8 * k, 6 * k, '#ffe27a'); }
    // the desk: slides in (0.2 s), then flips up and over onto him (2.75–3.17 s)
    const deskIn = back((t - 200) / 500); const deskHome = S.gX + out * 150 - out * 760 * (1 - deskIn);
    if (t < 2750) desk(X(deskHome), gy, k);
    else { const p = ease(deskT); const dx = deskHome + (S.gX - deskHome) * p; desk(X(dx), gy - 46 * k, k, out * Math.PI * 2 * p, Math.sin(p * Math.PI) * 220 - 46); }
    if (landed) once('smash', () => { sfx('smash'); S.shake = 22; if (S.gore) { blood.pool(S.gX, 50); blood.splatter(S.gX, 6, out); blood.emit(S.gX, 30, out * 300, 260, 14, 0.9, 1, false); } });
    if (t > 2750 && t < 2800) once('flip', () => sfx('whoosh'));
    drawP(X(S.pX));
    ctx.restore();
    // applause sign + lower-third (screen space, not zoomed)
    if (t > 1000) { const on = Math.floor(t / 220) % 2 === 0; const bw = Math.min(w * 0.42, 220), bh = Math.max(26, Math.min(40, h * 0.06)); const bx = w / 2 - bw / 2, by = h * 0.17;
      ctx.fillStyle = '#2a0710'; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8); ctx.fillStyle = on ? '#ff3a4e' : '#5a0a14'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = on ? '#fff6e0' : '#a55'; ctx.font = `900 ${Math.round(bh * 0.62)}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t > 3300 ? 'APPLAUSE (MANDATORY)' : 'APPLAUSE', w / 2, by + bh / 2 + 1);
      once('clap', () => sfx('applause')); }
    if (t > 3350) once('clap2', () => sfx('applause'));
    if (t > 1350) {
      const s = ease((t - 1350) / 350); const lh = Math.max(36, Math.min(58, h * 0.085)); const ly = h * 0.6; const lw = Math.min(w * 0.9, 560);
      ctx.save(); ctx.translate(-(1 - s) * (lw + 40), 0);
      ctx.fillStyle = '#f2c65a'; ctx.fillRect(12, ly, 8, lh); ctx.fillStyle = 'rgba(20,6,16,.92)'; ctx.fillRect(20, ly, lw, lh);
      ctx.fillStyle = '#fff6e0'; ctx.font = `900 ${Math.round(lh * 0.4)}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('GUNTRAD', 32, ly + lh * 0.46);
      ctx.fillStyle = '#f2c65a'; ctx.font = `700 ${Math.round(lh * 0.28)}px system-ui, sans-serif`;
      ctx.fillText(t > 3200 ? 'NOW: PART OF THE DESK' : 'FORMER PIT BOSS · CURRENTLY: FURNITURE', 32, ly + lh * 0.82);
      ctx.restore();
    }
    if (landed && t < 4200) txt('SMASH!', X(S.gX), gy - 170 * k, 46 * k * 1.4, '#ff3d8b', -0.12, 1 - clamp((t - 3600) / 600));
    once('scratch', () => sfx('scratch'));
    if (t > 800) once('boing', () => sfx('boing'));
    if (t > 2250) once('yank', () => sfx('whistle'));
  }

  // ---------- HOUSE RULES: BONK ----------
  function mallet(x, y, k, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    poly(ctx, [[-9 * k, 0], [9 * k, 0], [9 * k, -330 * k], [-9 * k, -330 * k]], '#a8743c');
    const hw = 125 * k, hh = 72 * k;
    poly(ctx, [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]], '#c98a4a'); poly(ctx, [[-hw, hh * 0.6], [hw, hh * 0.6], [hw, hh], [-hw, hh]], '#9a6230');
    poly(ctx, [[-hw * 0.28, 0], [hw * 0.28, 0], [hw * 0.28, hh], [-hw * 0.28, hh]], '#c4203a');
    ctx.fillStyle = '#fff6e0'; ctx.font = `900 ${Math.round(17 * k)}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HOUSE', 0, hh * 0.45);
    ctx.restore();
  }
  function drawHammer(t, X, gy, k, w, h, drawP) {
    const HITS = [900, 1400, 1900]; const SINK = [0.34, 0.64, 0.9];
    let sink = 0; for (let i = 0; i < 3; i++) if (t >= HITS[i]) sink = SINK[i];
    const boom = 3150; const gone = t >= boom;
    // the shadow of what's coming
    if (t < 900) { const s = ease(t / 900); ctx.fillStyle = `rgba(0,0,0,${0.35 * s})`; ctx.beginPath(); ctx.ellipse(X(S.gX), gy, 130 * k * s, 14 * k * s, 0, 0, Math.PI * 2); ctx.fill(); }
    // trapdoor in the ceiling
    if (t < 2700) { const o = ease(t / 300) * (1 - ease((t - 2400) / 300)); ctx.fillStyle = '#0b0308'; ctx.fillRect(X(S.gX) - 140 * k * o, 0, 280 * k * o, 18); }
    drawP(X(S.pX));
    if (!gone) {
      ctx.save(); ctx.beginPath(); ctx.rect(-w, -h, w * 3, gy + h); ctx.clip(); // whatever sinks below the felt is out of sight
      const o = t < 700 ? G({ pose: LIMP }) : G({ st: 'idle', pose: LIMP });
      const quiver = t > 2700 ? Math.sin(S.now / 25) * 3 * k * ease((t - 2700) / 400) : 0;
      beast(o, X(S.gX) + quiver, gy + sink * 230 * k, k, S.now, 300);
      if (t < 700 || sink >= 0.9) for (let i = 0; i < 3; i++) { const a = S.now / 220 + (i * Math.PI * 2) / 3; star(ctx, X(S.gX) + Math.cos(a) * 30 * k, gy + sink * 230 * k - 226 * k + Math.sin(a) * 8 * k, 6 * k, '#ffe27a'); }
      ctx.restore();
      // a crack ring in the felt around him
      if (sink) { ctx.strokeStyle = 'rgba(20,6,10,.7)'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI; ctx.moveTo(X(S.gX), gy); ctx.lineTo(X(S.gX) + Math.cos(a) * (60 + 50 * sink) * k * (i % 2 ? 1.3 : 1), gy + Math.sin(a) * 6 * k); } ctx.stroke(); }
    }
    // the mallet: falls in at 0.6 s, slams three times, then winches back up
    if (t > 550 && t < 2700) {
      let lift = 0; const top = gy - 230 * k - (1 - sink) * 0;
      if (t < 900) lift = 1 - ease((t - 550) / 350) ** 2;
      else if (t < 1900) { const ph = ((t - 900) % 500) / 500; lift = ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI) * 0.45 : 0; }
      else lift = ease((t - 2200) / 500);
      const headY = gy - (230 - sink * 230) * k - 72 * k - lift * (gy + 200);
      mallet(X(S.gX), Math.max(-400, headY), k, 0); void top;
    }
    for (let i = 0; i < 3; i++) if (t >= HITS[i]) {
      once(`bonk${i}`, () => { sfx('bonk'); S.shake = 14 + i * 4; if (S.gore) { blood.splatter(S.gX, 2 + i, S.gf); if (i === 2) blood.pool(S.gX, 34); } });
      const a = (t - HITS[i]) / 450; if (a < 1) txt('BONK', X(S.gX) + (i - 1) * 60 * k, gy - (250 + i * 26) * k, 34 * k * 1.5, '#f2c65a', (i - 1) * 0.2, 1 - a);
    }
    if (t > 2700 && !gone) once('rumble', () => sfx('rumble'));
    if (gone) {
      once('boom', () => { sfx('chips'); S.shake = 24; S.flash = S.now; burst('chip', S.gX, 30, S.low ? 38 : 70, 1); if (S.gore) blood.emit(S.gX, 40, 0, 420, 10, 1.2, 0.8, false); });
      if (t < 4300) txt('CASHED OUT', X(S.gX), gy - 230 * k, 40 * k * 1.4, '#2ee6d6', 0.06, 1 - clamp((t - 3800) / 500));
    }
    if (t > 200) once('whistle', () => sfx('drop'));
  }

  // ---------- FULL OF HOT AIR ----------
  function balloon(x, y, r, k, popAt) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, r * 1.05); ctx.bezierCurveTo(8 * k, r * 1.4, -8 * k, r * 1.7, 0, r * 2); ctx.stroke(); // string to his neck
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15); g.addColorStop(0, '#ff8aa6'); g.addColorStop(0.5, '#e01e48'); g.addColorStop(1, '#8e0a2a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.12, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [[-5 * k, r * 1.1], [5 * k, r * 1.1], [0, r * 1.02]], '#8e0a2a');
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.14, r * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
    gFace(0, r * 0.08, 25 * k * 1.16); // his face, unchanged, riding on the balloon
    if (popAt) { /* drawn by caller */ }
    ctx.restore();
  }
  function cardTable(x, y, k, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    poly(ctx, [[-90 * k, -8 * k], [90 * k, -8 * k], [90 * k, 8 * k], [-90 * k, 8 * k]], '#6b3a1c'); poly(ctx, [[-84 * k, -12 * k], [84 * k, -12 * k], [84 * k, -6 * k], [-84 * k, -6 * k]], '#1d6b42');
    for (const s of [-1, 1]) poly(ctx, [[s * 70 * k, 8 * k], [s * 62 * k, 8 * k], [s * 66 * k, 70 * k], [s * 74 * k, 70 * k]], '#4a2410');
    ctx.restore();
  }
  function drawBalloon(t, X, gy, k, w, h, drawP) {
    const pop = 3250; const popped = t >= pop;
    const grow = ease((t - 500) / 1100); const r = Math.min((28 + 46 * grow) * k * 1.16, Math.max(20, (gy - 8 - 168 * k) / 2.07));
    const room = Math.max(0, (gy - 8 - r * 2.07 + 24 * k) / k - 193); // keep the balloon on screen
    const lift = popped ? Math.max(0, 1 - ((t - pop) / 380) ** 2) * S.liftAtPop : Math.min(room, ease((t - 1500) / 1500) * 110);
    if (!popped) S.liftAtPop = lift;
    const sway = Math.sin(S.now / 420) * 10 * ease((t - 1500) / 600);
    // the table flip from the player's side (1.9–2.9 s), cards everywhere
    if (t > 1850 && t < 3000) { const p = (t - 1850) / 1150; const tx = S.pX + (S.gX - S.pX) * 0.25 + (S.gX - S.pX) * 1.4 * p; const ty = gy - (40 + Math.sin(p * Math.PI) * 260) * k; cardTable(X(tx), ty, k, -S.pf * p * Math.PI * 2.2); }
    if (t > 1850) once('flip', () => { sfx('whoosh'); for (let i = 0; i < (S.low ? 10 : 22); i++) parts.push({ kind: 'card', x: S.pX + (S.gX - S.pX) * 0.3, y: 60, vx: (S.gX - S.pX) * (0.6 + Math.random()) * 0.9, vy: 300 + Math.random() * 500, r: 0, spin: (Math.random() - 0.5) * 14, a: 0, rest: false }); });
    // the confetti cannon by the player (2.6 s)
    const can = ease((t - 2300) / 300);
    if (t > 2300 && t < 4000) { const cx = X(S.pX - S.pf * 50), cy = gy; ctx.save(); ctx.translate(cx, cy); ctx.scale(S.pf, 1); ctx.rotate(-0.7); poly(ctx, [[-10 * k, -20 * k], [90 * k * can, -30 * k], [90 * k * can, 10 * k], [-10 * k, 14 * k]], '#f2c65a'); poly(ctx, [[80 * k * can, -30 * k], [90 * k * can, -30 * k], [90 * k * can, 10 * k], [80 * k * can, 10 * k]], '#c4203a'); ctx.rotate(0.7); joint(ctx, [0, -14 * k], 20 * k, '#3a332c'); joint(ctx, [0, -14 * k], 8 * k, '#f2c65a'); ctx.restore(); }
    if (t > 2650) once('cannon', () => { sfx('boom'); S.shake = 10; for (let i = 0; i < (S.low ? 40 : 90); i++) parts.push({ kind: 'conf', x: S.pX + S.pf * 30, y: 70, vx: S.pf * (500 + Math.random() * 600), vy: 300 + Math.random() * 520, r: 4 + Math.random() * 3, spin: (Math.random() - 0.5) * 20, a: Math.random() * 6, col: CONF[i % CONF.length], rest: false }); });
    drawP(X(S.pX));
    // Guntrad: stands up dazed, head swells into a balloon, floats, POP, drops
    const o = G({ pose: LIMP, y: Math.max(0, lift) });
    if (!popped) {
      beast(o, X(S.gX) + sway * k, gy, k, S.now, 300);
      const hx = X(S.gX) + sway * k + S.gf * 4 * k * 1.16, hy = gy - (lift + 166 * 1.16) * k - r * 0.95 + 24 * k;
      if (t > 500) balloon(hx, hy, r, k);
    } else {
      const down = t > pop + 380; beast(down ? G({ st: 'down' }) : o, X(S.gX), gy, k, S.now, 300);
      if (down) { once('land', () => { sfx('thump'); S.shake = 12; if (S.gore) { blood.pool(S.gX, 30); blood.splatter(S.gX, 3, S.gf); } }); for (let i = 0; i < 3; i++) { const a = S.now / 240 + (i * Math.PI * 2) / 3; star(ctx, X(S.gX + S.gf * 70) + Math.cos(a) * 30 * k, gy - 60 * k + Math.sin(a) * 8 * k, 6 * k, '#ffe27a'); } }
      once('pop', () => { sfx('pop'); S.flash = S.now; S.shake = 18; burst('conf', S.gX, S.liftAtPop + 260, S.low ? 50 : 110, 0.7); });
      if (t < pop + 900) txt('POP!', X(S.gX), gy - (S.liftAtPop + 280) * k, 54 * k * 1.4, '#ff3d8b', -0.1, 1 - clamp((t - pop - 400) / 500));
    }
    if (t > 500) once('inflate', () => sfx('inflate'));
    if (t > 1500) once('kazoo', () => sfx('kazoo'));
    if (t > 3700) once('clap', () => sfx('applause'));
  }

  return {
    start({ kind, pX, gX, now, gore, reduced, low }) {
      parts.length = 0; said.clear();
      // a hard TV-style cut to centre stage, whatever corner the fight ended in (the player keeps their side)
      const side = Math.sign(gX - pX) || 1; pX = 500 - side * 120; gX = 500 + side * 120;
      S = { kind, pX, gX, now, t0: now, gore, reduced, low, gf: Math.sign(pX - gX) || 1, pf: Math.sign(gX - pX) || 1, shake: 0, flash: reduced ? 0 : now, liftAtPop: 0, lastT: now };
      if (reduced) { // one still frame: run the timeline to the still point silently (particles settle where they are)
        const end = STILL[kind]; for (let tt = 0; tt <= end; tt += 50) { S.now = now + tt; stepParts(0.05); }
        S.reducedT = end;
      }
    },
    stop() { S = null; parts.length = 0; },
    get active() { return !!S; },
    get frozenAt() { return S && S.reduced ? S.t0 : null; }, // reduced motion: everything (the player too) holds still
    get shake() { return S ? S.shake : 0; },
    get flash() { return S ? S.flash : 0; },
    get gx() { return S?.gX; }, get px() { return S?.pX; },
    draw(now, X, gy, k, w, h, drawP) {
      if (!S) return;
      const t = S.reduced ? S.reducedT : now - S.t0; S.now = S.reduced ? S.t0 + t : now;
      const dt = Math.min(0.05, (now - S.lastT) / 1000); S.lastT = now;
      if (!S.reduced) stepParts(dt);
      S.shake = S.reduced ? 0 : S.shake * 0.86; if (S.reduced) S.flash = 0;
      if (S.gore) { if (!S.reduced) blood.step(dt); blood.drawFloor(X, gy, k); }
      if (S.kind === 'show') drawShow(t, X, gy, k, w, h, drawP);
      else if (S.kind === 'hammer') drawHammer(t, X, gy, k, w, h, drawP);
      else drawBalloon(t, X, gy, k, w, h, drawP);
      drawParts(X, gy, k);
      if (S.gore) { blood.drawDrops(X, gy, k); blood.drawSheets(S.now); } // (reduced: S.now is fixed, so the still holds)
    },
  };
}

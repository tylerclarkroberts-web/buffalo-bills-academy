// Barn bouts (v35): the show. A stored bout (rounds the server already decided) becomes a staged replay: an
// entrance, per-species fighting styles, special-move charge-ups, effects, statuses and a finish. planBout() and
// locate() are pure (and tested); drawBout() paints one frame for a time. Nothing here can change a result.
import { BY_ID } from '../../../server/engine/creatures.js';
import { spriteCanvas, bugScale, SPRITE } from './sprite.js';

export const INTRO_MS = 2600, FINISH_MS = 1800;
const RECOVER = 440;

// How each bug fights. Cosmetic only: the server's rules give no flying or rolling bonus.
export const STYLES = {
  flyer: { name: 'Flier', approach: 560, sound: 'buzz' },
  hopper: { name: 'Hopper', approach: 520, sound: 'hop' },
  charger: { name: 'Charger', approach: 620, sound: 'dash' },
  striker: { name: 'Striker', approach: 480, sound: 'snap' },
  sprayer: { name: 'Sprayer', approach: 640, sound: 'spray' },
  roller: { name: 'Roller', approach: 580, sound: 'roll' },
  wriggler: { name: 'Wriggler', approach: 600, sound: 'wriggle' },
};
const BY_STYLE = {
  flyer: ['phrictus', 'pyrops', 'nemoptera', 'chrysochroa', 'mantispa', 'polyphylla'],
  hopper: ['bocydium', 'umbonia', 'graphocephala', 'sagra'],
  charger: ['ceroplophana', 'phanaeus', 'lamprima', 'macrodontia', 'onymacris', 'trachelophorus'],
  striker: ['pseudocreobotra', 'deroplatys', 'empusa', 'platymeris', 'acanthaspis', 'manticora', 'lethocerus'],
  sprayer: ['brachinus'],
  roller: ['eupholus', 'pachyrhynchus', 'sphaerocoris', 'helicopsyche'],
  wriggler: ['phrixothrix', 'heteropteryx'],
};
export const STYLE_OF = Object.fromEntries(Object.entries(BY_STYLE).flatMap(([style, ids]) => ids.map((id) => [id, style])));
export const styleOf = (species) => STYLE_OF[species] || 'charger';
export const EFFECT_COLOR = { strike: '#ffe27a', pierce: '#9ff3ff', guard: '#ffcf5a', venom: '#8cff5a', heal: '#7dffb0', weaken: '#c58bff' };

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function rng(seed) {
  let a = hash(seed);
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const fill = (line, bout) => line.replaceAll('{a}', bout.you.name).replaceAll('{b}', bout.them.name);
const pick = (list, seed) => list[hash(seed) % list.length];
const INTROS = ['{a} squares up to {b}.', '{a} and {b} circle the bottle caps.', 'Someone in the rafters bangs a spoon on a jar.',
  '{b} has said something about {a}\'s antennae.', 'The barn goes quiet. A chicken leaves.', '{a} touches the twine for luck. The twine does nothing.'];
const VERDICTS = {
  won: ['{a} wins! A ribbon for the stall.', '{a} wins and takes a slow lap of the bottle caps.', '{a} wins. {b} is suddenly very interested in the ceiling.'],
  lost: ['{b} wins. {a} will sulk about it.', '{b} wins. {a} says it slipped on some straw.', '{b} wins. {a} demands a rematch from the floor.'],
  draw: ['A draw. Both of them claim victory.', 'A draw. Nobody is happy. Someone is writing to the Foreman.'],
};
const SIGNS = ['NO REFUNDS', 'DO NOT FEED THE FIGHTERS', 'NOT LIABLE FOR STINGS', 'NO FLYING OVER THE ROPES', 'RING: 4 BOTTLE CAPS'];
const seedOf = (bout) => bout.id || bout.seed || bout.at || 'bout';
export const introLine = (bout) => fill(pick(INTROS, `${seedOf(bout)}:intro`), bout);
export const verdictLine = (bout) => fill(pick(VERDICTS[bout.result] || VERDICTS.draw, `${seedOf(bout)}:end`), bout);

/** Timeline: one beat per round, with the statuses (guard, poison, weaken) the replay shows before and after it lands. */
export function planBout(bout) {
  const fighters = [bout.you, bout.them], rounds = bout.rounds || [];
  const status = [{ guard: false, poison: 0, weak: false }, { guard: false, poison: 0, weak: false }];
  const copy = () => status.map((s) => ({ ...s }));
  const beats = []; let at = INTRO_MS;
  rounds.forEach((r, i) => {
    const special = r.type === 'move' && !!r.moveId && r.moveId !== 'basic';
    const kind = r.type === 'venom' ? 'tick' : r.effect === 'heal' ? 'heal' : 'attack';
    const charge = special ? (r.tier >= 4 ? 950 : 700) : 0;
    const impactAt = kind === 'tick' ? 220 : charge + (kind === 'heal' ? 320 : STYLES[styleOf(fighters[r.by]?.species)].approach);
    const stop = kind !== 'attack' || !r.hit || !(r.dmg > 0) ? 0 : r.critical ? 280 : special ? 120 : 70;
    const dur = impactAt + stop + (kind === 'tick' ? 520 : RECOVER + 160) + (r.critical ? 650 : 0);
    const before = copy(), me = r.by, foe = 1 - r.by;
    if (kind === 'tick') status[foe].poison = Math.max(0, status[foe].poison - 1); // a venom round's `by` is the poisoner
    else if (kind === 'attack') {
      status[foe].guard = false; status[me].weak = false; // both are spent by any attack, hit or miss
      if (r.effect === 'guard') status[me].guard = true;
      if (r.hit && r.effect === 'venom') status[foe].poison = 2;
      if (r.hit && r.effect === 'weaken') status[foe].weak = true;
    }
    beats.push({ i, at, dur, charge, impactAt, stop, special, kind, r, before, after: copy() });
    at += dur;
  });
  const last = rounds[rounds.length - 1];
  return { beats, intro: INTRO_MS, end: at, total: at + FINISH_MS, seed: seedOf(bout), ending: last && last.hp.some((h) => h <= 0) ? 'ko' : 'time' };
}

/** Where the replay is at time t: the intro, a beat (charging, moving in, landed), the finish, or done. */
export function locate(plan, t) {
  if (t < plan.intro) return { i: -1, phase: 'intro', lt: t };
  for (const b of plan.beats) if (t < b.at + b.dur) { const lt = t - b.at; return { i: b.i, phase: lt < b.charge ? 'charge' : lt < b.impactAt ? 'act' : 'land', lt }; }
  const lt = t - plan.end;
  return { i: plan.beats.length, phase: lt < FINISH_MS ? 'finish' : 'done', lt };
}

// ---------- drawing ----------
const ease = { in: (k) => k * k, out: (k) => 1 - (1 - k) ** 2, inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2), expo: (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)) };
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const tints = new WeakMap();
function tinted(img, color) {
  let m = tints.get(img); if (!m) tints.set(img, (m = new Map()));
  if (!m.has(color)) { const c = makeCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); m.set(color, c); }
  return m.get(color);
}

export function layout(W, H) {
  const tall = H > W * 1.1;
  return { tall, home: tall ? [[W * 0.33, H * 0.72], [W * 0.67, H * 0.3]] : [[W * 0.26, H * 0.57], [W * 0.74, H * 0.57]],
    size: tall ? Math.min(W * 0.6, H * 0.34) : Math.min(H * 0.64, W * 0.3) };
}

function idle(p, style, t, size, still) {
  if (style === 'flyer') { p.alt = size * (0.2 + (still ? 0 : Math.sin(t / 140) * 0.025)); return; }
  if (still) return;
  if (style === 'hopper') { const k = (t % 1700) / 1700; if (k < 0.16) p.alt = Math.sin((k / 0.16) * Math.PI) * size * 0.07; }
  else if (style === 'wriggler') p.rot += Math.sin(t / 300) * 0.07;
  else if (style === 'striker') p.rot += Math.sin(t / 650) * 0.05;
  else p.sy *= 1 + Math.sin(t / 420) * 0.018;
}

function enter(p, style, k, dx, dy, size) {
  const e = clamp01(k / 850), off = 1 - ease.out(e);
  p.x -= dx * off; p.y -= dy * off;
  if (style === 'flyer') p.alt += off * size * 0.5;
  else if (style === 'hopper') p.alt += Math.abs(Math.sin(e * Math.PI * 3)) * off * size * 0.35;
  else if (style === 'roller') p.spin = off * Math.PI * 4;
  else p.rot += Math.sin(e * Math.PI * 9) * 0.14 * off;
}

/** The attacker's path for one style: f = how far toward contact (negative winds up), alt = height (x size). */
function motion(style, lt, A, I, R) {
  const app = lt < I ? clamp01((lt - A) / (I - A)) : 1, back = clamp01((lt - R) / RECOVER), out = lt >= R;
  switch (style) {
    case 'flyer': { const h = (k) => (0.2 + 0.34 * Math.sin(Math.PI * k * 0.65)) * (1 - 0.85 * k);
      return out ? { f: 1 - ease.out(back), alt: h(1) + (0.2 - h(1)) * ease.out(back) } : { f: ease.in(app), alt: h(app) }; }
    case 'hopper': return out ? { f: 1 - back, alt: 0.18 * Math.sin(Math.PI * back) } : { f: app, alt: 0.42 * Math.sin(Math.PI * app), sy: app > 0.92 ? 0.84 : 1 };
    case 'charger': return out ? { f: 1 - ease.out(back) } : app < 0.35 ? { f: -0.16 * ease.out(app / 0.35), sy: 0.9 } : { f: -0.16 + 1.16 * ease.in((app - 0.35) / 0.65), sy: 1.08 };
    case 'striker': return out ? { f: 1 - ease.inOut(back) } : app < 0.55 ? { f: -0.07 * (app / 0.55), sy: 0.9 } : { f: ease.expo((app - 0.55) / 0.45), sy: 1.15 };
    case 'sprayer': return { f: lt >= I && !out ? -0.05 : 0, turn: Math.PI * (out ? 1 - ease.inOut(back) : ease.inOut(clamp01(app / 0.45))) };
    case 'roller': return out ? { f: 1 - ease.out(back), spin: Math.PI * (4 + 2 * back), sx: 0.86 + 0.14 * back, sy: 0.86 + 0.14 * back } : { f: ease.in(app), spin: app * Math.PI * 4, sx: 0.86, sy: 0.86 };
    case 'wriggler': return out ? { f: 1 - ease.inOut(back), wig: Math.sin(back * Math.PI * 3) * 0.1 * (1 - back) } : { f: ease.inOut(app), sy: 1 + 0.28 * Math.sin(Math.PI * app), wig: Math.sin(app * Math.PI * 5) * 0.2 };
    default: return { f: 0 };
  }
}

function spawn(fx, n, make) { for (let k = 0; k < n; k++) fx.parts.push({ age: 0, vx: 0, vy: 0, g: 0, drag: 1, ...make(k) }); }
const R = Math.random;

function impact(fx, beat, P, ST, size, u, tx, ty) {
  const r = beat.r, a = r.by, d = 1 - a, src = P[a], tgt = P[d], color = EFFECT_COLOR[r.effect] || EFFECT_COLOR.strike;
  const font = Math.round(size * (r.critical ? 0.24 : 0.16));
  const text = (txt, c, at, big = font) => spawn(fx, 1, () => ({ kind: 'text', text: txt, color: c, x: at.x, y: at.y - at.alt - size * 0.32, vy: -size * 0.5, life: 1000, size: big }));
  if (beat.kind === 'tick') { // venom damage on the poisoned side
    spawn(fx, 12, () => ({ kind: 'px', color: R() < 0.5 ? '#8cff5a' : '#3c9a2a', x: tgt.x + (R() - 0.5) * size * 0.4, y: tgt.y - tgt.alt, vx: (R() - 0.5) * size, vy: -size * (0.6 + R()), g: size * 2.4, life: 600, size: u * 2 }));
    text(`-${r.dmg}`, '#8cff5a', tgt); return;
  }
  if (beat.kind === 'heal') {
    spawn(fx, 14, () => ({ kind: 'plus', color: R() < 0.6 ? '#7dffb0' : '#ffffff', x: src.x + (R() - 0.5) * size * 0.6, y: src.y - src.alt + (R() - 0.2) * size * 0.3, vy: -size * (0.4 + R() * 0.4), life: 900 + R() * 300, size: u * (1 + (R() * 2 | 0)) }));
    spawn(fx, 1, () => ({ kind: 'ring', color: '#7dffb0', x: src.x, y: src.y - src.alt, life: 600, size: size * 0.6 }));
    text(`+${r.healed}`, '#7dffb0', src); return;
  }
  if (!r.hit) {
    text('MISS', '#d8d0c8', tgt, Math.round(size * 0.14));
    spawn(fx, 8, () => ({ kind: 'px', color: '#a08060', x: tgt.x, y: tgt.y, vx: (R() - 0.5) * size * 1.2, vy: -R() * size * 0.3, drag: 0.9, life: 450, size: u * 2 }));
    return;
  }
  const hx = ST[a] === 'sprayer' ? tgt.x : tgt.x - tx * size * 0.24, hy = (ST[a] === 'sprayer' ? tgt.y : tgt.y - ty * size * 0.24) - tgt.alt;
  const n = 10 + r.tier * 5 + (r.critical ? 18 : 0);
  spawn(fx, n, () => { const ang = R() * Math.PI * 2, v = size * (0.8 + R() * 1.8) * (r.critical ? 1.5 : 1);
    return { kind: 'px', color: R() < 0.35 ? '#ffffff' : r.critical ? (R() < 0.5 ? '#ff5a3a' : '#ffd040') : color, x: hx, y: hy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 0.86, life: 350 + R() * 350, size: u * (1 + (R() * 2 | 0)) }; });
  if (ST[a] === 'striker') spawn(fx, 1, () => ({ kind: 'slash', color, x: hx, y: hy, rot: Math.atan2(ty, tx) + 0.9, life: 380, size: size * 0.5 }));
  else spawn(fx, 1, () => ({ kind: 'star', color, x: hx, y: hy, life: 420, size: size * (0.18 + r.tier * 0.05) * (r.critical ? 1.6 : 1) }));
  if (r.effect === 'pierce') spawn(fx, 1, () => ({ kind: 'lance', color, x: hx - tx * size * 0.9, y: hy - ty * size * 0.9, x1: hx + tx * size * 1.3, y1: hy + ty * size * 1.3, life: 380, size: u * 4 }));
  if (r.effect === 'venom') spawn(fx, 14, () => ({ kind: 'px', color: R() < 0.5 ? '#8cff5a' : '#3c9a2a', x: hx, y: hy, vx: (R() - 0.5) * size * 1.4, vy: -size * (0.4 + R()), g: size * 3, life: 700, size: u * 2 }));
  if (r.effect === 'weaken') spawn(fx, 1, () => ({ kind: 'spiral', color, x: tgt.x, y: tgt.y - tgt.alt - size * 0.1, life: 900, size: size * 0.32 }));
  if (r.effect === 'guard') spawn(fx, 1, () => ({ kind: 'ring', color, x: src.x, y: src.y - src.alt, life: 520, size: size * 0.65 }));
  text(String(r.dmg), r.critical ? '#ff5a3a' : '#fff4c8', tgt);
}

function drawParts(x, fx, dt, u) {
  fx.parts = fx.parts.filter((p) => (p.age += dt) < p.life);
  for (const p of fx.parts) {
    const k = p.age / p.life, damp = p.drag ** (dt / 16);
    p.vy += (p.g * dt) / 1000; p.vx *= damp; p.vy *= damp; p.x += (p.vx * dt) / 1000; p.y += (p.vy * dt) / 1000;
    x.globalAlpha = p.kind === 'text' ? clamp01((1 - k) * 2.5) : 1 - k; x.fillStyle = x.strokeStyle = p.color;
    switch (p.kind) {
      case 'px': x.fillRect(Math.round(p.x / u) * u, Math.round(p.y / u) * u, p.size, p.size); break;
      case 'plus': { const s = p.size, cx = Math.round(p.x / u) * u, cy = Math.round(p.y / u) * u; x.fillRect(cx - s, cy - s * 3, s * 2, s * 6); x.fillRect(cx - s * 3, cy - s, s * 6, s * 2); break; }
      case 'text': { const pop = k < 0.12 ? 1 + (1 - k / 0.12) * 0.7 : 1; x.font = `${Math.round(p.size * pop)}px Rye, Georgia, serif`; x.textAlign = 'center'; x.lineJoin = 'round';
        x.lineWidth = Math.max(3, p.size * 0.16); x.strokeStyle = '#1a0a00'; x.strokeText(p.text, p.x, p.y); x.fillText(p.text, p.x, p.y); p.vy *= 0.9; break; }
      case 'ring': x.lineWidth = u * 2; x.beginPath(); x.arc(p.x, p.y, p.size * (0.3 + ease.out(k) * 0.9), 0, Math.PI * 2); x.stroke(); break;
      case 'star': { const rr = p.size * (0.7 + (1 - k) * 0.5); x.beginPath(); for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2 + k * 0.6, q = i % 2 ? rr * 0.45 : rr; x.lineTo(p.x + Math.cos(ang) * q, p.y + Math.sin(ang) * q); }
        x.closePath(); x.fill(); x.lineWidth = u; x.strokeStyle = '#3a1a00'; x.stroke(); break; }
      case 'slash': x.lineCap = 'round'; for (let i = -1; i <= 1; i++) { const o = i * p.size * 0.28, c = Math.cos(p.rot), s = Math.sin(p.rot), len = p.size * (0.4 + ease.out(clamp01(k * 3)) * 0.8);
        x.lineWidth = u * (i ? 2 : 3); x.strokeStyle = i ? p.color : '#ffffff'; x.beginPath(); x.moveTo(p.x - c * len / 2 - s * o, p.y - s * len / 2 + c * o); x.lineTo(p.x + c * len / 2 - s * o, p.y + s * len / 2 + c * o); x.stroke(); } break;
      case 'lance': x.lineCap = 'round'; x.lineWidth = p.size * (1 - k) + 1; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x1, p.y1); x.stroke(); x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(1, p.size * 0.4 * (1 - k)); x.stroke(); break;
      case 'spiral': x.lineWidth = u * 1.5; x.beginPath(); for (let i = 0; i < 40; i++) { const ang = i * 0.45 + k * 8, rr = (i / 40) * p.size; x.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.5); } x.stroke(); break;
      default: break;
    }
  }
  x.globalAlpha = 1;
}

/** A bug-scale ring on barn boards: bottle-cap corner posts, twine ropes, a chalk circle, straw and a hand-lettered sign. */
function arena(fx, W, H, seed) {
  if (fx.arena && fx.arena.W === W && fx.arena.H === H) return fx.arena.c;
  const c = makeCanvas(W, H), g = c.getContext('2d'), rand = rng(`${seed}:arena`), u = Math.max(2, Math.round(Math.min(W, H) / 110));
  const plank = u * 13;
  for (let y = 0, k = 0; y < H; y += plank, k++) {
    g.fillStyle = ['#5e3d22', '#664429', '#59391f'][k % 3]; g.fillRect(0, y, W, plank);
    g.fillStyle = 'rgba(0,0,0,.14)'; for (let i = 0; i < W / (u * 18); i++) g.fillRect(rand() * W, y + u * (2 + Math.floor(rand() * 9)), u * (4 + rand() * 12), u);
    g.fillStyle = '#2e1c0e'; g.fillRect(0, y, W, u);
    for (let xx = rand() * W * 0.5; xx < W; xx += W * (0.3 + rand() * 0.45)) { g.fillStyle = '#2e1c0e'; g.fillRect(xx | 0, y, u, plank); g.fillStyle = '#20140a'; g.fillRect((xx | 0) + u * 3, y + u * 3, u, u); g.fillRect((xx | 0) - u * 3, y + plank - u * 4, u, u); }
  }
  for (let i = 0; i < 90; i++) { const sx = rand() * W, sy = rand() * H, len = u * (3 + rand() * 7), ang = rand() * Math.PI;
    g.strokeStyle = rand() < 0.5 ? '#d8b860' : '#a8843a'; g.lineWidth = u; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len); g.stroke(); }
  const L = layout(W, H), cx = (L.home[0][0] + L.home[1][0]) / 2, cy = (L.home[0][1] + L.home[1][1]) / 2;
  g.setLineDash([u * 4, u * 3]); g.strokeStyle = 'rgba(240,232,210,.3)'; g.lineWidth = u * 1.5; g.beginPath();
  g.ellipse(cx, cy, L.tall ? W * 0.42 : W * 0.38, L.tall ? H * 0.4 : H * 0.36, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  const ix = W * 0.05, top = H * 0.09, bot = H * 0.95, caps = [[ix, top], [W - ix, top], [W - ix, bot], [ix, bot]], cr = u * 7;
  const twine = (a, b, sag) => { for (const [off, col] of [[u, '#3a2410'], [0, '#c8a870']]) { g.strokeStyle = col; g.lineWidth = u * 1.5; g.beginPath(); g.moveTo(a[0], a[1] + off); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag + off, b[0], b[1] + off); g.stroke(); } };
  twine(caps[0], caps[1], u * 4); twine(caps[1], caps[2], 0); twine(caps[3], caps[0], 0); twine(caps[3], caps[2], u * 4);
  const capColors = ['#c8202a', '#2a5ac8', '#d8d8d8', '#2a9a4a', '#e0b030'], dress = rng(`${seed}:dress`); // same caps and sign at any size
  caps.forEach(([px, py]) => {
    const col = capColors[Math.floor(dress() * capColors.length)];
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(px + u * 2, py + u * 3, cr * 1.15, cr * 0.9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); for (let i = 0; i < 42; i++) { const ang = (i / 42) * Math.PI * 2, q = i % 2 ? cr : cr * 1.16; g.lineTo(px + Math.cos(ang) * q, py + Math.sin(ang) * q); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(px, py, cr * 0.72, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(px + u * 0.6, py + u * 0.6, cr * 0.62, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(px - cr * 0.4, py - cr * 0.45, u * 1.5, u * 1.5);
  });
  const sign = SIGNS[Math.floor(dress() * SIGNS.length)], fs = Math.max(9, u * 4.2);
  g.font = `${fs}px Rye, Georgia, serif`; const sw = g.measureText(sign).width + u * 6, sx = W / 2 - sw / 2, sy = top + u * 3;
  g.save(); g.translate(W / 2, sy); g.rotate((dress() - 0.5) * 0.06); g.translate(-W / 2, -sy);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(sx + u, sy + u, sw, fs + u * 4); g.fillStyle = '#efe2c0'; g.fillRect(sx, sy, sw, fs + u * 4);
  g.fillStyle = '#7a2a1a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sign, W / 2, sy + (fs + u * 4) / 2 + u * 0.4); g.restore();
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  fx.arena = { W, H, c };
  return c;
}

function drawFighter(x, f, p, size, face) {
  const bug = BY_ID[f?.species]; if (!bug) return;
  const img = spriteCanvas(bug, f.style, f.level), px = Math.max(1, Math.floor(size / SPRITE));
  const s = px * SPRITE * bugScale(f.level) * (1 + (p.alt / size) * 0.25);
  x.save(); x.translate(p.x, p.y - p.alt); x.rotate(face + p.rot + (p.turn || 0) + (p.spin || 0)); x.scale(p.sx, p.sy); x.imageSmoothingEnabled = false;
  x.drawImage(p.flash ? tinted(img, p.flash) : img, -s / 2, -s / 2, s, s);
  if (p.tint) { x.globalAlpha = p.tint[1]; x.drawImage(tinted(img, p.tint[0]), -s / 2, -s / 2, s, s); }
  x.restore();
}

/** Paints the ring at time t. `fx` carries particles and caches between frames; pass a fresh object per bout. */
export function drawBout(x, { W, H, bout, plan, t, reduced, fx }) {
  const L = layout(W, H), size = L.size, home = L.home, u = Math.max(1, Math.floor(size / SPRITE));
  const loc = locate(plan, t), beat = loc.i >= 0 && loc.i < plan.beats.length ? plan.beats[loc.i] : null, lt = loc.lt;
  const F = [bout.you, bout.them], ST = F.map((f) => styleOf(f?.species));
  const dt = fx.last == null || t < fx.last ? 16 : Math.min(80, t - fx.last); fx.last = t;
  const vx = home[1][0] - home[0][0], vy = home[1][1] - home[0][1], dist = Math.hypot(vx, vy), ux = vx / dist, uy = vy / dist;
  const toward = (s) => (s === 0 ? [ux, uy] : [-ux, -uy]);
  const face = [Math.atan2(uy, ux) + Math.PI / 2, Math.atan2(-uy, -ux) + Math.PI / 2];
  const P = [0, 1].map((s) => ({ x: home[s][0], y: home[s][1], alt: 0, rot: 0, sx: 1, sy: 1, flash: null, tint: null, aura: 0 }));
  P.forEach((p, s) => idle(p, ST[s], t + s * 640, size, reduced));
  if (loc.phase === 'intro' && !reduced) P.forEach((p, s) => { const [tx, ty] = toward(s); enter(p, ST[s], lt - 300 - s * 350, tx * dist, ty * dist, size); });

  let shake = 0, flash = 0, dim = 0, attacker = -1;
  if (beat && !reduced) {
    const r = beat.r, A = beat.charge, I = beat.impactAt, Rr = I + beat.stop;
    if (beat.kind === 'tick') { const q = P[1 - r.by]; if (lt < 420) { q.x += Math.sin(lt / 18) * size * 0.02; q.flash = lt < 260 && Math.floor(lt / 60) % 2 ? '#8cff5a' : null; } }
    else {
      const a = r.by, d = 1 - a, p = P[a], q = P[d], [tx, ty] = toward(a); attacker = a;
      if (lt < A) { p.sy *= 0.92; p.x += (R() - 0.5) * size * 0.012; p.aura = clamp01(lt / 220); dim = 0.5 * clamp01(lt / 160) * clamp01((A - lt) / 160 + 0.2); }
      else if (beat.kind === 'heal') { const k = clamp01((lt - A) / (I - A + 380)); p.alt += Math.sin(Math.PI * k) * size * 0.12; if (lt >= I && lt < I + 320) p.flash = Math.floor((lt - I) / 70) % 2 ? null : '#7dffb0'; }
      else {
        const m = motion(ST[a], lt, A, I, Rr), reach = Math.max(0, dist - size * 0.62);
        p.x += tx * reach * m.f; p.y += ty * reach * m.f; if (m.alt != null) p.alt = m.alt * size;
        p.spin = m.spin || 0; p.turn = m.turn || 0; p.sx *= m.sx || 1; p.sy *= m.sy || 1; p.rot += m.wig || 0;
        if (lt >= A && lt < I) { const app = (lt - A) / (I - A);
          if (ST[a] === 'charger' && app > 0.35) spawn(fx, 1, () => ({ kind: 'px', color: '#b89868', x: p.x - tx * size * 0.3, y: p.y + (R() - 0.5) * size * 0.3, vx: -tx * size * 0.4, vy: -size * 0.2 * R(), drag: 0.9, life: 400, size: u * 2 }));
          if (ST[a] === 'sprayer' && app > 0.45) spawn(fx, 4, () => ({ kind: 'px', color: R() < 0.4 ? '#fff4d0' : R() < 0.6 ? '#ffffff' : '#ffb040', x: p.x - tx * size * 0.2, y: p.y - ty * size * 0.2, vx: tx * dist * 2.4 + (R() - 0.5) * size * 0.8, vy: ty * dist * 2.4 + (R() - 0.5) * size * 0.8, drag: 0.97, life: 400, size: u * (3 + (R() * 3 | 0)) }));
          if (ST[a] === 'flyer' && R() < dt / 60) spawn(fx, 1, () => ({ kind: 'px', color: 'rgba(255,255,255,.5)', x: p.x, y: p.y - p.alt, life: 260, size: u }));
        }
        if (!r.hit) { const k = clamp01((lt - (I - 180)) / 460), side = beat.i % 2 ? 1 : -1, o = Math.sin(Math.PI * k) * size * 0.42 * side; q.x += -ty * o; q.y += tx * o; }
        else if (r.dmg > 0 && lt >= I) {
          if (lt < Rr + 140) q.flash = Math.floor((lt - I) / 55) % 2 ? null : '#ffffff';
          if (lt < Rr) q.x += (R() - 0.5) * size * 0.03;
          const k = clamp01((lt - Rr) / 520), push = size * (0.08 + r.tier * 0.025) * (r.critical ? 2 : 1) * ease.out(clamp01(k * 4)) * (1 - ease.inOut(k));
          q.x += tx * push; q.y += ty * push;
          const since = lt - I; if (since < beat.stop + 320) shake = (r.critical ? 22 : beat.special ? 6 + r.tier * 3 : 4) * (u / 3) * (1 - since / (beat.stop + 320));
          if (r.critical && since < 220) flash = 0.75 * (1 - since / 220); else if (r.tier >= 4 && since < 160) flash = 0.3 * (1 - since / 160);
        }
      }
    }
    if (lt >= I && !fx.fired.has(beat.i)) { fx.fired.add(beat.i); impact(fx, beat, P, ST, size, u, ...toward(beat.r.by)); }
  }

  const ended = loc.phase === 'finish' || loc.phase === 'done';
  const losers = !ended ? [] : bout.result === 'won' ? [1] : bout.result === 'lost' ? [0] : [];
  const dizzy = !ended ? [] : bout.result === 'draw' ? [0, 1] : losers;
  if (ended) {
    const q = reduced ? 1 : ease.out(clamp01((loc.phase === 'done' ? FINISH_MS : lt) / 700)), tt = reduced ? 0 : t;
    P.forEach((p, s) => {
      const [tx, ty] = toward(s);
      if (losers.includes(s)) { p.rot += Math.PI * 0.85 * q; p.x -= tx * size * 0.16 * q; p.y -= ty * size * 0.16 * q; p.alt = 0; p.tint = ['#000000', 0.35 * q]; }
      else if (bout.result !== 'draw' && !reduced) { if (ST[s] === 'flyer') { p.x += Math.cos(tt / 280) * size * 0.14; p.y += Math.sin(tt / 280) * size * 0.07; p.alt = size * 0.3; } else p.alt += Math.abs(Math.sin(tt / 170)) * size * 0.08; }
    });
  }

  const status = loc.phase === 'intro' || ended ? null : beat ? (lt >= beat.impactAt ? beat.after : beat.before) : null;
  if (status && !reduced) P.forEach((p, s) => { if (status[s].poison) { p.tint ||= ['#5aff3a', 0.22 + 0.12 * Math.sin(t / 180)]; if (R() < dt / 260) spawn(fx, 1, () => ({ kind: 'px', color: '#8cff5a', x: p.x + (R() - 0.5) * size * 0.4, y: p.y - p.alt, vy: -size * 0.35, life: 700, size: u * 2 })); } });

  x.save();
  if (shake) x.translate((R() - 0.5) * shake * 2, (R() - 0.5) * shake * 2);
  x.fillStyle = '#20120a'; x.fillRect(-40, -40, W + 80, H + 80);
  x.drawImage(arena(fx, W, H, plan.seed), 0, 0);
  P.forEach((p) => { const k = clamp01(p.alt / size); x.fillStyle = `rgba(0,0,0,${0.38 * (1 - k * 0.55)})`; x.beginPath(); x.ellipse(p.x, p.y + size * 0.04, size * 0.34 * (1 - k * 0.35), size * 0.13 * (1 - k * 0.35), 0, 0, Math.PI * 2); x.fill(); });
  const order = [0, 1].sort((s0, s1) => (s0 === attacker ? 1 : s1 === attacker ? -1 : P[s0].y - P[s1].y));
  order.forEach((s) => {
    if (s === attacker && dim) { x.fillStyle = `rgba(8,4,2,${dim})`; x.fillRect(-40, -40, W + 80, H + 80); }
    const p = P[s];
    if (p.aura) { const col = EFFECT_COLOR[beat.r.effect] || '#ffe27a', rr = size * (0.62 + 0.06 * Math.sin(t / 60)), gl = x.createRadialGradient(p.x, p.y - p.alt, rr * 0.2, p.x, p.y - p.alt, rr);
      gl.addColorStop(0, `${col}aa`); gl.addColorStop(1, `${col}00`); x.globalAlpha = p.aura; x.fillStyle = gl; x.beginPath(); x.arc(p.x, p.y - p.alt, rr, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      if (R() < dt / 22) { const ang = R() * Math.PI * 2, d0 = size * 0.85; spawn(fx, 1, () => ({ kind: 'px', color: R() < 0.5 ? col : '#ffffff', x: p.x + Math.cos(ang) * d0, y: p.y - p.alt + Math.sin(ang) * d0, vx: -Math.cos(ang) * d0 * 3, vy: -Math.sin(ang) * d0 * 3, life: 300, size: u * 2 })); } }
    drawFighter(x, F[s], p, size, face[s]);
    if (status?.[s].guard && !reduced) { const rr = size * 0.5, a0 = t / 900; x.strokeStyle = '#ffcf5a'; x.globalAlpha = 0.55 + 0.2 * Math.sin(t / 150); x.lineWidth = u * 2; x.beginPath();
      for (let i = 0; i <= 6; i++) { const ang = a0 + (i / 6) * Math.PI * 2; x.lineTo(p.x + Math.cos(ang) * rr, p.y - p.alt + Math.sin(ang) * rr); } x.stroke(); x.globalAlpha = 0.08; x.fillStyle = '#ffcf5a'; x.fill(); x.globalAlpha = 1; }
    if (status?.[s].weak && !reduced) { const by = p.y - p.alt - size * 0.48 + Math.sin(t / 220) * u * 2; x.fillStyle = '#c58bff';
      for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { x.fillRect(p.x - u * (4 - i) - u, by + k * u * 4 + i * u, u * 2, u); x.fillRect(p.x + u * (4 - i) - u, by + k * u * 4 + i * u, u * 2, u); } }
    if (dizzy.includes(s)) { const cx = p.x, cy = p.y - size * 0.32; for (let i = 0; i < 3; i++) { const ang = (reduced ? 0 : t / 260) + (i / 3) * Math.PI * 2, sx = cx + Math.cos(ang) * size * 0.22, sy = cy + Math.sin(ang) * size * 0.08;
      x.fillStyle = '#ffe27a'; x.fillRect(sx - u, sy - u * 3, u * 2, u * 6); x.fillRect(sx - u * 3, sy - u, u * 6, u * 2); } }
  });
  if (!reduced) drawParts(x, fx, dt, u);
  x.restore();
  if (flash) { x.fillStyle = `rgba(255,250,235,${flash})`; x.fillRect(0, 0, W, H); }
}

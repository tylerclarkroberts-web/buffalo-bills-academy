// Foff's Bachelor Party: everything on the canvas. Original pixel art drawn from rectangles, no image files.
// The view is 432x704 units, backed by twice that many pixels so the people and the ball can be drawn in
// half-units; holes are painted once each at four pixels a yard, lit from the top left so the hills show, and
// then blitted through the camera.
import { dist, lieAt, slopeAt } from './golf-sim.js';

export const W = 432, H = 704;
const PPY = 4, TREE = 28; // texture pixels per yard, and per treetop
const edges = (hole) => { const [x0, y0, x1, y1] = hole.bounds; return [x0 - 16, y0 - 16, x1 + 16, y1 + 16]; }; // the course, plus a border of out-of-bounds forest
const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const dim = (c, f = 0.78) => `rgb(${rgb(c).map((v) => Math.round(v * f)).join(',')})`;
const PAL = Object.fromEntries(Object.entries({
  ob: ['#163a22', '#1d4a2a', '#0f2817', '#0b2013'], trees: ['#1f5f2e', '#2e7e39', '#144221', '#0f3018'], // top, sunlit, rim, floor
  rough: ['#3a8a3f', '#2f7636', '#35803a'], fairway: ['#5cb54c', '#52a944'], tee: ['#74cc5e', '#6ac256'],
  green: ['#8adc62', '#7fd058'], sand: ['#ecdc9c', '#d8c480'], water: ['#3f8fd0', '#3783c2', '#8cc8f0'],
}).map(([k, v]) => [k, v.map(rgb)]));
export const FOREST = '#0b2013';

function shade(lie, x, y, wy) {
  const p = PAL[lie];
  if (lie === 'ob' || lie === 'trees') { // round treetops, every other column half a tree lower
    const cx = Math.floor(x / TREE), sy = y + (cx & 1) * TREE / 2, cy = Math.floor(sy / TREE);
    const dx = x - (cx + 0.5) * TREE - (hash(cx, cy) - 0.5) * 8, dy = sy - (cy + 0.5) * TREE - (hash(cy, cx) - 0.5) * 8, d = Math.hypot(dx, dy);
    return d > TREE * 0.5 ? p[3] : d > TREE * 0.41 ? p[2] : dx + dy < -5 ? p[1] : p[0];
  }
  if (lie === 'fairway') return p[Math.floor(wy / 12) & 1];                          // mowing stripes
  if (lie === 'green') return p[(Math.floor(x / 10) + Math.floor(y / 10)) & 1];
  if (lie === 'water') return hash(x >> 3, y >> 1) < 0.05 ? p[2] : p[(y >> 1) & 1];
  if (lie === 'rough') return hash(x >> 1, y >> 1) < 0.13 ? p[1] : Math.sin(x / 37) + Math.sin(y / 29 + x / 61) > 1.1 ? p[2] : p[0]; // tufts, and patches left to grow
  return hash(x >> 1, y >> 1) < 0.13 ? p[1] : p[0];                                  // grains
}
/** How bright the ground is at p: slopes facing the top-left sun are lighter, in steps so it stays pixel art. */
function lit(hole, p) {
  const [gx, gy] = slopeAt(hole, p), d = (gx - gy) * 0.71;
  return Math.max(0.6, 1 + Math.round(Math.sign(d) * Math.sqrt(Math.abs(d)) * 22) / 20);
}

/** Paint a hole to an offscreen canvas. */
export function paintHole(hole) {
  const [x0, y0, x1, y1] = edges(hole), w = Math.round((x1 - x0) * PPY), h = Math.round((y1 - y0) * PPY);
  const tex = document.createElement('canvas'); tex.width = w; tex.height = h;
  const c = tex.getContext('2d'), img = c.createImageData(w, h), lw = Math.ceil(w / 2), lh = Math.ceil(h / 2), lies = new Array(lw * lh);
  const at = (x, y) => [x0 + (x + 0.5) / PPY, y1 - (y + 0.5) / PPY];
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) lies[y * lw + x] = lieAt(hole, at(x * 2 + 0.5, y * 2 + 0.5)); // what is underfoot, every half yard
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, li = (y >> 1) * lw + (x >> 1), lie = lies[li], [r, g, b] = shade(lie, x, y, y1 - y / PPY);
    const edge = ((x >> 1) + 1 < lw && lies[li + 1] !== lie) || ((y >> 1) + 1 < lh && lies[li + lw] !== lie); // a dark line where the grass changes
    const k = (edge ? 0.72 : 1) * (lie === 'ob' || lie === 'water' ? 1 : lit(hole, at(x & ~1, y & ~1)));
    img.data.set([r * k, g * k, b * k, 255], i * 4); // the array clamps anything over 255
  }
  c.putImageData(img, 0, 0);
  return tex;
}

/** A camera that keeps two points (the ball and where it is going) in view. */
export function camFor(a, b) {
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, s: Math.min(18, H * 0.56 / Math.max(14, dist(a, b))) };
}
export const toScreen = (cam, p) => [Math.round(W / 2 + (p[0] - cam.x) * cam.s), Math.round(H / 2 - (p[1] - cam.y) * cam.s)];
export const toWorld = (cam, sx, sy) => [cam.x + (sx - W / 2) / cam.s, cam.y - (sy - H / 2) / cam.s];

export function drawHole(ctx, tex, hole, cam, t, calm) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = FOREST; ctx.fillRect(0, 0, W, H);
  const [x0, y0, x1, y1] = edges(hole), [dx, dy] = toScreen(cam, [x0, y1]);
  ctx.drawImage(tex, dx, dy, Math.round((x1 - x0) * cam.s), Math.round((y1 - y0) * cam.s));
  if (cam.s > 8) { // close enough to putt: marks that run downhill, faster where it is steeper
    const g = hole.green;
    for (let wy = g.c[1] - g.ry + 2; wy < g.c[1] + g.ry; wy += 4) for (let wx = g.c[0] - g.rx + 2; wx < g.c[0] + g.rx; wx += 4) {
      const [gx, gy] = slopeAt(hole, [wx, wy]), steep = Math.hypot(gx, gy);
      if (steep < 0.004 || lieAt(hole, [wx, wy]) !== 'green') continue;
      const [px, py] = toScreen(cam, [wx, wy]), slide = calm ? 0 : t * steep * 500;
      for (let k = 0; k < 3; k++) {
        const off = (slide + k * 6) % 18, big = off > 12 ? 5 : 3;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + off / 36})`;
        ctx.fillRect(Math.round(px - gx / steep * off - big / 2), Math.round(py + gy / steep * off - big / 2), big, big);
      }
    }
  }
  for (const side of [-3, 3]) { const [mx, my] = toScreen(cam, [hole.tee[0] + side, hole.tee[1]]); ctx.fillStyle = '#16301c'; ctx.fillRect(mx - 2, my - 1, 5, 5); ctx.fillStyle = '#e2483d'; ctx.fillRect(mx - 2, my - 2, 4, 4); }
  const [px, py] = toScreen(cam, hole.pin), wave = calm ? 0 : Math.round(Math.sin(t * 5) * 2);
  ctx.fillStyle = '#16301c'; ctx.fillRect(px - 5, py - 2, 11, 4); ctx.fillRect(px - 3, py - 3, 7, 6);
  ctx.fillStyle = '#f3ecd2'; ctx.fillRect(px - 1, py - 34, 2, 34);
  ctx.fillStyle = '#e2483d'; ctx.fillRect(px + 1, py - 34, 14, 4); ctx.fillRect(px + 1, py - 30 + wave, 10, 4); ctx.fillRect(px + 1, py - 26, 5, 3);
}

/** A golfer with their feet at (x, y), drawn at twice the detail of everything else (half-pixels of the view).
 *  `look`: shirt, pants, hair or bald, and any of: skin, band, cap, beard, shades, stripes, tie, long (sleeves),
 *  hat ('cowboy' | 'umbrella'), shorts, bare (shorts and no sleeves), sandals, fur (a sasquatch), and h / w for
 *  the tall, the short and the wide. They hold a club unless club is false. */
export function drawGolfer(ctx, x, y, look, hop = 0) {
  const fur = look.fur, skin = fur || look.skin || '#f0c8a0', ink = '#1b1b22', shirt = fur || look.shirt, pants = fur || look.pants, hair = fur || look.hair;
  const w = 28 + 2 * (look.w || 0), up = 2 * (look.h || 0), l = -(w >> 1), lw = (w - 10) >> 1, hx = -10, plain = !look.bare && !fur;
  const leg = look.bare || look.shorts ? skin : pants, sleeve = look.bare ? skin : shirt, shoe = fur || (look.sandals ? '#b98a54' : ink);
  const R = (c, dx, dy, ww, hh) => { ctx.fillStyle = c; ctx.fillRect(dx, dy, ww, hh); };
  ctx.save(); ctx.translate(x, y); ctx.scale(0.5, 0.5);
  R('rgba(0,0,0,.3)', l - 2, -2, w + 8, 6); R('rgba(0,0,0,.18)', l + 4, -5, w - 4, 12);
  ctx.translate(0, -Math.round(hop * 2));
  const hip = -16 - up, top = hip - 12, sh = top - 24, hd = sh - 22; // the top of the legs, the shorts, the shoulders and the head
  if (look.club !== false) { R('#3a3f4a', l + w + 3, sh + 16, 3, 8); R('#c8ccd4', l + w + 4, sh + 24, 2, -sh - 28); R('#8a8f9a', l + w + 3, -6, 9, 5); R('#dfe3ea', l + w + 4, -5, 7, 1); }
  R(leg, l + 4, hip, lw, 12 + up); R(dim(leg), l + w - 4 - lw, hip, lw, 12 + up); R(dim(leg, 0.9), l + 2 + lw, hip, 2, 12 + up);
  if (leg === skin && !look.sandals && !fur) { R('#fff6e4', l + 4, -8, lw, 4); R('#e0d8c4', l + w - 4 - lw, -8, lw, 4); }                 // socks
  R(shoe, l + 2, -4, lw + 4, 4); R(shoe, l + w - 6 - lw, -4, lw + 4, 4);
  if (!fur) { R('#fff6e4', l + 2, -1, lw + 4, 1); R('#fff6e4', l + w - 6 - lw, -1, lw + 4, 1); }
  R(pants, l + 4, top, w - 8, 12); R(dim(pants), l + w - 10, top, 6, 12); R(dim(pants, 0.7), -1, top + 6, 2, 6);
  if (plain) { R(ink, l + 4, top, w - 8, 2); R('#ffd84a', -2, top, 4, 2); }                                                              // belt
  R(shirt, l, sh + 2, w, 22); R(shirt, l + 2, sh, w - 4, 2);
  if (look.stripes) for (const dy of [3, 11, 19]) R(look.stripes, l, sh + dy, w, 4);
  R(dim(shirt), l + w - 8, sh + 2, 8, 22); R(dim(shirt, 0.7), l, sh + 23, w, 1);
  if (look.tie) { R(dim(shirt, 0.7), -8, sh, 3, 13); R(dim(shirt, 0.7), 5, sh, 3, 13); R('#ffffff', -5, sh, 10, 11); R(look.tie, -2, sh + 2, 4, 15); }
  else if (plain) { R('#fff6e4', -6, sh, 12, 3); R(skin, -2, sh, 4, 4); R(dim(shirt, 0.75), -1, sh + 5, 1, 9); }                        // collar and placket
  R(sleeve, l - 4, sh + 2, 4, 16); R(dim(sleeve), l + w, sh + 2, 4, 16);
  if (plain && !look.long) { R(skin, l - 4, sh + 10, 4, 8); R(dim(skin, 0.88), l + w, sh + 10, 4, 8); }                                  // short sleeves
  R(skin, l - 4, sh + 18, 4, 4); R(dim(skin, 0.88), l + w, sh + 18, 4, 4);
  if (fur) { R(fur, l - 6, sh + 5, 2, 5); R(fur, l + w + 4, sh + 9, 2, 5); R(fur, l - 2, sh - 1, 3, 3); R(fur, l + w - 1, sh - 1, 3, 3); R(fur, l + 2, hip + 4, 2, 4); }
  R(dim(skin, 0.88), -4, sh - 2, 8, 2);
  R(skin, hx + 2, hd, 16, 20); R(skin, hx, hd + 2, 20, 16); R(dim(skin, 0.9), hx + 16, hd + 2, 4, 16);
  R(skin, hx - 2, hd + 8, 2, 5); R(dim(skin, 0.88), hx + 20, hd + 8, 2, 5);                                                              // ears
  if (fur) R('#a98660', hx + 3, hd + 6, 14, 12);
  if (!look.bald) {
    R(hair, hx + 2, hd - 4, 16, 6); R(hair, hx, hd - 2, 20, 6); R(hair, hx - 1, hd + 2, 3, 8); R(hair, hx + 18, hd + 2, 3, 8); R(hair, hx + 3, hd + 4, 5, 2);
    if (!look.cap && !look.hat) { R(hair, hx + 4, hd - 7, 12, 3); R(hair, hx + 7, hd - 9, 6, 2); }
  } else if (!look.hat && !look.cap) R('#fff6e4', hx + 4, hd + 2, 7, 3);
  if (look.band) R(look.band, hx, hd + 3, 20, 4);
  if (look.beard) { R(look.beard, hx + 1, hd + 13, 18, 7); R(look.beard, hx - 1, hd + 9, 3, 8); R(look.beard, hx + 18, hd + 9, 3, 8); R(look.beard, hx + 3, hd + 20, 14, 2); }
  if (look.shades) { R(ink, hx + 2, hd + 8, 8, 5); R(ink, hx + 11, hd + 8, 8, 5); R(ink, hx - 1, hd + 9, 22, 1); R('#5a6070', hx + 3, hd + 9, 2, 1); R('#5a6070', hx + 12, hd + 9, 2, 1); }
  else { R('#ffffff', hx + 4, hd + 9, 4, 4); R('#ffffff', hx + 12, hd + 9, 4, 4); R(ink, hx + 6, hd + 10, 2, 3); R(ink, hx + 14, hd + 10, 2, 3); }
  R(dim(skin, 0.82), hx + 9, hd + 12, 2, 3); R(look.beard ? '#e8b49a' : '#9a5a4a', hx + 7, hd + 16, 6, 1);                               // nose, mouth
  if (look.cap) { R(look.cap, hx + 1, hd - 5, 18, 8); R(look.cap, hx - 1, hd - 2, 22, 5); R(dim(look.cap), hx + 14, hd + 2, 12, 3); R(dim(look.cap, 0.85), hx + 9, hd - 6, 3, 1); }
  if (look.hat === 'cowboy') { R('#7a5230', hx - 8, hd, 36, 3); R('#7a5230', hx - 10, hd - 2, 4, 2); R('#7a5230', hx + 26, hd - 2, 4, 2); R('#8a6038', hx + 2, hd - 11, 16, 11); R('#9a7044', hx + 4, hd - 13, 12, 3); R('#3a2a1c', hx + 2, hd - 3, 16, 3); }
  if (look.hat === 'umbrella') { R('#c8ccd4', hx + 9, hd - 12, 2, 13); ['#e2483d', '#ffd84a', '#3f8fd0', '#5cb54c'].forEach((c, i) => { R(c, hx - 10 + i * 10, hd - 17, 10, 5); R(c, hx - 4 + i * 7, hd - 21, 7, 4); }); R('#fff6e4', hx + 8, hd - 23, 4, 2); }
  ctx.restore();
}

export function drawBall(ctx, x, y, color, lift = 0, glow = false) {
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 3, y, 6, 2);
  const r = lift > 28 ? 3 : 2, by = y - 2 - Math.round(lift);
  if (glow) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - r - 3, by - r - 3, r * 2 + 6, r * 2 + 6); }
  ctx.fillStyle = '#1b1b22'; ctx.fillRect(x - r, by - r - 1, r * 2, r * 2 + 2); ctx.fillRect(x - r - 1, by - r, r * 2 + 2, r * 2); ctx.fillRect(x - r - 0.5, by - r - 0.5, r * 2 + 1, r * 2 + 1);
  ctx.fillStyle = color; ctx.fillRect(x - r, by - r, r * 2, r * 2); ctx.fillRect(x - r + 0.5, by - r - 0.5, r * 2 - 1, r * 2 + 1); ctx.fillRect(x - r - 0.5, by - r + 0.5, r * 2 + 1, r * 2 - 1);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, by + r - 1, r, 1);
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(x - r + 0.5, by - r + 0.5, 1, 1);
}

/** The aim line, out to where a full swing of this club comes down. */
export function drawAim(ctx, cam, from, to, t, calm) {
  const [ax, ay] = toScreen(cam, from), [bx, by] = toScreen(cam, to), n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 12));
  const crawl = calm ? 0 : (t * 2) % 1;
  for (const [c, o] of [['#16301c', 1], ['#fff6e4', 0]]) { // a dark copy underneath so it shows on the green too
    ctx.fillStyle = c;
    for (let k = 1; k < n; k++) ctx.fillRect(Math.round(ax + (bx - ax) * (k + crawl) / n) - 1 + o, Math.round(ay + (by - ay) * (k + crawl) / n) - 1 + o, 2, 2);
    ctx.fillRect(bx - 10 + o, by - 1 + o, 7, 2); ctx.fillRect(bx + 3 + o, by - 1 + o, 7, 2); ctx.fillRect(bx - 1 + o, by - 10 + o, 2, 7); ctx.fillRect(bx - 1 + o, by + 3 + o, 2, 7);
  }
}
/** Where the swing on the meter right now would come down. */
export function drawMark(ctx, cam, p) {
  const [x, y] = toScreen(cam, p);
  for (const [c, o, s] of [['#16301c', 7, 14], ['#ffd84a', 6, 12]]) { ctx.fillStyle = c; ctx.fillRect(x - o, y - o, s, 3); ctx.fillRect(x - o, y + o - 3, s, 3); ctx.fillRect(x - o, y - o, 3, s); ctx.fillRect(x + o - 3, y - o, 3, s); }
}
/** When the flag is off the screen: a little flag at the edge, with marks growing toward it. */
export function drawPinPointer(ctx, cam, pin) {
  const [px, py] = toScreen(cam, pin), x = Math.max(16, Math.min(W - 26, px)), y = Math.max(96, Math.min(H - 110, py));
  if (px >= 0 && px <= W && py >= 30 && py <= H - 90) return;
  const d = Math.hypot(px - x, py - y), ux = (px - x) / d, uy = (py - y) / d;
  ctx.fillStyle = '#16301c'; ctx.fillRect(x - 3, y - 17, 16, 20);
  ctx.fillStyle = '#f3ecd2'; ctx.fillRect(x - 1, y - 15, 2, 16);
  ctx.fillStyle = '#e2483d'; ctx.fillRect(x + 1, y - 15, 10, 4); ctx.fillRect(x + 1, y - 11, 6, 3);
  ctx.fillStyle = '#f3ecd2';
  for (let k = 1; k <= 3; k++) ctx.fillRect(Math.round(x + 4 + ux * (10 + k * 7) - k), Math.round(y - 7 + uy * (12 + k * 7) - k), k * 2, k * 2);
}
/** Streaks blowing across the view, faster and longer in more wind. */
export function drawWind(ctx, wind, t) {
  const mph = Math.hypot(wind[0], wind[1]);
  if (mph < 1) return;
  const ux = wind[0] / mph, uy = -wind[1] / mph, len = 8 + mph * 3;
  ctx.fillStyle = 'rgba(255,255,255,.38)';
  for (let k = 0; k < 14; k++) {
    const go = t * (40 + mph * 22) * (0.7 + hash(k, 3) * 0.6);
    const x = ((hash(k, 1) * W + ux * go) % W + W) % W, y = ((hash(k, 2) * H + uy * go) % H + H) % H;
    for (let i = 0; i < len; i += 3) ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 2, 2);
  }
}

/** The line a swing would take if the third tap came now: gold from the golfer to where it lands, with a faint
 *  line either side for how far off a bad one could go. */
export function drawSwing(ctx, cam, from, to, wide) {
  const [ax, ay] = toScreen(cam, from), dots = (p, c, size, gap) => {
    const [bx, by] = toScreen(cam, p), n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap));
    ctx.fillStyle = c;
    for (let k = 1; k <= n; k++) ctx.fillRect(Math.round(ax + (bx - ax) * k / n - size / 2), Math.round(ay + (by - ay) * k / n - size / 2), size, size);
  };
  for (const p of wide) dots(p, 'rgba(255,246,228,.45)', 2, 10);
  dots(to, '#16301c', 6, 7); dots(to, '#ffd84a', 4, 7);
  drawMark(ctx, cam, to);
}

/** The swing meter, in two goes: how hard (`v`, 0..1 along the bar), then how straight (`needle`, -1 for hard left
 *  to 1 for hard right). Inside SWEET of the middle is dead straight; WILD from it is a full miss. */
export const SWEET = 0.12, WILD = 0.8;
const MX = 24, MW = 384;
export const meterX = (u) => (MX + u * MW) / W; // as a share of the view's width, so the HUD can label the bar
export function drawMeter(ctx, { v, power, ideal, needle }) {
  const y = H - 58, h = 18, X = (u) => Math.round(MX + u * MW), N = (x) => X((x + 1) / 2);
  ctx.fillStyle = 'rgba(11,28,19,.72)'; ctx.fillRect(0, y - 26, W, H - y + 26);
  ctx.fillStyle = '#10261a'; ctx.fillRect(MX - 4, y - 4, MW + 8, h + 8);
  ctx.fillStyle = '#2c5a3a'; ctx.fillRect(MX, y, MW, h);
  let at = null;
  if (needle == null) {
    const filled = power ?? Math.max(0, v ?? 0);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(X(0), y + 4, X(Math.min(filled, 0.8)) - X(0), h - 8);
    if (filled > 0.8) { ctx.fillStyle = '#e2483d'; ctx.fillRect(X(0.8), y + 4, X(filled) - X(0.8), h - 8); }
    ctx.fillStyle = '#fff6e4';
    for (const u of [0.5, 1]) ctx.fillRect(X(u) - 1, y + h + 4, 2, 5);
    if (ideal != null) { const ix = X(ideal); ctx.fillStyle = '#fff6e4'; ctx.fillRect(ix - 1, y - 20, 2, 16); ctx.fillStyle = '#e2483d'; ctx.fillRect(ix + 1, y - 20, 10, 7); } // the pin, in meter terms
    if (v != null) at = X(v);
  } else {
    ctx.fillStyle = '#7a3a34'; ctx.fillRect(MX, y, N(-WILD) - MX, h); ctx.fillRect(N(WILD), y, MX + MW - N(WILD), h);       // off the planet
    ctx.fillStyle = '#4f8f5e'; ctx.fillRect(N(-0.4), y, N(0.4) - N(-0.4), h);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(N(-SWEET), y - 4, N(SWEET) - N(-SWEET), h + 8);                                  // straight
    ctx.fillStyle = '#1b1b22'; ctx.fillRect(N(0) - 1, y - 4, 2, h + 8);
    ctx.fillStyle = '#ffd84a'; for (let k = 0; k < 4; k++) ctx.fillRect(N(0) - 4 + k, y - 14 + k * 2, 8 - k * 2, 2);
    at = N(needle);
  }
  if (at != null) { ctx.fillStyle = '#1b1b22'; ctx.fillRect(at - 3, y - 6, 6, h + 12); ctx.fillStyle = '#ffffff'; ctx.fillRect(at - 1, y - 4, 2, h + 8); }
}

// Original cartoon ragdoll for the Kash Bet back room. No third-party physics, no copied assets.
// Comedic and non-gory: stars, bonks, smoke puffs, cream pies.

export const TOOLS = [
  { id: 'punch', label: 'Punch', glyph: '👊' },
  { id: 'knuckles', label: 'Knuckles', glyph: '🤜' },
  { id: 'knife', label: 'Knife', glyph: '🗡' },
  { id: 'bat', label: 'Bat', glyph: '🏏' },
  { id: 'grenade', label: 'Grenade', glyph: '💣' },
  { id: 'pie', label: 'Pie', glyph: '🥧' },
];

const r2 = (x) => Math.round(x * 100) / 100;
function body(x, y, rx, ry, m) {
  return { x, y, vx: 0, vy: 0, rx, ry, m, rot: 0, vr: 0 };
}

export function createToy(w, h) {
  const cx = w * 0.5, cy = h * 0.42;
  const s = Math.min(w, h) / 420;
  const torso = body(cx, cy, 28 * s, 36 * s, 3.2);
  const head = body(cx, cy - 58 * s, 24 * s, 26 * s, 1.4);
  const armL = body(cx - 38 * s, cy - 6 * s, 10 * s, 28 * s, 0.8);
  const armR = body(cx + 38 * s, cy - 6 * s, 10 * s, 28 * s, 0.8);
  const legL = body(cx - 16 * s, cy + 52 * s, 11 * s, 32 * s, 1.1);
  const legR = body(cx + 16 * s, cy + 52 * s, 11 * s, 32 * s, 1.1);
  const bodies = { head, torso, armL, armR, legL, legR };
  const links = [
    [head, torso, 52 * s, 0.9],
    [torso, armL, 36 * s, 0.75],
    [torso, armR, 36 * s, 0.75],
    [torso, legL, 48 * s, 0.8],
    [torso, legR, 48 * s, 0.8],
  ];
  const fx = [];
  const bombs = [];
  const floor = h - 18;
  const wallL = 16, wallR = w - 16, ceil = 16;

  function addFx(kind, x, y, life, extra = {}) { fx.push({ kind, x, y, life, max: life, ...extra }); }

  function impulse(b, ix, iy, spin = 0) {
    b.vx += ix / b.m; b.vy += iy / b.m; b.vr += spin;
  }

  function explode(x, y, power) {
    addFx('smoke', x, y, 0.7, { r: 20 * s * power });
    addFx('boom', x, y, 0.45);
    for (const b of Object.values(bodies)) {
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1;
      const f = (power * 420 * s) / (d + 20);
      impulse(b, (dx / d) * f, (dy / d) * f - f * 0.25, (Math.random() - 0.5) * 8);
    }
    for (let i = 0; i < 7; i++) addFx('star', x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, 0.5 + Math.random() * 0.3);
  }

  function apply(tool, x, y) {
    const tx = x * w, ty = y * h;
    const near = (b) => Math.hypot(b.x - tx, b.y - ty);
    if (tool === 'grenade') {
      bombs.push({ x: tx, y: ty, vx: (cx - tx) * 0.4, vy: -220 * s, fuse: 0.85 });
      addFx('bonk', tx, ty, 0.4, { text: 'FUSE' });
      return 'grenade';
    }
    if (tool === 'pie') {
      addFx('splat', tx, ty, 0.9, { rot: (Math.random() - 0.5) * 1.2 });
      addFx('bonk', tx, ty - 16, 0.5, { text: 'SPLAT' });
      impulse(head, (tx - head.x) * 0.02, -40 * s, (Math.random() - 0.5) * 6);
      return 'pie';
    }
    const power = tool === 'knuckles' ? 1.35 : tool === 'bat' ? 1.6 : tool === 'knife' ? 1.1 : 1;
    const target = Object.values(bodies).sort((a, b) => near(a) - near(b))[0];
    const dirx = (tx - cx) || (Math.random() - 0.5);
    impulse(target, Math.sign(dirx) * 280 * s * power, -180 * s * power, Math.sign(dirx) * 5 * power);
    addFx('star', target.x, target.y, 0.45);
    addFx('bonk', target.x, target.y - 24 * s, 0.4, { text: tool === 'bat' ? 'BONK' : tool === 'knife' ? 'SWISH' : 'POW' });
    if (tool === 'bat' || tool === 'knuckles') addFx('smoke', target.x, target.y, 0.35, { r: 16 * s });
    return tool;
  }

  function step(dt) {
    const g = 980 * (Math.min(w, h) / 500);
    for (const b of Object.values(bodies)) {
      b.vy += g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.vx *= 0.995; b.vy *= 0.995; b.vr *= 0.98;
    }
    for (let k = 0; k < 3; k++) {
      for (const [a, b, rest, stiff] of links) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const diff = (d - rest) / d;
        const im = 1 / a.m + 1 / b.m;
        const corr = diff * stiff / im;
        a.x += dx * corr / a.m; a.y += dy * corr / a.m;
        b.x -= dx * corr / b.m; b.y -= dy * corr / b.m;
      }
    }
    for (const b of Object.values(bodies)) {
      if (b.y + b.ry > floor) { b.y = floor - b.ry; b.vy *= -0.35; b.vx *= 0.7; b.vr *= 0.6; }
      if (b.y - b.ry < ceil) { b.y = ceil + b.ry; b.vy *= -0.3; }
      if (b.x - b.rx < wallL) { b.x = wallL + b.rx; b.vx *= -0.4; }
      if (b.x + b.rx > wallR) { b.x = wallR - b.rx; b.vx *= -0.4; }
    }
    for (const bomb of bombs) {
      bomb.vy += g * dt; bomb.x += bomb.vx * dt; bomb.y += bomb.vy * dt; bomb.vx *= 0.995;
      if (bomb.y > floor - 8) { bomb.y = floor - 8; bomb.vy *= -0.25; bomb.vx *= 0.6; }
      bomb.fuse -= dt;
    }
    for (let i = bombs.length - 1; i >= 0; i--) {
      if (bombs[i].fuse <= 0) { explode(bombs[i].x, bombs[i].y, 1.4); bombs.splice(i, 1); }
    }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].life -= dt; if (fx[i].life <= 0) fx.splice(i, 1); }
  }

  function snapshot() {
    const b = {};
    for (const [k, v] of Object.entries(bodies)) b[k] = { x: r2(v.x), y: r2(v.y), rot: r2(v.rot), rx: v.rx, ry: v.ry };
    return { bodies: b, fx: fx.map((f) => ({ ...f })), bombs: bombs.map((x) => ({ ...x })), w, h };
  }

  function resize(nw, nh) {
    const sx = nw / w, sy = nh / h;
    w = nw; h = nh;
    for (const b of Object.values(bodies)) { b.x *= sx; b.y *= sy; }
  }

  return { apply, step, snapshot, resize, bodies };
}

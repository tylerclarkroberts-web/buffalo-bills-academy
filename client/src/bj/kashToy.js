// Original cartoon stick-figure ragdoll for the Kash Bet back room. No third-party physics, no copied assets.
// Verlet points with neck/shoulder/elbow/hip/knee joints, gravity, wall and floor collisions, drag-and-fling.
// Comedic and non-gory: stars, bonks, smoke, cream pies, a clothing tear at most.

export const TOOLS = [
  { id: 'punch', label: 'Punch', glyph: '👊' },
  { id: 'knuckles', label: 'Knuckles', glyph: '🤜' },
  { id: 'knife', label: 'Knife', glyph: '🗡' },
  { id: 'bat', label: 'Bat', glyph: '🏏' },
  { id: 'grenade', label: 'Grenade', glyph: '💣' },
  { id: 'pie', label: 'Pie', glyph: '🥧' },
];

const r2 = (x) => Math.round(x * 100) / 100;
const hypot = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay) || 1;

function pt(x, y, mass = 1) {
  return { x, y, px: x, py: y, mass, held: false };
}

/** Palette from the cheater's avatar (skin, shirt) plus a dark pant tone. */
export function toyPalette(avatar, id) {
  // Imported lazily by the renderer; this stays data-only so unit tests don't need React.
  const skin = avatar?.skinTone || avatar?.skin || '#c98962';
  const shirt = avatar?.shirt || '#3d5a7a';
  return { skin, shirt, pants: '#2a2433', shoe: '#1b1512' };
}

export function createToy(w, h) {
  const s = Math.min(w, h) / 420;
  const cx = w * 0.5, cy = h * 0.38;
  const P = {
    head: pt(cx, cy - 62 * s, 1.2),
    neck: pt(cx, cy - 38 * s, 0.9),
    sL: pt(cx - 22 * s, cy - 28 * s, 0.9),
    sR: pt(cx + 22 * s, cy - 28 * s, 0.9),
    eL: pt(cx - 36 * s, cy + 2 * s, 0.7),
    eR: pt(cx + 36 * s, cy + 2 * s, 0.7),
    wL: pt(cx - 44 * s, cy + 32 * s, 0.55),
    wR: pt(cx + 44 * s, cy + 32 * s, 0.55),
    hip: pt(cx, cy + 22 * s, 1.5),
    hL: pt(cx - 14 * s, cy + 28 * s, 1.0),
    hR: pt(cx + 14 * s, cy + 28 * s, 1.0),
    kL: pt(cx - 16 * s, cy + 70 * s, 0.9),
    kR: pt(cx + 16 * s, cy + 70 * s, 0.9),
    aL: pt(cx - 18 * s, cy + 108 * s, 0.8),
    aR: pt(cx + 18 * s, cy + 108 * s, 0.8),
  };
  const bone = (a, b, stiff = 1) => ({ a, b, rest: hypot(P[a].x, P[a].y, P[b].x, P[b].y), stiff });
  const links = [
    bone('head', 'neck', 1),
    bone('neck', 'sL', 0.95), bone('neck', 'sR', 0.95),
    bone('sL', 'sR', 1), // collarbone keeps the shoulders a chest-width apart
    bone('sL', 'eL', 0.9), bone('eL', 'wL', 0.9),
    bone('sR', 'eR', 0.9), bone('eR', 'wR', 0.9),
    bone('neck', 'hip', 1),
    bone('sL', 'hip', 0.7), bone('sR', 'hip', 0.7),
    bone('hip', 'hL', 1), bone('hip', 'hR', 1), bone('hL', 'hR', 0.95),
    bone('hL', 'kL', 0.95), bone('kL', 'aL', 0.95),
    bone('hR', 'kR', 0.95), bone('kR', 'aR', 0.95),
    // Soft stays so knees and elbows fold but do not collapse flat.
    { a: 'hL', b: 'aL', rest: hypot(P.hL.x, P.hL.y, P.kL.x, P.kL.y) + hypot(P.kL.x, P.kL.y, P.aL.x, P.aL.y) * 0.92, stiff: 0.45 },
    { a: 'hR', b: 'aR', rest: hypot(P.hR.x, P.hR.y, P.kR.x, P.kR.y) + hypot(P.kR.x, P.kR.y, P.aR.x, P.aR.y) * 0.92, stiff: 0.45 },
    { a: 'sL', b: 'wL', rest: hypot(P.sL.x, P.sL.y, P.eL.x, P.eL.y) + hypot(P.eL.x, P.eL.y, P.wL.x, P.wL.y) * 0.9, stiff: 0.35 },
    { a: 'sR', b: 'wR', rest: hypot(P.sR.x, P.sR.y, P.eR.x, P.eR.y) + hypot(P.eR.x, P.eR.y, P.wR.x, P.wR.y) * 0.9, stiff: 0.35 },
  ];
  const fx = [];
  const bombs = [];
  const tears = [];
  let floor = h - 18, wallL = 16, wallR = w - 16, ceil = 16;
  let held = null, squash = 0;

  function addFx(kind, x, y, life, extra = {}) { fx.push({ kind, x, y, life, max: life, ...extra }); }

  function nearPoint(x, y) {
    let best = null, bestD = 28 * s;
    for (const [name, p] of Object.entries(P)) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  function impulse(name, ix, iy) {
    const p = P[name]; if (!p || p.held) return;
    const inv = 1 / p.mass;
    p.px -= ix * inv;
    p.py -= iy * inv;
  }

  function explode(x, y, power) {
    addFx('smoke', x, y, 0.7, { r: 22 * s * power });
    addFx('boom', x, y, 0.45);
    addFx('dust', x, y + 8, 0.55, { r: 28 * s });
    for (const name of Object.keys(P)) {
      const p = P[name];
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      const f = (power * 520 * s) / (d + 18);
      impulse(name, (dx / d) * f, (dy / d) * f - f * 0.3);
    }
    for (let i = 0; i < 8; i++) addFx('star', x + (Math.random() - 0.5) * 48, y + (Math.random() - 0.5) * 48, 0.45 + Math.random() * 0.3);
  }

  function apply(tool, x, y) {
    const tx = x * w, ty = y * h;
    if (tool === 'grenade') {
      bombs.push({ x: tx, y: ty, vx: (cx - tx) * 0.45, vy: -240 * s, fuse: 0.85 });
      addFx('bonk', tx, ty, 0.4, { text: 'FUSE' });
      return 'grenade';
    }
    if (tool === 'pie') {
      addFx('splat', tx, ty, 0.95, { rot: (Math.random() - 0.5) * 1.2 });
      addFx('bonk', tx, ty - 16, 0.5, { text: 'SPLAT' });
      impulse('head', (tx - P.head.x) * 0.04, -80 * s);
      return 'pie';
    }
    const power = tool === 'knuckles' ? 1.4 : tool === 'bat' ? 1.7 : tool === 'knife' ? 1.05 : 1;
    const target = nearPoint(tx, ty) || 'hip';
    const dirx = (tx - cx) || (Math.random() - 0.5);
    impulse(target, Math.sign(dirx) * 340 * s * power, -220 * s * power);
    addFx('star', P[target].x, P[target].y, 0.45);
    addFx('dust', P[target].x, P[target].y + 6, 0.35, { r: 14 * s });
    addFx('bonk', P[target].x, P[target].y - 22 * s, 0.4, { text: tool === 'bat' ? 'BONK' : tool === 'knife' ? 'SWISH' : 'POW' });
    if (tool === 'knife') {
      tears.push({ a: target, at: P[target].x, y: P[target].y, life: 2.8, rot: (Math.random() - 0.5) * 0.8 });
      addFx('tear', P[target].x, P[target].y, 0.7);
    }
    if (tool === 'bat' || tool === 'knuckles') addFx('smoke', P[target].x, P[target].y, 0.35, { r: 16 * s });
    squash = 1;
    return tool;
  }

  function grab(x, y) {
    const name = nearPoint(x, y);
    if (!name) return false;
    held = name;
    P[name].held = true;
    P[name].x = x; P[name].y = y;
    P[name].px = x; P[name].py = y;
    return name;
  }
  function drag(x, y) {
    if (!held) return;
    const p = P[held];
    p.px = p.x; p.py = p.y;
    p.x = x; p.y = y;
  }
  function release() {
    if (!held) return;
    P[held].held = false;
    held = null;
  }

  function collide(p) {
    const rad = 6 * s;
    if (p.y + rad > floor) {
      const vy = p.y - p.py;
      p.y = floor - rad;
      p.py = p.y + vy * 0.35;
      p.px = p.x - (p.x - p.px) * 0.65;
      if (Math.abs(vy) > 80 * s) { squash = Math.max(squash, 0.8); addFx('dust', p.x, floor, 0.3, { r: 10 * s }); }
    }
    if (p.y - rad < ceil) { const vy = p.y - p.py; p.y = ceil + rad; p.py = p.y + vy * 0.3; }
    if (p.x - rad < wallL) { const vx = p.x - p.px; p.x = wallL + rad; p.px = p.x + vx * 0.4; }
    if (p.x + rad > wallR) { const vx = p.x - p.px; p.x = wallR - rad; p.px = p.x + vx * 0.4; }
  }

  function step(dt) {
    const g = 980 * (Math.min(w, h) / 500);
    const dt2 = Math.min(0.033, dt) * Math.min(0.033, dt);
    const damp = 0.992;
    for (const p of Object.values(P)) {
      if (p.held) continue;
      const vx = (p.x - p.px) * damp;
      const vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + g * dt2;
    }
    for (let k = 0; k < 8; k++) {
      for (const L of links) {
        const a = P[L.a], b = P[L.b];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const diff = (d - L.rest) / d;
        const inv = 1 / a.mass + 1 / b.mass;
        const corr = (diff * L.stiff) / inv;
        if (!a.held) { a.x += dx * corr / a.mass; a.y += dy * corr / a.mass; }
        if (!b.held) { b.x -= dx * corr / b.mass; b.y -= dy * corr / b.mass; }
      }
      for (const p of Object.values(P)) collide(p);
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
    for (let i = tears.length - 1; i >= 0; i--) { tears[i].life -= dt; if (tears[i].life <= 0) tears.splice(i, 1); }
    if (squash > 0) squash = Math.max(0, squash - dt * 3.5);
  }

  function snapshot() {
    const points = {};
    for (const [k, v] of Object.entries(P)) points[k] = { x: r2(v.x), y: r2(v.y) };
    // Head facing from neck→head, for the avatar overlay.
    const rot = Math.atan2(P.head.x - P.neck.x, P.neck.y - P.head.y);
    const headR = 24 * s;
    return {
      points, rot: r2(rot), headR: r2(headR), squash: r2(squash),
      fx: fx.map((f) => ({ ...f })), bombs: bombs.map((x) => ({ ...x })),
      tears: tears.map((t) => ({ ...t })), w, h, floor, s,
    };
  }

  function resize(nw, nh) {
    const sx = nw / w, sy = nh / h;
    w = nw; h = nh;
    floor = h - 18; wallL = 16; wallR = w - 16; ceil = 16;
    for (const p of Object.values(P)) { p.x *= sx; p.y *= sy; p.px *= sx; p.py *= sy; }
  }

  return { apply, step, snapshot, resize, grab, drag, release, nearPoint, points: P };
}

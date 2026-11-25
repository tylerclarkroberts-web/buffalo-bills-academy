// Bug variety, drawn (server/engine/variety.js picks it). Everything is written in the sprite's 64-grid coordinates
// on the same canvas the species was drawn on (sprite.js), so it is shaded, outlined and scaled with the rest: crisp
// at every size. Bases go under the body, everything else over it. Cosmetic only.
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };

function hsl(c) {
  const [r, g, b] = hex(c).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
  const [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/**
 * Its colouring: a turn of the colour wheel, lighter or darker, and its morph. The outline stays as it was.
 * twotone: the light shade and the accent go their own way round the wheel; inverted: light where it was dark, on the
 * opposite hue; melanic: near black with its accent still bright; pale: washed out; vivid: turned right up.
 */
export function shiftPal(pal, v) {
  const morph = v?.morph && v.morph !== 'none' ? v.morph : null;
  if (!v || (!v.hue && !v.tone && !morph)) return pal;
  const out = pal.map((c, i) => {
    if (i === 0 || typeof c !== 'string' || c[0] !== '#') return c;
    let [h, s, l] = hsl(c); h += v.hue * (i === 4 ? 1.4 : 1); l = l * (1 + v.tone / 100);
    if (morph === 'twotone' && i >= 3) { h += i === 4 ? 150 : 110; s = Math.max(s, 0.5); }
    if (morph === 'inverted' && i < 4) { h += 180; l = 1 - l; }
    if (morph === 'melanic') { if (i < 4) { l *= 0.42; s *= 0.55; } else { s = Math.max(s, 0.8); l = Math.max(l, 0.55); } }
    if (morph === 'pale') { l = 0.58 + l * 0.38; s *= 0.45; }
    if (morph === 'vivid') { s = Math.min(1, s * 1.6 + 0.15); }
    return fromHsl(h, Math.max(0, Math.min(1, s)), Math.max(0.03, Math.min(0.95, l)));
  });
  if (morph === 'inverted') [out[1], out[3]] = [out[3], out[1]]; // keep the ramp running dark to light
  return out;
}
// what a Stage II machine body is plated in: iron (and brass) as built, or a coat of something else
const METAL = {
  brass: { M: ['#6a4a22', '#b8893e', '#f0d080'], J: ['#5a2c1c', '#a8562e', '#e8945a'] },
  copper: { M: ['#5e2c1c', '#b0603a', '#f0a070'], J: ['#3a4a3e', '#6a8a72', '#b0d0b0'] },
  gunmetal: { M: ['#1c2230', '#3e4a60', '#7d8aa4'], J: ['#555a66', '#9aa0aa', '#e0e4ea'] },
  red: { M: ['#5a1418', '#a8302c', '#e87a62'], J: ['#69402d', '#bc7a3f', '#f8bf68'] },
  teal: { M: ['#123c3e', '#2a8078', '#78d0bc'], J: ['#69402d', '#bc7a3f', '#f8bf68'] },
  olive: { M: ['#2c3418', '#5a6a32', '#a0b06a'], J: ['#3a2a18', '#7a5a34', '#c09a5a'] },
  cream: { M: ['#6e6658', '#c8bea4', '#fbf4e2'], J: ['#7a1a16', '#c8322a', '#f07458'] },
  gold: { M: ['#6e5010', '#d0a02a', '#fff0a0'], J: ['#373641', '#747180', '#b6b1ae'] },
};
/** The extra materials variety draws with. Fruit tones lean into the body colour, so they whisper; the pattern ink stands out from it. */
export function varietyRamps(R, v = null) {
  const body = R.B[1], quiet = (c, t = 0.3) => mix(c, body, t), lum = hsl(body)[2];
  const ink = lum > 0.42 ? [mix(R.B[0], '#000000', 0.55), mix(R.B[0], '#000000', 0.35), mix(R.B[1], '#000000', 0.2)] : [mix(R.B[1], '#ffffff', 0.35), mix(R.B[2], '#ffffff', 0.5), mix(R.B[2], '#ffffff', 0.75)];
  return {
    ...(v?.metal ? METAL[v.metal] : null),
    w: ink,                                                  // a bold shell pattern
    x: R.A || ink,                                           // its second ink: the accent
    X: [quiet('#55705a', 0.35), quiet('#8fb492', 0.35), quiet('#d8eed2', 0.3)], // slug foot and its slime, in the bug's own tint
    C: ['#9a2a33', '#e0505a', '#ff9a9a'],                    // pox, rash, fever
    O: ['#4d5a22', '#7f8c3a', '#b4bd6c'],                    // warts
    b: ['#2a6ab0', '#62b4f0', '#d4f0ff'],                    // sweat, drips, rain
    g: ['#6f7682', '#a9b0bb', '#e3e7ec'],                    // a rain cloud
    p: ['#4a2a66', '#7a4a9a', '#a87ac8'],                    // eye bags
    y: [quiet('#3c5a2a'), quiet('#5d8a3a'), quiet('#8db85a')], // leaf, pod, tuft
    s: [quiet('#b89a3a', 0.45), quiet('#efd879', 0.4), quiet('#fff2b0', 0.4)], // seeds, peel
    q: [quiet('#3a2614'), quiet('#6a4524'), quiet('#9a6a3a')], // a stem
    r: [quiet('#3a2050'), quiet('#634085'), quiet('#9070b0')], // grapes
  };
}

// What is where, read off the drawn grid (always the 64 one, so every size puts things in the same places): rows wide enough to be body, their left edge, and the eyes.
export function survey(c) {
  const { g, f } = c, N = g.length, at = (x, y) => g[Math.min(N - 1, Math.floor(y * f + f / 2))]?.[Math.min(N - 1, Math.floor(x * f + f / 2))] ?? null;
  const rows = []; const eyes = [];
  for (let y = 0; y < 64; y++) { let n = 0, l = 64, r = -1; for (let x = 0; x < 64; x++) { const m = at(x, y); if (m !== null) { n++; l = Math.min(l, x); r = Math.max(r, x); } if (m === 'E' || m === 'G') eyes.push([x, y]); } rows.push({ n, l, r }); }
  const core = rows.map((row, y) => (row.n >= 6 ? y : -1)).filter((y) => y >= 0);
  const top = core.length ? core[0] : 20, bottom = core.length ? core[core.length - 1] : 50;
  let eye = null;
  if (eyes.length) { const xs = eyes.map((p) => p[0]), ys = eyes.map((p) => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, right = eyes.filter((p) => p[0] >= mx).map((p) => p[0]), left = eyes.filter((p) => p[0] < mx).map((p) => p[0]);
    eye = { y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2), l: left.length ? Math.round((Math.min(...left) + Math.max(...left)) / 2) : Math.round(mx) - 3, r: right.length ? Math.round((Math.min(...right) + Math.max(...right)) / 2) : Math.round(mx) + 3 }; }
  eye ||= { y: Math.max(6, top - 2), l: 28, r: 35 };
  // shell: whole 64-grid pixels well inside the body, below the head
  const solid = (x, y) => 'BLA'.includes(at(x, y) ?? '.') && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].every(([dx, dy]) => at(x + dx, y + dy) !== null);
  const shell = []; for (let y = Math.max(eye.y + 6, top); y <= bottom - 2; y++) for (let x = 18; x <= 45; x++) if (solid(x, y)) shell.push([x, y]);
  return { at, rows, top, bottom, eye, shell, left: (y) => rows[Math.max(0, Math.min(63, Math.round(y)))].l, width: (y) => rows[Math.max(0, Math.min(63, Math.round(y)))].n };
}
/** Deterministic picks for this bug, so its pox are always in the same places. */
function dice(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
const spread = (list, n, R) => { const out = []; const pool = [...list]; while (out.length < n && pool.length) { const i = Math.floor(R() * pool.length); const p = pool.splice(i, 1)[0]; if (out.every((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) >= 4)) out.push(p); } return out; };

/** Wheels, a rotor, tracks or a slug's foot, on a fresh canvas `u` the body is then laid over (sprite.js merges). */
export function drawBase(u, S, base, frame = 0) {
  const { top, bottom } = S, h = Math.max(10, bottom - top), mid = (top + bottom) / 2;
  const edge = (a, b) => { let l = 64; for (let y = Math.floor(a); y <= Math.ceil(b); y++) if (S.width(y) >= 6) l = Math.min(l, S.left(y)); return l === 64 ? 22 : l; };
  if (base === 'wheels') {
    const ys = h > 24 ? [top + h * 0.22, top + h * 0.55, top + h * 0.86] : [top + h * 0.28, top + h * 0.8];
    for (const y of ys) { const x = Math.max(4, edge(y - 2, y + 2) - 1.5);
      u.line(x + 2, y, 31.5, y, 'M', 2); // axle
      u.ell(x - 0.5, y, 4, 5.6, 'K'); u.ell(x - 0.9, y, 2, 3, 'M'); u.ell(x - 0.9, y, 0.9, 1.2, 'J'); // tyre, rim, hub
      for (const dy of [-4, -2, 0, 2, 4]) u.hair([[x - 3.6, y + dy], [x - 2.6, y + dy]], 'S'); } // tread
  } else if (base === 'tracks') {
    const y0 = top + h * 0.12, y1 = bottom - h * 0.04, x = Math.max(4, edge(y0, y1) - 1.6);
    u.line(x - 1, y0, x - 1, y1, 'K', 7); u.ell(x - 1, y0, 3.5, 3.5, 'K'); u.ell(x - 1, y1, 3.5, 3.5, 'K');
    for (let y = y0 - 1; y <= y1 + 1; y += 2.5) u.line(x - 4.2, y, x + 1.6, y, 'M', 1); // treads
    for (const y of [y0, (y0 * 2 + y1) / 3, (y0 + y1 * 2) / 3, y1]) u.ell(x - 1, y, 1.4, 1.4, 'J'); // road wheels showing between them
  } else if (base === 'rotor') {
    const cy = Math.round(mid), a = frame % 2 ? 0.35 : 1, b = frame % 2 ? 1 : 0.35;
    // two blades and a blur ring where they have been, the hub under the body
    const L = 25, dx = L * a, dy = L * b * 0.55;
    for (let k = 0; k < 48; k++) { if (k % 4 === 3) continue; const t = (k / 48) * Math.PI * 2; u.ell(31.5 + Math.cos(t) * 27, cy + Math.sin(t) * 15, 0.8, 0.8, 'g', false); } // the blur
    u.line(31.5 - dx, cy - dy, 31.5 + dx, cy + dy, 'M', 3, false); u.line(31.5 - dx, cy + dy, 31.5 + dx, cy - dy, 'M', 3, false);
    for (const s of [-1, 1]) { u.ell(31.5 + s * dx, cy + s * dy, 2, 2, 'R', false); u.ell(31.5 - s * dx, cy + s * dy, 2, 2, 'R', false); } // painted tips
    u.ell(31.5, cy, 4, 4, 'J', false); u.ell(31.5, cy, 1.6, 1.6, 'K', false);
  } else if (base === 'slug') {
    let w = 0; for (let y = top; y <= bottom; y++) w = Math.max(w, S.width(y)); w = Math.min(26, w / 2 + 3.5);
    u.ell(31.5, mid + 2, w, h / 2 + 3, 'X'); // the foot, a little wider than the bug all round
    for (let y = top + 2; y < bottom + 4; y += 3) u.hair([[31.5 - w + 0.6, y], [31.5 - w + 1.6, y + 1]], 'T'); // its frilly edge
    const tail = Math.min(62, mid + h / 2 + 5.5);
    u.ell(31.5, tail, 3.2, 1.6, 'X', false); u.ell(31.5, Math.min(63, tail + 2.6), 2, 1, 'X', false); // a shiny trail
    u.ell(31.5 - w * 0.6, mid + 3, 0.6, 0.6, 'I'); // where the light catches the slime
  }
}

/** The pattern, then the ailments, then the faint fruit: over the body. `seed` keeps every speck where it was. */
export function drawMarks(c, S, v) {
  const R = dice(v.seed || 1), { eye, top, bottom } = S, h = Math.max(10, bottom - top);
  PATTERN[v.pat]?.(c, S, R, h);
  for (const id of v.ail || []) AIL[id]?.(c, S, R);
  FRUIT[v.fruit]?.(c, S, R);
}

const clampY = (y) => Math.max(1, Math.min(62, y));
// bold shell patterns, inked only on the shell (whole 64-grid pixels well inside the body)
const on = (S, test, m = 'w') => (c) => { for (const [x, y] of S.shell) { const k = test(x, y); if (k) c.put(x, y, k === 2 ? 'x' : m); } };
const PATTERN = {
  freckles(c, S, R) { for (const [x, y] of spread(S.shell, 12, R)) { c.put(x, y, 'w'); if (R() < 0.4) c.put(x + 1, y, 'w'); } },
  banded(c, S) { on(S, (x, y) => (y % 6) < 2)(c); },
  stripes(c, S) { on(S, (x) => (Math.abs(Math.round(x - 31.5)) % 5) < 2)(c); },
  chevrons(c, S) { on(S, (x, y) => ((y + Math.round(Math.abs(x - 31.5))) % 6) < 2)(c); },
  checker(c, S) { on(S, (x, y) => (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0)(c); },
  spots(c, S, R) { const set = new Set(S.shell.map(([x, y]) => `${x},${y}`)); for (const [cx, cy] of spread(S.shell, 7, R)) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx * dx + dy * dy <= 3 && set.has(`${cx + dx},${cy + dy}`)) c.put(cx + dx, cy + dy, 'w'); },
  camo(c, S, R) { const set = new Set(S.shell.map(([x, y]) => `${x},${y}`)); spread(S.shell, 9, R).forEach(([cx, cy], i) => { const rx = 2 + R() * 2, ry = 1.5 + R() * 1.5, m = i % 3 === 2 ? 'x' : 'w';
    for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1 && set.has(`${cx + dx},${cy + dy}`)) c.put(cx + dx, cy + dy, m); }); },
};
const AIL = {
  pox(c, S, R) { for (const [x, y] of spread(S.shell, 8, R)) { c.ell(x, y, 1.7, 1.7, 'C', false); c.put(x - 0.5, y - 0.5, 'I'); } },
  warts(c, S, R) { for (const [x, y] of spread(S.shell, 6, R)) { c.ell(x, y, 2.3, 2, 'O', false); c.put(x - 0.5, y - 0.5, 'I'); } },
  rash(c, S, R) { const [cx, cy] = spread(S.shell, 1, R)[0] || [27, 40]; for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) if ((dx + dy) % 2 === 0 && dx * dx + dy * dy * 2 <= 16) c.put(cx + dx, cy + dy, 'C'); },
  bandaged(c, S, R) { const [cx, cy] = spread(S.shell, 1, R)[0] || [28, 40]; c.line(cx - 5, cy - 3, cx + 5, cy + 3, 'P', 4, false); c.line(cx - 5, cy + 3, cx + 5, cy - 3, 'P', 4, false); c.put(cx, cy, 'C'); },
  sniffles(c, S) { const { eye } = S, x = eye.l - 2; c.put(x, clampY(eye.y + 3), 'b'); c.put(x, clampY(eye.y + 4), 'b'); c.ell(x, clampY(eye.y + 6.5), 1.9, 2.2, 'b', false); c.put(x - 0.6, clampY(eye.y + 6), 'G'); },
  fever(c, S) { const { eye } = S; c.ell(eye.l - 1, clampY(eye.y + 2.5), 1.4, 1, 'C', false); c.ell(eye.r + 1, clampY(eye.y + 2.5), 1.4, 1, 'C', false);
    [[5, -4], [6, -5], [6, -6], [5, -7], [5, -8], [6, -9]].forEach(([dx, dy]) => c.put(eye.l - dx, clampY(eye.y + dy), 'Z')); }, // and a wisp of steam
  twitch(c, S) { const { eye } = S, x = eye.r + 3; [[0, -3], [1, -2], [0, -1], [1, 0], [0, 1], [3, -2], [4, -1], [3, 0]].forEach(([dx, dy]) => c.put(x + dx, clampY(eye.y + dy), 'Y')); },
  sideeye(c, S) { const { eye } = S; for (const ex of [eye.l, eye.r]) { c.put(ex, eye.y, 'E'); c.put(ex - 1, eye.y, 'G'); }
    [[0, -7], [0, -6], [0, -5], [0, -3]].forEach(([dx, dy]) => { c.put(eye.l - 6 + dx, clampY(eye.y + dy), 'Y'); c.put(eye.l - 5 + dx, clampY(eye.y + dy), 'Y'); }); }, // a big "!"
  sweats(c, S) { const { eye } = S; c.ell(eye.l - 4, clampY(eye.y - 1), 1.2, 1.7, 'b', false); c.ell(eye.r + 4, clampY(eye.y + 1), 1.2, 1.7, 'b', false); c.ell(eye.r + 6, clampY(eye.y - 4), 0.9, 1.3, 'b', false); },
  grin(c, S) { const { eye } = S, y = clampY(eye.y + 3); c.line(eye.l - 1, y, eye.r + 1, y, 'Z', 2, false); c.put(eye.l - 2, y - 1, 'Z'); c.put(eye.r + 2, y - 1, 'Z'); for (let x = eye.l + 1; x < eye.r; x += 2) c.put(x, y + 1, 'o'); },
  cloud(c, S) { const x = 13, y = Math.max(6, Math.min(14, S.eye.y - 5)); c.ell(x, y, 5.5, 2.4, 'g', false); c.ell(x - 2, y - 2, 3, 2.2, 'g', false); c.ell(x + 2.5, y - 1.4, 2.4, 2, 'g', false);
    for (const [dx, dy] of [[-3, 4], [0, 5], [3, 4], [-1, 7], [2, 8]]) c.put(x + dx, y + dy, 'b'); },
  tidy(c, S) { const y = clampY(S.eye.y + 7); c.poly([[27, y - 2.2], [31.5, y], [27, y + 2.2]], 'R'); c.ell(31.5, y, 1.1, 1.1, 'R', false); for (const d of [-1, 1]) c.put(28, y + d, 'T'); },
  nightowl(c, S) { const { eye } = S, y = clampY(eye.y + 2.2); for (const ex of [eye.l, eye.r]) c.ell(ex, y, 1.6, 0.8, 'p', false);
    const zx = eye.l - 10, zy = Math.max(2, eye.y - 9); [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2], [4, -3], [5, -3], [4, -2], [5, -2]].forEach(([dx, dy]) => c.put(zx + dx, clampY(zy + dy), 'Z')); },
  dizzy(c, S) { const y = Math.max(3, S.eye.y - 7); for (const [x, yy] of [[23, y + 1], [41, y], [32, y - 3]]) { c.put(x, clampY(yy), 'Y'); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) c.put(x + dx, clampY(yy + dy), 'Y'); } },
};
// a few pixels each, toned into the body: you see them only up close
const FRUIT = {
  sprig(c, S) { const { eye } = S; c.put(eye.r + 2, clampY(eye.y - 3), 'y'); c.put(eye.r + 3, clampY(eye.y - 4), 'y'); },
  seeds(c, S, R) { for (const [x, y] of spread(S.shell, 3, R)) c.put(x, y, 's'); },
  stem(c, S) { const y = clampY(S.bottom + 1); c.put(31.5, y, 'q'); c.put(32.5, clampY(y + 1), 'y'); },
  pea(c, S) { const y = clampY(S.bottom - 2), x = 31.5 + Math.max(3, S.width(y) / 2 - 1); c.put(x, y, 'y'); c.put(x, clampY(y + 1), 'y'); c.put(x - 1, clampY(y + 2), 'y'); },
  peel(c, S, R) { const [x, y] = spread(S.shell, 1, R)[0] || [26, 40]; c.put(x, y, 's'); c.put(x, y + 1, 's'); c.put(x + 0.5, y + 2, 's'); },
  tuft(c, S) { const y = clampY(S.bottom + 1); c.put(31.5, y, 'y'); c.put(30.5, clampY(y + 1), 'y'); c.put(32.5, clampY(y + 1), 'y'); },
  rib(c, S) { const { top, bottom } = S; for (const t of [0.3]) { const pts = []; for (let y = top + 3; y <= bottom - 2; y++) pts.push([31.5 - Math.max(2, S.width(y) / 2) * t - 0.5, y]); c.hair(pts, 'T'); } },
  grape(c, S) { const y = clampY(S.bottom), x = 31.5 + Math.max(3, S.width(y - 2) / 2 - 1); c.put(x, y, 'r'); c.put(x + 1, y, 'r'); c.put(x + 0.5, clampY(y + 1), 'r'); },
};

/**
 * The species' mining tool (server/engine/tools.js), held in its right hand: the handle at the hand, the business end
 * up and out to the right. Bold materials and whole-pixel shapes, so it reads at thumbnail size.
 */
export function drawTool(c, S, tool, hand = null) {
  const D = TOOL_ART[tool]; if (!D) return;
  const h = Math.max(10, S.bottom - S.top), row = Math.round(S.top + h * 0.2);
  const hx = hand ? hand.x : Math.max(38, Math.min(47, S.rows[row].r + 2)), hy = hand ? hand.y : Math.max(17, Math.min(40, row)), k = hand ? 1.45 : 1.2; // a touch bigger than life, to read small
  // in a machine's hand it is bigger still, and turned up (25 degrees) so it stays in the frame
  const ca = hand ? Math.cos(0.44) : 1, sa = hand ? Math.sin(0.44) : 0;
  const P = (dx, dy) => [hx + (dx * ca - dy * sa) * k, hy - (dx * sa + dy * ca) * k];
  const line = (a, b, m, w = 1) => c.line(...P(...a), ...P(...b), m, hand && w > 1 ? w + 1 : w, false);
  const ell = (a, rx, ry, m) => c.ell(...P(...a), rx * (hand ? k : 1), ry * (hand ? k : 1), m, false);
  const put = (a, m) => c.put(...P(...a), m);
  D({ line, ell, put });
  ell([0, 0], 1.3, 1.3, 'D'); // the hand round the grip
}
const TOOL_ART = {
  pickaxe: ({ line, put }) => { line([0, 0], [8, 8], 'Q'); line([3, 10], [7, 9], 'M', 2); line([7, 9], [10, 4], 'M', 2); put([2.5, 10.5], 'Z'); put([10.5, 3.5], 'Z'); },
  shovel: ({ line, ell, put }) => { line([0, 0], [8, 8], 'Q'); line([-1.5, -0.5], [0.5, -1.5], 'J'); ell([10, 10], 2.4, 2.4, 'M'); put([11, 11], 'Z'); },
  handdrill: ({ line, ell }) => { line([0, 0], [8, 8], 'M', 2); ell([4, 4], 2, 2, 'J'); line([4, 4], [6.5, 1.5], 'Q'); line([8, 8], [11.5, 11.5], 'Z'); },
  jackhammer: ({ line }) => { line([-1.5, 2.5], [2.5, -1.5], 'M', 2); line([1, 1], [6, 6], 'K', 3); line([6, 6], [10.5, 10.5], 'Z'); },
  sledge: ({ line, put }) => { line([0, 0], [8, 8], 'Q'); line([6, 10.5], [10.5, 6], 'M', 3); put([7, 10], 'Z'); },
  chisel: ({ line, put }) => { line([0, 0], [6, 6], 'M', 2); line([6, 6], [9, 9], 'Z'); put([-0.5, -0.5], 'Z'); },
  goldpan: ({ ell, put }) => { ell([6, 5], 4.5, 3.2, 'M'); ell([6, 5.2], 3, 2, 'Q'); put([5, 5], 'Y'); put([7, 4.5], 'Y'); },
  plunger: ({ line, ell, put }) => { ell([5, 3], 3.2, 2.4, 'Q'); line([5, 5], [5, 9], 'M'); line([2.5, 9], [7.5, 9], 'M', 2); put([2, 1.5], 'R'); put([8, 1.5], 'R'); },
  orehook: ({ line, put }) => { line([0, 0], [7, 7], 'M'); line([7, 7], [9.5, 9.5], 'M'); line([9.5, 9.5], [11, 8], 'M'); line([11, 8], [10, 6.5], 'M'); put([0, 0], 'K'); },
  spoon: ({ line, ell }) => { line([0, 0], [11, 11], 'M'); ell([12, 12], 1.4, 1.4, 'Z'); },
  gad: ({ line, put }) => { line([1, 1], [5, 5], 'M', 3); line([5, 5], [7.5, 7.5], 'Z', 1); put([0.5, 0.5], 'Z'); },
  moil: ({ line, ell }) => { line([0, 0], [10, 10], 'Z'); ell([2.5, 2.5], 1.2, 1.2, 'M'); },
  singlejack: ({ line, put }) => { line([0, 0], [5, 5], 'Q'); line([3.5, 7.5], [7.5, 3.5], 'M', 2); put([4, 7], 'Z'); },
  doublejack: ({ line, put }) => { line([0, 0], [10, 10], 'Q'); line([8, 12.5], [12.5, 8], 'M', 3); put([9, 12], 'Z'); },
  tamper: ({ line, put }) => { line([0, 0], [11, 11], 'F'); put([0, 0], 'Q'); put([11, 11], 'Q'); },
  canary: ({ line, ell, put }) => { line([0, 0], [2.5, 2.5], 'J'); ell([5, 6], 3.2, 3.6, 'J'); ell([5, 6], 2.2, 2.6, 'K'); ell([5, 5.5], 1.3, 1.1, 'Y'); put([6, 6.2], 'Y'); put([5, 10], 'J'); },
  carbide: ({ ell, put }) => { ell([3.5, 3.5], 2, 2.6, 'J'); ell([6.5, 5], 1.6, 2.2, 'Z'); put([8.5, 5.5], 'Y'); put([9.5, 6], 'Y'); },
  scaling: ({ line }) => { line([0, 0], [11, 11], 'M'); line([11, 11], [13, 10], 'Z'); },
  dolly: ({ line }) => { line([0, 0], [7, 7], 'M', 2); line([7, 7], [11, 6], 'M', 2); },
  pollpick: ({ line, ell, put }) => { line([0, 0], [8, 8], 'Q'); line([4.5, 10], [10, 4.5], 'M', 2); ell([4, 10.5], 1.4, 1.4, 'M'); put([10.5, 3.5], 'Z'); },
  davy: ({ line, ell, put }) => { ell([4, 2], 2.4, 1.2, 'J'); line([4, 3], [4, 8], 'Z', 3); put([4, 5.5], 'Y'); ell([4, 9], 2.4, 1.2, 'J'); put([4, 11], 'J'); },
  riffle: ({ line, put }) => { line([0, 1], [10, 6], 'Q', 3); for (const t of [2, 4.5, 7]) put([t, 1 + t / 2], 'M'); put([9, 5.5], 'Y'); },
  rocker: ({ line, put }) => { line([2, 3], [9, 6], 'Q', 4); line([1, 1], [10, 4], 'J'); line([9, 7], [10, 11], 'Q'); put([5, 5], 'S'); },
  drillsteel: ({ line, put }) => { line([0, 0], [12, 12], 'Z'); put([0, 0], 'M'); put([12, 12], 'M'); put([11.5, 12.5], 'Z'); put([12.5, 11.5], 'Z'); },
};

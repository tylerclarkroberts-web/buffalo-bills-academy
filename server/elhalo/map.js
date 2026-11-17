// EL HALO horde map, shared by the server (collision, enemy routes, hit checks) and the client (world.js draws it).
// Pure data and maths: no three.js, no DOM. An original layout of the long-box-canyon kind: solid cliff walls on both
// sides (the visible rock face is the same plane the server collides with), a shallow creek winding down the middle, rolling hills, an adobe fort at each end, and three buildings you
// can run through (a mission, La Michoacana ice-cream parlour and a mansion). Every door and window is open: no boards.
// Units are metres; x runs across the canyon, z runs along it (north is -z).

export const BOUNDS = { x0: -24, x1: 24, z0: -64, z1: 64 };
export const STEP = 0.45;      // what you can walk up without jumping
// The visible rock face sits on this rectangle (world.js draws it there). Bodies are kept a
// radius inside the face so nobody melts into the mesh. Thick slabs just outside the face stop
// rays, leaps, launches, the jeep, and anything else that would otherwise pass through the rock.
export const CANYON_THICK = 8;
export const CANYON_Y0 = -20;
export const CANYON_Y1 = 40;
export const CANYON_WALLS = [
  { x0: BOUNDS.x0 - CANYON_THICK, x1: BOUNDS.x0, y0: CANYON_Y0, y1: CANYON_Y1, z0: BOUNDS.z0 - CANYON_THICK, z1: BOUNDS.z1 + CANYON_THICK, k: 'canyon' },
  { x0: BOUNDS.x1, x1: BOUNDS.x1 + CANYON_THICK, y0: CANYON_Y0, y1: CANYON_Y1, z0: BOUNDS.z0 - CANYON_THICK, z1: BOUNDS.z1 + CANYON_THICK, k: 'canyon' },
  { x0: BOUNDS.x0, x1: BOUNDS.x1, y0: CANYON_Y0, y1: CANYON_Y1, z0: BOUNDS.z0 - CANYON_THICK, z1: BOUNDS.z0, k: 'canyon' },
  { x0: BOUNDS.x0, x1: BOUNDS.x1, y0: CANYON_Y0, y1: CANYON_Y1, z0: BOUNDS.z1, z1: BOUNDS.z1 + CANYON_THICK, k: 'canyon' },
];
export function inCanyon(x, z, r = 0) {
  return x >= BOUNDS.x0 + r && x <= BOUNDS.x1 - r && z >= BOUNDS.z0 + r && z <= BOUNDS.z1 - r;
}
export function clampInCanyon(o, r = 0) {
  o.x = Math.max(BOUNDS.x0 + r, Math.min(BOUNDS.x1 - r, o.x));
  o.z = Math.max(BOUNDS.z0 + r, Math.min(BOUNDS.z1 - r, o.z));
  return o;
}
// Push a circle of radius r out of the rock face. Used by collide, leap landings, launches, the jeep.
export function canyonCollide(o, r = 0) {
  for (const c of CANYON_WALLS) {
    const q = pushOut(o.x, o.z, r, c);
    if (q) { o.x = q.x; o.z = q.z; }
  }
  return clampInCanyon(o, r);
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const creekX = (z) => 2.6 * Math.sin(z * 0.055 + 0.6) + 1.2 * Math.sin(z * 0.13);

function hills(x, z) {
  const base = 0.9 * Math.sin(x * 0.17 + 0.8) * Math.cos(z * 0.06) + 0.7 * Math.sin(z * 0.09 + x * 0.04 + 1.3) + 0.35 * Math.cos(x * 0.31 - z * 0.13);
  const ex = Math.max(0, Math.abs(x) - 15), ez = Math.max(0, Math.abs(z) - 57);
  return 0.9 + base + ex * ex * 0.045 + ez * ez * 0.06;
}
function creekCut(x, z, h) {
  const d = Math.abs(x - creekX(z));
  if (d < 1.8) return h - 1.1;
  if (d < 4.5) return h - 1.1 * (1 - smooth((d - 1.8) / 2.7));
  return h;
}

// ---- buildings. Openings: side n|s|e|w, u = metres from the low corner along that side, w = width.
export const BUILDINGS = [
  { id: 'mision', name: 'LA MISIÓN', x0: -20, x1: -10, z0: -31, z1: -17, h: 4.6, wall: 0.45, open: true,
    openings: [{ side: 'e', u: 7, w: 1.8, door: true }, { side: 'e', u: 11.5, w: 1.3 }, { side: 'n', u: 5, w: 1.3 }, { side: 'w', u: 4, w: 1.3 }, { side: 'w', u: 10, w: 1.3 }, { side: 's', u: 5, w: 1.3 }],
    buy: { kind: 'ammo', x: -19.2, z: -24, label: 'PARQUE', cost: 500 } },
  // La Michoacana: a pink-and-white paletería. The storefront (two wide windows either side of the door) faces the creek.
  { id: 'michoacana', name: 'LA MICHOACANA', x0: 9, x1: 22, z0: -2, z1: 8, h: 4.2, wall: 0.45, open: true,
    openings: [{ side: 'w', u: 2.3, w: 2.6 }, { side: 'w', u: 5, w: 1.8, door: true }, { side: 'w', u: 7.7, w: 2.6 }, { side: 'n', u: 6.5, w: 1.3 }, { side: 's', u: 10.5, w: 1.3 }],
    buy: { kind: 'ammo', x: 12, z: -1.2, label: 'PARQUE', cost: 500 } },
  { id: 'mansion', name: 'LA MANSIÓN', x0: -21, x1: -8, z0: 22, z1: 34, h: 5.2, wall: 0.45, open: true,
    openings: [{ side: 'e', u: 6, w: 2, door: true }, { side: 'e', u: 2.4, w: 1.3 }, { side: 'e', u: 9.6, w: 1.3 }, { side: 'n', u: 6.5, w: 1.3 }, { side: 's', u: 6.5, w: 1.3 }, { side: 'w', u: 6, w: 1.3 }],
    buy: { kind: 'grenade', x: -17.5, z: 33.2, label: 'PIÑATAS', cost: 750 } },
];
// La Michoacana's freezer cases: a long one on the back wall, a glass-front one along the south wall (solid, waist high)
export const CASES = [{ x0: 20.45, x1: 21.5, z0: 0.2, z1: 5.8, h: 1.05, glass: 'top' }, { x0: 11.5, x1: 16.5, z0: 6.65, z1: 7.5, h: 1.15, glass: 'front' }];
// the elote man and his cart, out front of La Michoacana on the creek side. Harmless scenery: no collider, nobody aims at him.
export const ELOTE = { x: 7.5, z: 11, yaw: Math.PI * 0.75, range: 2.4 };
// forts at each end (cover, a roof deck you reach by an outside stair; no boards). s=+1 north, s=-1 south (turned round).
export const FORTS = [
  { id: 'norte', name: 'FORTÍN NORTE', s: 1 },
  { id: 'sur', name: 'FORTÍN SUR', s: -1 },
];
const FORT = { x0: -6, x1: 6, z0: -58, z1: -48, h: 3.2, wall: 0.5 };
const fortRect = (f) => (f.s > 0 ? { x0: FORT.x0, x1: FORT.x1, z0: FORT.z0, z1: FORT.z1 } : { x0: -FORT.x1, x1: -FORT.x0, z0: -FORT.z1, z1: -FORT.z0 });

// flattened pads under everything you build on
const PADS = [
  ...BUILDINGS.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })),
  ...FORTS.map((f) => { const r = fortRect(f); return { x0: r.x0 - 2, x1: r.x1 + 2, z0: r.z0, z1: r.z1 }; }),
].map((p) => ({ ...p, y: Math.round(hills((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2) * 4) / 4 }));
const padOf = (r) => PADS.find((p) => p.x0 <= r.x0 && p.x1 >= r.x1 && p.z0 <= r.z0 && p.z1 >= r.z1);

export function terrain(x, z) {
  let h = creekCut(x, z, hills(x, z));
  let bw = 0, by = 0;
  for (const p of PADS) {
    const dx = Math.max(p.x0 - 1 - x, 0, x - p.x1 - 1), dz = Math.max(p.z0 - 1 - z, 0, z - p.z1 - 1);
    const w = 1 - smooth(Math.hypot(dx, dz) / 4);
    if (w > bw) { bw = w; by = p.y; }
  }
  if (bw > 0) h = h + (by - h) * bw;
  return h;
}

// ---- spawns
// La Bufadora: a rocky blowhole in the creek just before Fortín Sur, near the south mouth of the canyon.
export const BUFADORA = ((z = 45.5) => {
  const x = creekX(z);
  return { x, z, r: 2.2, rockR: 3.15 };
})();

export const ENEMY_SPAWNS = [[-22.5, -40], [22.5, -28], [-22.5, -4], [22.5, 20], [-22.5, 46], [22.5, 44], [0, -62.5], [-12, -62], [12, -62], [0, 62.5], [12, 62], [-12, 62]];
export const PLAYER_SPAWNS = [[0, -44], [3.5, -44], [-3.5, 44], [0, 44], [2, -8], [-4, 12], [6, 18], [-2, -20]];

// ---- static geometry. Every box: { x0,x1,y0,y1,z0,z1, k: kind, b: owner id, solid, sill? }
function sideSegs(len, openings) { // split a wall side into solid runs between the openings
  const cuts = openings.map((o) => [o.u - o.w / 2, o.u + o.w / 2]).sort((a, b) => a[0] - b[0]);
  const out = []; let at = 0;
  for (const [a, b] of cuts) { if (a > at) out.push([at, a]); at = b; }
  if (at < len) out.push([at, len]);
  return out;
}
function sideBox(r, side, u0, u1, y0, y1, t) { // a slab along one side of rect r, from u0 to u1 along it
  if (side === 'n') return { x0: r.x0 + u0, x1: r.x0 + u1, z0: r.z0, z1: r.z0 + t, y0, y1 };
  if (side === 's') return { x0: r.x0 + u0, x1: r.x0 + u1, z0: r.z1 - t, z1: r.z1, y0, y1 };
  if (side === 'w') return { x0: r.x0, x1: r.x0 + t, z0: r.z0 + u0, z1: r.z0 + u1, y0, y1 };
  return { x0: r.x1 - t, x1: r.x1, z0: r.z0 + u0, z1: r.z0 + u1, y0, y1 };
}
const sideLen = (r, side) => (side === 'n' || side === 's' ? r.x1 - r.x0 : r.z1 - r.z0);

function buildStatic() {
  const boxes = [], openings = [], circles = [], doors = [];
  const add = (b, k, owner, solid = true, extra = {}) => { boxes.push({ ...b, k, b: owner, solid, ...extra }); };
  for (const bd of BUILDINGS) {
    const pad = padOf(bd), y = pad.y, t = bd.wall;
    for (const side of ['n', 's', 'e', 'w']) {
      const ops = bd.openings.filter((o) => o.side === side);
      const len = sideLen(bd, side);
      for (const [a, b] of sideSegs(len, ops)) add(sideBox(bd, side, a, b, y - 0.6, y + bd.h, t), 'wall', bd.id);
      for (const o of ops) {
        const top = o.door ? 2.4 : 2.1, sill = o.door ? 0 : 0.9;
        if (sill) add(sideBox(bd, side, o.u - o.w / 2, o.u + o.w / 2, y - 0.6, y + sill, t), 'sill', bd.id, true, { sill: true });
        add(sideBox(bd, side, o.u - o.w / 2, o.u + o.w / 2, y + top, y + bd.h, t), 'lintel', bd.id);
        const bar = sideBox(bd, side, o.u - o.w / 2, o.u + o.w / 2, y + sill, y + top, t);
        const cx = (bar.x0 + bar.x1) / 2, cz = (bar.z0 + bar.z1) / 2;
        const nx = side === 'e' ? 1 : side === 'w' ? -1 : 0, nz = side === 's' ? 1 : side === 'n' ? -1 : 0; // outward normal
        openings.push({ i: openings.length, b: bd.id, side, door: !!o.door, open: true, w: o.w, y0: y + sill, y1: y + top, x: cx, z: cz, y,
          nx, nz, out: { x: cx + nx * 1.3, z: cz + nz * 1.3 }, in: { x: cx - nx * 1.3, z: cz - nz * 1.3 }, box: { ...bar, y0: y - 0.6, y1: y + top } });
      }
    }
    add({ x0: bd.x0 - 0.3, x1: bd.x1 + 0.3, z0: bd.z0 - 0.3, z1: bd.z1 + 0.3, y0: y + bd.h, y1: y + bd.h + 0.3 }, 'roof', bd.id, false);
    if (bd.id === 'mision') { // bell tower at the front corner, solid
      add({ x0: -12.6, x1: -9.4, z0: -33.6, z1: -30.4, y0: y - 0.6, y1: y + 8.6 }, 'tower', bd.id);
    }
    if (bd.id === 'michoacana') for (const c of CASES) add({ ...c, y0: y - 0.6, y1: y + c.h }, 'case', bd.id, true, { glass: c.glass });
  }
  for (const f of FORTS) {
    const r = fortRect(f), pad = padOf(r), y = pad.y, t = FORT.wall, s = f.s;
    // doorways: two facing the canyon, one facing the end wall
    const facing = s > 0 ? 's' : 'n', back = s > 0 ? 'n' : 's';
    const ops = { [facing]: [{ u: 3, w: 1.8 }, { u: 9, w: 1.8 }], [back]: [{ u: 6, w: 1.8 }], e: [], w: [] };
    for (const side of ['n', 's', 'e', 'w']) {
      for (const [a, b] of sideSegs(sideLen(r, side), ops[side])) add(sideBox(r, side, a, b, y - 0.6, y + FORT.h, t), 'fortwall', f.id);
      for (const o of ops[side]) {
        add(sideBox(r, side, o.u - o.w / 2, o.u + o.w / 2, y + 2.4, y + FORT.h, t), 'lintel', f.id);
        const b = sideBox(r, side, o.u - o.w / 2, o.u + o.w / 2, 0, 1, t), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const nx = side === 'e' ? 1 : side === 'w' ? -1 : 0, nz = side === 's' ? 1 : side === 'n' ? -1 : 0;
        doors.push({ f: f.id, x: cx, z: cz, out: { x: cx + nx * 1.3, z: cz + nz * 1.3 }, in: { x: cx - nx * 1.3, z: cz - nz * 1.3 } });
      }
    }
    add({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: y + FORT.h - 0.2, y1: y + FORT.h + 0.05 }, 'deck', f.id);
    // two outside stairs up to the deck, one along each side wall: 8 steps of 0.4 (the horde uses them too)
    for (const side of [1, -1]) {
      for (let i = 0; i < 8; i++) {
        const za = -48.6 - (i + 1) * 1.1, zb = -48.6 - i * 1.1, xa = 6, xb = 7.5;
        const st0 = side > 0 ? { x0: xa, x1: xb } : { x0: -xb, x1: -xa };
        const st = s > 0 ? { ...st0, z0: za, z1: zb } : { x0: -st0.x1, x1: -st0.x0, z0: -zb, z1: -za };
        add({ ...st, y0: y - 0.6, y1: y + (i + 1) * 0.4 }, 'step', f.id);
      }
    }
  }
  // boulders (circle colliders), placed off the pads and out of the creek
  const R = rng(4242);
  for (let i = 0, tries = 0; i < 16 && tries < 400; tries++) {
    const x = BOUNDS.x0 + 2 + R() * (BOUNDS.x1 - BOUNDS.x0 - 4), z = BOUNDS.z0 + 6 + R() * (BOUNDS.z1 - BOUNDS.z0 - 12);
    if (Math.abs(x - creekX(z)) < 4) continue;
    if (PADS.some((p) => x > p.x0 - 3 && x < p.x1 + 3 && z > p.z0 - 3 && z < p.z1 + 3)) continue;
    if ([...ENEMY_SPAWNS, ...PLAYER_SPAWNS].some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 4)) continue;
    const r = 0.8 + R() * 0.9, y = terrain(x, z);
    circles.push({ x, z, r, y0: y - 0.5, y1: y + r * 1.1, k: 'rock' }); i++;
  }
  return { boxes, openings, circles, doors };
}
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const MAP = buildStatic();
export const OPENINGS = MAP.openings;
export const SOLIDS = [...MAP.boxes.filter((b) => b.solid), ...MAP.circles];
export const STATIONS = BUILDINGS.map((b, i) => ({ i, b: b.id, ...b.buy, y: padOf(b).y }));
export const buildingAt = (x, z) => BUILDINGS.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) || null;
export const fortRects = FORTS.map((f) => ({ id: f.id, ...fortRect(f), y: padOf(fortRect(f)).y, h: FORT.h, doors: MAP.doors.filter((d) => d.f === f.id) }));
// inside a fort, down on its floor (not up on the deck)
export const fortAt = (x, z, y) => fortRects.find((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && (y === undefined || y < f.y + 2.4)) || null;
// obstacle rects (slightly padded) enemies walk round when they are not trying to get in
export const OBSTACLES = [...BUILDINGS.map((b) => ({ id: b.id, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })), ...fortRects.map((f) => ({ id: f.id, x0: f.x0 - 1.5, x1: f.x1 + 1.5, z0: f.z0, z1: f.z1 }))];
// the ways up a fort: bottom of a stair, its top, then onto the deck (one stair on each side)
export const FORT_ROUTES = Object.fromEntries(fortRects.map((f) => {
  const s = f.id === 'norte' ? 1 : -1;
  return [f.id, [1, -1].map((side) => [{ x: 6.75 * side, z: -47.4 * s }, { x: 6.75 * side, z: -57.2 * s }, { x: 4.5 * side, z: -56 * s }])];
}));
export const FORT_DECK = FORT.h + 0.05; // deck surface above the fort's pad

// ---- the supply truck's drive through the canyon: in from the north caves, two stops, out the south end
export const TRUCK_PATH = [[11, -68], [11, -44], [9, -30], [7.5, -18], [3, -4], [-1, 10], [-1, 22], [1.5, 37], [-14, 45], [-15, 68]];
export const TRUCK_STOPS = [{ at: 3, secs: 4 }, { at: 6, secs: 4 }]; // stop at these path points
export const TRUCK_SPEED = 11;
function truckPlan() {
  const legs = []; let t = 0;
  for (let i = 0; i < TRUCK_PATH.length - 1; i++) {
    const [ax, az] = TRUCK_PATH[i], [bx, bz] = TRUCK_PATH[i + 1], len = Math.hypot(bx - ax, bz - az);
    legs.push({ a: [ax, az], b: [bx, bz], t0: t, t1: t + len / TRUCK_SPEED }); t += len / TRUCK_SPEED;
    const stop = TRUCK_STOPS.find((s) => s.at === i + 1);
    if (stop) { legs.push({ a: [bx, bz], b: [bx, bz], t0: t, t1: t + stop.secs, stop: true, yaw: Math.atan2(-(bx - ax), -(bz - az)) }); t += stop.secs; }
  }
  return { legs, secs: t };
}
export const TRUCK = truckPlan();
// where the truck is `t` seconds into its drive: { x, z, yaw, stopped, done }
export function truckAt(t) {
  const L = TRUCK.legs;
  if (t >= TRUCK.secs) { const l = L[L.length - 1]; return { x: l.b[0], z: l.b[1], yaw: Math.atan2(-(l.b[0] - l.a[0]), -(l.b[1] - l.a[1])), stopped: false, done: true }; }
  const l = L.find((q) => t <= q.t1) || L[0];
  if (l.stop) return { x: l.a[0], z: l.a[1], yaw: l.yaw, stopped: true, done: false };
  const k = Math.max(0, Math.min(1, (t - l.t0) / (l.t1 - l.t0)));
  return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, yaw: Math.atan2(-(l.b[0] - l.a[0]), -(l.b[1] - l.a[1])), stopped: false, done: false };
}
// ammo crates and grenades turn up at these spots now and then (out in the open, never inside a wall)
export const AMMO_SPOTS = [[0, -30], [-6, -6], [16, -14], [6, 14], [-4, 32], [14, 30], [-16, 4], [2, -40], [-2, 40]];
export const NADE_SPOTS = [[-8, -40], [18, 16], [-18, 14], [8, -10], [0, 52], [0, -52], [12, 44]];
export const JEEP_SPAWN = { x: 0, z: -2, yaw: 0 };

// ---- queries
export function groundAt(x, z, feet) {
  let h = terrain(x, z);
  for (const c of SOLIDS) {
    if (c.r) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && c.y1 <= feet + STEP && c.y1 > h) h = c.y1; }
    else if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= feet + STEP && c.y1 > h) h = c.y1;
  }
  return h;
}

// Push a circle (x, z, r) out of a box's footprint. Returns the corrected position or null.
export function pushOut(x, z, r, b) {
  const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; return { x: x + dx * k, z: z + dz * k }; }
  const opts = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]];
  opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
  return { x: x + opts[0][0], z: z + opts[0][1] };
}

// Move o {x,z} out of everything solid for a body of radius r standing at `feet`, `height` tall. skipSills: enemies climb through windows.
export function collide(o, r, feet, height, skipSills = false) {
  for (const c of SOLIDS) {
    if (c.y1 <= feet + STEP || c.y0 >= feet + height) continue;
    if (skipSills && c.sill) continue;
    if (c.r) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-6) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } }
    else { const q = pushOut(o.x, o.z, r, c); if (q) { o.x = q.x; o.z = q.z; } }
  }
  canyonCollide(o, r);
}

// Ray against an axis-aligned box {x0,x1,y0,y1,z0,z1}: entry distance or Infinity (slab method).
export function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  const ax = [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]];
  for (let i = 0; i < 3; i++) {
    const [oa, da, lo, hi] = ax[i];
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return Infinity; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Distance along a ray to the first wall, rock or bit of ground (capped at max).
export function wallDist(o, d, max, noGround = false) {
  let best = max;
  for (const c of SOLIDS) {
    const b = c.r ? { x0: c.x - c.r * 0.8, x1: c.x + c.r * 0.8, z0: c.z - c.r * 0.8, z1: c.z + c.r * 0.8, y0: c.y0, y1: c.y1 } : c;
    const h = rayBox(o, d, b); if (h < best) best = h;
  }
  for (const c of CANYON_WALLS) { const h = rayBox(o, d, c); if (h < best) best = h; }
  if (!noGround && d.y < 0.5) for (let s = 0.5; s < best; s += 0.5) { if (o.y + d.y * s < terrain(o.x + d.x * s, o.z + d.z * s)) { best = s; break; } }
  return best;
}
const inBox = (p, c) => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 && p.y > c.y0 && p.y < c.y1;
export const insideSolid = (p) => SOLIDS.some((c) => (c.r ? (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < c.r * c.r && p.y > c.y0 && p.y < c.y1 : inBox(p, c))) || CANYON_WALLS.some((c) => inBox(p, c));

// Does the segment a→b (xz) cross rect r (padded by m)? Liang-Barsky.
export function segHitsRect(a, b, r, m = 0) {
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z;
  const p = [-dx, dx, -dz, dz], q = [a.x - (r.x0 - m), (r.x1 + m) - a.x, a.z - (r.z0 - m), (r.z1 + m) - a.z];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

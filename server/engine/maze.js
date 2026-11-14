// Seeded maze for one mine shift: recursive backtracker on an N×N cell grid,
// returned as a tile grid (1 = rock, 0 = tunnel). The acid pool sits a fair walk from the start.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * opts (difficulty tiers, engine/mine-tiers.js): `loops` extra openings on top of the usual few, then `caves`
 * cave-ins. A cave-in is rubble (grid value 2: solid like rock, drawn as a fallen roof) dropped on a straight bit of
 * hallway that sits on a loop, so blocking it only ever forces a detour: every open tile, the elevator and every
 * pool chosen afterwards stay reachable. Without opts the maze is exactly what it always was.
 */
export function makeMaze(seed, n = 7, targetSteps = 34, opts = null) {
  const r = rng(seed);
  const W = 2 * n + 1;
  const g = Array.from({ length: W }, () => new Array(W).fill(1));
  const seen = new Set();
  const stack = [[0, 0]];
  seen.add('0,0'); g[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && !seen.has(`${x},${y}`));
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(r() * nb.length)];
    g[2 * cy + 1 + (ny - cy)][2 * cx + 1 + (nx - cx)] = 0;
    g[2 * ny + 1][2 * nx + 1] = 0;
    seen.add(`${nx},${ny}`); stack.push([nx, ny]);
  }
  // A few extra openings so it isn't a perfect maze (loops make it feel like old workings).
  for (let k = 0; k < n; k++) {
    const x = 1 + Math.floor(r() * (W - 2)), y = 1 + Math.floor(r() * (W - 2));
    if (g[y][x] === 1 && ((g[y][x - 1] === 0 && g[y][x + 1] === 0) || (g[y - 1][x] === 0 && g[y + 1][x] === 0))) g[y][x] = 0;
  }
  if (opts) {
    for (let k = 0; k < (opts.loops || 0); k++) {
      const x = 1 + Math.floor(r() * (W - 2)), y = 1 + Math.floor(r() * (W - 2));
      if (g[y][x] === 1 && ((g[y][x - 1] === 0 && g[y][x + 1] === 0) || (g[y - 1][x] === 0 && g[y + 1][x] === 0))) g[y][x] = 0;
    }
    if (opts.caves) caveIn(g, r, opts.caves);
  }
  // Breadth-first distances (in tiles) from the start.
  const dist = Array.from({ length: W }, () => new Array(W).fill(-1));
  const q = [[1, 1]]; dist[1][1] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (g[Y][X] === 0 && dist[Y][X] < 0) { dist[Y][X] = dist[y][x] + 1; q.push([X, Y]); }
    }
  }
  // Pool: a dead end (or any cell) whose walking distance is closest to the target.
  let best = null;
  for (let y = 1; y < W; y += 2) for (let x = 1; x < W; x += 2) {
    if (dist[y][x] < 0) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => g[y + dy][x + dx] === 0).length;
    const score = Math.abs(dist[y][x] - targetSteps) - (open === 1 ? 3 : 0);
    if (!best || score < best.score) best = { x, y, score, steps: dist[y][x] };
  }
  // Facing: look down the first open corridor.
  const facing = g[1][2] === 0 ? 0 : Math.PI / 2;
  return { grid: g, size: W, start: { x: 1, y: 1 }, pool: { x: best.x, y: best.y }, steps: best.steps, facing, dist };
}

/** Rubble on a tunnel tile: impassable, but never on the way out. */
export const RUBBLE = 2;
const openCount = (g) => { let c = 0; for (const row of g) for (const v of row) if (v === 0) c++; return c; };
function reachable(g) {
  const W = g.length, seen = new Uint8Array(W * W), q = [[1, 1]]; seen[W + 1] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (g[Y]?.[X] === 0 && !seen[Y * W + X]) { seen[Y * W + X] = 1; q.push([X, Y]); } }
  }
  return q.length;
}
/** Drop up to `count` cave-ins, each on a straight hallway tile at least 4 steps from the elevator, keeping every tunnel connected. */
function caveIn(g, r, count) {
  const W = g.length, total = openCount(g);
  const near = new Set(); { const q = [[1, 1, 0]]; near.add('1,1'); for (let i = 0; i < q.length; i++) { const [x, y, d] = q[i]; if (d >= 3) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (g[Y][X] === 0 && !near.has(`${X},${Y}`)) { near.add(`${X},${Y}`); q.push([X, Y, d + 1]); } } } }
  const cand = [];
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== 0 || near.has(`${x},${y}`)) continue;
    const h = g[y][x - 1] === 0 && g[y][x + 1] === 0 && g[y - 1][x] && g[y + 1][x];
    const v = g[y - 1][x] === 0 && g[y + 1][x] === 0 && g[y][x - 1] && g[y][x + 1];
    if (h || v) cand.push([x, y]);
  }
  let open = total, placed = 0;
  while (placed < count && cand.length) {
    const [x, y] = cand.splice(Math.floor(r() * cand.length), 1)[0];
    // not next to another cave-in: one pile per hallway reads better than a wall of them
    if ([[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => g[y + dy]?.[x + dx] === RUBBLE)) continue;
    g[y][x] = RUBBLE;
    if (reachable(g) === open - 1) { open--; placed++; } else g[y][x] = 0;
  }
  return placed;
}

/** Walking distances (in tiles) from one tile to every other. */
export function distFrom(grid, sx, sy) {
  const W = grid.length; const d = Array.from({ length: W }, () => new Array(W).fill(-1));
  const q = [[sx, sy]]; d[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (grid[Y][X] === 0 && d[Y][X] < 0) { d[Y][X] = d[y][x] + 1; q.push([X, Y]); } }
  }
  return d;
}
/**
 * Dowsing rod: which way to turn to follow the shortest walk from one tile to another, in eighths of a turn
 * clockwise from straight ahead (0 = ahead, 2 = right, 4 = behind, 6 = left). Null when you are standing on it.
 */
export function rodHeading(grid, from, to, yaw) {
  const d = distFrom(grid, to.x, to.y);
  let best = null, bestD = d[from.y]?.[from.x] >= 0 ? d[from.y][from.x] : Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = d[from.y + dy]?.[from.x + dx];
    if (v >= 0 && v < bestD) { bestD = v; best = [dx, dy]; }
  }
  if (!best) return null;
  const ahead = -Math.sin(yaw) * best[0] - Math.cos(yaw) * best[1], right = Math.cos(yaw) * best[0] - Math.sin(yaw) * best[1];
  return (Math.round(Math.atan2(right, ahead) / (Math.PI / 4)) + 8) % 8;
}

/** Tiles to walk from a point (fractional tile coords) to wherever `d` was measured from: via this tile or an open neighbour, never through rock. */
export function pathSteps(d, fx, fy) {
  const x = Math.round(fx), y = Math.round(fy);
  let best = Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const s = d[y + dy]?.[x + dx];
    if (s >= 0) best = Math.min(best, Math.hypot(fx - x - dx, fy - y - dy) + s);
  }
  return best;
}
/** Facing the next tunnel toward the pool, not its bearing through rock; equal routes both count. */
export function geigerFacing(d, fx, fy, yaw) {
  const x = Math.round(fx), y = Math.round(fy), here = d[y]?.[x];
  if (!(here > 0)) return 0;
  let facing = -1, found = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const next = d[y + dy]?.[x + dx];
    if (next >= 0 && next < here) {
      facing = Math.max(facing, -Math.sin(yaw) * dx - Math.cos(yaw) * dy);
      found = true;
    }
  }
  return found ? facing : 0;
}
/** Distance dominates; facing nudges the meter without hiding an in-reach pool or declaring one early. */
export function geigerBars(steps, far = 48, facing = 0) {
  const level = 10 - 9 * Math.sqrt(Math.min(1, Math.max(0, steps - 0.85) / far));
  return Math.round(level) === 10 ? 10 : Math.max(1, Math.min(9, Math.round(level + 0.6 * facing)));
}
/** First pool's walking distance by maze size: a bigger mine starts you farther from the first glow. */
export const FIRST_POOL_STEPS = { 6: 20, 7: 26, 8: 34, 9: 42, 10: 50, 11: 60, 13: 76, 16: 96 };
/** How far apart later pools sit, by maze size. */
export const NEXT_POOL_STEPS = { 6: 22, 7: 26, 8: 30, 9: 34, 10: 38, 11: 42, 13: 50, 16: 60 };
/**
 * The vein: a seeded chain of pools, the first one where makeMaze put it, each next one a far dead end from the
 * last. The server alone knows which one actually has acid in it when you get there (it's about time, not place):
 * the client walks the chain, asking at each pool. Earlier pools turn out dry and stay behind as decoys.
 */
export function veinChain(maze, seed, k = 8) {
  return poolChain(maze, seed, k, false);
}

/** Finite deposits: keep each walk useful without sending miners to the farthest corner every time. */
export function bucketChain(maze, seed) {
  return poolChain(maze, seed, 8, true);
}

function poolChain(maze, seed, k, bucket) {
  const r = rng((seed ^ 0xac1d) >>> 0);
  const { grid, size } = maze;
  const target = NEXT_POOL_STEPS[(size - 1) / 2] ?? 42;
  const ends = [];
  for (let y = 1; y < size; y += 2) for (let x = 1; x < size; x += 2) {
    if (grid[y][x]) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => grid[y + dy][x + dx] === 0).length;
    if (open === 1 && !(x === 1 && y === 1)) ends.push({ x, y });
  }
  const chain = [maze.pool];
  const used = new Set([`${maze.pool.x},${maze.pool.y}`, '1,1']);
  while (chain.length < k) {
    const at = chain[chain.length - 1]; const d = distFrom(grid, at.x, at.y);
    const left = ends.filter((e) => !used.has(`${e.x},${e.y}`) && d[e.y][e.x] > 0).sort((a, b) => bucket
      ? Math.abs(d[a.y][a.x] - target) - Math.abs(d[b.y][b.x] - target)
      : d[b.y][b.x] - d[a.y][a.x]);
    if (!left.length) break;
    const pick = left[Math.floor(r() * Math.min(3, left.length))];
    chain.push(pick); used.add(`${pick.x},${pick.y}`);
  }
  chain.legs = chain.map((p, i) => (i ? distFrom(grid, chain[i - 1].x, chain[i - 1].y)[p.y][p.x] : maze.steps));
  return chain;
}

/** Things left in the tunnels, and how often a shift has each. Rolled separately, so a shift can have none or several. */
export const FINDS = [
  { id: 'hat', chance: 0.3 }, { id: 'cart', chance: 0.25 }, { id: 'sign', chance: 0.2 }, { id: 'art', chance: 0.18 },
  { id: 'cage', chance: 0.15 }, { id: 'exit', chance: 0.12 }, { id: 'chair', chance: 0.1 }, { id: 'bones', chance: 0.07 },
];
/**
 * Which finds this shift has and the wall each one sits against. Seeded and client-only, like the maze: scenery,
 * nothing the server pays for. Corners, junctions and dead ends only (beams stand in the straight runs), away from
 * the start and off any tile in `avoid` (pools, the egg).
 */
export function findSpots(maze, seed, avoid = []) {
  const r = rng((seed ^ 0xf1d5) >>> 0);
  const picked = FINDS.filter((f) => r() < f.chance); // every roll first, so placing one never shifts another's odds
  const { grid, dist, size } = maze, no = new Set(avoid.filter(Boolean).map((p) => `${p.x},${p.y}`));
  const spots = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (grid[y][x] || dist[y][x] < 3 || no.has(`${x},${y}`)) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => grid[y + dy][x + dx]);
    const straight = walls.length === 2 && walls[0][0] === -walls[1][0] && walls[0][1] === -walls[1][1];
    if (walls.length && !straight) spots.push({ x, y, walls });
  }
  return picked.flatMap((f) => {
    if (!spots.length) return [];
    const [s] = spots.splice(Math.floor(r() * spots.length), 1), [dx, dy] = s.walls[Math.floor(r() * s.walls.length)];
    return [{ id: f.id, x: s.x, y: s.y, dx, dy }];
  });
}

/**
 * v30: where this shift's egg lies (only when the server said the shift has one). A tunnel tile 2 to 5 steps from
 * the start, tucked against a wall so it never blocks the way. Purely where to draw it: the server decided whether
 * there is an egg, and the start, the pool and the vein are untouched by this.
 */
export function eggSpot(maze, seed) {
  const r = rng((seed ^ 0xe66e66) >>> 0);
  const { grid, dist, size } = maze;
  const c = [];
  // first choice: straight down the tunnel you face at clock-in, 2 to 4 tiles out, so the headlamp finds it
  const alongX = !grid[1][2];
  for (let k = 1; k <= 4; k++) { const x = alongX ? 1 + k : 1, y = alongX ? 1 : 1 + k; if (grid[y]?.[x] !== 0) break; if (k >= 2 && !(x === maze.pool.x && y === maze.pool.y)) c.push({ x, y }); }
  if (!c.length) for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (!grid[y][x] && dist[y][x] >= 2 && dist[y][x] <= 5 && !(x === maze.pool.x && y === maze.pool.y)) c.push({ x, y });
  if (!c.length) return null;
  const t = c[Math.floor(r() * c.length)];
  // lean it toward a wall: across the corridor's open axis
  const openX = !grid[t.y][t.x - 1] || !grid[t.y][t.x + 1];
  const s = r() < 0.5 ? -1 : 1;
  return { x: t.x, y: t.y, ox: openX ? 0 : s * 0.3, oy: openX ? s * 0.3 : 0 };
}

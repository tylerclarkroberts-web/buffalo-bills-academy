// Chasing the Heeshee Mazode (server/mazodeChase.js decides; the page only draws it). Pure: no clocks, no state, so
// node --test and the browser both use it. Distances are tiles; times are ms on the server's clock.
//
// It snatches your bug and bolts down a route the server picks through the day's tunnels, a couple of tiles ahead and
// at your own walking pace (WALK_SPEED, the most a phone stick moves you; Shift-run is off during a chase so a keyboard
// is no faster). 20 s in it slows by 10%, so whoever stayed on it gains about a tile every six seconds. Get a pick into
// it and it stops to laugh at you, then asks three riddles. Fall too far behind, or wander off, and it is gone.
import { WALK_SPEED } from './mine-movement.js';
import { rng } from './maze.js';

export const TILE_M = 2.2;                      // metres per tile (client/src/mines/scene.js TILE)
export const CHASE_SPEED = WALK_SPEED / TILE_M; // tiles/s: exactly your pace
export const HEAD_START = 2.4;                  // tiles along its route when it bolts: just out of reach
export const SLOW_AFTER_MS = 20_000;            // then it slows...
export const SLOW_FACTOR = 0.9;                 // ...by 10%
export const CHASE_MAX_MS = 75_000;             // nobody stays interested forever: after this it simply leaves
export const LOSE_TILES = 9;                    // further behind than this (through the tunnels, not as the crow flies)...
export const LOSE_MS = 3_000;                   // ...for this long, and it has lost you
export const LEFT_MS = 5_000;                   // no heartbeat this long (closed the tab, reloaded, battle froze you): gone
export const HIT_REACH = 1.6;                   // tiles, as the crow flies, between you and it...
export const HIT_TILES = 2;                     // ...and no more than two steps apart through the tunnels (round a corner yes, through rock no)
export const HIT_GAP_MS = 250;                  // the fastest a pickaxe comes round (same as the old-timers)
export const POSE_FRESH_MS = 1_500;             // a hit only counts from a recent checked position
export const LAUGH_MS = 6_000;                  // the condescending speech before the first riddle
export const BEAT_MS = 1_800;                   // "Hm. Lucky." between riddles
export const RIDDLE_MS = 20_000;                // per riddle
export const ANSWER_GRACE_MS = 600;             // network slack on the deadline
export const FLEE_LAUGH_MS = 1_800;             // it laughs at you first...
export const FLEE_FACTOR = 3;                   // ...then runs at three times your pace...
export const FLEE_MS = 15_000;                  // ...for 15 s, and is gone
export const ROUTE_MIN = 240;                   // tiles: longer than the longest chase plus the getaway
export const CEIL_MAX = 8;                      // tiles it stays up on the roof when it doubles back (by then it is past you)

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;

/** Tunnel distances (in tiles) from (x, y), with the step each tile was reached from. */
export function bfsFrom(grid, x, y) {
  const h = grid.length, w = grid[0]?.length || 0;
  const dist = Array.from({ length: h }, () => new Array(w).fill(-1)), prev = Array.from({ length: h }, () => new Array(w).fill(null));
  if (!open(grid, x, y)) return { dist, prev };
  dist[y][x] = 0; const q = [[x, y]];
  for (let i = 0; i < q.length; i++) {
    const [cx, cy] = q[i];
    for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy; if (open(grid, nx, ny) && dist[ny][nx] < 0) { dist[ny][nx] = dist[cy][cx] + 1; prev[ny][nx] = [cx, cy]; q.push([nx, ny]); } }
  }
  return { dist, prev };
}
/** Steps through the tunnels between two (rounded) tile positions; Infinity if one is in rock. */
export function tunnelGap(grid, a, b) {
  const ax = Math.round(a.x), ay = Math.round(a.y), bx = Math.round(b.x), by = Math.round(b.y);
  const d = bfsFrom(grid, ax, ay).dist[by]?.[bx];
  return d == null || d < 0 ? Infinity : d;
}

/**
 * The way it runs, fixed by the seed: leg after leg to somewhere far off. Where a leg doubles back over tiles it just
 * ran (a dead end in the tunnels), it goes over your head across the ceiling for up to CEIL_MAX tiles: `ceil[i]` marks
 * those tiles, and you can't hit it up there. Returns { tiles: [[x, y], ...], ceil: [0|1, ...] }, one tile per step.
 */
export function chaseRoute(grid, start, seed, minLen = ROUTE_MIN) {
  const r = rng(seed >>> 0), sx = Math.round(start.x), sy = Math.round(start.y);
  const tiles = [[sx, sy]], ceil = [0];
  if (!open(grid, sx, sy)) return { tiles, ceil };
  for (let guard = 0; tiles.length < minLen && guard < 60; guard++) {
    const [cx, cy] = tiles[tiles.length - 1];
    const { dist, prev } = bfsFrom(grid, cx, cy);
    let max = 0; for (const row of dist) for (const d of row) if (d > max) max = d;
    if (max < 1) break;
    const far = []; dist.forEach((row, y) => row.forEach((d, x) => { if (d >= Math.max(1, Math.ceil(max * 0.7))) far.push([x, y]); }));
    // Of a handful of far-off spots, the one that doubles back least (less time on the ceiling, more chase).
    const base = tiles.length - 1;
    const legTo = ([x, y]) => { const leg = []; while (!(x === cx && y === cy)) { leg.unshift([x, y]); [x, y] = prev[y][x]; } return leg; };
    const backOf = (leg) => { let n = 0; while (n < leg.length && tiles[base - 1 - n]?.[0] === leg[n][0] && tiles[base - 1 - n]?.[1] === leg[n][1]) n++; return n; };
    let leg = null, least = Infinity;
    for (let k = 0; k < 6; k++) { const cand = legTo(far[Math.floor(r() * far.length)]), b = backOf(cand); if (b < least) { least = b; leg = cand; } }
    let back = true;
    leg.forEach(([x, y], i) => {
      const was = tiles[base - 1 - i]; back = back && i < CEIL_MAX && !!was && was[0] === x && was[1] === y;
      tiles.push([x, y]); ceil.push(back ? 1 : 0);
    });
  }
  return { tiles, ceil };
}

/** How far along its route it is at `t` while being chased (frozen at the hit, if there was one). */
export function chaseDistance(c, t) {
  const until = c.caughtAt ?? c.endedAt ?? t;
  const e = Math.max(0, Math.min(t, until) - c.startedAt);
  return HEAD_START + c.speed * (Math.min(e, SLOW_AFTER_MS) + SLOW_FACTOR * Math.max(0, e - SLOW_AFTER_MS)) / 1000;
}
/** Where it is on the route at distance d: { x, y, facing (world yaw, atan2(dx, dz)), ceiling }. */
export function routePoint(route, d) {
  const n = route.tiles.length; if (!n) return { x: 0, y: 0, facing: 0, ceiling: false };
  const dd = Math.max(0, Math.min(n - 1, d)), i = Math.min(n - 2, Math.floor(dd)), f = n < 2 ? 0 : dd - i;
  const a = route.tiles[Math.max(0, i)], b = route.tiles[Math.min(n - 1, i + 1)] || a;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, facing: Math.atan2(b[0] - a[0], b[1] - a[1]) || 0, ceiling: !!route.ceil[Math.min(n - 1, Math.round(dd))] };
}
/**
 * The whole picture at `t`, from the public chase view (or the server's own row): phase, where it is and how fast.
 * Phases: chase -> caught (riddles) -> freed | flee -> gone. A lost or abandoned chase goes straight to gone.
 */
export function mazodeAt(c, route, t) {
  if (!c || !route) return null;
  if (c.phase === 'chase') {
    const d = chaseDistance(c, t), e = t - c.startedAt;
    return { ...routePoint(route, d), d, state: 'chase', slow: e >= SLOW_AFTER_MS, speed: c.speed * (e >= SLOW_AFTER_MS ? SLOW_FACTOR : 1) };
  }
  if (c.phase === 'caught' || c.phase === 'freed') return { ...routePoint(route, c.caughtDist), d: c.caughtDist, state: c.phase, speed: 0 };
  if (c.phase === 'flee') {
    const run = Math.max(0, Math.min(t, c.fleeAt + FLEE_MS) - c.fleeAt);
    const d = c.caughtDist + c.speed * FLEE_FACTOR * run / 1000;
    return { ...routePoint(route, d), d, state: t >= c.fleeAt + FLEE_MS ? 'gone' : t < c.fleeAt ? 'laugh' : 'flee', speed: t < c.fleeAt ? 0 : c.speed * FLEE_FACTOR };
  }
  return { ...routePoint(route, c.caughtDist ?? 0), d: c.caughtDist ?? 0, state: 'gone', speed: 0 };
}

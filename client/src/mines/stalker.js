// The thing in the tunnels: a pale, too-tall figure that sometimes joins a shift (the server decides which
// shifts, about 28% of them, using its own random source). Pure logic, no three.js, so node --test can drive it.
// It never touches pay, time or the player: it only stands in the way and follows, until the acid is found.
//
// Rules:
//  - It can only appear once the shift is SPAWN_AFTER_MS old (30 s), and only the moment the player takes a
//    corner fast: at a corner or junction tile, the view turns at least FAST_TURN_RAD (~52°) within
//    FAST_TURN_WINDOW_S (0.7 s) while walking at FAST_SPEED_FRAC (50%) or more of full speed.
//  - It appears 4–7 tiles away down a straight corridor (ahead or behind if one runs 5+ tiles, else the longest
//    view), or 5–8 tiles' walk away if no corridor is long enough,
//    never at or next to the acid pool.
//  - It's solid: the player can't walk through it (blocks()).
//  - Looked at (within GAZE_RAD of the centre of view, with line of sight) it stands perfectly still. Otherwise it
//    walks toward the player along the tunnels, slowly but without stopping, and halts MIN_GAP away.
//    Lost far behind and out of sight for a while, it reappears a few tiles back along the player's own trail.
//    If the player shoves into it for a couple of seconds, it does the same (it never traps anyone).
//  - The acid is found (the player gets in reach of the pool): it's gone for the rest of the shift.
export const TILE = 2.2;
export const SPAWN_AFTER_MS = 30000;
export const FAST_TURN_RAD = 0.9;
export const FAST_TURN_WINDOW_S = 0.7;
export const FAST_SPEED_FRAC = 0.5;
export const PLAYER_SPEED = 3.6;
export const WALK_SPEED = 1.25;      // tiles are 2.2 m: about a third of the player's pace
export const CATCH_UP_SPEED = 2.3;   // when it's far behind, it hurries (still slower than you)
export const MIN_GAP = 1.7;          // it stops this close (metres)
export const BODY_RADIUS = 0.34;
export const GAZE_RAD = 0.24;        // ~14° either side of the centre of view
export const RELOCATE_AFTER_S = 7;   // out of sight and far (> RELOCATE_TILES path tiles) this long → reappear behind
export const RELOCATE_TILES = 8;
export const SHOVE_RELOCATE_S = 2.2;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;
export const tileOf = (x, z) => [Math.round(x / TILE), Math.round(z / TILE)];

/** A corner (two open sides at right angles) or a junction (three or four open sides). */
export function isCorner(grid, tx, ty) {
  if (!open(grid, tx, ty)) return false;
  const o = DIRS.map(([dx, dy]) => open(grid, tx + dx, ty + dy));
  const n = o.filter(Boolean).length;
  if (n >= 3) return true;
  if (n === 2) return !((o[0] && o[1]) || (o[2] && o[3]));
  return false;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** samples: [{t (s), x, z, yaw}], oldest first. True if the last FAST_TURN_WINDOW_S is a fast turn at a corner. */
export function fastCornerTurn(grid, samples) {
  if (samples.length < 3) return false;
  const now = samples[samples.length - 1].t;
  const win = samples.filter((s) => now - s.t <= FAST_TURN_WINDOW_S + 1e-9);
  if (win.length < 3 || now - win[0].t < 0.2) return false;
  let turned = 0, dist = 0, atCorner = false;
  for (let i = 1; i < win.length; i++) {
    turned += wrap(win[i].yaw - win[i - 1].yaw);
    dist += Math.hypot(win[i].x - win[i - 1].x, win[i].z - win[i - 1].z);
  }
  for (const s of win) { const [tx, ty] = tileOf(s.x, s.z); if (isCorner(grid, tx, ty)) { atCorner = true; break; } }
  const speed = dist / (now - win[0].t);
  return atCorner && Math.abs(turned) >= FAST_TURN_RAD && speed >= FAST_SPEED_FRAC * PLAYER_SPEED;
}

/** Breadth-first walking distances (tiles) from (tx, ty). */
export function bfs(grid, tx, ty) {
  const H = grid.length, W = grid[0].length;
  const d = Array.from({ length: H }, () => new Array(W).fill(-1));
  if (!open(grid, tx, ty)) return d;
  const q = [[tx, ty]]; d[ty][tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) { const X = x + dx, Y = y + dy; if (open(grid, X, Y) && d[Y][X] < 0) { d[Y][X] = d[y][x] + 1; q.push([X, Y]); } }
  }
  return d;
}
/** Clear straight-line view between two points over the tile grid. */
export function lineOfSight(grid, ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
  for (let i = 1; i < n; i++) { const [tx, ty] = tileOf(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n); if (!open(grid, tx, ty)) return false; }
  return true;
}

export class Stalker {
  /** maze: { grid, pool:{x,y} } · armed: the server rolled a visitor for this shift · rand: seeded 0..1 */
  constructor(maze, { armed, rand = Math.random, afterMs = SPAWN_AFTER_MS } = {}) {
    this.grid = maze.grid; this.pool = maze.pool; this.rand = rand; this.afterMs = Math.max(SPAWN_AFTER_MS, afterMs || 0);
    this.state = armed ? 'dormant' : 'off'; // off | dormant | stalking | gone
    this.x = 0; this.z = 0; this.facing = 0; this.moving = false; this.seen = false;
    this.samples = []; this.trail = []; this.unseenFar = 0; this.shove = 0; this.repath = 0; this.next = null;
    this.spawnedAt = null; this.events = [];
  }
  get present() { return this.state === 'stalking'; }
  /** Solid body: true if a circle of radius r at (x, z) would overlap it. */
  blocks(x, z, r) { return this.present && Math.hypot(x - this.x, z - this.z) < r + BODY_RADIUS; }
  acidFound() { if (this.state === 'dormant' || this.state === 'stalking') { const was = this.state; this.state = 'gone'; if (was === 'stalking') this.events.push('vanish'); } }

  /**
   * One frame. p = { t (s), x, z, yaw, elapsedMs, pushing (forward input but blocked by it) }.
   * yaw follows the scene: forward = (-sin yaw, -cos yaw).
   */
  update(dt, p) {
    this.samples.push({ t: p.t, x: p.x, z: p.z, yaw: p.yaw });
    while (this.samples.length && p.t - this.samples[0].t > 1.5) this.samples.shift();
    const [ptx, pty] = tileOf(p.x, p.z);
    const lastT = this.trail[this.trail.length - 1];
    if (!lastT || lastT[0] !== ptx || lastT[1] !== pty) { this.trail.push([ptx, pty]); if (this.trail.length > 40) this.trail.shift(); }
    if (this.state === 'dormant') {
      if (p.elapsedMs >= this.afterMs && fastCornerTurn(this.grid, this.samples)) this.spawn(p);
      return;
    }
    if (this.state !== 'stalking') return;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    // gaze: is it near the centre of the player's view, with nothing in between?
    const toIt = Math.atan2(-(this.x - p.x), -(this.z - p.z)); // yaw that would face it
    this.seen = Math.abs(wrap(toIt - p.yaw)) < GAZE_RAD + Math.atan2(BODY_RADIUS, Math.max(dist, 0.1)) && lineOfSight(this.grid, p.x, p.z, this.x, this.z);
    const inSight = lineOfSight(this.grid, p.x, p.z, this.x, this.z) && Math.abs(wrap(toIt - p.yaw)) < 1.0;
    this.shove = p.pushing ? this.shove + dt : 0;
    if (this.shove > SHOVE_RELOCATE_S) { this.relocateBehind(p); return; }
    const d = bfs(this.grid, ptx, pty);
    const [etx, ety] = tileOf(this.x, this.z);
    const pathTiles = d[ety]?.[etx] ?? -1;
    this.unseenFar = !inSight && pathTiles > RELOCATE_TILES ? this.unseenFar + dt : 0;
    if (this.unseenFar > RELOCATE_AFTER_S) { this.relocateBehind(p); return; }
    this.moving = false;
    if (this.seen || dist <= MIN_GAP) { if (!this.seen) this.facing = Math.atan2(dx, dz); return; } // statue-still under your gaze
    // walk the tunnels toward the player, one tile centre at a time
    this.repath -= dt;
    if (!this.next || this.repath <= 0 || (Math.abs(this.x - this.next[0] * TILE) < 0.05 && Math.abs(this.z - this.next[1] * TILE) < 0.05)) {
      this.repath = 0.3;
      let best = null;
      if (pathTiles > 0) for (const [ox, oy] of DIRS) { const X = etx + ox, Y = ety + oy; if (d[Y]?.[X] >= 0 && d[Y][X] < pathTiles && (!best || d[Y][X] < d[best[1]][best[0]])) best = [X, Y]; }
      this.next = pathTiles <= 1 ? [ptx, pty] : best || [etx, ety];
    }
    let tx = this.next[0] * TILE, tz = this.next[1] * TILE;
    if (pathTiles <= 1) { tx = p.x; tz = p.z; } // same or next tile: close in directly, up to MIN_GAP
    const vx = tx - this.x, vz = tz - this.z, len = Math.hypot(vx, vz);
    if (len < 1e-4) return;
    const sp = (pathTiles > 6 ? CATCH_UP_SPEED : WALK_SPEED) * dt;
    let step = Math.min(sp, len);
    if (pathTiles <= 1) step = Math.min(step, Math.max(0, dist - MIN_GAP));
    this.x += (vx / len) * step; this.z += (vz / len) * step; this.moving = step > 0;
    this.facing = Math.atan2(vx, vz);
  }

  spawn(p) {
    const [ptx, pty] = tileOf(p.x, p.z);
    const d = bfs(this.grid, ptx, pty);
    const nearPool = (x, y) => Math.abs(x - this.pool.x) + Math.abs(y - this.pool.y) <= 1;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ahead = [Math.round(fx), Math.round(fz)], behind = [-ahead[0], -ahead[1]];
    const straight = ([sx, sy]) => { // farthest open tile 3–7 straight down that corridor, and how far
      let hit = null;
      for (let k = 1; k <= 7; k++) { const X = ptx + sx * k, Y = pty + sy * k; if (!open(this.grid, X, Y)) break; if (k >= 3 && !nearPool(X, Y)) hit = [X, Y, k]; }
      return hit;
    };
    // he wants to be seen, a long way off: ahead or behind (a coin flip) if that corridor runs 5+ tiles,
    // otherwise the longest straight view in any direction (4+ tiles), otherwise somewhere 5–8 tiles' walk away
    const first = this.rand() < 0.5 ? [ahead, behind] : [behind, ahead];
    const cardinal = Math.abs(ahead[0]) + Math.abs(ahead[1]) === 1;
    let at = null;
    if (cardinal) for (const dir of first) { const h = straight(dir); if (h && h[2] >= 5) { at = h; break; } }
    if (!at) for (const dir of DIRS) { const h = straight(dir); if (h && h[2] >= 4 && (!at || h[2] > at[2])) at = h; }
    if (!at) { // anywhere 4–7 tiles' walk away
      const c = [];
      for (let y = 0; y < d.length; y++) for (let x = 0; x < d[0].length; x++) if (d[y][x] >= 5 && d[y][x] <= 8 && !nearPool(x, y)) c.push([x, y]);
      at = c.length ? c[Math.floor(this.rand() * c.length)] : null;
    }
    if (!at) return; // nowhere sensible: try again on the next fast corner
    this.x = at[0] * TILE; this.z = at[1] * TILE; this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.state = 'stalking'; this.spawnedAt = p.t; this.next = null; this.events.push('appear');
  }
  relocateBehind(p) {
    // a few tiles back along the way the player came, somewhere they can't see right now (he never pops in or out
    // in plain view), never on top of them or next to the pool
    const [ptx, pty] = tileOf(p.x, p.z);
    const d = bfs(this.grid, ptx, pty);
    const hidden = (x, y) => {
      const X = x * TILE, Z = y * TILE;
      const ang = Math.abs(wrap(Math.atan2(-(X - p.x), -(Z - p.z)) - p.yaw));
      return ang > 1.3 || !lineOfSight(this.grid, p.x, p.z, X, Z);
    };
    const okTile = (x, y) => d[y][x] >= 3 && d[y][x] <= 6 && Math.abs(x - this.pool.x) + Math.abs(y - this.pool.y) > 1;
    let pick = null;
    for (let i = this.trail.length - 1; i >= 0 && !pick; i--) { const [x, y] = this.trail[i]; if (okTile(x, y) && hidden(x, y)) pick = [x, y]; }
    if (!pick) {
      const c = [];
      for (let y = 0; y < d.length; y++) for (let x = 0; x < d[0].length; x++) if (okTile(x, y)) c.push([x, y, hidden(x, y)]);
      const h = c.filter((t) => t[2]);
      const from = h.length ? h : c;
      if (from.length) pick = from[Math.floor(this.rand() * from.length)];
    }
    if (pick) { this.x = pick[0] * TILE; this.z = pick[1] * TILE; }
    this.next = null; this.unseenFar = 0; this.shove = 0; this.events.push('relocate');
  }
  /** 0..1: how close it is (for the heartbeat, vignette and lamp). */
  dread(px, pz) { if (!this.present) return 0; const dist = Math.hypot(px - this.x, pz - this.z); return Math.max(0.15, Math.min(1, 1 - (dist - MIN_GAP) / 12)); }
}

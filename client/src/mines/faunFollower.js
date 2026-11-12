// The faun in the tunnels: a low-poly Tumnus who sometimes joins a shift (the server decides which
// shifts, about 20% of them, and never the same shift as the visitor). Pure logic, no three.js, so
// node --test can drive it. He follows at a short distance, is solid (walk around him), bleats on a
// short timer, and steps aside or lets you pass if he would trap you in a one-wide dead end. He stays
// for the whole shift; pay, vein timing and the bug guide ignore him.
import { bfs, tileOf, TILE } from './stalker.js';

export const APPEAR_AFTER_MS = 2500;
export const FOLLOW_GAP = 1.8;       // metres: he stops about this close
export const WALK_SPEED = 2.7;       // a bit slower than the player (3.6), so he trails
export const CATCH_UP_SPEED = 3.5;
export const BODY_RADIUS = 0.42;
export const YIELD_S = 1.15;         // shove or trapped this long → step aside / swap
export const PASS_S = 0.55;          // brief window where he is not solid, so a swap can complete
export const BLEAT_MIN_S = 2.2;
export const BLEAT_MAX_S = 5.0;
export const PLAYER_RADIUS = 0.38;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;

function neighbors(grid, tx, ty) {
  return DIRS.filter(([dx, dy]) => open(grid, tx + dx, ty + dy)).map(([dx, dy]) => [tx + dx, ty + dy]);
}

/** Walk distances treating a tile as blocked (the faun's body in a one-wide tunnel). */
export function bfsAvoiding(grid, tx, ty, avoidX, avoidY) {
  const H = grid.length, W = grid[0].length;
  const d = Array.from({ length: H }, () => new Array(W).fill(-1));
  if (!open(grid, tx, ty) || (tx === avoidX && ty === avoidY)) return d;
  const q = [[tx, ty]]; d[ty][tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS) {
      const X = x + dx, Y = y + dy;
      if (!open(grid, X, Y) || (X === avoidX && Y === avoidY) || d[Y][X] >= 0) continue;
      d[Y][X] = d[y][x] + 1; q.push([X, Y]);
    }
  }
  return d;
}

export class FaunFollower {
  /** maze: { grid, pool:{x,y}, start?:{x,y} } · armed: the server rolled a faun for this shift · rand: seeded 0..1 */
  constructor(maze, { armed = false, rand = Math.random, afterMs = APPEAR_AFTER_MS } = {}) {
    this.grid = maze.grid; this.pool = maze.pool; this.start = maze.start || { x: 1, y: 1 };
    this.rand = rand; this.afterMs = Math.max(0, afterMs || 0);
    this.state = armed ? 'dormant' : 'off'; // off | dormant | following
    this.x = 0; this.z = 0; this.facing = 0; this.moving = false;
    this.next = null; this.repath = 0; this.shove = 0; this.stuck = 0; this.pass = 0;
    this.nextBleat = 0; this.events = [];
  }
  get present() { return this.state === 'following'; }
  /** Solid body: false while he is yielding so a swap can finish. */
  blocks(x, z, r) { return this.present && this.pass <= 0 && Math.hypot(x - this.x, z - this.z) < r + BODY_RADIUS; }

  setPool(p) { if (p) this.pool = p; }

  /**
   * True if the faun is the reason the player cannot reach the pool (or cannot leave a dead end).
   * Used so visible acid stays reachable and a 1-wide dead end is never a permanent trap.
   */
  trapping(px, pz) {
    if (!this.present || this.pass > 0) return false;
    const [ptx, pty] = tileOf(px, pz);
    const [etx, ety] = tileOf(this.x, this.z);
    if (ptx === etx && pty === ety) return Math.hypot(px - this.x, pz - this.z) < FOLLOW_GAP;
    const close = Math.hypot(px - this.x, pz - this.z) < FOLLOW_GAP + PLAYER_RADIUS + BODY_RADIUS + 0.35;
    if (!close) return false;
    const exits = neighbors(this.grid, ptx, pty);
    const free = exits.filter(([x, y]) => !(x === etx && y === ety) && !this.blocks(x * TILE, y * TILE, PLAYER_RADIUS));
    if (exits.length <= 1 && free.length === 0) return true;
    if (!this.pool) return free.length === 0 && exits.length > 0;
    const clear = bfs(this.grid, ptx, pty);
    const blocked = bfsAvoiding(this.grid, ptx, pty, etx, ety);
    const poolOk = clear[this.pool.y]?.[this.pool.x] >= 0;
    const poolBlocked = blocked[this.pool.y]?.[this.pool.x] < 0;
    return poolOk && poolBlocked;
  }

  /**
   * One frame. p = { t (s), x, z, yaw, elapsedMs, pushing (forward input but blocked by him) }.
   */
  update(dt, p) {
    if (this.state === 'dormant') {
      if (p.elapsedMs >= this.afterMs) this.spawn(p);
      return;
    }
    if (this.state !== 'following') return;
    if (this.pass > 0) this.pass = Math.max(0, this.pass - dt);
    this.nextBleat -= dt;
    if (this.nextBleat <= 0) { this.events.push('bleat'); this.scheduleBleat(); }
    this.shove = p.pushing ? this.shove + dt : 0;
    this.stuck = this.trapping(p.x, p.z) ? this.stuck + dt : 0;
    if (this.shove > YIELD_S || this.stuck > YIELD_S) { this.yieldTo(p); return; }

    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    const [ptx, pty] = tileOf(p.x, p.z);
    const [etx, ety] = tileOf(this.x, this.z);
    const d = bfs(this.grid, ptx, pty);
    const pathTiles = d[ety]?.[etx] ?? -1;
    this.moving = false;
    if (this.pass <= 0 && dist <= FOLLOW_GAP) { this.facing = Math.atan2(dx, dz); return; }
    this.repath -= dt;
    if (!this.next || this.repath <= 0 || (Math.abs(this.x - this.next[0] * TILE) < 0.05 && Math.abs(this.z - this.next[1] * TILE) < 0.05)) {
      this.repath = 0.25;
      let best = null;
      if (pathTiles > 0) for (const [ox, oy] of DIRS) {
        const X = etx + ox, Y = ety + oy;
        if (d[Y]?.[X] >= 0 && d[Y][X] < pathTiles && (!best || d[Y][X] < d[best[1]][best[0]])) best = [X, Y];
      }
      this.next = pathTiles <= 1 ? [ptx, pty] : best || [etx, ety];
    }
    let tx = this.next[0] * TILE, tz = this.next[1] * TILE;
    if (pathTiles <= 1) { tx = p.x; tz = p.z; }
    const vx = tx - this.x, vz = tz - this.z, len = Math.hypot(vx, vz);
    if (len < 1e-4) return;
    const sp = (pathTiles > 6 ? CATCH_UP_SPEED : WALK_SPEED) * dt;
    let step = Math.min(sp, len);
    if (this.pass <= 0 && pathTiles <= 1) step = Math.min(step, Math.max(0, dist - FOLLOW_GAP));
    this.x += (vx / len) * step; this.z += (vz / len) * step; this.moving = step > 0;
    this.facing = Math.atan2(vx, vz);
    // stay off the current acid tile when the miner is heading there
    this.clearPool(p);
  }

  spawn(p) {
    const [ptx, pty] = tileOf(p.x, p.z);
    const d = bfs(this.grid, ptx, pty);
    const nearPool = (x, y) => this.pool && Math.abs(x - this.pool.x) + Math.abs(y - this.pool.y) <= 1;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const behind = [Math.round(-fx) || 0, Math.round(-fz) || 0];
    let at = null;
    // Prefer two tiles behind the miner, then any open tile 2–3 steps away, then a neighbour.
    if (Math.abs(behind[0]) + Math.abs(behind[1]) === 1) {
      const X = ptx + behind[0] * 2, Y = pty + behind[1] * 2;
      if (open(this.grid, X, Y) && !nearPool(X, Y)) at = [X, Y];
      if (!at) {
        const X1 = ptx + behind[0], Y1 = pty + behind[1];
        if (open(this.grid, X1, Y1) && !nearPool(X1, Y1)) at = [X1, Y1];
      }
    }
    if (!at) {
      const c = [];
      for (let y = 0; y < d.length; y++) for (let x = 0; x < d[0].length; x++) {
        if (d[y][x] >= 2 && d[y][x] <= 3 && !nearPool(x, y)) c.push([x, y]);
      }
      if (c.length) at = c[Math.floor(this.rand() * c.length)];
    }
    if (!at) {
      const n = neighbors(this.grid, ptx, pty).filter(([x, y]) => !nearPool(x, y));
      if (n.length) at = n[Math.floor(this.rand() * n.length)];
    }
    if (!at && open(this.grid, this.start.x, this.start.y) && !nearPool(this.start.x, this.start.y)) at = [this.start.x, this.start.y];
    if (!at) return;
    this.x = at[0] * TILE; this.z = at[1] * TILE;
    this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.state = 'following'; this.next = null; this.pass = 0;
    this.events.push('appear'); this.events.push('bleat'); this.scheduleBleat();
  }

  yieldTo(p) {
    const [ptx, pty] = tileOf(p.x, p.z);
    const [etx, ety] = tileOf(this.x, this.z);
    const d = bfs(this.grid, ptx, pty);
    const nearPool = (x, y) => this.pool && x === this.pool.x && y === this.pool.y;
    const farther = neighbors(this.grid, etx, ety)
      .filter(([x, y]) => !nearPool(x, y) && !(x === ptx && y === pty) && (d[y][x] ?? -1) > (d[ety]?.[etx] ?? 0))
      .sort((a, b) => (d[b[1]][b[0]] - d[a[1]][a[0]]));
    const side = neighbors(this.grid, etx, ety)
      .filter(([x, y]) => !nearPool(x, y) && !(x === ptx && y === pty));
    const pick = farther[0] || side[0];
    if (pick) {
      this.x = pick[0] * TILE; this.z = pick[1] * TILE;
    } else {
      // No free tile: briefly stop being solid and step onto the miner's tile so they can take ours.
      this.pass = PASS_S;
      this.x = ptx * TILE; this.z = pty * TILE;
    }
    this.next = null; this.shove = 0; this.stuck = 0; this.events.push('yield');
  }

  clearPool(p) {
    if (!this.pool) return;
    const [etx, ety] = tileOf(this.x, this.z);
    if (etx !== this.pool.x || ety !== this.pool.y) return;
    const [ptx, pty] = tileOf(p.x, p.z);
    const d = bfs(this.grid, ptx, pty);
    const n = neighbors(this.grid, etx, ety).filter(([x, y]) => !(x === ptx && y === pty));
    if (!n.length) { this.pass = Math.max(this.pass, PASS_S); return; }
    n.sort((a, b) => (d[b[1]]?.[b[0]] ?? 0) - (d[a[1]]?.[a[0]] ?? 0));
    this.x = n[0][0] * TILE; this.z = n[0][1] * TILE; this.next = null;
  }

  scheduleBleat() { this.nextBleat = BLEAT_MIN_S + this.rand() * (BLEAT_MAX_S - BLEAT_MIN_S); }
}

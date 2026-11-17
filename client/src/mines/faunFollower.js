// Tumnus lingers in the tunnels until the miner gets well ahead. If approached, he makes room at the wall.
import { bfs, tileOf, TILE } from './stalker.js';

export const APPEAR_AFTER_MS = 2500;
export const FOLLOW_GAP = 2 * TILE;
const REJOIN_GAP = 4 * TILE;
const YIELD_GAP = 1.6;
export const WALK_SPEED = 2.7;       // a bit slower than the player (3.6), so he trails
export const CATCH_UP_SPEED = 3.5;
export const BODY_RADIUS = 0.42;
const BLEAT_MIN_S = 12, BLEAT_MAX_S = 24;
export const MOON_SECONDS = 3;
export const MOON_MIN_S = 18, MOON_MAX_S = 40;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;

function neighbors(grid, tx, ty) {
  return DIRS.filter(([dx, dy]) => open(grid, tx + dx, ty + dy)).map(([dx, dy]) => [tx + dx, ty + dy]);
}

export class FaunFollower {
  /** maze: { grid, pool:{x,y}, start?:{x,y} } · armed: the server rolled a faun for this shift · rand: seeded 0..1 */
  constructor(maze, { armed = false, rand = Math.random, afterMs = APPEAR_AFTER_MS } = {}) {
    this.grid = maze.grid; this.pool = maze.pool; this.start = maze.start || { x: 1, y: 1 };
    this.rand = rand; this.afterMs = Math.max(0, afterMs || 0);
    this.state = armed ? 'dormant' : 'off'; // off | dormant | following
    this.x = 0; this.z = 0; this.facing = 0; this.moving = false;
    this.next = null; this.aside = null;
    this.nextBleat = 0; this.events = [];
    this.nextMoon = MOON_MIN_S; this.moonLeft = 0;
  }
  get present() { return this.state === 'following'; }
  get moon() {
    if (!this.moonLeft) return 0;
    const k = Math.max(0, Math.min(1, (MOON_SECONDS - this.moonLeft) / .55, this.moonLeft / .55));
    return k * k * (3 - 2 * k);
  }
  /** Keep the passage open for as long as the miner needs to get by. */
  blocks(x, z, r) { return this.present && !this.aside && Math.hypot(x - this.x, z - this.z) < r + BODY_RADIUS; }

  setPool(p) { if (p) this.pool = p; }

  /**
   * One frame. p = { t (s), x, z, yaw, elapsedMs, pushing (blocked by him), busy (mining or dancing) }.
   */
  update(dt, p) {
    if (this.state === 'dormant') {
      if (p.elapsedMs >= this.afterMs) this.spawn(p);
      return;
    }
    if (this.state !== 'following') return;
    this.nextMoon -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    this.nextBleat -= dt;
    if (this.nextBleat <= 0) {
      if (dist <= REJOIN_GAP) this.events.push('bleat');
      this.scheduleBleat();
    }
    this.moving = false;
    if (this.aside && this.walkTo(...this.aside, WALK_SPEED * dt)) return;
    if (dist > REJOIN_GAP) this.aside = null;
    else if (!this.aside && (dist < YIELD_GAP || p.pushing)) { this.yieldTo(p); return; }

    // Once settled, stay put through nearby turns, stops and backtracking.
    if (dist <= (this.next ? FOLLOW_GAP : REJOIN_GAP) + 1e-6) {
      this.next = null;
      // He can cross a deposit en route; only choose a place beside it when he stops.
      if (this.stepOffPool(p) || p.busy || p.pushing || dist < YIELD_GAP || dist > FOLLOW_GAP + 1e-6) this.moonLeft = 0;
      else if (this.moonLeft > 0) this.moonLeft = Math.max(0, this.moonLeft - dt);
      else if (this.nextMoon <= 0) {
        this.facing = Math.atan2(dx, dz);
        this.moonLeft = MOON_SECONDS;
        this.nextMoon = MOON_MIN_S + this.rand() * (MOON_MAX_S - MOON_MIN_S);
      }
      return;
    }
    this.moonLeft = 0;
    const [ptx, pty] = tileOf(p.x, p.z);
    const [etx, ety] = tileOf(this.x, this.z);
    if (!this.next || (Math.abs(this.x - this.next[0] * TILE) < 0.05 && Math.abs(this.z - this.next[1] * TILE) < 0.05)) {
      const d = bfs(this.grid, ptx, pty);
      const pathTiles = d[ety]?.[etx] ?? -1;
      this.next = neighbors(this.grid, etx, ety).find(([x, y]) => d[y][x] === pathTiles - 1) || [etx, ety];
    }
    const speed = dist > 6 * TILE ? CATCH_UP_SPEED : WALK_SPEED;
    this.walkTo(this.next[0] * TILE, this.next[1] * TILE, Math.min(speed * dt, dist - FOLLOW_GAP));
  }

  walkTo(x, z, maxStep) {
    const dx = x - this.x, dz = z - this.z, distance = Math.hypot(dx, dz);
    if (distance < 1e-5) return false;
    const step = Math.min(maxStep, distance);
    this.x += dx * step / distance; this.z += dz * step / distance;
    this.facing = Math.atan2(dx, dz); this.moving = true;
    return true;
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
    this.state = 'following';
    this.moonLeft = 0; this.nextMoon = MOON_MIN_S + this.rand() * (MOON_MAX_S - MOON_MIN_S);
    this.events.push('appear'); this.events.push('bleat'); this.scheduleBleat();
  }

  yieldTo(p) {
    this.moonLeft = 0;
    const [tx, ty] = tileOf(this.x, this.z);
    let x = tx * TILE, z = ty * TILE;
    const side = TILE / 2 - BODY_RADIUS;
    if (Math.abs(p.x - this.x) > Math.abs(p.z - this.z)) z += p.z > z ? -side : side;
    else x += p.x > x ? -side : side;
    this.aside = [x, z];
    this.next = null;
    this.events.push('yield');
  }

  stepOffPool(p) {
    if (!this.pool) return;
    const [etx, ety] = tileOf(this.x, this.z);
    if (etx !== this.pool.x || ety !== this.pool.y) return;
    const [ptx, pty] = tileOf(p.x, p.z);
    const n = neighbors(this.grid, etx, ety).filter(([x, y]) => !(x === ptx && y === pty));
    if (!n.length) { if (!this.aside) this.yieldTo(p); return true; }
    const d = bfs(this.grid, ptx, pty);
    n.sort((a, b) => (d[b[1]]?.[b[0]] ?? 0) - (d[a[1]]?.[a[0]] ?? 0));
    this.aside = [n[0][0] * TILE, n[0][1] * TILE];
    return true;
  }

  scheduleBleat() { this.nextBleat = BLEAT_MIN_S + this.rand() * (BLEAT_MAX_S - BLEAT_MIN_S); }
}

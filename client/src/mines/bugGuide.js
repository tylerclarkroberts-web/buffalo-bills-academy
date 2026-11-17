// Your Barn bug down the mine: by default it flies/crawls ahead along the tunnels toward the current acid pool.
// Pure logic (no three.js) so node --test can drive it. Only active when the player brought a living
// hatched barn bug. It waits if you fall behind, settles when you reach the current acid, and leads on again when the vein moves to the next pool.
// It also takes orders (the BUG menu): come to heel, lead to the acid, lead to the nearest other miner, lead back to the lift.
import { bfs, tileOf, TILE } from './stalker.js';
import { WALK_SPEED } from './controls.js';

export const APPEAR_AFTER_MS = 4000; // brief delay so it doesn't hand you the route at clock-in
export const LEAD_TILES = 2;         // tries to stay about this many tiles ahead of you toward the pool
export const WAIT_TILES = 3;         // if you're this many tiles behind it, it pauses
export const ARRIVE_TILES = 0;       // stops on the pool tile
/** What the bug can be told: lead to the acid (what it does unasked), come to heel, lead to the nearest other miner, lead back to the lift. */
export const ORDERS = ['acid', 'come', 'someone', 'lift'];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;

/** Reconstruct one step from `from` toward the goal using a distance field rooted at the goal. */
export function stepToward(dist, fromX, fromY) {
  const here = dist[fromY]?.[fromX];
  if (here == null || here < 0) return null;
  if (here === 0) return [fromX, fromY];
  let best = null;
  for (const [dx, dy] of DIRS) {
    const X = fromX + dx, Y = fromY + dy;
    const d = dist[Y]?.[X];
    if (d != null && d >= 0 && d < here && (!best || d < dist[best[1]][best[0]])) best = [X, Y];
  }
  return best;
}

/** Shortest open-tile path from (ax,ay) to (bx,by), inclusive. Empty if unreachable. */
export function pathBetween(grid, ax, ay, bx, by) {
  const dist = bfs(grid, bx, by);
  if (dist[ay]?.[ax] < 0) return [];
  const out = [[ax, ay]];
  let x = ax, y = ay;
  while (!(x === bx && y === by)) {
    const n = stepToward(dist, x, y);
    if (!n || (n[0] === x && n[1] === y)) break;
    x = n[0]; y = n[1]; out.push([x, y]);
  }
  return out;
}

export class BugGuide {
  /**
   * @param maze {{ grid:number[][], pool:{x:number,y:number}, start?:{x:number,y:number} }}
   * @param opts {{ armed?:boolean, afterMs?:number, bug?:{species:string,name?:string,speciesName?:string,style?:object|null} }}
   */
  constructor(maze, { armed = false, afterMs = APPEAR_AFTER_MS, bug = null } = {}) {
    this.grid = maze.grid;
    this.pool = maze.pool;
    this.start = maze.start || { x: 1, y: 1 };
    this.armed = !!armed && !!bug;
    this.afterMs = afterMs;
    this.bug = bug;
    this.state = 'dormant'; // dormant | guiding | done
    this.mode = 'acid';     // one of ORDERS
    this.found = false;     // the miner has reached the current pool
    this.others = [];       // other miners in these tunnels, in tiles
    this.x = this.start.x * TILE;
    this.z = this.start.y * TILE;
    this.facing = 0;
    this.next = null;
    this.repath = 0;
    this.waiting = false;
    this.moving = false;
    this.events = [];
    this.bob = 0;
  }

  get present() { return this.state === 'guiding'; }

  setPool(p) {
    if (!p) return;
    const changed = !this.pool || this.pool.x !== p.x || this.pool.y !== p.y;
    this.pool = p;
    this.next = null;
    this.repath = 0;
    if (changed) this.found = false;
    // After a deposit is collected, the vein names the next acid: leave "done" and lead there.
    if (changed && this.armed && this.state === 'done') {
      this.state = 'guiding';
      this.events.push('retarget');
    }
  }

  acidFound() {
    this.found = true;
    if (this.mode === 'acid' && this.state === 'guiding') { this.state = 'done'; this.events.push('done'); }
  }

  /** Who else is down here (tiles). The 'someone' order leads to the nearest. */
  setOthers(list) { this.others = (list || []).filter((o) => Number.isFinite(o?.x) && Number.isFinite(o?.y)); }

  /** An order from its miner. False (with a 'nobody' event) when told to find someone and nobody is there. */
  order(mode) {
    if (!this.armed || !ORDERS.includes(mode)) return false;
    if (mode === 'someone' && !this.others.length) { this.events.push('nobody'); return false; }
    this.mode = mode; this.next = null; this.repath = 0; this.waiting = false;
    // Out it comes whatever it was doing; told to find acid it has already found, it settles again.
    if (this.state !== 'dormant') this.state = mode === 'acid' && this.found ? 'done' : 'guiding';
    return true;
  }

  /** The tile it is leading to (null at heel, or when the miner it was after has gone). */
  goal(ptx, pty) {
    if (this.mode === 'acid') return this.pool;
    if (this.mode === 'lift') return this.start;
    if (this.mode !== 'someone') return null;
    const from = bfs(this.grid, ptx, pty); let best = null, bestSteps = Infinity;
    for (const o of this.others) {
      const x = Math.round(o.x), y = Math.round(o.y), steps = from[y]?.[x] ?? -1;
      if (steps >= 0 && steps < bestSteps) { best = { x, y }; bestSteps = steps; }
    }
    return best;
  }

  /**
   * @param {number} dt
   * @param {{ t:number, x:number, z:number, yaw:number, elapsedMs:number }} p
   */
  update(dt, p) {
    if (!this.armed) return;
    if (this.state === 'dormant') {
      if (p.elapsedMs >= this.afterMs || this.mode !== 'acid') this.appear(p);
      return;
    }
    if (this.state === 'done') return;
    const [ptx, pty] = tileOf(p.x, p.z);
    const [btx, bty] = tileOf(this.x, this.z);
    const heel = this.mode === 'come', goal = heel ? null : this.goal(ptx, pty);
    if (!heel && !goal) { this.events.push('nobody'); this.mode = 'come'; return; } // they clocked out: back to heel
    const toGoal = heel ? null : bfs(this.grid, goal.x, goal.y);
    const playerToBug = bfs(this.grid, btx, bty)[pty]?.[ptx] ?? -1;
    const bugToGoal = heel ? playerToBug : toGoal[bty]?.[btx] ?? -1;
    const playerToGoal = heel ? 0 : toGoal[pty]?.[ptx] ?? -1;
    const playerNear = playerToBug >= 0 && playerToBug <= 1;

    // There: hover at the goal and wait for the miner (at heel: beside them).
    if (heel ? playerNear : bugToGoal <= ARRIVE_TILES) {
      this.waiting = true; this.moving = false;
      this.facing = heel ? Math.atan2(p.x - this.x, p.z - this.z) : Math.atan2(goal.x * TILE - this.x, goal.y * TILE - this.z);
      this.bob += dt;
      return;
    }

    // Too far ahead of the player → pause so they can catch up.
    // lead = how many more tiles the player still has vs the bug (positive ⇒ bug is ahead).
    const lead = (playerToGoal >= 0 && bugToGoal >= 0) ? (playerToGoal - bugToGoal) : 0;
    if (!heel && !playerNear && lead > WAIT_TILES) {
      this.waiting = true; this.moving = false; this.bob += dt;
      this.facing = Math.atan2(p.x - this.x, p.z - this.z);
      return;
    }
    this.waiting = false;

    // Pick next tile toward the goal (or catch up toward the player if they got ahead, or it was called to heel).
    this.repath -= dt;
    const catchUp = heel || (playerToGoal >= 0 && bugToGoal > playerToGoal + 1);
    const goalDist = catchUp ? bfs(this.grid, ptx, pty) : toGoal;
    const here = catchUp ? (goalDist[bty]?.[btx] ?? -1) : bugToGoal;
    if (!this.next || this.repath <= 0 || (Math.abs(this.x - this.next[0] * TILE) < 0.08 && Math.abs(this.z - this.next[1] * TILE) < 0.08)) {
      this.repath = 0.25;
      this.next = stepToward(goalDist, btx, bty) || [btx, bty];
      if (here <= 1 && catchUp) this.next = [ptx, pty];
    }
    const tx = this.next[0] * TILE, tz = this.next[1] * TILE;
    const vx = tx - this.x, vz = tz - this.z, len = Math.hypot(vx, vz);
    if (len < 1e-4) { this.moving = false; return; }
    const step = Math.min(WALK_SPEED * dt, len);
    this.x += (vx / len) * step; this.z += (vz / len) * step;
    this.moving = step > 0;
    this.facing = Math.atan2(vx, vz);
    this.bob += dt * (this.moving ? 10 : 4);
  }

  appear(p) {
    // Spawn a step or two toward the pool from the player (or at start if that tile is bad).
    const [ptx, pty] = tileOf(p.x, p.z);
    const dist = bfs(this.grid, this.pool.x, this.pool.y);
    let sx = ptx, sy = pty;
    for (let i = 0; i < LEAD_TILES; i++) {
      const n = stepToward(dist, sx, sy);
      if (!n || (n[0] === sx && n[1] === sy)) break;
      sx = n[0]; sy = n[1];
    }
    if (!open(this.grid, sx, sy)) { sx = this.start.x; sy = this.start.y; }
    this.x = sx * TILE; this.z = sy * TILE;
    this.facing = Math.atan2(this.pool.x * TILE - this.x, this.pool.y * TILE - this.z);
    this.state = this.mode === 'acid' && this.found ? 'done' : 'guiding'; this.next = null; this.events.push('appear');
  }
}

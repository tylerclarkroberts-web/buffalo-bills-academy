// The Heeshee Mazode: a rare, exclusive mine encounter. Pure logic (no three.js) so node --test can drive it.
// It bumbles the tunnels with a jerky, stop-start gait, freezes when you look at it, then lunges to snatch a
// hatched bug guide. It never takes a bug the server has not already said is on this shift; the steal itself is
// reported to the server. No bug hatched = it still wanders, but it has nothing to grab.
import { bfs, tileOf, TILE } from './stalker.js';

export const APPEAR_AFTER_MS = 5000; // they hear it first
export const BODY_RADIUS = 0.55;
export const WANDER_SPEED = 1.55;
export const BURST_SPEED = 2.4;
export const LUNGE_SPEED = 9.5;
export const LUNGE_RANGE = 2.6;  // world units: close enough to uncoil
export const GRAB_RANGE = 1.15;
export const HEAR_RANGE = 22;
export const LOOK_COS = Math.cos(0.62); // ~35° either side of the lamp

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = (g, x, y) => g[y]?.[x] === 0;
function neighbors(grid, tx, ty) {
  return DIRS.filter(([dx, dy]) => open(grid, tx + dx, ty + dy)).map(([dx, dy]) => [tx + dx, ty + dy]);
}

/** Unit forward of the miner's yaw, dotted with the direction to the Heeshee. */
export function lookDot(px, pz, yaw, hx, hz) {
  const dx = hx - px, dz = hz - pz, len = Math.hypot(dx, dz);
  if (len < 1e-4) return 1;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return (fx * dx + fz * dz) / len;
}
export function isLookingAt(px, pz, yaw, hx, hz) { return lookDot(px, pz, yaw, hx, hz) > LOOK_COS; }
export function panOf(px, pz, yaw, hx, hz) {
  const dx = hx - px, dz = hz - pz;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const side = dx * rx + dz * rz, ahead = dx * fx + dz * fz;
  const m = Math.hypot(side, ahead) || 1;
  return Math.max(-1, Math.min(1, side / m));
}
export function proximity(dist, range = HEAR_RANGE) { return dist >= range ? 0 : (1 - dist / range) ** 1.35; }

export class HeesheeMazode {
  /**
   * @param maze {{ grid:number[][], pool:{x:number,y:number}, start?:{x:number,y:number} }}
   * @param opts {{ armed?:boolean, hasBug?:boolean, afterMs?:number, rand?:()=>number }}
   */
  constructor(maze, { armed = false, hasBug = false, afterMs = APPEAR_AFTER_MS, rand = Math.random } = {}) {
    this.grid = maze.grid; this.pool = maze.pool; this.start = maze.start || { x: 1, y: 1 };
    this.rand = rand; this.afterMs = Math.max(0, afterMs || 0);
    this.hasBug = !!hasBug;
    this.state = armed ? 'dormant' : 'off'; // off | dormant | wandering | frozen | lunging | fleeing | gone
    this.x = 0; this.z = 0; this.facing = 0;
    this.moving = false; this.next = null;
    this.burst = 0; this.pause = 0; this.hold = 0;
    this.lungeT = 0; this.events = [];
    this.nextNoise = 1.4 + this.rand() * 1.8;
    this.fan = 0; // 0 closed .. 1 open; feathers slowly breathe, then snap
    this.snap = 0;
  }
  get present() { return !['off', 'dormant', 'gone'].includes(this.state); }
  get stolen() { return this.state === 'fleeing' || this.state === 'gone'; }

  setHasBug(v) { this.hasBug = !!v; }
  setPool(p) { if (p) this.pool = p; }

  /**
   * One frame. p = { t, x, z, yaw, elapsedMs, los (optional line-of-sight) }.
   */
  update(dt, p) {
    if (this.state === 'dormant') {
      if (p.elapsedMs >= this.afterMs) this.spawn(p);
      return;
    }
    if (!this.present) return;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    this.nextNoise -= dt;
    if (this.nextNoise <= 0 && dist <= HEAR_RANGE) {
      this.events.push('noise');
      this.nextNoise = 1.1 + this.rand() * 2.4;
    }
    this.fan = Math.max(0, Math.min(1, this.fan + dt * (this.state === 'frozen' || dist < 6 ? 0.55 : 0.22)));
    if (this.snap > 0) this.snap = Math.max(0, this.snap - dt * 3);

    if (this.state === 'lunging') { this.stepLunge(dt, p, dist); return; }
    if (this.state === 'fleeing') { this.stepFlee(dt, p); return; }

    const looking = (p.los !== false) && isLookingAt(p.x, p.z, p.yaw, this.x, this.z) && dist < HEAR_RANGE;
    if (looking && this.state !== 'frozen') {
      this.state = 'frozen'; this.moving = false; this.hold = 0.4 + this.rand() * 1.2;
      this.facing = Math.atan2(p.x - this.x, p.z - this.z);
      this.snap = 1; this.events.push('freeze');
    }

    // Close enough: it uncoils even if you are staring. The grab only fires when a bug is on shift.
    if (this.hasBug && dist <= LUNGE_RANGE) {
      this.state = 'lunging'; this.lungeT = 0.28; this.moving = true; this.snap = 1;
      this.events.push('lunge');
      return;
    }

    if (this.state === 'frozen') {
      this.hold -= dt;
      this.facing = Math.atan2(p.x - this.x, p.z - this.z);
      if (!looking && this.hold <= 0) { this.state = 'wandering'; this.pause = 0.15; }
      return;
    }

    this.stepWander(dt, p);
  }

  stepWander(dt, p) {
    this.burst -= dt; this.pause -= dt;
    this.moving = false;
    // Jerky stop-start: short bursts, then a dead stop, sometimes a long freeze even when not looked at.
    if (this.pause > 0) return;
    if (this.burst <= 0) {
      if (this.rand() < 0.22) { this.pause = 0.35 + this.rand() * 1.1; return; }
      this.burst = 0.18 + this.rand() * 0.45;
      this.pickStep(p);
    }
    if (!this.next) this.pickStep(p);
    if (!this.next) return;
    const speed = (this.rand() < 0.15 ? BURST_SPEED : WANDER_SPEED) * dt;
    this.walkTo(this.next[0] * TILE, this.next[1] * TILE, speed);
    const [tx, ty] = tileOf(this.x, this.z);
    if (tx === this.next[0] && ty === this.next[1] && Math.hypot(this.x - this.next[0] * TILE, this.z - this.next[1] * TILE) < 0.12) {
      this.next = null;
      if (this.rand() < 0.4) this.pause = 0.2 + this.rand() * 0.8;
    }
  }

  stepLunge(dt, p, dist) {
    this.lungeT -= dt;
    this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.walkTo(p.x, p.z, LUNGE_SPEED * dt);
    if (this.hasBug && dist <= GRAB_RANGE) {
      this.hasBug = false;
      this.events.push('steal');
      this.state = 'fleeing';
      this.next = null;
      this.pickEscape(p);
      return;
    }
    if (this.lungeT <= 0 && dist > GRAB_RANGE) {
      // Missed (they sidestepped, or there was no bug): it recoils into a bumble.
      this.state = 'wandering'; this.pause = 0.4; this.next = null;
    }
  }

  stepFlee(dt, p) {
    this.moving = true;
    if (!this.next) this.pickEscape(p);
    if (!this.next) { this.state = 'gone'; this.events.push('gone'); return; }
    this.walkTo(this.next[0] * TILE, this.next[1] * TILE, (BURST_SPEED * 1.6) * dt);
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    const [tx, ty] = tileOf(this.x, this.z);
    if (tx === this.next[0] && ty === this.next[1]) this.next = null;
    if (dist > HEAR_RANGE * 0.85) { this.state = 'gone'; this.events.push('gone'); }
  }

  walkTo(x, z, maxStep) {
    const dx = x - this.x, dz = z - this.z, distance = Math.hypot(dx, dz);
    if (distance < 1e-5) return false;
    const step = Math.min(maxStep, distance);
    this.x += dx * step / distance; this.z += dz * step / distance;
    this.facing = Math.atan2(dx, dz); this.moving = true;
    return true;
  }

  pickStep(p) {
    const [tx, ty] = tileOf(this.x, this.z);
    const opts = neighbors(this.grid, tx, ty);
    if (!opts.length) { this.next = [tx, ty]; return; }
    // Prefer moving along the tunnel, slightly biased away from the miner so it is heard before it is seen,
    // unless it is already close (then it edges in).
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    const scored = opts.map(([x, y]) => {
      const d = Math.hypot(p.x - x * TILE, p.z - y * TILE);
      const away = d - dist;
      const prefer = dist > 8 ? away : -away;
      return { x, y, s: prefer + this.rand() * 1.4 };
    });
    scored.sort((a, b) => b.s - a.s);
    this.next = [scored[0].x, scored[0].y];
  }

  pickEscape(p) {
    const [ptx, pty] = tileOf(p.x, p.z);
    const [etx, ety] = tileOf(this.x, this.z);
    const d = bfs(this.grid, ptx, pty);
    const here = d[ety]?.[etx] ?? 0;
    const opts = neighbors(this.grid, etx, ety).filter(([x, y]) => (d[y]?.[x] ?? 0) >= here);
    const pool = opts.length ? opts : neighbors(this.grid, etx, ety);
    if (!pool.length) { this.next = null; return; }
    const pick = pool[Math.floor(this.rand() * pool.length)];
    this.next = pick;
  }

  spawn(p) {
    const [ptx, pty] = tileOf(p.x, p.z);
    const d = bfs(this.grid, ptx, pty);
    const nearPool = (x, y) => this.pool && Math.abs(x - this.pool.x) + Math.abs(y - this.pool.y) <= 1;
    const c = [];
    for (let y = 0; y < d.length; y++) for (let x = 0; x < (d[0]?.length || 0); x++) {
      if (d[y][x] >= 4 && d[y][x] <= 8 && !nearPool(x, y)) c.push([x, y]);
    }
    if (!c.length) {
      for (let y = 0; y < d.length; y++) for (let x = 0; x < (d[0]?.length || 0); x++) {
        if (d[y][x] >= 3 && d[y][x] <= 10 && !nearPool(x, y)) c.push([x, y]);
      }
    }
    let at = c.length ? c[Math.floor(this.rand() * c.length)] : null;
    if (!at && open(this.grid, this.start.x, this.start.y) && !(this.start.x === ptx && this.start.y === pty)) at = [this.start.x, this.start.y];
    if (!at) {
      const n = neighbors(this.grid, ptx, pty).filter(([x, y]) => !nearPool(x, y));
      if (n.length) at = n[Math.floor(this.rand() * n.length)];
    }
    if (!at) return;
    this.x = at[0] * TILE; this.z = at[1] * TILE;
    this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.state = 'wandering';
    this.events.push('appear');
    this.events.push('noise');
    this.nextNoise = 0.8 + this.rand() * 1.2;
  }
}

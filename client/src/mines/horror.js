// Horror Night, client side (the server decides *when*: server/engine/horror.js). Pure logic, no three.js or DOM,
// so node --test can drive it: the lamp's flicker, the Last Crew (pale grinning things that follow you while the
// lights are out), and the gate that decides when one jumps out of the rock while you mine.
//
// It is all scenery. Nothing here can block you, hurt you, slow you, or touch the bucket, the pay or the clock.
//  - The crew walk the tunnels toward you while you are not looking. Looked at, they stand perfectly still.
//    Caught square in a working headlamp, close enough, they are gone (and come back later, somewhere else).
//  - They stop a couple of metres short, have no body (you walk through them) and never stand in the acid.
//  - At most `max` at once: 3 on a desktop, 2 on a phone.
import { bfs, lineOfSight } from './stalker.js';

export const TILE = 2.2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const tileOf = (x, z) => [Math.round(x / TILE), Math.round(z / TILE)];
const between = (rand, [a, b]) => a + (b - a) * rand();

// ---------- the jump scare gate ----------
/**
 * A small chance per chunk mined, which creeps up the longer nothing has happened, never inside the cooldown and
 * never in the first `graceMs` after the lights go. Only armed once the lights are out.
 */
export const SCARE = Object.freeze({ chance: 0.05, ramp: 0.012, maxChance: 0.35, cooldownMs: 35000, graceMs: 8000 });
export class ScareGate {
  constructor({ chance = SCARE.chance, ramp = SCARE.ramp, maxChance = SCARE.maxChance, cooldownMs = SCARE.cooldownMs, graceMs = SCARE.graceMs, rand = Math.random } = {}) {
    Object.assign(this, { chance, ramp, maxChance, cooldownMs, graceMs, rand });
    this.armedAt = null; this.lastAt = -Infinity; this.misses = 0;
  }
  arm(now) { if (this.armedAt == null) this.armedAt = now; }
  /** The chance the next chunk carries a scare (0 when it can't). */
  odds(now) {
    if (this.armedAt == null || now - this.armedAt < this.graceMs || now - this.lastAt < this.cooldownMs) return 0;
    return Math.min(this.maxChance, this.chance + this.ramp * this.misses);
  }
  /** One chunk mined: true if something jumps out. */
  roll(now) {
    const p = this.odds(now); if (!p) return false;
    if (this.rand() < p) { this.lastAt = now; this.misses = 0; return true; }
    this.misses++; return false;
  }
}

// ---------- the headlamp ----------
/**
 * The lamp once the lights are out: 0..1, a multiplier on its usual brightness. Mostly a weak, wobbly glow; now
 * and then it stutters (rapid on/off) or drops out almost completely for a moment. `calm` (reduce flashing, or
 * prefers-reduced-motion) keeps it dim and wobbly but never strobes: changes are slow and it never goes out.
 */
export const CALM_FLOOR = 0.42;
export class Flicker {
  constructor({ calm = false, rand = Math.random } = {}) { this.calm = calm; this.rand = rand; this.t = 0; this.event = null; this.wait = 2 + rand() * 3; this.v = 0.7; }
  step(dt) {
    this.t += dt;
    const r = this.rand;
    const base = 0.62 + 0.1 * Math.sin(this.t * 1.7) + 0.06 * Math.sin(this.t * 4.3 + 1);
    let target = base;
    if (this.event) {
      const e = this.event; e.left -= dt;
      if (e.kind === 'out') target = e.level;
      else if (e.kind === 'stutter') target = Math.floor(this.t * 14) % 2 ? 0.08 : base;
      else if (e.kind === 'dip') target = e.level;
      if (e.left <= 0) { this.event = null; this.wait = 1.2 + r() * 4.5; }
    } else if ((this.wait -= dt) <= 0) {
      const k = r();
      this.event = this.calm ? { kind: 'dip', level: CALM_FLOOR + 0.08 * r(), left: 0.9 + r() * 1.4 }
        : k < 0.4 ? { kind: 'out', level: 0.02 + r() * 0.06, left: 0.12 + r() * 0.6 }
          : k < 0.75 ? { kind: 'stutter', left: 0.25 + r() * 0.5 } : { kind: 'dip', level: 0.25, left: 0.4 + r() * 0.8 };
    }
    if (this.calm) {
      // never faster than a slow fade (well under three changes a second) and never below the floor
      const k = 1 - Math.exp(-dt * 2.2);
      this.v = Math.max(CALM_FLOOR, this.v + (target - this.v) * k);
    } else this.v = target + (r() - 0.5) * 0.06;
    return Math.max(0, Math.min(1, this.v));
  }
}

// ---------- the Last Crew ----------
export const CREW = Object.freeze({
  maxDesktop: 3, maxPhone: 2,
  firstAfterS: 4, spawnEvery: [6, 13], respawn: [5, 11], // seconds
  walk: 1.45, hurry: 2.8, gap: 2.1, // metres per second, metres
  gaze: 0.42, beam: 0.2, beamReach: 5.2, lampOn: 0.35, // radians either side of centre; metres; lamp level that counts as "on"
  vanishS: 0.35, farTiles: 9, farS: 6, spawnTiles: [3, 6],
});
export class Crew {
  /** grid: the maze tiles (0 = open) · max: cap at once · pool(): current acid tile {x,y} (they never stand in it) */
  constructor(grid, { max = CREW.maxDesktop, rand = Math.random, pool = () => null } = {}) {
    this.grid = grid; this.max = max; this.rand = rand; this.pool = pool;
    this.members = []; this.active = false; this.next = 0; this.ids = 0; this.events = [];
    this.bfsKey = ''; this.dist = null;
  }
  start() { if (!this.active) { this.active = true; this.next = CREW.firstAfterS; } }
  /** 0..1: how close the nearest visible one is (the heartbeat, the vignette). */
  get closeness() {
    let c = 0; for (const m of this.members) if (m.state === 'in') c = Math.max(c, Math.min(1, Math.max(0, 1 - (m.dist - CREW.gap) / 7)));
    return c;
  }
  /** The nearest one that is there, with its offset from the player (for spatial whispers). */
  nearest() { let best = null; for (const m of this.members) if (m.state === 'in' && (!best || m.dist < best.dist)) best = m; return best; }
  paths(ptx, pty) { const k = `${ptx},${pty}`; if (k !== this.bfsKey) { this.bfsKey = k; this.dist = bfs(this.grid, ptx, pty); } return this.dist; }
  /** p = { x, z, yaw, lamp (0..1, the flicker right now) }. yaw follows the scene: forward = (-sin yaw, -cos yaw). */
  update(dt, p) {
    if (!this.active) return;
    const [ptx, pty] = tileOf(p.x, p.z), d = this.paths(ptx, pty);
    this.next -= dt;
    if (this.next <= 0) {
      this.next = between(this.rand, CREW.spawnEvery);
      if (this.members.filter((m) => m.state !== 'gone').length < this.max) this.spawn(p, d);
    }
    for (const m of this.members) this.step(m, dt, p, d, ptx, pty);
  }
  look(m, p) {
    const dx = m.x - p.x, dz = m.z - p.z; m.dist = Math.hypot(dx, dz);
    m.angle = Math.abs(wrap(Math.atan2(-dx, -dz) - p.yaw));
    m.los = lineOfSight(this.grid, p.x, p.z, m.x, m.z);
    m.seen = m.los && m.angle < CREW.gaze + Math.atan2(0.3, Math.max(m.dist, 0.1));
  }
  step(m, dt, p, d, ptx, pty) {
    if (m.state === 'gone') { m.wait -= dt; if (m.wait <= 0) this.spawn(p, d, m); return; }
    if (m.state === 'vanish') { m.alpha = Math.max(0, m.alpha - dt / CREW.vanishS); if (!m.alpha) { m.state = 'gone'; m.wait = between(this.rand, CREW.respawn); } return; }
    m.alpha = Math.min(1, m.alpha + dt * 2.5);
    this.look(m, p);
    // in the beam of a working lamp, close enough: gone
    if (m.seen && m.angle < CREW.beam + Math.atan2(0.3, Math.max(m.dist, 0.1)) && m.dist < CREW.beamReach && p.lamp >= CREW.lampOn) {
      m.state = 'vanish'; this.events.push({ kind: 'vanish', id: m.id }); return;
    }
    const [etx, ety] = tileOf(m.x, m.z), tiles = d[ety]?.[etx] ?? -1;
    m.far = tiles > CREW.farTiles || tiles < 0 ? m.far + dt : 0;
    if (m.far > CREW.farS && !m.seen) { this.place(m, p, d); return; }
    m.moving = false;
    m.facing = Math.atan2(p.x - m.x, p.z - m.z);
    if (m.seen || m.dist <= CREW.gap) return; // looked at: perfectly still
    if (!m.nextTile || (Math.abs(m.x - m.nextTile[0] * TILE) < 0.05 && Math.abs(m.z - m.nextTile[1] * TILE) < 0.05)) {
      let best = null;
      if (tiles > 0) for (const [ox, oy] of DIRS) { const X = etx + ox, Y = ety + oy; if (d[Y]?.[X] >= 0 && d[Y][X] < tiles && (!best || d[Y][X] < d[best[1]][best[0]])) best = [X, Y]; }
      m.nextTile = tiles <= 1 ? [ptx, pty] : best || [etx, ety];
    }
    let tx = m.nextTile[0] * TILE, tz = m.nextTile[1] * TILE;
    if (tiles <= 1) { tx = p.x; tz = p.z; }
    const vx = tx - m.x, vz = tz - m.z, len = Math.hypot(vx, vz); if (len < 1e-4) { m.nextTile = null; return; }
    let s = Math.min((tiles > 5 ? CREW.hurry : CREW.walk) * dt, len);
    if (tiles <= 1) s = Math.min(s, Math.max(0, m.dist - CREW.gap));
    m.x += (vx / len) * s; m.z += (vz / len) * s; m.moving = s > 0;
  }
  /** Somewhere 3–6 tiles' walk away that you are not looking at (at the edge of the light), never in the acid. */
  pick(p, d) {
    const [lo, hi] = CREW.spawnTiles, pool = this.pool(), c = [];
    for (let y = 0; y < d.length; y++) for (let x = 0; x < d[0].length; x++) {
      const t = d[y][x]; if (t < lo || t > hi) continue;
      if (pool && Math.abs(x - pool.x) + Math.abs(y - pool.y) <= 1) continue;
      if (this.members.some((m) => m.state !== 'gone' && Math.round(m.x / TILE) === x && Math.round(m.z / TILE) === y)) continue;
      const X = x * TILE, Z = y * TILE, ang = Math.abs(wrap(Math.atan2(-(X - p.x), -(Z - p.z)) - p.yaw));
      c.push([x, y, ang > 0.75 || !lineOfSight(this.grid, p.x, p.z, X, Z)]);
    }
    const hidden = c.filter((t) => t[2]), from = hidden.length ? hidden : c;
    return from.length ? from[Math.floor(this.rand() * from.length)] : null;
  }
  place(m, p, d) {
    const at = this.pick(p, d); if (!at) { m.state = 'gone'; m.wait = 2; return false; }
    Object.assign(m, { x: at[0] * TILE, z: at[1] * TILE, state: 'in', alpha: 0, far: 0, nextTile: null, seen: false, moving: false });
    this.look(m, p); return true;
  }
  spawn(p, d, m = null) {
    const fresh = !m;
    m ||= { id: ++this.ids, x: 0, z: 0, facing: 0, alpha: 0, dist: 99, angle: Math.PI, seen: false, los: false, far: 0, moving: false, state: 'gone', wait: 0, nextTile: null, tilt: (this.rand() - 0.5) * 0.6 };
    if (!this.place(m, p, d)) return null;
    if (fresh) this.members.push(m);
    this.events.push({ kind: 'appear', id: m.id });
    return m;
  }
}

// The company picnic grounds behind the last door in the Hall of Doors: an open quarry where everyone on shift settles up with
// rivet guns. Pure and shared with the browser: the ground, the boulders, where people turn up and what a shot hits.
// Positions are metres (x and z on the ground, y up). Yaw follows the mine: facing is (-sin yaw, -cos yaw) in (x, z).
import { rng } from './maze.js';

export const GROUND = { radius: 42, eye: 1.5, tall: 1.85, body: 0.42, speed: 6.5, range: 120 };
export const INTERN_RING = 18; // the circle Gary walks
const TAU = Math.PI * 2;

export const SPAWNS = Array.from({ length: 10 }, (_, i) => ({ x: Math.cos((i / 10) * TAU + 0.3) * 33, z: Math.sin((i / 10) * TAU + 0.3) * 33 }));

/** Boulders: cover, and in the way. Never on a spawn, the tables in the middle or Gary's lap. */
export const ROCKS = (() => {
  const r = rng(1966), out = [];
  while (out.length < 16) {
    const a = r() * TAU, d = 8 + r() * 31, k = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 1.4 + r() * 2.2 };
    if (Math.abs(d - INTERN_RING) > k.r + 1 && SPAWNS.every((s) => Math.hypot(s.x - k.x, s.z - k.z) > k.r + 2)) out.push(k);
  }
  return out;
})();

/** Ground height: flat around the tables, low hills across the floor, then the quarry's benches going up past where anyone can walk. */
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const hills = 1.3 * Math.sin(x * 0.09 + 1) * Math.cos(z * 0.07) + 0.7 * Math.sin(x * 0.19 + z * 0.13);
  const lip = Math.max(0, d - GROUND.radius + 2), out = Math.max(0, d - GROUND.radius);
  const bench = 6 * (Math.floor(out / 5) + Math.min(1, ((out / 5) % 1) * 4)); // 6 m faces, 5 m apart
  return hills * Math.max(0, Math.min(1, (d - 6) / 8)) + Math.min(lip, 2) ** 2 * 0.3 + bench;
}

/** Is this point inside the ground or a boulder? */
export function solid(x, y, z) {
  if (y < heightAt(x, z)) return true;
  return ROCKS.some((k) => Math.hypot(x - k.x, z - k.z) < k.r * 0.9 && y < heightAt(k.x, k.z) + k.r);
}

/** Where you end up if you try to stand at (x, z): pushed out of boulders and kept inside the quarry. */
export function walk(x, z) {
  for (const k of ROCKS) {
    const d = Math.hypot(x - k.x, z - k.z), min = k.r * 0.9 + GROUND.body;
    if (d < min && d > 0) { x = k.x + ((x - k.x) * min) / d; z = k.z + ((z - k.z) * min) / d; }
  }
  const d = Math.hypot(x, z);
  return d > GROUND.radius ? { x: (x * GROUND.radius) / d, z: (z * GROUND.radius) / d } : { x, z };
}

/**
 * The guns. `everyMs` is how fast the browser fires one (the server allows a little faster, for jitter); `ammo` is
 * what a pickup holds. Everyone always has the rivet gun and may carry one of the others. What each does to a
 * miner is the server's business (`damage` in server/picnic.js).
 */
export const GUNS = {
  rivet: { name: 'Rivet gun', verb: 'RIVET', everyMs: 250, burst: 4 },
  stapler: { name: 'Stapler', verb: 'STAPLE', everyMs: 800, ammo: 8 },             // industrial. Terrible up close, harmless past 18 m
  surveyor: { name: 'Surveyor', verb: 'SURVEY', everyMs: 1250, ammo: 6 },          // one slow round that lands like five rivets, at any distance
  dynamite: { name: 'Dynamite', verb: 'BLAST', everyMs: 1500, ammo: 2, blast: 6 }, // goes off where it lands: everyone within 6 m, you included
};

/** Things lying about the quarry. Each comes back a while after someone takes it. */
export const PICKUP_REACH = 1.6;
export const PICKUPS = [
  ['stapler', 12, 1.0], ['stapler', 12, 4.1], ['surveyor', 38, 2.2], ['surveyor', 38, 5.3], ['dynamite', 27, 3.4],
  ['hat', 5.6, 4.7],  // a second hard hat, under the banner
  ['salad', 4.7, 0.4], // the potato salad, on a table
].map(([kind, d, a], i) => ({ id: `${kind}${i}`, kind, ...walk(Math.cos(a) * d, Math.sin(a) * d) }));

/**
 * What a shot from `eye` along unit vector `dir` does: `{ id, x, y, z }`, the nearest standing target in the way
 * (`targets` are `{ id, x, y, z }` with y at their boots) or, with `id: null`, the ground, rock or thin air it ends in.
 */
export function shoot(eye, dir, targets) {
  const at = (t) => ({ x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t });
  let best = { id: null, t: GROUND.range };
  for (const o of targets) {
    const t = (o.x - eye.x) * dir.x + (o.y + 1 - eye.y) * dir.y + (o.z - eye.z) * dir.z; // closest pass to their chest
    if (t <= 0 || t >= best.t) continue;
    const p = at(t);
    if (Math.hypot(p.x - o.x, p.z - o.z) < GROUND.body && p.y > o.y && p.y < o.y + GROUND.tall) best = { id: o.id, t };
  }
  for (let t = 0.5; t < best.t; t += 0.5) { const p = at(t); if (solid(p.x, p.y, p.z)) return { id: null, ...p }; }
  return { id: best.id, ...at(best.t) };
}

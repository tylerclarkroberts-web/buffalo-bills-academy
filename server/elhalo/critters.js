// EL HALO: the town's harmless locals, shared by the server (snapshot, tests) and the client (draws them).
// Street dogs trot, run, stop to sniff and wander on fixed loops; two of them are stuck together tail to tail and
// shuffle around the plaza as one awkward pair, each tugging its own way. Everything is a pure function of the match
// clock, so every player (and anyone joining late) sees exactly the same dogs in the same places. Nothing here can be
// shot, bitten or blocked: no colliders, enemies ignore them, bullets pass straight through.
import { BOUNDS, OBSTACLES, ELOTE, insideSolid, segHitsRect, terrain, rng } from './map.js';

export const DOG_COUNT = { free: 4, phone: 2 }; // plus the stuck pair, always
const GAITS = { sniff: 0, walk: 1, trot: 2, run: 3, tug: 4 };
const SPEED = { walk: 1.2, trot: 2.4, run: 5.6 };

const clear = (a, b) => {
  if (OBSTACLES.some((r) => segHitsRect(a, b, r, 1.0))) return false;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  for (let s = 0; s <= d; s += 0.5) { const k = d ? s / d : 0, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; if (insideSolid({ x, y: terrain(x, z) + 0.35, z })) return false; }
  return true;
};
const okSpot = (p, box) => p.x > box.x0 && p.x < box.x1 && p.z > box.z0 && p.z < box.z1 && Math.hypot(p.x - ELOTE.x, p.z - ELOTE.z) > 2.2
  && !insideSolid({ x: p.x, y: terrain(p.x, p.z) + 0.35, z: p.z });

// a closed loop of waypoints inside `box`, each leg walkable in a straight line, with gaits and sniff stops
function loop(seed, box, n, { gaits = ['walk', 'trot', 'trot', 'run'], stop = [1.2, 3.4], stopOdds = 0.55 } = {}) {
  const R = rng(seed), pts = [];
  for (let tries = 0; pts.length < n && tries < 4000; tries++) {
    const p = { x: box.x0 + R() * (box.x1 - box.x0), z: box.z0 + R() * (box.z1 - box.z0) };
    if (!okSpot(p, box)) continue;
    if (pts.length && (!clear(pts[pts.length - 1], p) || Math.hypot(p.x - pts[pts.length - 1].x, p.z - pts[pts.length - 1].z) < 3)) continue;
    if (pts.length === n - 1 && !clear(p, pts[0])) continue;
    pts.push(p);
  }
  const legs = []; let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.z - a.z), g = gaits[Math.floor(R() * gaits.length)];
    const dur = len / SPEED[g], yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    legs.push({ a, b, t0: t, t1: t + dur, gait: GAITS[g], yaw }); t += dur;
    if (R() < stopOdds) { const s = stop[0] + R() * (stop[1] - stop[0]); legs.push({ a: b, b, t0: t, t1: t + s, gait: GAITS.sniff, yaw, stop: true }); t += s; }
  }
  return { pts, legs, period: t };
}
function along(plan, time) {
  const T = plan.period, tt = ((time % T) + T) % T;
  const l = plan.legs.find((q) => tt <= q.t1) || plan.legs[plan.legs.length - 1];
  const k = l.t1 > l.t0 ? Math.max(0, Math.min(1, (tt - l.t0) / (l.t1 - l.t0))) : 0;
  return { x: l.a.x + (l.b.x - l.a.x) * k, z: l.a.z + (l.b.z - l.a.z) * k, yaw: l.yaw, gait: l.gait, leg: plan.legs.indexOf(l), stop: !!l.stop };
}

// where they roam: the free dogs get the whole middle of the canyon, the stuck pair keeps to the plaza by the creek
const ROAM = [{ x0: -14, x1: 8, z0: -44, z1: -8 }, { x0: -6, x1: 20, z0: 10, z1: 44 }, { x0: -20, x1: 8, z0: -14, z1: 20 }, { x0: -4, x1: 22, z0: -44, z1: -6 }];
export const DOG_PLANS = ROAM.map((box, i) => loop(1201 + i * 97, box, 6));
export const PAIR_PLAN = loop(7001, { x0: -6, x1: 7, z0: -16, z1: 18 }, 5, { gaits: ['walk'], stop: [1.5, 3], stopOdds: 0.8 });
export const PAIR_GAP = 0.42; // half the distance between the two dogs' middles: tail to tail

// every dog at match time t: [free dogs..., pair dog A, pair dog B]. gait: 0 sniff, 1 walk, 2 trot, 3 run, 4 tug (pair)
export function dogsAt(t) {
  const out = DOG_PLANS.map((p) => { const a = along(p, t); return { x: a.x, z: a.z, yaw: a.yaw, gait: a.gait }; });
  // the pair: one dog wins the tug-of-war for a stretch and drags the other backwards, then they swap
  const c = along(PAIR_PLAN, t * 0.6), leadA = c.leg % 4 < 2;
  const axis = leadA ? c.yaw : c.yaw + Math.PI; // dog A faces along the axis, dog B the other way
  const wob = (c.stop ? 0.16 : 0.07) * Math.sin(t * (c.stop ? 5.1 : 3.3)), swing = (c.stop ? 0.22 : 0.08) * Math.sin(t * 1.7);
  const ax = -Math.sin(axis + swing), az = -Math.cos(axis + swing), cx = c.x + ax * wob, cz = c.z + az * wob;
  out.push({ x: cx + ax * PAIR_GAP, z: cz + az * PAIR_GAP, yaw: axis + swing, gait: GAITS.tug, pair: 'a' });
  out.push({ x: cx - ax * PAIR_GAP, z: cz - az * PAIR_GAP, yaw: axis + swing + Math.PI, gait: GAITS.tug, pair: 'b' });
  return out;
}

// the elote man's calls: one line every few seconds, the same for everyone (index into ELOTE_LINES, or -1 between)
export const ELOTE_LINES = ['¡ELOTES!', '¡ESQUITES!', '¡ELOTES CALIENTITOS!', '¡CON CHILE Y LIMÓN!', '¡PÁSELE, PÁSELE!', '¡HAY ELOTES!'];
export const ELOTE_EVERY = 6.5, ELOTE_SAY = 2.4;
export function eloteShout(t) { return t % ELOTE_EVERY < ELOTE_SAY ? Math.floor(t / ELOTE_EVERY) % ELOTE_LINES.length : -1; }
export { BOUNDS };

// Foff's Bachelor Party: the golf itself. Pure functions over yards with injected randomness, so the node test
// and the balance script can play thousands of holes without a canvas. +x is right, +y is toward the green;
// an aim of 0 points straight up the hole and positive aims go right.

export const CLUBS = [
  { id: 'DR', name: 'Driver', carry: 250, spread: 0.2, loft: 0.8, roll: 1 },
  { id: '3W', name: '3 Wood', carry: 220, spread: 0.17, loft: 0.9, roll: 0.9 },
  { id: '5I', name: '5 Iron', carry: 185, spread: 0.14, loft: 1, roll: 0.7 },
  { id: '7I', name: '7 Iron', carry: 155, spread: 0.12, loft: 1.1, roll: 0.5 },
  { id: '9I', name: '9 Iron', carry: 125, spread: 0.1, loft: 1.2, roll: 0.35 },
  { id: 'PW', name: 'Wedge', carry: 100, spread: 0.09, loft: 1.3, roll: 0.25 },
  { id: 'SW', name: 'Sand Wedge', carry: 70, spread: 0.08, loft: 1.4, roll: 0.15 },
  { id: 'PT', name: 'Putter', putt: true },
];
export const MAX_STROKES = 10; // then you pick up, like a gentleman
const LIE = { tee: [1, 1], fairway: [1, 1], rough: [0.85, 1.5], sand: [0.7, 1.6], trees: [0.5, 2.2], green: [1, 1] }; // [carry, spread]
// Once it is on the ground the ball is a rolling thing: grass drags on it and hills pull at it.
const FRICTION = { tee: 9, fairway: 9, rough: 28, trees: 45, sand: 90, green: 3.5 };       // drag, yards per second squared
const RUN = { tee: 0.12, fairway: 0.12, rough: 0.04, trees: 0.01, sand: 0.01, green: 0.1 }; // run-out on the flat, as a share of the carry
const GRAV = 35;       // how hard a slope pulls; a grade steeper than FRICTION / GRAV will not hold a ball
export const DT = 0.02; // seconds per rolling step, and per point of the path the game replays
const CUP = 0.35;      // yards: a ball passing this close to the pin drops...
const SINK = 4.6;      // ...unless it is still going faster than this (about three yards left to run)
const WIND = 0.006;    // yards of drift per yard of carry per mph, before loft
export const BOOST = 1.15;    // the Chosen One shot carries further

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const angleTo = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
/** Inside an ellipse whose edge wanders in and out by `amp` of its radius, so nothing on the course is a perfect oval. */
function inBlob(p, e, amp) {
  const dx = (p[0] - e.c[0]) / e.rx, dy = (p[1] - e.c[1]) / e.ry, d2 = dx * dx + dy * dy;
  if (d2 > (1 + amp) ** 2) return false;
  if (d2 < (1 - amp) ** 2) return true;
  const a = Math.atan2(dy, dx), k = e.c[0] * 0.37 + e.c[1] * 0.11; // the same wobble every time for the same shape
  return Math.sqrt(d2) <= 1 + amp * (0.6 * Math.sin(3 * a + k) + 0.4 * Math.sin(5 * a + k * 1.7));
}
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const t = l2 ? clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
}

export function lieAt(hole, p) {
  const [x0, y0, x1, y1] = hole.bounds;
  if (p[0] < x0 || p[1] < y0 || p[0] > x1 || p[1] > y1) return 'ob';
  if (inBlob(p, hole.green, 0.08)) return 'green';
  if (hole.water?.some((e) => inBlob(p, e, 0.16))) return 'water';
  if (hole.sand?.some((e) => inBlob(p, e, 0.24))) return 'sand';
  if (hole.trees?.some((e) => inBlob(p, e, 0.14))) return 'trees';
  if (Math.abs(p[0] - hole.tee[0]) <= 5 && Math.abs(p[1] - hole.tee[1]) <= 7) return 'tee';
  if (hole.green.apron && inBlob(p, hole.green.apron, 0.08)) return 'fairway'; // the collar round the green
  const f = hole.fairway.pts, w = hole.fairway.w * (1 + 0.2 * Math.sin(p[1] / 31 + p[0] / 47)); // mown by hand, not by ruler
  for (let i = 1; i < f.length; i++) if (segDist(p, f[i - 1], f[i]) <= w) return 'fairway';
  return 'rough';
}

/** Which way is uphill at p, and how steep (rise over run): the hole's hills plus the tilt of its green. */
export function slopeAt(hole, p) {
  let gx = 0, gy = 0;
  for (const h of hole.hills || []) {
    const qx = p[0] - h.c[0], qy = p[1] - h.c[1], k = -2 * h.h * Math.exp(-(qx * qx + qy * qy) / (h.r * h.r)) / (h.r * h.r);
    gx += k * qx; gy += k * qy;
  }
  const g = hole.green, [sx, sy] = g.slope || [0, 0], qx = p[0] - g.c[0], qy = p[1] - g.c[1], r2 = 9 * Math.max(g.rx, g.ry) ** 2;
  const e = Math.exp(-(qx * qx + qy * qy) / r2), d = (sx * qx + sy * qy) * 2 / r2; // green.slope points downhill and fades out past the fringe
  return [gx + e * (d * qx - sx), gy + e * (d * qy - sy)];
}

/** The sensible club: the putter on the green, otherwise the shortest one that gets there. Any club can be swung from
 *  anywhere (a driver off the green, a putter out of a bunker); this is only what a caddie would hand over. */
export function pickClub(lie, toPin) {
  const carry = (LIE[lie] || LIE.rough)[0];
  return (lie === 'green' ? CLUBS.at(-1) : CLUBS.findLast((c) => !c.putt && c.carry * carry >= toPin)) || CLUBS[0];
}
/** What a full swing of this club does from this lie. The putter and the sand wedge scale down for short ones. */
export function swingSpec(club, lie, toPin) {
  if (club.putt) return { putt: true, max: clamp(toPin * 1.8, 5, 45), spread: 0.05 };
  const [carry, spread] = LIE[lie] || LIE.rough;
  const chip = club.id === 'SW' && toPin < 50;
  return { max: (chip ? clamp(toPin * 1.4, 15, 70) : club.carry) * carry, spread: club.spread * spread, loft: club.loft, roll: club.roll, chip };
}
/** Meter power that sends this swing to `target` over flat ground, counting the run after it lands. Over 1 is out of reach. */
export function powerFor(hole, from, spec, target) {
  const run = spec.putt ? 0 : (RUN[lieAt(hole, target)] || 0) * spec.roll;
  return dist(from, target) / (spec.max * (1 + run));
}

/** Roll from p at velocity v until the grass holds it, the cup takes it or it leaves the course. */
function roll(hole, p, v) {
  const curve = [p]; let lie = lieAt(hole, p);
  for (let i = 0; i < 1500 && lie !== 'water' && lie !== 'ob'; i++) {
    const [gx, gy] = slopeAt(hole, p), mu = FRICTION[lie];
    if (Math.hypot(v[0], v[1]) < 0.3 && GRAV * Math.hypot(gx, gy) <= mu) break;
    const vx = v[0] - GRAV * gx * DT, vy = v[1] - GRAV * gy * DT, sp = Math.hypot(vx, vy), k = Math.max(0, sp - mu * DT) / (sp || 1);
    v = [vx * k, vy * k];
    const q = [p[0] + v[0] * DT, p[1] + v[1] * DT];
    if (sp * k <= SINK && segDist(hole.pin, p, q) <= CUP) return { curve: [...curve, hole.pin.slice()], rest: hole.pin.slice(), lie: 'green', holed: true };
    p = q; lie = lieAt(hole, p); curve.push(p);
  }
  return { curve, rest: p, lie, holed: false };
}

/** One swing. `power` is 0..1 of the spec's full distance; `err` is -1..1 (beyond that is a shank).
 *  Returns where it came down (`land`), the path it rolled (`curve`, one point per DT) and where it stopped. */
export function shoot(hole, from, spec, { aim, power, err = 0, wind = [0, 0], boost = false }) {
  const a = aim + err * spec.spread, d = [Math.sin(a), Math.cos(a)];
  let land = from.slice(), drift = [0, 0], speed;
  if (spec.putt) speed = Math.sqrt(2 * FRICTION.green * Math.max(0.1, spec.max * power));
  else {
    const carry = spec.max * power * (boost ? BOOST : 1), blown = carry * WIND * spec.loft;
    drift = [wind[0] * blown, wind[1] * blown];
    land = [from[0] + d[0] * carry + drift[0], from[1] + d[1] * carry + drift[1]];
    const lie = lieAt(hole, land);
    speed = Math.sqrt(2 * (FRICTION[lie] || 0) * carry * (RUN[lie] || 0) * spec.roll);
  }
  const out = { ...roll(hole, land, [d[0] * speed, d[1] * speed]), land, drift, penalty: 0 };
  if (out.lie !== 'water' && out.lie !== 'ob') return out;
  return { ...out, hazard: out.lie, rest: from.slice(), lie: lieAt(hole, from), penalty: 1 }; // stroke and distance
}

export const teeUp = (hole) => ({ pos: hole.tee.slice(), lie: 'tee', strokes: 0, holed: false });
export function applyShot(g, res) {
  g.strokes += 1 + res.penalty; g.pos = res.rest; g.lie = res.lie; g.holed = res.holed;
  if (!g.holed && g.strokes >= MAX_STROKES) { g.strokes = MAX_STROKES; g.holed = true; g.pickedUp = true; }
  return g;
}

const SKIP = ['water', 'sand', 'trees']; // nobody aims at these on purpose
/** The hole's line of play, a point every five yards or so from the tee to the pin. */
const line = (hole) => hole.path.slice(1).flatMap((b, i) => {
  const a = hole.path[i], n = Math.ceil(dist(a, b) / 5);
  return Array.from({ length: n + 1 }, (_, k) => [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
});
/** Where a sensible golfer aims: the pin if it is in reach, otherwise as far up the hole's line as the club goes. */
export function aimPoint(hole, from, reach) {
  const toPin = dist(from, hole.pin);
  if (toPin <= reach) return hole.pin;
  const best = line(hole).findLast((p) => dist(from, p) <= reach && dist(p, hole.pin) < toPin && !SKIP.includes(lieAt(hole, p))); // later points are further up the hole
  return best || [from[0] + (hole.pin[0] - from[0]) * reach / toPin, from[1] + (hole.pin[1] - from[1]) * reach / toPin];
}

/** A friend's swing. Skill 1 tops it into the trees; skill 10 is annoying. `wild` multiplies the mistakes; `long`
 *  is a driver that goes a fifth further and nobody knows where. */
export function aiSwing(hole, g, skill, rnd, wind = [0, 0], { wild = 1, long = false } = {}) {
  const t = (clamp(skill, 1, 10) - 1) / 9, toPin = dist(g.pos, hole.pin);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const club = pickClub(g.lie, toPin), spec = swingSpec(club, g.lie, toPin);
  if (long && club.id === 'DR') { spec.max *= 1.2; wild *= 1.8; }
  if (spec.putt) { // read the green: try the putt, see where it ends up, aim the other way by that much
    let to = hole.pin.slice(), aim, power;
    for (let i = 0; i < 3; i++) {
      aim = angleTo(g.pos, to); power = clamp((dist(g.pos, to) + 0.5) / spec.max, 0.05, 1);
      const end = shoot(hole, g.pos, spec, { aim, power }).curve.at(-1), read = lerp(0.3, 1, t);
      to = [to[0] - (end[0] - hole.pin[0]) * read, to[1] - (end[1] - hole.pin[1]) * read];
    }
    return { club, spec, aim: aim + gauss() * lerp(0.3, 0.08, t) * wild, power: clamp(power * (1 + gauss() * lerp(0.4, 0.1, t) * wild), 0.05, 1), err: 0 };
  }
  let target = aimPoint(hole, g.pos, spec.max);
  const power = Math.min(1, powerFor(hole, g.pos, spec, target)), drift = spec.max * power * WIND * spec.loft * t; // better players allow for wind
  target = [target[0] - wind[0] * drift, target[1] - wind[1] * drift];
  const duff = rnd() < lerp(0.4, 0, t) + (wild - 1) * 0.1;
  return { club, spec, duff, aim: angleTo(g.pos, target), power: clamp(power * (1 + gauss() * lerp(0.25, 0.08, t)) * (duff ? 0.25 : 1), 0.05, 1), err: clamp(gauss() * lerp(1.2, 0.45, t) * wild, -1.5, 1.5) };
}

// Friends are { skill, quirk? }: 'rage' swings worse after a bad one, 'long' has that driver, and 'cheat' is
// Kashely, who plays ranch rules. A bare number is just a skill. Ranch rules, all of them in plain sight:
// he tees off RANCH yards up the hole; anything that misses the short grass he takes again while `q.mulligans`
// (the caller's count for the match) lasts, and after that it turns up on the fairway (`kick`); a putt inside GIMME
// is good; he keeps his own card (cardScore, `q.pencil` times a match); and he marks Keetch's ball (markBack).
// scripts/foff-balance.mjs says what these cost: he is meant to be harder than the last nine, and still beatable.
const RANCH = 60, GIMME = 4, MARK = 2; // yards
const bad = (res) => !!res.hazard || res.lie === 'trees' || res.lie === 'sand';
const cheats = (foe) => foe?.quirk === 'cheat';
/** Where a friend tees off. The ranch tees are wherever Kashely is standing. */
export const foeTee = (hole, foe) => (cheats(foe) ? { ...teeUp(hole), pos: aimPoint(hole, hole.tee, RANCH) } : teeUp(hole));
/** What a friend writes down for a hole. Kashely's pencil makes a hole he did not birdie one better. */
export function cardScore(foe, strokes, par, q = {}) {
  if (!cheats(foe) || strokes < par || !(q.pencil > 0)) return strokes;
  q.pencil--; return strokes - 1;
}
/** Kashely marks Keetch's ball on the green and puts it back MARK yards further from the hole, if that is still green. */
export function markBack(hole, pos) {
  const d = dist(pos, hole.pin), p = [0, 1].map((i) => pos[i] + (pos[i] - hole.pin[i]) * MARK / d);
  return d > 0 && lieAt(hole, p) === 'green' ? p : null;
}
/** A friend's swing and what came of it, not yet on the card. */
export function foeSwing(hole, g, foe, rnd, wind, q = {}) {
  const f = typeof foe === 'number' ? { skill: foe } : foe;
  if (cheats(f) && g.lie === 'green' && dist(g.pos, hole.pin) <= GIMME) return { spec: { putt: true }, gimme: true, res: { curve: [g.pos], land: g.pos, drift: [0, 0], rest: hole.pin.slice(), lie: 'green', holed: true, penalty: 0 } };
  const s = aiSwing(hole, g, f.skill, rnd, wind, { wild: f.quirk === 'rage' && g.mad ? 2.5 : 1, long: f.quirk === 'long' });
  const res = shoot(hole, g.pos, s.spec, { ...s, wind }), off = cheats(f) && (bad(res) || res.lie === 'rough'), mulligan = off && q.mulligans > 0;
  const end = res.curve.at(-1), to = off && !mulligan && line(hole).filter((p) => lieAt(hole, p) === 'fairway').sort((a, b) => dist(a, end) - dist(b, end))[0];
  return { spec: s.spec, res, mulligan, kick: to ? { rest: to, lie: 'fairway', penalty: 0 } : null, mad: f.quirk === 'rage' && (bad(res) || s.duff) };
}
/** Put it on the card, unless it was a mulligan, which never happened. A kicked ball counts from where it was kicked to. */
export function foeApply(g, out, q = {}) {
  if (out.mulligan) { q.mulligans--; return g; }
  g.mad = out.mad;
  return applyShot(g, out.kick ? { ...out.res, ...out.kick } : out.res);
}
export function aiStroke(hole, g, foe, rnd, wind, q) {
  const out = foeSwing(hole, g, foe, rnd, wind, q);
  foeApply(g, out, q);
  return out.res;
}
export function aiHole(hole, foe, rnd, wind, q) {
  const g = foeTee(hole, foe);
  while (!g.holed) aiStroke(hole, g, foe, rnd, wind, q);
  return g.strokes;
}
export const windFor = (rnd, max = 8) => { const a = rnd() * Math.PI * 2, v = Math.round(rnd() * max); return [Math.sin(a) * v, Math.cos(a) * v]; };

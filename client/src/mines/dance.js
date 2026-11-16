// v89: the mine dances, drawn by moving the miner's joints in code (see buildMiner in miners.js). Every move here is
// our own: simple keyframes on a 116 bpm count. Pure maths on plain {position, rotation} objects, so tests can run it
// without a browser. Arms and legs hang straight down at rest; on them, rotation.x < 0 swings forward (+z), and an
// arm's rotation.z swings it out to its own side (left arm negative, right arm positive).
import { danceId } from '../../../server/engine/dances.js';

export const BPM = 116;
const PI = Math.PI;
const JOINTS = ['body', 'upper', 'head', 'armL', 'armR', 'legL', 'legR'];
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** 1 on the beat, falling to 0 by `width` of a beat later: a hit. */
const hit = (b, width = 0.35) => { const f = b - Math.floor(b); return f < width ? 1 - ease(f / width) : 0; };
/** Smooth 0..1..0 over each beat. */
const bounce = (b) => Math.abs(Math.sin(b * PI));
/** Blend between keyframe values: keys are evenly spaced per beat, `snap` holds then jumps (robot). */
function keys(list, b, snap = 0) {
  const n = list.length, i = Math.floor(b) % n, f = b - Math.floor(b);
  const a = list[(i + n) % n], c = list[(i + 1) % n];
  const t = snap ? clamp01((f - (1 - snap)) / snap) : ease(f);
  return a + (c - a) * t;
}

export function resetPose(m) {
  for (const j of JOINTS) {
    const o = m[j]; if (!o) continue;
    o.rotation.x = o.rotation.y = o.rotation.z = 0;
    if (j === 'body') o.position.x = o.position.y = o.position.z = 0;
  }
}

const MOVES = {
  // forward thrust on every beat, a quick pop and a slow pull back; arms reach out and yank in.
  hipthrust(m, b, k) {
    const h = hit(b, 0.5);
    m.body.position.z = 0.13 * h * k;
    m.upper.rotation.x = (-0.18 - 0.22 * h) * k;
    m.head.rotation.x = 0.18 * h * k;
    m.armL.rotation.x = m.armR.rotation.x = (-1.1 + 0.8 * h) * k;
    m.armL.rotation.z = -0.35 * k; m.armR.rotation.z = 0.35 * k;
    m.legL.rotation.z = -0.12 * k; m.legR.rotation.z = 0.12 * k;
  },
  // a stompy, bouncy one: knees pop, one foot then the other slaps down, arms pump up overhead in turn.
  tuktuk(m, b, k) {
    const side = Math.floor(b) % 2 ? 1 : -1, lift = Math.sin((b % 1) * PI);
    m.body.position.y = 0.07 * lift * k;
    m.legL.rotation.x = side < 0 ? -0.75 * lift * k : 0.1 * k;
    m.legR.rotation.x = side > 0 ? -0.75 * lift * k : 0.1 * k;
    m.armL.rotation.x = (side < 0 ? -2.6 * lift : -0.5) * k;
    m.armR.rotation.x = (side > 0 ? -2.6 * lift : -0.5) * k;
    m.armL.rotation.z = -0.25 * k; m.armR.rotation.z = 0.25 * k;
    m.upper.rotation.z = 0.12 * side * lift * k;
    m.head.rotation.x = 0.25 * hit(b * 2, 0.4) * k;
  },
  // stiff joints that hold, then jump to the next position. Beep.
  robot(m, b, k) {
    const s = 0.18; // how much of each count is the jump
    m.armL.rotation.x = keys([-1.57, -1.57, -0.2, -2.4, -1.57, -0.8, -1.57, -0.2], b * 2, s) * k;
    m.armR.rotation.x = keys([-0.2, -1.57, -1.57, -0.8, -2.4, -1.57, -0.2, -1.57], b * 2, s) * k;
    m.upper.rotation.y = keys([0, 0.45, 0.45, 0, -0.45, -0.45, 0, 0], b * 2, s) * k;
    m.head.rotation.y = keys([0, 0, -0.6, -0.6, 0, 0.6, 0.6, 0], b * 2, s) * k;
    m.body.position.y = keys([0, 0, 0.03, 0, 0, 0, 0.03, 0], b * 2, s) * k;
  },
  // one hand on the hard hat, the other arm straight out; tick-tick-tick across, swoosh back.
  sprinkler(m, b, k) {
    const c = b % 4; // three beats of ticks, one beat to swoosh back
    const yaw = c < 3 ? -0.8 + 1.6 * Math.floor(c * 3) / 8 + 0.05 * hit(c * 3, 0.3) : 0.8 - 1.6 * ease(c - 3);
    m.upper.rotation.y = yaw * k;
    m.armL.rotation.z = -2.7 * k; m.armL.rotation.x = -0.4 * k;
    m.armR.rotation.x = -1.5 * k; m.armR.rotation.z = 0.15 * k;
    m.legL.rotation.x = -0.25 * k; m.legR.rotation.x = 0.2 * k;
    m.body.position.y = 0.025 * hit(c * 3, 0.3) * k;
  },
  // up to the ceiling, down across the hips; the hips sway the other way.
  disco(m, b, k) {
    const up = keys([1, 0], b);
    m.armR.rotation.z = (0.3 + 2.3 * up) * k; m.armR.rotation.x = (-0.9 + 0.6 * up) * k;
    m.armL.rotation.z = -0.55 * k; m.armL.rotation.x = 0.25 * k;
    const sway = Math.sin(b * PI);
    m.body.position.x = 0.06 * sway * k;
    m.upper.rotation.z = -0.14 * sway * k;
    m.head.rotation.z = 0.12 * sway * k; m.head.rotation.x = -0.15 * up * k;
    m.legL.rotation.z = -0.1 * k;
  },
  // knee up, the other foot slides back, swap. Going nowhere at speed.
  runningman(m, b, k) {
    const s = Math.sin(b * PI);
    m.legL.rotation.x = (s > 0 ? -1.0 * s : 0.45 * -s) * k;
    m.legR.rotation.x = (s < 0 ? -1.0 * -s : 0.45 * s) * k;
    m.armL.rotation.x = 0.9 * s * k; m.armR.rotation.x = -0.9 * s * k;
    m.body.position.y = (0.06 * Math.abs(s) - 0.02) * k;
    m.upper.rotation.x = 0.12 * k;
  },
  // both arms swing side to side together, in front then behind, while the hips go the other way.
  swing(m, b, k) {
    const s = Math.sin(b * PI), front = Math.floor(b) % 2 ? 1 : -1;
    m.armL.rotation.z = m.armR.rotation.z = 0.55 * s * k;
    m.armL.rotation.x = 0.35 * front * k; m.armR.rotation.x = -0.35 * front * k;
    m.body.position.x = -0.09 * s * k;
    m.upper.rotation.z = 0.1 * s * k;
    m.legL.rotation.z = m.legR.rotation.z = 0.08 * s * k;
  },
  // down on one side and round and round, legs scissoring; every fourth bar, a freeze.
  spin(m, b, k, { reduce }) {
    const bar = b % 16;
    if (reduce) { m.upper.rotation.z = 0.25 * Math.sin(b * PI / 2) * k; m.armL.rotation.z = -1.2 * k; m.armR.rotation.z = 1.2 * k; return; }
    if (bar >= 14) { // the freeze: on one hand, legs up, looking at you
      m.body.rotation.z = 1.05; m.body.position.y = 0.25; m.armL.rotation.z = -2.9; m.legL.rotation.z = -0.5; m.legR.rotation.x = -0.6; m.head.rotation.z = -0.6;
      return;
    }
    const down = ease(clamp01(bar / 1.5));
    m.body.rotation.z = 1.25 * down;
    m.body.position.y = 0.22 * down;
    m.body.rotation.y = bar < 1.5 ? 0 : (bar - 1.5) * PI;
    m.legL.rotation.z = (-0.5 - 0.35 * Math.sin(b * PI * 2)) * down;
    m.legR.rotation.z = (0.5 + 0.35 * Math.sin(b * PI * 2)) * down;
    m.armL.rotation.z = -2.6 * down; m.armR.rotation.z = 0.9 * down;
  },
  // thumbs in the belt loops: heel, toe, step, scoot. A quarter turn every eight counts.
  bootscoot(m, b, k, { reduce }) {
    const c = b % 8, step = Math.floor(c);
    m.armL.rotation.z = 0.32 * k; m.armR.rotation.z = -0.32 * k; m.armL.rotation.x = m.armR.rotation.x = -0.15 * k;
    const heel = [-0.5, 0, 0.4, 0, -0.5, 0, 0.4, 0][step], foot = step < 4 ? 'legR' : 'legL';
    m[foot].rotation.x = heel * Math.sin((c % 1) * PI) * k;
    m.body.position.x = (step < 4 ? 0.12 : -0.12) * ease(clamp01((c % 4) / 4)) * k;
    m.body.position.y = 0.03 * hit(b, 0.4) * k;
    m.head.rotation.y = 0.15 * Math.sin(b * PI / 4) * k;
    if (!reduce) m.body.rotation.y = (Math.floor(b / 8) % 4) * (PI / 2) + (c >= 7.5 ? ease((c - 7.5) * 2) * (PI / 2) : 0);
  },
};
export const MOVE_IDS = Object.keys(MOVES);

/** Pose a rigged miner `t` seconds into dance `id`. Reduced motion: smaller, slower, no spinning or flipping over. */
export function danceStep(m, id, t, { reduce = false } = {}) {
  resetPose(m);
  const d = danceId(id); if (!d) return false;
  const b = t * (BPM / 60) * (reduce ? 0.6 : 1);
  MOVES[d](m, b, reduce ? 0.45 : 1, { reduce });
  return true;
}

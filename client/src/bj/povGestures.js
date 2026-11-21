// Map table-log actions to dealer-POV hand signals. Pure data: no WebGL, no game rules.
// The gesture plays first; the card or chip change should land about halfway through so it reads like a real table.

export const GESTURE_KINDS = ['hit', 'stand', 'double', 'split', 'surrender', 'insurance'];

const LOG_KIND = { hit: 'hit', stand: 'stand', double: 'double', split: 'split', surrender: 'surrender', ins: 'insurance' };

export const GESTURE_MS = { hit: 1100, stand: 1000, double: 1200, split: 1200, surrender: 900, insurance: 900 };

export function gestureDuration(kind) { return GESTURE_MS[kind] || 800; }
/** Milliseconds to hold the incoming card or chip change so the signal can read first. */
export function revealDelay(kind) { return Math.round(gestureDuration(kind) * 0.45); }

/**
 * Next (oldest unseen) play action in `log` with seq > seenSeq.
 * Log entries are `{ seq, ev: { k, seat } }` from the existing blackjack engine; we do not invent events.
 */
export function gestureFromLog(log = [], seenSeq = 0) {
  let best = null;
  for (const e of log) {
    const kind = LOG_KIND[e?.ev?.k];
    if (!kind) continue;
    const seq = e.seq || 0;
    if (seq <= seenSeq) continue;
    if (!best || seq < best.seq) best = { kind, seat: e.ev.seat, seq, at: e.t };
  }
  return best;
}

/** Rest pose: both hands loosely on the felt, slightly inward. Radians. */
export const REST = {
  armL: [0.7, 0.2, 0.28], elL: [-0.7], wrL: [0.1, 0, 0],
  armR: [0.7, -0.2, -0.28], elR: [-0.7], wrR: [0.1, 0, 0],
  // finger curl: 0 open, 1 fist. index, middle, ring, pinky, thumb
  curlL: [0.15, 0.18, 0.2, 0.22, 0.3],
  curlR: [0.15, 0.18, 0.2, 0.22, 0.3],
  push: 0, // left hand shoves a second stack forward, 0–1
};

const KEYS = {
  hit: [
    { t: 0, ...REST },
    { t: 0.16, armR: [0.95, 0.05, -0.15], elR: [-0.35], wrR: [-0.15, 0, 0], curlR: [0.05, 0.85, 0.9, 0.9, 0.5] },
    { t: 0.34, armR: [1.2, 0.08, -0.18], elR: [-0.15], wrR: [0.25, 0, 0], curlR: [-0.15, 0.85, 0.9, 0.9, 0.5] },
    { t: 0.5, armR: [0.95, 0.1, -0.12], elR: [-0.28], wrR: [-0.15, 0.15, 0], curlR: [0.05, 0.85, 0.9, 0.9, 0.5] },
    { t: 0.66, armR: [1.2, 0.12, -0.18], elR: [-0.12], wrR: [0.28, 0.2, 0], curlR: [-0.15, 0.85, 0.9, 0.9, 0.5] },
    { t: 1, ...REST },
  ],
  stand: [
    { t: 0, ...REST },
    { t: 0.2, armR: [0.15, 0.15, 0.15], elR: [-0.2], wrR: [1.0, 0, 0], curlR: [0.05, 0.05, 0.05, 0.05, 0.2] },
    { t: 0.4, armR: [0.1, 0.75, 0.15], elR: [-0.1], wrR: [1.05, 0.35, 0], curlR: [0, 0, 0, 0, 0.2] },
    { t: 0.62, armR: [0.1, -0.55, 0.15], elR: [-0.1], wrR: [1.05, -0.3, 0], curlR: [0, 0, 0, 0, 0.2] },
    { t: 1, ...REST },
  ],
  double: [
    { t: 0, ...REST },
    { t: 0.22, armL: [0.4, 0.25, 0.4], elL: [-0.35], push: 0.4, armR: [0.3, -0.15, -0.2], elR: [-0.45], curlR: [0.05, 0.9, 0.9, 0.9, 0.45] },
    { t: 0.5, armL: [0.25, 0.3, 0.45], elL: [-0.15], push: 1, armR: [-0.85, -0.2, 0.1], elR: [-0.12], wrR: [0.15, 0, 0], curlR: [-0.1, 0.95, 0.95, 0.95, 0.5] },
    { t: 0.78, armL: [0.3, 0.25, 0.35], elL: [-0.25], push: 1, armR: [-0.85, -0.2, 0.1], elR: [-0.12], curlR: [-0.1, 0.95, 0.95, 0.95, 0.5] },
    { t: 1, ...REST },
  ],
  split: [
    { t: 0, ...REST },
    { t: 0.22, armL: [0.4, 0.25, 0.4], elL: [-0.35], push: 0.4, armR: [0.2, -0.1, -0.15], elR: [-0.25], wrR: [0.5, 0, 0], curlR: [0.05, 0.05, 0.9, 0.9, 0.4] },
    { t: 0.5, armL: [0.25, 0.3, 0.45], elL: [-0.15], push: 1, armR: [-0.55, -0.15, 0.08], elR: [-0.08], wrR: [0.65, 0, 0], curlR: [-0.05, -0.05, 0.95, 0.95, 0.45] },
    { t: 0.78, armL: [0.3, 0.25, 0.35], elL: [-0.25], push: 1, armR: [-0.55, -0.15, 0.08], elR: [-0.08], curlR: [-0.05, -0.05, 0.95, 0.95, 0.45] },
    { t: 1, ...REST },
  ],
  surrender: [
    { t: 0, ...REST },
    { t: 0.25, armR: [-0.4, 0.3, 0.2], elR: [-0.2], wrR: [0.3, 0.4, 0], curlR: [0.1, 0.1, 0.1, 0.1, 0.3] },
    { t: 0.55, armR: [-0.2, -0.35, -0.15], elR: [-0.35], wrR: [0.2, -0.3, 0], curlR: [0.15, 0.15, 0.15, 0.15, 0.3] },
    { t: 1, ...REST },
  ],
  insurance: [
    { t: 0, ...REST },
    { t: 0.3, armR: [0.2, 0.35, 0.15], elR: [-0.55], wrR: [0, 0, 0.4], curlR: [0.2, 0.2, 0.2, 0.2, 0.35], push: 0.3 },
    { t: 0.65, armR: [0.15, 0.4, 0.2], elR: [-0.4], wrR: [0, 0, 0.4], curlR: [0.2, 0.2, 0.2, 0.2, 0.35], push: 0.6 },
    { t: 1, ...REST },
  ],
};

function lerpNum(a, b, t) { return a + (b - a) * t; }
function lerpArr(a = [], b = [], t) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = lerpNum(a[i] ?? 0, b[i] ?? 0, t);
  return out;
}
function mix(a, b, t) {
  return {
    armL: lerpArr(a.armL || REST.armL, b.armL || REST.armL, t),
    elL: lerpArr(a.elL || REST.elL, b.elL || REST.elL, t),
    wrL: lerpArr(a.wrL || REST.wrL, b.wrL || REST.wrL, t),
    armR: lerpArr(a.armR || REST.armR, b.armR || REST.armR, t),
    elR: lerpArr(a.elR || REST.elR, b.elR || REST.elR, t),
    wrR: lerpArr(a.wrR || REST.wrR, b.wrR || REST.wrR, t),
    curlL: lerpArr(a.curlL || REST.curlL, b.curlL || REST.curlL, t),
    curlR: lerpArr(a.curlR || REST.curlR, b.curlR || REST.curlR, t),
    push: lerpNum(a.push || 0, b.push || 0, t),
  };
}

/** Sample a gesture pose at u in [0, 1]. Unknown kinds return the rest pose. */
export function samplePose(kind, u) {
  const keys = KEYS[kind];
  if (!keys) return { ...REST, armL: REST.armL.slice(), armR: REST.armR.slice(), curlL: REST.curlL.slice(), curlR: REST.curlR.slice() };
  const t = Math.max(0, Math.min(1, u));
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  const local = span <= 0 ? 1 : (t - a.t) / span;
  const smooth = local * local * (3 - 2 * local);
  return mix(a, b, smooth);
}

/** True when a hit pose has the pointing finger extended and the arm reaching the felt. */
export function isHitTap(pose) {
  return pose.curlR[0] < 0.1 && pose.curlR[1] > 0.6 && pose.armR[0] > 0.7;
}
export function isStandWave(pose) {
  return pose.wrR[0] > 0.5 && pose.curlR[0] < 0.2 && pose.curlR[1] < 0.2;
}
export function isDoubleFinger(pose) {
  return pose.curlR[0] < 0.15 && pose.curlR[1] > 0.7 && pose.armR[0] < -0.4 && pose.push > 0.5;
}
export function isSplitV(pose) {
  return pose.curlR[0] < 0.15 && pose.curlR[1] < 0.15 && pose.curlR[2] > 0.7 && pose.push > 0.5;
}

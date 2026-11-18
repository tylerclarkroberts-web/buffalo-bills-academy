// Touch layout, look feel and multi-touch routing for EL HALO.
// The #1 rule: each finger keeps the role it started with (stick, look, or FIRE)
// until it lifts, so you can move with the left thumb and aim/fire with the right
// at the same time. Roles are assigned by pointerId, not by which element is on top.

export const STORAGE_KEY = 'bba.elhalo.controls';
export const STICK_RADIUS = 46;
export const STICK_DEAD = 0.12;
export const LOOK_BASE = 0.0042 * 1.7; // old pad feel (sens 0.0042 × the 1.7 drag scale)

export const DEFAULT_SETTINGS = Object.freeze({
  hipSens: 1,
  adsSens: 1,
  accel: 0.35,
  assist: 0.35,
  autoFire: false,
  invert: false,
});

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (v, d) => { const n = +v; return Number.isFinite(n) ? n : d; };

export function cleanSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    hipSens: clamp(num(s.hipSens, DEFAULT_SETTINGS.hipSens), 0.4, 2.4),
    adsSens: clamp(num(s.adsSens, DEFAULT_SETTINGS.adsSens), 0.4, 2.4),
    accel: clamp(num(s.accel, DEFAULT_SETTINGS.accel), 0, 1),
    assist: clamp(num(s.assist, DEFAULT_SETTINGS.assist), 0, 1),
    autoFire: !!s.autoFire,
    invert: !!s.invert,
  };
}

export function loadSettings(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY);
    return cleanSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage) {
  const clean = cleanSettings(settings);
  try { (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch { /* private mode */ }
  return clean;
}

export function isNearSquare(w, h) {
  const a = Math.min(w, h) / Math.max(w, 1, h);
  return a >= 0.75;
}

// Tall, phone-like portrait (390×844, a folded 360×660). A near-square unfolded
// Duo (about 1000×900 or 900×1000) is not tall-narrow.
export function isTallNarrow(w, h) {
  return h > w && !isNearSquare(w, h);
}

export function needsRotatePrompt(w, h) {
  return isTallNarrow(w, h);
}

export function isLargeScreen(w, h) {
  return Math.min(w, h) >= 700 || w * h >= 700 * 800;
}

// Thumb pockets stay in reach on a big or unfolded screen instead of sitting
// in the far corners of a ~1000px panel. On a phone they fill the lower sides.
export function thumbPockets(w, h, safe = {}) {
  const large = isLargeScreen(w, h);
  const padL = Math.max(10, (safe.l || 0) + (large ? 22 : 10));
  const padR = Math.max(10, (safe.r || 0) + (large ? 22 : 10));
  const padB = Math.max(10, (safe.b || 0) + (large ? 20 : 10));
  const stickW = large ? Math.min(360, w * 0.38) : Math.min(Math.max(200, w * 0.46), w * 0.5);
  const stickH = large ? Math.min(260, h * 0.4) : Math.min(h * 0.55, Math.max(200, h * 0.42));
  const actsW = large ? 230 : Math.min(230, Math.max(196, w * 0.5));
  return {
    stick: { left: padL, bottom: padB, width: stickW, height: stickH },
    acts: { right: padR, bottom: padB, width: actsW },
    lookRight: w * 0.5,
    width: w,
    height: h,
    large,
  };
}

export function graphicsTier({ w, h, coarse, dpr, cores, reduceMotion } = {}) {
  if (reduceMotion) return 'low';
  const big = isLargeScreen(w || 0, h || 0);
  const strong = (cores || 1) >= 6 && (dpr || 1) >= 2;
  if (big || (strong && !coarse)) return 'high';
  if (coarse && !big) return 'low';
  return 'med';
}

export function graphicsOpts(tier) {
  return {
    low: { antialias: false, dpr: 1.25, particles: 600, far: 320, phoneDogs: true },
    med: { antialias: false, dpr: 1.5, particles: 800, far: 400, phoneDogs: false },
    high: { antialias: true, dpr: 1.75, particles: 1100, far: 460, phoneDogs: false },
  }[tier] || graphicsOpts('med');
}

export function stickValue(dx, dy, { radius = STICK_RADIUS, dead = STICK_DEAD } = {}) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0, knobX: 0, knobY: 0 };
  const span = Math.min(d, radius);
  const knobX = (dx / d) * span, knobY = (dy / d) * span;
  const raw = span / radius;
  if (raw <= dead) return { x: 0, y: 0, knobX, knobY };
  const scaled = (raw - dead) / (1 - dead);
  return { x: (dx / d) * scaled, y: (dy / d) * scaled, knobX, knobY };
}

// Returns yaw/pitch deltas (radians) for a pixel drag. Slow moves stay precise;
// quicker flicks pick up mild acceleration. Aim assist slows the look when the
// crosshair is already on a foe.
export function lookDelta(dx, dy, { settings, zoom = false, aiming = false } = {}) {
  const s = cleanSettings(settings);
  const mx = dx;
  const my = s.invert ? -dy : dy;
  const mag = Math.hypot(mx, my);
  const accel = 1 + s.accel * clamp((mag - 2) / 40, 0, 1);
  const sens = LOOK_BASE * (zoom ? s.adsSens : s.hipSens);
  const assist = aiming ? (1 - 0.5 * s.assist) : 1;
  const k = sens * accel * assist;
  return { yaw: -mx * k, pitch: -my * k };
}

function inRect(x, y, r) {
  if (!r) return false;
  const left = r.left ?? r.x ?? 0, top = r.top ?? r.y ?? 0;
  return x >= left && y >= top && x <= left + r.width && y <= top + r.height;
}

// Decide the role for a new finger. Existing roles are never stolen.
export function hitRole(x, y, layout, buttons = []) {
  for (const b of buttons) {
    if (inRect(x, y, b)) return { role: b.role, id: b.id };
  }
  if (layout?.stick && inRect(x, y, layout.stick)) return { role: 'stick' };
  if (layout && x >= (layout.lookRight ?? (layout.width || 0) * 0.5)) return { role: 'look' };
  return { role: 'ignore' };
}

export function createPointerMap() {
  const byId = new Map();
  let stickId = null;
  const api = {
    down(pointerId, x, y, layout, buttons, forced) {
      if (byId.has(pointerId)) return byId.get(pointerId);
      const hit = forced || hitRole(x, y, layout, buttons);
      let role = hit.role;
      if (role === 'ignore') return null;
      if (role === 'stick' && stickId != null && stickId !== pointerId) return null;
      const rec = { role, id: hit.id, sx: x, sy: y, lastX: x, lastY: y };
      byId.set(pointerId, rec);
      if (role === 'stick') stickId = pointerId;
      return rec;
    },
    move(pointerId, x, y) {
      const rec = byId.get(pointerId);
      if (!rec) return null;
      const dx = x - rec.lastX, dy = y - rec.lastY;
      rec.lastX = x; rec.lastY = y;
      return { rec, dx, dy };
    },
    up(pointerId) {
      const rec = byId.get(pointerId);
      byId.delete(pointerId);
      if (rec?.role === 'stick' && stickId === pointerId) stickId = null;
      return rec || null;
    },
    get: (pointerId) => byId.get(pointerId) || null,
    has: (pointerId) => byId.has(pointerId),
    get stickId() { return stickId; },
    size: () => byId.size,
    // Fold / rotate / resize must not drop fingers or retarget them.
    keep() { return api; },
    clear() { byId.clear(); stickId = null; },
  };
  return api;
}

export function isCoarse(win = globalThis) {
  return !!win.matchMedia?.('(pointer: coarse)')?.matches;
}

export function watchCoarse(onChange, win = globalThis) {
  const mq = win.matchMedia?.('(pointer: coarse)');
  if (!mq) return () => {};
  const fn = () => onChange(!!mq.matches);
  if (mq.addEventListener) mq.addEventListener('change', fn);
  else mq.addListener?.(fn);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener('change', fn);
    else mq.removeListener?.(fn);
  };
}

export function applyPadLayout(el, layout) {
  if (!el || !layout) return;
  const s = layout.stick, a = layout.acts;
  el.style.setProperty('--stick-left', `${s.left}px`);
  el.style.setProperty('--stick-bottom', `${s.bottom}px`);
  el.style.setProperty('--stick-w', `${s.width}px`);
  el.style.setProperty('--stick-h', `${s.height}px`);
  el.style.setProperty('--acts-right', `${a.right}px`);
  el.style.setProperty('--acts-bottom', `${a.bottom}px`);
  el.style.setProperty('--acts-w', `${a.width}px`);
  el.dataset.large = layout.large ? '1' : '0';
}

function roleOf(what) {
  if (what === 'fire') return 'fire';
  if (what === 'act') return 'act';
  if (what === 'ads') return 'ads';
  return what ? 'button' : 'ignore';
}

// Bind one set of pointer listeners to the pad root (capture) so buttons,
// the look half and the stick all share the same pointerId map.
export function bindPad(pad, hooks) {
  if (!pad) return () => {};
  const pointers = hooks.pointers || createPointerMap();
  const point = (e) => {
    const r = pad.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, absX: e.clientX, absY: e.clientY };
  };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    hooks.onGesture?.(e);
    const p = point(e);
    const btnEl = e.target?.closest?.('[data-pad-btn]');
    const forced = btnEl ? { role: roleOf(btnEl.dataset.padBtn), id: btnEl.dataset.padBtn } : null;
    const rec = pointers.down(p.id, p.x, p.y, hooks.layout(), hooks.buttons?.() || [], forced);
    if (!rec) return;
    try { pad.setPointerCapture?.(p.id); } catch { /* already gone */ }
    e.preventDefault();
    if (rec.role === 'stick') hooks.onStickStart?.(p.absX, p.absY, rec);
    if (rec.role === 'fire') hooks.onFire?.(true, rec);
    if (rec.role === 'ads') hooks.onAds?.(true, rec);
    if (rec.role === 'act') hooks.onAct?.(true, rec);
    if (rec.role === 'button' && rec.id) hooks.onButton?.(rec.id, rec);
  };
  const move = (e) => {
    const p = point(e);
    const ev = pointers.move(p.id, p.x, p.y);
    if (!ev) return;
    e.preventDefault();
    if (ev.rec.role === 'stick') hooks.onStickMove?.(ev.rec, ev.dx, ev.dy, p.absX, p.absY);
    if (ev.rec.role === 'look' || ev.rec.role === 'fire') hooks.onLook?.(ev.dx, ev.dy, ev.rec);
  };
  const up = (e) => {
    const rec = pointers.up(e.pointerId);
    if (!rec) return;
    if (rec.role === 'stick') hooks.onStickEnd?.(rec);
    if (rec.role === 'fire') hooks.onFire?.(false, rec);
    if (rec.role === 'ads') hooks.onAds?.(false, rec);
    if (rec.role === 'act') hooks.onAct?.(false, rec);
  };
  const opts = { capture: true, passive: false };
  pad.addEventListener('pointerdown', down, opts);
  pad.addEventListener('pointermove', move, opts);
  pad.addEventListener('pointerup', up, opts);
  pad.addEventListener('pointercancel', up, opts);
  pad.addEventListener('lostpointercapture', up, opts);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  return () => {
    pad.removeEventListener('pointerdown', down, opts);
    pad.removeEventListener('pointermove', move, opts);
    pad.removeEventListener('pointerup', up, opts);
    pad.removeEventListener('pointercancel', up, opts);
    pad.removeEventListener('lostpointercapture', up, opts);
    pointers.clear();
  };
}

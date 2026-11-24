// Viewer-only Family / Work mode flags. localStorage is the source of truth;
// a SameSite cookie mirrors them so a later visit still sees the choice.

export const FAMILY_KEY = 'bba.familyMode';
export const WORK_KEY = 'bba.workMode';
export const FAMILY_COOKIE = 'bba_family';
export const WORK_COOKIE = 'bba_work';

const hasWindow = () => typeof window !== 'undefined';
const hasDoc = () => typeof document !== 'undefined';

function readStorage(key) {
  if (!hasWindow()) return false;
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeStorage(key, on) {
  if (!hasWindow()) return;
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch { /* private mode */ }
}

function writeCookie(name, on) {
  if (!hasDoc()) return;
  const max = on ? 31536000 : 0;
  document.cookie = `${name}=${on ? '1' : '0'}; path=/; max-age=${max}; SameSite=Lax`;
}

function withSafe(s) {
  return { family: !!s.family, work: !!s.work, safe: !!(s.family || s.work) };
}

function applyDom(s) {
  if (!hasDoc()) return;
  const root = document.documentElement;
  const kosher = !!(s.family || s.work);
  root.classList.toggle('family-mode', !!s.family);
  root.classList.toggle('work-mode', !!s.work);
  root.classList.toggle('kosher-mode', kosher);
  root.dataset.family = s.family ? '1' : '0';
  root.dataset.work = s.work ? '1' : '0';
  root.dataset.safe = kosher ? '1' : '0';
}

let state = { family: false, work: false };
const subs = new Set();
let loaded = false;

export function loadModes() {
  state = { family: readStorage(FAMILY_KEY), work: readStorage(WORK_KEY) };
  applyDom(state);
  loaded = true;
  return withSafe(state);
}

export function getModes() {
  if (!loaded && hasWindow()) loadModes();
  return withSafe(state);
}

export function subscribeModes(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function persist() {
  writeStorage(FAMILY_KEY, state.family);
  writeStorage(WORK_KEY, state.work);
  writeCookie(FAMILY_COOKIE, state.family);
  writeCookie(WORK_COOKIE, state.work);
  applyDom(state);
}

function emit() {
  persist();
  const snap = withSafe(state);
  subs.forEach((fn) => { try { fn(snap); } catch { /* listener */ } });
}

export function setFamily(on) {
  if (!loaded && hasWindow()) loadModes();
  const next = !!on;
  if (state.family === next) return;
  state = { ...state, family: next };
  emit();
}

export function setWork(on) {
  if (!loaded && hasWindow()) loadModes();
  const next = !!on;
  if (state.work === next) return;
  state = { ...state, work: next };
  emit();
}

export function setModes({ family, work } = {}) {
  if (!loaded && hasWindow()) loadModes();
  const next = {
    family: family == null ? state.family : !!family,
    work: work == null ? state.work : !!work,
  };
  if (next.family === state.family && next.work === state.work) return;
  state = next;
  emit();
}


/** True when the event target is a field the user is typing into. */
export function isTypingTarget(el) {
  let node = el && el.nodeType === 3 ? el.parentElement : el;
  if (!node) return false;
  const tag = String(node.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (node.isContentEditable) return true;
  const ce = typeof node.getAttribute === 'function' ? node.getAttribute('contenteditable') : null;
  if (ce === '' || (ce && ce.toLowerCase() !== 'false')) return true;
  if (typeof node.closest === 'function') {
    if (node.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return true;
  }
  return false;
}

/** Screens where W walks forward: the mine (and the games behind its doors), EL HALO and the golf game. */
const W_WALKS = ['/mines', '/elhalo', '/foff'];

/** Pathname only, so a query or hash cannot sneak the boss key back onto a walk screen. */
export function workHotkeyPath(path = globalThis.location?.pathname || '') {
  return String(path || '').split('?')[0].split('#')[0];
}

/**
 * True on every El Halo screen: the /elhalo route, any /elhalo/... path, and the
 * mounted room itself (the Hall of Doors still lives under /mines, but also if
 * the pathname is stale or missing).
 */
export function isElHaloScreen(path = globalThis.location?.pathname || '', doc = globalThis.document) {
  const p = workHotkeyPath(path);
  if (p === '/elhalo' || p.startsWith('/elhalo/')) return true;
  if (doc && typeof doc.querySelector === 'function') {
    if (doc.querySelector('[data-test=elhalo-page], [data-test=elhalo-room], [data-test=elhalo-loading]')) return true;
  }
  return false;
}

/** Mounted Acid Mines screens, including overlays where W is not a walk key (battles, prompts, the map). */
const MINE_MOUNTED = [
  '[data-test=mine-today]', '[data-test=mine-pad]', '[data-test=mine-map]', '[data-test=mine-tilt]',
  '[data-test=mine-preview]', '[data-test=sick]', '[data-test=wild-prompt]', '[data-test=door-hall]',
  '[data-test=doom-room]', '[data-test=nano-room]', '[data-test=stick-intro]', '[data-test=ambush-prompt]',
  '[data-test=egg-prompt]', '[data-test=lift-prompt]', '[data-test=door-prompt]', '[data-test=dance-picker]',
  '[data-test=bug-orders]', '[data-test=heeshee-stolen]', '[data-test=fm-q]', '[data-test=fm-typing]',
  '.m-play', '.m-intro', '.m-result', '.fm',
].join(', ');

/**
 * True on every Acid Mines screen: the /mines route, any /mines/... path, the
 * admin mine preview, and whenever a mine screen is mounted (tunnels, orientation,
 * shift report, a bug fight, the Hall of Doors, and other overlays), even if the
 * pathname is stale. Bug Center is a Barn page (/barn/center) and is not included.
 */
export function isMinesScreen(path = globalThis.location?.pathname || '', doc = globalThis.document) {
  const p = workHotkeyPath(path);
  if (p === '/mines' || p.startsWith('/mines/')) return true;
  if (p === '/admin/mine-preview' || p.startsWith('/admin/mine-preview/')) return true;
  if (doc?.body?.classList?.contains?.('in-mines')) return true;
  if (doc && typeof doc.querySelector === 'function') {
    if (doc.querySelector(MINE_MOUNTED)) return true;
  }
  return false;
}

function isWalkScreen(path = globalThis.location?.pathname || '', doc = globalThis.document) {
  if (isElHaloScreen(path, doc) || isMinesScreen(path, doc)) return true;
  const p = workHotkeyPath(path);
  return W_WALKS.some((game) => p === game || p.startsWith(`${game}/`));
}

/**
 * Boss key: bare "W" turns Work Mode on. Ignored in fields, with modifiers, on a screen where W walks,
 * or when Work Mode is already on (W never turns it off).
 * Returns true if the event was handled (Work Mode was switched on).
 */
export function handleWorkHotkey(e, path = globalThis.location?.pathname || '', doc = globalThis.document) {
  if (!e || e.defaultPrevented) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== 'w' && e.key !== 'W') return false;
  if (isTypingTarget(e.target)) return false;
  if (isWalkScreen(path, doc)) return false;
  if (getModes().work) return false;
  if (typeof e.preventDefault === 'function') e.preventDefault();
  setWork(true);
  return true;
}

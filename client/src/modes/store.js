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

/**
 * Boss key: bare "W" turns Work Mode on. Ignored in fields, with modifiers,
 * or when Work Mode is already on (W never turns it off).
 * Returns true if the event was handled (Work Mode was switched on).
 */
export function handleWorkHotkey(e) {
  if (!e || e.defaultPrevented) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== 'w' && e.key !== 'W') return false;
  if (isTypingTarget(e.target)) return false;
  if (getModes().work) return false;
  if (typeof e.preventDefault === 'function') e.preventDefault();
  setWork(true);
  return true;
}

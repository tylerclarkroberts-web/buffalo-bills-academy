import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { entryTarget, nextTarget, restCount, shouldOfferAdvance } from './queue.js';

let state = { turns: [] };
const subs = new Set();
const emit = () => subs.forEach((f) => f(state));
let inFlight = false;

export async function refreshTurns() {
  if (inFlight) return state;
  inFlight = true;
  try {
    const r = await api('GET', '/turns');
    state = { turns: r.turns || [] };
    emit();
  } catch { /* keep the last good list */ }
  finally { inFlight = false; }
  return state;
}

export function useTurns() {
  const { me } = useSession();
  const [s, set] = useState(state);
  useEffect(() => {
    subs.add(set);
    return () => subs.delete(set);
  }, []);
  useEffect(() => {
    if (!me?.id) { state = { turns: [] }; emit(); return undefined; }
    refreshTurns();
    const tick = () => { if (!document.hidden) refreshTurns(); };
    const id = setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('bba:turns-refresh', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('bba:turns-refresh', tick);
    };
  }, [me?.id]);
  return { turns: s.turns, count: s.turns.length, refresh: refreshTurns };
}

export function jumpToTurns(turns, currentPath = window.location.pathname) {
  const t = entryTarget(turns, currentPath);
  if (t) navigate(t.path);
  return t;
}

/** After you finish a turn, expose the next table you're up in. Navigation happens only in goNow (a click). */
export function useTurnAdvance({ currentPath, hasAction, blocked = false, enabled = true }) {
  const { turns, refresh } = useTurns();
  const armed = useRef(false);

  useEffect(() => {
    armed.current = false;
  }, [currentPath]);

  useEffect(() => {
    if (hasAction) armed.current = true;
  }, [hasAction]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, hasAction, currentPath, refresh]);

  const next = nextTarget(turns, currentPath);
  const left = restCount(turns, currentPath);
  const ready = enabled && shouldOfferAdvance({
    hadAction: armed.current, hasAction, blocked,
  });
  const show = !!(ready && next);

  const goNow = useCallback(() => { if (next) navigate(next.path); }, [next]);

  return { phase: show ? 'next' : 'idle', next, restCount: left, count: turns.length, goNow, refresh };
}

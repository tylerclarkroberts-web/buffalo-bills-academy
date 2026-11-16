import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { ADVANCE_MS, CAUGHT_MS, entryTarget, nextTarget, restCount, shouldOfferAdvance } from './queue.js';

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

export function useTurnAdvance({ currentPath, hasAction, blocked = false, enabled = true }) {
  const { turns, refresh } = useTurns();
  const [phase, setPhase] = useState('idle'); // idle | next | caught
  const [remain, setRemain] = useState(ADVANCE_MS);
  const armed = useRef(false);
  const dismissed = useRef(false);

  useEffect(() => {
    armed.current = false;
    dismissed.current = false;
    setPhase('idle');
  }, [currentPath]);

  useEffect(() => {
    if (hasAction) { armed.current = true; dismissed.current = false; }
  }, [hasAction]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, hasAction, currentPath, refresh]);

  const next = nextTarget(turns, currentPath);
  const left = restCount(turns, currentPath);
  const ready = enabled && shouldOfferAdvance({
    hadAction: armed.current, hasAction, blocked, dismissed: dismissed.current,
  });

  useEffect(() => {
    if (!ready) {
      if (phase === 'next') setPhase('idle');
      return undefined;
    }
    if (!next) {
      setPhase('caught');
      const t = setTimeout(() => setPhase('idle'), CAUGHT_MS);
      return () => clearTimeout(t);
    }
    setPhase('next');
    setRemain(ADVANCE_MS);
    const start = Date.now();
    const id = setInterval(() => setRemain(Math.max(0, ADVANCE_MS - (Date.now() - start))), 50);
    const go = setTimeout(() => navigate(next.path), ADVANCE_MS);
    return () => { clearInterval(id); clearTimeout(go); };
    // Restart only when the destination (or readiness) changes, not on every poll tick.
  }, [ready, next?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const stay = useCallback(() => {
    dismissed.current = true;
    setPhase('idle');
  }, []);
  const goNow = useCallback(() => { if (next) navigate(next.path); }, [next]);

  return { phase, next, remain, restCount: left, count: turns.length, stay, goNow, refresh };
}

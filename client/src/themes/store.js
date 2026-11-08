// The active look for the whole app. Only the multi-table view changes it (everything else is the saloon),
// and it goes back to the saloon when that view closes. Also remembers "plain mode" (themes off) per device.
import { useEffect, useState } from 'react';

const PLAIN = 'bba.plainThemes';
let active = 'saloon';
const subs = new Set();

export const activeTheme = () => active;
export function setActiveTheme(name) {
  if (name === active) return;
  active = name;
  if (typeof document !== 'undefined') {
    if (name === 'saloon') delete document.body.dataset.theme; else document.body.dataset.theme = name;
  }
  subs.forEach((f) => f(active));
}
export function subscribeTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
export function useActiveTheme() {
  const [t, setT] = useState(active);
  useEffect(() => { setT(active); return subscribeTheme(setT); }, []);
  return t;
}
export function plainMode() { try { return localStorage.getItem(PLAIN) === '1'; } catch { return false; } }
export function setPlainMode(on) { try { if (on) localStorage.setItem(PLAIN, '1'); else localStorage.removeItem(PLAIN); } catch { /* private mode */ } }
export const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** ?tea=now on the page URL (read once at load, before the multi view tidies the URL): serve tea right away. */
export const TEA_NOW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tea') === 'now';

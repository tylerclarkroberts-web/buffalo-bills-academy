// API client. Signed-in players use an httpOnly session cookie (sent automatically).
// Players from before sign-in existed still have a browser token, which keeps working and is
// attached to the Google account the first time they sign in.
import { useEffect, useState } from 'react';

const KEY = 'asyncPoker.player';
export function getLegacy() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
export function saveLegacy(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
export function forgetLegacy() { localStorage.removeItem(KEY); }

export async function api(method, url, body) {
  const legacy = getLegacy();
  const res = await fetch(`/api${url}`, {
    method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(legacy?.token ? { authorization: `Bearer ${legacy.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status; if (data?.code) err.code = data.code;
    throw err;
  }
  return data;
}

// ---- tiny global session store ----
let state = { loading: true, me: null, config: { google: false, dev: false, guest: true } };
const subs = new Set();
const emit = () => subs.forEach((f) => f(state));
/** The live session (not a render-time copy). */
export const currentSession = () => state;
export async function refreshSession() {
  const [config, me] = await Promise.all([
    api('GET', '/auth/config').catch(() => state.config),
    api('GET', '/me').catch(() => null),
  ]);
  state = { loading: false, me, config };
  emit();
  // First Google sign-in on a browser that played before: bring the old player along.
  const legacy = getLegacy();
  if (me?.signedIn && legacy?.token && legacy.id !== me.id) {
    try { const r = await api('POST', '/auth/claim-legacy', { token: legacy.token }); forgetLegacy(); state = { ...state, me: r.me }; emit(); } catch { forgetLegacy(); }
  } else if (me?.signedIn && legacy?.token) forgetLegacy();
  return state;
}
export function useSession() {
  const [s, set] = useState(state);
  useEffect(() => { subs.add(set); if (state.loading) refreshSession(); return () => subs.delete(set); }, []);
  return s;
}
export function signInUrl(ret = window.location.pathname) { return `/auth/google?return=${encodeURIComponent(ret)}`; }
export async function signOut() { await fetch('/auth/logout', { method: 'POST' }); forgetLegacy(); await refreshSession(); }
export async function devSignIn(name, email) {
  const r = await fetch('/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  if (!r.ok) throw new Error('Dev sign-in is off');
  await refreshSession();
}
async function authPost(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  await refreshSession();
  return j;
}
export const passwordSignIn = (username, password) => authPost('/auth/login', { username, password });
export const register = (form) => authPost('/auth/register', form);
export async function changePassword(current, next) {
  const r = await fetch('/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
}
export const linkGoogleUrl = () => '/auth/google?link=1';
/** Guest player (only when Google sign-in is not set up yet). */
export async function guestSignIn(name) {
  const p = await api('POST', '/players', { name });
  saveLegacy(p);
  await refreshSession();
  return p;
}
export async function rename(name) { await api('PATCH', '/me', { name }); await refreshSession(); }
export async function changeUsername(username) { await api('PATCH', '/me', { username }); await refreshSession(); }

import React, { Suspense, lazy, useEffect, useState } from 'react';
import Home from './Home.jsx';
import TablePage from './TablePage.jsx';
import { Profile, Leaderboard } from './People.jsx';
import Invest from './Invest.jsx';
import { Shell } from './Shell.jsx';
import { useSession, currentSession } from './api.js';
import { faceRedirect, safeNext } from './faceGate.js';

const Mines = lazy(() => import('./mines/Mines.jsx'));
const AvatarMaker = lazy(() => import('./avatar/AvatarMaker.jsx'));
const Multi = lazy(() => import('./Multi.jsx'));
const Barn = lazy(() => import('./barn/Barn.jsx'));
const Store = lazy(() => import('./store/Store.jsx'));
const Slots = lazy(() => import('./slots/SlotsPage.jsx'));
const Blackjack = lazy(() => import('./bj/BlackjackPage.jsx'));
const Conquest = lazy(() => import('./Conquest.jsx'));

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
/** The mines live in a different world: a short wipe, then the page swaps. */
export function goToMines() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate('/mines');
  const el = document.createElement('div');
  el.className = 'mine-wipe';
  el.innerHTML = '<span>DESCENDING&nbsp;&nbsp;▼&nbsp;&nbsp;LEVEL&nbsp;-1</span>';
  document.body.appendChild(el);
  setTimeout(() => { navigate('/mines'); setTimeout(() => el.remove(), 400); }, 1050);
}
const LAST = 'bba.lastTable';
export const lastTable = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
export const rememberTable = (code) => { try { localStorage.setItem(LAST, code); } catch { /* private mode */ } };

export default function App() {
  const [loc, setLoc] = useState(window.location.pathname + window.location.search);
  const { me } = useSession();
  useEffect(() => {
    const on = () => setLoc(window.location.pathname + window.location.search);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const path = loc.split('?')[0];
  const query = new URLSearchParams(loc.split('?')[1] || '');
  // "Add your face" is part of signing in: anyone signed in without an avatar goes there first.
  useEffect(() => {
    // Read the live session, not this render's copy: a route change can render before a session update.
    const to = faceRedirect({ me: currentSession().me, path, loc });
    if (to) navigate(to, { replace: true });
  }, [me?.id, me?.hasAvatar, path]);
  if (path.startsWith('/mines')) return <Suspense fallback={<div style={{ background: '#020402', minHeight: '100vh' }} />}><Mines /></Suspense>;
  const t = path.match(/^\/t\/([A-Za-z0-9]{4,8})/);
  const p = path.match(/^\/players\/([\w-]+)/);
  let page;
  if (path.startsWith('/welcome') || path.startsWith('/profile/face')) {
    const next = safeNext(query.get('next') || (path.startsWith('/profile') ? '/profile' : '/'));
    page = <Suspense fallback={<div className="screen" />}><AvatarMaker next={next} retake={path.startsWith('/profile')} /></Suspense>;
  } else if (t) page = <TablePage code={t[1].toUpperCase()} />;
  else if (path.startsWith('/multi')) page = <Suspense fallback={<div className="screen" />}><Multi wanted={(query.get('t') || '').split(',').filter(Boolean)} /></Suspense>;
  else if (path.startsWith('/conquest')) page = <Suspense fallback={<div className="screen muted">Loading Risk bets…</div>}><Conquest /></Suspense>;
  else if (path.startsWith('/profile')) page = <Profile key={`${me?.id || 'signed-out'}.self`} />;
  else if (p) page = <Profile key={`${me?.id || 'signed-out'}.${p[1]}`} id={p[1]} />;
  else if (path.startsWith('/leaderboard')) page = <Leaderboard />;
  else if (path.startsWith('/invest')) page = <Invest />;
  else if (path.startsWith('/store')) page = <Suspense fallback={<div className="screen" />}><Store /></Suspense>;
  else if (path === '/bj' || path.startsWith('/bj/')) page = <Suspense fallback={<div className="screen" />}><Blackjack code={(path.split('/')[2] || '').toUpperCase() || null} /></Suspense>;
  else if (path.startsWith('/slots')) page = <Suspense fallback={<div className="screen" />}><Slots /></Suspense>;
  else if (path.startsWith('/barn')) page = <Suspense fallback={<div className="screen" />}><Barn /></Suspense>;
  else page = <Home key={me?.id || 'signed-out'} tab={query.get('tab') || undefined} />; // '/' and old '/lobby' links: the card room lobby
  return <Shell path={path}>{page}</Shell>;
}

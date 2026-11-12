// v52: spectacles. A seated player puts on a one-time-use show from the General Store and the whole table watches it
// for a few seconds: balloons, fireworks, a blimp towing their name, a buffalo stampede, the saucer from the mines,
// a gold rush. It plays as a beat of the table replay (so a late arrival still sees it once) with a full-screen
// overlay on top. Cartoon only: it never touches cards, chips, turns or timers, and it ignores clicks.
// Follows the gag switches: the host's per-table switch and each viewer's "Allow gags" setting.
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';

export const SHOW_STEP_MS = 5600, SHOW_STILL_MS = 2600;
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
/** Same layout every render (and on every screen) for a given show: cheap seeded jitter, no Math.random. */
const jit = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

function Particles({ n, render }) { return useMemo(() => Array.from({ length: n }, (_, i) => render(i)), [n]); }

function Balloons() {
  const hues = ['#e8433a', '#f2b63a', '#3aa0e8', '#5ac850', '#c050d8', '#ff7ab0'];
  return <Particles n={36} render={(i) => <i key={i} className="sw-balloon" style={{ left: `${jit(i, 1) * 96}%`, '--d': `${jit(i, 2) * 1.6}s`, '--s': `${0.7 + jit(i, 3) * 0.7}`, '--c': hues[i % hues.length], '--sway': `${(jit(i, 4) - 0.5) * 60}px` }} />} />;
}
function Fireworks() {
  const cols = ['#ff5050', '#ffd040', '#60e070', '#60b0ff', '#ff80e0'];
  return <Particles n={7} render={(b) => (
    <span key={b} className="sw-burst" style={{ left: `${12 + jit(b, 1) * 76}%`, top: `${12 + jit(b, 2) * 45}%`, '--d': `${b * 0.6}s`, '--c': cols[b % cols.length] }}>
      {Array.from({ length: 14 }, (_, k) => <i key={k} style={{ '--a': `${(k / 14) * 360}deg` }} />)}
    </span>
  )} />;
}
function Blimp({ who }) {
  return (
    <div className="sw-blimp">
      <svg viewBox="0 0 220 90" aria-hidden="true">
        <ellipse cx="110" cy="38" rx="96" ry="32" fill="#c8ccd4" stroke="#3a3a48" strokeWidth="3" />
        <ellipse cx="96" cy="28" rx="70" ry="12" fill="#e8ecf2" />
        <path d="M14 38 L-6 14 L4 38 L-6 62 Z" fill="#a8aeb8" stroke="#3a3a48" strokeWidth="3" />
        <rect x="86" y="68" width="48" height="16" rx="5" fill="#8a5a30" stroke="#3a3a48" strokeWidth="3" />
        <path d="M40 38 H180" stroke="#c03030" strokeWidth="6" />
      </svg>
      <span className="sw-banner">{who}</span>
    </div>
  );
}
function Stampede() {
  return <Particles n={14} render={(i) => <i key={i} className="sw-buffalo" style={{ top: `${18 + jit(i, 1) * 66}%`, '--d': `${jit(i, 2) * 1.8}s`, '--s': `${0.8 + jit(i, 3) * 0.8}` }}>🦬</i>} />;
}
function Ufo() {
  return <div className="sw-ufo"><span className="sw-beam" /><i className="sw-cow">🐄</i><i className="sw-saucer">🛸</i></div>;
}
function GoldRush() {
  return <Particles n={48} render={(i) => <i key={i} className="sw-nugget" style={{ left: `${jit(i, 1) * 98}%`, '--d': `${jit(i, 2) * 2.4}s`, '--s': `${0.6 + jit(i, 3) * 0.9}`, '--r': `${jit(i, 4) * 360}deg` }} />} />;
}
const FX = { balloons: Balloons, fireworks: Fireworks, blimp: Blimp, stampede: Stampede, ufo: Ufo, goldrush: GoldRush };
export const SHOW_FX = Object.keys(FX);

/** The full-screen show. Reduced motion: a still badge; its controller announces the event. */
export function SpectacleFx({ fx, who, emoji, reduced, paused = false }) {
  const Fx = FX[fx];
  if (!Fx) return null;
  return createPortal(
    <div className={`spectacle show-${fx} ${reduced ? 'still' : ''} ${paused ? 'paused' : ''}`} aria-hidden="true" data-test="spectacle-fx" data-fx={fx}>
      {reduced ? <span className="sw-still">{emoji}</span> : <Fx who={who} />}
    </div>, document.body);
}

/** "Spectacle": for a seated player holding at least one. Using one uses it up. */
export function ShowButton({ code, view, onDone }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const mine = view.myShows || [];
  if (!mine.length || view.gagsOff) return null;
  const go = async (item) => {
    setErr('');
    try { const r = await api('POST', `/tables/${code}/spectacle`, { item }); setOpen(false); onDone?.(r.show); } catch (e) { setErr(e.message); }
  };
  return (
    <span className="gag-wrap">
      <button className="btn small show-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Put on a spectacle (one-time use, cartoon only)" data-test="show-btn"><span aria-hidden="true">{mine[0].emoji}</span><span className="hide-s">Spectacle</span></button>
      {open && (
        <div className="gag-pop panel" role="dialog" aria-label="Put on a spectacle" data-test="show-pop">
          <div className="pp-items">{mine.map((x) => <button key={x.id} className="btn small" onClick={() => go(x.id)} data-test="show-item" data-id={x.id}><span aria-hidden="true">{x.emoji}</span> <span>{x.name}</span> <span className="muted small num">{money(x.price)}</span></button>)}</div>
          {err && <p className="small err" data-test="show-err">{err}</p>}
          <p className="small muted">One-time use. The whole table sees it once, now or when they come back. It never changes a hand.</p>
        </div>
      )}
    </span>
  );
}

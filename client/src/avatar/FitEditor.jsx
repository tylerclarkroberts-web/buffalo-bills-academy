// v36: fit editor for avatar accessories. Nudge an item (left/right/up/down) and size it (40%..250%), with Reset.
// Saved on the server per item per player, so the seat at every table and the top bar show the same fit.
import React, { useEffect, useRef, useState } from 'react';
import { api, refreshSession } from '../api.js';
import { Bust } from './Bust.jsx';
import './fit.css';

export const FIT_LIMITS = { min: 0.4, max: 2.5, move: 24 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (f) => ({ x: f?.x || 0, y: f?.y || 0, s: f?.s || 1 });

/** The controls alone (the caller shows the preview). value: {x,y,s}; onChange gets the next value. */
export function FitControls({ value, onChange, onReset, compact = false }) {
  const f = norm(value); const L = FIT_LIMITS;
  const nudge = (dx, dy) => onChange({ ...f, x: clamp(f.x + dx, -L.move, L.move), y: clamp(f.y + dy, -L.move, L.move) });
  const size = (s) => onChange({ ...f, s: Math.round(clamp(s, L.min, L.max) * 100) / 100 });
  const pct = Math.round(f.s * 100);
  return (
    <div className={`fit-ctl ${compact ? 'compact' : ''}`} data-test="fit-editor">
      <div className="fit-pad" role="group" aria-label="Move">
        <button className="btn ghost small" onClick={() => nudge(-1, 0)} aria-label="Move left" data-test="fit-left">←</button>
        <button className="btn ghost small" onClick={() => nudge(0, -1)} aria-label="Move up" data-test="fit-up">↑</button>
        <button className="btn ghost small" onClick={() => nudge(0, 1)} aria-label="Move down" data-test="fit-down">↓</button>
        <button className="btn ghost small" onClick={() => nudge(1, 0)} aria-label="Move right" data-test="fit-right">→</button>
      </div>
      <label className="fit-size">
        <span className="small muted">Size</span>
        <button className="btn ghost small" onClick={() => size(f.s - 0.05)} aria-label="Smaller" data-test="fit-smaller">−</button>
        <input type="range" min={L.min * 100} max={L.max * 100} step="5" value={pct} onChange={(e) => size(Number(e.target.value) / 100)} aria-label="Size" data-test="fit-size" />
        <button className="btn ghost small" onClick={() => size(f.s + 0.05)} aria-label="Bigger" data-test="fit-bigger">+</button>
        <b className="num small" data-test="fit-pct">{pct}%</b>
      </label>
      <button className="btn ghost small fit-reset" onClick={onReset} disabled={!f.x && !f.y && f.s === 1} data-test="fit-reset">Reset</button>
    </div>
  );
}

/** Keeps a local fit per item and saves it (debounced) to the server. Returns [fits, setFit(id, f), reset(id), status]. */
export function useFitSaver(initial, onSaved) {
  const [fits, setFits] = useState(initial || {});
  const [status, setStatus] = useState('');
  const timers = useRef({}); const busy = useRef(0); // while edits are in flight, local values win over the server's echo
  useEffect(() => { if (!busy.current) setFits(initial || {}); }, [JSON.stringify(initial || {})]);
  const send = (id, body) => {
    if (timers.current[id]) clearTimeout(timers.current[id]); else busy.current += 1;
    timers.current[id] = setTimeout(async () => {
      setStatus('Saving…');
      try { const v = await api('POST', '/shop/fit', { id, ...body }); setStatus('Saved'); busy.current -= 1; delete timers.current[id]; onSaved?.(v); refreshSession(); } catch (e) { busy.current -= 1; delete timers.current[id]; setStatus(e.message); }
    }, 350);
  };
  const set = (id, f) => { setFits((m) => ({ ...m, [id]: f })); send(id, f); };
  const reset = (id) => { setFits((m) => { const n = { ...m }; delete n[id]; return n; }); send(id, { reset: true }); };
  return [fits, set, reset, status];
}

/** Profile: a dialog with a big preview and the controls for every accessory you're wearing. */
export function FitDialog({ me, shop, onClose, onSaved }) {
  const worn = Object.entries(shop.eq).map(([slot, id]) => ({ slot, id, x: shop.items.find((i) => i.id === id) })).filter((w) => w.x?.kind === 'avatar' && w.slot !== 'skin');
  const [sel, setSel] = useState(worn[0]?.id);
  const [fits, setFit, reset, status] = useFitSaver(shop.fit, onSaved);
  const wear = Object.fromEntries(Object.entries(shop.eq).map(([slot, id]) => { const x = shop.items.find((i) => i.id === id); return [slot, x?.look ? { id, ...x.look, fit: fits[id] } : null]; }).filter(([, v]) => v));
  const cur = worn.find((w) => w.id === sel);
  return (
    <div className="store-ask fit-dialog" role="dialog" aria-modal="true" aria-label="Fit your accessories" data-test="fit-dialog">
      <div className="panel">
        <header className="fd-head"><h2>Fit your accessories</h2><button className="btn ghost small" onClick={onClose} aria-label="Close" data-test="fit-close">×</button></header>
        {worn.length ? (
          <div className="fd-body">
            <div className="fd-pic"><Bust id={me.id} avatar={{ ...me.avatar, wear }} size={150} still /></div>
            <div className="fd-side">
              <div className="fd-items" role="tablist">{worn.map((w) => <button key={w.id} role="tab" aria-selected={w.id === sel} className={`btn small ${w.id === sel ? '' : 'ghost'}`} onClick={() => setSel(w.id)} data-test="fit-item">{w.x.name}</button>)}</div>
              {cur && <FitControls value={fits[cur.id]} onChange={(f) => setFit(cur.id, f)} onReset={() => reset(cur.id)} />}
              <p className="small muted" role="status" data-test="fit-status">{status || 'Changes save as you go and show at every table.'}</p>
            </div>
          </div>
        ) : <p className="muted">You're not wearing anything to adjust. Pick up a hat or glasses at the General Store.</p>}
      </div>
    </div>
  );
}

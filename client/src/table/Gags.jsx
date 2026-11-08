// v36: table gags (formerly "pranks": squirt gun & co. from the General Store). Cartoon effects over a player's seat.
// Each gag is ONE-TIME USE: firing it uses it up (the server enforces it), and you hold at most one of each.
// They reveal nothing and change nothing: the server only keeps a few seconds of "who squirted whom".
// Anyone can mute a sender (this browser), opt out entirely (store/profile), and the host can switch them off.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { PixIcon } from '../store/PixIcon.jsx';

const MUTE_KEY = 'bba.prankMute'; // kept from v34 so existing mutes still apply
const muted = () => { try { return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')); } catch { return new Set(); } };
export function setMuted(id, on) { const m = muted(); if (on) m.add(id); else m.delete(id); try { localStorage.setItem(MUTE_KEY, JSON.stringify([...m])); } catch { /* private */ } }
export const isMuted = (id) => muted().has(id);

/** Plays every gag event once (from the table view or the live push), over the target's seat. */
export function GagLayer({ events }) {
  const seen = useRef(new Set());
  const [live, setLive] = useState([]);
  useEffect(() => {
    const fresh = (events || []).filter((e) => e && !seen.current.has(e.id) && Date.now() - (e.shownAt || Date.now()) < 6000);
    if (!fresh.length) return;
    for (const e of fresh) seen.current.add(e.id);
    const m = muted();
    const add = fresh.filter((e) => !m.has(e.from)).map((e) => {
      const el = document.querySelector(`.seat[data-pid="${CSS.escape(e.to)}"] .seat-top`);
      const r = el?.getBoundingClientRect();
      return r ? { ...e, x: r.left + r.width / 2, y: r.top + r.height * 0.4, w: r.width } : null;
    }).filter(Boolean);
    if (!add.length) return;
    setLive((l) => [...l, ...add]);
    const ids = new Set(add.map((e) => e.id));
    setTimeout(() => setLive((l) => l.filter((e) => !ids.has(e.id))), 2600);
  }, [events]);
  if (!live.length) return null;
  return createPortal(live.map((e) => {
    const n = e.effect === 'confetti' ? 18 : e.effect === 'noodle' ? 0 : 14;
    return (
      <div key={e.id} className={`gag-fx fx-${e.effect}`} style={{ left: e.x, top: e.y, '--w': `${Math.max(60, e.w)}px` }} data-test="gags-fx" aria-hidden="true">
        <span className="pf-from"><PixIcon pix={e.pix} size={64} fallback={e.emoji} /></span>
        {e.effect === 'noodle' && <span className="pf-snap">tik!</span>}
        {Array.from({ length: n }, (_, i) => <i key={i} style={{ '--a': `${(i * 360) / n}deg`, '--d': `${40 + ((i * 37) % 40)}px`, '--k': i % 5 }} />)}
        <b className="pf-name">{e.fromName}</b>
      </div>
    );
  }), document.body); // a portal: a transformed ancestor would throw off position: fixed
}

/** The gag button for a seated player holding at least one gag. Firing one uses it up. */
export function GagButton({ code, view, myId, onEvent, onUsed }) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [, bump] = useState(0);
  const mine = view.myGags || [];
  if (!mine.length || view.gagsOff) return null;
  const others = view.seats.filter((s) => s && s.playerId !== myId);
  const pick = mine.some((x) => x.id === item) ? item : mine[0]?.id;
  const cur = mine.find((x) => x.id === pick);
  const fire = async (to) => {
    setErr('');
    try { const r = await api('POST', `/tables/${code}/gag`, { item: pick, target: to }); onEvent?.(r.gag); setOpen(false); setItem(null); onUsed?.(); } catch (e) { setErr(e.message); }
  };
  return (
    <span className="gag-wrap">
      <button className="btn small gag-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Use a gag (harmless, one-time use)" data-test="gags-btn"><PixIcon pix={cur?.pix} size={16} fallback={cur?.emoji} /><span className="hide-s">Gag</span></button>
      {open && (
        <div className="gag-pop panel" role="dialog" aria-label="Gag a player" data-test="gags-pop">
          <div className="pp-items">{mine.map((x) => <button key={x.id} className={`btn small ${x.id === pick ? '' : 'ghost'}`} onClick={() => setItem(x.id)} title={x.name}><PixIcon pix={x.pix} size={16} fallback={x.emoji} /> <span className="hide-s">{x.name}</span></button>)}</div>
          {others.length ? others.map((s) => (
            <div key={s.playerId} className="pp-row">
              <button className="btn small" onClick={() => fire(s.playerId)} data-test="gags-target">{s.name}</button>
              <label className="small muted"><input type="checkbox" checked={isMuted(s.playerId)} onChange={(e) => { setMuted(s.playerId, e.target.checked); bump((n) => n + 1); }} /> mute theirs</label>
            </div>
          )) : <p className="small muted">Nobody else is seated.</p>}
          {err && <p className="small err" data-test="gags-err">{err}</p>}
          <p className="small muted">One-time use: it's gone once you fire it. Harmless, never touches a hand.</p>
        </div>
      )}
    </span>
  );
}

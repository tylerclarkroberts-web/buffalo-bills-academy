// v37: tobacco moments at a table (play money, cartoon only; never touches cards, chips, turns or timers).
// A seated player lights up a one-time-use item from the General Store. Everyone watching the table (players and
// spectators) sees it once: the item comes out at their seat, Guntrad says "hell yeah" (bubble + voice; v40: all lowercase, no "!"), walks
// over, lights it and goes back to his spot, with a smoke wisp the whole time. The server spaces them one a minute
// per table (extra ones queue) and keeps them 24h, so somebody who opens the table later still sees each one once.
// Reduced motion: a still frame with the bubble. Viewers can opt out (Settings); the host can switch it off.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { LowPoly } from '../store/PixIcon.jsx';
import { TIP } from '../store/lowpoly.js';
import { reducedMotion } from '../themes/store.js';

export const SHOW_MS = 8600, STILL_MS = 5000;
const SEEN_KEY = 'bba.smokeSeen', VOICE_KEY = 'bba.smokeVoice';
const DAY = 86400e3;
const seenMap = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } };
function markSeen(id, at) {
  const m = seenMap(); m[id] = at; const now = Date.now();
  for (const [k, t] of Object.entries(m)) if (now - t > 2 * DAY) delete m[k];
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* private mode */ }
}
export const voiceOn = () => { try { return localStorage.getItem(VOICE_KEY) !== '0'; } catch { return true; } };
export function setVoiceOn(on) { try { if (on) localStorage.removeItem(VOICE_KEY); else localStorage.setItem(VOICE_KEY, '0'); } catch { /* private */ } }

/** Guntrad's "hell yeah": the browser's own speech voice, pitched down. Quietly does nothing if unavailable. */
function sayHellYeah() {
  if (!voiceOn()) return;
  try {
    const ss = window.speechSynthesis; if (!ss) return;
    const u = new SpeechSynthesisUtterance('hell yeah'); u.pitch = 0.45; u.rate = 0.9; u.volume = 0.9;
    const v = ss.getVoices().find((x) => /en[-_](US|GB)/i.test(x.lang) && /male|david|daniel|fred|alex/i.test(x.name)) || ss.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    ss.cancel(); ss.speak(u);
  } catch { /* no voice here */ }
}
/** A lighter flick + hiss (Web Audio). */
function flick() {
  if (!voiceOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = flick.ctx ||= new AC(); if (c.state === 'suspended') c.resume();
    const n = c.sampleRate * 0.5, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (i < 300 ? 1 : 0.25 * Math.exp(-i / (n * 0.4)));
    const src = c.createBufferSource(); src.buffer = b; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = c.createGain(); g.gain.value = 0.18; src.connect(f).connect(g).connect(c.destination); src.start();
  } catch { /* no audio */ }
}

function seatBox(pid) {
  const el = pid && document.querySelector(`.seat[data-pid="${CSS.escape(pid)}"] .seat-top`);
  const r = el?.getBoundingClientRect();
  if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, w: r.width };
  const f = document.querySelector('.felt')?.getBoundingClientRect();
  return f ? { x: f.left + f.width / 2, y: f.top + f.height / 2, w: 60 } : { x: innerWidth / 2, y: innerHeight / 2, w: 60 };
}

/** Plays every tobacco moment this viewer hasn't seen yet, one at a time, at the time the server set for it. */
export function SmokeLayer({ events, skew = 0, off = false }) {
  const [cur, setCur] = useState(null);
  const busy = useRef(false); const timer = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (off || busy.current) return undefined;
    const seen = seenMap(); const now = Date.now() + skew;
    const next = (events || []).filter((e) => e && !seen[e.id] && now - e.at < DAY).sort((a, b) => a.at - b.at)[0];
    if (!next) return undefined;
    const wait = Math.max(0, next.at - now);
    const go = () => {
      if (document.hidden) { const v = () => { document.removeEventListener('visibilitychange', v); setTick((n) => n + 1); }; document.addEventListener('visibilitychange', v); return; }
      busy.current = true; markSeen(next.id, next.at);
      const still = reducedMotion();
      const seat = seatBox(next.from);
      const dealer = document.querySelector('.dealer-spot');
      const dr = dealer?.getBoundingClientRect();
      const bubble = dr ? { x: dr.left + dr.width / 2, y: dr.top + dr.height * 0.12 } : { x: innerWidth / 2, y: 80 };
      setCur({ ...next, seat, bubble, still });
      if (dealer && !still && dr) {
        // walk over: stop just above the seat, a little smaller (he's leaning over the felt), then back
        const dx = seat.x - (dr.left + dr.width / 2), dy = seat.y - (dr.top + dr.height * 0.7) - seat.w * 0.25;
        dealer.style.setProperty('--gx', `${Math.round(dx * 0.82)}px`); dealer.style.setProperty('--gy', `${Math.round(Math.max(0, dy * 0.82))}px`);
        dealer.classList.add('gt-visit');
      }
      setTimeout(sayHellYeah, still ? 0 : 200);
      if (!still) setTimeout(flick, 2500);
      timer.current = setTimeout(() => {
        dealer?.classList.remove('gt-visit'); busy.current = false; setCur(null); setTick((n) => n + 1);
      }, still ? STILL_MS : SHOW_MS);
    };
    const t = setTimeout(go, wait);
    return () => clearTimeout(t);
  }, [events, off, tick, skew]);
  useEffect(() => () => { clearTimeout(timer.current); document.querySelector('.dealer-spot')?.classList.remove('gt-visit'); }, []);
  if (!cur) return null;
  const tip = TIP[cur.art] || [0.8, 0.2]; const S = Math.round(Math.max(44, Math.min(84, cur.seat.w * 0.9)));
  return createPortal(
    <div className={`smoke-moment ${cur.still ? 'still' : ''}`} data-test="smoke-fx" data-from={cur.from} aria-live="polite">
      <div className="sm-bubble" style={{ left: cur.bubble.x, top: cur.bubble.y }} data-test="smoke-bubble"><b>Guntrad:</b> hell yeah</div>
      <div className="sm-item" style={{ left: cur.seat.x, top: cur.seat.y, width: S, height: S, '--tx': `${tip[0] * 100}%`, '--ty': `${tip[1] * 100}%` }}>
        <LowPoly art={cur.art} size={S} fallback={cur.emoji} />
        <span className="sm-ember" />
        {!cur.still && <span className="sm-flame" aria-hidden="true"><i /></span>}
        <span className="sm-wisp" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ '--i': i }} />)}</span>
      </div>
      <span className="sr-only">{cur.fromName} lit up a {cur.name}. Guntrad: hell yeah</span>
    </div>, document.body);
}

/** "Light up": for a seated player holding at least one tobacco item. Using one uses it up. */
export function SmokeButton({ code, view, onDone }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const mine = view.mySmokes || [];
  if (!mine.length || view.smokeOff) return null;
  const light = async (item) => {
    setErr('');
    try {
      const r = await api('POST', `/tables/${code}/smoke`, { item });
      const wait = Math.round((r.smoke.at - r.smoke.made) / 1000);
      setNote(wait > 0 ? `Guntrad's on his way in about ${wait}s.` : ''); setOpen(false); onDone?.(r.smoke);
      if (wait > 0) setTimeout(() => setNote(''), 6000);
    } catch (e) { setErr(e.message); }
  };
  return (
    <span className="gag-wrap">
      <button className="btn small smoke-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Light up (one-time use, cartoon only)" data-test="smoke-btn"><LowPoly art={mine[0].art} size={18} fallback="🚬" /><span className="hide-s">Light up</span></button>
      {note && <span className="small muted smoke-note" data-test="smoke-note">{note}</span>}
      {open && (
        <div className="gag-pop panel" role="dialog" aria-label="Light up" data-test="smoke-pop">
          <div className="pp-items">{mine.map((x) => <button key={x.id} className="btn small" onClick={() => light(x.id)} data-test="smoke-item" data-id={x.id}><LowPoly art={x.art} size={18} fallback="🚬" /> <span>{x.name}</span></button>)}</div>
          {err && <p className="small err" data-test="smoke-err">{err}</p>}
          <p className="small muted">One-time use. Guntrad brings the lighter; everyone at the table sees it once. For adult players. Tobacco causes cancer and is highly addictive.</p>
        </div>
      )}
    </span>
  );
}

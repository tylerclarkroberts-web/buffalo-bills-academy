// v49 cinematic showdown. Plays the server's showdown record: the table dims, a heartbeat starts, each player who
// reached showdown flips their two cards one at a time (last aggressor first, then clockwise) with their hand name
// and best five lit on the board, then a big winner banner (split and side pots named) while the winner's bust does
// a cartoon hip-thrust dance. The record only ever holds hands that reached showdown, so folded cards can't show.
// Tap = skip ahead one beat (and speed up), Skip = close. Avatars and faces are drawn exactly as at the table.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../Card.jsx';
import { Bust } from '../avatar/Bust.jsx';
import { chips } from '../util.js';
import * as music from './music.js';
import './showdown.css';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- sound: tiny Web Audio synth (heartbeat, drumroll, ta-da); silent when the table's ♪ is off ----
let ac = null;
function audio() {
  try { if (!music.state().on) return null; } catch { return null; }
  try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; } catch { return null; }
}
function thump(a, t, f = 52, g = 0.55) {
  const o = a.createOscillator(); const v = a.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + 0.015); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(v).connect(a.destination); o.start(t); o.stop(t + 0.25);
}
function heartbeat(beats = 2, gap = 0.78) { const a = audio(); if (!a) return; const t0 = a.currentTime + 0.02; for (let i = 0; i < beats; i++) { thump(a, t0 + i * gap); thump(a, t0 + i * gap + 0.2, 46, 0.4); } }
function drumroll(sec = 1.4) {
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * 0.04); const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const t0 = a.currentTime + 0.02;
  for (let t = 0; t < sec; t += 0.055) { const s = a.createBufferSource(); s.buffer = buf; const g = a.createGain(); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; g.gain.value = 0.12 + 0.3 * (t / sec); s.connect(f).connect(g).connect(a.destination); s.start(t0 + t); }
}
function tada() {
  const a = audio(); if (!a) return; const t0 = a.currentTime + 0.03;
  [[392, 0], [523.25, 0.12], [659.25, 0.12], [783.99, 0.12]].forEach(([f, dt]) => {
    const o = a.createOscillator(); const g = a.createGain(); o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 1.1);
    o.connect(g).connect(a.destination); o.start(t0 + dt); o.stop(t0 + dt + 1.2);
  });
}

/** The beats of a record, in order, with their length at normal speed (ms). */
export function plan(sd) {
  if (!sd) return [];
  if (sd.kind === 'fold') return [{ k: 'fold', ms: 2600 }];
  return [{ k: 'intro', ms: 1500 }, ...sd.reveals.map((_, i) => ({ k: 'reveal', i, ms: 1900 })), { k: 'banner', ms: 4400 }];
}

/** Who to headline: the main pot's winners (the first pot that was actually contested). */
export function headline(sd) {
  const pots = (sd?.pots || []).filter((p) => !p.uncalled);
  const main = pots[0] || sd?.pots?.[0];
  return { main, pots };
}

function Hips({ thrust }) {
  // low-poly belt, denim hips and boots under the bust; the whole lower body pumps forward on the beat
  return (
    <svg className={`sd-hips ${thrust ? 'go' : ''}`} viewBox="0 0 100 80" aria-hidden="true">
      <g className="sd-pelvis">
        <polygon points="30,0 70,0 68,10 32,10" fill="#5a3a1e" /><rect x="45" y="1.5" width="10" height="7" fill="#e6c25a" />
        <polygon points="32,10 68,10 72,22 50,26 28,22" fill="#36507a" />
      </g>
      <g className="sd-leg l"><polygon points="30,20 48,24 44,62 33,62" fill="#3d5a86" /><polygon points="33,62 44,62 46,72 24,74 26,70" fill="#4a2c18" /></g>
      <g className="sd-leg r"><polygon points="52,24 70,20 67,62 56,62" fill="#2f4870" /><polygon points="56,62 67,62 76,70 78,74 54,72" fill="#4a2c18" /></g>
    </svg>
  );
}

function Dancer({ w, avatars, size, reduced }) {
  return (
    <div className={`sd-dancer ${reduced ? '' : 'go'}`} style={{ '--sz': `${size}px` }} data-test="sd-dancer">
      <div className="sd-torso"><Bust id={w.playerId} avatar={avatars?.[w.playerId]} size={size} still={reduced} /></div>
      <Hips thrust={!reduced} />
      <div className="sd-dname">{w.name}</div>
    </div>
  );
}

/**
 * sd: the showdown record from the server. avatars: playerId -> avatar. onDone: closed (finished or skipped).
 */
export function Showdown({ sd, avatars, onDone }) {
  const steps = useMemo(() => plan(sd), [sd]);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const reduced = useMemo(reducedMotion, []);
  const done = useRef(false);
  const close = () => { if (!done.current) { done.current = true; onDone?.(); } };
  const step = steps[Math.min(idx, steps.length - 1)];
  useEffect(() => {
    if (idx >= steps.length) { close(); return undefined; }
    const s = steps[idx];
    if (s.k === 'intro') heartbeat(2); else if (s.k === 'reveal') (s.i === sd.reveals.length - 1 ? drumroll(1.2) : heartbeat(2, 0.7 / speed)); else if (s.k === 'banner' || s.k === 'fold') tada();
    const id = setTimeout(() => setIdx((i) => i + 1), s.ms / speed);
    return () => clearTimeout(id);
  }, [idx, steps, speed]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (!sd || !step) return null;
  const tap = () => { setSpeed((s) => Math.min(4, s * 2)); setIdx((i) => i + 1); };
  const skip = (e) => { e.stopPropagation(); close(); };
  const { main, pots } = headline(sd);
  const total = (sd.pots || []).reduce((a, p) => a + p.amount, 0) || sd.amount || 0;

  if (sd.kind === 'fold') {
    return (
      <div className="sd sd-fold" onClick={close} data-test="showdown" role="dialog" aria-label="Hand result">
        <div className="sd-col"><p className="sd-kick">Hand #{sd.number}</p><h2 className="display sd-big" data-test="sd-banner">{sd.winner.name} takes the pot</h2><p className="sd-amt">{chips(sd.amount)}</p><p className="sd-note">Everyone else folded. No cards shown.</p></div>
      </div>
    );
  }
  const shownN = step.k === 'reveal' ? step.i + 1 : step.k === 'banner' ? sd.reveals.length : 0;
  const cur = step.k === 'reveal' ? sd.reveals[step.i] : null;
  const winners = main?.winners || [];
  const lit = new Set(step.k === 'banner' ? winners.flatMap((w) => w.best || []) : cur?.best || []);
  const banner = step.k === 'banner';
  return (
    <div className={`sd ${banner ? 'sd-at-banner' : ''}`} onClick={tap} data-test="showdown" role="dialog" aria-label={`Showdown, hand ${sd.number}`}>
      <div className="sd-col">
        <div className="sd-top"><span className="sd-kick">Showdown · Hand #{sd.number}</span><span className="sd-kick">Pot {chips(total)}</span></div>
        <div className="sd-board" data-test="sd-board">{sd.board.map((c) => <div key={c} className={`sd-bc ${lit.size && !lit.has(c) ? 'dim' : ''}`}><Card card={c} size="sm" highlight={lit.has(c)} /></div>)}</div>
        {!banner && (
          <div className="sd-stage" aria-live="polite">
            {step.k === 'intro' && <p className="display sd-big sd-pulse">Showdown</p>}
            {cur && (
              <div className="sd-cur" key={cur.seat} data-test="sd-reveal">
                <Bust id={cur.playerId} avatar={avatars?.[cur.playerId]} size={58} />
                <div className="sd-curtxt">
                  <p className="sd-name">{cur.name} <span className="sd-ord">{step.i + 1} of {sd.reveals.length}</span></p>
                  <div className={`sd-hole ${reduced ? '' : 'flip'}`}>{cur.cards.map((c) => <div key={c} className="sd-hc"><Card card={c} size="sm" highlight={lit.has(c)} /></div>)}</div>
                  <p className="sd-hand" data-test="sd-hand">{cur.hand}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {banner && (
          <div className="sd-win" data-test="sd-banner">
            <div className="sd-dancers">{winners.map((w) => <Dancer key={w.seat} w={w} avatars={avatars} size={winners.length > 2 ? 44 : winners.length === 2 ? 58 : 70} reduced={reduced} />)}</div>
            <h2 className="display sd-big">{winners.length > 1 ? `Split pot: ${winners.map((w) => w.name).join(' & ')}` : `${winners[0]?.name} wins`}</h2>
            <p className="sd-hand big">{winners[0]?.hand}</p>
            <p className="sd-amt">{winners.length > 1 ? winners.map((w) => `${w.name} ${chips(w.amount)}`).join(' · ') : `Takes ${chips(winners[0]?.amount || main?.amount || 0)}`}</p>
            <div className="sd-best">{(winners[0]?.best || []).map((c) => <Card key={c} card={c} size="sm" highlight />)}</div>
            {pots.length > 1 && <ul className="sd-pots" data-test="sd-pots">{pots.map((p, i) => <li key={i}><b>{p.label}</b> {chips(p.amount)}: {p.winners.map((w) => `${w.name}${p.winners.length > 1 ? ` ${chips(w.amount)}` : ''}`).join(' & ')} <i>{p.winners[0]?.hand}</i></li>)}</ul>}
          </div>
        )}
        {shownN > (cur ? 1 : 0) && (
          <ul className="sd-list" data-test="sd-list">
            {sd.reveals.slice(0, cur ? shownN - 1 : shownN).map((r) => {
              const won = winners.some((w) => w.seat === r.seat) && banner;
              return <li key={r.seat} className={won ? 'won' : ''}><span className="sd-ln">{r.name}</span><span className="sd-lc">{r.cards.map((c) => <Card key={c} card={c} size="sm" />)}</span><span className="sd-lh">{r.hand}</span></li>;
            })}
          </ul>
        )}
        <div className="sd-foot"><span className="sd-hint">{banner ? 'Tap to close' : 'Tap to speed up'}</span><button type="button" className="btn small" onClick={skip} data-test="sd-skip">Skip</button></div>
      </div>
    </div>
  );
}

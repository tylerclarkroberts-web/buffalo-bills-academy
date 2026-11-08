// Theme decorations for the multi-table view. All original SVG/CSS, cosmetic only (nothing here touches game state).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { reducedMotion } from './store.js';

// ---------- anime emotes (sit on a player's bust) ----------
const EMOTE_LABEL = { sweat: 'sweat drop', anger: 'anger vein', sparkle: 'sparkles', blush: 'blush', shock: 'shock lines', speed: 'speed lines' };
function EmoteArt({ kind }) {
  switch (kind) {
    case 'sweat': return <path d="M74 8 C86 26 90 34 82 42 C74 48 64 40 68 30 C70 24 72 16 74 8 Z" fill="#8fd8ff" stroke="#1b5f8a" strokeWidth="3" />;
    case 'anger': return <g fill="none" stroke="#ff2b4a" strokeWidth="6" strokeLinecap="round"><path d="M64 10 Q70 20 62 24" /><path d="M88 10 Q80 18 90 24" /><path d="M62 40 Q70 32 64 28" /><path d="M90 40 Q82 34 90 28" /></g>;
    case 'sparkle': return <g fill="#fff6a8" stroke="#e0a300" strokeWidth="1.5">{[[22, 14, 9], [80, 10, 11], [88, 44, 7], [12, 46, 6]].map(([x, y, r], i) => <path key={i} d={`M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3} Z`} />)}</g>;
    case 'blush': return <g fill="#ff7aa8" opacity=".7"><ellipse cx="28" cy="62" rx="10" ry="5" /><ellipse cx="72" cy="62" rx="10" ry="5" /><g stroke="#ff4f86" strokeWidth="2" opacity=".9"><path d="M22 60 l4 4 M28 60 l4 4 M66 60 l4 4 M72 60 l4 4" /></g></g>;
    case 'shock': return <g stroke="#fff" strokeWidth="4" strokeLinecap="round">{[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (-160 + i * 23) * Math.PI / 180; return <line key={i} x1={50 + 40 * Math.cos(a)} y1={44 + 40 * Math.sin(a)} x2={50 + 52 * Math.cos(a)} y2={44 + 52 * Math.sin(a)} />; })}</g>;
    case 'speed': return <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".85">{[18, 30, 42, 54, 66].map((y, i) => <line key={y} x1={-4 + (i % 2) * 6} y1={y} x2={18 + (i % 2) * 6} y2={y} />)}{[24, 48, 60].map((y) => <line key={y} x1="84" y1={y} x2="104" y2={y} />)}</g>;
    default: return null;
  }
}
export function Emotes({ kinds }) {
  if (!kinds?.length) return null;
  return (
    <svg className="emote" viewBox="0 0 100 110" aria-label={kinds.map((k) => EMOTE_LABEL[k]).join(', ')} role="img">
      {kinds.map((k) => <g key={k} className={`em em-${k}`}><EmoteArt kind={k} /></g>)}
    </svg>
  );
}

// ---------- the geisha with tea (anime theme, every 5 hands) ----------
// A cartoony, respectful figure: walks in, sets a cup by each player, bows, walks out. ~1s a stop, skippable.
function Geisha({ bowing }) {
  return (
    <svg className={`geisha ${bowing ? 'bow' : ''}`} viewBox="0 0 60 110" aria-hidden="true">
      <g className="g-upper">
        <ellipse cx="30" cy="16" rx="15" ry="13" fill="#141019" />
        <circle cx="30" cy="6" r="8" fill="#141019" />
        <path d="M40 8 l10 -6 M42 12 l9 -2" stroke="#e8c766" strokeWidth="2" strokeLinecap="round" />
        <circle cx="44" cy="10" r="3" fill="#ff7aa8" />
        <ellipse cx="30" cy="24" rx="10" ry="11" fill="#fbf4ee" />
        <path d="M24 23 q2 -2 4 0 M32 23 q2 -2 4 0" stroke="#141019" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="30" cy="30" r="1.8" fill="#d6304a" />
        <path d="M14 40 Q30 32 46 40 L48 66 L12 66 Z" fill="#c9416b" />
        <path d="M24 36 L30 52 L36 36" fill="none" stroke="#fbf4ee" strokeWidth="3" />
        <rect x="12" y="56" width="36" height="9" fill="#e8c766" />
        <g className="g-tray"><rect x="16" y="46" width="28" height="4" rx="1" fill="#6b3a1e" /><rect x="20" y="40" width="7" height="6" rx="1.5" fill="#f4efe6" /><rect x="33" y="40" width="7" height="6" rx="1.5" fill="#f4efe6" /></g>
      </g>
      <path d="M13 65 L47 65 L44 104 L16 104 Z" fill="#b2335b" />
      <g fill="#f3a9c6">{[[22, 78], [36, 86], [26, 96]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" />)}</g>
      <path d="M18 104 h10 v4 h-10 z M32 104 h10 v4 h-10 z" fill="#fbf4ee" />
    </svg>
  );
}
function Cup() { return <svg className="tea-cup" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 6 h16 l-2 12 a3 3 0 0 1 -3 3 h-6 a3 3 0 0 1 -3 -3 z" fill="#f4efe6" stroke="#4d6b3c" strokeWidth="1.5" /><path d="M4 8 h14" stroke="#7aa35a" strokeWidth="2.5" /><path d="M9 4 q2 -3 0 -4 M13 4 q2 -3 0 -4" stroke="#fff" strokeWidth="1" fill="none" opacity=".7" /></svg>; }

/** stops: [{x,y}] in % of the felt box (one per seated player); center: {x,y}. */
export function GeishaTea({ stops, center, onDone }) {
  const reduced = useMemo(() => reducedMotion(), []);
  const path = useMemo(() => [{ x: -8, y: center.y }, ...stops.map((s) => ({ x: s.x + (center.x - s.x) * 0.28, y: s.y + (center.y - s.y) * 0.28 })), center, { x: 108, y: center.y }], [stops, center]);
  const [step, setStep] = useState(0);
  const [cups, setCups] = useState(() => (reduced ? stops.map((_, i) => i) : []));
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    if (reduced) { const t = setTimeout(finish, 3200); return () => clearTimeout(t); }
    if (step >= path.length) { const t = setTimeout(finish, 600); return () => clearTimeout(t); }
    const bow = step === path.length - 2;
    const t = setTimeout(() => {
      if (step >= 1 && step <= stops.length) setCups((c) => [...c, step - 1]);
      setStep(step + 1);
    }, step === 0 ? 60 : bow ? 1500 : 950);
    return () => clearTimeout(t);
  }, [step]);
  const at = path[Math.min(step, path.length - 1)];
  const bowing = !reduced && step === path.length - 2;
  return (
    <div className="tea-layer" lang="ja">
      {stops.map((s, i) => cups.includes(i) && <div key={i} className="tea-at" style={{ left: `${s.x + (center.x - s.x) * 0.42}%`, top: `${s.y + (center.y - s.y) * 0.42}%` }}><Cup /></div>)}
      {!reduced && <div className={`geisha-at ${step > 0 && step < path.length ? 'walk' : ''}`} style={{ left: `${at.x}%`, top: `${at.y}%` }}><Geisha bowing={bowing} />{bowing && <span className="tea-say">どうぞ</span>}</div>}
      <div className="tea-cap"><span>お茶をどうぞ</span><button className="btn small ghost" onClick={finish}>Skip</button></div>
    </div>
  );
}

// ---------- the arcade room: generic consoles everywhere, each with a FREE sign ----------
export function Console({ x, y, s = 1, tilt = 0 }) {
  return (
    <svg className="console" viewBox="0 0 60 92" style={{ left: `${x}%`, top: `${y}%`, width: `${46 * s}px`, transform: `rotate(${tilt}deg)` }} aria-hidden="true">
      <rect x="10" y="22" width="40" height="66" rx="5" fill="#16181c" stroke="#2c3038" strokeWidth="2" />
      <rect x="14" y="26" width="32" height="5" rx="2" fill="#24272e" />
      <circle cx="30" cy="40" r="4.5" fill="#3cff6e" className="orb" />
      <rect x="20" y="78" width="20" height="3" rx="1.5" fill="#2c3038" />
      <path d="M22 2 L30 12 L38 2" stroke="#d8d2c0" strokeWidth="1.2" fill="none" />
      <rect x="10" y="10" width="40" height="15" rx="2" fill="#fffdf4" stroke="#c9a227" strokeWidth="1.5" transform="rotate(-4 30 17)" />
      <text x="30" y="21.5" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="11" fill="#d6203a" transform="rotate(-4 30 17)">FREE</text>
    </svg>
  );
}
const ROOM = [
  [2, 6, 1.1, -4], [12, 62, 1, 3], [6, 34, .9, 2], [20, 84, 1.2, -2], [34, 4, .8, 5], [46, 88, 1, 0], [58, 8, .9, -3], [70, 80, 1.1, 4],
  [82, 6, 1, 2], [92, 40, 1.2, -5], [88, 70, .9, 3], [26, 38, .7, 0], [66, 44, .7, -2], [50, 30, .65, 4], [14, 12, .75, 6], [78, 30, .8, -6],
];
export function ConsoleRoom() {
  return (
    <div className="console-room" aria-hidden="true">
      <div className="cr-floor" />
      {ROOM.map(([x, y, s, t], i) => <Console key={i} x={x} y={y} s={s} tilt={t} />)}
    </div>
  );
}

// a few more around each felt, so every table sits in the room (even one pane on a phone)
const FELT_SPOTS = [[1, 2, -5], [90, 1, 4], [0, 74, 3], [92, 76, -4], [22, 0, 2], [70, 0, -3]];
export function FeltConsoles({ size = 40 }) {
  return <div className="felt-consoles" aria-hidden="true">{FELT_SPOTS.map(([x, y, t], i) => <Console key={i} x={x} y={y} s={size / 46} tilt={t} />)}</div>;
}

// ---------- anime: a few drifting sakura petals ----------
export function Petals({ n = 14 }) {
  const ps = useMemo(() => Array.from({ length: n }, (_, i) => ({ l: (i * 37) % 100, d: (i * 1.7) % 9, s: 7 + (i % 5) * 1.6, z: 0.6 + (i % 3) * 0.25 })), [n]);
  return <div className="petals" aria-hidden="true">{ps.map((p, i) => <i key={i} style={{ left: `${p.l}%`, animationDelay: `-${p.d}s`, animationDuration: `${p.s}s`, '--z': p.z }} />)}</div>;
}

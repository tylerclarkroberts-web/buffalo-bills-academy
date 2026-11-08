// "Busted!": when someone shoves all in and loses at showdown, their avatar grudgingly climbs onto the felt,
// plants his feet wide, and every other player at the table takes one cartoon punch at the belt buckle.
// Slapstick only: POW bursts, squash-and-stretch, a wobble and dizzy stars. Tap anywhere to skip.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { bitPlan } from './fx.js';
import { guntradSays } from '../guntrad.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a, b, p) => a + (b - a) * p;
const WORDS = ['POW!', 'BAM!', 'BONK!', 'WHAM!', 'THWACK!', 'KAPOW!', 'BIFF!', 'ZOK!'];
const OOFS = ['OOF!', 'OOOF…', 'urk!', 'NNGH!', 'OOF!!', 'eep!', 'hhff!', 'OWW!'];

function Legs({ spread, S }) {
  // low-poly denim legs and boots hanging from the hips; `spread` 0..1 swings them apart
  const a = 6 + 30 * spread;
  const leg = (side) => (
    <g transform={`rotate(${side * -a} 50 2)`}>
      <polygon points={`${50 + side * 1},2 ${50 + side * 15},2 ${50 + side * 13},52 ${50 + side * 4},52`} fill={side < 0 ? '#3d5a86' : '#2f4870'} />
      <polygon points={`${50 + side * 4},52 ${50 + side * 13},52 ${50 + side * 12},62 ${50 + side * 3},62`} fill="#6b4226" />
      <polygon points={`${50 + side * 3},62 ${50 + side * 12},62 ${50 + side * 22},70 ${50 + side * 3},70`} fill="#4a2c18" />
    </g>
  );
  return (
    <svg className="bit-legs" viewBox="0 0 100 72" style={{ width: S, height: S * 0.72 }} aria-hidden="true">
      <polygon points="34,0 66,0 64,8 36,8" fill="#5a3a1e" />
      <rect x="46" y="1" width="8" height="6" fill="#e6c25a" />
      {leg(-1)}{leg(1)}
    </svg>
  );
}

function Glove({ S, flip }) {
  return (
    <svg viewBox="0 0 40 30" style={{ width: S * 0.42, height: S * 0.32, transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <polygon points="0,9 9,7 9,23 0,21" fill="#f3efe6" />
      <polygon points="9,5 26,2 37,8 38,20 30,28 12,26 9,23" fill="#d63a2f" />
      <polygon points="26,2 37,8 30,12 22,8" fill="#ef5a4c" />
      <polygon points="12,26 30,28 38,20 28,22" fill="#a52920" />
    </svg>
  );
}

function Burst({ word, size }) {
  return (
    <div className="bit-burst" style={{ '--s': `${size}px` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><polygon fill="#f2c65a" stroke="#2a0d1c" strokeWidth="4"
        points="50,2 60,30 90,12 72,42 98,52 70,60 86,90 56,72 48,98 40,72 10,88 28,60 2,50 30,40 14,12 40,28" /></svg>
      <b>{word}</b>
    </div>
  );
}

/**
 * loser: {playerId, name, x, y} seat position in % of the felt box. punchers: same shape.
 * stage: {x, y} % where his boots land. w/h: felt box px. size: seat bust px.
 */
export function AllInBit({ loser, punchers, stage, w, h, size, avatars, onDone, reduced }) {
  const S = Math.round(clamp(size * 2.1, 60, Math.min(150, h * 0.32, w * 0.3)));
  const plan = useMemo(() => bitPlan(punchers.length), [punchers.length]);
  const quip = useMemo(() => guntradSays('bust'), []);
  const total = reduced ? 1900 : plan.total;
  const [t, setT] = useState(0);
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    let raf; const t0 = performance.now();
    const step = (now) => { const e = now - t0; setT(e); if (e >= total) finish(); else raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const key = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); };
  }, [total]);

  const pct = (x, y, dx = 0, dy = 0) => ({ left: `calc(${x}% + ${dx}px)`, top: `calc(${y}% + ${dy}px)` });
  const legH = S * 0.72;
  const names = [loser.name, ...(loser.others || [])];
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : loser.name;
  const fade = clamp((total - t) / 300, 0, 1);
  const root = { opacity: fade };
  const skip = { role: 'button', tabIndex: 0, 'aria-label': `${who} went all in and lost. Tap to skip the animation.`, onPointerDown: finish };

  if (reduced) {
    return (
      <div className="bit bit-reduced" style={root} {...skip}>
        <div className="bit-shade" />
        <div className="bit-loser shake" style={pct(stage.x, stage.y)}><Bust id={loser.playerId} avatar={avatars?.[loser.playerId]} size={S} still /></div>
        <div className="bit-caption" style={pct(stage.x, 3)}><b>OOF!</b> {who} went all in and lost.</div>
        <div className="bit-quip" style={pct(stage.x, 12)}><b>Guntrad:</b> “{quip}”</div>
      </div>
    );
  }

  // ---- loser: hop from his seat onto the table, then spread 'em
  const [c0, c1] = plan.climb;
  const pc = clamp((t - c0) / (c1 - c0), 0, 1);
  const pe = ease(pc);
  const lx = lerp(loser.x, stage.x, pe), ly = lerp(loser.y, stage.y, pe);
  const hop = pc < 1 ? -Math.abs(Math.sin(pc * Math.PI * 3)) * S * 0.35 : 0;
  const spread = ease(clamp((t - plan.spread[0]) / (plan.spread[1] - plan.spread[0]), 0, 1));
  // squash / wobble after each hit
  let sx = 1, sy = 1, rot = pc < 1 ? Math.sin(pc * Math.PI * 6) * 6 : 0, hits = 0, active = null, ai = -1;
  plan.punches.forEach((p, i) => {
    if (t >= p.hit) {
      hits = i + 1;
      const d = t - p.hit;
      const k = Math.exp(-d / 260);
      sy = Math.min(sy, 1 - 0.24 * k); sx = Math.max(sx, 1 + 0.2 * k);
      rot += Math.sin(d / 45) * 10 * k;
    }
    if (t >= p.start && t < p.end) { active = p; ai = i; }
  });
  if (t >= plan.finale[0]) rot += Math.sin((t - plan.finale[0]) / 90) * 7;
  const bubble = t < c1 ? (t > 250 ? 'ugh… fine.' : '') : t < plan.spread[1] ? '*sigh*' : '';

  const parts = [];
  // the puncher on deck: walk in, wind up, swing, walk back
  if (active) {
    const P = punchers[ai];
    const side = P.x <= stage.x ? -1 : 1; // come in from your own side of the table
    const slot = active.end - active.start;
    const q = (t - active.start) / slot;
    const toX = stage.x + side * ((S * 0.95) / w) * 100, toY = stage.y;
    const walk = q < 0.34 ? ease(q / 0.34) : q > 0.84 ? 1 - ease((q - 0.84) / 0.16) : 1;
    const px = lerp(P.x, toX, walk), py = lerp(P.y, toY, walk);
    const wind = q >= 0.36 && q < 0.55 ? (q - 0.36) / 0.19 : 0;
    const jab = q >= 0.5 && q < 0.75 ? 1 - Math.abs((q - 0.57) / 0.07) * (q < 0.57 ? 1 : 0.4) : 0;
    const reach = -wind * S * 0.12 + clamp(jab, 0, 1) * S * 0.42;
    const PS = S * 0.82;
    parts.push(
      <div key={`p${ai}`} className="bit-puncher" style={{ ...pct(px, py, 0, -legH * 0.15), transform: `translate(-50%, -100%) rotate(${side * (wind * -10 + jab * 12)}deg)` }}>
        <Bust id={P.playerId} avatar={avatars?.[P.playerId]} size={PS} still />
        <div className="bit-glove" style={{ [side < 0 ? 'left' : 'right']: `calc(100% - ${PS * 0.2}px + ${reach}px)`, bottom: PS * 0.05 }}>
          <Glove S={S} flip={side > 0} />
        </div>
        <span className="bit-name">{P.name}</span>
      </div>,
    );
  }
  const last = plan.punches[hits - 1];
  const burstOn = last && t - last.hit < Math.min(420, (last.end - last.hit) * 0.85);

  return (
    <div className="bit" style={root} {...skip}>
      <div className="bit-shade" />
      <div className="bit-loser" style={{ ...pct(lx, ly, 0, hop), transform: `translate(-50%, -100%) rotate(${rot}deg) scale(${sx}, ${sy})` }}>
        <div className="bit-body">
          <Bust id={loser.playerId} avatar={avatars?.[loser.playerId]} size={S} still />
          <Legs spread={spread} S={S} />
        </div>
        {hits > 0 && <div className="bit-stars" style={{ '--r': `${S * 0.45}px`, '--spin': `${t / 4}deg` }}>{[0, 1, 2].map((i) => <i key={i} style={{ '--a': `${i * 120}deg` }}>★</i>)}</div>}
        {bubble && <div className="bit-bubble">{bubble}</div>}
        {burstOn && <div className="bit-bubble oof" key={`o${hits}`}>{OOFS[(hits - 1) % OOFS.length]}</div>}
      </div>
      {parts}
      {burstOn && <div className="bit-burst-at" key={`b${hits}`} style={pct(stage.x, stage.y, (hits % 2 ? -1 : 1) * S * 0.12, -legH * 0.95)}><Burst word={WORDS[(hits - 1) % WORDS.length]} size={S * 0.8} /></div>}
      <div className="bit-caption" style={pct(stage.x, 3)}><b>ALL IN… AND BUSTED!</b> {who} {loser.others?.length ? 'pay' : 'pays'} the house.{' '}<span className="muted">Tap to skip</span></div>
      <div className="bit-quip" style={pct(stage.x, 12)}><b>Guntrad:</b> “{quip}”</div>
    </div>
  );
}

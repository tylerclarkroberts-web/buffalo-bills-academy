// Clean sweep: the last player standing zooms in huge and does a cartoony, clothed
// crouch-spam "sit-down" on each busted seat. Close-up mode is the victim's later replay.
// Original art only. No licensed names or assets. Tap anywhere to skip.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { sweepPlan } from './fx.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a, b, p) => a + (b - a) * p;

function Jeans({ S, squat }) {
  // Short clothed legs under the bust so a squat reads as a squat, not a bare pose.
  const a = 10 + 28 * (1 - squat);
  const drop = squat * 10;
  const leg = (side) => (
    <g transform={`translate(0 ${drop}) rotate(${side * -a} 50 2)`}>
      <polygon points={`${50 + side * 1},2 ${50 + side * 14},2 ${50 + side * 12},40 ${50 + side * 4},40`} fill={side < 0 ? '#3d5a86' : '#2f4870'} />
      <polygon points={`${50 + side * 4},40 ${50 + side * 12},40 ${50 + side * 11},48 ${50 + side * 3},48`} fill="#6b4226" />
      <polygon points={`${50 + side * 3},48 ${50 + side * 11},48 ${50 + side * 18},54 ${50 + side * 3},54`} fill="#4a2c18" />
    </g>
  );
  return (
    <svg className="sweep-legs" viewBox="0 0 100 58" style={{ width: S, height: S * 0.58 }} aria-hidden="true">
      <polygon points="34,0 66,0 64,7 36,7" fill="#5a3a1e" />
      <rect x="46" y="1" width="8" height="5" fill="#e6c25a" />
      {leg(-1)}{leg(1)}
    </svg>
  );
}

/**
 * mode: 'tour' | 'closeup'
 * winner, victims: {playerId, name, x, y} in % of the felt.
 * focusId: victim playerId for close-up.
 */
export function TableSweep({ mode, winner, victims, focusId, avatars, w, h, size, reduced, onDone }) {
  const closeup = mode === 'closeup';
  const rawList = closeup ? victims.filter((v) => v.playerId === focusId).slice(0, 1) : victims;
  const list = closeup && rawList[0]
    ? rawList.map((v) => ({ ...v, x: 50, y: 72 }))
    : rawList;
  const winnerPos = closeup ? { ...winner, x: 50, y: 58 } : winner;
  const plan = useMemo(() => sweepPlan(list.length, { closeup }), [list.length, closeup]);
  const total = reduced ? 1700 : plan.total;
  const [t, setT] = useState(0);
  const done = useRef(false);
  const armed = useRef(false);
  const finish = (force = false) => { if (!armed.current && !force) return; if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    let raf; const t0 = performance.now();
    const arm = setTimeout(() => { armed.current = true; }, 450);
    const step = (now) => { const e = now - t0; setT(e); if (e >= total) finish(true); else raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const key = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', key);
    return () => { clearTimeout(arm); cancelAnimationFrame(raf); window.removeEventListener('keydown', key); };
  }, [total]);

  const S = Math.round(clamp(size * (closeup ? 3.4 : 2.8), 90, Math.min(h * 0.52, w * 0.62)));
  const fade = clamp((total - t) / 280, 0, 1);
  const introP = ease(clamp((t - plan.intro[0]) / Math.max(1, plan.intro[1] - plan.intro[0]), 0, 1));

  let visit = null, vi = -1, squat = 0, squash = 1;
  plan.visits.forEach((v, i) => {
    if (t >= v.start && t <= v.end) { visit = v; vi = i; }
  });
  if (visit) {
    const bagT = t - visit.bag0;
    if (bagT >= 0) {
      const k = bagT / visit.bag;
      const which = Math.min(visit.bags - 1, Math.floor(k));
      const local = k - which;
      squat = local < 0.55 ? ease(local / 0.55) : 1 - ease((local - 0.55) / 0.45);
      squash = 1 - squat * 0.18;
    }
  }
  const place = winnerPos;
  const target = list[vi] || list[list.length - 1] || place;
  const from = vi > 0 ? list[vi - 1] : place;
  let wx = place.x, wy = place.y, cam = 1 + 0.55 * introP;
  if (visit) {
    const span = Math.max(1, visit.bag0 - visit.start);
    const walk = ease(clamp((t - visit.start) / span, 0, 1));
    wx = lerp(from.x, target.x, walk);
    wy = lerp(from.y, target.y, walk);
    cam = closeup ? 2.05 : 1.55;
  } else if (t >= (plan.visits[0]?.start || plan.intro[1])) {
    const last = list[list.length - 1] || place;
    wx = last.x; wy = last.y;
    cam = closeup ? 2.05 : 1.55;
  } else {
    wx = lerp(place.x, (list[0] || place).x, introP * (closeup ? 1 : 0.35));
    wy = lerp(place.y, (list[0] || place).y, introP * (closeup ? 1 : 0.35));
    if (closeup) cam = 1.4 + 0.65 * introP;
  }
  const sitY = squat * (S * 0.28);
  const who = target?.name || 'them';
  const caption = closeup
    ? `CLOSE-UP · THEY TOOK THE LOT`
    : vi >= 0 ? `CLEAN SWEEP · SIT-DOWN ${vi + 1} OF ${list.length}` : 'CLEAN SWEEP!';
  const sub = closeup ? `A send-off for ${who}. Tap to skip.` : `The last one standing pays a visit. Tap to skip.`;
  const skip = { role: 'button', tabIndex: 0, 'aria-label': 'Clean sweep celebration. Tap to skip.', onPointerDown: finish };
  const pct = (x, y, dx = 0, dy = 0) => ({ left: `calc(${x}% + ${dx}px)`, top: `calc(${y}% + ${dy}px)` });

  if (reduced) {
    const v = list[0] || winnerPos;
    return (
      <div className={`sweep ${closeup ? 'sweep-closeup' : ''}`} data-test="table-sweep" data-mode={mode} style={{ opacity: fade }} {...skip}>
        <div className="sweep-shade" />
        <div className="sweep-loser" style={pct(v.x, v.y)}>
          <Bust id={v.playerId} avatar={avatars?.[v.playerId]} size={Math.round(S * 0.7)} still />
          <span className="sweep-name">{v.name}</span>
        </div>
        <div className="sweep-winner" style={pct(v.x, v.y, 0, -S * 0.15)}>
          <div className="sweep-body">
            <Bust id={winner.playerId} avatar={avatars?.[winner.playerId]} size={S} still />
            <Jeans S={S} squat={0.4} />
          </div>
          <span className="sweep-name">{winner.name}</span>
        </div>
        <div className="sweep-caption"><b>{caption}</b><span>{sub}</span></div>
      </div>
    );
  }

  return (
    <div className={`sweep ${closeup ? 'sweep-closeup' : ''}`} data-test="table-sweep" data-mode={mode} style={{ opacity: fade }} {...skip}>
      <div className="sweep-shade" />
      <div className="sweep-cam" style={{ transform: `scale(${cam})`, transformOrigin: `${wx}% ${wy}%` }}>
        {list.map((v) => {
          const active = target && v.playerId === target.playerId && visit && t >= visit.bag0;
          const sy = active ? squash : 1;
          return (
            <div key={v.playerId} className="sweep-loser" style={{ ...pct(v.x, v.y), transform: `translate(-50%, -100%) scale(1, ${sy})` }}>
              <Bust id={v.playerId} avatar={avatars?.[v.playerId]} size={Math.round(S * (closeup ? 0.7 : 0.5))} still />
              <span className="sweep-name">{v.name}</span>
            </div>
          );
        })}
        <div
          className="sweep-winner"
          data-test="sweep-winner"
          style={{ ...pct(wx, wy, 0, -sitY), transform: `translate(-50%, -100%) scale(1, ${1 - squat * 0.22})` }}
        >
          <div className="sweep-body">
            <Bust id={winner.playerId} avatar={avatars?.[winner.playerId]} size={S} still />
            <Jeans S={S} squat={squat} />
          </div>
          <span className="sweep-name">{winner.name}</span>
        </div>
      </div>
      <div className="sweep-caption"><b>{caption}</b><span>{sub}</span></div>
    </div>
  );
}

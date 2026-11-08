// v43: visual turn replay. Plays the public events since your last move as quick seat/dealer animations, then
// hands you the turn. Tap anywhere on the felt to skip. Reduced motion: one static summary, ~1.2 s.
import React, { useEffect, useRef, useState } from 'react';
import { pickReplay, stepMs, frameAt, label, replayEnabled, seenSeq, markSeen } from './replay.js';

const active = new Map(); // code -> bool, read by the bottom bar so the action buttons wait for the replay
const subs = new Set();
function setActive(code, on) { if (!!active.get(code) === on) return; active.set(code, on); subs.forEach((f) => f()); }
export function useReplayActive(code) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return !!active.get(code);
}
const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReplay(code, view) {
  const [rp, setRp] = useState(null); // { steps, i, ms, reduced }
  const maxSeq = (view.log || []).reduce((a, e) => (e.ev && e.seq > a ? e.seq : a), 0);
  const mySeat = view.me?.seat ?? null;
  const handNo = view.hand?.number ?? view.lastHand?.number ?? null;
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    if (rp || !maxSeq) return;
    if (!replayEnabled()) { markSeen(code, maxSeq); return; }
    const steps = pickReplay(viewRef.current.log, { mySeat, seen: seenSeq(code), handNo });
    if (!steps.length) { markSeen(code, maxSeq); return; }
    const reduced = reducedMotion();
    setRp({ steps, i: 0, ms: reduced ? 1200 : stepMs(steps.length), reduced, end: maxSeq });
  }, [maxSeq, rp, code]);
  useEffect(() => {
    setActive(code, !!rp);
    if (!rp) return undefined;
    const s = rp.steps[rp.i];
    const dur = rp.reduced ? rp.ms : s.k === 'deal' && s.cards.length === 3 ? rp.ms * 1.6 : rp.ms;
    const id = setTimeout(() => {
      if (rp.reduced || rp.i + 1 >= rp.steps.length) { markSeen(code, rp.end); setRp(null); } else setRp({ ...rp, i: rp.i + 1 });
    }, dur);
    return () => clearTimeout(id);
  }, [rp, code]);
  useEffect(() => () => setActive(code, false), [code]);
  const skip = () => { if (rp) { markSeen(code, rp.end); setRp(null); } };
  if (!rp) return { on: false };
  const hand = view.hand;
  const finalBoard = (hand ? hand.board : view.lastHand?.board || []).length;
  const frame = rp.reduced ? { board: finalBoard, pot: hand?.pot } : frameAt(rp.steps, rp.i, finalBoard, hand?.pot ?? 0);
  const step = rp.steps[rp.i];
  const fresh = !rp.reduced && step.k === 'deal' ? step.cards.map((_, k) => step.board - step.cards.length + k) : [];
  return { on: true, ...rp, step, frame, fresh, skip };
}

/** Overlay drawn inside .felt-box. xy(seat) -> % coords; pot at (cx, cy). */
export function ReplayLayer({ rp, xy, geo, names }) {
  if (!rp.on) return null;
  const pot = { x: geo.cx, y: geo.cy + 3 };
  const deck = { x: 50, y: 22 };
  const fx = (s, key, still) => {
    if (s.k === 'deal') {
      if (still) return null;
      return (
        <React.Fragment key={key}>
          <span className="rp-card rp-burn" style={{ '--x0': `${deck.x}%`, '--y0': `${deck.y}%`, '--x1': `${deck.x + 14}%`, '--y1': `${deck.y + 6}%`, '--d': `${rp.ms * 0.45}ms` }} />
          {s.cards.map((c, k) => <span key={k} className="rp-card rp-deal" style={{ '--x0': `${deck.x}%`, '--y0': `${deck.y}%`, '--x1': `${pot.x + (s.board - s.cards.length + k - 2) * 7}%`, '--y1': `${pot.y - 6}%`, '--d': `${rp.ms * 0.4}ms`, animationDelay: `${rp.ms * (0.3 + k * 0.33)}ms` }} />)}
          <span className="rp-street" style={{ left: `${pot.x}%`, top: `${pot.y - 17}%` }}>{label(s)}</span>
        </React.Fragment>
      );
    }
    if (s.k === 'win') {
      return s.wins.map((w, k) => { const p = xy(w.seat);
        return <span key={`${key}-${k}`} className={`rp-chips rev ${still ? 'still' : ''}`} data-test="rp-win" style={{ '--x0': `${pot.x}%`, '--y0': `${pot.y}%`, '--x1': `${p.x}%`, '--y1': `${p.y}%`, '--d': `${rp.ms * 0.8}ms` }}><i /><i /><i /><b>+{w.amt}</b></span>; });
    }
    const p = xy(s.seat);
    const tag = <span key={`${key}-t`} className={`rp-tag ${s.a} ${s.auto ? 'auto' : ''} ${still ? 'still' : ''}`} data-test={`rp-${s.a}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>{label(s)}</span>;
    if (s.a === 'fold') return [tag, !still && <span key={`${key}-m`} className="rp-muck" style={{ '--x0': `${p.x}%`, '--y0': `${p.y}%`, '--x1': `${pot.x}%`, '--y1': `${pot.y - 4}%`, '--d': `${rp.ms * 0.8}ms` }}><span className="rp-card" /><span className="rp-card" /></span>];
    if (s.a === 'check') return [tag, !still && !s.auto && <span key={`${key}-k`} className="rp-knock" style={{ left: `${p.x}%`, top: `${p.y}%` }} />];
    return [tag, !still && s.amt > 0 && <span key={`${key}-c`} className={`rp-chips ${s.a === 'allin' ? 'big' : ''}`} style={{ '--x0': `${p.x}%`, '--y0': `${p.y}%`, '--x1': `${pot.x}%`, '--y1': `${pot.y}%`, '--d': `${rp.ms * 0.75}ms` }}><i /><i /><i />{s.a === 'allin' && <><i /><i /></>}<b>{s.amt}</b></span>];
  };
  const shown = rp.reduced ? rp.steps.filter((s, k, a) => s.k !== 'act' || a.findLastIndex((x) => x.k === 'act' && x.seat === s.seat) === k) : [rp.step];
  return (
    <div className={`replay ${rp.reduced ? 'reduced' : ''}`} data-test="replay">
      {shown.map((s) => fx(s, s.seq, rp.reduced))}
      <button type="button" className="rp-skip" data-test="rp-skip" onClick={rp.skip} aria-label="Skip the replay">
        <span className="rp-pill">▶ Replay {rp.reduced ? '' : `${rp.i + 1}/${rp.steps.length}`} · tap to skip</span>
      </button>
    </div>
  );
}

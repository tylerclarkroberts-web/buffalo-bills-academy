import React from 'react';
import { PixIcon, LowPoly } from '../store/PixIcon.jsx';
import { TIP } from '../store/lowpoly.js';
import { Dealer } from './Dealer.jsx';
import { SpectacleFx } from './Spectacle.jsx';
import { stepMs } from './replay.js';

const at = (p) => ({ left: `${p.x}%`, top: `${p.y}%` });
const path = (from, to, ms) => ({ '--x0': from.x, '--y0': from.y, '--x1': to.x, '--y1': to.y, '--d': `${ms}ms` });
const point = (p) => ({ x: `${p.x}%`, y: `${p.y}%` });
const action = (s) => ({ fold: 'Fold', check: s.auto ? 'Auto-check' : 'Check', call: `Call ${s.amt}`, bet: `Bet ${s.amt}`, raise: `Raise to ${s.to}`, allin: `All-in ${s.amt}`, post: `Blind ${s.amt}` }[s.a] || s.text);

/** Draw one public event on its historical felt. The replay controller owns all timing and progress. */
export function ReplayLayer({ rp, xy, geo }) {
  if (!rp.on || !rp.step) return null;
  const s = rp.step, still = rp.reduced, ms = stepMs(s, still);
  const pot = { x: `${geo.cx}%`, y: 'var(--rp-pot-y)' };
  const deck = { x: '50%', y: `${Math.max(8, geo.cy - geo.fry - 2)}%` };
  const seats = s.frame?.seats || [];
  const seatPoint = (seat, playerId) => {
    // A replacement occupant must never receive an earlier player's effect.
    const i = playerId ? seats.findIndex((p) => p?.playerId === playerId) : seat;
    return Number.isInteger(i) && i >= 0 && seats[i] ? xy(i) : { x: geo.cx, y: geo.cy };
  };
  const p = seatPoint(s.seat, s.from);
  let effect;
  if (s.k === 'hand') {
    const players = seats.flatMap((seat, i) => seat?.inHand ? [i] : []);
    effect = <>
      {!still && [0, 1].flatMap((pass) => players.map((seat, i) => {
        const target = xy(seat);
        return <span key={`${seat}-${pass}`} className="rp-card rp-deal" data-test="rp-hole-deal" style={{ ...path(deck, { x: `calc(${target.x}% + var(--bust) * ${pass ? .6 : .35})`, y: `calc(${target.y}% - var(--bust) * .2)` }, 280), animationDelay: `${70 + i * 25 + pass * 150}ms` }} />;
      }))}
      <span className="rp-street" style={{ left: '50%', top: 'calc(var(--rp-board-y) - 24px)' }}>Hand #{s.hand}</span>
    </>;
  } else if (s.k === 'deal') {
    const cards = s.cards || [], first = (s.board || cards.length) - cards.length;
    effect = <>
      {!still && <span className="rp-card rp-burn" style={path(deck, { x: '64%', y: `${geo.cy - geo.fry + 7}%` }, 350)} />}
      {!still && cards.map((card, i) => <span key={card} className="rp-card rp-deal" style={{ ...path(deck, { x: `calc(50% + var(--cw) * ${(first + i - 2) * 1.12})`, y: 'calc(var(--rp-board-y) + var(--cw) * .7)' }, 420), animationDelay: `${220 + i * 150}ms` }} />)}
      <span className="rp-street" style={{ left: '50%', top: `calc(var(--rp-board-y) - 24px)` }}>{s.street || (s.board === 3 ? 'Flop' : s.board === 4 ? 'Turn' : 'River')}</span>
    </>;
  } else if (s.k === 'win') {
    effect = (s.wins || []).map((w) => <span key={w.seat} className={`rp-chips ${still ? 'still' : ''}`} data-test="rp-win" style={path(pot, point(seatPoint(w.seat)), ms * .7)}><i /><i /><i /><b>+{w.amt}</b></span>);
  } else if (s.k === 'act') {
    effect = <>
      <span className={`rp-tag ${s.a} ${s.auto ? 'auto' : ''}`} data-test={`rp-${s.a}`} style={at(p)}>{action(s)}</span>
      {!still && s.a === 'fold' && <span className="rp-muck" style={path(point(p), pot, ms * .7)}><span className="rp-card" /><span className="rp-card" /></span>}
      {!still && s.a === 'check' && !s.auto && <span className="rp-knock" style={at(p)} />}
      {!still && s.amt > 0 && <span className={`rp-chips ${s.a === 'allin' ? 'big' : ''}`} style={path(point(p), pot, ms * .7)}><i /><i /><i />{s.a === 'allin' && <><i /><i /></>}<b>{s.amt}</b></span>}
    </>;
  } else if (s.k === 'gag') {
    const target = seatPoint(s.targetSeat, s.to), n = s.effect === 'confetti' ? 18 : s.effect === 'noodle' ? 0 : 14;
    effect = <div className={`gag-fx fx-${s.effect}`} style={{ ...at(target), '--w': 'var(--bust)' }} data-test="gags-fx" data-from={s.from} data-to={s.to}>
      <span className="pf-from"><PixIcon pix={s.pix} size={64} fallback={s.emoji} /></span>
      {s.effect === 'noodle' && <span className="pf-snap">tik!</span>}
      {!still && Array.from({ length: n }, (_, i) => <i key={i} style={{ '--a': `${(i * 360) / n}deg`, '--d': `${40 + ((i * 37) % 40)}px`, '--k': i % 5 }} />)}
      <b className="pf-name">{s.fromName} → {s.toName}</b>
    </div>;
  } else if (s.k === 'smoke') {
    const tip = TIP[s.art] || [.8, .2];
    effect = <div className={`smoke-moment rp-smoke ${still ? 'still' : ''}`} data-test="smoke-fx" data-from={s.from}>
      {!still && <div className="dealer-spot rp-smoke-dealer" style={{ '--visit-x': `${50 + (p.x - 50) * .82}%`, '--visit-y': `${Math.max(0, p.y - 23) * .82}%` }}><Dealer still /></div>}
      <div className="sm-bubble" style={{ left: '50%', top: '8%' }} data-test="smoke-bubble"><b>Guntrad:</b> hell yeah</div>
      <div className="sm-item" style={{ ...at(p), '--tx': `${tip[0] * 100}%`, '--ty': `${tip[1] * 100}%` }}>
        <LowPoly art={s.art} size={64} fallback={s.emoji} /><span className="sm-ember" />
        {!still && <span className="sm-flame"><i /></span>}
        <span className="sm-wisp">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ '--i': i }} />)}</span>
      </div>
    </div>;
  } else if (s.k === 'show') {
    effect = <SpectacleFx fx={s.fx} who={s.fromName} emoji={s.emoji} reduced={still} paused={rp.paused} />;
  } else if (s.k === 'say') {
    if (!seats.some((seat) => seat?.playerId === s.from && seat.say?.text)) effect = <div className="rp-say" style={at(p)}><b>{s.fromName}</b><span>{s.message || s.text}</span></div>;
  } else if (s.k === 'reveal') {
    effect = <span className="rp-tag" style={at(p)}>{s.handName || 'Shows cards'}</span>;
  } else {
    effect = <span className="rp-notice">{s.text}</span>;
  }
  return (
    <div className={`replay ${still ? 'reduced' : ''} ${rp.paused ? 'paused' : ''}`} data-test="replay" data-kind={s.k} style={{ '--rp-board-y': `max(calc(${geo.cy - geo.fry}% + 34px * var(--tscale)), calc(${geo.cy - 5}% - var(--cw) * 1.4 - 14px))`, '--rp-tall-board-y': `${geo.cy - 9}%` }}>
      <div key={s.seq} className="rp-effects" data-test={`rp-${s.k}`} aria-hidden="true">{effect}</div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{s.text}</span>
      <div className="rp-controls" aria-label="Replay controls">
        <span className="rp-progress">{rp.catchup ? `Replay ${rp.i + 1}/${rp.steps.length}` : 'Live'}</span>
        <button type="button" className="btn small" aria-pressed={rp.paused} onClick={rp.togglePause}>{rp.paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="btn small" data-test="rp-skip" onClick={rp.skip}>Skip to live</button>
      </div>
    </div>
  );
}

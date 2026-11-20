// Felt tell, catch button, drag-out, back-room toy, and the after-action notice.
import React, { useEffect, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { KashToy } from './KashToy.jsx';
import './kash.css';

const money = (x) => `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function KashTell({ tell, seat, now }) {
  if (!tell || tell.seat !== seat) return null;
  const left = tell.until - (now || Date.now());
  if (left <= 0) return null;
  return <span className={`bj-kash-glint${tell.hold ? ' hold' : ''}`} data-test="bj-kash-glint" aria-hidden="true" />;
}

export function KashCatch({ kash, onCatch, now }) {
  if (!kash) return null;
  const left = Math.max(0, Math.ceil((kash.until - (now || Date.now())) / 1000));
  return (
    <button type="button" className="bj-kash-catch" data-test="bj-kash-catch" onClick={onCatch}>
      Call security{left ? <small data-test="bj-kash-catch-s">{left}s</small> : null}
    </button>
  );
}

export function KashNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const caught = notice.kind === 'caught';
  return (
    <div className="kash-notice-pop" data-test="bj-kash-notice" onClick={onDismiss} role="dialog">
      <div className="panel kash-notice" onClick={(e) => e.stopPropagation()}>
        <h3 className="western">{caught ? 'Security' : 'Collected'}</h3>
        <p>{caught
          ? `${notice.by || 'The house'} called security. They took ${money(notice.take)} (Kash Bet ${money(notice.won)} + ${money(notice.extra)} extra).`
          : `You collected ${money(notice.take)} from ${notice.from} (Kash Bet ${money(notice.won)} + ${money(notice.extra)} extra).`}</p>
        {notice.hits > 0 && <p className="small dim">{notice.hits} swing{notice.hits === 1 ? '' : 's'} in the back room.</p>}
        <button type="button" className="btn primary small" data-test="bj-kash-notice-ok" onClick={onDismiss}>OK</button>
      </div>
    </div>
  );
}

export function KashDrag({ room, reduced, onDone }) {
  const [go, setGo] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const a = requestAnimationFrame(() => setGo(true));
    const t = setTimeout(() => done.current(), reduced ? 200 : 1800);
    return () => { cancelAnimationFrame(a); clearTimeout(t); };
  }, [reduced]);
  return (
    <div className={`kash-drag ${go ? 'go' : ''} ${reduced ? 'rm' : ''}`} data-test="bj-kash-drag">
      <div className="kash-door" aria-hidden="true" />
      <div className="kash-guards" aria-hidden="true">
        <span className="kash-guard left" />
        <span className="kash-guard right" />
      </div>
      <div className="kash-drag-bust">
        <Bust id={room.cheaterId} avatar={room.avatar} size={88} still title={room.cheaterName} />
        <b>{room.cheaterName}</b>
      </div>
      <p className="kash-drag-line western">Security!</p>
    </div>
  );
}

export function KashOverlay({ v, post, reduced }) {
  const [dragDone, setDragDone] = useState(false);
  const room = v.kashRoom;
  const notice = v.kashNotice;
  useEffect(() => { setDragDone(false); }, [room?.at, room?.cheaterId]);
  if (notice && !room) return <KashNotice notice={notice} onDismiss={() => post('kash-dismiss')} />;
  if (!room) return null;
  const showToy = dragDone || reduced;
  return (
    <div className="kash-overlay">
      {!showToy && <KashDrag room={room} reduced={reduced} onDone={() => setDragDone(true)} />}
      {showToy && (
        <KashToy
          room={room}
          reduced={reduced}
          onHit={(hit) => { if (room.role === 'dealer') post('kash-hit', hit); }}
          onFinish={(extra) => post('kash-finish', { extra })}
          onDismiss={() => post('kash-dismiss')}
        />
      )}
    </div>
  );
}

/** Player-facing Kash Bet buttons. Same late royal sneak, just named and a little easier to spot. */
export function KashButtons({ v, r, post }) {
  const b = r?.bets?.[v.mySeat];
  if (!r?.sneak || !b?.bet) return null;
  const amt = Math.min(v.limits.royalMax, b.bet);
  return ['match', 'pairs'].filter((k) => r.sneak[k]).map((k) => (
    <button key={k} type="button" className="bj-kash" data-test={`bj-kash-${k}`}
      aria-label={`Kash Bet, ${k === 'match' ? 'Royal Match' : 'Royal Pairs'} $${amt}`}
      onClick={() => post('sneak', { royal: { [k]: amt } })}>
      {k === 'match' ? '♛' : '♚'}<span>Kash</span><small>${amt}</small>
    </button>
  ));
}

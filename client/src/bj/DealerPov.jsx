// First-person dealer view: a live 3D table when WebGL is available, the CSS felt as a fallback.
import React, { useEffect, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { Card } from '../Card.jsx';
import { takeCards } from './useDealReveal.js';
import { PitBoss } from './PitBoss.jsx';
import { sfx } from './sfx.js';
import { canPovWebGL, createPovScene } from './povScene.js';
import './dealer-pov.css';

const money = (x) => (x == null ? '∞' : `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

function Hand({ cards, small, freshFrom, reduced }) {
  const prev = freshFrom || 0;
  return (
    <div className={`bj-cards ${small ? 'sm' : ''}`} data-test="bj-cards">
      {cards.map((c, i) => (
        <span key={i} className={`bj-c ${!reduced && i >= prev ? 'bj-in' : ''}`} data-test={i >= prev ? 'bj-card-new' : 'bj-card'}>
          <Card card={c} faceDown={c == null} size={small ? 'sm' : 'md'} />
        </span>
      ))}
    </div>
  );
}

function CssFelt({ v, dealerCards, dealerTotal, handsOf, turnSeat, fxFor, shown, dealing, reduced }) {
  const seats = (v.seats || []).map((s, i) => s && { ...s, i }).filter(Boolean);
  const dShown = shown?.d ?? dealerCards.length;
  const visDealer = takeCards(dealerCards, dShown);
  const [handOn, setHandOn] = useState(false);
  const prompt = v.dealer || {};
  useEffect(() => {
    if (!dealing && prompt.action !== 'deal' && prompt.action !== 'flip' && prompt.action !== 'draw') return;
    if (dealing) { setHandOn(true); const t = setTimeout(() => setHandOn(false), 420); return () => clearTimeout(t); }
  }, [dealing, v?.seq]);
  return (
    <div className={`bj-pov-world ${handOn ? 'flick' : ''}`}>
      <div className="bj-pov-felt" data-test="bj-pov-felt">
        <div className="bj-pov-rail">
          {seats.map((s) => {
            const hs = handsOf(s.i);
            const bet = v.round?.bets?.[s.i];
            const vis = hs.map((h) => takeCards(h.cards, shown?.hands?.[h.i] ?? h.cards.length));
            const res = fxFor?.(s.i) || [];
            return (
              <div key={s.i} className={`bj-pov-seat ${s.i === turnSeat ? 'turn' : ''} ${s.me ? 'me' : ''}`} data-test={`bj-pov-seat-${s.i}`}>
                <div className="bj-pov-bust">
                  <Bust id={s.id || `bot:${s.name}`} avatar={s.avatar} size={64} still={reduced} title={s.name} />
                </div>
                <b className="bj-pov-name">{s.name}</b>
                <span className="bj-pov-chips mono">{money(s.chips)}</span>
                {bet && !bet.out && <span className="bj-pov-bet" data-test="bj-pov-bet">{money(bet.bet)}</span>}
                <div className="bj-pov-hands">
                  {vis.map((cards, i) => (
                    <div key={i} className={`bj-hand ${hs[i]?.bust ? 'bust' : ''} ${hs[i]?.bj ? 'bj' : ''}`}>
                      <Hand cards={cards} small reduced={reduced} freshFrom={shown?.hands?.[hs[i]?.i] ? undefined : 0} />
                      {!!hs[i]?.total && cards.length > 0 && cards.every(Boolean) && <span className="bj-total">{hs[i].bust ? 'BUST' : hs[i].total}</span>}
                      {res[i] && <span className={`bj-fx ${res[i].net >= 0 ? 'up' : 'down'}`}>{res[i].out}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="bj-pov-house">
          <Hand cards={visDealer} reduced={reduced} freshFrom={Math.max(0, dShown - 1)} />
          {visDealer.length > 0 && dealerTotal != null && dShown >= dealerCards.length && (
            <span className="bj-total" data-test="bj-dealer-total">{dealerTotal > 21 ? 'BUST' : dealerTotal}</span>
          )}
        </div>
      </div>
      <div className="bj-pov-rack">
        <div className="bj-shoe" data-test="bj-shoe" aria-label="Shoe"><span /><span /><em>{v.deckLeft ?? 0}</em></div>
        <div className="bj-tray" data-test="bj-tray" aria-label="Chip tray">
          {['r', 'g', 'k', 'b', 'r'].map((c, i) => <i key={i} className={`ch ${c}`} />)}
          <em>{money(v.house.bank)}</em>
        </div>
      </div>
      <div className="bj-pov-arms" aria-hidden="true">
        <div className="bj-arm l"><div className="bj-sleeve" /><div className="bj-palm" /></div>
        <div className="bj-arm r"><div className="bj-sleeve" /><div className="bj-palm" /><div className="bj-flick-card" /></div>
      </div>
    </div>
  );
}

export function DealerPov({
  v, dealerCards, dealerTotal, handsOf, turnSeat, fxFor, shown, dealing, reduced, onDeal, onAuto, now, tip, thanks,
}) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [engine, setEngine] = useState(() => (canPovWebGL() ? 'pending' : 'css'));
  const [fps, setFps] = useState(0);
  const [gesture, setGesture] = useState('');
  const prompt = v.dealer || {};

  useEffect(() => {
    if (!canPovWebGL() || !canvasRef.current) { setEngine('css'); return undefined; }
    let scene = null;
    try {
      scene = createPovScene(canvasRef.current, {
        reduced,
        onFps: setFps,
        onGesture: (g) => setGesture(g?.kind || ''),
        onLost: () => setEngine('css'),
      });
    } catch {
      scene = null;
    }
    if (!scene) { setEngine('css'); return undefined; }
    sceneRef.current = scene;
    setEngine('webgl');
    return () => { scene.destroy(); sceneRef.current = null; };
  }, [reduced]);

  useEffect(() => {
    sceneRef.current?.setView({ v, dealerCards, dealerTotal, handsOf, turnSeat, fxFor, shown, dealing, tip, thanks });
  }, [v, dealerCards, dealerTotal, handsOf, turnSeat, fxFor, shown, dealing, tip, thanks, now]);

  return (
    <div
      className={`bj-pov ${reduced ? 'rm' : ''} ${engine === 'webgl' ? 'gl' : ''}`}
      data-test="bj-dealer-pov"
      data-engine={engine === 'pending' ? 'webgl' : engine}
      data-gesture={gesture}
      data-fps={Math.round(fps)}
    >
      <div className="bj-pov-stage" data-test="bj-pov-stage">
        <canvas ref={canvasRef} className="bj-pov-canvas" data-test="bj-pov-canvas" aria-label="Dealer table" />
        {engine !== 'webgl' && (
          <CssFelt v={v} dealerCards={dealerCards} dealerTotal={dealerTotal} handsOf={handsOf} turnSeat={turnSeat} fxFor={fxFor} shown={shown} dealing={dealing} reduced={reduced} />
        )}
        {engine === 'webgl' && tip && <span className="bj-tip-toss" data-test="bj-tip-toss" data-amt={tip.amount} hidden aria-hidden="true">${tip.amount}</span>}
        {engine !== 'webgl' && tip && <span className="bj-tip-toss" data-test="bj-tip-toss" data-amt={tip.amount} aria-hidden="true">${tip.amount}</span>}
        {thanks && <p className="bj-thanks" data-test="bj-thanks" role="status">{thanks}</p>}
        <PitBoss pit={v.pit} pov reduced={reduced} hideFigure={engine === 'webgl'} />
      </div>
      <div className="bj-pov-bar" data-test="bj-dealer-bar">
        <label className="bj-auto" data-test="bj-autopilot">
          <input type="checkbox" checked={v.house.autopilot !== false} onChange={(e) => onAuto(e.target.checked)} />
          Autopilot
        </label>
        <span className="bj-pov-prompt" data-test="bj-deal-prompt">{prompt.label || (v.house.autopilot ? 'Autopilot is dealing' : "You're dealing")}</span>
        {prompt.action && (
          <button className="btn primary" onClick={() => { sfx.deal(); onDeal(prompt.action); }} data-test="bj-deal-next">
            {prompt.action === 'flip' ? 'Flip' : prompt.action === 'draw' ? 'Draw' : 'Deal'}
          </button>
        )}
        {engine === 'webgl' && <span className="bj-pov-fps" data-test="bj-pov-fps">{Math.round(fps) || '—' } fps</span>}
      </div>
    </div>
  );
}

export function TipBar({ canTip, onTip, busy, tip }) {
  if (!canTip) return null;
  return (
    <div className="bj-tips" data-test="bj-tips">
      <span className="small dim">Tip the dealer</span>
      {[1, 5, 25].map((n) => (
        <button key={n} className="btn small" disabled={busy} onClick={() => onTip(n)} data-test={`bj-tip-${n}`}>${n}</button>
      ))}
      {tip && <span className="bj-tip-toss rail" data-test="bj-tip-toss" data-amt={tip.amount}>${tip.amount}</span>}
    </div>
  );
}

export function TableChat({ chat, onSay, meId }) {
  const [text, setText] = useState('');
  return (
    <form className="bj-chat" data-test="bj-chat" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; onSay(t); setText(''); }}>
      <ul className="bj-chat-log" aria-live="polite">
        {(chat || []).slice(-3).map((m, i) => <li key={`${m.at}-${i}`} className={m.id === meId ? 'me' : ''}><b>{m.name}</b> {m.text}</li>)}
      </ul>
      <input data-test="bj-say" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something" aria-label="Table chat" />
    </form>
  );
}

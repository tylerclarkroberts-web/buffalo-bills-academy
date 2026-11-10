import React, { useEffect, useRef, useState } from 'react';
import { Dealer } from '../table/Dealer.jsx';
import { money } from '../util.js';

/**
 * The big blind's fight offer, as a centered prompt over the table (the turn clock and bottom bar stay visible).
 * Only Fight or Decline close it: no backdrop tap, no Escape. The buttons arm after a beat, so a tap meant for
 * something else (or landing as a pane takes focus) can't pick for you.
 */
export function FightOffer({ refund, stake, quip, onFight, onDecline, clock, armMs = 600 }) {
  const [armed, setArmed] = useState(false);
  const card = useRef(null);
  useEffect(() => { const id = setTimeout(() => setArmed(true), armMs); return () => clearTimeout(id); }, [armMs]);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  const keep = (e) => { e.stopPropagation(); if (e.key === 'Escape') e.preventDefault(); };
  return (
    <div className="fo-backdrop" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className={`fo-card ${armed ? 'armed' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="fo-title" aria-describedby="fo-stakes" tabIndex={-1} ref={card} onKeyDown={keep}>
        <p className="fo-cw">Contains cartoon violence</p>
        <div className="fo-portrait" aria-hidden="true"><Dealer still /></div>
        <div className="fo-body">
          <p className="fo-kicker">You posted the big blind</p>
          <h2 id="fo-title" className="fo-title">Fight Guntrad the&nbsp;Pit&nbsp;Boss?</h2>
          {quip && <p className="fo-quip">“{quip}”</p>}
          <dl id="fo-stakes" className="fo-stakes">
            <div className="win"><dt>Win</dt><dd>He covers your big blind: <b>+{money(refund)}</b></dd></div>
            <div className="lose"><dt>Lose</dt><dd>5% of your total cash (at most 10 big blinds) goes into the pot{stake !== null && stake !== undefined ? <>: <b>−{money(stake)}</b></> : null}</dd></div>
          </dl>
          <div className="fo-btns">
            <button className="btn primary fo-fight" disabled={!armed} onClick={onFight}>Fight</button>
            <button className="btn fo-decline" disabled={!armed} onClick={onDecline}>Decline</button>
          </div>
          {clock && <p className="fo-clock" aria-live="off">{clock}</p>}
        </div>
      </div>
    </div>
  );
}

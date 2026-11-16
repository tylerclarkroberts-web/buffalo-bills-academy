// Lobby Games card for Async Scum: same markup and classes as the blackjack and slots cards.
import React from 'react';
import { navigate } from '../App.jsx';
import { Trollface } from './Trollface.jsx';

export function ScumCard() {
  return (
    <section className="panel lb-card lb-slots lb-scum" data-test="scum-card">
      <div className="panel-head"><span className="western">Async Scum</span><span className="ph-sub">Aces trump · 3–7 players</span></div>
      <div className="panel-body"><ScumPromo bare /></div>
    </section>
  );
}
export function ScumPromo({ bare = false }) {
  return (
    <div className={`slots-promo ${bare ? 'bare' : ''}`} data-test={bare ? undefined : 'scum-card'}>
      <span className="sp-art sc-promo-art" aria-hidden="true"><Trollface size={64} /></span>
      <div className="sp-txt">
        {!bare && <b className="western">Async Scum</b>}
        <span className="small sp-desc">Match the last card, skip the next sap.</span>
        <button className="btn small sp-go" onClick={() => navigate('/scum')} data-test="scum-go">Play scum <span className="arrow">→</span></button>
      </div>
    </div>
  );
}

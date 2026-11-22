// Lobby Games card for Async Scum: same markup and classes as the blackjack and slots cards.
import React from 'react';
import { navigate } from '../App.jsx';
import { Trollface } from './Trollface.jsx';

import { useModes } from '../modes/Modes.jsx';
import { FAMILY_GAME } from '../modes/family.js';

export function ScumCard() {
  const { safe: family } = useModes();
  const title = family ? FAMILY_GAME.scum : 'SCUM';
  return (
    <section className="panel lb-card lb-slots lb-scum" data-test="scum-card">
      <div className="panel-head"><span className="western">{title}</span><span className="ph-sub">Single deck · Aces trump</span></div>
      <div className="panel-body"><ScumPromo bare /></div>
    </section>
  );
}
export function ScumPromo({ bare = false }) {
  const { safe: family } = useModes();
  const title = family ? FAMILY_GAME.scum : 'SCUM';
  const go = family ? 'Play Palace' : 'Play scum';
  return (
    <div className={`slots-promo ${bare ? 'bare' : ''}`} data-test={bare ? undefined : 'scum-card'}>
      <span className="sp-art sc-promo-art" aria-hidden="true"><Trollface size={64} /></span>
      <div className="sp-txt">
        {!bare && <b className="western">{title}</b>}
        <span className="small sp-desc">{"You're skipped!"}</span>
        <button className="btn small sp-go" onClick={() => navigate('/scum')} data-test="scum-go">{go} <span className="arrow">→</span></button>
      </div>
    </div>
  );
}

// Lobby Games card for El Halo: same chrome as blackjack, slots and SCUM.
// Art is client/public/elhalo/thumb.webp (falls back to thumb.png). Drop in a new file to swap it.
import React, { useState } from 'react';
import { navigate } from '../../App.jsx';
import { useModes } from '../../modes/Modes.jsx';
import { FAMILY_GAME } from '../../modes/family.js';

const THUMB_WEBP = '/elhalo/thumb.webp';
const THUMB_PNG = '/elhalo/thumb.png';
export const EL_HALO_BLURB = 'Donde esta la freaking buffadora';

export function ElHaloCard() {
  return (
    <section className="panel lb-card lb-slots lb-elhalo" data-test="elhalo-card">
      <div className="panel-head"><span className="western">El Halo</span><span className="ph-sub">Co-op horde</span></div>
      <div className="panel-body"><ElHaloPromo bare /></div>
    </section>
  );
}

export function ElHaloPromo({ bare = false }) {
  const [src, setSrc] = useState(THUMB_WEBP);
  const { safe: family } = useModes();
  const blurb = family ? FAMILY_GAME.elhaloBlurb : EL_HALO_BLURB;
  return (
    <div className={`slots-promo elh-promo ${bare ? 'bare' : ''}`} data-test={bare ? undefined : 'elhalo-card'}>
      <img
        className="sp-art elh-promo-art"
        src={src}
        alt=""
        aria-hidden="true"
        width={64}
        height={64}
        onError={() => { if (src !== THUMB_PNG) setSrc(THUMB_PNG); }}
      />
      <div className="sp-txt">
        {!bare && <b className="western">El Halo</b>}
        <span className="small sp-desc">{blurb}</span>
        <button className="btn small sp-go" onClick={() => navigate('/elhalo')} data-test="elhalo-go">Play El Halo <span className="arrow">→</span></button>
      </div>
    </div>
  );
}

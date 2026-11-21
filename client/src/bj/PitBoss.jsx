// Pit Boss Brisk: original low-poly floor manager (suit, earpiece, clipboard). No real people, no Halo assets.
import React, { useEffect, useRef } from 'react';
import { sfx } from './sfx.js';

export function PitFigure({ state = 'approach', compact = false, reduced }) {
  return (
    <div className={`pit-fig ${state} ${compact ? 'sm' : ''} ${reduced ? 'rm' : ''}`} data-test="bj-pit-fig" aria-hidden="true">
      <div className="pit-shadow" />
      <div className="pit-body">
        <div className="pit-leg l" />
        <div className="pit-leg r" />
        <div className="pit-coat">
          <div className="pit-lapel l" />
          <div className="pit-lapel r" />
          <div className="pit-tie" />
        </div>
        <div className="pit-arm l">
          <div className="pit-board"><i /><i /><i /></div>
        </div>
        <div className="pit-arm r" />
        <div className="pit-head">
          <div className="pit-hair" />
          <div className="pit-earpiece" />
          <div className="pit-brow" />
          <div className="pit-eye l" />
          <div className="pit-eye r" />
          <div className="pit-mouth" />
        </div>
      </div>
    </div>
  );
}

/** Short overlay + figure. Does not capture clicks — play stays live underneath. */
export function PitBoss({ pit, pov, reduced }) {
  const prev = useRef(null);
  useEffect(() => {
    if (!pit) { prev.current = null; return; }
    if (prev.current !== pit.at) {
      prev.current = pit.at;
      if (pit.state === 'approach' || pit.state === 'loom') sfx.footsteps();
      if (pit.state === 'loom' || pit.kind === 'swear') sfx.loom();
    }
  }, [pit?.at, pit?.state, pit?.kind]);
  if (!pit) return null;
  return (
    <div className={`pit-layer ${pov ? 'pov' : 'rail'} ${pit.state} ${pit.loom ? 'looming' : ''}`} data-test="bj-pit" data-state={pit.state} aria-live="polite">
      <PitFigure state={pit.state} compact={!pov} reduced={reduced} />
      <p className="pit-line" data-test="bj-pit-line" role="status">
        <b>{pit.name}</b> <i>{pit.title}</i>
        <span>{pit.line}</span>
      </p>
    </div>
  );
}

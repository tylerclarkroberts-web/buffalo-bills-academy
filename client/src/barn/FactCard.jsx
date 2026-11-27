// The species fact card: sprite, name, where it is found, what it eats, and about three strange facts,
// all on one sheet, the most striking fact first. Opens once after a catch, and from a bug's stall.
// STEEZE, Stage II barn names and botched rebuilds are labelled Academy lore, never as science.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { factCard } from '../../../server/engine/bug-facts.js';
import { drawBug } from './sprite.js';
import './factcard.css';

function Art({ bug, style, level }) {
  const ref = useRef(null);
  const [photo, setPhoto] = useState(bug.id === 'steeze' ? '/api/steeze.png' : null);
  useEffect(() => {
    const c = ref.current; if (!c || photo) return;
    c.width = 448; c.height = 190;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 1, style, level });
  }, [bug.id, level, JSON.stringify(style || null), photo]);
  if (bug.id === 'steeze' && photo) {
    return <div className="bf-window" aria-hidden="true"><img className="bf-art bf-photo" src={photo} alt="" onError={() => setPhoto(null)} /></div>;
  }
  return <div className="bf-window" aria-hidden="true"><canvas ref={ref} className="bf-art" /></div>;
}

export default function FactCard({ species, bug = null, caught = false, name = '', onClose, reduced = false }) {
  const card = factCard(species, { evo: bug?.evo ?? bug?.style?.evo ?? 0, botched: bug?.botched || null });
  const spec = BY_ID[species];
  const dialog = useRef(null);
  const closeBtn = useRef(null);
  const still = reduced || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { dialog.current?.showModal(); closeBtn.current?.focus(); }, []);
  if (!card || !spec) return null;
  return (
    <dialog
      ref={dialog}
      className={`bf-card${still ? ' still' : ''}${card.kind === 'lore' ? ' lore' : ''}`}
      data-test="fact-card"
      data-species={species}
      aria-labelledby="bf-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
    >
      <div className="bf-sheet" data-test="fact-sheet">
        {caught && <p className="bf-kicker" data-test="fact-caught">Caught</p>}
        <Art bug={spec} style={bug?.style} level={bug?.level ?? 10} />
        <h3 id="bf-title">{card.name}</h3>
        {caught && name && name !== card.name && <p className="bf-aka">Now in the stall as {name}</p>}
        <p className="bf-sci"><i>{card.sci}{card.genus ? ' (genus)' : ''}</i>{card.order ? ` · ${card.order}` : ''}</p>
        <div className="bf-body" data-test="fact-body">
          <p className="bf-dt">{card.foundLabel}</p>
          <p className="bf-dd">{card.found}</p>
          <p className="bf-dt">{card.eatsLabel}</p>
          <p className="bf-dd">{card.eats}</p>
          <p className="bf-dt">{card.factsLabel}</p>
          <ul className="bf-facts" data-test="fact-list">
            {card.facts.map((text) => <li key={text}>{text}</li>)}
          </ul>
          {card.lore.map((l) => (
            <div key={l.key} className="bf-lore" data-test={`fact-lore-${l.key}`}>
              <p className="bf-dt">{l.label}</p>
              <p className="bf-dd">{l.text}</p>
            </div>
          ))}
        </div>
        <div className="bf-acts">
          <button type="button" ref={closeBtn} className="btn small" onClick={onClose} data-test="fact-close">{caught ? 'To the stall' : 'Close'}</button>
        </div>
      </div>
    </dialog>
  );
}

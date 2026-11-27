// The species fact card: sprite, name, where it is found, what it eats, and two or three strange facts.
// Opens once after a catch, and from a bug's stall in the barn. Pages with taps so a 390×844 phone never scrolls.
// STEEZE, Stage II barn names and botched rebuilds are labelled Academy lore, never as science.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { factsFor, factPages } from '../../../server/engine/bug-facts.js';
import { drawBug } from './sprite.js';
import './factcard.css';

function Art({ bug, style, level }) {
  const ref = useRef(null);
  const [photo, setPhoto] = useState(bug.id === 'steeze' ? '/api/steeze.png' : null);
  useEffect(() => {
    const c = ref.current; if (!c || photo) return;
    c.width = 448; c.height = 252;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 1, style, level });
  }, [bug.id, level, JSON.stringify(style || null), photo]);
  if (bug.id === 'steeze' && photo) {
    return <div className="bf-window" aria-hidden="true"><img className="bf-art bf-photo" src={photo} alt="" onError={() => setPhoto(null)} /></div>;
  }
  return <div className="bf-window" aria-hidden="true"><canvas ref={ref} className="bf-art" /></div>;
}

export default function FactCard({ species, bug = null, caught = false, name = '', onClose, reduced = false }) {
  const entry = factsFor(species);
  const spec = BY_ID[species];
  const dialog = useRef(null);
  const closeBtn = useRef(null);
  const pages = factPages(species, { evo: bug?.evo ?? bug?.style?.evo ?? 0, botched: bug?.botched || null });
  const [pg, setPg] = useState(0);
  const still = reduced || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { dialog.current?.showModal(); closeBtn.current?.focus(); }, []);
  if (!entry || !spec || !pages.length) return null;
  const page = pages[Math.min(pg, pages.length - 1)];
  const last = pg >= pages.length - 1;
  const next = () => setPg((n) => Math.min(pages.length - 1, n + 1));
  const back = () => setPg((n) => Math.max(0, n - 1));
  return (
    <dialog
      ref={dialog}
      className={`bf-card${still ? ' still' : ''}${entry.kind === 'lore' ? ' lore' : ''}`}
      data-test="fact-card"
      data-species={species}
      data-page={page.key}
      aria-labelledby="bf-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
    >
      <div className="bf-sheet" data-test="fact-sheet">
        {caught && <p className="bf-kicker" data-test="fact-caught">Caught</p>}
        <Art bug={spec} style={bug?.style} level={bug?.level ?? 10} />
        <h3 id="bf-title">{entry.name}</h3>
        {caught && name && name !== entry.name && <p className="bf-aka">Now in the stall as {name}</p>}
        <p className="bf-sci"><i>{entry.sci}{entry.genus ? ' (genus)' : ''}</i>{entry.order ? ` · ${entry.order}` : ''}</p>
        <div
          className="bf-body"
          data-test="fact-body"
          onClick={() => { if (!last) next(); }}
          role="region"
          aria-live="polite"
        >
          {page.found != null ? (
            <>
              <p className="bf-dt">{page.foundLabel}</p>
              <p className="bf-dd">{page.found}</p>
              <p className="bf-dt">{page.eatsLabel}</p>
              <p className="bf-dd">{page.eats}</p>
            </>
          ) : (
            <>
              <p className="bf-dt">{page.label}</p>
              <p className="bf-dd">{page.fact}</p>
            </>
          )}
        </div>
        <div className="bf-dots" aria-hidden="true">{pages.map((p, i) => <i key={p.key} className={i === pg ? 'on' : ''} />)}</div>
        <p className="bf-hint">{last ? (pages.length > 1 ? "That is the last page." : "") : "Tap the card for the next fact"}</p>
        <div className="bf-acts">
          {pg > 0 && <button type="button" className="btn small ghost" onClick={back} data-test="fact-back">Back</button>}
          {!last && <button type="button" className="btn small" onClick={next} data-test="fact-next">Next fact</button>}
          <button type="button" ref={closeBtn} className={`btn small${last ? '' : ' ghost'}`} onClick={onClose} data-test="fact-close">{caught && last ? 'To the stall' : 'Close'}</button>
        </div>
      </div>
    </dialog>
  );
}

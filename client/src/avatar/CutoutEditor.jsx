import React, { useEffect, useMemo, useRef, useState } from 'react';
import { headMask } from './head-mask.js';
import { brushPoint, paintMask } from './cutout-brush.js';
import './cutout.css';

export default function CutoutEditor({ source, alpha, onChange, onReset, busy = false }) {
  const canvas = useRef(null), stroke = useRef(null), current = useRef(alpha);
  const [keep, setKeep] = useState(false), [size, setSize] = useState(16), [ghost, setGhost] = useState(true);
  const [cursor, setCursor] = useState({ x: source.width / 2, y: source.height / 2 }), [showCursor, setShowCursor] = useState(false);
  const { width, height } = source;
  const outline = useMemo(() => headMask(width, height), [width, height]);
  useEffect(() => { current.current = alpha; }, [alpha]);
  useEffect(() => { if (busy) stroke.current = null; }, [busy]);
  useEffect(() => {
    const g = canvas.current.getContext('2d');
    const img = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height);
    for (let i = 0; i < alpha.length; i++) if (!alpha[i]) img.data[i * 4 + 3] = ghost ? Math.min(img.data[i * 4 + 3], 45) : 0;
    g.putImageData(img, 0, 0);
    if (showCursor && !busy) {
      g.beginPath(); g.arc(cursor.x, cursor.y, size / 2, 0, Math.PI * 2);
      g.strokeStyle = keep ? '#2ee6d6' : '#ffb547'; g.lineWidth = 1.5; g.stroke();
    }
    img.data.fill(0);
  }, [source, alpha, ghost, cursor, showCursor, keep, size, busy, width, height]);

  const point = (e) => brushPoint(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY, width, height);
  const paint = (from, to) => {
    const next = paintMask(current.current, width, height, from, to, size / 2, keep, outline);
    current.current = next; onChange(next);
  };
  const down = (e) => {
    if (busy || e.button !== 0 || stroke.current) return;
    e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e); stroke.current = { id: e.pointerId, point: p }; setCursor(p); setShowCursor(true); paint(p, p);
  };
  const move = (e) => {
    if (busy) return;
    const p = point(e); setCursor(p); setShowCursor(true);
    if (stroke.current?.id === e.pointerId) { paint(stroke.current.point, p); stroke.current.point = p; }
  };
  const stop = (e) => {
    if (stroke.current?.id !== e.pointerId) return;
    stroke.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const key = (e) => {
    if (busy) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[e.key]) {
      e.preventDefault(); const [dx, dy] = directions[e.key], step = e.shiftKey ? 12 : 4;
      setCursor((p) => ({ x: Math.max(0, Math.min(width, p.x + dx * step)), y: Math.max(0, Math.min(height, p.y + dy * step)) })); setShowCursor(true);
    } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowCursor(true); paint(cursor, cursor); }
  };

  return (
    <div className="cutout-editor" data-test="cutout-editor">
      <canvas ref={canvas} width={width} height={height} className="cutout-canvas" role="application" tabIndex={busy ? -1 : 0}
        aria-label={`Photo cutout editor, ${keep ? 'keep' : 'erase'} brush`} aria-describedby="cutout-help" aria-disabled={busy}
        onPointerDown={down} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={() => { stroke.current = null; }}
        onPointerLeave={() => { if (!stroke.current) setShowCursor(false); }} onKeyDown={key} onFocus={() => setShowCursor(true)} onBlur={() => setShowCursor(false)} />
      <fieldset className="cutout-tools" disabled={busy}>
        <legend className="sr-only">Correct your head cutout</legend>
        <div className="row wrap" role="group" aria-label="Brush tool">
          <button type="button" className={`btn small ${keep ? '' : 'ghost'}`} aria-pressed={keep} onClick={() => setKeep(true)}>Keep</button>
          <button type="button" className={`btn small ${keep ? 'ghost' : ''}`} aria-pressed={!keep} onClick={() => setKeep(false)}>Erase</button>
          {onReset && <button type="button" className="btn small ghost" onClick={onReset}>Reset cutout</button>}
        </div>
        <label className="cutout-size"><span>Brush size</span><input type="range" min="4" max="40" step="2" value={size} onChange={(e) => setSize(Number(e.target.value))} /><output>{size}</output></label>
        <label className="cutout-ghost"><input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />Show removed areas</label>
      </fieldset>
      <p id="cutout-help" className="small muted cutout-help">Dimmed areas will be removed. Brush to keep hair or erase background. Keyboard: arrows move the brush; Space paints.</p>
    </div>
  );
}

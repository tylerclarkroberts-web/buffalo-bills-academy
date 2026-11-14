// v79: acid worms on your goggles, and the bowie knife that gets them off (logic: worms.js). They are drawn in 3D
// (WormLayer.js, wormMesh.js); without WebGL the flat drawing below stands in. Either way the DOM keeps a box on each
// worm for taps and swipes.
import React, { useEffect, useRef, useState } from 'react';
import { createWormLayer } from './WormLayer.js';

const BODY = 'M40 150 C 20 110, 70 100, 80 125 S 125 160, 130 115 S 95 60, 140 48';
function WormArt({ id }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id={`splat${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c8ff4a" stopOpacity=".95" /><stop offset=".6" stopColor="#5fd61a" stopOpacity=".88" /><stop offset="1" stopColor="#1d5a06" stopOpacity=".92" />
        </radialGradient>
        <linearGradient id={`skin${id}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2f7a10" /><stop offset=".5" stopColor="#a6ff3a" /><stop offset="1" stopColor="#e6ff7a" /></linearGradient>
      </defs>
      <path className="w-splat" fill={`url(#splat${id})`} stroke="#123d04" strokeWidth="3"
        d="M100 14 C 122 30, 140 8, 150 34 C 172 30, 168 60, 188 70 C 174 92, 196 112, 176 128 C 182 152, 158 152, 150 176 C 128 168, 116 196, 96 180 C 76 196, 66 170, 44 178 C 40 154, 12 156, 22 130 C 4 116, 20 96, 10 80 C 30 72, 20 44, 46 42 C 50 18, 80 30, 100 14 Z" />
      <path d="M58 176 q 4 14 0 20 M150 176 q -2 10 2 16 M30 132 q -8 6 -10 14" stroke="#3fbf12" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".8" />
      <g className="w-body">
        <path d={BODY} stroke="#123d04" strokeWidth="34" strokeLinecap="round" fill="none" />
        <path d={BODY} stroke={`url(#skin${id})`} strokeWidth="27" strokeLinecap="round" fill="none" />
        <path d={BODY} stroke="#1c4a0c" strokeWidth="27" strokeDasharray="3 11" fill="none" opacity=".55" />
        <circle cx="140" cy="48" r="17" fill="#d8ff6a" stroke="#123d04" strokeWidth="4" />
        <circle cx="134" cy="43" r="4.5" fill="#000" /><circle cx="148" cy="44" r="4.5" fill="#000" />
        <circle cx="135" cy="42" r="1.4" fill="#fff" /><circle cx="149" cy="43" r="1.4" fill="#fff" />
        <path d="M133 55 q 8 6 16 0" stroke="#123d04" strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}

/**
 * worms: what is on your goggles now. cutting: worms mid-slash (drawn falling apart for a moment).
 * Tap or swipe across a worm to cut it, or hit the knife button (K on a keyboard) for the oldest one.
 */
export default function Worms({ worms, cutting, onCut }) {
  const swipe = useRef(null);
  const canvas = useRef(null), layer = useRef(null), done = useRef(new Set());
  const [mode, setMode] = useState('3d');
  useEffect(() => {
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const l = createWormLayer(canvas.current, { reduce, onLost: () => { layer.current?.dispose(); layer.current = null; setMode('flat'); } });
    if (!l) { setMode('flat'); return undefined; }
    layer.current = l;
    window.__wormLayer = { calls: () => l.calls, triangles: () => l.triangles }; // e2e: the phone budget
    const look = (e) => l.setPointer(e.clientX, e.clientY);
    const resize = () => l.resize();
    window.addEventListener('pointermove', look, { passive: true }); window.addEventListener('pointerdown', look, { passive: true }); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('pointermove', look); window.removeEventListener('pointerdown', look); window.removeEventListener('resize', resize); l.dispose(); layer.current = null; delete window.__wormLayer; };
  }, []);
  useEffect(() => {
    const l = layer.current; if (!l) return;
    for (const { w } of cutting) if (!done.current.has(w.id)) {
      done.current.add(w.id);
      // the knife's line is the box's "/" diagonal, turned and mirrored with the worm
      const r = (w.rot * Math.PI) / 180, fx = w.flip ? -1 : 1, lx = fx, ly = -1;
      l.cut(w.id, lx * Math.cos(r) - ly * Math.sin(r), lx * Math.sin(r) + ly * Math.cos(r));
    }
    l.sync(worms);
  }, [worms, cutting]);
  const flat = mode === 'flat';
  const down = (w) => (e) => { e.stopPropagation(); swipe.current = { id: w.id, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { const s = swipe.current; if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 28) { swipe.current = null; onCut(s.id, Math.atan2(e.clientY - s.y, e.clientX - s.x)); } };
  const up = (e) => { const s = swipe.current; swipe.current = null; if (s) onCut(s.id, Math.atan2(e.clientY - s.y, e.clientX - s.x) || -0.5); };
  const place = (w) => ({ left: `${w.x * 100}%`, top: `${w.y * 100}%`, '--s': w.size, '--r': `${w.rot}deg`, '--f': w.flip ? -1 : 1 });
  return (
    <>
      <div className="m-worms" aria-hidden="true" data-mode={mode}>
        <canvas ref={canvas} className="m-worm3d" hidden={flat} />
        {worms.map((w) => (
          <div key={w.id} className={`m-worm${flat ? '' : ' hit'}`} style={place(w)} data-test="worm" onPointerDown={down(w)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { swipe.current = null; }}>
            {flat && <div className="w-in"><WormArt id={w.id} /></div>}
          </div>
        ))}
        {cutting.map(({ w }) => (
          <div key={`c${w.id}`} className="m-worm cut" style={place(w)}>
            {flat && <div className="w-half a"><div className="w-in"><WormArt id={`a${w.id}`} /></div></div>}
            {flat && <div className="w-half b"><div className="w-in"><WormArt id={`b${w.id}`} /></div></div>}
            <div className="w-slash" />
          </div>
        ))}
      </div>
      {worms.length > 0 && (
        <button type="button" className="m-knife" data-test="knife" onPointerDown={(e) => { e.preventDefault(); onCut(null, -0.6); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCut(null, -0.6); } }}>
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 44 L40 14 C 48 8, 58 6, 60 4 C 58 12, 52 22, 44 28 L 16 50 Z" fill="#e8f0e0" stroke="#0b1a06" strokeWidth="2.5" /><path d="M40 14 C 48 8, 58 6, 60 4 C 58 12, 52 22, 44 28" fill="none" stroke="#fff" strokeWidth="1.5" /><rect x="10" y="40" width="16" height="6" rx="2" transform="rotate(-40 18 43)" fill="#c9a24a" stroke="#0b1a06" strokeWidth="2" /><path d="M4 58 L 14 48 L 18 52 L 8 62 Z" fill="#6b3a1a" stroke="#0b1a06" strokeWidth="2.5" /></svg>
          <span>CUT<span className="m-knife-key"> · K</span></span>
          <span className="sr-only">the acid worm off with the bowie knife</span>
        </button>
      )}
    </>
  );
}

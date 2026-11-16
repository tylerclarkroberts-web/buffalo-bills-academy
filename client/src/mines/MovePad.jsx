import React, { useRef, useState } from 'react';
import { stickTurn } from './controls.js';

/** Phone controls: stick for walking and gentle steering; hold the arrows to turn. */
export default function MovePad({ apply }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef({ x: 0, y: 0 });
  const turn = useRef(0); // -1 / 0 / +1 from the side buttons
  const active = useRef(false);
  const push = () => {
    const { x, y } = stick.current;
    const f = Math.abs(y) < 0.12 ? 0 : -Math.sign(y) * Math.min(1, (Math.abs(y) - 0.12) / 0.88) ** 0.85;
    const t = turn.current || stickTurn(x);
    apply(f, t);
  };
  const move = (e) => {
    if (!active.current) return;
    const r = base.current.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    stick.current = { x, y }; setKnob({ x, y }); push();
  };
  const end = () => { active.current = false; stick.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }); push(); };
  const hold = (dir) => (e) => { e.preventDefault(); turn.current = dir; e.currentTarget.setPointerCapture?.(e.pointerId); push(); };
  const release = () => { turn.current = 0; push(); };
  return (
    <div className="m-pad" data-test="mine-pad">
      <button type="button" className="m-turn" aria-label="Turn left" data-test="mine-turn-l"
        onPointerDown={hold(-1)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release}>◂</button>
      <div className="m-stick" ref={base} onPointerDown={(e) => { active.current = true; base.current.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Walk">
        <div className="m-knob" style={{ transform: `translate(${knob.x * 38}px, ${knob.y * 38}px)` }} />
      </div>
      <button type="button" className="m-turn" aria-label="Turn right" data-test="mine-turn-r"
        onPointerDown={hold(1)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release}>▸</button>
    </div>
  );
}

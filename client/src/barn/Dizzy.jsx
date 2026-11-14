// v75: the "fainted" mark: two swirly eyes and a couple of orbiting stars. Used wherever a fainted bug shows up
// (the barn stall, the seat companion at the tables, the mines landing and the battle screen).
import React from 'react';

const spiral = (cx, cy, r) => {
  let d = `M${cx} ${cy}`;
  for (let i = 1; i <= 22; i++) { const a = i * 0.62, rr = (r * i) / 22; d += ` L${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`; }
  return d;
};

export default function Dizzy({ size = 22, label = 'Fainted', className = '' }) {
  return (
    <svg className={`dizzy ${className}`} width={size} height={size * 0.62} viewBox="0 0 40 25" role="img" aria-label={label} data-test="fainted-mark">
      <title>{label}</title>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d={spiral(11, 14, 8)} />
        <path d={spiral(29, 14, 8)} />
      </g>
      <g className="dizzy-stars" fill="#ffd84a" stroke="#6b4a00" strokeWidth=".6">
        <path d="M4 2 l1.2 2.4 2.6.4-1.9 1.8.5 2.6L4 8 1.6 9.2l.5-2.6L.2 4.8l2.6-.4Z" />
        <path d="M36 1 l1 2 2.2.3-1.6 1.5.4 2.2L36 6l-2 1 .4-2.2L32.8 3.3 35 3Z" />
      </g>
    </svg>
  );
}

// Our own low-poly troll grin (drawn here, not a copied image) and the giant "You're skipped!" blast.
import React, { useEffect, useId } from 'react';

const HEAD = [[30, 62], [62, 26], [110, 14], [160, 30], [186, 70], [181, 120], [160, 160], [120, 186], [80, 181], [45, 156], [24, 110]];
const C = [104, 98];
const FACETS = ['#f6f1e6', '#e6dfcf', '#efe9dc', '#d9d1bf', '#f2ecdf', '#e0d8c6', '#f6f1e6', '#e3dccb', '#ece6d8', '#d6ceba', '#efe8da'];
const TEETH = [58, 72, 86, 100, 114, 128, 142, 156, 168];

/** The face: faceted head, raised brows, side-eye, and a grin that runs ear to ear. */
export function Trollface({ size = 200, className = '', title }) {
  const clip = `troll-grin-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg viewBox="0 0 210 200" width={size} height={size * 200 / 210} className={`troll ${className}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}>
      <defs><clipPath id={clip}><path d="M40 104 Q60 166 115 169 Q166 166 179 99 Q150 128 110 130 Q70 130 40 104Z" /></clipPath></defs>
      <g className="troll-head">
        {HEAD.map((p, i) => { const q = HEAD[(i + 1) % HEAD.length]; return <polygon key={i} points={`${C[0]},${C[1]} ${p[0]},${p[1]} ${q[0]},${q[1]}`} fill={FACETS[i]} stroke={FACETS[i]} strokeWidth=".8" />; })}
        <polygon points={HEAD.map((p) => p.join(',')).join(' ')} fill="none" stroke="#17120d" strokeWidth="5" strokeLinejoin="round" />
        <path d="M80 41 Q106 31 132 41 M86 50 Q106 43 126 50" fill="none" stroke="#17120d" strokeWidth="3" strokeLinecap="round" />
        <path className="troll-brow" d="M50 66 Q72 44 99 61" fill="none" stroke="#17120d" strokeWidth="6" strokeLinecap="round" />
        <path className="troll-brow r" d="M111 58 Q139 38 166 58" fill="none" stroke="#17120d" strokeWidth="6" strokeLinecap="round" />
        <path d="M57 80 Q75 63 97 75 Q78 87 57 80Z" fill="#fff" stroke="#17120d" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M114 73 Q138 57 160 72 Q139 84 114 73Z" fill="#fff" stroke="#17120d" strokeWidth="3.5" strokeLinejoin="round" />
        <g className="troll-eyes"><circle cx="85" cy="76" r="5.5" fill="#17120d" /><circle cx="149" cy="71" r="5.5" fill="#17120d" /></g>
        <path d="M36 96 Q29 108 39 120 M177 90 Q189 100 180 114" fill="none" stroke="#17120d" strokeWidth="3.5" strokeLinecap="round" />
        <g className="troll-grin">
          <path d="M40 104 Q60 166 115 169 Q166 166 179 99 Q150 128 110 130 Q70 130 40 104Z" fill="#fffdf7" />
          <g clipPath={`url(#${clip})`} stroke="#17120d" strokeWidth="2.6">
            {TEETH.map((x) => <line key={x} x1={x} y1="96" x2={x + 3} y2="175" />)}
            <path d="M42 113 Q78 152 112 152 Q152 151 177 111" fill="none" />
          </g>
          <path d="M40 104 Q60 166 115 169 Q166 166 179 99 Q150 128 110 130 Q70 130 40 104Z" fill="none" stroke="#17120d" strokeWidth="5" strokeLinejoin="round" />
        </g>
        <path d="M95 177 Q112 183 129 176" fill="none" stroke="#17120d" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Full-screen "You're skipped!" with the troll. `me` = it's the viewer who got skipped. Tap (or any key) to dismiss;
 * goes on its own after ~2.4 s. Reduced motion: no zoom, spin or shake, just a fade.
 */
export function SkipBlast({ name, by, me, short = false, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, short ? 1700 : 2500);
    const key = () => onDone();
    window.addEventListener('keydown', key);
    return () => { clearTimeout(id); window.removeEventListener('keydown', key); };
  }, [onDone, short]);
  const words = "YOU'RE SKIPPED!".split(' ');
  return (
    <div className={`sc-blast ${me ? 'me' : ''}`} role="alert" aria-live="assertive" data-test="scum-skip" onPointerDown={onDone}>
      <div className="sc-rays" aria-hidden="true" />
      <div className="sc-blast-in">
        <Trollface className="sc-troll" size={320} />
        <h2 className="sc-skip-txt" aria-label={me ? "You're skipped!" : `You're skipped, ${name}!`}>
          {words.map((w, i) => <span key={i} style={{ '--i': i }}>{w}</span>)}
        </h2>
        <p className="sc-skip-sub">{me ? `${by || 'Somebody'} matched it. Sit there and think about it.` : `${name}, that is. Courtesy of ${by || 'a matching card'}.`}</p>
      </div>
    </div>
  );
}

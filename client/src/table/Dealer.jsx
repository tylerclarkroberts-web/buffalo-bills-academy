// The house dealer, Guntrad the Pit Boss: Tyler's low-poly artwork (server/assets/dealer.png, built by
// scripts/make-dealer.py), standing behind the felt. Small idle movements: breathing and a slow nod.
// v23 themes dress him up without ever touching his face (the face is the untouched image, clipped as before):
//   anime  = spiky anime hair (above the brow) and a kimono with an obi;
//   arcade = a tuxedo, plus android parts (metal arm, chest panel, jaw bolts) and the odd robot move.
// All outfit art is in the image's own 414x390 coordinates so it lines up at any size.
import React, { useEffect, useState } from 'react';
import { bankFor } from '../guntrad.js';
import { dailyLine } from '../guntrad-core.js';
import { useActiveTheme, reducedMotion } from '../themes/store.js';
import { robotMove } from '../themes/theme-core.js';

export const DEALER_NAME = 'Guntrad the Pit Boss';
// His tagline is the factoid of the day from client/src/lines/guntrad-lines.json: one line per calendar day.

const VB = '0 0 414 390';

function AnimeHair() {
  // Big glossy spikes from the crown; bangs stop above the brow line (y < 108) and the side locks sit outside the face.
  return (
    <svg className="dl-hair" viewBox={VB} aria-hidden="true">
      <defs>
        <linearGradient id="ah-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2bd0" /><stop offset=".55" stopColor="#1d1a6b" /><stop offset="1" stopColor="#120f3d" /></linearGradient>
      </defs>
      <path fill="url(#ah-g)" stroke="#0b0930" strokeWidth="3" strokeLinejoin="round" d="M128 150 L112 118 L130 112 L104 76 L140 84 L132 34 L170 64 L182 6 L206 52 L236 2 L246 50 L282 18 L278 64 L318 52 L296 92 L326 106 L300 116 L310 150 L292 128 L286 104 L262 96 L268 112 L244 98 L238 110 L218 96 L206 110 L196 96 L178 110 L174 96 L156 106 L146 104 L138 128 Z" />
      <path fill="none" stroke="#8fa0ff" strokeWidth="5" strokeLinecap="round" opacity=".8" d="M168 54 Q190 40 214 44 M240 40 Q258 38 270 48" />
      <path fill="#fff" opacity=".85" d="M186 46 l6 -6 l3 8 z M252 44 l5 -5 l2 7 z" />
    </svg>
  );
}
function Kimono() {
  // Crossed collar, wearer's left over right (the correct way for the living), wide sleeves and an obi.
  return (
    <svg className="dl-outfit kimono" viewBox={VB} aria-hidden="true">
      <path fill="#2b3a8c" d="M0 300 Q40 262 120 246 L176 232 L238 232 L296 246 Q376 262 414 300 L414 390 L0 390 Z" />
      <path fill="#22307a" d="M0 330 Q50 300 98 300 L96 390 L0 390 Z M414 330 Q364 300 316 300 L318 390 L414 390 Z" />
      <g fill="#f3a9c6" opacity=".85">{[[40, 340], [70, 372], [352, 336], [384, 368], [130, 300], [292, 296]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" />)}</g>
      <path fill="#e86a92" d="M184 232 L238 232 L212 292 Z" />
      <path fill="none" stroke="#f4efe6" strokeWidth="15" strokeLinecap="round" d="M180 236 L222 334" />
      <path fill="none" stroke="#f4efe6" strokeWidth="15" strokeLinecap="round" d="M242 236 L192 340" />
      <path fill="none" stroke="#c9c2b6" strokeWidth="2" d="M236 244 L188 342" />
      <path fill="#c22f3a" d="M96 338 L318 338 L318 384 L96 384 Z" />
      <path fill="#e8c766" d="M96 352 L318 352 L318 358 L96 358 Z" />
      <path fill="#a3222c" d="M196 338 L226 338 L232 384 L190 384 Z" />
    </svg>
  );
}
function Tux() {
  return (
    <svg className="dl-outfit tux" viewBox={VB} aria-hidden="true">
      <path fill="#121218" d="M0 296 Q40 260 120 246 L176 236 L200 300 L208 390 L0 390 Z M414 296 Q374 260 294 246 L238 236 L214 300 L206 390 L414 390 Z" />
      <path fill="#26262f" d="M176 236 L148 252 L196 356 L204 300 Z M238 236 L266 252 L218 356 L210 300 Z" />
      <path fill="#f6f4ee" d="M186 240 L228 240 L210 330 L204 330 Z" />
      <g fill="#111"><circle cx="207" cy="290" r="3" /><circle cx="207" cy="310" r="3" /></g>
      <path fill="#0d0d10" d="M170 236 L204 250 L170 266 Z M244 236 L210 250 L244 266 Z" />
      <rect x="199" y="242" width="16" height="16" rx="4" fill="#0d0d10" />
    </svg>
  );
}
function Android() {
  // Part machine: metal right arm with a servo elbow, an open chest panel with LEDs, a neck ring.
  return (
    <svg className="dl-outfit android" viewBox={VB} aria-hidden="true">
      <defs><linearGradient id="an-m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6ecf2" /><stop offset=".5" stopColor="#8e99a6" /><stop offset="1" stopColor="#4b5560" /></linearGradient></defs>
      <path fill="url(#an-m)" stroke="#2c333b" strokeWidth="2" d="M186 226 L230 226 L234 240 L182 240 Z" />
      <g className="an-arm">
        <path fill="url(#an-m)" stroke="#2c333b" strokeWidth="2" d="M300 248 Q360 250 396 282 L414 390 L340 390 L318 300 Z" />
        <path fill="none" stroke="#2c333b" strokeWidth="2" d="M312 268 L380 280 M326 306 L402 318 M334 344 L408 352" />
        <circle cx="352" cy="282" r="15" fill="#38414b" stroke="#c9d2dc" strokeWidth="3" />
        <circle className="an-servo" cx="352" cy="282" r="5" fill="#33e4ff" />
      </g>
      <g className="an-panel">
        <rect x="104" y="252" width="58" height="40" rx="5" fill="#2a3138" stroke="#9aa6b2" strokeWidth="3" />
        <circle className="led a" cx="118" cy="265" r="4" fill="#ff3d5a" />
        <circle className="led b" cx="132" cy="265" r="4" fill="#3dff8a" />
        <circle className="led c" cx="146" cy="265" r="4" fill="#33e4ff" />
        <path fill="none" stroke="#33e4ff" strokeWidth="2" d="M110 281 L122 281 L126 273 L132 287 L136 281 L156 281" />
      </g>
    </svg>
  );
}
function JawBolts() {
  // On the jaw hinges, outside the face outline, so they nod with the head.
  return (
    <svg className="dl-bolts" viewBox={VB} aria-hidden="true">
      {[[134, 186], [296, 186]].map(([x, y]) => (
        <g key={x}><rect x={x - 8} y={y - 16} width="16" height="32" rx="4" fill="#8e99a6" stroke="#2c333b" strokeWidth="2" /><circle cx={x} cy={y - 7} r="3" fill="#2c333b" /><circle cx={x} cy={y + 7} r="3" fill="#2c333b" /></g>
      ))}
    </svg>
  );
}

const ROBOT_SAY = { beep: 'BEEP BOOP', glitch: '01000111', spin: 'RECALIBRATING', servo: 'BZZRT', sparks: '*KZZT*' };
function useRobot(on) {
  const [move, setMove] = useState(null);
  useEffect(() => {
    if (!on) return undefined;
    let n = 0, t1, t2;
    const loop = () => {
      t1 = setTimeout(() => {
        setMove(robotMove(n++, reducedMotion()));
        t2 = setTimeout(() => { setMove(null); loop(); }, 1800);
      }, 12000 + Math.random() * 13000);
    };
    // first one soon, so you notice him
    t1 = setTimeout(() => { setMove(robotMove(n++, reducedMotion())); t2 = setTimeout(() => { setMove(null); loop(); }, 1800); }, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [on]);
  return move;
}

export function Dealer({ still = false }) {
  const theme = useActiveTheme();
  const robot = useRobot(theme === 'arcade' && !still);
  return (
    <div className={`dealer-fig ${still ? 'still' : ''} dl-${theme} ${robot ? `robot-${robot}` : ''}`} aria-label={DEALER_NAME} role="img">
      <div className="dl-glow" aria-hidden="true" />
      <div className="dl-body">
        <img src="/api/dealer.png?v=guntrad" alt="" className="dl-img" draggable="false" />
        {theme === 'anime' && <Kimono />}
        {theme === 'arcade' && <><Tux /><Android /></>}
        <div className="dl-head">
          <div className="dl-face"><img src="/api/dealer.png?v=guntrad" alt="" draggable="false" /></div>
          {theme === 'anime' && <AnimeHair />}
          {theme === 'arcade' && <JawBolts />}
        </div>
        {robot === 'sparks' && <div className="dl-sparks" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ '--i': i }} />)}</div>}
      </div>
      {robot && <div className="dl-robo-say" aria-hidden="true">{ROBOT_SAY[robot]}</div>}
    </div>
  );
}

const PLATE = {
  saloon: ['Guntrad', 'the Pit Boss'],
  jade: ['Guntrad', 'the Pit Boss'],
  anime: ['ガントラッド', '胴元'],
  arcade: ['Guntrad', 'the Pit Bot'],
};
/** His nameplate, sitting on the felt's top rail (outside the dealer's box so the felt never covers it). */
export function DealerPlate({ style }) {
  const theme = useActiveTheme();
  const bank = bankFor(theme);
  const [, tick] = useState(0);
  // Holds all day; only checks (every 5 min) whether midnight has passed.
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 300000); return () => clearInterval(id); }, []);
  const line = dailyLine(bank.lines);
  const [name, tag] = PLATE[theme] || PLATE.saloon;
  return <div className="dl-plate" style={style} lang={theme === 'anime' ? 'ja' : undefined}><b>{name} <i>{tag}</i></b><span key={line}>{line}</span></div>;
}

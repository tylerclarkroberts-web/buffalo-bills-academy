// Identity for Buffalo Bill's Academy: wordmark, copy, Neon Bill, chips, avatars.
// Everything here is original artwork drawn in code.
import React, { useMemo } from 'react';
import { chipPiles } from './util.js';

export const VENUE = { name: "Buffalo Bill's Academy", short: "Buffalo Bill's", place: 'West Wendover, Nevada' };
export const TABLE_NAMES = [
  'The Late Shift', 'Graveyard Game', 'Neon Room', 'High Desert Hold\'em', 'Toana Vista Table', 'Wendover Nights',
  'Back Room', 'Main Street Game', 'Midnight Buffet', 'The Academy Table', 'Pilot Peak Poker', 'Lucky Seven',
];
export const DISCLAIMER = "Buffalo Bill's Academy is a play-money card room for friends. No real money, nothing to buy, nothing to cash out. Not affiliated with any casino, resort or golf course.";
export const TOANA = 'Finish your hand, then play the back nine at Toana Vista.';

// ---------- Neon Bill ----------
// A big friendly neon cowboy waving hello. Each "tube" is drawn three times: a soft glow,
// the colored glass, and a bright core, which is how real neon reads at night.
const C = { red: '#ff4f7b', white: '#fff1dc', yellow: '#ffd23f', blue: '#2ee6d6', amber: '#ffb547' };
function Tube({ d, c, w = 5, className }) {
  return (
    <g className={className}>
      <path d={d} className="nt-glow" stroke={c} strokeWidth={w * 3.2} />
      <path d={d} className="nt-glass" stroke={c} strokeWidth={w} />
      <path d={d} className="nt-core" strokeWidth={w * 0.34} />
    </g>
  );
}
const P = {
  // hat
  crown: 'M152 108 C146 76 156 44 178 40 C190 38 194 52 200 52 C206 52 210 38 222 40 C244 44 254 76 248 108',
  band: 'M151 98 C180 104 220 104 249 98',
  brim: 'M84 94 C104 122 296 122 316 94 C304 116 262 132 200 132 C138 132 96 116 84 94 Z',
  // face
  jaw: 'M154 126 C150 178 170 212 200 214 C230 212 250 178 246 126',
  earL: 'M154 142 C140 138 138 160 152 166', earR: 'M246 142 C260 138 262 160 248 166',
  browL: 'M170 138 Q180 132 190 137', browR: 'M210 137 Q220 132 230 138',
  eyeL: 'M172 152 Q181 145 190 152', eyeR: 'M210 152 Q219 145 228 152',
  nose: 'M200 156 C195 168 196 174 204 174',
  smile: 'M172 184 Q200 206 228 184', smileIn: 'M182 190 Q200 200 218 190',
  cheekL: 'M164 174 q6 -5 12 0', cheekR: 'M224 174 q6 -5 12 0',
  // bandana
  bandana: 'M166 210 L234 210 L200 246 Z', knot: 'M192 212 L200 222 L208 212',
  // shirt
  shirt: 'M146 236 C126 244 122 266 124 300 L132 404 L268 404 L276 300 C278 266 274 244 254 236 L230 228 L200 248 L170 228 Z',
  yoke: 'M128 262 Q164 276 200 258 Q236 276 272 262',
  placket: 'M200 252 L200 402',
  pocketL: 'M150 292 L184 292 L180 308 L167 314 L154 308 Z', pocketR: 'M216 292 L250 292 L246 308 L233 314 L220 308 Z',
  // belt & jeans
  belt: 'M132 406 L268 406 L268 420 L132 420 Z', buckle: 'M186 402 L214 402 L214 424 L186 424 Z',
  jeans: 'M134 422 L146 566 L192 566 L198 448 L202 448 L208 566 L254 566 L266 422',
  seamL: 'M168 446 L170 566', seamR: 'M232 446 L230 566',
  cuffL: 'M146 552 L192 552', cuffR: 'M208 552 L254 552',
  // boots
  bootL: 'M148 568 L146 604 C140 612 116 612 108 622 L192 622 L194 568', heelL: 'M180 622 L180 632 L194 632 L194 622',
  bootR: 'M252 568 L254 604 C260 612 284 612 292 622 L208 622 L206 568', heelR: 'M220 622 L220 632 L206 632 L206 622',
  stitchL: 'M156 584 Q170 594 184 584', stitchR: 'M216 584 Q230 594 244 584',
  // resting arm, hand on the belt
  armL: 'M144 240 C116 262 104 318 112 372 L130 404', armLin: 'M150 290 C140 324 140 356 146 384',
  handL: 'M122 392 C114 404 122 420 138 420 C150 420 154 406 146 396 Z',
  // waving arm: upper arm is fixed, forearm + hand swap between two frames
  upperR: 'M254 238 C288 238 322 232 340 214', upperRin: 'M262 266 C298 262 338 254 356 232',
  foreR: 'M 340 214 C 342 192 344 170 346 150 M 356 232 C 362 206 366 178 368 150',
  cuffRarm: 'M 343 156 L 369 156',
  handR: 'M 344 148 C 334 130 334 104 344 90 C 350 82 360 84 360 94 C 364 80 378 82 378 96 C 384 88 396 94 392 108 C 390 122 384 136 370 148 Z',
  thumbR: 'M 372 132 C 382 122 394 116 402 122 C 406 132 390 144 372 150',
  fingersR: 'M 352 96 L 354 122 M 366 96 L 366 122 M 379 100 L 377 124',
};
const STARS = [[40, 60], [80, 160], [356, 54], [372, 210], [30, 300], [60, 470], [356, 400], [380, 520], [110, 40], [300, 20]];

export function NeonBill({ className = '', label = 'Neon Bill, a giant neon cowboy waving hello' }) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 7), []);
  return (
    <svg className={`neonbill ${className}`} viewBox="0 0 420 660" role="img" aria-label={label}>
      <defs>
        <filter id={`glow-${uid}`} filterUnits="userSpaceOnUse" x="-60" y="-60" width="540" height="780"><feGaussianBlur stdDeviation="7" /></filter>
        <radialGradient id={`pool-${uid}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ff8a3d" stopOpacity=".38" /><stop offset="1" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="200" cy="640" rx="190" ry="22" fill={`url(#pool-${uid})`} />
      <g className="nb-sparkle" aria-hidden="true">{STARS.map(([x, y], i) => <path key={i} d={`M${x} ${y - 6} L${x} ${y + 6} M${x - 6} ${y} L${x + 6} ${y}`} style={{ animationDelay: `${(i * 0.37) % 2.6}s` }} />)}</g>
      <g className="nb-tubes" style={{ '--glow': `url(#glow-${uid})` }}>
        <g className="nb-part p1">
          <Tube d={P.brim} c={C.white} w={5.5} />
          <Tube d={P.crown} c={C.white} w={5.5} />
          <Tube d={P.band} c={C.red} w={4.5} className="nb-flicker" />
        </g>
        <g className="nb-part p2">
          <Tube d={P.jaw} c={C.amber} w={5} />
          <Tube d={P.earL} c={C.amber} w={4} /><Tube d={P.earR} c={C.amber} w={4} />
          <Tube d={P.browL} c={C.white} w={3.5} /><Tube d={P.browR} c={C.white} w={3.5} />
          <g className="nb-blink"><Tube d={P.eyeL} c={C.white} w={4} /><Tube d={P.eyeR} c={C.white} w={4} /></g>
          <Tube d={P.nose} c={C.amber} w={3.5} />
          <Tube d={P.smile} c={C.red} w={5} /><Tube d={P.smileIn} c={C.white} w={3} />
          <Tube d={P.cheekL} c={C.red} w={3} /><Tube d={P.cheekR} c={C.red} w={3} />
        </g>
        <g className="nb-part p3">
          <Tube d={P.bandana} c={C.red} w={5} /><Tube d={P.knot} c={C.red} w={3.5} />
          <Tube d={P.shirt} c={C.yellow} w={5.5} />
          <Tube d={P.yoke} c={C.blue} w={4} />
          <Tube d={P.placket} c={C.blue} w={3} />
          <Tube d={P.pocketL} c={C.blue} w={3.5} /><Tube d={P.pocketR} c={C.blue} w={3.5} />
          {[276, 312, 348, 384].map((y) => <Tube key={y} d={`M200 ${y} l0 .1`} c={C.white} w={7} />)}
          <Tube d={P.armL} c={C.yellow} w={5.5} /><Tube d={P.armLin} c={C.yellow} w={4} />
          <Tube d={P.handL} c={C.white} w={4.5} />
        </g>
        <g className="nb-part p4">
          <Tube d={P.belt} c={C.amber} w={4.5} /><Tube d={P.buckle} c={C.white} w={4} />
          <Tube d={P.jeans} c={C.blue} w={5.5} />
          <Tube d={P.seamL} c={C.blue} w={2.5} /><Tube d={P.seamR} c={C.blue} w={2.5} />
          <Tube d={P.cuffL} c={C.blue} w={3.5} /><Tube d={P.cuffR} c={C.blue} w={3.5} />
          <Tube d={P.bootL} c={C.red} w={5.5} /><Tube d={P.bootR} c={C.red} w={5.5} />
          <Tube d={P.heelL} c={C.red} w={4} /><Tube d={P.heelR} c={C.red} w={4} />
          <Tube d={P.stitchL} c={C.amber} w={3} /><Tube d={P.stitchR} c={C.amber} w={3} />
        </g>
        <g className="nb-part p5">
          <Tube d={P.upperR} c={C.yellow} w={5.5} /><Tube d={P.upperRin} c={C.yellow} w={4} />
          {/* two neon frames, switched like a real animated sign */}
          <g className="nb-wave a" transform="rotate(-4 348 232)"><Tube d={P.foreR} c={C.yellow} w={5} /><Tube d={P.cuffRarm} c={C.blue} w={4} /><Tube d={P.handR} c={C.white} w={4.5} /><Tube d={P.thumbR} c={C.white} w={4.5} /><Tube d={P.fingersR} c={C.white} w={2.5} /></g>
          <g className="nb-wave b" transform="rotate(20 348 232)"><Tube d={P.foreR} c={C.yellow} w={5} /><Tube d={P.cuffRarm} c={C.blue} w={4} /><Tube d={P.handR} c={C.white} w={4.5} /><Tube d={P.thumbR} c={C.white} w={4.5} /><Tube d={P.fingersR} c={C.white} w={2.5} /></g>
        </g>
      </g>
    </svg>
  );
}

/** The lobby sign: a bulb-lit marquee with Neon Bill waving from the left. */
export function Marquee({ aside = null }) {
  const bulbs = Array.from({ length: 28 }, (_, i) => <i key={i} />);
  return (
    <header className="marquee5">
      <div className="mq-bill" aria-hidden="true"><NeonBill /></div>
      <div className="mq-sign">
        <div className="mq-bulbs">{bulbs}</div>
        <div className="mq-body">
          <span className="mq-welcome script">Welcome to</span>
          <h1 className="mq-title" aria-label={VENUE.name}><span>{VENUE.short}</span> <span>Academy</span></h1>
          <span className="mq-sub"><span className="hide-s">Saloon &amp; Card Room · </span>Texas Hold'em, one move at a time</span>
        </div>
        <div className="mq-bulbs">{bulbs}</div>
      </div>
      {aside}
    </header>
  );
}

// ---------- small marks ----------
export function Mark({ size = 28 }) {
  // Monogram: a "B" set inside a five-point star outline.
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="mark">
      <path d="M20 2 L24.5 14.5 L38 15 L27.5 23.5 L31 37 L20 29.5 L9 37 L12.5 23.5 L2 15 L15.5 14.5 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <text x="20" y="25.5" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="12" fill="currentColor">B</text>
    </svg>
  );
}

const AV = ['#ff3b30', '#ffb020', '#f2ede4', '#5b8cff', '#c9a27a', '#9be7c4', '#ff8fa3', '#b9a7ff'];
export function Avatar({ id = '', name = '', picture, size = 32 }) {
  let h = 0; for (const ch of String(id || name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (picture) return <img className="avatar" src={picture} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size }} />;
  return <span className="avatar" style={{ width: size, height: size, '--av': AV[h % AV.length], fontSize: size * 0.4 }} aria-hidden="true">{initials}</span>;
}

/**
 * Piles of chips for an amount. heap: two rows, one in front of the other, for a player's whole stack: 'side' has
 * full piles (the band along the rim is wide at the sides), 'end' short ones (it is thin at the top and bottom).
 */
export function ChipStack({ amount, heap }) {
  const piles = chipPiles(amount, heap === 'end' ? 5 : 10);
  const row = (list, cls) => <span className={cls} aria-hidden="true">{list.map(([c, n], i) => <span key={i} className="chip-pile">{Array.from({ length: n }, (_, j) => <span key={j} className="chip" style={{ '--c': c }} />)}</span>)}</span>;
  if (!heap) return row(piles, 'chipstack');
  const front = Math.floor(piles.length / 2); // small change in front, big chips behind
  return <span className={`chipstack heap ${heap}`} aria-hidden="true">{row(piles.slice(front), 'chip-row')}{row(piles.slice(0, front), 'chip-row front')}</span>;
}

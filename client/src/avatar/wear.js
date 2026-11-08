// v34: General Store items drawn on the busts. Purely cosmetic SVG overlays.
// Head items use the head's own viewBox (-4 -12 68 84; face centre 30,36, crown of the head about y 12, so they bob
// with the head); body items use the body's viewBox (0 0 100 110; neck 42–58, collar at 50,82, shoulders from y 76).
import React from 'react';

const S = (c, k = -0.3) => {
  const n = parseInt(c.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const e = React.createElement;

// ---------- hats (head coords) ----------
const HAT = {
  cowboy: (c, c2) => [e('path', { d: 'M-2 16 Q30 24 62 16 Q58 22 30 23 Q2 22 -2 16Z', fill: S(c, -0.2) }), e('path', { d: 'M12 17 Q12 2 22 0 Q30 4 38 0 Q48 2 48 17 Q30 21 12 17Z', fill: c }), e('path', { d: 'M12 14 Q30 18 48 14 L48 17 Q30 21 12 17Z', fill: c2 })],
  tengallon: (c, c2) => [e('path', { d: 'M-6 16 Q30 26 66 16 Q62 23 30 24 Q-2 23 -6 16Z', fill: S(c, -0.2) }), e('path', { d: 'M11 17 Q9 -6 22 -8 Q30 -3 38 -8 Q51 -6 49 17 Q30 21 11 17Z', fill: c }), e('path', { d: 'M11 13 Q30 17 49 13 L49 17 Q30 21 11 17Z', fill: c2 })],
  tophat: (c, c2) => [e('ellipse', { cx: 30, cy: 15, rx: 24, ry: 4, fill: S(c, -0.2) }), e('rect', { x: 15, y: -10, width: 30, height: 26, rx: 2, fill: c }), e('rect', { x: 15, y: 8, width: 30, height: 5, fill: c2 })],
  bowler: (c, c2) => [e('ellipse', { cx: 30, cy: 15, rx: 22, ry: 3.5, fill: S(c, -0.2) }), e('path', { d: 'M12 15 Q12 -2 30 -2 Q48 -2 48 15Z', fill: c }), e('rect', { x: 12, y: 11, width: 36, height: 3, fill: c2 })],
  beanie: (c, c2) => [e('path', { d: 'M9 18 Q9 -2 30 -2 Q51 -2 51 18Z', fill: c }), e('rect', { x: 8, y: 13, width: 44, height: 6, rx: 2, fill: c2 }), e('circle', { cx: 30, cy: -3, r: 4, fill: c2 })],
  crown: (c, c2) => [e('path', { d: 'M12 16 L12 0 L19 8 L25 -4 L30 6 L35 -4 L41 8 L48 0 L48 16Z', fill: c, stroke: S(c, -0.35), strokeWidth: 0.8 }), e('circle', { cx: 30, cy: 11, r: 2.4, fill: c2 }), e('circle', { cx: 19, cy: 12, r: 1.6, fill: c2 }), e('circle', { cx: 41, cy: 12, r: 1.6, fill: c2 })],
  umbrella: (c, c2) => [e('path', { d: 'M-4 8 Q30 -22 64 8Z', fill: c }), e('path', { d: 'M13 6 Q22 -14 30 -9 L30 6Z M47 6 Q38 -14 30 -9 L30 6Z', fill: c2, opacity: 0.9 }), e('rect', { x: 29, y: 6, width: 2, height: 9, fill: '#444' }), e('path', { d: 'M12 16 Q30 10 48 16', stroke: '#444', strokeWidth: 2, fill: 'none' })],
  propeller: (c, c2) => [e('path', { d: 'M10 17 Q10 0 30 0 Q50 0 50 17Z', fill: c }), e('path', { d: 'M10 17 Q10 0 30 0 L30 17Z', fill: c2, opacity: 0.6 }), e('rect', { x: 29, y: -6, width: 2, height: 6, fill: '#333' }), e('g', { className: 'w-spin', style: { transformOrigin: '30px -6px' } }, e('ellipse', { cx: 30, cy: -6, rx: 13, ry: 2, fill: '#e03030' }))],
  sombrero: (c, c2) => [e('ellipse', { cx: 30, cy: 15, rx: 36, ry: 6, fill: c }), e('path', { d: 'M17 15 Q18 -6 30 -7 Q42 -6 43 15Z', fill: S(c, -0.08) }), e('rect', { x: 17.5, y: 9, width: 25, height: 3, fill: c2 })],
  chef: (c) => [e('rect', { x: 14, y: 6, width: 32, height: 11, fill: c, stroke: '#ccc', strokeWidth: 0.6 }), e('circle', { cx: 18, cy: 0, r: 8, fill: c }), e('circle', { cx: 30, cy: -4, r: 10, fill: c }), e('circle', { cx: 42, cy: 0, r: 8, fill: c })],
  tricorn: (c, c2) => [e('path', { d: 'M2 14 Q30 -14 58 14 Q30 6 2 14Z', fill: c }), e('path', { d: 'M2 14 Q30 6 58 14', stroke: c2, strokeWidth: 1.5, fill: 'none' }), e('text', { x: 30, y: 6, fontSize: 9, textAnchor: 'middle', fill: c2 }, '☠')],
  fez: (c, c2) => [e('path', { d: 'M17 16 L20 -2 L40 -2 L43 16Z', fill: c }), e('path', { d: 'M30 -2 Q38 0 37 10', stroke: c2, strokeWidth: 1.2, fill: 'none' }), e('circle', { cx: 37, cy: 11, r: 1.8, fill: c2 })],
  viking: (c, c2) => [e('path', { d: 'M10 16 Q10 -2 30 -2 Q50 -2 50 16Z', fill: c }), e('path', { d: 'M10 10 Q-2 6 -2 -8 Q4 2 12 4Z M50 10 Q62 6 62 -8 Q56 2 48 4Z', fill: c2 }), e('rect', { x: 9, y: 12, width: 42, height: 4, fill: S(c, -0.3) })],
  party: (c, c2) => [e('path', { d: 'M18 16 L30 -14 L42 16Z', fill: c }), e('path', { d: 'M22 6 L38 6 M25 -2 L35 -2', stroke: c2, strokeWidth: 2.5 }), e('circle', { cx: 30, cy: -14, r: 3, fill: c2 })],
  halo: (c, c2) => [e('ellipse', { cx: 30, cy: -2, rx: 18, ry: 4.5, fill: 'none', stroke: c, strokeWidth: 3 }), e('ellipse', { cx: 30, cy: -2, rx: 18, ry: 4.5, fill: 'none', stroke: c2, strokeWidth: 1, opacity: 0.8 })],
  antlers: (c, c2) => [e('path', { d: 'M18 12 L12 -6 M14 0 L6 -4 M13 -3 L16 -10 M42 12 L48 -6 M46 0 L54 -4 M47 -3 L44 -10', stroke: c, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }), e('circle', { cx: 18, cy: 12, r: 2.5, fill: c2 }), e('circle', { cx: 42, cy: 12, r: 2.5, fill: c2 })],
  bucket: (c, c2) => [e('path', { d: 'M4 18 L14 10 L46 10 L56 18 Q30 22 4 18Z', fill: S(c, -0.15) }), e('path', { d: 'M14 11 Q14 -2 30 -2 Q46 -2 46 11Z', fill: c }), e('rect', { x: 14, y: 8, width: 32, height: 2.5, fill: c2 })],
  wizard: (c, c2) => [e('ellipse', { cx: 30, cy: 15, rx: 25, ry: 4, fill: c }), e('path', { d: 'M14 15 L34 -20 L46 15Z', fill: c }), e('text', { x: 31, y: 6, fontSize: 8, textAnchor: 'middle', fill: c2 }, '★'), e('text', { x: 36, y: -6, fontSize: 5, textAnchor: 'middle', fill: c2 }, '✦')],
  crownflowers: (c, c2) => [e('path', { d: 'M8 14 Q30 4 52 14', stroke: c2, strokeWidth: 2.5, fill: 'none' }), ...[10, 18, 26, 34, 42, 50].map((x, i) => e('circle', { key: i, cx: x, cy: 13 - Math.sin((x - 8) / 44 * Math.PI) * 5, r: 3.2, fill: i % 2 ? '#fff' : c }))],
  hardhat: (c, c2) => [e('ellipse', { cx: 30, cy: 16, rx: 24, ry: 3.5, fill: S(c, -0.15) }), e('path', { d: 'M10 16 Q10 -3 30 -3 Q50 -3 50 16Z', fill: c }), e('rect', { x: 25, y: 2, width: 10, height: 8, rx: 2, fill: c2, stroke: '#888', strokeWidth: 0.6 })],
};
// ---------- eyes ----------
const L = 23, R = 37, Y = 36;
const pair = (f) => [f(L), f(R)];
const EYES = {
  round: (c, c2) => [...pair((x) => e('circle', { cx: x, cy: Y, r: 5, fill: c2, fillOpacity: 0.35, stroke: c, strokeWidth: 1.4 })), e('path', { d: `M${L + 5} ${Y} L${R - 5} ${Y}`, stroke: c, strokeWidth: 1.2 })],
  aviator: (c, c2) => [...pair((x) => e('path', { d: `M${x - 6} ${Y - 3} L${x + 6} ${Y - 3} Q${x + 6} ${Y + 6} ${x} ${Y + 6} Q${x - 6} ${Y + 6} ${x - 6} ${Y - 3}Z`, fill: c2, stroke: c, strokeWidth: 1 })), e('path', { d: `M${L + 6} ${Y - 3} L${R - 6} ${Y - 3}`, stroke: c, strokeWidth: 1.2 })],
  star: (c, c2) => pair((x) => e('text', { x, y: Y + 5, fontSize: 15, textAnchor: 'middle', fill: c, stroke: c2, strokeWidth: 0.6 }, '★')),
  heart: (c, c2) => pair((x) => e('text', { x, y: Y + 5, fontSize: 14, textAnchor: 'middle', fill: c, stroke: c2, strokeWidth: 0.6 }, '♥')),
  patchl: (c) => [e('path', { d: `M8 22 L52 30`, stroke: c, strokeWidth: 1.2 }), e('ellipse', { cx: L, cy: Y, rx: 5.5, ry: 5, fill: c })],
  patchr: (c) => [e('path', { d: `M8 30 L52 22`, stroke: c, strokeWidth: 1.2 }), e('ellipse', { cx: R, cy: Y, rx: 5.5, ry: 5, fill: c })],
  monocle: (c, c2) => [e('circle', { cx: R, cy: Y, r: 5.5, fill: c2, fillOpacity: 0.3, stroke: c, strokeWidth: 1.5 }), e('path', { d: `M${R + 4} ${Y + 4} Q${R + 8} ${Y + 14} ${R + 3} ${Y + 22}`, stroke: c, strokeWidth: 0.7, fill: 'none' })],
  '3d': (c, c2) => [e('rect', { x: L - 6, y: Y - 4, width: R - L + 12, height: 9, rx: 1, fill: c }), e('rect', { x: L - 4.5, y: Y - 2.5, width: 9, height: 6, fill: c2, opacity: 0.8 }), e('rect', { x: R - 4.5, y: Y - 2.5, width: 9, height: 6, fill: '#3070e0', opacity: 0.8 })],
  goggles: (c, c2) => [e('rect', { x: 6, y: Y - 2, width: 48, height: 4, fill: c }), ...pair((x) => e('circle', { cx: x, cy: Y, r: 6, fill: c2, stroke: c, strokeWidth: 2.2 }))],
  shades: (c, c2) => [e('rect', { x: L - 7, y: Y - 4.5, width: R - L + 14, height: 9, rx: 2, fill: c }), ...[0, 1, 2, 3].map((i) => e('rect', { key: i, x: L - 6, y: Y - 3 + i * 2, width: R - L + 12, height: 0.9, fill: c2 }))],
  nerd: (c, c2) => [...pair((x) => e('rect', { x: x - 5.5, y: Y - 4, width: 11, height: 8, rx: 1.5, fill: 'none', stroke: c, strokeWidth: 2 })), e('rect', { x: 28, y: Y - 2.5, width: 4, height: 4, fill: c2 })],
  visor: (c, c2) => [e('path', { d: `M4 ${Y - 10} Q30 ${Y - 18} 56 ${Y - 10} L60 ${Y - 4} Q30 ${Y - 12} 0 ${Y - 4}Z`, fill: c2, fillOpacity: 0.7, stroke: c, strokeWidth: 1 })],
};
// ---------- face ----------
const FACE = {
  handlebar: (c) => [e('path', { d: 'M30 47 Q22 44 18 47 Q14 49 13 44 Q17 49 22 46 Q27 44 30 46 Q33 44 38 46 Q43 49 47 44 Q46 49 42 47 Q38 44 30 47Z', fill: c })],
  walrus: (c) => [e('path', { d: 'M18 46 Q30 40 42 46 L41 51 Q30 47 19 51Z', fill: c })],
  pencil: (c) => [e('path', { d: 'M23 46.5 Q30 45 37 46.5', stroke: c, strokeWidth: 1, fill: 'none' })],
  bandana: (c) => [e('path', { d: 'M8 40 Q30 46 52 40 L50 54 Q30 66 10 54Z', fill: c }), e('path', { d: 'M14 46 Q30 52 46 46', stroke: S(c, 0.4), strokeWidth: 0.7, fill: 'none', strokeDasharray: '1.5 2' })],
  clown: (c) => [e('circle', { cx: 30, cy: 42, r: 4.5, fill: c }), e('circle', { cx: 28.5, cy: 40.5, r: 1.2, fill: '#fff', opacity: 0.7 })],
  beardfake: (c) => [e('path', { d: 'M10 40 Q12 64 30 68 Q48 64 50 40 Q44 50 30 51 Q16 50 10 40Z', fill: c }), e('path', { d: 'M10 40 L6 32 M50 40 L54 32', stroke: '#eee', strokeWidth: 0.6 })],
  blush: (c) => [e('ellipse', { cx: 18, cy: 43, rx: 4, ry: 2.4, fill: c, opacity: 0.55 }), e('ellipse', { cx: 42, cy: 43, rx: 4, ry: 2.4, fill: c, opacity: 0.55 })],
  pipe: (c) => [e('path', { d: 'M34 50 L46 54', stroke: '#5a3a1a', strokeWidth: 1.6 }), e('rect', { x: 44, y: 46, width: 6, height: 9, rx: 1.5, fill: c })],
};
// ---------- body (body coords) ----------
const NECK = {
  bowtie: (c) => [e('path', { d: 'M50 80 L41 75 L41 85Z M50 80 L59 75 L59 85Z', fill: c }), e('circle', { cx: 50, cy: 80, r: 2, fill: S(c, -0.3) })],
  bolo: (c) => [e('path', { d: 'M46 76 L49 96 M54 76 L51 96', stroke: '#2a1a10', strokeWidth: 1 }), e('circle', { cx: 50, cy: 84, r: 3.2, fill: '#30b0a0', stroke: c, strokeWidth: 1.2 })],
  scarf: (c) => [e('path', { d: 'M38 76 Q50 84 62 76 L62 81 Q50 89 38 81Z', fill: c }), e('rect', { x: 54, y: 80, width: 6, height: 18, fill: S(c, -0.15) })],
  bandneck: (c) => [e('path', { d: 'M39 76 Q50 82 61 76 L50 92Z', fill: c })],
  pearls: (c) => [...Array.from({ length: 9 }, (_, i) => e('circle', { key: i, cx: 40 + i * 2.5, cy: 79 + Math.sin((i / 8) * Math.PI) * 6, r: 1.4, fill: c, stroke: '#bbb', strokeWidth: 0.3 }))],
  medal: (c) => [e('path', { d: 'M44 76 L50 90 L56 76', stroke: '#c03040', strokeWidth: 2.4, fill: 'none' }), e('circle', { cx: 50, cy: 92, r: 4, fill: c })],
  chain: (c) => [e('path', { d: 'M40 77 Q50 94 60 77', stroke: c, strokeWidth: 2, fill: 'none', strokeDasharray: '2 1' }), e('rect', { x: 47.5, y: 85, width: 5, height: 6, fill: c })],
  lei: (c) => [...Array.from({ length: 8 }, (_, i) => e('circle', { key: i, cx: 38 + i * 3.4, cy: 79 + Math.sin((i / 7) * Math.PI) * 7, r: 2.4, fill: i % 2 ? '#fff4a0' : c }))],
  cravat: (c) => [e('path', { d: 'M44 76 L56 76 L53 82 L55 94 L50 98 L45 94 L47 82Z', fill: c })],
};
const BODY = {
  vest: (c, c2) => [e('path', { d: 'M24 110 L30 82 L44 80 L50 106 L56 80 L70 82 L76 110Z', fill: c }), e('circle', { cx: 47, cy: 92, r: 1, fill: c2 }), e('circle', { cx: 53, cy: 92, r: 1, fill: c2 })],
  suspenders: (c) => [e('path', { d: 'M36 80 L40 110 M64 80 L60 110', stroke: c, strokeWidth: 3 })],
  poncho: (c, c2) => [e('path', { d: 'M8 110 L22 84 Q50 74 78 84 L92 110Z', fill: c }), e('path', { d: 'M14 100 L86 100 M19 92 L81 92', stroke: c2, strokeWidth: 2.5 })],
  sheriff: (c) => [e('text', { x: 34, y: 98, fontSize: 13, textAnchor: 'middle', fill: c, stroke: '#6a4a10', strokeWidth: 0.5 }, '★')],
  tux: (c, c2) => [e('path', { d: 'M18 110 L28 82 L44 78 L50 110Z M82 110 L72 82 L56 78 L50 110Z', fill: c }), e('path', { d: 'M44 78 L50 110 L56 78Z', fill: c2 }), e('path', { d: 'M50 80 L45 77 L45 83Z M50 80 L55 77 L55 83Z', fill: '#111' })],
  hawaiian: (c, c2) => [e('path', { d: 'M8 110 L16 88 L30 79 L50 84 L70 79 L84 88 L92 110Z', fill: c }), ...[[26, 96], [70, 94], [40, 104], [60, 102], [18, 104]].map(([x, y], i) => e('text', { key: i, x, y, fontSize: 8, fill: c2, textAnchor: 'middle' }, '✿'))],
  plaid: (c, c2) => [e('path', { d: 'M8 110 L16 88 L30 79 L50 84 L70 79 L84 88 L92 110Z', fill: c }), e('path', { d: 'M20 84 V110 M34 80 V110 M66 80 V110 M80 84 V110 M10 96 H90 M8 104 H92', stroke: c2, strokeWidth: 1.4, opacity: 0.6 })],
  duster: (c, c2) => [e('path', { d: 'M4 110 L14 86 L30 78 L44 80 L46 110Z M96 110 L86 86 L70 78 L56 80 L54 110Z', fill: c }), e('path', { d: 'M30 78 L40 90 L44 80 M70 78 L60 90 L56 80', fill: c2 })],
  armor: (c, c2) => [e('path', { d: 'M10 110 L18 86 L32 79 L50 82 L68 79 L82 86 L90 110Z', fill: c, stroke: c2, strokeWidth: 1 }), e('path', { d: 'M50 82 V110 M24 96 Q50 90 76 96', stroke: c2, strokeWidth: 1 }), ...[[22, 90], [78, 90]].map(([x, y], i) => e('circle', { key: i, cx: x, cy: y, r: 1.2, fill: c2 }))],
  cape: (c, c2) => [e('path', { d: 'M2 110 Q8 80 30 78 L36 80 Q30 96 24 110Z M98 110 Q92 80 70 78 L64 80 Q70 96 76 110Z', fill: c }), e('path', { d: 'M30 78 Q50 86 70 78', stroke: c2, strokeWidth: 2.5, fill: 'none' })],
  sequin: (c, c2) => [e('path', { d: 'M8 110 L16 88 L30 79 L44 80 L48 110Z M92 110 L84 88 L70 79 L56 80 L52 110Z', fill: c }), ...Array.from({ length: 22 }, (_, i) => e('circle', { key: i, cx: (i < 11 ? 16 : 56) + (i % 11) * 2.8 + ((i * 7) % 3), cy: 88 + ((i * 13) % 20), r: 0.9, fill: i % 3 ? c2 : '#fff' }))],
};
const ACC = {
  parrot: (c) => [e('ellipse', { cx: 82, cy: 76, rx: 6, ry: 9, fill: c }), e('circle', { cx: 83, cy: 67, r: 4.5, fill: '#e03030' }), e('path', { d: 'M86 66 L91 68 L86 70Z', fill: '#f0c020' }), e('circle', { cx: 84, cy: 66, r: 0.9, fill: '#111' }), e('path', { d: 'M80 84 L78 96 L84 86Z', fill: '#2060d0' })],
  flower: (c) => [e('circle', { cx: 32, cy: 90, r: 4, fill: c }), e('circle', { cx: 32, cy: 90, r: 1.5, fill: '#ffe060' })],
  badge: (c) => [e('circle', { cx: 66, cy: 92, r: 5.5, fill: '#fff', stroke: c, strokeWidth: 1 }), e('text', { x: 66, y: 94.5, fontSize: 6.5, textAnchor: 'middle', fill: c }, '♥')],
  feather: (c) => [e('path', { d: 'M74 86 Q90 70 86 52 Q80 70 74 86Z', fill: c }), e('path', { d: 'M74 86 Q83 70 86 52', stroke: '#fff', strokeWidth: 0.5, fill: 'none' })],
  cigar: (c) => [e('rect', { x: 60, y: 70, width: 16, height: 3.4, rx: 1.4, fill: c, transform: 'rotate(12 60 70)' }), e('rect', { x: 73, y: 72, width: 3, height: 3.4, fill: '#f0a020', transform: 'rotate(12 60 70)' })],
  bee: (c) => [e('g', { className: 'w-buzz' }, e('ellipse', { cx: 86, cy: 60, rx: 5, ry: 3.6, fill: c }), e('path', { d: 'M84 57 V63 M87 57 V63', stroke: '#111', strokeWidth: 1.2 }), e('ellipse', { cx: 85, cy: 55, rx: 3, ry: 2, fill: '#dff', opacity: 0.8 }))],
  star: (c) => [e('text', { x: 66, y: 96, fontSize: 9, textAnchor: 'middle', fill: c }, '★')],
  balloon: (c) => [e('path', { d: 'M88 110 Q84 80 90 46', stroke: '#777', strokeWidth: 0.6, fill: 'none' }), e('ellipse', { cx: 90, cy: 36, rx: 8, ry: 10, fill: c }), e('ellipse', { cx: 87, cy: 32, rx: 2, ry: 3, fill: '#fff', opacity: 0.5 })],
};
// ---------- shirt skins: a colour for the shoulders, plus an optional pattern ----------
export function shirtOf(wear, fallback) { return wear?.skin?.c || fallback; }
const SKIN = {
  stripes: (c) => [e('path', { d: 'M20 84 V110 M30 80 V110 M40 78 V110 M50 84 V110 M60 78 V110 M70 80 V110 M80 84 V110', stroke: '#fff', strokeWidth: 2.4, opacity: 0.85 })],
  checks: () => [e('path', { d: 'M16 88 H84 M10 98 H90 M8 106 H92 M24 82 V110 M38 78 V110 M50 84 V110 M62 78 V110 M76 82 V110', stroke: '#fff', strokeWidth: 3, opacity: 0.55 })],
  stars: () => [[24, 94], [40, 102], [62, 98], [76, 104], [50, 92]].map(([x, y], i) => e('text', { key: i, x, y, fontSize: 7, fill: '#fff', textAnchor: 'middle' }, '★')),
  gold: () => [e('path', { d: 'M18 90 L30 84 M66 86 L80 94 M36 100 L44 96', stroke: '#fff8d0', strokeWidth: 1.6, opacity: 0.8 })],
  rainbow: () => ['#e04040', '#f0a020', '#f0e020', '#40c040', '#4080f0', '#9040d0'].map((k, i) => e('rect', { key: i, x: 0, y: 84 + i * 4.4, width: 100, height: 4.4, fill: k, opacity: 0.85, clipPath: 'url(#w-shoulder)' })),
  camo: () => [[24, 94, 7], [44, 102, 6], [64, 92, 8], [78, 104, 6], [34, 86, 4]].map(([x, y, r], i) => e('ellipse', { key: i, cx: x, cy: y, rx: r, ry: r * 0.6, fill: i % 2 ? '#8a7048' : '#d8c090', opacity: 0.8 })),
  neon: () => [e('path', { d: 'M10 108 L18 88 L30 80 L50 84 L70 80 L82 88 L90 108', stroke: '#fff', strokeWidth: 1.5, fill: 'none', opacity: 0.9 })],
};
const SHOULDER = 'M6 110 L16 88 L30 79 L42 76 L50 82 L58 76 L70 79 L84 88 L94 110Z';

const draw = (tab, it) => { const f = it && tab[it.shape]; return f ? f(it.c || '#888', it.c2 || '#fff') : null; };

// ---------- fit ----------
// v36: where each slot's art is anchored (its "centre" for nudging and sizing), in its own coordinates.
const ANCHOR = { hat: [30, 17], eyes: [30, 36], face: [30, 47], neck: [50, 82], body: [50, 95] };
const ACC_ANCHOR = { parrot: [82, 78], flower: [32, 90], badge: [66, 92], feather: [80, 70], cigar: [68, 72], bee: [86, 60], star: [66, 93], balloon: [90, 50] };
// Photo avatars (the low-poly selfie, 240x300 with the face filling the maker's oval) have a bigger face, set higher,
// than the generated heads the art was drawn on: crown near y -11, eye line near y 24, face about 1.35x wider.
// So head items get a default re-fit on photos: [scale, where the anchor lands].
export const PHOTO_FIT = { hat: [1.42, [30, 1]], eyes: [1.5, [30, 24]], face: [1.35, [30, 39.5]] };
export const anchorOf = (slot, it) => (slot === 'acc' ? ACC_ANCHOR[it?.shape] || [70, 85] : ANCHOR[slot] || [50, 90]);
/** The transform for one worn item: the photo default (head items), then the player's own nudge and size. */
export function fitTransform(slot, it, photo) {
  let [ax, ay] = anchorOf(slot, it);
  const out = [];
  const d = photo && PHOTO_FIT[slot];
  if (d) { out.push(`translate(${d[1][0]} ${d[1][1]}) scale(${d[0]}) translate(${-ax} ${-ay})`); [ax, ay] = d[1]; }
  const f = it?.fit;
  if (f && (f.x || f.y || (f.s && f.s !== 1))) out.unshift(`translate(${ax + (f.x || 0)} ${ay + (f.y || 0)}) scale(${f.s || 1}) translate(${-ax} ${-ay})`);
  return out.length ? out.join(' ') : undefined;
}
const G = (slot, tab, it, photo) => e('g', { transform: fitTransform(slot, it, photo), 'data-slot': slot }, draw(tab, it));

/** Items on the head (rendered inside the head's svg/div so they move with it). photo: the head is a photo avatar. */
export function HeadWear({ wear, photo = false }) {
  if (!wear || !(wear.hat || wear.eyes || wear.face)) return null;
  return e('svg', { viewBox: '-4 -12 68 84', className: 'b-wear b-wear-head', 'aria-hidden': 'true', 'data-test': 'wear-head', overflow: 'visible' },
    G('face', FACE, wear.face, photo), G('eyes', EYES, wear.eyes, photo), G('hat', HAT, wear.hat, photo));
}
/** Items on the shoulders (inside the body svg, viewBox 0 0 100 110). */
export function BodyWear({ wear }) {
  if (!wear || !(wear.neck || wear.body || wear.skin || wear.acc)) return null;
  return e('g', { className: 'b-wear-body', 'data-test': 'wear-body' },
    e('defs', null, e('clipPath', { id: 'w-shoulder' }, e('path', { d: SHOULDER }))),
    e('g', { clipPath: 'url(#w-shoulder)' }, draw(SKIN, wear.skin)), G('body', BODY, wear.body), G('neck', NECK, wear.neck), G('acc', ACC, wear.acc));
}
/** For the store's try-on: every shape this file can draw, per slot. */
export const SHAPES = { hat: HAT, eyes: EYES, face: FACE, neck: NECK, body: BODY, acc: ACC, skin: SKIN };

// Who plays, and on what. Holes are original layouts in yards (see golf-sim.js for the coordinates); the real
// courses only lend their names, their trees and, at Pacific Grove, their ocean.
import { rng } from '../../../server/engine/maze.js';
export const KEETCH = { id: 'keetch', name: 'Keetch', look: { hair: '#d8481c', shirt: '#2f6fb0', pants: '#e3d9b4' }, ball: '#ffffff' };
export const OBAMA = { hair: '#8a8a8a', skin: '#8d5a3b', shirt: '#1c2233', pants: '#1c2233', tie: '#2f6fb0' };

// The friends, weakest first. `skill` is the golf level Tyler gave them; `quirk` is in golf-sim.js; `look` is in draw.js.
const F = {
  landon: { name: 'Landon', skill: 1, ball: '#ff9a3c', look: { hair: '#5a3a22', band: '#ffffff', shirt: '#f08a1c', pants: '#f08a1c', bare: true, h: 4 } },
  gunt: { name: 'Gunt', skill: 1, ball: '#3a3a44', look: { bald: true, shirt: '#c9a678', pants: '#22242c' } },
  squanto: { name: 'Squanto', skill: 2, ball: '#b98a54', look: { fur: '#6b4a2e', cap: '#f3ecd2', h: 8, w: 4 } },
  bmehl: { name: 'BMehl', skill: 2, ball: '#e2483d', look: { hair: '#1c1612', cap: '#1b1b22', beard: '#1c1612', shirt: '#f3ecd2', stripes: '#d83a34', pants: '#1c2740', shorts: true, w: 2 } },
  bent: { name: 'Bent', skill: 5, ball: '#c8ccd4', look: { hair: '#2a1c14', cap: '#f3ecd2', shirt: '#c6ccd6', pants: '#1c2233', shorts: true, w: 2 } },
  foff: { name: 'Foff', skill: 6, ball: '#ffd84a', look: { bald: true, hat: 'umbrella', beard: '#7a5a3a', shades: true, shirt: '#22242c', pants: '#22242c', shorts: true, sandals: true } },
  tcut: { name: 'Tcut', skill: 6, quirk: 'rage', ball: '#f1a0a0', look: { hair: '#e6c86a', shirt: '#f1dcd8', pants: '#3a3f4a', shorts: true, h: 7, w: 4 } },
  korn: { name: 'Korn', skill: 7, quirk: 'long', ball: '#9adf6a', look: { hair: '#4a3020', cap: '#1b1b22', beard: '#4a3020', shirt: '#f3f6fa', pants: '#6a1c2a', shorts: true, h: -4, w: 4 } },
  kashely: { name: 'Kashely', skill: 8, quirk: 'cheat', ball: '#d8a860', look: { hair: '#3a2a1c', hat: 'cowboy', shirt: '#22242c', pants: '#c9b384', shorts: true } },
  joejack: { name: 'Mr. Joe Jack', skill: 10, ball: '#e2483d', look: { hair: '#5a4030', cap: '#d83a34', beard: '#5a4030', shirt: '#e6dcf0', pants: '#22242c', shorts: true, w: 2 } },
  steeze: { name: 'Steeze', skill: 10, ball: '#b9a0e8', look: { hair: '#1c1612', shirt: '#ffffff', pants: '#1b1b22', h: 7, w: -2 } },
};
const foes = (...ids) => ids.map((id) => ({ id, ...F[id] }));
export const FRIENDS = Object.values(F);

/** A hole from its line of play. `green` is [rx, ry, downhill x, downhill y]; sand, water and trees are
 *  [x, y, rx, ry] (bunkers are drawn half as big again); hills are [x, y, yards across, yards high] (below zero is
 *  a hollow). Keep hills off the greens. The rough then gets a scatter of lone trees, or pot bunkers on a links. */
function hole(par, path, green, { w = 24, sand = [], water = [], trees = [], hills = [], links = false } = {}) {
  const back = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [b[0] + (a[0] - b[0]) * d / l, b[1] + (a[1] - b[1]) * d / l]; }; // d yards short of b, coming from a
  const pin = path.at(-1), before = path.at(-2), xs = path.map((p) => p[0]), ell = (list, k = 1) => list.map(([x, y, rx, ry]) => ({ c: [x, y], rx: rx * k, ry: ry * k }));
  const bounds = [Math.min(...xs) - 80, -25, Math.max(...xs) + 80, pin[1] + 40], rnd = rng(par * 7919 + pin[0] * 31 + pin[1]), extra = [];
  const off = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };
  for (let i = 0; i < 400 && extra.length < 14; i++) { // only where a ball has already gone wrong: well off the line, clear of everything drawn by hand
    const p = [bounds[0] + rnd() * (bounds[2] - bounds[0]), rnd() * (pin[1] + 20)], r = links ? 3 + rnd() * 2 : 4 + rnd() * 4;
    const line = Math.min(...path.slice(1).map((b, k) => off(p, path[k], b)));
    if (line > w + 16 && line < 75 && Math.hypot(p[0] - pin[0], p[1] - pin[1]) > 34 && ![...sand, ...water, ...trees, ...extra].some(([x, y, rx, ry]) => Math.hypot((p[0] - x) / (rx * 1.5 + r + 5), (p[1] - y) / (ry * 1.5 + r + 5)) < 1)) extra.push([p[0], p[1], r, r * (0.8 + rnd() * 0.5)]);
  }
  const fairway = par === 3 ? { pts: [back(before, pin, 30), back(before, pin, 17)], w: 14 }
    : { pts: [back(path[1], path[0], 30), ...path.slice(1, -1), back(before, pin, 26)], w };
  return { par, tee: path[0], pin, path, fairway, bounds,
    green: { c: pin, rx: green[0], ry: green[1], slope: [green[2], green[3]], apron: { c: pin, rx: green[0] + 4, ry: green[1] + 4 } },
    sand: [...ell(sand, 1.5), ...(links ? ell(extra) : [])], water: ell(water), trees: [...ell(trees), ...(links ? [] : ell(extra))],
    hills: hills.map(([x, y, r, h]) => ({ c: [x, y], r, h })) };
}

const POPPY_FRONT = [
  hole(4, [[0, 0], [0, 200], [40, 335]], [15, 13, 0.02, 0], { sand: [[17, 332, 6, 9]], trees: [[-50, 150, 16, 95], [52, 110, 16, 75], [88, 285, 14, 45]], hills: [[-22, 120, 30, 3], [18, 232, 28, -2.5]] }),
  hole(3, [[0, 0], [0, 150]], [16, 14, -0.03, -0.012], { water: [[0, 72, 34, 26]], sand: [[0, 172, 12, 6]], trees: [[-52, 100, 12, 70], [52, 100, 12, 70]], hills: [[-30, 110, 16, 1.5]] }),
  hole(5, [[0, 0], [-30, 220], [10, 360], [-10, 475]], [16, 14, 0.018, -0.035], { water: [[44, 300, 22, 14]], sand: [[-58, 235, 8, 12], [13, 470, 6, 9]],
    trees: [[-78, 110, 16, 100], [42, 130, 16, 90], [-48, 385, 14, 55], [58, 425, 14, 50]], hills: [[-5, 120, 34, 3], [-50, 262, 30, 3.5], [26, 318, 26, -3]] }),
];
const POPPY_BACK = [
  hole(4, [[0, 0], [-25, 210], [-10, 360]], [15, 13, -0.02, -0.015], { sand: [[13, 358, 6, 9]], trees: [[-75, 120, 16, 90], [40, 100, 16, 80], [45, 300, 14, 50], [-70, 330, 14, 45]], hills: [[-5, 215, 30, 3], [-45, 140, 26, -2]] }),
  hole(3, [[0, 0], [0, 175]], [15, 13, 0, -0.03], { sand: [[-21, 160, 8, 7], [22, 168, 7, 9]], trees: [[-50, 95, 12, 70], [52, 95, 12, 70]], hills: [[30, 110, 22, 2.5]] }),
  hole(5, [[0, 0], [20, 230], [-20, 380], [0, 510]], [16, 14, 0.025, -0.02], { water: [[-62, 300, 20, 16]], sand: [[48, 240, 8, 12], [-22, 500, 6, 9]],
    trees: [[-45, 110, 16, 95], [70, 130, 16, 90], [45, 390, 14, 60], [-75, 440, 14, 50]], hills: [[10, 150, 34, 3], [-5, 330, 28, -2.5], [25, 440, 22, 2]] }),
];
const GROVE_FRONT = [ // short, tight and full of trees
  hole(4, [[0, 0], [15, 190], [-15, 320]], [14, 12, 0.025, 0], { w: 20, sand: [[-36, 318, 6, 9], [6, 322, 6, 8]], trees: [[-40, 100, 14, 85], [55, 110, 14, 90], [40, 270, 12, 40], [-65, 260, 12, 50]], hills: [[20, 200, 26, 2.5]] }),
  hole(3, [[0, 0], [10, 140]], [13, 11, 0.025, -0.02], { sand: [[10, 121, 10, 5]], trees: [[-40, 80, 12, 60], [60, 80, 12, 60]], hills: [[-30, 110, 16, 1.5]] }),
  hole(5, [[0, 0], [-30, 200], [-30, 350], [10, 480]], [15, 13, -0.02, -0.025], { sand: [[-62, 215, 8, 12], [30, 472, 6, 9]],
    trees: [[-80, 100, 16, 90], [30, 100, 16, 85], [15, 290, 14, 60], [-80, 330, 14, 60], [60, 420, 14, 45]], hills: [[-20, 120, 30, -2.5], [-45, 300, 26, 3]] }),
];
const GROVE_BACK = [ // links: no trees, dunes, and the Pacific down the left
  hole(4, [[0, 0], [10, 220], [-10, 380]], [15, 13, -0.03, 0], { links: true, water: [[-125, 190, 55, 260]], sand: [[55, 150, 10, 40], [50, 300, 9, 30], [-32, 366, 7, 8]], hills: [[30, 120, 24, 3], [-30, 250, 24, 2.5], [25, 300, 20, -2]] }),
  hole(3, [[0, 0], [-15, 160]], [15, 13, -0.03, 0], { links: true, water: [[-95, 150, 45, 120]], sand: [[8, 150, 7, 10], [-15, 139, 9, 5]], hills: [[25, 90, 20, 2.5]] }),
  hole(5, [[0, 0], [25, 240], [0, 400], [15, 530]], [16, 14, -0.025, -0.02], { links: true, water: [[-110, 280, 50, 300]], sand: [[60, 230, 10, 14], [-30, 330, 8, 12], [38, 522, 6, 10]], hills: [[0, 140, 30, 3], [30, 330, 26, -2.5], [-15, 440, 22, 2.5]] }),
];
const BAYONET_FRONT = [ // narrow. Everything that is not fairway is a tree or a bunker
  hole(4, [[0, 0], [0, 230], [-35, 400]], [15, 13, 0.02, -0.02], { w: 18, sand: [[26, 235, 7, 10], [-57, 395, 6, 9], [-14, 402, 5, 8]], trees: [[-38, 110, 12, 100], [38, 120, 12, 105], [20, 330, 12, 55], [-80, 300, 14, 60]], hills: [[-10, 240, 26, 2.5]] }),
  hole(3, [[0, 0], [5, 190]], [15, 13, 0.02, -0.025], { sand: [[-17, 176, 7, 6], [27, 186, 6, 10]], trees: [[-45, 100, 12, 75], [55, 100, 12, 75]], hills: [[-30, 140, 18, 2]] }),
  hole(5, [[0, 0], [-20, 240], [20, 400], [0, 540]], [15, 13, -0.02, -0.025], { w: 20, sand: [[-50, 250, 8, 10], [42, 395, 7, 10], [21, 535, 6, 9]],
    trees: [[-70, 120, 14, 100], [30, 110, 14, 95], [-40, 340, 12, 50], [62, 330, 12, 60], [-45, 480, 12, 45], [45, 490, 12, 40]], hills: [[0, 160, 28, 3], [5, 320, 24, -2.5]] }),
];
const BAYONET_BACK = [ // long
  hole(4, [[0, 0], [20, 250], [0, 430]], [15, 13, 0.025, -0.015], { w: 22, sand: [[50, 255, 8, 10], [-22, 424, 6, 9]], trees: [[-45, 120, 14, 100], [70, 140, 14, 100], [-50, 340, 12, 60], [52, 360, 12, 50]], hills: [[5, 200, 30, 3], [15, 330, 24, -2]] }),
  hole(3, [[0, 0], [0, 205]], [16, 14, -0.02, -0.02], { water: [[0, 110, 40, 35]], sand: [[-23, 200, 6, 9], [0, 226, 10, 5]], trees: [[-60, 120, 12, 80], [60, 120, 12, 80]] }),
  hole(5, [[0, 0], [-25, 250], [25, 420], [0, 560]], [16, 14, 0.02, -0.03], { w: 22, water: [[70, 330, 22, 18]], sand: [[-58, 250, 8, 12], [-30, 420, 7, 10], [22, 552, 6, 9]],
    trees: [[-75, 120, 14, 100], [30, 115, 14, 95], [-40, 480, 12, 50], [55, 500, 12, 45]], hills: [[-10, 170, 30, 3], [0, 340, 26, -2.5], [30, 465, 20, 2]] }),
];
const HORSE_FRONT = [ // hills, and greens with opinions
  hole(4, [[0, 0], [-20, 240], [10, 410]], [16, 14, -0.03, -0.02], { sand: [[-50, 245, 8, 10], [33, 404, 6, 9], [-8, 391, 6, 5]], trees: [[-80, 130, 14, 100], [35, 120, 14, 90], [55, 330, 12, 55], [-60, 360, 12, 45]], hills: [[-30, 150, 34, 4], [10, 250, 28, -3], [-25, 325, 24, 3]] }),
  hole(3, [[0, 0], [-10, 165]], [17, 15, 0.035, 0], { sand: [[-35, 160, 6, 10], [14, 147, 7, 6]], trees: [[-55, 90, 12, 70], [50, 60, 12, 50]], hills: [[30, 105, 22, 3]] }),
  hole(5, [[0, 0], [30, 230], [-10, 380], [10, 520]], [16, 14, 0.02, -0.035], { water: [[-45, 250, 18, 22]], sand: [[62, 235, 8, 10], [33, 512, 6, 9]],
    trees: [[-50, 100, 14, 80], [80, 140, 14, 100], [45, 400, 12, 60], [-65, 400, 12, 50]], hills: [[20, 140, 32, 3.5], [15, 310, 26, -3], [-20, 440, 22, 2.5]] }),
];
const HORSE_BACK = [ // the last three. Water, mostly
  hole(4, [[0, 0], [0, 250], [30, 440]], [15, 13, -0.025, -0.02], { w: 20, water: [[-45, 255, 18, 30]], sand: [[30, 250, 7, 12], [8, 432, 6, 9], [52, 446, 6, 8]], trees: [[60, 120, 14, 100], [-60, 110, 14, 80], [-30, 380, 12, 50], [70, 340, 12, 50]], hills: [[10, 180, 28, 3], [25, 335, 24, -2.5]] }),
  hole(3, [[0, 0], [0, 180]], [16, 14, -0.025, -0.015], { water: [[0, 100, 45, 40], [-47, 180, 16, 30]], sand: [[24, 176, 6, 10]], trees: [[70, 110, 12, 80], [-75, 60, 12, 50]] }),
  hole(5, [[0, 0], [-30, 250], [20, 420], [0, 570]], [16, 14, 0.02, -0.03], { w: 20, water: [[60, 300, 24, 20], [-46, 525, 16, 22]], sand: [[-62, 255, 8, 12], [47, 425, 7, 10], [23, 562, 6, 9]],
    trees: [[-80, 120, 14, 100], [25, 110, 14, 90], [-45, 400, 12, 50], [60, 480, 12, 50]], hills: [[-15, 170, 30, 3.5], [-5, 340, 26, -3], [25, 480, 20, 2]] }),
];

// Eleven friends over the trip's eight nines (three holes each), weakest first. Against a pair, Keetch has to beat both.
export const MATCHES = [
  { id: 1, day: 'Thursday', course: 'Poppy Hills', nine: 'Front nine', holes: POPPY_FRONT, wind: 8, foes: foes('landon', 'gunt') },
  { id: 2, day: 'Thursday', course: 'Poppy Hills', nine: 'Back nine', holes: POPPY_BACK, wind: 8, foes: foes('squanto', 'bmehl') },
  { id: 3, day: 'Friday', course: 'Pacific Grove', nine: 'Front nine', holes: GROVE_FRONT, wind: 10, foes: foes('bent') },
  { id: 4, day: 'Friday', course: 'Pacific Grove', nine: 'Back nine', holes: GROVE_BACK, wind: 14, foes: foes('foff') },
  { id: 5, day: 'Saturday', course: 'Bayonet', nine: 'Front nine', holes: BAYONET_FRONT, wind: 8, foes: foes('tcut') },
  { id: 6, day: 'Saturday', course: 'Bayonet', nine: 'Back nine', holes: BAYONET_BACK, wind: 10, foes: foes('korn') },
  { id: 7, day: 'Saturday', course: 'Black Horse', nine: 'Front nine', holes: HORSE_FRONT, wind: 10, foes: foes('kashely') },
  { id: 8, day: 'Saturday', course: 'Black Horse', nine: 'Back nine', holes: HORSE_BACK, wind: 12, foes: foes('joejack', 'steeze'), finale: true },
];

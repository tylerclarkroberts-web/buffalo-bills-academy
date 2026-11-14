// How rough the day's dig is (v79). One of five tiers per Mountain-time day, 20% each, rolled from the day's seed so
// every miner gets the same one. Shared with the browser: the server sizes the maze, drops the cave-ins and pays the
// hazard rate; the browser draws the lantern, the dark and the acid worms from the same row.
import { rng, makeMaze, FIRST_POOL_STEPS } from './maze.js';

// cells: maze size (cells a side). loops/caves: extra openings, then cave-ins that block hallways (never a way out).
// lamp/fog/ambient: multiples of the shaft's own lamp reach, fog distance and ambient light. flicker: 0 steady .. 1
// sputters and dies for a beat. worms: acid worms a minute; wormSize: how much of the view one covers (share of the
// short side); wormMax: how many can be on you at once. pay: hazard pay on an ordinary acid bucket.
export const TIERS = [
  { tier: 1, id: 'greenhorn', name: 'GREENHORN GULCH', blurb: 'SMALL, BRIGHT AND FRIENDLY. BRING A SNACK.',
    cells: 6, loops: 0, caves: 0, lamp: 1.3, fog: 1.35, ambient: 1.4, flicker: 0, worms: 0, wormSize: 0, wormMax: 0, pay: 1 },
  { tier: 2, id: 'tenderfoot', name: 'TENDERFOOT TUNNELS', blurb: 'A LITTLE BIGGER. A WORM OR TWO.',
    cells: 8, loops: 3, caves: 2, lamp: 1.1, fog: 1.15, ambient: 1.15, flicker: 0.2, worms: 0.6, wormSize: 0.26, wormMax: 1, pay: 1.1 },
  { tier: 3, id: 'honest', name: 'HONEST WORK', blurb: 'A NORMAL DAY IN AN ABNORMAL MINE.',
    cells: 10, loops: 6, caves: 4, lamp: 1, fog: 1, ambient: 1, flicker: 0.4, worms: 1.2, wormSize: 0.32, wormMax: 2, pay: 1.25 },
  { tier: 4, id: 'badlands', name: 'THE BADLANDS', blurb: 'BIG, DARK, AND THE ROOF IS LOOSE.',
    cells: 13, loops: 12, caves: 8, lamp: 0.78, fog: 0.8, ambient: 0.7, flicker: 0.7, worms: 2.2, wormSize: 0.4, wormMax: 2, pay: 1.5 },
  { tier: 5, id: 'deadman', name: "DEAD MAN'S DIG", blurb: 'ENORMOUS. PITCH DARK. WORMS. GOD SPEED.',
    cells: 16, loops: 22, caves: 14, lamp: 0.6, fog: 0.62, ambient: 0.45, flicker: 1, worms: 3.5, wormSize: 0.48, wormMax: 3, pay: 2 },
];

/** A tier's row (null for shifts dug before tiers existed: they keep the plain maze and plain pay). */
export function tierInfo(tier) { return TIERS[(tier | 0) - 1] || null; }

/** The day's tier from the day's seed alone: an even five-way split. */
export function dayTier(seed) {
  return 1 + Math.min(4, Math.floor(rng((seed ^ 0x71e55) >>> 0)() * 5));
}

/** The one maze builder for a shift (server, PvP and browser): seed, size and tier in, the same tunnels out. */
export function shiftMaze({ seed, cells, tier }) {
  const c = FIRST_POOL_STEPS[cells] ? cells : 7, t = tierInfo(tier);
  return makeMaze(seed, c, FIRST_POOL_STEPS[c], t ? { loops: t.loops, caves: t.caves } : null);
}

/** Never so dark that a pool in reach is lost in the fog (reach is 1.9 m; the fog starts at 2.5 m). */
export const MIN_FOG = 5.5, MIN_LAMP = 3.6;
/** How far the lamp reaches and the fog sits, for a shaft's base numbers and the day's tier. */
export function tierLight(base, tier) {
  const t = tierInfo(tier) || TIERS[2];
  return { fogFar: Math.max(MIN_FOG, base.fogFar * t.fog), lampReach: Math.max(MIN_LAMP, base.lampReach * t.lamp), ambient: t.ambient, flicker: t.flicker };
}

// The daily mine: one maze and one set of acid spots per Mountain-time day, the same for every miner.
// Pure and shared with the browser: the seed is derived from the date alone, so anyone can rebuild the day's maze.
// How big and rough the day's maze is comes from the day's tier (engine/mine-tiers.js).
import { bucketChain } from './maze.js';
import { dayTier, tierInfo, shiftMaze } from './mine-tiers.js';

export const MINE_TZ = 'America/Denver';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: MINE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The mine day ('YYYY-MM-DD') in Mountain time. Midnight in Denver is when the tunnels get dug again. */
export function mineDay(now) {
  return fmt.format(new Date(now));
}

/** FNV-1a then a mix: a stable 31-bit seed from the day string (no crypto, so the browser can do it too). */
export function daySeed(day) {
  let h = 2166136261;
  for (const c of `acid-mine:${day}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return (h >>> 0) % 2 ** 31;
}

/** v79: the size comes from the day's tier (engine/mine-tiers.js), 20% each, from tiny to enormous. */
export function dayCells(seed) {
  return tierInfo(dayTier(seed)).cells;
}

/** A whole day shares one maze, so a day with only two or three dead ends would short everyone all day: redig. */
export const MIN_DAY_POOLS = 5;

/** Everything about the day's tunnels that every miner shares (`forceTier`: the local dev server's MINE_TEST_TIER hook). The size is the day's; the seed is the first dig
 *  (the day, then 'day#1', 'day#2', ...) that leaves at least MIN_DAY_POOLS acid spots. */
export function dailyLayout(day, forceTier = null) {
  const tier = tierInfo(forceTier) ? forceTier : dayTier(daySeed(day)), cells = tierInfo(tier).cells;
  let seed = daySeed(day);
  for (let k = 1; k <= 40; k++) {
    if (bucketChain(shiftMaze({ seed, cells, tier }), seed).length >= MIN_DAY_POOLS) break;
    seed = daySeed(`${day}#${k}`);
  }
  return { day, seed, cells, tier };
}

/** The day's maze and its pool chain (positions only: how much each holds is rolled per shift on the server). */
export function dailyMine(day, forceTier = null) {
  const { seed, cells, tier } = dailyLayout(day, forceTier);
  const maze = shiftMaze({ seed, cells, tier });
  return { day, seed, cells, tier, maze, chain: bucketChain(maze, seed) };
}

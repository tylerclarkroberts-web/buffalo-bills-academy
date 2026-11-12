// The daily mine: one maze and one set of acid spots per Mountain-time day, the same for every miner.
// Pure and shared with the browser: the seed is derived from the date alone, so anyone can rebuild the day's maze.
// How big the day's maze is uses the same mix as the old per-shift vein (lucky 7-cell days are common, deep
// 11-cell days are rarer), so across days the share of quick first finds stays where it was.
import { rng, makeMaze, bucketChain, FIRST_POOL_STEPS } from './maze.js';

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

/** The same mix the per-shift vein produced (`rollVein` cells, measured): about 51% 7-cell, 23% 9-cell, 26% 11-cell. */
export const DAY_CELL_MIX = [[7, 51], [9, 23], [11, 26]];
export function dayCells(seed) {
  let u = rng((seed ^ 0xda11) >>> 0)() * 100;
  for (const [cells, w] of DAY_CELL_MIX) { if (u < w) return cells; u -= w; }
  return 11;
}

/** A whole day shares one maze, so a day with only two or three dead ends would short everyone all day: redig. */
export const MIN_DAY_POOLS = 5;

/** Everything about the day's tunnels that every miner shares. The size is the day's; the seed is the first dig
 *  (the day, then 'day#1', 'day#2', ...) that leaves at least MIN_DAY_POOLS acid spots. */
export function dailyLayout(day) {
  const cells = dayCells(daySeed(day));
  let seed = daySeed(day);
  for (let k = 1; k <= 40; k++) {
    if (bucketChain(makeMaze(seed, cells, FIRST_POOL_STEPS[cells]), seed).length >= MIN_DAY_POOLS) break;
    seed = daySeed(`${day}#${k}`);
  }
  return { day, seed, cells };
}

/** The day's maze and its pool chain (positions only: how much each holds is rolled per shift on the server). */
export function dailyMine(day) {
  const { seed, cells } = dailyLayout(day);
  const maze = makeMaze(seed, cells, FIRST_POOL_STEPS[cells]);
  return { day, seed, cells, maze, chain: bucketChain(maze, seed) };
}

// Deterministic pacing estimate, not a playtest or verification of the deployed bug guide.
import assert from 'node:assert/strict';
import { acidFillAmount, richAt, BUCKET_CAPACITY, EXTRACTION_RATE } from '../server/mines.js';
import { SHAFTS } from '../server/catalog/mine.js';
import { rng } from '../server/engine/maze.js';
import { dailyMine } from '../server/engine/daily-maze.js';

const N = Number(process.argv[2] || 5000);
assert.ok(Number.isInteger(N) && N > 0 && N <= 100000, 'Use an integer from 1 to 100000 shifts.');
const random = rng(41917), randInt = n => Math.floor(random() * n);
const speed = 3.6 / 2.2;
for (const shaft of SHAFTS) {
const modes = ['bucket, unguided', 'bucket, ideal route'].map(name => ({ name, times: [], filled: 0, collected: 0, worth: 0 }));
for (let i = 0; i < N; i++) {
  const day = new Date(Date.UTC(2026, 0, 1) + i * 86400e3).toISOString().slice(0, 10);
  const { chain, maze } = dailyMine(day, null, shaft);
  const efficiency = 0.45 + random() * 0.35;
  const rolls = chain.map(() => randInt(100000));
  for (const mode of modes) {
    const travelEfficiency = mode === modes[0] ? efficiency : 1;
    let elapsed = 0, collected = 0, worth = 0;
    for (let p = 0; p < chain.length && collected < BUCKET_CAPACITY; p++) {
      elapsed += chain.legs[p] / (speed * travelEfficiency);
      const take = acidFillAmount(BUCKET_CAPACITY, rolls[p], BUCKET_CAPACITY - collected);
      elapsed += take / EXTRACTION_RATE;
      collected += take; worth += take * richAt(maze.dist[chain[p].y][chain[p].x]) / 1000;
    }
    assert.ok(collected > 0 && collected <= BUCKET_CAPACITY && elapsed >= collected / EXTRACTION_RATE);
    mode.times.push(elapsed); mode.collected += collected; mode.worth += worth; mode.filled += collected === BUCKET_CAPACITY ? 1 : 0;
  }
}
const fmt = s => `${Math.floor(Math.round(s) / 60)}m${String(Math.round(s) % 60).padStart(2, '0')}s`;
console.log(`${shaft.name}: ${N} daily mazes with seeded fill rolls; unguided walking efficiency 45–80%, ideal route 100%.`);
for (const { name, times, collected, worth, filled } of modes) {
  times.sort((a, b) => a - b);
  const q = p => times[Math.floor((times.length - 1) * p)];
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${name.padEnd(24)} median ${fmt(q(.5))} · mean ${fmt(average)} · p10 ${fmt(q(.1))} · p90 ${fmt(q(.9))} · ${(100 * filled / N).toFixed(1)}% full · mean ${(collected / N).toFixed(1)} units · richness ×${(worth / collected).toFixed(2)} · ${(60 * worth / times.reduce((a, b) => a + b, 0)).toFixed(1)} plain units of pay a minute`);
}
}
console.log('Times run until the plain 100-unit bucket fills or deposits run out; no guaranteed final fill or availability waits.');
console.log('Includes walking and the actual extraction rate. Every shaft is timed with the plain bucket and no gear. Excludes gear, hazard pay, shaft spills, network delay, scenery pauses, and actual guide behavior.');

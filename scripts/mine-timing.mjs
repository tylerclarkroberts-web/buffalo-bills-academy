// Deterministic pacing estimate, not a playtest or verification of the deployed bug guide.
import assert from 'node:assert/strict';
import { rollVein, SEEP_MS, MIN_SHIFT_MS, poolQuantity, BUCKET_CAPACITY, EXTRACTION_RATE } from '../server/mines.js';
import { makeMaze, veinChain, bucketChain, FIRST_POOL_STEPS, rng } from '../client/src/mines/maze.js';

const N = Number(process.argv[2] || 5000);
assert.ok(Number.isInteger(N) && N > 0 && N <= 100000, 'Use an integer from 1 to 100000 shifts.');
const random = rng(41917), randInt = n => Math.floor(random() * n);
const speed = 3.6 / 2.2;
const modes = { legacy: [], 'bucket, unguided': [], 'bucket, ideal route': [] };
let guaranteed = 0;
for (let i = 0; i < N; i++) {
  const v = rollVein(randInt), seed = randInt(2 ** 31);
  const maze = makeMaze(seed, v.cells, FIRST_POOL_STEPS[v.cells]);
  const efficiency = 0.45 + random() * 0.35;
  const old = veinChain(maze, seed);
  let elapsed = 0;
  for (let p = 0; p < old.length; p++) {
    elapsed += old.legs[p] / (speed * efficiency);
    if (elapsed * 1000 >= v.veinMs) break;
    if (v.veinMs - elapsed * 1000 <= SEEP_MS || p === old.length - 1) { elapsed = v.veinMs / 1000; break; }
  }
  modes.legacy.push(Math.max(MIN_SHIFT_MS / 1000, elapsed + 4));

  const chain = bucketChain(maze, seed), rolls = chain.map(() => randInt(100000));
  for (const [name, travelEfficiency] of [['bucket, unguided', efficiency], ['bucket, ideal route', 1]]) {
    elapsed = 0;
    let collected = 0;
    for (let p = 0; p < chain.length && collected < BUCKET_CAPACITY; p++) {
      elapsed = Math.max(MIN_SHIFT_MS / 1000, elapsed + chain.legs[p] / (speed * travelEfficiency));
      let quantity = poolQuantity(elapsed * 1000, v.veinMs, rolls[p]);
      if (p === chain.length - 1 && quantity < BUCKET_CAPACITY - collected) {
        quantity = BUCKET_CAPACITY - collected;
        if (name === 'bucket, unguided') guaranteed++;
      }
      const take = Math.min(quantity, BUCKET_CAPACITY - collected);
      elapsed += take / EXTRACTION_RATE;
      collected += take;
    }
    assert.equal(collected, BUCKET_CAPACITY, 'Every route can fill the bucket.');
    modes[name].push(elapsed);
  }
}
const fmt = s => `${Math.floor(Math.round(s) / 60)}m${String(Math.round(s) % 60).padStart(2, '0')}s`;
console.log(`${N} seeded shifts; unguided walking efficiency 45–80%, ideal route 100%.`);
for (const [name, times] of Object.entries(modes)) {
  times.sort((a, b) => a - b);
  const q = p => times[Math.floor((times.length - 1) * p)];
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${name.padEnd(24)} median ${fmt(q(.5))} · mean ${fmt(average)} · p10 ${fmt(q(.1))} · p90 ${fmt(q(.9))}`);
}
console.log(`Final-deposit guarantee used in ${(100 * guaranteed / N).toFixed(1)}% of unguided shifts.`);
console.log('Includes the 20-second collection floor and actual extraction rate. Excludes network delay, scenery pauses, and actual guide behavior.');

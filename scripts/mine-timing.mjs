// Simulates Acid Mines shift timing: the server's hidden vein roll plus an honest player walking the pool chain.
//   node scripts/mine-timing.mjs [shifts]
// Player model: walks 1.64 tiles/s flat out (scene.js SPEED / TILE) at a search efficiency of 45-80% (wrong turns,
// looking around). At each pool: flowing -> found; seeping (vein within 15 s) or the last pool -> wait for it;
// dry -> walk on to the next pool. Filling the bucket takes ~4 s after that.
import crypto from 'node:crypto';
import { rollVein, SEEP_MS } from '../server/mines.js';
import { makeMaze, veinChain, FIRST_POOL_STEPS } from '../client/src/mines/maze.js';
const N = Number(process.argv[2] || 20000);
const TILES_PER_S = 3.6 / 2.2, FILL_S = 4;
const vein = [], found = [], shift = [], pools = []; let walkedPast = 0;
for (let i = 0; i < N; i++) {
  const v = rollVein((n) => crypto.randomInt(n)); const T = v.veinMs / 1000; const seed = crypto.randomInt(2 ** 31);
  const m = makeMaze(seed, v.cells, FIRST_POOL_STEPS[v.cells]); const chain = veinChain(m, seed);
  const speed = TILES_PER_S * (0.45 + Math.random() * 0.35);
  let t = 0, at = null;
  for (let k = 0; k < chain.length; k++) {
    t += chain.legs[k] / speed;
    if (t >= T) { at = t; pools.push(k + 1); if (k) walkedPast++; break; }
    if (T - t <= SEEP_MS / 1000 || k === chain.length - 1) { at = T; pools.push(k + 1); break; }
  }
  vein.push(T); found.push(at); shift.push(Math.max(at + FILL_S, 20));
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (x) => (x >= 60 ? `${Math.floor(x / 60)}m${String(Math.round(x % 60)).padStart(2, '0')}s` : `${x.toFixed(0)}s`);
const row = (name, a) => console.log(`${name.padEnd(22)} min ${fmt(Math.min(...a)).padStart(6)}  p10 ${fmt(q(a, 0.1)).padStart(6)}  p25 ${fmt(q(a, 0.25)).padStart(6)}  median ${fmt(q(a, 0.5)).padStart(6)}  p75 ${fmt(q(a, 0.75)).padStart(6)}  p90 ${fmt(q(a, 0.9)).padStart(6)}  max ${fmt(Math.max(...a)).padStart(6)}  mean ${fmt(a.reduce((x, y) => x + y, 0) / a.length)}`);
console.log(`${N} simulated shifts`);
row('hidden vein time', vein); row('acid found at', found); row('shift length (paid)', shift);
const share = (a, lo, hi) => ((a.filter((x) => x >= lo && x < hi).length / a.length) * 100).toFixed(1) + '%';
console.log('acid found at:  <30s', share(found, 0, 30), ' 30-40s', share(found, 30, 40), ' 40s-2m', share(found, 40, 120), ' 2-3m', share(found, 120, 180), ' 3-5m', share(found, 180, 300), ' 5m+', share(found, 300, 1e9));
console.log('pools visited: median', q(pools, 0.5), ' p90', q(pools, 0.9), ' max', Math.max(...pools), ` · ${((walkedPast / N) * 100).toFixed(0)}% of shifts hit at least one dry pool`);

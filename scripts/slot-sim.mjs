// v39: simulate the slot math (same code as the server, fast seeded RNG). Splits the work over worker threads.
// usage: node scripts/slot-sim.mjs [spins=10000000] [threads=8] [seed]   -> JSON: RTP, hit rate, feature rates, max win
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { spin, M } from '../server/slots/math.js';

function sfc(seed) { let a = seed ^ 0x9e3779b9, b = seed * 7 + 1, c = 0xdeadbeef, d = 1;
  const f = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 30; i++) f(); return (n) => Math.floor((f() / 4294967296) * n); }
function run(n, seed) {
  const rng = sfc(seed); const s = { n, ret: 0, sq: 0, hits: 0, base: 0, toot: 0, tootX: 0, stash: 0, stashX: 0, full: 0, free: 0, freeX: 0, mansion: 0, max: 0, capped: 0, big: 0, b20: 0, jp: { MINI: 0, MINOR: 0, MAJOR: 0 } };
  for (let i = 0; i < n; i++) {
    const r = spin(rng, M); s.ret += r.x; s.sq += r.x * r.x; if (r.x > 0) s.hits++; s.base += r.baseX;
    if (r.toot) { s.toot++; s.tootX += r.toot.x; }
    if (r.stash) { s.stash++; s.stashX += r.stash.x; if (r.stash.full) s.full++; for (const v of r.stash.held) if (typeof v === 'string') s.jp[v]++; }
    if (r.free) { s.free++; s.freeX += r.free.x; if (r.free.level === 4) s.mansion++; }
    if (r.x > s.max) s.max = r.x; if (r.capped) s.capped++; if (r.x >= 10) s.big++; if (r.x >= 20) s.b20++;
  }
  return s;
}
if (isMainThread) {
  const N = +(process.argv[2] || 1e7), T = +(process.argv[3] || Math.min(8, os.cpus().length)); const seed = +(process.argv[4] || Date.now() % 1e9);
  const t0 = Date.now(); const per = Math.ceil(N / T);
  const parts = await Promise.all(Array.from({ length: T }, (_, i) => new Promise((res, rej) => { const w = new Worker(new URL(import.meta.url), { workerData: { n: per, seed: seed + i * 7919 } }); w.on('message', res); w.on('error', rej); })));
  const s = parts.reduce((a, b) => { for (const k of Object.keys(b)) if (k === 'jp') for (const j of Object.keys(b.jp)) a.jp[j] += b.jp[j]; else if (k === 'max') a.max = Math.max(a.max, b.max); else a[k] += b[k]; return a; });
  const n = s.n; const mean = s.ret / n; const sd = Math.sqrt(s.sq / n - mean * mean);
  const pct = (x) => +(100 * x / n).toFixed(3); const one = (c) => (c ? `1 in ${Math.round(n / c)}` : 'never');
  console.log(JSON.stringify({ spins: n, seed, seconds: (Date.now() - t0) / 1000, rtp: pct(s.ret), rtpSe: +(100 * sd / Math.sqrt(n)).toFixed(3), hitRate: pct(s.hits),
    parts: { base: pct(s.base), toot: pct(s.tootX), stash: pct(s.stashX), free: pct(s.freeX) },
    toot: one(s.toot), stash: one(s.stash), grand: one(s.full), free: one(s.free), mansion: one(s.mansion), jackpots: s.jp,
    win10x: one(s.big), win20x: one(s.b20), maxWinX: +s.max.toFixed(2), capped: s.capped, volatilitySd: +sd.toFixed(2) }));
} else parentPort.postMessage(run(workerData.n, workerData.seed));

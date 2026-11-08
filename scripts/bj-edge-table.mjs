// v46: precompute the blackjack main-game house edge table (server/blackjack/edge-table.json) from the REAL engine
// (server/blackjack/sim.js: single deck, reshuffle under 18 cards, the bots' basic-strategy chart, flat bets).
// Base = Guntrad's Vegas rules, many rounds. Each single-rule change is simulated with common random numbers (same
// seeds as the base chunks), so the effect's error is much smaller than two independent runs. Then a few multi-rule
// combos are simulated directly to check that adding the effects up is close enough (reported in the JSON).
// Usage: node scripts/bj-edge-table.mjs [chunkRounds=1000000] [baseChunks=48] [effChunks=16]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!isMainThread) {
  const { simulate } = await import(path.join(ROOT, 'server/blackjack/sim.js'));
  parentPort.on('message', ({ id, rules, seed, rounds }) => { const r = simulate({ rounds, seed, rules }); parentPort.postMessage({ id, net: r.net, wagered: r.wagered }); });
} else {
  const [CH = 1e6, NB = 48, NE = 16] = process.argv.slice(2).map(Number);
  const { GUNTRAD_RULES } = await import(path.join(ROOT, 'server/blackjack/rules.js'));
  const VARIANTS = { 's17=false': { s17: false }, 'bjPays=1.2': { bjPays: 1.2 }, 'das=false': { das: false }, 'doubleOn=9-11': { doubleOn: '9-11' }, 'doubleOn=10-11': { doubleOn: '10-11' },
    'maxHands=1': { maxHands: 1 }, 'maxHands=2': { maxHands: 2 }, 'maxHands=3': { maxHands: 3 }, 'resplitAces=true': { resplitAces: true }, 'hitSplitAces=true': { hitSplitAces: true },
    'surrender=true': { surrender: true }, 'insurance=false': { insurance: false } };
  const COMBOS = { 'H17+6:5': { s17: false, bjPays: 1.2 }, 'H17+noDAS+10-11': { s17: false, das: false, doubleOn: '10-11' }, 'surr+RSA+hitSA': { surrender: true, resplitAces: true, hitSplitAces: true }, 'noSplit+noDAS+RSA': { maxHands: 1, das: false, resplitAces: true }, 'RSA+3hands': { resplitAces: true, maxHands: 3 }, 'worst': { s17: false, bjPays: 1.2, das: false, doubleOn: '10-11', maxHands: 1, insurance: false } };
  const jobs = []; const seed = (i) => 1000 + i * 7919;
  for (let i = 0; i < NB; i++) jobs.push({ key: 'base', i, rules: {}, seed: seed(i) });
  for (const [k, r] of Object.entries({ ...VARIANTS, ...COMBOS })) for (let i = 0; i < NE; i++) jobs.push({ key: k, i, rules: r, seed: seed(i) });
  const res = {}; let next = 0, done = 0; const t0 = Date.now();
  await new Promise((resolve) => {
    const n = Math.max(1, os.cpus().length);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url));
      const give = () => { if (next >= jobs.length) { wk.terminate(); return; } const j = jobs[next]; wk.postMessage({ id: next++, rules: j.rules, seed: j.seed, rounds: CH }); };
      wk.on('message', (m) => { const j = jobs[m.id]; (res[j.key] ||= [])[j.i] = m.net / m.wagered * -1; done++; if (done % 20 === 0) console.error(`${done}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); if (done === jobs.length) resolve(); else give(); });
      give();
    }
  });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
  const base = mean(res.base), baseSe = se(res.base);
  const effect = (k) => { const d = res[k].map((v, i) => v - res.base[i]); return { effect: +mean(d).toFixed(6), se: +se(d).toFixed(6) }; };
  const effects = {}; for (const k of Object.keys(VARIANTS)) effects[k] = effect(k);
  const checks = {};
  for (const [k, r] of Object.entries(COMBOS)) {
    const direct = effect(k).effect; let add = 0; for (const [rk, rv] of Object.entries(r)) if (!(r.maxHands === 1 && ['das', 'resplitAces', 'hitSplitAces'].includes(rk))) add += effects[`${rk}=${rv}`].effect;
    checks[k] = { direct, additive: +add.toFixed(6), diff: +(direct - add).toFixed(6), se: effect(k).se };
  }
  const out = { note: 'v46 main-game house edge (fraction of initial bet). Real engine, 1 deck, reshuffle <18 cards, bots basic strategy, flat bets. edge = base + sum of effects for each rule that differs from GUNTRAD_RULES.',
    generated: new Date().toISOString(), roundsPerChunk: CH, baseChunks: NB, effectChunks: NE, baseRules: GUNTRAD_RULES, base: +base.toFixed(6), baseSe: +baseSe.toFixed(6), effects, checks };
  fs.writeFileSync(path.join(ROOT, 'server/blackjack/edge-table.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1)); console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`); process.exit(0);
}

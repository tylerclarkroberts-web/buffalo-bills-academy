// Foff's Bachelor Party: how each skill level scores on each match, for tuning. `node scripts/foff-balance.mjs [rounds]`
import { MATCHES } from '../client/src/foff/course.js';
import { aiHole, windFor } from '../client/src/foff/golf-sim.js';
import { rng } from '../client/src/mines/maze.js';

const rounds = Number(process.argv[2]) || 500;
for (const m of MATCHES) {
  const par = m.holes.reduce((s, h) => s + h.par, 0);
  console.log(`\nMatch ${m.id}: ${m.course}, ${m.nine} (par ${par}) vs ${m.foes.map((f) => `${f.name} (${f.skill})`).join(' & ')}`);
  console.log('skill  avg    vs par  per hole            beats every foe');
  for (const skill of [1, 2, 5, 6, 7, 8, 10]) {
    const rnd = rng(skill * 7919), per = m.holes.map(() => 0); let total = 0, wins = 0;
    for (let r = 0; r < rounds; r++) {
      let mine = 0; const foes = m.foes.map(() => 0), q = m.foes.map(() => ({ mulligans: 3 }));
      m.holes.forEach((h, i) => {
        const wind = windFor(rnd, m.wind), s = aiHole(h, skill, rnd, wind);
        mine += s; per[i] += s; m.foes.forEach((f, k) => { foes[k] += aiHole(h, f, rnd, wind, q[k]); });
      });
      total += mine; if (foes.every((f) => mine < f)) wins++;
    }
    const avg = total / rounds;
    console.log(`${String(skill).padStart(5)}  ${avg.toFixed(1).padStart(5)}  ${(avg - par >= 0 ? '+' : '') + (avg - par).toFixed(1)}`.padEnd(22) + per.map((p) => (p / rounds).toFixed(1)).join(' / ').padEnd(20) + `${Math.round(wins / rounds * 100)}%`);
  }
}

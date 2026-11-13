// Foff's Bachelor Party: how each skill level scores on each match, for tuning. `node scripts/foff-balance.mjs [rounds]`
import { MATCHES } from '../client/src/foff/course.js';
import { aiHole, aiStroke, cardScore, markBack, teeUp, windFor } from '../client/src/foff/golf-sim.js';
import { rng } from '../server/engine/maze.js';

/** Keetch's stand-in plays a hole. Against Kashely his ball gets marked back the first time it is on the green. */
function play(h, skill, rnd, wind, marked) {
  const g = teeUp(h);
  while (!g.holed) { aiStroke(h, g, skill, rnd, wind); if (!marked && !g.holed && g.lie === 'green') { marked = true; g.pos = markBack(h, g.pos) || g.pos; } }
  return g.strokes;
}
const rounds = Number(process.argv[2]) || 500;
for (const m of MATCHES) {
  const par = m.holes.reduce((s, h) => s + h.par, 0);
  console.log(`\nMatch ${m.id}: ${m.course}, ${m.nine} (par ${par}) vs ${m.foes.map((f) => `${f.name} (${f.skill})`).join(' & ')}`);
  console.log('skill  avg    vs par  per hole            beats every foe');
  for (const skill of [1, 2, 5, 6, 7, 8, 10]) {
    const rnd = rng(skill * 7919), per = m.holes.map(() => 0); let total = 0, wins = 0;
    for (let r = 0; r < rounds; r++) {
      let mine = 0; const foes = m.foes.map(() => 0), q = m.foes.map(() => ({ mulligans: 3, pencil: 1 }));
      m.holes.forEach((h, i) => {
        const wind = windFor(rnd, m.wind), s = play(h, skill, rnd, wind, !m.foes.some((f) => f.quirk === 'cheat'));
        mine += s; per[i] += s; m.foes.forEach((f, k) => { foes[k] += cardScore(f, aiHole(h, f, rnd, wind, q[k]), h.par, q[k]); });
      });
      total += mine; if (foes.every((f) => mine < f)) wins++;
    }
    const avg = total / rounds;
    console.log(`${String(skill).padStart(5)}  ${avg.toFixed(1).padStart(5)}  ${(avg - par >= 0 ? '+' : '') + (avg - par).toFixed(1)}`.padEnd(22) + per.map((p) => (p / rounds).toFixed(1)).join(' / ').padEnd(20) + `${Math.round(wins / rounds * 100)}%`);
  }
}

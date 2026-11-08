// Win rates for scripted players of different skill against Guntrad. Usage: node scripts/fight-balance.mjs [seeds]
import * as F from '../server/engine/fight.js';
import { makeBot, masher, spammer, playBot } from '../test/support/fightbots.js';
const N = +(process.argv[2] || 200);
const tiers = {
  'frame-perfect (r1)': (s) => makeBot({ reaction: 1, seed: s }),
  'expert (r4 j1 s3)': (s) => makeBot({ reaction: 4, jitter: 1, slip: 3, seed: s }),
  'skilled (r8 j2 s8)': (s) => makeBot({ reaction: 8, jitter: 2, slip: 8, seed: s }),
  'average (r18 j4 s20)': (s) => makeBot({ reaction: 18, jitter: 4, slip: 20, seed: s }),
  masher: (s) => masher(s),
  ...(spammer ? { 'kick spammer': () => spammer() } : {}),
};
const out = {};
for (const [name, mk] of Object.entries(tiers)) {
  let w = 0, hp = 0, best = 0, secs = 0, thr = 0;
  for (let i = 0; i < N; i++) { const s = F.seedOf('bal' + i); const r = playBot(s, mk(s)); if (r.result === 'win') { w++; secs += r.frames / 60; } hp += r.state.g.hp; best += r.state.best; thr += r.state.thrusts || 0; }
  out[name] = { win: `${w}/${N} (${((100 * w) / N).toFixed(1)}%)`, avgSecsWhenWon: w ? +(secs / w).toFixed(1) : null, avgGuntradHpLeft: Math.round(hp / N), avgBestCombo: +(best / N).toFixed(1), thrustsPerFight: +(thr / N).toFixed(2) };
}
console.table(out);

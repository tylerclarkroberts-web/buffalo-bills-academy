import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Circuit, RIBBON_XP, PURSE, TRAINED, capFor } from '../server/circuit.js';
import { simulateBout } from '../server/engine/bout.js';
import { xpFor, levelFor } from '../server/engine/creatures.js';
import { startBout, stepBout, tellDue } from '../server/engine/bout.js';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-circuit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir);
  const accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1 });
  const circuit = new Circuit({ store, barn, accounts, now });
  const pid = 'p1';
  store.players[pid] = { id: pid, name: 'Tester', bankroll: 100 };
  let n = 0;
  const hatch = (level) => {
    if (barn.has(pid)) barn.adopt(pid, { wildId: `w${++n}`, battleId: `b${n}`, species: 'lamprima', level });
    else { barn.layEgg(pid); clock.now += 5; barn.view(pid); }
    const pen = barn.bugs(pid).at(-1); pen.xp = xpFor(level); barn.save(); return pen;
  };
  return { clock, barn, circuit, pid, hatch, store };
}
const fake = (id, winner, hp) => ({ id, line: 0.5, S: { hp, maxHp: [100, 100] }, over: { winner } });

test('the Commissioner registers you first, then the trainers open in order', (t) => {
  const { circuit, pid, hatch } = setup(t);
  hatch(5);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'salad' }), /Not yet/);
  const r = circuit.talk(pid, { stop: 'foff', answer: 0 });
  assert.match(r.reply, /Shaft 7/);
  assert.equal(r.conceived, 'Shaft 7');
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'landon' }), /Not yet/);
});

test('a real trainer fight runs in the ring and settles with a verdict', (t) => {
  const { clock, barn, circuit, pid, hatch } = setup(t);
  hatch(10);
  circuit.talk(pid, { stop: 'foff', answer: 1 });
  const v = circuit.fight(pid, 'Tester', { stop: 'salad' });
  const fight = barn.fights.get(v.live);
  assert.equal(fight.kind, 'circuit');
  assert.equal(fight.fighters[1].owner, 'Lady Who Found It in Her Salad');
  clock.now += 10_000; barn.fights.sweep(); // nobody watching: it runs to the end
  assert.ok(fight.over && fight.extra.verdict.startsWith('Lady Who Found It in Her Salad: '));
  const done = !!circuit.view(pid).areas[0].stops.find((s) => s.id === 'salad').done;
  assert.equal(done, fight.over.winner === 0);
  assert.equal(fight.extra.xpEarned > 0, fight.over.winner === 0); // a loss pays nothing (and says nothing about XP)
  assert.ok(barn.fights.view(fight, pid).verdict); // the ring's view carries it
});

test('a leader gauntlet: health carries, a lost round benches that bug, two wins take the ribbon', (t) => {
  const { barn, circuit, pid, hatch } = setup(t);
  const a = hatch(6), b = hatch(6);
  const me = circuit.me(pid);
  for (const id of ['foff', 'salad', 'landon', 'notacop']) me.done[id] = 1;
  const pugh = circuit.stopOf('pugh');
  me.run = { stop: 'pugh', foe: 0, foeHp: null, out: [], hp: {}, won: [], live: null };
  circuit.settle(pid, pugh, { id: idOf(a), bornAt: a.bornAt }, pugh.bugs[0], fake('r1', 0, [40, 0]));
  assert.deepEqual([me.run.foe, me.run.hp[idOf(a)]], [1, 40]);
  const lost = fake('r2', 1, [0, 70]);
  circuit.settle(pid, pugh, { id: idOf(a), bornAt: a.bornAt }, pugh.bugs[1], lost);
  assert.deepEqual([me.run.out, me.run.foeHp], [[idOf(a)], 70]);
  assert.match(lost.extra.verdict, /Sub in/);
  assert.equal(lost.extra.xpEarned, undefined);
  const xpB = b.xp, win = fake('r3', 0, [20, 0]);
  circuit.settle(pid, pugh, { id: idOf(b), bornAt: b.bornAt }, pugh.bugs[1], win);
  assert.equal(me.run, null);
  assert.ok(me.ribbons[1] && me.done.pugh);
  assert.match(win.extra.spoils[0], /Ribbon 1/);
  assert.deepEqual(win.extra.spoils.slice(1, 3), [`$${PURSE.ribbon} purse`, 'Your bugs can now reach level 11']);
  assert.ok(barn.bugs(pid).find((p) => p.bornAt === b.bornAt).xp >= xpB + RIBBON_XP);
  assert.ok(barn.bugs(pid).find((p) => p.bornAt === a.bornAt).xp >= xpFor(6) + RIBBON_XP); // a won a round too
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'pugh' }), /already yours/);
});

test('losing the last standing bug ends the gauntlet', (t) => {
  const { circuit, pid, hatch } = setup(t);
  const a = hatch(3);
  const me = circuit.me(pid), pugh = circuit.stopOf('pugh');
  me.run = { stop: 'pugh', foe: 0, foeHp: null, out: [], hp: {}, won: [], live: null };
  const f = fake('r1', 1, [0, 55]);
  circuit.settle(pid, pugh, { id: idOf(a), bornAt: a.bornAt }, pugh.bugs[0], f);
  assert.equal(me.run, null);
  assert.match(f.extra.verdict, /LAPS/);
});

test('dodgeball: every third own turn of the leader\'s bug cannot miss, and the tell comes a turn early', () => {
  const coach = { species: 'manticora', name: 'Dodgeball', level: 4, rule: 'dodgeball', tell: 'whistle' };
  for (let seed = 0; seed < 20; seed++) {
    const S = startBout({ species: 'nemoptera', name: 'Mine', level: 4 }, coach, `ball:${seed}`);
    while (!S.over) {
      const due = S.by === 1 && tellDue(S, 1), events = stepBout(S);
      const own = events.find((e) => e.type === 'move' && e.by === 1 && !e.skipped);
      if (own && due) { assert.ok(own.hit, `seed ${seed}: a dodgeball missed`); assert.match(own.line, /DODGEBALL/); }
      if (own && !due) assert.doesNotMatch(own.line, /DODGEBALL/);
    }
  }
});

test('a beaten trainer pays its purse once, and a ribbon pays more and raises the level cap by one', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  const a = hatch(6);
  const me = circuit.me(pid), salad = circuit.stopOf('salad'), pugh = circuit.stopOf('pugh');
  circuit.settle(pid, salad, { id: idOf(a), bornAt: a.bornAt }, salad.bugs[0], fake('t1', 0, [50, 0]));
  assert.equal(store.players[pid].bankroll, 100 + PURSE.trainer);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'salad' }), /Not yet|enough for one lifetime/);
  assert.equal(barn.view(pid).pen.cap, 10);
  me.run = { stop: 'pugh', foe: 1, foeHp: null, out: [], hp: {}, won: [], live: null };
  circuit.settle(pid, pugh, { id: idOf(a), bornAt: a.bornAt }, pugh.bugs[1], fake('r9', 0, [30, 0]));
  assert.equal(store.players[pid].bankroll, 100 + PURSE.trainer + PURSE.ribbon);
  assert.deepEqual([capFor(0), capFor(1), capFor(8), capFor(30)], [10, 11, 18, 20]);
  const pen = barn.view(pid).pen;
  assert.equal(pen.cap, 11);
  barn.doc.pens[pid].xp = xpFor(15);
  assert.equal(barn.view(pid).pen.level, 11, 'XP past the cap waits for the next ribbon');
  assert.equal(levelFor(xpFor(15)), 10, 'and a bug with no ribbons behind it still tops out at 10');
});

test('circuit bugs are drilled: a barn bug a level below one seldom wins on its own', () => {
  let won = 0, n = 0;
  for (const mine of ['lamprima', 'pyrops', 'eupholus', 'gyrinus']) for (const theirs of ['trachelophorus', 'nemoptera', 'sagra']) for (let k = 0; k < 20; k++) {
    won += simulateBout({ species: mine, level: 4, mood: 75 }, { species: theirs, level: 5, mood: 100, gear: 0.06, defense: 0.06, trained: TRAINED }, `drill:${k}`).winner === 0 ? 1 : 0; n++;
  }
  assert.ok(won / n < 0.2, `a level 4 beat a trained level 5 in ${Math.round((won / n) * 100)}% of fights`);
});

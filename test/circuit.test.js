import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Circuit, RIBBON_XP, PURSE, TRAINED, capFor, rivalSpecies, scaled, AREAS } from '../server/circuit.js';
import { typeOf, edge } from '../server/engine/bug-types.js';
import { RULES } from '../server/engine/bout.js';
import { simulateBout } from '../server/engine/bout.js';
import { xpFor, levelFor } from '../server/engine/creatures.js';
import { startBout, stepBout, tellDue, odds } from '../server/engine/bout.js';

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

test('the Culvert opens with ribbon 1; the Nephew brings whatever beats your partner, and keeps it', (t) => {
  const { barn, circuit, pid, hatch } = setup(t);
  const a = hatch(8), me = circuit.me(pid);
  const culvert = () => circuit.view(pid).areas[1];
  assert.deepEqual([culvert().name, culvert().open, culvert().stops[0].open], ['The Culvert', false, false]);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'nephew1' }), /Not yet/);
  me.ribbons[1] = 1;
  const nephew = culvert().stops[0];
  assert.deepEqual([culvert().open, nephew.open, nephew.bugs[0].name, nephew.bugs[0].level], [true, true, 'Bug Two', 5]);
  assert.equal(edge(typeOf(nephew.bugs[0].species), typeOf(a.species)), 1, 'its type beats the partner\'s');
  assert.equal(nephew.bugs[0].species, rivalSpecies(a.species));
  barn.doc.pens[pid].species = nephew.bugs[0].species; // change partner: he does not re-pick
  assert.equal(culvert().stops[0].bugs[0].species, nephew.bugs[0].species);
  const live = circuit.fight(pid, 'Tester', { stop: 'nephew1' }).live;
  assert.deepEqual([barn.fights.get(live).fighters[1].name, barn.fights.get(live).fighters[1].owner], ['Bug Two', 'The Nephew']);
});

test('a toll can be paid or fought; paying costs the toll and wins nothing, and the Hoppers eat your packed lunch', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  hatch(8); const me = circuit.me(pid);
  me.ribbons[1] = 1; for (const id of ['nephew1', 'net']) me.done[id] = 1;
  store.players[pid].bankroll = 100;
  assert.throws(() => circuit.payToll(pid, { stop: 'toll1' }), /Not enough money|toll/);
  store.players[pid].bankroll = 400;
  barn.doc.pens[pid].lunch = { name: 'Bug Banquet', heal: 10 };
  const live = circuit.fight(pid, 'Tester', { stop: 'toll1' }).live, fight = barn.fights.get(live);
  assert.deepEqual([fight.fighters[0].lunch, fight.fighters[1].lunch], [null, { name: 'Bug Banquet', heal: 10 }], 'tribute: Lefty has it now');
  assert.equal(barn.doc.pens[pid].lunch, undefined);
  barn.fights.finish(fight, 1); // lost: still there
  assert.equal(circuit.me(pid).done.toll1, undefined);
  const paid = circuit.payToll(pid, { stop: 'toll1' });
  assert.match(paid.reply, /Pleasure doing business/);
  assert.deepEqual([store.players[pid].bankroll, paid.tolls.toll1, !!circuit.me(pid).done.toll1], [250, 'paid', true]);
  assert.throws(() => circuit.payToll(pid, { stop: 'toll1' }), /already through/);
});

test('Gil\'s flood: from turn nine a bug that cannot swim loses health every turn of its own, and a Water bug does not', () => {
  const gil = { species: 'dytiscus', name: 'Queen Size', level: 6, rule: 'flood', tell: 'give' };
  const lost = (species) => { let n = 0; for (let k = 0; k < 10; k++) { const S = startBout({ species, name: 'Mine', level: 6 }, gil, `flood:${k}`); while (!S.over) for (const e of stepBout(S)) if (e.ability === 'Rising Water') { n++; assert.ok(e.turn >= RULES.flood.from && e.dmg <= RULES.flood.hp); } } return n; };
  assert.ok(lost('lamprima') > 20);
  assert.equal(lost('gyrinus'), 0, 'a Water bug is at home');
  const S = startBout({ species: 'lamprima', name: 'Mine', level: 6 }, gil, 'tell'); let told = 0;
  while (!S.over) { if (tellDue(S, 1)) told++; stepBout(S); }
  assert.ok(told >= 1 && told <= 3, 'the tell shows as the water comes up, not all fight');
});

test('Bent\'s cough is going round: either bug sometimes loses a turn to it', () => {
  let coughs = [0, 0], turns = 0;
  for (let k = 0; k < 30; k++) { const S = startBout({ species: 'lamprima', name: 'Mine', level: 6 }, { species: 'notonecta', name: 'Lozenge', level: 6, rule: 'cough' }, `cough:${k}`);
    while (!S.over) for (const e of stepBout(S)) { if (e.type === 'move') turns++; if (/coughs/.test(e.line)) coughs[e.by]++; } }
  assert.ok(coughs[0] > 5 && coughs[1] > 5, 'both corners');
  const rate = (coughs[0] + coughs[1]) / turns;
  assert.ok(rate > RULES.cough.chance / 2 && rate < RULES.cough.chance * 2, `${Math.round(rate * 100)}% of turns`);
});

test('areas 3 to 6 open together with ribbon 2, and what is left for later trains harder and pays more', (t) => {
  const { barn, circuit, pid, hatch } = setup(t);
  hatch(10); const me = circuit.me(pid);
  const areas = () => circuit.view(pid).areas;
  me.ribbons[1] = 1;
  assert.deepEqual(areas().map((a) => a.open), [true, true, false, false, false, false]);
  me.ribbons[2] = 1;
  assert.deepEqual(areas().map((a) => a.open), [true, true, true, true, true, true]);
  assert.deepEqual(areas().slice(2).map((a) => a.anyOrder), [true, true, true, true]);
  const dale = () => areas()[2].stops.at(-1), ruperto = () => areas()[3].stops.at(-1);
  assert.deepEqual([dale().bugs.map((b) => b.level), dale().purse, areas()[2].stops[0].bugs[0].level], [[8, 9], PURSE.ribbon * 3, 7]);
  me.ribbons[4] = 1; me.ribbons[5] = 1; // two more ribbons won elsewhere first
  assert.deepEqual([dale().bugs.map((b) => b.level), dale().purse, areas()[2].stops[0].bugs[0].level], [[11, 12, 13], PURSE.ribbon * 5, 10], 'three bugs, three levels up, and the fifth ribbon\'s purse');
  assert.deepEqual(scaled(AREAS[3].stops.at(-1).bugs, 2).length, 2);
  // a gauntlet under way keeps the lineup it began with
  for (const id of ['inspector', 'bmehl']) me.done[id] = 1;
  const live = circuit.fight(pid, 'Tester', { stop: 'ruperto' }).live, began = circuit.me(pid).run.lineup.map((b) => b.level);
  me.ribbons[3] = 1; // a ribbon won mid-gauntlet (it cannot be, but the lineup must not move)
  assert.deepEqual(ruperto().bugs.map((b) => b.level), began);
  barn.fights.finish(barn.fights.get(live), 1);
});

test('the porch light: on every third turn a bug that is not a Dazzle type hits less often', () => {
  const dale = { species: 'photuris', name: 'Porchlight', level: 8, rule: 'flicker' };
  const hits = { off: [0, 0], on: [0, 0] };
  for (let k = 0; k < 60; k++) { const S = startBout({ species: 'lamprima', name: 'Mine', level: 8 }, dale, `flick:${k}`);
    while (!S.over) for (const e of stepBout(S)) if (e.type === 'move' && e.by === 0 && !e.skipped && e.effect !== 'heal') { const bin = e.turn % RULES.flicker.every === 0 ? hits.off : hits.on; bin[0] += e.hit ? 1 : 0; bin[1]++; } }
  assert.ok(hits.off[1] > 40 && hits.on[0] / hits.on[1] - hits.off[0] / hits.off[1] > 0.1, `lit ${Math.round(100 * hits.on[0] / hits.on[1])}% v dark ${Math.round(100 * hits.off[0] / hits.off[1])}%`);
});

test('an exterminator\'s poison never wears off, a rager hits harder when hurt, and a mulligan is at most three a fight', () => {
  const voss = { species: 'platymeris', name: 'Regret', level: 8, rule: 'linger' };
  let longest = 0;
  for (let k = 0; k < 10; k++) { const S = startBout({ species: 'lamprima', name: 'Mine', level: 8 }, voss, `linger:${k}`); let ticks = 0;
    while (!S.over) for (const e of stepBout(S)) if (e.type === 'venom' && e.by === 1 && !e.pop && e.ability !== 'Rising Water') ticks++;
    longest = Math.max(longest, ticks); }
  assert.ok(longest >= 6, `poison ticked ${longest} times in one fight`);
  const dmg = (rule, health) => odds(startBout({ species: 'phanaeus', name: 'Seven Iron', level: 8, rule, health }, { species: 'lamprima', name: 'Them', level: 8 }, 'rage'), 0).basic.dmg[1];
  assert.ok(dmg('rage', 40) > dmg(undefined, 40) * 1.15 && dmg('rage', 100) === dmg(undefined, 100));
  for (let k = 0; k < 20; k++) { const S = startBout({ species: 'lamprima', name: 'Mine', level: 8 }, { species: 'empusa', name: 'Ranch Rules', level: 8, rule: 'mulligan' }, `mull:${k}`); let taken = 0;
    while (!S.over) for (const e of stepBout(S)) if (/takes a mulligan/.test(e.line)) taken++;
    assert.ok(taken <= RULES.mulligan.tries); }
});

test('the grill is always lit and every fourth order comes out hot; Dwayne\'s shaft hides his bug\'s health', (t) => {
  const S = startBout({ species: 'solenopsis', name: 'Order 41', level: 8, rule: 'grill' }, { species: 'lamprima', name: 'Them', level: 8 }, 'grill');
  const plain = startBout({ species: 'solenopsis', name: 'Order 41', level: 8 }, { species: 'lamprima', name: 'Them', level: 8 }, 'grill');
  assert.ok(odds(S, 0).basic.dmg[1] > odds(plain, 0).basic.dmg[1], 'flare-up at full health');
  S.side[0].turn = RULES.grill.every - 1; plain.side[0].turn = RULES.grill.every - 1;
  assert.ok(tellDue(S, 0) && !tellDue(plain, 0));
  assert.ok(odds(S, 0).basic.dmg[1] > odds(plain, 0).basic.dmg[1] * 1.3, 'order up');
  const { barn, circuit, pid, hatch } = setup(t);
  hatch(10); const me = circuit.me(pid); me.ribbons[1] = me.ribbons[2] = 1; for (const id of ['newguy', 'kashely']) me.done[id] = 1;
  const live = circuit.fight(pid, 'Tester', { stop: 'dwayne' }).live;
  assert.equal(barn.fights.view(barn.fights.get(live), pid).dark, true);
});

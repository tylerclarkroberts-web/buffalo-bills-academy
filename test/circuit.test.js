import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Circuit, RIBBON_XP, PURSE, TRAINED, capFor, rivalSpecies, scaled, AREAS, BOSSES, PRIZES, prizesOf, HOUSE } from '../server/circuit.js';
import { Shop } from '../server/shop.js';
import { WILD } from '../server/pvp.js';
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
  assert.deepEqual(win.extra.spoils.slice(1, 4), ['Prize: The Whistle', `$${PURSE.ribbon} purse`, 'Your bugs can now reach level 11']);
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
  assert.equal(barn.view(pid).pen.cap, 9); // levels hold at 9 for now, whatever the ribbons say
  me.run = { stop: 'pugh', foe: 1, foeHp: null, out: [], hp: {}, won: [], live: null };
  circuit.settle(pid, pugh, { id: idOf(a), bornAt: a.bornAt }, pugh.bugs[1], fake('r9', 0, [30, 0]));
  assert.equal(store.players[pid].bankroll, 100 + PURSE.trainer + PURSE.ribbon);
  assert.deepEqual([capFor(0), capFor(1), capFor(8), capFor(30)], [10, 11, 18, 20]);
  const pen = barn.view(pid).pen;
  assert.equal(pen.cap, 9); // the ribbon's extra level waits with the rest while levels hold at 9
  barn.doc.pens[pid].xp = xpFor(15);
  assert.equal(barn.view(pid).pen.level, 9, 'XP past the hold is kept for when it lifts');
  assert.equal(barn.doc.pens[pid].xp, xpFor(15));
  assert.equal(levelFor(xpFor(15)), 9);
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
  assert.deepEqual(areas().map((a) => a.open), [true, true, false, false, false, false, false, false, false]);
  me.ribbons[2] = 1;
  assert.deepEqual(areas().map((a) => a.open), [true, true, true, true, true, true, false, false, false]);
  assert.deepEqual(areas().slice(2).map((a) => a.anyOrder), [true, true, true, true, false, false, false]);
  const leader = (area) => area.stops.find((s) => s.kind === 'leader');
  const dale = () => leader(areas()[2]), ruperto = () => leader(areas()[3]);
  assert.deepEqual([dale().bugs.map((b) => b.level), dale().purse, areas()[2].stops[0].bugs[0].level], [[8, 9], PURSE.ribbon * 3, 7]);
  me.ribbons[4] = 1; me.ribbons[5] = 1; // two more ribbons won elsewhere first
  assert.deepEqual([dale().bugs.map((b) => b.level), dale().purse, areas()[2].stops[0].bugs[0].level], [[11, 12, 13], PURSE.ribbon * 5, 10], 'three bugs, three levels up, and the fifth ribbon\'s purse');
  assert.deepEqual(scaled(leader(AREAS[3]).bugs, 2).length, 2);
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

test('each area has one feature presentation, open only after its ribbon, and beating it wins its card once', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  const a = hatch(10), me = circuit.me(pid);
  assert.equal(BOSSES().length, 8);
  for (const area of AREAS.slice(0, 8)) assert.equal(area.stops.at(-1).kind, 'boss', `${area.name} ends on its boss`);
  assert.deepEqual(circuit.view(pid).cards.map((card) => card.at), Array(8).fill(null));
  for (const id of ['foff', 'salad', 'landon', 'notacop']) me.done[id] = 1;
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'charlene' }), /Not yet/, 'not before Coach Pugh');
  me.done.pugh = me.ribbons[1] = 1;
  assert.equal(circuit.view(pid).areas[1].open, true, 'the next area does not wait for the boss');
  const charlene = circuit.stopOf('charlene'), bank = store.players[pid].bankroll;
  const live = circuit.fight(pid, 'Tester', { stop: 'charlene' }).live;
  assert.equal(barn.fights.get(live).fighters[1].rule, 'web');
  barn.fights.finish(barn.fights.get(live), 1);
  assert.equal(circuit.me(pid).cards, undefined, 'a loss wins nothing');
  const won = fake('c1', 0, [40, 0]);
  circuit.settle(pid, charlene, { id: idOf(a), bornAt: a.bornAt }, charlene.bugs[0], won);
  assert.deepEqual(won.extra.spoils, ['Feature presentation card · “Charlene\'s Web Address”', `\$${PURSE.boss} purse`]);
  assert.equal(store.players[pid].bankroll, bank + PURSE.boss);
  assert.ok(circuit.view(pid).cards[0].at && circuit.me(pid).done.charlene);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'charlene' }), /hold that card already/);
});

test('a boss with three bugs is a gauntlet that ends in its card, not a ribbon', (t) => {
  const { circuit, pid, hatch } = setup(t);
  const a = hatch(12), me = circuit.me(pid), choir = circuit.stopOf('choir');
  me.ribbons[1] = me.ribbons[2] = me.ribbons[4] = 1;
  me.run = { stop: 'choir', foe: 2, foeHp: null, out: [], hp: {}, won: [], live: null, lineup: scaled(choir.bugs, 3) };
  const last = fake('ch', 0, [10, 0]);
  circuit.settle(pid, choir, { id: idOf(a), bornAt: a.bornAt }, me.run.lineup[2], last);
  assert.deepEqual([circuit.me(pid).run, Object.keys(circuit.me(pid).ribbons).length, !!circuit.me(pid).cards.choir], [null, 3, true]);
  assert.match(last.extra.spoils[0], /Apartment 4B/);
});

test('boss powers: the web dulls your hits, the choir heals, a conscience heals on dirty moves, the telepod trades health once', () => {
  const dmg = (rule) => odds(startBout({ species: 'lamprima', name: 'Mine', level: 8 }, { species: 'platymeris', name: 'Charlene', level: 8, rule }, 'web'), 0).basic;
  assert.ok(dmg('web').dmg[1] < dmg().dmg[1] && dmg('web').hit < dmg().hit);
  const S = startBout({ species: 'lamprima', name: 'Mine', level: 8 }, { species: 'gromphadorhina', name: 'Tenor', level: 8, rule: 'sing' }, 'sing');
  S.hp[1] = 50; S.by = 1; stepBout(S);
  assert.ok(S.hp[1] >= 50 + RULES.sing.heal - 0, 'it sang before it acted');
  let healed = 0;
  for (let k = 0; k < 20; k++) { const C = startBout({ species: 'platymeris', name: 'Mine', level: 10 }, { species: 'gryllotalpa', name: 'Jimmy Conscience', level: 10, rule: 'conscience' }, `con:${k}`);
    while (!C.over) for (const e of stepBout(C)) if (/tuts/.test(e.line)) { healed++; assert.ok(e.by === 0 && (e.effect === 'venom' || e.effect === 'pierce')); } }
  assert.ok(healed > 10);
  const T = startBout({ species: 'lamprima', name: 'Mine', level: 10 }, { species: 'ampulex', name: 'Brindlewasp', level: 10, rule: 'telepod' }, 'pod');
  T.hp[0] = T.maxHp[0]; T.hp[1] = Math.floor(T.maxHp[1] * 0.2); T.by = 1;
  assert.ok(tellDue(T, 1));
  const pods = []; while (!T.over) for (const e of stepBout(T)) if (e.ability === 'Telepod') pods.push(e.hp);
  assert.equal(pods.length, 1, 'once a fight');
  assert.ok(pods[0][1] > T.maxHp[1] * 0.6 && pods[0][0] < T.maxHp[0] * 0.4, 'they traded how hurt they were');
});

test('a rare wild stop waits on nobody; knocked out, it takes three throws of a jar, and a catch is for good', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  const a = hatch(10), me = circuit.me(pid);
  const shop = circuit.shop = new Shop({ store, accounts: circuit.accounts, barn, now: () => 1_800_000_000_000 });
  let roll = 999; circuit.randInt = () => roll;
  for (const id of ['foff', 'salad', 'landon', 'notacop']) me.done[id] = 1;
  const stops = () => circuit.view(pid).areas[0].stops, wild = circuit.stopOf('wild1');
  assert.deepEqual(stops().filter((x) => ['wild1', 'pugh'].includes(x.id)).map((x) => [x.kind, x.open, x.purse]), [['wild', true, 0], ['leader', true, PURSE.ribbon]], 'Coach Pugh does not wait for it');
  const fightFor = (winner, hp) => { const id = circuit.fight(pid, 'Tester', { stop: 'wild1' }).live, fight = barn.fights.get(id); assert.deepEqual([fight.fighters[1].wild, fight.fighters[1].trained], [true, undefined]); fight.S.hp = hp; barn.fights.finish(fight, winner); return fight; };
  const points = fightFor(0, [50, 20]);
  assert.match(points.extra.verdict, /on points/); assert.equal(circuit.me(pid).catch, null);
  const ko = fightFor(0, [50, 0]);
  assert.deepEqual([ko.extra.jar.left, ko.extra.jar.have, circuit.me(pid).catch.jars], [WILD.throws, 0, WILD.throws]);
  assert.throws(() => circuit.jar(pid, { fight: ko.id }), /out of jars/);
  store.players[pid].bankroll = 5000; for (let k = 0; k < 4; k++) shop.buy(store.players[pid], 'jar');
  const miss = circuit.jar(pid, { fight: ko.id });
  assert.deepEqual([miss.held, miss.fight.jar.left, miss.fight.jar.have], [false, WILD.throws - 1, 3]);
  roll = 0;
  const hit = circuit.jar(pid, { fight: ko.id });
  assert.deepEqual([hit.held, hit.fight.jar, hit.fight.over.reason], [true, undefined, 'jarred']);
  const caught = barn.bugs(pid).at(-1);
  assert.deepEqual([caught.species, barn.view(pid).stable.bugs.at(-1).level, !!circuit.me(pid).done.wild1, shop.jars(pid)], ['phloeodes', wild.bugs[0].level, true, 2]);
  assert.throws(() => circuit.jar(pid, { fight: ko.id }), /It is gone/);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'wild1' }), /only the one/);
  assert.ok(a.name);
});

test('three misses and the rare comes to: the stop is still there to try again', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  hatch(10); const me = circuit.me(pid);
  const shop = circuit.shop = new Shop({ store, accounts: circuit.accounts, barn, now: () => 1_800_000_000_000 });
  circuit.randInt = () => 999;
  for (const id of ['foff', 'salad', 'landon', 'notacop']) me.done[id] = 1;
  store.players[pid].bankroll = 5000; for (let k = 0; k < 3; k++) shop.buy(store.players[pid], 'jar');
  const id = circuit.fight(pid, 'Tester', { stop: 'wild1' }).live, fight = barn.fights.get(id);
  fight.S.hp = [40, 0]; barn.fights.finish(fight, 0);
  let last; for (let k = 0; k < WILD.throws; k++) last = circuit.jar(pid, { fight: id });
  assert.deepEqual([last.held, last.fight.jar, circuit.me(pid).catch, circuit.me(pid).done.wild1], [false, undefined, null, undefined]);
  assert.match(last.fight.verdict, /comes to and is gone/);
  assert.ok(circuit.fight(pid, 'Tester', { stop: 'wild1' }).live, 'it can be fought again');
});

test('every leader hands over a prize, carried into circuit fights, and each does what it says', (t) => {
  const { barn, circuit, pid, hatch } = setup(t);
  hatch(10); const me = circuit.me(pid);
  assert.deepEqual(Object.keys(PRIZES), ['pugh', 'gil', 'dale', 'ruperto', 'voss', 'dwayne', 'ray', 'jack']);
  assert.deepEqual(prizesOf(me), []);
  me.ribbons[1] = me.ribbons[2] = 1; for (const id of ['foff', 'salad', 'landon', 'notacop', 'pugh', 'dale', 'newguy', 'kashely']) me.done[id] = 1;
  assert.deepEqual(circuit.view(pid).prizes.map((p) => p.id), ['whistle', 'nightlight']);
  const live = circuit.fight(pid, 'Tester', { stop: 'dwayne' }).live, fight = barn.fights.get(live);
  assert.deepEqual(fight.fighters[0].prizes, ['whistle', 'nightlight']);
  assert.equal(barn.fights.view(fight, pid).dark, undefined, 'the night light shows his bug\'s health');
  const mine = (prizes) => ({ species: 'lamprima', name: 'Mine', level: 8, prizes });
  // the whistle: a first attack that cannot miss
  assert.equal(odds(startBout(mine(['whistle']), { species: 'pyrops', name: 'Them', level: 8 }, 'w'), 0).basic.hit, 1);
  assert.ok(odds(startBout(mine([]), { species: 'pyrops', name: 'Them', level: 8 }, 'w'), 0).basic.hit < 1);
  // floaties: no flood damage
  const flooded = (prizes) => { let n = 0; const S = startBout(mine(prizes), { species: 'dytiscus', name: 'Queen Size', level: 8, rule: 'flood' }, 'f'); while (!S.over) for (const e of stepBout(S)) if (e.ability === 'Rising Water') n++; return n; };
  assert.ok(flooded([]) > 0); assert.equal(flooded(['floaties']), 0);
  // the oven mitt: a Fire bug's hit does less
  const burn = (prizes) => odds(startBout({ species: 'solenopsis', name: 'Order 41', level: 8 }, mine(prizes), 'm'), 0).basic.dmg[1];
  assert.ok(burn(['mitt']) < burn([]));
  // night eyes: an Ambush bug's opening strike is no longer certain
  const pounce = (prizes) => odds(startBout({ species: 'deroplatys', name: 'Third Shift', level: 8 }, mine(prizes), 'n'), 0).basic.hit;
  assert.equal(pounce([]), 1); assert.ok(pounce(['nighteyes']) < 1);
  // the antidote: poison does half damage
  const poison = (prizes) => { let sum = 0; for (let k = 0; k < 8; k++) { const S = startBout(mine(prizes), { species: 'platymeris', name: 'Regret', level: 8, rule: 'linger' }, `a:${k}`); while (!S.over) for (const e of stepBout(S)) if (e.type === 'venom' && e.by === 1 && !e.pop) sum += e.dmg; } return sum; };
  assert.ok(poison(['antidote']) < poison([]) * 0.8);
});

test('errands wait on nobody, pay once when you bring what is wanted, and the first ribbon and card go on the wall', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  hatch(5); const me = circuit.me(pid);
  const shop = circuit.shop = new Shop({ store, accounts: circuit.accounts, barn, now: () => 1_800_000_000_000 });
  me.ribbons[1] = 1; for (const id of ['foff', 'salad', 'landon', 'notacop', 'pugh']) me.done[id] = 1;
  const culvert = () => circuit.view(pid).areas[1].stops;
  for (const s of culvert().filter((x) => !['center', 'wild', 'boss', 'quest'].includes(x.kind))) me.done[s.id] = 1;
  delete me.done.toll1;
  assert.throws(() => circuit.quest(pid, { stop: 'q-bird' }), /Finish the stops/, 'the Hoppers come first');
  me.done.toll1 = 1;
  const bird = culvert().find((x) => x.id === 'q-bird');
  assert.deepEqual([bird.kind, bird.open, bird.purse], ['quest', true, 450]);
  assert.ok(culvert().find((x) => x.kind === 'leader').open, 'the leader does not wait for it');
  assert.throws(() => circuit.quest(pid, { stop: 'q-bird' }), /Not yet/, 'a level 5 beetle is no bird');
  barn.adopt(pid, { wildId: 'wf', battleId: 'bf', species: 'pyrops', level: 6 });
  const before = store.players[pid].bankroll;
  assert.match(circuit.quest(pid, { stop: 'q-bird' }).reply, /One bird/);
  assert.equal(store.players[pid].bankroll, before + 450);
  assert.throws(() => circuit.quest(pid, { stop: 'q-bird' }), /done/);
  assert.throws(() => circuit.quest(pid, { stop: 'pugh' }), /errand/);
  assert.throws(() => circuit.quest(pid, { stop: 'q-facts' }), /Not yet/);
  // the wall of My House: anyone already holding a ribbon gets theirs on the next look; the poster waits for a card
  assert.deepEqual([shop.inv(pid).own['odd-ribbonrack'], shop.inv(pid).own['odd-bugposter']], [1, undefined]);
  me.cards = { a: 1, b: 1, c: 1 }; circuit.view(pid);
  assert.equal(shop.inv(pid).own['odd-bugposter'], 1);
});

test('the drive-in opens with six ribbons and the rail spur with seven; Ray rewinds once, Jack retakes twice, and their prizes work', (t) => {
  const { circuit, pid, hatch } = setup(t);
  hatch(10); const me = circuit.me(pid);
  const open = () => circuit.view(pid).areas.slice(6, 8).map((a) => a.open);
  for (const n of [1, 2, 3, 4, 5]) me.ribbons[n] = 1;
  assert.deepEqual(open(), [false, false]);
  me.ribbons[6] = 1; assert.deepEqual(open(), [true, false]);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'follower' }), /Not yet/);
  me.ribbons[7] = 1; assert.deepEqual(open(), [true, true]);
  const ray = circuit.view(pid).areas[6].stops.find((x) => x.id === 'ray'), jack = circuit.view(pid).areas[7].stops.find((x) => x.id === 'jack');
  assert.deepEqual([ray.purse, jack.purse, ray.bugs.length, jack.bugs.length, circuit.view(pid).cap], [PURSE.ribbon * 7, PURSE.ribbon * 8, 3, 3, 17]);
  const mine = (prizes) => ({ species: 'lamprima', name: 'Mine', level: 16, prizes });
  // the rewind: once a fight, and only once
  let most = 0, any = 0;
  for (let k = 0; k < 20; k++) { let n = 0; const S = startBout(mine([]), { species: 'photuris', name: 'Feature Presentation', level: 16, rule: 'rewind' }, `r:${k}`); while (!S.over) for (const e of stepBout(S)) if (e.ability === 'Rewind') { n++; assert.ok(e.healed > 0); } most = Math.max(most, n); any += n; }
  assert.equal(most, 1); assert.ok(any >= 5, 'it usually comes up');
  // the retake: two a fight for Jack, one for whoever holds the prize, none otherwise
  const retakes = (a, b, by) => { let most = 0; for (let k = 0; k < 30; k++) { let n = 0; const S = startBout(a, b, `t:${k}`); while (!S.over) for (const e of stepBout(S)) if (e.by === by && /retakes/.test(e.line || '')) n++; most = Math.max(most, n); } return most; };
  const best = { species: 'bertholdia', name: 'The Best Bug', level: 16 };
  assert.equal(retakes(mine([]), { ...best, rule: 'retake' }, 1), 2);
  assert.deepEqual([retakes(mine(['retake']), best, 0), retakes(mine([]), best, 0)], [1, 0]);
  // bottomless popcorn: health back on its own turns
  const left = (prizes) => { let sum = 0; for (let k = 0; k < 30; k++) { const S = startBout(mine(prizes), best, `p:${k}`); while (!S.over) stepBout(S); sum += S.hp[0]; } return sum; };
  assert.ok(left(['popcorn']) > left([]));
});

test('a trainer with two bugs is a gauntlet that pays its purse and no ribbon', (t) => {
  const { barn, circuit, pid, hatch, store } = setup(t);
  hatch(16); const me = circuit.me(pid);
  for (const n of [1, 2, 3, 4, 5, 6]) me.ribbons[n] = 1;
  const before = store.players[pid].bankroll;
  for (const hp of [[80, 0], [60, 0]]) { const fight = barn.fights.get(circuit.fight(pid, 'Tester', { stop: 'concessions' }).live); fight.S.hp = hp; barn.fights.finish(fight, 0); }
  assert.deepEqual([!!me.done.concessions, me.ribbons[7], me.run, store.players[pid].bankroll - before], [true, undefined, null, PURSE.trainer * 7]);
});

test('the Fairgrounds: four judges in a row lift the cap to 20, and the rosette passes to whoever beats the bug holding it', (t) => {
  const { barn, circuit, pid, hatch, store, clock } = setup(t);
  const sp = hatch(18).species, me = circuit.me(pid);
  const fair = () => circuit.view(pid).areas[8];
  for (const n of [1, 2, 3, 4, 5, 6, 7]) me.ribbons[n] = 1;
  assert.equal(fair().open, false);
  me.ribbons[8] = 1;
  assert.deepEqual([fair().open, circuit.view(pid).cap, fair().stops.map((x) => x.kind).join()], [true, 18, 'rival,center,judge,judge,judge,judge,champion']);
  me.done.nephew5 = 1;
  const beat = (stop, rounds) => { let fight; for (let k = 0; k < rounds; k++) { fight = barn.fights.get(circuit.fight(pid, 'Tester', { stop }).live); fight.S.hp = [90, 0]; barn.fights.finish(fight, 0); } return fight; };
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'hollis' }), /Not yet/);
  const before = store.players[pid].bankroll;
  for (const judge of ['marjorie', 'hollis', 'gunt']) beat(judge, 3);
  assert.deepEqual([circuit.view(pid).cap, Object.keys(me.ribbons).length, store.players[pid].bankroll - before], [18, 8, PURSE.judge * 9 * 3]);
  assert.match(beat('korn', 3).extra.spoils.join(), /level 20/);
  assert.deepEqual([circuit.view(pid).cap, barn.capOf(pid)], [20, 20]);
  // the house holds the rosette until somebody takes it
  const table = () => fair().stops.at(-1);
  assert.deepEqual([table().heldBy, table().bugs[0].name, table().done, table().purse], [HOUSE.owner, HOUSE.bug.name, null, PURSE.champion * 9]);
  const lost = barn.fights.get(circuit.fight(pid, 'Tester', { stop: 'champion' }).live); lost.S.hp = [10, 50]; barn.fights.finish(lost, 1);
  assert.match(lost.extra.verdict, /keeps the rosette for Guntrad/); assert.equal(circuit.doc.champion, undefined);
  const cash = store.players[pid].bankroll, won = beat('champion', 1);
  assert.deepEqual([store.players[pid].bankroll - cash, table().heldBy, table().bugs[0].species, !!table().done, table().purse, won.extra.spoils[0]], [PURSE.champion * 9, 'Tester', sp, true, 0, 'The Grand Champion rosette']);
  assert.throws(() => circuit.fight(pid, 'Tester', { stop: 'champion' }), /rosette is yours/);
  assert.equal(circuit.doc.champion.bug.prizes, undefined, 'the copy leaves its prizes at home');
  // somebody else takes it: the first holder may come back for it, and is not paid twice
  const other = 'p2'; store.players[other] = { id: other, name: 'Rival', bankroll: 0 };
  barn.layEgg(other); clock.now += 5; barn.view(other); const them = circuit.me(other);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) them.ribbons[n] = 1; for (const id of ['nephew5', 'marjorie', 'hollis', 'gunt', 'korn']) them.done[id] = 1;
  barn.bugs(other)[0].xp = xpFor(18); barn.save();
  const theirs = barn.fights.get(circuit.fight(other, 'Rival', { stop: 'champion' }).live);
  assert.deepEqual([theirs.fighters[1].owner, theirs.fighters[1].species, theirs.fighters[1].trained], ['Tester', sp, 0.22]);
  theirs.S.hp = [40, 0]; barn.fights.finish(theirs, 0);
  assert.deepEqual([circuit.doc.champion.pid, table().heldBy, table().done, table().purse], [other, 'Rival', null, 0]);
  const again = cash + PURSE.champion * 9; beat('champion', 1);
  assert.deepEqual([store.players[pid].bankroll, circuit.doc.champion.pid], [again, pid]);
});

test('the judges: a repeated move lands softer, condition counts, a bare bug takes more, and the big hitter misses', () => {
  const mine = (over = {}) => ({ species: 'lamprima', name: 'Mine', level: 18, mood: 100, gear: 0.06, defense: 0.06, ...over });
  const judge = (rule) => ({ species: 'manticora', name: 'Theirs', level: 18, mood: 100, gear: 0.06, defense: 0.06, rule });
  const mid = (o) => (o.basic.dmg[0] + o.basic.dmg[1]) / 2;
  // encore: the same move twice running
  const S = startBout(mine(), judge('encore'), 'e'); const first = mid(odds(S, 0)); S.side[0].prev = 'basic';
  assert.ok(mid(odds(S, 0)) < first * 0.85);
  // inspect: a bug in poor condition hits softer, a kept one a little harder
  const hit = (a, b) => mid(odds(startBout(a, b, 'i'), 0));
  assert.ok(hit(mine({ mood: 20 }), judge('inspect')) < hit(mine({ mood: 20 }), judge()) * 0.92);
  assert.ok(hit(mine(), judge('inspect')) > hit(mine(), judge()));
  // best in show: each empty gear slot costs
  const taken = (a, rule) => mid(odds(startBout(a, judge(rule), 'b'), 1));
  assert.ok(taken(mine({ gear: 0, defense: 0 }), 'bestinshow') > taken(mine({ gear: 0, defense: 0 }), undefined) * 1.12);
  assert.ok(Math.abs(taken(mine(), 'bestinshow') - taken(mine(), undefined)) <= 1);
  // pull: harder, and likelier to miss
  const o = (rule) => odds(startBout(mine(), judge(rule), 'p'), 1).basic;
  assert.ok(mid({ basic: o('pull') }) > mid({ basic: o() }) * 1.3); assert.ok(o('pull').hit < o().hit - 0.15);
});

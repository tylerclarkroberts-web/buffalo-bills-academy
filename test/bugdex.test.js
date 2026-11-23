// The Bugdex: which bugs a player has met. Kept one, been in a fight with one, or (test/wild-bugs.test.js) spotted one
// down the mine. A species as hatched and each evolved stage (`species:1`, `species:2`) are met separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Circuit } from '../server/circuit.js';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-dex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  for (const [id, name] of [['a', 'Connor'], ['b', 'Tyler']]) store.players[id] = { id, name, bankroll: 100 };
  const boot = () => new Barn({ store, accounts, now, incubateMs: 1, eggInt: () => 0 }); // always the first common, so an egg never hatches one of the species named below
  return { clock, store, accounts, now, boot, barn: boot() };
}
const dex = (barn, id) => barn.view(id).dex.toSorted();

test('an egg keeps its secret; hatching, catching and the start of a fight each put a bug in the Bugdex', (t) => {
  const { barn, clock } = setup(t);
  barn.layEgg('a');
  assert.deepEqual(dex(barn, 'a'), [], 'nobody knows what is in the egg');
  clock.now += 5;
  const mine = barn.view('a').pen.species;
  assert.deepEqual(dex(barn, 'a'), [mine]);
  barn.adopt('a', { wildId: 'w1', battleId: 'b1', species: 'pyrops', level: 2 });
  assert.deepEqual(dex(barn, 'a'), [mine, 'pyrops'].toSorted());

  // Every fight, wherever it is, starts in `fights`: both owners meet both bugs, and nobody's corner meets nothing.
  barn.fights.start({ id: 'f1', kind: 'mine', players: ['a', null], fighters: [barn.fighter('a', barn.doc.pens.a), { species: 'halobates', name: 'Sea Skater', level: 1, wild: true }], seed: 's' });
  assert.ok(dex(barn, 'a').includes('halobates'));
  barn.fights.start({ id: 'f2', kind: 'barn', players: ['b', 'a'], fighters: [{ species: 'lamprima', name: 'L', level: 1 }, barn.fighter('a', barn.doc.pens.a)], seed: 's' });
  assert.deepEqual(dex(barn, 'b'), ['lamprima', mine].toSorted(), 'b met its own bug and a\'s, and nothing a met elsewhere');
  assert.deepEqual(Object.keys(barn.doc.dex).toSorted(), ['a', 'b']);
  assert.equal(barn.saw('a', ['pyrops', 'not-a-bug', 'pyrops:3']), false, 'old news, made-up species and stages that do not exist change nothing');
});

test('an evolved bug is its own entry: met by evolving one or fighting one, and it gives nothing else away', (t) => {
  const { barn, clock } = setup(t);
  barn.layEgg('a'); clock.now += 5;
  const mine = barn.view('a').pen.species;
  barn.doc.pens.a.evo = 1; // the Bug Center has been at it
  assert.deepEqual(dex(barn, 'a'), [mine, `${mine}:1`], 'its owner has now met stage two, and has not met stage three');
  barn.fights.start({ id: 'f1', kind: 'barn', players: ['a', 'b'], fighters: [barn.fighter('a', barn.doc.pens.a), { species: 'lamprima', name: 'L', level: 24, style: { evo: 2 } }], seed: 's' });
  assert.deepEqual(dex(barn, 'a'), ['lamprima:2', mine, `${mine}:1`].toSorted(), 'a stage three stag beetle: not the beetle as hatched, nor its stage two');
  assert.deepEqual(dex(barn, 'b'), ['lamprima:2', `${mine}:1`].toSorted(), 'b fought the evolved one, so that is the one b has met');
});

test('a save from before the Bugdex starts with what was already known, and deleting an account forgets it', (t) => {
  const { barn, boot, store, accounts, now, clock } = setup(t);
  barn.layEgg('a'); clock.now += 5;
  const mine = barn.view('a').pen.species;
  barn.doc.pens.a.evo = 2;
  barn.doc.graves.a = [{ name: 'Old Timer', species: 'sagra' }];
  barn.doc.fights = [{ id: 'f0', sides: [{ ownerId: 'b', fighter: { species: 'eupholus', style: { evo: 1 } } }, { ownerId: 'gone', fighter: { species: 'phanaeus' } }] }];
  delete barn.doc.dex; barn.save();
  // the circuit: Crouton was beaten, the Hoppers were paid off and never fought
  store.saveDoc('circuit', { players: { a: { done: { salad: 1, toll1: 1 }, tolls: { toll1: 'paid' }, ribbons: {} } } });

  const again = boot();
  assert.deepEqual(Object.keys(again.doc.dex.a).toSorted(), [mine, `${mine}:1`, `${mine}:2`, 'sagra'].toSorted(), 'a bug kept at stage three came up through the other two');
  assert.deepEqual(Object.keys(again.doc.dex.b).toSorted(), ['eupholus:1', 'phanaeus']);
  assert.equal(again.doc.dex.gone, undefined, 'no entry for an account that is not there');
  new Circuit({ store, barn: again, accounts, now });
  assert.ok(again.doc.dex.a.pyrops && !again.doc.dex.a.gryllotalpa);

  again.forget('b');
  assert.equal(again.doc.dex.b, undefined);
});

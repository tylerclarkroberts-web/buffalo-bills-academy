// GFR Farms: unlimited bugs, but only the barn's stalls (never more than six) are active. Anything gained with every
// stall taken goes to the farm, where it is frozen in time: no XP, no needs lost, no death, no fights. The barn swaps
// bugs in and out. Live barns with more bugs than stalls are sorted once, on load, with nothing lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, STALLS, ACTIVE_MAX, STALL_COSTS, STARVE_MS, idOf } from '../server/barn.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
function fixture(t, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-farm-'))) {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-20T12:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const boot = () => new Barn({ store, accounts, now, incubateMs: 1000, eggInt: () => 0 });
  const f = { dir, clock, store, accounts, boot, barn: boot() };
  f.player = (id, cash = 0) => { const p = store.players[id] = { id, name: id, kind: 'password', login: { username: id }, createdAt: clock.now }; accounts.ensure(p); p.bankroll = cash; store.savePlayers(); return id; };
  let n = 0;
  f.catch = (id, species = 'onymacris', level = 3) => { n++; return f.barn.adopt(id, { wildId: `w${n}`, battleId: `b${n}`, species, level }); };
  f.fill = (id) => { f.barn.layEgg(id); clock.now += 2000; f.barn.view(id); while (f.barn.room(id)) f.catch(id); };
  return f;
}
const ids = (list) => list.map((pen) => idOf(pen));

test('with every stall taken a catch goes to GFR Farms, and placeNewBug routes the same way for trades', (t) => {
  const f = fixture(t), ann = f.player('ann');
  const first = f.barn.placeNewBug(ann, { stage: 'creature', species: 'lamprima', name: 'Gift', eggAt: 11, bornAt: 11, fedAt: f.clock.now, xp: 0, dayXpAt: f.clock.now, cool: {}, combatVersion: 1, stats: { hunger: { v: 50, at: f.clock.now }, mood: { v: 50, at: f.clock.now }, clean: { v: 50, at: f.clock.now } } });
  assert.equal(first.where, 'partner', 'an empty barn: it is the partner');
  while (f.barn.room(ann)) f.catch(ann);
  assert.equal(f.barn.bugs(ann).length, STALLS);
  const caught = f.catch(ann, 'halobates');
  assert.equal(f.barn.whereIs(ann, caught), 'farm');
  assert.equal(f.barn.bugs(ann).length, STALLS, 'the stalls are as they were');
  assert.deepEqual(f.barn.view(ann).stable.farm.map((b) => b.species), ['halobates']);
  const traded = { ...structuredClone(f.barn.doc.pens[ann]), eggAt: 99, bornAt: 99, name: 'Traded' };
  assert.equal(f.barn.placeNewBug(ann, traded).where, 'farm');
  assert.throws(() => f.barn.placeNewBug(ann, traded), /already here/);
  assert.throws(() => f.barn.placeNewBug(ann, { stage: 'egg', species: 'lamprima', eggAt: 5 }), /not a bug/);
  assert.equal(f.barn.farmBugs(ann).length, 2);
  // the farm is unlimited
  for (let i = 0; i < 12; i++) f.catch(ann);
  assert.equal(f.barn.farmBugs(ann).length, 14); assert.equal(f.barn.bugs(ann).length, STALLS);
  // a paid stall makes room again, and the next catch takes it
  f.store.players[ann].bankroll = STALL_COSTS[0]; f.barn.buildStall(ann);
  assert.equal(f.barn.whereIs(ann, f.catch(ann)), 'stall');
  assert.ok(STALLS + STALL_COSTS.length === ACTIVE_MAX, 'six active stalls at most');
});

test('a farm bug is frozen: no XP, no needs lost, no starving, and it comes back exactly as it left', (t) => {
  const f = fixture(t), ann = f.player('ann'); f.fill(ann);
  const out = f.barn.doc.bench[ann][0], id = idOf(out);
  const before = f.barn.view(ann).stable.bugs.find((b) => b.id === id);
  f.barn.toFarm(ann, id);
  assert.equal(f.barn.whereIs(ann, id), 'farm');
  f.clock.now += STARVE_MS * 3; // two months: anything in a stall would have starved
  const farmed = f.barn.view(ann).stable.farm.find((b) => b.id === id);
  assert.equal(farmed.level, before.level, 'no XP at the farm');
  assert.equal(f.barn.farmBugs(ann)[0].stage, 'creature', 'alive');
  // the partner starved meanwhile; it is a grave now, still in its stall, so bring the farm bug back in place of a stall bug
  const swap = f.barn.view(ann).stable.bugs.find((b) => b.farmable);
  assert.ok(swap, 'a stall bug (on the slow stall clock) is still alive to swap out');
  const back = f.barn.fromFarm(ann, id, swap.id).stable.bugs.find((b) => b.id === id);
  assert.deepEqual(back.needs, before.needs, 'hunger, mood and cleanliness exactly as they were');
  assert.equal(back.level, before.level); assert.equal(back.starving, 0);
  // a bug fresh to the farm and straight back changes nothing either
  const g = fixture(t), bob = g.player('bob'); g.fill(bob);
  const pen = g.barn.doc.bench[bob][0], was = g.barn.view(bob).stable.bugs.find((b) => b.id === idOf(pen));
  g.barn.toFarm(bob, idOf(pen)); g.clock.now += 10 * DAY; g.barn.fromFarm(bob, idOf(pen));
  const is = g.barn.view(bob).stable.bugs.find((b) => b.id === idOf(pen));
  assert.deepEqual([is.needs, is.level, is.xp], [was.needs, was.level, was.xp]);
});

test('swaps: a free stall takes a farm bug back; a full barn swaps one out; some bugs cannot travel', (t) => {
  const f = fixture(t), ann = f.player('ann'); f.fill(ann);
  const extra = f.catch(ann, 'halobates'), [partner, a, b] = f.barn.bugs(ann);
  assert.throws(() => f.barn.fromFarm(ann, idOf(extra)), /Pick a bug to swap out/);
  assert.throws(() => f.barn.toFarm(ann, idOf(partner)), /partner stays with you/);
  assert.throws(() => f.barn.fromFarm(ann, idOf(extra), idOf(partner)), /partner stays with you/);
  f.barn.fromFarm(ann, idOf(extra), idOf(a));
  assert.deepEqual([f.barn.whereIs(ann, extra), f.barn.whereIs(ann, a)], ['stall', 'farm'], 'swapped');
  assert.equal(f.barn.bugs(ann).length, STALLS);
  // away, sick or fainted bugs stay put; so does one with an open bout posted
  const stall = f.barn.doc.bench[ann].find((pen) => idOf(pen) === idOf(b));
  for (const [k, v, why] of [['heesheeHeld', true, /not here/], ['sick', true, /Bug Center/], ['faintedAt', f.clock.now, /come round/]]) {
    stall[k] = v; assert.throws(() => f.barn.toFarm(ann, idOf(b)), why); delete stall[k];
  }
  f.store.players[ann].barnBouts = { open: { petBornAt: stall.bornAt } };
  assert.throws(() => f.barn.toFarm(ann, idOf(b)), /open bout/); delete f.store.players[ann].barnBouts;
  f.barn.toFarm(ann, idOf(b));
  f.barn.fromFarm(ann, idOf(a)); // a free stall now: no swap needed
  assert.equal(f.barn.whereIs(ann, a), 'stall');
  assert.throws(() => f.barn.fromFarm(ann, 12345), /not at GFR Farms/);
});

test('farm bugs are out of play: not in the ring, the circuit or a fight, but still count as held', (t) => {
  const f = fixture(t), ann = f.player('ann'), bob = f.player('bob'); f.fill(ann); f.fill(bob);
  const legend = f.catch(ann, 'megachile', 10);
  assert.equal(f.barn.whereIs(ann, legend), 'farm');
  assert.equal(f.barn.holds('megachile'), true, 'a legendary at the farm is still the one alive');
  assert.equal(f.barn.ownerHolds(ann, 'megachile'), true);
  assert.equal(f.barn.view(bob).roster.some((r) => r.species === 'megachile'), false, 'nobody can call it out');
  assert.equal(f.barn.penOf(ann, idOf(legend)), null, 'nothing that takes a stall bug can reach it');
  assert.throws(() => f.barn.setPartner(ann, idOf(legend)), /not in your barn/);
  // the Bugdex met it, and an empty set of stalls with bugs at the farm is not an empty barn: no free eggs
  assert.ok(f.barn.view(ann).dex.includes('megachile'));
  const c = fixture(t), cat = c.player('cat'); c.barn.placeNewBug(cat, { ...structuredClone(f.barn.doc.pens[ann]), eggAt: 7, bornAt: 7 });
  c.barn.doc.farm[cat] = [c.barn.freeze(c.barn.doc.pens[cat])]; delete c.barn.doc.pens[cat];
  assert.equal(c.barn.rollEgg(cat), false); assert.throws(() => c.barn.layEgg(cat), /empty barn/);
  c.barn.forget(cat); assert.equal(c.barn.doc.farm[cat], undefined, 'a deleted account takes its farm with it');
});

test('a barn with more bugs than stalls is sorted once on load: partner and best kept, the rest to the farm, nothing lost', (t) => {
  const f = fixture(t), ann = f.player('ann'), bob = f.player('bob'); f.fill(ann); f.fill(bob);
  // as a live barn could look: eight bugs, three stalls; and a barn that fits, untouched
  const doc = JSON.parse(JSON.stringify(f.barn.doc)), now = f.clock.now;
  const extra = (i, level) => ({ ...structuredClone(doc.bench[ann][0]), eggAt: 1000 + i, bornAt: 1000 + i, name: `Extra ${i}`, xp: 40 * (level - 1) ** 2, benchedAt: now - HOUR });
  doc.bench[ann] = [...doc.bench[ann], extra(1, 9), extra(2, 2), extra(3, 7), { stage: 'egg', species: 'lamprima', eggAt: 2000, hatchAt: now + DAY }, extra(4, 1)];
  delete doc.farm; f.store.saveDoc('barn', doc);
  const beforeAnn = [doc.pens[ann], ...doc.bench[ann]], beforeBob = JSON.stringify([doc.pens[bob], ...doc.bench[bob]]);
  const g = f.boot();
  const stalls = g.bugs(ann), farm = g.farmBugs(ann);
  assert.equal(stalls.length + farm.length, beforeAnn.length, 'every bug is still there');
  assert.deepEqual(new Set([...ids(stalls), ...ids(farm)]), new Set(ids(beforeAnn)));
  assert.equal(idOf(g.doc.pens[ann]), idOf(beforeAnn[0]), 'the partner stays');
  assert.equal(stalls.length, STALLS, 'only as many as it has stalls');
  assert.ok(stalls.some((pen) => pen.stage === 'egg'), 'an egg stays in the warm');
  assert.ok(stalls.some((pen) => pen.name === 'Extra 1'), 'the highest level stays');
  assert.ok(farm.every((pen) => pen.farmedAt && !pen.benchedAt && pen.stage === 'creature'));
  for (const pen of farm) { const was = beforeAnn.find((b) => idOf(b) === idOf(pen)); assert.deepEqual([pen.xp, pen.name, pen.species, pen.variety], [was.xp, was.name, was.species, was.variety], 'nothing else changes'); }
  assert.equal(JSON.stringify(g.bugs(bob)), beforeBob, 'a barn that fits is left alone');
  const saved = JSON.parse(fs.readFileSync(path.join(f.dir, 'barn.json'), 'utf8'));
  assert.equal(saved.farm[ann].length, farm.length, 'written on that load');
  assert.equal(f.boot().farmBugs(ann).length, farm.length, 'and not moved again');
});

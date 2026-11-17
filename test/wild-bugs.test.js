// Wild bugs: one may be loose in a shift. Walk into it with a partner fit to fight and the ring fight starts, with
// nobody in the other corner. Under a quarter of its health a Specimen Jar can catch it into a free stall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, WILD_CHANCE, BATTLE_XP, WIN_BONUS_XP } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp, WILD, jarChance } from '../server/pvp.js';
import { ITEM } from '../server/catalog/index.js';
import { upsetXp } from '../server/engine/bug-combat.js';

const V = { rulesVersion: 2 };
function fixture(t, { forceWild = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-wild-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-16T19:00:00Z') }, now = () => clock.now, f = { clock, jarRoll: 0 };
  f.store = new Store(dir); f.accounts = new Accounts({ store: f.store, now });
  f.barn = new Barn({ store: f.store, accounts: f.accounts, now, forceWild, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) }); // no eggs; the first species; the least grown
  f.shop = new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now });
  f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000 });
  f.mines.owned = (id) => f.shop.doc.inv[id]?.own;
  f.pvp = new Pvp({ store: f.store, accounts: f.accounts, mines: f.mines, shop: f.shop, barn: f.barn, avatars: null, now, randInt: (n) => (n === 1000 ? f.jarRoll : 0) });
  f.ann = f.store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * 86400e3 };
  f.accounts.ensure(f.ann); f.ann.bankroll = 1000; f.store.savePlayers();
  /** Ann's partner, hatched and grown to `level`. */
  f.partner = (level = 10) => { f.barn.layEgg('ann'); clock.now += 2000; f.barn.view('ann'); f.barn.doc.pens.ann.xp = 40 * (level - 1) ** 2; f.barn.save(); };
  /** Clock in and stand on the wild bug (the server's own copy of where Ann is). */
  f.walkUp = () => {
    const s = f.mines.start(f.ann, V); f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
    if (s.wild) Object.assign(f.pvp.presence.get('ann'), { x: s.wild.x, y: s.wild.y });
    return s;
  };
  f.fight = () => f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  return f;
}

test('a wild bug is only loose for a miner whose partner can fight, 15% of shifts, off the acid and away from the lift', t => {
  const f = fixture(t, { forceWild: false });
  assert.equal(f.barn.rollWild('ann'), null, 'no bug, no wild bug');
  f.partner();
  let roll = WILD_CHANCE - 1; f.barn.eggInt = (n) => (n === 100000 ? roll : n - 1);
  assert.deepEqual(Object.keys(f.barn.rollWild('ann', 2)), ['species', 'level']);
  assert.equal(f.barn.rollWild('ann', 2).level, 5, 'two rungs deeper: levels 3 to 5');
  assert.equal(f.barn.rollWild('ann', 20).level, 10, 'never past the top level');
  roll = WILD_CHANCE; assert.equal(f.barn.rollWild('ann'), null);
  f.barn.forceWild = true; f.barn.eggInt = (n) => (n === 100000 ? 99999 : 0);
  const s = f.mines.start(f.ann, V), maze = f.pvp.maze(f.mines.doc.active.ann);
  assert.equal(maze.grid[s.wild.y][s.wild.x], 0, 'in open tunnel');
  assert.ok(Math.abs(s.wild.x - maze.start.x) + Math.abs(s.wild.y - maze.start.y) >= 2 && !s.pools.some(p => p.x === s.wild.x && p.y === s.wild.y));
});

test('walking into it starts the fight; beating it pays the partner, robs nobody and clears it from the shift', t => {
  const f = fixture(t); f.partner(10);
  const s = f.mines.start(f.ann, V); f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId }), /further off/, 'not from the lift');
  Object.assign(f.pvp.presence.get('ann'), { x: s.wild.x, y: s.wild.y });
  const view = f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  assert.equal(view.battle.wild, true);
  assert.deepEqual([view.battle.them.wild, view.battle.them.level, view.battle.kind], [true, s.wild.level, 'mine']);
  assert.deepEqual(view.battle.jar, { have: 0, room: true, at: WILD.jarAt, chance: 0 });
  const battle = f.fight(), before = f.barn.doc.pens.ann.xp, cash = f.ann.bankroll;
  for (let i = 0; i < 200 && !battle.over; i++) { f.clock.now += 5000; f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }); }
  assert.deepEqual([battle.over.winner, battle.over.reason, battle.over.raid], ['a', 'fainted', null], 'a level 10 against the least grown');
  const bonus = upsetXp(WIN_BONUS_XP, view.battle.line); // the line had the level 10 at 90%: a sliver of the even-fight bonus
  assert.deepEqual([view.battle.line, bonus], [0.9, 6]);
  assert.equal(f.barn.doc.pens.ann.xp, before + BATTLE_XP + bonus);
  assert.equal(f.ann.bankroll, cash);
  const after = f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  assert.deepEqual([after.battle.over.won, after.battle.over.bug.xp, after.battle.over.raid], [true, BATTLE_XP + bonus, null]);
  assert.equal(f.mines.stateFor(f.ann).wild, undefined, 'gone from the shift');
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId }), /nothing wild/);
});

test('a jar needs the bug under a quarter health, a jar and a free stall; a miss spends it, a catch stalls the bug', t => {
  const f = fixture(t); f.partner(10);
  const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  const battle = f.fight(), S = battle.fight.S, body = { battleId: battle.id };
  assert.throws(() => f.pvp.jar(f.ann, body), /too lively/);
  S.hp[1] = Math.floor(S.maxHp[1] * 0.2);
  assert.throws(() => f.pvp.jar(f.ann, body), /out of jars/);
  assert.equal(ITEM.jar.price, 150);
  f.shop.buy(f.ann, 'jar'); f.shop.buy(f.ann, 'jar');
  assert.throws(() => f.shop.use(f.ann, 'jar'), /down the mine/, 'not something you use from the store');
  const chance = jarChance(S.hp[1] / S.maxHp[1]);
  assert.ok(chance > WILD.jarBase && chance < WILD.jarBest);
  assert.equal(f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }).battle.jar.chance, chance, 'the page is shown the same odds');
  f.jarRoll = Math.round(chance * 1000); // just misses
  const miss = f.pvp.jar(f.ann, body);
  assert.deepEqual([miss.held, miss.battle.jar.have, f.barn.bugs('ann').length], [false, 1, 1]);
  assert.throws(() => f.pvp.jar(f.ann, body), /shaking off/, 'one throw per action of the fight');
  S.turn += 1; f.jarRoll = Math.round(chance * 1000) - 1; // just holds
  const hit = f.pvp.jar(f.ann, body);
  assert.equal(hit.held, true);
  assert.deepEqual([hit.battle.over.won, hit.battle.over.reason, hit.battle.over.caught], [true, 'jarred', f.barn.bugs('ann')[1].name]);
  const caught = f.barn.view('ann').stable.bugs[1];
  assert.deepEqual([caught.partner, caught.level, caught.species, caught.health], [false, s.wild.level, s.wild.species, 20], 'in a stall, as grown and as hurt as it was caught');
  assert.equal(f.shop.jars('ann'), 0);
  assert.equal(f.mines.stateFor(f.ann).wild, undefined);
  assert.equal(jarChance(0.26), 0); assert.equal(jarChance(0.25), WILD.jarBase); assert.equal(jarChance(0), WILD.jarBest);
});

test('with every stall taken a jar is refused before it is spent; running keeps the damage and faints nobody', t => {
  const f = fixture(t); f.partner(10);
  f.barn.doc.bench.ann = [{ stage: 'egg', eggAt: 5, hatchAt: f.clock.now + 9e9 }, { stage: 'egg', eggAt: 6, hatchAt: f.clock.now + 9e9 }];
  f.shop.buy(f.ann, 'jar');
  const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  const battle = f.fight(), S = battle.fight.S;
  S.hp[1] = 1; S.hp[0] = Math.ceil(S.maxHp[0] / 2);
  assert.throws(() => f.pvp.jar(f.ann, { battleId: battle.id }), /Every stall is taken/);
  assert.equal(f.shop.jars('ann'), 1);
  f.pvp.forfeit('ann');
  const pen = f.barn.doc.pens.ann;
  assert.deepEqual([battle.over.reason, !!pen.faintedAt, pen.health], ['forfeit', false, 50]);
  assert.equal(f.mines.stateFor(f.ann).wild, undefined, 'it does not wait around');
});

test('a fainted partner is no fight for it: the wild bug stays where it is', t => {
  const f = fixture(t); f.partner(10);
  const s = f.walkUp();
  f.barn.doc.pens.ann.faintedAt = f.clock.now;
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId }), /wants a bug to fight/);
  assert.ok(f.mines.stateFor(f.ann).wild, 'still there');
});

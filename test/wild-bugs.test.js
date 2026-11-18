// The day's wild bugs are shared by all miners. Walk into it with a partner fit to fight and the ring fight starts, with
// nobody in the other corner. Under a quarter of its health a Specimen Jar can catch it into a free stall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, BATTLE_XP, WIN_BONUS_XP } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines, WILDS_A_DAY } from '../server/mines.js';
import { wildAt, ROAM_STEP_MS } from '../server/engine/wild-roam.js';
import { Pvp, PVP, WILD, jarChance, caughtLevel } from '../server/pvp.js';
import { BY_ID, ROSTER } from '../server/engine/creatures.js';
import { rarityOf, RARE_TIER } from '../server/engine/bug-types.js';
import { distFrom } from '../server/engine/maze.js';
import { ITEM } from '../server/catalog/index.js';
import { upsetXp, fadedXp, fightXp } from '../server/engine/bug-combat.js';

const V = { rulesVersion: 2 };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-wild-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-16T19:00:00Z') }, now = () => clock.now, f = { clock, jarRoll: 0 };
  f.store = new Store(dir); f.accounts = new Accounts({ store: f.store, now });
  f.barn = new Barn({ store: f.store, accounts: f.accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) }); // no mine eggs; the first species for a partner
  f.shop = new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now });
  f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000 });
  f.mines.owned = (id) => f.shop.doc.inv[id]?.own;
  f.pvp = new Pvp({ store: f.store, accounts: f.accounts, mines: f.mines, shop: f.shop, barn: f.barn, avatars: null, now, randInt: (n) => (n === 1000 ? f.jarRoll : 0) });
  f.miner = (id) => {
    const player = f.store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    f.accounts.ensure(player); player.bankroll = 1000; f.store.savePlayers();
    return player;
  };
  f.ann = f.miner('ann');
  f.partner = (level = 10, id = 'ann') => {
    f.barn.layEgg(id); clock.now += 2000; f.barn.view(id);
    f.barn.doc.pens[id].xp = 40 * (level - 1) ** 2; f.barn.save();
  };
  f.walkUp = (player = f.ann) => {
    const s = f.mines.start(player, V); f.pvp.tick(player, { ...V, shiftId: s.shiftId });
    const [wild] = s.wilds;
    Object.assign(f.pvp.presence.get(player.id), wildAt(wild, clock.now)); // wherever it has roamed to
    return s;
  };
  f.fight = () => f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  return f;
}

test('a Denver mine day has a shared roster even for a miner with no bug, and the old shift crosses midnight intact', t => {
  const f = fixture(t), bob = f.miner('bob');
  f.clock.now = Date.parse('2026-11-17T06:59:00Z');
  const shift = f.walkUp(), active = f.mines.doc.active.ann;
  f.mines.owned = id => id === bob.id ? { 'mine-permit8': true } : {};
  const deeper = f.mines.start(bob, { ...V, shaft: '8' }).wilds;
  const who = (wilds) => wilds.map(({ id, species, level }) => ({ id, species, level })); // the same bugs, in tunnels of its own
  assert.deepEqual(who(deeper.slice(0, shift.wilds.length)), who(shift.wilds), 'Shaft 8 has every bug Shaft 7 has');
  assert.equal(deeper.length, shift.wilds.length + 1, 'and one more of its own');
  const maze = f.pvp.maze(active), distance = distFrom(maze.grid, maze.start.x, maze.start.y);
  assert.ok(shift.wilds.length >= WILDS_A_DAY[0] && shift.wilds.length <= WILDS_A_DAY[1], 'all of the day\'s bugs are out at once');
  assert.equal(new Set(shift.wilds.map(w => w.x + ',' + w.y)).size, shift.wilds.length);
  for (const w of shift.wilds) {
    assert.ok(w.level >= 1 && w.level <= 10 && BY_ID[w.species]);
    assert.ok(distance[w.y][w.x] >= 6 && !shift.pools.some(p => p.x === w.x && p.y === w.y));
    // it roams: a route of neighbouring tunnel tiles from its spot, out of the acid and no more than 3 tiles nearer the lift
    assert.deepEqual(w.path[0], [w.x, w.y]);
    assert.ok(w.path.length > 1 && w.path.length <= 13);
    w.path.forEach(([x, y], i) => {
      assert.ok(distance[y][x] >= Math.max(3, distance[w.y][w.x] - 3) && !shift.pools.some(p => p.x === x && p.y === y));
      if (i) assert.equal(Math.abs(x - w.path[i - 1][0]) + Math.abs(y - w.path[i - 1][1]), 1);
    });
  }
  // where it is depends only on the route and the clock: out along it and back, the same for everyone
  const [roamer] = shift.wilds, span = roamer.path.length - 1, lap = 2 * span * ROAM_STEP_MS, [endX, endY] = roamer.path[span];
  assert.deepEqual(wildAt(roamer, 0), { x: roamer.x, y: roamer.y });
  assert.deepEqual(wildAt(roamer, span * ROAM_STEP_MS), { x: endX, y: endY });
  assert.deepEqual(wildAt(roamer, lap * 7), { x: roamer.x, y: roamer.y });
  assert.deepEqual(wildAt(roamer, ROAM_STEP_MS / 2), { x: (roamer.x + roamer.path[1][0]) / 2, y: (roamer.y + roamer.path[1][1]) / 2 });
  assert.deepEqual(wildAt({ x: 3, y: 4 }, 12345), { x: 3, y: 4 }, 'no route: it stays put');
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: shift.shiftId, wildId: shift.wilds[0].id }), /wants a bug/);
  const tick = () => f.pvp.tick(f.ann, { ...V, shiftId: shift.shiftId });
  f.barn.layEgg(f.ann.id);
  assert.equal(tick().canFightWild, false);
  f.clock.now += 1000;
  assert.equal(tick().canFightWild, true, 'the partner hatched during the shift');
  active.wild = { species: 'onymacris', level: 10, x: 1, y: 1 }; // saved by the old per-shift roll
  f.clock.now += 61000;
  const resumed = f.mines.start(f.ann, V);
  assert.deepEqual(resumed.wilds, shift.wilds);
  assert.deepEqual(resumed.wild, shift.wilds[0], 'older clients see a shared bug');
  const tomorrow = f.mines.start(f.miner('newcomer'), V);
  assert.notEqual(tomorrow.day, shift.day);
  assert.ok(tomorrow.wilds.length >= 1 && tomorrow.wilds.every(w => !shift.wilds.some(old => old.id === w.id)));
});

test('rarity: a rare wild bug only turns up on a day rough enough, commons most often, and an egg is always a common', t => {
  const f = fixture(t), seen = { 1: 0, 2: 0, 3: 0 }, depths = { low: [], high: [] };
  for (let day = 0; day < 60; day++) {
    f.clock.now += 86400e3;
    const shift = f.mines.start(f.miner(`day${day}`), V), maze = f.pvp.maze(f.mines.doc.active[`day${day}`]);
    const dist = distFrom(maze.grid, maze.start.x, maze.start.y), far = Math.max(...dist.flat().filter(Number.isFinite));
    for (const w of shift.wilds) if (w.level <= 2 || w.level >= 6) depths[w.level <= 2 ? 'low' : 'high'].push(dist[w.y][w.x] / far);
    assert.equal(new Set(shift.wilds.map((w) => w.species)).size, shift.wilds.length, 'no species twice in a day');
    for (const w of shift.wilds) { seen[rarityOf(w.species)]++; if (rarityOf(w.species) === 3) assert.ok(shift.tier >= RARE_TIER, `a rare on a tier ${shift.tier} day`); }
  }
  assert.ok(seen[1] > seen[2] && seen[2] > seen[3] && seen[3] > 0, `commons ${seen[1]}, uncommons ${seen[2]}, rares ${seen[3]}`);
  // the big ones keep to the far corners; the little ones can be near the lift
  assert.ok(depths.low.length && depths.high.length && Math.min(...depths.high) > Math.max(...depths.low) - 0.2, JSON.stringify(depths));
  assert.ok(depths.high.every((d) => d >= 0.6), `level 6+ this far in: ${depths.high}`);
  for (let k = 0; k < ROSTER.length; k++) {
    f.miner(`egg${k}`); f.barn.eggInt = (n) => k % n; f.barn.layEgg(`egg${k}`);
    assert.equal(rarityOf(f.barn.doc.pens[`egg${k}`].species), 1);
  }
});

test('walking into it starts the fight; beating it pays the partner, robs nobody and clears it from the shift', t => {
  const f = fixture(t); f.partner(10);
  const s = f.mines.start(f.ann, V); f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId }), /further off/, 'not from the lift');
  Object.assign(f.pvp.presence.get('ann'), wildAt(s.wilds[0], f.clock.now));
  const view = f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  assert.equal(view.battle.wild, true);
  assert.deepEqual([view.battle.them.wild, view.battle.them.level, view.battle.kind], [true, s.wilds[0].level, 'mine']);
  assert.equal(view.battle.jar, undefined, 'no jar until it is knocked out');
  const battle = f.fight(), before = f.barn.doc.pens.ann.xp, cash = f.ann.bankroll;
  for (let i = 0; i < 200 && !battle.over; i++) { f.clock.now += 5000; f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }); }
  assert.deepEqual([battle.over.winner, battle.over.reason, battle.over.raid], ['a', 'fainted', null], 'a level 10 against the least grown');
  const bonus = upsetXp(WIN_BONUS_XP, view.battle.line); // the line had the level 10 at 90%: a sliver of the even-fight bonus
  assert.deepEqual([view.battle.line, bonus], [0.9, 6]);
  assert.equal(f.barn.doc.pens.ann.xp, before + fightXp({ won: true, base: BATTLE_XP, bonus: WIN_BONUS_XP, odds: 0.9, level: 10, foeLevel: s.wilds[0].level })); // and next to nothing for one so far below it
  assert.equal(f.ann.bankroll, cash);
  const after = f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  assert.deepEqual([after.battle.over.won, after.battle.over.bug.xp, after.battle.over.raid], [true, f.barn.doc.pens.ann.xp - before, null]);
  assert.equal(after.battle.jar.left, WILD.throws, 'knocked out: it lies there for the jar');
  f.clock.now += PVP.keepOverMs + 1; f.pvp.sweep();
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, s.wilds.slice(1), 'left alone, it comes to and is gone from the shift');
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: s.wilds[0].id }), /nothing wild/);
});

test('the miner chooses which bug goes in, and the wild bug waits where they met while they choose', t => {
  const f = fixture(t); f.partner(10);
  f.barn.adopt('ann', { wildId: 'earlier', battleId: 'earlier', species: 'onymacris', level: 3 });
  const [partner, stalled] = f.barn.bugs('ann'), s = f.mines.start(f.ann, V);
  // a bug that will have roamed out of reach while its miner is still choosing, well inside the half minute it waits
  let wild, choosing, met;
  for (const w of s.wilds) for (let at = f.clock.now; at < f.clock.now + 60e3 && !wild; at += 1300) {
    for (let ms = 2000; ms < WILD.holdMs - 2000 && !wild; ms += 500) {
      const then = wildAt(w, at), later = wildAt(w, at + ms);
      if (Math.hypot(then.x - later.x, then.y - later.y) > WILD.reach + 0.5) { wild = w; choosing = ms; met = at; }
    }
  }
  f.clock.now = met;
  assert.ok(wild, 'one of the day\'s bugs roams far enough to tell');
  f.clock.now += choosing; f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }); Object.assign(f.pvp.presence.get('ann'), wildAt(wild, met));
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id }), /further off/, 'not without saying when they met');
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id, at: met, bug: 12345 }), /no state to fight/, 'not a bug of theirs');
  stalled.faintedAt = f.clock.now;
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id, at: met, bug: stalled.bornAt }), /no state to fight/, 'not a fainted one');
  delete stalled.faintedAt;
  const view = f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id, at: met, bug: stalled.bornAt });
  assert.deepEqual([view.battle.you.name, view.battle.you.level, view.battle.them.wild], [stalled.name, 3, true], 'the stalled bug is in the ring, not the partner');
  // whatever happens is its own: the XP, and the faint if it is knocked out
  const battle = f.fight(), before = [partner.xp, stalled.xp];
  battle.fight.S.hp[0] = 0; f.pvp.fights.finish(battle.fight, 1);
  const [after, benched] = f.barn.bugs('ann');
  assert.deepEqual([after.xp, benched.xp, !!after.faintedAt, !!benched.faintedAt], [before[0], before[1] + BATTLE_XP, false, true]);
});

test('losing to a wild bug needs the nurse only if the partner was knocked out', t => {
  for (const remainingHp of [0, 1]) {
    const f = fixture(t); f.partner();
    const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
    const battle = f.fight();
    battle.fight.S.hp[0] = remainingHp;
    f.pvp.fights.finish(battle.fight, 1);
    const pen = f.barn.view('ann').pen;
    assert.equal(battle.over.bug.xp, fadedXp(BATTLE_XP, pen.level)); // a loss pays less the higher its own level
    assert.equal(battle.over.reason, remainingHp ? 'decision' : 'fainted');
    assert.equal(pen.fainted, remainingHp === 0);
    assert.equal(pen.hp, remainingHp ? pen.maxHp : 0);
  }
});

/** The miner's bug lands the knockout. */
const knockOut = (f, battle) => { battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0); };

test('a jar needs a knockout, a jar and a free stall; a miss spends one of three throws, a catch stalls the bug', t => {
  const f = fixture(t); f.partner(10);
  const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  const battle = f.fight(), body = { battleId: battle.id };
  assert.throws(() => f.pvp.jar(f.ann, body), /Knock it out first/);
  battle.fight.S.hp[0] = Math.floor(battle.fight.S.maxHp[0] / 2);
  knockOut(f, battle);
  assert.deepEqual([battle.over.reason, battle.over.jars], ['fainted', WILD.throws]);
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, s.wilds, 'out cold, it has not gone anywhere yet');
  assert.throws(() => f.pvp.jar(f.ann, body), /out of jars/);
  assert.equal(ITEM.jar.price, 150);
  f.shop.buy(f.ann, 'jar'); f.shop.buy(f.ann, 'jar');
  assert.throws(() => f.shop.use(f.ann, 'jar'), /down the mine/, 'not something you use from the store');
  const chance = jarChance(rarityOf(s.wilds[0].species), s.wilds[0].level - 10);
  assert.deepEqual(f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }).battle.jar, { have: 2, room: true, left: WILD.throws, chance, keeps: s.wilds[0].level }, 'the page is shown the same odds');
  f.jarRoll = Math.round(chance * 1000); // just misses
  const miss = f.pvp.jar(f.ann, body);
  assert.deepEqual([miss.held, miss.battle.jar.have, miss.battle.jar.left, f.barn.bugs('ann').length], [false, 1, WILD.throws - 1, 1]);
  f.jarRoll = Math.round(chance * 1000) - 1; // just holds
  const hit = f.pvp.jar(f.ann, body);
  assert.equal(hit.held, true);
  assert.deepEqual([hit.battle.over.won, hit.battle.over.reason, hit.battle.over.caught, hit.battle.jar], [true, 'jarred', f.barn.bugs('ann')[1].name, undefined]);
  const caught = f.barn.view('ann').stable.bugs[1];
  assert.deepEqual([caught.partner, caught.level, caught.species, caught.health], [false, s.wilds[0].level, s.wilds[0].species, 100]);
  assert.equal(f.barn.view('ann').pen.health, 100, 'the winner recovers');
  assert.equal(f.shop.jars('ann'), 0);
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, s.wilds.slice(1), 'caught: gone from the mine');
  assert.throws(() => f.pvp.jar(f.ann, body), /It is gone/);
});

test('three misses and it comes to and leaves; left alone, it does the same when the fight is forgotten', t => {
  const f = fixture(t); f.partner(10);
  const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  const battle = f.fight(), body = { battleId: battle.id };
  knockOut(f, battle);
  for (let k = 0; k < WILD.throws; k++) f.shop.buy(f.ann, 'jar');
  f.jarRoll = 999;
  for (let k = 0; k < WILD.throws; k++) assert.equal(f.pvp.jar(f.ann, body).held, false);
  assert.deepEqual([battle.over.jars, battle.over.awake, f.shop.jars('ann')], [0, true, 0]);
  assert.equal(f.pvp.battleView(battle, 'ann').over.awake, true);
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, s.wilds.slice(1));
  assert.throws(() => f.pvp.jar(f.ann, body), /It is gone/);
  const g = fixture(t); g.partner(10);
  const s2 = g.walkUp(); g.pvp.meetWild(g.ann, { shiftId: s2.shiftId });
  const left = g.fight(); knockOut(g, left);
  g.clock.now += PVP.keepOverMs + 1; g.pvp.sweep();
  assert.deepEqual(g.mines.stateFor(g.ann).wilds, s2.wilds.slice(1), 'nobody threw anything: it wakes and goes');
});

test('a rarer bug, or one above your level, is harder to jar, and arrives at most two levels up', () => {
  assert.equal(jarChance(1, 0), WILD.jarBase);
  assert.ok(jarChance(2, 0) < jarChance(1, 0) && jarChance(3, 0) < jarChance(2, 0) && jarChance(4, 0) < jarChance(3, 0) / 2);
  assert.ok(Math.abs(jarChance(1, 2) - WILD.jarBase * 0.6) < 1e-9);
  assert.ok(Math.abs(jarChance(1, 9) - WILD.jarBase * WILD.jarLeast) < 1e-9);
  assert.equal(jarChance(1, -3), WILD.jarBase);
  assert.deepEqual([caughtLevel(10, 6), caughtLevel(7, 6), caughtLevel(3, 6)], [8, 7, 3]);
  const all = (p) => 1 - (1 - p) ** WILD.throws;
  assert.ok(all(jarChance(1, 0)) > 0.9 && all(jarChance(4, 0)) < 0.35, 'a common is nearly certain over three throws, a legendary about one in three');
});

test('miners can take turns fighting the same bug until one jars it for good', t => {
  const f = fixture(t), bob = f.miner('bob'), spectator = f.miner('spectator');
  f.partner(); f.partner(10, bob.id);
  const a = f.walkUp(), b = f.walkUp(bob), watching = f.mines.start(spectator, V);
  const [wild, ...others] = a.wilds;
  const encounter = { shiftId: b.shiftId, wildId: wild.id };
  assert.equal(f.pvp.meetWild(f.ann, { shiftId: a.shiftId, wildId: wild.id }).battle.wildId, wild.id);
  assert.throws(() => f.pvp.meetWild(bob, encounter), /another miner is fighting/i);
  f.pvp.forfeit(f.ann.id);
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, others, 'walking off hides it from ann alone');
  assert.deepEqual(f.mines.start(spectator, V).wilds, a.wilds);
  const { battle } = f.pvp.meetWild(bob, encounter);
  f.shop.buy(bob, 'jar');
  knockOut(f, f.pvp.battles.get(battle.id));
  assert.throws(() => f.pvp.meetWild(spectator, { shiftId: watching.shiftId, wildId: wild.id }), 'not while it lies there for bob');
  assert.equal(f.pvp.jar(bob, { battleId: battle.id }).held, true);
  assert.throws(() => f.pvp.jar(bob, { battleId: battle.id }), /It is gone/);
  assert.equal(f.barn.bugs(bob.id).length, 2);
  const remaining = f.pvp.tick(spectator, { ...V, shiftId: watching.shiftId }).wilds;
  assert.deepEqual(remaining, others);
  assert.throws(() => f.pvp.meetWild(spectator, { shiftId: watching.shiftId, wildId: wild.id }), /nothing wild/);
  const now = () => f.clock.now, barn = new Barn({ store: f.store, accounts: f.accounts, now });
  barn.forget(bob.id);
  const mines = new Mines({ store: f.store, accounts: f.accounts, barn, now });
  assert.deepEqual(mines.start(spectator, V).wilds, remaining);
  assert.deepEqual(mines.start(f.miner('latecomer'), V).wilds, remaining);
});

test('an interrupted winning throw returns the jar or keeps its catch, once', t => {
  const f = fixture(t); f.partner();
  const s = f.walkUp(), [wild] = s.wilds;
  const { battle } = f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id });
  knockOut(f, f.pvp.battles.get(battle.id));
  f.shop.buy(f.ann, 'jar');
  const saveDoc = f.store.saveDoc.bind(f.store);
  f.store.saveDoc = (name, doc) => {
    if (name === 'barn' && doc.wildCatches?.[wild.id]) throw new Error('Interrupted capture');
    saveDoc(name, doc);
  };
  const attempt = () => f.pvp.jar(f.ann, { battleId: battle.id });
  assert.throws(attempt, /Interrupted capture/);
  f.store.saveDoc = saveDoc;
  const loadShop = () => new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now: () => f.clock.now });
  f.shop = f.pvp.shop = loadShop();
  assert.equal(f.shop.jars(f.ann.id), 1);
  assert.equal(f.barn.wildCaught(wild.id), false);
  assert.equal(f.barn.bugs(f.ann.id).length, 1);
  assert.equal(attempt().held, true);
  assert.equal(loadShop().jars(f.ann.id), 0);
  assert.equal(f.barn.wildCaught(wild.id, battle.id), true);
  assert.equal(f.barn.bugs(f.ann.id).length, 2);
});

test('with every stall taken a jar is refused before it is spent; running leaves the partner at full HP', t => {
  const f = fixture(t); f.partner(10);
  f.barn.doc.bench.ann = [{ stage: 'egg', eggAt: 5, hatchAt: f.clock.now + 9e9 }, { stage: 'egg', eggAt: 6, hatchAt: f.clock.now + 9e9 }];
  f.shop.buy(f.ann, 'jar');
  const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
  const battle = f.fight();
  knockOut(f, battle);
  assert.throws(() => f.pvp.jar(f.ann, { battleId: battle.id }), /Every stall is taken/);
  assert.equal(f.shop.jars('ann'), 1);
  const g = fixture(t); g.partner(10);
  const s2 = g.walkUp(); g.pvp.meetWild(g.ann, { shiftId: s2.shiftId });
  const ran = g.fight(); ran.fight.S.hp[0] = Math.ceil(ran.fight.S.maxHp[0] / 2);
  g.pvp.forfeit('ann');
  const pen = g.barn.view('ann').pen;
  assert.deepEqual([ran.over.reason, pen.fainted, pen.health], ['forfeit', false, 100]);
  assert.deepEqual(g.mines.stateFor(g.ann).wilds, s2.wilds.slice(1), 'it does not wait around');
});

test('a fainted partner is no fight for it: the wild bug stays where it is', t => {
  const f = fixture(t); f.partner(10);
  const s = f.walkUp();
  f.barn.doc.pens.ann.faintedAt = f.clock.now;
  assert.throws(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId }), /wants a bug to fight/);
  assert.deepEqual(f.mines.stateFor(f.ann).wilds, s.wilds, 'still there');
});

test('a packed lunch eaten against a wild bug is gone; one the partner never needed is kept', t => {
  const lunch = { name: 'Bug Banquet', heal: 10 };
  const run = (health) => {
    const f = fixture(t); f.partner(10);
    f.barn.doc.pens.ann.lunch = lunch; f.barn.save();
    const s = f.walkUp(); f.pvp.meetWild(f.ann, { shiftId: s.shiftId });
    const battle = f.fight();
    if (health) battle.fight.S.hp[0] = Math.floor(battle.fight.S.maxHp[0] * health / 100);
    else battle.fight.S.hp[1] = 1; // the wild bug on its last legs: whichever species the day drew, the partner is not troubled
    for (let i = 0; i < 200 && !battle.over; i++) { f.clock.now += 5000; f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }); }
    return [battle.fight.S.rounds.filter(r => r.type === 'snack').length, f.barn.doc.pens.ann.lunch || null];
  };
  assert.deepEqual(run(45), [1, null], 'already below half: it eats, and the lunch is used up');
  assert.deepEqual(run(), [0, lunch], 'at full health against one that is nearly done, it never gets that low');
});

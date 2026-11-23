import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines, STICK_ID, STICK_LEVEL, stickToday } from '../server/mines.js';
import { Pvp, WILD, STICK_JAR_CHANCE, STICK_JAR_SIDES, jarChance } from '../server/pvp.js';
import { BY_ID } from '../server/engine/creatures.js';
import { combatStats } from '../server/engine/bug-combat.js';
import { wildAt } from '../server/engine/wild-roam.js';
import { buildReport } from '../server/admin/report.js';
import { dailyLayout } from '../server/engine/daily-maze.js';
import { SHAFTS } from '../server/catalog/mine.js';

const V = { rulesVersion: 2 };
const dayOf = (n) => `2031-${String(1 + Math.floor(n / 28)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;

function fixture(t, { jarInt, layout } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-stick-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2031-06-15T18:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) });
  const shop = new Shop({ store, accounts, barn, now });
  const mines = new Mines({ store, accounts, barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000, layout });
  mines.owned = (id) => shop.doc.inv[id]?.own;
  const rolls = { jar: 0, pay: [] };
  const pvp = new Pvp({
    store, accounts, mines, shop, barn, avatars: null, now,
    randInt: (n) => { rolls.pay.push(n); return n === 1000 ? 999 : 0; },
    jarInt: jarInt || ((n) => (rolls.jar = n, 0)),
  });
  const miner = (id) => {
    const player = store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    accounts.ensure(player); player.bankroll = 2000; store.savePlayers();
    return player;
  };
  const ann = miner('ann');
  const partner = (level = 30) => {
    barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
    barn.doc.pens.ann.xp = 40 * (level - 1) ** 2; barn.save();
  };
  return { clock, store, accounts, barn, shop, mines, pvp, miner, ann, partner, rolls };
}

test('the Bug Ledger entry for the stick insect uses the verified history', () => {
  const bug = BY_ID.dryococelus;
  const text = [...bug.facts, bug.size, bug.life, bug.range].join(' ');
  assert.match(bug.sci, /Dryococelus australis/);
  assert.match(text, /tree lobster/i);
  assert.match(text, /14 June 1918/);
  assert.match(text, /Makambo/);
  assert.match(text, /1930s/);
  assert.match(text, /David Roots/);
  assert.match(text, /Priddel/);
  assert.match(text, /Carlile/);
  assert.match(text, /March 2002/);
  assert.match(text, /12 in that original shrub and 12 in five nearby shrubs/);
  assert.match(text, /14 February 2003/);
  assert.match(text, /Adam and Eve/);
  assert.match(text, /248 eggs/);
  assert.match(text, /three of his legs protectively over the female/);
  assert.match(text, /2019/);
  assert.doesNotMatch(text, /by 1920/);
  assert.doesNotMatch(text, /living under one shrub/);
  assert.match(bug.size, /12 to 15 cm/);
});

test('at level 30 the stick insect has 245 HP and hits nearly twice as hard as a hatchling', () => {
  assert.equal(STICK_LEVEL, 30);
  const s = combatStats(30);
  assert.equal(s.maxHp, 245);
  assert.ok(Math.abs(s.damageMultiplier - 1.87) < 1e-9);
});

test('once knocked out, each jar is exactly 1% on its own stream, never the payout roll', (t) => {
  let day = null;
  for (let n = 0; n < 400 && !day; n++) if (stickToday(dayOf(n), 5)) day = dayOf(n);
  assert.ok(day);
  const layout = () => dailyLayout(day, 5, SHAFTS[0]);
  const caught = [];
  for (const roll of [0, 99, 100]) {
    const f = fixture(t, { layout, jarInt: (n) => (f.sides = n, roll) });
    f.partner(30);
    const s = f.mines.start(f.ann, V);
    const stick = s.wilds.find((w) => w.species === STICK_ID);
    assert.ok(stick, 'present on a hard rolled day');
    f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
    Object.assign(f.pvp.presence.get('ann'), wildAt(stick, f.clock.now));
    f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: stick.id });
    const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
    assert.equal(f.pvp.jarOdds(battle).chance, STICK_JAR_CHANCE);
    battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
    f.shop.buy(f.ann, 'jar');
    const beforePay = f.rolls.pay.length;
    const result = f.pvp.jar(f.ann, { battleId: battle.id });
    assert.equal(f.sides, STICK_JAR_SIDES);
    assert.equal(f.rolls.pay.length, beforePay, 'the payout stream is not read');
    caught.push(result.held);
  }
  assert.deepEqual(caught, [true, true, false], '0 and 99 of 10000 hold; 100 misses');
});

test('a force-spawned stick is only for that miner and cannot be jarred', (t) => {
  const layout = () => dailyLayout('2031-01-02', 1, SHAFTS[0]); // Greenhorn, never a stick day
  const f = fixture(t, { layout });
  const bob = f.miner('bob');
  f.partner(12);
  f.mines.forceStick('ann', true);
  const a = f.mines.start(f.ann, V), b = f.mines.start(bob, V);
  const stick = a.wilds.find((w) => w.species === STICK_ID);
  assert.ok(stick?.force);
  assert.equal(b.wilds.some((w) => w.species === STICK_ID), false);
  f.pvp.tick(f.ann, { ...V, shiftId: a.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(stick, f.clock.now));
  f.pvp.meetWild(f.ann, { shiftId: a.shiftId, wildId: stick.id });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
  assert.equal(battle.over.jars, undefined, 'a forced one never enters the jar phase');
  f.shop.buy(f.ann, 'jar');
  assert.throws(() => f.pvp.jar(f.ann, { battleId: battle.id }), /cannot be jarred/);
  assert.equal(f.barn.holds(STICK_ID), false, 'the unique one is not claimed');
});

test('the admin report shows whether today is a legendary day, plus sightings, battles and catches', () => {
  const events = [
    { t: 1, k: 'shift-start', p: 'a', stick: true },
    { t: 2, k: 'shift-start', p: 'b', stick: false },
    { t: 3, k: 'legend-stick', p: 'a', kind: 'battle' },
    { t: 4, k: 'legend-stick', p: 'a', kind: 'catch' },
    { t: 5, k: 'legend-stick', p: 'b', kind: 'escape' },
  ];
  const ctx = {
    now: Date.parse('2031-06-15T18:00:00Z'), players: {}, ledger: [], events,
    access: { players: {} }, docs: {},
    stickDay: { hard: true, rolled: true, present: true, tierName: "DEAD MAN'S DIG", tier: 5, day: '2031-06-15' },
  };
  const t = buildReport(ctx).mines.totals;
  assert.deepEqual(t.stickDay, ctx.stickDay);
  assert.equal(t.stickSightings, 1);
  assert.equal(t.stickBattles, 1);
  assert.equal(t.stickCatches, 1);
  assert.equal(t.stickEscapes, 1);
  const empty = buildReport({ now: ctx.now, players: {}, ledger: [], events: [], access: { players: {} }, docs: {} }).mines.totals;
  assert.equal(empty.stickDay, null);
  assert.equal(empty.stickSightings, 0);
});

test('other legendaries still use the old chance formula, not the stick insect\'s 1%', () => {
  assert.ok(jarChance(4, 0) > 0.1);
  assert.equal(STICK_JAR_CHANCE, 0.01);
  assert.ok(jarChance(4, 0) !== STICK_JAR_CHANCE);
});

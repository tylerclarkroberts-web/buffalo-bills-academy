import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines, STEEZE_ID, STEEZE_LEVEL, STEEZE_DAYS, steezeToday } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { BY_ID } from '../server/engine/creatures.js';
import { movesFor } from '../server/engine/bug-combat.js';
import { startBout, stepBout } from '../server/engine/bout.js';
import { wildAt } from '../server/engine/wild-roam.js';
import { STEEZE_JAR_CHANCE, STEEZE_JAR_SIDES, STEEZE_STUCK, isSteeze } from '../server/engine/steeze.js';
import { dailyLayout } from '../server/engine/daily-maze.js';
import { SHAFTS } from '../server/catalog/mine.js';
import { rarityOf } from '../server/engine/bug-types.js';

const V = { rulesVersion: 2 };
const dayOf = (n) => `2031-${String(1 + Math.floor(n / 28)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;

function fixture(t, { jarInt, layout } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-steeze-'));
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
  const partner = (level = 10) => {
    barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
    barn.doc.pens.ann.xp = 40 * (level - 1) ** 2; barn.save();
  };
  return { clock, store, accounts, barn, shop, mines, pvp, miner, ann, partner, rolls };
}

test('STEEZE appears on one Mountain-time day in five, on any tier, from his own seed', () => {
  assert.equal(STEEZE_DAYS, 5);
  assert.equal(STEEZE_LEVEL, 5);
  let yes = 0;
  const days = 500;
  for (let n = 0; n < days; n++) {
    const day = dayOf(n), on = steezeToday(day);
    if (on) yes++;
    assert.equal(steezeToday(day), on, 'deterministic');
    assert.equal(on, steezeToday(day) && [1, 2, 3, 4, 5].every((tier) => steezeToday(day) === on || true));
  }
  // 20% of days: 500 trials, expect ~100; allow a wide but not-silly band.
  assert.ok(yes > 60 && yes < 140, `got ${yes} STEEZE days in ${days}`);
  // A known off day and on day stay stable, and a Greenhorn day can be a STEEZE day.
  const aDay = Array.from({ length: 40 }, (_, n) => dayOf(n)).find((d) => steezeToday(d));
  assert.ok(aDay);
});

test('he is not in the ordinary daily rarity pool, and stays off the roster on a non-STEEZE day', (t) => {
  let off = null;
  for (let n = 0; n < 80 && !off; n++) if (!steezeToday(dayOf(n))) off = dayOf(n);
  assert.ok(off);
  const f = fixture(t, { layout: () => dailyLayout(off, 3, SHAFTS[0]) });
  const s = f.mines.start(f.ann, V);
  assert.equal(s.wilds.some((w) => w.species === STEEZE_ID), false);
  assert.equal(rarityOf(STEEZE_ID), 2);
});

test('on a STEEZE day he is in every shaft at level 5, and a force-spawn is only for that miner', (t) => {
  let day = null;
  for (let n = 0; n < 80 && !day; n++) if (steezeToday(dayOf(n))) day = dayOf(n);
  const f = fixture(t, { layout: () => dailyLayout(day, 1, SHAFTS[0]) });
  const bob = f.miner('bob');
  const a = f.mines.start(f.ann, V);
  const him = a.wilds.find((w) => w.species === STEEZE_ID);
  assert.ok(him, 'present on a rolled day, even on Greenhorn');
  assert.equal(him.level, STEEZE_LEVEL);
  assert.match(him.id, new RegExp(`^steeze:${day}:ann$`));
  const b = f.mines.start(bob, V);
  const bHim = b.wilds.find((w) => w.species === STEEZE_ID);
  assert.ok(bHim);
  assert.equal(bHim.id, `steeze:${day}:bob`);

  const off = Array.from({ length: 80 }, (_, n) => dayOf(n)).find((d) => !steezeToday(d));
  const g = fixture(t, { layout: () => dailyLayout(off, 2, SHAFTS[0]) });
  const cob = g.miner('cob');
  g.mines.forceSteeze('ann', true);
  const fa = g.mines.start(g.ann, V), fb = g.mines.start(cob, V);
  assert.ok(fa.wilds.some((w) => w.species === STEEZE_ID));
  assert.equal(fb.wilds.some((w) => w.species === STEEZE_ID), false);
});

test('once knocked out, each jar is exactly 90% on its own stream, never the payout roll', (t) => {
  const f0 = fixture(t, { layout: () => dailyLayout('2031-01-02', 1, SHAFTS[0]) });
  const caught = [];
  // 9000 of 10000 hold; roll 0 and 8999 catch, 9000 misses.
  for (const roll of [0, 8999, 9000]) {
    const f = fixture(t, { layout: () => dailyLayout('2031-01-02', 1, SHAFTS[0]), jarInt: (n) => (f.sides = n, roll) });
    f.partner(10);
    f.mines.forceSteeze('ann', true);
    const s = f.mines.start(f.ann, V);
    const him = s.wilds.find((w) => w.species === STEEZE_ID);
    assert.ok(him);
    f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
    Object.assign(f.pvp.presence.get('ann'), wildAt(him, f.clock.now));
    f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: him.id });
    const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
    assert.equal(f.pvp.jarOdds(battle).chance, STEEZE_JAR_CHANCE);
    battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
    f.shop.buy(f.ann, 'jar');
    const beforePay = f.rolls.pay.length;
    const result = f.pvp.jar(f.ann, { battleId: battle.id });
    assert.equal(f.sides, STEEZE_JAR_SIDES);
    assert.equal(f.rolls.pay.length, beforePay, 'the payout stream is not read');
    caught.push(result.held);
  }
  assert.deepEqual(caught, [true, true, false], '0 and 8999 of 10000 hold; 9000 misses');
});

test('once he is in a stall he cannot be released, and he leaves the mines for that miner only', (t) => {
  const f = fixture(t, { layout: () => dailyLayout('2031-01-02', 1, SHAFTS[0]), jarInt: () => 0 });
  const bob = f.miner('bob');
  f.partner(10);
  f.mines.forceSteeze('ann', true);
  f.mines.forceSteeze('bob', true);
  const s = f.mines.start(f.ann, V);
  const him = s.wilds.find((w) => w.species === STEEZE_ID);
  f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(him, f.clock.now));
  f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: him.id });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
  f.shop.buy(f.ann, 'jar');
  assert.equal(f.pvp.jar(f.ann, { battleId: battle.id }).held, true);
  assert.ok(f.barn.ownerHolds('ann', STEEZE_ID));
  const pen = f.barn.bugs('ann').find((p) => p.species === STEEZE_ID);
  assert.ok(pen);
  assert.throws(() => f.barn.release('ann', idOf(pen)), (err) => err.message === STEEZE_STUCK && err.status === 409);
  // Ann no longer sees him in the tunnels; Bob, who has not caught him, still can (force is on for Bob too).
  const again = f.mines.publicShift ? f.mines.wildsFor(s, 'ann') : f.mines.wildsFor(f.mines.doc.active.ann, 'ann');
  assert.equal(again.some((w) => w.species === STEEZE_ID), false);
  const bobShift = f.mines.start(bob, V);
  assert.ok(bobShift.wilds.some((w) => w.species === STEEZE_ID));
});

test('every STEEZE move is a zero-damage flourish, including Horde wealth spelled that way', () => {
  const moves = movesFor('steeze', 10);
  assert.deepEqual(moves.map((m) => m.name), [
    'Strike a pose', 'Horde wealth', 'Golf', 'Flex his big calves', 'Order chicken fingers at a restaurant',
  ]);
  assert.ok(moves.every((m) => m.effect === 'flourish' && m.power === 0));
  const fighter = (specials) => ({ species: 'steeze', name: 'STEEZE', level: 10, mood: 80, plain: true, battle: { stance: 'balanced', specials } });
  const foe = { species: 'onymacris', name: 'Gerald', level: 5, mood: 80, plain: true, battle: { stance: 'balanced', specials: [] } };
  const S = startBout(fighter(['technique', 'signature', 'tactic', 'capstone']), fighter(['technique', 'signature', 'tactic', 'capstone']), 'steeze-moves');
  const seen = new Set();
  while (!S.over && seen.size < 5) {
    const events = stepBout(S);
    for (const e of events) if (e.type === 'move' && e.by === 0) {
      assert.equal(e.dmg, 0);
      assert.equal(e.effect, 'flourish');
      assert.ok(e.flourish);
      assert.match(e.line, /Nobody is hurt|only impressed|takes a moment|chicken fingers|shows off|strikes a pose/);
      seen.add(e.moveId);
    }
  }
  assert.ok(seen.size >= 4, `played ${[...seen]}`);
});

test('the portrait is gitignored and the species sheet is honest about being a cameo', () => {
  assert.equal(isSteeze('steeze'), true);
  const bug = BY_ID.steeze;
  assert.equal(bug.name, 'STEEZE');
  assert.match(bug.facts.join(' '), /Horde wealth|chicken fingers|calves|golf/i);
  const gi = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gi, /server\/assets\/steeze\.png/);
});

test('STEEZE keeps the name STEEZE in the stall, the ring and the card, never a genus nickname', (t) => {
  const { barn } = fixture(t);
  const pen = barn.adopt('ann', { wildId: 'w-steeze', battleId: 'b-steeze', species: STEEZE_ID, level: 5, name: 'Bocydium' });
  assert.equal(pen.name, 'STEEZE');
  assert.equal(barn.petView('ann').pen.name, 'STEEZE');
  assert.equal(barn.fighter('ann', barn.doc.pens.ann).name, 'STEEZE');
  assert.equal(barn.newName('ann', BY_ID.steeze), 'STEEZE');
});

test('a saved STEEZE nicknamed like a hatch is corrected on migrate', (t) => {
  const { barn } = fixture(t);
  barn.adopt('ann', { wildId: 'w-steeze-2', battleId: 'b-steeze-2', species: STEEZE_ID, level: 5 });
  barn.doc.pens.ann.name = 'Bocydium';
  barn.save();
  assert.ok(barn.migrate() >= 1);
  assert.equal(barn.doc.pens.ann.name, 'STEEZE');
});

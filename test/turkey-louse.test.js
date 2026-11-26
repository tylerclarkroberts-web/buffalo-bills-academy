import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines, TURKEY_LOUSE_ID, TURKEY_LOUSE_LEVEL, TURKEY_LOUSE_DATE, turkeyLouseLive, turkeyLouseOnDay, LOUSE_NEAR, LOUSE_ROAM, louseWildId, turkeyLouseGeneration } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { BY_ID, rawLevel, xpFor, givenName } from '../server/engine/creatures.js';
import { rarityOf } from '../server/engine/bug-types.js';
import { dailyLayout } from '../server/engine/daily-maze.js';
import { SHAFTS } from '../server/catalog/mine.js';
import { wildAt, ROAM_STEP_MS } from '../server/engine/wild-roam.js';
import { TURKEY_LOUSE_JAR_CHANCE, TURKEY_LOUSE_JAR_SIDES } from '../server/engine/turkey-louse.js';
import { phoenixDate } from '../server/engine/event-theme.js';
import { bugScale, spriteGrid } from '../client/src/barn/sprite.js';
import { simulateBout } from '../server/engine/bout.js';

const V = { rulesVersion: 2 };
const THANKS = TURKEY_LOUSE_DATE; // 2026-11-26
const THANKS_NOON = Date.parse('2026-11-26T12:00:00-07:00');
const AFTER = Date.parse('2026-11-27T08:00:00-07:00');

function fixture(t, { now = THANKS_NOON, jarInt, layout } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-louse-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now }, tick = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now: tick });
  const barn = new Barn({ store, accounts, now: tick, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) });
  const shop = new Shop({ store, accounts, barn, now: tick });
  const mines = new Mines({
    store, accounts, barn, now: tick, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1,
    poolInt: () => 40000, wormInt: (n) => n - 1,
    layout: layout || ((at, shaft) => dailyLayout(phoenixDate(at), 3, shaft || SHAFTS[0])),
  });
  mines.owned = (id) => shop.doc.inv[id]?.own;
  const rolls = { jar: 0, pay: [] };
  const pvp = new Pvp({
    store, accounts, mines, shop, barn, avatars: null, now: tick,
    randInt: (n) => { rolls.pay.push(n); return n === 1000 ? 999 : 0; },
    jarInt: jarInt || ((n) => (rolls.jar = n, 0)),
  });
  const miner = (id) => {
    const player = store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    accounts.ensure(player); player.bankroll = 2000; store.savePlayers();
    return player;
  };
  const ann = miner('ann');
  const partner = (level = 7) => {
    barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
    barn.doc.pens.ann.xp = xpFor(level); barn.save();
  };
  return { clock, store, accounts, barn, shop, mines, pvp, miner, ann, partner, rolls };
}

test('the Turkey Louse is live only on 2026-11-26 America/Phoenix, the same day as the theme', () => {
  assert.equal(THANKS, '2026-11-26');
  assert.equal(turkeyLouseOnDay(THANKS), true);
  assert.equal(turkeyLouseOnDay('2026-11-27'), false);
  assert.equal(turkeyLouseOnDay('2025-11-26'), false);
  // Midnight in Phoenix is 07:00Z (MST, UTC-7 year-round).
  assert.equal(phoenixDate(Date.parse('2026-11-26T07:00:00Z')), THANKS);
  assert.equal(turkeyLouseLive(Date.parse('2026-11-26T07:00:00Z')), true);
  assert.equal(turkeyLouseLive(Date.parse('2026-11-26T06:59:59Z')), false);
  assert.equal(turkeyLouseLive(Date.parse('2026-11-27T06:59:59Z')), true);
  assert.equal(turkeyLouseLive(Date.parse('2026-11-27T07:00:00Z')), false);
  assert.equal(turkeyLouseLive(AFTER), false);
});

test('it is level 9, a rare, named Turkey Louse, and its XP matches the formula', () => {
  const bug = BY_ID.menacanthus;
  assert.ok(bug);
  assert.equal(bug.name, 'Turkey Louse');
  assert.equal(bug.fixedName, true);
  assert.equal(givenName('menacanthus', 'Bocydium'), 'Turkey Louse');
  assert.equal(TURKEY_LOUSE_LEVEL, 9);
  assert.equal(xpFor(9), 2560);
  assert.equal(rawLevel(2560), 9);
  assert.equal(rawLevel(2559), 8);
  assert.equal(bug.stats.atk + bug.stats.def + bug.stats.spd, 10);
  assert.equal(bug.stats.atk, 5);
  assert.equal(bug.stats.def, 4);
  assert.equal(rarityOf(TURKEY_LOUSE_ID), 3);
  assert.equal(bug.look.kind, 'louse');
  assert.ok(bugScale(9, 'menacanthus') < 0.5);
  assert.ok(bugScale(9, 'menacanthus') < bugScale(1, 'lamprima') * 0.6, 'noticeably tinier than even a hatchling');
  const g = spriteGrid(bug, 9, 1);
  const filled = g.flat().filter(Boolean).length;
  assert.ok(filled > 40, `sprite has pixels (${filled})`);
});

test('on Thanksgiving it is guaranteed on every shaft, never a random roster roll', (t) => {
  const f = fixture(t);
  const ids = [];
  for (const shaft of SHAFTS) {
    const layout = dailyLayout(THANKS, shaft === SHAFTS[0] ? 1 : 3, shaft);
    const shift = { ...layout, rulesVersion: 2, startedAt: THANKS_NOON, shaft: shaft.id, pools: [], wildsGone: [] };
    const found = f.mines.wildsFor(shift, 'ann').filter((w) => w.species === TURKEY_LOUSE_ID);
    assert.equal(found.length, 1, `exactly one in shaft ${shaft.id}`);
    assert.equal(found[0].level, 9);
    assert.equal(found[0].id, louseWildId(THANKS, 1));
    ids.push(found[0].id);
  }
  assert.ok(ids.every((id) => id === ids[0]), 'the same living instance in every shaft');
});

test('it spawns next to the lift on a short loop and is still nearby 10 seconds into the shift', (t) => {
  const f = fixture(t);
  const s = f.mines.start(f.ann, V);
  const louse = s.wilds.find((w) => w.species === TURKEY_LOUSE_ID);
  assert.ok(louse, 'on the roster as soon as the shift starts');
  const start = { x: 1, y: 1 }; // the lift: server/engine/maze.js
  const manh = (p) => Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
  assert.ok(manh(louse) >= 2 && manh(louse) <= 4, `spawn ${louse.x},${louse.y} is close to the start ${start.x},${start.y}`);
  assert.ok((louse.path?.length || 1) - 1 <= LOUSE_ROAM, `short roam, path ${louse.path?.length}`);
  const started = s.startedAt || f.clock.now;
  for (const ms of [0, 2500, 10_000]) {
    const at = wildAt(louse, started + ms);
    assert.ok(manh(at) <= LOUSE_NEAR, `at ${ms}ms it is still near the start (${at.x},${at.y}), near=${manh(at)}`);
  }
  assert.ok(10_000 / ROAM_STEP_MS < 5, 'ten seconds is only a few tiles of walking');
});

test('it never spawns the next day, and a leftover shift cannot keep it after midnight', (t) => {
  const f = fixture(t);
  const today = f.mines.start(f.ann, V);
  assert.ok(today.wilds.some((w) => w.species === TURKEY_LOUSE_ID));
  // After Phoenix midnight the same in-progress shift loses it.
  f.clock.now = AFTER;
  const leftover = f.mines.wildsFor(f.mines.doc.active.ann, 'ann');
  assert.equal(leftover.some((w) => w.species === TURKEY_LOUSE_ID), false, 'gone from a leftover shift after the date');
  // A fresh shift on the 27th never has it.
  const g = fixture(t, { now: AFTER });
  const tomorrow = g.mines.start(g.ann, V);
  assert.equal(tomorrow.wilds.some((w) => w.species === TURKEY_LOUSE_ID), false);
});

test('a catch is atomic, respawns at once for everyone including the catcher, and one miner can catch several', (t) => {
  const f = fixture(t, { jarInt: () => 0 });
  const bob = f.miner('bob');
  f.partner(7);
  const a = f.mines.start(f.ann, V);
  const b = f.mines.start(bob, V);
  const first = a.wilds.find((w) => w.species === TURKEY_LOUSE_ID);
  assert.ok(first);
  assert.equal(first.id, louseWildId(THANKS, 1));
  assert.equal(b.wilds.find((w) => w.species === TURKEY_LOUSE_ID)?.id, first.id, 'the same living instance for every miner');
  assert.equal(turkeyLouseGeneration(f.barn.doc.wildCatches, THANKS), 1);

  const catchOne = (player, shiftId, wild) => {
    f.pvp.tick(player, { ...V, shiftId });
    Object.assign(f.pvp.presence.get(player.id), wildAt(wild, f.clock.now));
    f.pvp.meetWild(player, { shiftId, wildId: wild.id });
    const battle = f.pvp.battles.get(f.pvp.inBattle.get(player.id));
    assert.equal(f.pvp.jarOdds(battle).chance, TURKEY_LOUSE_JAR_CHANCE);
    assert.equal(f.pvp.jarOdds(battle).keeps, 9);
    battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
    f.shop.buy(player, 'jar');
    return f.pvp.jar(player, { battleId: battle.id });
  };

  assert.equal(catchOne(f.ann, a.shiftId, first).held, true);
  assert.equal(f.barn.wildCaught(first.id), true);
  assert.throws(() => f.barn.adopt(bob.id, { wildId: first.id, battleId: 'other-fight', species: TURKEY_LOUSE_ID, level: 9 }), (err) => err.status === 409);

  const nextAnn = f.mines.wildsFor(f.mines.doc.active.ann, 'ann').find((w) => w.species === TURKEY_LOUSE_ID);
  const nextBob = f.mines.wildsFor(f.mines.doc.active.bob, 'bob').find((w) => w.species === TURKEY_LOUSE_ID);
  assert.ok(nextAnn && nextBob, 'a new one is out immediately');
  assert.equal(nextAnn.id, louseWildId(THANKS, 2));
  assert.equal(nextBob.id, nextAnn.id, 'the catcher and everyone else see the same new instance');
  assert.notEqual(nextAnn.id, first.id);

  // The catcher can jar another one today.
  assert.equal(catchOne(f.ann, a.shiftId, nextAnn).held, true);
  const third = f.mines.wildsFor(f.mines.doc.active.ann, 'ann').find((w) => w.species === TURKEY_LOUSE_ID);
  assert.equal(third.id, louseWildId(THANKS, 3));
  const kept = f.barn.bugs('ann').filter((p) => p.species === TURKEY_LOUSE_ID);
  const farm = (f.barn.farmBugs?.('ann') || []).filter((p) => p.species === TURKEY_LOUSE_ID);
  assert.ok(kept.length + farm.length >= 2, 'one miner can keep more than one');
  assert.ok(kept.concat(farm).every((p) => p.xp === 2560 && rawLevel(p.xp) === 9));
});

test('it cannot be fought or jarred after Thanksgiving, but a caught one stays owned', (t) => {
  const f = fixture(t, { jarInt: () => 0 });
  f.partner(7);
  const s = f.mines.start(f.ann, V);
  const him = s.wilds.find((w) => w.species === TURKEY_LOUSE_ID);
  assert.ok(him);
  f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(him, f.clock.now));
  f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: him.id });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
  f.shop.buy(f.ann, 'jar');
  // The date rolls over before the throw: it slips away, and nothing is adopted.
  f.clock.now = AFTER;
  assert.throws(() => f.pvp.jar(f.ann, { battleId: battle.id }), (err) => /Thanksgiving is over/.test(err.message) && err.status === 409);
  assert.equal(f.barn.ownerHolds('ann', TURKEY_LOUSE_ID), false);

  // A specimen already in the barn is kept after the window.
  const kept = f.barn.adopt('ann', { wildId: 'keepsake-louse', battleId: 'old-catch', species: TURKEY_LOUSE_ID, level: 9 });
  assert.equal(kept.xp, 2560);
  assert.equal(f.barn.ownerHolds('ann', TURKEY_LOUSE_ID), true);
  const leftover = f.mines.wildsFor(f.mines.doc.active.ann, 'ann');
  assert.equal(leftover.some((w) => w.species === TURKEY_LOUSE_ID && !w.force), false);
});

test('a typical mid-level bug can beat it with effort, and it is not a pushover', () => {
  let wins = 0, n = 80;
  for (let s = 0; s < n; s++) {
    const o = simulateBout(
      { species: 'lamprima', name: 'Lamprima', level: 8, mood: 80 },
      { species: 'menacanthus', name: 'Turkey Louse', level: 9, mood: 80 },
      `louse:${s}`,
    );
    if (o.winner === 0) wins++;
  }
  assert.ok(wins >= 8 && wins <= 60, `level 8 stag vs level 9 louse won ${wins}/${n}`);
});

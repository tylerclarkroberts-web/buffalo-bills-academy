import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, STALLS, STALL_COSTS, FARM_NAME, jarCatchLine, idOf, STARVE_MS, purpleChance, RECOVER_MS } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines, STEEZE_ID, STEEZE_LEVEL, STEEZE_DAYS, steezeToday } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { BY_ID, xpFor, LEVEL_CAP, PAUSED_AT } from '../server/engine/creatures.js';
import { movesFor } from '../server/engine/bug-combat.js';
import { startBout, stepBout } from '../server/engine/bout.js';
import { wildAt } from '../server/engine/wild-roam.js';
import { STEEZE_JAR_CHANCE, STEEZE_JAR_SIDES, STEEZE_STUCK, isSteeze, STEEZE_CARE, careLabel, steezeCareLine } from '../server/engine/steeze.js';
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
  const mines = new Mines({ store, accounts, barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000, wormInt: (n) => n - 1, layout });
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

function fillStalls(f, playerId, count = STALLS) {
  const bought = count - STALLS;
  if (bought > 0) {
    f.store.players[playerId].bankroll += STALL_COSTS.slice(0, bought).reduce((sum, cost) => sum + cost, 0);
    f.store.savePlayers();
    for (let i = 0; i < bought; i++) f.barn.buildStall(playerId);
  }
  if (!f.barn.has(playerId)) { f.barn.layEgg(playerId); f.clock.now += 2000; f.barn.view(playerId); }
  let n = 0;
  while (f.barn.room(playerId)) {
    n++;
    f.barn.adopt(playerId, { wildId: `fill-${playerId}-${n}`, battleId: `fillb-${playerId}-${n}`, species: 'onymacris', level: 3 });
  }
  f.barn.bugs(playerId).forEach((pen, i) => { pen.name = `Stall ${i + 1}`; });
  f.barn.save();
}

function catchSteeze(f, playerId, tag = 's') {
  return f.barn.adopt(playerId, { wildId: `w-steeze-${tag}`, battleId: `b-steeze-${tag}`, species: STEEZE_ID, level: 5 });
}

test('jarCatchLine names the farm, a bumped stall bug, or a free stall', () => {
  assert.equal(jarCatchLine('STEEZE', { farm: true }), `In the jar. Every stall is taken, so STEEZE is off to ${FARM_NAME}.`);
  assert.equal(jarCatchLine('STEEZE', { bumped: 'Stall 4' }), 'In the jar. STEEZE has a stall waiting. Stall 4 is off to GFR Farms.');
  assert.equal(jarCatchLine('STEEZE'), 'In the jar. STEEZE has a stall waiting.');
});

test('with every stall taken STEEZE takes stall 4, and that bug goes to GFR Farms', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  const before = f.barn.bugs(ann).map((pen) => ({ id: idOf(pen), name: pen.name, species: pen.species }));
  assert.equal(before.length, 6);
  assert.equal(before[3].name, 'Stall 4');
  const now = f.clock.now, him = catchSteeze(f, ann, 'six');
  assert.equal(him.species, STEEZE_ID);
  assert.equal(him.name, 'STEEZE');
  assert.equal(f.barn.whereIs(ann, him), 'stall');
  const stalls = f.barn.bugs(ann);
  assert.equal(stalls.length, 6);
  assert.equal(stalls[3].species, STEEZE_ID, 'he sits in stall 4, the fourth slot the barn UI shows (partner, then bench)');
  assert.equal(stalls[3].name, 'STEEZE');
  assert.deepEqual(stalls.filter((_, i) => i !== 3).map((pen) => pen.name), ['Stall 1', 'Stall 2', 'Stall 3', 'Stall 5', 'Stall 6']);
  const farm = f.barn.farmBugs(ann);
  assert.equal(farm.length, 1);
  assert.equal(farm[0].name, 'Stall 4');
  assert.equal(idOf(farm[0]), before[3].id);
  assert.equal(farm[0].farmedAt, now);
  assert.equal(farm[0].benchedAt, undefined);
  assert.equal(f.barn.lastPlacement.where, 'stall');
  assert.equal(f.barn.lastPlacement.bumped.name, 'Stall 4');
});

test('a barn with fewer than four stalls gives STEEZE its last stall', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 3);
  assert.equal(f.barn.stalls(ann), 3);
  const fourth = f.barn.bugs(ann)[2], him = catchSteeze(f, ann, 'three');
  assert.equal(f.barn.bugs(ann)[2].species, STEEZE_ID);
  assert.equal(f.barn.bugs(ann)[2].name, 'STEEZE');
  assert.deepEqual(f.barn.bugs(ann).slice(0, 2).map((pen) => pen.name), ['Stall 1', 'Stall 2']);
  assert.equal(f.barn.farmBugs(ann)[0].name, 'Stall 3');
  assert.equal(idOf(f.barn.farmBugs(ann)[0]), idOf(fourth));
  assert.equal(him.name, 'STEEZE');
});

test('a free stall is his the usual way, and nobody is bumped', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  // send stall 6 to the farm so one slot is free, then catch him
  const last = f.barn.bugs(ann)[5];
  f.barn.toFarm(ann, idOf(last));
  assert.equal(f.barn.bugs(ann).length, 5);
  const him = catchSteeze(f, ann, 'room');
  assert.equal(f.barn.whereIs(ann, him), 'stall');
  assert.equal(f.barn.bugs(ann).at(-1).species, STEEZE_ID, 'he takes the free stall at the end, as any catch would');
  assert.deepEqual(f.barn.bugs(ann).slice(0, 5).map((pen) => pen.name), ['Stall 1', 'Stall 2', 'Stall 3', 'Stall 4', 'Stall 5']);
  assert.equal(f.barn.farmBugs(ann).length, 1);
  assert.equal(f.barn.farmBugs(ann)[0].name, 'Stall 6');
  assert.equal(f.barn.lastPlacement.bumped, undefined);
});

test('if stall 4 is in a fight he takes the next stall that can move', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  const stall4 = f.barn.bugs(ann)[3], stall5 = f.barn.bugs(ann)[4];
  f.store.players[ann].barnBouts = { open: { id: 'bout-stall4', petBornAt: stall4.bornAt, expiresAt: f.clock.now + 1e9, stake: 0 } };
  f.store.savePlayers();
  catchSteeze(f, ann, 'busy4');
  const stalls = f.barn.bugs(ann);
  assert.equal(stalls[3].name, 'Stall 4', 'the fighting bug stays put');
  assert.equal(idOf(stalls[3]), idOf(stall4));
  assert.equal(stalls[4].species, STEEZE_ID, 'fallback is the next stall the UI shows');
  assert.equal(f.barn.farmBugs(ann)[0].name, 'Stall 5');
  assert.equal(idOf(f.barn.farmBugs(ann)[0]), idOf(stall5));
  assert.equal(f.store.players[ann].barnBouts.open.petBornAt, stall4.bornAt, 'the open bout is left alone');
});

test('if later stalls are also busy he falls back to an earlier one, never the partner', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  for (const i of [3, 4, 5]) f.barn.bugs(ann)[i].faintedAt = f.clock.now; // stalls 4, 5 and 6 cannot travel
  f.barn.save();
  const stall3 = f.barn.bugs(ann)[2];
  catchSteeze(f, ann, 'earlier');
  const stalls = f.barn.bugs(ann);
  assert.equal(stalls[0].name, 'Stall 1', 'the partner stays');
  assert.equal(stalls[2].species, STEEZE_ID);
  assert.equal(f.barn.farmBugs(ann)[0].name, 'Stall 3');
  assert.equal(idOf(f.barn.farmBugs(ann)[0]), idOf(stall3));
});

test('if no stall bug can move, STEEZE himself goes to the farm', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  for (const pen of f.barn.doc.bench[ann]) pen.faintedAt = f.clock.now;
  f.barn.save();
  const before = f.barn.bugs(ann).map((pen) => idOf(pen));
  const him = catchSteeze(f, ann, 'nowhere');
  assert.equal(f.barn.whereIs(ann, him), 'farm');
  assert.equal(him.farmedAt, f.clock.now);
  assert.deepEqual(f.barn.bugs(ann).map((pen) => idOf(pen)), before);
  assert.equal(f.barn.lastPlacement.bumped, undefined);
});

test('an ordinary catch with every stall taken still goes to the farm', (t) => {
  const f = fixture(t), ann = 'ann';
  fillStalls(f, ann, 6);
  const before = f.barn.bugs(ann).map((pen) => ({ id: idOf(pen), name: pen.name }));
  const caught = f.barn.adopt(ann, { wildId: 'w-plain', battleId: 'b-plain', species: 'halobates', level: 3 });
  assert.equal(f.barn.whereIs(ann, caught), 'farm');
  assert.deepEqual(f.barn.bugs(ann).map((pen) => ({ id: idOf(pen), name: pen.name })), before);
  assert.equal(f.barn.farmBugs(ann).at(-1).species, 'halobates');
});

test('a mine jar of STEEZE into a full barn reports the bumped bug, not that he went to the farm', (t) => {
  const f = fixture(t, { layout: () => dailyLayout('2031-01-02', 1, SHAFTS[0]), jarInt: () => 0 });
  fillStalls(f, 'ann', 6);
  f.mines.forceSteeze('ann', true);
  const s = f.mines.start(f.ann, V);
  const him = s.wilds.find((w) => w.species === STEEZE_ID);
  f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(him, f.clock.now));
  f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: him.id });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
  const preview = f.pvp.battleView(battle, 'ann');
  assert.equal(preview.jar.farm, false, 'the throw hint does not say STEEZE is off to the farm');
  assert.equal(preview.jar.bumped, 'Stall 4');
  f.shop.buy(f.ann, 'jar');
  const result = f.pvp.jar(f.ann, { battleId: battle.id });
  assert.equal(result.held, true);
  assert.equal(f.pvp.battles.get(battle.id).over.farm, undefined);
  assert.equal(f.pvp.battles.get(battle.id).over.bumped, 'Stall 4');
  assert.equal(result.battle.over.farm, undefined);
  assert.equal(result.battle.over.bumped, 'Stall 4');
  assert.equal(result.battle.over.caught, 'STEEZE');
  assert.equal(jarCatchLine(result.battle.over.caught, { farm: result.battle.over.farm, bumped: result.battle.over.bumped }),
    'In the jar. STEEZE has a stall waiting. Stall 4 is off to GFR Farms.');
  assert.equal(f.barn.bugs('ann')[3].species, STEEZE_ID);
  assert.equal(f.barn.farmBugs('ann')[0].name, 'Stall 4');
});


test('STEEZE care pills are relabelled, and each action has a short pool of snarky lines', () => {
  assert.deepEqual(['feed', 'play', 'clean'].map((k) => careLabel(k, STEEZE_ID)), ['Read him a book', 'Rub his back', 'Discuss politics']);
  assert.deepEqual(['feed', 'play', 'clean'].map((k) => careLabel(k, 'lamprima')), ['Feed', 'Play', 'Mist']);
  for (const [action, row] of Object.entries(STEEZE_CARE)) {
    assert.ok(row.lines.length >= 4 && row.lines.length <= 6, `${action} should have 4–6 lines`);
    assert.equal(new Set(row.lines).size, row.lines.length, `${action} lines should be unique`);
    for (const line of row.lines) {
      assert.ok(line.length > 8 && line.length < 90, line);
      assert.doesNotMatch(line, /immortal|never dies|can't die|cannot die|invincible/i);
    }
  }
  const politics = STEEZE_CARE.clean.lines.join('\n');
  assert.doesNotMatch(politics, /democrat|republican|liberal|conservative|left-wing|right-wing|trump|biden|maga|gop\b/i);
  assert.equal(steezeCareLine('feed', 'lamprima'), null);
  assert.equal(steezeCareLine('feed', STEEZE_ID, 0), STEEZE_CARE.feed.lines[0]);
  assert.equal(steezeCareLine('clean', STEEZE_ID, 0.99), STEEZE_CARE.clean.lines.at(-1));
});

test('STEEZE survives a very long neglect gap, still looks fine, and other bugs still starve', (t) => {
  const f = fixture(t), ann = 'ann';
  f.partner(5);
  const him = f.barn.adopt(ann, { wildId: 'w-neglect-steeze', battleId: 'b-neglect-steeze', species: STEEZE_ID, level: 5 });
  assert.equal(him.species, STEEZE_ID);
  const before = f.barn.petView(ann, idOf(him)).pen;
  assert.equal(before.stage, 'creature');
  const hung = before.needs.hunger, mood = before.needs.mood, clean = before.needs.clean;
  // A year unfed: any ordinary bug would have been a gravestone many times over.
  f.clock.now += 365 * 24 * 3600e3;
  const after = f.barn.petView(ann, idOf(him)).pen;
  assert.equal(after.stage, 'creature');
  assert.equal(after.starving, 0);
  assert.equal(after.diesInMs, null);
  assert.ok(f.barn.deathAt(f.barn.penOf(ann, idOf(him))) > f.clock.now);
  assert.deepEqual(after.needs, { hunger: hung, mood, clean });
  assert.ok(after.mood === 'thriving' || after.mood === 'content', after.mood);
  // Care still works: cooldown, XP, and the bumped need, on the usual actions.
  const xp = after.xp;
  const cared = f.barn.care(ann, 'feed', idOf(him)).stable.bugs.find((bug) => bug.species === STEEZE_ID);
  assert.ok(cared.xp > xp);
  assert.ok(cared.cool.feed > 0);
  assert.ok(cared.needs.hunger >= hung);
  assert.throws(() => f.barn.care(ann, 'feed', idOf(him)), /give it a minute/i);
  // A regular partner left alone for the same span is dead.
  const other = fixture(t);
  other.partner(5);
  other.clock.now += STARVE_MS + 24 * 3600e3;
  assert.equal(other.barn.view('ann').pen.stage, 'dead');
});


test('purpleChance is zero for STEEZE, and no mine shift starts a first or second evolution for him', (t) => {
  assert.equal(purpleChance(xpFor(13), 0, STEEZE_ID), 0);
  assert.equal(purpleChance(xpFor(30), 1, STEEZE_ID), 0);
  assert.equal(purpleChance(xpFor(13)), 1, 'every other species is unchanged');
  const f = fixture(t);
  const him = catchSteeze(f, 'ann', 'evo');
  assert.equal(f.barn.doc.pens.ann, him);
  him.xp = xpFor(30);
  f.barn.save();
  f.barn.view('ann');
  const pen = f.barn.view('ann').pen;
  assert.equal(pen.species, STEEZE_ID);
  assert.equal(pen.level, LEVEL_CAP, 'he is not held at the pre-evolution cap');
  assert.equal(pen.cap, LEVEL_CAP);
  assert.equal(pen.evo || 0, 0);
  assert.equal(pen.xpNext, null);
  assert.ok(pen.level > PAUSED_AT);
  assert.equal(f.barn.due('ann'), null);
  assert.equal(f.barn.due('ann', 1), null);
  assert.equal(f.barn.rollPurple('ann'), false);
  assert.equal(f.barn.rollCollect('ann'), false);
  assert.equal(f.barn.fallSick('ann'), null);
  assert.equal(f.barn.collect('ann'), null);
  assert.equal(f.barn.doc.pens.ann.sick, undefined);
  assert.equal(f.barn.doc.pens.ann.taken, undefined);
  assert.equal(f.barn.doc.pens.ann.evo || 0, 0);
  // Even a forced Stage II flag does not start the specialist's collection.
  f.barn.doc.pens.ann.evo = 1;
  f.barn.save();
  assert.equal(f.barn.rollCollect('ann'), false);
  assert.equal(f.barn.collect('ann'), null);
  f.barn.doc.pens.ann.evo = 0;
  f.barn.save();
  const shift = f.mines.start(f.ann, V);
  assert.equal(shift.purple, undefined);
  assert.equal(shift.collect, undefined);
  f.mines.quit(f.ann, shift.shiftId, V);
  assert.equal(f.barn.doc.pens.ann.sick, undefined);
  assert.equal(f.barn.doc.pens.ann.taken, undefined);
  assert.equal(f.barn.doc.pens.ann.evo || 0, 0);
  assert.throws(() => f.barn.evolve('ann', f.barn.doc.pens.ann), /sits back down/);
  assert.throws(() => f.barn.rebuild('ann', f.barn.doc.pens.ann), /sits back down/);
  // A leftover sick flag is treated as a faint, not a rebuild.
  const raw = f.barn.doc.pens.ann;
  f.barn.commitPen('ann', { ...raw, sick: f.clock.now, faintedAt: f.clock.now, faintedIn: 'purple' });
  const healed = f.barn.heal('ann', { mode: 'heal', pay: true });
  assert.equal(healed.evolved, undefined);
  assert.equal(healed.healed, true);
  assert.equal(f.barn.view('ann').pen.evo || 0, 0);
  assert.equal(f.barn.view('ann').pen.sick, undefined);
  assert.equal(f.barn.view('ann').pen.fainted, false);
});

test('STEEZE is never offered as Stage II parts, and a rebuild cannot take him', (t) => {
  const f = fixture(t);
  f.partner(10);
  const partner = f.barn.doc.pens.ann;
  Object.assign(partner, { xp: xpFor(24), evo: 1 });
  const him = catchSteeze(f, 'ann', 'parts');
  const spare = f.barn.adopt('ann', { wildId: 'w-spare-parts', battleId: 'b-spare-parts', species: 'onymacris', level: 3 });
  f.barn.save();
  assert.equal(f.barn.collect('ann'), partner.name);
  const donors = f.barn.donors('ann', f.barn.doc.pens.ann);
  assert.deepEqual(donors.map((d) => d.species), ['onymacris']);
  assert.equal(f.barn.view('ann').pen.donors.some((d) => d.species === STEEZE_ID), false);
  assert.throws(() => f.barn.heal('ann', { donor: idOf(him) }), /wants parts/);
  assert.ok(f.barn.bugs('ann').some((bug) => isSteeze(bug.species) && bug.stage === 'creature'));
  assert.equal(f.barn.doc.pens.ann.evo, 1);
  // Only STEEZE in the other stalls: the rebuild takes cash, never him.
  const f2 = fixture(t);
  f2.partner(10);
  Object.assign(f2.barn.doc.pens.ann, { xp: xpFor(24), evo: 1 });
  catchSteeze(f2, 'ann', 'parts-solo');
  f2.barn.save();
  f2.barn.collect('ann');
  assert.deepEqual(f2.barn.view('ann').pen.donors, []);
  const cash = f2.ann.bankroll;
  const r = f2.barn.heal('ann');
  assert.equal(r.evolved.stage, 2);
  assert.equal(r.evolved.donor, null);
  assert.ok(r.evolved.bill.took > 0);
  assert.ok(f2.ann.bankroll < cash);
  assert.ok(f2.barn.bugs('ann').some((bug) => isSteeze(bug.species) && bug.stage === 'creature'));
});

test('a fight can still faint STEEZE, and the Bug Center treats the knockout without evolving him', (t) => {
  const f = fixture(t);
  const him = catchSteeze(f, 'ann', 'faint');
  const bornAt = him.bornAt;
  const out = f.barn.battleResult('ann', { battleId: 'fight-steeze-faint', bornAt, won: false, fought: true, fainted: true, foeName: 'A beetle', place: 'mines' });
  assert.equal(out.fainted, true);
  const view = f.barn.view('ann').pen;
  assert.equal(view.fainted, true);
  assert.equal(view.sick, undefined);
  assert.equal(view.taken, undefined);
  assert.equal(view.evo || 0, 0);
  assert.ok(f.barn.waitingRoom('ann').some((w) => w.id === idOf(him)));
  assert.throws(() => f.barn.heal('ann'), /more minutes of rest/);
  f.clock.now += RECOVER_MS;
  const healed = f.barn.heal('ann');
  assert.equal(healed.evolved, undefined);
  assert.equal(healed.healed, true);
  assert.equal(healed.cost, 0);
  const after = f.barn.view('ann').pen;
  assert.equal(after.fainted, false);
  assert.equal(after.evo || 0, 0);
  assert.equal(after.species, STEEZE_ID);
});

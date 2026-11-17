// Knocked-out bugs sit out battles, barn bouts and guiding until the Bug Center nurse heals them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, BATTLE_XP, WIN_BONUS_XP, BOUT_LEVEL, FIND_XP, RECOVER_MS, FAST_HEAL_COST } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { MAX_ROUNDS, simulateBout } from '../server/engine/bout.js';
import { upsetXp } from '../server/engine/bug-combat.js';
import { Scum } from '../server/scum/index.js';
import { tableBugOf } from '../server/tableBug.js';
import { createApp } from '../server/app.js';
import { greeting, done, NO, REST, SIGNS, NURSE } from '../client/src/bugcenter/script.js';
import { HEAL_TUNE } from '../client/src/bugcenter/chime.js';

const V = { rulesVersion: 2 };
const EAST = -Math.PI / 2, WEST = Math.PI / 2;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bugcenter-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-13T19:00:00Z') };
  const f = { dir, clock, rand: (n) => (n === 81 ? 10 : 0) };
  const now = () => clock.now;
  f.boot = () => {
    f.store = new Store(dir);
    f.accounts = new Accounts({ store: f.store, now });
    f.barn = new Barn({ store: f.store, accounts: f.accounts, now });
    f.shop = new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now });
    f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000 });
    f.mines.owned = (id) => f.shop.doc.inv[id]?.own;
    f.pvp = new Pvp({ store: f.store, accounts: f.accounts, mines: f.mines, shop: f.shop, barn: f.barn, avatars: null, now, randInt: (n) => f.rand(n) });
  };
  f.boot();
  f.player = (id) => {
    const p = f.store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    f.accounts.ensure(p); p.mining.shifts = 10; f.store.savePlayers();
    return p;
  };
  f.bug = (id, species, name, xp) => {
    const at = clock.now - 10 * 86400e3;
    f.barn.doc.pens[id] = { stage: 'creature', species, name, xp, bornAt: at, fedAt: clock.now, dayXpAt: clock.now, combatVersion: 1,
      stats: { hunger: { v: 80, at: clock.now }, mood: { v: 80, at: clock.now }, clean: { v: 80, at: clock.now } }, cool: {} };
    f.barn.save();
  };
  f.ann = f.player('ann'); f.bob = f.player('bob');
  f.bug('ann', 'manticora', 'Manticora I', 40 * 16); // level 5
  f.bug('bob', 'onymacris', 'Onymacris I', 40 * 9);  // level 4
  f.again = (p) => f.mines.start(p, { ...V, afterShiftId: f.mines.doc.completed?.[p.id]?.shiftId }); // past the last receipt
  f.tick = (p, s, pos) => f.pvp.tick(p, { ...V, shiftId: s.shiftId, ...pos });
  f.spot = (s) => {
    const g = makeMaze(s.seed, s.cells, FIRST_POOL_STEPS[s.cells]).grid;
    for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 2; x++) if (!g[y][x] && !g[y][x + 1] && Math.hypot(x - 1, y - 1) > 4) return { x, y };
    throw new Error('no corridor');
  };
  /** Ann and Bob meet face to face: a battle. */
  f.meet = () => {
    const a = f.mines.start(f.ann, V), b = f.mines.start(f.bob, V);
    f.tick(f.ann, a, { x: 1, y: 1, yaw: 0, fresh: true }); f.tick(f.bob, b, { x: 1, y: 1, yaw: 0, fresh: true });
    clock.now += 60000;
    const at = f.spot(a);
    f.tick(f.bob, b, { x: at.x + 0.6, y: at.y, yaw: WEST });
    const view = f.tick(f.ann, a, { x: at.x, y: at.y, yaw: EAST });
    return { a, b, view, battle: f.pvp.battles.get(view.battle.id) };
  };
  /** Bob's bug is on its last legs and both miners leave it to the bugs: ann wins. Returns what bob's page is told. */
  f.annWins = ({ battle, a, b }) => {
    const bob = battle.a === 'bob' ? 0 : 1, S = battle.fight.S, still = { x: 0, y: 0, yaw: 0 };
    for (let i = 0; i < 40 && !battle.over; i++) { S.hp[bob] = 1; clock.now = battle.fight.nextAt; f.tick(f.ann, a, still); if (!battle.over) f.tick(f.bob, b, still); }
    return { battle: f.pvp.battleView(battle, 'bob') };
  };
  return f;
}

test('the winning bug gets battle XP plus a win bonus; the loser gets battle XP and faints, saved on disk', (t) => {
  const f = fixture(t);
  const m = f.meet();
  assert.equal(m.view.battle.you.level, 5);
  const annSide = m.battle.a === 'ann' ? 0 : 1;
  m.battle.fight.S.hp[annSide] = Math.floor(m.battle.fight.S.maxHp[annSide] / 2);
  const end = f.annWins(m);
  assert.equal(end.battle.over.won, false);
  assert.deepEqual(end.battle.over.bug, { xp: BATTLE_XP, bonus: 0, fainted: true, levelBefore: 4, levelAfter: 4, xpBar: { xp: 360 + BATTLE_XP, level: 4, from: 360, to: 640 } });
  const annView = f.pvp.battleView(m.battle, 'ann');
  assert.equal(annView.over.won, true);
  const bonus = upsetXp(WIN_BONUS_XP, annView.line); // by the line: ann's level 5 was favoured over a level 4, so less than an even fight's
  assert.ok(annView.line > 0.5 && bonus > 0 && bonus < WIN_BONUS_XP);
  assert.equal(annView.over.bug.xp, BATTLE_XP + bonus); assert.equal(annView.over.bug.bonus, bonus);
  assert.equal(annView.over.bug.fainted, false); assert.equal(annView.over.foeFainted, true);
  assert.equal(f.barn.doc.pens.ann.xp, 640 + BATTLE_XP + bonus);
  assert.equal(f.barn.doc.pens.bob.xp, 360 + BATTLE_XP);
  assert.deepEqual(f.barn.doc.pens.ann.mineRecord, { w: 1, l: 0 }); assert.deepEqual(f.barn.doc.pens.bob.mineRecord, { w: 0, l: 1 });
  assert.equal(f.mines.doc.completed.bob.result.pvp.fainted, 'Onymacris I', 'the loser\'s receipt says its bug fainted');
  assert.equal(end.battle.over.raid.fainted, true);
  // a restart keeps the faint (it is in barn.json, as plain JSON)
  f.boot();
  assert.equal(typeof f.barn.doc.pens.bob.faintedAt, 'number');
  assert.equal(f.barn.doc.pens.bob.faintedBy, 'ANN');
  const v = f.barn.view('bob').pen;
  assert.equal(v.fainted, true); assert.equal(v.faintedBy, 'ANN');
  assert.equal(f.barn.view('ann').pen.fainted, false);
  assert.equal(f.pvp.bugOf('ann').health, 100, 'the surviving bug has full HP for its next fight');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'barn.json'), 'utf8')).pens.bob.faintedAt, f.barn.doc.pens.bob.faintedAt);
});

test('settling a battle twice (crash recovery) pays XP and faints once', (t) => {
  const f = fixture(t);
  const m = f.meet(); f.annWins(m);
  const raid = f.pvp.doc.raids[m.battle.over.raid];
  const xp = { ann: f.barn.doc.pens.ann.xp, bob: f.barn.doc.pens.bob.xp };
  raid.steps = {}; raid.done = false; f.pvp.apply(raid);
  assert.equal(f.barn.doc.pens.ann.xp, xp.ann); assert.equal(f.barn.doc.pens.bob.xp, xp.bob);
  // an old raid record from before v75 (no bugs) settles without touching the barn
  const old = { ...raid, id: 'old', bugs: undefined, barn: undefined, steps: {}, done: false };
  delete old.bugs; f.pvp.apply(old);
  assert.equal(f.barn.doc.pens.ann.xp, xp.ann);
});

test('a fainted bug cannot battle: its miner borrows Gerald, and it gets no XP or second faint from that fight', (t) => {
  const f = fixture(t);
  const m = f.meet(); f.annWins(m);
  assert.equal(f.pvp.bugOf('bob', false), null, 'other miners see no bug following a fainted one');
  const full = f.pvp.bugOf('bob');
  assert.equal(full.loaner, true); assert.equal(full.name, 'Gerald'); assert.equal(full.benched, 'Onymacris I');
  // a later battle against someone else: Bob fights with the loaner, the fainted bug is untouched
  f.clock.now += 60000;
  const cal = f.player('cal'); f.bug('cal', 'manticora', 'Manticora II', 40 * 16);
  const b2 = f.again(f.bob), c = f.mines.start(cal, V);
  f.tick(f.bob, b2, { x: 1, y: 1, yaw: 0, fresh: true }); f.tick(cal, c, { x: 1, y: 1, yaw: 0, fresh: true });
  f.clock.now += 60000;
  const at = f.spot(c);
  f.tick(f.bob, b2, { x: at.x + 0.6, y: at.y, yaw: WEST });
  const view = f.tick(cal, c, { x: at.x, y: at.y, yaw: EAST });
  assert.ok(view.battle);
  const bobView = f.pvp.battleView(f.pvp.battles.get(view.battle.id), 'bob');
  assert.equal(bobView.you.name, 'Gerald (on loan)'); assert.equal(bobView.benched, 'Onymacris I');
  const xp = f.barn.doc.pens.bob.xp, at0 = f.barn.doc.pens.bob.faintedAt;
  f.pvp.forfeit('bob');
  assert.equal(f.barn.doc.pens.bob.xp, xp); assert.equal(f.barn.doc.pens.bob.faintedAt, at0);
  // ...and it can't take a barn bout either, and an open bout it had is refunded
  assert.throws(() => f.barn.ready('bob'), /Bug Center/);
  assert.equal(f.barn.fit('bob'), false); assert.equal(f.barn.fit('ann'), true);
  assert.ok(levelOk(f.barn.view('ann').pen.level));
});
const levelOk = (l) => l >= BOUT_LEVEL;

test('a fainted bug stays home from the mines and shows swirly eyes at the tables', (t) => {
  const f = fixture(t);
  const m = f.meet(); f.annWins(m);
  f.clock.now += 3600e3;
  const s = f.again(f.bob);
  assert.equal(s.bug, undefined, 'no guide');
  assert.deepEqual(s.bugFainted, { name: 'Onymacris I' });
  assert.equal(tableBugOf(f.barn, 'bob').fainted, true);
  assert.equal(tableBugOf(f.barn, 'ann').fainted, undefined);
  assert.equal(f.mines.guideBug('ann').species, 'manticora', 'the winner still guides'); assert.equal(f.mines.guideBug('bob').fainted, true);
});

test('a guide bug earns a little XP for each acid pool it finds, once; a fainted one earns nothing', (t) => {
  const f = fixture(t);
  const find = (p) => { const s = f.mines.start(p, V); f.mines.probe(p, s.shiftId, { ...V, poolId: s.currentPoolId }); f.mines.probe(p, s.shiftId, { ...V, poolId: s.currentPoolId }); };
  find(f.ann);
  assert.equal(f.barn.doc.pens.ann.xp, 640 + FIND_XP, 'probing the same pool twice pays once');
  f.barn.doc.pens.bob.faintedAt = f.clock.now;
  find(f.bob);
  assert.equal(f.barn.doc.pens.bob.xp, 360);
});

test('an open barn bout is refunded if its bug faints in the mines', (t) => {
  const f = fixture(t);
  f.barn.openBout('bob', { stake: 50 });
  const held = f.store.players.bob.bankroll;
  const m = f.meet(); f.annWins(m);
  const lost = f.pvp.doc.raids[m.battle.over.raid].paid;
  f.barn.view('ann');
  assert.equal(f.store.players.bob.barnBouts.open, null);
  assert.equal(f.store.players.bob.bankroll, held - lost + 50);
});

test('Bug Center: a fainted bug rests an hour for a free heal, or pays to be up now', (t) => {
  const f = fixture(t);
  const m = f.meet(); f.annWins(m);
  const money = f.store.players.bob.bankroll;
  const view = f.barn.view('bob').pen;
  assert.equal(view.recoverMs, RECOVER_MS); assert.equal(view.healCost, FAST_HEAL_COST);
  assert.throws(() => f.barn.heal('bob'), (e) => e.status === 409 && /60 more minutes/.test(e.message));
  assert.equal(f.barn.doc.pens.bob.faintedAt > 0, true, 'still fainted'); assert.equal(f.store.players.bob.bankroll, money);
  f.store.players.bob.bankroll = FAST_HEAL_COST - 1;
  assert.throws(() => f.barn.heal('bob', { pay: true }), (e) => e.status === 402);
  f.store.players.bob.bankroll = money;
  const paid = f.barn.heal('bob', { pay: true });
  assert.equal(paid.healed, true); assert.equal(paid.cost, FAST_HEAL_COST); assert.equal(paid.pen.fainted, false);
  assert.equal(f.store.players.bob.bankroll, money - FAST_HEAL_COST);
  assert.equal(f.barn.heal('bob', { pay: true }).cost, 0, 'a healthy bug is never charged');
  assert.equal(f.store.players.bob.bankroll, money - FAST_HEAL_COST);
});

test('Bug Center: the nurse heals a rested fainted bug to full at no cost; healthy bugs are a polite no-op', (t) => {
  const f = fixture(t);
  const m = f.meet(); f.annWins(m);
  f.clock.now += RECOVER_MS;
  const money = f.store.players.bob.bankroll, xp = f.barn.doc.pens.bob.xp;
  const r = f.barn.heal('bob');
  assert.equal(r.healed, true); assert.equal(r.cost, 0); assert.equal(r.pen.fainted, false);
  assert.equal(f.store.players.bob.bankroll, money, 'free');
  assert.equal(f.barn.doc.pens.bob.xp, xp, 'healing does not touch XP');
  assert.equal(f.barn.doc.pens.bob.faintedAt, undefined);
  assert.equal(f.barn.doc.pens.bob.heals, 1);
  assert.equal(f.barn.fit('bob'), true);
  f.boot();
  assert.equal(f.barn.view('bob').pen.fainted, false, 'healed for good');
  assert.equal(f.pvp.bugOf('bob').loaner, false, 'back in the fight');
  f.clock.now += 3600e3;
  assert.ok(f.again(f.bob).bug, 'and back to guiding');
  const again = f.barn.heal('bob');
  assert.equal(again.healed, false); assert.equal(again.cost, 0); assert.equal(f.barn.doc.pens.bob.heals, 1);
  // nothing to heal
  f.player('dee');
  assert.throws(() => f.barn.heal('dee'), /empty/);
  f.barn.doc.pens.dee = { stage: 'egg', species: 'manticora', eggAt: f.clock.now, hatchAt: f.clock.now + 1e9, warmedAt: 0 };
  assert.throws(() => f.barn.heal('dee'), /Eggs/);
});

test('old barn rows without faint fields are healthy and fit', (t) => {
  const f = fixture(t);
  assert.equal(f.barn.view('ann').pen.fainted, false);
  assert.deepEqual(f.barn.view('ann').pen.mineRecord, { w: 0, l: 0 });
  assert.equal(f.barn.fit('ann'), true);
  assert.equal(f.pvp.bugOf('ann').loaner, false);
});

test('HTTP: POST /api/barn/heal is signed-in only, free, and says whether anything was healed', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heal-http-'));
  const { app, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = await new Promise((res) => { const x = app.listen(0, () => res(x)); });
  const root = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  assert.equal((await fetch(`${root}/api/barn/heal`, { method: 'POST' })).status, 401);
  const login = await fetch(root + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann@x.test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const r = await fetch(`${root}/api/barn/heal`, { method: 'POST', headers: { cookie } });
  assert.equal(r.status, 404, 'an empty stall has nobody to heal');
});

// ----- the screens' words (pure) -----
const B = (over, extra = {}) => ({ id: 'x', side: 'a', you: { name: 'Manticora I', ownerName: 'Ann', level: 5, xpBar: { xp: 640, level: 5, from: 640, to: 1000 } }, foe: { name: 'Onymacris I', ownerName: 'Bob', level: 4 }, over, ...extra });

test('Bug Center script: all Japanese on screen, English on request, and the right branch for each stall', () => {
  const jp = /[\u3040-\u30ff\u4e00-\u9faf]/;
  const fainted = greeting({ stage: 'creature', name: 'Sagra II', fainted: true });
  assert.ok(fainted.every((l) => jp.test(l.ja) && l.en));
  assert.ok(fainted.at(-1).ask); assert.match(fainted.at(-1).ja, /元気にしますね/);
  assert.match(greeting({ stage: 'creature', name: 'Sagra II', fainted: false }).at(-1).ja, /診ておきましょうか/);
  assert.ok(greeting(null).at(-1).end); assert.ok(greeting({ stage: 'egg' }).at(-1).end); assert.ok(greeting({ stage: 'dead', name: 'x' }).at(-1).end);
  assert.match(done({ name: 'Sagra II' }, true)[0].ja, /すっかり元気/);
  assert.match(done({ name: 'Sagra II' }, true).map((l) => l.en).join(' '), /no charge/);
  assert.ok(NO.end); assert.ok(REST.end);
  const early = greeting({ stage: 'creature', name: 'Sagra II', fainted: true, recoverMs: 59.2 * 60e3, healCost: 50 });
  assert.match(early.at(-2).en, /another 60 minutes/); assert.match(early.at(-1).ja, /\$50/); assert.equal(early.at(-1).pay, true);
  assert.equal(fainted.at(-1).pay, undefined, 'a rested bug is healed free');
  assert.match(done({ name: 'Sagra II' }, true, 50).map((l) => l.en).join(' '), /\$50/);
  assert.ok(Object.values(SIGNS).every((s) => jp.test(s.ja) && s.en));
  assert.equal(SIGNS.title.ja, 'バグセンター');
  assert.ok(jp.test(NURSE.ja) && !/joy/i.test(NURSE.en), 'an original nurse');
  assert.ok(HEAL_TUNE.length >= 4);
});

function ringBout(f) {
  const { id } = f.barn.openBout('ann', { stake: 0 }).openBout;
  f.barn.joinBout('bob', id);
  return f.barn.fights.get(id);
}

// Put two standing bugs just before the bell, with the last attacker stunned so the score is deterministic.
function ringBell(fights, fight, hp) {
  fight.S.hp = hp;
  fight.S.turn = MAX_ROUNDS - 1;
  fight.S.side[fight.S.by].skip = true;
  fights.advance(fight);
}

test('simulateBout records explicit starting HP and defaults to full health', () => {
  const a = { species: 'manticora', name: 'A', level: 5, mood: 80 }, b = { species: 'onymacris', name: 'B', level: 5, mood: 80 };
  const full = simulateBout(a, b, 's1');
  assert.deepEqual(full.startHp, full.maxHp);
  const hurt = simulateBout({ ...a, health: 25 }, b, 's1');
  assert.equal(hurt.startHp[0], Math.ceil(hurt.maxHp[0] * 0.25)); assert.equal(hurt.startHp[1], hurt.maxHp[1]);
  assert.equal(simulateBout({ ...a, health: 0 }, b, 's1').startHp[0], 1, 'never starts below 1 HP');
  assert.ok(hurt.rounds.every((r) => r.hp[0] <= hurt.maxHp[0]));
});

test('barn knockout: the survivor starts its next bout at full HP while the loser must see the nurse', (t) => {
  const f = fixture(t), fight = ringBout(f);
  fight.S.by = 0;
  fight.S.hp = [60, 1];
  fight.S.R = () => 0.1;
  f.barn.fights.advance(fight);
  const win = f.barn.view('ann').pen, lose = f.barn.view('bob').pen;
  assert.deepEqual(win.lastBout.rounds.at(-1).hp, [60, 0], 'replay shows the actual finishing blow');
  assert.deepEqual([win.lastBout.healthAfter, win.health, win.hp, win.fainted], [100, 100, win.maxHp, false]);
  assert.deepEqual([lose.lastBout.healthAfter, lose.hp, lose.fainted, lose.faintedIn, lose.faintedBy], [0, 0, true, 'ring', 'ANN']);
  assert.equal(f.barn.openBout('ann', { stake: 0 }).openBout.fighter.health, 100);
  assert.equal(f.barn.heal('ann', { pay: true }).healed, false);
  f.clock.now += RECOVER_MS;
  f.boot();
  assert.throws(() => f.barn.openBout('bob', { stake: 0 }), /Bug Center/);
  const healed = f.barn.heal('bob');
  assert.deepEqual([healed.cost, healed.pen.fainted, healed.pen.health], [0, false, 100]);
});

for (const draw of [false, true]) {
  test(`barn bell: both bugs recover after a ${draw ? 'draw' : 'decision'} and the replay keeps the final HP`, (t) => {
    const f = fixture(t);
    f.barn.doc.pens.bob.xp = f.barn.doc.pens.ann.xp;
    const fight = ringBout(f);
    const hp = [draw ? 40 : 60, 40];
    ringBell(f.barn.fights, fight, hp);
    const ann = f.barn.view('ann').pen, bob = f.barn.view('bob').pen;
    assert.deepEqual([ann.lastBout.result, bob.lastBout.result], draw ? ['draw', 'draw'] : ['won', 'lost']);
    assert.deepEqual(ann.lastBout.rounds.at(-1).hp, hp);
    assert.deepEqual(bob.lastBout.rounds.at(-1).hp, [...hp].reverse());
    for (const pen of [ann, bob]) {
      assert.deepEqual([pen.lastBout.healthAfter, pen.hp, pen.fainted], [100, pen.maxHp, false]);
    }
  });
}

test('old partial-HP saves and posted bouts start at full HP; pre-health receipts do not invent a knockout', (t) => {
  const f = fixture(t);
  const open = f.barn.openBout('ann', { stake: 0 }).openBout;
  f.store.players.ann.barnBouts.open.fighter.health = 30;
  f.store.savePlayers();
  f.barn.doc.pens.ann.health = 30;
  f.barn.save();
  f.boot();
  const { pen: ann, openBout } = f.barn.view('ann');
  assert.equal(openBout.fighter.health, 100);
  assert.deepEqual([ann.health, ann.hp, ann.hurt, f.barn.heal('ann', { pay: true }).healed], [100, ann.maxHp, false, false]);
  f.store.players.bob.barnBouts = { lastBout: { id: 'old', petBornAt: f.barn.doc.pens.bob.bornAt, result: 'lost', xpEarned: 20 } };
  f.barn.applyBoutReward('bob');
  assert.equal(f.barn.view('bob').pen.fainted, false);
  f.barn.joinBout('bob', open.id);
  const live = f.barn.fights.get(open.id);
  assert.deepEqual(live.S.startHp, live.S.maxHp);
});

for (const outcome of ['decision', 'draw', 'forfeit']) {
  test(`mine ${outcome}: both standing bugs recover and nobody is reported as fainted`, (t) => {
    const f = fixture(t);
    f.barn.doc.pens.bob.xp = f.barn.doc.pens.ann.xp;
    const { battle } = f.meet();
    if (outcome === 'forfeit') {
      battle.fight.S.hp = [60, 40];
      f.pvp.forfeit(battle.b);
    } else {
      ringBell(f.pvp.fights, battle.fight, [outcome === 'draw' ? 40 : 60, 40]);
    }
    const a = f.pvp.battleView(battle, battle.a).over, b = f.pvp.battleView(battle, battle.b).over;
    assert.equal(a.reason, outcome);
    assert.equal(a.foeFainted, false);
    assert.equal(b.foeFainted, false);
    if (outcome === 'draw') {
      assert.equal(a.raid, null);
      assert.equal(b.bug, null);
    } else {
      assert.equal(a.won, true);
      assert.deepEqual([b.bug.fainted, b.bug.xp, b.raid.fainted], [false, outcome === 'forfeit' ? 0 : BATTLE_XP, false]);
      assert.equal(f.mines.doc.completed[battle.b].result.pvp.fainted, undefined);
    }
    for (const id of [battle.a, battle.b]) {
      const pen = f.barn.view(id).pen;
      assert.deepEqual([pen.fainted, pen.health, pen.hp], [false, 100, pen.maxHp]);
    }
  });
}

test('Scum: a fainted bug is at the Bug Center, so a stray covers the missed turn', () => {
  const pens = { p1: { stage: 'creature', species: 'manticora', name: 'Manticora I', fainted: true }, p2: { stage: 'creature', species: 'manticora', name: 'Sagra', fainted: false } };
  const fake = { barn: { view: (id) => ({ pen: pens[id] || null }) } };
  const t = { seats: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] };
  const sick = Scum.prototype.bugOf.call(fake, t, 0);
  assert.deepEqual(sick, { name: 'a stray bug', generic: true, benched: 'Manticora I' });
  assert.equal(Scum.prototype.bugWho(sick), 'a stray bug (Manticora I is at the Bug Center)');
  assert.equal(Scum.prototype.bugWho(Scum.prototype.bugOf.call(fake, t, 1)), 'their bug Sagra');
  assert.equal(Scum.prototype.bugWho(Scum.prototype.bugOf.call(fake, t, 2)), 'a stray bug');
});

test('Bug Center script treats a standing bug with old partial HP as healthy', () => {
  const pen = { stage: 'creature', name: 'Sagra II', fainted: false };
  assert.deepEqual(greeting({ ...pen, hurt: true, hp: 41, maxHp: 112 }), greeting(pen));
});

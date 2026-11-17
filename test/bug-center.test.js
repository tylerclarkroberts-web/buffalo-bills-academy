// v75: Game Boy battles end with a faint. The winner's bug earns battle XP plus a win bonus, the loser's bug faints
// (saved server-side) and sits out battles, barn bouts and guiding until the Bug Center nurse heals it, for free.
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
import { Pvp, PVP } from '../server/pvp.js';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';
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
  const end = f.annWins(m);
  assert.equal(end.battle.over.won, false);
  assert.deepEqual(end.battle.over.bug, { xp: BATTLE_XP, bonus: 0, fainted: true, levelBefore: 4, levelAfter: 4, xpBar: { xp: 360 + BATTLE_XP, level: 4, from: 360, to: 640 } });
  const annView = f.pvp.battleView(m.battle, 'ann');
  assert.equal(annView.over.won, true);
  assert.equal(annView.over.bug.xp, BATTLE_XP + WIN_BONUS_XP); assert.equal(annView.over.bug.bonus, WIN_BONUS_XP);
  assert.equal(annView.over.bug.fainted, false); assert.equal(annView.over.foeFainted, true);
  assert.equal(BATTLE_XP + WIN_BONUS_XP > BATTLE_XP, true, 'winning pays extra');
  assert.equal(f.barn.doc.pens.ann.xp, 640 + BATTLE_XP + WIN_BONUS_XP);
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

// ----- v76: HP never comes back on its own; only the Bug Center heals -----
import { simulateBout } from '../server/engine/bout.js';
import { Scum } from '../server/scum/index.js';
import { healthOf } from '../server/barn.js';

/** Ann posts a free barn bout and Bob joins it; tries seeds until the result isn't a draw. Returns both receipts. */
function bout(f) {
  for (let seed = 0; seed < 64; seed++) {
    f.barn.eggInt = () => seed;
    for (const id of ['ann', 'bob']) { const pen = f.barn.doc.pens[id]; pen.boutAt = 0; delete pen.faintedAt; delete pen.faintedBy; delete pen.faintedIn; delete pen.health; }
    f.barn.save();
    const open = f.barn.openBout('ann', { stake: 0 }).openBout;
    f.barn.joinBout('bob', open.id); f.clock.now += 10_000; f.barn.fights.sweep(); // nobody is watching, so it runs to the end
    const ann = f.barn.view('ann').pen.lastBout, bob = f.barn.view('bob').pen.lastBout;
    if (ann.result !== 'draw') return { ann, bob, winner: ann.result === 'won' ? 'ann' : 'bob', loser: ann.result === 'won' ? 'bob' : 'ann' };
    f.clock.now += 2 * 3600e3;
  }
  throw new Error('only draws');
}

test('simulateBout: a hurt bug starts the fight with what it has left; no health means full', () => {
  const a = { species: 'manticora', name: 'A', level: 5, mood: 80 }, b = { species: 'onymacris', name: 'B', level: 5, mood: 80 };
  const full = simulateBout(a, b, 's1');
  assert.deepEqual(full.startHp, full.maxHp);
  const hurt = simulateBout({ ...a, health: 25 }, b, 's1');
  assert.equal(hurt.startHp[0], Math.ceil(hurt.maxHp[0] * 0.25)); assert.equal(hurt.startHp[1], hurt.maxHp[1]);
  assert.equal(simulateBout({ ...a, health: 0 }, b, 's1').startHp[0], 1, 'never starts below 1 HP');
  assert.ok(hurt.rounds.every((r) => r.hp[0] <= hurt.maxHp[0]));
});

test('barn bout: the loser faints until the Bug Center; the winner keeps its damage; neither heals with time', (t) => {
  const f = fixture(t);
  const { ann, bob, winner, loser } = bout(f);
  for (const r of [ann, bob]) assert.ok(Number.isFinite(r.healthAfter) && Array.isArray(r.startHp), 'receipts carry the HP the bug walked away with');
  const lose = f.barn.view(loser).pen, win = f.barn.view(winner).pen;
  assert.equal(lose.fainted, true); assert.equal(lose.faintedIn, 'ring'); assert.equal(lose.faintedBy, winner.toUpperCase());
  assert.equal(lose.health, 0); assert.equal(lose.hp, 0); assert.equal(lose.hurt, true);
  assert.equal(win.fainted, false);
  assert.ok(win.health >= 1 && win.health <= 100); assert.equal(win.hp, win.health >= 100 ? win.maxHp : Math.round(win.maxHp * win.health / 100));
  // Fainted: no bouts until healed, even after the cooldown
  f.clock.now += 2 * 3600e3;
  assert.throws(() => f.barn.openBout(loser, { stake: 0 }), /fainted\. Take it to the Bug Center/);
  // Time does nothing: three days later (fed, so alive) the HP is exactly where the bout left it
  const before = { [winner]: f.barn.doc.pens[winner].health, [loser]: 0 };
  f.clock.now += 3 * 86400e3;
  for (const id of ['ann', 'bob']) { f.barn.doc.pens[id].fedAt = f.clock.now; for (const s of ['hunger', 'mood', 'clean']) f.barn.doc.pens[id].stats[s] = { v: 80, at: f.clock.now }; }
  f.barn.save(); f.boot();
  assert.equal(f.barn.view(winner).pen.health, before[winner] ?? 100, 'no passive regen');
  assert.equal(f.barn.view(loser).pen.fainted, true, 'fainting never wears off');
  // A hurt winner can still fight, starting at its reduced HP
  const pen = f.barn.doc.pens[winner]; pen.health = 40; f.barn.save();
  assert.equal(f.barn.view(winner).pen.hurt, true);
  const open = f.barn.openBout(winner, { stake: 0 }).openBout;
  assert.equal(open.fighter.health, 40);
  // The nurse: free, full HP, faint cleared, and the only way back
  const money = f.store.players[loser].bankroll;
  const healed = f.barn.heal(loser);
  assert.equal(healed.healed, true); assert.equal(healed.cost, 0); assert.equal(f.store.players[loser].bankroll, money);
  assert.equal(healed.pen.health, 100); assert.equal(healed.pen.hurt, false); assert.equal(healed.pen.fainted, false);
  assert.equal(f.barn.doc.pens[loser].faintedIn, undefined);
  f.barn.cancelBout(winner, open.id);
  const patched = f.barn.heal(winner);
  assert.equal(patched.healed, true, 'a hurt (not fainted) bug is healed too'); assert.equal(patched.pen.hp, patched.pen.maxHp);
  assert.equal(f.barn.heal(winner).healed, false, 'healthy: polite no-op');
});

test('barn bout: the host fights with its HP at join time, and old receipts without HP change nothing', (t) => {
  const f = fixture(t);
  f.barn.eggInt = () => 3;
  const open = f.barn.openBout('ann', { stake: 0 }).openBout;
  f.barn.doc.pens.ann.health = 30; f.barn.save(); // hurt after posting (e.g. a mine battle win)
  f.barn.joinBout('bob', open.id); f.clock.now += 10_000; f.barn.fights.sweep(); // nobody is watching, so it runs to the end
  const r = f.barn.view('ann').pen.lastBout;
  assert.equal(r.startHp[0], Math.ceil(r.maxHp[0] * 0.3));
  // a pre-v76 receipt (no healthAfter) leaves the pen untouched
  const pen = f.barn.doc.pens.bob; const { faintedAt: _a, faintedBy: _b, faintedIn: _c, health: _h, ...clean } = pen;
  f.barn.doc.pens.bob = { ...clean, settledBoutId: null };
  f.store.players.bob.barnBouts.lastBout = { ...f.store.players.bob.barnBouts.lastBout, id: 'old', healthAfter: undefined, result: 'lost' };
  f.barn.applyBoutReward('bob');
  assert.equal(f.barn.doc.pens.bob.faintedAt, undefined); assert.equal(healthOf(f.barn.doc.pens.bob), 100);
});

test('mine battle: the winner keeps its scrapes until the Bug Center', (t) => {
  const f = fixture(t);
  const m = f.meet();
  const annSide = m.battle.a === 'ann' ? 0 : 1, S = m.battle.fight.S;
  S.hp[annSide] = Math.floor(S.maxHp[annSide] / 2);
  f.annWins(m);
  const h = f.barn.doc.pens.ann.health;
  assert.ok(h > 0 && h < 100, `ann is hurt (${h}%)`);
  assert.equal(f.barn.view('ann').pen.hurt, true);
  assert.equal(f.pvp.bugOf('ann').health, h, 'and its next battle starts hurt');
  f.barn.heal('ann');
  assert.equal(f.pvp.bugOf('ann').health, 100);
});

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

test('Bug Center script: a hurt bug gets its HP read out and an offer to patch it up', () => {
  const lines = greeting({ stage: 'creature', name: 'Sagra II', fainted: false, hurt: true, hp: 41, maxHp: 112 });
  assert.match(lines.at(-2).en, /hurt.*41\/112/); assert.ok(lines.at(-1).ask); assert.match(lines.at(-1).en, /won't heal on its own/);
});

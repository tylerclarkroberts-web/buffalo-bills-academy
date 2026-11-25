// Bug battles on the leaderboard: every finished fight is logged once (bouts, wild bugs, mine battles, the circuit),
// older totals are backfilled from what the data already holds, and nothing here touches a bankroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { Circuit } from '../server/circuit.js';
import { BattleLog, BACKFILL_VERSION } from '../server/battles.js';
import { createApp } from '../server/app.js';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';
import { wildAt } from '../server/engine/wild-roam.js';
import { xpFor } from '../server/engine/creatures.js';
import { rankBattles } from '../client/src/battleRank.js';

const V = { rulesVersion: 2 };
const EAST = -Math.PI / 2, WEST = Math.PI / 2;
const tmp = (t, name) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bba-battles-${name}-`)); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const pen = (extra) => ({ stage: 'creature', species: 'lamprima', name: 'Lamprima', xp: xpFor(5), bornAt: 1, ...extra });

test('a fight is logged once, counted for both corners and shown from each side', (t) => {
  const store = new Store(tmp(t, 'unit'));
  store.players = { a: { id: 'a', name: 'Ann', bankroll: 100 }, b: { id: 'b', name: 'Bob', bankroll: 100 } };
  const log = new BattleLog({ store, now: () => 5 });
  const fight = { id: 'f1', type: 'bout', at: 10, winner: 0, pot: 50,
    sides: [{ pid: 'a', name: 'Ann', bug: { name: 'Lamprima', species: 'lamprima', level: 6 }, xp: 18, cash: 25 }, { pid: 'b', name: 'Bob', bug: { name: 'Pyrops', species: 'pyrops', level: 5 }, xp: 9, cash: -25 }] };
  assert.ok(log.record(fight));
  assert.equal(log.record(fight), null, 'a replay changes nothing');
  log.record({ id: 'f2', type: 'wild', at: 20, winner: 1, sides: [{ pid: 'a', name: 'Ann', bug: { name: 'Lamprima', level: 6 }, xp: 15 }, { pid: null, name: 'a wild Empusa', bug: { name: 'Empusa', level: 9 } }] });
  log.record({ id: 'f3', type: 'raid', at: 30, winner: null, sides: [{ pid: 'a', name: 'Ann', bug: null }, { pid: 'b', name: 'Bob', bug: null }] });
  assert.equal(log.record({ id: 'bad', type: 'poker', sides: [] }), null);
  const ann = log.statsOf('a');
  assert.deepEqual(ann.total, { w: 1, l: 1, d: 1, n: 3, pct: 0.5 });
  assert.deepEqual(ann.by.bout, { w: 1, l: 0, d: 0, n: 1, pct: 1 });
  assert.deepEqual(ann.by.circuit, { w: 0, l: 0, d: 0, n: 0, pct: null });
  assert.equal(log.statsOf('b').by.bout.l, 1);
  const [draw, wild, bout] = log.historyOf('a');
  assert.deepEqual([draw.result, wild.result, bout.result], ['draw', 'lost', 'won']);
  assert.equal(wild.them.name, 'a wild Empusa'); assert.equal(wild.xp, 15);
  assert.deepEqual([bout.cash, bout.xp, bout.pot, bout.them.bug.name], [25, 18, 50, 'Pyrops']);
  const bobs = log.historyOf('b', { type: 'bout' });
  assert.equal(bobs.length, 1); assert.equal(bobs[0].result, 'lost'); assert.equal(bobs[0].cash, -25); assert.equal(bobs[0].them.name, 'Ann');
  store.players.b.name = 'Bobby';
  assert.equal(log.historyOf('a', { type: 'bout' })[0].them.name, 'Bobby', 'a renamed player shows today\'s name');
  assert.equal(new BattleLog({ store }).doc.entries.length, 3, 'kept in battles.json');
  assert.deepEqual([store.players.a.bankroll, store.players.b.bankroll], [100, 100]);
});

test('backfill: bug records become frozen totals, the barn and raid logs become fights, once', (t) => {
  const store = new Store(tmp(t, 'backfill'));
  const players = store.players = {
    a: { id: 'a', name: 'Ann', bankroll: 10, barnBouts: { lastBout: { id: 'r1', xpEarned: 21, net: 40 } } },
    b: { id: 'b', name: 'Bob', bankroll: 20 }, c: { id: 'c', name: 'Cy', bankroll: 30 },
  };
  const barn = {
    doc: { fights: [{ id: 'r1', at: 300, pot: 80, winner: 0, sides: [{ ownerId: 'a', owner: 'Ann', fighter: { name: 'Lamprima', species: 'lamprima', level: 7 } }, { ownerId: 'b', owner: 'Bob', fighter: { name: 'Pyrops', species: 'pyrops', level: 6 } }] }] },
    bugs: (pid) => ({ a: [pen({ record: { w: 4, l: 2, d: 1 }, mineRecord: { w: 6, l: 1 } }), pen({ record: { w: 1, l: 0, d: 0 } })], b: [pen({ record: { w: 2, l: 5, d: 1 }, mineRecord: { w: 1, l: 3 } })] }[pid] || []),
    farmBugs: (pid) => (pid === 'c' ? [pen({ record: { w: 3, l: 0, d: 0 } })] : []),
  };
  const pvp = { doc: { raids: {
    x1: { id: 'x1', kind: 'battle', at: 200, battleId: 'B1', winner: 'a', winnerName: 'Ann', loser: 'b', loserName: 'Robert', paid: 30, bugs: { winner: { xp: xpFor(7) }, loser: { xp: xpFor(6) }, winnerBug: 'Lamprima', loserBug: 'Pyrops' }, barn: { winner: { xp: 19 }, loser: { xp: 12 } }, done: true },
    x2: { id: 'x2', kind: 'battle', at: 100, battleId: 'B0', winner: 'b', winnerName: 'Bob', loser: 'a', loserName: 'Ann', cash: 44, done: true }, // before bugs were stored: no mine record either
    x3: { id: 'x3', kind: 'ambush', at: 150, battleId: null, winner: 'c', winnerName: 'Cy', loser: 'a', loserName: 'Ann', paid: 50, done: true },
  } } };
  const log = new BattleLog({ store, now: () => 999 });
  const out = log.backfill({ players, barn, pvp });
  assert.deepEqual([out.skipped, out.entries], [false, 3]);
  const ann = log.statsOf('a').by, bob = log.statsOf('b').by;
  assert.deepEqual([ann.bout.w, ann.bout.l, ann.bout.d], [5, 2, 1], 'partner and stalled bugs');
  assert.deepEqual([ann.raid.w, ann.raid.l], [1, 1], 'battle raids only; an ambush is not a bug fight');
  assert.deepEqual([ann.wild.w, ann.wild.l], [5, 1], 'the mine record less the raid it already counted');
  assert.deepEqual([bob.wild.w, bob.wild.l], [1, 2]);
  assert.equal(log.statsOf('c').by.bout.w, 3, 'a farm bug keeps its record');
  assert.equal(log.statsOf('c').total.n, 3);
  assert.equal(log.statsOf('a').by.circuit.n, 0, 'the circuit was never counted before');
  const hist = log.historyOf('a');
  assert.deepEqual(hist.map((h) => [h.type, h.result]), [['bout', 'won'], ['raid', 'won'], ['raid', 'lost']]);
  assert.deepEqual([hist[0].xp, hist[0].cash, hist[0].pot], [21, 40, 80], 'from the receipt still on file');
  assert.deepEqual([hist[1].cash, hist[1].xp, hist[1].bug.name, hist[1].bug.level, hist[1].them.name], [30, 19, 'Lamprima', 7, 'Bob']);
  assert.deepEqual([hist[2].cash, hist[2].bug], [-44, null]);
  assert.ok(hist.every((h) => h.src === 'backfill'));
  assert.equal(log.doc.backfill.v, BACKFILL_VERSION);
  // live fights after it add to the frozen totals; a second backfill (a restart) leaves everything alone
  log.record({ id: 'live1', type: 'bout', winner: 1, sides: [{ pid: 'a', name: 'Ann', bug: null }, { pid: 'b', name: 'Bob', bug: null }] });
  const again = new BattleLog({ store, now: () => 2000 });
  assert.equal(again.backfill({ players, barn, pvp }).skipped, true);
  assert.deepEqual([again.statsOf('a').by.bout.l, again.statsOf('b').by.bout.w], [3, 3]);
  assert.deepEqual([players.a.bankroll, players.b.bankroll, players.c.bankroll], [10, 20, 30]);
});

function mine(t) {
  const dir = tmp(t, 'mine');
  const clock = { now: Date.parse('2026-11-16T19:00:00Z') }, now = () => clock.now, f = { clock };
  f.store = new Store(dir); f.accounts = new Accounts({ store: f.store, now });
  f.barn = new Barn({ store: f.store, accounts: f.accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0) });
  f.barn.battleLog = f.log = new BattleLog({ store: f.store, now });
  f.shop = new Shop({ store: f.store, accounts: f.accounts, barn: f.barn, now });
  f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000, wormInt: (n) => n - 1 });
  f.mines.owned = (id) => f.shop.doc.inv[id]?.own;
  f.pvp = new Pvp({ store: f.store, accounts: f.accounts, mines: f.mines, shop: f.shop, barn: f.barn, avatars: null, now, randInt: (n) => (n === 81 ? 10 : 0) });
  f.player = (id) => {
    const p = f.store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    f.accounts.ensure(p); p.bankroll = 1000; p.mining.shifts = 10; f.store.savePlayers();
    return p;
  };
  f.partner = (id, level = 10) => { f.barn.layEgg(id); clock.now += 2000; f.barn.view(id); f.barn.doc.pens[id].xp = xpFor(level); f.barn.save(); };
  return f;
}

test('a wild bug fight is logged with the bug, the foe and the XP it paid', (t) => {
  const f = mine(t), ann = f.player('ann'); f.partner('ann', 8);
  const s = f.mines.start(ann, V); f.pvp.tick(ann, { ...V, shiftId: s.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(s.wilds[0], f.clock.now));
  f.pvp.meetWild(ann, { shiftId: s.shiftId });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  for (let i = 0; i < 200 && !battle.over; i++) { f.clock.now += 5000; f.pvp.tick(ann, { ...V, shiftId: s.shiftId }); }
  const [h] = f.log.historyOf('ann');
  assert.equal(h.type, 'wild'); assert.equal(h.result, 'won');
  assert.equal(h.xp, battle.over.bug.xp); assert.ok(h.xp > 0);
  assert.equal(h.bug.level, 8); assert.equal(h.them.id, null);
  assert.match(h.them.name, /^a wild /); assert.equal(h.them.bug.level, s.wilds[0].level);
  assert.equal(h.cash, null, 'a wild bug carries no wallet');
  assert.deepEqual(f.log.statsOf('ann').by.wild, { w: 1, l: 0, d: 0, n: 1, pct: 1 });
});

function meet(f) {
  const a = f.mines.start(f.store.players.ann, V), b = f.mines.start(f.store.players.bob, V);
  const tick = (id, s, pos) => f.pvp.tick(f.store.players[id], { ...V, shiftId: s.shiftId, ...pos });
  tick('ann', a, { x: 1, y: 1, yaw: 0, fresh: true }); tick('bob', b, { x: 1, y: 1, yaw: 0, fresh: true });
  f.clock.now += 60000;
  const m = makeMaze(a.seed, a.cells, FIRST_POOL_STEPS[a.cells]), g = m.grid;
  let at = null;
  for (let y = 1; y < g.length - 1 && !at; y++) for (let x = 1; x < g.length - 2; x++) if (!g[y][x] && !g[y][x + 1] && Math.hypot(x - 1, y - 1) > 4) { at = { x, y }; break; }
  tick('bob', b, { x: at.x + 0.6, y: at.y, yaw: WEST });
  const view = tick('ann', a, { x: at.x, y: at.y, yaw: EAST });
  return { a, b, tick, battle: f.pvp.battles.get(view.battle.id) };
}

test('a mine battle between miners is logged for both, with the cash that changed hands', (t) => {
  const f = mine(t); f.player('ann'); f.player('bob');
  const { a, b, tick, battle } = meet(f), bobSide = battle.a === 'bob' ? 0 : 1;
  for (let i = 0; i < 40 && !battle.over; i++) { battle.fight.S.hp[bobSide] = 1; battle.fight.S.hp[1 - bobSide] = battle.fight.S.maxHp[1 - bobSide]; f.clock.now = battle.fight.nextAt; tick('ann', a, { x: 0, y: 0, yaw: 0 }); if (!battle.over) tick('bob', b, { x: 0, y: 0, yaw: 0 }); }
  const [annH] = f.log.historyOf('ann'), [bobH] = f.log.historyOf('bob');
  assert.deepEqual([annH.type, annH.result, annH.cash, annH.them.name], ['raid', 'won', 30, 'BOB']);
  assert.deepEqual([bobH.type, bobH.result, bobH.cash, bobH.them.name], ['raid', 'lost', -30, 'ANN']);
  assert.match(annH.bug.name, /Gerald/, 'no bug of their own: the Foreman\'s loaner is what fought');
  assert.equal(f.log.doc.entries.length, 1);
  assert.equal(f.store.players.ann.bankroll, 1030, 'the log only reads what the raid paid');
});

test('walking out of a mine battle is logged as a loss that says so', (t) => {
  const f = mine(t); f.player('ann'); f.player('bob');
  const { a, b, tick, battle } = meet(f);
  f.clock.now = battle.fight.nextAt; tick('bob', b, { x: 0, y: 0, yaw: 0 }); tick('ann', a, { x: 0, y: 0, yaw: 0 });
  for (let i = 0; i < 4; i++) { f.clock.now += 5000; tick('ann', a, { x: 0, y: 0, yaw: 0 }); }
  const [bobH] = f.log.historyOf('bob');
  assert.deepEqual([bobH.result, bobH.reason], ['lost', 'disconnect']);
  assert.equal(f.log.statsOf('ann').by.raid.w, 1);
});

test('a circuit fight is logged with its stop, the XP and the purse', (t) => {
  const dir = tmp(t, 'circuit'), clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1 });
  barn.battleLog = new BattleLog({ store, now });
  const circuit = new Circuit({ store, barn, accounts, now });
  store.players.p1 = { id: 'p1', name: 'Tester', bankroll: 100 };
  barn.layEgg('p1'); clock.now += 5; barn.view('p1'); barn.doc.pens.p1.xp = xpFor(10); barn.save();
  circuit.talk('p1', { stop: 'foff', answer: 1 });
  const v = circuit.fight('p1', 'Tester', { stop: 'salad' });
  const fight = barn.fights.get(v.live);
  clock.now += 10_000; barn.fights.sweep();
  const [h] = barn.battleLog.historyOf('p1');
  assert.equal(h.type, 'circuit');
  assert.equal(h.result, fight.over.winner === 0 ? 'won' : 'lost');
  assert.equal(h.them.name, 'Lady Who Found It in Her Salad'); assert.equal(h.them.id, null);
  assert.equal(h.xp, fight.extra.xpEarned || 0);
  assert.equal(h.cash, store.players.p1.bankroll - 100, 'the purse, when it paid one');
  assert.ok(h.note, 'the area it was in');
});

test('HTTP: a real Barn bout lands on the battle board; details need a signed-in player', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-battles-http-')), clock = { now: 1_800_000_000_000 };
  const running = createApp({ dataDir, now: () => clock.now, devLogin: true, env: { BARN_INCUBATE_MS: '1', BJ_TICK_MS: '0' }, marketSources: {}, snapshots: false });
  const server = await new Promise((resolve) => { const s = running.app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { running.shutdown(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = (headers) => async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  const anon = client({});
  const login = async (name) => { const res = await anon('POST', '/auth/dev', { name, email: `${name.toLowerCase()}@example.test` }); return { id: res.body.id, api: client({ cookie: res.headers.get('set-cookie').split(';')[0] }) }; };
  const owner = await login('BugOwner'), other = await login('OtherRancher');
  const barn = running.service.barn;
  assert.ok(barn.battleLog.doc.backfill, 'the backfill ran on boot');
  for (const id of [owner.id, other.id]) { barn.layEgg(id); clock.now += 1; barn.view(id); barn.doc.pens[id].xp = xpFor(6); barn.save(); }
  assert.deepEqual((await anon('GET', '/api/battles')).body.rows, [], 'nobody has fought');
  const posted = await owner.api('POST', '/api/barn/bouts', { stake: 20 });
  assert.equal(posted.status, 200);
  const joined = await other.api('POST', `/api/barn/bouts/${posted.body.openBout.id}/join`, {});
  const fight = barn.fights.get(joined.body.live);
  for (let beat = 0; beat < 200 && !fight.over; beat++) { clock.now = Math.max(clock.now, fight.nextAt); barn.fights.view(fight, other.id); barn.fights.sweep(); }
  const board = (await anon('GET', '/api/battles')).body;
  assert.equal(board.rows.length, 2);
  for (const row of board.rows) { assert.equal(row.by.bout.n, 1); assert.equal(row.total.n, 1); assert.equal('history' in row, false); }
  assert.equal(board.rows.reduce((sum, r) => sum + r.total.w, 0), fight.over.winner === null ? 0 : 1);
  assert.equal((await anon('GET', `/api/battles/${owner.id}`)).status, 401);
  const mine = await owner.api('GET', `/api/battles/${owner.id}`);
  assert.equal(mine.status, 200); assert.equal(mine.body.self, true);
  const [h] = mine.body.history, receipt = running.service.getPlayer(owner.id).barnBouts.lastBout;
  assert.deepEqual([h.type, h.result, h.xp, h.cash, h.pot, h.them.name], ['bout', receipt.result, receipt.xpEarned, receipt.net, 20 + receipt.against, 'OtherRancher']);
  assert.equal((await other.api('GET', `/api/battles/${owner.id}`)).body.self, false);
  assert.equal((await owner.api('GET', '/api/battles/nobody')).status, 404);
  assert.equal((await owner.api('GET', `/api/battles/${owner.id}?type=wild`)).body.history.length, 0);
  running.service.getPlayer(other.id).hidden = true;
  assert.equal((await owner.api('GET', `/api/battles/${other.id}`)).status, 404);
  assert.equal((await anon('GET', '/api/battles')).body.rows.length, 1, 'hidden players stay off the board');
});

test('the board ranks by win % once a player has three decided fights', () => {
  const row = (name, w, l, d = 0) => ({ name, total: { w, l, d, n: w + l + d, pct: w + l ? w / (w + l) : null }, by: { bout: { w, l, d, n: w + l + d, pct: w + l ? w / (w + l) : null } } });
  const rows = [row('Lucky', 1, 0), row('Steady', 6, 4), row('Ace', 9, 3), row('Tied', 3, 1), row('Nobody', 0, 0)];
  assert.deepEqual(rankBattles(rows).map((r) => r.name), ['Ace', 'Tied', 'Steady', 'Lucky']);
  assert.deepEqual(rankBattles(rows, 'bout').map((r) => r.name), ['Ace', 'Tied', 'Steady', 'Lucky']);
});

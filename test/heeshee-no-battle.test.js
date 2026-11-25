// A bug lost to the Heeshee (held on the barn row, or stolen on the live shift) cannot start or join any bug fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, HEESHEE_NO_BATTLE } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { Circuit } from '../server/circuit.js';
import { wildAt } from '../server/engine/wild-roam.js';
import { makeMaze, FIRST_POOL_STEPS } from '../server/engine/maze.js';

const V = { rulesVersion: 2 };
const EAST = -Math.PI / 2, WEST = Math.PI / 2;
const MSG = "You can't battle a bug, your bug is lost.";

function lost(fn) {
  assert.throws(fn, (err) => { assert.equal(err.message, MSG); assert.equal(err.message, HEESHEE_NO_BATTLE); return true; });
}

function harness(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heeshee-fight-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-20T19:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: () => 0 });
  const shop = new Shop({ store, accounts, barn, now });
  const mines = new Mines({ store, accounts, barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000, wormInt: (n) => n - 1 });
  mines.owned = (id) => shop.doc.inv[id]?.own;
  barn.mines = mines;
  const pvp = new Pvp({ store, accounts, mines, shop, barn, avatars: null, now, randInt: (n) => Math.floor(n / 2) });
  const circuit = new Circuit({ store, barn, accounts, now });
  const player = (id) => {
    const p = store.players[id] = { id, name: id.toUpperCase(), kind: 'password', login: { username: id }, createdAt: clock.now - 30 * 86400e3 };
    accounts.ensure(p); p.bankroll = 1000; p.mining.shifts = 10; store.savePlayers();
    return p;
  };
  const ann = player('ann'), bob = player('bob');
  const hatch = (id, level = 5) => {
    barn.layEgg(id); clock.now += 2000; barn.view(id);
    barn.doc.pens[id].xp = 40 * (level - 1) ** 2; barn.save();
    return barn.view(id).pen;
  };
  return { clock, store, accounts, barn, shop, mines, pvp, circuit, ann, bob, hatch };
}

test('the official line is exact', () => {
  assert.equal(HEESHEE_NO_BATTLE, MSG);
});

test('wild encounters: a held bug cannot start a mine battle, and canFightWild is false', (t) => {
  const f = harness(t);
  f.hatch('ann');
  f.barn.holdHeeshee('ann', { shiftId: 's1', at: f.clock.now });
  const s = f.mines.start(f.ann, V);
  f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  const [wild] = s.wilds;
  Object.assign(f.pvp.presence.get('ann'), wildAt(wild, f.clock.now));
  assert.equal(f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }).canFightWild, false);
  lost(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id }));
  assert.equal(f.pvp.inBattle.get('ann'), undefined);
});

test('wild encounters: a mid-shift steal flag blocks the fight even if the barn hold was not stamped', (t) => {
  const f = harness(t);
  f.hatch('ann');
  const s = f.mines.start(f.ann, V);
  f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId });
  const cur = f.mines.doc.active[f.ann.id];
  f.mines.doc.active[f.ann.id] = { ...cur, heesheeStolen: true, heesheeStolenAt: f.clock.now };
  const [wild] = s.wilds;
  Object.assign(f.pvp.presence.get('ann'), wildAt(wild, f.clock.now));
  assert.equal(f.pvp.bugLost(f.ann.id), true);
  assert.equal(f.pvp.tick(f.ann, { ...V, shiftId: s.shiftId }).canFightWild, false);
  lost(() => f.pvp.meetWild(f.ann, { shiftId: s.shiftId, wildId: wild.id }));
  assert.equal(f.pvp.inBattle.get('ann'), undefined);
});

test('mine PvP: face-to-face does not start a bug battle if either miner\'s bug is lost', (t) => {
  const f = harness(t);
  f.hatch('ann');
  f.barn.holdHeeshee('ann', { shiftId: 's1', at: f.clock.now });
  const a = f.mines.start(f.ann, V), b = f.mines.start(f.bob, V);
  const maze = makeMaze(a.seed, a.cells, FIRST_POOL_STEPS[a.cells]), g = maze.grid;
  let at = null;
  for (let y = 1; y < g.length - 1 && !at; y++) for (let x = 1; x < g.length - 2; x++) {
    if (!g[y][x] && !g[y][x + 1] && Math.hypot(x - 1, y - 1) > 4) { at = { x, y }; break; }
  }
  assert.ok(at, 'corridor');
  f.clock.now += 15000; // past grace
  f.pvp.tick(f.ann, { ...V, shiftId: a.shiftId, x: 1, y: 1, yaw: 0, fresh: true });
  f.pvp.tick(f.bob, { ...V, shiftId: b.shiftId, x: 1, y: 1, yaw: 0, fresh: true });
  f.pvp.tick(f.ann, { ...V, shiftId: a.shiftId, x: at.x, y: at.y, yaw: EAST });
  const view = f.pvp.tick(f.bob, { ...V, shiftId: b.shiftId, x: at.x + 0.6, y: at.y, yaw: WEST });
  assert.equal(f.pvp.canBattle(f.ann.id, f.bob.id), false);
  assert.equal(view.battle, undefined);
  assert.equal(f.pvp.startBattle(f.ann.id, f.bob.id), null);
  assert.equal(f.pvp.inBattle.get('ann'), undefined);
  assert.equal(f.pvp.inBattle.get('bob'), undefined);
});

test('barn ring: ready, open, join, challenge and accept are all refused', (t) => {
  const f = harness(t);
  const annPen = f.hatch('ann'), bobPen = f.hatch('bob');
  f.barn.holdHeeshee('ann', { shiftId: 's1', at: f.clock.now });
  lost(() => f.barn.ready('ann'));
  lost(() => f.barn.openBout('ann', { stake: 0 }));
  lost(() => f.barn.challenge('ann', { to: 'bob', their: bobPen.id, stake: 0, bug: annPen.id }));
  // Bob can still post; Ann cannot join or accept
  const posted = f.barn.openBout('bob', { stake: 0 }).openBout;
  lost(() => f.barn.joinBout('ann', posted.id, { bug: annPen.id }));
  f.barn.cancelBout('bob', posted.id);
  f.barn.releaseHeeshee('ann');
  const sent = f.barn.challenge('bob', { to: 'ann', their: annPen.id, stake: 0, bug: bobPen.id });
  const challenge = sent.challenges?.incoming?.[0] || f.barn.view('ann').challenges?.incoming?.[0];
  f.barn.holdHeeshee('ann', { shiftId: 's2', at: f.clock.now });
  assert.ok(challenge?.id, 'bob sent a challenge');
  lost(() => f.barn.acceptChallenge('ann', challenge.id));
});

test('circuit fights are refused while the bug is lost', (t) => {
  const f = harness(t);
  f.hatch('ann');
  f.barn.holdHeeshee('ann', { shiftId: 's1', at: f.clock.now });
  lost(() => f.circuit.fight('ann', 'ANN', { stop: 'salad' }));
});

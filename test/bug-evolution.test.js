// Evolution: a partner with the XP for level 10 may find purple acid on a shift, comes home sick, and the Bug Center
// visit rebuilds it for half its owner's cash. One rebuild in fifteen is botched, and comes back with a quirk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, purpleChance, EVOLVE_FROM, EVOLVE_BY, BOTCH_ODDS } from '../server/barn.js';
import { Mines, purpleSpot } from '../server/mines.js';
import { shiftMaze } from '../server/engine/mine-tiers.js';
import { xpFor, levelFor, PAUSED_AT } from '../server/engine/creatures.js';
import { line, simulateBout, QUIRKS } from '../server/engine/bout.js';

const V = { rulesVersion: 2 };
function fixture(t, { purple = 0, botch = 1, quirk = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-evo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-19T19:00:00Z') }, now = () => clock.now, f = { clock, purple, botch, quirk };
  f.store = new Store(dir); f.accounts = new Accounts({ store: f.store, now });
  // evoInt(1000) is the purple roll, evoInt(BOTCH_ODDS) the botch roll (0 botches), evoInt(QUIRKS.length) which quirk
  f.barn = new Barn({ store: f.store, accounts: f.accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), evoInt: (n) => (n === 1000 ? f.purple : n === BOTCH_ODDS ? f.botch : f.quirk) });
  f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: () => 0, poolInt: () => 40000 });
  const player = f.store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * 86400e3 };
  f.accounts.ensure(player); player.bankroll = 1001; f.store.savePlayers(); f.ann = player;
  f.partner = (level) => { f.barn.layEgg('ann'); clock.now += 2000; f.barn.view('ann'); f.barn.doc.pens.ann.xp = xpFor(level); f.barn.save(); return f.barn.doc.pens.ann; };
  return f;
}

test('purple acid is for a partner with the XP for level 10: one shift in four, certain by 13', (t) => {
  assert.deepEqual([9, 10, 11, 12, 13, 20].map((level) => purpleChance(xpFor(level))), [0, 0.25, 0.5, 0.75, 1, 1]);
  assert.deepEqual([EVOLVE_FROM, EVOLVE_BY], [10, 13]);
  const f = fixture(t, { purple: 249 });
  f.partner(9);
  assert.equal(f.mines.start(f.ann, V).purple, undefined, 'a level 9 is not due');
  f.mines.quit(f.ann, f.mines.doc.active.ann.id, V);
  f.barn.doc.pens.ann.xp = xpFor(10);
  assert.equal(f.barn.view('ann').pen.level, PAUSED_AT, 'it still shows 9');
  const shift = f.mines.start(f.ann, { ...V, afterShiftId: f.mines.doc.completed.ann.shiftId });
  assert.ok(shift.purple.afterMs >= 45000, 'a roll under 250 in 1000 finds it');
  f.mines.quit(f.ann, shift.shiftId, V);
  f.barn.doc.pens.ann = { ...f.barn.doc.pens.ann, sick: undefined, faintedAt: undefined }; f.purple = 250;
  assert.equal(f.mines.start(f.ann, { ...V, afterShiftId: shift.shiftId }).purple, undefined, 'and 250 does not');
});

test('however a purple shift ends the bug comes home sick, with no lecture, and nothing works on it but the Bug Center', (t) => {
  const f = fixture(t);
  f.partner(11);
  const shift = f.mines.start(f.ann, V);
  const out = f.mines.quit(f.ann, shift.shiftId, V);
  assert.equal(out.sick, f.barn.doc.pens.ann.name);
  assert.equal(out.pending, null, 'the foreman keeps it to himself');
  const pen = f.barn.view('ann').pen;
  assert.deepEqual([pen.sick, pen.fainted, pen.evo], [true, true, 0]);
  assert.throws(() => f.barn.care('ann', 'feed'), /is not well/);
  assert.throws(() => f.barn.ready('ann'), /Bug Center/);
  assert.equal(f.mines.start(f.ann, { ...V, afterShiftId: shift.shiftId }).purple, undefined, 'a sick bug stays home');
});

test('the Bug Center rebuilds it at once for half the owner\'s cash, and it leaves the level 9 hold', (t) => {
  const f = fixture(t);
  f.partner(12);
  f.mines.quit(f.ann, f.mines.start(f.ann, V).shiftId, V);
  const out = f.barn.heal('ann');
  assert.deepEqual(out.evolved.bill, { had: 1001, took: 500.5, left: 500.5 });
  assert.equal(f.ann.bankroll, 500.5);
  assert.deepEqual([out.evolved.botched, out.evolved.levelBefore, out.evolved.levelAfter], [null, 9, 12], 'the XP it was holding counts at once');
  const pen = out.pen;
  assert.deepEqual([pen.evo, pen.sick, pen.fainted, pen.level, pen.cap], [1, undefined, false, 12, 23]);
  assert.ok(pen.abilities[4].unlocked, 'the level 10 move comes with it');
  f.barn.doc.pens.ann.xp = xpFor(29);
  assert.equal(f.barn.view('ann').pen.level, 23, 'and it holds again at 23, with no ribbons asked for');
  assert.equal(f.barn.heal('ann').evolved, undefined, 'once');
  assert.equal(f.ann.bankroll, 500.5);
  assert.equal(f.mines.start(f.ann, { ...V, afterShiftId: f.mines.doc.completed.ann.shiftId }).purple, undefined, 'and never purple again');
});

test('one rebuild in fifteen is botched: same bill, and a quirk for good', (t) => {
  const f = fixture(t, { botch: 0, quirk: 1 });
  assert.equal(BOTCH_ODDS, 15);
  f.partner(10); f.ann.bankroll = 0;
  f.mines.quit(f.ann, f.mines.start(f.ann, V).shiftId, V);
  const out = f.barn.heal('ann');
  assert.deepEqual([out.evolved.botched, out.evolved.bill.took, out.pen.botched, out.pen.evo, out.pen.style.botched], ['berserk', 0, 'berserk', 1, 'berserk'], 'someone with nothing pays nothing');
  const clean = { ...f.barn.fighter('ann', f.barn.doc.pens.ann), botched: undefined, plain: true };
  const fights = (quirk) => Array.from({ length: 40 }, (_, i) => simulateBout({ ...clean, botched: quirk }, clean, `q${i}`));
  assert.deepEqual(QUIRKS, ['lazy', 'berserk', 'haywire']);
  assert.ok(fights('lazy').some((b) => b.rounds.some((r) => r.by === 0 && /cannot be bothered/.test(r.line))), 'a lazy bug sits turns out');
  assert.ok(fights('haywire').some((b) => b.rounds.some((r) => /arm goes for/.test(r.line))), 'a haywire arm turns on its owner');
  const hits = (quirk, side) => fights(quirk).flatMap((b) => b.rounds.filter((r) => r.by === side && r.type === 'move' && r.hit && r.dmg > 0).map((r) => r.dmg));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(hits('berserk', 0)) > mean(hits(undefined, 0)) * 1.15 && mean(hits('berserk', 1)) > mean(hits(undefined, 1)) * 1.1, 'a berserk bug hits harder and is hit harder');
  assert.ok(fights('berserk').every((b) => b.rounds.every((r) => r.by !== 0 || r.effect !== 'heal' || r.type !== 'move')), 'and never stops to heal');
  const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)], wild = hits('haywire', 0), usual = hits(undefined, 0);
  assert.ok(pct(wild, 0.9) > pct(usual, 0.9) * 1.2 && pct(wild, 0.1) < pct(usual, 0.1), 'a haywire bug hits anywhere from a tap to a wallop');
  for (const quirk of QUIRKS) { const p = line({ ...clean, botched: quirk }, clean); assert.ok(p > 0.2 && p < 0.6, `${quirk} is a handicap or a gamble, never a gift: ${p}`); }
  assert.equal(levelFor(xpFor(15)), PAUSED_AT, 'a bug nobody has stamped is held like any other');
});

test('the purple pool is on everybody\'s way to the first acid, the same tile for all of them', (t) => {
  const f = fixture(t);
  const bob = f.store.players.bob = { id: 'bob', name: 'BOB', kind: 'password', login: { username: 'bob' }, createdAt: f.clock.now - 30 * 86400e3 };
  f.accounts.ensure(bob); f.store.savePlayers();
  const a = f.mines.start(f.ann, V), b = f.mines.start(bob, V), raw = f.mines.doc.active.ann, maze = shiftMaze(raw);
  assert.deepEqual(a.purplePool, b.purplePool, 'with no bug at all, they still see it');
  assert.deepEqual(a.purplePool, purpleSpot(maze, raw.pools[0]));
  const at = (p) => maze.dist[p.y][p.x];
  assert.ok(at(a.purplePool) >= 3 && at(a.purplePool) < at(raw.pools[0]), 'between the lift and the first pool');
  assert.ok(!raw.pools.some((p) => p.x === a.purplePool.x && p.y === a.purplePool.y), 'and not in an acid pool');
  assert.equal(a.purple, undefined, 'nobody here drinks it');
});

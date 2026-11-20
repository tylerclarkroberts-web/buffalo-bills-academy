// The Heeshee Mazode: 20% of shifts, never with Nosferatu or the faun; steals a hatched guide;
// the Foreman returns it after acid (or the server restores it on a mid-shift quit). No lasting penalty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Foreman, HEESHEE_RETURN } from '../server/foreman.js';
import { Mines, rollScare, SCARE_CHANCE, FAUN_CHANCE, HEESHEE_CHANCE } from '../server/mines.js';
import { HeesheeMazode, isLookingAt, lookDot, APPEAR_AFTER_MS, LUNGE_RANGE, GRAB_RANGE } from '../client/src/mines/heeshee.js';
import { BugGuide } from '../client/src/mines/bugGuide.js';
import { TILE as GUIDE_TILE } from '../client/src/mines/stalker.js';

test('a single roll never co-occurs, and the Heeshee band is exactly 20%', () => {
  let scare = 0, faun = 0, heeshee = 0, clash = 0;
  for (let r = 0; r < 100000; r++) {
    const o = rollScare(() => r);
    const n = !!o.scare + !!o.faun + !!o.heeshee;
    if (n > 1) clash++;
    if (o.scare) scare++;
    if (o.faun) faun++;
    if (o.heeshee) heeshee++;
  }
  assert.equal(clash, 0);
  assert.equal(scare, SCARE_CHANCE);
  assert.equal(faun, FAUN_CHANCE);
  assert.equal(heeshee, HEESHEE_CHANCE);
  assert.equal(HEESHEE_CHANCE, 20000);
});

function barnWith(bug) {
  return {
    view: () => (bug ? { pen: { stage: 'creature', species: bug.species, name: bug.name, speciesName: bug.speciesName || bug.species } } : { pen: null }),
    foundAcid() {},
    rollEgg() { return false; },
    rollPurple() { return false; },
    has() { return !!bug; },
  };
}
function fixture(t, { scareInt, bug } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heeshee-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  const accounts = new Accounts({ store, now: () => clock.now });
  const foreman = new Foreman({ store, accounts, now: () => clock.now, randInt: (n) => 0 });
  const mines = new Mines({
    store, accounts, now: () => clock.now, foreman,
    randInt: (n) => (n === 100000 ? 50000 : 0),
    scareInt: scareInt || ((n) => n - 1),
    vein: () => ({ veinMs: 60000, cells: 7 }),
    barn: barnWith(bug),
  });
  const player = store.players.miner = { id: 'miner', name: 'Miner' };
  accounts.ensure(player);
  return { mines, player, clock, store, start: () => mines.start(player, { rulesVersion: 2 }) };
}

test('clock-in only stamps the Heeshee on a Heeshee roll, never with the visitor or the faun', (t) => {
  const h = fixture(t, { scareInt: () => SCARE_CHANCE + FAUN_CHANCE, bug: { species: 'candela', name: 'Pip' } }).start();
  assert.equal(h.heeshee, true);
  assert.ok(h.bug);
  assert.equal(h.faun, undefined);
  assert.equal(h.scare, null);

  const scare = fixture(t, { scareInt: () => 0, bug: { species: 'candela', name: 'Pip' } }).start();
  assert.ok(scare.scare);
  assert.equal(scare.heeshee, undefined);
  assert.equal(scare.faun, undefined);

  const faun = fixture(t, { scareInt: () => SCARE_CHANCE, bug: { species: 'candela', name: 'Pip' } }).start();
  assert.equal(faun.faun, true);
  assert.equal(faun.heeshee, undefined);
});

test('the Heeshee only steals a living hatched guide, and only on a Heeshee shift', (t) => {
  const none = fixture(t, { scareInt: (n) => n - 1, bug: { species: 'candela', name: 'Pip' } });
  const quiet = none.start();
  assert.throws(() => none.mines.stealBug(none.player, quiet.shiftId), /no Heeshee Mazode/);

  const noBug = fixture(t, { scareInt: () => SCARE_CHANCE + FAUN_CHANCE });
  const bare = noBug.start();
  assert.equal(bare.bug, undefined);
  assert.throws(() => noBug.mines.stealBug(noBug.player, bare.shiftId), /no bug/);

  const yes = fixture(t, { scareInt: () => SCARE_CHANCE + FAUN_CHANCE, bug: { species: 'candela', name: 'Pip' } });
  const s = yes.start();
  const taken = yes.mines.stealBug(yes.player, s.shiftId);
  assert.equal(taken.bug, undefined);
  assert.equal(taken.bugStolen.name, 'Pip');
  assert.equal(taken.heeshee, true);
  // idempotent, and the barn row is untouched
  const again = yes.mines.stealBug(yes.player, s.shiftId);
  assert.equal(again.bugStolen.name, 'Pip');
  assert.equal(yes.mines.barn.view().pen.stage, 'creature');
  assert.equal(yes.mines.barn.view().pen.name, 'Pip');
});

test('quitting mid-shift after a steal restores the bug on the server with no data loss', (t) => {
  const f = fixture(t, { scareInt: () => SCARE_CHANCE + FAUN_CHANCE, bug: { species: 'candela', name: 'Pip' } });
  const s = f.start();
  f.mines.stealBug(f.player, s.shiftId);
  const done = f.mines.quit(f.player, s.shiftId, { rulesVersion: 2 });
  // empty bucket: no pay slip, no Foreman heeshee scene, but the bug was never removed
  assert.equal(done.result, undefined);
  assert.equal(f.mines.barn.view().pen.stage, 'creature');
  assert.equal(f.mines.barn.view().pen.name, 'Pip');
  assert.equal(f.mines.doc.active[f.player.id], undefined);
  assert.equal(f.mines.shakenUntil(f.player.id), true);
  // an empty quit still earns the usual lecture; that is independent of the steal, and the bug is not the fee
  assert.ok(f.mines.foreman.pending(f.player.id));
  assert.equal(f.mines.foreman.pending(f.player.id).reason, 'quit');
  const nextDoc = { ...f.mines.foreman.doc, pending: { ...f.mines.foreman.doc.pending, [f.player.id]: undefined } };
  delete nextDoc.pending[f.player.id];
  f.mines.foreman.doc = nextDoc;
  const again = f.mines.start(f.player, { rulesVersion: 2 });
  assert.ok(again.bug, 'the guide is on the next shift');
  assert.equal(again.bug.name, 'Pip');
  assert.equal(again.bug.shaken, true, 'a short cosmetic twitch, no stat change');
  assert.equal(again.bug.species, 'candela');
});

test('finding acid after a steal brings the bug back in the Foreman farewell', (t) => {
  const f = fixture(t, { scareInt: () => SCARE_CHANCE + FAUN_CHANCE, bug: { species: 'candela', name: 'Pip' } });
  const s = f.start();
  f.mines.stealBug(f.player, s.shiftId);
  let shift = f.mines.publicShift(f.mines.doc.active[f.player.id], true, f.player.id, f.mines.guideBug(f.player.id));
  const poolId = shift.currentPoolId;
  shift = f.mines.probe(f.player, s.shiftId, { rulesVersion: 2, poolId });
  f.mines.extract(f.player, s.shiftId, { rulesVersion: 2, poolId, action: 'start' });
  f.clock.now += 1000;
  const drawn = f.mines.extract(f.player, s.shiftId, { rulesVersion: 2, poolId, action: 'stop' });
  const body = drawn.result ? drawn : f.mines.quit(f.player, s.shiftId, { rulesVersion: 2 });
  assert.ok(body.result, JSON.stringify(body));
  assert.equal(body.result.bugReturned, true);
  assert.equal(body.result.bugShaken, true);
  assert.ok(body.result.foreman);
  assert.equal(body.result.foreman.reason, 'heeshee');
  assert.deepEqual(body.result.foreman.lines, HEESHEE_RETURN);
  assert.match(HEESHEE_RETURN.join(' '), /wrestle that Heeshee Mazode/i);
  assert.match(HEESHEE_RETURN.join(' '), /cigarettes/i);
  assert.equal(f.mines.barn.view().pen.stage, 'creature');
  // the farewell does not block the next clock-in
  assert.equal(f.mines.foreman.pending(f.player.id), null);
});

test('Foreman Heeshee lines stay farmer-clean', () => {
  const all = HEESHEE_RETURN.join(' ').toLowerCase();
  for (const w of ['fuck', 'shit', 'damn', 'hell', 'bitch', 'ass ', 'bastard', 'crap', 'piss']) assert.ok(!all.includes(w), w);
});

const G = [
  '#########',
  '#.......#',
  '###.#####',
  '###.#####',
  '###.#####',
  '#.......#',
  '#########',
].map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
const MAZE = { grid: G, pool: { x: 7, y: 1 }, start: { x: 1, y: 1 } };

test('an unarmed Heeshee never appears; an armed one bumbles in after the delay', () => {
  const off = new HeesheeMazode(MAZE, { armed: false, hasBug: true, afterMs: 0 });
  off.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 99999 });
  assert.equal(off.present, false);

  const h = new HeesheeMazode(MAZE, { armed: true, hasBug: true, afterMs: 1000, rand: () => 0 });
  h.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 500 });
  assert.equal(h.state, 'dormant');
  h.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 1100 });
  assert.equal(h.state, 'wandering');
  assert.equal(h.events.includes('appear'), true);
  assert.ok(Math.hypot(h.x - GUIDE_TILE, h.z - GUIDE_TILE) > GUIDE_TILE, 'spawns away so it is heard first');
});

test('it freezes when looked at, and will not steal if there is no bug', () => {
  const h = new HeesheeMazode(MAZE, { armed: true, hasBug: false, afterMs: 0, rand: () => 0 });
  h.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 1 });
  // place it in front of the miner, inside lunge range, and stare
  h.x = 2.2; h.z = 0.2; // roughly ahead of yaw 0 (forward is -z)
  // yaw 0 forward is (0, -1) in x,z? fx=-sin(0)=0, fz=-cos(0)=-1, so forward is -z.
  h.x = 1 * GUIDE_TILE; h.z = 1 * GUIDE_TILE - 1.5;
  const p = { x: 1 * GUIDE_TILE, z: 1 * GUIDE_TILE, yaw: 0, elapsedMs: 2000 };
  assert.ok(isLookingAt(p.x, p.z, p.yaw, h.x, h.z));
  const dist = Math.hypot(p.x - h.x, p.z - h.z);
  assert.ok(dist < LUNGE_RANGE);
  h.state = 'wandering';
  h.update(0.05, p);
  // no bug: it may freeze or wander, but it must not emit steal
  assert.ok(!h.events.includes('steal'));
  assert.notEqual(h.state, 'fleeing');
});

test('with a bug in range it lunges, steals, and the guide leaves', () => {
  const h = new HeesheeMazode(MAZE, { armed: true, hasBug: true, afterMs: 0, rand: () => 0 });
  h.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 1 });
  const p = { x: 1 * GUIDE_TILE, z: 1 * GUIDE_TILE, yaw: 0, elapsedMs: 2000 };
  h.x = p.x; h.z = p.z - 0.4; // on top of the miner
  h.state = 'wandering';
  h.update(0.05, p);
  assert.ok(h.events.includes('lunge') || h.state === 'lunging' || h.events.includes('steal'));
  for (let i = 0; i < 30 && !h.events.includes('steal'); i++) h.update(0.05, p);
  assert.ok(h.events.includes('steal'), `events=${h.events.join(',')}`);
  assert.equal(h.hasBug, false);
  assert.ok(h.state === 'fleeing' || h.state === 'gone');

  const g = new BugGuide(MAZE, { armed: true, afterMs: 0, bug: { species: 'candela', name: 'Pip' } });
  g.update(0.05, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 1 });
  assert.equal(g.present, true);
  assert.equal(g.steal(), true);
  assert.equal(g.present, false);
  assert.equal(g.state, 'stolen');
  g.update(1, { x: GUIDE_TILE, z: GUIDE_TILE, yaw: 0, elapsedMs: 9999 });
  assert.equal(g.present, false, 'a stolen guide does not come back on its own');
});

test('lookDot faces the lamp; looking away is not a look', () => {
  const px = 0, pz = 0, yaw = 0; // forward -z
  assert.ok(lookDot(px, pz, yaw, 0, -2) > 0.9);
  assert.ok(lookDot(px, pz, yaw, 0, 2) < 0);
  assert.equal(isLookingAt(px, pz, yaw, 0, 2), false);
});

// The second evolution: a stage two partner with the XP for level 23 may leave a shift with the specialist. Its owner
// claims it at the Bug Center, where the rebuild to stage three costs one of their other bugs, or half their cash if
// they keep no other. One rebuild in fifteen leaves it sure it is a man.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, purpleChance, MECH_FROM, MECH_BY, BOTCH_ODDS } from '../server/barn.js';
import { Mines } from '../server/mines.js';
import { xpFor } from '../server/engine/creatures.js';
import { line, MAN_QUIRKS } from '../server/engine/bout.js';

const V = { rulesVersion: 2 };
function fixture(t, { roll = 0, botch = 1, quirk = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-evo2-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-23T19:00:00Z') }, now = () => clock.now, f = { clock, roll, botch, quirk };
  f.store = new Store(dir); f.accounts = new Accounts({ store: f.store, now });
  f.barn = new Barn({ store: f.store, accounts: f.accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), evoInt: (n) => (n === 1000 ? f.roll : n === BOTCH_ODDS ? f.botch : f.quirk) });
  f.mines = new Mines({ store: f.store, accounts: f.accounts, barn: f.barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: () => 0, poolInt: () => 40000 });
  const player = f.store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * 86400e3 };
  f.accounts.ensure(player); player.bankroll = 1001; f.store.savePlayers(); f.ann = player;
  /** A stage two partner at `level`, and (with `spare`) a second bug in a stall. */
  f.partner = (level, spare = true) => {
    f.barn.layEgg('ann'); clock.now += 2000; f.barn.view('ann');
    const pen = f.barn.doc.pens.ann; Object.assign(pen, { xp: xpFor(level), evo: 1 });
    if (spare) f.barn.doc.bench.ann = [{ ...structuredClone(pen), bornAt: pen.bornAt + 1, eggAt: undefined, name: 'Spare', xp: xpFor(4), evo: 0 }];
    f.barn.save(); return pen;
  };
  return f;
}

test('he comes for a stage two partner with the XP for level 23: one shift in four, certain by 26, and never a stage one', (t) => {
  assert.deepEqual([22, 23, 24, 25, 26, 30].map((level) => purpleChance(xpFor(level), 1)), [0, 0.25, 0.5, 0.75, 1, 1]);
  assert.deepEqual([MECH_FROM, MECH_BY], [23, 26]);
  const f = fixture(t, { roll: 249 });
  f.partner(22);
  assert.equal(f.barn.rollCollect('ann'), false, 'a level 22 is not due');
  f.barn.doc.pens.ann.xp = xpFor(23);
  assert.equal(f.barn.rollCollect('ann'), true);
  assert.equal(f.barn.rollPurple('ann'), false, 'and it is past purple acid');
  f.roll = 250; assert.equal(f.barn.rollCollect('ann'), false);
  f.roll = 0; f.barn.doc.pens.ann.evo = 0;
  assert.equal(f.barn.rollCollect('ann'), false, 'a bug that never had the first rebuild is not his yet');
});

test('it leaves with him when the shift ends, and nothing works on it but the Bug Center', (t) => {
  const f = fixture(t);
  f.partner(24);
  const shift = f.mines.start(f.ann, V);
  assert.equal(shift.purple, undefined);
  const out = f.mines.quit(f.ann, shift.shiftId, V);
  assert.equal(out.taken, f.barn.doc.pens.ann.name);
  assert.equal(out.pending, null, 'the foreman keeps it to himself');
  const pen = f.barn.view('ann').pen;
  assert.deepEqual([pen.taken, pen.fainted, pen.evo, pen.donors.map((d) => d.name)], [true, true, 1, ['Spare']]);
  assert.throws(() => f.barn.care('ann', 'feed'), /is not here/);
  assert.equal(f.barn.rollCollect('ann'), false, 'he does not come twice');
});

test('the rebuild costs a bug the owner picks: it is gone, the partner is stage three, and no money moves', (t) => {
  const f = fixture(t);
  f.partner(24); f.barn.collect('ann');
  assert.throws(() => f.barn.heal('ann'), /wants parts/);
  assert.throws(() => f.barn.heal('ann', { donor: 12345 }), /wants parts/);
  const spare = f.barn.doc.bench.ann[0];
  const r = f.barn.heal('ann', { donor: spare.bornAt });
  assert.deepEqual([r.evolved.stage, r.evolved.donor.name, r.evolved.botched, r.cost], [2, 'Spare', null, 0]);
  assert.equal(f.ann.bankroll, 1001);
  assert.deepEqual(f.barn.doc.bench.ann, []);
  assert.equal(f.barn.doc.graves.ann.at(-1).name, 'Spare', 'the donor gets a line in the graveyard');
  const pen = f.barn.view('ann').pen;
  assert.deepEqual([pen.evo, pen.taken, pen.fainted, pen.level, pen.cap], [2, undefined, false, 24, 30]);
  assert.equal(pen.style.evo, 2, 'and it is drawn as one');
});

test('an owner with no other bug pays half their cash instead', (t) => {
  const f = fixture(t);
  f.partner(23, false); f.barn.collect('ann');
  assert.deepEqual(f.barn.view('ann').pen.donors, []);
  const r = f.barn.heal('ann');
  assert.deepEqual([r.evolved.donor, r.evolved.bill.took, f.ann.bankroll], [null, 500.5, 500.5]);
  assert.equal(f.barn.doc.pens.ann.evo, 2);
});

test('one rebuild in fifteen leaves it sure it is a man: polite, salaried or squeamish, for good', (t) => {
  for (const [i, quirk] of MAN_QUIRKS.entries()) {
    const f = fixture(t, { botch: 0, quirk: i });
    f.partner(23, false); f.barn.collect('ann');
    assert.equal(f.barn.heal('ann').evolved.botched, quirk);
    assert.equal(f.barn.fighter('ann', f.barn.doc.pens.ann).botched, quirk);
  }
  // Each of them costs fights against the same bug unbotched, and none of them is hopeless.
  const base = { species: 'dytiscus', level: 24 };
  for (const botched of MAN_QUIRKS) {
    const p = line({ ...base, name: 'A', botched }, { ...base, name: 'B' });
    assert.ok(p > 0.15 && p < 0.5, `${botched} wins ${p}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Mines, STRAY_DAYS } from '../server/mines.js';
import { xpFor } from '../server/engine/creatures.js';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1 });
  for (const [id, name] of [['a', 'Connor'], ['b', 'Tyler']]) store.players[id] = { id, name, bankroll: 100 };
  barn.layEgg('a'); clock.now += 5; barn.view('a');
  barn.adopt('a', { wildId: 'w1', battleId: 'b1', species: 'pyrops', level: 5 });
  return { clock, store, barn, now };
}

test('releasing a bug empties its stall and leaves a stray with its name, level and owner', (t) => {
  const { barn } = setup(t);
  const [partner, other] = barn.bugs('a');
  other.xp = xpFor(5); barn.save();
  barn.release('a', idOf(other));
  assert.equal(barn.bugs('a').length, 1);
  const [stray] = barn.strays();
  assert.deepEqual([stray.species, stray.name, stray.level, stray.owner], ['pyrops', other.name, 5, 'Connor']);
  barn.release('a'); // the partner too: the barn is empty, and it is a second stray
  assert.equal(barn.bugs('a').length, 0);
  assert.equal(barn.strays().length, 2);
  assert.throws(() => barn.release('a'), /Only a hatched, living bug/);
  assert.ok(partner.name);
});

test('a stray turns up on some days only, and once jarred it keeps its name and is gone for everyone', (t) => {
  const { barn, store, now } = setup(t);
  const other = barn.bugs('a')[1];
  barn.release('a', idOf(other));
  const stray = barn.strays()[0];
  const mines = new Mines({ store, accounts: new Accounts({ store, now }), now, barn });
  const shift = { rulesVersion: 2, seed: 7, cells: 7, tier: 1, pools: [], startedAt: now() };
  const seen = [];
  for (let d = 0; d < 30; d++) {
    mines.wildRosters.clear();
    const wild = mines.wildsFor({ ...shift, day: `2027-01-${String(d + 1).padStart(2, '0')}` }).find((w) => w.id === stray.id);
    if (wild) { seen.push(d); assert.deepEqual(wild.stray, { name: other.name, owner: 'Connor' }); }
  }
  assert.ok(seen.length > 2 && seen.length < 30 / STRAY_DAYS * 2.2, `seen on ${seen.length} of 30 days`);
  const caught = barn.adopt('b', { wildId: stray.id, battleId: 'jar1', species: stray.species, level: stray.level, name: stray.name });
  assert.equal(caught.name, other.name);
  assert.equal(barn.strays().length, 0);
});

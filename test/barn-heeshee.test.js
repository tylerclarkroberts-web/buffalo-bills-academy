// A stolen partner stays in the barn as a hold: never deleted, unusable, clocks frozen, released without an XP or hunger penalty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, isHeesheeHeld, HEESHEE_NO_BATTLE } from '../server/barn.js';
import { HEESHEE_GONE } from '../server/mines.js';
import { tableBugOf } from '../server/tableBug.js';

const HOUR = 3600e3;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-barn-heeshee-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-20T18:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: () => 0 });
  const id = 'ann';
  const p = store.players[id] = { id, name: 'Ann', kind: 'password', login: { username: id }, createdAt: clock.now };
  accounts.ensure(p); store.savePlayers();
  barn.layEgg(id); clock.now += 2000;
  return { clock, barn, id };
}

test('a Heeshee hold never deletes the bug, blocks care, and freezes time until release', (t) => {
  const { clock, barn, id } = fixture(t);
  const before = barn.view(id).pen;
  assert.equal(before.stage, 'creature');
  const xp = before.xp, fed = barn.doc.pens[id].fedAt;
  const hold = barn.holdHeeshee(id, { shiftId: 's1', at: clock.now });
  assert.equal(hold.name, before.name);
  assert.equal(barn.view(id).pen.heesheeHeld, true);
  assert.equal(barn.fit(id), false);
  assert.equal(tableBugOf(barn, id), null, 'a held bug is not sitting at the table');
  assert.throws(() => barn.care(id, 'play'), (err) => { assert.equal(err.message, HEESHEE_GONE); return true; });
  assert.throws(() => barn.ready(id), (err) => { assert.equal(err.message, HEESHEE_NO_BATTLE); return true; });
  clock.now += 6 * HOUR;
  barn.refresh(id);
  const mid = barn.doc.pens[id];
  assert.equal(isHeesheeHeld(mid), true);
  assert.equal(mid.xp, xp, 'no XP while away');
  assert.equal(mid.fedAt, fed, 'hunger clock is frozen');
  const released = barn.releaseHeeshee(id);
  assert.equal(released[0].name, before.name);
  assert.equal(barn.view(id).pen.heesheeHeld, undefined);
  assert.equal(barn.view(id).pen.xp, xp);
  assert.equal(barn.doc.pens[id].fedAt, clock.now, 'the clock resumes from now, not a 6-hour deficit');
  assert.equal(barn.fit(id), true);
  assert.ok(tableBugOf(barn, id));
});

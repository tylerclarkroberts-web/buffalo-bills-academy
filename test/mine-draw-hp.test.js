// A mine fight that ends in a draw at the bell is no contest (nobody is robbed), but bug HP never comes back on its
// own: each bug keeps the HP it ended on until the Bug Center nurse heals it. keepScrapes never raises HP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, healthOf } from '../server/barn.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-minedraw-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = () => Date.parse('2026-11-16T19:00:00Z');
  const store = new Store(dir), accounts = new Accounts({ store, now }), barn = new Barn({ store, accounts, now });
  store.players.a = { id: 'a', name: 'A', createdAt: now() - 86400e3, bankroll: 100 };
  barn.doc.pens.a = { stage: 'creature', species: 'pyrops', name: 'P', bornAt: 1, xp: 500, health: 80 };
  return barn;
}

test('mine draw: the bug keeps its damage, never gains HP, once per battle', (t) => {
  const barn = fixture(t);
  assert.equal(barn.keepScrapes('a', { battleId: 'x1', bornAt: 1, hpPct: 42 }), true);
  assert.equal(healthOf(barn.doc.pens.a), 42);
  assert.equal(barn.doc.pens.a.xp, 500, 'no XP for no contest');
  assert.equal(barn.keepScrapes('a', { battleId: 'x1', bornAt: 1, hpPct: 10 }), false, 'idempotent per battle');
  assert.equal(healthOf(barn.doc.pens.a), 42);
  barn.keepScrapes('a', { battleId: 'x2', bornAt: 1, hpPct: 99 });
  assert.equal(healthOf(barn.doc.pens.a), 42, 'a draw never heals');
  assert.equal(barn.keepScrapes('a', { battleId: 'x3', bornAt: 2, hpPct: 5 }), false, 'a different bug is untouched');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';

function fixture(t, legacy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-earnings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = { now: 1_800_000_000_000 };
  const initial = new Store(dir);
  initial.players = Object.fromEntries(['alice', 'bob', 'house'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  initial.savePlayers();
  if (legacy) initial.saveDoc('blackjack', legacy);
  f.reload = () => {
    f.store = new Store(dir);
    f.accounts = new Accounts({ store: f.store, now: () => f.now });
    for (const p of Object.values(f.store.players)) f.accounts.ensure(p);
    f.bj = new Blackjack({ store: f.store, accounts: f.accounts, getPlayer: (id) => f.store.players[id], now: () => f.now, tickMs: 0 });
  };
  f.reload();
  return f;
}

test('cash-out net survives replaced seats and restart; active sessions and duplicate cash-outs do not count', (t) => {
  const f = fixture(t);
  const { alice, bob } = f.store.players;
  const table = f.bj.table(f.bj.create(alice, { settings: { buyIn: 200, bots: 0 } }).code);
  const firstSeat = table.seats[0];
  firstSeat.chips = 250;
  assert.deepEqual(f.bj.earnings(alice.id), { net: 0, partial: false });
  f.bj.leave(alice, table.code);
  assert.deepEqual(f.bj.earnings(alice.id), { net: 50, partial: false });
  f.bj.cashOut(table, firstSeat);
  assert.equal(f.bj.earnings(alice.id).net, 50);

  f.bj.join(bob, table.code, true);
  table.seats[0].chips = 0;
  f.bj.leave(bob, table.code);
  assert.equal(f.bj.earnings(bob.id).net, -200, 'busting counts despite having no cash to return');
  f.bj.join(alice, table.code, true);
  table.seats[0].chips = 175.55;
  f.bj.leave(alice, table.code);
  assert.equal(f.bj.earnings(alice.id).net, 25.55);
  f.reload();
  assert.deepEqual(f.bj.earnings(alice.id), { net: 25.55, partial: false });
  assert.equal(f.bj.earnings(bob.id).net, -200);
});

test('human house profit and a depleted bank count once when returned', (t) => {
  const f = fixture(t);
  const { house, bob } = f.store.players;
  for (const bank of [1125, 0]) {
    const table = f.bj.table(f.bj.create(house, { settings: { house: 'me', buyIn: 200, houseBank: 1000 } }).code);
    f.bj.join(bob, table.code, true);
    f.bj.start(house, table.code);
    table.house.bank = bank;
    table.seats[0].chips = 1200 - bank;
    table.round = null;
    table.status = 'over';
    const before = f.bj.earnings(house.id).net;
    f.bj.settleMoney(table);
    f.bj.settleMoney(table);
    f.bj.save();
    assert.equal(f.bj.earnings(house.id).net, before + bank - 1000);
  }
  assert.equal(f.bj.earnings(house.id).net, -875);
  assert.equal(f.bj.earnings(bob.id).net, 875);
  f.reload();
  assert.deepEqual(f.bj.earnings(house.id), { net: -875, partial: false });
});

test('legacy recovery uses surviving settled results, flags missing history, and never infers from transactions', (t) => {
  const f = fixture(t, { tables: {
    old: { paidOut: true, seats: [
      { id: 'alice', left: true, startChips: 200, cashedOut: 250 },
      { id: 'bob', left: true, startChips: 200, cashedOut: 0 },
      { id: 'bot', bot: true, left: true, startChips: 200, cashedOut: 1000 },
    ], house: { mode: 'player', id: 'house', bank: 1150, startBank: 1000, staked: false } },
    active: { seats: [{ id: 'alice', chips: 600, startChips: 200 }], house: { mode: 'player', id: 'house', bank: 900, startBank: 1000, staked: true } },
  } });
  f.store.players.alice.txns = [{ type: 'blackjack', amount: 10000 }];
  assert.deepEqual(f.bj.earnings('alice'), { net: 50, partial: true });
  assert.deepEqual(f.bj.earnings('bob'), { net: -200, partial: true });
  assert.equal(f.bj.earnings('house').net, 150);
  assert.equal(f.bj.earnings('bot').net, 0);
  f.now += 100;
  f.store.players.newbie = { id: 'newbie', name: 'Newbie', createdAt: f.now };
  f.accounts.ensure(f.store.players.newbie);
  assert.deepEqual(f.bj.earnings('newbie'), { net: 0, partial: false });
  f.reload();
  assert.deepEqual(f.bj.earnings('alice'), { net: 50, partial: true }, 'restart does not backfill twice');
  assert.deepEqual(f.bj.earnings('newbie'), { net: 0, partial: false });
  const table = f.bj.doc.tables.active;
  f.bj.cashOut(table, table.seats[0]);
  f.bj.save();
  f.reload();
  assert.deepEqual(f.bj.earnings('alice'), { net: 450, partial: true }, 'legacy active seats count only at cash-out');
});

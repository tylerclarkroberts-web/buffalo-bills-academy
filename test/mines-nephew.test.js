// The Foreman's nephew: a General Store hire who brings back one small payout a day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines, NEPHEW_PAY } from '../server/mines.js';

function fixture(t, own = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-nephew-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-10T18:00:00Z') };
  const store = new Store(dir); const accounts = new Accounts({ store, now: () => clock.now });
  const mines = new Mines({ store, accounts, now: () => clock.now, owned: () => own });
  const player = store.players.miner = { id: 'miner', name: 'Miner' }; accounts.ensure(player);
  return { clock, mines, accounts, player, store };
}
const cents = (n) => Math.round(n * 100);

test('the nephew only works for whoever hired him', (t) => {
  const f = fixture(t);
  assert.equal(f.mines.office(f.player).nephew, null);
  assert.throws(() => f.mines.sendNephew(f.player), (e) => e.status === 403);
});

test('the nephew brings back one small payout a day', (t) => {
  const own = { 'mine-nephew': 1 }, f = fixture(t, own), before = f.player.bankroll;
  assert.deepEqual(f.mines.office(f.player).nephew, { ready: true, today: null, days: 0, total: 0, best: 0, raise: 0, tally: {} });
  const { nephew, bankroll } = f.mines.sendNephew(f.player), { amount, line } = nephew.today;
  assert.ok(Number.isInteger(amount) && amount >= NEPHEW_PAY.min && amount <= NEPHEW_PAY.max, String(amount));
  assert.ok(line.length > 10); assert.equal(nephew.ready, false);
  assert.deepEqual([nephew.days, nephew.total, nephew.best, nephew.raise], [1, amount, amount, 1]);
  assert.deepEqual(Object.values(nephew.tally), [1], 'the day goes on his record');
  assert.equal(cents(bankroll), cents(before + amount)); assert.equal(f.player.mining.shifts, 0, 'not a shift of yours');
  assert.throws(() => f.mines.sendNephew(f.player), (e) => e.status === 409);
  assert.equal(cents(f.player.bankroll), cents(before + amount), 'a second trip the same day pays nothing');
  const restarted = new Mines({ store: f.store, accounts: f.accounts, now: () => f.clock.now, owned: () => own });
  assert.deepEqual(restarted.office(f.player).nephew, nephew, 'the day survives a restart');

  f.clock.now += 86400e3;
  assert.equal(f.mines.office(f.player).nephew.ready, true);
  const second = f.mines.sendNephew(f.player).nephew;
  assert.equal(second.days, 2); assert.equal(second.total, amount + second.today.amount);
  assert.ok(second.today.amount >= NEPHEW_PAY.min + 1 && second.today.amount <= NEPHEW_PAY.max + 1, 'a day of experience is a $1 raise');
  for (let day = 0; day < 40; day++) { f.clock.now += 86400e3; f.mines.sendNephew(f.player); }
  const veteran = f.mines.office(f.player).nephew;
  assert.equal(veteran.raise, NEPHEW_PAY.raiseCap, 'the raise stops growing');
  assert.ok(veteran.best <= NEPHEW_PAY.max + NEPHEW_PAY.raiseCap);
  assert.equal(Object.values(veteran.tally).reduce((a, n) => a + n, 0), 42);
  f.mines.forget(f.player.id);
  assert.equal(f.mines.doc.nephew.miner, undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

async function boot(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-leaderboard-'));
  const { app, service, shutdown } = createApp({ dataDir, env: { BJ_TICK_MS: '0', ...env }, marketSources: {}, snapshots: false });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const get = async (query = '', token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/leaderboard${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  const player = name => {
    const auth = service.createPlayer(name);
    return { ...auth, record: service.getPlayer(auth.id) };
  };
  return { service, get, player };
}

test('leaderboard reports source profits without counting principal, practice, gifts or private details', async t => {
  const { service, get, player } = await boot(t);
  const miner = player('Acid Accountant'); const rich = player('Gift Recipient');
  miner.record.mining.earned = 200.25;
  miner.record.invest.realized = -12.50;
  miner.record.txns = [{ type: 'start', amount: 1000 }, { type: 'fawn', amount: 5000 }, { type: 'mine', amount: 5, note: 'Foreman bonus' }];
  rich.record.bankroll = 10000;
  service.slots.doc.players[miner.id] = { life: { won: 30.50, wagered: 50 } };
  const table = service.createTable(miner.record, { name: 'Secret poker night', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 3 } });
  const raw = service.getTable(table.code);
  raw.seats[0].stack = 120;
  raw.hand = { players: [{ playerId: miner.id, total: 5 }] };
  service.store.tables.set('PRACTICE', { code: 'PRACTICE', name: 'Practice secret', seats: [], ledger: { [miner.id]: { buyIn: 0, cashOut: 999999 } } });
  const bj = service.blackjack.create(miner.record, { name: 'Secret blackjack', settings: {} });
  service.blackjack.table(bj.code).seats[0].chips += 60;
  service.blackjack.close(miner.record, bj.code);
  const { status, body } = await get('?sort=earnings', miner.token);
  assert.equal(status, 200); assert.equal(body.me, miner.id);
  assert.equal(body.rows[0].id, miner.id);
  assert.deepEqual(body.rows[0].earnings, { mining: 200.25, poker: 25, blackjack: 60, slots: -19.50, investing: -12.50, total: 253.25 });
  assert.equal(body.rows[0].blackjackPartial, false);
  assert.equal((await get()).body.rows[0].id, rich.id, 'wealth remains the default ranking');
  const serialized = JSON.stringify(body);
  for (const secret of [table.code, bj.code, 'Secret poker night', 'Secret blackjack', 'PRACTICE', 'txns', 'riskEscrow', 'barnEscrow', 'tokenHash']) {
    assert.ok(!serialized.includes(secret), secret);
  }
  raw.hand.players[0].playerId = rich.id;
  assert.equal((await get('?sort=poker')).body.rows.find(r => r.id === miner.id).earnings.poker, 20, 'another seat occupant does not contribute chips');
});

test('poker earnings include posted blinds when preflop is skipped', async t => {
  const { service, get, player } = await boot(t);
  const host = player('Blind Inspector'), pal = player('Mud Witness');
  const table = service.createTable(host.record, { settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 3, skipPreflop: true } });
  service.join(table.code, pal.record);
  service.start(table.code, host.record);
  assert.equal(service.getTable(table.code).hand.skipped, true);
  const board = (await get('?sort=poker')).body;
  assert.deepEqual(board.rows.map(r => r.earnings.poker), [0, 0]);
});

test('each ranking orders losses, zero and gains in both directions with stable ties', async t => {
  const { service, get, player } = await boot(t);
  const a = player('Alpha'), b = player('Beta'), c = player('Gamma');
  a.record.mining.earned = b.record.mining.earned = 12;
  a.record.invest.realized = -15; b.record.invest.realized = 10;
  service.slots.doc.players[a.id] = { life: { won: 2, wagered: 20 } };
  service.slots.doc.players[b.id] = { life: { won: 100, wagered: 20 } };
  for (const sort of ['wealth', 'earnings', 'mining', 'poker', 'blackjack', 'slots', 'investing']) {
    for (const direction of ['asc', 'desc']) {
      const { status, body } = await get(`?sort=${sort}&direction=${direction}`);
      assert.equal(status, 200); assert.equal(body.sort, sort); assert.equal(body.direction, direction);
      const value = r => sort === 'wealth' ? r.total : r.earnings[sort === 'earnings' ? 'total' : sort];
      for (let i = 1; i < body.rows.length; i++) {
        const prev = body.rows[i - 1], next = body.rows[i];
        assert.ok(direction === 'asc' ? value(prev) <= value(next) : value(prev) >= value(next));
        if (value(prev) === value(next)) assert.ok(prev.name.localeCompare(next.name) <= 0);
      }
    }
  }
  assert.deepEqual((await get('?sort=slots&direction=asc')).body.rows.map(r => r.id), [a.id, c.id, b.id]);
  for (const query of ['?sort=__proto__', '?sort=unknown', '?sort=slots&sort=poker', '?direction=sideways', '?direction=']) {
    assert.equal((await get(query)).status, 400, query);
  }
});

test('source ranking happens before the 200-player limit and handles older player records', async t => {
  const { service, get } = await boot(t);
  for (let i = 0; i < 201; i++) {
    service.store.players[`p${i}`] = { id: `p${i}`, name: `Player ${String(i).padStart(3, '0')}`, bankroll: 1000 + i, createdAt: 1 };
  }
  service.store.players.p0.mining = { earned: 500, shifts: 1 };
  service.store.players.hidden = { id: 'hidden', name: 'Hidden', hidden: true, bankroll: 1e9, mining: { earned: 1e9 } };
  const wealth = (await get()).body;
  assert.equal(wealth.rows.length, 200); assert.ok(!wealth.rows.some(r => r.id === 'p0'));
  const mines = (await get('?sort=mining')).body;
  assert.equal(mines.rows.length, 200); assert.equal(mines.rows[0].id, 'p0');
  assert.ok(!mines.rows.some(r => r.id === 'hidden'));
  assert.deepEqual(mines.rows[1].earnings, { mining: 0, poker: 0, blackjack: 0, slots: 0, investing: 0, total: 0 });
  assert.ok(!service.slots.doc.players.p1, 'reading standings does not create a slots session');
});

test('empty boards and the existing signed-in-only visibility rule are preserved', async t => {
  const empty = await boot(t);
  assert.deepEqual((await empty.get()).body.rows, []);
  const signedIn = await boot(t, { GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic', SESSION_SECRET: 'synthetic-test-secret' });
  signedIn.player('Guest');
  const member = signedIn.player('Member'); member.record.login = { username: 'member' };
  const board = (await signedIn.get('?sort=earnings')).body;
  assert.equal(board.googleOnly, true);
  assert.deepEqual(board.rows.map(r => r.id), [member.id]);
});

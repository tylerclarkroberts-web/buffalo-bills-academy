import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createApp } from '../server/app.js';
import { strengthOf, strongestTrainers, BUG_TRAINER_TOP } from '../server/barn.js';
import { xpFor, levelFor, BY_ID } from '../server/engine/creatures.js';

const creature = (over = {}) => ({
  stage: 'creature',
  species: 'empusa',
  name: 'Empusa',
  xp: xpFor(5),
  cap: 9,
  record: { w: 0, l: 0, d: 0 },
  bornAt: 1,
  ...over,
});

function barnWith(owners) {
  const players = {};
  const bugs = {};
  for (const [id, pens] of Object.entries(owners)) {
    players[id] = { id, name: id[0].toUpperCase() + id.slice(1), bankroll: 1000 };
    bugs[id] = pens;
  }
  return { bugs: (id) => bugs[id] || [], store: { players } };
}

test('strengthOf counts only living hatched bugs and uses the displayed combat level', () => {
  assert.equal(strengthOf(null), null);
  assert.equal(strengthOf({ stage: 'egg', xp: 9999, species: 'empusa' }), null);
  assert.equal(strengthOf({ stage: 'dead', xp: 9999, species: 'empusa', name: 'Gone' }), null);
  const s = strengthOf(creature({ xp: 3301, cap: 9, record: { w: 1, l: 0, d: 0 } }));
  assert.equal(s.level, 9);
  assert.equal(s.level, levelFor(3301, 9));
  assert.ok(levelFor(3301, 30) > 9, 'uncapped XP would already be past the pause');
  assert.equal(s.xp, 3301);
  assert.equal(s.speciesName, BY_ID.empusa.name);
  assert.deepEqual(s.record, { w: 1, l: 0, d: 0 });
});

test('the highlight names the trainer whose living bug is highest level, then XP, then wins', () => {
  const barn = barnWith({
    ada: [
      creature({ name: 'Phrixothrix', species: 'phrixothrix', xp: 3022, cap: 9, record: { w: 7, l: 4, d: 0 } }),
      creature({ name: 'Empusa', species: 'empusa', xp: 3301, cap: 9, record: { w: 1, l: 0, d: 0 } }),
    ],
    bess: [creature({ name: 'Pyrops', species: 'pyrops', xp: 2221, cap: 9, record: { w: 12, l: 7, d: 0 } })],
    cy: [creature({ name: 'Lamprima', species: 'lamprima', xp: 1653, cap: 9, record: { w: 2, l: 10, d: 0 } })],
    eggOnly: [{ stage: 'egg', species: 'onymacris', eggAt: 1, hatchAt: 2 }],
    late: [creature({ stage: 'dead', name: 'Late', species: 'manticora', xp: 8000, cap: 23, record: { w: 20, l: 0, d: 0 } })],
  });
  barn.store.players.hidden = { id: 'hidden', name: 'Hidden', hidden: true, bankroll: 1 };
  const hiddenBugs = [creature({ name: 'Secret', xp: 99999, cap: 30 })];
  const inner = barn.bugs;
  barn.bugs = (id) => (id === 'hidden' ? hiddenBugs : inner(id));

  assert.deepEqual(strongestTrainers(barn, { limit: 0 }), []);
  const top = strongestTrainers(barn);
  assert.equal(BUG_TRAINER_TOP, 3);
  assert.deepEqual(top.map((r) => r.name), ['Ada', 'Bess', 'Cy']);
  assert.equal(top[0].bug.name, 'Empusa', 'a stalled bug can outrank the partner');
  assert.equal(top[0].bug.level, 9);
  assert.equal(top[1].bug.name, 'Pyrops');
  assert.equal(top[1].bug.level, levelFor(2221, 9));
  assert.equal(top[2].bug.name, 'Lamprima');
  assert.ok(!top.some((r) => r.id === 'hidden' || r.id === 'eggOnly' || r.id === 'late'));
});

test('equal levels break on XP, then wins, then name, and eligible filters match the board', () => {
  const barn = barnWith({
    zed: [creature({ name: 'A', species: 'empusa', xp: 2560, cap: 9, record: { w: 2, l: 0, d: 0 } })],
    amy: [creature({ name: 'B', species: 'pyrops', xp: 2560, cap: 9, record: { w: 1, l: 0, d: 0 } })],
    moe: [creature({ name: 'C', species: 'lamprima', xp: 3000, cap: 9, record: { w: 0, l: 0, d: 0 } })],
  });
  const names = strongestTrainers(barn).map((r) => r.name);
  assert.deepEqual(names, ['Moe', 'Zed', 'Amy']);
  const guests = strongestTrainers(barn, { eligible: (p) => p.id === 'amy' });
  assert.deepEqual(guests.map((r) => r.id), ['amy']);
});

async function boot(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-bug-board-'));
  const { app, service, shutdown } = createApp({ dataDir, env: { BJ_TICK_MS: '0', ...env }, marketSources: {}, snapshots: false });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const get = async (query = '', token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/leaderboard${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  const player = (name) => {
    const auth = service.createPlayer(name);
    return { ...auth, record: service.getPlayer(auth.id) };
  };
  return { service, get, player };
}

test('the leaderboard highlights the strongest trainer and hides XP, eggs and graves', async (t) => {
  const empty = await boot(t);
  assert.deepEqual((await empty.get()).body.bugTrainers, []);

  const { service, get, player } = await boot(t);
  const ada = player('Ada');
  const bess = player('Bess');
  const cy = player('Cy');
  const egg = player('Egg Only');
  const late = player('Late');
  const barn = service.barn;
  barn.doc.pens[ada.id] = creature({ name: 'Phrixothrix', species: 'phrixothrix', xp: 3022, cap: 9, record: { w: 7, l: 4, d: 0 } });
  barn.doc.bench[ada.id] = [creature({ name: 'Empusa', species: 'empusa', xp: 3301, cap: 9, record: { w: 1, l: 0, d: 0 }, bornAt: 2 })];
  barn.doc.pens[bess.id] = creature({ name: 'Pyrops', species: 'pyrops', xp: 2221, cap: 9, record: { w: 12, l: 7, d: 0 } });
  barn.doc.pens[cy.id] = creature({ name: 'Lamprima', species: 'lamprima', xp: 1653, cap: 9, record: { w: 2, l: 10, d: 0 } });
  barn.doc.pens[egg.id] = { stage: 'egg', species: 'onymacris', eggAt: 1, hatchAt: 2 };
  barn.doc.pens[late.id] = creature({ stage: 'dead', name: 'Late', species: 'manticora', xp: 8000, cap: 23, record: { w: 20, l: 0, d: 0 } });
  barn.save();

  const { status, body } = await get('?sort=wealth', ada.token);
  assert.equal(status, 200);
  assert.equal(body.bugTrainers.length, 3);
  assert.deepEqual(body.bugTrainers.map((r) => r.name), ['Ada', 'Bess', 'Cy']);
  assert.equal(body.bugTrainers[0].id, ada.id);
  assert.equal(body.bugTrainers[0].bug.name, 'Empusa');
  assert.equal(body.bugTrainers[0].bug.species, 'empusa');
  assert.equal(body.bugTrainers[0].bug.speciesName, BY_ID.empusa.name);
  assert.equal(body.bugTrainers[0].bug.level, 9);
  assert.deepEqual(body.bugTrainers[0].bug.record, { w: 1, l: 0, d: 0 });
  assert.equal(Object.hasOwn(body.bugTrainers[0].bug, 'xp'), false);
  assert.ok(!JSON.stringify(body.bugTrainers).includes('3301'));
  assert.equal(typeof body.bugTrainers[0].avatar, 'object');
  assert.ok(!body.bugTrainers.some((r) => r.id === egg.id || r.id === late.id));
});

test('signed-in-only boards still hide guest trainers from the bug highlight', async (t) => {
  const { service, get, player } = await boot(t, { GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic', SESSION_SECRET: 'synthetic-test-secret' });
  const guest = player('Guest');
  const member = player('Member');
  member.record.login = { username: 'member' };
  service.barn.doc.pens[guest.id] = creature({ name: 'Onymacris', species: 'onymacris', xp: 4000, cap: 9, record: { w: 5, l: 0, d: 0 } });
  service.barn.doc.pens[member.id] = creature({ name: 'Phrictus', species: 'phrictus', xp: 200, cap: 9, record: { w: 0, l: 0, d: 0 } });
  service.barn.save();
  const board = (await get('?sort=earnings')).body;
  assert.equal(board.googleOnly, true);
  assert.deepEqual(board.rows.map((r) => r.id), [member.id]);
  assert.deepEqual(board.bugTrainers.map((r) => r.id), [member.id]);
  assert.equal(board.bugTrainers[0].bug.name, 'Phrictus');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { defaultShelves, roomFinishes } from '../server/catalog/room.js';

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'bba-room-api-');
  const dataDir = fs.mkdtempSync(prefix);
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(prefix)));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = headers => async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  const anon = client({});
  const login = async name => {
    const res = await anon('POST', '/auth/dev', { name, email: `${name.toLowerCase()}@example.test` });
    assert.equal(res.status, 200);
    const api = client({ cookie: res.headers.get('set-cookie').split(';')[0] });
    const me = (await api('GET', '/api/me')).body;
    return { id: me.id, api };
  };
  const owner = await login('RoomOwner'), visitor = await login('RoomVisitor');
  return { dataDir, service, anon, owner, visitor, client };
}

test('room endpoints allow signed-in visits immediately and distinguish legacy guests', async t => {
  const { owner, visitor, anon, client, dataDir } = await fixture(t);
  const signedOut = await anon('GET', '/api/room');
  assert.equal(signedOut.status, 401);
  assert.equal(signedOut.headers.get('cache-control'), 'no-store');
  const mine = await owner.api('GET', '/api/room');
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get('cache-control'), 'no-store');
  assert.equal(Object.hasOwn(mine.body, 'visibility'), false);
  assert.equal(Object.hasOwn(mine.body, 'showWealthPile'), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'rooms.json')), false, 'reading defaults writes no room file');
  const roomVisit = await visitor.api('GET', `/api/players/${owner.id}/room`);
  assert.equal(roomVisit.status, 200);
  assert.equal(roomVisit.headers.get('cache-control'), 'no-store');
  assert.deepEqual(roomVisit.body.worth, mine.body.worth);
  const legacy = await anon('POST', '/api/players', { name: 'Guest' });
  assert.equal(legacy.status, 200);
  const guest = client({ authorization: `Bearer ${legacy.body.token}` });
  assert.equal((await guest('GET', '/api/room')).status, 200);
  assert.equal((await owner.api('PATCH', '/api/room/sharing', { visibility: 'private' })).status, 404, 'removed sharing endpoint cannot close rooms');
  const guestVisit = await guest('GET', `/api/players/${owner.id}/room`);
  assert.equal(guestVisit.status, 403);
  assert.equal(guestVisit.headers.get('cache-control'), 'no-store');
  assert.equal((await anon('GET', `/api/players/${owner.id}/room`)).status, 401);
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/room`)).status, 200);
});

test('visitors receive displayed possessions and exact worth without unrelated private identity data', async t => {
  const { service, owner, visitor, anon } = await fixture(t);
  service.shop.inv(owner.id).own = { 'odd-deed': 1, 'odd-rock': 1, 'odd-vaccine': 1 };
  const layout = { expectedRevision: 0, themeId: 'bunkhouse-sage', placements: [{ anchorId: 'shelf-left', itemId: 'odd-rock' }] };
  assert.equal((await owner.api('PATCH', '/api/room/layout', layout)).status, 200);
  const visit = await visitor.api('GET', `/api/players/${owner.id}/room`);
  assert.equal(visit.status, 200);
  assert.equal(visit.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(visit.body).sort(), ['finishes', 'furniture', 'layoutRevision', 'owner', 'pet', 'placements', 'shelves', 'themeId', 'wealthStage', 'worth']);
  assert.deepEqual(Object.keys(visit.body.owner).sort(), ['avatar', 'id', 'name']);
  assert.deepEqual(visit.body.placements, layout.placements);
  assert.ok(!JSON.stringify(visit.body).includes('odd-vaccine'), 'undisplayed collection stays private');
  assert.ok(!JSON.stringify(visit.body).includes('@example.test'));
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/profile`)).body.roomVisitAvailable, true);
  assert.equal((await anon('GET', `/api/players/${owner.id}/profile`)).body.roomVisitAvailable, false);
  assert.equal(visit.body.wealthStage, 2);
  assert.deepEqual(visit.body.worth, (await owner.api('GET', '/api/me')).body.worth);
  const next = await owner.api('PATCH', '/api/room/layout', { ...layout, expectedRevision: 1, placements: [] });
  assert.equal(next.status, 200);
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/room`)).status, 200);
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/profile`)).body.roomVisitAvailable, true);
});

test('HTTP layout writes enforce ownership, reject stale edits and cannot target another owner', async t => {
  const { service, owner, visitor } = await fixture(t);
  service.shop.inv(owner.id).own['odd-rock'] = 1;
  const draft = { expectedRevision: 0, themeId: 'bunkhouse-timber', placements: [{ anchorId: 'shelf-left', itemId: 'odd-rock' }] };
  assert.equal((await visitor.api('PATCH', '/api/room/layout', draft)).status, 400, 'another account cannot place unowned items');
  assert.equal((await owner.api('PATCH', '/api/room/layout', { ...draft, ownerId: visitor.id })).status, 400);
  assert.equal((await owner.api('PATCH', '/api/room/layout', draft)).status, 200);
  assert.equal((await owner.api('PATCH', '/api/room/layout', draft)).status, 409);
  assert.equal((await visitor.api('PATCH', `/api/players/${owner.id}/room`, draft)).status, 404);
  assert.deepEqual((await owner.api('GET', '/api/room')).body.placements, draft.placements);
  assert.deepEqual((await visitor.api('GET', '/api/room')).body.placements, []);
});

test('HTTP furniture edits move shelf contents, validate mounts, and show only the saved layout to visitors', async t => {
  const { service, owner, visitor } = await fixture(t);
  service.shop.inv(owner.id).own['odd-lamp'] = 1;
  const before = (await owner.api('GET', '/api/me')).body.worth;
  const shelves = defaultShelves().map(shelf => shelf.id === 'shelf-left' ? { ...shelf, spotId: 'left-high-back', typeId: 'braced', colorId: 'sage' } : shelf);
  const finishes = { ...roomFinishes(), floor: { typeId: 'stone', colorId: 'slate' }, wardrobe: { typeId: 'paneled', colorId: 'honey' } };
  const draft = { expectedRevision: 0, themeId: 'bunkhouse-sage', placements: [{ anchorId: 'shelf-left', itemId: 'odd-lamp' }], shelves, finishes };
  assert.deepEqual((await visitor.api('GET', `/api/players/${owner.id}/room`)).body.shelves, defaultShelves());
  const save = await owner.api('PATCH', '/api/room/layout', draft);
  assert.equal(save.status, 200);
  const visit = (await visitor.api('GET', `/api/players/${owner.id}/room`)).body;
  assert.deepEqual(visit.shelves, shelves);
  assert.deepEqual(visit.finishes, finishes);
  assert.deepEqual(visit.placements, draft.placements);
  assert.deepEqual((await owner.api('GET', '/api/me')).body.worth, before);
  assert.equal((await owner.api('PATCH', '/api/room/layout', draft)).status, 409);
  assert.equal((await owner.api('PATCH', '/api/room/layout', { ...draft, expectedRevision: 1, shelves: [shelves[0], { ...shelves[1], spotId: shelves[0].spotId }] })).status, 400);
  assert.equal((await owner.api('PATCH', '/api/room/layout', { ...draft, expectedRevision: 1, shelves: [] })).status, 400, 'removing a shelf must also remove its placement');
  assert.equal((await owner.api('PATCH', '/api/room/layout', { ...draft, expectedRevision: 1, shelves: [], placements: [] })).status, 200);
  assert.deepEqual((await visitor.api('GET', `/api/players/${owner.id}/room`)).body.shelves, []);
  assert.equal(service.shop.inv(owner.id).own['odd-lamp'], 1);
  assert.equal((await visitor.api('PATCH', `/api/players/${owner.id}/room`, draft)).status, 404);
});

test('the wealth display follows total worth when wallet money moves to poker chips', async t => {
  const { owner, visitor } = await fixture(t);
  const before = (await owner.api('GET', '/api/me')).body.worth;
  assert.equal((await owner.api('GET', '/api/room')).body.wealthStage, 2);
  const created = await owner.api('POST', '/api/tables', { name: 'Wealth display check', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, maxPlayers: 2 } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const after = (await owner.api('GET', '/api/me')).body.worth;
  assert.equal(after.bankroll, before.bankroll - 100);
  assert.equal(after.chips, before.chips + 100);
  assert.equal(after.total, before.total);
  const visit = (await visitor.api('GET', `/api/players/${owner.id}/room`)).body;
  assert.equal(visit.wealthStage, 2);
  assert.deepEqual(visit.worth, after, 'visitor amounts refresh from the authoritative balances');
});

test('deleted and hidden players have no visitable room or remaining saved room record', async t => {
  const { service, owner, visitor, dataDir } = await fixture(t);
  await owner.api('PATCH', '/api/room/layout', { expectedRevision: 0, themeId: 'bunkhouse-sage', placements: [] });
  service.getPlayer(owner.id).hidden = true;
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/room`)).status, 404);
  delete service.getPlayer(owner.id).hidden;
  assert.equal((await owner.api('DELETE', '/api/me', { confirm: 'DELETE' })).status, 200);
  assert.equal((await visitor.api('GET', `/api/players/${owner.id}/room`)).status, 404);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(dataDir, 'rooms.json'), 'utf8')).rooms, owner.id), false);
});

test('claiming a legacy identity keeps its room and removes the discarded fresh account room', async t => {
  const { owner, anon, client, dataDir } = await fixture(t);
  const legacy = (await anon('POST', '/api/players', { name: 'Old Room Owner' })).body;
  const guest = client({ authorization: `Bearer ${legacy.token}` });
  assert.equal((await guest('PATCH', '/api/room/layout', { expectedRevision: 0, themeId: 'bunkhouse-clay', placements: [] })).status, 200);
  await owner.api('PATCH', '/api/room/layout', { expectedRevision: 0, themeId: 'bunkhouse-sage', placements: [] });
  const claimed = await owner.api('POST', '/api/auth/claim-legacy', { token: legacy.token });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.merged, true);
  const rooms = JSON.parse(fs.readFileSync(path.join(dataDir, 'rooms.json'), 'utf8')).rooms;
  assert.equal(Object.hasOwn(rooms, owner.id), false);
  assert.equal(rooms[legacy.id].themeId, 'bunkhouse-clay');
  assert.equal(Object.hasOwn(rooms[legacy.id], 'visibility'), false);
  assert.equal((await owner.api('GET', '/api/room')).body.owner.id, legacy.id);
});

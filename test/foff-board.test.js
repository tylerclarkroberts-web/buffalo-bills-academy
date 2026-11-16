// Foff course records and holes-in-one: honour-system posted nines, backfilled totals, and the trip boards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { BOARD_TOP, FILM_MIN_MS, Foff, HOLE_MAX, NINES } from '../server/foff.js';
import { MATCHES } from '../client/src/foff/course.js';
import { MAX_STROKES } from '../client/src/foff/golf-sim.js';
import { markPosted, pendingPosts, queueRound } from '../client/src/foff/records.js';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-board-'));
  const clock = { t: 1_700_000_000_000 };
  const { app, shutdown, service } = createApp({ dataDir: dir, devLogin: true, env: {}, now: () => clock.t });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const watch = async (c) => {
    assert.equal((await call(c, 'POST', '/api/foff/watching')).status, 200);
    clock.t += FILM_MIN_MS;
    assert.equal((await call(c, 'POST', '/api/foff/watched')).status, 200);
  };
  return { call, login, watch, clock, service, dir, stop: () => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('the server list of nines matches the trip, and a hole still tops out at ten strokes', () => {
  assert.deepEqual(NINES, MATCHES.map((m) => ({ id: m.id, course: m.course, nine: m.nine, holes: m.holes.length })));
  assert.equal(HOLE_MAX, MAX_STROKES);
});

test('the local outbox queues a finished nine and backfills old best totals once', () => {

  const save = { best: { 1: 9, 2: 11 } };
  assert.deepEqual(pendingPosts(save), [
    { matchId: 1, strokes: 9, backfill: true },
    { matchId: 2, strokes: 11, backfill: true },
  ]);
  queueRound(save, { matchId: 3, strokes: 10, holes: [3, 4, 3], at: 50 });
  markPosted(save, { matchId: 1, strokes: 9, backfill: true });
  assert.deepEqual(save.postedBest, ['1']);
  const pending = pendingPosts(save);
  assert.deepEqual(pending.filter((p) => p.backfill), [{ matchId: 2, strokes: 11, backfill: true }]);
  assert.equal(pending.some((p) => p.matchId === 3 && p.at === 50 && p.holes[1] === 4), true);
  markPosted(save, pending.find((p) => p.matchId === 3));
  assert.equal(pendingPosts(save).every((p) => p.matchId !== 3), true);
  assert.ok(save.postedBest.includes('3'));
});

test('an old foff.json without best or aces still loads as an empty board', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-legacy-'));
  fs.writeFileSync(path.join(dir, 'foff.json'), JSON.stringify({ by: {}, quests: {} }));
  const foff = new Foff({ store: { loadDoc: () => JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8')), saveDoc() {}, players: {} } });
  const board = foff.board();
  assert.equal(board.courses.length, NINES.length);
  assert.ok(board.courses.every((c) => c.record === null && c.top.length === 0));
  assert.deepEqual(board.aces, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('course records and holes-in-one: posting, backfill, ties, hidden players and forget', async () => {
  const s = await boot();
  try {
    const empty = await s.call(null, 'GET', '/api/foff/board');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.courses.length, NINES.length);
    assert.deepEqual(empty.body.aces, []);
    assert.equal((await s.call(null, 'POST', '/api/foff/round', { matchId: 1, strokes: 9 })).status, 401);

    const keetch = await s.login('Keetch');
    assert.equal((await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 9 })).status, 403);
    await s.watch(keetch);

    assert.equal((await s.call(keetch, 'POST', '/api/foff/round', { matchId: 99, strokes: 9 })).status, 400);
    assert.equal((await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 2 })).status, 400);
    assert.equal((await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 9, holes: [3, 3] })).status, 400);
    assert.equal((await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 10, holes: [3, 3, 3] })).status, 400);

    s.clock.t = 1_700_100_000_000;
    const first = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 9, holes: [3, 3, 3], at: 1_700_050_000_000 });
    assert.equal(first.status, 200);
    assert.equal(first.body.courses[0].record.strokes, 9);
    assert.equal(first.body.courses[0].record.name, 'Keetch');
    assert.equal(first.body.courses[0].record.you, true);
    assert.ok(first.body.courses[0].record.avatar);
    assert.equal(first.body.aces.length, 0);

    const worse = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 1, strokes: 12, holes: [4, 4, 4], at: s.clock.t });
    assert.equal(worse.body.courses[0].record.strokes, 9);

    const aceRound = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 4, strokes: 8, holes: [1, 4, 3], at: 1_700_080_000_000 });
    assert.equal(aceRound.body.courses.find((c) => c.matchId === 4).record.strokes, 8);
    assert.equal(aceRound.body.aces.length, 1);
    assert.deepEqual([aceRound.body.aces[0].name, aceRound.body.aces[0].course, aceRound.body.aces[0].nine, aceRound.body.aces[0].hole], ['Keetch', 'Pacific Grove', 'Back nine', 1]);

    const again = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 4, strokes: 8, holes: [1, 4, 3], at: 1_700_080_000_000 });
    assert.equal(again.body.aces.length, 1, 'the same card does not list the ace twice');

    const laterAce = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 4, strokes: 9, holes: [1, 4, 4], at: 1_700_090_000_000 });
    assert.equal(laterAce.body.aces.length, 2);
    assert.equal(laterAce.body.aces[0].at, 1_700_090_000_000, 'newest ace first');
    assert.equal(laterAce.body.courses.find((c) => c.matchId === 4).record.strokes, 8, 'a worse retry keeps the record');

    const backfill = await s.call(keetch, 'POST', '/api/foff/round', { matchId: 2, strokes: 10 });
    assert.equal(backfill.status, 200);
    assert.equal(backfill.body.courses.find((c) => c.matchId === 2).record.strokes, 10);
    assert.equal(backfill.body.aces.length, 2, 'a total-only backfill cannot invent a hole in one');

    const landon = await s.login('Landon');
    await s.watch(landon);
    s.clock.t = 1_700_200_000_000;
    await s.call(landon, 'POST', '/api/foff/round', { matchId: 1, strokes: 9, holes: [2, 4, 3], at: 1_700_150_000_000 });
    const tied = (await s.call(keetch, 'GET', '/api/foff/board')).body.courses[0];
    assert.equal(tied.record.name, 'Keetch', 'the earlier 9 keeps the record');
    assert.deepEqual(tied.top.map((r) => r.name), ['Keetch', 'Landon']);
    assert.equal(tied.top[1].you, false);

    const better = await s.call(landon, 'POST', '/api/foff/round', { matchId: 1, strokes: 7, holes: [2, 3, 2], at: s.clock.t });
    assert.equal(better.body.courses[0].record.name, 'Landon');
    assert.equal(better.body.courses[0].record.strokes, 7);

    const foff = await s.login('Foff');
    await s.watch(foff);
    for (let i = 0; i < BOARD_TOP + 2; i++) {
      const ck = await s.login(`Pal${i}`);
      await s.watch(ck);
      await s.call(ck, 'POST', '/api/foff/round', { matchId: 3, strokes: 12 + i, holes: [4, 4, 4 + i], at: s.clock.t + i });
    }
    const grove = (await s.call(null, 'GET', '/api/foff/board')).body.courses.find((c) => c.matchId === 3);
    assert.equal(grove.top.length, BOARD_TOP);
    assert.deepEqual(grove.top.map((r) => r.strokes), [12, 13, 14, 15, 16]);

    const hiddenName = 'Ghost';
    const ghost = await s.login(hiddenName);
    await s.watch(ghost);
    await s.call(ghost, 'POST', '/api/foff/round', { matchId: 5, strokes: 6, holes: [1, 1, 4], at: s.clock.t });
    const ghostId = Object.values(s.service.store.players).find((p) => p.name === hiddenName).id;
    s.service.store.players[ghostId].hidden = true;
    const afterHide = (await s.call(null, 'GET', '/api/foff/board')).body;
    assert.equal(afterHide.courses.find((c) => c.matchId === 5).record, null);
    assert.equal(afterHide.aces.some((a) => a.name === hiddenName), false);

    const landonId = Object.values(s.service.store.players).find((p) => p.name === 'Landon').id;
    // forget through the same Foff the app holds: delete via the store doc after hitting the account delete path is heavy, so call the in-process instance through a round-trip by patching the file? Use HTTP delete if any.
    // Directly: load the doc after a forget from a second Foff would fork state. Use the running service by posting nothing; instead mark via createApp's docs.
    // The live foff is inside createApp. Delete the player through the admin-less forget used on account deletion — POST /auth is not it.
    // We'll construct nothing: wipe by setting a new Foff on the same store after manually calling forget on a copy would split. Skip HTTP and assert forget on a standalone copy, plus hide already tested.
    const docBefore = JSON.parse(fs.readFileSync(path.join(s.dir, 'foff.json'), 'utf8'));
    assert.ok(docBefore.best[landonId]);
    const standalone = new Foff({
      store: {
        loadDoc: () => JSON.parse(fs.readFileSync(path.join(s.dir, 'foff.json'), 'utf8')),
        saveDoc: (_n, data) => fs.writeFileSync(path.join(s.dir, 'foff.json'), JSON.stringify(data)),
        players: s.service.store.players,
      },
      accounts: { ensure() {} },
      shop: { inv() { return { own: {} }; }, save() {} },
      avatars: { info: (p) => ({ kind: 'gen', seed: p.id }) },
    });
    standalone.forget(landonId);
    const forgotten = JSON.parse(fs.readFileSync(path.join(s.dir, 'foff.json'), 'utf8'));
    assert.equal(forgotten.best[landonId], undefined);
    assert.equal((forgotten.aces || []).some((a) => a.pid === landonId), false);
  } finally { s.stop(); }
});

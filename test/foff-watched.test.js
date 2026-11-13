// The bagpipe film that unlocks Foff's Bachelor Party: a per-player watched flag with a real watch-time check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { FILM_MIN_MS, FILM_MS, FILM_SLACK_MS, Foff, NEED_FILM, PRIZE } from '../server/foff.js';
import { cacheKey, createPlayClock, FILM_MIN_MS as CLIENT_MIN, FILM_MS as CLIENT_MS, FILM_SLACK_MS as CLIENT_SLACK, playedEnough, watchedEnough, WATCHED_THRESHOLD } from '../client/src/foff/trailer.js';

function memStore(initial) {
  let doc = initial;
  return { loadDoc: (_n, fb) => (doc ?? { ...fb }), saveDoc: (_n, d) => { doc = d; }, snap: () => doc };
}

test('client and server agree on the film length, and watchedEnough / playedEnough use 95% and slack', () => {
  assert.deepEqual([CLIENT_MS, CLIENT_SLACK, CLIENT_MIN], [FILM_MS, FILM_SLACK_MS, FILM_MIN_MS]);
  assert.equal(FILM_MS, 93_000);
  assert.equal(FILM_MIN_MS, 88_000);
  assert.equal(WATCHED_THRESHOLD, 0.95);
  assert.equal(watchedEnough(0, 100, true), true);
  assert.equal(watchedEnough(95, 100), true);
  assert.equal(watchedEnough(94.9, 100), false);
  assert.equal(watchedEnough(0, 0), false);
  assert.equal(playedEnough(FILM_MIN_MS), true);
  assert.equal(playedEnough(FILM_MIN_MS - 1), false);
  assert.equal(playedEnough('x'), false);
  assert.equal(cacheKey('p1'), 'bba.foff.watched.p1');
});

test('play clock only counts time spent in the playing state', () => {
  const c = createPlayClock();
  assert.equal(c.value(0), 0);
  c.playing(1000);
  assert.equal(c.value(4000), 3000);
  c.stopped(5000);
  assert.equal(c.value(8000), 4000);
  c.playing(8000);
  c.playing(9000); // already playing: do not reset
  assert.equal(c.value(10000), 6000);
  c.stopped(10000);
  c.stopped(12000); // already stopped
  assert.equal(c.value(20000), 6000);
});

test('markWatched needs a watch-start and enough elapsed time; a missing watched map is unwatched', () => {
  const clock = { t: 1000 };
  const store = memStore({ by: {}, quests: {} }); // old save: no watched / watching
  const foff = new Foff({ store, accounts: {}, shop: {}, now: () => clock.t });
  const a = { id: 'a' }, b = { id: 'b' };
  assert.equal(foff.watched(a), false);
  assert.throws(() => foff.markWatched(null), { status: 401 });
  assert.throws(() => foff.markWatched(a), { status: 403, message: 'Start the film first.' });
  const start = foff.startWatching(a);
  assert.equal(start.startedAt, 1000);
  assert.equal(start.minMs, FILM_MIN_MS);
  assert.equal(foff.startWatching(a).startedAt, 1000, 'retry does not reset the clock');
  clock.t = 1000 + FILM_MIN_MS - 1;
  assert.throws(() => foff.markWatched(a), { status: 403 });
  clock.t = 1000 + FILM_MIN_MS;
  const first = foff.markWatched(a);
  assert.deepEqual(first, { watched: true, at: clock.t });
  assert.equal(foff.watched(a), true);
  assert.equal(foff.watched(b), false);
  assert.equal(foff.markWatched(a).at, first.at, 'idempotent: keeps the original time');
  assert.deepEqual(store.snap().by, {});
  assert.deepEqual(store.snap().quests, {});
  foff.forget('a');
  assert.equal(foff.watched(a), false);
  assert.equal(store.snap().watched.a, undefined);
  assert.equal(store.snap().watching.a, undefined);
});

test('claim and quest are forbidden until the film is watched, and existing progress is left alone', () => {
  const clock = { t: 1000 };
  const by = { a: { at: 50 } }, quests = { a: { van: 50 } };
  const store = memStore({ by: { ...by }, quests: { a: { ...quests.a } } });
  const accounts = { ensure() {}, change() { throw new Error('should not pay again'); } };
  const shop = { inv() { return { own: {} }; }, save() {} };
  const foff = new Foff({ store, accounts, shop, now: () => clock.t });
  const a = { id: 'a', bankroll: 1000 };
  assert.throws(() => foff.claim(a), { status: 403, message: NEED_FILM });
  assert.throws(() => foff.quest(a, 'van'), { status: 403, message: NEED_FILM });
  assert.deepEqual(store.snap().by, by);
  assert.deepEqual(store.snap().quests, quests);
  foff.startWatching(a);
  clock.t += FILM_MIN_MS;
  foff.markWatched(a);
  assert.deepEqual(foff.claim(a), { already: true, prize: PRIZE, bankroll: 1000 });
  assert.equal(foff.quest(a, 'van').already, true);
  assert.deepEqual(store.snap().by, by);
  assert.deepEqual(store.snap().quests, quests);
});

async function boot(dir, clock) {
  const { app, service, shutdown } = createApp({ dataDir: dir, devLogin: true, env: {}, now: clock ? () => clock.t : undefined });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const watch = async (c) => {
    const started = await call(c, 'POST', '/api/foff/watching');
    assert.equal(started.status, 200, JSON.stringify(started.body));
    clock.t += FILM_MIN_MS;
    const marked = await call(c, 'POST', '/api/foff/watched');
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    return marked;
  };
  return { service, call, login, watch, clock, stop: () => { server.close(); shutdown(); } };
}

test('POST /foff/watched is rejected until watch-start plus the film length; then it is per player and survives a restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-watch-'));
  const clock = { t: 1_700_000_000_000 };
  let s = await boot(dir, clock);
  t.after(() => { try { s.stop(); } catch { /* already */ } fs.rmSync(dir, { recursive: true, force: true }); });

  assert.equal((await s.call(null, 'POST', '/api/foff/watching')).status, 401);
  assert.equal((await s.call(null, 'POST', '/api/foff/watched')).status, 401);

  const keetch = await s.login('Keetch');
  const tyler = await s.login('Tyler');
  assert.equal((await s.call(keetch, 'GET', '/api/me')).body.foffWatched, false);
  const early = await s.call(keetch, 'POST', '/api/foff/watched');
  assert.equal(early.status, 403);
  assert.match(early.body.error, /Start the film first/);
  const started = await s.call(keetch, 'POST', '/api/foff/watching');
  assert.equal(started.status, 200);
  clock.t += FILM_MIN_MS - 1;
  const soon = await s.call(keetch, 'POST', '/api/foff/watched');
  assert.equal(soon.status, 403);
  assert.match(soon.body.error, /Keep watching/);
  clock.t += 1;
  const marked = await s.call(keetch, 'POST', '/api/foff/watched');
  assert.equal(marked.status, 200);
  assert.equal(marked.body.watched, true);
  assert.ok(marked.body.at);
  assert.equal((await s.call(keetch, 'GET', '/api/me')).body.foffWatched, true);
  assert.equal((await s.call(tyler, 'GET', '/api/me')).body.foffWatched, false, 'the other player is still locked');
  assert.equal((await s.call(keetch, 'POST', '/api/foff/watched')).body.at, marked.body.at);
  assert.equal((await s.call(keetch, 'POST', '/api/foff/claim')).status, 200);
  assert.equal((await s.call(tyler, 'POST', '/api/foff/claim')).status, 403);
  assert.equal((await s.call(tyler, 'POST', '/api/foff/quest', { id: 'van' })).status, 403);

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.ok(saved.watched);
  assert.ok(saved.watching);
  s.stop();

  s = await boot(dir, { t: clock.t });
  const keetch2 = await s.login('Keetch');
  const tyler2 = await s.login('Tyler');
  assert.equal((await s.call(keetch2, 'GET', '/api/me')).body.foffWatched, true, 'still watched after restart');
  assert.equal((await s.call(tyler2, 'GET', '/api/me')).body.foffWatched, false);
});

test('an old foff.json still loads, progress is kept if they have not watched yet, and deleting the account forgets the film flag', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-old-'));
  const clock = { t: 1_700_000_000_000 };
  const s = await boot(dir, clock);
  t.after(() => { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const reg = await s.call(null, 'POST', '/auth/register', { username: 'film_watcher', password: 'long enough pw 1' });
  assert.equal(reg.status, 200);
  const c = reg.cookie, id = reg.body.id;
  // Write an older-shaped save (no watching/watched) that already has a medal and a quest, as if they played before the film gate.
  fs.writeFileSync(path.join(dir, 'foff.json'), JSON.stringify({ by: { [id]: { at: 99 } }, quests: { [id]: { van: 99 } } }));
  s.stop();
  const s2 = await boot(dir, clock);
  t.after(() => { try { s2.stop(); } catch { /* already */ } });
  const again = await s2.call(null, 'POST', '/auth/login', { username: 'film_watcher', password: 'long enough pw 1' });
  const ck = again.cookie;
  assert.equal((await s2.call(ck, 'GET', '/api/me')).body.foffWatched, false);
  assert.equal((await s2.call(ck, 'POST', '/api/foff/claim')).status, 403);
  const mid = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.equal(mid.by[id].at, 99);
  assert.equal(mid.quests[id].van, 99);
  await s2.watch(ck);
  const claimed = await s2.call(ck, 'POST', '/api/foff/claim');
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.already, true, 'existing medal was not paid out again');
  const afterWatch = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.equal(afterWatch.by[id].at, 99);
  assert.equal(afterWatch.quests[id].van, 99);

  const del = await s2.call(ck, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'long enough pw 1' });
  assert.equal(del.status, 200);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.equal(after.watched[id], undefined);
  assert.equal(after.watching[id], undefined);
  assert.equal(after.by[id], undefined);
});

// The lobby film that unlocks Foff's Bachelor Party: a per-player watched flag, back-compatible, sticky across restarts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Foff } from '../server/foff.js';
import { cacheKey, watchedEnough, WATCHED_THRESHOLD } from '../client/src/foff/trailer.js';

function memStore(initial) {
  let doc = initial;
  return { loadDoc: (_n, fb) => (doc ?? { ...fb }), saveDoc: (_n, d) => { doc = d; }, snap: () => doc };
}

test('watchedEnough: ended always counts, and 95% of a known duration counts', () => {
  assert.equal(watchedEnough(0, 100, true), true);
  assert.equal(watchedEnough(95, 100), true);
  assert.equal(watchedEnough(94.9, 100), false);
  assert.equal(watchedEnough(0, 0), false);
  assert.equal(watchedEnough(10, -1), false);
  assert.equal(watchedEnough('x', 100), false);
  assert.equal(WATCHED_THRESHOLD, 0.95);
  assert.equal(cacheKey('p1'), 'bba.foff.watched.p1');
});

test('the watched flag is off until marked, stays marked, and a missing watched map is unwatched', () => {
  const store = memStore({ by: {}, quests: {} }); // no `watched` key: old saves
  const foff = new Foff({ store, accounts: {}, shop: {}, now: () => 1000 });
  const a = { id: 'a' }, b = { id: 'b' };
  assert.equal(foff.watched(a), false);
  assert.equal(foff.watched(null), false);
  const first = foff.markWatched(a);
  assert.deepEqual(first, { watched: true, at: 1000 });
  assert.equal(foff.watched(a), true);
  assert.equal(foff.watched(b), false);
  assert.equal(foff.markWatched(a).at, 1000, 'idempotent: keeps the original time');
  assert.ok(store.snap().watched.a);
  assert.deepEqual(store.snap().by, {});
  assert.deepEqual(store.snap().quests, {});
  foff.forget('a');
  assert.equal(foff.watched(a), false);
  assert.equal(store.snap().watched.a, undefined);
});

test('markWatched refuses a missing player', () => {
  const foff = new Foff({ store: memStore({ by: {}, quests: {} }), accounts: {}, shop: {}, now: () => 1 });
  assert.throws(() => foff.markWatched(null), { status: 401 });
});

async function boot(dir) {
  const { app, service, shutdown } = createApp({ dataDir: dir, devLogin: true, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  return { service, call, login, stop: () => { server.close(); shutdown(); } };
}

test('POST /foff/watched is per player, shows up on /me, and survives a restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-watch-'));
  let s = await boot(dir);
  t.after(() => { try { s.stop(); } catch { /* already */ } fs.rmSync(dir, { recursive: true, force: true }); });

  assert.equal((await s.call(null, 'POST', '/api/foff/watched')).status, 401);

  const keetch = await s.login('Keetch');
  const tyler = await s.login('Tyler');
  assert.equal((await s.call(keetch, 'GET', '/api/me')).body.foffWatched, false);
  assert.equal((await s.call(tyler, 'GET', '/api/me')).body.foffWatched, false);

  const marked = await s.call(keetch, 'POST', '/api/foff/watched');
  assert.equal(marked.status, 200);
  assert.equal(marked.body.watched, true);
  assert.ok(marked.body.at);
  assert.equal((await s.call(keetch, 'GET', '/api/me')).body.foffWatched, true);
  assert.equal((await s.call(tyler, 'GET', '/api/me')).body.foffWatched, false, 'the other player is still locked');
  assert.equal((await s.call(keetch, 'POST', '/api/foff/watched')).body.at, marked.body.at);

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.ok(saved.watched);
  assert.ok(!Array.isArray(saved.by));
  s.stop();

  s = await boot(dir);
  const keetch2 = await s.login('Keetch');
  const tyler2 = await s.login('Tyler');
  assert.equal((await s.call(keetch2, 'GET', '/api/me')).body.foffWatched, true, 'still watched after restart');
  assert.equal((await s.call(tyler2, 'GET', '/api/me')).body.foffWatched, false);
});

test('an old foff.json without a watched map still loads, and deleting the account forgets the flag', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-foff-old-'));
  fs.writeFileSync(path.join(dir, 'foff.json'), JSON.stringify({ by: {}, quests: {} }));
  const s = await boot(dir);
  t.after(() => { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const reg = await s.call(null, 'POST', '/auth/register', { username: 'film_watcher', password: 'long enough pw 1' });
  assert.equal(reg.status, 200);
  const c = reg.cookie;
  assert.equal((await s.call(c, 'GET', '/api/me')).body.foffWatched, false);
  assert.equal((await s.call(c, 'POST', '/api/foff/watched')).status, 200);
  assert.equal((await s.call(c, 'GET', '/api/me')).body.foffWatched, true);
  const mid = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.deepEqual(mid.by, {});
  assert.deepEqual(mid.quests, {});
  assert.ok(mid.watched[reg.body.id]);

  const del = await s.call(c, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'long enough pw 1' });
  assert.equal(del.status, 200);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'foff.json'), 'utf8'));
  assert.equal(after.watched[reg.body.id], undefined);
});

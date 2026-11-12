// v61: change username handle from Settings / Account
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../server/app.js';

async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-user-'));
  const r = createApp({ dataDir, now: () => Date.now(), env: {} });
  const server = await new Promise((res) => { const s = r.app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { r.shutdown(); server.closeAllConnections?.(); await new Promise((x) => server.close(x)); };
  return { base, stop, service: r.service };
}
function client(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.().map((c) => c.split(';')[0]).filter((c) => c.startsWith('bba_sid='))
      || (res.headers.get('set-cookie') ? [res.headers.get('set-cookie').split(';')[0]].filter((c) => c.startsWith('bba_sid=')) : []);
    if (set.length) cookie = set.at(-1) === 'bba_sid=' ? '' : set.at(-1);
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0, 120) }; }
    return { status: res.status, body: j };
  };
  return {
    post: (u, b) => call('POST', u, b || {}),
    patch: (u, b) => call('PATCH', u, b || {}),
    get: (u) => call('GET', u),
    get cookie() { return cookie; },
  };
}

test('change username: persists, rejects taken/invalid, login uses new handle', async (t) => {
  const s = await boot(); t.after(s.stop);
  const a = client(s.base);
  let r = await a.post('/auth/register', { username: 'alice_one', password: 'salsa on the porch', name: 'Alice' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = client(s.base);
  r = await b.post('/auth/register', { username: 'bob_two', password: 'salsa on the porch', name: 'Bob' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await a.patch('/api/me', { username: 'ab' });
  assert.equal(r.status, 400);

  r = await a.patch('/api/me', { username: 'bob_two' });
  assert.equal(r.status, 409);

  r = await a.patch('/api/me', { username: 'Alice.New' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.username, 'alice.new');

  r = await a.get('/api/me');
  assert.equal(r.body.username, 'alice.new');

  const oldLogin = client(s.base);
  r = await oldLogin.post('/auth/login', { username: 'alice_one', password: 'salsa on the porch' });
  assert.equal(r.status, 401);
  const newLogin = client(s.base);
  r = await newLogin.post('/auth/login', { username: 'alice.new', password: 'salsa on the porch' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('same username is a no-op; display name rename still works', async (t) => {
  const s = await boot(); t.after(s.stop);
  const a = client(s.base);
  let r = await a.post('/auth/register', { username: 'carol_x', password: 'salsa on the porch' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await a.patch('/api/me', { username: 'carol_x' });
  assert.equal(r.status, 200);
  assert.equal(r.body.username, 'carol_x');
  r = await a.patch('/api/me', { name: 'Carol' });
  assert.equal(r.status, 200);
  r = await a.get('/api/me');
  assert.equal(r.body.name, 'Carol');
  assert.equal(r.body.username, 'carol_x');
});

test('rejected display name keeps the old name; retry returns the canonical saved name', async (t) => {
  const s = await boot(); t.after(s.stop);
  const a = client(s.base);
  let r = await a.post('/auth/register', { username: 'dana_x', password: 'salsa on the porch', name: 'Dana' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const name of ['', '   ', '<>']) {
    r = await a.patch('/api/me', { name });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Please enter a name');
    assert.equal((await a.get('/api/me')).body.name, 'Dana');
  }
  r = await a.patch('/api/me', { name: '  <Dana New>  ' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.name, 'Dana New');
  const saved = (await a.get('/api/me')).body;
  assert.equal(saved.name, r.body.name);
  assert.equal(saved.username, 'dana_x');
});

test('table seats and standings follow a display-name change, and a handle change when no separate name was chosen', async (t) => {
  const s = await boot(); t.after(s.stop);
  const a = client(s.base);
  let r = await a.post('/auth/register', { username: 'erin_x', password: 'salsa on the porch' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.name ?? (await a.get('/api/me')).body.name, 'erin_x');
  r = await a.post('/api/tables', { name: 'Rename room', settings: { buyIn: 100 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const code = r.body.code;
  const shown = async () => {
    const v = (await a.get(`/api/tables/${code}`)).body;
    return { seat: v.seats[v.me.seat].name, standing: v.standings.find((x) => x.playerId === v.me.playerId).name, version: v.version };
  };
  const before = await shown();
  assert.equal(before.seat, 'erin_x');

  // never chose a display name: the new handle is the new table name, with the capitals they typed
  r = await a.patch('/api/me', { username: 'Erin.New' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.username, 'erin.new');
  assert.equal(r.body.name, 'Erin.New');
  let now = await shown();
  assert.deepEqual([now.seat, now.standing], ['Erin.New', 'Erin.New']);
  assert.ok(now.version > before.version, 'open tables are told to refresh');

  // a chosen display name reaches the table too, and then stays put when the handle changes
  r = await a.patch('/api/me', { name: 'Big Slick' });
  assert.equal(r.status, 200);
  now = await shown();
  assert.deepEqual([now.seat, now.standing], ['Big Slick', 'Big Slick']);
  r = await a.patch('/api/me', { username: 'erin_three' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Big Slick');
  assert.equal((await shown()).seat, 'Big Slick');

  // a rejected handle changes nothing
  r = await a.patch('/api/me', { username: 'x' });
  assert.equal(r.status, 400);
  assert.equal((await a.get('/api/me')).body.username, 'erin_three');
});

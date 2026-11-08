// Deleting an account: self-service (password + "DELETE") and the operator file on boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

async function boot(dataDir) {
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  return { service, call, stop: () => { server.close(); shutdown(); } };
}

test('self-delete needs DELETE + the password, refuses while seated, then removes everything', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-del-'));
  const s = await boot(dir); t.after(() => { s.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const reg = await s.call(null, 'POST', '/auth/register', { username: 'temp_tester', password: 'long enough pw 1' });
  assert.equal(reg.status, 200);
  const c = reg.cookie;
  const id = reg.body.id;
  assert.equal((await s.call(c, 'DELETE', '/api/me', { password: 'long enough pw 1' })).status, 400, 'needs DELETE');
  assert.equal((await s.call(c, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'wrong wrong 1' })).status, 401);
  const tb = await s.call(c, 'POST', '/api/tables', { name: 'Mine', settings: { buyIn: 100 } });
  const code = tb.body.code || tb.body.table?.code;
  assert.equal((await s.call(c, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'long enough pw 1' })).status, 409, 'seated: refused');
  await s.call(c, 'POST', `/api/tables/${code}/leave`, {});
  const del = await s.call(c, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'long enough pw 1' });
  assert.equal(del.status, 200);
  assert.equal(s.service.store.players[id], undefined);
  assert.equal((await s.call(c, 'GET', '/api/me')).status, 401, 'session is gone');
  assert.equal((await s.call(null, 'POST', '/auth/login', { username: 'temp_tester', password: 'long enough pw 1' })).status, 401);
});

test('a deleted guest\'s browser token stops working at once (no ghost session until restart)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-del-'));
  const { app, service, shutdown } = createApp({ dataDir: dir, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (tok, m, p, b) => fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.status);
  const g = await (await fetch(base + '/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Temp' }) })).json();
  assert.equal(await call(g.token, 'GET', '/me'), 200);
  assert.equal(await call(g.token, 'DELETE', '/me', { confirm: 'DELETE' }), 200);
  assert.equal(await call(g.token, 'GET', '/me'), 401);
  assert.equal(service.store.players[g.id], undefined);
});

test('operator file: admin-delete.json is applied once on boot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-del2-'));
  let s = await boot(dir);
  const reg = await s.call(null, 'POST', '/auth/register', { username: 'zz_gone', password: 'long enough pw 1' });
  const keep = await s.call(null, 'POST', '/auth/register', { username: 'zz_keep', password: 'long enough pw 1' });
  s.stop();
  fs.writeFileSync(path.join(dir, 'admin-delete.json'), JSON.stringify(['zz_gone', 'nobody']));
  s = await boot(dir);
  assert.equal(s.service.store.players[reg.body.id], undefined);
  assert.ok(s.service.store.players[keep.body.id]);
  assert.equal(fs.existsSync(path.join(dir, 'admin-delete.json')), false);
  const done = JSON.parse(fs.readFileSync(path.join(dir, 'admin-delete.json.done'), 'utf8'));
  assert.deepEqual(done.results, ['zz_gone: deleted', 'nobody: not found']);
  s.stop(); fs.rmSync(dir, { recursive: true, force: true });
});

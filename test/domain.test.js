// Custom domain: old hostnames 301 to https://buffalobillsacademy.com, keeping path + query.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.js';

async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-dom-'));
  const { app, shutdown } = createApp({ dataDir, devLogin: false, env: { PUBLIC_URL: 'https://buffalobillsacademy.com', REDIRECT_HOSTS: 'async-poker-tyler.fly.dev' } });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  // node:http (not fetch) so the Host header can be set like a real browser/proxy would.
  const get = (p, headers) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: { get: (k) => res.headers[k] }, json: async () => JSON.parse(body) }));
    }).on('error', reject);
  });
  return { get, stop: () => { server.close(); shutdown?.(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('old hosts 301 to the apex, keeping path and query', async (t) => {
  const s = await boot(); t.after(s.stop);
  for (const host of ['async-poker-tyler.fly.dev', 'www.buffalobillsacademy.com', 'WWW.BuffaloBillsAcademy.com']) {
    const r = await s.get('/t/ABC123?x=1&y=two', { Host: host });
    assert.equal(r.status, 301, host);
    assert.equal(r.headers.get('location'), 'https://buffalobillsacademy.com/t/ABC123?x=1&y=two');
  }
  const viaProxy = await s.get('/privacy', { Host: '172.16.0.2:8080', 'X-Forwarded-Host': 'async-poker-tyler.fly.dev' });
  assert.equal(viaProxy.status, 301, 'honours X-Forwarded-Host from the proxy');
  assert.equal(viaProxy.headers.get('location'), 'https://buffalobillsacademy.com/privacy');
});

test('the apex, internal addresses and health checks are never redirected (no loops)', async (t) => {
  const s = await boot(); t.after(s.stop);
  assert.equal((await s.get('/privacy', { Host: 'buffalobillsacademy.com' })).status, 200);
  assert.equal((await s.get('/privacy', { Host: 'buffalobillsacademy.com', 'X-Forwarded-Proto': 'https' })).status, 200);
  assert.equal((await s.get('/privacy', { Host: '172.16.0.2:8080' })).status, 200, 'Fly internal check address');
  for (const p of ['/api/health', '/healthz']) {
    const r = await s.get(p, { Host: 'async-poker-tyler.fly.dev' });
    assert.equal(r.status, 200, p);
    assert.equal((await r.json()).ok, true);
  }
});

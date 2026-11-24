// The SPA shell names each deploy's hashed bundles: it must never be cached (iOS Safari/Chrome
// would otherwise keep loading an old deploy's JS), while real static files keep normal caching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.js';

const NO_CACHE = 'no-cache, no-store, must-revalidate';

test('SPA index.html is never cached; static assets still serve normally', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-nocache-'));
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-nocache-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>BBA</title><script type="module" src="/assets/index-abc123.js"></script><div id="root"></div>');
  fs.mkdirSync(path.join(staticDir, 'assets'));
  fs.writeFileSync(path.join(staticDir, 'assets', 'index-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(staticDir, 'og.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(staticDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.mkdirSync(path.join(staticDir, 'elhalo'));
  fs.writeFileSync(path.join(staticDir, 'elhalo', 'thumb.webp'), 'webp');
  const { app, shutdown } = createApp({ dataDir, staticDir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => new Promise((res, rej) => http.get(base + p, (r) => { const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString() })); }).on('error', rej));

  for (const p of ['/', '/barn/gym', '/barn?room=gym', '/elhalo', '/elhalo/', '/index.html', '/some/deep/route']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], /text\/html/, p);
    assert.equal(r.headers['cache-control'], NO_CACHE, p);
    assert.equal(r.headers.pragma, 'no-cache', p);
    assert.match(r.body, /index-abc123\.js/, p);
  }

  for (const [p, type, body] of [
    ['/assets/index-abc123.js', /javascript/, 'console.log(1)'],
    ['/og.png', /image\/png/, null],
    ['/favicon.svg', /image\/svg\+xml/, null],
    ['/elhalo/thumb.webp', /image\/webp/, 'webp'],
  ]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], type, p);
    assert.match(r.headers['cache-control'], /max-age=\d+/, p);
    assert.doesNotMatch(r.headers['cache-control'], /no-store/, p);
    if (body) assert.equal(r.body, body, p);
  }
});

test('client reloads once into a new build on vite:preloadError, guarded against loops', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'client/src/main.jsx'), 'utf8');
  assert.match(src, /addEventListener\('vite:preloadError'/);
  assert.match(src, /sessionStorage/);
  assert.match(src, /30000/);
});

// v27 mine door: only the free Freedoom data ships (no id Software WADs), licence files, and the gzip route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOOM = path.join(ROOT, 'client/public/doom');
const FREEDOOM_MD5 = 'b93be13d05148dd01614bc205a03648e'; // Freedoom: Phase 1 v0.13.0, unmodified

test('only Freedoom ships (no id Software WADs), unmodified, with its licence and notices', () => {
  const wads = fs.readdirSync(DOOM, { recursive: true }).filter((f) => /\.wad$/i.test(f));
  assert.deepEqual(wads, ['freedoom1.wad']);
  const wad = fs.readFileSync(path.join(DOOM, 'freedoom1.wad'));
  assert.equal(crypto.createHash('md5').update(wad).digest('hex'), FREEDOOM_MD5);
  assert.equal(wad.subarray(0, 4).toString(), 'IWAD');
  for (const f of ['FREEDOOM-COPYING.txt', 'FREEDOOM-CREDITS.txt', 'COPYING-GPL2.txt', 'NOTICE.txt', 'source/index.html', 'bba.cfg']) assert.ok(fs.existsSync(path.join(DOOM, f)), f);
  const src = fs.readdirSync(path.join(DOOM, 'source'));
  assert.ok(src.some((f) => /^doom-wasm-[0-9a-f]+\.tar\.gz$/.test(f)), 'corresponding source archive');
  const notice = fs.readFileSync(path.join(DOOM, 'NOTICE.txt'), 'utf8');
  assert.match(notice, /GPL/); assert.match(notice, /BSD/); assert.match(notice, new RegExp(FREEDOOM_MD5));
});

test('the launcher never uploads a WAD and the room makes no mine API calls', () => {
  const js = fs.readFileSync(path.join(DOOM, 'play.js'), 'utf8');
  assert.doesNotMatch(js, /method\s*:\s*['"](POST|PUT|PATCH)/i);
  assert.doesNotMatch(js, /\/api\//);
  assert.doesNotMatch(js, /XMLHttpRequest|sendBeacon|FormData/);
  const room = fs.readFileSync(path.join(ROOT, 'client/src/mines/DoomRoom.jsx'), 'utf8');
  assert.doesNotMatch(room, /\/api\//);
});

test('the door is client-only: the mine server knows nothing about it', () => {
  const mines = fs.readFileSync(path.join(ROOT, 'server/mines.js'), 'utf8');
  assert.doesNotMatch(mines, /doom/i);
});

test('/doom game files: gzip once, size hint, ETag/304, fixed allowlist', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-doom-'));
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-doom-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>x</title>');
  fs.mkdirSync(path.join(staticDir, 'doom'));
  const wasm = Buffer.alloc(50000, 7); wasm.write('\0asm', 0);
  fs.writeFileSync(path.join(staticDir, 'doom', 'websockets-doom.wasm'), wasm);
  fs.writeFileSync(path.join(staticDir, 'doom', 'secret.txt'), 'nope');
  const { app, shutdown } = createApp({ dataDir, staticDir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const http = (await import('node:http'));
  const get = (p, headers = {}) => new Promise((res, rej) => http.get(base + p, { headers }, (r) => { const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) })); }).on('error', rej));

  const r = await get('/doom/websockets-doom.wasm', { 'accept-encoding': 'gzip, br' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.equal(r.headers['content-type'], 'application/wasm');
  assert.equal(r.headers['x-bba-size'], String(wasm.length));
  assert.ok(r.body.length < wasm.length);
  assert.deepEqual(zlib.gunzipSync(r.body), wasm);
  assert.ok(r.headers.etag);
  assert.equal((await get('/doom/websockets-doom.wasm', { 'accept-encoding': 'gzip', 'if-none-match': r.headers.etag })).status, 304);
  // no gzip accepted: plain static file
  const plain = await get('/doom/websockets-doom.wasm', { 'accept-encoding': 'identity' });
  assert.equal(plain.status, 200); assert.equal(plain.headers['content-encoding'], undefined); assert.deepEqual(plain.body, wasm);
  // names outside the allowlist are never gzip-cached; traversal does not escape
  const other = await get('/doom/secret.txt', { 'accept-encoding': 'gzip' });
  assert.equal(other.headers['x-bba-size'], undefined);
  const trav = await get('/doom/..%2Fpackage.json', { 'accept-encoding': 'gzip' });
  assert.equal(trav.headers['x-bba-size'], undefined);
  assert.doesNotMatch(trav.body.toString(), /"dependencies"/);
  // missing allowlisted file falls through (SPA index, never a crash)
  const miss = await get('/doom/freedoom1.wad', { 'accept-encoding': 'gzip' });
  assert.equal(miss.headers['x-bba-size'], undefined);
});

test('v27b: the door drops straight into E1M1: no launcher, no PLAY button, no file picker, no WAD or computer wording', () => {
  const html = fs.readFileSync(path.join(DOOM, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(DOOM, 'play.js'), 'utf8');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /computer|\bwad\b|bring|own file/i);
  assert.doesNotMatch(html, /type=["']?file|data-test=["']?doom-(play|byo)/i);
  assert.doesNotMatch(js, /FileReader|arrayBuffer\(\)\.then|files\[0\]|iwadName/);
  assert.match(js, /'-warp', '1', '1'/); assert.match(js, /'-skill', '2'/);
  assert.match(html, /Credits &amp; licences/); assert.match(html, /GPL-2\.0/);
  assert.doesNotMatch(fs.readFileSync(path.join(DOOM, 'NOTICE.txt'), 'utf8'), /choose it from their own device/);
});

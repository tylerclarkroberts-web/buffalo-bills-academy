// v89 Hall of Doors: the mine door opens a hall; Doom and Nanosaur are open, the rest locked. Nanosaur ships as the
// unmodified upstream WebAssembly build with its licence and credits, gzipped at build time and streamed from disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { HALL_DOORS, LOCKED_LINES } from '../client/src/mines/doorHall.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const NANO = path.join(ROOT, 'client/public/nanosaur');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the hall: Doom and Nanosaur open, a row of distinct locked doors', () => {
  const ids = HALL_DOORS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(HALL_DOORS.filter((d) => d.open).map((d) => d.id), ['doom', 'nanosaur']);
  const locked = HALL_DOORS.filter((d) => !d.open);
  assert.ok(locked.length >= 4 && locked.length <= 8, `${locked.length} locked doors`);
  assert.equal(new Set(HALL_DOORS.map((d) => d.style)).size, HALL_DOORS.length, 'every door has its own look');
  assert.ok(LOCKED_LINES.length >= 3);
  const css = src('client/src/mines/mines.css');
  for (const d of HALL_DOORS) assert.match(css, new RegExp(`\\.s-${d.style}\\s*\\{`), `style for ${d.id}`);
});

test('the mine door opens the hall; locked doors only rattle; nothing in here talks to the mine', () => {
  const mines = src('client/src/mines/Mines.jsx');
  assert.match(mines, /<DoorHall elapsedMs=\{elapsed\} onExit=\{closeDoor\} \/>/);
  assert.doesNotMatch(mines, /<DoomRoom/);
  const hall = src('client/src/mines/DoorHall.jsx');
  assert.match(hall, /d\.open \? onOpen\(d\.id\) : onLocked\(d\.id\)/);
  assert.doesNotMatch(hall, /location\.(href|assign)|navigate\(|<a\s|href=/);
  for (const f of ['client/src/mines/DoorHall.jsx', 'client/src/mines/NanosaurRoom.jsx', 'client/public/nanosaur/play.js', 'client/public/nanosaur/webgl-fixes.js']) {
    assert.doesNotMatch(src(f), /\/api\//, f);
  }
  assert.doesNotMatch(src('client/public/nanosaur/play.js'), /method\s*:\s*['"](POST|PUT|PATCH)|sendBeacon|XMLHttpRequest/);
  assert.doesNotMatch(src('server/mines.js'), /nanosaur|hall/i, 'the mine server knows nothing about the hall');
  // Doom itself is unchanged apart from where its exit button leads
  assert.match(src('client/src/mines/DoomRoom.jsx'), /exitLabel = '◄ EXIT TO THE MINE'/);
  assert.match(hall, /exitLabel="◄ BACK TO THE HALL"/);
});

test('Nanosaur: unmodified upstream build, licence and credits shipped, no cheat menu or file upload', () => {
  const notice = fs.readFileSync(path.join(NANO, 'NOTICE.txt'), 'utf8');
  for (const f of ['Nanosaur.data', 'Nanosaur.js', 'Nanosaur.wasm']) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(NANO, f))).digest('hex');
    assert.match(notice, new RegExp(`${hash}  ${f.replace('.', '\\.')}`), `${f} hash recorded in NOTICE`);
  }
  assert.equal(fs.readFileSync(path.join(NANO, 'Nanosaur.wasm')).subarray(0, 4).toString('latin1'), '\0asm');
  assert.match(notice, /Pangea Software/); assert.match(notice, /Iliyas Jorio/); assert.match(notice, /Lachlan Wright/); assert.match(notice, /CC BY-NC-SA 4\.0/);
  assert.match(fs.readFileSync(path.join(NANO, 'LICENSE-CC-BY-NC-SA-4.0.md'), 'utf8'), /Attribution-NonCommercial-ShareAlike 4\.0/);
  const html = fs.readFileSync(path.join(NANO, 'index.html'), 'utf8');
  assert.match(html, /Credits &amp; licence/); assert.match(html, /Pangea Software/); assert.match(html, /Jorio/); assert.match(html, /Lachlan Wright/); assert.match(html, /CC BY-NC-SA 4\.0/);
  assert.doesNotMatch(html, /type=["']?file|Cheat|doCheat|terrain-file/i);
  assert.ok(html.indexOf('webgl-fixes.js') < html.indexOf('play.js'));
});

test('webgl-fixes: Mac-style BGRA textures become RGBA bytes', () => {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(NANO, 'webgl-fixes.js'), 'utf8'), { window: win });
  const conv = win.__bbaToRGBA;
  // 1-5-5-5 REV: A R G B from the top bit down. 2x1 pixels: opaque pure red, transparent pure blue
  const heap = new ArrayBuffer(16); const u16 = new Uint16Array(heap, 4, 2); u16[0] = 0x8000 | (31 << 10); u16[1] = 31;
  assert.deepEqual([...conv(u16, 2, 1, 0x8366, 0, false)], [255, 0, 0, 255, 0, 0, 255, 0]);
  assert.deepEqual([...conv(u16, 2, 1, 0x8366, 0, true)].slice(4), [0, 0, 255, 255], 'RGB textures ignore the alpha bit');
  // 8-8-8-8 (little-endian memory A R G B), with a row length wider than the upload
  const h2 = new ArrayBuffer(64); const b = new Uint8Array(h2); b.set([200, 10, 20, 30, 1, 2, 3, 4, 9, 9, 9, 9, 100, 40, 50, 60], 8);
  const view = new Uint16Array(h2, 8, 1);
  assert.deepEqual([...conv(view, 1, 2, 0x8035, 3, false)], [10, 20, 30, 200, 40, 50, 60, 100]);
  // 8-8-8-8 REV (memory B G R A)
  assert.deepEqual([...conv(view, 1, 1, 0x8367, 0, false)], [20, 10, 200, 30]);
});

test('vite precompresses the Nanosaur files', () => {
  const cfg = src('vite.config.js');
  assert.match(cfg, /NANO_PRECOMPRESS = \['Nanosaur\.data', 'Nanosaur\.wasm', 'Nanosaur\.js'\]/);
  assert.match(cfg, /createGzip/);
});

test('/nanosaur game files: precompressed .gz streamed from disk, size hint, ETag/304, fixed allowlist', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-nano-'));
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-nano-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>x</title>');
  const nd = path.join(staticDir, 'nanosaur'); fs.mkdirSync(nd);
  const data = crypto.randomBytes(30000); const wasm = Buffer.alloc(40000, 3); wasm.write('\0asm', 0);
  fs.writeFileSync(path.join(nd, 'Nanosaur.data'), data); fs.writeFileSync(path.join(nd, 'Nanosaur.data.gz'), zlib.gzipSync(data));
  fs.writeFileSync(path.join(nd, 'Nanosaur.wasm'), wasm); // no .gz: falls through to the plain file
  fs.writeFileSync(path.join(nd, 'secret.txt'), 'nope'); fs.writeFileSync(path.join(nd, 'secret.txt.gz'), zlib.gzipSync('nope'));
  const { app, shutdown } = createApp({ dataDir, staticDir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const http = await import('node:http');
  const req = (p, headers = {}, method = 'GET') => new Promise((res, rej) => { const r0 = http.request(base + p, { headers, method }, (r) => { const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) })); }); r0.on('error', rej); r0.end(); });

  const r = await req('/nanosaur/Nanosaur.data?v=1', { 'accept-encoding': 'gzip, br' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.equal(r.headers['content-type'], 'application/octet-stream');
  assert.equal(r.headers['x-bba-size'], String(data.length));
  assert.deepEqual(zlib.gunzipSync(r.body), data);
  assert.ok(r.headers.etag);
  assert.equal((await req('/nanosaur/Nanosaur.data', { 'accept-encoding': 'gzip', 'if-none-match': r.headers.etag })).status, 304);
  const head = await req('/nanosaur/Nanosaur.data', { 'accept-encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['x-bba-size'], String(data.length));
  const plain = await req('/nanosaur/Nanosaur.data', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined); assert.deepEqual(plain.body, data);
  const w = await req('/nanosaur/Nanosaur.wasm', { 'accept-encoding': 'gzip' });
  assert.equal(w.status, 200); assert.equal(w.headers['x-bba-size'], undefined); assert.deepEqual(w.body, wasm);
  const other = await req('/nanosaur/secret.txt', { 'accept-encoding': 'gzip' });
  assert.equal(other.headers['content-encoding'], undefined);
  const trav = await req('/nanosaur/..%2Fpackage.json', { 'accept-encoding': 'gzip' });
  assert.equal(trav.headers['x-bba-size'], undefined);
  assert.doesNotMatch(trav.body.toString(), /"dependencies"/);
});

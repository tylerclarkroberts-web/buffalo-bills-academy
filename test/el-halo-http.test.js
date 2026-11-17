// EL HALO over real HTTP: sign-in required, two players join one match, the stream carries the live snapshot plus
// "me", late joiners see the other player, inputs are validated and rate limited, and nobody's bankroll moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

function client(base, token) {
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}
// open the SSE stream and collect parsed frames
async function stream(base, token) {
  const ac = new AbortController();
  const r = await fetch(base + '/elhalo/stream', { headers: { authorization: `Bearer ${token}` }, signal: ac.signal });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const frames = []; let buf = '';
  (async () => {
    const dec = new TextDecoder();
    try { for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); const d = block.split('\n').find((l) => l.startsWith('data: ')); if (d) frames.push(JSON.parse(d.slice(6))); } } } catch { /* closed */ }
  })();
  const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const f = frames.findLast?.(fn) ?? [...frames].reverse().find(fn); if (f) return f; await new Promise((res) => setTimeout(res, 30)); } return null; };
  return { frames, until, close: () => ac.abort() };
}

test('El Halo horde over HTTP', { timeout: 30000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-elhalo-'));
  const { app, service, elhalo } = createApp({ dataDir, env: { ...process.env, ELHALO_TICK_MS: '50' } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const streams = [];
  t.after(async () => { for (const s of streams) s.close(); elhalo?.shutdown(); service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const anon = client(base);
  assert.equal((await anon.post('/elhalo/join')).status, 401, 'sign in first');
  const mk = async (name) => { const r = await anon.post('/players', { name }); return { ...r.body, api: client(base, r.body.token) }; };
  const ty = await mk('Tyler'), joe = await mk('Joe');
  const bank = (await ty.api.get('/me')).body.bankroll;

  const sT = await stream(base, ty.token); streams.push(sT);
  assert.ok(await sT.until((f) => f.s && f.me && f.me.in === false), 'spectating before joining');
  // his look: the default until he picks one, then saved on his profile (junk is cleaned up)
  assert.deepEqual((await ty.api.get('/elhalo/look')).body.look, [0, 0, 0, 0, 1, 0, 0]);
  const LOOK = [2, 1, 3, 1, 2, 4, 2];
  assert.deepEqual((await ty.api.post('/elhalo/look', { look: LOOK })).body.look, LOOK);
  assert.deepEqual((await ty.api.post('/elhalo/look', { look: [99, -1, 'x'] })).body.look.length, 7, 'junk is clamped');
  await ty.api.post('/elhalo/look', { look: LOOK });
  assert.deepEqual((await ty.api.get('/elhalo/look')).body.look, LOOK);
  const j = await ty.api.post('/elhalo/join');
  assert.equal(j.status, 200); assert.ok(j.body.me.in);
  const f1 = await sT.until((f) => f.s.pl.some((r) => r[1] === 'Tyler') && f.me.in);
  assert.ok(f1, 'Tyler is in the snapshot'); assert.equal(f1.s.ph, 'lobby', 'everyone waits in the lobby first');
  assert.equal(f1.s.pl.find((r) => r[1] === 'Tyler')[19], LOOK.join(''), 'everyone sees his look');
  assert.equal(f1.s.host, ty.id ?? f1.me.id, 'first one in is the host');

  // Joe arrives late and sees Tyler right away
  const sJ = await stream(base, joe.token); streams.push(sJ);
  assert.equal((await joe.api.post('/elhalo/join')).status, 200);
  const f2 = await sJ.until((f) => f.me.in && f.s.pl.some((r) => r[1] === 'Tyler') && f.s.pl.some((r) => r[1] === 'Joe'));
  assert.ok(f2, 'Joe sees both of them'); assert.equal(f2.s.bd.length, 17);
  assert.equal(f2.s.ph, 'lobby');
  // only the host can hit start; everyone ready starts the countdown too
  assert.equal((await joe.api.post('/elhalo/begin')).status, 403);
  assert.equal((await ty.api.post('/elhalo/ready', { ready: true })).body.phase, 'lobby');
  assert.ok(await sJ.until((f) => f.s.pl.find((r) => r[1] === 'Tyler')?.[18] === 1), 'Joe sees Tyler is ready');
  assert.equal((await joe.api.post('/elhalo/ready', { ready: true })).body.phase, 'break', 'all ready: countdown');
  assert.ok(await sJ.until((f) => f.s.ph === 'break' && f.s.cd > 0), 'the countdown is on');

  // inputs: a normal one is fine, junk is harmless, a flood is cut off
  const me = f2.s.pl.find((r) => r[1] === 'Joe');
  assert.equal((await joe.api.post('/elhalo/input', { p: [me[2], me[3], me[4]], yaw: 1 })).status, 200);
  assert.equal((await joe.api.post('/elhalo/input', { p: ['x'], ev: 'junk' })).status, 200);
  let codes = []; for (let k = 0; k < 40; k++) codes.push((await joe.api.post('/elhalo/input', {})).status);
  assert.ok(codes.includes(429), 'rate limited');
  assert.equal((await anon.post('/elhalo/input', {})).status, 401);

  // leaving takes him off Tyler's screen
  assert.equal((await joe.api.post('/elhalo/leave')).status, 200);
  assert.ok(await sT.until((f) => !f.s.pl.some((r) => r[1] === 'Joe' && !(r[7] & 8)) || f.s.ev.some((e) => e[0] === 'l')), 'Joe left');
  assert.equal((await ty.api.get('/me')).body.bankroll, bank, 'free play: bankroll untouched');
  // the look survives a restart (it lives on disk, keyed by player)
  const again = createApp({ dataDir, env: { ...process.env, ELHALO_TICK_MS: '50' } });
  assert.deepEqual(again.elhalo.lookDoc[f1.me.id], LOOK);
  again.elhalo?.shutdown(); again.service.shutdown();
});

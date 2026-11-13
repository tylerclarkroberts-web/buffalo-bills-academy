// Who is at the table right now: seated players whose table page is open and in front, over real HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';

test('seated players with the table in front are marked here; watchers, background pages and closed pages are not', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-here-'));
  const { app, service, shutdown } = createApp({ dataDir, env: {} });
  service.hereGraceMs = 0;
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const streams = [];
  t.after(async () => {
    for (const s of streams) s.close();
    shutdown(); server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const call = async (player, method, route, body) => {
    const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(player ? { authorization: `Bearer ${player.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  };
  const join = async (name) => call(null, 'POST', '/players', { name });
  const ann = await join('Ann'), bob = await join('Bob'), cat = await join('Cat');
  const { code } = await call(ann, 'POST', '/tables', { name: 'Here', settings: { buyIn: 500, smallBlind: 5, bigBlind: 10 } });
  await call(bob, 'POST', `/tables/${code}/join`, {});

  // One table page: its live-update stream, read message by message.
  const page = async (player, query = '') => {
    const stop = new AbortController();
    const res = await fetch(`${base}/tables/${code}/events${query}`, { headers: player ? { authorization: `Bearer ${player.token}` } : {}, signal: stop.signal });
    const reader = res.body.getReader();
    let buffer = '';
    const next = async () => {
      while (!buffer.includes('\n\n')) buffer += new TextDecoder().decode((await reader.read()).value);
      const message = buffer.slice(0, buffer.indexOf('\n\n'));
      buffer = buffer.slice(message.length + 2);
      return JSON.parse(message.replace(/^data: /, ''));
    };
    const s = { next, close: () => stop.abort() };
    streams.push(s);
    assert.equal(typeof (await next()).version, 'number', 'every page still gets the table version first');
    return s;
  };
  const here = async (viewer = cat) => (await call(viewer, 'GET', `/tables/${code}`)).here;
  const until = async (want, message) => {
    for (let i = 0; i < 100; i++) { if (JSON.stringify(await here()) === JSON.stringify(want)) return; await new Promise((r) => setTimeout(r, 20)); }
    assert.deepEqual(await here(), want, message);
  };

  assert.deepEqual(await here(), [], 'nobody has the table open');
  const annPage = await page(ann);
  assert.equal((await annPage.next()).here, true, 'her own page is told, so her own light comes on');
  await until([ann.id]);

  const bobPage = await page(bob);
  assert.equal((await annPage.next()).here, true, 'the others are told to look again');
  await until([ann.id, bob.id]);
  assert.deepEqual(await here(null), [ann.id, bob.id], 'anyone who can see the table sees who is at it');

  await page(cat);
  await page(null);
  await page(bob, '?away');
  assert.deepEqual(await here(), [ann.id, bob.id], 'a watcher, a stranger and a background page change nothing');

  const second = await page(bob);
  bobPage.close();
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(await here(), [ann.id, bob.id], 'Bob still has one page in front');
  second.close();
  await until([ann.id], 'Bob put the table away; his background page does not count');
  assert.equal((await annPage.next()).here, true);

  await call(cat, 'POST', `/tables/${code}/join`, {});
  await until([ann.id, cat.id], 'a watcher with the table open counts as soon as they sit down');
});

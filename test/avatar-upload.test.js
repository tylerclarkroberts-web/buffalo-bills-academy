import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { SKIN_TONES } from '../server/engine/avatar-appearance.js';
import { buildHead, OUT_W, OUT_H } from '../client/src/avatar/facepoly.js';

function renderedHead() {
  const data = new Uint8ClampedArray(OUT_W * OUT_H * 4), alpha = new Uint8ClampedArray(OUT_W * OUT_H);
  for (let y = 0; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    const kept = x >= 70 && x < 170 && y >= 45 && y < 245 && !(x >= 114 && x < 126 && y >= 125 && y < 140);
    data.set(kept ? [200, 140, 90, 255] : [11, 244, 35, 255], i * 4);
    alpha[i] = kept ? 255 : 0;
  }
  const head = buildHead({ width: OUT_W, height: OUT_H, data }, alpha);
  const png = PNG.sync.write({ width: head.width, height: head.height, data: Buffer.from(head.pixels) });
  return { body: { kind: 'photo', png: 'data:image/png;base64,' + png.toString('base64') }, png, alpha };
}

async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-avatar-'));
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, env: {} });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const login = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Avatar Preview', email: 'avatar@example.com' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (method, url, body, signedIn = true) => fetch(base + url, {
    method, headers: { 'content-type': 'application/json', ...(signedIn ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const me = await (await request('GET', '/api/me')).json();
  return { service, dataDir, request, id: me.id };
}

test('a processed transparent head PNG round-trips through the existing avatar API', async (t) => {
  const { service, dataDir, request, id } = await fixture(t);
  const { body, png, alpha } = renderedHead();
  const saved = await request('POST', '/api/me/avatar', body);
  assert.equal(saved.status, 200); assert.equal((await saved.json()).avatar.kind, 'photo');
  const image = await request('GET', '/api/avatars/' + id + '.png');
  assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /^image\/png/);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.deepEqual(bytes, png);
  const decoded = PNG.sync.read(bytes);
  assert.equal(decoded.width, OUT_W); assert.equal(decoded.height, OUT_H);
  assert.equal(decoded.data[(180 * OUT_W + 120) * 4 + 3], 255, 'head stays visible');
  for (let i = 0; i < alpha.length; i++) if (!alpha[i]) assert.equal(decoded.data[i * 4 + 3], 0, 'removed background and the edited hole remain transparent');
  const avatar = service.store.players[id].avatar;
  assert.equal(typeof avatar.v, 'number'); assert.deepEqual(Object.keys(avatar).sort(), ['kind', 'v']);
  const me = await (await request('GET', '/api/me')).json();
  assert.equal(me.hasAvatar, true); assert.equal(me.avatar.kind, 'photo');
  assert.deepEqual(fs.readFileSync(path.join(dataDir, 'avatars', id + '.png')), png);
});

test('invalid PNGs and unsigned avatar replacements preserve the previous image and metadata', async (t) => {
  const { service, request, id } = await fixture(t);
  const { body, png } = renderedHead();
  assert.equal((await request('POST', '/api/me/avatar', body)).status, 200);
  const previous = structuredClone(service.store.players[id].avatar);
  const invalid = await request('POST', '/api/me/avatar', { kind: 'photo', png: 'data:image/png;base64,aW52YWxpZA==' });
  assert.equal(invalid.status, 400);
  assert.equal((await request('POST', '/api/me/avatar', { kind: 'gen', seed: 'unsigned replacement' }, false)).status, 401);
  assert.deepEqual(service.store.players[id].avatar, previous);
  const image = await request('GET', '/api/avatars/' + id + '.png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
});

test('skin tone survives face changes and is optional for both new and existing avatars', async (t) => {
  const { request, id, dataDir } = await fixture(t);
  const tone = SKIN_TONES[3], changed = SKIN_TONES[5], endpoint = '/api/me/avatar/skin-tone';
  const { body, png } = renderedHead();
  const setTone = (skinTone) => request('POST', endpoint, { skinTone });
  const me = async () => (await request('GET', '/api/me')).json();
  assert.equal((await setTone(tone)).status, 200);
  assert.equal((await me()).hasAvatar, false, 'skin alone does not complete face setup');
  assert.deepEqual((await me()).avatar, { kind: 'gen', seed: id, skinTone: tone });
  const gen = await (await request('POST', '/api/me/avatar', { kind: 'gen', seed: 'kept-seed' })).json();
  assert.deepEqual(gen.avatar, { kind: 'gen', seed: 'kept-seed', skinTone: tone });
  assert.equal((await setTone(changed)).status, 200);
  assert.equal((await me()).avatar.seed, 'kept-seed');
  const photo = await (await request('POST', '/api/me/avatar', { ...body, skinTone: tone })).json();
  assert.equal(photo.avatar.skinTone, tone);
  const updated = await (await setTone(changed)).json();
  assert.deepEqual(updated.avatar, { ...photo.avatar, skinTone: changed }, 'photo version stays put');
  assert.equal((await request('POST', endpoint, { skinTone: null }, false)).status, 401);
  assert.equal((await request('POST', endpoint, {})).status, 400);
  assert.equal((await setTone('#ffffff')).status, 400);
  assert.equal((await request('POST', '/api/me/avatar', { kind: 'gen', seed: 'other', skinTone: {} })).status, 400);
  assert.equal((await request('POST', '/api/me/avatar', { kind: 'photo', png: 'invalid', skinTone: null })).status, 400);
  assert.deepEqual((await me()).avatar, updated.avatar);
  assert.deepEqual(Buffer.from(await (await request('GET', '/api/avatars/' + id + '.png')).arrayBuffer()), png);
  const profile = await (await request('GET', '/api/players/' + id + '/profile', undefined, false)).json();
  assert.deepEqual(profile.avatar, updated.avatar);
  const savedPlayer = JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8'))[id];
  assert.equal(savedPlayer.skinTone, changed);
  assert.deepEqual((await (await setTone(null)).json()).avatar, { kind: 'photo', v: photo.avatar.v });
});

test('other miners and a seated poker table receive the current tone', async (t) => {
  const { request, service, id } = await fixture(t);
  const table = await (await request('POST', '/api/tables', { name: 'Test table' })).json();
  const v = { rulesVersion: 2 }, shift = await (await request('POST', '/api/mines/start', v)).json();
  await request('POST', '/api/mines/pvp/tick', { ...v, shiftId: shift.shiftId, x: 1, y: 1, yaw: 0 });
  const tone = SKIN_TONES[2];
  const skin = await (await request('POST', '/api/me/avatar/skin-tone', { skinTone: tone })).json();
  const tableView = await (await request('GET', '/api/tables/' + table.code)).json();
  assert.deepEqual(tableView.avatars[id], skin.avatar);
  const other = service.getPlayer(service.createPlayer('Second miner').id);
  const visit = service.mines.start(other, v);
  const tick = service.pvp.tick(other, { ...v, shiftId: visit.shiftId, x: 1, y: 1, yaw: 0 });
  assert.deepEqual(tick.others.find(miner => miner.id === id).avatar, skin.avatar);
});

test('a failed skin tone save keeps the prior preference on the live player', async (t) => {
  const { service, id } = await fixture(t);
  const player = service.store.players[id], tone = SKIN_TONES[3];
  const save = service.store.savePlayers.bind(service.store);
  const fail = () => { throw new Error('player file write failed'); };
  service.store.savePlayers = fail;
  assert.throws(() => service.avatars.setSkinTone(player, tone), /write failed/);
  assert.equal(Object.hasOwn(player, 'skinTone'), false);
  service.store.savePlayers = save;
  service.avatars.setSkinTone(player, tone);
  service.store.savePlayers = fail;
  assert.throws(() => service.avatars.setSkinTone(player, null), /write failed/);
  assert.equal(service.avatars.info(player).skinTone, tone);
  assert.equal(service.store.players[id], player);
  service.store.savePlayers = save;
});

test('merging an account keeps the destination tone or brings over the source preference', async (t) => {
  const { service } = await fixture(t);
  const first = { skinTone: SKIN_TONES[0] }, kept = { skinTone: SKIN_TONES[1] };
  service.avatars.move(first, kept);
  assert.equal(kept.skinTone, SKIN_TONES[1]);
  const unconfigured = {};
  service.avatars.move(first, unconfigured);
  assert.deepEqual(unconfigured, first);
});

// Wanted-poster shame: count, cooldowns, kill switch, no Slack during tests, sample PNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createApp } from '../server/app.js';
import { shameDecision, wantedCaption, SHAME_MIN, SHAME_COOLDOWN_MS, envWantedEnabled, resolveChannel } from '../server/wanted.js';
import { listShameTurns, listTurns, holdemSource } from '../server/turns.js';
import { tableHasBots } from '../server/slack.js';
import { CRIME, PUNISHMENT, JUTSU, SAMPLE_NAME, wantedSvg, sampleWantedPoster } from '../server/wantedPoster.js';

test('the poster copy keeps the parody line and an original jutsu nod, no official Naruto marks', () => {
  assert.equal(CRIME, 'Making everyone else wait');
  assert.equal(PUNISHMENT, 'One Thousand Years of Pain');
  assert.equal(JUTSU, 'Leaf Village Secret Finger Jutsu');
  const svg = wantedSvg({ name: SAMPLE_NAME, sample: true });
  assert.match(svg, /WANTED/);
  assert.match(svg, /CRIME: Making everyone else wait/);
  assert.match(svg, /PUNISHMENT:/);
  assert.match(svg, /One Thousand Years of Pain/);
  assert.match(svg, /Leaf Village Secret Finger Jutsu/);
  assert.match(svg, /BUFFALO BILL'S ACADEMY/);
  assert.equal(SAMPLE_NAME, 'Cal Hick');
  assert.doesNotMatch(svg, /naruto|masashi|kishimoto|sennen|shippuden|konoha|akatsuki| rasengan|sharing an/i);
  assert.match(wantedCaption('Cal Hick'), /WANTED: Cal Hick/);
});

test('shameDecision: one poster per streak, re-arm below 4, at most one per 12h', () => {
  const t0 = 1_000_000;
  const first = shameDecision({ lastAt: 0, streak: false }, { count: SHAME_MIN, now: t0 });
  assert.equal(first.post, true);
  assert.deepEqual(first.next, { lastAt: t0, streak: true });
  const same = shameDecision(first.next, { count: 6, now: t0 + 60_000 });
  assert.equal(same.post, false, 'same streak does not post again');
  const below = shameDecision(same.next, { count: 3, now: t0 + 120_000 });
  assert.equal(below.post, false);
  assert.equal(below.next.streak, false, 'dropping below 4 re-arms');
  const tooSoon = shameDecision(below.next, { count: 4, now: t0 + 120_000 });
  assert.equal(tooSoon.post, false, '12h cooldown still holds after re-arm');
  assert.equal(tooSoon.next.streak, true);
  const later = shameDecision({ lastAt: t0, streak: false }, { count: 4, now: t0 + SHAME_COOLDOWN_MS });
  assert.equal(later.post, true);
  assert.equal(shameDecision({ lastAt: 0, streak: false }, { count: 3, now: t0 }).post, false);
});

test('env kill switch and empty default channel', () => {
  assert.equal(envWantedEnabled({}), true);
  assert.equal(envWantedEnabled({ SLACK_WANTED_POSTERS: '0' }), false);
  assert.equal(envWantedEnabled({ SLACK_WANTED_POSTERS: 'off' }), false);
  assert.equal(resolveChannel({ channel: '' }, {}), '');
  assert.equal(resolveChannel({ channel: '' }, { SLACK_ACADEMY_CHANNEL: '#academy' }), '#academy');
  assert.equal(resolveChannel({ channel: 'C123' }, { SLACK_ACADEMY_CHANNEL: '#academy' }), 'C123');
});

function holdTable({ code, toAct = 0, playerId = 'ann', bots = false, seats } = {}) {
  return {
    code, name: code, status: 'open',
    bots: !!bots,
    settings: { turnSeconds: 100, bots: bots ? 1 : 0 },
    seats: seats || [{ playerId, sittingOut: false }, { playerId: 'pal', sittingOut: false }],
    hand: { toAct, deadline: 50_000, startedAt: 10_000 },
  };
}

test('listShameTurns uses the Up Next notion: no blackjack, no bot tables, no sweep fakes', () => {
  const player = { id: 'ann' };
  const tables = [
    holdTable({ code: 'H1', playerId: 'ann' }),
    holdTable({ code: 'H2', playerId: 'ann' }),
    holdTable({ code: 'BOT', playerId: 'ann', bots: true }),
  ];
  const service = { store: { allTables: () => tables, getTable: (c) => tables.find((x) => x.code === c) } };
  const bj = { doc: { tables: { B1: { code: 'B1', name: 'Felt', status: 'playing', seats: [{ id: 'ann', left: false }], turnSec: 100, round: { phase: 'play', turn: 0, deadline: 40_000, hands: [{ seat: 0, done: false }] } } } } };
  assert.ok(listTurns({ player, service, bj, now: 20_000 }).some((r) => r.code === 'H1'));
  assert.ok(!listTurns({ player, service, bj, now: 20_000 }).some((r) => r.code === 'B1'));
  const shame = listShameTurns({ player, service, now: 20_000, tableHasBots });
  assert.deepEqual(shame.map((r) => r.code).sort(), ['H1', 'H2']);
  assert.ok(!shame.some((r) => r.code === 'BOT' || r.code === 'B1'));
});

test('the sample poster is a real PNG and does not call Slack', () => {
  const png = sampleWantedPoster({ name: SAMPLE_NAME });
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 4000, `poster too small: ${png.length}`);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

const OWNER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'xoxb-test-not-real';

function mockSlack() {
  const m = { calls: [], uploads: [], channelPosts: [], bodies: [] };
  m.fetch = async (url, init) => {
    if (String(url).includes('https://files.example/upload')) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    const u = new URL(url);
    const method = u.pathname.replace('/api/', '');
    const body = init.body && String(init.headers?.['content-type'] || '').includes('json') ? JSON.parse(init.body) : {};
    m.calls.push({ method, body });
    const res = (json) => ({ status: 200, ok: true, json: async () => json });
    if (method === 'users.lookupByEmail') return res({ ok: false, error: 'users_not_found' });
    if (method === 'files.getUploadURLExternal') return res({ ok: true, upload_url: 'https://files.example/upload', file_id: 'F1' });
    if (method === 'files.completeUploadExternal') {
      m.uploads.push({ channel: body.channel_id, comment: body.initial_comment, title: body.files?.[0]?.title });
      return res({ ok: true, files: [{ id: 'F1' }] });
    }
    if (method === 'chat.postMessage') {
      m.channelPosts.push({ channel: body.channel, text: body.text });
      return res({ ok: true, ts: '1' });
    }
    return res({ ok: false, error: 'unknown_method' });
  };
  return m;
}

async function boot(t, { env = {}, slackFetch } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-wanted-'));
  const clock = { t: 2_000_000 };
  const { app, service, shutdown } = createApp({
    dataDir, now: () => clock.t, devLogin: true,
    env: { BJ_TICK_MS: '0', SCUM_TICK_MS: '0', SLACK_BOT_TOKEN: TOKEN, SLACK_ACADEMY_CHANNEL: '#academy', ...env },
    slackFetch, slackRetryMs: 1, slackSendRetryMs: [],
  });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(async () => {
    await service.wanted?.idle?.();
    await service.slack?.idle?.();
    shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { service, clock, base: `http://127.0.0.1:${server.address().port}`, dataDir };
}

function agent(base) {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null; try { json = JSON.parse(buf.toString()); } catch { /* png */ }
    return { status: r.status, body: json, buf, type: r.headers.get('content-type') };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b) };
}

test('a player on turn in 4 human-only holdem tables gets one poster, not a second, and not when killed', async (t) => {
  const slack = mockSlack();
  const s = await boot(t, { slackFetch: slack.fetch });
  const pal = s.service.store.players;
  // Create the actor through the service after a guest... easier: plant two players and 4 tables.
  const ann = { id: 'ann-wanted', name: 'Ann Wait', createdAt: 1, bankroll: 5000, txns: [] };
  const bob = { id: 'bob-wanted', name: 'Bob Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.players[bob.id] = bob;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    const code = `W${i}AAA`.slice(0, 6);
    const t = {
      code, name: `Wait ${i}`, status: 'open', hostId: bob.id,
      settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
      seats: [{ playerId: ann.id, sittingOut: false, name: 'Ann' }, { playerId: bob.id, sittingOut: false, name: 'Bob' }],
      hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
    };
    s.service.store.saveTable(t);
  }
  assert.equal(s.service.wanted.countFor(ann, s.clock.t), 4);
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 1, JSON.stringify(slack.calls.map((c) => c.method)));
  assert.match(slack.uploads[0].comment, /Ann Wait/);
  assert.match(slack.uploads[0].comment, /One Thousand Years of Pain/);
  assert.equal(slack.uploads[0].channel, '#academy');
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 1, 'same streak does not post again');

  // Kill switch: no further posts even after dropping below 4 and waiting 12h
  const before = slack.uploads.length;
  s.service.wanted.setConfig({ enabled: false });
  // clear streak as if they acted, then re-offend after cooldown
  const rec = s.service.wanted.state.players[ann.id];
  rec.streak = false;
  rec.lastAt = s.clock.t - SHAME_COOLDOWN_MS;
  s.service.wanted.save();
  s.clock.t += SHAME_COOLDOWN_MS;
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, before);
});

test('bot tables and blackjack do not trigger a poster, and no Slack is sent without a channel', async (t) => {
  const slack = mockSlack();
  const s = await boot(t, { env: { SLACK_ACADEMY_CHANNEL: '' }, slackFetch: slack.fetch });
  const ann = { id: 'ann-bot', name: 'Ann', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    s.service.store.saveTable({
      code: `B${i}AAA`.slice(0, 6), name: 'Bots', status: 'open', bots: true, settings: { turnSeconds: 100, bots: 1 },
      seats: [{ playerId: ann.id, sittingOut: false, bot: false }, { playerId: 'bot-0', sittingOut: false, bot: true }],
      hand: { toAct: 0, deadline: s.clock.t + 10_000, startedAt: s.clock.t },
    });
  }
  assert.equal(s.service.wanted.countFor(ann, s.clock.t), 0);
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 0);
  assert.equal(slack.channelPosts.length, 0);
});

test('the admin sample route is owner-only and returns a PNG; toggle posts nothing to Slack', async (t) => {
  const slack = mockSlack();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-wanted-ad-'));
  fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify({
    [OWNER]: { id: OWNER, name: 'Tyler', createdAt: 1, kind: 'dev', google: { sub: 'dev:tyler@example.com', email: 'tyler@example.com' }, bankroll: 1000, txns: [] },
  }));
  const { app, service, shutdown } = createApp({
    dataDir, devLogin: true,
    env: { BJ_TICK_MS: '0', ADMIN_PLAYER_IDS: OWNER, SLACK_BOT_TOKEN: TOKEN, SLACK_ACADEMY_CHANNEL: '#academy' },
    slackFetch: slack.fetch, slackRetryMs: 1, slackSendRetryMs: [],
  });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((x) => server.close(x)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stranger = agent(base);
  await stranger.post('/auth/dev', { email: 'connor@example.com', name: 'Connor' });
  assert.equal((await stranger.get('/api/admin/wanted')).status, 403);
  assert.equal((await stranger.get('/api/admin/wanted-poster')).status, 403);
  const owner = agent(base);
  await owner.post('/auth/dev', { email: 'tyler@example.com', name: 'Tyler' });
  const st = await owner.get('/api/admin/wanted');
  assert.equal(st.status, 200);
  assert.equal(st.body.channel, '#academy');
  assert.equal(st.body.toggle, true);
  const png = await owner.get('/api/admin/wanted-poster?name=Cal%20Hick');
  assert.equal(png.status, 200);
  assert.match(png.type, /image\/png/);
  assert.deepEqual([...png.buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const off = await owner.post('/api/admin/wanted', { enabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.toggle, false);
  assert.equal(off.body.enabled, false);
  assert.equal(slack.uploads.length, 0);
  assert.equal(slack.channelPosts.length, 0);
  assert.equal(service.wanted.enabled, false);
});

// Wanted-poster shame: count, cooldowns, kill switch, no Slack during tests, sample PNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createApp } from '../server/app.js';
import { shameDecision, wantedCaption, wantedSlackText, wantedSlackBlocks, slackErrorLine, SHAME_MIN, SHAME_COOLDOWN_MS, CHANNEL_GAP_MS, envWantedEnabled, resolveChannel, DEFAULT_ACADEMY_CHANNEL } from '../server/wanted.js';
import { SlackClient } from '../server/slack.js';
import { listShameTurns, listTurns, holdemSource } from '../server/turns.js';
import { tableHasBots } from '../server/slack.js';
import { CRIME, PUNISHMENT, PROCEDURE, SAMPLE_NAME, SAMPLE_SEED, POSTER_W, POSTER_H, wantedSvg, sampleWantedPoster, renderWantedPoster, nameFontSize, fitName } from '../server/wantedPoster.js';

test('the poster keeps the parody lines and dynamic name, with no official Naruto marks', () => {
  assert.equal(CRIME, 'Making everyone else wait');
  assert.equal(PUNISHMENT, 'One Thousand Years of Pain');
  assert.equal(PROCEDURE, 'Everyone waiting is legally justified to use the procedure');
  assert.equal(SAMPLE_NAME, 'Cal Hick');
  assert.ok(SAMPLE_SEED);
  assert.notEqual(SAMPLE_SEED, 'guntrad');
  const svg = wantedSvg({ name: SAMPLE_NAME, portraitDataUrl: 'data:image/png;base64,QQ==' });
  assert.match(svg, /Cal Hick/);
  assert.match(svg, /clipPath id="oval"/);
  assert.match(svg, /poster-template\.png|data:image\/png;base64,/);
  assert.doesNotMatch(svg, /naruto|masashi|kishimoto|sennen|shippuden|konoha|akatsuki|rasengan|sharingan|dealer\.png|guntrad/i);
  const png = sampleWantedPoster({ name: SAMPLE_NAME });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), POSTER_W);
  assert.equal(png.readUInt32BE(20), POSTER_H);
  const long = 'Bartholomew J. Winterbottom III';
  assert.equal(fitName('  Ann   Wait  '), 'Ann Wait');
  assert.ok(nameFontSize(long) < nameFontSize('Ann'));
  assert.ok(nameFontSize(long) >= 16);
  const longPng = renderWantedPoster({ name: long, seed: 'wanted-sample-long' });
  assert.equal(longPng.readUInt32BE(16), POSTER_W);
  assert.notDeepEqual([...png], [...longPng], 'a different name must change the poster');
  assert.match(wantedCaption('Cal Hick'), /WANTED: Cal Hick/);
  assert.equal(
    wantedSlackText({ name: 'Ann Wait', count: 4 }),
    "<!channel> Word from the Sheriff's Office: Ann Wait is WANTED for making everyone else wait. They're holding up 4 games. Punishment: One Thousand Years of Pain.",
  );
  assert.equal(
    wantedSlackText({ name: 'Ann Wait', slackUserId: 'U123ABCDEF', count: 5 }),
    "<!channel> Word from the Sheriff's Office: <@U123ABCDEF> is WANTED for making everyone else wait. They're holding up 5 games. Punishment: One Thousand Years of Pain.",
  );
  assert.equal(
    wantedSlackText({ name: 'Ann Wait', count: 4, posterUrl: 'https://bba.test/wanted/ab.png' }),
    "<!channel> Word from the Sheriff's Office: Ann Wait is WANTED for making everyone else wait. They're holding up 4 games. Punishment: One Thousand Years of Pain. Poster: <https://bba.test/wanted/ab.png>",
  );
  const blocks = wantedSlackBlocks({ name: 'Ann Wait', count: 4, posterUrl: 'https://bba.test/wanted/ab.png' });
  assert.equal(blocks[0].type, 'section');
  assert.match(blocks[0].text.text, /Ann Wait is WANTED/);
  assert.deepEqual(blocks[1], { type: 'image', image_url: 'https://bba.test/wanted/ab.png', alt_text: 'WANTED: Ann Wait' });
  assert.equal(wantedSlackBlocks({ name: 'Ann Wait', count: 4 }).length, 1, 'no image block without a poster URL');
  assert.equal(slackErrorLine({ method: 'files.getUploadURLExternal', error: 'missing_scope', needed: 'files:write' }), 'files.getUploadURLExternal missing_scope needed=files:write');
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

test('env kill switch and default #buffalo-bills-academy channel', () => {
  assert.equal(envWantedEnabled({}), true);
  assert.equal(envWantedEnabled({ SLACK_WANTED_POSTERS: '0' }), false);
  assert.equal(envWantedEnabled({ SLACK_WANTED_POSTERS: 'off' }), false);
  assert.equal(DEFAULT_ACADEMY_CHANNEL, '#buffalo-bills-academy');
  assert.equal(resolveChannel({ channel: '' }, {}), '#buffalo-bills-academy');
  assert.equal(resolveChannel({ channel: '' }, { SLACK_ACADEMY_CHANNEL: '#academy' }), '#academy');
  assert.equal(resolveChannel({ channel: 'C12345678' }, { SLACK_ACADEMY_CHANNEL: '#academy' }), 'C12345678');
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
    const ct = String(init.headers?.['content-type'] || init.headers?.['Content-Type'] || '');
    let body = {};
    if (init.body && ct.includes('json')) body = JSON.parse(init.body);
    else if (init.body && ct.includes('application/x-www-form-urlencoded')) body = Object.fromEntries(new URLSearchParams(String(init.body)));
    m.calls.push({ method, body, contentType: ct });
    const res = (json) => ({ status: 200, ok: true, json: async () => json });
    if (method === 'users.lookupByEmail') {
      if (m.slackUser) return res({ ok: true, user: { id: m.slackUser, team_id: 'T1', deleted: false, is_bot: false } });
      return res({ ok: false, error: 'users_not_found' });
    }
    if (method === 'conversations.list') {
      if (m.failList) return res({ ok: false, error: 'missing_scope', needed: 'channels:read,groups:read,mpim:read,im:read', provided: 'chat:write,im:write,users:read,users:read.email' });
      return res({
        ok: true,
        channels: [
          { id: 'CACADEMY99', name: 'academy' },
          { id: 'CBUFFALO99', name: 'buffalo-bills-academy' },
        ],
        response_metadata: { next_cursor: '' },
      });
    }
    if (method === 'files.getUploadURLExternal') {
      if (m.failUpload) return res({ ok: false, error: 'missing_scope', needed: 'files:write', provided: 'chat:write,im:write,users:read,users:read.email' });
      return res({ ok: true, upload_url: 'https://files.example/upload', file_id: 'F1' });
    }
    if (method === 'files.completeUploadExternal') {
      m.uploads.push({ channel: body.channel_id, comment: body.initial_comment, title: body.files?.[0]?.title });
      return res({ ok: true, files: [{ id: 'F1' }] });
    }
    if (method === 'chat.postMessage') {
      m.channelPosts.push({ channel: body.channel, text: body.text, blocks: body.blocks });
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
  assert.match(slack.uploads[0].comment, /<!channel>/);
  assert.match(slack.uploads[0].comment, /Sheriff's Office/);
  assert.match(slack.uploads[0].comment, /Ann Wait is WANTED for making everyone else wait/);
  assert.match(slack.uploads[0].comment, /holding up 4 games/);
  assert.match(slack.uploads[0].comment, /One Thousand Years of Pain/);
  assert.equal(slack.uploads[0].channel, 'CACADEMY99');
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

test('a Slack-matched player is @mentioned in the channel post', async (t) => {
  const slack = mockSlack();
  slack.slackUser = 'UANNWAIT1';
  const s = await boot(t, { slackFetch: slack.fetch });
  const ann = { id: 'ann-mention', name: 'Ann Wait', createdAt: 1, bankroll: 5000, txns: [], google: { email: 'ann@example.com' } };
  const bob = { id: 'bob-mention', name: 'Bob Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.players[bob.id] = bob;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    s.service.store.saveTable({
      code: `M${i}AAA`.slice(0, 6), name: `Wait ${i}`, status: 'open', hostId: bob.id,
      settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
      seats: [{ playerId: ann.id, sittingOut: false, name: 'Ann' }, { playerId: bob.id, sittingOut: false, name: 'Bob' }],
      hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
    });
  }
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 1);
  assert.match(slack.uploads[0].comment, /<!channel>/);
  assert.match(slack.uploads[0].comment, /<@UANNWAIT1> is WANTED/);
  assert.doesNotMatch(slack.uploads[0].comment, /Ann Wait is WANTED/);
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

test('a pasted C-ID uploads without conversations.list, even when channels:read is missing', async (t) => {
  const slack = mockSlack();
  slack.failList = true;
  const s = await boot(t, { env: { SLACK_ACADEMY_CHANNEL: 'CACADEMY99', PUBLIC_URL: 'https://bba.test' }, slackFetch: slack.fetch });
  const ann = { id: 'ann-cid', name: 'Ann Wait', createdAt: 1, bankroll: 5000, txns: [] };
  const bob = { id: 'bob-cid', name: 'Bob Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.players[bob.id] = bob;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    s.service.store.saveTable({
      code: `C${i}CID0`.slice(0, 6), name: `Wait ${i}`, status: 'open', hostId: bob.id,
      settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
      seats: [{ playerId: ann.id, sittingOut: false, name: 'Ann' }, { playerId: bob.id, sittingOut: false, name: 'Bob' }],
      hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
    });
  }
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.ok(!slack.calls.some((c) => c.method === 'conversations.list'), 'a C-ID must not look up the channel name');
  const getUrl = slack.calls.find((c) => c.method === 'files.getUploadURLExternal');
  assert.match(getUrl.contentType, /application\/x-www-form-urlencoded/);
  assert.equal(slack.uploads.length, 1);
  assert.equal(slack.uploads[0].channel, 'CACADEMY99');
  assert.match(slack.uploads[0].comment, /Poster: <https:\/\/bba\.test\/wanted\/[a-f0-9]{32}\.png>/);
  assert.equal(slack.channelPosts.length, 0);
});

test('the admin channel setting also accepts a C-ID and skips name lookup', async (t) => {
  const slack = mockSlack();
  slack.failList = true;
  const s = await boot(t, { env: { SLACK_ACADEMY_CHANNEL: '#academy', PUBLIC_URL: 'https://bba.test' }, slackFetch: slack.fetch });
  s.service.wanted.setConfig({ channel: 'CBUFFALO99' });
  assert.equal(s.service.wanted.channel, 'CBUFFALO99');
  const ann = { id: 'ann-admincid', name: 'Ann Wait', createdAt: 1, bankroll: 5000, txns: [] };
  const bob = { id: 'bob-admincid', name: 'Bob Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.players[bob.id] = bob;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    s.service.store.saveTable({
      code: `A${i}CID0`.slice(0, 6), name: `Wait ${i}`, status: 'open', hostId: bob.id,
      settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
      seats: [{ playerId: ann.id, sittingOut: false, name: 'Ann' }, { playerId: bob.id, sittingOut: false, name: 'Bob' }],
      hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
    });
  }
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.ok(!slack.calls.some((c) => c.method === 'conversations.list'));
  assert.equal(slack.uploads[0].channel, 'CBUFFALO99');
});

test('a missing files:write scope falls back to a channel post with an inline image block, and logs the Slack error', async (t) => {
  const slack = mockSlack();
  slack.failUpload = true;
  const warns = [];
  const s = await boot(t, { env: { SLACK_ACADEMY_CHANNEL: 'CACADEMY99', PUBLIC_URL: 'https://bba.test' }, slackFetch: slack.fetch });
  s.service.wanted.log = { warn: (msg) => warns.push(String(msg)) };
  const ann = { id: 'ann-fallback', name: 'Ann Wait', createdAt: 1, bankroll: 5000, txns: [] };
  const bob = { id: 'bob-fallback', name: 'Bob Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[ann.id] = ann;
  s.service.store.players[bob.id] = bob;
  s.service.store.savePlayers();
  for (let i = 0; i < 4; i++) {
    s.service.store.saveTable({
      code: `F${i}ALL0`.slice(0, 6), name: `Wait ${i}`, status: 'open', hostId: bob.id,
      settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
      seats: [{ playerId: ann.id, sittingOut: false, name: 'Ann' }, { playerId: bob.id, sittingOut: false, name: 'Bob' }],
      hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
    });
  }
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 0);
  assert.equal(slack.channelPosts.length, 1);
  const text = slack.channelPosts[0].text;
  assert.match(text, /<!channel>/);
  assert.match(text, /Ann Wait is WANTED/);
  const m = text.match(/Poster: <(https:\/\/bba\.test\/wanted\/[a-f0-9]{32}\.png)>/);
  assert.ok(m, text);
  const blocks = slack.channelPosts[0].blocks;
  assert.equal(blocks[0].type, 'section');
  assert.equal(blocks[1].type, 'image');
  assert.equal(blocks[1].image_url, m[1]);
  assert.equal(blocks[1].alt_text, 'WANTED: Ann Wait');
  const urlPath = new URL(m[1]).pathname;
  const got = await fetch(s.base + urlPath);
  assert.equal(got.status, 200);
  assert.match(got.headers.get('content-type'), /image\/png/);
  const buf = Buffer.from(await got.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal((await fetch(s.base + '/wanted/not-a-real-id.png')).status, 404);
  assert.ok(warns.some((w) => w.includes('[wanted] upload failed:') && w.includes('files.getUploadURLExternal') && w.includes('missing_scope') && w.includes('files:write')));
  assert.ok(!warns.join(' ').includes('xoxb-'), 'logs must not include the token');
});

test('one sweep that finds several offenders posts one poster and queues the rest 10 minutes apart', async (t) => {
  const slack = mockSlack();
  const s = await boot(t, { env: { SLACK_ACADEMY_CHANNEL: 'CACADEMY99', PUBLIC_URL: 'https://bba.test' }, slackFetch: slack.fetch });
  const pal = { id: 'pal-queue', name: 'Pal', createdAt: 1, bankroll: 5000, txns: [] };
  s.service.store.players[pal.id] = pal;
  const names = ['Keetch', 'Foffenstein', 'Breiden'];
  const offenders = names.map((name, n) => {
    const p = { id: `off-${n}`, name, createdAt: 1, bankroll: 5000, txns: [] };
    s.service.store.players[p.id] = p;
    for (let i = 0; i < 4; i++) {
      s.service.store.saveTable({
        code: `Q${n}${i}AAA`.slice(0, 6), name: `${name} ${i}`, status: 'open', hostId: pal.id,
        settings: { turnSeconds: 100, maxPlayers: 3, smallBlind: 1, bigBlind: 2, buyIn: 200 },
        seats: [{ playerId: p.id, sittingOut: false, name }, { playerId: pal.id, sittingOut: false, name: 'Pal' }],
        hand: { toAct: 0, deadline: s.clock.t + 80_000, startedAt: s.clock.t - 10_000 },
      });
    }
    return p;
  });
  s.service.store.savePlayers();
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 1, 'only the first poster goes out immediately');
  assert.equal(s.service.wanted.state.queue.length, 2);
  const first = slack.uploads[0].comment;
  s.clock.t += CHANNEL_GAP_MS - 1;
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 1, 'still inside the 10-minute gap');
  s.clock.t += 1;
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 2);
  assert.equal(s.service.wanted.state.queue.length, 1);
  s.clock.t += CHANNEL_GAP_MS;
  s.service.wanted.scan();
  await s.service.wanted.idle();
  assert.equal(slack.uploads.length, 3);
  assert.equal(s.service.wanted.state.queue.length, 0);
  const posted = slack.uploads.map((u) => {
    if (/Keetch/.test(u.comment)) return 'Keetch';
    if (/Foffenstein/.test(u.comment)) return 'Foffenstein';
    if (/Breiden/.test(u.comment)) return 'Breiden';
    return '?';
  });
  assert.deepEqual(new Set(posted), new Set(names));
});

test('SlackClient.uploadImage form-encodes getUploadURLExternal (JSON is rejected by Slack)', async () => {
  const calls = [];
  const buf = Buffer.from([1, 2, 3, 4]);
  const client = new SlackClient({
    token: 'xoxb-test-not-real',
    fetchImpl: async (url, init) => {
      if (String(url).includes('https://files.example/upload')) {
        calls.push({ method: 'UPLOAD_POST', contentType: init.headers?.['content-type'], bytes: init.body?.length ?? init.body?.byteLength });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      const method = new URL(url).pathname.replace('/api/', '');
      const ct = init.headers?.['content-type'] || '';
      calls.push({ method, contentType: ct, body: String(init.body || '') });
      if (method === 'files.getUploadURLExternal') {
        return { status: 200, ok: true, json: async () => ({ ok: true, upload_url: 'https://files.example/upload', file_id: 'F1' }) };
      }
      if (method === 'files.completeUploadExternal') {
        return { status: 200, ok: true, json: async () => ({ ok: true, files: [{ id: 'F1' }] }) };
      }
      return { status: 200, ok: true, json: async () => ({ ok: false, error: 'unexpected' }) };
    },
  });
  const r = await client.uploadImage({
    channel: 'CACADEMY99', filename: 'wanted.png', buffer: buf, title: 'WANTED: Ann', comment: 'hi',
  });
  assert.equal(r.ok, true);
  const getUrl = calls.find((c) => c.method === 'files.getUploadURLExternal');
  assert.ok(getUrl);
  assert.match(getUrl.contentType, /application\/x-www-form-urlencoded/);
  assert.doesNotMatch(getUrl.contentType, /application\/json/);
  const params = new URLSearchParams(getUrl.body);
  assert.equal(params.get('filename'), 'wanted.png');
  assert.equal(params.get('length'), '4');
  const done = calls.find((c) => c.method === 'files.completeUploadExternal');
  assert.match(done.contentType, /application\/json/);
  const json = JSON.parse(done.body);
  assert.equal(json.channel_id, 'CACADEMY99');
  assert.equal(json.files[0].id, 'F1');
  assert.equal(json.files[0].title, 'WANTED: Ann');
  assert.equal(json.initial_comment, 'hi');
  assert.equal(calls.find((c) => c.method === 'UPLOAD_POST').bytes, 4);
});

test('SlackClient.resolveChannelId returns a pasted C-ID without listing channels', async () => {
  const calls = [];
  const client = new SlackClient({
    token: 'xoxb-test-not-real',
    fetchImpl: async (url, init) => {
      const method = new URL(url).pathname.replace('/api/', '');
      calls.push(method);
      return { status: 200, ok: true, json: async () => ({ ok: false, error: 'missing_scope' }) };
    },
  });
  assert.equal(await client.resolveChannelId('CACADEMY99'), 'CACADEMY99');
  assert.equal(await client.resolveChannelId('#academy'), null);
  assert.deepEqual(calls, ['conversations.list']);
});

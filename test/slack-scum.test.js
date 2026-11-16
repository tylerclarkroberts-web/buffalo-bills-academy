// SCUM Slack turn DMs against a mocked Slack Web API. Nothing here talks to the real slack.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { scumTurns, tableHasBots } from '../server/slack.js';

const TOKEN = 'xoxb-test-not-real';
const USERS = { 'ann@x.test': 'UANN', 'bob@x.test': 'UBOB', 'cat@x.test': 'UCAT' };

function mockSlack() {
  const m = { dms: [] };
  m.fetch = async (url, init) => {
    const u = new URL(url); const method = u.pathname.replace('/api/', '');
    const body = init.body ? JSON.parse(init.body) : Object.fromEntries(u.searchParams);
    const res = (json) => ({ status: 200, json: async () => json });
    if (init.headers.authorization !== `Bearer ${TOKEN}`) return res({ ok: false, error: 'invalid_auth' });
    if (method === 'users.lookupByEmail') return USERS[body.email] ? res({ ok: true, user: { id: USERS[body.email], team_id: 'T1' } }) : res({ ok: false, error: 'users_not_found' });
    if (method === 'conversations.open') return res({ ok: true, channel: { id: `D${body.users}` } });
    if (method === 'chat.postMessage') { m.dms.push({ to: body.channel.slice(1), text: body.text, blocks: body.blocks }); return res({ ok: true, ts: '1' }); }
    return res({ ok: false, error: 'unknown_method' });
  };
  return m;
}

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-slackscum-'));
  const clock = { t: 1_800_000_000_000 };
  const slack = mockSlack();
  const origWarn = console.warn; console.warn = () => {};
  const { app, service, shutdown, scum } = createApp({
    dataDir: dir, devLogin: true, now: () => clock.t,
    env: { SLACK_BOT_TOKEN: TOKEN, PUBLIC_URL: 'https://buffalobillsacademy.com', SCUM_TICK_MS: '0', SCUM_BOT_MS: '0' },
    slackFetch: slack.fetch, slackRetryMs: 5,
  });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const stop = () => { console.warn = origWarn; server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { clock, slack, service, scum, call, login, stop, idle: () => service.slack.idle() };
}

test('SCUM tables with bots never Slack seated humans; human-only tables still ping', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ck = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s.call(ck[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  await s.idle(); s.slack.dms.length = 0;

  const made = await s.call(ck.ann, 'POST', '/api/scum/tables', { name: 'Bot porch', settings: { bots: 2, turnSec: 86400 } });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const botCode = made.body.code;
  // Lobby already requested bots: stay quiet even before they sit at start.
  const lobby = s.scum.doc.tables[botCode];
  assert.ok(tableHasBots(lobby), 'settings.bots is enough before seats fill');
  assert.equal((await s.call(ck.ann, 'POST', `/api/scum/tables/${botCode}/start`)).status, 200);
  s.scum.tick(); await s.idle();
  const live = s.scum.doc.tables[botCode];
  assert.ok(live.seats.some((x) => x?.bot));
  assert.deepEqual(scumTurns(live, s.clock.t), []);
  assert.equal(s.slack.dms.length, 0, 'Ann plus two bots: no turn DM, even after bots act instantly');
  if (live.round?.deadline) {
    s.clock.t = live.round.deadline - 3 * 3600 * 1000;
    s.service.slack.sweep(); await s.idle();
  }
  assert.equal(s.slack.dms.length, 0, 'no reminder on a SCUM table with bots');

  s.clock.t = 1_800_000_000_000;
  const human = await s.call(ck.ann, 'POST', '/api/scum/tables', { name: 'Friends porch', settings: { bots: 0, turnSec: 86400 } });
  assert.equal(human.status, 200, JSON.stringify(human.body));
  const humanCode = human.body.code;
  assert.equal((await s.call(ck.bob, 'POST', `/api/scum/tables/${humanCode}/join`)).status, 200);
  assert.equal((await s.call(ck.cat, 'POST', `/api/scum/tables/${humanCode}/join`)).status, 200);
  assert.equal((await s.call(ck.ann, 'POST', `/api/scum/tables/${humanCode}/start`)).status, 200);
  await s.idle();
  const ht = s.scum.doc.tables[humanCode];
  assert.equal(tableHasBots(ht), false);
  let facts = scumTurns(ht, s.clock.t);
  assert.ok(facts.length >= 1, 'human-only SCUM has someone to ping');
  // Ann started, so if the lead is hers she is not pinged (own action). Play her lowest card so the next player is.
  if (ht.seats[ht.round.turn].name === 'Ann') {
    const view = await s.call(ck.ann, 'GET', `/api/scum/tables/${humanCode}`);
    const card = view.body.round.hand[0];
    assert.equal((await s.call(ck.ann, 'POST', `/api/scum/tables/${humanCode}/play`, { cards: [card] })).status, 200);
    await s.idle();
    facts = scumTurns(s.scum.doc.tables[humanCode], s.clock.t);
  }
  const nowT = s.scum.doc.tables[humanCode];
  const waiting = nowT.seats[facts[0].seat];
  const want = { Ann: 'UANN', Bob: 'UBOB', Cat: 'UCAT' }[waiting.name];
  assert.ok(s.slack.dms.some((d) => d.to === want && d.text.includes(`/scum/${humanCode}`)), `${waiting.name} should be DMed on a human-only table`);
  assert.ok(s.slack.dms.every((d) => !d.text.includes(botCode)), 'the bot-table link is never sent');
});

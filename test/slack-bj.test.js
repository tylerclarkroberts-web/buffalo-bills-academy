// v48: blackjack turn DMs against a mocked Slack Web API. Nothing here talks to the real slack.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { bjTurns, bjMessage } from '../server/slack.js';

const TOKEN = 'xoxb-test-not-real';
const USERS = { 'ann@x.test': 'UANN', 'bob@x.test': 'UBOB' }; // cat has no Slack account
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-slackbj-'));
  const clock = { t: 1_800_000_000_000 };
  const slack = mockSlack();
  const origWarn = console.warn; console.warn = () => {};
  const { app, service, shutdown, bj } = createApp({ dataDir: dir, devLogin: true, now: () => clock.t, env: { SLACK_BOT_TOKEN: TOKEN, PUBLIC_URL: 'https://buffalobillsacademy.com', BJ_TICK_MS: '0' }, slackFetch: slack.fetch, slackRetryMs: 5 });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const stop = () => { console.warn = origWarn; server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { clock, slack, service, bj, call, login, stop, idle: () => service.slack.idle() };
}
async function table(s, ck, settings = {}) {
  const c = await s.call(ck.ann, 'POST', '/api/bj/tables', { name: 'Porch <21>', settings: { minBet: 5, buyIn: 200, turnSec: 86400, bots: 0, ...settings } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const code = c.body.code || c.body.table?.code;
  for (const n of ['bob', 'cat']) if (ck[n]) assert.equal((await s.call(ck[n], 'POST', `/api/bj/tables/${code}/join`, { ack: true })).status, 200);
  assert.equal((await s.call(ck.ann, 'POST', `/api/bj/tables/${code}/start`)).status, 200);
  await s.idle();
  return code;
}
const to = (s, who) => s.slack.dms.filter((d) => d.to === who);

test('betting opens: every seated human with Slack gets one DM; never cards; dedupe; own bet and unmatched get none', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ck = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  const code = await table(s, ck);
  assert.equal(to(s, 'UANN').length, 0, 'Ann pressed Start: her own action, no ping');
  assert.equal(to(s, 'UBOB').length, 1);
  assert.equal(s.slack.dms.length, 1, 'cat is not on Slack: nothing sent');
  const d = to(s, 'UBOB')[0];
  assert.match(d.text, /place your bet/); assert.match(d.text, new RegExp(`/bj/${code}`));
  assert.match(JSON.stringify(d.blocks), /Porch &lt;21&gt;/, 'table name escaped');
  assert.doesNotMatch(JSON.stringify(d), /\b(10|[2-9JQKA])[cdhs]\b/, 'no cards');
  // Ann bets: starts the 1-day clock, but nobody is re-pinged for the same betting window
  assert.equal((await s.call(ck.ann, 'POST', `/api/bj/tables/${code}/bet`, { bet: 5 })).status, 200);
  s.bj.tick(); s.bj.tick(); await s.idle();
  assert.equal(s.slack.dms.length, 1, 'dedupe: the betting clock starting is not a new ping');
});

test('play turn: the next human is DMed when it is their hand, not the player who just acted; timeout moves the ping on', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ck = { ann: await s.login('Ann'), bob: await s.login('Bob') };
  const code = await table(s, ck, { turnSec: 30 });
  s.slack.dms.length = 0;
  let actor, sawPlay = 0, sawTimeout = false;
  for (let round = 0; round < 10 && !sawTimeout; round++) {
  s.slack.dms.forEach((x) => { x.seen = true; });
  for (const n of ['ann', 'bob']) await s.call(ck[n], 'POST', `/api/bj/tables/${code}/bet`, { bet: 5 });
  await s.idle(); actor = 'bob';
  for (let guard = 0; guard < 40; guard++) {
    const tb = s.bj.doc.tables[code]; const r = tb.round;
    if (r.phase === 'insurance') { for (const n of ['ann', 'bob']) await s.call(ck[n], 'POST', `/api/bj/tables/${code}/insure`, { yes: false }); actor = 'bob'; continue; }
    if (r.phase !== 'play') break;
    const who = tb.seats[r.hands[r.turn].seat].name.toLowerCase(); const id = who === 'ann' ? 'UANN' : 'UBOB';
    await s.idle();
    const pinged = s.slack.dms.some((x) => x.to === id && /hand to play/.test(x.text) && !x.seen);
    s.slack.dms.forEach((x) => { x.seen = true; });
    assert.equal(pinged, who !== actor, `${who}'s hand: pinged only if someone else moved it there (actor ${actor})`);
    if (who !== actor) sawPlay++;
    if (!sawTimeout) { sawTimeout = true; s.clock.t += 31000; s.bj.tick(); actor = null; } // clock runs out: Guntrad stands for them
    else { await s.call(ck[who], 'POST', `/api/bj/tables/${code}/act`, { action: 'stand' }); actor = who; }
  }
  }
  await s.idle();
  // round settled into a new betting window: whoever didn't make the last move gets a fresh "place your bet"
  assert.ok(sawTimeout, 'a hand reached play and timed out');
  assert.ok(s.slack.dms.some((x) => !x.seen && /place your bet/.test(x.text)), 'new round pings');
});

test('bots, spectators and players who turned alerts off are never DMed', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ck = { ann: await s.login('Ann'), bob: await s.login('Bob') };
  await s.call(ck.bob, 'POST', '/api/me/slack/prefs', { on: false });
  await s.idle(); s.slack.dms.length = 0;
  const code = await table(s, ck, { bots: 2 });
  assert.deepEqual(s.slack.dms.map((d) => d.to), [], 'Ann started it (own action), Bob is off, bots never');
  await s.call(ck.bob, 'POST', '/api/me/slack/prefs', { on: true });
  const tb = s.bj.doc.tables[code];
  assert.ok(tb.seats.some((x) => x?.bot));
  assert.ok(bjTurns(tb, s.clock.t).every((f) => !String(f.playerId).startsWith('bot-')), 'bots never appear in turn facts');
});

test('reminder about 4h before a 1-day deadline, once; message builder wording', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ck = { ann: await s.login('Ann'), bob: await s.login('Bob') };
  const code = await table(s, ck);
  await s.call(ck.ann, 'POST', `/api/bj/tables/${code}/bet`, { bet: 5 }); await s.idle();
  s.slack.dms.length = 0;
  s.clock.t += 19 * 3600000; s.service.slack.sweep(); await s.idle();
  assert.equal(s.slack.dms.length, 0, 'not yet');
  s.clock.t += 1.5 * 3600000; s.service.slack.sweep(); await s.idle();
  assert.equal(s.slack.dms.length, 1); assert.equal(s.slack.dms[0].to, 'UBOB'); assert.match(s.slack.dms[0].text, /Reminder/);
  s.service.slack.sweep(); await s.idle(); assert.equal(s.slack.dms.length, 1, 'once');
  const m = bjMessage({ code: 'ABC', table: 'T', phase: 'play', deadline: 1, left: 3600000 }, { publicUrl: 'https://x' });
  assert.match(m.blocks[0].text.text, /Guntrad here/); assert.match(m.blocks[0].text.text, /stands for you/);
  assert.equal(m.blocks[1].elements[0].url, 'https://x/bj/ABC');
});

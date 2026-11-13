// Slack turn alerts against a mocked Slack Web API: connect, not-found, turn pings, dedupe, reminders,
// and Slack failures never touching the game. Nothing here talks to the real slack.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { SlackClient, turnMessage, hoursLeft, nudgeMessage, NUDGE_FIRST_MS, NUDGE_EVERY_MS, NUDGE_MAX } from '../server/slack.js';

const TOKEN = 'xoxb-test-not-real';
const USERS = { 'ann@x.test': 'UANN', 'bob@x.test': 'UBOB', 'cat@x.test': 'UCAT' };

function mockSlack() {
  const m = { calls: [], dms: [], fail: 0, down: false };
  m.fetch = async (url, init) => {
    const u = new URL(url); const method = u.pathname.replace('/api/', '');
    const auth = init.headers.authorization;
    const body = init.body ? JSON.parse(init.body) : Object.fromEntries(u.searchParams);
    m.calls.push({ method, body });
    const res = (status, json) => ({ status, json: async () => json });
    if (auth !== `Bearer ${TOKEN}`) return res(200, { ok: false, error: 'invalid_auth' });
    if (m.down) throw new Error('connect ECONNREFUSED');
    if (m.fail > 0) { m.fail--; return res(500, {}); }
    if (method === 'users.lookupByEmail') return USERS[body.email] ? res(200, { ok: true, user: { id: USERS[body.email], team_id: 'T1' } }) : res(200, { ok: false, error: 'users_not_found' });
    if (method === 'conversations.open') return res(200, { ok: true, channel: { id: `D${body.users}` } });
    if (method === 'chat.postMessage') { m.dms.push({ to: body.channel.slice(1), text: body.text, blocks: body.blocks }); return res(200, { ok: true, ts: '1' }); }
    return res(200, { ok: false, error: 'unknown_method' });
  };
  return m;
}

async function boot({ token = TOKEN } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-slack-'));
  const clock = { t: 1_800_000_000_000 };
  const slack = mockSlack();
  const logs = [];
  const origWarn = console.warn; console.warn = (...a) => logs.push(a.join(' '));
  const { app, service, shutdown } = createApp({ dataDir: dir, devLogin: true, now: () => clock.t, env: token ? { SLACK_BOT_TOKEN: token, PUBLIC_URL: 'https://buffalobillsacademy.com' } : {}, slackFetch: slack.fetch, slackRetryMs: 1, snapshots: false });
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (c, m, p, b) => fetch(base + p, { method: m, headers: { ...(c ? { cookie: c } : {}), 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }));
  const login = async (name) => (await call(null, 'POST', '/auth/dev', { name, email: `${name.toLowerCase()}@x.test` })).cookie;
  const stop = () => { console.warn = origWarn; server.close(); shutdown(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { dir, clock, slack, logs, service, call, login, stop, idle: () => service.slack.idle() };
}

// Ann hosts, Bob and Cat join; returns the table code once the first hand is dealt.
async function threeHanded(s, cookies, settings = {}) {
  const tb = await s.call(cookies.ann, 'POST', '/api/tables', { name: 'Porch <Game>', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, nextHandDelaySeconds: 0, ...settings } });
  const code = tb.body.code || tb.body.table?.code;
  await s.call(cookies.bob, 'POST', `/api/tables/${code}/join`);
  await s.call(cookies.cat, 'POST', `/api/tables/${code}/join`);
  await s.call(cookies.ann, 'POST', `/api/tables/${code}/start`);
  return code;
}
const toAct = (s, code) => { const t = s.service.store.getTable(code); return t.seats[t.hand.toAct]; };
const cookieOf = (cookies, seat) => cookies[seat.name.toLowerCase()];

test('connect: prefilled email is looked up, saved, and gets a welcome DM; disconnect and test work', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ann = await s.login('Ann');
  let me = (await s.call(ann, 'GET', '/api/me')).body;
  assert.deepEqual(me.slack, { enabled: true, on: true, email: 'ann@x.test', source: 'account', accountEmail: 'ann@x.test', override: null, connected: false, matched: null });
  assert.equal(s.slack.calls.length, 0, 'signing in never calls Slack (lookups are lazy)');
  const r = await s.call(ann, 'POST', '/api/me/slack', { email: ' Ann@X.test ' });
  assert.equal(r.status, 200); assert.equal(r.body.connected, true); assert.equal(r.body.source, 'manual');
  assert.equal(s.service.store.players[me.id].slack.email, 'ann@x.test');
  assert.equal(s.slack.dms.length, 1); assert.equal(s.slack.dms[0].to, 'UANN'); assert.match(s.slack.dms[0].text, /Howdy Ann/);
  assert.equal((await s.call(ann, 'POST', '/api/me/slack/test')).status, 200);
  assert.equal(s.slack.dms.length, 2);
  me = (await s.call(ann, 'GET', '/api/me')).body; assert.equal(me.slack.email, 'ann@x.test');
  const d = (await s.call(ann, 'DELETE', '/api/me/slack')).body;
  assert.equal(d.source, 'account', 'removing the Slack email falls back to the account email'); assert.equal(d.connected, true);
  assert.equal(s.service.store.players[me.id].slack, undefined);
  assert.equal((await s.call(ann, 'POST', '/api/me/slack/prefs', { on: false })).body.on, false);
  assert.equal((await s.call(ann, 'POST', '/api/me/slack/test')).status, 400, 'no test DM while switched off');
  assert.equal((await s.call(null, 'POST', '/api/me/slack', { email: 'ann@x.test' })).status, 401);
});

test('connect: unknown email, bad email and Slack outages give plain messages and save nothing', async (t) => {
  const s = await boot(); t.after(s.stop);
  const ann = await s.login('Ann');
  let r = await s.call(ann, 'POST', '/api/me/slack', { email: 'nobody@x.test' });
  assert.equal(r.status, 404); assert.match(r.body.error, /No one with that email is in our Slack workspace/);
  r = await s.call(ann, 'POST', '/api/me/slack', { email: 'not an email' });
  assert.equal(r.status, 400); assert.match(r.body.error, /email address you use in Slack/);
  s.slack.down = true;
  r = await s.call(ann, 'POST', '/api/me/slack', { email: 'ann@x.test' });
  assert.equal(r.status, 502); assert.match(r.body.error, /Slack didn't answer/);
  assert.equal(s.slack.calls.filter((c) => c.method === 'users.lookupByEmail' && c.body.email === 'ann@x.test').length, 2, 'tried, then retried once');
  assert.equal(Object.values(s.service.store.players).some((p) => p.slack), false);
  assert.ok(s.logs.every((l) => !l.includes(TOKEN)), 'token never logged');
});

test('disabled without SLACK_BOT_TOKEN: status says so, connect refuses, the game never calls Slack', async (t) => {
  const s = await boot({ token: '' }); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  const st = (await s.call(c.ann, 'GET', '/api/me')).body.slack;
  assert.equal(st.enabled, false); assert.equal(st.connected, false);
  assert.equal((await s.call(c.ann, 'POST', '/api/me/slack', { email: 'ann@x.test' })).status, 503);
  await threeHanded(s, c);
  assert.equal(s.slack.calls.length, 0);
});

test('turn pings: DM the next player with table, hand, what they face, time left and a link; never cards; once per turn', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s.call(c[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  s.slack.dms.length = 0;
  const code = await threeHanded(s, c);
  await s.idle();
  const first = toAct(s, code);
  assert.equal(first.name, 'Ann', 'Ann (host, on the button) acts first three-handed');
  assert.equal(s.slack.dms.length, 0, 'Ann just pressed Start herself: no ping for her own action');

  // Ann calls: the turn passes to Bob (small blind), who faces 1 to call
  const act = async (who, type) => { const v = await s.call(c[who], 'GET', `/api/tables/${code}`); return s.call(c[who], 'POST', `/api/tables/${code}/action`, { type, handNumber: v.body.hand.number }); };
  await act('ann', 'call'); await s.idle();
  assert.equal(s.slack.dms.length, 1);
  const dm = s.slack.dms[0];
  assert.equal(dm.to, 'UBOB');
  assert.match(dm.text, /^Your turn at Porch <Game>: 1 to call, act within 24 hours\. https:\/\/buffalobillsacademy\.com\/t\//);
  assert.ok(dm.text.endsWith(`/t/${code}`));
  const blk = JSON.stringify(dm.blocks);
  assert.match(blk, /Porch &lt;Game&gt;/); assert.match(blk, /Hand #1/); assert.match(blk, /Pre-flop/); assert.match(blk, /pot 5/);
  assert.match(blk, new RegExp(`"url":"https://buffalobillsacademy.com/t/${code}"`));
  const hole = s.service.store.getTable(code).hand.players.flatMap((p) => (p ? p.hole : []));
  for (const card of hole) assert.equal(new RegExp(`\\b${card}\\b`).test(JSON.stringify(s.slack.dms)), false, 'no hole cards in Slack'); // whole tokens: "Ac" is inside "Act"

  // changes that do not move the turn do not ping again
  s.service.slack.tableChanged(s.service.store.getTable(code));
  s.service.slack.tableChanged(s.service.store.getTable(code));
  await s.idle(); assert.equal(s.slack.dms.length, 1, 'deduped');

  // Bob calls: Cat (big blind) may check
  await act('bob', 'call'); await s.idle();
  assert.equal(s.slack.dms.length, 2); assert.equal(s.slack.dms[1].to, 'UCAT');
  assert.match(s.slack.dms[1].text, /you can check/);

  // a timeout passes the turn as well
  s.clock.t += 24 * 3600 * 1000 + 1000; s.service.runDue(); await s.idle();
  const third = toAct(s, code);
  assert.equal(s.service.store.getTable(code).hand.street, 'flop', 'Cat timed out (auto-check): flop dealt');
  assert.equal(s.slack.dms.length, 3); assert.equal(s.slack.dms[2].to, `U${third.name.toUpperCase()}`);
  assert.match(JSON.stringify(s.slack.dms[2].blocks), /Flop/);
  assert.ok(s.service.store.loadDoc('slack-alerts', {}).pinged[code], 'dedupe survives restarts');
});

test('players without Slack are skipped, and Slack failures never break or slow the game (retry once, logged without the token)', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s.call(c[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  const code = await threeHanded(s, c); await s.idle();
  s.slack.calls.length = 0; s.slack.dms.length = 0;
  s.slack.fail = 1; // the first Slack call 500s, the retry succeeds
  { const v = await s.call(c.ann, 'GET', `/api/tables/${code}`); await s.call(c.ann, 'POST', `/api/tables/${code}/action`, { type: 'call', handNumber: v.body.hand.number }); }
  await s.idle();
  assert.equal(s.slack.dms.length, 1, 'Bob still pinged after one retry');
  assert.equal(s.slack.calls.filter((x) => x.method === 'conversations.open').length, 2);

  s.slack.down = true;
  for (let i = 0; i < 2; i++) {
    const who = toAct(s, code); const v = await s.call(cookieOf(c, who), 'GET', `/api/tables/${code}`);
    const r = await s.call(cookieOf(c, who), 'POST', `/api/tables/${code}/action`, { type: v.body.legal?.canCheck ? 'check' : 'call', handNumber: v.body.hand.number });
    assert.equal(r.status, 200, 'the game carries on while Slack is down');
  }
  await s.idle();
  assert.ok(s.logs.some((l) => /\[slack\] turn failed: network_error/.test(l)));
  assert.ok(s.logs.every((l) => !l.includes(TOKEN) && !l.includes('to call')), 'logs carry no token and no message body');
  s.slack.down = false;

  // Bob switches alerts off: his turns are skipped silently
  await s.call(c.bob, 'POST', '/api/me/slack/prefs', { on: false });
  const before = s.slack.dms.length;
  for (let k = 0; k < 6 && s.service.store.getTable(code).hand; k++) {
    const who = toAct(s, code); const v = await s.call(cookieOf(c, who), 'GET', `/api/tables/${code}`);
    await s.call(cookieOf(c, who), 'POST', `/api/tables/${code}/action`, { type: v.body.legal?.canCheck ? 'check' : 'call', handNumber: v.body.hand.number });
    await s.idle();
  }
  assert.ok(s.slack.dms.slice(before).every((d) => d.to !== 'UBOB'));
});

test('reminder: one DM about 4 hours before the deadline, once per turn, none after acting or on short clocks', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s.call(c[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  const code = await threeHanded(s, c); await s.idle();
  const who = toAct(s, code); const uid = `U${who.name.toUpperCase()}`;
  const n0 = s.slack.dms.length;
  s.clock.t += 19 * 3600 * 1000; s.service.slack.sweep(); await s.idle();
  assert.equal(s.slack.dms.length, n0, '5 hours left: not yet');
  s.clock.t += 1 * 3600 * 1000 + 1000; s.service.slack.sweep(); await s.idle();
  assert.equal(s.slack.dms.length, n0 + 1);
  const rem = s.slack.dms.at(-1);
  assert.equal(rem.to, uid); assert.match(rem.text, /Reminder: still your turn at Porch <Game>.*act within 4 hours/);
  s.service.slack.sweep(); s.service.slack.sweep(); await s.idle();
  assert.equal(s.slack.dms.length, n0 + 1, 'only one reminder per turn');
  assert.ok(s.service.slack.timer === null || s.service.slack.timer, 'scheduler alive');

  // short clocks (1 hour turns) never get a reminder
  const s2 = await boot(); t.after(s2.stop);
  const c2 = { ann: await s2.login('Ann'), bob: await s2.login('Bob'), cat: await s2.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s2.call(c2[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  await threeHanded(s2, c2, { turnSeconds: 3600 }); await s2.idle();
  const m0 = s2.slack.dms.length;
  s2.clock.t += 50 * 60 * 1000; s2.service.slack.sweep(); await s2.idle();
  assert.equal(s2.slack.dms.length, m0);
});

test('reminder fires from the scheduler on its own (real timer)', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  for (const n of ['ann', 'bob', 'cat']) await s.call(c[n], 'POST', '/api/me/slack', { email: `${n}@x.test` });
  await threeHanded(s, c); await s.idle();
  const n0 = s.slack.dms.length;
  s.clock.t += 20 * 3600 * 1000 + 5; // the next timer fires right away once the clock says it's due
  s.service.slack.reschedule();
  await new Promise((r) => setTimeout(r, 150)); await s.idle();
  assert.equal(s.slack.dms.length, n0 + 1);
});

test('message helpers: wording for check vs call and time left', () => {
  const f = { code: 'ABC123', table: 'T', hand: 3, street: 'flop', toCall: 0, pot: 40, stack: 90, left: 23.6 * 3600000 };
  const m = turnMessage(f, { publicUrl: 'https://x.test' });
  assert.match(m.text, /you can check, act within 24 hours\. https:\/\/x\.test\/t\/ABC123/);
  assert.equal(hoursLeft(30 * 60000), 'within 30 minutes');
  assert.equal(new SlackClient({}).enabled, false);
});

test('auto-link: account emails match Slack with no setup; lookups are lazy, cached, and a no-match is skipped silently', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), dan: await s.login('Dan') }; // dan@x.test is not in Slack
  s.service.slack.state.lookups = {};
  const tb = await s.call(c.ann, 'POST', '/api/tables', { name: 'Auto', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2, nextHandDelaySeconds: 0 } });
  const code = tb.body.code || tb.body.table?.code;
  await s.call(c.bob, 'POST', `/api/tables/${code}/join`); await s.call(c.dan, 'POST', `/api/tables/${code}/join`);
  assert.equal(s.slack.calls.length, 0, 'nothing looked up before a turn');
  await s.call(c.ann, 'POST', `/api/tables/${code}/start`); await s.idle();
  const lookups = () => s.slack.calls.filter((x) => x.method === 'users.lookupByEmail').map((x) => x.body.email);
  const act = async () => { const who = toAct(s, code); const ck = { Ann: c.ann, Bob: c.bob, Dan: c.dan }[who.name]; const v = await s.call(ck, 'GET', `/api/tables/${code}`);
    await s.call(ck, 'POST', `/api/tables/${code}/action`, { type: v.body.legal?.canCheck ? 'check' : 'call', handNumber: v.body.hand.number }); await s.idle(); };
  for (let k = 0; k < 8 && s.service.store.getTable(code).hand; k++) await act();
  const dmTo = new Set(s.slack.dms.map((d) => d.to));
  assert.ok(dmTo.has('UBOB'), 'Bob got turn DMs without connecting anything');
  assert.equal(dmTo.has('UDAN'), false);
  const L = lookups();
  assert.equal(L.filter((e) => e === 'bob@x.test').length, 1, 'one lookup per email, then cached');
  assert.equal(L.filter((e) => e === 'dan@x.test').length, 1, 'a miss is cached too');
  assert.ok(s.service.slack.state.lookups['dan@x.test'].miss);
  assert.ok(s.logs.every((l) => !/dan/i.test(l)), 'no-match is silent');
  const dan = (await s.call(c.dan, 'GET', '/api/me/slack')).body;
  assert.equal(dan.matched, false); assert.equal(dan.connected, false);
  // the miss expires after 12 hours and is tried again
  s.clock.t += 13 * 3600 * 1000;
  const p = Object.values(s.service.store.players).find((x) => x.name === 'Dan');
  assert.equal(s.service.slack.mayAlert(p), true);
  assert.deepEqual(await s.service.slack.resolve(p), { miss: true });
  assert.equal(lookups().filter((e) => e === 'dan@x.test').length, 2);
});

test('auto-link: a manual Slack email overrides, accounts without email have no auto-link, and off means never DM', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  // Dan signs up with a username and password, no email: no auto-link
  const reg = await s.call(null, 'POST', '/auth/register', { username: 'danpw', password: 'Correct-horse-battery-9', name: 'Dan' });
  assert.equal(reg.status, 200, JSON.stringify(reg.body)); {
    const st = (await s.call(reg.cookie, 'GET', '/api/me/slack')).body;
    assert.equal(st.email, null); assert.equal(st.source, null); assert.equal(st.on, true);
    const dp = Object.values(s.service.store.players).find((x) => x.name === 'Dan');
    assert.equal(s.service.slack.mayAlert(dp), false);
    assert.deepEqual(await s.service.slack.resolve(dp), { miss: true, why: 'no_email' });
  }
  // Bob's Slack email differs from his account email
  const pb = Object.values(s.service.store.players).find((x) => x.name === 'Bob');
  pb.google.email = 'bobby@work.test';
  assert.deepEqual(await s.service.slack.resolve(pb), { miss: true });
  const r = await s.call(c.bob, 'POST', '/api/me/slack', { email: 'bob@x.test' });
  assert.equal(r.body.source, 'manual'); assert.equal(r.body.connected, true);
  assert.deepEqual(await s.service.slack.resolve(pb), { id: 'UBOB' });
  // Cat switches off: no turn DMs, no reminders
  await s.call(c.cat, 'POST', '/api/me/slack/prefs', { on: false });
  s.slack.dms.length = 0;
  const code = await threeHanded(s, c); await s.idle();
  for (let k = 0; k < 8 && s.service.store.getTable(code).hand; k++) {
    const who = toAct(s, code); const v = await s.call(cookieOf(c, who), 'GET', `/api/tables/${code}`);
    await s.call(cookieOf(c, who), 'POST', `/api/tables/${code}/action`, { type: v.body.legal?.canCheck ? 'check' : 'call', handNumber: v.body.hand.number }); await s.idle();
    s.clock.t += 21 * 3600 * 1000; s.service.slack.sweep(); await s.idle(); s.clock.t -= 21 * 3600 * 1000;
  }
  assert.ok(s.slack.dms.length > 0);
  assert.equal(s.slack.dms.some((d) => d.to === 'UCAT'), false, 'Cat is off: never DMed');
  assert.ok(s.slack.dms.some((d) => d.to === 'UBOB'), 'Bob reached through his override');
  // switching back on works again
  assert.equal((await s.call(c.cat, 'POST', '/api/me/slack/prefs', { on: true })).body.on, true);
});

test('auto-link: lookup failures back off and the turn alert is retried; lookups are rate limited and deduped', async (t) => {
  const s = await boot(); t.after(s.stop);
  const c = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  const sa = s.service.slack; sa.retryMs = [20, 20];
  sa.state.lookups = {};
  s.slack.down = true;
  const code = await threeHanded(s, c); await s.idle();
  { const v = await s.call(c.ann, 'GET', `/api/tables/${code}`); const r = await s.call(c.ann, 'POST', `/api/tables/${code}/action`, { type: 'call', handNumber: v.body.hand.number }); assert.equal(r.status, 200); }
  await s.idle();
  assert.equal(s.slack.dms.length, 0);
  assert.equal(sa.state.lookups['bob@x.test'], undefined, 'an outage is not cached as a miss');
  s.slack.down = false;
  s.clock.t += 6 * 60 * 1000; // past the 5-minute lookup back-off
  await new Promise((r) => setTimeout(r, 120)); await s.idle();
  assert.equal(s.slack.dms.filter((d) => d.to === 'UBOB').length, 1, 'retried once Slack was back, still Bob\'s turn');
  // no retry if the turn moved on meanwhile
  // the retry must not fire before Cat's check lands: two HTTP calls take longer than 20 ms on a slow disk
  sa.retryMs = [200, 200];
  s.slack.down = true; sa.errAt.clear(); delete sa.state.lookups['cat@x.test'];
  { const v = await s.call(c.bob, 'GET', `/api/tables/${code}`); await s.call(c.bob, 'POST', `/api/tables/${code}/action`, { type: 'call', handNumber: v.body.hand.number }); }
  await s.idle(); s.slack.down = false; s.clock.t += 6 * 60 * 1000;
  { const v = await s.call(c.cat, 'GET', `/api/tables/${code}`); await s.call(c.cat, 'POST', `/api/tables/${code}/action`, { type: 'check', handNumber: v.body.hand.number }); }
  await new Promise((r) => setTimeout(r, 300)); await s.idle();
  assert.equal(s.slack.dms.filter((d) => d.to === 'UCAT').length, 0, 'stale turn alerts are dropped');
  // in-flight dedupe and the per-minute cap
  sa.state.lookups = {}; sa.errAt.clear(); sa.recent = []; s.slack.calls.length = 0;
  const fake = (i) => ({ id: `f${i}`, google: { email: `p${i}@many.test` } });
  const pa = fake('x');
  await Promise.all([sa.resolve(pa), sa.resolve(pa), sa.resolve(pa)]);
  assert.equal(s.slack.calls.length, 1, 'concurrent lookups of one email share one call');
  const out = await Promise.all(Array.from({ length: 40 }, (_, i) => sa.resolve(fake(i))));
  assert.equal(s.slack.calls.length, 30, 'at most 30 lookups a minute');
  assert.equal(out.filter((x) => x.error === 'rate_limited').length, 11);
  s.clock.t += 61e3;
  assert.deepEqual(await sa.resolve(fake(39)), { miss: true }, 'and lookups resume next minute');
});

// ---- start nudges for hosts ----
const MIN = 60e3, HOUR = 3600e3;
async function lobbyWithTwo(s, cookies, name = 'Back <Room>') {
  const tb = await s.call(cookies.ann, 'POST', '/api/tables', { name, settings: { buyIn: 100, smallBlind: 1, bigBlind: 2 } });
  const code = tb.body.code;
  return { code, joinBob: () => s.call(cookies.bob, 'POST', `/api/tables/${code}/join`) };
}
const nudgesTo = (s, id) => s.slack.dms.filter((d) => d.to === id && /Start the game/.test(d.text));
const tick = async (s, ms) => { s.clock.t += ms; s.service.slack.sweep(); await s.idle(); };

test('start nudge: host gets one ~10 min after the 2nd player sits, then every 6 h, max 3, in Guntrad\'s voice with a link', async (t) => {
  const s = await boot(); t.after(s.stop);
  const cookies = { ann: await s.login('Ann'), bob: await s.login('Bob') };
  const { code, joinBob } = await lobbyWithTwo(s, cookies);
  await tick(s, 30 * MIN);
  assert.equal(nudgesTo(s, 'UANN').length, 0, 'a host alone at the table is never nudged');
  await joinBob(); await s.idle();
  await tick(s, NUDGE_FIRST_MS - MIN);
  assert.equal(nudgesTo(s, 'UANN').length, 0, 'not before 10 minutes');
  await tick(s, 2 * MIN);
  let n = nudgesTo(s, 'UANN'); assert.equal(n.length, 1, 'first nudge at ~10 minutes');
  assert.match(n[0].text, /2 players are sitting at Back &lt;Room&gt;|2 players are sitting at Back/);
  assert.match(n[0].text, new RegExp(`https://buffalobillsacademy.com/t/${code}`));
  assert.equal(n[0].blocks[1].elements[0].url, `https://buffalobillsacademy.com/t/${code}`);
  assert.match(n[0].blocks[0].text.text, /&lt;Room&gt;/, 'table names are escaped for Slack');
  assert.equal(nudgesTo(s, 'UBOB').length, 0, 'only the host is nudged');
  await tick(s, NUDGE_EVERY_MS - MIN); assert.equal(nudgesTo(s, 'UANN').length, 1, 'no second nudge before 6 hours');
  await tick(s, 2 * MIN); assert.equal(nudgesTo(s, 'UANN').length, 2);
  await tick(s, NUDGE_EVERY_MS + MIN); n = nudgesTo(s, 'UANN'); assert.equal(n.length, 3); assert.match(n[2].text, /Last call/);
  for (let i = 0; i < 4; i++) await tick(s, NUDGE_EVERY_MS + MIN);
  assert.equal(nudgesTo(s, 'UANN').length, NUDGE_MAX, 'never more than 3');
  // persisted on the volume
  const doc = JSON.parse(fs.readFileSync(path.join(s.dir, 'slack-alerts.json'), 'utf8'));
  assert.equal(doc.nudges[code].sent, 3);
});

test('start nudge: stops when the game starts or the table closes; none if alerts are off or the host has no Slack; survives a restart without repeating', async (t) => {
  const s = await boot(); t.after(s.stop);
  const cookies = { ann: await s.login('Ann'), bob: await s.login('Bob'), dan: await s.login('Dan') };
  // starts before the first nudge: nothing
  const a = await lobbyWithTwo(s, cookies, 'Started'); await a.joinBob();
  await s.call(cookies.ann, 'POST', `/api/tables/${a.code}/start`);
  await tick(s, NUDGE_FIRST_MS + MIN);
  assert.equal(nudgesTo(s, 'UANN').length, 0, 'a started game is never nudged');
  // one nudge, then the host starts it: no more
  const b = await lobbyWithTwo(s, cookies, 'Later'); await b.joinBob();
  await tick(s, NUDGE_FIRST_MS + MIN); assert.equal(nudgesTo(s, 'UANN').length, 1);
  await s.call(cookies.ann, 'POST', `/api/tables/${b.code}/start`); await s.idle();
  await tick(s, NUDGE_EVERY_MS + MIN); assert.equal(nudgesTo(s, 'UANN').length, 1, 'starting stops the nudges');
  assert.equal(s.service.slack.state.nudges[b.code], undefined);
  // closed table: no nudges
  const c = await lobbyWithTwo(s, cookies, 'Closed'); await c.joinBob();
  await s.call(cookies.ann, 'POST', `/api/tables/${c.code}/close`);
  await tick(s, NUDGE_FIRST_MS + MIN); assert.equal(nudgesTo(s, 'UANN').length, 1, 'closing stops the nudges');
  // alerts switched off: nothing
  await s.call(cookies.ann, 'POST', '/api/me/slack/prefs', { on: false });
  const d = await lobbyWithTwo(s, cookies, 'Quiet'); await d.joinBob();
  await tick(s, NUDGE_FIRST_MS + MIN); assert.equal(nudgesTo(s, 'UANN').length, 1, 'off means no DM');
  await s.call(cookies.ann, 'POST', '/api/me/slack/prefs', { on: true });
  // a host Slack doesn't know (dan@x.test isn't in the workspace): skipped silently
  const tb = await s.call(cookies.dan, 'POST', '/api/tables', { name: 'Dans', settings: { buyIn: 100, smallBlind: 1, bigBlind: 2 } });
  await s.call(cookies.bob, 'POST', `/api/tables/${tb.body.code}/join`);
  const before = s.slack.dms.length;
  await tick(s, NUDGE_FIRST_MS + MIN);
  assert.equal(s.slack.dms.filter((x) => /Start the game/.test(x.text)).length - nudgesTo(s, 'UANN').length, 0, 'unlinked host gets nothing');
  assert.ok(s.slack.dms.length >= before);
  // restart: a fresh SlackAlerts over the same volume doesn't re-send nudges already counted
  const sent = nudgesTo(s, 'UANN').length;
  const { SlackAlerts } = await import('../server/slack.js');
  const again = new SlackAlerts({ service: s.service, client: s.service.slack.client, publicUrl: 'https://buffalobillsacademy.com' });
  assert.equal(again.state.nudges[d.code].sent, 1, 'the counts were saved on the volume');
  again.sweep(); await again.idle(); again.shutdown();
  assert.equal(nudgesTo(s, 'UANN').length, sent, 'nothing re-sent after a restart');
});

test('start nudge message: three escalating lines, all in Guntrad\'s voice, with a Start button', () => {
  const t = { code: 'ABC123', name: 'Porch', seats: [{ stack: 100 }, { stack: 100 }, { stack: 100 }, null] };
  const msgs = [1, 2, 3].map((n) => nudgeMessage(t, n, { publicUrl: 'https://buffalobillsacademy.com' }));
  assert.equal(new Set(msgs.map((m) => m.text)).size, 3);
  for (const m of msgs) { assert.match(m.text, /3 players/); assert.match(m.text, /https:\/\/buffalobillsacademy.com\/t\/ABC123$/); assert.equal(m.blocks[1].elements[0].text.text, 'Start the game'); assert.ok(m.text.length < 220); }
});

test('a Barn challenge messages the challenged player once, with the stake and a link to the Barn', async (t) => {
  const s = await boot(); t.after(s.stop);
  const cookies = { ann: await s.login('Ann'), bob: await s.login('Bob') };
  const ids = Object.fromEntries(await Promise.all(Object.entries(cookies).map(async ([name, cookie]) => [name, (await s.call(cookie, 'GET', '/api/me')).body.id])));
  const barn = s.service.barn;
  for (const id of Object.values(ids)) { barn.layEgg(id); barn.doc.pens[id].hatchAt = s.clock.t; barn.view(id); barn.doc.pens[id].xp = 160; }
  barn.save();
  const bug = (name) => barn.doc.pens[ids[name]].name;

  const sent = await s.call(cookies.ann, 'POST', '/api/barn/challenges', { to: ids.bob, stake: 25.5 });
  assert.equal(sent.status, 200); await s.idle();
  assert.equal(s.slack.dms.length, 1); assert.equal(s.slack.dms[0].to, 'UBOB');
  assert.equal(s.slack.dms[0].text, `Ann's bug ${bug('ann')} has called out your ${bug('bob')} for $25.50. Accept or decline within a day: https://buffalobillsacademy.com/barn`);
  assert.match(s.slack.dms[0].blocks[0].text.text, /\$25\.50 each, winner takes \$51/);
  assert.equal(s.slack.dms[0].blocks[1].elements[0].url, 'https://buffalobillsacademy.com/barn');
  assert.equal((await s.call(cookies.bob, 'GET', '/api/barn/waiting')).body.challenges, 1);
  assert.equal((await s.call(null, 'GET', '/api/barn/waiting')).status, 401);

  // Asking again is the same challenge, so no second message; a free one says so.
  await s.call(cookies.ann, 'POST', '/api/barn/challenges', { to: ids.bob, stake: 25.5 }); await s.idle();
  assert.equal(s.slack.dms.length, 1);
  await s.call(cookies.bob, 'POST', '/api/barn/challenges', { to: ids.ann, stake: 0 }); await s.idle();
  assert.equal(s.slack.dms.length, 2); assert.equal(s.slack.dms[1].to, 'UANN');
  assert.match(s.slack.dms[1].blocks[0].text.text, /No money, just the grudge/); assert.ok(!s.slack.dms[1].text.includes('$'));
});

test('challenge alerts respect the off switch and never fail the challenge when Slack is down', async (t) => {
  const s = await boot(); t.after(s.stop);
  const cookies = { ann: await s.login('Ann'), bob: await s.login('Bob'), cat: await s.login('Cat') };
  const ids = Object.fromEntries(await Promise.all(Object.entries(cookies).map(async ([name, cookie]) => [name, (await s.call(cookie, 'GET', '/api/me')).body.id])));
  const barn = s.service.barn;
  for (const id of Object.values(ids)) { barn.layEgg(id); barn.doc.pens[id].hatchAt = s.clock.t; barn.view(id); barn.doc.pens[id].xp = 160; }
  barn.save();
  await s.call(cookies.bob, 'POST', '/api/me/slack/prefs', { on: false });
  assert.equal((await s.call(cookies.ann, 'POST', '/api/barn/challenges', { to: ids.bob, stake: 0 })).status, 200); await s.idle();
  assert.equal(s.slack.dms.length, 0, 'alerts off: nothing sent, but the challenge stands');
  assert.equal((await s.call(cookies.bob, 'GET', '/api/barn')).body.challenges.incoming.length, 1);
  s.slack.down = true;
  const during = await s.call(cookies.ann, 'POST', '/api/barn/challenges', { to: ids.cat, stake: 0 }); await s.idle();
  assert.equal(during.status, 200); assert.equal(during.body.challenges.outgoing.length, 2);
  assert.equal(s.slack.dms.length, 0); assert.ok(s.logs.some((line) => line.includes('[slack] challenge failed')));
});

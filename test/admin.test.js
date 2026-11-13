// Admin dashboard: owner-only gate, the new telemetry (visits, IPs, devices, logins, ledger), geo cache and the report math.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Mines, MAX_SHIFT_MS } from '../server/mines.js';
import { Telemetry, areaOf, deviceOf, clientIp, VISIT_GAP_MS, CREDIT_CAP_MS } from '../server/admin/telemetry.js';
import { Geo, privateIp, geoLabel } from '../server/admin/geo.js';
import { buildReport, playerDetail, classify, denverDay, denverHour } from '../server/admin/report.js';
import { adminConfig, isAdmin } from '../server/admin/index.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-admin-')); dirs.push(d); return d; }
async function boot(t, { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-admin-')), env = {}, geoFetch = null, seed } = {}) {
  if (seed) fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify(seed));
  const { app, service, shutdown, telemetry } = createApp({ dataDir, devLogin: true, env: { BJ_TICK_MS: '0', ...env }, geoFetch, snapshots: false, marketSources: [] });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, service, telemetry, dataDir };
}
function agent(base, { ua = WIN, ip = '203.0.113.7' } = {}) {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'user-agent': ua, 'fly-client-ip': ip, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: r.status, body: json, text, headers: r.headers };
  };
  return { get: (u, h) => call('GET', u, null, h), post: (u, b) => call('POST', u, b || {}), setIp: (x) => { ip = x; }, cookie: () => cookie };
}
const ownerSeed = () => ({ [OWNER]: { id: OWNER, name: 'Tyler', createdAt: 1, kind: 'dev', google: { sub: 'dev:tyler@example.com', email: 'tyler@example.com' }, bankroll: 1000, txns: [{ t: 1000, type: 'start', amount: 1000, note: 'Starting bankroll', balance: 1000 }] } });

test('only the owner gets the admin API; everyone else gets 403', async (t) => {
  const s = await boot(t, { env: { ADMIN_PLAYER_IDS: OWNER }, seed: ownerSeed() });
  const anon = agent(s.base);
  assert.equal((await anon.get('/api/admin/report')).status, 403);
  assert.equal((await anon.get('/api/admin/players/' + OWNER)).status, 403);
  assert.equal((await anon.get('/api/admin/ledger.csv')).status, 403);
  // a guest with a browser token
  const guest = await anon.post('/api/players', { name: 'Sneaky' });
  assert.equal((await anon.get('/api/admin/report', { authorization: `Bearer ${guest.body.token}` })).status, 403);
  // another signed-in player
  const other = agent(s.base);
  await other.post('/auth/dev', { email: 'connor@example.com', name: 'Connor' });
  for (const u of ['/api/admin/report', '/api/admin/overview', '/api/admin/players', '/api/admin/money', '/api/admin/mines', '/api/admin/usage', '/api/admin/anomalies', '/api/admin/ledger', '/api/admin/me'])
    assert.equal((await other.get(u)).status, 403, u);
  assert.equal((await other.get('/api/me')).body.admin, undefined);
  // the owner
  const owner = agent(s.base);
  await owner.post('/auth/dev', { email: 'tyler@example.com', name: 'Tyler' });
  assert.equal((await owner.get('/api/me')).body.admin, true);
  const r = await owner.get('/api/admin/report');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  for (const k of ['overview', 'players', 'money', 'mines', 'usage', 'anomalies']) assert.ok(r.body[k], k);
  assert.equal(r.body._detail, undefined, 'internal detail never leaves the server');
  assert.equal((await owner.get('/api/admin/players/' + OWNER)).body.profile.name, 'Tyler');
  assert.equal((await owner.get('/api/admin/players/nope')).status, 404);
});

test('a legacy token for the owner id, or a dev-login account matching ADMIN_EMAILS, is not an admin', () => {
  const cfg = adminConfig({ ADMIN_PLAYER_IDS: 'a, b', ADMIN_EMAILS: 'Boss@Example.com' });
  const g = { id: 'z', google: { sub: 'google-123', email: 'boss@example.com' } };
  assert.equal(isAdmin({ player: g, sessionId: 'x' }, cfg), true);
  assert.equal(isAdmin({ player: { ...g, google: { sub: 'dev:boss@example.com', email: 'boss@example.com' } }, sessionId: 'x' }, cfg), false);
  assert.equal(isAdmin({ player: { id: 'a', google: { sub: 's' } }, sessionId: 'x' }, cfg), true);
  assert.equal(isAdmin({ player: { id: 'a', google: { sub: 's' } }, legacy: true }, cfg), false);
  assert.equal(isAdmin({ player: { id: 'a' }, sessionId: 'x' }, cfg), false, 'a guest record is never an admin');
  assert.equal(isAdmin({ player: { id: 'q', login: { email: 'boss@example.com' } }, sessionId: 'x' }, cfg), false, 'typed username email does not count');
  assert.equal(isAdmin({}, adminConfig({})), false, 'nobody is an admin by default');
});

test('admins.json in the data folder also names the owner', (t) => {
  const d = tmp(t);
  fs.writeFileSync(path.join(d, 'admins.json'), JSON.stringify(['abc']));
  assert.ok(adminConfig({}, d).ids.has('abc'));
});

test('visits, IPs (Fly-Client-IP), devices, sign-ins and sign-outs are recorded', async (t) => {
  const s = await boot(t, { env: { ADMIN_PLAYER_IDS: OWNER }, seed: ownerSeed() });
  const phone = agent(s.base, { ua: IPHONE, ip: '198.51.100.23' });
  const me = (await phone.post('/auth/dev', { email: 'kash@example.com', name: 'Kash' })).body;
  await phone.get('/api/me'); await phone.get('/api/bj'); await phone.get('/api/slots');
  phone.setIp('198.51.100.99'); await phone.get('/api/me');
  await phone.post('/auth/logout');
  const a = s.telemetry.doc.players[me.id];
  assert.ok(a.ips['198.51.100.23'] && a.ips['198.51.100.99']);
  assert.equal(a.devices['iPhone · Safari'].n >= 4, true);
  assert.equal(a.visits.length, 1);
  assert.ok(a.visits[0].areas.blackjack >= 0);
  assert.equal(a.logins, 1);
  const ev = s.telemetry.readEvents().filter((e) => e.p === me.id);
  assert.deepEqual(ev.map((e) => e.k), ['login', 'logout']);
  assert.equal(ev[0].ip, '198.51.100.23'); assert.equal(ev[0].how, 'dev'); assert.equal(ev[0].dev, 'iPhone · Safari');
  const sess = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'sessions.json'), 'utf8'));
  assert.ok(Object.values(sess.sessions).every((x) => x.playerId), 'sessions keep their old shape');
  // the owner sees it all
  const owner = agent(s.base);
  await owner.post('/auth/dev', { email: 'tyler@example.com' });
  const detail = (await owner.get('/api/admin/players/' + me.id)).body;
  assert.equal(detail.ips.length, 2);
  assert.equal(detail.ips[0].location, 'Unknown', 'no geo service in tests: unknown, never a crash');
  assert.ok(detail.timeline.some((x) => x.kind === 'login'));
  assert.ok(detail.timeline.some((x) => x.kind === 'visit'));
  const rows = (await owner.get('/api/admin/players')).body.players;
  assert.equal(rows.find((r) => r.id === me.id).device, 'iPhone · Safari');
  // admin pages themselves are not counted as play
  assert.equal(s.telemetry.doc.players[OWNER]?.visits?.length || 0, 0);
});

test('every bankroll change lands in the ledger; older txns are backfilled once as reconstructed', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-admin-'));
  const seed = ownerSeed();
  seed.p2 = { id: 'p2', name: 'Joe', createdAt: 1, kind: 'google', google: { sub: 'g2' }, bankroll: 1100, txns: [{ t: 1000, type: 'start', amount: 1000, note: 'Starting bankroll', balance: 1000 }, { t: 2000, type: 'mine', amount: 100, note: 'Acid Mines: shift complete', balance: 1100 }] };
  const s = await boot(t, { dataDir, env: { ADMIN_PLAYER_IDS: OWNER }, seed });
  const p = s.service.getPlayer('p2');
  s.service.accounts.change(p, -25, 'shop', 'General Store: Black cowboy hat');
  s.service.accounts.change(p, 60, 'fawn', "Faun's wooden box: $60");
  const lines = s.telemetry.readLedger().filter((x) => x.p === 'p2');
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((x) => !!x.r), [true, true, false, false]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8')).p2).sort(), Object.keys(seed.p2).concat(['stats', 'mining', 'holdings', 'invest']).sort(), 'no new fields on player records');
  const owner = agent(s.base);
  await owner.post('/auth/dev', { email: 'tyler@example.com' });
  const all = (await owner.get('/api/admin/ledger?player=p2')).body;
  assert.equal(all.total, 4);
  assert.equal(all.rows[0].source, 'fawn', 'newest first');
  assert.equal((await owner.get('/api/admin/ledger?player=p2&rec=recorded')).body.total, 2);
  assert.equal((await owner.get('/api/admin/ledger?player=p2&dir=out')).body.rows[0].sub, 'Purchase');
  assert.equal((await owner.get('/api/admin/ledger?source=mines')).body.total, 1);
  assert.equal((await owner.get('/api/admin/ledger?q=cowboy')).body.total, 1);
  const csv = await owner.get('/api/admin/ledger.csv?player=p2');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.equal(csv.text.split('\n').length, 5);
  assert.match(csv.text, /reconstructed/);
  const money = (await owner.get('/api/admin/money')).body.money;
  assert.equal(money.sources.find((x) => x.source === 'store').net, -25);
  assert.equal(money.matrix.find((x) => x.id === 'p2').net.fawn, 60);
});

test('backfill never runs twice across restarts', async (t) => {
  const dataDir = tmp(t);
  fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify(ownerSeed()));
  for (let i = 0; i < 2; i++) { const { shutdown } = createApp({ dataDir, env: { BJ_TICK_MS: '0' }, snapshots: false, marketSources: [] }); shutdown(); }
  const n = fs.readFileSync(path.join(dataDir, 'ledger.jsonl'), 'utf8').trim().split('\n').length;
  assert.equal(n, 1);
});

test('visit math: gaps over 15 minutes start a new visit; one request credits at most 2 minutes', (t) => {
  const store = new Store(tmp(t)); const clock = { now: 1_800_000_000_000 };
  const tel = new Telemetry({ store, now: () => clock.now }); t.after(() => tel.shutdown());
  const req = (url) => ({ player: { id: 'x' }, originalUrl: url, get: (h) => ({ 'fly-client-ip': '203.0.113.1', 'user-agent': WIN })[h] });
  tel.hit(req('/api/tables/ABC'));
  clock.now += 30e3; tel.hit(req('/api/tables/ABC'));
  clock.now += 10 * 60e3; tel.hit(req('/api/mines/state'));
  clock.now += VISIT_GAP_MS + 1; tel.hit(req('/api/bj'));
  const a = tel.doc.players.x;
  assert.equal(a.visits.length, 2);
  assert.equal(a.areas.poker, 30e3);
  assert.equal(a.areas.mines, CREDIT_CAP_MS);
  tel.hit(req('/api/health')); tel.hit(req('/api/admin/report'));
  assert.equal(a.hits, 4, 'health and admin calls are not play');
});

test('retention drops lines older than the window', (t) => {
  const dir = tmp(t); const store = new Store(dir);
  const now = 1_800_000_000_000;
  fs.writeFileSync(path.join(dir, 'events.jsonl'), [JSON.stringify({ t: now - 400 * 86400e3, k: 'old' }), JSON.stringify({ t: now - 1000, k: 'new' }), '{torn'].join('\n'));
  const tel = new Telemetry({ store, now: () => now }); t.after(() => tel.shutdown());
  assert.deepEqual(tel.readEvents().map((e) => e.k), ['new']);
});

test('area and device helpers', () => {
  assert.equal(areaOf('/api/tables/ABC/act'), 'poker');
  assert.equal(areaOf('/api/bj/tables/X/sneak'), 'blackjack');
  assert.equal(areaOf('/api/mines/extract'), 'mines');
  assert.equal(areaOf('/api/foff/quest'), 'golf');
  assert.equal(areaOf('/api/admin/report'), null);
  assert.equal(areaOf('/api/health'), null);
  assert.equal(deviceOf(IPHONE), 'iPhone · Safari');
  assert.equal(deviceOf(WIN), 'Windows · Chrome');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'), 'Android phone · Chrome');
  assert.equal(deviceOf(''), 'Unknown');
  assert.equal(clientIp({ get: (h) => (h === 'fly-client-ip' ? '2001:db8::1' : null), ip: '::ffff:10.0.0.1' }), '2001:db8::1');
  assert.equal(clientIp({ get: () => null, ip: '::ffff:10.0.0.1' }), '10.0.0.1');
});

test('geo: batch lookup, cached, private addresses never sent, failures stay quiet', async (t) => {
  const store = new Store(tmp(t)); const calls = [];
  const fetchImpl = async (url, opt) => { calls.push(JSON.parse(opt.body)); return { ok: true, json: async () => [{ status: 'success', query: '8.8.8.8', city: 'Denver', regionName: 'Colorado', country: 'United States', countryCode: 'US', isp: 'Comcast', lat: 39.7, lon: -104.9 }, { status: 'fail', query: '1.1.1.1' }] }; };
  const geo = new Geo({ store, now: () => 1000, fetchImpl });
  const out = await geo.lookup(['8.8.8.8', '1.1.1.1', '10.0.0.4', '127.0.0.1']);
  assert.deepEqual(calls, [['8.8.8.8', '1.1.1.1']]);
  assert.equal(geoLabel(out['8.8.8.8']), 'Denver, Colorado, US');
  assert.equal(out['8.8.8.8'].isp, 'Comcast');
  assert.equal(geoLabel(out['1.1.1.1']), 'Lookup failed');
  assert.equal(geoLabel(out['10.0.0.4']), 'Private network');
  await geo.lookup(['8.8.8.8']);
  assert.equal(calls.length, 1, 'cached');
  assert.equal(new Geo({ store, fetchImpl: null }).cached('8.8.8.8').city, 'Denver', 'cache survives a restart');
  const broken = new Geo({ store: new Store(tmp(t)), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(geoLabel((await broken.lookup(['9.9.9.9']))['9.9.9.9']), 'Lookup failed');
  assert.ok(privateIp('172.20.1.1') && privateIp('fdaa::3') && !privateIp('172.32.0.1'));
});

test('mine clock-ins and settlements are recorded with encounters and time', (t) => {
  const store = new Store(tmp(t)); const clock = { now: 1_800_000_000_000 };
  const accounts = new Accounts({ store, now: () => clock.now });
  const tel = new Telemetry({ store, now: () => clock.now }); t.after(() => tel.shutdown());
  // scareInt 30000 rolls the faun (28000..47999), never the visitor
  const mines = new Mines({ store, accounts, now: () => clock.now, randInt: () => 0, scareInt: () => 30000, poolInt: () => 30000, vein: () => ({ veinMs: 60000, cells: 7 }) });
  mines.onShiftStart = (id, s, fare) => tel.shiftStart(id, s, fare);
  mines.onShiftEnd = (id, s, r) => tel.shiftEnd(id, s, r);
  const p = store.players.m = { id: 'm', name: 'Miner' }; accounts.ensure(p);
  mines.start(p, { rulesVersion: 2 });
  clock.now += MAX_SHIFT_MS + 1;
  mines.stateFor(p);
  const ev = tel.readEvents();
  assert.deepEqual(ev.map((e) => e.k), ['shift-start', 'shift-end']);
  assert.equal(ev[0].faun, true); assert.equal(ev[0].scare, false);
  assert.equal(ev[1].reason, 'quit'); assert.equal(ev[1].ms, MAX_SHIFT_MS + 1);
});

test('report: money sources, blackjack side and sneak bets, mines, usage in Denver time, anomalies', () => {
  const now = Date.UTC(2026, 10, 13, 18, 0); // 11:00 Denver
  const P = (id, name, extra = {}) => ({ id, name, createdAt: now - 20 * 86400e3, kind: 'google', google: { sub: id }, bankroll: 1000, txns: [], stats: { handsPlayed: 0, handsWon: 0 }, mining: { shifts: 0, earned: 0, history: [], totalMs: 0, timedShifts: 0 }, ...extra });
  const players = {
    a: P('a', 'Connor', { bankroll: 5200, stats: { handsPlayed: 40, handsWon: 30 }, mining: { shifts: 6, earned: 600, totalMs: 6 * 120e3, timedShifts: 6, history: Array.from({ length: 6 }, (_, i) => ({ t: now - i * 3600e3, outcome: 'normal', amount: 100, ms: 120e3 })) } }),
    b: P('b', 'Kash', { bankroll: 300 }),
    c: P('c', 'Joe'),
  };
  const ledger = [
    { t: now - 5 * 86400e3, p: 'a', type: 'start', amt: 1000, bal: 1000, note: 'Starting bankroll', r: 1 },
    { t: now - 3600e3, p: 'a', type: 'foff', amt: 2500, bal: 3500, note: 'Presidential Medal of Freedom: $2,500' },
    { t: now - 1800e3, p: 'a', type: 'mine', amt: 100, bal: 3600, note: 'Acid Mines: shift complete' },
    { t: now - 1700e3, p: 'a', type: 'mine', amt: -20, bal: 3580, note: 'Acid Mines: elevator fare, shaft 9' },
    { t: now - 1600e3, p: 'b', type: 'blackjack', amt: -200, bal: 800, note: 'Blackjack buy-in (AAA)' },
    { t: now - 1500e3, p: 'b', type: 'pvp', amt: -66, bal: 734, note: 'Acid Mines: ambushed by Connor' },
    { t: now - 1500e3, p: 'a', type: 'pvp', amt: 66, bal: 3646, note: 'Acid Mines: ambushed Kash' },
    { t: now - 1400e3, p: 'c', type: 'risk_stake', amt: -10, bal: 990, note: 'Risk stake' },
  ];
  const H = { code: 'AAA', house: 'c' };
  const events = [
    { t: now - 1000, k: 'bj-side', p: 'b', ...H, round: 1, seat: 0, match: 5, pairs: 5 },
    { t: now - 1000, k: 'bj-royal', p: 'b', ...H, round: 1, seat: 0, bet: 'match', tier: 'easy', amt: 12.5 },
    { t: now - 1000, k: 'bj-hand', p: 'b', ...H, round: 1, seat: 0, out: 'win', amt: 20 },
    ...Array.from({ length: 12 }, (_, i) => ({ t: now - 900 + i, k: 'bj-sneak', p: 'b', ...H, round: 2 + i, seat: 0, match: 2, pairs: 0 })),
    { t: now - 800, k: 'bj-royal', p: 'b', ...H, round: 2, seat: 0, bet: 'match', tier: 'royal', amt: 50, sneak: true },
    { t: now - 700, k: 'bj-ins', p: 'b', ...H, round: 3, seat: 0, amt: 5 },
    { t: now - 3000, k: 'shift-start', p: 'a', shift: 's1', scare: true, faun: false, fare: 20 },
    { t: now - 2000, k: 'shift-end', p: 'a', shift: 's1', ms: 200e3, outcome: 'normal', amt: 90, collected: 100, cap: 100, reason: null, scare: true },
    { t: now - 1500, k: 'shift-end', p: 'b', shift: 's2', ms: 50e3, outcome: null, amt: 0, collected: 0, cap: 100, reason: 'quit' },
  ];
  const access = { since: now - 86400e3, players: {
    a: { last: now - 60e3, logins: 2, ips: { '203.0.113.5': { first: now - 9e6, last: now - 60e3, n: 9 } }, devices: { 'Mac · Chrome': { first: 1, last: now, n: 9 } }, visits: [{ s: now - 3600e3, e: now - 60e3, ip: '203.0.113.5', dev: 'Mac · Chrome', n: 9, areas: { poker: 600e3, mines: 300e3 } }], areas: { poker: 600e3, mines: 300e3 } },
    b: { last: now - 120e3, logins: 1, ips: { '203.0.113.5': { first: now - 9e6, last: now - 120e3, n: 3 } }, devices: { 'iPhone · Safari': { first: 1, last: now, n: 3 } }, visits: [], areas: {} },
  } };
  const geo = (ip) => (ip === '203.0.113.5' ? { ip, city: 'Provo', region: 'Utah', cc: 'US', isp: 'Xfinity' } : null);
  const ctx = { now, players, ledger, events, access, geo, docs: { pvp: { raids: { r1: { at: now - 1500e3, kind: 'ambush', winner: 'a', winnerName: 'Connor', loser: 'b', loserName: 'Kash', cash: 66, paid: 66 } } }, sessions: { sessions: {} } } };
  const rep = buildReport(ctx);

  const src = Object.fromEntries(rep.money.sources.map((s) => [s.source, s]));
  assert.equal(src.golf.net, 2500);
  assert.equal(src.mines.net, 80);
  assert.equal(src.mines.subs.find((x) => x.sub === 'Elevator fare').net, -20);
  assert.equal(src.pvp.net, 0);
  assert.equal(src.risk.net, -10);
  assert.equal(rep.overview.money.faucets, 1000 + 80 + 2500);

  const kash = rep.money.blackjack.find((x) => x.id === 'b');
  assert.equal(kash.hands, 20);
  assert.equal(kash.match, 12.5 + 50 - 11 * 2, 'side match win, one sneak win, eleven sneak losses');
  assert.equal(kash.pairs, -5);
  assert.equal(kash.sneakN, 12); assert.equal(kash.sneakWins, 1); assert.equal(kash.sneakStaked, 24); assert.equal(kash.sneakWon, 50);
  assert.equal(kash.ins, -5);
  const house = rep.money.blackjack.find((x) => x.id === 'c');
  assert.equal(house.house, -(kash.hands + kash.match + kash.pairs + kash.ins), 'the player house wins what the players lose');
  assert.equal(house.sneakAgainstN, 12);

  const connorMine = rep.mines.players.find((x) => x.id === 'a');
  assert.equal(connorMine.recorded.scare, 1);
  assert.equal(connorMine.recorded.full, 1);
  assert.equal(connorMine.pvp.won, 1); assert.equal(connorMine.pvp.cashWon, 66);
  assert.equal(rep.mines.totals.quits, 1);
  assert.ok(connorMine.perHour > 0);

  assert.equal(rep.usage.areas[0].area, 'poker');
  assert.equal(rep.usage.hours[10], 8, 'the visit and seven money moves between 10:00 and 11:00 Denver (17:00 UTC) land in the 10 o\'clock bucket');
  assert.equal(rep.usage.hours.reduce((a, b) => a + b, 0), 8);
  assert.equal(rep.overview.active.today, 3);

  const kinds = rep.anomalies.map((x) => x.kind);
  for (const k of ['shared-ip', 'sneak', 'big-win', 'poker-winrate']) assert.ok(kinds.includes(k), k);
  assert.equal(rep.anomalies.find((x) => x.kind === 'sneak').sev, 'med');
  assert.match(rep.anomalies.find((x) => x.kind === 'shared-ip').text, /Provo/);

  const d = playerDetail(rep, ctx, 'a');
  assert.equal(d.ips[0].location, 'Provo, Utah, US');
  assert.equal(d.ledger[0].type, 'pvp');
  assert.equal(d.mines.list.length, 6 + 1, 'six reconstructed shifts and one recorded');
  assert.equal(rep.players.find((r) => r.id === 'a').location, 'Provo, Utah, US');
});

test('classify knows every money type the game writes', () => {
  const src = fs.readFileSync(new URL('../server/accounts.js', import.meta.url), 'utf8') + ['slots/index.js', 'fawn.js', 'mines.js', 'market.js', 'shop.js', 'service.js', 'foff.js', 'foreman.js', 'barn.js', 'pvp.js', 'blackjack/index.js', 'conquest.js']
    .map((f) => fs.readFileSync(new URL(`../server/${f}`, import.meta.url), 'utf8')).join('\n');
  const types = new Set([...src.matchAll(/\.change\([^,]+,[^,]+,\s*'([a-z_-]+)'/g)].map((m) => m[1]));
  types.add('risk_stake'); types.add('risk_refund');
  assert.ok(types.size >= 12);
  for (const ty of types) assert.notEqual(classify(ty, '').source, 'other', ty);
});

test('Denver day and hour', () => {
  assert.equal(denverDay(Date.UTC(2026, 10, 14, 5, 30)), '2026-11-13', '10:30 PM Denver is still the 13th');
  assert.equal(denverHour(Date.UTC(2026, 10, 14, 5, 30)).hour, 22);
});

test('sneak bets are recorded as they are slid on, and the report nets them against the player house', async (t) => {
  const { Blackjack } = await import('../server/blackjack/index.js');
  const { freshDeck } = await import('../server/blackjack/rules.js');
  const dir = tmp(); const f = { now: 1_800_000_000_000 };
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob'].map((id) => [id, { id, name: id, createdAt: f.now - 1000 }]));
  const accounts = new Accounts({ store, now: () => f.now });
  for (const p of Object.values(store.players)) accounts.ensure(p);
  const tel = new Telemetry({ store, now: () => f.now }); t.after(() => tel.shutdown());
  const bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => f.now, tickMs: 0, rng: () => 0 });
  const { watchBlackjack } = await import('../server/admin/telemetry.js');
  watchBlackjack(bj, tel);
  const rig = (p1, up, p2, hole) => { const used = new Set([p1, up, p2, hole]); return [...freshDeck().filter((c) => !used.has(c)), hole, p2, up, p1]; };
  const open = (who, deck) => { const v = bj.create(store.players.house, { settings: { house: 'me', buyIn: 200, houseBank: 500, minBet: 5, maxBetX: 20 } }); bj.join(store.players[who], v.code, true); bj.start(store.players.house, v.code); const tb = bj.table(v.code); tb.deck = deck; return tb; };
  const win = open('ann', rig('Kh', '9c', 'Qh', '8s'));
  bj.bet(store.players.ann, win.code, { bet: 10 });
  bj.sneak(store.players.ann, win.code, { royal: { match: 10 } }); // K-Q suited: +250
  const lose = open('bob', rig('Kh', '9c', 'Qs', '8s'));
  bj.bet(store.players.bob, lose.code, { bet: 10 });
  bj.sneak(store.players.bob, lose.code, { royal: { match: 4 } }); // nothing: -4
  const ev = tel.readEvents();
  assert.equal(ev.filter((e) => e.k === 'bj-sneak').length, 2);
  assert.ok(ev.some((e) => e.k === 'bj-royal' && e.sneak && e.p === 'ann'));
  const rep = buildReport({ now: f.now, players: store.players, ledger: tel.readLedger(), events: ev, access: tel.doc, geo: () => null, docs: { blackjack: bj.doc } });
  const ann = rep.money.blackjack.find((x) => x.id === 'ann'), bob = rep.money.blackjack.find((x) => x.id === 'bob'), house = rep.money.blackjack.find((x) => x.id === 'house');
  assert.equal(ann.sneakWon, 250); assert.equal(ann.match, 250);
  assert.equal(bob.sneakN, 1); assert.equal(bob.match, -4);
  assert.equal(house.sneakAgainst, -246); assert.equal(house.sneakAgainstN, 2);
});

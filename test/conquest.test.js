import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { riskOdds, RISK_LIMITS } from '../server/conquest.js';

const epoch = Date.parse('2026-11-09T12:00:00Z');
const stamp = (ms) => new Date(ms).toISOString();
function remote(clock) {
  const market = { id: 'market-1', gameId: 'game-1', generation: 1, version: 1, status: 'open', gameName: 'Friday conquest', gameUrl: 'https://conquest.test/games/game-1',
    participants: [{ userId: 'u1', name: 'Alice', rating: 850 }, { userId: 'u2', name: 'Bob', rating: 850 }],
    openedAt: stamp(epoch), closesAt: stamp(epoch + 120000), startedAt: null, expiresAt: stamp(epoch + 30 * 86400000), terminal: null };
  const links = new Map(), admissions = new Map();
  const state = { market, links, admissions, fail: false, loseAdmissionResponse: false, reject: false, requests: [], nextUserId: 'u1' };
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  state.fetch = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer test-only-token-012345678901234567890');
    assert.equal(options.redirect, 'error');
    if (state.fail) throw new Error('simulated offline');
    const route = new URL(url).pathname.replace('/api/integrations/academy/v1', '');
    const body = options.body ? JSON.parse(options.body) : undefined;
    state.requests.push({ route, method: options.method, body });
    if (route === '/markets') return response({ markets: [state.market] });
    if (route === `/markets/${state.market.id}`) return response({ market: state.market });
    if (route === '/link-requests') return response({ requestId: 'request-1', authorizeUrl: 'https://conquest.test/academy/link/request-1', expiresAt: stamp(clock.t + 600000) });
    if (route === '/link-redemptions') {
      if (body.code !== 'valid-code') return response({ error: 'Bad code' }, 400);
      const link = { id: `link-${body.academyPlayerId}`, version: 1, academyPlayerId: body.academyPlayerId, conquestUserId: state.nextUserId, conquestName: state.nextUserId, active: true };
      links.set(body.academyPlayerId, link); return response({ link });
    }
    if (route.startsWith('/links/') && route.endsWith('/revoke')) { links.get(body.academyPlayerId).active = false; return response({ revoked: true }); }
    if (route.startsWith('/links/')) return response({ link: links.get(route.slice('/links/'.length)) || null });
    if (route.startsWith('/admissions/')) {
      const id = route.slice('/admissions/'.length);
      if (options.method === 'GET') return admissions.has(id) ? response({ admission: admissions.get(id) }) : response({ error: 'Not found' }, 404);
      if (!admissions.has(id)) admissions.set(id, { intentId: id, status: state.reject || state.market.status !== 'open' || clock.t >= Date.parse(state.market.closesAt) ? 'rejected' : 'accepted', reason: state.reject ? 'link_revoked' : '', decidedAt: stamp(clock.t), terms: body });
      if (state.loseAdmissionResponse) { state.loseAdmissionResponse = false; throw new Error('simulated lost response after commit'); }
      return response({ admission: admissions.get(id) });
    }
    return response({ error: 'Not found' }, 404);
  };
  return state;
}
async function fixture(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-conquest-'));
  const clock = { t: epoch }; const ck = remote(clock);
  const env = { PUBLIC_URL: 'https://academy.test', CONQUESTK_URL: 'https://conquest.test', CONQUESTK_SERVICE_TOKEN: 'test-only-token-012345678901234567890', CONQUESTK_BETTING_ENABLED: 'true', ...extra };
  let active;
  async function boot() {
    const app = createApp({ dataDir: dir, env, now: () => clock.t, conquestFetch: ck.fetch, conquestPollMs: 0, snapshots: false });
    const server = app.app.listen(0); await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (cookie, method, route, body, origin = env.PUBLIC_URL) => {
      const r = await fetch(base + route, { method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0], location: r.headers.get('location') };
    };
    active = { ...app, call, stop: async () => { app.shutdown(); server.closeAllConnections(); await new Promise((r) => server.close(r)); } };
    return active;
  }
  let s = await boot();
  t.after(async () => { await active.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const reg = await s.call(null, 'POST', '/auth/register', { username: 'risk_alice', password: 'riverstone market 27' });
  assert.equal(reg.status, 200);
  const id = reg.body.id, cookie = reg.cookie;
  async function link(userId = 'u1') {
    ck.nextUserId = userId;
    const begin = await active.call(cookie, 'POST', '/api/conquest/link', {}); assert.equal(begin.status, 200);
    const state = active.service.store.players[id].conquest.pendingLink.state;
    const finish = await active.call(cookie, 'GET', `/auth/conquest/callback?code=valid-code&state=${state}`);
    assert.equal(finish.location, '/conquest?linked=1');
  }
  async function quote(outcomeUserId = 'u1', stakeCents = 10000) {
    return active.call(cookie, 'POST', '/api/conquest/quotes', { marketId: ck.market.id, outcomeUserId, stakeCents });
  }
  async function place(q) { return active.call(cookie, 'POST', '/api/conquest/bets', { quoteId: q.body.quote.id }); }
  return { get s() { return active; }, ck, clock, dir, env, id, cookie, link, quote, place,
    restart: async () => { await active.stop(); s = await boot(); return s; } };
}

test('rating odds are normalized winner estimates, use the haircut and cap gross returns', () => {
  const m = remote({ t: epoch }).market;
  assert.deepEqual(riskOdds(m).map((p) => p.oddsHundredths), [190, 190]);
  m.participants[0].rating = 4000;
  const odds = riskOdds(m);
  assert.equal(odds[0].oddsHundredths, null, 'do not inflate unquotable favorite to minimum odds');
  assert.equal(odds[1].oddsHundredths, 2000);
  assert.equal(odds[1].maxStakeCents, 5000);
  assert.equal(odds.reduce((n, p) => n + p.probability, 0), 1);
});

test('linking proves both sessions, is origin protected, and guests cannot wager', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.s.call(null, 'POST', '/api/conquest/link', {})).status, 401);
  assert.equal((await f.s.call(f.cookie, 'POST', '/api/conquest/link', {}, 'https://evil.test')).status, 403);
  assert.equal((await f.s.call(f.cookie, 'POST', '/api/conquest/link', {}, null)).status, 403);
  await f.s.call(f.cookie, 'POST', '/api/conquest/link', {});
  const state = f.s.service.store.players[f.id].conquest.pendingLink.state;
  assert.equal((await f.s.call(null, 'GET', `/auth/conquest/callback?code=valid-code&state=${state}`)).location, '/conquest?linkError=1');
  assert.equal(f.ck.links.size, 0);
  await f.link();
  assert.equal((await f.s.call(f.cookie, 'GET', '/api/conquest')).body.link.conquestUserId, 'u1');
  const lastState = f.ck.requests.filter((r) => r.route === '/link-requests').at(-1).body.state;
  assert.equal((await f.s.call(f.cookie, 'GET', `/auth/conquest/callback?code=valid-code&state=${lastState}`)).location, '/conquest?linked=1', 'lost redirect may replay the completed callback');
  assert.equal((await f.s.call(null, 'GET', '/api/conquest')).body.link, null);
});

test('a fixed quote debits once, conserves escrow worth, hides history and pays once after restart', async (t) => {
  const f = await fixture(t); await f.link();
  assert.equal((await f.quote('u2')).status, 403, 'a participant cannot back another player');
  const q = await f.quote(); assert.equal(q.status, 200);
  assert.equal(q.body.quote.grossCents, 19000);
  const [a, b] = await Promise.all([f.place(q), f.place(q)]);
  assert.ok([200, 202].includes(a.status)); assert.ok([200, 202].includes(b.status));
  assert.equal(f.s.service.store.players[f.id].bankroll, 900);
  const me = (await f.s.call(f.cookie, 'GET', '/api/me')).body;
  assert.equal(me.worth.riskEscrow, 100); assert.equal(me.worth.total, 1000);
  assert.equal((await f.s.call(null, 'GET', '/api/conquest')).body.bets.length, 0);
  const publicProfile = (await f.s.call(null, 'GET', `/api/players/${f.id}/profile`)).body;
  assert.equal('riskEscrow' in publicProfile.worth, false, 'public profile does not disclose the wager breakdown');
  const board = (await f.s.call(null, 'GET', '/api/leaderboard')).body;
  assert.equal(board.rows.some((p) => 'riskEscrow' in p), false);
  assert.equal((await f.quote()).status, 409);
  assert.equal((await f.s.call(f.cookie, 'POST', '/api/conquest/unlink', {})).status, 409);
  assert.equal((await f.s.call(f.cookie, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'riverstone market 27' })).status, 409);
  f.ck.market.status = 'settled'; f.ck.market.startedAt = stamp(epoch + 120000);
  f.ck.market.participants[0].name = 'Deleted player';
  f.ck.market.terminal = { kind: 'winner', winnerUserId: 'u1', reason: 'completed', finalizedAt: stamp(epoch + 500000) };
  await f.restart();
  await f.s.service.conquest.reconcile(); await f.s.service.conquest.reconcile();
  assert.equal(f.s.service.store.players[f.id].bankroll, 1090);
  assert.equal((await f.s.call(f.cookie, 'GET', '/api/conquest')).body.bets[0].outcomeName, 'Deleted player', 'anonymized winner still pays using the stable UUID');
  assert.equal(f.s.service.conquest.escrow(f.s.service.store.players[f.id]), 0);
  assert.equal((await f.place(q)).body.bet.state, 'won', 'persisted idempotency precedes expired transient quote');
  assert.equal(f.s.service.store.players[f.id].bankroll, 1090);
  assert.equal(f.s.service.conquest.diagnostics().netIssuanceCents, 9000);
});

test('lost accepted response stays held; late result and revoked link recover without a second debit', async (t) => {
  const f = await fixture(t); await f.link(); f.ck.loseAdmissionResponse = true;
  const q = await f.quote(); const r = await f.place(q);
  assert.equal(r.status, 202); assert.equal(r.body.bet.state, 'pending');
  f.ck.links.get(f.id).active = false;
  f.clock.t += 31 * 86400000;
  f.ck.market.status = 'settled'; f.ck.market.startedAt = stamp(epoch + 120000);
  f.ck.market.terminal = { kind: 'winner', winnerUserId: 'u1', reason: 'completed', finalizedAt: stamp(epoch + 29 * 86400000) };
  await f.restart(); await f.s.service.conquest.reconcile();
  assert.equal(f.s.service.store.players[f.id].bankroll, 1090, 'authoritative day29 result pays when recovered day31');
  assert.equal(f.s.service.store.players[f.id].conquest.bets[q.body.quote.id].state, 'won');
});

test('a timeout before admission is not a refund; only durable rejection refunds', async (t) => {
  const f = await fixture(t); await f.link(); const q = await f.quote(); f.ck.fail = true;
  assert.equal((await f.place(q)).body.bet.state, 'pending');
  await f.s.service.conquest.reconcile();
  assert.equal(f.s.service.store.players[f.id].bankroll, 900);
  f.ck.fail = false; f.ck.reject = true;
  await f.s.service.conquest.reconcile(); await f.s.service.conquest.reconcile();
  assert.equal(f.s.service.store.players[f.id].bankroll, 1000);
  assert.equal(f.s.service.store.players[f.id].conquest.bets[q.body.quote.id].state, 'rejected');
  f.ck.reject = false;
  assert.equal((await f.quote()).status, 200, 'a definitive non-admission does not consume the one accepted wager');
});

test('void returns only the stake, loss returns nothing, and placement checks current spendable funds', async (t) => {
  const f = await fixture(t); await f.link('spectator');
  const q = await f.quote('u2'); assert.equal(q.status, 200, 'spectator may choose either participant');
  f.s.service.accounts.change(f.s.service.store.players[f.id], -950, 'test', 'Other game buy-in');
  assert.equal((await f.place(q)).status, 402);
  f.s.service.accounts.change(f.s.service.store.players[f.id], 950, 'test', 'Other game cash-out');
  await f.place(q);
  f.ck.market.status = 'void'; f.ck.market.terminal = { kind: 'void', winnerUserId: null, reason: 'roster_changed', finalizedAt: stamp(epoch + 30000) };
  await f.s.service.conquest.reconcile(); assert.equal(f.s.service.store.players[f.id].bankroll, 1000);
  f.ck.market = { ...f.ck.market, id: 'market-2', generation: 2, status: 'open', terminal: null };
  await f.place(await f.quote('u2'));
  f.ck.market.status = 'settled'; f.ck.market.startedAt = stamp(epoch + 120000);
  f.ck.market.terminal = { kind: 'winner', winnerUserId: 'u1', reason: 'completed', finalizedAt: stamp(epoch + 500000) };
  await f.s.service.conquest.reconcile(); assert.equal(f.s.service.store.players[f.id].bankroll, 900);
});

test('invalid/expired quotes and return caps never debit a bankroll', async (t) => {
  const f = await fixture(t); await f.link('spectator');
  for (const amount of [0, 99, 10001, 100.1, null]) assert.equal((await f.quote('u1', amount)).status, 400);
  const q = await f.quote(); f.clock.t += 61000;
  assert.equal((await f.place(q)).status, 409);
  f.ck.market.participants[0].rating = 4000;
  assert.equal((await f.quote('u1', 100)).status, 400);
  assert.equal((await f.quote('u2', 5001)).status, 400);
  assert.equal((await f.quote('u2', 5000)).body.quote.grossCents, RISK_LIMITS.maxGrossCents);
  assert.equal(f.s.service.store.players[f.id].bankroll, 1000);
});

test('failed staged write leaves live references and money untouched and fails wagering closed', async (t) => {
  const f = await fixture(t); await f.link(); const q = await f.quote();
  const player = f.s.service.store.players[f.id], holdings = player.holdings;
  const before = fs.readFileSync(path.join(f.dir, 'players.json'), 'utf8');
  f.s.service.store.commitPlayerDrafts = () => { throw new Error('simulated disk failure'); };
  assert.equal((await f.place(q)).status, 503);
  assert.equal(player.bankroll, 1000); assert.equal(player.holdings, holdings);
  assert.equal(Object.keys(player.conquest.bets).length, 0);
  assert.equal(fs.readFileSync(path.join(f.dir, 'players.json'), 'utf8'), before);
  assert.equal((await f.quote()).status, 503);
  assert.equal(f.ck.admissions.size, 0);
});

test('recovery remains active with new wagering disabled; malformed persisted ledgers fail closed', async (t) => {
  const f = await fixture(t); await f.link(); await f.place(await f.quote());
  f.env.CONQUESTK_BETTING_ENABLED = 'false';
  f.ck.market.status = 'void'; f.ck.market.terminal = { kind: 'void', winnerUserId: null, reason: 'cancelled', finalizedAt: stamp(epoch + 30000) };
  await f.restart(); await f.s.service.conquest.reconcile();
  assert.equal(f.s.service.store.players[f.id].bankroll, 1000);
  assert.equal((await f.quote()).status, 503);
  f.s.service.store.players[f.id].conquest.bets.broken = { state: 'accepted' }; f.s.service.store.savePlayers();
  await f.restart();
  assert.ok(f.s.service.conquest.fault);
  assert.equal((await f.s.call(f.cookie, 'GET', '/api/me')).status, 200, 'other game account remains available');
  assert.equal((await f.s.call(f.cookie, 'POST', '/api/conquest/link', {})).status, 503);
});

test('pending reservations count toward market and global gross liability caps', async (t) => {
  const f = await fixture(t); await f.link(); await f.place(await f.quote());
  const template = Object.values(f.s.service.store.players[f.id].conquest.bets)[0];
  const make = (marketId, outcomeUserId, grossCents) => ({ p: {}, bet: { ...template, state: 'pending', terms: { ...template.terms, marketId, outcomeUserId, grossCents } } });
  const service = f.s.service.conquest;
  service.allBets = () => [make('m1', 'u1', RISK_LIMITS.marketGrossCents), make('m1', 'u2', 100)];
  assert.doesNotThrow(() => service.checkExposure(), 'different outcomes use the maximum, not a sum');
  assert.throws(() => service.checkExposure({ marketId: 'm1', outcomeUserId: 'u1', grossCents: 1 }), /house limit/);
  service.allBets = () => [make('m1', 'u1', 1000000), make('m2', 'u1', 1000000), make('m3', 'u1', 500000)];
  assert.doesNotThrow(() => service.checkExposure());
  assert.throws(() => service.checkExposure({ marketId: 'm4', outcomeUserId: 'u1', grossCents: 1 }), /house limit/);
});

test('pilot limits affect new bets but not account linking; original player and holdings references survive commits', async (t) => {
  const f = await fixture(t, { CONQUESTK_PILOT_PLAYER_IDS: 'another-player' });
  const player = f.s.service.store.players[f.id], holdings = player.holdings;
  await f.link();
  assert.equal(f.s.service.store.players[f.id], player); assert.equal(player.holdings, holdings);
  assert.equal((await f.quote()).status, 503);
  assert.equal((await f.s.call(f.cookie, 'GET', '/api/conquest')).body.canBet, false);
  assert.equal((await f.s.call(f.cookie, 'POST', '/api/conquest/unlink', {})).status, 200);
  assert.equal(player.conquest.link.active, false);
});

test('link history is not discarded by claiming a legacy guest, and linked accounts must unlink before deletion', async (t) => {
  const f = await fixture(t); await f.link();
  const guest = await f.s.call(null, 'POST', '/api/players', { name: 'Old guest' });
  const result = await f.s.call(f.cookie, 'POST', '/api/auth/claim-legacy', { token: guest.body.token });
  assert.equal(result.status, 200); assert.equal(result.body.merged, false);
  assert.equal(f.s.service.store.players[f.id].conquest.link.active, true);
  assert.equal((await f.s.call(f.cookie, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'riverstone market 27' })).status, 409);
  await f.s.call(f.cookie, 'POST', '/api/conquest/unlink', {});
  assert.equal((await f.s.call(f.cookie, 'DELETE', '/api/me', { confirm: 'DELETE', password: 'riverstone market 27' })).status, 200);
});

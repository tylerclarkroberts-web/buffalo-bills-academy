import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Barn, BOUT_COOLDOWN_MS, BOUT_XP, CHALLENGE_OPEN_MS, FIGHT_LOG } from '../server/barn.js';
import { Store } from '../server/store.js';
import { ROSTER, xpFor } from '../server/engine/creatures.js';

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'bba-barn-combat-');
  const dataDir = fs.mkdtempSync(prefix);
  const clock = { now: 1_800_000_000_000 };
  let running, server, base;
  const boot = async () => {
    running = createApp({ dataDir, now: () => clock.now, devLogin: true, env: { BARN_INCUBATE_MS: '1' } });
    server = await new Promise(resolve => { const s = running.app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    running.shutdown(); server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  };
  await boot();
  t.after(async () => {
    await stop();
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(prefix)));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const client = headers => async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  const anon = client({});
  const login = async name => {
    const res = await anon('POST', '/auth/dev', { name, email: `${name.toLowerCase()}@example.test` });
    assert.equal(res.status, 200);
    return { id: res.body.id, api: client({ cookie: res.headers.get('set-cookie').split(';')[0] }) };
  };
  const owner = await login('BugOwner'), other = await login('OtherRancher');
  const hatch = (id, level = 3) => {
    const barn = running.service.barn;
    barn.layEgg(id); clock.now += 1; barn.view(id);
    barn.doc.pens[id].xp = xpFor(level); barn.save();
    return barn.doc.pens[id];
  };
  return { dataDir, clock, get service() { return running.service; }, get barn() { return running.service.barn; },
    anon, owner, other, client, hatch, login, restart: async () => { await stop(); await boot(); } };
}

const post = (player, stake = 0) => player.api('POST', '/api/barn/bouts', { stake });
const join = (player, id, body = {}) => player.api('POST', `/api/barn/bouts/${id}/join`, body);
const cancel = (player, id) => player.api('DELETE', `/api/barn/bouts/${id}`);
const recordCount = pen => Object.values(pen.record || {}).reduce((sum, count) => sum + count, 0);
const balance = (f, player) => f.service.getPlayer(player.id).bankroll;

test('battle settings require authentication and can change only the caller\'s bug', async t => {
  const { anon, owner, other, client, hatch, barn } = await fixture(t);
  hatch(owner.id, 6); hatch(other.id, 6);
  const settings = { stance: 'aggressive', specials: ['technique', 'signature'] };
  assert.equal((await anon('PATCH', '/api/barn/battle', settings)).status, 401);
  const beforeOther = structuredClone(barn.doc.pens[other.id]);
  const save = await owner.api('PATCH', '/api/barn/battle', settings);
  assert.equal(save.status, 200, JSON.stringify(save.body));
  assert.deepEqual(save.body.pen.battle, settings);
  assert.deepEqual(barn.doc.pens[other.id], beforeOther);
  assert.equal((await owner.api('PATCH', '/api/barn/battle', { ...settings, playerId: other.id })).status, 400);
  assert.deepEqual(barn.doc.pens[other.id], beforeOther);
  const guest = (await anon('POST', '/api/players', { name: 'Legacy Rancher' })).body;
  hatch(guest.id, 4);
  const guestApi = client({ authorization: `Bearer ${guest.token}` });
  const guestSave = await guestApi('PATCH', '/api/barn/battle', { stance: 'defensive', specials: ['technique'] });
  assert.equal(guestSave.status, 200, 'existing bearer guests retain access to their own Barn');
  assert.deepEqual(guestSave.body.pen.battle, { stance: 'defensive', specials: ['technique'] });
});

test('battle settings reject malformed, duplicate, basic and locked selections without changing saved choices', async t => {
  const { owner, hatch, barn, dataDir, clock } = await fixture(t);
  hatch(owner.id, 4);
  const settings = { stance: 'balanced', specials: ['technique'] };
  assert.equal((await owner.api('PATCH', '/api/barn/battle', settings)).status, 200);
  const before = structuredClone(barn.doc);
  for (const body of [
    {}, [], { specials: [] }, { stance: 'balanced' },
    { stance: 'unknown', specials: [] }, { stance: 'balanced', specials: 'technique' },
    { stance: 'balanced', specials: ['technique', 'technique'] },
    { stance: 'balanced', specials: ['technique', 'signature', 'tactic'] },
    { stance: 'balanced', specials: ['basic'] }, { stance: 'balanced', specials: ['signature'] },
    { stance: 'balanced', specials: ['missing'] }, { stance: 'balanced', specials: [null] },
    { ...settings, xp: 99999 },
  ]) {
    const result = await owner.api('PATCH', '/api/barn/battle', body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(barn.doc, before);
  }
  const empty = { stance: 'defensive', specials: [] };
  assert.equal((await owner.api('PATCH', '/api/barn/battle', empty)).status, 200, 'basic-only is a valid choice');
  const reloaded = new Barn({ store: new Store(dataDir), now: () => clock.now });
  assert.deepEqual(reloaded.view(owner.id).pen.battle, empty);
});

test('paid open bouts use the chosen opponent, settle both wallets and award both bugs once', async t => {
  const f = await fixture(t);
  const { owner, other, barn, clock } = f;
  const pen = f.hatch(owner.id);
  pen.xp = xpFor(4) - 10; pen.xpToday = 120; pen.xpDay = Math.floor(clock.now / 86400e3);
  const rival = f.hatch(other.id, 10); rival.xpToday = 120; rival.xpDay = pen.xpDay; barn.save();
  const opened = await post(owner, 100.25);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const listing = opened.body.openBout;
  assert.equal(listing.stake, 100.25); assert.equal(listing.fighter.level, 3);
  assert.equal(balance(f, owner), 899.75); assert.equal(balance(f, other), 1000);
  assert.equal(opened.body.pen.xp, xpFor(4) - 10); assert.equal(recordCount(opened.body.pen), 0);
  const available = (await other.api('GET', '/api/barn')).body;
  assert.equal(available.bouts.length, 1); assert.equal(available.bouts[0].id, listing.id);
  assert.equal(available.bouts[0].fighter.level, 3, 'high-level players can voluntarily join low-level bugs');
  assert.equal(available.openBout, null);
  assert.equal('seed' in available.bouts[0], false); assert.equal('email' in available.bouts[0], false);
  const joined = await join(other, listing.id);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  const guestResult = joined.body.pen.lastBout;
  const host = (await owner.api('GET', '/api/barn')).body;
  const hostResult = host.pen.lastBout;
  assert.equal(host.openBout, null); assert.equal(host.bouts.length, 0);
  assert.equal(hostResult.id, listing.id); assert.equal(guestResult.id, listing.id);
  assert.equal(hostResult.you.name, guestResult.them.name); assert.equal(hostResult.them.name, guestResult.you.name);
  assert.deepEqual(hostResult.maxHp, [...guestResult.maxHp].reverse());
  hostResult.rounds.forEach((round, i) => {
    assert.equal(round.by, 1 - guestResult.rounds[i].by);
    assert.deepEqual(round.hp, [...guestResult.rounds[i].hp].reverse());
    assert.equal(round.line, guestResult.rounds[i].line);
  });
  assert.equal(host.pen.xp, xpFor(4) + 10); assert.equal(host.pen.level, 4);
  assert.equal(hostResult.you.level, 3); assert.equal(hostResult.levelBefore, 3); assert.equal(hostResult.levelAfter, 4);
  assert.equal(joined.body.pen.level, 10); assert.equal(joined.body.pen.xp, xpFor(10) + BOUT_XP);
  assert.equal(joined.body.pen.xpNext, null);
  for (const [player, result] of [[owner, host], [other, joined.body]]) {
    assert.equal(result.pen.lastBout.xpEarned, BOUT_XP);
    assert.equal(result.pen.boutCoolMs, BOUT_COOLDOWN_MS); assert.equal(recordCount(result.pen), 1);
    assert.equal(barn.doc.pens[player.id].xpToday, 120);
    const expectedNet = result.pen.lastBout.result === 'won' ? 100.25 : result.pen.lastBout.result === 'lost' ? -100.25 : 0;
    assert.equal(result.pen.lastBout.net, expectedNet);
    assert.equal(result.pen.lastBout.payout, expectedNet + 100.25);
    assert.equal(balance(f, player), 1000 + expectedNet);
    assert.equal((await post(player)).status, 429);
  }
  assert.equal(balance(f, owner) + balance(f, other), 2000);
  const savedPlayers = structuredClone(f.service.store.players), savedPens = structuredClone(barn.doc.pens);
  assert.equal((await join(other, listing.id)).status, 200, 'retrying the accepted join returns its receipt');
  for (let i = 0; i < 3; i++) await Promise.all([owner.api('GET', '/api/barn'), other.api('GET', '/api/barn')]);
  assert.deepEqual(f.service.store.players, savedPlayers); assert.deepEqual(barn.doc.pens, savedPens);
  await f.restart();
  assert.deepEqual((await owner.api('GET', '/api/barn')).body.pen.lastBout, hostResult);
  assert.deepEqual((await other.api('GET', '/api/barn')).body.pen.lastBout, guestResult);
  assert.equal(balance(f, owner) + balance(f, other), 2000);
});

test('open bouts require authentication, valid stakes, a mature living bug and available funds', async t => {
  const f = await fixture(t); const { owner, other, anon, barn } = f;
  assert.equal((await anon('POST', '/api/barn/bouts', { stake: 1 })).status, 401);
  assert.equal((await anon('POST', '/api/barn/bouts/missing/join', {})).status, 401);
  assert.equal((await anon('DELETE', '/api/barn/bouts/missing')).status, 401);
  assert.equal((await post(owner)).status, 404);
  barn.layEgg(owner.id); assert.equal((await post(owner)).status, 409);
  f.clock.now++; barn.view(owner.id); assert.equal((await post(owner)).status, 409);
  barn.doc.pens[owner.id].xp = xpFor(3); barn.save();
  f.hatch(other.id, 3);
  const playersBefore = structuredClone(f.service.store.players), pensBefore = structuredClone(barn.doc.pens);
  for (const body of [{}, [], { stake: null }, { stake: true }, { stake: '10' }, { stake: -1 }, { stake: 0.001 },
    { stake: 10000.01 }, { stake: 1e100 }, { stake: 1, playerId: other.id }, { stake: 1, winner: owner.id }]) {
    const result = await owner.api('POST', '/api/barn/bouts', body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(f.service.store.players, playersBefore); assert.deepEqual(barn.doc.pens, pensBefore);
  }
  assert.equal((await post(owner, 1001)).status, 402);
  const opened = await post(owner, 1000);
  assert.equal(opened.status, 200); assert.equal(balance(f, owner), 0);
  const retry = await post(owner, 1000);
  assert.equal(retry.status, 200); assert.equal(retry.body.openBout.id, opened.body.openBout.id);
  assert.equal(balance(f, owner), 0, 'retrying the same listing does not debit again');
  assert.equal((await post(owner)).status, 409);
  assert.equal((await join(owner, opened.body.openBout.id)).status, 409);
  for (const body of [{ stake: 0 }, { playerId: owner.id }, { winner: other.id }, []]) {
    assert.equal((await join(other, opened.body.openBout.id, body)).status, 400);
  }
  f.service.accounts.change(f.service.getPlayer(other.id), -1, 'test', 'Fixture funds');
  assert.equal((await join(other, opened.body.openBout.id)).status, 402);
  assert.equal((await other.api('GET', '/api/barn')).body.bouts.length, 1);
  assert.equal((await owner.api('POST', '/api/barn/bout', {})).status, 409, 'old clients cannot trigger automatic opponents');
  assert.equal((await cancel(owner, opened.body.openBout.id)).status, 200);
  barn.doc.pens[owner.id].stage = 'dead'; barn.save();
  assert.equal((await post(owner)).status, 409);
});

test('posting freezes the advertised setup; cancellation and expiry refund without XP or cooldown', async t => {
  const f = await fixture(t); const { owner, other, barn, clock } = f;
  f.hatch(owner.id, 6); f.hatch(other.id, 6);
  const opened = await post(owner, 10.01); const id = opened.body.openBout.id;
  const beforeXp = opened.body.pen.xp;
  assert.equal((await owner.api('PATCH', '/api/barn/battle', { stance: 'aggressive', specials: ['technique'] })).status, 409);
  assert.ok([403, 404].includes((await cancel(other, id)).status));
  const ownSecond = await post(other, 5); assert.equal(ownSecond.status, 200);
  assert.equal((await join(other, id)).status, 409, 'a player cannot keep a listing and join another bout');
  await cancel(other, ownSecond.body.openBout.id);
  barn.doc.pens[owner.id].xp = xpFor(10); barn.save();
  const advertised = (await other.api('GET', '/api/barn')).body.bouts.find(bout => bout.id === id);
  assert.deepEqual(advertised.fighter, opened.body.openBout.fighter, 'care progression cannot silently alter the advertised combat snapshot');
  const cancelled = await cancel(owner, id);
  assert.equal(cancelled.status, 200); assert.equal(balance(f, owner), 1000);
  assert.equal(cancelled.body.openBout, null); assert.equal(cancelled.body.pen.boutCoolMs, 0);
  assert.equal(recordCount(cancelled.body.pen), 0); assert.equal(cancelled.body.pen.xp, xpFor(10));
  const reposted = await post(owner, 25); assert.equal(reposted.status, 200);
  const expiry = reposted.body.openBout.expiresAt;
  assert.equal(expiry - clock.now, 60 * 60e3);
  await f.restart();
  assert.equal((await owner.api('GET', '/api/barn')).body.openBout.id, reposted.body.openBout.id);
  clock.now = expiry;
  const after = (await owner.api('GET', '/api/barn')).body;
  assert.equal(after.openBout, null); assert.equal(after.bouts.length, 0);
  assert.equal(balance(f, owner), 1000); assert.equal(after.pen.xp, xpFor(10));
  assert.equal(after.pen.boutCoolMs, 0); assert.equal(recordCount(after.pen), 0);
  assert.ok((await join(other, reposted.body.openBout.id)).status >= 400);
  await owner.api('GET', '/api/barn'); assert.equal(balance(f, owner), 1000);
  assert.equal(beforeXp, xpFor(6));
});

test('escrow remains in net worth, stays private, and blocks account deletion until cancelled', async t => {
  const f = await fixture(t); const { owner } = f;
  f.hatch(owner.id);
  const opened = await post(owner, 100);
  const me = (await owner.api('GET', '/api/me')).body;
  assert.equal(me.worth.barnEscrow, 100); assert.equal(me.worth.total, 1000);
  const profile = (await f.anon('GET', `/api/players/${owner.id}/profile`)).body;
  assert.equal('barnEscrow' in profile.worth, false);
  const board = (await f.anon('GET', '/api/leaderboard')).body;
  assert.equal(board.rows.some(row => 'barnEscrow' in row), false);
  assert.equal((await owner.api('DELETE', '/api/me', { confirm: 'DELETE' })).status, 409);
  await cancel(owner, opened.body.openBout.id);
  assert.equal((await owner.api('DELETE', '/api/me', { confirm: 'DELETE' })).status, 200);
});

test('a dead or replaced host invalidates its listing and refunds the stake once', async t => {
  const f = await fixture(t); const { owner, other, barn } = f;
  const living = structuredClone(f.hatch(owner.id, 6)); f.hatch(other.id, 6);
  for (const invalidation of ['dead', 'replaced']) {
    barn.doc.pens[owner.id] = structuredClone(living); barn.save();
    const opened = await post(owner, 123.45);
    assert.equal(opened.status, 200); assert.equal(balance(f, owner), 876.55);
    if (invalidation === 'dead') barn.doc.pens[owner.id].stage = 'dead';
    else barn.doc.pens[owner.id].bornAt++;
    barn.save();
    assert.equal((await join(other, opened.body.openBout.id)).status, 409, invalidation);
    assert.equal(balance(f, owner), 1000); assert.equal(balance(f, other), 1000);
    const board = (await other.api('GET', '/api/barn')).body;
    assert.equal(board.bouts.length, 0); assert.equal(board.pen.xp, xpFor(6));
    assert.equal(barn.doc.pens[owner.id].xp, xpFor(6));
    assert.equal(recordCount(board.pen), 0); assert.equal(recordCount(barn.doc.pens[owner.id]), 0);
    assert.equal((await cancel(owner, opened.body.openBout.id)).status, 200, 'refund retry is harmless');
    assert.equal(balance(f, owner), 1000);
  }
  await f.restart();
  assert.equal(balance(f, owner), 1000); assert.equal(balance(f, other), 1000);
  assert.equal((await other.api('GET', '/api/barn')).body.bouts.length, 0);
});

test('only one competing join can claim an open bout, including a free bout', async t => {
  const f = await fixture(t); const { owner, other } = f;
  const third = await f.login('ThirdRancher');
  for (const player of [owner, other, third]) f.hatch(player.id, 3);
  const opened = await post(owner, 0); assert.equal(opened.status, 200);
  const results = await Promise.all([join(other, opened.body.openBout.id), join(third, opened.body.openBout.id)]);
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status >= 400).length, 1);
  const winnerIndex = results.findIndex(result => result.status === 200), participants = [other, third];
  const accepted = participants[winnerIndex], rejected = participants[1 - winnerIndex];
  const acceptedView = (await accepted.api('GET', '/api/barn')).body;
  assert.equal(acceptedView.pen.xp, xpFor(3) + BOUT_XP);
  assert.equal(acceptedView.pen.lastBout.stake, 0); assert.equal(acceptedView.pen.lastBout.net, 0);
  assert.equal((await rejected.api('GET', '/api/barn')).body.pen.xp, xpFor(3));
  assert.equal(recordCount((await rejected.api('GET', '/api/barn')).body.pen), 0);
  for (const player of [owner, other, third]) assert.equal(balance(f, player), 1000);
});

test('wins, losses and draws award both players; a draw returns both stakes', async t => {
  const f = await fixture(t); const { owner, other, barn, clock } = f;
  for (const player of [owner, other]) f.hatch(player.id, 6);
  const outcomes = new Set();
  let seed = 0;
  barn.eggInt = n => seed % n;
  for (; seed < 256 && outcomes.size < 3; seed++) {
    for (const player of [owner, other]) {
      const pen = barn.doc.pens[player.id];
      pen.xp = xpFor(6); pen.boutAt = 0; pen.species = 'lamprima';
      pen.battle = { stance: 'defensive', specials: ['technique', 'signature'] };
      pen.stats = Object.fromEntries(['hunger', 'mood', 'clean'].map(stat => [stat, { v: 0, at: clock.now }]));
    }
    barn.save(); const balances = [balance(f, owner), balance(f, other)];
    const opened = await post(owner, 1); assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const accepted = await join(other, opened.body.openBout.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const result = accepted.body.pen.lastBout.result; outcomes.add(result);
    assert.equal(accepted.body.pen.xp, xpFor(6) + BOUT_XP);
    assert.equal((await owner.api('GET', '/api/barn')).body.pen.xp, xpFor(6) + BOUT_XP);
    assert.equal(balance(f, owner) + balance(f, other), 2000);
    if (result === 'draw') assert.deepEqual([balance(f, owner), balance(f, other)], balances);
  }
  assert.deepEqual([...outcomes].sort(), ['draw', 'lost', 'won']);
});

test('failed wallet persistence cannot publish, cancel or settle a wager', async t => {
  const f = await fixture(t); const { owner, other, barn, service } = f;
  f.hatch(owner.id, 6); f.hatch(other.id, 6);
  const commit = service.store.commitPlayerDrafts.bind(service.store);
  t.after(() => { service.store.commitPlayerDrafts = commit; });
  service.store.commitPlayerDrafts = () => { throw new Error('simulated wallet write failure'); };
  const before = structuredClone(service.store.players);
  assert.equal((await post(owner, 100)).status, 500); assert.deepEqual(service.store.players, before);
  service.store.commitPlayerDrafts = commit;
  const opened = await post(owner, 100); assert.equal(opened.status, 200);
  const escrow = structuredClone(service.store.players), pens = structuredClone(barn.doc.pens);
  service.store.commitPlayerDrafts = () => { throw new Error('simulated wallet write failure'); };
  assert.equal((await cancel(owner, opened.body.openBout.id)).status, 500);
  assert.equal((await join(other, opened.body.openBout.id)).status, 500);
  assert.deepEqual(service.store.players, escrow); assert.deepEqual(barn.doc.pens, pens);
  service.store.commitPlayerDrafts = commit;
  assert.equal((await join(other, opened.body.openBout.id)).status, 200);
  assert.equal(balance(f, owner) + balance(f, other), 2000);
});

test('durable settlement receipts recover XP and replay after a failed Barn write and restart', async t => {
  const f = await fixture(t); const { owner, other, barn, service, dataDir } = f;
  f.hatch(owner.id, 6); f.hatch(other.id, 6);
  const opened = await post(owner, 100); assert.equal(opened.status, 200);
  const pensBefore = structuredClone(barn.doc.pens);
  const diskBefore = fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8');
  const saveDoc = service.store.saveDoc.bind(service.store);
  service.store.saveDoc = (name, doc) => { if (name === 'barn') throw new Error('simulated Barn write failure'); return saveDoc(name, doc); };
  t.after(() => { service.store.saveDoc = saveDoc; });
  assert.equal((await join(other, opened.body.openBout.id)).status, 500);
  assert.equal(balance(f, owner) + balance(f, other), 2000, 'money has committed together despite the second-file failure');
  const committedPlayers = JSON.parse(JSON.stringify(service.store.players));
  assert.deepEqual(barn.doc.pens, pensBefore);
  assert.equal(fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8'), diskBefore);
  service.store.saveDoc = saveDoc;
  await f.restart();
  assert.equal((await join(other, opened.body.openBout.id)).status, 200);
  for (const player of [owner, other]) {
    const result = (await player.api('GET', '/api/barn')).body;
    assert.equal(result.pen.xp, xpFor(6) + BOUT_XP); assert.equal(recordCount(result.pen), 1);
    assert.equal(result.pen.lastBout.id, opened.body.openBout.id);
    assert.equal(result.pen.boutCoolMs, BOUT_COOLDOWN_MS);
  }
  assert.deepEqual(f.service.store.players, committedPlayers, 'recovery does not debit or pay again');
  const settledPens = structuredClone(f.barn.doc.pens);
  assert.equal((await join(other, opened.body.openBout.id)).status, 200);
  assert.deepEqual(f.barn.doc.pens, settledPens);
});

test('a failed second Barn write recovers only the unpaid pet reward after restart', async t => {
  const f = await fixture(t); const { owner, other, barn, service, dataDir } = f;
  f.hatch(owner.id, 6); f.hatch(other.id, 6);
  const opened = await post(owner, 100); assert.equal(opened.status, 200);
  const id = opened.body.openBout.id;
  const saveDoc = service.store.saveDoc.bind(service.store);
  let barnWrites = 0;
  service.store.saveDoc = (name, doc) => {
    if (name === 'barn' && ++barnWrites === 2) throw new Error('simulated second Barn write failure');
    return saveDoc(name, doc);
  };
  t.after(() => { service.store.saveDoc = saveDoc; });
  assert.equal((await join(other, id)).status, 500);
  assert.equal(barnWrites, 2);
  assert.equal(barn.doc.pens[owner.id].xp, xpFor(6) + BOUT_XP);
  assert.equal(barn.doc.pens[owner.id].settledBoutId, id);
  assert.equal(barn.doc.pens[other.id].xp, xpFor(6));
  const diskPens = JSON.parse(fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8')).pens;
  assert.equal(diskPens[owner.id].settledBoutId, id); assert.equal(diskPens[other.id].settledBoutId, undefined);
  const committedPlayers = JSON.parse(JSON.stringify(service.store.players));
  assert.equal(balance(f, owner) + balance(f, other), 2000);
  service.store.saveDoc = saveDoc;
  await f.restart();
  assert.equal((await join(other, id)).status, 200);
  for (const player of [owner, other]) {
    const pen = (await player.api('GET', '/api/barn')).body.pen;
    assert.equal(pen.xp, xpFor(6) + BOUT_XP); assert.equal(recordCount(pen), 1);
    assert.equal(pen.lastBout.id, id); assert.equal(pen.boutCoolMs, BOUT_COOLDOWN_MS);
  }
  const settledPens = structuredClone(f.barn.doc.pens);
  assert.equal((await join(other, id)).status, 200);
  assert.deepEqual(f.barn.doc.pens, settledPens);
  assert.deepEqual(f.service.store.players, committedPlayers, 'neither participant is debited or paid again');
});

test('Barn Menace is earned at five wins and remains after later bouts', async t => {
  const { owner, barn, hatch } = await fixture(t);
  const pen = hatch(owner.id, 6);
  for (const wins of [4, 5, 6]) {
    pen.record = { w: wins, l: 8, d: 3 }; barn.save();
    const view = (await owner.api('GET', '/api/barn')).body.pen;
    assert.equal(view.title, wins >= 5 ? 'Barn Menace' : null);
    assert.deepEqual(view.record, pen.record);
  }
});

test('failed persistence leaves battle choices unchanged', async t => {
  const { owner, hatch, barn, service, dataDir } = await fixture(t);
  hatch(owner.id, 6);
  const before = structuredClone(barn.doc);
  const diskBefore = fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8');
  const saveDoc = service.store.saveDoc.bind(service.store);
  service.store.saveDoc = (name, doc) => { if (name === 'barn') throw new Error('simulated write failure'); return saveDoc(name, doc); };
  t.after(() => { service.store.saveDoc = saveDoc; });
  assert.equal((await owner.api('PATCH', '/api/barn/battle', { stance: 'aggressive', specials: ['technique'] })).status, 500);
  assert.deepEqual(barn.doc, before);
  assert.equal(fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8'), diskBefore);
});

test('legacy creatures retain earned abilities and saved identity, XP, records and old replays', () => {
  const now = 1_800_000_000_000;
  const oldReplay = { at: now - 1000, seed: 'old', you: { name: 'Original' }, them: { name: 'Rival' }, rounds: [{ hp: [100, 80], line: 'Old combat log' }], result: 'won' };
  const pens = Object.fromEntries([1, 3, 5].map(level => [String(level), {
    stage: 'creature', species: ROSTER[0].id, name: `Original ${level}`, xp: xpFor(level), bornAt: now, fedAt: now, dayXpAt: now,
    cool: {}, stats: Object.fromEntries(['hunger', 'mood', 'clean'].map(stat => [stat, { v: 80, at: now }])),
    record: { w: 2, l: 1, d: 1 }, lastBout: structuredClone(oldReplay),
  }]));
  const before = structuredClone(pens);
  let saved = { pens, names: {}, count: {}, graves: {} };
  const store = { loadDoc: () => structuredClone(saved), saveDoc: (_name, doc) => { saved = structuredClone(doc); } };
  const barn = new Barn({ store, now: () => now, incubateMs: 1, eggInt: () => 0 });
  for (const [id, old] of Object.entries(before)) {
    const pen = barn.doc.pens[id];
    for (const key of Object.keys(old)) assert.deepEqual(pen[key], old[key], `${id}: ${key}`);
    const count = id === '1' ? 1 : id === '3' ? 2 : 3;
    assert.equal(pen.legacyAbilities, count);
    assert.equal(barn.view(id).pen.abilities.filter(move => move.unlocked).length, count);
  }
  assert.deepEqual(new Barn({ store, now: () => now }).doc, barn.doc, 'migration is idempotent');
  barn.layEgg('new');
  const later = new Barn({ store, now: () => now + 1, incubateMs: 1, eggInt: () => 0 });
  const newborn = later.view('new').pen;
  assert.equal(newborn.level, 1); assert.equal(newborn.abilities.some(move => move.unlocked), false);
  assert.equal(later.doc.pens.new.legacyAbilities, undefined);
});

const challenge = (player, to, stake = 0) => player.api('POST', '/api/barn/challenges', { to, stake });
const accept = (player, id, body = {}) => player.api('POST', `/api/barn/challenges/${id}/accept`, body);
const drop = (player, id) => player.api('DELETE', `/api/barn/challenges/${id}`);

test('the ring lists every living bug of a visible owner, even to a player with no bug, without needs or XP', async t => {
  const f = await fixture(t); const { owner, other, barn, service, hatch, login } = f;
  const watcher = await login('NoBugRancher'), hiddenOne = await login('HiddenRancher'), young = await login('YoungRancher'), eggy = await login('EggRancher'), late = await login('LateRancher');
  hatch(owner.id, 6); hatch(other.id, 4); hatch(hiddenOne.id, 5); hatch(young.id, 1); hatch(late.id, 7);
  barn.layEgg(eggy.id);
  service.getPlayer(hiddenOne.id).hidden = true;
  barn.doc.pens[late.id].stage = 'dead'; barn.save();
  const view = (await watcher.api('GET', '/api/barn')).body;
  assert.equal(view.pen, null);
  assert.deepEqual(view.roster.map(bug => bug.ownerId), [owner.id, other.id, young.id], 'highest level first; eggs, the dead and hidden owners are left out');
  for (const bug of view.roster) assert.deepEqual(Object.keys(bug).sort(), ['fights', 'level', 'name', 'owner', 'ownerId', 'record', 'restMs', 'species', 'style']);
  assert.deepEqual(view.roster.map(bug => [bug.owner, bug.level, bug.fights]), [['BugOwner', 6, true], ['OtherRancher', 4, true], ['YoungRancher', 1, false]]);
  assert.deepEqual(view.challenges, { incoming: [], outgoing: [], max: 3 }); assert.deepEqual(view.fights, []);
  assert.equal((await watcher.api('POST', '/api/barn/challenges', { to: owner.id, stake: 0 })).status, 404, 'no bug, no challenge');
});

test('a challenge holds no money, needs a mature bug on both sides and can be withdrawn, declined or left to lapse', async t => {
  const f = await fixture(t); const { anon, owner, other, barn, hatch, login, clock } = f;
  assert.equal((await anon('POST', '/api/barn/challenges', { to: other.id, stake: 0 })).status, 401);
  hatch(owner.id, 6); hatch(other.id, 2);
  for (const body of [[], {}, { to: other.id }, { to: 5, stake: 0 }, { to: other.id, stake: -1 }, { to: other.id, stake: 0.001 }, { to: other.id, stake: 10001 }, { to: other.id, stake: 0, extra: 1 }]) {
    assert.equal((await owner.api('POST', '/api/barn/challenges', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await challenge(owner, owner.id)).status, 409);
  assert.equal((await challenge(owner, 'nobody')).status, 404);
  assert.equal((await challenge(owner, other.id)).status, 409, 'the other bug is too young');
  assert.equal((await challenge(other, owner.id)).status, 409, 'and a young bug cannot challenge');
  barn.doc.pens[other.id].xp = xpFor(3); barn.save();
  assert.equal((await challenge(owner, other.id, 5000)).status, 402);
  barn.doc.pens[owner.id].boutAt = clock.now; barn.save();
  const sent = await challenge(owner, other.id, 100);
  assert.equal(sent.status, 200, 'a resting bug can still send a challenge');
  barn.doc.pens[owner.id].boutAt = 0; barn.save();
  const made = sent.body.challenges.outgoing[0];
  assert.equal(made.expiresAt - made.at, CHALLENGE_OPEN_MS);
  assert.equal(balance(f, owner), 1000, 'nothing is held'); assert.equal(sent.body.openBout, null);
  assert.equal((await challenge(owner, other.id, 100)).body.challenges.outgoing.length, 1, 'asking twice is one challenge');
  assert.equal((await challenge(owner, other.id, 50)).status, 409);
  const theirs = (await other.api('GET', '/api/barn')).body;
  assert.deepEqual(theirs.challenges.incoming.map(c => [c.id, c.from, c.fromName, c.toName, c.stake]), [[made.id, owner.id, 'BugOwner', 'OtherRancher', 100]]);
  assert.equal((await other.api('GET', '/api/me')).body.barnChallenges, 1); assert.equal((await owner.api('GET', '/api/me')).body.barnChallenges, 0);
  const third = await login('ThirdRancher'); hatch(third.id, 3);
  assert.equal((await drop(third, made.id)).status, 404); assert.equal((await accept(third, made.id)).status, 409);
  assert.equal((await accept(owner, made.id)).status, 409, 'the sender cannot accept it for them');
  assert.equal((await drop(other, made.id)).body.challenges.incoming.length, 0);
  assert.equal((await drop(other, made.id)).status, 200, 'declining twice is harmless');
  assert.equal((await owner.api('GET', '/api/barn')).body.challenges.outgoing.length, 0);
  // Three at a time.
  const fourth = await login('FourthRancher'), fifth = await login('FifthRancher'); hatch(fourth.id, 3); hatch(fifth.id, 3);
  for (const target of [other, third, fourth]) assert.equal((await challenge(owner, target.id)).status, 200);
  assert.equal((await challenge(owner, fifth.id)).status, 409);
  const mine = (await owner.api('GET', '/api/barn')).body.challenges.outgoing;
  assert.equal((await drop(owner, mine[0].id)).body.challenges.outgoing.length, 2, 'withdrawing frees a place');
  // A bug that dies takes its challenges with it; the rest lapse after a day.
  barn.doc.pens[third.id].stage = 'dead'; barn.save();
  assert.deepEqual((await owner.api('GET', '/api/barn')).body.challenges.outgoing.map(c => c.to), [fourth.id]);
  clock.now += CHALLENGE_OPEN_MS;
  assert.equal((await fourth.api('GET', '/api/me')).body.barnChallenges, 0);
  assert.equal((await owner.api('GET', '/api/barn')).body.challenges.outgoing.length, 0);
});

test('accepting a challenge takes both stakes then, settles once and puts the fight on the public record', async t => {
  const f = await fixture(t); const { anon, owner, other, barn, hatch, login, clock } = f;
  hatch(owner.id, 6); hatch(other.id, 6);
  const id = (await challenge(owner, other.id, 100)).body.challenges.outgoing[0].id;
  assert.equal((await accept(other, id, { stake: 1 })).status, 400);
  // A bout posted by either side has to go first.
  const mine = await post(other, 0); assert.equal((await accept(other, id)).status, 409); await cancel(other, mine.body.openBout.id);
  const theirs = await post(owner, 0); const blocked = await accept(other, id);
  assert.equal(blocked.status, 409); assert.match(blocked.body.error, /BugOwner has a bout posted/); await cancel(owner, theirs.body.openBout.id);
  // Either side short of the stake, or the challenger's bug still resting.
  f.service.getPlayer(owner.id).bankroll = 50;
  const broke = await accept(other, id); assert.equal(broke.status, 409); assert.match(broke.body.error, /BugOwner can no longer cover/);
  f.service.getPlayer(owner.id).bankroll = 1000; f.service.getPlayer(other.id).bankroll = 50;
  assert.equal((await accept(other, id)).status, 402);
  f.service.getPlayer(other.id).bankroll = 1000;
  barn.doc.pens[owner.id].boutAt = clock.now; barn.save();
  const resting = await accept(other, id); assert.equal(resting.status, 429); assert.match(resting.body.error, /BugOwner's bug is not ready/);
  barn.doc.pens[owner.id].boutAt = 0; barn.save();
  assert.equal(balance(f, owner) + balance(f, other), 2000); assert.equal(barn.doc.challenges.length, 1, 'a refused accept leaves the challenge standing');

  const done = await accept(other, id);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const result = done.body.pen.lastBout.result;
  assert.equal(balance(f, other), { won: 1100, lost: 900, draw: 1000 }[result]); assert.equal(balance(f, owner) + balance(f, other), 2000);
  assert.equal(done.body.challenges.incoming.length, 0);
  for (const player of [owner, other]) {
    const pen = (await player.api('GET', '/api/barn')).body.pen;
    assert.equal(pen.xp, xpFor(6) + BOUT_XP); assert.equal(recordCount(pen), 1);
    assert.equal(pen.lastBout.id, id); assert.equal(pen.boutCoolMs, BOUT_COOLDOWN_MS);
  }
  const players = JSON.parse(JSON.stringify(f.service.store.players)), pens = structuredClone(barn.doc.pens);
  assert.equal((await accept(other, id)).status, 200, 'a retry is answered without another fight');
  assert.deepEqual(JSON.parse(JSON.stringify(f.service.store.players)), players); assert.deepEqual(barn.doc.pens, pens);

  // Anyone signed in can see that it happened and watch it, without setups, condition or wallets.
  const watcher = await login('NoBugRancher');
  const seen = (await watcher.api('GET', '/api/barn')).body.fights;
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].sides.map(side => [side.ownerId, side.owner, side.level]), [[owner.id, 'BugOwner', 6], [other.id, 'OtherRancher', 6]]);
  assert.equal(seen[0].stake, 100); assert.equal(seen[0].winner, { won: 1, lost: 0, draw: null }[result]);
  const replay = await watcher.api('GET', `/api/barn/fights/${id}`);
  assert.equal(replay.status, 200); assert.equal(replay.body.pot, 200); assert.ok(replay.body.rounds.length > 0);
  assert.equal(replay.body.you.owner, 'BugOwner'); assert.equal(replay.body.result, { won: 'lost', lost: 'won', draw: 'draw' }[result]);
  for (const fighter of [replay.body.you, replay.body.them]) for (const key of Object.keys(fighter)) assert.ok(['level', 'name', 'owner', 'species', 'style'].includes(key), key);
  for (const secret of ['payout', 'stance', 'specials', 'mood', 'bankroll']) assert.ok(!JSON.stringify(replay.body).includes(`"${secret}"`), secret);
  assert.equal((await anon('GET', `/api/barn/fights/${id}`)).status, 401);
  assert.equal((await watcher.api('GET', '/api/barn/fights/nope')).status, 404);
});

test('posted bouts reach the public record too, which keeps only the latest twenty', async t => {
  const f = await fixture(t); const { owner, other, barn, hatch } = f;
  hatch(owner.id, 3); hatch(other.id, 3);
  const old = Array.from({ length: FIGHT_LOG }, (_, i) => ({ id: `old-${i}`, at: i, stake: 0, winner: null, maxHp: [1, 1], rounds: [],
    sides: [{ ownerId: 'a', owner: 'A', fighter: { name: 'x', species: ROSTER[0].id, level: 3 } }, { ownerId: 'b', owner: 'B', fighter: { name: 'y', species: ROSTER[0].id, level: 3 } }] }));
  barn.doc.fights = old; barn.save();
  const opened = await post(owner, 0);
  const joined = await join(other, opened.body.openBout.id);
  assert.equal(joined.status, 200);
  assert.equal(joined.body.fights.length, FIGHT_LOG);
  assert.equal(joined.body.fights[0].id, opened.body.openBout.id);
  assert.deepEqual(joined.body.fights[0].sides.map(side => side.ownerId), [owner.id, other.id], 'the host is in the first corner');
  assert.equal(joined.body.fights.at(-1).id, `old-${FIGHT_LOG - 2}`);
});

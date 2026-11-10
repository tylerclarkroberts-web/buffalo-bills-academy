// Fight Guntrad: the deterministic sim, its balance (bots), replay checks, and the money flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as F from '../server/engine/fight.js';
import * as G from '../server/engine/game.js';
import { createApp } from '../server/app.js';
import { makeTable } from './helpers.js';
import { makeBot, masher, spammer, playBot } from './support/fightbots.js';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);

test('sim is deterministic: same seed + inputs = same fight; another seed plays out differently', () => {
  const a = playBot(SEEDS[0], makeBot({ reaction: 12, jitter: 2, slip: 8, seed: 3 }));
  const r1 = F.simulate(SEEDS[0], a.log, a.frames); const r2 = F.simulate(SEEDS[0], a.log, a.frames);
  assert.deepEqual(r1.state, r2.state);
  assert.equal(r1.state.p.hp, a.state.p.hp); assert.equal(r1.state.g.hp, a.state.g.hp);
  const other = F.simulate(SEEDS[1], a.log, a.frames);
  assert.notDeepEqual([other.state.p.hp, other.state.g.hp, other.frame], [r1.state.p.hp, r1.state.g.hp, r1.frame]);
});

test('balance: single hits are tiny, real damage needs 5+ hit combos; Guntrad has 15x your health', () => {
  assert.equal(F.G_HP, 15 * F.P_HP);
  assert.equal(F.comboScale(1), 1); assert.equal(F.comboScale(4), 1);
  assert.ok(F.comboScale(5) >= 4 && F.comboScale(9) >= 12);
  assert.ok(F.hitstun(20, 9) < F.hitstun(20, 1), 'each link is tighter than the last');
});

test('a frame-perfect combo bot beats him; an average player and a button-masher do not', () => {
  let perfect = 0, avg = 0, mash = 0;
  for (const s of SEEDS) {
    const p = playBot(s, makeBot({ reaction: 1, seed: s }));
    assert.equal(F.checkLog(p.log, p.frames), null, 'the perfect bot plays a humanly-possible input log');
    if (F.simulate(s, p.log, p.frames).result === 'win') perfect++;
    if (playBot(s, makeBot({ reaction: 18, jitter: 4, slip: 20, seed: s })).result === 'win') avg++;
    if (playBot(s, masher(s)).result === 'win') mash++;
  }
  assert.ok(perfect >= SEEDS.length * 0.9, `perfect bot won ${perfect}/${SEEDS.length}`);
  assert.equal(avg, 0); assert.equal(mash, 0);
});

test('balance (Oct 30 rework): frame-perfect wins, an expert only sometimes, skilled/average/mashers basically never', () => {
  const N = 120; let perfect = 0, expert = 0, skilled = 0, mash = 0, spam = 0;
  for (let i = 0; i < N; i++) {
    const s = F.seedOf('bal' + i);
    if (playBot(s, makeBot({ reaction: 1, seed: s })).result === 'win') perfect++;
    if (playBot(s, makeBot({ reaction: 4, jitter: 1, slip: 3, seed: s })).result === 'win') expert++;
    if (playBot(s, makeBot({ reaction: 8, jitter: 2, slip: 8, seed: s })).result === 'win') skilled++;
    if (playBot(s, masher(s)).result === 'win') mash++;
    if (playBot(s, spammer()).result === 'win') spam++;
  }
  assert.ok(perfect >= N * 0.9, `perfect ${perfect}/${N}`);
  assert.ok(expert >= 1 && expert <= N * 0.3, `expert ${expert}/${N} should be rare but possible`);
  assert.ok(skilled <= N * 0.05, `skilled ${skilled}/${N}`);
  assert.equal(mash, 0); assert.equal(spam, 0);
});

test('long stretchy reach: his reach punch lands from across the felt; you can duck or block it', () => {
  assert.ok(F.GMOVES.reach.rg >= 350 && F.GMOVES.reach.stretch);
  assert.ok(F.GMOVES.jab.rg > F.PMOVES.kick.rg, 'he out-ranges your longest normal');
  const mk = (mask) => { const st = F.createFight(9); st.phase = 'fight'; st.p.x = 300; st.g.x = 650; st.g.st = 'idle'; st.g.cool = 0;
    st.g.st = 'atk'; st.g.mv = 'reach'; st.g.mf = 0; st.g.res = false; let hit = false;
    for (let i = 0; i < 20; i++) { F.stepFight(st, mask); if (st.ev.some((e) => e.k === 'hit' && e.who === 'p')) hit = true; } return { hit, st }; };
  assert.equal(mk(0).hit, true, 'standing still at 350 units gets tagged');
  assert.equal(mk(F.BTN.D).hit, false, 'ducking makes it whiff');
  assert.equal(mk(F.BTN.B).hit, false, 'standing block holds');
});

test('anti-spam hip thrust: same move over and over gets you knocked across the felt, deterministically', () => {
  const s = 4242; const r = playBot(s, spammer());
  assert.ok(r.state.thrusts >= 1, 'the spammer got hip-checked');
  const again = F.simulate(s, r.log, r.frames);
  assert.equal(again.state.thrusts, r.state.thrusts, 'the server re-simulation sees the same thrusts');
  assert.equal(again.state.p.hp, r.state.p.hp); assert.equal(again.result, r.result);
  // a frame-perfect combo player is never thrusted (combo links don't count as spam)
  let n = 0; for (const seed of SEEDS.slice(0, 10)) n += playBot(seed, makeBot({ reaction: 1, seed })).state.thrusts;
  assert.equal(n, 0);
  // the rip happens in the intro, once
  const st = F.createFight(1); let rips = 0; for (let i = 0; i < F.INTRO; i++) { F.stepFight(st, 0); rips += st.ev.filter((e) => e.k === 'rip').length; }
  assert.equal(rips, 1); assert.equal(st.phase, 'fight');
});

test('replay checks: bad shapes, impossible input rates and over-long fights are rejected', () => {
  assert.equal(F.checkLog([[0, 16], [5, 0]], 100), null);
  assert.ok(F.checkLog('x', 10)); assert.ok(F.checkLog([[5, 1], [5, 0]], 10)); assert.ok(F.checkLog([[1.5, 1]], 10));
  assert.ok(F.checkLog([[1, 999]], 10)); assert.ok(F.checkLog([], F.MAX_FRAMES + 1));
  const turbo = Array.from({ length: 120 }, (_, i) => [i, i % 2 ? 16 : 0]); // a new button every frame
  assert.match(F.checkLog(turbo, 200), /inhuman/);
  assert.equal(F.simulate(1, [], 50).result, 'lose', 'stopping early is a loss');
});

// ---------- the money, in the pure engine ----------
function econTable(bank = { p0: 1000, p1: 1000, p2: 1000 }) {
  const { t, players } = makeTable(['Ann', 'Bob', 'Cat'], { buyIn: 200, bigBlind: 20, smallBlind: 10 });
  t.econ = { debited: {}, credited: {} };
  let now = 5000;
  const ctx = () => ({ now, bankrollOf: (id) => bank[id] ?? 0 });
  G.startGame(t, 'p0', ctx());
  return { t, players, ctx, bank, tick: (ms) => { now += ms; } };
}
const bbId = (t) => t.seats[t.hand.bbSeat].playerId;
const chipsOk = (t) => assert.equal(G.chipsOnTable(t), G.totalBoughtIn(t) - G.totalCashedOut(t));

test('money: the BB gets the offer (and only they do); declining changes nothing; acting passes on it', () => {
  const { t, ctx } = econTable();
  const bb = bbId(t);
  assert.ok(G.viewFor(t, bb, 0).fightOffer);
  for (const id of ['p0', 'p1', 'p2'].filter((x) => x !== bb)) { assert.equal(G.viewFor(t, id, 0).fightOffer, null); assert.throws(() => G.startFight(t, id, { id: 'f', seed: 1 }, ctx()), /no fight on offer/); }
  const before = JSON.stringify([t.seats, t.ledger, t.hand.players]);
  G.declineFight(t, bb, ctx());
  assert.equal(JSON.stringify([t.seats, t.ledger, t.hand.players]), before);
  assert.throws(() => G.startFight(t, bb, { id: 'f', seed: 1 }, ctx()), /passed/);
  // next hand: the new BB acts instead of fighting -> the offer lapses
  const t2 = econTable().t; const bb2 = bbId(t2);
  while (t2.hand.toAct !== t2.hand.bbSeat) G.act(t2, t2.seats[t2.hand.toAct].playerId, { type: 'call' }, ctx());
  G.act(t2, bb2, { type: 'check' }, ctx());
  assert.equal(G.viewFor(t2, bb2, 0).fightOffer, null);
});

test('money: a loss puts 5% of the bankroll in the pot as dead money (once); a win is refunded by the house', () => {
  const { t, ctx, tick } = econTable({ p0: 1234, p1: 1234, p2: 1234 });
  const bb = bbId(t); const potBefore = G.viewFor(t, bb, 0).hand.pot;
  G.startFight(t, bb, { id: 'f1', seed: 42 }, ctx());
  assert.throws(() => G.startFight(t, bb, { id: 'f2', seed: 43 }, ctx()), /already fought/);
  G.forfeitFight(t, bb, 'f1', ctx());
  assert.equal(t.fight.status, 'lost'); assert.equal(t.fight.stake, 62); // 5% of 1234 = 61.7 -> 62
  assert.equal(G.viewFor(t, bb, 0).hand.pot, potBefore + 62);
  assert.equal(t.ledger[bb].buyIn, 200 + 62, 'taken from their bankroll via the ledger');
  chipsOk(t);
  assert.throws(() => G.forfeitFight(t, bb, 'f1', ctx()), /already over/);
  // play the hand out: someone wins the dead money too
  while (t.hand) { const s = t.hand.toAct; const L = G.legalActions(t, s); G.act(t, t.seats[s].playerId, { type: L.canCheck ? 'check' : 'call' }, ctx()); }
  assert.equal(t.lastHand.winners.reduce((a, w) => a + w.amount, 0), potBefore + 62 + 30, 'winners collect the blinds, calls and the dead money');
  chipsOk(t);

  // a win, re-simulated from a real replay
  const w = econTable(); const wbb = bbId(w.t);
  G.startFight(w.t, wbb, { id: 'fw', seed: SEEDS[0] }, w.ctx());
  const r = playBot(SEEDS[0], makeBot({ reaction: 1, seed: 1 }));
  assert.equal(r.result, 'win');
  assert.throws(() => G.finishFight(w.t, wbb, { id: 'fw', log: r.log, frames: r.frames }, w.ctx()), /faster than real time/);
  w.tick(Math.ceil(r.frames / 60 * 1000));
  const potW = G.viewFor(w.t, wbb, 0).hand.pot;
  G.finishFight(w.t, wbb, { id: 'fw', log: r.log, frames: r.frames }, w.ctx());
  assert.equal(w.t.fight.status, 'won'); assert.equal(w.t.fightBook.refund[wbb], 20);
  assert.equal(G.viewFor(w.t, wbb, 0).hand.pot, potW, 'the pot is untouched: the house pays, not the players');
  chipsOk(w.t);
  assert.throws(() => G.finishFight(w.t, wbb, { id: 'fw', log: r.log, frames: r.frames }, w.ctx()), /already over/);
});

test('money: broke edges, a reused winning replay, the clock, and a loss after the hand ended', () => {
  assert.equal(G.fightStake(0.5), 0); assert.equal(G.fightStake(1), 1); assert.equal(G.fightStake(10), 1);
  assert.equal(G.fightStake(30), 2); assert.equal(G.fightStake(1000), 50); assert.equal(G.fightStake(19.99), 1);
  assert.equal(G.fightStake(20000, 20), 200, 'capped at 10 big blinds'); assert.equal(G.fightStake(1000, 20), 50); assert.equal(G.fightStake(5, 20), 1);
  const poor = econTable({ p0: 0.5, p1: 0.5, p2: 0.5 });
  assert.equal(G.viewFor(poor.t, bbId(poor.t), 0).fightOffer, null, 'no offer when you could not pay $1');
  // a winning log for one seed is worthless against another fight's seed
  const a = econTable(); const abb = bbId(a.t);
  G.startFight(a.t, abb, { id: 'fa', seed: SEEDS[2] }, a.ctx());
  const r = playBot(SEEDS[1], makeBot({ reaction: 1, seed: 1 }));
  a.tick(200000 - 60000);
  G.finishFight(a.t, abb, { id: 'fa', log: r.log, frames: r.frames }, a.ctx());
  assert.equal(a.t.fight.status, 'lost');
  // walking away mid-fight: the timer settles it as a loss
  const b = econTable(); const bbb = bbId(b.t);
  G.startFight(b.t, bbb, { id: 'fb', seed: 9 }, b.ctx());
  assert.equal(G.nextWakeAt(b.t) <= b.t.fight.expiresAt, true);
  b.tick(G.FIGHT_LIMIT_MS + 1); G.tick(b.t, b.ctx());
  assert.equal(b.t.fight.status, 'lost'); assert.equal(b.t.fight.reason, 'ran out of time');
  // the hand finishes while they're still fighting: a later loss goes to the house, not a future pot
  const c = econTable(); const cbb = bbId(c.t);
  G.startFight(c.t, cbb, { id: 'fc', seed: 9 }, c.ctx());
  while (c.t.hand) { const s = c.t.hand.toAct; G.act(c.t, c.t.seats[s].playerId, { type: 'fold' }, c.ctx()); }
  G.forfeitFight(c.t, cbb, 'fc', c.ctx());
  assert.equal(c.t.fightBook.take[cbb], 50); chipsOk(c.t);
  // the table closes mid-fight: nothing is paid either way
  const d = econTable(); const dbb = bbId(d.t);
  G.startFight(d.t, dbb, { id: 'fd', seed: 9 }, d.ctx());
  G.closeTable(d.t, 'p0', d.ctx());
  assert.equal(d.t.fight.status, 'cancelled');
});

// ---------- over HTTP, with bankrolls ----------
async function boot() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fight-'));
  const clock = { t: 1_800_000_000_000 };
  const { app, service, shutdown } = createApp({ dataDir, now: () => clock.t, devLogin: true, env: {} });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => { shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); };
  const agent = async (email) => {
    const r = await fetch(base + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name: email.split('@')[0] }) });
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const call = (m, u, b) => fetch(base + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
  };
  return { base, service, clock, stop, agent };
}

test('HTTP: offer to the BB only, forged wins rejected, a real win is refunded, a loss is dead money, watchers follow live', async (t) => {
  const s = await boot(); t.after(s.stop);
  const A = await s.agent('ann@x.test'); const B = await s.agent('bob@x.test');
  const code = (await A.post('/tables', { name: 'Fight night', settings: { buyIn: 100, bigBlind: 20, smallBlind: 10, nextHandDelaySeconds: 0 } })).body.code;
  assert.equal((await B.post(`/tables/${code}/join`)).status, 200);
  assert.equal((await A.post(`/tables/${code}/start`)).status, 200);
  const v = (await A.get(`/tables/${code}`)).body;
  const bbSeat = v.hand.bbSeat; const bbIsA = v.seats[bbSeat].name === 'ann';
  const BBp = bbIsA ? A : B; const other = bbIsA ? B : A;
  const offer = (await BBp.get(`/tables/${code}`)).body.fightOffer;
  assert.deepEqual(offer, { hand: v.hand.number, refund: 20, stake: 45 }); // 5% of the $900 left after the buy-in
  assert.equal((await other.get(`/tables/${code}`)).body.fightOffer, null);
  assert.equal((await other.post(`/tables/${code}/fight/start`)).status, 400);
  const started = (await BBp.post(`/tables/${code}/fight/start`)).body.fight;
  assert.equal(started.status, 'running');
  assert.equal((await BBp.post(`/tables/${code}/fight/start`)).status, 400, 'one fight per BB hand');
  // forged "win" flags mean nothing; a replay faster than the clock is refused; the other player can't submit
  const r = playBot(started.seed, makeBot({ reaction: 1, seed: 5 }));
  assert.equal(r.result, 'win', 'the perfect bot wins this seed');
  assert.equal((await BBp.post(`/tables/${code}/fight/submit`, { id: started.id, result: 'win', won: true, log: r.log, frames: r.frames })).status, 400);
  assert.equal((await other.post(`/tables/${code}/fight/submit`, { id: started.id, log: r.log, frames: r.frames })).status, 403);
  // live: stream the first half; a watcher (even signed out) sees it; running ahead of the clock is refused
  const half = r.log.filter((e) => e[0] < 600);
  assert.equal((await BBp.post(`/tables/${code}/fight/stream`, { id: started.id, from: 0, log: half, frame: 600 })).status, 400, 'ahead of the clock');
  s.clock.t += 11000;
  assert.equal((await BBp.post(`/tables/${code}/fight/stream`, { id: started.id, from: 0, log: half, frame: 600 })).status, 200);
  const anon = await fetch(`${s.base}/api/tables/${code}/fight/watch?since=0`).then((x) => x.json());
  assert.equal(anon.fight.seed, started.seed); assert.deepEqual(anon.log, half); assert.equal(anon.frame, 600); assert.equal(anon.done, false);
  assert.equal((await other.post(`/tables/${code}/fight/stream`, { id: started.id, from: half.length, log: [], frame: 601 })).status, 403);
  // a final replay that disagrees with what was streamed live is refused
  s.clock.t += Math.ceil(r.frames / 60 * 1000);
  const tampered = r.log.map((e, i) => (i === 1 ? [e[0], e[1] ^ 16] : e));
  assert.equal((await BBp.post(`/tables/${code}/fight/submit`, { id: started.id, log: tampered, frames: r.frames })).status, 400);
  const bankBefore = s.service.store.players[v.seats[bbSeat].playerId].bankroll;
  const potBefore = (await BBp.get(`/tables/${code}`)).body.hand.pot;
  const done = (await BBp.post(`/tables/${code}/fight/submit`, { id: started.id, log: r.log, frames: r.frames })).body;
  assert.equal(done.fight.status, 'won'); assert.equal(done.fight.paid, 20);
  assert.equal(s.service.store.players[v.seats[bbSeat].playerId].bankroll, bankBefore + 20, 'the house covered the big blind');
  assert.equal(done.hand.pot, potBefore, 'nobody else paid for it');
  assert.equal((await BBp.post(`/tables/${code}/fight/submit`, { id: started.id, log: r.log, frames: r.frames })).status, 409, 'a replay can not be reused');
  assert.equal((await fetch(`${s.base}/api/tables/${code}/fight/watch?since=0`).then((x) => x.json())).done, true);

  // next hand: the other player is the BB; they lose by forfeit -> 5% of bankroll into the pot
  const h1 = done.hand.number;
  while ((await A.get(`/tables/${code}`)).body.hand?.number === h1) {
    const cur = (await A.get(`/tables/${code}`)).body; const actor = cur.seats[cur.hand.toAct].name === 'ann' ? A : B;
    await actor.post(`/tables/${code}/action`, { type: 'fold', handNumber: cur.hand.number });
  }
  s.clock.t += 1000; s.service.runDue();
  const v2 = (await A.get(`/tables/${code}`)).body;
  const BB2 = v2.seats[v2.hand.bbSeat].name === 'ann' ? A : B; const id2 = v2.seats[v2.hand.bbSeat].playerId;
  const bank2 = s.service.store.players[id2].bankroll;
  const f2 = (await BB2.post(`/tables/${code}/fight/start`)).body.fight;
  const lost = (await BB2.post(`/tables/${code}/fight/forfeit`, { id: f2.id })).body;
  const stake = Math.max(1, Math.round(bank2 * 0.05));
  assert.equal(lost.fight.status, 'lost'); assert.equal(lost.fight.stake, stake);
  assert.equal(lost.hand.dead, stake);
  assert.equal(s.service.store.players[id2].bankroll, bank2 - stake);
  assert.equal((await BB2.post(`/tables/${code}/fight/forfeit`, { id: f2.id })).status, 409);
  assert.ok(lost.log.some((l) => /dead money/.test(l.text)));
});

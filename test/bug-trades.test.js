import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts, cents } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { Trades, TRADE_OPEN_MS, MAX_SIDE } from '../server/trades.js';
import { createApp } from '../server/app.js';
import { ROSTER, formOf } from '../server/engine/creatures.js';
import { rarityOf, LEGENDARY } from '../server/engine/bug-types.js';
import { LORE, MINE_LORE, FOREMAN_LORE, TRADE_LORE, loreLine } from '../server/engine/lore.js';
import { ESCALATION } from '../server/foreman.js';
import { classify } from '../server/admin/report.js';

const START = 1000;
function setup(t, { stalls = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-trades-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  for (const [id, name] of [['a', 'Connor'], ['b', 'Tyler'], ['c', 'Breiden']]) store.players[id] = { id, name, bankroll: START, txns: [] };
  store.savePlayers();
  const barn = new Barn({ store, accounts, now, incubateMs: 1 });
  const trades = new Trades({ barn, store, accounts, now });
  let n = 0;
  const catchBug = (pid, species = 'pyrops', level = 5) => { clock.now += 10; return barn.adopt(pid, { wildId: `w${++n}`, battleId: `b${n}`, species, level }); };
  if (stalls) for (const pid of ['a', 'b', 'c']) { catchBug(pid, 'pyrops'); catchBug(pid, ROSTER[3].id); }
  return { dir, clock, store, accounts, barn, trades, catchBug };
}
const total = (store) => cents(Object.values(store.players).reduce((s, p) => s + p.bankroll + Object.values(p.barnTrades?.held || {}).reduce((x, y) => x + y, 0), 0));
/** Every player's ledger adds up: the start, plus every logged amount, is the bankroll; the last logged balance is too. */
function ledgerOk(store) {
  for (const p of Object.values(store.players)) {
    const sum = cents(START + (p.txns || []).reduce((s, x) => s + x.amount, 0));
    assert.equal(sum, p.bankroll, `${p.name}'s ledger adds up`);
    if (p.txns?.length) assert.equal(p.txns.at(-1).balance, p.bankroll);
  }
}
const ids = (barn, pid) => barn.bugs(pid).map(idOf);

test('a cash offer holds the money, and accepting moves the bug and pays the seller exactly once', (t) => {
  const { store, barn, trades } = setup(t);
  const want = barn.bugs('b')[1];
  const before = total(store);
  trades.propose('a', { to: 'b', want: [idOf(want)], money: 250.5 });
  assert.equal(store.players.a.bankroll, 749.5);
  assert.equal(barn.escrow(store.players.a), 250.5, 'held cash counts in the barn escrow (net worth)');
  assert.equal(total(store), before);
  const [offer] = trades.view('b').incoming;
  assert.equal(offer.money, 250.5);
  assert.equal(barn.challengeCount('b'), 1, 'the Barn button counts the offer');
  const r = trades.accept('b', offer.id);
  assert.deepEqual(r.accepted.got, []); assert.deepEqual(r.accepted.gave, [want.name]);
  assert.equal(store.players.b.bankroll, 1250.5);
  assert.equal(store.players.a.bankroll, 749.5);
  assert.equal(barn.escrow(store.players.a), 0);
  assert.ok(barn.bugs('a').some((pen) => pen.name === want.name && pen.tradedFrom === 'Tyler'));
  assert.ok(!barn.bugs('b').some((pen) => pen.name === want.name));
  assert.ok(barn.doc.dex.a[formOf(want.species, 0)], 'the receiver has met it in the Bugdex');
  assert.equal(barn.doc.names[want.name.toLowerCase()], 'a');
  // a second accept, a retry or a settle pays nothing more
  trades.accept('b', offer.id); trades.settle(); trades.reconcile();
  assert.equal(store.players.b.bankroll, 1250.5);
  assert.equal(total(store), before);
  ledgerOk(store);
  assert.equal(trades.view('b').history[0].status, 'accepted');
  assert.equal(barn.challengeCount('a'), 1, 'the proposer is told it was accepted');
  trades.view('a', { seen: true });
  assert.equal(barn.challengeCount('a'), 0);
  // survives a restart from disk
  const fresh = new Store(store.dir);
  assert.equal(fresh.players.b.bankroll, 1250.5);
  assert.deepEqual(fresh.players.a.barnTrades.held, {});
});

test('decline, cancel and expiry each return the held cash once; nothing moves', (t) => {
  const { store, barn, trades, clock } = setup(t);
  const before = total(store), b0 = ids(barn, 'b');
  const want = idOf(barn.bugs('b')[0]);
  const id = () => trades.view('a').outgoing.at(-1).id;
  trades.propose('a', { to: 'b', want: [want], money: 100 }); const d = id();
  trades.propose('a', { to: 'b', want: [want], money: 200 }); const c = id();
  trades.propose('a', { to: 'b', want: [want], money: 300 }); const e = id();
  assert.equal(store.players.a.bankroll, 400);
  trades.decline('b', d); trades.decline('b', d);
  assert.equal(store.players.a.bankroll, 500);
  assert.throws(() => trades.cancel('b', c), /not yours/);
  trades.cancel('a', c); trades.cancel('a', c);
  assert.equal(store.players.a.bankroll, 700);
  assert.throws(() => trades.accept('b', c), /cancelled/);
  clock.now += TRADE_OPEN_MS + 1;
  barn.view('a'); // any barn look sweeps expired offers
  assert.equal(store.players.a.bankroll, 1000);
  assert.throws(() => trades.accept('b', e), /expired/);
  assert.deepEqual(ids(barn, 'b'), b0);
  assert.equal(total(store), before);
  ledgerOk(store);
  assert.deepEqual(trades.view('a').history.map((x) => x.status).sort(), ['cancelled', 'declined', 'expired']);
});

test('bug for bug plus cash: both sides swap, partners step up, clashing ids are renumbered', (t) => {
  const { store, barn, trades } = setup(t);
  const [aPartner, aStall] = barn.bugs('a'), [bPartner, bStall] = barn.bugs('b');
  // b's stalled bug shares an id with a's partner (ids are only unique per owner)
  barn.commitDoc({ bench: { ...barn.doc.bench, b: [{ ...bStall, eggAt: idOf(aPartner), bornAt: aPartner.bornAt }] } });
  trades.propose('a', { to: 'b', give: [idOf(aPartner), idOf(aStall)], want: [idOf(bPartner)], money: 10 });
  const before = total(store);
  trades.accept('b', trades.view('b').incoming[0].id);
  assert.deepEqual(barn.bugs('a').map((pen) => pen.name), [bPartner.name]);
  assert.ok(!barn.doc.pens.a.benchedAt, 'it is a\'s partner now');
  assert.equal(barn.bugs('b').length, 3);
  assert.equal(new Set(ids(barn, 'b')).size, 3, 'no two of b\'s bugs share an id');
  const moved = barn.bugs('b').find((pen) => pen.name === aPartner.name);
  assert.notEqual(idOf(moved), idOf(aPartner), 'renumbered on arrival');
  assert.ok(barn.doc.pens.b && !barn.doc.pens.b.benchedAt, 'b\'s partner place is filled');
  assert.ok(barn.doc.bench.b.every((pen) => pen.benchedAt), 'the rest wait in stalls');
  assert.equal(store.players.b.bankroll, 1010); assert.equal(total(store), before);
  ledgerOk(store);
});

test('busy, sick, lost, fainted, egg and STEEZE bugs cannot be traded; checks happen again at accept', (t) => {
  const { store, barn, trades, catchBug } = setup(t);
  const bug = barn.bugs('b')[1], put = (patch) => barn.commitPen('b', { ...barn.penOf('b', idOf(bug)), ...patch });
  for (const [patch, why] of [[{ sick: 1 }, /sick/], [{ taken: 1 }, /specialist/], [{ faintedAt: 1 }, /fainted/], [{ heesheeHeld: true }, /Heeshee/]]) {
    put(patch);
    assert.throws(() => trades.propose('a', { to: 'b', want: [idOf(bug)], money: 5 }), why);
    const { sick: _s, taken: _t, faintedAt: _f, heesheeHeld: _h, ...clean } = barn.penOf('b', idOf(bug)); barn.commitPen('b', clean);
  }
  store.players.b.barnBouts = { open: { petBornAt: bug.bornAt, stake: 0 } };
  assert.throws(() => trades.propose('a', { to: 'b', want: [idOf(bug)] }), /bout board/);
  store.players.b.barnBouts = {};
  const steeze = catchBug('c', 'steeze');
  assert.throws(() => trades.propose('a', { to: 'c', want: [idOf(steeze)] }), /STEEZE/);
  // fine when offered, fainted by accept: refused, nothing moves, the cash stays held until it is answered
  trades.propose('a', { to: 'b', want: [idOf(bug)], money: 40 });
  put({ faintedAt: 5 });
  const id = trades.view('b').incoming[0].id;
  assert.throws(() => trades.accept('b', id), /fainted/);
  assert.equal(barn.bugs('b').length, 2); assert.equal(store.players.a.bankroll, 960);
  trades.decline('b', id); assert.equal(store.players.a.bankroll, 1000);
  // in a fight: none of that owner's bugs can go
  barn.fights.fightOf = (pid) => (pid === 'b' ? { id: 'f' } : null);
  assert.throws(() => trades.propose('a', { to: 'b', want: [idOf(barn.bugs('b')[0])] }), /fight/);
  ledgerOk(store);
});

test('validation: self, empty, too many, bad money, money with nothing asked, not enough cash, no room', (t) => {
  const { store, barn, trades } = setup(t);
  const want = idOf(barn.bugs('b')[0]);
  assert.throws(() => trades.propose('a', { to: 'a', want: [idOf(barn.bugs('a')[0])] }), /another player/);
  assert.throws(() => trades.propose('a', { to: 'b' }), /at least one bug/);
  assert.throws(() => trades.propose('a', { to: 'b', give: [idOf(barn.bugs('a')[0])], money: 5 }), /Ask for one/);
  assert.throws(() => trades.propose('a', { to: 'b', want: [want], money: -1 }), /real amount/);
  assert.throws(() => trades.propose('a', { to: 'b', want: [want], money: 1.234 }), /whole cents/);
  assert.throws(() => trades.propose('a', { to: 'b', want: [want, want] }), /twice/);
  assert.throws(() => trades.propose('a', { to: 'b', want: Array.from({ length: MAX_SIDE + 1 }, (_, i) => i) }), /At most/);
  assert.throws(() => trades.propose('a', { to: 'b', want: [want], money: 5000 }), /You need \$5,000/);
  assert.throws(() => trades.propose('a', { to: 'b', want: [123] }), /left the barn/);
  // b has 2 bugs in 3 stalls: two more coming in used to be refused; they now fit, with overflow at GFR Farms
  const give = barn.bugs('a').map(idOf);
  trades.propose('a', { to: 'b', give });
  trades.accept('b', trades.view('b').incoming[0].id);
  assert.equal(barn.bugs('b').length, 3, 'the stalls fill first');
  assert.equal(barn.farmBugs('b').length, 1, 'the extra one goes to the farm');
  assert.equal(barn.bugs('a').length, 0);
  assert.equal(store.players.a.bankroll, START);
  ledgerOk(store);
});

test('a bug offered in two trades: the first accepted calls the other off and returns its cash', (t) => {
  const { store, barn, trades } = setup(t);
  const want = idOf(barn.bugs('b')[0]);
  trades.propose('a', { to: 'b', want: [want], money: 100 });
  trades.propose('c', { to: 'b', want: [want], money: 300 });
  const before = total(store);
  const fromC = trades.view('b').incoming.find((x) => x.from === 'c');
  trades.accept('b', fromC.id);
  assert.equal(store.players.c.bankroll, 700); assert.equal(store.players.b.bankroll, 1300);
  assert.equal(store.players.a.bankroll, 1000, 'the other bidder has their money back');
  const voided = trades.view('a').history[0];
  assert.equal(voided.status, 'void');
  assert.throws(() => trades.accept('b', voided.id), /void/);
  assert.equal(total(store), before);
  ledgerOk(store);
});

test('a legendary can change hands and there is still only the one', (t) => {
  const { barn, trades, catchBug } = setup(t, { stalls: false });
  const legend = ROSTER.find((bug) => rarityOf(bug.id) === LEGENDARY);
  catchBug('a', legend.id, 30); catchBug('b', 'pyrops');
  trades.propose('b', { to: 'a', want: [idOf(barn.bugs('a')[0])], money: 1 });
  trades.accept('a', trades.view('a').incoming[0].id);
  const count = () => Object.keys(barn.doc.pens).flatMap((pid) => barn.bugs(pid)).filter((pen) => pen.species === legend.id).length;
  assert.equal(count(), 1);
  assert.ok(barn.bugs('b').some((pen) => pen.species === legend.id));
  assert.ok(barn.holds(legend.id));
});

test('a crash between the bug write and the money write is finished by the next settle, once', (t) => {
  const { store, barn, trades } = setup(t);
  trades.propose('a', { to: 'b', want: [idOf(barn.bugs('b')[0])], money: 75 });
  const id = trades.view('b').incoming[0].id, before = total(store);
  const real = store.commitPlayerDrafts.bind(store);
  store.commitPlayerDrafts = () => { throw new Error('disk full'); };
  assert.throws(() => trades.accept('b', id), /disk full/);
  assert.equal(barn.bugs('a').length, 3, 'the bug moved');
  assert.equal(store.players.b.bankroll, 1000); assert.equal(store.players.a.barnTrades.held[id], 75, 'still held, not lost');
  assert.equal(total(store), before);
  store.commitPlayerDrafts = real;
  // a fresh process reading the files: the trade says accepted, the cash says held
  const s2 = new Store(store.dir), acc2 = new Accounts({ store: s2, now: barn.now });
  const b2 = new Barn({ store: s2, accounts: acc2, now: barn.now }); const t2 = new Trades({ barn: b2, store: s2, accounts: acc2, now: barn.now });
  assert.equal(s2.players.b.bankroll, 1075); assert.deepEqual(s2.players.a.barnTrades.held, {});
  t2.settle(); t2.reconcile();
  assert.equal(s2.players.b.bankroll, 1075);
  ledgerOk(s2);
});

test('a crash after the cash is held but before the offer is written gives the cash back', (t) => {
  const { store, barn, trades } = setup(t);
  const real = barn.commitDoc.bind(barn); let fail = true;
  barn.commitDoc = (c) => { if (fail && c.trades) { fail = false; throw new Error('disk full'); } return real(c); };
  const reconcile = trades.reconcile.bind(trades); trades.reconcile = () => {}; // the crash: nothing runs after
  assert.throws(() => trades.propose('a', { to: 'b', want: [idOf(barn.bugs('b')[0])], money: 60 }), /disk full/);
  assert.equal(store.players.a.bankroll, 940);
  trades.reconcile = reconcile;
  trades.settle();
  assert.equal(store.players.a.bankroll, 1000); assert.deepEqual(store.players.a.barnTrades.held, {});
  ledgerOk(store);
});

test('a deleted account calls its offers off and returns the cash', (t) => {
  const { store, barn, trades } = setup(t);
  trades.propose('a', { to: 'b', want: [idOf(barn.bugs('b')[0])], money: 90 });
  trades.forget('b');
  assert.equal(store.players.a.bankroll, 1000);
  assert.equal(trades.view('a').history[0].status, 'void');
});

test('the admin ledger files trade money under the barn', () => {
  assert.deepEqual(classify('barn-trade', 'Bug trade: offer to Tyler held'), { source: 'barn', sub: 'Trade offer held' });
  assert.deepEqual(classify('barn-trade', 'Bug trade: paid by Connor'), { source: 'barn', sub: 'Bug sold in a trade' });
  assert.deepEqual(classify('barn-trade', 'Bug trade: offer to Tyler returned'), { source: 'barn', sub: 'Trade offer returned' });
});

test('lore: the whole-set rumour is in the barn, the mine walls, the Foreman and the trading post', () => {
  const all = [...LORE, ...MINE_LORE, ...FOREMAN_LORE, ...TRADE_LORE].join(' ').toLowerCase();
  assert.match(all, /bow/); assert.match(all, /prize/); assert.match(all, /power/);
  assert.ok(MINE_LORE.every((line) => line === line.toUpperCase()));
  assert.equal(loreLine('x'), loreLine('x'));
  assert.ok(LORE.includes(loreLine(42)));
  assert.ok(FOREMAN_LORE.every((line) => ESCALATION.includes(line)), 'the Foreman can rant about it');
});

test('HTTP: two accepts racing pay once; the barn and net worth show the held cash', async (t) => {
  const prefix = path.join(os.tmpdir(), 'bba-trades-http-'), dataDir = fs.mkdtempSync(prefix), clock = { now: 1_800_000_000_000 };
  const running = createApp({ dataDir, now: () => clock.now, devLogin: true, env: { BARN_INCUBATE_MS: '1' } });
  const server = await new Promise((resolve) => { const s = running.app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { running.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = (headers) => async (method, url, body) => { const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, headers: res.headers, body: await res.json() }; };
  const login = async (name) => { const res = await client({})('POST', '/auth/dev', { name, email: `${name.toLowerCase()}@example.test` }); return { id: res.body.id, api: client({ cookie: res.headers.get('set-cookie').split(';')[0] }) }; };
  const buyer = await login('Buyer'), seller = await login('Seller');
  const barn = running.service.barn;
  barn.layEgg(seller.id); clock.now += 1; barn.view(seller.id);
  const r = await buyer.api('GET', '/api/barn/trades');
  assert.equal(r.status, 200);
  const bug = r.body.players.find((p) => p.id === seller.id).bugs[0];
  const offered = await buyer.api('POST', '/api/barn/trades', { to: seller.id, want: [bug.id], money: 120 });
  assert.equal(offered.status, 200, JSON.stringify(offered.body));
  assert.equal(offered.body.held, 120);
  const me = await buyer.api('GET', '/api/me');
  assert.equal(me.body.bankroll, 880);
  assert.equal((await seller.api('GET', '/api/barn/waiting')).body.challenges, 1);
  const id = (await seller.api('GET', '/api/barn/trades')).body.incoming[0].id;
  const [x, y] = await Promise.all([seller.api('POST', `/api/barn/trades/${id}/accept`), seller.api('POST', `/api/barn/trades/${id}/accept`)]);
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  const players = running.service.store.players;
  assert.equal(players[seller.id].bankroll, 1120); assert.equal(players[buyer.id].bankroll, 880);
  assert.equal(barn.bugs(buyer.id).length, 1); assert.equal(barn.bugs(seller.id).length, 0);
  assert.equal((await buyer.api('POST', `/api/barn/trades/${id}/decline`)).status, 404);
  assert.equal((await buyer.api('DELETE', `/api/barn/trades/${id}`)).status, 200, 'cancelling an accepted trade is a no-op');
  assert.equal(players[buyer.id].bankroll, 880);
});

test('Trades.place uses barn.placeNewBug routing: partner, free stall, then GFR Farms, in one barn write', (t) => {
  const { barn, trades, catchBug, store } = setup(t, { stalls: false });
  // empty barn: the received bug is the partner
  catchBug('a', 'pyrops');
  const first = barn.bugs('a')[0];
  trades.propose('a', { to: 'b', give: [idOf(first)] });
  let writes = 0;
  const save = barn.store.saveDoc.bind(barn.store);
  barn.store.saveDoc = (name, data) => { if (name === 'barn') writes++; return save(name, data); };
  trades.accept('b', trades.view('b').incoming[0].id);
  assert.equal(barn.whereIs('b', first), 'partner');
  assert.equal(writes, 1, 'the accept is one barn.json write');

  // a partner already there: the next one takes a stall
  catchBug('a', 'lamprima');
  const second = barn.bugs('a')[0];
  trades.propose('a', { to: 'b', give: [idOf(second)] });
  writes = 0;
  trades.accept('b', trades.view('b').incoming[0].id);
  assert.equal(barn.whereIs('b', second), 'stall');
  assert.ok(barn.doc.bench.b.some((pen) => idOf(pen) === idOf(second) && pen.benchedAt));
  assert.equal(writes, 1);

  // fill the remaining stalls, then one more goes to the farm
  catchBug('a', 'halobates'); catchBug('a', 'onymacris');
  // default barn has 3 stalls; b now has partner + 1 stall = 2, room for 1 more then farm
  const third = barn.bugs('a')[0], fourth = barn.bugs('a')[1];
  trades.propose('a', { to: 'b', give: [idOf(third), idOf(fourth)] });
  writes = 0;
  trades.accept('b', trades.view('b').incoming[0].id);
  assert.equal(barn.bugs('b').length, 3);
  const farmed = barn.farmBugs('b');
  assert.equal(farmed.length, 1);
  assert.ok(farmed[0].farmedAt && !farmed[0].benchedAt);
  assert.equal(barn.whereIs('b', farmed[0]), 'farm');
  assert.equal(writes, 1);
  assert.equal(store.players.a.bankroll, START);
});

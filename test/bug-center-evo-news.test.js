// Stale-tab heal must not silently evolve a sick or collected bug, and Nurse Hikari's one-time recap of Breiden's
// missed Stage II visit must play from live barn data with no second bill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, BOTCH_ODDS, EVO_NEWS_PLAYER, EVO_NEWS_AT, EVO_NEWS_BILL } from '../server/barn.js';
import { xpFor } from '../server/engine/creatures.js';
import { greeting, greetingFor, healRequest, newsGreeting, newsAfter, newsAsEvolved, RECEIPT } from '../client/src/bugcenter/script.js';

const BREIDEN = EVO_NEWS_PLAYER;
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-evo-news-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2026-11-23T23:04:54Z') }, now = () => clock.now;
  const store = new Store(dir);
  const accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), evoInt: (n) => (n === BOTCH_ODDS ? 1 : 0) });
  const add = (id, name, bankroll = 10853.56) => {
    const player = store.players[id] = { id, name, kind: 'password', login: { username: name.toLowerCase() }, createdAt: clock.now - 30 * 86400e3 };
    accounts.ensure(player);
    player.bankroll = bankroll;
    store.savePlayers();
    return player;
  };
  const hatch = (id, patch = {}) => {
    barn.layEgg(id);
    clock.now += 2000;
    barn.view(id);
    Object.assign(barn.doc.pens[id], patch);
    barn.save();
    return barn.doc.pens[id];
  };
  return { dir, clock, store, accounts, barn, add, hatch };
}

function creature(now, patch = {}) {
  return {
    stage: 'creature', species: 'empusa', name: 'Empusa', cap: 23, xp: xpFor(10),
    eggAt: now - 1e9, bornAt: now - 1e9, caughtAt: now - 1e9, fedAt: now, dayXpAt: now, combatVersion: 1,
    cool: {}, stats: { hunger: { v: 80, at: now }, mood: { v: 80, at: now }, clean: { v: 80, at: now } },
    ...patch,
  };
}

function plantNewsEmpusa(barn, playerId, { bench = true, evolvedAt = EVO_NEWS_AT, evo = 1, seen = false } = {}) {
  const now = barn.now();
  const pen = creature(now, { evo, evolvedAt, ...(seen ? { evoNewsSeen: now - 1000 } : {}) });
  if (bench) {
    if (!barn.doc.pens[playerId]) {
      barn.doc.pens[playerId] = creature(now, { species: 'halobates', name: 'Halobates', evo: 0, cap: 9, xp: xpFor(8), eggAt: now - 2e9, bornAt: now - 2e9 });
      delete barn.doc.pens[playerId].evolvedAt;
      delete barn.doc.pens[playerId].evoNewsSeen;
    }
    barn.doc.bench[playerId] = [...(barn.doc.bench[playerId] || []), pen];
  } else {
    barn.doc.pens[playerId] = pen;
  }
  barn.save();
  return pen;
}

function snapshot(player, pen) {
  return {
    bankroll: player.bankroll,
    txns: (player.txns || []).length,
    lastTxn: player.txns?.at(-1) && { t: player.txns.at(-1).t, type: player.txns.at(-1).type, amount: player.txns.at(-1).amount, note: player.txns.at(-1).note },
    xp: pen?.xp, evo: pen?.evo, cap: pen?.cap, evolvedAt: pen?.evolvedAt, species: pen?.species,
  };
}

test('normal heal mode is rejected on a sick bug: no silent evolution, no charge', (t) => {
  const f = fixture(t);
  const ann = f.add('ann', 'Ann', 1001);
  const pen = f.hatch('ann', { xp: xpFor(12), sick: f.clock.now, faintedAt: f.clock.now, faintedIn: 'purple' });
  const before = snapshot(ann, pen);
  assert.throws(() => f.barn.heal('ann', { mode: 'heal' }), (e) => e.status === 409 && e.code === 'specialist_required' && /specialist/i.test(e.message));
  assert.throws(() => f.barn.heal('ann', { normalHeal: true, bug: pen.eggAt || pen.bornAt }), (e) => e.code === 'specialist_required');
  const after = f.barn.doc.pens.ann;
  assert.equal(after.evo || 0, 0);
  assert.ok(after.sick);
  assert.equal(ann.bankroll, before.bankroll);
  assert.equal((ann.txns || []).length, before.txns);
  assert.equal(after.xp, before.xp);
});

test('normal heal mode is rejected on a taken bug: no silent rebuild, no charge, no donor taken', (t) => {
  const f = fixture(t);
  const ann = f.add('ann', 'Ann', 1001);
  const pen = f.hatch('ann', { xp: xpFor(24), evo: 1, cap: 23, taken: f.clock.now, faintedAt: f.clock.now, faintedIn: 'collected' });
  const spareAt = pen.bornAt + 1;
  f.barn.doc.bench.ann = [{ ...structuredClone(pen), bornAt: spareAt, eggAt: spareAt, name: 'Spare', evo: 0, taken: undefined, faintedAt: undefined, cap: 9, xp: xpFor(4) }];
  f.barn.save();
  const before = snapshot(ann, pen);
  assert.throws(() => f.barn.heal('ann', { mode: 'heal', donor: spareAt }), (e) => e.status === 409 && e.code === 'specialist_required');
  assert.equal(f.barn.doc.pens.ann.evo, 1);
  assert.ok(f.barn.doc.pens.ann.taken);
  assert.equal(f.barn.doc.bench.ann.length, 1);
  assert.equal(ann.bankroll, before.bankroll);
  assert.equal((ann.txns || []).length, before.txns);
});

test('a bare heal (and confirmEvolve) still run the specialist visit for existing callers', (t) => {
  const f = fixture(t);
  f.add('ann', 'Ann', 1001);
  f.hatch('ann', { xp: xpFor(12), sick: f.clock.now, faintedAt: f.clock.now, faintedIn: 'purple' });
  const bare = f.barn.heal('ann');
  assert.equal(bare.evolved.stage ?? 1, 1);
  assert.equal(f.barn.doc.pens.ann.evo, 1);
  assert.equal(f.barn.doc.pens.ann.sick, undefined);
  assert.equal(bare.evolved.bill.took, 500.5);

  const f2 = fixture(t);
  f2.add('ann', 'Ann', 1001);
  f2.hatch('ann', { xp: xpFor(12), sick: f2.clock.now, faintedAt: f2.clock.now, faintedIn: 'purple' });
  const flagged = f2.barn.heal('ann', { confirmEvolve: true });
  assert.equal(f2.barn.doc.pens.ann.evo, 1);
  assert.deepEqual(flagged.evolved.bill, { had: 1001, took: 500.5, left: 500.5 });

  const f3 = fixture(t);
  f3.add('ann', 'Ann', 1001);
  const pen = f3.hatch('ann', { xp: xpFor(24), evo: 1, cap: 23, taken: f3.clock.now, faintedAt: f3.clock.now, faintedIn: 'collected' });
  f3.barn.doc.bench.ann = [{ ...structuredClone(pen), bornAt: pen.bornAt + 1, eggAt: pen.bornAt + 1, name: 'Spare', evo: 0, taken: undefined, faintedAt: undefined, cap: 9, xp: xpFor(4) }];
  f3.barn.save();
  const rebuilt = f3.barn.heal('ann', { mode: 'specialist', donor: pen.bornAt + 1 });
  assert.equal(rebuilt.evolved.stage, 2);
  assert.equal(f3.barn.doc.pens.ann.evo, 2);
  assert.equal(f3.ann?.bankroll ?? f3.store.players.ann.bankroll, 1001, 'parts are not a cash bill');
});

test('mode: heal still treats an ordinary knockout', (t) => {
  const f = fixture(t);
  f.add('ann', 'Ann', 1001);
  f.hatch('ann', { faintedAt: f.clock.now - 2 * 3600e3, faintedIn: 'mines' });
  const r = f.barn.heal('ann', { mode: 'heal' });
  assert.equal(r.healed, true);
  assert.equal(r.cost, 0);
  assert.equal(r.evolved, undefined);
  assert.equal(f.barn.doc.pens.ann.faintedAt, undefined);
  assert.equal(f.barn.doc.pens.ann.evo || 0, 0);
});

test("Breiden's Empusa surfaces evoNews automatically; other players never do", (t) => {
  const f = fixture(t);
  const breiden = f.add(BREIDEN, 'Breiden');
  plantNewsEmpusa(f.barn, BREIDEN, { bench: true });
  const view = f.barn.view(BREIDEN);
  assert.ok(view.evoNews, 'pending recap is on the barn view');
  assert.equal(view.evoNews.species, 'empusa');
  assert.equal(view.evoNews.name, 'Empusa');
  assert.equal(view.evoNews.stage, 1);
  assert.equal(view.evoNews.copy, true);
  assert.equal(view.evoNews.botched, null);
  assert.deepEqual(view.evoNews.bill, EVO_NEWS_BILL);
  assert.deepEqual([view.evoNews.levelBefore, view.evoNews.levelAfter], [9, 10]);
  assert.equal(view.pen.species, 'halobates', 'Empusa can be on the bench; the partner is unchanged');
  const empusa = view.stable.bugs.find((b) => b.species === 'empusa');
  assert.equal(empusa.evo, 1);
  assert.equal(empusa.level, 10);

  const other = f.add(OTHER, 'Other');
  plantNewsEmpusa(f.barn, OTHER, { bench: false });
  assert.equal(f.barn.view(OTHER).evoNews, undefined, 'the same fingerprint on anyone else is not news');

  // Wrong evolvedAt, already seen, or already Stage III: no news for Breiden either.
  const f2 = fixture(t);
  f2.add(BREIDEN, 'Breiden');
  plantNewsEmpusa(f2.barn, BREIDEN, { evolvedAt: EVO_NEWS_AT + 1 });
  assert.equal(f2.barn.view(BREIDEN).evoNews, undefined);

  const f3 = fixture(t);
  f3.add(BREIDEN, 'Breiden');
  plantNewsEmpusa(f3.barn, BREIDEN, { seen: true });
  assert.equal(f3.barn.view(BREIDEN).evoNews, undefined);

  const f4 = fixture(t);
  f4.add(BREIDEN, 'Breiden');
  plantNewsEmpusa(f4.barn, BREIDEN, { evo: 2 });
  assert.equal(f4.barn.view(BREIDEN).evoNews, undefined);

  // A sick or taken bug still exists alongside news (greetingFor prefers care); the payload itself stays on the view.
  assert.equal(breiden.bankroll, 10853.56);
});

test('ack marks the recap seen persistently, charges $0, and leaves bankroll, ledger, XP and stage alone', (t) => {
  const f = fixture(t);
  const breiden = f.add(BREIDEN, 'Breiden');
  plantNewsEmpusa(f.barn, BREIDEN, { bench: true });
  const raw = f.barn.bugs(BREIDEN).find((b) => b.species === 'empusa');
  const before = snapshot(breiden, raw);
  const first = f.barn.ackEvoNews(BREIDEN);
  assert.equal(first.evoNews, undefined);
  const after = f.barn.bugs(BREIDEN).find((b) => b.species === 'empusa');
  assert.equal(after.evoNewsSeen, f.clock.now);
  assert.equal(after.evo, 1);
  assert.equal(after.xp, before.xp);
  assert.equal(after.evolvedAt, EVO_NEWS_AT);
  assert.equal(breiden.bankroll, before.bankroll);
  assert.equal((breiden.txns || []).length, before.txns);
  assert.deepEqual(breiden.txns?.at(-1) && { t: breiden.txns.at(-1).t, type: breiden.txns.at(-1).type, amount: breiden.txns.at(-1).amount, note: breiden.txns.at(-1).note }, before.lastTxn);
  // Persistent after a fresh view, and a second ack is a no-op.
  assert.equal(f.barn.view(BREIDEN).evoNews, undefined);
  const again = f.barn.ackEvoNews(BREIDEN);
  assert.equal(again.evoNews, undefined);
  assert.equal(f.barn.bugs(BREIDEN).find((b) => b.species === 'empusa').evoNewsSeen, f.clock.now);
  assert.equal(breiden.bankroll, before.bankroll);
  assert.equal((breiden.txns || []).length, before.txns);
});

test('HTTP: mode=heal is 409 on a sick bug; confirmEvolve still evolves; evo-news ack is signed-in only and free', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-evo-news-http-'));
  const { app, service, shutdown } = createApp({ dataDir, devLogin: true, now: () => Date.parse('2026-11-23T23:04:54Z'), env: { BARN_TEST_EGG: '1', BARN_INCUBATE_MS: '50' } });
  const server = await new Promise((res) => { const x = app.listen(0, '127.0.0.1', () => res(x)); });
  const root = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  assert.equal((await fetch(`${root}/api/barn/evo-news/ack`, { method: 'POST' })).status, 401);

  const login = await fetch(root + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann-news@x.test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => {
    const r = await fetch(root + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    const body = await r.json();
    return { status: r.status, body };
  };

  const me = (await call('GET', '/me')).body;
  service.accounts.change(service.store.players[me.id], 1001 - service.store.players[me.id].bankroll, 'dev', 'test bankroll');
  const at = service.now();
  service.barn.doc.pens[me.id] = {
    stage: 'creature', name: 'Empusa', species: 'empusa', eggAt: at, bornAt: at, caughtAt: at, fedAt: at, dayXpAt: at,
    xp: xpFor(12), cap: 9, sick: at, faintedAt: at, faintedIn: 'purple', combatVersion: 1,
    cool: {}, stats: { hunger: { v: 80, at }, mood: { v: 80, at }, clean: { v: 80, at } },
  };
  service.barn.save();
  const bank = service.store.players[me.id].bankroll;
  const txns = (service.store.players[me.id].txns || []).length;

  const blocked = await call('POST', '/barn/heal', { mode: 'heal' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'specialist_required');
  assert.equal(service.barn.doc.pens[me.id].evo || 0, 0);
  assert.ok(service.barn.doc.pens[me.id].sick);
  assert.equal(service.store.players[me.id].bankroll, bank);
  assert.equal((service.store.players[me.id].txns || []).length, txns);

  const ok = await call('POST', '/barn/heal', { confirmEvolve: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.evolved.species, 'empusa');
  assert.equal(service.barn.doc.pens[me.id].evo, 1);
});

test('Bug Center client: healRequest and greetingFor prefer care over news, and the recap copy is bilingual', () => {
  assert.deepEqual(healRequest({ id: 11 }), { bug: 11, mode: 'heal' });
  assert.deepEqual(healRequest({ id: 11 }, { pay: true }), { bug: 11, mode: 'heal', pay: true });
  assert.deepEqual(healRequest({ id: 11 }, { specialist: true, donor: 22 }), { bug: 11, confirmEvolve: true, donor: 22 });

  const news = newsAsEvolved({
    id: 99, name: 'Empusa', species: 'empusa', botched: null, stage: 1, copy: true,
    levelBefore: 9, levelAfter: 10, bill: EVO_NEWS_BILL,
  });
  const view = { pen: { id: 1, name: 'Halobates', stage: 'creature' }, evoNews: news, stable: { bugs: [{ id: 1, name: 'Halobates', stage: 'creature' }, { id: 99, name: 'Empusa', species: 'empusa', stage: 'creature', evo: 1 }] } };
  const g = greetingFor(view);
  assert.equal(g.kind, 'news');
  assert.equal(g.news.name, 'Empusa');
  assert.ok(g.lines.every((l) => l.both && /[\u3040-\u30ff\u4e00-\u9faf]/.test(l.ja) && l.en));
  assert.match(g.lines.map((l) => l.en).join(' '), /important news about Empusa/);
  assert.match(g.lines.map((l) => l.en).join(' '), /copy of the receipt/);
  assert.match(g.lines.map((l) => l.en).join(' '), /very much alive/);
  assert.equal(g.lines.at(-1).call, true);

  const sick = greetingFor({ ...view, stable: { bugs: [{ id: 1, name: 'Halobates', stage: 'creature', sick: true, fainted: true }, view.stable.bugs[1]] } });
  assert.equal(sick.kind, 'care');
  assert.match(sick.lines.map((l) => l.en).join(' '), /purple/);

  const taken = greetingFor({ ...view, stable: { bugs: [{ id: 1, name: 'Halobates', stage: 'creature', taken: true, fainted: true }, view.stable.bugs[1]] } });
  assert.equal(taken.kind, 'care');
  assert.match(taken.lines.map((l) => l.en).join(' '), /ticket/);

  const close = newsAfter(news);
  assert.match(close.map((l) => l.en).join(' '), /Not gone at all/);
  assert.match(close.map((l) => l.en).join(' '), /mostly iron/);
  assert.match(close.map((l) => l.en).join(' '), /don't mention the curtain/);
  assert.ok(close.at(-1).end);
  assert.ok(close.every((l) => l.both));

  assert.equal(RECEIPT.copy.en, 'Copy · Already paid');
  assert.equal(news.copy, true);
  assert.deepEqual(news.bill, EVO_NEWS_BILL);
  // The ordinary greeting is unchanged when there is no news.
  assert.equal(greetingFor({ pen: { stage: 'creature', name: 'Pip' }, stable: { bugs: [{ stage: 'creature', name: 'Pip' }] } }).kind, 'care');
  assert.match(greeting({ stage: 'creature', name: 'Pip' }).at(-1).en, /check-up/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { Barn, BOUT_COOLDOWN_MS, BOUT_XP } from '../server/barn.js';
import { Store } from '../server/store.js';
import { ROSTER, xpFor } from '../server/engine/creatures.js';

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'bba-barn-combat-');
  const dataDir = fs.mkdtempSync(prefix);
  const clock = { now: 1_800_000_000_000 };
  const { app, service, shutdown } = createApp({ dataDir, now: () => clock.now, devLogin: true, env: { BARN_INCUBATE_MS: '1' } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    shutdown(); server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(dataDir).startsWith(path.resolve(prefix)));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
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
  const barn = service.shop.barn;
  const hatch = (id, level = 3) => {
    barn.layEgg(id); clock.now += 1; barn.view(id);
    barn.doc.pens[id].xp = xpFor(level); barn.save();
    return barn.doc.pens[id];
  };
  return { dataDir, clock, service, barn, anon, owner, other, client, hatch };
}

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

test('HTTP bouts award XP outside care limits, use pre-award level and do not reward replay or failed attempts', async t => {
  const { owner, hatch, barn, clock, service, dataDir } = await fixture(t);
  const pen = hatch(owner.id);
  pen.xp = xpFor(4) - 10; pen.xpToday = 120; pen.xpDay = Math.floor(clock.now / 86400e3); barn.save();
  const bankroll = service.getPlayer(owner.id).bankroll;
  const fight = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(fight.status, 200, JSON.stringify(fight.body));
  const result = fight.body.pen;
  assert.equal(result.xp, xpFor(4) + 10); assert.equal(result.level, 4);
  assert.equal(result.lastBout.xpEarned, BOUT_XP); assert.equal(result.lastBout.levelBefore, 3); assert.equal(result.lastBout.levelAfter, 4);
  assert.equal(result.lastBout.you.level, 3); assert.equal(result.lastBout.them.level, 3);
  assert.equal(result.lastBout.maxHp[0], 100); assert.equal(result.boutCoolMs, BOUT_COOLDOWN_MS);
  assert.equal(result.arenaLevel, 3); assert.equal(result.boutXp, BOUT_XP);
  assert.equal(barn.doc.pens[owner.id].xpToday, 120); assert.equal(service.getPlayer(owner.id).bankroll, bankroll);
  assert.equal((await owner.api('POST', '/api/barn/bout', {})).status, 429);
  for (let i = 0; i < 3; i++) {
    const read = await owner.api('GET', '/api/barn');
    assert.equal(read.body.pen.xp, result.xp); assert.deepEqual(read.body.pen.lastBout, result.lastBout);
  }
  const reloaded = new Barn({ store: new Store(dataDir), now: () => clock.now });
  assert.equal(reloaded.view(owner.id).pen.xp, result.xp);
  assert.equal(reloaded.view(owner.id).pen.boutCoolMs, BOUT_COOLDOWN_MS);
  assert.deepEqual(reloaded.view(owner.id).pen.lastBout, result.lastBout);
  clock.now += BOUT_COOLDOWN_MS;
  barn.doc.pens[owner.id].xp = xpFor(10); barn.save();
  const maxLevel = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(maxLevel.status, 200); assert.equal(maxLevel.body.pen.xp, xpFor(10) + BOUT_XP);
  assert.equal(maxLevel.body.pen.level, 10); assert.equal(maxLevel.body.pen.xpNext, null);
});

test('failed persistence leaves battle choices and XP/record/replay unchanged, and retry awards only once', async t => {
  const { owner, hatch, barn, service, dataDir } = await fixture(t);
  hatch(owner.id, 6);
  const before = structuredClone(barn.doc);
  const diskBefore = fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8');
  const saveDoc = service.store.saveDoc.bind(service.store);
  service.store.saveDoc = (name, doc) => { if (name === 'barn') throw new Error('simulated write failure'); return saveDoc(name, doc); };
  t.after(() => { service.store.saveDoc = saveDoc; });
  assert.equal((await owner.api('PATCH', '/api/barn/battle', { stance: 'aggressive', specials: ['technique'] })).status, 500);
  assert.deepEqual(barn.doc, before);
  assert.equal((await owner.api('POST', '/api/barn/bout', {})).status, 500);
  assert.deepEqual(barn.doc, before);
  assert.equal(fs.readFileSync(path.join(dataDir, 'barn.json'), 'utf8'), diskBefore);
  service.store.saveDoc = saveDoc;
  const retry = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(retry.status, 200); assert.equal(retry.body.pen.xp, xpFor(6) + BOUT_XP);
  assert.equal(Object.values(retry.body.pen.record).reduce((sum, count) => sum + count, 0), 1);
});

test('wins, losses and draws all award the same participation XP without rewarding the opponent', () => {
  const outcomes = new Set();
  for (let seed = 0; seed < 256 && outcomes.size < 3; seed++) {
    let now = 1_800_000_000_000, saved;
    const store = { loadDoc: (_name, fallback) => saved ? structuredClone(saved) : fallback, saveDoc: (_name, doc) => { saved = structuredClone(doc); } };
    const barn = new Barn({ store, now: () => now, incubateMs: 1, startXp: xpFor(6), eggInt: n => seed % n });
    for (const id of ['a', 'b']) {
      barn.layEgg(id); now++; barn.view(id);
      const pen = barn.doc.pens[id]; pen.species = 'lamprima';
      pen.battle = { stance: 'defensive', specials: ['technique', 'signature'] };
      pen.stats = Object.fromEntries(['hunger', 'mood', 'clean'].map(stat => [stat, { v: 0, at: now }]));
      pen.xpToday = 120; pen.xpDay = Math.floor(now / 86400e3);
    }
    barn.save(); const opponent = structuredClone(barn.doc.pens.b);
    const result = barn.bout('a').pen;
    outcomes.add(result.lastBout.result);
    assert.equal(result.xp, xpFor(6) + BOUT_XP); assert.equal(result.lastBout.xpEarned, BOUT_XP);
    assert.equal(barn.doc.pens.a.xpToday, 120); assert.deepEqual(barn.doc.pens.b, opponent);
  }
  assert.deepEqual([...outcomes].sort(), ['draw', 'lost', 'won']);
});

test('matching uses current nearby levels or a same-level stray without changing the opponent', async t => {
  const { owner, other, hatch, barn, clock } = await fixture(t);
  hatch(owner.id, 3); hatch(other.id, 10);
  const farBefore = structuredClone(barn.doc.pens[other.id]);
  const first = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(first.body.pen.lastBout.them.stray, true); assert.equal(first.body.pen.lastBout.them.level, 3);
  assert.deepEqual(barn.doc.pens[other.id], farBefore);
  clock.now += BOUT_COOLDOWN_MS;
  barn.doc.pens[other.id].xp = xpFor(4); barn.save();
  const nearBefore = structuredClone(barn.doc.pens[other.id]);
  const second = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(second.body.pen.lastBout.them.stray, false); assert.equal(second.body.pen.lastBout.them.name, nearBefore.name);
  assert.deepEqual(barn.doc.pens[other.id], nearBefore, 'being an opponent grants no XP or record change');
  clock.now += BOUT_COOLDOWN_MS;
  barn.doc.pens[other.id].xp = xpFor(5) - 5;
  barn.doc.pens[other.id].dayXpAt = clock.now - 86400e3;
  barn.save(); const staleBefore = structuredClone(barn.doc.pens[other.id]);
  const third = await owner.api('POST', '/api/barn/bout', {});
  assert.equal(third.body.pen.lastBout.them.stray, true, 'pending daily XP makes the stored level-4 opponent level 5 and out of range');
  assert.deepEqual(barn.doc.pens[other.id], staleBefore, 'checking current opponent level does not write their passive XP');
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

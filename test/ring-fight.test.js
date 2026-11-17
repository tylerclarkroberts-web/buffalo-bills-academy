// The shared ring fight: one action at a time, moves lined up by the owner or picked by the bug, and the Barn's
// money held while a fight is on and paid when it ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { ROSTER, xpFor } from '../server/engine/creatures.js';
import { startBout, stepBout, simulateBout, nextMove, odds, line, MAX_ROUNDS } from '../server/engine/bout.js';
import { traitFor, riskFor, upsetXp } from '../server/engine/bug-combat.js';
import { Fights, FIGHT } from '../server/fights.js';
const cents = (x) => Math.round(x * 100) / 100;

const bug = (species, extra = {}) => ({ species, name: species, level: 10, ...extra });

test('every species has a trait, and a fight left alone is the same fight every time', () => {
  for (const b of ROSTER) assert.ok(traitFor(b.id)?.name && traitFor(b.id).description, b.id);
  const a = simulateBout(bug('lamprima'), bug('sagra'), 'seed');
  assert.deepEqual(a, simulateBout(bug('lamprima'), bug('sagra'), 'seed'));
  assert.ok(a.rounds.filter(r => r.type === 'move').length <= MAX_ROUNDS);
  assert.ok(a.rounds[a.rounds.length - 1].hp.some(hp => hp <= 0) || a.rounds.filter(r => r.type === 'move').length === MAX_ROUNDS, 'a knockout or the bell');
});

test('a lined-up move is used when it is ready; one still recovering falls back to the bug\'s own pick', () => {
  const S = startBout(bug('lamprima'), bug('sagra'), 'pick'), me = S.by;
  assert.equal(stepBout(S, 'capstone').find(r => r.type === 'move').moveId, 'capstone');
  stepBout(S); // the other bug
  const again = stepBout(S, 'capstone').find(r => r.type === 'move');
  assert.equal(again.by, me);
  assert.notEqual(again.moveId, 'capstone', 'still recovering');
  assert.equal(nextMove(S, me, 'not-a-move').id, nextMove(S, me).id);
  const young = startBout(bug('lamprima', { level: 1 }), bug('sagra', { level: 1 }), 'young');
  assert.notEqual(stepBout(young, 'capstone').find(r => r.type === 'move').moveId, 'capstone', 'not learned yet');
});

test('the odds shown for a move are what the fight then does with it', () => {
  let checked = 0;
  ROSTER.forEach((b, n) => {
    const S = startBout(bug(b.id, { health: 60 }), bug(ROSTER[(n * 7 + 3) % ROSTER.length].id), `odds:${n}`);
    while (!S.over) {
      const by = S.by, shown = odds(S, by);
      for (const o of Object.values(shown)) {
        if ('heal' in o) { assert.ok(o.heal >= 0 && o.heal <= S.maxHp[by] - S.hp[by]); continue; }
        assert.ok(o.hit >= 0 && o.hit <= 1 && o.dmg[0] >= 1 && o.dmg[0] <= o.dmg[1], JSON.stringify(o));
      }
      const events = stepBout(S), act = events[0];
      // Venom, a sip of fog or a mantis lying still change the sum after it was shown; every other action must match it.
      if (act.type !== 'move' || act.skipped || act.critical || S.side.some(s => s.t === 'onymacris' || s.t === 'deroplatys')) continue;
      const o = shown[act.moveId]; checked++;
      if (act.effect === 'heal') assert.equal(act.healed, o.heal, `${b.id} heal`);
      else if (act.hit) assert.ok(act.dmg >= o.dmg[0] && act.dmg <= o.dmg[1], `${b.id} ${act.moveId}: ${act.dmg} outside ${o.dmg}`);
    }
  });
  assert.ok(checked > 300, `only ${checked} actions checked`);
});

test('a watched fight takes one action a beat and uses the lined-up moves; an unwatched one runs straight through', () => {
  let now = 1000, finished = 0;
  const fights = new Fights({ now: () => now });
  const fight = fights.start({ id: 'f1', kind: 'barn', players: ['a', 'b'], fighters: [bug('lamprima'), bug('sagra')], seed: 's', watching: ['a'], onFinish: () => finished++ });
  assert.equal(fights.line(fight, 'a', ['capstone', 'basic', 'technique', 'tactic']), false, 'three at most');
  assert.equal(fights.line(fight, 'a', ['not-a-move']), false);
  assert.equal(fights.line(fight, 'c', ['basic']), false, 'not their fight');
  assert.ok(fights.line(fight, 'a', ['capstone', 'basic']));
  fights.sweep();
  assert.equal(fight.S.turn, 0, 'the entrance comes first');
  for (let i = 0; i < 4; i++) { now = fight.nextAt; fights.view(fight, 'a'); const before = fight.S.turn; fights.sweep(); assert.equal(fight.S.turn, before + 1); }
  assert.deepEqual(fight.S.rounds.filter(r => r.type === 'move' && r.by === 0).map(r => r.moveId), ['capstone', 'basic']);
  assert.deepEqual(fights.view(fight, 'a').queue, []);
  const theirs = fights.view(fight, 'b', 2);
  assert.equal(theirs.you.species, 'sagra'); assert.equal(theirs.from, 2);
  assert.deepEqual(theirs.rounds[0].hp, [...fight.S.rounds[2].hp].reverse(), 'turned to their corner');
  now += FIGHT.watchMs + 1; fights.sweep();
  assert.ok(fight.over); assert.equal(finished, 1); assert.equal(fights.fightOf('a'), null);
  assert.ok(['won', 'lost', 'draw'].includes(fights.view(fight, 'a').result));
  now += FIGHT.keepMs + 1; fights.sweep();
  assert.equal(fights.get('f1'), null, 'forgotten after a minute');
});

async function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'bba-ring-fight-');
  const dataDir = fs.mkdtempSync(prefix), clock = { now: 1_800_000_000_000 };
  let running, server, base;
  const boot = async () => {
    running = createApp({ dataDir, now: () => clock.now, devLogin: true, env: { BARN_INCUBATE_MS: '1' } });
    server = await new Promise(resolve => { const s = running.app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { running.shutdown(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); };
  await boot();
  t.after(async () => { await stop(); assert.ok(path.resolve(dataDir).startsWith(path.resolve(prefix))); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const login = async name => {
    const res = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@example.test` }) });
    const cookie = res.headers.get('set-cookie').split(';')[0], id = (await res.json()).id;
    const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
    return { id, api };
  };
  const host = await login('RingHost'), guest = await login('RingGuest');
  const hatch = (id, level) => { const barn = running.service.barn; barn.layEgg(id); clock.now += 1; barn.view(id); barn.doc.pens[id].xp = xpFor(level); barn.save(); };
  const cash = player => running.service.getPlayer(player.id).bankroll;
  return { clock, host, guest, hatch, cash, get barn() { return running.service.barn; }, restart: async () => { await stop(); await boot(); } };
}

test('the line: a mirror match is even, the two corners sum to one, level and health tip it, and stakes and bonus XP follow', () => {
  const bug = (k, level, more = {}) => ({ species: ROSTER[k].id, name: `B${k}`, level, mood: 70, ...more });
  assert.equal(line(bug(0, 5), bug(0, 5)), 0.5);
  for (const [a, b] of [[bug(2, 5), bug(9, 2)], [bug(4, 3), bug(17, 3)], [bug(1, 7, { health: 40 }), bug(1, 7)]]) {
    const p = line(a, b), q = line(b, a);
    assert.equal(Math.round(p * 100) + Math.round(q * 100), 100);
    assert.equal(Math.round(p * 100) % 5, 0); assert.ok(p >= 0.1 && p <= 0.9);
  }
  assert.ok(line(bug(2, 5), bug(9, 2)) >= 0.65, 'three levels up is the favourite');
  assert.ok(line(bug(1, 7, { health: 40 }), bug(1, 7)) < 0.5, 'a hurt bug is the underdog against its twin');
  assert.equal(line(bug(3, 10), bug(3, 1)), 0.9, 'never a certainty');
  // fair odds: at 80% the favourite's $40 meets $10, and the other way round
  assert.deepEqual([riskFor(40, 0.8), riskFor(10, 0.2), riskFor(25, 0.5), riskFor(0, 0.8)], [10, 40, 25, 0]);
  assert.deepEqual([riskFor(100, 0.9), riskFor(20, 0.9), riskFor(10, 0.9), riskFor(100, 0.55)], [11, 2, 1, 82], 'to the whole dollar, and never nothing against a real stake');
  assert.deepEqual([upsetXp(10, 0.5), upsetXp(10, 0.9), upsetXp(10, 0.1), upsetXp(10)], [10, 2, 18, 10]);
});

test('joining a bout holds both stakes, plays live and pays the pot when it ends', async t => {
  const f = await fixture(t), { host, guest, hatch, cash, clock } = f;
  hatch(host.id, 1); hatch(guest.id, 4); // a level 1 bug may bout now
  const start = [cash(host), cash(guest)];
  const posted = await host.api('POST', '/api/barn/bouts', { stake: 50 });
  assert.equal(posted.status, 200);
  // the board tells the guest its bug's chance and what the line asks it to put up against the host's $50
  const id = posted.body.openBout.id, terms = Object.values((await guest.api('GET', '/api/barn')).body.bouts[0].terms)[0], risk = terms.risk;
  assert.ok(terms.win > 0.5 && risk > 50, 'a level 4 is favoured over a level 1, so it puts up more');
  assert.equal(risk, riskFor(50, (100 - Math.round(terms.win * 100)) / 100));
  const stale = await guest.api('POST', `/api/barn/bouts/${id}/join`, { risk: risk + 1 });
  assert.equal(stale.status, 409); assert.match(stale.body.error, /line moved/, 'never at a stake the page did not show');
  const joined = await guest.api('POST', `/api/barn/bouts/${id}/join`, { risk });
  assert.equal(joined.status, 200); assert.equal(joined.body.live, id);
  assert.deepEqual([cash(host), cash(guest)], [start[0] - 50, cents(start[1] - risk)], 'both stakes are held while it is on');
  assert.equal(joined.body.pen.lastBout, null, 'nothing is decided yet');
  assert.equal((await guest.api('POST', '/api/barn/bouts', { stake: 0 })).status, 409, 'one ring at a time');
  const live = (await guest.api('GET', `/api/barn/fight?id=${id}`)).body.fight;
  assert.equal(live.line, terms.win, 'the ring names the same line the board did');
  assert.equal(live.live, true); assert.deepEqual(live.moves.map(m => m.id), ['basic', 'technique', 'signature']);
  assert.deepEqual((await guest.api('POST', `/api/barn/fight/${id}/moves`, { moves: ['technique', 'basic'] })).body.fight.queue, ['technique', 'basic']);
  assert.equal((await guest.api('POST', `/api/barn/fight/${id}/moves`, { moves: ['capstone'] })).status, 400, 'not learned at level 4');
  assert.equal((await host.api('GET', '/api/barn/waiting')).body.challenges, 1, 'the host\'s Barn button says their bug is fighting');
  clock.now += 10_000; f.barn.fights.sweep(); // nobody has looked for a while: it runs to the end
  const mine = (await guest.api('GET', '/api/barn')).body, theirs = (await host.api('GET', '/api/barn?seen=1')).body;
  assert.equal(mine.live, null); assert.equal(mine.pen.lastBout.id, id);
  const result = mine.pen.lastBout.result;
  assert.equal(cash(host) + cash(guest), start[0] + start[1], 'the pot goes somewhere and nowhere else');
  if (result !== 'draw') assert.equal(cash(result === 'won' ? guest : host), result === 'won' ? start[1] + 50 : cents(start[0] + risk), 'the winner takes what the other put up');
  assert.equal(theirs.unseenBout, true, 'the host was not there to see it');
  assert.equal(theirs.pen.lastBout.result, result === 'won' ? 'lost' : result === 'lost' ? 'won' : 'draw');
  assert.ok(mine.pen.lastBout.xpEarned > 0 && theirs.pen.lastBout.xpEarned > 0);
  assert.equal((await guest.api('GET', `/api/barn/fights/${id}`)).status, 200, 'on the ring\'s record');
  assert.equal((await guest.api('POST', `/api/barn/bouts/${id}/join`, {})).body.pen.lastBout.id, id, 'a late retry changes nothing');
  assert.equal(cash(host) + cash(guest), start[0] + start[1]);
});

test('a restart mid-fight calls it off: both stakes go back and nobody is paid or scored', async t => {
  const f = await fixture(t), { host, guest, hatch, cash } = f;
  hatch(host.id, 3); hatch(guest.id, 3);
  const start = [cash(host), cash(guest)];
  const id = (await host.api('POST', '/api/barn/bouts', { stake: 100 })).body.openBout.id;
  const risk = Object.values((await guest.api('GET', '/api/barn')).body.bouts[0].terms)[0].risk;
  await guest.api('POST', `/api/barn/bouts/${id}/join`, {});
  assert.deepEqual([cash(host), cash(guest)], [start[0] - 100, cents(start[1] - risk)]);
  await f.restart();
  const view = (await guest.api('GET', '/api/barn')).body;
  assert.equal(view.live, null); assert.equal(view.pen.lastBout, null);
  assert.deepEqual([cash(host), cash(guest)], start);
  assert.deepEqual(view.pen.record, { w: 0, l: 0, d: 0 });
});

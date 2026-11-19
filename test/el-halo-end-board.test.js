// End-of-round leaderboard: tracked stats, funny badges, play-again from the over card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../client/src/mines/elhalo/logic.js';
import { Match } from '../server/elhalo/match.js';
import { groundAt, BUFADORA } from '../server/elhalo/map.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seeded = (seed = 7) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function setup(names = ['t', 'j'], seed = 7) {
  const m = new Match({ rnd: seeded(seed) });
  for (const n of names) assert.ok(m.join(n, { name: n.toUpperCase(), nowMs: 0 }).ok);
  assert.ok(m.begin(names[0]).ok);
  return m;
}
const put = (m, id, x, z) => { const p = m.players.get(id); p.x = x; p.z = z; p.y = groundAt(x, z, 50); p.hist = []; return p; };
const run = (m, secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) m.tick(dt); };
const toWave = (m, n) => { m.wave = n - 1; m.phase = 'break'; m.phaseUntil = m.t; m.tick(0.1); assert.equal(m.wave, n); };

test('MATCH.overSecs leaves enough time to read the board', () => {
  assert.equal(L.MATCH.overSecs, 40);
});

test('buildEndBoard sorts by kills then revives, highlights tops, and awards funny badges only when the stat is real', () => {
  const rows = L.buildEndBoard([
    { id: 'a', name: 'Chuy', joined: true, kills: 12, pvp: 0, deaths: 1, heads: 2, score: 400, revives: 0, revived: 0, melee: 4, chiles: 0, launches: 0, dmg: 80, alive: 90 },
    { id: 'b', name: 'Rosa', joined: true, kills: 3, pvp: 0, deaths: 5, heads: 0, score: 200, revives: 4, revived: 1, melee: 0, chiles: 2, launches: 1, dmg: 40, alive: 70 },
    { id: 'c', name: 'Tío', joined: true, kills: 1, pvp: 0, deaths: 2, heads: 0, score: 80, revives: 1, revived: 4, melee: 0, chiles: 0, launches: 3, dmg: 200, alive: 40 },
    { id: 'skip', name: 'Offline', joined: false },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.equal(rows[0].topKiller, true);
  assert.equal(rows[1].topReviver, true);
  assert.equal(rows[2].topKiller, false);
  const names = (id) => rows.find((r) => r.id === id).badges.map((b) => b.name);
  const ids = (id) => rows.find((r) => r.id === id).badges.map((b) => b.id);
  assert.ok(ids('a').includes('plomo') && names('a').includes('Puro Plomo'));
  assert.ok(ids('a').includes('machete') && names('a').includes('A Machete Limpio'));
  assert.ok(ids('a').includes('nopal') && names('a').includes('Aguantó Como Nopal'));
  assert.ok(ids('b').includes('samaritan') && names('b').includes('Nadie se Queda'));
  assert.ok(ids('b').includes('chile') && names('b').includes('Se Comió el Chile'));
  assert.ok(ids('b').includes('iguana') && names('b').includes('Cae Como Iguana'));
  assert.ok(ids('c').includes('turista') && names('c').includes('Vino a Ver'));
  assert.ok(ids('c').includes('piso') && names('c').includes('Siempre en el Piso'));
  assert.ok(ids('c').includes('bufadora') && names('c').includes('Se Lo Llevó el Agua'));
  assert.ok(ids('c').includes('esponja') && names('c').includes('Esponja de Plomo'));
  assert.ok(!rows.some((r) => r.id === 'skip'));
  const leaver = L.buildEndBoard([
    { id: 'a', name: 'Chuy', joined: true, kills: 4, revives: 0, deaths: 1, score: 100 },
    { id: 'left', name: 'Rosa', joined: false, kills: 2, revives: 1, deaths: 0, score: 80 },
  ]);
  assert.deepEqual(leaver.map((r) => r.id), ['a', 'left']);

});

test('buildEndBoard skips empty and unspread badges; ties share a badge', () => {
  const zeros = L.buildEndBoard([
    { id: 'a', name: 'A', joined: true, ...L.BLANK_STATS },
    { id: 'b', name: 'B', joined: true, ...L.BLANK_STATS },
  ]);
  assert.ok(zeros.every((r) => !r.badges.length && !r.topKiller && !r.topReviver));

  const evenKills = L.buildEndBoard([
    { id: 'a', name: 'A', joined: true, ...L.BLANK_STATS, kills: 3, deaths: 1 },
    { id: 'b', name: 'B', joined: true, ...L.BLANK_STATS, kills: 3, deaths: 1 },
  ]);
  assert.ok(evenKills.every((r) => r.badges.some((b) => b.id === 'plomo')));
  assert.ok(evenKills.every((r) => !r.badges.some((b) => b.id === 'turista')), 'Vino a Ver only when kill counts actually spread');
  assert.ok(evenKills.every((r) => r.topKiller));

  const solo = L.buildEndBoard([{ id: 'a', name: 'A', joined: true, ...L.BLANK_STATS, kills: 5 }]);
  assert.ok(solo[0].badges.some((b) => b.id === 'plomo'));
  assert.ok(!solo[0].badges.some((b) => b.id === 'turista'));
});

test('the match counts revives, melee, chiles, launches, damage taken and time alive, then puts them on last.board', () => {
  const m = setup(['t', 'j']); toWave(m, 2); m.queue = []; m.enemies = []; m.calm = true;
  const t = put(m, 't', 3, -6), j = put(m, 'j', 3, 0);
  // time alive ticks up while standing
  const a0 = t.alive;
  run(m, 1);
  assert.ok(t.alive > a0 && j.alive > 0);

  // damage taken
  m.hurtPlayer(t, 40, { x: j.x, z: j.z }, j, 'gun');
  assert.ok(t.dmg >= 40);

  // melee kill
  const e = m.spawn('luchador'); e.x = 3; e.z = -12; e.y = groundAt(3, -12, 50); e.hp = 1; e.spd = 0; e.hist = [];
  m.hurtEnemy(e, 50, 'melee', j, { x: j.x, y: j.y, z: j.z });
  assert.ok(e.dead); assert.equal(j.kills, 1); assert.equal(j.melee, 1);

  // chile
  assert.ok(m.grantPower(t, 'invis').ok); assert.equal(t.chiles, 1);

  // Joe picks Tyler up (down him first)
  t.state = 'downed'; t.until = m.t + 20; t.deaths = (t.deaths || 0) + 1;
  put(m, 'j', t.x + 1, t.z);
  m.input('j', { p: [j.x, j.y, j.z], act: true }, 200);
  run(m, L.MATCH.reviveSecs + 0.2);
  assert.equal(t.state, 'alive');
  assert.equal(j.revives, 1); assert.equal(t.revived, 1);

  put(m, 'j', BUFADORA.x, BUFADORA.z);
  m.launchBufadora();
  assert.equal(j.launches, 1);

  for (const p of [t, j]) { p.state = 'downed'; p.until = m.t + 99; }
  m.tick(0.1);
  assert.equal(m.phase, 'over');
  const board = m.last.board;
  assert.equal(board.length, 2);
  const jt = board.find((r) => r.id === 'j'), tt = board.find((r) => r.id === 't');
  assert.equal(jt.kills, 1); assert.equal(jt.melee, 1); assert.equal(jt.revives, 1); assert.equal(jt.topKiller, true); assert.equal(jt.topReviver, true);
  assert.equal(tt.revived, 1); assert.equal(tt.chiles, 1); assert.ok(tt.dmg > 0); assert.ok(tt.alive > 0);
  assert.ok(jt.badges.some((b) => b.id === 'plomo'));
  assert.ok(jt.badges.some((b) => b.id === 'samaritan'));
  assert.ok(jt.badges.some((b) => b.id === 'machete'));
  assert.ok(tt.badges.some((b) => b.id === 'piso'));
  assert.ok(tt.badges.some((b) => b.id === 'chile'));
  const snap = m.snapshot();
  assert.ok(snap.last && snap.last.board.length === 2);
});

test('again() from the over card jumps back to a fresh countdown for the host', () => {
  const m = setup(['t', 'j']); toWave(m, 1); m.queue = []; m.enemies = [];
  const t = m.players.get('t'), j = m.players.get('j');
  t.kills = 4; j.revives = 2;
  assert.equal(m.again('t').error, 'the match is still on');
  for (const p of [t, j]) { p.state = 'downed'; p.until = m.t + 99; }
  m.tick(0.1);
  assert.equal(m.phase, 'over');
  const r = m.again('t');
  assert.equal(r.ok, true);
  assert.ok(r.phase === 'break' || r.phase === 'lobby');
  // host begin() starts the countdown immediately
  assert.equal(m.phase, 'break');
  assert.equal(t.kills, 0, 'stats reset with the new match');
  assert.equal(j.revives, 0);
});

test('the over card, badges and play-again hook live in the client and the test route', () => {
  const room = src('client/src/mines/elhalo/ElHaloRoom.jsx');
  const css = src('client/src/mines/elhalo/elhalo.css');
  const game = src('client/src/mines/elhalo/game.js');
  const hook = src('server/elhalo/index.js');
  assert.match(room, /data-test="elhalo-leaderboard"/);
  assert.match(room, /data-test="elhalo-again"/);
  assert.match(room, /data-test="elhalo-over-back"/);
  assert.match(room, /elh-badges/);
  assert.match(room, /hidden=\{m !== 'playing' \|\| over\}/);
  assert.match(css, /\.elh-overboard/);
  assert.match(css, /z-index:\s*6/);
  assert.match(game, /async again\(/);
  assert.match(hook, /\/elhalo\/again/);
  assert.match(hook, /b\.over/);
  assert.match(src('server/elhalo/badges.js'), /Siempre en el Piso/);
});

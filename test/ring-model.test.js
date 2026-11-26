// The ring's start-a-bout flow (client/src/barn/ringModel.js): who is listed, what each side puts up, and why the big
// button is off. Pure data: the server still checks every stake and decides every fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { opponents, incoming, stakeChips, openingStake, cleanStake, termsFor, blocker, pickMine, fightersOf, edgeNote, STAKE_PRESETS } from '../client/src/barn/ringModel.js';
import { riskFor } from '../server/engine/bug-combat.js';

const bug = (id, extra = {}) => ({ id, stage: 'creature', name: `Bug${id}`, species: 'manticora', level: 5, arena: true, arenaLevel: 1, ...extra });
const board = (extra = {}) => ({
  bankroll: 1000, maxStake: 10000, stakeStep: 10, serverNow: 1000, openBout: null,
  stable: { bugs: [bug(1), bug(2, { species: 'phanaeus' })] },
  bouts: [{ id: 'b1', hostId: 'bess', hostName: 'Bess', stake: 50, expiresAt: 5000, fighter: { name: 'Halobates', species: 'halobates', level: 6 }, terms: { 1: { win: 0.4, risk: 33 }, 2: { win: 0.3, risk: 50 } } }],
  roster: [
    { id: 7, ownerId: 'ada', owner: 'Ada', name: 'Lamprima', species: 'lamprima', level: 8, fights: true, line: { 1: 0.4, 2: 0.25 } },
    { id: 8, ownerId: 'ada', owner: 'Ada', name: 'Pyrops', species: 'pyrops', level: 4, fights: true, fainted: true },
    { id: 9, ownerId: 'bess', owner: 'Bess', name: 'Halobates', species: 'halobates', level: 6, fights: true, line: { 1: 0.4 } },
    { id: 1, ownerId: 'me', owner: 'Me', name: 'Bug1', species: 'manticora', level: 5, fights: true },
  ],
  challenges: { incoming: [], outgoing: [] },
  ...extra,
});

test('ring: open bouts come first, a posted bug is listed once, your own bugs never', () => {
  const b = board(), rows = opponents({ b, meId: 'me', mine: b.stable.bugs[0] });
  assert.deepEqual(rows.map((r) => r.key), ['bout:b1', 'call:ada:7', 'call:ada:8']);
  assert.equal(rows[0].win, 0.4); assert.equal(rows[0].risk, 33);
  assert.equal(rows[1].win, 0.4);
  assert.equal(rows[2].can, false); assert.equal(rows[2].why, 'fainted');
});

test('ring: the line follows the bug you fight with', () => {
  const b = board();
  const rows = opponents({ b, meId: 'me', mine: b.stable.bugs[1] });
  assert.equal(rows[0].win, 0.3); assert.equal(rows[0].risk, 50);
  assert.equal(rows[1].win, 0.25);
});

test('ring: a bug you already called out carries the challenge', () => {
  const b = board({ challenges: { incoming: [], outgoing: [{ id: 'c1', to: 'ada', toBug: 7, stake: 20, expiresAt: 9e9 }] } });
  const row = opponents({ b, meId: 'me', mine: b.stable.bugs[0] }).find((r) => r.key === 'call:ada:7');
  assert.equal(row.sent.id, 'c1');
});

test('ring: incoming challenges read from your corner', () => {
  const [c] = incoming(board({ challenges: { incoming: [{ id: 'x', line: 0.8, stake: 20, risk: 5 }], outgoing: [] } }));
  assert.equal(Math.round(c.win * 100), 20); assert.equal(c.risk, 5);
});

test('ring: stake chips fit the wallet and the $10 step; free is always offered', () => {
  assert.ok(STAKE_PRESETS.every((v) => v % 10 === 0));
  assert.deepEqual(stakeChips(board()), STAKE_PRESETS);
  assert.deepEqual(stakeChips(board({ bankroll: 60 })), [0, 10, 50]);
  assert.deepEqual(stakeChips(board({ bankroll: 0 })), [0]);
  assert.equal(openingStake(board()), 100);
  assert.equal(openingStake(board({ bankroll: 75 })), 70);
  assert.equal(cleanStake('15', board()), null);
  assert.equal(cleanStake('', board()), null);
  assert.equal(cleanStake('-10', board()), null);
  assert.equal(cleanStake('30', board()), 30);
});

test('ring: what each corner puts up', () => {
  assert.deepEqual(termsFor('bout', { stake: 50, risk: 33 }), { you: 33, them: 50 });
  assert.deepEqual(termsFor('accept', { stake: 20, risk: 5 }), { you: 5, them: 20 });
  assert.deepEqual(termsFor('call', { stake: 100, win: 0.4 }), { you: 100, them: riskFor(100, 0.4) });
  assert.deepEqual(termsFor('call', { stake: 0, win: 0.4 }), { you: 0, them: 0 });
  assert.deepEqual(termsFor('post', { stake: 50 }), { you: 50, them: null });
});

test('ring: the big button says why it is off, in the order you would fix it', () => {
  const b = board(), mine = b.stable.bugs[0];
  const [row] = opponents({ b, meId: 'me', mine });
  assert.equal(blocker({ mine, b, kind: 'bout', row }), '');
  assert.match(blocker({ mine: null, b, kind: 'bout', row }), /hatched bug/);
  assert.match(blocker({ mine, b, kind: 'bout', row, unsaved: true }), /Save or discard/);
  assert.match(blocker({ mine: { ...mine, fainted: true }, b, kind: 'bout', row }), /fainted/);
  assert.match(blocker({ mine, b: { ...b, bankroll: 10 }, kind: 'bout', row }), /You need \$33/);
  assert.match(blocker({ mine, b: { ...b, openBout: { id: 'o' } }, kind: 'bout', row }), /Cancel your open bout/);
  assert.match(blocker({ mine, b: { ...b, serverNow: 9999 }, kind: 'bout', row }), /closed/);
  assert.match(blocker({ mine, b: { ...b, stable: { bugs: [{ ...mine, heesheeHeld: true }] } }, kind: 'call', row }), /your bug is lost/);
  const call = { id: 'c', toBug: 1, risk: 5, wait: 'Waiting — Hank is in a fight' };
  assert.equal(blocker({ mine, b, kind: 'accept', call }), call.wait);
  assert.equal(blocker({ mine, b, kind: 'accept', call: { ...call, wait: undefined } }), '');
  assert.match(blocker({ mine, b, kind: 'accept', call: { ...call, wait: undefined, toBug: 99 } }), /not in your barn/);
  assert.match(blocker({ mine, b, kind: 'call', stake: 5000 }), /You need \$5,000/);
});

test('ring: you fight with the bug you picked, else the first one standing', () => {
  const fighters = fightersOf({ stable: { bugs: [bug(1, { fainted: true }), { id: 3, stage: 'egg' }, bug(2)] } });
  assert.deepEqual(fighters.map((f) => f.id), [1, 2]);
  assert.equal(pickMine(fighters, null).id, 2);
  assert.equal(pickMine(fighters, 1).id, 1);
  assert.equal(pickMine([], null), null);
});

test('ring: type edge in words', () => {
  assert.equal(typeof edgeNote('manticora', 'halobates'), 'string');
  assert.equal(edgeNote('manticora', 'manticora'), '');
});

test('ring: the page never scrolls; motion has a reduced-motion fallback', () => {
  const css = fs.readFileSync(new URL('../client/src/barn/ring-start.css', import.meta.url), 'utf8');
  assert.match(css, /\.barn-ring\.rs \{[^}]*overflow: hidden/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const fx = fs.readFileSync(new URL('../client/src/barn/FightFx.jsx', import.meta.url), 'utf8');
  assert.match(fx, /reduced \? FIGHT_STILL_MS : FIGHT_MS/);
});

test('ring: nothing in the bout flow can open the phone keyboard (the Other stake is an in-page pad)', () => {
  for (const f of ['Ring.jsx', 'FightFx.jsx', 'Bout.jsx']) {
    const src = fs.readFileSync(new URL(`../client/src/barn/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /<input|<textarea|<select|contentEditable|autoFocus/, `${f} has a field that could raise the keyboard`);
  }
  const ring = fs.readFileSync(new URL('../client/src/barn/Ring.jsx', import.meta.url), 'utf8');
  assert.match(ring, /function StakePad/);
  assert.match(ring, /window\.scrollTo\(0, 0\)/, 'the sheet puts the page back at the top');
  const css = fs.readFileSync(new URL('../client/src/barn/ring-start.css', import.meta.url), 'utf8');
  assert.match(css, /html\.rs-lock/);
});

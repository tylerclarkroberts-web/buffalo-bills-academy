// Async Scum rules: sets, the same-rank skip, aces, pass-clears, going out, titles, the exchange and seating order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../server/scum/rules.js';

/** A round in play with fixed hands. order = seats in turn order; the first seat leads unless `turn` says otherwise. */
function round(hands, { order = Object.keys(hands).map(Number), turn = order[0] } = {}) {
  return { no: 1, phase: 'play', order, hands: Object.fromEntries(Object.entries(hands).map(([k, v]) => [k, v.slice()])), pile: null, owner: null, turn, finished: [], gone: [], exchange: null, lastPlay: null, skipped: null };
}
const seq = (n) => { let i = 0; return () => (i++ % n); };

test('ranks: 2 low, K high, A trump; suits never matter', () => {
  assert.equal(S.rank('2c'), 2); assert.equal(S.rank('Kd'), 13); assert.equal(S.rank('As'), S.ACE);
  assert.deepEqual(S.sortHand(['As', '2h', 'Kc', 'Td']), ['2h', 'Td', 'Kc', 'As']);
});

test('sets: one to four of one rank only', () => {
  assert.ok(S.isSet(['7h'])); assert.ok(S.isSet(['7h', '7c'])); assert.ok(S.isSet(['7h', '7c', '7d'])); assert.ok(S.isSet(['7h', '7c', '7d', '7s']));
  assert.ok(!S.isSet([])); assert.ok(!S.isSet(['7h', '8h'])); assert.ok(!S.isSet(['7h', '7h'])); assert.ok(!S.isSet(['Xx']));
});

test('following: same count, equal or higher rank; nothing on an ace; any aces on anything', () => {
  const pile = { cards: ['9h', '9c'], count: 2, rank: 9 };
  assert.equal(S.playProblem(pile, ['Th', 'Tc']), null);
  assert.equal(S.playProblem(pile, ['9d', '9s']), null, 'equal rank is allowed (it skips)');
  assert.match(S.playProblem(pile, ['8h', '8c']), /9 or higher/);
  assert.match(S.playProblem(pile, ['Th']), /pair/);
  assert.match(S.playProblem(pile, ['Th', 'Tc', 'Td']), /pair/);
  assert.equal(S.playProblem(pile, ['As']), null, 'a single ace beats a pair');
  assert.equal(S.playProblem({ cards: ['Kh', 'Kc', 'Kd', 'Ks'], count: 4, rank: 13 }, ['Ah']), null, 'and quads');
  assert.match(S.playProblem({ cards: ['Ah'], count: 1, rank: 14 }, ['Kh']), /Nothing goes on an ace/);
  assert.equal(S.playProblem(null, ['3h', '3c', '3d']), null, 'lead anything');
});

test('first round: the 2 of clubs leads and the order starts there', () => {
  const r = S.newRound({ no: 1, order: [0, 1, 2, 3], titles: null, rng: seq(7) });
  const holder = [0, 1, 2, 3].find((s) => r.hands[s].includes('2c'));
  assert.equal(r.turn, holder); assert.equal(r.order[0], holder);
  assert.deepEqual([...r.order].sort(), [0, 1, 2, 3]);
  assert.equal(Object.values(r.hands).flat().length, 52, 'whole deck, no jokers');
  assert.equal(new Set(Object.values(r.hands).flat()).size, 52);
});

test('deal: 52 split as evenly as possible for 3-7 players', () => {
  for (let n = 3; n <= 7; n++) {
    const h = S.deal([...Array(n).keys()], seq(5));
    const sizes = Object.values(h).map((x) => x.length);
    assert.equal(sizes.reduce((a, b) => a + b), 52); assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `n=${n}`);
  }
});

test('playing the same rank skips the next player', () => {
  const r = round({ 0: ['5h', 'Kd'], 1: ['5c', 'Qd'], 2: ['9c', 'Jd'], 3: ['6s', 'Td'] });
  S.play(r, 0, ['5h']);
  assert.equal(r.turn, 1);
  const res = S.play(r, 1, ['5c']);
  assert.equal(res.skipped, 2, 'seat 2 skipped'); assert.equal(r.turn, 3);
  assert.equal(r.skipped, 2);
});

test('a skip chain keeps skipping, and a higher rank does not skip', () => {
  const r = round({ 0: ['5h', '5d', 'Kd'], 1: ['5c', 'Qd'], 2: ['9c', 'Jd'], 3: ['5s', 'Td'], 4: ['8h', '3c'] });
  S.play(r, 0, ['5h']); S.play(r, 1, ['5c']); // skips 2
  const res = S.play(r, 3, ['5s']); // skips 4
  assert.equal(res.skipped, 4); assert.equal(r.turn, 0);
  const res2 = S.play(r, 0, ['Kd']);
  assert.equal(res2.skipped, null); assert.equal(r.turn, 1);
});

test('skips work for pairs too', () => {
  const r = round({ 0: ['8h', '8d', '2c'], 1: ['8c', '8s', '3c'], 2: ['Jc', 'Jd'], 3: ['Qh', 'Qs'] });
  S.play(r, 0, ['8h', '8d']);
  assert.equal(S.play(r, 1, ['8c', '8s']).skipped, 2);
  assert.equal(r.turn, 3);
});

test('when the skip goes all the way round, the player who skipped leads', () => {
  const r = round({ 0: ['7h', '2c'], 1: ['7c', '3d'] });
  S.play(r, 0, ['7h']);
  const res = S.play(r, 1, ['7c']);
  assert.equal(res.skipped, 0); assert.equal(res.cleared, 'pass');
  assert.equal(r.pile, null); assert.equal(r.turn, 1);
});

test('aces clear the pile at once and the ace player leads again', () => {
  const r = round({ 0: ['Ks', 'Kc', '3h'], 1: ['Ah', '4c', '4d'], 2: ['Qs', 'Qd', '9h'] });
  S.play(r, 0, ['Ks', 'Kc']);
  const res = S.play(r, 1, ['Ah']);
  assert.equal(res.cleared, 'ace'); assert.equal(r.pile, null); assert.equal(r.turn, 1, 'same player leads');
  assert.throws(() => S.pass(r, 1), /leading/);
});

test('leading an ace clears too; going out on an ace hands the lead on', () => {
  const r = round({ 0: ['Ad'], 1: ['4c', '4d'], 2: ['9h', 'Jh'] });
  const res = S.play(r, 0, ['Ad']);
  assert.equal(res.cleared, 'ace'); assert.equal(res.out, 1); assert.equal(r.turn, 1);
});

test('when everyone else passes, the pile clears and the last player to play leads', () => {
  const r = round({ 0: ['9h', '2c'], 1: ['4c', '4d'], 2: ['3h', '5h'] });
  S.play(r, 0, ['9h']);
  S.pass(r, 1);
  const res = S.pass(r, 2);
  assert.equal(res.cleared, true); assert.equal(r.turn, 0); assert.equal(r.pile, null);
});

test('if the last player went out, the next player still in leads after the passes', () => {
  const r = round({ 0: ['Kh'], 1: ['4c', '4d'], 2: ['3h', '5h'], 3: ['6c', '7c'] });
  const res = S.play(r, 0, ['Kh']);
  assert.equal(res.out, 1);
  S.pass(r, 1); S.pass(r, 2); S.pass(r, 3);
  assert.equal(r.pile, null); assert.equal(r.turn, 1);
});

test('you cannot play out of turn, cards you lack, or pass while leading', () => {
  const r = round({ 0: ['9h', '2c'], 1: ['4c', '4d'], 2: ['3h', '5h'] });
  assert.throws(() => S.play(r, 1, ['4c']), /Not your turn/);
  assert.throws(() => S.play(r, 0, ['9s']), /aren't your cards/);
  assert.throws(() => S.pass(r, 0), /leading/);
  S.play(r, 0, ['9h']);
  assert.throws(() => S.play(r, 1, ['4c']), /9 or higher/);
});

test('finishing order: last one holding cards is Scum and the round ends', () => {
  const r = round({ 0: ['Kh'], 1: ['Qh', '3c'], 2: ['5h', '6h'] });
  S.play(r, 0, ['Kh']); // out first
  S.pass(r, 1); S.pass(r, 2); // clears, 1 leads (0 went out)
  assert.equal(r.turn, 1);
  S.play(r, 1, ['3c']); S.play(r, 2, ['5h']); S.play(r, 1, ['Qh']); // 1 out second
  assert.equal(r.phase, 'done');
  assert.deepEqual(r.finished, [0, 1, 2]);
});

test('titles: King, Queen, Citizens, Baby Scum, Scum; three players have no Queen or Baby Scum', () => {
  assert.deepEqual(S.titlesFor(3), ['king', 'citizen', 'scum']);
  assert.deepEqual(S.titlesFor(4), ['king', 'queen', 'babyScum', 'scum']);
  assert.deepEqual(S.titlesFor(6), ['king', 'queen', 'citizen', 'citizen', 'babyScum', 'scum']);
});

test('seating: King leads, Scum last, newcomers just above the bottom two', () => {
  assert.deepEqual(S.nextOrder([3, 0, 2, 1]), [3, 0, 2, 1]);
  assert.deepEqual(S.nextOrder([3, 0, 2, 1], [5]), [3, 0, 5, 2, 1]);
  assert.deepEqual(S.nextOrder([2, 0, 1], [4]), [2, 0, 4, 1]);
});

test('exchange: Scum hands the King their 2 best, Baby Scum the Queen their best; King and Queen give back any', () => {
  const titles = { 0: 'king', 1: 'queen', 2: 'babyScum', 3: 'scum' };
  const r = S.newRound({ no: 2, order: [0, 1, 2, 3], titles, rng: seq(11), dealOrder: [3, 2, 1, 0] });
  assert.equal(r.phase, 'exchange'); assert.equal(r.turn, null);
  const scumBest = S.highest(r.hands[3], 2); const babyBest = S.highest(r.hands[2], 1);
  assert.throws(() => S.giveBack(r, 0, r.hands[0].slice(0, 2)), /Wait for their cards/);
  const p = S.payTribute(r, 3, '  please   a deuce?  ');
  assert.deepEqual(p.tribute, scumBest); assert.equal(p.beg, 'please a deuce?');
  assert.ok(scumBest.every((c) => r.hands[0].includes(c) && !r.hands[3].includes(c)));
  S.payTribute(r, 2, '');
  assert.ok(babyBest.every((c) => r.hands[1].includes(c)));
  assert.throws(() => S.payTribute(r, 3), /Already/);
  const gift = [r.hands[0][0], r.hands[0][5]];
  assert.equal(S.giveBack(r, 0, gift), false);
  assert.ok(gift.every((c) => r.hands[3].includes(c)));
  assert.throws(() => S.giveBack(r, 1, r.hands[1].slice(0, 2)), /one card/);
  assert.equal(S.giveBack(r, 1, [r.hands[1].at(-1)]), true, 'the Queen may give away her best if she likes');
  assert.equal(r.phase, 'play'); assert.equal(r.turn, 0, 'the King leads');
  assert.equal(Object.values(r.hands).flat().length, 52);
});

test('exchange with three players: only King and Scum swap', () => {
  const pairs = S.exchangePairs([2, 0, 1], { 2: 'king', 0: 'citizen', 1: 'scum' });
  assert.equal(pairs.length, 1); assert.deepEqual([pairs[0].from, pairs[0].to, pairs[0].n], [1, 2, 2]);
});

test('beg text is trimmed and capped', () => {
  const r = S.newRound({ no: 2, order: [0, 1, 2], titles: { 0: 'king', 1: 'citizen', 2: 'scum' }, rng: seq(3) });
  const p = S.payTribute(r, 2, 'x'.repeat(500));
  assert.equal(p.beg.length, S.BEG_MAX);
});

test('quads: four of a kind lead, only quads or aces follow', () => {
  const r = round({ 0: ['6h', '6c', '6d', '6s', '2c'], 1: ['9h', '9c', '9d', '9s'], 2: ['Ah', '3c'] });
  S.play(r, 0, ['6h', '6c', '6d', '6s']);
  S.play(r, 1, ['9h', '9c', '9d', '9s']);
  assert.equal(r.phase, 'play');
  assert.equal(S.play(r, 2, ['Ah']).cleared, 'ace');
});

test('walking out mid-round: cards go with them and the turn moves on', () => {
  const r = round({ 0: ['9h', '2c'], 1: ['Tc', '4d'], 2: ['3h', 'Jh'] });
  S.play(r, 0, ['9h']);
  S.walkOut(r, 1);
  assert.equal(r.turn, 2);
  S.walkOut(r, 2);
  assert.equal(r.phase, 'done'); assert.deepEqual(r.finished, [0]);
});

test('bots and the clock: timeout passes (or leads the lowest card); bots play the lowest set that fits', () => {
  const r = round({ 0: ['3h', '3c', '9d', 'Ah'], 1: ['4c', 'Kd'] });
  assert.deepEqual(S.autoMove(r, 0), { play: ['3c'] }, 'timeout while leading: lowest single');
  assert.deepEqual(S.autoMove(r, 0, { bot: true }), { play: ['3c', '3h'] }, 'bot leads its lowest rank, all copies');
  r.pile = { cards: ['8s'], count: 1, rank: 8, seat: 1 };
  assert.deepEqual(S.autoMove(r, 0), { pass: true });
  assert.deepEqual(S.autoMove(r, 0, { bot: true }), { play: ['9d'] });
  assert.deepEqual(S.autoGift(r, 0, 2), ['3c', '3h']);
});

test('a whole bot game always finishes with a full order', () => {
  for (let g = 0; g < 30; g++) {
    let k = g * 7 + 1; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
    const n = 3 + (g % 5);
    const r = S.newRound({ no: 1, order: [...Array(n).keys()], rng });
    for (let i = 0; i < 2000 && r.phase === 'play'; i++) { const m = S.autoMove(r, r.turn, { bot: true }); if (m.play) S.play(r, r.turn, m.play); else S.pass(r, r.turn); }
    assert.equal(r.phase, 'done', `game ${g}`); assert.equal(r.finished.length, n);
  }
});

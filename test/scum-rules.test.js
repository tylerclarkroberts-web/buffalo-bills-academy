// Async Scum rules: sets, the same-rank skip, aces, pass-clears, going out, titles, the exchange and seating order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../server/scum/rules.js';

/** A round in play with fixed hands. order = seats in turn order; the first seat leads unless `turn` says otherwise. */
function round(hands, { order = Object.keys(hands).map(Number), turn = order[0] } = {}) {
  return { no: 1, phase: 'play', order, hands: Object.fromEntries(Object.entries(hands).map(([k, v]) => [k, v.slice()])), pile: null, owner: null, turn, finished: [], gone: [], exchange: null, lastPlay: null, skipped: null, passed: [], playOn: false };
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

test('following: same count, equal or higher rank; nothing on an ace; aces must match the set size', () => {
  const pile = { cards: ['9h', '9c'], count: 2, rank: 9 };
  assert.equal(S.playProblem(pile, ['Th', 'Tc']), null);
  assert.equal(S.playProblem(pile, ['9d', '9s']), null, 'equal rank is allowed (it skips)');
  assert.match(S.playProblem(pile, ['8h', '8c']), /9 or higher/);
  assert.match(S.playProblem(pile, ['Th']), /pair/);
  assert.match(S.playProblem(pile, ['Th', 'Tc', 'Td']), /pair/);
  assert.match(S.playProblem(pile, ['As']), /two aces/, 'one ace does not clear a pair');
  assert.equal(S.playProblem(pile, ['As', 'Ah']), null, 'two aces clear a pair');
  assert.match(S.playProblem(pile, ['As', 'Ah', 'Ad']), /two aces/, 'exactly as many aces as the set');
  assert.equal(S.playProblem({ cards: ['5h'], count: 1, rank: 5 }, ['Ah']), null, 'one ace clears a single');
  assert.match(S.playProblem({ cards: ['5h'], count: 1, rank: 5 }, ['Ah', 'Ac']), /one ace/);
  const trips = { cards: ['Jh', 'Jc', 'Jd'], count: 3, rank: 11 };
  assert.match(S.playProblem(trips, ['Ah', 'Ac']), /three aces/);
  assert.equal(S.playProblem(trips, ['Ah', 'Ac', 'Ad']), null, 'three aces clear a three');
  const quads = { cards: ['Kh', 'Kc', 'Kd', 'Ks'], count: 4, rank: 13 };
  assert.match(S.playProblem(quads, ['Ah']), /four aces/);
  assert.equal(S.playProblem(quads, ['Ah', 'Ac', 'Ad', 'As']), null, 'four aces clear quads');
  for (const n of [1, 2, 3, 4]) assert.equal(S.playProblem(null, ['Ah', 'Ac', 'Ad', 'As'].slice(0, n)), null, `leading ${n} ace(s) is fine`);
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

test('when the skip goes all the way round, the skipper plays on: keep going or pass (skipped player still gets a chance)', () => {
  const r = round({ 0: ['7h', '2c'], 1: ['7c', '3d', '8s'] });
  S.play(r, 0, ['7h']);
  const res = S.play(r, 1, ['7c']);
  assert.equal(res.skipped, 0); assert.equal(res.cleared, null); assert.equal(res.playOn, true);
  assert.deepEqual(r.pile.cards, ['7c'], 'the pile stays live'); assert.equal(r.turn, 1); assert.equal(r.playOn, true);
  assert.throws(() => S.play(r, 1, ['3d']), /7 or higher/, 'playing on still follows the rules');
  const p = S.pass(r, 1);
  assert.equal(p.cleared, false, 'Ann was skipped, not passed: the pile stays live');
  assert.deepEqual(r.pile.cards, ['7c']); assert.equal(r.turn, 0); assert.equal(r.playOn, false);
  assert.ok(r.passed.includes(1) && !r.passed.includes(0));
});

test('two left: skip then the skipper passes — the skipped player may still play; if they pass, the skipper leads', () => {
  const r = round({ 0: ['7h', '9c', '2c'], 1: ['7c', '3d', '8s'] });
  S.play(r, 0, ['7h']);
  S.play(r, 1, ['7c']); // skips Ann, play-on for Bob
  assert.equal(r.turn, 1); assert.equal(r.playOn, true); assert.equal(r.skipped, 0);
  const p = S.pass(r, 1);
  assert.equal(p.cleared, false); assert.equal(r.turn, 0, 'Ann was skipped, not passed: she gets the live pile');
  assert.deepEqual(r.pile.cards, ['7c']); assert.equal(r.owner, 1);
  const a = S.play(r, 0, ['9c']);
  assert.equal(a.playOn, false); assert.equal(r.owner, 0); assert.equal(r.turn, 1, 'a new play resets passes: Bob can follow');
  assert.deepEqual(r.passed, []);
  // Same setup, but Ann passes instead: pile clears and Bob (last to play) leads.
  const r2 = round({ 0: ['7h', '9c', '2c'], 1: ['7c', '3d', '8s'] });
  S.play(r2, 0, ['7h']); S.play(r2, 1, ['7c']); S.pass(r2, 1);
  const c = S.pass(r2, 0);
  assert.equal(c.cleared, true); assert.equal(r2.pile, null); assert.equal(r2.turn, 1, 'Bob played last, so Bob leads');
  assert.equal(r2.playOn, false);
  assert.throws(() => S.pass(r2, 1), /leading/);
});

test('with 3+ players, a skipped player remains eligible the next time around', () => {
  const r = round({ 0: ['7h', '2c'], 1: ['7c', '9d', 'Kd'], 2: ['8h', '3c'], 3: ['4c', '5d'] });
  S.play(r, 0, ['7h']);
  const sk = S.play(r, 1, ['7c']); // skips Cat (seat 2)
  assert.equal(sk.skipped, 2); assert.equal(r.turn, 3);
  S.pass(r, 3);
  assert.equal(r.turn, 0); assert.ok(r.passed.includes(3));
  S.pass(r, 0);
  assert.equal(r.turn, 1); assert.equal(r.playOn, true, 'back to Bob, the owner');
  const p = S.pass(r, 1);
  assert.equal(p.cleared, false);
  assert.equal(r.turn, 2, 'Cat was skipped, not passed: she gets the live pile');
  assert.deepEqual(r.pile.cards, ['7c']); assert.equal(r.playOn, false);
  const c = S.pass(r, 2);
  assert.equal(c.cleared, true); assert.equal(r.pile, null); assert.equal(r.turn, 1, 'Bob played last and leads');
});

test('a pass locks you out of this pile until it clears; a new play unlocks everyone', () => {
  const r = round({ 0: ['9h', 'Qc', '2c'], 1: ['4c', 'Kd'], 2: ['3h', '5h'] });
  S.play(r, 0, ['9h']);
  S.pass(r, 1);
  assert.equal(r.turn, 2); assert.ok(r.passed.includes(1));
  S.pass(r, 2);
  assert.equal(r.turn, 0); assert.equal(r.playOn, true);
  // Bob already passed: he does not get another turn on this same 9.
  assert.ok(r.passed.includes(1) && r.passed.includes(2));
  S.play(r, 0, ['Qc']);
  assert.deepEqual(r.passed, []); assert.equal(r.turn, 1, 'new play: Bob can follow the Queen');
});

test('bug and bots: a skipped player who gets the turn follows the live pile (they are not playing on)', () => {
  const r = round({ 0: ['7h', '9c', '2c'], 1: ['7c', '3d', '8s'] });
  S.play(r, 0, ['7h']); S.play(r, 1, ['7c']); S.pass(r, 1);
  assert.equal(r.turn, 0); assert.ok(r.pile); assert.equal(r.playOn, false);
  assert.deepEqual(S.bugMove(r, 0), { play: ['9c'] }, 'the bug plays the highest legal card on the live pile');
  assert.deepEqual(S.autoMove(r, 0, { bot: true }), { play: ['9c'] });
  assert.deepEqual(S.autoMove(r, 0), { pass: true }, 'a human timeout still defers to the bug (autoMove passes when following)');
  // If the skipper times out while playing on and a skipped player remains, do not clear: give them the turn.
  const b = round({ 0: ['7h', '9c', '2c'], 1: ['7c', '3d', '8s'] });
  S.play(b, 0, ['7h']); S.play(b, 1, ['7c']);
  assert.deepEqual(S.bugMove(b, 1), { pass: true }, 'play-on timeout: the bug passes on the owner’s set');
  const after = S.pass(b, 1);
  assert.equal(after.cleared, false); assert.equal(b.turn, 0);
});

test('aces clear the pile at once and the ace player leads again', () => {
  const r = round({ 0: ['Ks', 'Kc', '3h'], 1: ['Ah', 'Ad', '4c', '4d'], 2: ['Qs', 'Qd', '9h'] });
  S.play(r, 0, ['Ks', 'Kc']);
  assert.throws(() => S.play(r, 1, ['Ah']), /two aces/, 'one ace is not a play on a pair');
  assert.equal(r.turn, 1); assert.equal(r.hands[1].length, 4, 'nothing moved');
  const res = S.play(r, 1, ['Ah', 'Ad']);
  assert.equal(res.cleared, 'ace'); assert.equal(r.pile, null); assert.equal(r.turn, 1, 'same player leads');
  assert.throws(() => S.pass(r, 1), /leading/);
});

test('leading an ace clears too; going out on an ace hands the lead on', () => {
  const r = round({ 0: ['Ad'], 1: ['4c', '4d'], 2: ['9h', 'Jh'] });
  const res = S.play(r, 0, ['Ad']);
  assert.equal(res.cleared, 'ace'); assert.equal(res.out, 1); assert.equal(r.turn, 1);
});

test('play on: when everyone else passes, the last player keeps the turn with the pile live until they pass', () => {
  const r = round({ 0: ['9h', 'Jc', 'Qd', '2c'], 1: ['4c', '4d', 'Kh'], 2: ['3h', '5h', 'Ks'] });
  S.play(r, 0, ['9h']);
  S.pass(r, 1);
  const res = S.pass(r, 2);
  assert.equal(res.cleared, false); assert.equal(res.playOn, true);
  assert.equal(r.turn, 0); assert.deepEqual(r.pile.cards, ['9h']); assert.equal(r.playOn, true);
  assert.match(S.playProblem(r.pile, ['2c']), /9 or higher/);
  const p2 = S.play(r, 0, ['Jc']); // Ann plays on top of her own 9
  assert.equal(p2.playOn, false); assert.equal(r.turn, 1, 'a new play: everyone gets another chance to follow'); assert.equal(r.playOn, false);
  S.pass(r, 1); S.pass(r, 2);
  assert.equal(r.turn, 0); assert.equal(r.playOn, true);
  S.play(r, 0, ['Qd']);
  S.play(r, 1, ['Kh']); // Bob beats it: Bob owns the pile now
  S.pass(r, 2); S.pass(r, 0);
  assert.equal(r.turn, 1); assert.equal(r.playOn, true); assert.equal(r.owner, 1);
  const c = S.pass(r, 1);
  assert.equal(c.cleared, true); assert.equal(r.pile, null); assert.equal(r.turn, 1, 'Bob passes on his own set: cleared, he leads');
  assert.throws(() => S.pass(r, 1), /leading/);
});

test('play on: an equal rank on your own set still skips the next player still in', () => {
  const r = round({ 0: ['9h', '9c', '2c'], 1: ['4c', '4d'], 2: ['3h', '5h'] });
  S.play(r, 0, ['9h']); S.pass(r, 1); S.pass(r, 2);
  const res = S.play(r, 0, ['9c']);
  assert.equal(res.skipped, 1); assert.equal(r.turn, 2);
  S.pass(r, 2);
  assert.equal(r.turn, 0); assert.equal(r.playOn, true, 'back to Ann again');
});

test('play on: going out on the set hands the lead on as before; the bug and the bots', () => {
  const r = round({ 0: ['9h'], 1: ['4c', '4d'], 2: ['3h', '5h'] });
  S.play(r, 0, ['9h']); // Ann goes out on it
  S.pass(r, 1); const res = S.pass(r, 2);
  assert.equal(res.cleared, true); assert.equal(r.pile, null); assert.equal(r.turn, 1, 'owner is out: the next player still in leads');
  const b = round({ 0: ['9h', 'Kd', 'Ac'], 1: ['4c', '4d'], 2: ['3h', '5h'] });
  S.play(b, 0, ['9h']); S.pass(b, 1); S.pass(b, 2);
  assert.deepEqual(S.bugMove(b, 0), { pass: true }, 'the bug passes to clear (then leads your highest next turn)');
  assert.deepEqual(S.autoMove(b, 0, { bot: true }), { pass: true }, 'a bot clears and leads fresh');
  b.hands[0] = ['Kd', 'Ks']; b.pile = { cards: ['9h'], count: 1, rank: 9, seat: 0 };
  assert.deepEqual(S.autoMove(b, 0, { bot: true }), { pass: true });
  b.hands[0] = ['Kd']; assert.deepEqual(S.autoMove(b, 0, { bot: true }), { play: ['Kd'] }, 'unless it goes out on the spot');
});

test('single deck, always: exactly 52 unique cards dealt every round, no jokers, 7 players at most', () => {
  let k = 3; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
  for (let n = S.MIN_PLAYERS; n <= S.MAX_PLAYERS; n++) {
    for (let rep = 0; rep < 5; rep++) {
      const r = S.newRound({ no: 1 + rep, order: Array.from({ length: n }, (_, i) => i), titles: rep ? Object.fromEntries(S.titlesFor(n).map((t, i) => [i, t])) : null, rng });
      const all = Object.values(r.hands).flat();
      assert.equal(all.length, 52, `${n} players: 52 cards`); assert.equal(new Set(all).size, 52, 'no duplicates (one deck)');
      assert.ok(all.every((c) => /^[2-9TJQKA][shdc]$/.test(c)), 'no jokers');
      const sizes = Object.values(r.hands).map((h) => h.length); assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    }
  }
  assert.equal(S.DECK_SIZE, 52); assert.equal(S.MAX_PLAYERS, 7);
  assert.throws(() => S.deal([0, 1, 2, 3, 4, 5, 6, 7], rng), /single deck/);
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

test('titles: King, Queen, Commoners, Baby Scum, Scum; three players have no Queen or Baby Scum', () => {
  assert.deepEqual(S.titlesFor(3), ['king', 'commoner', 'scum']);
  assert.deepEqual(S.titlesFor(4), ['king', 'queen', 'babyScum', 'scum']);
  assert.deepEqual(S.titlesFor(6), ['king', 'queen', 'commoner', 'commoner', 'babyScum', 'scum']);
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
  const pairs = S.exchangePairs([2, 0, 1], { 2: 'king', 0: 'commoner', 1: 'scum' });
  assert.equal(pairs.length, 1); assert.deepEqual([pairs[0].from, pairs[0].to, pairs[0].n], [1, 2, 2]);
});

test('beg text is trimmed and capped', () => {
  const r = S.newRound({ no: 2, order: [0, 1, 2], titles: { 0: 'king', 1: 'commoner', 2: 'scum' }, rng: seq(3) });
  const p = S.payTribute(r, 2, 'x'.repeat(500));
  assert.equal(p.beg.length, S.BEG_MAX);
});

test('quads: four of a kind lead, only quads or four aces follow', () => {
  const r = round({ 0: ['6h', '6c', '6d', '6s', '2c'], 1: ['9h', '9c', '9d', '9s'], 2: ['Ah', 'Ac', 'Ad', 'As', '3c'] });
  S.play(r, 0, ['6h', '6c', '6d', '6s']);
  S.play(r, 1, ['9h', '9c', '9d', '9s']);
  assert.equal(r.phase, 'play');
  assert.throws(() => S.play(r, 2, ['Ah']), /four aces/);
  assert.throws(() => S.play(r, 2, ['Ah', 'Ac', 'Ad']), /four aces/);
  assert.equal(S.play(r, 2, ['Ah', 'Ac', 'Ad', 'As']).cleared, 'ace');
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

test('bug auto-play: always your highest legal play', () => {
  const r = round({ 0: ['3h', '9c', 'Kd', 'Ah'], 1: ['4c', '4d', 'Qs', 'Qh', 'Ac', 'Ad', '2s'], 2: ['5h', '5c', '7d', 'Jh', 'Jd', 'Js'] });
  assert.deepEqual(S.bugMove(r, 0), { play: ['Ah'] }, 'leading: the single highest card, an ace if you have one');
  r.pile = { cards: ['9h', '9s'], count: 2, rank: 9, seat: 2 }; r.owner = 2;
  assert.deepEqual(S.bugMove(r, 1), { play: ['Ac', 'Ad'] }, 'following a pair: two aces beat two queens');
  assert.deepEqual(S.bugMove(r, 2), { play: ['Jh', 'Js'] }, 'two of the three jacks (the highest legal pair)');
  assert.deepEqual(S.bugMove(r, 0), { pass: true }, 'one ace cannot clear a pair, no pair: pass');
  r.pile = { cards: ['8h'], count: 1, rank: 8, seat: 2 };
  assert.deepEqual(S.bugMove(r, 0), { play: ['Ah'] }, 'single: the ace');
  r.pile = { cards: ['Ks'], count: 1, rank: 13, seat: 2 };
  assert.deepEqual(S.bugMove(r, 2), { pass: true }, 'nothing over a king: pass');
  r.pile = { cards: ['As'], count: 1, rank: 14, seat: 2 };
  assert.deepEqual(S.bugMove(r, 1), { pass: true }, 'nothing goes on an ace');
  r.pile = { cards: ['6h', '6c', '6d'], count: 3, rank: 6, seat: 0 };
  assert.deepEqual(S.bugMove(r, 2), { play: ['Jd', 'Jh', 'Js'] }, 'three jacks on threes');
  for (const p of [S.bugMove(r, 0), S.bugMove(r, 1), S.bugMove(r, 2)]) if (p.play) assert.equal(S.playProblem(r.pile, p.play), null, 'every bug play is legal');
});

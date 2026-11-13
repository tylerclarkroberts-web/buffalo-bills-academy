// Public replay selection, readable timing and browser-local progress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickReplay, showdownSpan, cinematicPlays, stepMs, seenSeq, markSeen, replayView } from '../client/src/table/replay.js';
import * as G from '../server/engine/game.js';
import { makeTable, act } from './helpers.js';

const history = [
  { seq: 1, hand: 1, t: 1000, text: 'Hand #1', ev: { k: 'hand' } },
  { seq: 2, hand: 1, t: 1100, text: 'Ann calls 10', ev: { k: 'act', seat: 0, a: 'call', amt: 10 } },
  { seq: 3, hand: 1, t: 1200, text: 'Bob splashes Ann', ev: { k: 'gag', from: 'bob', to: 'ann', pix: 'squirt' } },
  { seq: 4, hand: 1, t: 1300, text: 'Cat joined the table' },
  { seq: 5, hand: 1, t: 1400, text: 'Ann wins 30', ev: { k: 'win', wins: [{ seat: 0, amt: 30 }] } },
  { seq: 6, hand: 2, t: 1500, text: 'Hand #2', ev: { k: 'hand' } },
  { seq: 7, hand: 2, t: 1600, text: 'Ann lights a cigar', ev: { k: 'smoke', from: 'ann', art: 'cigar' } },
  { seq: 8, hand: 2, t: 1700, text: 'Cat says: Nice hand!', ev: { k: 'say', from: 'cat', message: 'Nice hand!' } },
  { seq: 9, hand: 2, t: 1800, text: 'Flop: As Kh Qd', ev: { k: 'deal', cards: ['As', 'Kh', 'Qd'] } },
].map((e) => ({ ...e, frame: { seats: [], hand: null, lastHand: null } }));

test('selection retains recorded public frames across hands in log order', () => {
  const original = structuredClone(history);
  const steps = pickReplay(history);
  assert.deepEqual(steps.map((s) => s.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(steps.map((s) => s.k), ['hand', 'act', 'gag', 'notice', 'win', 'hand', 'smoke', 'say', 'deal']);
  assert.deepEqual(steps[3], { k: 'notice', seq: 4, hand: 1, t: 1300, text: 'Cat joined the table', message: undefined, frame: history[3].frame });
  assert.equal(steps[7].text, 'Cat says: Nice hand!');
  assert.deepEqual(steps[8].cards, ['As', 'Kh', 'Qd']);
  assert.deepEqual(history, original, 'selection must not change saved history');
});

test('a player is shown what followed their own last turn, never the turn itself', () => {
  const { t } = makeTable(['Ann', 'Bob', 'Cat']);
  G.startGame(t, t.hostId, { now: 1000 });
  const seen = t.log.at(-1).seq;
  act(t, 'Ann', 'call'); act(t, 'Bob', 'call'); act(t, 'Cat', 'check');
  const missed = (opts) => pickReplay(t.log, opts).map((s) => `${t.seats[s.seat]?.name || ''} ${s.a || s.street}`);
  assert.deepEqual(missed({ seen }), ['Ann call', 'Bob call', 'Cat check', ' flop'], 'a watcher took no turns');
  assert.deepEqual(missed({ seen, me: 'p0' }), ['Bob call', 'Cat check', ' flop']);
  assert.deepEqual(missed({ seen, me: 'p1' }), ['Cat check', ' flop'], 'Bob was at the table when he called');
  assert.deepEqual(missed({ seen, me: 'p2' }), [' flop']);
  assert.deepEqual(missed({ seen: t.log.at(-1).seq, me: 'p0' }), [], 'the cursor still wins when it is further on');
  // Blinds and moves the server makes for an absent player are news to that player.
  assert.ok(pickReplay(t.log.filter((e) => e.seq <= seen), { me: 'p1' }).some((s) => s.a === 'post' && s.seat === 1));
  G.tick(t, { now: t.hand.deadline });
  const timedOut = pickReplay(t.log, { seen: t.log.at(-2).seq, me: 'p1' });
  assert.deepEqual(timedOut.map((s) => [s.text, s.auto]), [['Bob checks (ran out of time)', true]]);
});

test('a showdown belongs to the cinematic: the felt stops before its reveals and resumes after the pot', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob']);
  G.startGame(t, t.hostId, ctx);
  const seen = t.log.at(-1).seq;
  act(t, 'Ann', 'call');
  while (t.hand) act(t, t.seats[t.hand.toAct].name, 'check');
  G.tick(t, { now: 9000 });
  assert.equal(t.handNumber, 2, 'the next hand has started by the time anyone returns');
  const view = G.viewFor(t, 'p0', 9000);
  assert.equal(view.showdown.kind, 'showdown');
  assert.equal(cinematicPlays(view.showdown, view.log), true, 'revealed hands, the winner and the pot are shown');
  const span = showdownSpan(view.log, view.showdown.number, seen);
  const covered = view.log.filter((e) => e.seq >= span.from && e.seq <= span.to).map((e) => e.ev.k);
  assert.deepEqual(covered, ['reveal', 'reveal', 'win']);
  const kinds = (opts) => pickReplay(view.log, { me: 'p1', ...opts }).map((s) => s.k);
  assert.ok(kinds({ seen }).includes('reveal'), 'left alone, the felt would play it too');
  const before = kinds({ seen, before: span.from });
  assert.ok(before.length > 0 && !before.includes('reveal') && !before.includes('win') && !before.includes('hand'));
  assert.equal(showdownSpan(view.log, view.showdown.number, span.to), null, 'played once');
  const after = kinds({ seen: span.to });
  assert.ok(after.includes('hand') && !after.includes('reveal') && !after.includes('win'));

  const folded = makeTable(['Ann', 'Bob']);
  G.startGame(folded.t, folded.t.hostId, folded.ctx);
  act(folded.t, 'Ann', 'fold');
  const quiet = G.viewFor(folded.t, 'p1', 3000);
  assert.equal(quiet.showdown.kind, 'fold');
  assert.equal(cinematicPlays(quiet.showdown, quiet.log), false, 'a fold win is the pot push on the felt');
  assert.equal(cinematicPlays(quiet.showdown, quiet.log, false), true, 'unless this viewer switched the replay off');
  assert.equal(cinematicPlays(quiet.showdown, quiet.log.map(({ frame, ...e }) => e)), true, 'or the log predates table frames');
  assert.equal(showdownSpan(quiet.log, 1), null);
  assert.equal(cinematicPlays(null, quiet.log), false);
});

test('returning after another hand starts retains the earlier hand actions', () => {
  const { t, ctx } = makeTable(['Ann', 'Bob', 'Cat']);
  G.startGame(t, t.hostId, ctx);
  const seen = t.log.at(-1).seq;
  act(t, 'Ann', 'fold'); act(t, 'Bob', 'fold');
  ctx.now += 10 * 3600e3;
  G.tick(t, ctx);
  assert.equal(t.handNumber, 2);
  const steps = pickReplay(t.log, { seen });
  assert.deepEqual(steps.slice(0, 3).map((s) => [s.hand, s.k, s.a]), [[1, 'act', 'fold'], [1, 'act', 'fold'], [1, 'win', undefined]]);
  assert.ok(steps.some((s) => s.hand === 2 && s.k === 'hand'));
});

test('social opt-outs and sender mutes preserve the rest of the public history', () => {
  assert.deepEqual(pickReplay(history, { noGags: true }).map((s) => s.seq), [1, 2, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(pickReplay(history, { noSmoke: true }).map((s) => s.seq), [1, 2, 3, 4, 5, 6, 8, 9]);
  assert.deepEqual(pickReplay(history, { noSmoke: true, muted: (id) => id === 'bob' }).map((s) => s.seq), [1, 2, 4, 5, 6, 8, 9]);
  assert.deepEqual(pickReplay(history, { muted: (id) => id === 'ann' }).map((s) => s.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'gag sender mutes do not hide tobacco, speech or poker');
});

test('selection resumes after the cursor and tolerates missing or expired history', () => {
  assert.deepEqual(pickReplay(history, { seen: 5 }).map((s) => s.seq), [6, 7, 8, 9]);
  assert.deepEqual(pickReplay(history.slice(6), { seen: 2 }).map((s) => s.seq), [7, 8, 9], 'retention gaps do not block newer entries');
  assert.deepEqual(pickReplay(history, { seen: 9 }), []);
  assert.deepEqual(pickReplay(undefined), []);
  assert.deepEqual(pickReplay([{ text: 'legacy entry' }, { seq: '10' }, { seq: 1.5 }]), []);
  assert.deepEqual(pickReplay([{ seq: 10, ev: { k: 'act', a: 'fold' } }]), [], 'old saves cannot fabricate a historical table');
});

function storage(t, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
}

test('saved progress resumes by player and table without moving backwards', (t) => {
  const values = new Map([['bba.replay.ABCDEF', '999']]);
  storage(t, { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  assert.equal(seenSeq('ABCDEF', 'ann'), 0, 'legacy unscoped cursors must not hide another player\'s history');
  markSeen('ABCDEF', 4, 'ann');
  assert.deepEqual(pickReplay(history, { seen: seenSeq('ABCDEF', 'ann') }).map((s) => s.seq), [5, 6, 7, 8, 9]);
  markSeen('ABCDEF', 2, 'ann');
  markSeen('ABCDEF', 4, 'ann');
  assert.equal(seenSeq('ABCDEF', 'ann'), 4);
  assert.equal(seenSeq('ABCDEF', 'bob'), 0);
  assert.equal(seenSeq('OTHER1', 'ann'), 0);
  assert.equal(seenSeq('ABCDEF'), 0);
  markSeen('ABCDEF', 6);
  markSeen('OTHER1', 8, 'ann');
  markSeen('ABCDEF', 9, 'bob');
  assert.equal(seenSeq('ABCDEF'), 6);
  assert.equal(seenSeq('OTHER1', 'ann'), 8);
  assert.equal(seenSeq('ABCDEF', 'bob'), 9);
  assert.equal(seenSeq('ABCDEF', 'ann'), 4);
});

test('unavailable browser storage leaves history replayable without throwing', (t) => {
  storage(t, {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
  });
  assert.equal(seenSeq('ABCDEF', 'ann'), 0);
  assert.doesNotThrow(() => markSeen('ABCDEF', 7, 'ann'));
  assert.deepEqual(pickReplay(history, { seen: seenSeq('ABCDEF', 'ann') }).map((s) => s.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('timing leaves readable beats for text, social events and reduced motion', () => {
  assert.equal(stepMs({ k: 'act', text: 'Ann checks' }), 900);
  assert.equal(stepMs({ k: 'notice' }, true), 1600);
  for (const k of ['smoke', 'gag']) assert.ok(stepMs({ k, text: 'Hi' }) >= 1600);
  assert.ok(stepMs({ k: 'say', text: 'a'.repeat(80) }) > stepMs({ k: 'say', text: 'Hi' }));
  for (const reduced of [false, true]) assert.equal(stepMs({ k: 'notice', text: 'a'.repeat(200) }, reduced), 3500);
});

test('historical display follows identity and hand, never borrowing another hand or occupant cards', () => {
  const live = { me: { playerId: 'ann', seat: 1 }, hand: { number: 2 }, seats: [
    { playerId: 'bob', cards: null }, { playerId: 'ann', cards: ['As', 'Kh'] },
  ], legal: { canCheck: true }, log: [{ seq: 8 }], showdown: { number: 1 } };
  const frame = { hand: { number: 1 }, seats: [{ playerId: 'ann', inHand: true, stack: 90 }, { playerId: 'cat', inHand: true, stack: 80 }] };
  const before = structuredClone({ live, frame });
  const old = replayView(live, frame);
  assert.equal(old.me.seat, 0);
  assert.equal(old.seats[0].cards, undefined, 'older private cards are unavailable');
  assert.equal(old.seats[1].playerId, 'cat', 'seat reuse must not substitute today\'s player');
  assert.equal(old.legal, null);
  assert.equal(old.showdown, null);
  assert.deepEqual(old.log, []);
  const same = replayView(live, { ...frame, hand: { number: 2 } });
  assert.deepEqual(same.seats[0].cards, ['As', 'Kh']);
  assert.equal(same.seats[1].cards, undefined);
  const spectator = replayView({ ...live, me: { playerId: null, seat: null } }, frame);
  assert.equal(spectator.me.seat, null);
  assert.equal(spectator.seats[0].cards, undefined);
  assert.deepEqual({ live, frame }, before, 'display composition must not mutate live or retained history');
});

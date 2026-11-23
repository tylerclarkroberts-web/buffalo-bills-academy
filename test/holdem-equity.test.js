import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEquity, equityColor, equityFacts, formatEquity, madeHandName, DEFAULT_TRIALS } from '../server/engine/equity.js';

describe('holdem equity', () => {
  it('AA vs one random hand preflop is about 85%', () => {
    const r = computeEquity({ hole: ['As', 'Ah'], board: [], opponents: 1, trials: 8000, seed: 7 });
    assert.equal(r.exact, false);
    assert.ok(r.equity > 0.83 && r.equity < 0.88, `AA equity ${r.equity}`);
    assert.ok(r.win > 0.80 && r.win < 0.88, `AA win ${r.win}`);
  });

  it('a made nut on the river is 100% (quad aces, no ties possible)', () => {
    const r = computeEquity({ hole: ['As', 'Ah'], board: ['Ac', 'Ad', 'Kc', '2d', '3s'], opponents: 1 });
    assert.equal(r.exact, true);
    assert.equal(r.equity, 1);
    assert.equal(r.win, 1);
    assert.equal(r.tie, 0);
  });

  it('a nut flush on the river is 100% (exact vs one, Monte Carlo vs two)', () => {
    const one = computeEquity({ hole: ['As', 'Ks'], board: ['2s', '7s', '9s', '4d', 'Jc'], opponents: 1 });
    assert.equal(one.exact, true);
    assert.equal(one.win, 1);
    assert.equal(one.equity, 1);
    const two = computeEquity({ hole: ['As', 'Ks'], board: ['2s', '7s', '9s', '4d', 'Jc'], opponents: 2, trials: 4000, seed: 5 });
    assert.equal(two.exact, false);
    assert.equal(two.win, 1);
    assert.equal(two.equity, 1);
  });

  it('a flopped nut flush draw with two overs is around 70% vs one random', () => {
    const r = computeEquity({ hole: ['Ah', 'Kh'], board: ['2h', '7h', '9c'], opponents: 1, trials: 8000, seed: 11 });
    assert.ok(r.equity > 0.65 && r.equity < 0.76, `draw equity ${r.equity}`);
  });

  it('uncontested (everyone else folded) is 100%', () => {
    const r = computeEquity({ hole: ['7c', '2d'], board: ['As', 'Kd', 'Qh'], opponents: 0 });
    assert.equal(r.exact, true);
    assert.equal(r.equity, 1);
  });

  it('the same seed is deterministic, and unknown keys such as opponent hole cards are ignored', () => {
    const base = { hole: ['As', 'Kd'], board: ['2c', '9h', 'Td'], opponents: 1, trials: 2000, seed: 99 };
    const a = computeEquity(base);
    const b = computeEquity({ ...base, opponentCards: [['Qc', 'Qd']], opponentHoles: [['Qc', 'Qd']], deck: ['Qc'] });
    assert.equal(a.equity, b.equity);
    assert.equal(a.win, b.win);
    assert.equal(a.tie, b.tie);
    assert.equal(a.trials, b.trials);
  });

  it('equityFacts only copies this player\'s hole, the board, and the live opponent count', () => {
    const view = {
      me: { seat: 0, playerId: 'me' },
      hand: { street: 'flop', board: ['2c', '3d', '9h'] },
      seats: [
        { seat: 0, inHand: true, folded: false, cards: ['As', 'Kh'] },
        { seat: 1, inHand: true, folded: false, cards: ['Qc', 'Qd'] },
        { seat: 2, inHand: true, folded: true, cards: ['Jc', 'Jd'] },
        { seat: 3, inHand: false, folded: false, cards: ['Tc', 'Td'] },
      ],
    };
    const facts = equityFacts(view);
    assert.deepEqual(facts, { hole: ['As', 'Kh'], board: ['2c', '3d', '9h'], opponents: 1 });
    const blob = JSON.stringify(facts);
    assert.equal(blob.includes('Qc'), false);
    assert.equal(blob.includes('Qd'), false);
    assert.equal(blob.includes('Jc'), false);
    assert.equal(blob.includes('Td'), false);
    assert.equal(Object.keys(facts).sort().join(','), 'board,hole,opponents');
    const withLeak = computeEquity({ ...facts, opponentCards: [['Qc', 'Qd']], trials: 1500, seed: 3 });
    const clean = computeEquity({ ...facts, trials: 1500, seed: 3 });
    assert.equal(withLeak.equity, clean.equity);
  });

  it('hides after a fold, with no hole cards, or at showdown', () => {
    const base = {
      me: { seat: 0 },
      hand: { street: 'turn', board: ['2c', '3d', '9h', 'As'] },
      seats: [{ seat: 0, inHand: true, folded: false, cards: ['Kd', 'Kh'] }, { seat: 1, inHand: true, folded: false }],
    };
    assert.ok(equityFacts(base));
    assert.equal(equityFacts({ ...base, seats: [{ ...base.seats[0], folded: true }, base.seats[1]] }), null);
    assert.equal(equityFacts({ ...base, seats: [{ ...base.seats[0], cards: null }, base.seats[1]] }), null);
    assert.equal(equityFacts({ ...base, hand: { ...base.hand, street: 'showdown' } }), null);
    assert.equal(equityFacts({ ...base, hand: null }), null);
  });

  it('formatEquity rounds the win percentage and colors the bar from red through yellow to green', () => {
    const f = formatEquity({ equity: 0.852, tie: 0.012, win: 0.84 });
    assert.equal(f.winPct, 85);
    assert.equal(f.tiePct, 1);
    assert.match(f.color, /^rgb\(/);
    const rgb = (s) => s.match(/\d+/g).map(Number);
    const lo = rgb(equityColor(0)), mid = rgb(equityColor(0.5)), hi = rgb(equityColor(1));
    assert.ok(lo[0] > lo[1] && lo[1] < mid[1], `low ${lo} should be red, mid ${mid} yellower`);
    assert.ok(mid[0] > 180 && mid[1] > 150, `mid ${mid} should be yellow`);
    assert.ok(hi[1] > hi[0] && hi[1] >= mid[1] - 20 && hi[0] < mid[0], `high ${hi} should be greener than mid ${mid}`);
    assert.equal(formatEquity({ equity: 0.2, tie: 0, win: 0.2 }).winPct, 20);
  });

  it('names the current made hand from hole cards and the visible board', () => {
    assert.equal(madeHandName(['As', 'Kh']), 'High card, Ace');
    assert.equal(madeHandName(['8s', '8d']), 'Pair of 8s');
    assert.equal(madeHandName(['Ks', 'Kd']), 'Pair of Kings');
    assert.equal(madeHandName(['Jh', 'Js'], ['Jc', '4d', '4s', '2c', '9h']), 'Full house, Jacks over 4s');
    assert.equal(madeHandName(['Jd', '4h'], ['Js', '4c', '9s', '2d', '8c']), 'Two pair, Jacks and 4s');
    assert.equal(madeHandName(['5s', '6h'], ['7d', '8c', '9s', '2h', 'Kd']), 'Straight, 9 high');
    assert.equal(madeHandName(['As', '2s'], ['7s', '9s', '4s', 'Jd', '3c']), 'Flush, Ace high');
    assert.equal(madeHandName(['Qs', 'Qh'], ['Qd', '3c', '3s', '9d', '2h']), 'Full house, Queens over 3s');
    assert.equal(madeHandName(['5s', '6s'], ['7s', '8s', '9s', '2d', 'Kc']), 'Straight flush, 9 high');
    assert.equal(madeHandName(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c']), 'Royal flush');
    assert.equal(madeHandName(['As', '7d'], ['Ah', 'Kc', '2d', '9s', '3c']), 'Pair of Aces');
  });

  it('default trial count is in the 2–5k band', () => {
    assert.ok(DEFAULT_TRIALS >= 2000 && DEFAULT_TRIALS <= 5000);
  });
});

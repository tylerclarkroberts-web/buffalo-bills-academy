// v44 Blackjack table engine. Pure state machine over a plain JSON table (persisted by ./index.js).
// Every function takes `now` (ms) and `rng(n)` explicitly; the server passes Date.now and crypto.randomInt.
// Money here is table chips; ./index.js moves bankroll money in and out (buy-in, cash-out, a human house's bank).
import { freshDeck, shuffle, handValue, isBlackjack, basicStrategy, royalHit, rankVal, tenish } from './rules.js';
import { GameError } from '../engine/game.js';

export const RESHUFFLE_AT = 18;  // before a round: fewer than 18 cards left (about a third of the deck) → fresh shuffled deck
const r2 = (x) => Math.round(x * 100) / 100;

export function log(t, now, text, ev = null) {
  t.seq = (t.seq || 0) + 1;
  t.log.push({ seq: t.seq, t: now, round: t.roundNo || 0, text, ev });
  if (t.log.length > 400) t.log.splice(0, t.log.length - 400);
}
const seatName = (t, i) => t.seats[i]?.name || `Seat ${i + 1}`;
const houseName = (t) => (t.house.mode === 'guntrad' ? 'Guntrad' : t.house.name);

function reshuffle(t, now, rng, why) {
  t.deck = shuffle(freshDeck(), rng); t.discards = []; t.shuffles = (t.shuffles || 0) + 1;
  log(t, now, `${houseName(t)} shuffles a fresh single deck (${why}).`, { k: 'shuffle', why });
}
function draw(t, now, rng) {
  if (!t.deck.length) {
    // mid-round: only the discard pile goes back in (cards on the felt stay put), announced
    t.deck = shuffle(t.discards, rng); t.discards = [];
    log(t, now, `Deck ran out mid-round: ${houseName(t)} shuffles the discards back in.`, { k: 'shuffle', why: 'mid-round' });
    if (!t.deck.length) throw new GameError('Out of cards', 500);
  }
  return t.deck.pop();
}

export const houseCanPay = (t) => t.house.mode === 'guntrad' || t.house.bank > 0;
/** Biggest main bet this round: the table max, and with a human house never more than a tenth of the bank. */
export function maxBetNow(t) {
  let m = t.limits.max;
  if (t.house.mode !== 'guntrad') m = Math.min(m, Math.floor(t.house.bank / 10));
  return Math.max(0, m);
}
const active = (t) => t.seats.map((s, i) => [s, i]).filter(([s]) => s && !s.left);

export function startRound(t, now, rng) {
  if (t.status === 'over') return;
  if (t.house.mode !== 'guntrad' && (t.house.bank < t.limits.min || maxBetNow(t) < t.limits.min)) return endGame(t, now, 'The house is out of money.');
  // v57 hotfix: a human still seated but under the minimum must not let bots auto-deal forever
  // (settle → startRound → deal → settle → … blew the call stack on live).
  const humans = active(t).filter(([s]) => !s.bot);
  if (humans.length && !humans.some(([s]) => s.chips >= t.limits.min)) {
    return endGame(t, now, 'No one can cover the minimum bet.');
  }
  if (!t.deck || t.deck.length < RESHUFFLE_AT) reshuffle(t, now, rng, t.deck ? `only ${t.deck.length} cards left` : 'first round');
  t.roundNo = (t.roundNo || 0) + 1;
  t.round = { no: t.roundNo, phase: 'betting', bets: {}, hands: [], dealer: [], holeShown: false, turn: -1, deadline: null, insurance: {}, results: null };
  log(t, now, `Round ${t.roundNo}: place your bets.`, { k: 'round', no: t.roundNo });
  for (const [s, i] of active(t)) if (s.bot && s.chips >= t.limits.min) placeBet(t, i, { bet: t.limits.min }, now, rng, true);
  advance(t, now, rng);
}

export function placeBet(t, seat, { bet, royal = {} }, now, rng, quiet = false) {
  const r = t.round; const s = t.seats[seat];
  if (!r || r.phase !== 'betting') throw new GameError('Bets are closed for this round.', 409);
  if (!s || s.left) throw new GameError('Take a seat first.', 409);
  if (r.bets[seat]) throw new GameError('Your bet is already down.', 409);
  bet = Number(bet);
  const max = maxBetNow(t);
  if (!Number.isInteger(bet) || bet < t.limits.min || bet > max) throw new GameError(`Bet $${t.limits.min}–$${max}.`, 400);
  const side = {};
  for (const k of ['match', 'pairs']) {
    const v = Number(royal[k] || 0);
    if (!v) continue;
    if (!t.royal[k]?.on) throw new GameError('That royal bet is off at this table.', 400);
    if (!Number.isInteger(v) || v < 1 || v > Math.min(t.limits.royalMax, bet)) throw new GameError(`Royal bets are $1 up to your main bet (max $${t.limits.royalMax}).`, 400);
    side[k] = v;
  }
  const total = bet + (side.match || 0) + (side.pairs || 0);
  if (total > s.chips) throw new GameError(`You have $${s.chips} in chips.`, 402);
  s.chips = r2(s.chips - total);
  r.bets[seat] = { bet, side };
  s.stats.wagered = r2(s.stats.wagered + total);
  if (!quiet) log(t, now, `${s.name} bets $${bet}${side.match ? ` + $${side.match} Royal Match` : ''}${side.pairs ? ` + $${side.pairs} Royal Pairs` : ''}.`, { k: 'bet', seat, amt: bet, side });
  if (!r.deadline && !s.bot) r.deadline = now + t.turnSec * 1000; // the betting clock starts with the first human bet
  if (!quiet) advance(t, now, rng);
}
export function sitOut(t, seat, now, rng) {
  const r = t.round; if (!r || r.phase !== 'betting') throw new GameError('You can only sit out between rounds.', 409);
  if (r.bets[seat]) throw new GameError('Your bet is already down.', 409);
  r.bets[seat] = { out: true }; advance(t, now, rng);
}

function deal(t, now, rng) {
  const r = t.round;
  const seats = Object.keys(r.bets).map(Number).filter((i) => !r.bets[i].out).sort((a, b) => a - b);
  for (const i of seats) r.hands.push({ seat: i, cards: [], bet: r.bets[i].bet, doubled: false, split: false, done: false, aces: false });
  for (let pass = 0; pass < 2; pass++) {
    for (const h of r.hands) { const c = draw(t, now, rng); h.cards.push(c); log(t, now, `${seatName(t, h.seat)} gets ${pass ? 'a second card' : 'a card'}.`, { k: 'deal', seat: h.seat, hand: r.hands.indexOf(h), card: c }); }
    const c = draw(t, now, rng); r.dealer.push(c);
    log(t, now, pass ? `${houseName(t)} takes the hole card, face down.` : `${houseName(t)} shows ${c}.`, { k: 'deal', dealer: true, card: pass ? null : c });
  }
  r.phase = 'dealt';
  // royal bets settle on the first two cards
  for (const h of r.hands) {
    const side = r.bets[h.seat].side; const s = t.seats[h.seat];
    for (const k of ['match', 'pairs']) {
      if (!side[k]) continue;
      const tier = royalHit(k, h.cards);
      if (tier) { const win = r2(side[k] * t.royal[k][tier]); pay(t, h.seat, side[k] + win, win); log(t, now, `${s.name} hits ${k === 'match' ? 'Royal Match' : 'Royal Pairs'} (${tier}): +$${win}!`, { k: 'royal', seat: h.seat, bet: k, tier, amt: win }); }
      else { houseTakes(t, side[k]); s.stats.lost = r2((s.stats.lost || 0) + side[k]); }
    }
  }
  const upA = r.dealer[0][0] === 'A';
  if (upA && t.rules.insurance && r.hands.some((h) => !t.seats[h.seat].bot)) {
    r.phase = 'insurance'; r.deadline = now + t.turnSec * 1000;
    log(t, now, `${houseName(t)} shows an ace: insurance?`, { k: 'insurance' });
    for (const h of r.hands) if (t.seats[h.seat].bot) r.insurance[h.seat] = 0; // bots never insure (basic strategy)
    return;
  }
  peek(t, now, rng);
}
function peek(t, now, rng) {
  const r = t.round;
  const up = r.dealer[0];
  // insurance bets
  for (const [seat, amt] of Object.entries(r.insurance)) if (amt) { t.seats[seat].chips = r2(t.seats[seat].chips - amt); t.seats[seat].stats.wagered = r2(t.seats[seat].stats.wagered + amt); }
  if ((up[0] === 'A' || tenish(up)) && isBlackjack(r.dealer)) {
    r.holeShown = true;
    log(t, now, `${houseName(t)} peeks… blackjack!`, { k: 'reveal', card: r.dealer[1], bj: true });
    for (const [seat, amt] of Object.entries(r.insurance)) if (amt) { pay(t, +seat, amt * 3, amt * 2); log(t, now, `${seatName(t, +seat)}'s insurance pays $${amt * 2}.`, { k: 'pay', seat: +seat, amt: amt * 2, ins: true }); }
    for (const h of r.hands) h.done = true;
    return settle(t, now, rng);
  }
  for (const [seat, amt] of Object.entries(r.insurance)) if (amt) houseTakes(t, amt);
  if (up[0] === 'A' || tenish(up)) log(t, now, `${houseName(t)} peeks: no blackjack.`, { k: 'peek' });
  r.phase = 'play'; r.turn = -1; r.deadline = null;
  for (const h of r.hands) if (isBlackjack(h.cards)) { h.done = true; h.bj = true; log(t, now, `${seatName(t, h.seat)}: BLACKJACK!`, { k: 'bj', seat: h.seat, hand: r.hands.indexOf(h) }); }
  nextTurn(t, now, rng);
}
export function insure(t, seat, yes, now, rng) {
  const r = t.round;
  if (!r || r.phase !== 'insurance') throw new GameError('No insurance on offer.', 409);
  const h = r.hands.find((x) => x.seat === seat); if (!h) throw new GameError('You are not in this round.', 409);
  if (seat in r.insurance) throw new GameError('Already decided.', 409);
  const amt = yes ? Math.floor(h.bet / 2) : 0;
  if (amt > t.seats[seat].chips) throw new GameError('Not enough chips for insurance.', 402);
  r.insurance[seat] = amt;
  log(t, now, `${t.seats[seat].name} ${amt ? `takes insurance ($${amt})` : 'declines insurance'}.`, { k: 'ins', seat, amt });
  advance(t, now, rng);
}

/** v46 fix: a split ace that catches another ace stays open (split or stand only) when resplitting aces is allowed. */
function canResplitAce(t, h) { const r = t.round; return t.rules.resplitAces && h.cards.length === 2 && h.cards[1][0] === 'A' && r.hands.filter((x) => x.seat === h.seat).length < t.rules.maxHands; }
export function canDo(t, h) {
  const r = t.round; const s = t.seats[h.seat];
  const two = h.cards.length === 2; const { total } = handValue(h.cards);
  const dOK = t.rules.doubleOn === 'any' || (t.rules.doubleOn === '9-11' ? total >= 9 && total <= 11 : total >= 10 && total <= 11);
  const handsOf = r.hands.filter((x) => x.seat === h.seat).length;
  const pair = two && (h.cards[0][0] === h.cards[1][0] || (tenish(h.cards[0]) && tenish(h.cards[1])));
  return {
    double: two && !h.aces && dOK && (!h.split || t.rules.das) && s.chips >= h.bet,
    split: pair && handsOf < t.rules.maxHands && s.chips >= h.bet && (!h.aces || t.rules.resplitAces),
    surrender: t.rules.surrender && two && !h.split && handsOf === 1,
    das: t.rules.das,
  };
}
function nextTurn(t, now, rng) {
  const r = t.round;
  for (;;) {
    const i = r.hands.findIndex((h) => !h.done);
    if (i < 0) return dealerPlays(t, now, rng);
    r.turn = i; const h = r.hands[i];
    if (h.cards.length === 1) { const c = draw(t, now, rng); h.cards.push(c); log(t, now, `${seatName(t, h.seat)}'s split hand gets ${c}.`, { k: 'hit', seat: h.seat, hand: i, card: c }); if (h.aces && !t.rules.hitSplitAces && !canResplitAce(t, h)) { h.done = true; continue; } }
    if (handValue(h.cards).total >= 21) { h.done = true; continue; }
    if (t.seats[h.seat].bot) { const a = basicStrategy(h.cards, r.dealer[0], canDo(t, h)); doAct(t, i, a, now, rng); continue; }
    r.deadline = now + t.turnSec * 1000;
    return;
  }
}
export function act(t, seat, action, now, rng) {
  const r = t.round;
  if (!r || r.phase !== 'play') throw new GameError('Not time to play a hand.', 409);
  const h = r.hands[r.turn]; if (!h || h.seat !== seat) throw new GameError("It isn't your turn.", 409);
  doAct(t, r.turn, action, now, rng);
  nextTurn(t, now, rng);
}
function doAct(t, i, action, now, rng, auto = false) {
  const r = t.round; const h = r.hands[i]; const s = t.seats[h.seat]; const can = canDo(t, h);
  const who = seatName(t, h.seat);
  if (action === 'hit' && h.aces && !t.rules.hitSplitAces) throw new GameError('Split aces get one card: split again or stand.', 400);
  if (action === 'hit') {
    const c = draw(t, now, rng); h.cards.push(c); const v = handValue(h.cards).total;
    log(t, now, `${who} hits: ${c} (${v > 21 ? 'BUST' : v}).`, { k: 'hit', seat: h.seat, hand: i, card: c });
    if (v > 21) { h.done = true; h.bust = true; log(t, now, `${who} busts.`, { k: 'bust', seat: h.seat, hand: i }); } else if (v === 21) h.done = true;
  } else if (action === 'stand') {
    h.done = true; log(t, now, `${who} ${auto ? 'ran out of time and stands' : 'stands'} on ${handValue(h.cards).total}.`, { k: 'stand', seat: h.seat, hand: i, auto });
  } else if (action === 'double') {
    if (!can.double) throw new GameError("You can't double this hand.", 400);
    s.chips = r2(s.chips - h.bet); s.stats.wagered = r2(s.stats.wagered + h.bet); h.bet *= 2; h.doubled = true;
    const c = draw(t, now, rng); h.cards.push(c); h.done = true; const v = handValue(h.cards).total;
    log(t, now, `${who} doubles to $${h.bet}: ${c} (${v > 21 ? 'BUST' : v}).`, { k: 'double', seat: h.seat, hand: i, card: c, amt: h.bet });
    if (v > 21) { h.bust = true; log(t, now, `${who} busts.`, { k: 'bust', seat: h.seat, hand: i }); }
  } else if (action === 'split') {
    if (!can.split) throw new GameError("You can't split this hand.", 400);
    s.chips = r2(s.chips - h.bet); s.stats.wagered = r2(s.stats.wagered + h.bet);
    const aces = h.cards[0][0] === 'A';
    const h2 = { seat: h.seat, cards: [h.cards.pop()], bet: h.bet, doubled: false, split: true, done: false, aces };
    h.split = true; h.aces = aces;
    r.hands.splice(i + 1, 0, h2);
    log(t, now, `${who} splits ${aces ? 'aces' : 'the pair'}.`, { k: 'split', seat: h.seat, hand: i });
    const c = draw(t, now, rng); h.cards.push(c); log(t, now, `${who}'s first hand gets ${c}.`, { k: 'hit', seat: h.seat, hand: i, card: c });
    if (aces && !t.rules.hitSplitAces && !canResplitAce(t, h)) h.done = true;
  } else if (action === 'surrender') {
    if (!can.surrender) throw new GameError('Surrender is not available.', 400);
    h.done = true; h.surrendered = true; log(t, now, `${who} surrenders (half back).`, { k: 'surrender', seat: h.seat, hand: i });
  } else throw new GameError('Unknown move.', 400);
}

function dealerPlays(t, now, rng) {
  const r = t.round; r.phase = 'dealer'; r.turn = -1; r.deadline = null; r.holeShown = true;
  log(t, now, `${houseName(t)} turns over ${r.dealer[1]} (${handValue(r.dealer).total}).`, { k: 'reveal', card: r.dealer[1] });
  const live = r.hands.some((h) => !h.bust && !h.surrendered && !h.bj);
  if (live) for (;;) {
    const { total, soft } = handValue(r.dealer);
    if (total > 17 || (total === 17 && (!soft || t.rules.s17))) break;
    const c = draw(t, now, rng); r.dealer.push(c);
    const v = handValue(r.dealer).total;
    log(t, now, `${houseName(t)} hits: ${c} (${v > 21 ? 'BUST' : v}).`, { k: 'dhit', card: c, bust: v > 21 });
  }
  settle(t, now, rng);
}
function pay(t, seat, back, profit) {
  profit = Math.max(0, profit); // losses (surrender) are booked by houseTakes
  // a human house pays out of its bank only: when the bank cannot cover a win in full, the player gets what is left
  if (t.house.mode !== 'guntrad' && profit > t.house.bank) { back = r2(back - profit + Math.max(0, t.house.bank)); profit = Math.max(0, t.house.bank); }
  const s = t.seats[seat]; s.chips = r2(s.chips + back); s.stats.won = r2(s.stats.won + back);
  if (profit > (s.stats.biggest || 0)) s.stats.biggest = r2(profit);
  t.house.net = r2((t.house.net || 0) - profit);
  if (t.house.mode !== 'guntrad') t.house.bank = r2(t.house.bank - profit);
}
function houseTakes(t, amt) { t.house.net = r2((t.house.net || 0) + amt); if (t.house.mode !== 'guntrad') t.house.bank = r2(t.house.bank + amt); }

function settle(t, now, rng) {
  const r = t.round; r.phase = 'done'; r.deadline = null;
  const dv = handValue(r.dealer).total; const dbj = isBlackjack(r.dealer); const dbust = dv > 21;
  const results = [];
  for (const [i, h] of r.hands.entries()) {
    const s = t.seats[h.seat]; const v = handValue(h.cards).total; let out, back = 0;
    if (h.surrendered) { out = 'surrender'; back = h.bet / 2; }
    else if (h.bust) out = 'bust';
    else if (h.bj && !h.split) { out = dbj ? 'push' : 'blackjack'; back = dbj ? h.bet : h.bet + h.bet * t.rules.bjPays; }
    else if (dbj) out = 'lose';
    else if (dbust || v > dv) { out = 'win'; back = h.bet * 2; }
    else if (v === dv) { out = 'push'; back = h.bet; }
    else out = 'lose';
    back = r2(back);
    if (back) pay(t, h.seat, back, r2(back - h.bet));
    if (back < h.bet) houseTakes(t, r2(h.bet - back));
    if (back < h.bet) s.stats.lost = r2((s.stats.lost || 0) + h.bet - back);
    if (out === 'blackjack') s.stats.bj++;
    results.push({ seat: h.seat, hand: i, out, bet: h.bet, net: r2(back - h.bet), total: v });
    log(t, now, `${s.name}: ${out === 'blackjack' ? `blackjack pays $${r2(back - h.bet)}` : out === 'win' ? `wins $${h.bet}` : out === 'push' ? 'push' : out === 'surrender' ? `surrendered, $${back} back` : out === 'bust' ? 'bust' : 'loses'}.`, { k: 'pay', seat: h.seat, hand: i, out, amt: r2(back - h.bet) });
  }
  for (const i of new Set(r.hands.map((h) => h.seat))) t.seats[i].stats.rounds++;
  t.discards.push(...r.dealer, ...r.hands.flatMap((h) => h.cards));
  r.results = results;
  t.last = { no: r.no, dealer: r.dealer.slice(), dealerTotal: dv, results, hands: r.hands.map((h) => ({ seat: h.seat, cards: h.cards.slice(), bet: h.bet })) };
  if (t.house.mode !== 'guntrad' && t.house.bank <= 0) { t.house.bank = Math.max(0, t.house.bank); return endGame(t, now, `${houseName(t)} is out of money.`); }
  // Next round only if a human can still afford the minimum. Bots-only tables wait for their driver.
  // (v57 hotfix: chips < min + bots used to recurse settle→startRound until the stack blew.)
  if (active(t).some(([x]) => !x.bot && x.chips >= t.limits.min)) startRound(t, now, rng);
  else if (active(t).some(([x]) => !x.bot)) endGame(t, now, 'No one can cover the minimum bet.');
}
export function endGame(t, now, why) {
  // a round cut short: every unsettled stake goes back (bets not yet dealt, and hands still in play)
  const r = t.round;
  if (r && !['done', 'over'].includes(r.phase)) {
    if (r.phase === 'betting') for (const [i, b] of Object.entries(r.bets)) { if (!b.out) t.seats[i].chips = r2(t.seats[i].chips + b.bet + (b.side.match || 0) + (b.side.pairs || 0)); }
    else for (const h of r.hands) t.seats[h.seat].chips = r2(t.seats[h.seat].chips + h.bet);
    log(t, now, 'Round called off: bets returned.', { k: 'void' });
  }
  t.status = 'over'; t.overReason = why; if (t.round) t.round.phase = 'over';
  t.final = { why, at: now, standings: active(t).map(([s, i]) => ({ seat: i, name: s.name, chips: s.chips, net: r2(s.chips - s.startChips) })).sort((a, b) => b.net - a.net),
    house: t.house.mode === 'guntrad' ? null : { name: t.house.name, bank: t.house.bank, net: r2(t.house.bank - t.house.startBank) } };
  log(t, now, `Game over: ${why}`, { k: 'over' });
}

/** Run anything that is due: deal when every bettor is in (or the betting clock ran out), timeouts, bots. */
export function advance(t, now, rng) {
  const r = t.round; if (!r || t.status === 'over') return;
  if (r.phase === 'betting') {
    const seated = active(t).filter(([s]) => s.chips >= t.limits.min);
    const all = seated.length > 0 && seated.every(([, i]) => r.bets[i]);
    const timeUp = r.deadline && now >= r.deadline;
    const anyBet = Object.values(r.bets).some((b) => !b.out);
    if (timeUp) for (const [, i] of seated) if (!r.bets[i]) { r.bets[i] = { out: true }; log(t, now, `${seatName(t, i)} sits this round out (no bet in time).`, { k: 'out', seat: i }); }
    // Don't run a bots-only deal while a human is still at the table (same stack-overflow class as settle).
    const humanIn = Object.entries(r.bets).some(([i, b]) => !b.out && t.seats[+i] && !t.seats[+i].bot);
    if ((all || timeUp) && anyBet) {
      if (!humanIn && active(t).some(([s]) => !s.bot)) {
        if (!timeUp) return;
        r.bets = {}; r.deadline = null;
        return;
      }
      return deal(t, now, rng);
    }
    if ((all || timeUp) && !anyBet) { r.bets = {}; r.deadline = null; }
    return;
  }
  if (r.phase === 'insurance') {
    const need = r.hands.filter((h) => !(h.seat in r.insurance));
    if (r.deadline && now >= r.deadline) for (const h of need) r.insurance[h.seat] = 0;
    if (r.hands.every((h) => h.seat in r.insurance)) return peek(t, now, rng);
    return;
  }
  if (r.phase === 'play' && r.deadline && now >= r.deadline) {
    doAct(t, r.turn, 'stand', now, rng, true); nextTurn(t, now, rng);
  }
}

// Async Scum: the pure rules. No I/O, no clock, no randomness of its own (rng and now are passed in), so tests can
// drive every case. Cards are the usual 2-character strings ('7h', 'Td', 'As'). Play money only: nothing here
// touches a bankroll.
//
// House rules (Tyler's, plus the gaps we filled; the PR lists them):
//  - One 52-card deck, no jokers, dealt round-robin to 3-7 players; a few players get one extra card when 52 does
//    not split evenly (round 1: the first seats; later rounds: from Scum up, so the bottom gets the extras).
//  - Low to high 2 3 4 5 6 7 8 9 10 J Q K, then A is trump. Suits never matter.
//  - Round 1 is led by whoever holds the 2 of clubs (any set; it need not include that card). From round 2 on the
//    King leads and the order is by title: King, Queen, Commoners, (newcomers), Baby Scum, Scum last.
//  - Lead any single, double, triple or quad of one rank. Followers play the same count of an equal or higher rank,
//    or pass. Playing the SAME rank as the play right before skips the next player ("You're skipped!").
//  - Aces: aces beat any set of the SAME size: one ace clears singles, two aces clear a pair, three a three, four
//    a four (fewer aces than the set is not a play). Leading, any number of aces clears. Nothing goes on an ace.
//    Aces clear the pile at once and the same player leads again (or the next player, if that was their last card).
//  - Play on: when the turn comes back round to whoever played last (everyone else passed or got skipped), the pile
//    stays live and it's THEIR turn: they may keep playing on their own set (same count, equal or higher; an equal
//    rank still skips the next player, who always exists since 2+ are still in) or pass, which clears the pile and
//    they lead fresh. A new play on the pile gives everyone else another chance to follow. If the owner already went
//    out, the pile clears and the next player still in leads. A pass does not lock you out.
//  - One standard 52-card deck, always: no jokers, no second deck, never more than 7 players (7 x 7 = 49 <= 52).
//  - Going out: first out is King, then Queen, ..., second to last Baby Scum, last Scum. With 3 players there is no
//    Queen or Baby Scum: King, Commoner, Scum (only King and Scum swap cards). Everyone in between is a Commoner.
//  - Exchange, before every round after the first: Scum hands the King their 2 highest cards and Baby Scum hands
//    the Queen their highest (the server picks them, no hiding). Each may type a beg with it. Then the King gives
//    Scum any 2 cards and the Queen gives Baby Scum any 1.
import { newDeck, shuffle } from '../engine/cards.js';

export const ACE = 14;
export const MIN_PLAYERS = 3, MAX_PLAYERS = 7;
/** Single deck, always: 52 cards, no jokers. There is no multi-deck option anywhere. */
export const DECK_SIZE = 52;
export const BEG_MAX = 140;
const R = '23456789TJQKA';
export const rank = (c) => R.indexOf(String(c)[0]) + 2; // 2..14 (A = 14, trump)
export const RANK_NAME = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankName = (r) => RANK_NAME[r] || String(r);
const SETS = { 1: 'single', 2: 'pair', 3: 'three', 4: 'four' };
/** High card last; ties by suit so the order is stable. */
export const sortHand = (cards) => cards.slice().sort((a, b) => rank(a) - rank(b) || 'cdhs'.indexOf(a[1]) - 'cdhs'.indexOf(b[1]));
/** Bankroll per title, settled when the titles are set at the end of each round (no buy-in; bots are house-funded). */
export const PAY = { king: 100, queen: 50, commoner: 0, babyScum: -5, scum: -10 };
/** You need this much to be dealt in: enough to cover the worst title (Scum). Below it, off to the mines. */
export const DUES_MAX = 10;
export const TITLES = { king: 'King', queen: 'Queen', commoner: 'Commoner', babyScum: 'Baby Scum', scum: 'Scum' };

/** Titles by finishing position for n players (index 0 went out first). */
export function titlesFor(n) {
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return 'king';
    if (i === n - 1) return 'scum';
    if (n >= 4 && i === 1) return 'queen';
    if (n >= 4 && i === n - 2) return 'babyScum';
    return 'commoner';
  });
}

/** Deal the whole deck round-robin over `seats` (in deal order). Returns { seat: sortedCards }. */
export function deal(seats, rng) {
  if (seats.length > MAX_PLAYERS) throw new Error(`Scum is single deck: ${MAX_PLAYERS} players at most.`);
  const deck = shuffle(newDeck(), rng);
  if (deck.length !== DECK_SIZE || new Set(deck).size !== DECK_SIZE) throw new Error('Scum is played with one 52-card deck.');
  const hands = Object.fromEntries(seats.map((s) => [s, []]));
  deck.forEach((c, k) => hands[seats[k % seats.length]].push(c));
  for (const s of seats) hands[s] = sortHand(hands[s]);
  return hands;
}

/** Is this a legal set at all (1-4 cards of one rank, no duplicates)? */
export function isSet(cards) {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 4) return false;
  if (new Set(cards).size !== cards.length) return false;
  return cards.every((c) => typeof c === 'string' && /^[2-9TJQKA][shdc]$/.test(c) && rank(c) === rank(cards[0]));
}
/** Why `cards` can't go on `pile` (null = it can). pile = null means you are leading. */
export function playProblem(pile, cards) {
  if (!isSet(cards)) return 'Play one to four cards of the same rank.';
  if (!pile) return null;
  if (pile.rank === ACE) return 'Nothing goes on an ace.';
  if (rank(cards[0]) === ACE) { // trump, but only as many aces as the set on the pile
    return cards.length === pile.count ? null : `It takes ${['', 'one ace', 'two aces', 'three aces', 'four aces'][pile.count]} to clear ${pile.count === 1 ? 'a single' : `a ${SETS[pile.count]}`}.`;
  }
  if (cards.length !== pile.count) return `Play ${pile.count === 1 ? 'a single' : `a ${SETS[pile.count]}`} to follow.`;
  if (rank(cards[0]) < pile.rank) return `You need ${rankName(pile.rank)} or higher.`;
  return null;
}
export const describe = (cards) => {
  const r = rank(cards[0]); const n = cards.length; const nm = r === ACE ? 'ace' : rankName(r);
  if (n === 1) return `${r === ACE ? 'an' : r === 8 ? 'an' : 'a'} ${nm}`;
  return `${['', '', 'two', 'three', 'four'][n]} ${nm}s`;
};

// ------------------------------------------------------------------ round state
// r = { no, phase: 'exchange'|'play'|'done', order: [seat], hands: {seat: [cards]}, pile: {cards, count, rank, seat}|null,
//       owner: seat|null, turn: seat|null, finished: [seat], gone: [seat], exchange: {...}|null }
const activeIn = (r, s) => !r.finished.includes(s) && !r.gone.includes(s);
export const activeSeats = (r) => r.order.filter((s) => activeIn(r, s));
const after = (r, s) => r.order[(r.order.indexOf(s) + 1) % r.order.length];
/** First active seat strictly after s (in order). */
export function nextActive(r, s) { let x = s; for (let n = 0; n < r.order.length; n++) { x = after(r, x); if (activeIn(r, x)) return x; } return null; }

/**
 * Round setup. `order` = turn order (seats). titles (from last round, by seat) decide the exchange. For round 1 pass
 * titles = null: the 2 of clubs leads. Returns the round; the caller logs.
 */
export function newRound({ no, order, titles = null, rng, dealOrder = null }) {
  const hands = deal(dealOrder || order, rng);
  const r = { no, phase: 'play', order: order.slice(), hands, pile: null, owner: null, turn: null, finished: [], gone: [], exchange: null, lastPlay: null, skipped: null };
  const pairs = titles ? exchangePairs(order, titles) : [];
  if (pairs.length) { r.phase = 'exchange'; r.exchange = { pairs }; }
  else r.turn = titles ? order[0] : order.find((s) => hands[s].includes('2c'));
  if (!titles) { const i = order.indexOf(r.turn); r.order = [...order.slice(i), ...order.slice(0, i)]; }
  return r;
}
export function exchangePairs(order, titles) {
  const who = (t) => order.find((s) => titles[s] === t);
  const out = [];
  const [k, s, q, b] = [who('king'), who('scum'), who('queen'), who('babyScum')];
  if (k != null && s != null) out.push({ from: s, to: k, n: 2, beg: null, tribute: null, paid: false, gift: null, given: false });
  if (q != null && b != null) out.push({ from: b, to: q, n: 1, beg: null, tribute: null, paid: false, gift: null, given: false });
  return out;
}
/** The highest n cards (aces top). */
export const highest = (hand, n) => sortHand(hand).slice(-n);
export const lowest = (hand, n) => sortHand(hand).slice(0, n);

/** Scum / Baby Scum hands over their best card(s), with an optional beg. Returns the pair. */
export function payTribute(r, seat, beg = '') {
  if (r.phase !== 'exchange') throw new Error('Not the exchange.');
  const p = r.exchange.pairs.find((x) => x.from === seat);
  if (!p) throw new Error('You owe nobody anything this round.');
  if (p.paid) throw new Error('Already handed over.');
  p.tribute = highest(r.hands[seat], p.n);
  r.hands[seat] = r.hands[seat].filter((c) => !p.tribute.includes(c));
  r.hands[p.to] = sortHand([...r.hands[p.to], ...p.tribute]);
  p.beg = String(beg || '').replace(/\s+/g, ' ').trim().slice(0, BEG_MAX) || null;
  p.paid = true;
  return p;
}
/** King / Queen gives back any n cards of their choice. Returns true when the whole exchange is done. */
export function giveBack(r, seat, cards) {
  if (r.phase !== 'exchange') throw new Error('Not the exchange.');
  const p = r.exchange.pairs.find((x) => x.to === seat);
  if (!p) throw new Error('You give nobody anything this round.');
  if (!p.paid) throw new Error('Wait for their cards first.');
  if (p.given) throw new Error('Already given.');
  if (!Array.isArray(cards) || cards.length !== p.n || new Set(cards).size !== p.n || !cards.every((c) => r.hands[seat].includes(c))) throw new Error(`Pick ${p.n === 1 ? 'one card' : `${p.n} cards`} from your hand.`);
  r.hands[seat] = r.hands[seat].filter((c) => !cards.includes(c));
  r.hands[p.from] = sortHand([...r.hands[p.from], ...cards]);
  p.gift = cards.slice(); p.given = true;
  return exchangeDone(r);
}
export function exchangeDone(r) {
  if (r.exchange.pairs.every((p) => p.given)) { r.phase = 'play'; r.turn = r.order.find((s) => activeIn(r, s)) ?? null; checkEnd(r); return true; }
  return false;
}
/** A pair whose player left: settle it automatically so the round can start. */
export function dropFromExchange(r, seat) {
  r.exchange.pairs = r.exchange.pairs.filter((p) => p.from !== seat && p.to !== seat || (p.given));
  return exchangeDone(r);
}

/**
 * Walk the turn on from `from`. skip=true jumps one active player. Reaching the pile owner's seat (everyone between
 * passed or got skipped) hands THEM the turn with the pile still live ("play on"): they may keep playing on their own
 * set or pass to clear it and lead fresh. If the owner already went out, the pile clears and the next player leads.
 * Returns { skipped, cleared, playOn }.
 */
function moveOn(r, from, skip) {
  let s = from; let toSkip = skip ? 1 : 0; let skipped = null;
  for (let n = 0; n <= r.order.length * 2; n++) {
    s = after(r, s);
    if (r.owner != null && s === r.owner) {
      if (activeIn(r, s)) { r.turn = s; r.playOn = true; return { skipped, cleared: false, playOn: true }; }
      clearPile(r); return { skipped, cleared: true };
    }
    if (!activeIn(r, s)) continue;
    if (toSkip) { toSkip--; skipped = s; continue; }
    r.turn = s; return { skipped, cleared: false };
  }
  clearPile(r); return { skipped, cleared: true };
}
function clearPile(r) {
  const o = r.owner;
  r.pile = null; r.owner = null; r.playOn = false;
  r.turn = o != null && activeIn(r, o) ? o : nextActive(r, o ?? r.turn);
}
/** The round ends when one player is left holding cards: they are Scum. */
function checkEnd(r) {
  const left = activeSeats(r);
  if (left.length <= 1) { if (left.length === 1) r.finished.push(left[0]); r.phase = 'done'; r.turn = null; r.pile = null; return true; }
  return false;
}

/**
 * Play cards. Returns what happened: { skipped, cleared: 'ace'|'pass'|null, out: place|null, done }.
 * Throws an Error with a player-facing message when the play is not allowed.
 */
export function play(r, seat, cards) {
  if (r.phase !== 'play') throw new Error(r.phase === 'exchange' ? 'Cards are still changing hands.' : 'The round is over.');
  if (r.turn !== seat) throw new Error('Not your turn.');
  const hand = r.hands[seat];
  if (!Array.isArray(cards) || !cards.every((c) => hand.includes(c))) throw new Error("Those aren't your cards.");
  const why = playProblem(r.pile, cards); if (why) throw new Error(why);
  const prev = r.pile;
  r.playOn = false;
  r.hands[seat] = hand.filter((c) => !cards.includes(c));
  const k = rank(cards[0]);
  r.lastPlay = { seat, cards: cards.slice() }; r.skipped = null;
  let out = null;
  if (!r.hands[seat].length) { r.finished.push(seat); out = r.finished.length; }
  if (k === ACE) {
    // Trump: nothing can follow, so the pile clears right away. The same player leads unless that was their last card.
    r.pile = null; r.owner = null;
    if (checkEnd(r)) return { skipped: null, cleared: 'ace', out, done: true };
    r.turn = out ? nextActive(r, seat) : seat;
    return { skipped: null, cleared: 'ace', out, done: false };
  }
  const skip = !!prev && prev.rank === k;
  r.pile = { cards: cards.slice(), count: cards.length, rank: k, seat };
  r.owner = seat;
  if (checkEnd(r)) return { skipped: null, cleared: null, out, done: true };
  const m = moveOn(r, seat, skip);
  r.skipped = m.skipped;
  return { skipped: m.skipped, cleared: m.cleared ? 'pass' : null, playOn: !!m.playOn, out, done: false };
}
/**
 * Pass. You can't pass when you are leading. Playing on (everyone else passed on your set), a pass clears the pile
 * and you lead fresh. Returns { cleared, leader, playOn }.
 */
export function pass(r, seat) {
  if (r.phase !== 'play') throw new Error('Not now.');
  if (r.turn !== seat) throw new Error('Not your turn.');
  if (!r.pile) throw new Error("You're leading: play something.");
  r.skipped = null;
  if (r.playOn && r.owner === seat) { clearPile(r); return { cleared: true, leader: r.turn, playOn: false }; }
  const m = moveOn(r, seat, false);
  return { cleared: m.cleared, leader: m.cleared ? r.turn : null, playOn: !!m.playOn };
}
/** A player walked out mid-round: their cards leave with them; the turn moves on if it was theirs. */
export function walkOut(r, seat) {
  if (r.gone.includes(seat) || r.finished.includes(seat) || !r.order.includes(seat)) return { done: r.phase === 'done' };
  r.gone.push(seat); r.hands[seat] = [];
  if (r.phase === 'exchange') { dropFromExchange(r, seat); }
  if (r.phase === 'play') {
    if (checkEnd(r)) return { done: true };
    if (r.turn === seat) { if (r.pile) moveOn(r, seat, false); else r.turn = nextActive(r, seat); }
  }
  return { done: r.phase === 'done' };
}

/** Next round's turn order from this round's finish (gone players dropped), newcomers just above the bottom two. */
export function nextOrder(finish, newcomers = []) {
  const n = finish.length;
  const cut = n >= 4 ? n - 2 : Math.max(0, n - 1);
  return [...finish.slice(0, cut), ...newcomers, ...finish.slice(cut)];
}

// ------------------------------------------------------------------ the clock and the bots
/** What a timed-out or robot player does on their turn. Leading: the lowest set (bots) / lowest single (timeout). */
export function autoMove(r, seat, { bot = false } = {}) {
  const hand = sortHand(r.hands[seat]);
  const groups = []; for (const c of hand) { const g = groups[groups.length - 1]; if (g && rank(g[0]) === rank(c)) g.push(c); else groups.push([c]); }
  const plain = groups.filter((g) => rank(g[0]) !== ACE); const aces = groups.find((g) => rank(g[0]) === ACE) || [];
  if (!r.pile) {
    if (!bot) return { play: [hand[0]] };
    if (!plain.length) return { play: aces };
    return { play: plain[0] }; // dump the lowest rank, all copies
  }
  // Everyone passed on our own set: go out if the whole hand is one legal set on it, else clear and lead fresh.
  if (r.playOn && r.owner === seat) return bot && !playProblem(r.pile, hand) ? { play: hand } : { pass: true };
  if (!bot) return { pass: true };
  const p = r.pile;
  const fits = plain.filter((g) => rank(g[0]) >= p.rank && g.length >= p.count);
  const exact = fits.find((g) => g.length === p.count);
  const pick = exact || fits[0];
  if (pick) {
    // Don't break a high set for a cheap pile unless the hand is nearly gone.
    if (!exact && rank(pick[0]) >= 12 && hand.length > 6) return aceOrPass();
    return { play: pick.slice(0, p.count) };
  }
  return aceOrPass();
  function aceOrPass() { return aces.length >= p.count && hand.length - aces.length <= 4 ? { play: aces.slice(0, p.count) } : { pass: true }; }
}
/**
 * Missed your turn? Your bug plays for you, and it always plays your HIGHEST card. Leading: your single highest card
 * (an ace if you have one). Following: the highest-ranked legal set of the pile's size (aces first, but only when you
 * hold as many aces as the set; see playProblem); nothing legal, it passes.
 */
export function bugMove(r, seat) {
  const hand = sortHand(r.hands[seat]);
  if (!hand.length) return { pass: true };
  if (!r.pile) return { play: [hand[hand.length - 1]] };
  if (r.playOn && r.owner === seat) return { pass: true }; // everyone passed on your set: the bug clears it, then leads your highest
  const byRank = new Map(); for (const c of hand) byRank.set(rank(c), [...(byRank.get(rank(c)) || []), c]);
  for (const k of [...byRank.keys()].sort((a, b) => b - a)) {
    const set = byRank.get(k).slice(-r.pile.count);
    if (set.length === r.pile.count && !playProblem(r.pile, set)) return { play: set };
  }
  return { pass: true };
}
/** The King/Queen robot (or a timeout) gives back their lowest cards. */
export const autoGift = (r, seat, n) => lowest(r.hands[seat], n);
const BEGS = ['Spare a fella an ace?', "I've got kids. Well, bugs. Same thing.", 'Your Majesty, a two-card loan?', 'Anything above a 4, I beg you.', 'I will sweep the saloon for a king.', 'Please. Just one face card.'];
export const botBeg = (rng) => BEGS[rng(BEGS.length)];

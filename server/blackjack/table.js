// v44 Blackjack: table creation (settings with bounds) and the per-viewer view (no card leaks).
import { cleanRules, cleanRoyal, royalEv, LIMITS, handValue, GUNTRAD_RULES } from './rules.js';
import { maxBetNow, canDo } from './game.js';
import { GameError } from '../engine/game.js';
import { edgeReport, guntradProblems } from './edge.js';

export const EDGE_VER = 46; // v46: tables made from here on passed the Guntrad floors; older ones are grandfathered

const pick = (v, opts, def) => (opts.includes(Number(v)) ? Number(v) : def);
export function cleanSettings(s = {}) {
  const house = ['guntrad', 'me', 'player'].includes(s.house) ? s.house : 'guntrad';
  const minBet = pick(s.minBet, LIMITS.minBets, 5);
  const maxBetX = pick(s.maxBetX, LIMITS.maxBetX, 20);
  return {
    house,
    // Guntrad's table always uses the standard Vegas rules unless the creator changes them; any house may change them
    rules: cleanRules(s.rules || GUNTRAD_RULES),
    royal: cleanRoyal(s.royal || {}),
    minBet, max: Math.min(LIMITS.maxBetCap, minBet * maxBetX), maxBetX,
    buyIn: pick(s.buyIn, LIMITS.buyIns, 500),
    houseBank: pick(s.houseBank, LIMITS.houseBanks, 1000),
    turnSec: pick(s.turnSec, LIMITS.turnSecs, 86400), // v48: default 1 day (range still 30 s .. 1 day)
    maxSeats: pick(s.maxSeats, LIMITS.maxSeats, 5),
    bots: house === 'guntrad' ? Math.max(0, Math.min(3, Math.floor(Number(s.bots) || 0))) : 0,
  };
}
export function newTable({ code, name, host, settings }) {
  const st = cleanSettings(settings);
  if (st.buyIn < st.minBet * 10) throw new GameError('The buy-in must cover at least 10 minimum bets.', 400);
  if (st.house === 'guntrad') { const bad = guntradProblems(st); if (bad.length) { const e = new GameError(bad[0], 400); e.code = 'floor'; throw e; } }
  return {
    code, name: String(name || 'Blackjack').slice(0, 40), hostId: host.id, hostName: host.name, createdAt: Date.now(),
    status: 'lobby', edgeVer: EDGE_VER, settings: st, rules: st.rules, royal: st.royal,
    limits: { min: st.minBet, max: st.max, royalMax: LIMITS.royalMax },
    turnSec: st.turnSec, maxSeats: st.maxSeats,
    house: st.house === 'guntrad' ? { mode: 'guntrad', id: null, name: 'Guntrad', bank: null, startBank: null, net: 0 }
      : st.house === 'me' ? { mode: 'player', id: host.id, name: host.name, bank: 0, startBank: 0, net: 0 } : { mode: 'player', id: null, name: null, bank: 0, startBank: 0, net: 0 },
    seats: Array(st.maxSeats).fill(null), deck: null, discards: [], shuffles: 0, log: [], seq: 0, roundNo: 0, round: null, last: null,
  };
}
const RULE_TEXT = (r) => [
  r.s17 ? 'Dealer stands on all 17s (S17)' : 'Dealer hits soft 17 (H17)',
  `Blackjack pays ${r.bjPays === 1.5 ? '3:2' : '6:5'}`,
  `Double on ${r.doubleOn === 'any' ? 'any first two cards' : r.doubleOn}${r.das ? ', also after a split' : ', not after a split'}`,
  r.maxHands > 1 ? `Split up to ${r.maxHands} hands${r.resplitAces ? ', aces too' : ''}; split aces ${r.hitSplitAces ? 'may hit' : 'get one card each'}` : 'No splitting',
  r.insurance ? 'Insurance 2:1 when the dealer shows an ace' : 'No insurance',
  r.surrender ? 'Late surrender: give up half after the peek' : 'No surrender',
  'Dealer peeks for blackjack under an ace or ten', 'Single deck; fresh shuffle when fewer than 18 cards are left, announced',
];
export { RULE_TEXT };
export function royalInfo(royal) {
  return Object.fromEntries(Object.entries(royal).map(([k, v]) => [k, { ...v, ...royalEv(k, v) }]));
}

/** v46: the edge report for a live table (house mode from the table itself; pre-v46 tables are grandfathered). */
export const tableEdge = (t) => edgeReport({ house: t.house.mode === 'guntrad' ? 'guntrad' : 'player', rules: t.rules, royal: t.royal }, { grandfathered: (t.edgeVer || 0) < EDGE_VER });

export function viewFor(t, viewerId, now) {
  const r = t.round;
  const mySeat = t.seats.findIndex((s) => s && !s.left && s.id === viewerId);
  const hide = r && !r.holeShown && r.dealer.length >= 2;
  const dealer = r ? r.dealer.map((c, i) => (i === 1 && hide ? null : c)) : [];
  const shownDealer = dealer.filter(Boolean);
  const hands = r ? r.hands.map((h, i) => ({ i, seat: h.seat, cards: h.cards, bet: h.bet, doubled: h.doubled, split: h.split, bust: !!h.bust, bj: !!h.bj, surrendered: !!h.surrendered, done: h.done, total: handValue(h.cards).total, soft: handValue(h.cards).soft })) : [];
  const turnHand = r?.phase === 'play' ? r.hands[r.turn] : null;
  const myTurn = !!(turnHand && turnHand.seat === mySeat && mySeat >= 0 && !turnHand.done);
  return {
    code: t.code, name: t.name, status: t.status, hostId: t.hostId, isHost: t.hostId === viewerId,
    house: { mode: t.house.mode, name: t.house.name, id: t.house.id, bank: t.house.bank, net: t.house.net, isMe: t.house.id === viewerId },
    rules: t.rules, ruleText: RULE_TEXT(t.rules), edge: tableEdge(t), royal: royalInfo(t.royal), limits: { ...t.limits, maxNow: maxBetNow(t) }, turnSec: t.turnSec, maxSeats: t.maxSeats,
    seats: t.seats.map((s, i) => (s && !s.left ? { i, id: s.bot ? null : s.id, name: s.name, bot: !!s.bot, chips: s.chips, me: s.id === viewerId, stats: s.stats } : null)),
    mySeat, deckLeft: t.deck ? t.deck.length : 52, shuffles: t.shuffles,
    round: r ? { no: r.no, phase: r.phase, turn: r.turn, deadline: r.deadline, bets: Object.fromEntries(Object.entries(r.bets).map(([k, b]) => [k, b.out ? { out: true } : { bet: b.bet, side: b.side }])),
      insurance: r.insurance, dealer, dealerTotal: shownDealer.length ? handValue(shownDealer).total : 0, holeShown: !!r.holeShown, hands,
      can: myTurn ? canDo(t, r.hands[r.turn]) : null, myTurn,
      myInsurance: r.phase === 'insurance' && mySeat >= 0 && r.hands.some((h) => h.seat === mySeat) && !(mySeat in r.insurance) } : null,
    last: t.last, final: t.final || null, log: t.log.slice(-60), seq: t.seq, serverNow: now,
  };
}

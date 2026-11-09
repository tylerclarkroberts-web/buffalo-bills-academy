// Pure Texas Hold'em table engine. No I/O: time (ctx.now) and randomness (ctx.rng) are injected.
// Every function mutates the `table` object it is given; the service layer clones before calling,
// so a thrown error never leaves a half-applied change behind.
import { newDeck, shuffle } from './cards.js';
import { bestHand, compareScores } from './evaluator.js';
import { buildPots, splitPot } from './pots.js';
import * as F from './fight.js';
import { pickFatality, pickGag, FINALE_MS } from './fatality.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const DEFAULT_SETTINGS = {
  maxPlayers: 9,          // 2..9 seats
  buyIn: 1000,            // chips per buy-in / rebuy
  smallBlind: 10,
  bigBlind: 20,
  turnSeconds: 24 * 3600, // time limit per action
  maxRebuys: -1,          // -1 = unlimited, 0 = no rebuys, n = at most n rebuys per player
  nextHandDelaySeconds: 5,// pause between hands so everyone can see the result
  skipPreflop: false,     // v42: blinds are posted as dead money and the hand starts at the flop
  autoCheck: false,       // v42/v43: the default for each player's per-hand "Check if free" box (on = starts ticked)
};

const MAX_LOG = 300;
export const AWAY_AFTER_TIMEOUTS = 2; // consecutive missed turns before a player is automatically sat out
// Tyler: "AFK for more than 3 turns: boot them". Read as: removed right after their 3rd missed turn in a row.
// A missed turn = their 24h clock ran out (auto-check, else auto-fold), or a hand was dealt without them because
// they were sitting out. Any real action resets the streak. Removal uses the same path as Leave table (no ban).
export const AFK_BOOT_AFTER = 3;

export function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS };
  const int = (v, min, max, name) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new GameError(`${name} must be a whole number from ${min} to ${max}`);
    return n;
  };
  const pick = (key, min, max, label) => { const v = int(input[key], min, max, label); if (v !== undefined) s[key] = v; };
  pick('maxPlayers', 2, 9, 'Seats');
  pick('buyIn', 1, 1e9, 'Buy-in');
  pick('bigBlind', 1, 1e8, 'Big blind');
  if (input.smallBlind === undefined && input.bigBlind !== undefined) s.smallBlind = Math.max(1, Math.floor(s.bigBlind / 2));
  pick('smallBlind', 1, 1e8, 'Small blind');
  pick('turnSeconds', 2, 7 * 24 * 3600, 'Turn time (seconds)');
  pick('maxRebuys', -1, 1000, 'Max rebuys');
  pick('nextHandDelaySeconds', 0, 3600, 'Pause between hands');
  for (const k of ['skipPreflop', 'autoCheck']) if (input[k] !== undefined) s[k] = input[k] === true || input[k] === 'true' || input[k] === 1;
  if (s.smallBlind > s.bigBlind) throw new GameError('Small blind cannot be bigger than the big blind');
  if (s.bigBlind > s.buyIn) throw new GameError('Big blind cannot be bigger than the buy-in');
  return s;
}

// ---------- helpers ----------
const n = (t) => t.settings.maxPlayers;
function log(t, ctx, text, ev) {
  // v43: every entry gets a sequence number; game moves also carry a structured, public-only event (ev) that the
  // client replays as animation. ev never holds hole cards except at showdown, where the text already shows them.
  if (!Number.isInteger(t.seq)) t.seq = t.log.length;
  t.seq += 1;
  const e = { t: ctx.now, hand: t.handNumber, seq: t.seq, text };
  if (ev) e.ev = ev;
  t.log.push(e);
  if (t.log.length > MAX_LOG) t.log.splice(0, t.log.length - MAX_LOG);
}
/** Keep successful cosmetic uses beside public poker actions, without copying inventory or private cards. */
export function recordTableMoment(t, kind, moment, ctx) {
  if (kind !== 'gag' && kind !== 'smoke') throw new GameError('Unknown table moment');
  const seat = seatOf(t, moment.from);
  const fromName = t.seats[seat]?.name || moment.fromName;
  const ev = { k: kind, id: moment.id, from: moment.from, fromName, seat, item: moment.item, name: moment.name, emoji: moment.emoji };
  if (kind === 'gag') {
    const targetSeat = seatOf(t, moment.to);
    const toName = t.seats[targetSeat]?.name || t.ledger[moment.to]?.name || 'a player';
    Object.assign(ev, { to: moment.to, toName, targetSeat, effect: moment.effect, pix: moment.pix });
    log(t, ctx, `${fromName} used ${moment.name} on ${toName}`, ev);
  } else {
    Object.assign(ev, { art: moment.art, at: moment.at });
    log(t, ctx, `${fromName} lit up a ${moment.name}`, ev);
  }
}
function seatOf(t, playerId) { return t.seats.findIndex((s) => s && s.playerId === playerId); }
function requireSeat(t, playerId) {
  const i = seatOf(t, playerId);
  if (i < 0) throw new GameError('You are not seated at this table', 403);
  return i;
}
/** Next seat index after `from` (exclusive), wrapping, that satisfies pred. null if none. */
function nextSeat(t, from, pred) {
  for (let k = 1; k <= n(t); k++) {
    const i = (from + k) % n(t);
    if (pred(i)) return i;
  }
  return null;
}
function ledger(t, seat) {
  return (t.ledger[seat.playerId] ||= { name: seat.name, buyIn: 0, cashOut: 0 });
}
export function eligibleForHand(t, i) {
  const s = t.seats[i];
  return !!s && !s.sittingOut && !s.leaving && s.stack > 0;
}
// v38 bot tables: bots only play while at least one person can be dealt in, so they never play on alone
export function humanReady(t) {
  return !t.bots || t.seats.some((s, i) => s && !s.bot && eligibleForHand(t, i));
}
// dead money (a lost Guntrad fight) sits in the pot without belonging to anyone's bet
const potTotal = (h) => h.players.reduce((a, p) => a + (p ? p.total : 0), 0) + (h.dead || 0) + (h.blindPot || 0);
/** v42 skip-preflop: what a seat posted as blinds (dead money, not part of their bet). */
const blindOf = (h, i) => (h && h.blinds ? h.blinds[i] || 0 : 0);

// ---------- table lifecycle ----------
export function createTable({ id, code, name, host, settings }, ctx) {
  const s = normalizeSettings(settings);
  const t = {
    id, code, name: (name || 'Poker night').slice(0, 40), hostId: host.id,
    settings: s, status: 'lobby', createdAt: ctx.now, version: 0,
    seats: Array(s.maxPlayers).fill(null), buttonSeat: null, handNumber: 0,
    hand: null, lastHand: null, nextHandAt: null, ledger: {}, log: [],
  };
  log(t, ctx, `${host.name} created the table`);
  joinTable(t, host, undefined, ctx);
  return t;
}

export function joinTable(t, player, wantSeat, ctx) {
  if (t.status === 'closed') throw new GameError('This table is closed');
  const existing = seatOf(t, player.id);
  if (existing >= 0) {
    const s = t.seats[existing];
    if (s.leaving) { s.leaving = false; s.afkBoot = false; log(t, ctx, `${s.name} is staying`); } // back before the hand ended: no boot
    s.timeouts = 0;
    return existing;
  }
  let seat;
  if (wantSeat !== undefined && wantSeat !== null) {
    seat = Number(wantSeat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= n(t)) throw new GameError('Invalid seat');
    if (t.seats[seat]) throw new GameError('That seat is taken');
  } else {
    seat = t.seats.findIndex((s) => !s);
    if (seat < 0) throw new GameError('The table is full');
  }
  t.seats[seat] = {
    playerId: player.id, name: player.name, stack: t.settings.buyIn, rebuys: 0,
    sittingOut: false, leaving: false, waiting: !!t.hand, timeouts: 0, joinedAt: ctx.now,
  };
  if (t.afkMoved?.[player.id]) delete t.afkMoved[player.id];
  const l = ledger(t, t.seats[seat]);
  l.name = player.name;
  l.buyIn += t.settings.buyIn;
  log(t, ctx, `${player.name} joined with ${t.settings.buyIn} chips${t.hand ? ' (plays from the next hand)' : ''}`);
  maybeScheduleHand(t, ctx);
  return seat;
}

export function updateSettings(t, playerId, input, ctx) {
  if (playerId !== t.hostId) throw new GameError('Only the host can change table options', 403);
  if (t.status === 'closed') throw new GameError('This table is closed');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameError('Send table options as an object');
  const keys = Object.keys(input);
  if (!keys.length || keys.some((k) => !['autoCheck', 'skipPreflop'].includes(k) || typeof input[k] !== 'boolean')) {
    throw new GameError('Only autoCheck and skipPreflop boolean options can be changed');
  }
  const changed = keys.filter((k) => !!t.settings[k] !== input[k]);
  if (!changed.length) return false;
  for (const k of changed) t.settings[k] = input[k];
  const labels = { autoCheck: 'auto-check when free', skipPreflop: 'skip first betting round' };
  log(t, ctx, `The host changed table options: ${changed.map((k) => `${labels[k]} ${input[k] ? 'on' : 'off'}`).join('; ')} (applies next hand)`);
  return true;
}

export function startGame(t, playerId, ctx) {
  if (playerId !== t.hostId) throw new GameError('Only the host can start the game', 403);
  if (t.status !== 'lobby') throw new GameError('The game has already started');
  const ready = t.seats.filter((_, i) => eligibleForHand(t, i)).length;
  if (ready < 2) throw new GameError('You need at least 2 players to start');
  if (!humanReady(t)) throw new GameError('Sit in first: the bots only play with you');
  t.status = 'playing';
  log(t, ctx, 'The host started the game');
  startHand(t, ctx);
}

/** If the table is idle between hands and 2+ players can play, schedule the next hand. */
function maybeScheduleHand(t, ctx) {
  if (t.status === 'playing' && !t.hand && !t.nextHandAt) {
    const ready = t.seats.filter((_, i) => eligibleForHand(t, i)).length;
    if (ready >= 2 && humanReady(t)) t.nextHandAt = ctx.now + t.settings.nextHandDelaySeconds * 1000;
  }
  armAwayClock(t, ctx);
}
// If the game is stalled (no hand can be dealt) while someone sits out, no hands are dealt for them to miss.
// So while it's stalled, each full turn clock that passes counts as a missed turn for every sitting-out player.
function armAwayClock(t, ctx) {
  const stalled = t.status === 'playing' && !t.hand && !t.nextHandAt && t.seats.some((s) => s && s.sittingOut && !s.leaving);
  if (!stalled) t.awayClockAt = null;
  else if (!t.awayClockAt) t.awayClockAt = ctx.now + t.settings.turnSeconds * 1000;
}

export function startHand(t, ctx) {
  if (t.status !== 'playing') throw new GameError('Game is not running');
  if (t.hand) throw new GameError('A hand is already in progress');
  t.nextHandAt = null;
  for (const s of t.seats) if (s) s.waiting = false;
  const eligible = t.seats.map((_, i) => i).filter((i) => eligibleForHand(t, i));
  if (eligible.length < 2 || !humanReady(t)) {
    log(t, ctx, eligible.length >= 2 ? 'The bots are waiting for you (sit back in or rebuy)' : 'Waiting for at least 2 players with chips (rebuy, sit back in, or invite friends)');
    armAwayClock(t, ctx);
    return false;
  }
  t.awayClockAt = null;
  // a hand dealt without a sitting-out player is a missed turn for them; the AFK_BOOT_AFTER-th frees their seat
  t.seats.forEach((s, i) => {
    if (!s || !s.sittingOut || s.leaving) return;
    s.timeouts = (s.timeouts || 0) + 1;
    if (s.timeouts >= AFK_BOOT_AFTER) { s.afkBoot = true; removeSeat(t, i, ctx); }
  });
  const isEl = (i) => eligible.includes(i);
  t.buttonSeat = t.buttonSeat === null ? eligible[(ctx.rng ? ctx.rng(eligible.length) : 0)] : nextSeat(t, t.buttonSeat, isEl);
  let sbSeat, bbSeat;
  if (eligible.length === 2) { // heads-up: the button posts the small blind and acts first preflop
    sbSeat = t.buttonSeat; bbSeat = nextSeat(t, sbSeat, isEl);
  } else {
    sbSeat = nextSeat(t, t.buttonSeat, isEl); bbSeat = nextSeat(t, sbSeat, isEl);
  }
  t.handNumber += 1;
  const deck = ctx.deck ? ctx.deck.slice() : shuffle(newDeck(), ctx.rng);
  const h = {
    number: t.handNumber, deck, board: [], street: 'preflop', buttonSeat: t.buttonSeat, sbSeat, bbSeat,
    currentBet: 0, minRaise: t.settings.bigBlind, toAct: null, deadline: null, startedAt: ctx.now,
    players: Array(n(t)).fill(null),
  };
  t.hand = h;
  for (const i of eligible) {
    const s = t.seats[i];
    h.players[i] = { playerId: s.playerId, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, lastLevel: null, startStack: s.stack, autoCheck: !s.bot && (s.nextAutoCheck ?? !!t.settings.autoCheck) };
    delete s.nextAutoCheck;
  }
  // deal two cards each, one at a time, starting left of the button
  for (let round = 0; round < 2; round++) {
    let i = t.buttonSeat;
    for (let k = 0; k < eligible.length; k++) { i = nextSeat(t, i, isEl); h.players[i].hole.push(h.deck.pop()); }
  }
  log(t, ctx, `--- Hand #${h.number} --- ${t.seats[t.buttonSeat].name} has the button`, { k: 'hand', button: t.buttonSeat });
  post(t, sbSeat, t.settings.smallBlind, 'small blind', ctx);
  post(t, bbSeat, t.settings.bigBlind, 'big blind', ctx);
  h.currentBet = t.settings.bigBlind;
  h.minRaise = t.settings.bigBlind;
  offerFight(t, bbSeat, ctx);
  if (t.settings.skipPreflop) {
    // v42: no preflop betting. The blinds become dead money anyone still in can win; the flop comes right away
    // and the flop round starts left of the button as usual (heads-up: the big blind acts first).
    h.blinds = {}; h.blindPot = 0; h.skipped = true;
    for (const i of [sbSeat, bbSeat]) { const p = h.players[i]; h.blinds[i] = (h.blinds[i] || 0) + p.total; h.blindPot += p.total; p.total = 0; p.bet = 0; }
    log(t, ctx, 'No preflop betting at this table: straight to the flop');
    return endStreet(t, ctx), true;
  }
  advance(t, bbSeat, ctx);
  return true;
}

function post(t, seat, amount, label, ctx) {
  const s = t.seats[seat]; const p = t.hand.players[seat];
  const a = Math.min(amount, s.stack);
  s.stack -= a; p.bet += a; p.total += a;
  if (s.stack === 0) p.allIn = true;
  log(t, ctx, `${s.name} posts ${label} ${a}${p.allIn ? ' (all-in)' : ''}`, { k: 'act', seat, a: 'post', amt: a, allIn: p.allIn, pot: potTotal(t.hand) });
}

function liveSeats(h) { return h.players.map((p, i) => (p && !p.folded ? i : -1)).filter((i) => i >= 0); }
function canBetSeats(h) { return liveSeats(h).filter((i) => !h.players[i].allIn); }

function needsAction(t, i) {
  const h = t.hand; const p = h.players[i];
  if (!p || p.folded || p.allIn) return false;
  const others = canBetSeats(h).filter((j) => j !== i);
  if (p.bet < h.currentBet) return true;
  if (others.length === 0) return false; // everyone else is all-in and the bet is matched
  return !p.acted;
}

export function turnSummary(t, playerId) {
  const turn = { actorName: null, deadline: null, ahead: null, state: null };
  if (t.status !== 'playing') return turn;
  const h = t.hand; const seat = seatOf(t, playerId); const s = t.seats[seat]; const p = h?.players[seat];
  const current = Number.isInteger(h?.toAct) ? t.seats[h.toAct] : null;
  const actor = current && !current.sittingOut && !current.leaving && needsAction(t, h.toAct) ? current : null;
  if (actor) { turn.actorName = actor.name; turn.deadline = h.deadline; }
  if (!s) turn.state = 'not-seated';
  else if (s.leaving) turn.state = 'leaving';
  else if (s.sittingOut) turn.state = 'sitting-out';
  else if (p?.folded) turn.state = 'folded';
  else if (p?.allIn) turn.state = 'all-in';
  else if (s.stack === 0) turn.state = 'out-of-chips';
  else if (!h) turn.state = 'between-hands';
  else if (!p) turn.state = 'next-hand';
  else turn.state = needsAction(t, seat) ? 'pending' : 'acted';
  if (turn.state === 'pending' && actor) {
    turn.ahead = 0;
    // Count this round's public pending actions, never another player's private auto-check choice.
    for (let i = h.toAct; i !== seat; i = (i + 1) % n(t)) {
      if (needsAction(t, i) && !t.seats[i]?.sittingOut && !t.seats[i]?.leaving) turn.ahead++;
    }
  }
  return turn;
}

/** Move the turn to the next player after `from`, or end the street / hand. */
function advance(t, from, ctx) {
  const h = t.hand;
  if (liveSeats(h).length === 1) return finishUncontested(t, ctx);
  const next = nextSeat(t, from, (i) => needsAction(t, i));
  if (next !== null) return setTurn(t, next, ctx);
  return endStreet(t, ctx);
}

function setTurn(t, seat, ctx) {
  const h = t.hand;
  h.toAct = seat;
  h.deadline = ctx.now + t.settings.turnSeconds * 1000;
  const s = t.seats[seat];
  if (s.say) delete s.say; // a speech bubble lasts until its owner's next turn begins
  if (s.sittingOut || s.leaving) return autoAct(t, seat, ctx, 'is away'); // don't make everyone wait for an absent player
  // v42 auto-check: a free check is taken for the player (bots decide for themselves; a player can opt out)
  if (!s.bot && h.players[seat].autoCheck && h.currentBet - h.players[seat].bet <= 0) applyAction(t, seat, { type: 'check' }, ctx, ' (auto-check)');
}
/** v43: a player's per-hand "Check if free" box (private: not logged, not shown to others). Resets every hand to the
 *  table default. Ticking it on your own free turn checks right away. */
export function setAutoCheck(t, playerId, on, ctx) {
  const i = requireSeat(t, playerId); const s = t.seats[i];
  const h = t.hand; const p = h?.players[i];
  if (!p) { s.nextAutoCheck = !!on; return; } // between hands (or waiting to be dealt in): applies to your next hand only
  if (p.folded) throw new GameError("You're not in this hand");
  p.autoCheck = !!on;
  if (on && h.toAct === i && h.currentBet - p.bet <= 0) { s.timeouts = 0; applyAction(t, i, { type: 'check' }, ctx, ' (auto-check)'); }
}

function endStreet(t, ctx) {
  const h = t.hand;
  for (const p of h.players) if (p) { p.bet = 0; p.acted = false; p.lastLevel = null; }
  h.currentBet = 0; h.minRaise = t.settings.bigBlind; h.toAct = null; h.deadline = null;
  const order = ['preflop', 'flop', 'turn', 'river'];
  const runOut = canBetSeats(h).length <= 1;
  while (true) {
    const idx = order.indexOf(h.street);
    if (h.street === 'river') return showdown(t, ctx);
    h.street = order[idx + 1];
    h.deck.pop(); // burn
    const count = h.street === 'flop' ? 3 : 1;
    for (let k = 0; k < count; k++) h.board.push(h.deck.pop());
    log(t, ctx, `${h.street[0].toUpperCase() + h.street.slice(1)}: ${h.board.join(' ')}`, { k: 'deal', street: h.street, cards: h.board.slice(-count), board: h.board.length, pot: potTotal(h) });
    if (!runOut) break;
  }
  const first = nextSeat(t, h.buttonSeat, (i) => needsAction(t, i));
  if (first === null) return endStreet(t, ctx);
  setTurn(t, first, ctx);
}

// ---------- actions ----------
/** What the player to act may do right now. */
export function legalActions(t, seat) {
  const h = t.hand;
  if (!h || h.toAct !== seat) return null;
  const p = h.players[seat]; const s = t.seats[seat];
  const toCall = Math.min(h.currentBet - p.bet, s.stack);
  const maxTo = p.bet + s.stack;
  const othersCanRespond = canBetSeats(h).some((j) => j !== seat);
  const raiseRightsOpen = p.lastLevel === null || h.currentBet - p.lastLevel >= h.minRaise;
  const canRaise = othersCanRespond && raiseRightsOpen && maxTo > h.currentBet;
  const fullMin = h.currentBet + h.minRaise;
  return {
    canCheck: toCall === 0,
    toCall,
    canRaise,
    isBet: h.currentBet === 0,
    minRaiseTo: canRaise ? Math.min(fullMin, maxTo) : null,
    maxRaiseTo: canRaise ? maxTo : null,
    stack: s.stack,
    currentBet: h.currentBet,
    myBet: p.bet,
  };
}

export function act(t, playerId, action, ctx) {
  const h = t.hand;
  if (!h) throw new GameError('No hand in progress');
  const seat = requireSeat(t, playerId);
  if (h.toAct !== seat) throw new GameError("It's not your turn");
  if (action?.handNumber !== undefined && Number(action.handNumber) !== h.number) throw new GameError('That hand is over');
  t.seats[seat].timeouts = 0;
  applyAction(t, seat, action, ctx);
}

function applyAction(t, seat, action, ctx, note = '') {
  const h = t.hand; const p = h.players[seat]; const s = t.seats[seat];
  const L = legalActions(t, seat);
  const type = action?.type;
  const st0 = s.stack;
  const say = (txt) => log(t, ctx, `${s.name} ${txt}${note}`, { k: 'act', seat, a: type === 'allin' || p.allIn ? (st0 - s.stack > 0 ? 'allin' : type) : type, amt: st0 - s.stack, to: p.bet, allIn: p.allIn, auto: /auto-check/.test(note) || undefined, pot: potTotal(h) });
  if (h.fightOffer?.status === 'open' && h.fightOffer.seat === seat) h.fightOffer.status = 'expired'; // acting passes on the fight
  if (type === 'fold') {
    p.folded = true; say('folds');
  } else if (type === 'check') {
    if (!L.canCheck) throw new GameError(`You can't check; it's ${L.toCall} to call`);
    say('checks');
  } else if (type === 'call') {
    if (L.canCheck) throw new GameError('Nothing to call; check instead');
    move(s, p, L.toCall);
    if (s.stack === 0) p.allIn = true;
    say(`calls ${L.toCall}${p.allIn ? ' (all-in)' : ''}`);
  } else if (type === 'raise' || type === 'bet' || type === 'allin') {
    let to = type === 'allin' ? L.myBet + L.stack : Number(action.amount);
    if (type === 'allin' && to <= h.currentBet) return applyAction(t, seat, { type: 'call' }, ctx, note);
    if (!L.canRaise) throw new GameError(L.toCall > 0 ? 'You can only call or fold here' : 'You can only check or fold here');
    if (!Number.isInteger(to)) throw new GameError('Raise amount must be a whole number of chips');
    if (to > L.maxRaiseTo) throw new GameError(`You only have enough to go to ${L.maxRaiseTo}`);
    if (to < L.minRaiseTo) throw new GameError(`Minimum ${L.isBet ? 'bet' : 'raise'} is to ${L.minRaiseTo}`);
    const increment = to - h.currentBet;
    const full = increment >= h.minRaise;
    if (!full && to !== L.maxRaiseTo) throw new GameError(`Minimum ${L.isBet ? 'bet' : 'raise'} is to ${h.currentBet + h.minRaise}`);
    move(s, p, to - p.bet);
    if (s.stack === 0) p.allIn = true;
    const wasBet = h.currentBet === 0;
    if (full) h.minRaise = increment; // a short all-in does not change the minimum raise or reopen betting
    h.currentBet = to;
    h.agg = { seat, street: h.street }; // v49: the last aggressor shows first at showdown
    say(`${wasBet ? 'bets' : 'raises to'} ${to}${p.allIn ? ' (all-in)' : ''}`);
  } else {
    throw new GameError('Unknown action');
  }
  p.acted = true;
  p.lastLevel = h.currentBet;
  h.actStreet = h.street;
  advance(t, seat, ctx);
}

function move(s, p, amount) { s.stack -= amount; p.bet += amount; p.total += amount; }

/** Auto-action for an absent or timed-out player: check if free, otherwise fold. */
function autoAct(t, seat, ctx, why) {
  const L = legalActions(t, seat);
  applyAction(t, seat, { type: L.canCheck ? 'check' : 'fold' }, ctx, ` (${why})`);
}

/** Server timer hook: apply the timeout rule if the current player's deadline has passed. Returns true if anything changed. */
export function tick(t, ctx) {
  if (t.status !== 'playing') return false;
  if (t.fight?.status === 'running' && t.fight.expiresAt <= ctx.now) { settleFight(t, 'lose', 'ran out of time', ctx); return true; }
  const h = t.hand;
  if (h && h.toAct !== null && h.deadline !== null && h.deadline <= ctx.now) {
    const seat = h.toAct; const s = t.seats[seat];
    s.timeouts = (s.timeouts || 0) + 1;
    if (s.timeouts >= AFK_BOOT_AFTER) { // fold (committed chips stay in the pot); the rest is cashed out when the hand ends
      s.leaving = true; s.afkBoot = true;
      applyAction(t, seat, { type: 'fold' }, ctx, ' (ran out of time)');
      return true;
    }
    if (s.timeouts >= AWAY_AFTER_TIMEOUTS && !s.sittingOut) {
      s.sittingOut = true;
      log(t, ctx, `${s.name} missed ${s.timeouts} turns in a row and is now sitting out`);
    }
    autoAct(t, seat, ctx, 'ran out of time');
    return true;
  }
  if (!h && t.nextHandAt !== null && t.nextHandAt <= ctx.now) { startHand(t, ctx); return true; }
  if (!h && t.awayClockAt && t.awayClockAt <= ctx.now) {
    t.awayClockAt = null;
    t.seats.forEach((s, i) => {
      if (!s || !s.sittingOut || s.leaving) return;
      s.timeouts = (s.timeouts || 0) + 1;
      if (s.timeouts >= AFK_BOOT_AFTER) { s.afkBoot = true; removeSeat(t, i, ctx); }
    });
    maybeScheduleHand(t, ctx);
    return true;
  }
  return false;
}

/** When the server should next call tick() for this table (ms epoch), or null. */
export function nextWakeAt(t) {
  if (t.status !== 'playing') return null;
  const idle = [t.nextHandAt, t.awayClockAt].filter((x) => x);
  const w = t.hand ? t.hand.deadline : idle.length ? Math.min(...idle) : null;
  const f = t.fight?.status === 'running' ? t.fight.expiresAt : null;
  return f !== null && (w === null || f < w) ? f : w;
}

// ---------- end of hand ----------
function finishUncontested(t, ctx) {
  const h = t.hand;
  const [w] = liveSeats(h);
  const amount = potTotal(h);
  t.seats[w].stack += amount;
  log(t, ctx, `${t.seats[w].name} wins ${amount} (everyone else folded)`, { k: 'win', wins: [{ seat: w, amt: amount }] });
  const hole = h.players[w].hole.slice();
  const fold = { number: h.number, kind: 'fold', endedAt: ctx.now, winner: { seat: w, playerId: h.players[w].playerId, name: t.seats[w].name }, amount }; // v49: no cards
  wrapUp(t, ctx, { winners: [{ seat: w, playerId: h.players[w].playerId, name: t.seats[w].name, amount, hand: null }], shown: {}, pots: [{ amount, winners: [w] }] });
  // Won without a showdown: the cards stay hidden unless the winner chooses to show them (showCards).
  // Kept off lastHand so they are never sent to anyone until then.
  t.lastShowdown = fold;
  t.muck = { number: t.lastHand.number, seat: w, playerId: t.lastHand.winners[0].playerId, cards: hole, shown: [] };
}

/** The winner of an uncontested hand may show one or both hole cards, any time until the next hand ends. */
/** v49: a player watched (or skipped) the last showdown; it won't auto-play for them again. */
export function markShowdownSeen(t, playerId, number) {
  if (!t.lastShowdown) return t;
  t.showdownSeen = { ...(t.showdownSeen || {}), [playerId]: Math.min(Number(number) || 0, t.lastShowdown.number) };
  return t;
}

export function showCards(t, playerId, which, ctx) {
  const m = t.muck;
  if (!m || !t.lastHand || t.lastHand.number !== m.number) throw new GameError('There are no cards to show');
  if (m.playerId !== playerId) throw new GameError('Only the winner can show their cards');
  const pick = which === 'both' || which === undefined ? [0, 1] : [0, 1].includes(Number(which)) && which !== null && which !== '' ? [Number(which)] : null;
  if (!pick) throw new GameError('Choose which card to show');
  m.shown = [...new Set([...m.shown, ...pick])].sort();
  const cards = m.shown.map((i) => m.cards[i]);
  const name = t.lastHand.winners[0].name;
  t.lastHand.shown = { ...(t.lastHand.shown || {}), [m.seat]: { name, cards, hand: null, voluntary: true } };
  log(t, ctx, `${name} shows ${pick.map((i) => m.cards[i]).join(' ')} from hand #${m.number} (didn't have to)`);
  if (m.shown.length === 2) t.muck = null;
  return t;
}

function showdown(t, ctx) {
  const h = t.hand;
  h.street = 'showdown';
  const live = liveSeats(h);
  const evals = {};
  for (const i of live) evals[i] = bestHand([...h.players[i].hole, ...h.board]);
  const contributions = h.players.map((p, i) => (p ? { seat: i, amount: p.total, folded: p.folded } : null)).filter(Boolean);
  const pots = buildPots(contributions);
  const dead = (h.dead || 0) + (h.blindPot || 0); // dead money (a lost fight; v42 skipped-preflop blinds): everyone still in can win it
  if (dead) {
    const same = pots[0] && pots[0].eligible.length === live.length && live.every((i) => pots[0].eligible.includes(i));
    if (same) pots[0].amount += dead; else pots.unshift({ amount: dead, eligible: live.slice() });
  }
  const won = {}; const potResults = []; const potSplits = [];
  pots.forEach((pot, idx) => {
    let best = null; let winners = [];
    for (const i of pot.eligible) {
      const c = best ? compareScores(evals[i].score, best) : 1;
      if (c > 0) { best = evals[i].score; winners = [i]; } else if (c === 0) winners.push(i);
    }
    const split = splitPot(pot.amount, winners, h.buttonSeat, n(t));
    for (const [seat, amt] of Object.entries(split)) won[seat] = (won[seat] || 0) + amt;
    potResults.push({ amount: pot.amount, winners, uncalled: pot.eligible.length === 1 });
    potSplits.push({ label: pot.eligible.length === 1 ? 'Uncalled bet' : idx === 0 ? 'Main pot' : `Side pot ${idx}`, amount: pot.amount, uncalled: pot.eligible.length === 1, winners: winners.map((w) => ({ seat: w, amount: split[w] })) });
    const label = pot.eligible.length === 1 ? 'Uncalled bet returned to' : idx === 0 ? 'Main pot' : `Side pot ${idx}`;
    if (pot.eligible.length === 1) log(t, ctx, `${label} ${t.seats[winners[0]].name}: ${pot.amount}`);
    else log(t, ctx, `${label} (${pot.amount}): ${winners.map((w) => `${t.seats[w].name} wins ${split[w]} with ${evals[w].name}`).join('; ')}`);
  });
  for (const [seat, amt] of Object.entries(won)) t.seats[seat].stack += amt;
  log(t, ctx, 'Pot pushed', { k: 'win', wins: Object.entries(won).map(([seat, amt]) => ({ seat: +seat, amt })), showdown: true });
  t.lastShowdown = showdownRecord(t, h, live, evals, potSplits, ctx);
  const shown = {};
  for (const i of live) shown[i] = { name: t.seats[i].name, cards: h.players[i].hole, hand: evals[i].name, best: evals[i].cards };
  for (const i of live) log(t, ctx, `${t.seats[i].name} shows ${h.players[i].hole.join(' ')} (${evals[i].name})`);
  wrapUp(t, ctx, {
    winners: Object.entries(won).map(([seat, amount]) => ({ seat: +seat, playerId: h.players[seat].playerId, name: t.seats[seat].name, amount, hand: evals[seat].name })),
    shown, pots: potResults,
    // all-in players who won nothing at showdown (the table's "busted" bit plays for each of them)
    allInLosers: live.filter((i) => h.players[i].allIn && !won[i]).map((i) => ({ seat: i, playerId: h.players[i].playerId, name: t.seats[i].name })),
  });
}

/**
 * v49: the showdown record every seated player replays. Only seats that reached showdown are in it (folded hands are
 * never stored or sent). Order: the last aggressor of the final betting round shows first, else the first live seat
 * left of the button; then clockwise.
 */
export function showdownRecord(t, h, live, evals, pots, ctx) {
  const N = t.seats.length; const clockwise = (from) => [...Array(N).keys()].map((k) => (from + k) % N).filter((i) => live.includes(i));
  const agg = h.agg && h.agg.street === h.actStreet && live.includes(h.agg.seat) ? h.agg.seat : null;
  const order = clockwise(agg ?? (h.buttonSeat + 1) % N);
  const nm = (i) => t.seats[i]?.name || h.players[i]?.name || `Seat ${i + 1}`;
  return {
    number: h.number, kind: 'showdown', endedAt: ctx.now, board: h.board.slice(), order, firstBy: agg !== null ? 'aggressor' : 'button',
    reveals: order.map((i) => ({ seat: i, playerId: h.players[i].playerId, name: nm(i), cards: h.players[i].hole.slice(), hand: evals[i].name, best: evals[i].cards.slice() })),
    pots: pots.map((p) => ({ ...p, winners: p.winners.map((w) => ({ ...w, name: nm(w.seat), playerId: h.players[w.seat].playerId, hand: evals[w.seat].name, best: evals[w.seat].cards.slice() })) })),
  };
}

function wrapUp(t, ctx, result) {
  const h = t.hand;
  t.muck = null; // a new result: last hand's hidden cards can no longer be shown
  t.lastHand = { number: h.number, board: h.board.slice(), buttonSeat: h.buttonSeat, endedAt: ctx.now, ...result };
  t.hand = null;
  // players who asked to leave (or were removed) cash out now
  t.seats.forEach((s, i) => {
    if (s && s.leaving) removeSeat(t, i, ctx);
    else if (s && s.stack === 0) log(t, ctx, `${s.name} is out of chips${canRebuy(t, s) ? ' (can rebuy)' : ''}`);
  });
  maybeScheduleHand(t, ctx);
  if (!t.nextHandAt && t.status === 'playing') log(t, ctx, 'Waiting for at least 2 players with chips (rebuy, sit back in, or invite friends)');
}

function removeSeat(t, i, ctx) {
  const s = t.seats[i];
  ledger(t, s).cashOut += s.stack;
  if (s.afkBoot && t.status !== 'closed') {
    log(t, ctx, `${s.name} was away for ${AFK_BOOT_AFTER} turns and left the table with ${s.stack} chips (the seat is open; they can rejoin any time)`);
    (t.afkMoved ||= {})[s.playerId] = { at: ctx.now, turns: AFK_BOOT_AFTER, chips: s.stack };
  } else log(t, ctx, `${s.name} left the table with ${s.stack} chips`);
  t.seats[i] = null;
}

function inLiveHand(t, seat) {
  const p = t.hand?.players[seat];
  return !!p && !p.folded;
}

// ---------- chips & seating ----------
function canRebuy(t, s) {
  const m = t.settings.maxRebuys;
  return m !== 0 && (m < 0 || s.rebuys < m);
}

export function rebuy(t, playerId, ctx) {
  if (t.status === 'closed') throw new GameError('This table is closed');
  const i = requireSeat(t, playerId); const s = t.seats[i];
  if (t.settings.maxRebuys === 0) throw new GameError('Rebuys are turned off at this table');
  if (!canRebuy(t, s)) throw new GameError(`You've used all ${t.settings.maxRebuys} rebuys`);
  if (inLiveHand(t, i)) throw new GameError('You can rebuy after this hand (or once you fold)');
  if (s.stack >= t.settings.buyIn) throw new GameError(`You can rebuy when you have fewer than ${t.settings.buyIn} chips`);
  s.stack += t.settings.buyIn; s.rebuys += 1; s.timeouts = 0;
  ledger(t, s).buyIn += t.settings.buyIn;
  log(t, ctx, `${s.name} rebought for ${t.settings.buyIn} (now ${s.stack})`);
  maybeScheduleHand(t, ctx);
}

export function setSittingOut(t, playerId, sitOut, ctx) {
  const i = requireSeat(t, playerId); const s = t.seats[i];
  s.sittingOut = !!sitOut;
  s.timeouts = 0; // pressing sit out / sit in is a real action
  if (!sitOut && s.afkBoot && s.leaving) { s.afkBoot = false; s.leaving = false; log(t, ctx, `${s.name} is back and keeps the seat`); }
  else log(t, ctx, sitOut ? `${s.name} is sitting out` : `${s.name} is back`);
  if (sitOut && t.hand?.toAct === i) autoAct(t, i, ctx, 'is away');
  maybeScheduleHand(t, ctx);
}

export function leaveTable(t, playerId, ctx) {
  const i = requireSeat(t, playerId);
  if (t.hand?.players[i]) {
    t.seats[i].leaving = true;
    log(t, ctx, `${t.seats[i].name} will leave after this hand`);
    if (t.hand.toAct === i) autoAct(t, i, ctx, 'is leaving');
  } else {
    removeSeat(t, i, ctx);
  }
}


export function closeTable(t, hostId, ctx) {
  if (hostId !== t.hostId) throw new GameError('Only the host can close the table', 403);
  if (t.status === 'closed') return;
  if (t.hand) { // abandon the hand: everyone gets back what they put in
    t.hand.players.forEach((p, i) => { if (p) t.seats[i].stack += p.total + blindOf(t.hand, i); });
    if (t.hand.dead) { const i = seatOf(t, t.hand.deadBy); if (i >= 0) t.seats[i].stack += t.hand.dead; else if (t.ledger[t.hand.deadBy]) t.ledger[t.hand.deadBy].cashOut += t.hand.dead; }
    log(t, ctx, `Hand #${t.hand.number} was cancelled and bets were returned`);
    t.hand = null;
  }
  if (t.fight?.status === 'running') { t.fight.status = 'cancelled'; t.fight.endedAt = ctx.now; }
  t.status = 'closed'; t.nextHandAt = null;
  t.seats.forEach((s, i) => { if (s) removeSeat(t, i, ctx); });
  log(t, ctx, 'The host closed the table');
}

// ---------- accounting ----------
/** Chips currently on the table (stacks + chips in the pot). */
// ---------- speech bubbles ----------
export const SAY_MAX = 80;
/** Clean a bubble: no tags, no control characters, single spaces, at most SAY_MAX characters. */
export function cleanSay(text) {
  let x = String(text ?? '').normalize('NFC');
  x = x.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '');
  x = x.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ');
  x = x.replace(/\s+/g, ' ').trim();
  const chars = Array.from(x);
  if (chars.length > SAY_MAX) throw new GameError(`Keep it to ${SAY_MAX} characters`);
  return x;
}
/** Set (or with empty text, clear) your own bubble. Only a seated player, only their own seat. */
export function setSay(t, playerId, text, ctx) {
  if (t.status === 'closed') throw new GameError('This table is closed');
  const i = seatOf(t, playerId);
  if (i < 0) throw new GameError('Take a seat to talk at this table', 403);
  const clean = cleanSay(text);
  if (clean && clean !== t.seats[i].say?.text) log(t, ctx, `${t.seats[i].name}: ${clean}`, { k: 'say', from: playerId, fromName: t.seats[i].name, seat: i, text: clean });
  if (clean) t.seats[i].say = { text: clean, at: ctx.now };
  else delete t.seats[i].say;
  return t.seats[i].say || null;
}

export function chipsOnTable(t) {
  return t.seats.reduce((a, s) => a + (s ? s.stack : 0), 0) + (t.hand ? potTotal(t.hand) : 0);
}
export function totalBoughtIn(t) { return Object.values(t.ledger).reduce((a, l) => a + l.buyIn, 0); }
export function totalCashedOut(t) { return Object.values(t.ledger).reduce((a, l) => a + l.cashOut, 0); }

// ---------- what a given player is allowed to see ----------
export function viewFor(t, playerId, now) {
  const h = t.hand;
  const mySeat = seatOf(t, playerId);
  const seats = t.seats.map((s, i) => {
    if (!s) return null;
    const p = h?.players[i];
    const l = t.ledger[s.playerId] || { buyIn: 0, cashOut: 0 };
    return {
      seat: i, playerId: s.playerId, name: s.name, stack: s.stack, rebuys: s.rebuys,
      sittingOut: s.sittingOut, leaving: s.leaving, waiting: s.waiting, busted: s.stack === 0 && !inLiveHand(t, i),
      totalBuyIn: l.buyIn, net: 0, // filled in from standings below
      inHand: !!p, folded: p ? p.folded : false, allIn: p ? p.allIn : false, bet: p ? p.bet : 0,
      inPot: p ? p.total + blindOf(h, i) : 0,
      cards: p && i === mySeat ? p.hole : null, // only YOUR hole cards are ever sent
      hasCards: !!p && !p.folded,
      say: s.say ? { text: s.say.text, at: s.say.at } : null,
    };
  });
  const hand = h ? {
    number: h.number, street: h.street, board: h.board, buttonSeat: h.buttonSeat, sbSeat: h.sbSeat, bbSeat: h.bbSeat,
    dead: h.dead || 0, blindPot: h.blindPot || 0, skipped: !!h.skipped, pot: potTotal(h), potBehind: potTotal(h) - h.players.reduce((a, p) => a + (p ? p.bet : 0), 0),
    currentBet: h.currentBet, minRaise: h.minRaise, toAct: h.toAct,
    toActPlayerId: h.toAct !== null ? t.seats[h.toAct].playerId : null, deadline: h.deadline,
  } : null;
  const standings = Object.entries(t.ledger).map(([id, l]) => {
    const i = seatOf(t, id);
    const s = i >= 0 ? t.seats[i] : null;
    const inPot = s && h?.players[i] ? h.players[i].total + blindOf(h, i) : 0;
    const chips = (s ? s.stack : 0) + inPot;
    return { playerId: id, name: s ? s.name : l.name, seated: !!s, chips, stack: s ? s.stack : 0, buyIn: l.buyIn, cashOut: l.cashOut, net: chips + l.cashOut - l.buyIn };
  }).sort((a, b) => b.net - a.net);
  for (const st of seats) if (st) st.net = standings.find((x) => x.playerId === st.playerId).net;
  return {
    code: t.code, name: t.name, status: t.status, hostId: t.hostId, settings: t.settings,
    handNumber: t.handNumber, buttonSeat: t.buttonSeat, nextHandAt: t.nextHandAt, version: t.version,
    me: { playerId, seat: mySeat >= 0 ? mySeat : null, autoCheck: mySeat < 0 ? false : h && h.players[mySeat] ? !!h.players[mySeat].autoCheck : (t.seats[mySeat].nextAutoCheck ?? !!t.settings.autoCheck), isHost: playerId === t.hostId,
      afkMoved: mySeat < 0 && t.status !== 'closed' ? t.afkMoved?.[playerId] || null : null,
      canShow: t.muck && t.muck.playerId === playerId && t.lastHand?.number === t.muck.number
        ? { number: t.muck.number, cards: t.muck.cards, shown: t.muck.shown } : null, // the winner's own cards, to them only
      canRebuy: mySeat >= 0 && canRebuy(t, t.seats[mySeat]) && !inLiveHand(t, mySeat) && t.seats[mySeat].stack < t.settings.buyIn && t.status !== 'closed' },
    fightOffer: h?.fightOffer?.status === 'open' && h.fightOffer.playerId === playerId ? { hand: h.number, refund: h.fightOffer.refund } : null,
    fight: fightView(t.fight),
    seats, hand, legal: mySeat >= 0 ? legalActions(t, mySeat) : null,
    lastHand: t.lastHand, standings,
    // v49: last finished hand's showdown (hand is over, so its cards are public); per-player 'seen' for the auto-play
    showdown: t.lastShowdown || null, showdownSeen: !!t.lastShowdown && (t.showdownSeen?.[playerId] ?? -1) >= t.lastShowdown.number, log: t.log.slice(-MAX_LOG), serverNow: now,
  };
}

// ---------- Fight Guntrad (side game for the big blind) ----------
// The big blind is always posted as normal, so the hand never waits. The BB player may take an optional
// fight while the hand is on and they haven't acted yet. Win: the house refunds their big blind to their
// bankroll. Lose (or forfeit, or let the clock run out): 5% of their bankroll goes into this pot as dead money.
export const FIGHT_PCT = 5;
export const FIGHT_LIMIT_MS = Math.ceil((F.MAX_FRAMES / F.FPS) * 1000) + 30000; // longest possible fight + loading slack
export const FIGHT_CLOCK_SLACK_FRAMES = 2 * F.FPS; // a replay may run at most 2 seconds ahead of the wall clock
/** 5% of a bankroll in whole dollars (rounded), at least $1, never more than they have. 0 if they have under $1. */
export function fightStake(bankroll) {
  const b = Math.floor(Number(bankroll) || 0);
  if (b < 1) return 0;
  return Math.min(b, Math.max(1, Math.round((Number(bankroll) * FIGHT_PCT) / 100)));
}
function offerFight(t, seat, ctx) {
  const h = t.hand; const s = t.seats[seat]; const p = h.players[seat];
  if (!t.econ || typeof ctx.bankrollOf !== 'function') return; // only on tables backed by real bankrolls
  if (s.sittingOut || s.leaving || p.total <= 0) return;
  if (fightStake(ctx.bankrollOf(s.playerId)) < 1) return;
  h.fightOffer = { seat, playerId: s.playerId, refund: p.total, status: 'open' };
}
function fightBook(t) { return (t.fightBook ||= { refund: {}, take: {} }); }
export function startFight(t, playerId, { id, seed }, ctx) {
  const h = t.hand; const o = h?.fightOffer;
  if (!o || o.playerId !== playerId) throw new GameError('There is no fight on offer for you right now');
  if (o.status !== 'open') throw new GameError(o.status === 'taken' ? 'You already fought on this hand' : 'That fight offer has passed');
  if (t.fight?.status === 'running') throw new GameError('Someone is already fighting Guntrad at this table');
  o.status = 'taken';
  const s = t.seats[o.seat];
  t.fight = { id, seed: seed >>> 0, hand: h.number, seat: o.seat, playerId, name: s.name, refund: o.refund, startedAt: ctx.now, expiresAt: ctx.now + FIGHT_LIMIT_MS, status: 'running' };
  log(t, ctx, `${s.name} steps up to fight Guntrad the Pit Boss!`);
  return t.fight;
}
export function declineFight(t, playerId, ctx) {
  const o = t.hand?.fightOffer;
  if (!o || o.playerId !== playerId || o.status !== 'open') throw new GameError('There is no fight on offer for you right now');
  o.status = 'declined';
  log(t, ctx, `${t.seats[o.seat].name} passes on fighting Guntrad`);
}
/** Check a submitted replay, re-run it, and settle. Never trusts a claimed result. */
export function finishFight(t, playerId, { id, log: inputs, frames }, ctx) {
  const f = t.fight;
  if (!f || f.id !== id) throw new GameError('No such fight', 404);
  if (f.playerId !== playerId) throw new GameError('That is not your fight', 403);
  if (f.status !== 'running') throw new GameError('That fight is already over', 409);
  if (ctx.now > f.expiresAt) { settleFight(t, 'lose', 'ran out of time', ctx); return f; }
  const bad = F.checkLog(inputs, frames);
  if (bad) throw new GameError(`Fight replay rejected (${bad})`);
  const maxFrames = Math.floor(((ctx.now - f.startedAt) * F.FPS) / 1000) + FIGHT_CLOCK_SLACK_FRAMES;
  if (frames > maxFrames) throw new GameError('Fight replay rejected (played faster than real time)');
  const r = F.simulate(f.seed, inputs, frames);
  settleFight(t, r.result, r.result === 'win' ? 'knocked him out' : r.state.result === 'lose' ? (r.state.p.hp <= 0 ? 'was knocked out' : 'ran out the clock') : 'gave up', ctx,
    { frames: r.frame, pHp: r.state.p.hp, gHp: Math.max(0, r.state.g.hp), best: r.state.best, hits: r.state.hits });
  return f;
}
export function forfeitFight(t, playerId, id, ctx) {
  const f = t.fight;
  if (!f || (id && f.id !== id)) throw new GameError('No such fight', 404);
  if (f.playerId !== playerId) throw new GameError('That is not your fight', 403);
  if (f.status !== 'running') throw new GameError('That fight is already over', 409);
  settleFight(t, 'lose', 'forfeited', ctx);
  return f;
}
function settleFight(t, result, why, ctx, stats = {}) {
  const f = t.fight; const book = fightBook(t);
  Object.assign(f, { status: result === 'win' ? 'won' : 'lost', reason: why, endedAt: ctx.now, ...stats });
  // cosmetic: which fatality the KO ending shows (same for the fighter and watchers, never twice running at a table)
  if (why === 'was knocked out') { f.fatality = pickFatality(f.seed, t.lastFatality ?? -1); t.lastFatality = f.fatality; }
  if (result === 'win') {
    f.gag = pickGag(f.seed, t.lastGag ?? -1); t.lastGag = f.gag; f.finale = false; // v29: cosmetic finisher
    book.refund[f.playerId] = (book.refund[f.playerId] || 0) + f.refund;
    f.paid = f.refund;
    log(t, ctx, `${f.name} beat Guntrad the Pit Boss! The house covers their big blind (${f.refund} back to their bankroll)`);
    return;
  }
  const stake = fightStake(typeof ctx.bankrollOf === 'function' ? ctx.bankrollOf(f.playerId) : 0);
  f.stake = stake;
  const h = t.hand;
  if (stake > 0 && h && h.number === f.hand) {
    h.dead = (h.dead || 0) + stake; h.deadBy = f.playerId; f.into = 'pot';
    (t.ledger[f.playerId] ||= { name: f.name, buyIn: 0, cashOut: 0 }).buyIn += stake; // taken from their bankroll
    log(t, ctx, `${f.name} ${why} against Guntrad: ${stake} dead money goes into the pot`);
  } else if (stake > 0) {
    f.into = 'house'; book.take[f.playerId] = (book.take[f.playerId] || 0) + stake; // the hand was already over: the house keeps it
    log(t, ctx, `${f.name} ${why} against Guntrad after the hand ended: the house keeps ${stake}`);
  } else {
    log(t, ctx, `${f.name} ${why} against Guntrad (nothing left to pay)`);
  }
}
/** v29: the fighter finishes Guntrad off after a verified win (cosmetic; once; within FINALE_MS of the win). */
export function finishHim(t, playerId, id, ctx) {
  const f = t.fight;
  if (!f || f.id !== id) throw new GameError('No such fight', 404);
  if (f.playerId !== playerId) throw new GameError('That is not your fight', 403);
  if (f.status !== 'won' || !Number.isInteger(f.gag)) throw new GameError('Nothing to finish', 409);
  if (f.finale) return f;
  if (ctx.now > (f.endedAt || 0) + FINALE_MS) throw new GameError('Too late', 409);
  f.finale = true; f.finaleAt = ctx.now;
  return f;
}
export const finaleOpen = (f, now) => !!f && f.status === 'won' && Number.isInteger(f.gag) && !f.finale && now <= (f.endedAt || 0) + FINALE_MS;
function fightView(f) {
  if (!f) return null;
  const { id, seed, hand, seat, playerId, name, refund, startedAt, expiresAt, status, reason, endedAt, stake, paid, gHp, pHp, best, hits, into, fatality, gag, finale } = f;
  return { fatality: fatality ?? null, gag: gag ?? null, finale: !!finale, into: into || null, id, seed, hand, seat, playerId, name, refund, startedAt, expiresAt, status, reason: reason || null, endedAt: endedAt || null, stake: stake ?? null, paid: paid ?? null, gHp: gHp ?? null, pHp: pHp ?? null, best: best ?? null, hits: hits ?? null };
}

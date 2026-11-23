// Admin-only dealer POV preview. Pure client state: no tables, ledger, bankrolls, or canBet.
// Tips and pit visits here are fake and never leave this module.

export const PREVIEW_PATH = '/admin/bj-preview';
export const PREVIEW_LABEL = 'Preview: not a real game';
export const PREVIEW_API = '/admin/bj/pov-preview';

export const PREVIEW_SEATS = [
  { id: 'preview-dee', name: 'Dee', seed: 'dee-hair' },
  { id: 'preview-cal', name: 'Cal', seed: 'cal-rose' },
  { id: 'preview-bea', name: 'Bea', seed: 'mia' },
  { id: 'preview-ann', name: 'Ann', seed: 'ann-hair' },
];

const HOUSE_AVATAR = { kind: 'gen', seed: 'preview-house' };
const TIP_MS = 4000;
const PIT_MS = 5500;
const APPROACH_MS = 1200;
const LOOM_MS = 2200;
const AUTO_MS = 1100;
const SETTLE_MS = 2600;

const copyHands = (hands) => hands.map((h, i) => ({
  i: h.i ?? i, seat: h.seat, cards: h.cards.slice(), bet: h.bet ?? 10,
  total: h.total, bust: !!h.bust, bj: !!h.bj, done: !!h.done,
}));

/** Scripted hands that walk through hit, stand, split, double, bust, and blackjack. */
export const PREVIEW_HANDS = [
  {
    no: 1,
    dealer: ['7c', '9d'],
    hands: [
      { seat: 0, cards: ['As', 'Kd'], total: 21, bj: true, done: true, bet: 10 },
      { seat: 1, cards: ['Th', '6c'], total: 16, bet: 10 },
      { seat: 2, cards: ['5h', '6d'], total: 11, bet: 10 },
      { seat: 3, cards: ['9s', '7h'], total: 16, bet: 10 },
    ],
    cues: [
      { at: 0, t: 'deal' },
      { at: 2200, t: 'act', seat: 1, k: 'hit', card: 'Jc', total: 26, bust: true },
      { at: 3200, t: 'act', seat: 2, k: 'double', card: 'Td', total: 21, bet: 20, done: true },
      { at: 4200, t: 'act', seat: 3, k: 'hit', card: '4c', total: 20 },
      { at: 5000, t: 'act', seat: 3, k: 'stand', done: true },
      { at: 5800, t: 'dealer', cards: ['7c', '9d', '4s'], total: 20 },
      { at: 6800, t: 'settle', results: [
        { seat: 0, hand: 0, out: 'blackjack', net: 15 },
        { seat: 1, hand: 1, out: 'bust', net: -10 },
        { seat: 2, hand: 2, out: 'win', net: 20 },
        { seat: 3, hand: 3, out: 'push', net: 0 },
      ] },
    ],
  },
  {
    no: 2,
    dealer: ['6h', 'Tc'],
    hands: [
      { seat: 0, cards: ['8h', '8d'], total: 16, bet: 10 },
      { seat: 1, cards: ['9c', '2s'], total: 11, bet: 10 },
      { seat: 2, cards: ['6c', '5s'], total: 11, bet: 10 },
      { seat: 3, cards: ['Kh', '7d'], total: 17, bet: 10 },
    ],
    cues: [
      { at: 0, t: 'deal' },
      { at: 2200, t: 'act', seat: 0, k: 'split' },
      { at: 3000, t: 'act', seat: 0, k: 'hit', hand: 0, card: '3d', total: 11 },
      { at: 3600, t: 'act', seat: 0, k: 'stand', hand: 0, done: true },
      { at: 4300, t: 'act', seat: 0, k: 'hit', hand: 1, card: '9c', total: 17, done: true },
      { at: 5100, t: 'act', seat: 1, k: 'hit', card: '8d', total: 19, done: true },
      { at: 5900, t: 'act', seat: 2, k: 'double', card: 'Qh', total: 21, bet: 20, done: true },
      { at: 6700, t: 'act', seat: 3, k: 'stand', done: true },
      { at: 7500, t: 'dealer', cards: ['6h', 'Tc', '5d'], total: 21 },
      { at: 8500, t: 'settle', results: [
        { seat: 0, hand: 0, out: 'lose', net: -10 },
        { seat: 0, hand: 1, out: 'lose', net: -10 },
        { seat: 1, hand: 2, out: 'lose', net: -10 },
        { seat: 2, hand: 3, out: 'push', net: 0 },
        { seat: 3, hand: 4, out: 'lose', net: -10 },
      ] },
    ],
  },
];

function seats() {
  return PREVIEW_SEATS.map((s, i) => ({
    i, id: s.id, name: s.name, chips: 180 - i * 5, startChips: 200,
    bot: false, me: false, avatar: { kind: 'gen', seed: s.seed },
  }));
}

function applySplit(hands, seat) {
  const i = hands.findIndex((h) => h.seat === seat && h.cards.length === 2);
  if (i < 0) return hands;
  const h = hands[i];
  const a = { ...h, cards: [h.cards[0]], total: null, done: false };
  const b = { ...h, cards: [h.cards[1]], total: null, done: false, bet: h.bet };
  const next = hands.slice();
  next.splice(i, 1, a, b);
  return next.map((x, idx) => ({ ...x, i: idx }));
}

function applyHit(hands, seat, cue) {
  const want = cue.hand;
  const i = hands.findIndex((h, idx) => h.seat === seat && (want == null ? !h.done : (h.i === want || idx === want)));
  const idx = i >= 0 ? i : hands.findIndex((h) => h.seat === seat);
  if (idx < 0) return hands;
  const h = { ...hands[idx], cards: [...hands[idx].cards, cue.card], total: cue.total ?? hands[idx].total, bust: !!cue.bust, done: cue.done || !!cue.bust, bet: cue.bet ?? hands[idx].bet };
  const next = hands.slice();
  next[idx] = h;
  return next;
}

function buildRound(script, hands, opts = {}) {
  const { phase = 'play', holeShown = false, dealer, dealerTotal, turn = 0, no = script.no } = opts;
  const d = dealer || (holeShown ? script.dealer.slice() : [script.dealer[0], null]);
  const bets = {};
  for (const h of hands) bets[h.seat] = { bet: h.bet ?? 10, out: !!h.done && phase !== 'play' };
  return {
    no, phase, holeShown, dealer: d, dealerTotal: holeShown ? (dealerTotal ?? null) : null,
    hands: hands.map((h, i) => ({ ...h, i })), bets, turn, deadline: null, myTurn: false, myInsurance: false,
  };
}

export function initialPreviewState(now = 0) {
  return {
    mock: true,
    autopilot: true,
    handIndex: 0,
    startedAt: now,
    seq: 1,
    log: [],
    chat: [],
    tip: null,
    pit: null,
    last: null,
    fx: null,
    round: null,
    hands: [],
    pendingAction: null,
    scriptNo: PREVIEW_HANDS[0].no,
    dealNo: 0,
  };
}

function scriptAt(state) {
  return PREVIEW_HANDS[state.handIndex % PREVIEW_HANDS.length];
}

function cuesDue(script, elapsed, fromCue) {
  return script.cues.filter((c) => c.at <= elapsed).length > fromCue ? script.cues.slice(0, script.cues.filter((c) => c.at <= elapsed).length) : script.cues.filter((c, i) => i < fromCue);
}

function appliedCueCount(state) {
  return state._cuesApplied || 0;
}

function applyCue(state, cue, now) {
  const script = scriptAt(state);
  let hands = copyHands(state.hands.length ? state.hands : script.hands.map((h, i) => ({ ...h, i, cards: [] })));
  let round = state.round;
  let log = state.log;
  let last = state.last;
  let fx = state.fx;
  let pendingAction = null;
  const seq = state.seq + 1;
  const no = state.dealNo || script.no;
  if (cue.t === 'deal') {
    hands = copyHands(script.hands);
    round = buildRound(script, hands, { phase: 'play', holeShown: false, turn: 0, no });
    log = [...log, { seq, text: 'Cards are out.', ev: { k: 'deal' } }].slice(-40);
  } else if (cue.t === 'act' && cue.k === 'split') {
    hands = applySplit(hands, cue.seat);
    round = buildRound(script, hands, { phase: 'play', holeShown: false, turn: cue.seat, no });
    log = [...log, { seq, text: `${PREVIEW_SEATS[cue.seat].name} splits.`, ev: { k: 'split', seat: cue.seat } }].slice(-40);
  } else if (cue.t === 'act') {
    hands = applyHit(hands, cue.seat, cue);
    if (cue.k === 'stand') {
      hands = hands.map((h) => (h.seat === cue.seat && (cue.hand == null || h.i === cue.hand) ? { ...h, done: true } : h));
    }
    round = buildRound(script, hands, { phase: 'play', holeShown: false, turn: cue.seat, no });
    log = [...log, { seq, text: `${PREVIEW_SEATS[cue.seat].name} ${cue.k === 'double' ? 'doubles' : cue.k === 'hit' ? 'hits' : 'stands'}.`, ev: { k: cue.k, seat: cue.seat } }].slice(-40);
  } else if (cue.t === 'dealer') {
    round = buildRound(script, hands, { phase: 'dealer', holeShown: true, dealer: cue.cards, dealerTotal: cue.total, turn: -1, no });
    log = [...log, { seq, text: 'Dealer plays.', ev: { k: 'flip' } }].slice(-40);
  } else if (cue.t === 'settle') {
    const dealer = state.round?.dealer?.filter(Boolean).length >= 2 ? state.round.dealer : script.dealer;
    last = {
      no,
      dealer,
      dealerTotal: state.round?.dealerTotal,
      hands: hands.map((h) => ({ seat: h.seat, cards: h.cards.slice(), bet: h.bet })),
      results: cue.results,
    };
    fx = { no, results: cue.results };
    round = { no: no + 1, phase: 'betting', bets: {}, hands: [], dealer: [], holeShown: false, turn: 0, deadline: null, myTurn: false };
    hands = [];
    log = [...log, { seq, text: 'Hand is over.', ev: { k: 'settle' } }].slice(-40);
  }
  return {
    ...state, seq, log, last, fx, round, hands, pendingAction,
    _cuesApplied: appliedCueCount(state) + 1,
    settledAt: cue.t === 'settle' ? now : state.settledAt,
  };
}

function startHand(state, handIndex, now) {
  const script = PREVIEW_HANDS[handIndex % PREVIEW_HANDS.length];
  const dealNo = (state.dealNo || 0) + 1;
  return {
    ...state,
    _started: true,
    handIndex: handIndex % PREVIEW_HANDS.length,
    startedAt: now,
    settledAt: null,
    _cuesApplied: 0,
    last: null,
    fx: null,
    hands: [],
    dealNo,
    round: { no: dealNo, phase: 'betting', bets: {}, hands: [], dealer: [], holeShown: false, turn: 0, deadline: null, myTurn: false },
    pendingAction: state.autopilot ? null : 'deal',
    scriptNo: script.no,
    seq: state.seq + 1,
  };
}

export function previewStep(state, cmd, now = 0) {
  const s = state || initialPreviewState(now);
  if (cmd === 'auto') {
    const on = !s.autopilot;
    return { ...s, autopilot: on, pendingAction: on ? null : (s.pendingAction || 'deal'), seq: s.seq + 1 };
  }
  if (cmd === 'auto-on') return { ...s, autopilot: true, pendingAction: null, seq: s.seq + 1 };
  if (cmd === 'auto-off') return { ...s, autopilot: false, pendingAction: s.pendingAction || 'deal', seq: s.seq + 1 };
  if (cmd === 'next-hand') {
    const idx = s._started ? s.handIndex + 1 : s.handIndex;
    return { ...startHand(s, idx, now), _started: true };
  }
  if (cmd === 'tip') {
    const who = PREVIEW_SEATS[(s.handIndex + (s._cuesApplied || 0)) % PREVIEW_SEATS.length];
    return {
      ...s, seq: s.seq + 1,
      tip: { from: who.id, name: who.name, amount: 5, at: now, thanks: 'Thanks for the tip', big: false, until: now + TIP_MS, mock: true },
    };
  }
  if (cmd === 'pit') {
    const who = PREVIEW_SEATS[s.round?.turn ?? 1] || PREVIEW_SEATS[1];
    return {
      ...s, seq: s.seq + 1,
      pit: {
        name: 'Brisk', title: 'Pit Boss', line: 'Count it again.',
        target: { id: who.id, name: who.name }, targetName: who.name,
        kind: 'check', at: now, until: now + PIT_MS,
        approachUntil: now + APPROACH_MS, loomUntil: now + LOOM_MS,
        mock: true,
      },
    };
  }
  if (cmd && cmd.t === 'say') {
    const text = String(cmd.text || '').trim().slice(0, 80);
    if (!text) return s;
    return { ...s, seq: s.seq + 1, chat: [...(s.chat || []), { id: `m${s.seq}`, name: 'You', text, at: now, me: true }].slice(-8) };
  }
  if (cmd === 'tick' || cmd === 'deal' || cmd === 'flip' || cmd === 'draw') {
    let next = s;
    if (next.tip && now >= next.tip.until) next = { ...next, tip: null };
    if (next.pit && now >= next.pit.until) next = { ...next, pit: null };
    if (next.fx && next.settledAt && now - next.settledAt > 2500) next = { ...next, fx: null };
    if (!next.round || (next.round.phase === 'betting' && !next._cuesApplied)) {
      if (next.autopilot || cmd === 'deal' || cmd === 'next-hand') next = startHand(next, next.handIndex, now);
    }
    const script = scriptAt(next);
    const elapsed = now - (next.startedAt || now);
    const applied = appliedCueCount(next);
    if (next.settledAt && next.autopilot && now - next.settledAt >= SETTLE_MS) {
      return startHand(next, next.handIndex + 1, now);
    }
    const shouldAdvance = next.autopilot || cmd === 'deal' || cmd === 'flip' || cmd === 'draw';
    if (shouldAdvance && applied < script.cues.length) {
      const cue = script.cues[applied];
      let appliedNow = false;
      if (next.autopilot) {
        if (elapsed >= cue.at) { next = applyCue(next, cue, now); appliedNow = true; }
      } else if (cmd === 'deal' || cmd === 'flip' || cmd === 'draw') {
        next = applyCue(next, cue, now); appliedNow = true;
      }
      if (appliedNow && !next.autopilot) {
        const more = appliedCueCount(next) < script.cues.length;
        const nxt = script.cues[appliedCueCount(next)];
        next = { ...next, pendingAction: more ? (nxt?.t === 'dealer' ? 'flip' : 'deal') : null };
      }
    }
    return next;
  }
  return s;
}

function pitNow(pit, now) {
  if (!pit || now >= pit.until) return null;
  const age = now - pit.at;
  const state = now < pit.approachUntil ? 'approach' : now < pit.loomUntil ? 'loom' : now < pit.until - 900 ? 'talk' : 'leave';
  return {
    name: pit.name, title: pit.title, line: pit.line, target: pit.target, targetName: pit.targetName,
    kind: pit.kind, state, at: pit.at, until: pit.until, loom: state === 'loom' || (state === 'talk' && pit.kind !== 'tip'), t: age, mock: true,
  };
}

export function previewView(state, now = 0) {
  const s = state || initialPreviewState(now);
  const auto = s.autopilot !== false;
  const r = s.round;
  const dealer = r?.dealer || [];
  let action = null, label;
  const dealingLabel = auto ? 'Autopilot is dealing' : "You're dealing";
  if (!auto && s.pendingAction === 'flip') { action = 'flip'; label = 'Flip the hole card'; }
  else if (!auto && s.pendingAction === 'draw') { action = 'draw'; label = 'Draw to the house rule'; }
  else if (!auto && (s.pendingAction === 'deal' || !s._cuesApplied)) { action = 'deal'; label = 'Deal the next card'; }
  else if (r?.phase === 'play' && r.turn != null && r.turn >= 0) {
    const who = PREVIEW_SEATS[r.turn] || seats().find((x) => x.i === r.turn);
    label = who ? `${who.name} to act` : 'Waiting on a player';
  } else if (r?.phase === 'dealer') label = 'Dealer is playing';
  else if (r?.phase === 'betting') label = s.last ? 'Hand is over' : (auto ? dealingLabel : 'Waiting on bets');
  else label = dealingLabel;
  const tip = s.tip && now < s.tip.until ? s.tip : null;
  return {
    mock: true,
    name: 'Preview pit',
    code: 'PREV',
    status: 'playing',
    seq: s.seq,
    shuffles: 0,
    deckLeft: 44,
    turnSec: 30,
    house: {
      isMe: true, pov: true, mode: 'player', id: 'preview-house', name: 'You',
      bank: 800, startBank: 800, autopilot: auto, present: true, avatar: HOUSE_AVATAR,
    },
    seats: seats(),
    maxSeats: 4,
    round: r,
    last: s.last,
    log: s.log,
    chat: s.chat,
    pit: pitNow(s.pit, now),
    tip,
    dealer: { autopilot: auto, action, label, stallAt: null },
    limits: { min: 5, max: 100, maxNow: 100 },
    mySeat: -1,
    canTip: false,
  };
}

/** This preview never writes game data. Exported so tests can lock that in. */
export function previewTouchesLedger() { return false; }
export function nextCueDelay(state, now) {
  const s = state || initialPreviewState(now);
  if (s.settledAt && s.autopilot) return Math.max(200, SETTLE_MS - (now - s.settledAt));
  if (!s.autopilot) return AUTO_MS;
  const script = scriptAt(s);
  const next = script.cues[appliedCueCount(s)];
  if (!next) return SETTLE_MS;
  const due = (s.startedAt || now) + next.at;
  return Math.max(80, due - now);
}

// v52/v60: paced card reveals for blackjack. Server sends full hands; the client stages each
// new card onto the felt with a beat between them (deal, hits, dealer reveal).
// Tap the felt to speed the next card. Reduced motion → all at once.
// v60 fix: after settle the server starts the next betting round and the UI shows `last`.
// That must NOT change the reveal key (was r:N → last:N), or the finished hand re-deals as a
// second "replay". Same round number keeps continuity; showLast only snaps the hole face-up.
import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx, isMuted } from './sfx.js';

const BEAT_MS = 380;
const FAST_MS = 120;

/** Pure: what the felt should eventually show for this view. Exported for tests. */
export function targetFrom(v, showLast) {
  if (showLast && v?.last) {
    const hands = {};
    (v.last.hands || []).forEach((h, i) => { hands[i] = (h.cards || []).length; });
    // Key matches the live round (`r:N`) so settle → betting does not reset+replay.
    return { key: `r:${v.last.no}`, d: (v.last.dealer || []).length, hands, hole: true, settled: true };
  }
  const r = v?.round;
  if (!r) return { key: 'none', d: 0, hands: {}, hole: false, settled: false };
  const hands = {};
  for (const h of r.hands || []) hands[h.i] = (h.cards || []).length;
  return { key: `r:${r.no}`, d: (r.dealer || []).length, hands, hole: !!r.holeShown, settled: false };
}

/** Ordered beats for cards in `want` that aren't yet in `have`. Exported for tests. */
export function plan(want, have) {
  const out = [];
  const handKeys = Object.keys(want.hands).map(Number).sort((a, b) => a - b);
  const empty = (have.d || 0) === 0 && handKeys.every((k) => (have.hands[k] || 0) === 0);
  const dealingTwo = empty && handKeys.some((k) => (want.hands[k] || 0) >= 1) && (want.d || 0) >= 1
    && handKeys.every((k) => (want.hands[k] || 0) <= 2) && (want.d || 0) <= 2;
  if (dealingTwo) {
    const maxC = Math.max(want.d || 0, ...handKeys.map((k) => want.hands[k] || 0));
    for (let n = 1; n <= maxC; n++) {
      for (const k of handKeys) if (n <= (want.hands[k] || 0)) out.push({ k: 'h', hand: k, n });
      if (n <= (want.d || 0)) out.push({ k: 'd', n });
    }
    return out;
  }
  for (const k of handKeys) {
    for (let n = (have.hands[k] || 0) + 1; n <= (want.hands[k] || 0); n++) out.push({ k: 'h', hand: k, n });
  }
  for (let n = (have.d || 0) + 1; n <= (want.d || 0); n++) out.push({ k: 'd', n });
  return out;
}

export function useDealReveal(v, { showLast, reduced }) {
  const [shown, setShown] = useState({ key: 'none', d: 0, hands: {}, hole: false, flipped: false });
  const [dealing, setDealing] = useState(false);
  const queue = useRef([]);
  const timer = useRef(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const apply = useCallback((beat) => {
    setShown((s) => {
      const next = { ...s, hands: { ...s.hands } };
      if (beat.k === 'd') next.d = Math.max(next.d || 0, beat.n);
      else if (beat.k === 'flip') { next.hole = true; next.flipped = true; }
      else next.hands[beat.hand] = Math.max(next.hands[beat.hand] || 0, beat.n);
      return next;
    });
    shownRef.current = (() => {
      const s = shownRef.current;
      const next = { ...s, hands: { ...s.hands } };
      if (beat.k === 'd') next.d = Math.max(next.d || 0, beat.n);
      else if (beat.k === 'flip') { next.hole = true; next.flipped = true; }
      else next.hands[beat.hand] = Math.max(next.hands[beat.hand] || 0, beat.n);
      return next;
    })();
    if (!reduced && !isMuted()) try { sfx.deal(); } catch { /* */ }
  }, [reduced]);

  const pump = useCallback((fast) => {
    clear();
    if (!queue.current.length) { setDealing(false); return; }
    apply(queue.current.shift());
    if (!queue.current.length) { setDealing(false); return; }
    setDealing(true);
    timer.current = setTimeout(() => pump(false), reduced ? 0 : (fast ? FAST_MS : BEAT_MS));
  }, [apply, reduced]);

  const tap = useCallback(() => {
    if (queue.current.length || dealing) pump(true);
  }, [pump, dealing]);

  useEffect(() => {
    if (!v) return;
    const want = targetFrom(v, showLast);
    if (want.key !== shownRef.current.key) {
      clear();
      queue.current = [];
      // Settled hand shown between rounds: paint it complete (no second replay).
      // New live round: pace from empty. Reduced motion: always snap.
      if (reduced || want.settled) {
        const snap = { ...want, flipped: !!want.hole, hands: { ...want.hands } };
        setShown(snap);
        shownRef.current = snap;
        setDealing(false);
        return;
      }
      const empty = { key: want.key, d: 0, hands: {}, hole: false, flipped: false };
      setShown(empty);
      shownRef.current = empty;
      queue.current = plan(want, empty);
      if (queue.current.length) {
        setDealing(true);
        timer.current = setTimeout(() => pump(false), 160);
      } else setDealing(false);
      return;
    }

    // Same round: hole just revealed → one flip beat (or snap if already settled / reduced).
    if (want.hole && !shownRef.current.flipped) {
      if (want.settled || reduced) {
        const snap = { ...shownRef.current, hole: true, flipped: true, d: Math.max(shownRef.current.d || 0, want.d), hands: { ...shownRef.current.hands, ...want.hands } };
        // fill any missing counts
        for (const [k, n] of Object.entries(want.hands)) snap.hands[k] = Math.max(snap.hands[k] || 0, n);
        snap.d = Math.max(snap.d || 0, want.d);
        setShown(snap);
        shownRef.current = snap;
      } else if (!queue.current.some((b) => b.k === 'flip')) {
        queue.current.push({ k: 'flip', n: 2 });
        shownRef.current = { ...shownRef.current, hole: true };
        setShown((s) => ({ ...s, hole: true }));
      }
    }

    const beats = plan(want, shownRef.current);
    const id = (b) => `${b.k}:${b.hand ?? ''}:${b.n}`;
    const pending = new Set(queue.current.map(id));
    for (const b of beats) if (!pending.has(id(b))) queue.current.push(b);
    if (!timer.current && queue.current.length) {
      setDealing(true);
      timer.current = setTimeout(() => pump(false), reduced ? 0 : BEAT_MS);
    }
  }, [v?.seq, showLast, reduced, pump]);

  useEffect(() => () => clear(), []);

  return { shown, ready: !dealing && queue.current.length === 0, tap, dealing };
}

export function takeCards(cards, n) {
  if (!cards) return [];
  return n >= cards.length ? cards : cards.slice(0, Math.max(0, n));
}

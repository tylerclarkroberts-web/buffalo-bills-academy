// v52: Hold'em-style oval felt for blackjack — seats with Bust avatars, Guntrad dealing.
import React, { useRef } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { SeatBuddy } from '../table/TableBug.jsx';
import { Card } from '../Card.jsx';
import { useSize } from '../ui.jsx';
import { Dealer, DealerPlate } from '../table/Dealer.jsx';
import { takeCards } from './useDealReveal.js';

const money = (x) => (x == null ? '∞' : `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

const GAP = 32; // degrees left open at the top for the dealer
function seatDeg(pos, N) {
  if (N <= 1) return 90;
  if (N === 2) return pos === 0 ? 90 : 270 - GAP - 10;
  const gap = N > 6 ? GAP - 6 : GAP;
  const span = 360 - 2 * gap;
  const k = (pos + Math.floor(N / 2)) % N;
  return 270 + gap + (span * (k + 0.5)) / N;
}

function HandCards({ cards, small, freshFrom, reduced }) {
  const prev = freshFrom || 0;
  return (
    <div className={`bj-cards ${small ? 'sm' : ''}`} data-test="bj-cards">
      {cards.map((c, i) => (
        <span key={i} className={`bj-c ${!reduced && i >= prev ? 'bj-in' : ''}`} style={{ '--d': '0ms' }} data-test={i >= prev ? 'bj-card-new' : 'bj-card'}>
          <Card card={c} faceDown={c == null} size={small ? 'sm' : 'md'} />
        </span>
      ))}
    </div>
  );
}

/**
 * Oval arena: Guntrad + dealer hand at top; seats around the rail with Bust avatars.
 * `shown` from useDealReveal limits how many cards are painted. Tap calls onTap (speed).
 */
export function BjArena({
  v, dealerCards, dealerTotal, handsOf, turnSeat, fxFor, shown, dealing, onTap, reduced, onSit, bugPose,
}) {
  const box = useRef(null);
  const { w, h } = useSize(box);
  const N = v.seats.length;
  const mySeat = v.mySeat >= 0 ? v.mySeat : 0;
  const tall = w && h ? w / h < 1.25 : false;
  const crowd = N > 6;
  const bust = Math.round(Math.max(28, Math.min(58, w / (tall ? (crowd ? 11 : 8.5) : (crowd ? 16 : 14)), h / (crowd ? 9 : 7))));
  const geo = tall
    ? (N > 6 ? { cx: 50, cy: 56, rx: 42, ry: 36, frx: 38, fry: 30 } : { cx: 50, cy: 55, rx: 40, ry: 34, frx: 37, fry: 29 })
    : { cx: 50, cy: 56, rx: 43, ry: 32, frx: 39, fry: 28 };
  const xy = (seat) => {
    const ang = (seatDeg((seat - mySeat + N) % N, N) * Math.PI) / 180;
    return { x: geo.cx + geo.rx * Math.cos(ang), y: geo.cy + geo.ry * Math.sin(ang) };
  };
  const dShown = shown?.d ?? dealerCards.length;
  let visDealer = takeCards(dealerCards, dShown);
  // Hole stays down while the server still sends null, or during the one flip beat after reveal.
  // Once flipped (or showLast snapped), the real card shows — never stuck face-down.
  const waitingFlip = !!(shown && shown.hole && !shown.flipped);
  if (visDealer.length >= 2 && waitingFlip) {
    visDealer = visDealer.map((c, i) => (i === 1 ? null : c));
  }
  const dPrev = Math.max(0, dShown - 1);

  return (
    <div
      className={`bj-arena ${tall ? 'tall' : ''} ${crowd ? 'crowd' : ''} ${dealing ? 'dealing' : ''}`}
      ref={box}
      style={{ '--bust': `${bust}px` }}
      data-test="bj-arena"
      onPointerDown={(e) => { if (e.button === 0 && dealing) onTap?.(); }}
      role="presentation"
    >
      {w > 0 && (
        <>
          {/* Same Guntrad as Hold'em: full dealer-spot behind the oval (face art untouched). */}
          <div
            className={`dealer-spot ${dealing ? 'dealing' : ''}`}
            data-test="bj-guntrad"
            style={{ height: `${tall ? 28 : 32}%` }}
            title="Guntrad"
          >
            <Dealer still={reduced} />
          </div>

          <div
            className="bj-oval"
            style={{ left: `${geo.cx - geo.frx}%`, right: `${100 - geo.cx - geo.frx}%`, top: `${geo.cy - geo.fry}%`, bottom: `${100 - geo.cy - geo.fry}%` }}
            aria-hidden="true"
          >
            <div className="bj-oval-logo script">Buffalo Bill's</div>
          </div>
          <DealerPlate style={{ top: `${geo.cy - geo.fry}%` }} />

          <div className="bj-dealer-spot" style={{ top: `${geo.cy - geo.fry + (tall ? 6 : 5)}%` }} data-test="bj-dealer">
            <div className="bj-dealer-hand">
              <HandCards cards={visDealer} freshFrom={dPrev} reduced={reduced} />
              {visDealer.length > 0 && dealerTotal != null && dShown >= dealerCards.length && (
                <span className="bj-total" data-test="bj-dealer-total">{dealerTotal > 21 ? 'BUST' : dealerTotal}</span>
              )}
            </div>
            <div className="bj-house-meta">
              <span className="mono small">{v.house.mode === 'guntrad' ? 'Bank ∞' : `Bank ${money(v.house.bank)}`}</span>
              <span className="mono small dim" data-test="bj-deck">Deck {v.deckLeft}/52</span>
            </div>
          </div>

          {v.seats.map((s, i) => {
            const p = xy(i);
            const hs = s ? handsOf(i) : [];
            const b = v.round?.bets?.[i];
            const res = fxFor(i);
            const av = s ? (s.avatar || v.avatars?.[s.id] || v.avatars?.[`seat:${i}`]) : null;
            return (
              <div
                key={i}
                className={`bj-rail ${s ? '' : 'empty'} ${s?.me ? 'me' : ''} ${turnSeat === i ? 'turn' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                data-test={s ? `bj-seat-${i}` : `bj-open-${i}`}
              >
                {s ? (
                  <>
                    <SeatBuddy bug={s.bug} playerId={s.id || `bj-seat-${i}`} size={Math.round(bust * 0.52)} reduced={reduced} myAction={!!(s.me && turnSeat === i)} busy={!!dealing} pose={bugPose}>
                      <Bust id={s.id || `bj-seat-${i}`} avatar={av} size={bust} state={turnSeat === i ? 'toact' : ''} still={reduced} title={s.name} />
                    </SeatBuddy>
                    <div className="bj-pill">
                      <b>{s.bot ? '🤖 ' : ''}{s.name}</b>
                      <span className="mono">{money(s.chips)}</span>
                    </div>
                    <div className="bj-hands">
                      {hs.map((h) => {
                        const n = shown?.hands?.[h.i] ?? h.cards.length;
                        const cards = takeCards(h.cards, n);
                        const out = h.res?.out || (h.bust ? 'bust' : h.bj ? 'blackjack' : h.surrendered ? 'surrender' : null);
                        const fresh = Math.max(0, n - 1);
                        return (
                          <div
                            key={h.i}
                            className={`bj-hand ${v.round?.phase === 'play' && v.round.turn === h.i ? 'act' : ''} ${h.bust || out === 'bust' ? 'bust' : ''} ${out === 'blackjack' ? 'bj' : ''} ${h.doubled ? 'dbl' : ''} ${h.split ? 'split' : ''}`}
                            data-test="bj-hand"
                          >
                            <HandCards cards={cards} small freshFrom={fresh} reduced={reduced} />
                            <div className="bj-hand-f">
                              <span className="bj-bet">{money(h.bet)}</span>
                              {h.total != null && n >= h.cards.length && <span className="bj-tot">{h.total}</span>}
                              {out && n >= h.cards.length && <span className={`bj-stamp ${out}`} data-test={`bj-out-${out}`}>{out === 'blackjack' ? 'BLACKJACK' : out.toUpperCase()}</span>}
                            </div>
                          </div>
                        );
                      })}
                      {!hs.length && b && !b.out && <span className="bj-bet big" data-test="bj-betchip">{money(b.bet)}</span>}
                      {b?.out && <span className="small dim">sitting out</span>}
                    </div>
                    {res.length > 0 && (
                      <div className="bj-pay" aria-live="polite">
                        {res.map((x, k) => (
                          <span key={k} className={`bj-float ${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}`} style={{ '--d': `${k * 150}ms` }}>
                            {x.net > 0 ? `+${money(x.net)}` : x.net < 0 ? `−${money(-x.net)}` : 'push'}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="bj-open"
                    data-test={`bj-open-seat-${i}`}
                    onClick={(e) => { e.stopPropagation(); onSit?.(); }}
                    disabled={!onSit}
                  >
                    <span className="empty-chair" aria-hidden="true" />
                    Open
                  </button>
                )}
              </div>
            );
          })}

          {dealing && !reduced && (
            <div className="bj-pace" data-test="bj-pace">Tap to speed</div>
          )}
        </>
      )}
    </div>
  );
}

// Work Mode table surface: a cream, typographic dashboard instead of the casino felt.
// Same actions (sit, boards, stacks, status) so the hand stays fully playable.
import React from 'react';
import { cardText } from '../Card.jsx';
import { chips, formatLeft } from '../util.js';
import { useModes } from './Modes.jsx';
import { familyHandle, familyInitials, familyMask } from './family.js';

function Face({ card, faceDown }) {
  if (faceDown) return <span className="work-face down" title="Held">Held</span>;
  if (!card) return <span className="work-face empty">—</span>;
  const red = card[1] === 'h' || card[1] === 'd';
  return <span className={`work-face ${red ? 'red' : 'black'}`}>{cardText(card)}</span>;
}

function statusOf(s, { hand, toAct, winners, isMe }) {
  if (!s) return 'Open';
  if (s.leaving) return 'Leaving';
  if (s.sittingOut) return 'Sitting out';
  if (s.folded) return 'Folded';
  if (winners.has(s.seat ?? -1)) return 'Won the hand';
  if (hand && toAct === s.seat) return isMe ? 'Your action' : 'To act';
  if (s.hasCards || s.cards) return 'In hand';
  if (hand) return 'In hand';
  return 'Seated';
}

export default function WorkTable({ view, now, onSit, onSay }) {
  const { safe: family } = useModes();
  const handle = (n) => (family ? familyHandle(n) : n);
  const hand = view.hand;
  const board = (hand ? hand.board : view.lastHand?.board) || [];
  const N = view.settings.maxPlayers;
  const toAct = hand?.toAct ?? null;
  const shown = (!hand && view.lastHand?.shown) || {};
  const winners = new Set((!hand && view.lastHand?.winners?.map((w) => w.seat)) || []);
  const button = hand ? hand.buttonSeat : view.buttonSeat;
  const left = hand?.deadline ? hand.deadline - now : 0;
  const actor = toAct != null ? view.seats[toAct] : null;
  const lastLine = !hand && view.lastHand
    ? view.lastHand.winners.map((x) => `${handle(x.name)} +${chips(x.amount)}${x.hand ? ` · ${x.hand}` : ''}`).join(' · ')
    : '';

  return (
    <div className="work-dash" data-test="work-dash">
      <div className="work-dash-meta">
        <div>
          <span className="kicker">Session</span>
          <b>{view.status === 'lobby' ? 'Awaiting quorum' : hand ? `Hand #${hand.number}` : view.status === 'closed' ? 'Closed' : 'Between hands'}</b>
        </div>
        <div>
          <span className="kicker">Stakes</span>
          <b>Blinds {chips(view.settings.smallBlind)}/{chips(view.settings.bigBlind)}</b>
        </div>
        <div>
          <span className="kicker">Pool</span>
          <b>{hand ? chips(hand.pot) : '—'}</b>
        </div>
        <div>
          <span className="kicker">Cadence</span>
          <b>{actor ? `${toAct === view.me.seat ? 'Your action' : handle(actor.name)} · ${formatLeft(left)}` : view.status === 'lobby' ? 'Not started' : '—'}</b>
        </div>
      </div>

      <figure className="work-dash-board">
        <figcaption>Community holdings</figcaption>
        <div className="work-faces">
          {[0, 1, 2, 3, 4].map((i) => <Face key={i} card={board[i]} />)}
        </div>
        {lastLine ? <p className="work-dash-last">Previous: {family ? familyMask(lastLine) : lastLine}</p> : null}
      </figure>

      <div className="work-dash-table-wrap">
        <table className="work-dash-seats">
          <caption className="sr-only">Participants</caption>
          <thead>
            <tr>
              <th>Seat</th>
              <th>Participant</th>
              <th>Stack</th>
              <th>Commitment</th>
              <th>Status</th>
              <th>Holdings</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: N }, (_, seat) => {
              const s = view.seats[seat];
              if (!s) {
                return (
                  <tr key={seat} className="open">
                    <td className="num">{seat + 1}</td>
                    <td colSpan={5}>
                      {onSit
                        ? <button type="button" className="work-sit" onClick={() => onSit(seat)}>Reserve seat {seat + 1}</button>
                        : <span className="muted">Open</span>}
                    </td>
                  </tr>
                );
              }
              const isMe = seat === view.me.seat;
              const name = handle(s.name);
              const cards = s.cards || shown[seat]?.cards || null;
              const holdings = cards
                ? cards.map((c, i) => <Face key={i} card={c} />)
                : s.hasCards ? <><Face faceDown /><Face faceDown /></> : '—';
              return (
                <tr key={seat} className={`${isMe ? 'me' : ''} ${toAct === seat ? 'toact' : ''} ${s.folded ? 'folded' : ''}`}>
                  <td className="num">{seat + 1}{button === seat ? <abbr title="Dealer button"> D</abbr> : ''}</td>
                  <td>
                    <button type="button" className="work-who" onClick={isMe && onSay ? onSay : undefined} disabled={!(isMe && onSay)}>
                      <i className="work-initials" aria-hidden="true">{familyInitials(name)}</i>
                      <span className="ell">{name}{isMe ? ' · you' : ''}{s.bot ? ' · model' : ''}</span>
                    </button>
                  </td>
                  <td className="num">{chips(s.stack)}</td>
                  <td className="num">{s.bet ? chips(s.bet) : '—'}</td>
                  <td>{statusOf({ ...s, seat }, { hand, toAct, winners, isMe })}</td>
                  <td className="work-hold">{holdings}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

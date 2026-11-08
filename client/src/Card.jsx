import React from 'react';

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
/** 'Kh' -> 'K♥' */
export const cardText = (c) => (c ? `${c[0] === 'T' ? '10' : c[0]}${SUIT[c[1]]}` : '');
export function Card({ card, size = 'md', faceDown = false, highlight = false }) {
  if (faceDown || !card) return <div className={`card back ${size} deal`} role="img" aria-label="face-down card" />;
  const r = card[0] === 'T' ? '10' : card[0];
  const s = card[1];
  const red = s === 'h' || s === 'd';
  return (
    <div className={`card ${size} ${red ? 'red' : 'black'} ${highlight ? 'hl' : ''} flip`} role="img" aria-label={`${r} of ${NAME[s]}`}>
      <span className="rank" aria-hidden="true">{r}</span>
      <span className="suit-s" aria-hidden="true">{SUIT[s]}</span>
      <span className="suit-b" aria-hidden="true">{SUIT[s]}</span>
    </div>
  );
}
export function EmptyCard({ size = 'md' }) { return <div className={`card empty ${size}`} aria-hidden="true" />; }

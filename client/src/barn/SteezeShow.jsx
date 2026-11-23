// The four zero-damage STEEZE flourishes. Cosmetic only; the server already decided the bout did no harm.
import React from 'react';

const COINS = Array.from({ length: 14 }, (_, i) => ({
  i, left: 18 + (i * 19) % 64, delay: (i % 7) * 0.07, drop: 160 + (i * 37) % 90, bill: i % 3 === 0,
}));

export default function SteezeShow({ move }) {
  if (!move) return null;
  if (move === 'wealth') {
    return (
      <div className="steeze-show wealth" data-test="steeze-move" data-move="wealth" aria-hidden="true">
        {COINS.map((c) => (
          <i key={c.i} className={c.bill ? 'bill' : 'coin'} style={{ left: `${c.left}%`, top: '8%', animationDelay: `${c.delay}s`, '--drop': `${c.drop}px`, '--r': `${(c.i % 5) * 8 - 16}deg` }} />
        ))}
        <i className="pile" />
      </div>
    );
  }
  if (move === 'golf') {
    return (
      <div className="steeze-show golf" data-test="steeze-move" data-move="golf" aria-hidden="true">
        <i className="club-arc" />
        <i className="ball" />
      </div>
    );
  }
  if (move === 'calves') {
    return (
      <div className="steeze-show calves" data-test="steeze-move" data-move="calves" aria-hidden="true">
        <i className="zoom" />
      </div>
    );
  }
  if (move === 'chicken') {
    return (
      <div className="steeze-show chicken" data-test="steeze-move" data-move="chicken" aria-hidden="true">
        <span className="waiter">🤵</span>
        <span className="bubble">Chicken fingers, please.</span>
        <i className="basket" />
      </div>
    );
  }
  return null;
}

export const FLOURISH_OF = {
  wealth: 'wealth', golf: 'golf', calves: 'calves', chicken: 'chicken',
  'Horde wealth': 'wealth', Golf: 'golf', 'Flex his big calves': 'calves',
  'Order chicken fingers at a restaurant': 'chicken', 'Strike a pose': 'pose',
};

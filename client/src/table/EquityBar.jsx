import { useEffect, useState } from 'react';
import { equityColor } from '../../../server/engine/equity.js';

/** Compact bar: fill and color follow the win %, with the made-hand name beside the number. */
export function EquityBar({ equity }) {
  const [pct, setPct] = useState(0);
  const [color, setColor] = useState(() => equityColor(0));
  useEffect(() => {
    if (!equity) return;
    const id = requestAnimationFrame(() => {
      setPct(equity.winPct);
      setColor(equity.color);
    });
    return () => cancelAnimationFrame(id);
  }, [equity?.winPct, equity?.color]);
  if (!equity) return null;
  return (
    <div
      className="eq-bar"
      data-test="hand-equity"
      style={{ '--eq': pct, '--eq-color': color }}
      title="Your chance of having the best hand, from only your cards, the board, and how many players are still in"
    >
      <span className="eq-track" aria-hidden="true"><span className="eq-fill" /></span>
      <span className="eq-meta">
        <span className="eq-pct" data-test="hand-equity-pct">Win {equity.winPct}%</span>
        {equity.made ? <span className="eq-hand" data-test="hand-made">{equity.made}</span> : null}
      </span>
    </div>
  );
}

import React from 'react';
import { useTurns, jumpToTurns } from './useTurns.js';
import './turns.css';

/** Compact header chip: jumps to the first table you're up at. Hidden when the queue is empty. */
export function TurnsEntry() {
  const { turns, count } = useTurns();
  if (!count) return null;
  const label = count === 1 ? 'Your turn' : 'Your turns';
  return (
    <button
      type="button"
      className="turns-pill"
      data-test="turns-entry"
      onClick={() => jumpToTurns(turns)}
      title={count === 1 ? 'Open the table you are up at' : `Open the oldest of ${count} tables you are up at`}
      aria-label={count === 1 ? 'Your turn: go to that table' : `Your turns: ${count} tables. Go to the first.`}
    >
      <span className="turns-lbl-wide">{label}</span>
      <span className="turns-lbl-narrow">Turns</span>
      <b className="turns-n">{count}</b>
      <span className="turns-arr" aria-hidden="true">→</span>
    </button>
  );
}

/** After you act: a slim "Next table you're up →" row, or a brief "All caught up". */
export function NextTablePill({ advance }) {
  if (!advance) return null;
  const { phase, next, restCount, stay, goNow } = advance;
  if (phase === 'caught') {
    return <div className="turns-caught-row" data-test="turns-caught" role="status"><span className="turns-caught">All caught up</span></div>;
  }
  if (phase !== 'next' || !next) return null;
  return (
    <div className="turns-next" data-test="turns-next" role="status">
      <button type="button" className="turns-next-go" onClick={goNow} data-test="turns-next-go">
        Next table you're up <span aria-hidden="true">→</span>
        <b className="turns-n">{restCount}</b>
      </button>
      <button type="button" className="turns-stay" onClick={stay} data-test="turns-stay">Stay</button>
    </div>
  );
}

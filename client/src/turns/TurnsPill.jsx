import React from 'react';
import { createPortal } from 'react-dom';
import { useTurns, jumpToTurns } from './useTurns.js';
import { gameLabel } from './queue.js';
import { useModes } from '../modes/Modes.jsx';
import { displayTableName } from '../modes/family.js';
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

/** After you act: a side prompt. Goes to the next table only when clicked. Hidden if nothing else is waiting. */
export function NextTablePill({ advance }) {
  const { safe: family } = useModes();
  if (!advance) return null;
  const { phase, next, restCount, goNow } = advance;
  if (phase !== 'next' || !next) return null;
  const game = gameLabel(next.game);
  const tableName = displayTableName(next, next.name, family);
  const waiting = restCount === 1 ? '1 table waiting' : `${restCount} tables waiting`;
  const node = (
    <div className="turns-next" data-test="turns-next" role="status">
      <button
        type="button"
        className="turns-next-go"
        onClick={goNow}
        data-test="turns-next-go"
        aria-label={`Next table you're up in: ${tableName}, ${game}. ${waiting}.`}
      >
        <span className="turns-next-cta">Next table you're up in <span aria-hidden="true">→</span></span>
        <span className="turns-next-meta">
          <b className="turns-next-name">{tableName}</b>
          <span className="turns-next-game">{game}</span>
          <b className="turns-n" title={waiting}>{restCount}</b>
        </span>
      </button>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

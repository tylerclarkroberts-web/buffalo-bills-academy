import React, { useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';

const when = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const nine = (s) => String(s).replace(/ nine$/i, '');

function Face({ row }) {
  if (!row) return <span className="foff-board-empty">—</span>;
  return (
    <span className="foff-board-who">
      <Bust id={row.id} avatar={row.avatar} size={22} still />
      <b>{row.you ? 'You' : row.name}</b>
    </span>
  );
}

export default function FoffBoard({ board }) {
  const [tab, setTab] = useState('records');
  const [open, setOpen] = useState(null);
  const courses = board?.courses || [];
  const aces = board?.aces || [];
  return (
    <section className="foff-boards" data-test="foff-boards">
      <div className="foff-boards-tabs" role="tablist" aria-label="Golf boards">
        <button type="button" role="tab" aria-selected={tab === 'records'} className={tab === 'records' ? 'on' : ''} onClick={() => setTab('records')} data-test="foff-board-records">Course records</button>
        <button type="button" role="tab" aria-selected={tab === 'aces'} className={tab === 'aces' ? 'on' : ''} onClick={() => setTab('aces')} data-test="foff-board-aces">Holes in one{aces.length ? ` · ${aces.length}` : ''}</button>
      </div>
      {tab === 'records' ? (
        <ol className="foff-board" role="tabpanel" data-test="foff-board-courses">
          {courses.map((c) => {
            const more = (c.top || []).slice(1);
            const expanded = open === c.matchId;
            return (
              <li key={c.matchId}>
                <button type="button" className="foff-board-row" disabled={!more.length} aria-expanded={more.length ? expanded : undefined} onClick={() => more.length && setOpen(expanded ? null : c.matchId)} data-test={`foff-record-${c.matchId}`}>
                  <span className="foff-board-course">{c.course} · {nine(c.nine)}</span>
                  {c.record ? <>
                    <span className="foff-board-score">{c.record.strokes}</span>
                    <Face row={c.record} />
                    <span className="foff-board-when">{when(c.record.at)}</span>
                  </> : <span className="foff-board-empty">No card yet</span>}
                </button>
                {expanded && more.map((row, i) => (
                  <div className="foff-board-row sub" key={`${row.id}-${row.at}`} data-test={`foff-record-${c.matchId}-${i + 2}`}>
                    <span className="foff-board-course">{i + 2}.</span>
                    <span className="foff-board-score">{row.strokes}</span>
                    <Face row={row} />
                    <span className="foff-board-when">{when(row.at)}</span>
                  </div>
                ))}
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="foff-board" role="tabpanel" data-test="foff-board-aces-list">
          {aces.length === 0 && <li className="foff-board-row quiet"><span className="foff-board-empty">Nobody has aced a hole yet.</span></li>}
          {aces.map((a) => (
            <li key={`${a.id}-${a.matchId}-${a.hole}-${a.at}`} className="foff-board-row ace" data-test="foff-ace">
              <Face row={a} />
              <span className="foff-board-when">{when(a.at)}</span>
              <span className="foff-board-course">{a.course} · {nine(a.nine)} · hole {a.hole}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

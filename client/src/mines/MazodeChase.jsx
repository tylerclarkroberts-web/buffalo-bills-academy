// Chasing the Heeshee Mazode for your bug: the chase chip, its speech when your pick lands, the riddle card with its
// 20-second clock, and the verdict. The server (server/mazodeChase.js) decides all of it; this only shows its latest word.
// `view.skew` is the server clock minus ours.
import { useEffect, useState } from 'react';

const TIER = { easy: 'EASY', tad: 'A TAD HARDER', medium: 'MEDIUM-HARD' };
const sec = (ms) => Math.max(0, Math.ceil(ms / 1000));

export function MazodeChase({ view, bugName = 'YOUR BUG', onAnswer }) {
  const [, tick] = useState(0);
  const [picked, setPicked] = useState(null); // { n, i } while the answer is on its way
  const live = view && ['chase', 'caught', 'flee', 'freed'].includes(view.phase);
  useEffect(() => { if (!live) return undefined; const id = setInterval(() => tick((x) => x + 1), 200); return () => clearInterval(id); }, [live]);
  useEffect(() => { setPicked(null); }, [view?.riddle?.n, view?.phase]);
  if (!live) return null;
  const now = Date.now() + (view.skew || 0), name = String(bugName).toUpperCase();

  if (view.phase === 'chase') {
    const slow = now >= view.slowAt, losing = view.lostMs > 0;
    const left = sec(view.slowAt - now), pct = Math.min(1, (now - view.startedAt) / (view.slowAt - view.startedAt));
    return (
      <div className={`mz-chip${slow ? ' slow' : ''}${losing ? ' losing' : ''}`} data-test="mazode-chase" role="status">
        <b>{slow ? 'IT\'S SLOWING. CATCH IT. SWING ⛏' : `CHASE IT · ${name} IN ITS FIST`}</b>
        <span className="mz-sub">{losing ? 'YOU\'RE LOSING IT' : slow ? 'IT RUNS 85% OF YOUR PACE NOW' : `95% OF YOUR PACE · TIRES IN ${left}s`}</span>
        <i className="mz-bar" aria-hidden="true"><i style={{ width: `${(slow ? 1 : pct) * 100}%` }} /></i>
      </div>
    );
  }

  if (view.phase === 'freed') {
    if (now - (view.endedAt || now) > 5000) return null;
    return (
      <div className="mz-card mz-verdict ok" data-test="mazode-freed" role="status">
        <p className="mz-say">“{view.say}”</p>
        <p className="mz-big">{name} IS BACK.</p>
      </div>
    );
  }

  if (view.phase === 'flee') {
    if (now >= view.fleeAt) return ( // it laughed; now it runs at three times your pace until it is gone
      <div className="mz-chip losing" data-test="mazode-escape" role="status"><b>IT'S GETTING AWAY WITH {name}</b>
        <span className="mz-sub">{view.last && !view.last.ok ? `IT WAS: ${String(view.last.answer).toUpperCase()} · ` : ''}GONE IN {sec(view.fleeUntil - now)}s</span></div>
    );
    return (
      <div className="mz-card mz-verdict" data-test="mazode-flee" role="status">
        <p className="mz-say">“{view.say}”</p>
        {view.last && !view.last.ok && <p className="mz-was">{view.last.timeout ? 'OUT OF TIME. ' : ''}IT WAS: <b>{view.last.answer}</b></p>}
      </div>
    );
  }

  // caught: the speech, then three riddles with a breath between them
  const r = view.riddle;
  if (!r || now < r.askedAt) {
    const between = r && r.n > 0;
    return (
      <div className="mz-card mz-speech" data-test={between ? 'mazode-between' : 'mazode-laugh'} role="status">
        {between ? <>
          {view.last?.ok && <p className="mz-was ok">✓ {view.last.answer}</p>}
          <p className="mz-say">“{r.intro}”</p>
        </> : <>
          <p className="mz-say">“{view.laugh}”</p>
          <p className="mz-say dim">“{view.offer}”</p>
        </>}
      </div>
    );
  }
  const left = Math.max(0, r.deadline - now), wait = picked?.n === r.n;
  return (
    <div className="mz-card mz-riddle" data-test="mazode-riddle" role="dialog" aria-label={`Riddle ${r.n + 1} of ${r.of}`}>
      <div className="mz-head"><span>RIDDLE {r.n + 1}/{r.of} · {TIER[r.tier] || ''}</span><b data-test="mazode-clock" className={left < 6000 ? 'hot' : ''}>{sec(left)}s</b></div>
      <i className="mz-bar" aria-hidden="true"><i style={{ width: `${(left / 20000) * 100}%` }} /></i>
      <p className="mz-q">{r.q}</p>
      <div className="mz-opts">
        {r.options.map((o, i) => (
          <button key={i} type="button" className={`mz-opt${wait && picked.i === i ? ' on' : ''}`} data-test={`mazode-opt-${i}`} disabled={wait || left <= 0}
            aria-keyshortcuts={String(i + 1)} onClick={() => { setPicked({ n: r.n, i }); onAnswer?.(r.n, i); }}>
            <span className="mz-k">{i + 1}</span>{o}
          </button>
        ))}
      </div>
    </div>
  );
}

// One ordered recap of saved public activity. Progress advances only after a visible beat or Skip.
import React, { useEffect, useState } from 'react';
import { pickReplay, stepMs, replayEnabled, seenSeq, markSeen } from './replay.js';
import { isMuted } from './Gags.jsx';
import { PixIcon, LowPoly } from '../store/PixIcon.jsx';
import { Card } from '../Card.jsx';
import { smokeSound } from './Smoke.jsx';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReplay(code, view, ready) {
  const playerId = view?.me?.playerId;
  const scope = `${code}.${playerId || 'spectator'}`;
  const [progress, setProgress] = useState(null);
  const [queue, setQueue] = useState(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  const seen = Math.max(seenSeq(code, playerId), progress?.scope === scope ? progress.seq : 0);
  const enabled = replayEnabled();
  const noGags = !!(view?.noGags || view?.gagsOff), noSmoke = !!(view?.noSmoke || view?.smokeOff);
  const muted = (view?.log || []).filter((e) => e.ev?.k === 'gag' && isMuted(e.ev.from)).map((e) => e.seq).join(',');
  const options = `${enabled}.${noGags}.${noSmoke}.${muted}`;
  const rp = queue?.scope === scope && queue.options === options ? queue : null;
  const maxSeq = (view?.log || []).reduce((n, e) => Math.max(n, e.seq || 0), 0);
  const unread = pickReplay(view?.log, { seen, noGags, noSmoke, muted: isMuted });
  const pending = enabled && (!!rp || unread.length > 0);
  const on = ready && visible && !!rp;
  const playing = on && !paused;
  const acknowledge = (seq) => { markSeen(code, seq, playerId); setProgress({ scope, seq }); };

  useEffect(() => {
    if (!view || !ready || !visible || rp) return;
    if (!enabled || !unread.length) { if (maxSeq > seen) acknowledge(maxSeq); return; }
    setQueue({ scope, options, steps: unread, i: 0, end: maxSeq, reduced: reducedMotion() });
  }, [scope, options, maxSeq, seen, ready, visible, rp]);

  useEffect(() => {
    if (!playing) return;
    const step = rp.steps[rp.i];
    const timer = setTimeout(() => {
      if (document.hidden) return;
      const done = rp.i + 1 === rp.steps.length;
      acknowledge(done ? rp.end : step.seq);
      setQueue(done ? null : { ...rp, i: rp.i + 1 });
    }, stepMs(step, rp.reduced));
    return () => clearTimeout(timer);
  }, [rp, playing]);

  useEffect(() => {
    if (playing && rp.steps[rp.i].k === 'smoke') smokeSound();
  }, [rp, playing]);

  const skip = () => { if (rp) { acknowledge(rp.end); setQueue(null); setPaused(false); } };
  return { on, pending, visible, paused, togglePause: () => setPaused((p) => !p), ...(rp || {}), step: rp?.steps[rp.i], skip };
}

/** Historical facts stay in their own card, never painted as the current hand or its occupants. */
export function ReplayLayer({ rp }) {
  if (!rp.on) return null;
  const s = rp.step;
  const symbol = s.k === 'win' ? '🏆' : s.k === 'say' ? '💬' : s.k === 'hand' ? '♠' : ({ fold: '↩', check: '✓', call: '●', raise: '↑', bet: '●', allin: '⚡', post: '●' }[s.a] || '•');
  return (
    <div className={`replay ${rp.reduced ? 'reduced' : ''} ${rp.paused ? 'paused' : ''}`} data-test="replay">
      <section className="rp-recap panel" aria-label="Table replay">
        <div className="rp-heading"><b>While you were away</b><span>{rp.i + 1} / {rp.steps.length}</span></div>
        <div key={s.seq} className={`rp-beat rp-${s.k}`} data-test={`rp-${s.k}`}>
          <div className="rp-art" aria-hidden="true">
            {s.k === 'smoke' ? <><LowPoly art={s.art} size={64} fallback={s.emoji} /><span className="rp-puff">♧</span></>
              : s.k === 'gag' ? <PixIcon pix={s.pix} size={64} fallback={s.emoji} />
              : s.k === 'deal' ? s.cards.map((card) => <Card key={card} card={card} />)
              : <span className="rp-symbol">{symbol}</span>}
          </div>
          <p role="status" aria-live="polite">{s.text}</p>
          <span className="muted small">{s.hand ? `Hand #${s.hand} · ` : ''}{new Date(s.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div className="rp-controls">
          <button type="button" className="btn small" aria-pressed={rp.paused} onClick={rp.togglePause}>{rp.paused ? 'Resume' : 'Pause'}</button>
          <button type="button" className="btn small" data-test="rp-skip" onClick={rp.skip}>Skip replay</button>
        </div>
      </section>
    </div>
  );
}

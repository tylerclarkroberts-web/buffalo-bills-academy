// Live and missed activity share one timeline; only completed visible beats advance the cursor.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pickReplay, stepMs, replayEnabled, seenSeq, markSeen, replayView } from './replay.js';
import { isMuted } from './Gags.jsx';
import { smokeSound } from './Smoke.jsx';
export { ReplayLayer } from './ReplayLayer.jsx';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReplay(code, view, ready) {
  const playerId = view?.me?.playerId;
  const scope = `${code}.${playerId || 'spectator'}`;
  const [progress, setProgress] = useState(null);
  const [queue, setQueue] = useState(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const away = useRef(true);
  const initialized = useRef(null);
  const timing = useRef({ key: null, remaining: 0 });
  const sounded = useRef(null);
  useEffect(() => {
    const change = () => { if (document.hidden) away.current = true; setVisible(!document.hidden); };
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
  const latest = useRef(maxSeq); latest.current = maxSeq;
  const unread = pickReplay(view?.log, { seen, noGags, noSmoke, muted: isMuted });
  const pending = enabled && (!!rp || (seen > 0 && unread.length > 0));
  const on = ready && visible && !!rp;
  const playing = on && !paused;
  const acknowledge = (seq) => { markSeen(code, seq, playerId); setProgress({ scope, seq }); };

  useLayoutEffect(() => {
    if (!view) return;
    if (!ready || !visible) {
      away.current = true;
      if (rp && !rp.catchup) setQueue({ ...rp, catchup: true });
      return;
    }
    const first = initialized.current !== scope;
    if (first) away.current = true;
    initialized.current = scope;
    if (!enabled || (first && !seen)) {
      // First visit starts at the live table; returning visitors resume their saved cursor.
      if (maxSeq > seen) acknowledge(maxSeq);
      if (queue) setQueue(null);
      away.current = false;
      return;
    }
    if (rp) return;
    if (!unread.length) {
      if (maxSeq > seen) acknowledge(maxSeq);
      away.current = false;
      return;
    }
    setQueue({ scope, options, steps: unread, i: 0, end: maxSeq, reduced: reducedMotion(), catchup: away.current });
    setPaused(false);
  }, [scope, options, maxSeq, seen, ready, visible, rp]);

  useEffect(() => {
    if (!playing) {
      // Hidden surfaces remount their animations, so finish that whole beat when they return.
      if (!on) timing.current.key = null;
      return;
    }
    const step = rp.steps[rp.i];
    const key = `${scope}.${options}.${step.seq}`;
    if (timing.current.key !== key) timing.current = { key, remaining: stepMs(step, rp.reduced) };
    const started = performance.now();
    const timer = setTimeout(() => {
      if (document.hidden) return;
      const done = rp.i + 1 === rp.steps.length;
      acknowledge(done ? rp.end : step.seq);
      if (done && latest.current <= rp.end) away.current = false;
      setQueue(done ? null : { ...rp, i: rp.i + 1 });
    }, timing.current.remaining);
    return () => { clearTimeout(timer); timing.current.remaining = Math.max(0, timing.current.remaining - (performance.now() - started)); };
  }, [rp, playing, on]);

  useEffect(() => {
    const key = rp && `${scope}.${rp.steps[rp.i].seq}`;
    if (playing && rp.steps[rp.i].k === 'smoke' && sounded.current !== key) { sounded.current = key; smokeSound(); }
  }, [rp?.steps[rp.i]?.seq, playing]);

  const skip = () => { acknowledge(maxSeq); setQueue(null); setPaused(false); away.current = false; };
  const step = rp?.steps[rp.i];
  return { enabled, on, pending, visible, seen, paused, togglePause: () => setPaused((p) => !p), ...(rp || {}), step, skip,
    view: step ? replayView(view, step.frame) : view };
}

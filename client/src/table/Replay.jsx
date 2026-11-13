// Live and missed activity share one timeline; only completed visible beats advance the cursor.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pickReplay, showdownSpan, stepMs, replayEnabled, seenSeq, markSeen, replayView } from './replay.js';
import { isMuted } from './Gags.jsx';
import { smokeSound } from './Smoke.jsx';
export { ReplayLayer } from './ReplayLayer.jsx';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// shown: the felt is on screen. busy: something covers it for a moment (the showdown, the say box).
// showdown: the hand whose showdown the cinematic plays, so the felt leaves it alone.
export function useReplay(code, view, { shown, busy = false, showdown = null }) {
  const ready = shown && !busy;
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
  const muted = (view?.log || []).filter((e) => ['gag', 'show'].includes(e.ev?.k) && isMuted(e.ev.from)).map((e) => e.seq).join(',');
  const options = `${enabled}.${noGags}.${noSmoke}.${muted}`;
  const rp = queue?.scope === scope && queue.options === options ? queue : null;
  const maxSeq = (view?.log || []).reduce((n, e) => Math.max(n, e.seq || 0), 0);
  const latest = useRef(maxSeq); latest.current = maxSeq;
  // The timeline waits in front of that showdown's reveals and carries on after its pot push.
  const curtain = showdownSpan(view?.log, showdown, seen);
  const end = curtain ? curtain.from - 1 : maxSeq;
  const unread = pickReplay(view?.log, { seen, me: playerId, before: curtain?.from, noGags, noSmoke, muted: isMuted });
  const pending = enabled && (!!rp || (seen > 0 && unread.length > 0));
  const on = ready && visible && !!rp;
  const playing = on && !paused;
  const acknowledge = (seq) => { markSeen(code, seq, playerId); setProgress({ scope, seq }); };

  useLayoutEffect(() => {
    if (!view) return;
    if (!ready || !visible) {
      // Only leaving the felt makes what follows a replay; a moment under the showdown or the say box stays live.
      if (!shown || !visible) {
        away.current = true;
        if (rp && !rp.catchup) setQueue({ ...rp, catchup: true });
      }
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
      if (end > seen) acknowledge(end);
      if (!curtain) away.current = false;
      return;
    }
    setQueue({ scope, options, steps: unread, i: 0, end, reduced: reducedMotion(), catchup: away.current });
    setPaused(false);
  }, [scope, options, maxSeq, end, seen, ready, shown, visible, rp]);

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
  // While the showdown is owed or playing, the felt stays as it stood before the cards went over.
  const rest = !step && curtain ? view.log.filter((e) => e.frame && e.seq < curtain.from).pop() : null;
  return { enabled, on, pending, visible, seen, paused, togglePause: () => setPaused((p) => !p), ...(rp || {}), step, skip,
    afterShowdown: () => { if (curtain) acknowledge(curtain.to); },
    view: step ? replayView(view, step.frame) : rest ? replayView(view, rest.frame) : view };
}

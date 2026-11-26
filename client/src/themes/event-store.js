// Apply the one-day event skin to the document, and React hooks for busts/dealer.
import { useEffect, useState } from 'react';
import { EVENT_ID, bubblePhase, isEventThemeOn, liveEventOpts } from './event-theme.js';

export function applyEventThemeToDocument(doc = typeof document !== 'undefined' ? document : null, opts = liveEventOpts()) {
  const on = isEventThemeOn(opts);
  if (!doc?.body) return on;
  if (on) doc.body.dataset.event = EVENT_ID;
  else delete doc.body.dataset.event;
  const color = on ? '#2a1810' : '#0e0d0c';
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
  return on;
}

export function useEventTheme() {
  const [on, setOn] = useState(() => (typeof document !== 'undefined' ? document.body?.dataset?.event === EVENT_ID : isEventThemeOn(liveEventOpts())));
  useEffect(() => {
    const sync = () => setOn(applyEventThemeToDocument());
    sync();
    const id = setInterval(sync, 60000);
    return () => clearInterval(id);
  }, []);
  return on;
}

/** True while Guntrad should show the Crucible line. */
export function useCrucibleBubble(id, enabled) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled || !id) { setOn(false); return undefined; }
    let t;
    const loop = () => {
      const opts = liveEventOpts();
      const phase = bubblePhase(id, Date.now(), { force: opts.bubble });
      setOn(phase.on);
      t = setTimeout(loop, Math.max(80, Math.min(phase.wait, 8000)));
    };
    loop();
    return () => clearTimeout(t);
  }, [id, enabled]);
  return on;
}

// Apply the one-day event skin to the document, and React hooks for busts/dealer.
import { useEffect, useState } from 'react';
import { EVENT_ID, isEventThemeOn, liveEventOpts } from './event-theme.js';

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

/** True while Guntrad should show the Crucible line. Stays up all day; no hide cycle. */
export function useCrucibleBubble(id, enabled) {
  return !!(enabled && id);
}

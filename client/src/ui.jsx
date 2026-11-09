// Small layout helpers for the no-scroll app: tabs, pagers that fit as many rows as the space allows,
// and a hook that fits a fixed-shape box (the poker table) into whatever room is left.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return m;
}
export const useWide = () => useMedia('(min-width: 900px)');
// A phone turned sideways: wide but very short, so stacked layouts run out of height.
export const useShortLand = () => useMedia('(orientation: landscape) and (max-height: 520px)');

export function useSize(ref) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setS({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return s;
}

// Seat, card and label sizes on the poker table were tuned in a 1920×1080 browser window, where the felt
// is about 1530×740 CSS px between turns. On a bigger felt (1440p, 4K) they grow by this factor instead of
// staying small on a huge table; it is 1 at 1080p and smaller. CSS gets it as --tscale.
export const tableScale = (w, h) => Math.max(1, Math.min(w / 1530, h / 740));

export function Tabs({ tabs, value, onChange, className = '', label }) {
  return (
    <div className={`tabs ${className}`} role="tablist" aria-label={label}>
      {tabs.map(([k, l, extra]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}{extra ? <span className="tab-n">{extra}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * A list that never scrolls: rows have a fixed height, and the list shows as many as fit,
 * with ‹ 1/3 › controls and swipe to page through the rest.
 */
export function Paged({ items, rowH, render, empty = null, className = '', gap = 0, header = null, resetKey, cols = 1 }) {
  const box = useRef(null);
  const { h } = useSize(box);
  const per = Math.max(1, Math.floor((h + gap) / (rowH + gap))) * cols;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [pages]);
  const swipe = useRef(null);
  const slice = items.slice(page * per, page * per + per);
  return (
    <div className={`paged ${className}`}>
      {header}
      <div className="paged-box" ref={box}
        onPointerDown={(e) => { swipe.current = e.clientX; }}
        onPointerUp={(e) => { if (swipe.current === null) return; const dx = e.clientX - swipe.current; swipe.current = null; if (dx < -50) setPage((p) => Math.min(pages - 1, p + 1)); if (dx > 50) setPage((p) => Math.max(0, p - 1)); }}>
        {h > 0 && (items.length === 0 ? empty : <div className="paged-rows" style={{ gap }}>{slice.map((it, i) => <div key={it?.key ?? page * per + i} className="paged-row" style={{ height: rowH }}>{render(it, page * per + i)}</div>)}</div>)}
      </div>
      {pages > 1 && (
        <div className="pager" aria-label="Pages">
          <button className="pg" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page">‹</button>
          <span className="pg-n mono">{page + 1}/{pages}</span>
          <span className="pg-dots" aria-hidden="true">{Array.from({ length: Math.min(pages, 8) }, (_, i) => <i key={i} className={i === Math.min(page, 7) ? 'on' : ''} />)}</span>
          <button className="pg" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1} aria-label="Next page">›</button>
        </div>
      )}
    </div>
  );
}

/** Fit a box of aspect ratio `ratio` (w/h) inside the measured element. */
export function useFit(ref, ratio) {
  const { w, h } = useSize(ref);
  if (!w || !h) return { w: 0, h: 0 };
  return w / h > ratio ? { w: h * ratio, h } : { w, h: w / ratio };
}

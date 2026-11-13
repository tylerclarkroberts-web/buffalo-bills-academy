// Tiny inline SVG charts for the back office. No chart library: bars, stacked bars, horizontal bars.
import React from 'react';

export const SRC_COLORS = {
  start: '#8a7a84', poker: '#ff3d8b', blackjack: '#2ee6d6', mines: '#8dff5a', pvp: '#ffa14a', fawn: '#c99bff', golf: '#5ab0ff',
  slots: '#f2c65a', store: '#ff6f7d', invest: '#9ad0c2', barn: '#d98c5f', risk: '#e3e3e3', admin: '#ffffff', other: '#666',
};

/** Vertical bars. data: [{ label, value, title? }] */
export function Bars({ data, height = 120, color = 'var(--teal)', fmt = (v) => v, every = 1, ariaLabel = 'chart' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <figure className="ad-bars" style={{ height }} aria-label={ariaLabel}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return <rect key={i} x={i * w + w * 0.12} y={height - 1 - h} width={w * 0.76} height={Math.max(h, d.value ? 1 : 0)} fill={d.color || color} rx="0.6"><title>{d.title || `${d.label}: ${fmt(d.value)}`}</title></rect>;
        })}
      </svg>
      <div className="ad-bars-x">{data.map((d, i) => <span key={i} style={{ width: `${w}%` }}>{i % every === 0 ? d.label : ''}</span>)}</div>
      <span className="ad-bars-max num">{fmt(max)}</span>
    </figure>
  );
}

/** Daily money by source: gains stack up from the middle line, losses stack down. */
export function Diverging({ days, sources, height = 170, fmt }) {
  let top = 1, bot = 1;
  for (const d of days) { let p = 0, n = 0; for (const s of sources) { const v = d[s] || 0; if (v > 0) p += v; else n -= v; } top = Math.max(top, p); bot = Math.max(bot, n); }
  const scale = (height - 6) / (top + bot), zero = 3 + top * scale, w = 100 / Math.max(1, days.length);
  return (
    <figure className="ad-bars" style={{ height }} aria-label="Daily money by source">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img">
        <line x1="0" x2="100" y1={zero} y2={zero} stroke="rgba(251,244,234,.3)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => {
          let up = zero, down = zero;
          return sources.map((s) => {
            const v = d[s] || 0; if (!v) return null;
            const h = Math.abs(v) * scale; let y;
            if (v > 0) { up -= h; y = up; } else { y = down; down += h; }
            return <rect key={`${i}${s}`} x={i * w + w * 0.14} y={y} width={w * 0.72} height={h} fill={SRC_COLORS[s] || '#888'}><title>{`${d.day} · ${s}: ${fmt(v)}`}</title></rect>;
          });
        })}
      </svg>
      <div className="ad-bars-x">{days.map((d, i) => <span key={i} style={{ width: `${w}%` }}>{i % 5 === 0 ? d.day.slice(5) : ''}</span>)}</div>
      <span className="ad-bars-max num">+{fmt(top)}</span><span className="ad-bars-min num">−{fmt(bot)}</span>
    </figure>
  );
}

/** Horizontal bars that can go negative (net flows). rows: [{ key, label, value, color, sub? }] */
export function HBars({ rows, fmt, onPick }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const anyNeg = rows.some((r) => r.value < 0);
  return (
    <ul className="ad-hbars">
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / max) * (anyNeg ? 50 : 100);
        return (
          <li key={r.key} onClick={onPick ? () => onPick(r) : undefined} className={onPick ? 'pick' : ''}>
            <span className="ell">{r.label}{r.sub ? <small className="muted"> {r.sub}</small> : null}</span>
            <span className="ad-hbar-track">
              <i style={{ left: anyNeg ? (r.value < 0 ? `${50 - pct}%` : '50%') : 0, width: `${pct}%`, background: r.color || (r.value < 0 ? 'var(--neg)' : 'var(--pos)') }} />
              {anyNeg && <b className="ad-hbar-zero" />}
            </span>
            <span className={`num r ${r.value < 0 ? 'neg' : ''}`}>{fmt(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Original night-time decor: palm silhouettes, a tiki mask, a retro sun over desert mountains.
// All drawn in code here; no casino logos, signs or artwork are copied.
import React, { useMemo } from 'react';

function frond(x, y, ang, len, droop) {
  const a = (ang * Math.PI) / 180;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len + droop;
  const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55 - len * 0.12;
  const w = len * 0.11;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  // leaf with a serrated lower edge
  let d = `M${x} ${y} Q${mx - nx} ${my - ny} ${ex} ${ey}`;
  const n = 7;
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const px = x + (ex - x) * t + (mx - (x + ex) / 2) * (1 - (2 * t - 1) ** 2) + nx * (1.2 + (i % 2) * 0.9);
    const py = y + (ey - y) * t + (my - (y + ey) / 2) * (1 - (2 * t - 1) ** 2) + ny * (1.2 + (i % 2) * 0.9) + (i % 2) * w * 0.8;
    d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  return d + 'Z';
}
function palm(baseX, baseY, height, lean, scale = 1) {
  const topX = baseX + lean, topY = baseY - height;
  const trunk = `M${baseX - 7 * scale} ${baseY} Q${baseX + lean * 0.2} ${baseY - height * 0.5} ${topX - 3 * scale} ${topY} L${topX + 3 * scale} ${topY} Q${baseX + lean * 0.3 + 6 * scale} ${baseY - height * 0.5} ${baseX + 7 * scale} ${baseY} Z`;
  const fronds = [-170, -145, -120, -95, -65, -38, -12, 12].map((ang, i) => frond(topX, topY, ang, (60 + (i % 3) * 14) * scale, (ang < -90 ? 18 : 22) * scale * (Math.abs(ang + 90) / 80 + 0.3)));
  const rings = Array.from({ length: 9 }, (_, i) => { const t = (i + 1) / 10; const x = baseX + (topX - baseX) * t + lean * 0.15 * Math.sin(t * Math.PI); const y = baseY - height * t; return `M${x - 6 * scale} ${y} l${12 * scale} -2`; });
  return { trunk, fronds, rings };
}
export function Palms({ className = '', variant = 'pair' }) {
  const trees = useMemo(() => (variant === 'pair'
    ? [palm(60, 300, 230, 34, 1.05), palm(150, 300, 170, -24, 0.8), palm(352, 300, 210, -40, 1)]
    : [palm(40, 300, 210, 30, 0.95)]), [variant]);
  return (
    <svg className={`palms ${className}`} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {trees.map((t, i) => (
        <g key={i}>
          <path d={t.trunk} />
          {t.fronds.map((d, j) => <path key={j} d={d} />)}
          {t.rings.map((d, j) => <path key={`r${j}`} d={d} className="ring" />)}
        </g>
      ))}
    </svg>
  );
}

export function Tiki({ size = 40, className = '' }) {
  return (
    <svg className={`tiki ${className}`} width={size} height={size * 1.5} viewBox="0 0 40 60" aria-hidden="true">
      <path d="M6 4 H34 L36 10 H4 Z" />
      <rect x="5" y="11" width="30" height="46" rx="3" className="t-face" />
      <path d="M9 18 H17 V24 H9 Z M23 18 H31 V24 H23 Z" className="t-eye" />
      <path d="M8 16 L18 14 M32 16 L22 14" className="t-brow" />
      <path d="M18 24 L20 34 L22 24" className="t-nose" />
      <path d="M10 40 Q20 48 30 40 L28 46 Q20 52 12 46 Z" className="t-mouth" />
      <path d="M13 42 v4 M17 43 v5 M21 43 v5 M25 42 v4" className="t-teeth" />
    </svg>
  );
}

/** Sunset panel behind Neon Bill: a striped retro sun sinking behind desert mountains, palms in front. */
export function SunsetPanel({ children, className = '' }) {
  return (
    <div className={`sunset ${className}`}>
      <div className="sun" aria-hidden="true" />
      <svg className="ridge" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 80 L0 52 L40 34 L70 46 L118 18 L150 40 L196 24 L232 44 L270 20 L316 42 L352 30 L400 46 L400 80 Z" className="r1" />
        <path d="M0 80 L0 62 L60 50 L110 60 L170 46 L220 58 L290 48 L340 60 L400 54 L400 80 Z" className="r2" />
      </svg>
      <Palms className="sp-palms" />
      <div className="sunset-art">{children}</div>
    </div>
  );
}

// Retro 60s/70s card-room carpet: boomerangs and starbursts (original pattern, used as thin accents)
const CARPET = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' fill='#0c2a2e'/><path d='M8 12 q10 -10 20 0 q-10 -4 -20 0z' fill='#ff4f7b'/><path d='M40 44 q10 -10 20 0 q-10 -4 -20 0z' fill='#21c7b8'/><g stroke='#ffb547' stroke-width='1.6'><path d='M48 10 v12 M42 16 h12 M44 12 l8 8 M52 12 l-8 8'/></g><g stroke='#ff4f7b' stroke-width='1.2'><path d='M14 40 v10 M9 45 h10'/></g><circle cx='30' cy='30' r='2.4' fill='#ffb547'/><circle cx='4' cy='58' r='1.6' fill='#21c7b8'/></svg>`;
export const CARPET_URL = `url("data:image/svg+xml,${encodeURIComponent(CARPET)}")`;

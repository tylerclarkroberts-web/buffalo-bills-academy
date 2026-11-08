// v36: draws a pixel-art icon from pixart.js onto a 32x32 canvas once, then shows it scaled up with nearest-neighbour.
import React from 'react';
import { pixGrid } from './pixart.js';
import { lowpolyUrl } from './lowpoly.js';

const urls = new Map();
export function pixUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const g = pixGrid(name); if (!g || typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  const x = c.getContext('2d');
  g.px.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i % g.w, Math.floor(i / g.w), 1, 1); } });
  const u = c.toDataURL('image/png'); urls.set(name, u); return u;
}
/** size: the box in CSS px; the art snaps to a whole multiple of 32 so every pixel stays square and crisp. */
export function PixIcon({ pix, size = 64, fallback, className = '' }) {
  const u = pix && pixUrl(pix);
  if (!u) return fallback ? <span className={className} style={{ fontSize: size * 0.5 }}>{fallback}</span> : null;
  const s = Math.max(16, size >= 32 ? Math.floor(size / 32) * 32 : 16);
  return <img src={u} alt="" width={s} height={s} draggable="false" className={`pix ${className}`} data-pix={pix} />;
}

/** v37: a cartoon low-poly drawing (tobacco items), from lowpoly.js. */
export function LowPoly({ art, size = 64, fallback, className = '' }) {
  const u = art && lowpolyUrl(art);
  if (!u) return fallback ? <span className={className} style={{ fontSize: size * 0.5 }}>{fallback}</span> : null;
  return <img src={u} alt="" width={size} height={size} draggable="false" className={`lowpoly ${className}`} data-art={art} />;
}

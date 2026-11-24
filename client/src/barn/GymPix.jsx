// Draws a 16-bit gym icon (gympix.js) onto a 16x16 canvas once and shows it at a whole multiple of 16 CSS px with
// nearest-neighbour scaling, so every pixel stays square and crisp at any size.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { gymPixGrid, GPX } from './gympix.js';

const urls = new Map();
export function gymPixUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const g = gymPixGrid(name); if (!g || typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  const x = c.getContext('2d');
  g.px.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i % g.w, Math.floor(i / g.w), 1, 1); } });
  const u = c.toDataURL('image/png'); urls.set(name, u); return u;
}
/** size: the box in CSS px, snapped down to a multiple of 16 (16 at the least). */
export function GymPix({ name, size = 16, className = '', label }) {
  const u = gymPixUrl(name); if (!u) return null;
  const s = Math.max(GPX, Math.floor(size / GPX) * GPX);
  return <img src={u} alt={label || ''} aria-hidden={label ? undefined : 'true'} width={s} height={s} draggable="false" className={`gpix ${className}`} data-gpix={name} />;
}

/** As GymPix, but as big as its box allows (up to `size`), still a whole multiple of 16: for cards whose picture
 *  area shrinks when the name below it wraps. */
export function GymPixFit({ name, size = 64, className = '' }) {
  const ref = useRef(null), [s, setS] = useState(size);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement; if (!el) return undefined;
    const fit = () => { const r = el.getBoundingClientRect(); setS(Math.max(GPX, Math.min(size, Math.floor(Math.min(r.width, r.height) / GPX) * GPX))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [size]);
  return <span ref={ref} className="gpix-fit" style={{ display: 'contents' }}><GymPix name={name} size={s} className={className} /></span>;
}

// Server-side WANTED poster for the shame post. Tyler's pixel-art parchment
// (server/assets/wanted/poster-template.png) is the static background; only the
// oval portrait and the name are drawn per player. Avatars use the same art
// the app does (uploaded low-poly photo, or a generated genbust from the same
// seed), pixelated to fit the poster. No official Naruto art. Never uses
// Guntrad's dealer portrait.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { headParts, shade } from './avatar/genbust.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const POSTER_W = 768;
export const POSTER_H = 1024;
export const CRIME = 'Making everyone else wait';
export const PUNISHMENT = 'One Thousand Years of Pain';
export const PROCEDURE = 'Everyone waiting is legally justified to use the procedure';
export const SAMPLE_NAME = 'Cal Hick';
/** Fixed genbust seed for the admin sample — not Guntrad, not a real person. */
export const SAMPLE_SEED = 'wanted-sample-cal';

// Geometry of the cleaned template (reference was 765px wide; we padded 1px on the left).
export const OVAL = { cx: 383, cy: 429, rx: 135, ry: 158 };
export const NAME_BASELINE = 629;
export const NAME_MAX_SIZE = 36;
export const NAME_MIN_SIZE = 16;
export const NAME_MAX_WIDTH = 470;

const TEMPLATE = path.join(here, 'assets/wanted/poster-template.png');
const CRIMSON = path.join(here, 'assets/fonts/CrimsonText-Bold.ttf');
const PIXEL_W = 44; // source pixels for the bust; upscaled with nearest-neighbor

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fitName(name, max = 48) {
  const s = String(name || 'Unknown').replace(/\s+/g, ' ').trim() || 'Unknown';
  return s.length <= max ? s : `${s.slice(0, max - 1).trim()}…`;
}

/** Shrink long names so they stay on one line under the oval. */
export function nameFontSize(name, { maxSize = NAME_MAX_SIZE, minSize = NAME_MIN_SIZE, maxWidth = NAME_MAX_WIDTH } = {}) {
  const s = fitName(name);
  // Crimson Text Bold is a fairly typical serif: ~0.52em average advance.
  const size = Math.floor(maxWidth / Math.max(1, s.length * 0.52));
  return Math.max(minSize, Math.min(maxSize, size));
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typ = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typ, data])) >>> 0);
  return Buffer.concat([len, typ, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    src.copy(row, 1, y * width * 4, (y + 1) * width * 4);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svgPaths(parts, stroke = true) {
  const sw = stroke ? ' stroke="currentColor" stroke-width=".3" style="stroke:inherit"' : '';
  return parts.map((p) => `<path d="${p.d}" fill="${p.fill}" ${stroke ? `stroke="${p.fill}" stroke-width=".3"` : ''}/>`).join('');
}

function shoulderPaths(shirt) {
  const P = [[6, 110], [16, 88], [30, 79], [42, 76], [50, 82], [58, 76], [70, 79], [84, 88], [94, 110]];
  const mid = [[50, 110], [30, 98], [70, 98], [50, 92]];
  const out = [];
  const add = (a, b, c, f) => out.push({ d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}Z`, fill: shade(shirt, f) });
  add(P[0], P[1], mid[1], -0.18); add(P[1], P[2], mid[1], -0.05); add(P[2], P[3], mid[1], 0.08); add(P[3], mid[3], mid[1], 0.02);
  add(mid[1], mid[3], mid[0], -0.1); add(P[0], mid[1], mid[0], -0.25);
  add(P[8], P[7], mid[2], -0.3); add(P[7], P[6], mid[2], -0.16); add(P[6], P[5], mid[2], -0.06); add(P[5], mid[3], mid[2], -0.1);
  add(mid[2], mid[3], mid[0], -0.2); add(P[8], mid[2], mid[0], -0.34);
  return out;
}

/** The same generated bust the client draws, as a standalone SVG (no cosmetics). */
export function genBustSvg({ seed, skinTone } = {}) {
  const s = String(seed || 'unknown');
  const h = headParts(s, skinTone);
  const { L, cx, cy } = h;
  const shirt = L.shirt;
  const brows = L.brows
    ? `<g stroke="${shade(L.hair, -0.3)}" stroke-width="1.6" stroke-linecap="round"><path d="M${cx - 11} ${cy - 5} L${cx - 4} ${cy - 6}"/><path d="M${cx + 11} ${cy - 5} L${cx + 4} ${cy - 6}"/></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110">
    <rect x="42" y="62" width="16" height="22" fill="${shade(L.skin, -0.25)}"/>
    ${svgPaths(shoulderPaths(shirt), false)}
    <svg x="16" y="0" width="68" height="81.4" viewBox="-4 -12 68 84">
      ${svgPaths(h.ears, false)}
      ${svgPaths(h.skin)}
      ${svgPaths(h.beard, false)}
      ${svgPaths(h.hair)}
      ${brows}
      <ellipse cx="${cx - 7}" cy="${cy}" rx="2" ry="2.3" fill="#1b1512"/>
      <ellipse cx="${cx + 7}" cy="${cy}" rx="2" ry="2.3" fill="#1b1512"/>
      <path d="M${cx} ${cy + 1} L${cx - 2.5} ${cy + 8} L${cx + 2} ${cy + 8} Z" fill="${shade(L.skin, -0.18)}"/>
      <path d="M${cx - 5} ${cy + 13} Q${cx} ${cy + 15.5} ${cx + 5} ${cy + 13}" stroke="${shade(L.skin, -0.45)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </svg>
  </svg>`;
}

function fallbackBustSvg(monogram) {
  const ch = esc((monogram || '?').slice(0, 1).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110">
    <rect x="42" y="62" width="16" height="22" fill="#5a3a28"/>
    <path d="M10 110 L20 86 L50 78 L80 86 L90 110 Z" fill="#3d5c4a"/>
    <circle cx="50" cy="44" r="22" fill="#d4a574"/>
    <ellipse cx="42" cy="42" rx="2.4" ry="3" fill="#1a1008"/>
    <ellipse cx="58" cy="42" rx="2.4" ry="3" fill="#1a1008"/>
    <path d="M42 54 Q50 60 58 54" stroke="#1a1008" stroke-width="1.6" fill="none"/>
    <path d="M28 28 Q50 8 72 28 L68 34 Q50 18 32 34 Z" fill="#1a1008"/>
    <text x="50" y="100" text-anchor="middle" font-size="14" fill="#f2e8d5">${ch}</text>
  </svg>`;
}

function loadResvg() {
  const require = createRequire(import.meta.url);
  try {
    return require('@resvg/resvg-js');
  } catch (e) {
    const err = new Error(`Wanted poster renderer needs @resvg/resvg-js (${e.message})`);
    err.cause = e;
    throw err;
  }
}

function rasterizeSvg(svg, width) {
  const { Resvg } = loadResvg();
  const fontFiles = [CRIMSON].filter((f) => fs.existsSync(f));
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: fontFiles.length === 0, defaultFontFamily: 'Crimson Text' },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render();
}

export const BUST_W = 268;
export const BUST_H = Math.round(BUST_W * 1.1);

function nearestScale(src, srcW, srcH, destW, destH) {
  const out = Buffer.alloc(destW * destH * 4);
  for (let y = 0; y < destH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / destH));
    for (let x = 0; x < destW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / destW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * destW + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

function posterizeBuffer(buf, levels = 12) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 16) {
      buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0;
      continue;
    }
    buf[i] = Math.round(buf[i] / step) * step;
    buf[i + 1] = Math.round(buf[i + 1] / step) * step;
    buf[i + 2] = Math.round(buf[i + 2] / step) * step;
    buf[i + 3] = 255;
  }
  return buf;
}

/** Pixelate a bust SVG or photo PNG and upscale with nearest-neighbor to bust size. */
export function pixelatePortrait({ avatarPng, seed, skinTone, monogram } = {}) {
  let svg;
  if (avatarPng && Buffer.isBuffer(avatarPng) && avatarPng.length > 32) {
    const href = `data:image/png;base64,${avatarPng.toString('base64')}`;
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" shape-rendering="crispEdges">
      <image href="${href}" x="8" y="0" width="84" height="100" preserveAspectRatio="xMidYMin slice"/>
    </svg>`;
  } else if (seed) {
    svg = genBustSvg({ seed, skinTone }).replace('<svg ', '<svg shape-rendering="crispEdges" ');
  } else {
    svg = fallbackBustSvg(monogram).replace('<svg ', '<svg shape-rendering="crispEdges" ');
  }
  const rendered = rasterizeSvg(svg, PIXEL_W);
  const small = posterizeBuffer(Buffer.from(rendered.pixels), 14);
  const up = nearestScale(small, rendered.width, rendered.height, BUST_W, BUST_H);
  return encodePng(BUST_W, BUST_H, up);
}

function templateDataUrl() {
  if (!fs.existsSync(TEMPLATE)) throw new Error('Wanted poster template is missing');
  return `data:image/png;base64,${fs.readFileSync(TEMPLATE).toString('base64')}`;
}

export function wantedSvg({ name, portraitDataUrl, monogram } = {}) {
  const who = fitName(name);
  const size = nameFontSize(who);
  const { cx, cy, rx, ry } = OVAL;
  const bustX = cx - BUST_W / 2;
  const bustY = (cy + ry) - BUST_H + 8;
  const portrait = portraitDataUrl
    ? `<image href="${esc(portraitDataUrl)}" x="${bustX}" y="${bustY}" width="${BUST_W}" height="${BUST_H}" preserveAspectRatio="none"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}">
  <image href="${templateDataUrl()}" x="0" y="0" width="${POSTER_W}" height="${POSTER_H}"/>
  <clipPath id="oval"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
  <g clip-path="url(#oval)">${portrait}</g>
  <text x="${cx}" y="${NAME_BASELINE}" text-anchor="middle" font-family="Crimson Text" font-weight="700" font-size="${size}" fill="#1a0e08">${esc(who)}</text>
</svg>`;
}

/** Rasterize the poster to a PNG buffer. */
export function renderWantedPoster({ name, avatarPng, monogram, seed, skinTone, sample = false } = {}) {
  const portraitSeed = seed || (sample ? SAMPLE_SEED : null);
  const portraitPng = pixelatePortrait({
    avatarPng,
    seed: portraitSeed,
    skinTone,
    monogram: monogram || name,
  });
  const portraitDataUrl = `data:image/png;base64,${portraitPng.toString('base64')}`;
  const svg = wantedSvg({ name, portraitDataUrl, monogram });
  return rasterizeSvg(svg, POSTER_W).asPng();
}

export function sampleWantedPoster({ name = SAMPLE_NAME, seed = SAMPLE_SEED, skinTone, avatarPng } = {}) {
  return renderWantedPoster({ name, seed, skinTone, avatarPng, sample: true, monogram: name });
}


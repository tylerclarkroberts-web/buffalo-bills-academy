// Server-side WANTED poster for the Up Next shame post. Minimal editorial western look.
// Drawn here (SVG → PNG). No official Naruto art, logos, or character images: the
// "One Thousand Years of Pain" line is a parody nod, with an original two-handed
// finger-sign silhouette and the subtitle "Leaf Village Secret Finger Jutsu".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const POSTER_W = 768;
export const POSTER_H = 1024;
export const CRIME = 'Making everyone else wait';
export const PUNISHMENT = 'One Thousand Years of Pain';
export const JUTSU = 'Leaf Village Secret Finger Jutsu';

const RYE = [
  path.join(here, 'assets/fonts/Rye-Regular.ttf'),
  path.join(root, 'node_modules/@fontsource/rye/files/rye-latin-400-normal.woff2'),
].find((f) => fs.existsSync(f));

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fitName(name, max = 22) {
  const s = String(name || 'Unknown').replace(/\s+/g, ' ').trim() || 'Unknown';
  return s.length <= max ? s : `${s.slice(0, max - 1).trim()}…`;
}

/** Original silhouette: two fists with index fingers pointed, a two-handed tiger-style sign. */
function handSign() {
  // Original woodcut silhouette, 0 0 200 90. Two fists with a clearly pointed index
  // finger on each hand (a two-handed tiger-style sign, then a poke). Not a character likeness.
  return `
    <g fill="#1a1008" stroke="none" aria-hidden="true">
      <!-- left fist, slightly turned in -->
      <ellipse cx="58" cy="28" rx="24" ry="16"/>
      <rect x="38" y="18" width="28" height="22" rx="9"/>
      <circle cx="40" cy="16" r="7"/>
      <circle cx="52" cy="12" r="7"/>
      <circle cx="64" cy="14" r="6.5"/>
      <ellipse cx="76" cy="30" rx="7" ry="5"/>
      <!-- left index finger, pointed down -->
      <path d="M66 20 L74 16 L80 68 L68 70 L62 24 Z"/>
      <circle cx="74" cy="72" r="6"/>
      <!-- right fist -->
      <ellipse cx="142" cy="28" rx="24" ry="16"/>
      <rect x="134" y="18" width="28" height="22" rx="9"/>
      <circle cx="160" cy="16" r="7"/>
      <circle cx="148" cy="12" r="7"/>
      <circle cx="136" cy="14" r="6.5"/>
      <ellipse cx="124" cy="30" rx="7" ry="5"/>
      <!-- right index finger, pointed down -->
      <path d="M134 20 L126 16 L120 68 L132 70 L138 24 Z"/>
      <circle cx="126" cy="72" r="6"/>
    </g>`;
}

function testPortrait() {
  // Invented western bust: hat, simple face, mustache. Not a real person, not Guntrad.
  return `
    <g>
      <ellipse cx="0" cy="18" rx="70" ry="78" fill="#3b2416"/>
      <ellipse cx="0" cy="8" rx="46" ry="50" fill="#d4a574"/>
      <ellipse cx="-16" cy="2" rx="6" ry="4" fill="#1a1008"/>
      <ellipse cx="16" cy="2" rx="6" ry="4" fill="#1a1008"/>
      <path d="M-22 20 Q0 28 22 20 Q0 34 -22 20 Z" fill="#3b2416"/>
      <path d="M-40 -28 Q0 -70 40 -28 L36 -18 Q0 -48 -36 -18 Z" fill="#1a1008"/>
      <rect x="-52" y="-28" width="104" height="10" rx="3" fill="#1a1008"/>
      <path d="M-28 36 Q0 48 28 36 L22 70 L-22 70 Z" fill="#2a1810"/>
    </g>`;
}

function placeholderPortrait(initial) {
  const ch = esc((initial || '?').slice(0, 1).toUpperCase());
  return `
    <g>
      <ellipse cx="0" cy="18" rx="70" ry="78" fill="#3b2416"/>
      <ellipse cx="0" cy="6" rx="48" ry="52" fill="#c4a07a"/>
      <path d="M-40 -28 Q0 -70 40 -28 L36 -18 Q0 -48 -36 -18 Z" fill="#1a1008"/>
      <rect x="-52" y="-28" width="104" height="10" rx="3" fill="#1a1008"/>
      <path d="M-34 40 Q0 56 34 40 L28 78 L-28 78 Z" fill="#2a1810"/>
      <text x="0" y="18" text-anchor="middle" font-family="Rye" font-size="42" fill="#1a1008">${ch}</text>
    </g>`;
}

function paperBackground() {
  return `
    <defs>
      <clipPath id="oval"><ellipse cx="384" cy="430" rx="132" ry="156"/></clipPath>
    </defs>
    <rect width="100%" height="100%" fill="#e6d2a6"/>
    <ellipse cx="120" cy="80" rx="140" ry="90" fill="#d9c191" opacity="0.55"/>
    <ellipse cx="680" cy="940" rx="160" ry="110" fill="#d3b883" opacity="0.4"/>
    <ellipse cx="60" cy="700" rx="80" ry="140" fill="#c9ae7a" opacity="0.28"/>
    <rect x="28" y="28" width="712" height="968" fill="none" stroke="#1a1008" stroke-width="8"/>
    <rect x="42" y="42" width="684" height="940" fill="none" stroke="#1a1008" stroke-width="2"/>
  `;
}

export function wantedSvg({ name, avatarDataUrl, monogram, sample = false } = {}) {
  const who = fitName(name);
  const portrait = avatarDataUrl
    ? `<image href="${esc(avatarDataUrl)}" x="252" y="274" width="264" height="312" preserveAspectRatio="xMidYMid slice" clip-path="url(#oval)"/>`
    : `<g transform="translate(384 438) scale(1.35)">${sample ? testPortrait() : placeholderPortrait(monogram || who)}</g>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}">
  ${paperBackground()}
  <text x="384" y="128" text-anchor="middle" font-family="Rye" font-size="92" fill="#1a1008" letter-spacing="8">WANTED</text>
  <text x="384" y="168" text-anchor="middle" font-family="Rye" font-size="20" fill="#1a1008" letter-spacing="6">DEAD OR ALIVE</text>
  <ellipse cx="384" cy="430" rx="140" ry="164" fill="none" stroke="#1a1008" stroke-width="6"/>
  ${portrait}
  <text x="384" y="630" text-anchor="middle" font-family="Rye" font-size="40" fill="#1a1008">${esc(who)}</text>
  <line x1="160" y1="656" x2="608" y2="656" stroke="#1a1008" stroke-width="2"/>
  <text x="384" y="708" text-anchor="middle" font-family="Rye" font-size="22" fill="#1a1008">CRIME: ${esc(CRIME)}</text>
  <text x="384" y="754" text-anchor="middle" font-family="Rye" font-size="22" fill="#1a1008">PUNISHMENT:</text>
  <text x="384" y="790" text-anchor="middle" font-family="Rye" font-size="26" fill="#1a1008">${esc(PUNISHMENT)}</text>
  <g transform="translate(284 808)">${handSign()}</g>
  <text x="384" y="900" text-anchor="middle" font-family="Rye" font-size="16" fill="#1a1008" letter-spacing="1">${esc(JUTSU)}</text>
  <text x="384" y="962" text-anchor="middle" font-family="Rye" font-size="16" fill="#1a1008">BUFFALO BILL'S ACADEMY  ·  SHERIFF'S OFFICE</text>
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

/** Rasterize the poster to a PNG buffer. `avatarPng` is optional raw PNG bytes. */
export function renderWantedPoster({ name, avatarPng, monogram, sample = false } = {}) {
  const { Resvg } = loadResvg();
  let avatarDataUrl = null;
  if (avatarPng && Buffer.isBuffer(avatarPng) && avatarPng.length > 32) {
    avatarDataUrl = `data:image/png;base64,${avatarPng.toString('base64')}`;
  }
  const svg = wantedSvg({ name, avatarDataUrl, monogram, sample });
  const fontFiles = [RYE].filter(Boolean);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: POSTER_W },
    font: {
      fontFiles,
      loadSystemFonts: fontFiles.length === 0,
      defaultFontFamily: 'Rye',
    },
  });
  return resvg.render().asPng();
}

export function sampleWantedPoster({ name = 'Cal Hick' } = {}) {
  return renderWantedPoster({ name, sample: true, monogram: name });
}

export const SAMPLE_NAME = 'Cal Hick';

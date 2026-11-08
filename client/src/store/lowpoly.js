// v37: original cartoon low-poly drawings for the tobacco items (no photos, no brands). Each is a few flat-shaded
// facets on a 64x64 grid with a dark outline, made as an SVG data URL. `TIP[art]` is where the ember / smoke
// comes from (fractions of the icon), so the table animation can light it in the right place.
const O = '#2a1a12';
const pt = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (p, fill, stroke = true) => `<polygon points="${pt(p)}" fill="${fill}"${stroke ? ` stroke="${O}" stroke-width="1.4" stroke-linejoin="round"` : ''}/>`;
/** A faceted stick from A to B, radius r: a light upper facet and a dark lower facet. */
function stick([x1, y1], [x2, y2], r, light, dark, mid) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1; const nx = (dy / L) * r, ny = (-dx / L) * r;
  const A1 = [x1 + nx, y1 + ny], B1 = [x2 + nx, y2 + ny], A2 = [x1 - nx, y1 - ny], B2 = [x2 - nx, y2 - ny];
  return poly([A1, B1, B2, A2], dark) + poly([A1, B1, [x2 + nx * 0.1, y2 + ny * 0.1], [x1 + nx * 0.1, y1 + ny * 0.1]], light, false)
    + (mid ? poly([[x1 + nx * 0.1, y1 + ny * 0.1], [x2 + nx * 0.1, y2 + ny * 0.1], [x2 - nx * 0.45, y2 - ny * 0.45], [x1 - nx * 0.45, y1 - ny * 0.45]], mid, false) : '');
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const ember = ([x, y], s = 1) => poly([[x - 3 * s, y + 1 * s], [x + 1 * s, y - 3 * s], [x + 3 * s, y], [x, y + 3 * s]], '#ff7a1a') + poly([[x - 1 * s, y], [x + 1 * s, y - 1.6 * s], [x + 1.6 * s, y + 0.4 * s]], '#ffd34a', false);

function cigarette(A, B, r, { filter = '#d9a066', paper = '#f4efe6', shade = '#c9c0b2', lumpy = false } = {}) {
  const F = lerp(A, B, 0.28);
  let s = stick(A, F, r, filter, '#a8743c') + stick(F, B, r, paper, shade, lumpy ? '#e6ddcc' : null);
  if (lumpy) s += poly([lerp(F, B, 0.35).map((v, i) => v + (i ? -r : r * 0.2)), lerp(F, B, 0.5).map((v, i) => v + (i ? -r * 1.4 : 0)), lerp(F, B, 0.62).map((v, i) => v + (i ? -r : 0))], '#efe6d6', false);
  return s + stick(lerp(A, B, 0.93), B, r, '#8a8a8a', '#5c5c5c');
}
function cigar(A, B, r, { band = '#c22f3a', bandHi = '#e8c766', wrap = '#7a4a26', wrapLight = '#a0663a', wrapMid = '#8b5730' } = {}) {
  const C = lerp(A, B, 0.2);
  return stick(A, B, r, wrapLight, wrap, wrapMid) + stick(lerp(C, B, 0), lerp(C, B, 0.1), r * 1.08, bandHi, band) + stick(lerp(A, B, 0.95), B, r * 0.96, '#9a9a9a', '#6b6b6b');
}
function pipe(bowlAt, stemFrom, { bowl = '#7a4a26', bowlLight = '#a0663a', rim = '#3a2416', stem = '#1d1d22', stemLight = '#44444e', h = 16, w = 14, face = false, cob = false }) {
  const [bx, by] = bowlAt; // bowl's top centre
  const tl = [bx - w / 2, by], tr = [bx + w / 2, by], br = [bx + w / 2 - 2, by + h], bl = [bx - w / 2 + 3, by + h], bot = [bx, by + h + 3];
  let s = stick(stemFrom, [bx - w / 2 + 2, by + h * 0.62], 2.4, stemLight, stem);
  s += poly([tl, tr, br, bot, bl], bowl) + poly([tl, [bx, by], [bx - 1, by + h + 2], bl], bowlLight, false);
  s += poly([tl, tr, [bx + w / 2 - 1, by + 2.5], [bx - w / 2 + 1, by + 2.5]], rim);
  if (cob) for (let i = 0; i < 9; i++) s += `<circle cx="${bx - w / 2 + 3 + (i % 3) * 4}" cy="${by + 5 + Math.floor(i / 3) * 4}" r="1" fill="#b8892c"/>`;
  if (face) s += `<circle cx="${bx - 2}" cy="${by + 8}" r="1.2" fill="${O}"/><circle cx="${bx + 3}" cy="${by + 8}" r="1.2" fill="${O}"/><path d="M${bx - 3} ${by + 12} q3 2 6 0" stroke="${O}" stroke-width="1.2" fill="none"/>`;
  return s;
}
const ART = {
  cig: () => cigarette([12, 50], [50, 14], 3.6, { filter: '#f4efe6', shade: '#c9c0b2', lumpy: true }) + ember([50, 14]),
  filtered: () => cigarette([12, 50], [50, 14], 3.4) + ember([50, 14]),
  cheroot: () => cigar([10, 50], [52, 14], 4.4, { band: '#5b3b22', bandHi: '#6b4a2c' }) + ember([52, 14], 1.2),
  cigarillo: () => stick([8, 54], [16, 46], 2.6, '#e2c08a', '#b28a52') + cigar([16, 46], [52, 12], 3.2, { band: '#2f6a3a', bandHi: '#4f9a5a', wrap: '#5a3a22', wrapLight: '#7d5232', wrapMid: '#6a4428' }) + ember([52, 12]),
  corncob: () => pipe([40, 14], [8, 46], { bowl: '#e0b443', bowlLight: '#f3d27a', rim: '#8a6420', stem: '#7a5a2a', stemLight: '#a8844a', cob: true }) + ember([40, 15]),
  briar: () => pipe([40, 16], [6, 44], { h: 18, w: 16 }) + ember([40, 17]),
  cigar: () => cigar([8, 52], [54, 12], 5.6) + ember([54, 12], 1.4),
  churchwarden: () => pipe([50, 22], [2, 60], { h: 14, w: 12, bowl: '#6a3f22', bowlLight: '#8f5a34', stem: '#2a2a30', stemLight: '#55555f' }) + ember([50, 23]),
  meerschaum: () => pipe([40, 14], [6, 46], { h: 20, w: 18, bowl: '#e9e2d2', bowlLight: '#fbf8f0', rim: '#a89c84', stem: '#3a2a20', stemLight: '#6a5040', face: true }) + ember([40, 15]),
  grand: () => cigar([6, 56], [56, 8], 7.2, { band: '#b8860b', bandHi: '#ffd76a', wrap: '#6a3c1e', wrapLight: '#94592e', wrapMid: '#7d4826' }) + ember([56, 8], 1.7),
};
/** Where the ember is, as fractions of the icon (for the lighter + smoke at the table). */
export const TIP = { cig: [0.78, 0.22], filtered: [0.78, 0.22], cheroot: [0.81, 0.22], cigarillo: [0.81, 0.19], corncob: [0.62, 0.23], briar: [0.62, 0.26], cigar: [0.84, 0.19], churchwarden: [0.78, 0.36], meerschaum: [0.62, 0.23], grand: [0.87, 0.13] };
export const ART_NAMES = Object.keys(ART);
const cache = {};
export function lowpolyUrl(art) {
  if (!ART[art]) return null;
  return (cache[art] ||= `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ART[art]()}</svg>`)}`);
}

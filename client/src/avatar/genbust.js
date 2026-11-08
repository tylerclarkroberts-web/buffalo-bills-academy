// Original generated low-poly busts for players without a photo. Seeded, so everyone keeps the same face.
export function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = hashSeed(seed) || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SKIN = ['#f3cfb3', '#e8b48f', '#d39a72', '#b77a52', '#94603e', '#6e4429', '#4f301d', '#f6dccb'];
const HAIR = ['#17110d', '#2f2016', '#5a3a20', '#8b5a2b', '#c99a55', '#e3c98d', '#9a9a9a', '#ece6da', '#b8322f', '#1f2a44'];
export const SHIRTS = ['#ff4f7b', '#21c7b8', '#ffb547', '#7b5cff', '#ff7a59', '#2b6f8a', '#f2e8d5', '#d6336c', '#3fbf8f'];
const HAIRSTYLES = ['short', 'bald', 'long', 'quiff', 'buzz', 'bun'];

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
export function looks(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRTS), style: pick(HAIRSTYLES), wide: 0.92 + r() * 0.16, brows: r() < 0.5, beard: r() < 0.22, r };
}
const LIGHT = [-0.45, -0.6, 0.66];
function facet(pts, base, z = [0.6, 0.6, 0.6]) {
  // shade a triangle as if it sat on a dome: approximate a normal from its 2D centre
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  const nx = (cx - 30) / 26, ny = (cy - 36) / 32, nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  return { d: `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}Z`, fill: shade(base, (d - 0.55) * 0.55 + z[0] * 0 ) };
}
/** Head (viewBox 0 0 60 72): returns polygons for skin, hair, features. */
export function headParts(seed) {
  const L = looks(seed);
  const cx = 30, cy = 36, rx = 19 * L.wide, ry = 24;
  const ring = (k, n, off = 0) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + off; const jit = 1 + (L.r() - 0.5) * 0.05; return [cx + Math.cos(a) * rx * k * jit, cy + Math.sin(a) * ry * k * (a > 0 && a < Math.PI ? 1.02 : 1) * jit]; });
  const outer = ring(1, 14), inner = ring(0.56, 7, 0.2), c = [cx, cy + 2];
  const skin = [];
  for (let i = 0; i < 14; i++) {
    const a = outer[i], b = outer[(i + 1) % 14];
    const ia = inner[Math.floor(i / 2) % 7], ib = inner[Math.floor((i + 1) / 2) % 7];
    skin.push(facet([a, b, ib], L.skin));
    if (ia !== ib) skin.push(facet([a, ib, ia], L.skin));
  }
  for (let i = 0; i < 7; i++) skin.push(facet([inner[i], inner[(i + 1) % 7], c], L.skin));
  const ears = [
    facet([[cx - rx + 1, cy - 4], [cx - rx - 4, cy + 1], [cx - rx + 1, cy + 8]], L.skin),
    facet([[cx + rx - 1, cy - 4], [cx + rx + 4, cy + 1], [cx + rx - 1, cy + 8]], L.skin),
  ];
  const hair = [];
  const top = outer.filter((p) => p[1] < cy - 2).sort((a, b) => a[0] - b[0]);
  const H = (pts) => hair.push(facet(pts, L.hair));
  if (L.style !== 'bald') {
    const lift = L.style === 'quiff' ? 7 : L.style === 'buzz' ? 1.5 : 4;
    const capY = L.style === 'buzz' ? cy - 12 : cy - 8;
    const arc = [[cx - rx - 1, capY + 4], ...top.map((p) => [p[0] + (p[0] - cx) * 0.08, p[1] - lift * (1 - Math.abs(p[0] - cx) / rx * 0.6)]), [cx + rx + 1, capY + 4]];
    for (let i = 0; i < arc.length - 1; i++) H([arc[i], arc[i + 1], [cx + (arc[i][0] - cx) * 0.5, capY]]);
    H([[cx - rx - 1, capY + 4], [cx, capY - 1], [cx + rx + 1, capY + 4]]);
    if (L.style === 'long') { H([[cx - rx - 1, capY + 4], [cx - rx - 5, cy + 22], [cx - rx + 3, cy + 12]]); H([[cx + rx + 1, capY + 4], [cx + rx + 5, cy + 22], [cx + rx - 3, cy + 12]]); }
    if (L.style === 'bun') H([[cx - 6, cy - ry - 2], [cx, cy - ry - 10], [cx + 6, cy - ry - 2]]);
    if (L.style === 'quiff') H([[cx - 10, capY - 2], [cx + 4, cy - ry - 9], [cx + 12, capY - 1]]);
  }
  const beard = L.beard ? [facet([[cx - rx + 3, cy + 6], [cx, cy + ry + 1], [cx - 6, cy + 14]], L.hair), facet([[cx + rx - 3, cy + 6], [cx, cy + ry + 1], [cx + 6, cy + 14]], L.hair), facet([[cx - 6, cy + 14], [cx, cy + ry + 1], [cx + 6, cy + 14]], L.hair)] : [];
  return { L, skin, ears, hair, beard, cx, cy };
}

// Low-poly stylizer shared by the browser (face avatars) and a build script (the dealer).
// Picks points along edges plus a jittered grid, triangulates them (Delaunay), and paints each
// triangle one flat color: the average of the pixels under it. Pure JS, no DOM needed.
import Delaunator from 'delaunator';

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * img: {width, height, data: RGBA bytes}. Options:
 *  cell: grid spacing in px; edges: number of edge points; detail: [{x,y,w,h,cell}] regions with finer grid.
 * Returns { width, height, tris: Float32Array of [x0,y0,x1,y1,x2,y2,r,g,b,a] * n }.
 */
export function lowPoly(img, { cell = 18, edges = 600, detail = [], seed = 7, alphaCut = 128 } = {}) {
  const { width: W, height: H, data } = img;
  const rand = rng(seed);
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) * (data[i * 4 + 3] / 255);
  const pts = [];
  const push = (x, y) => pts.push(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)));
  // frame
  for (let x = 0; x <= W; x += cell) { push(x, 0); push(x, H - 1); }
  for (let y = cell; y < H; y += cell) { push(0, y); push(W - 1, y); }
  // jittered grid (coarse everywhere, finer in detail regions)
  const grid = (x0, y0, w, h, c) => {
    for (let y = y0 + c / 2; y < y0 + h; y += c) for (let x = x0 + c / 2; x < x0 + w; x += c) push(x + (rand() - 0.5) * c * 0.8, y + (rand() - 0.5) * c * 0.8);
  };
  grid(0, 0, W, H, cell);
  for (const d of detail) grid(d.x, d.y, d.w, d.h, d.cell);
  // strongest edges (Sobel), spaced out so they do not clump
  const mag = [];
  for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
    const i = y * W + x;
    const gx = lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1];
    const gy = lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1];
    const m = gx * gx + gy * gy;
    if (m > 900) mag.push([m, x, y]);
  }
  mag.sort((a, b) => b[0] - a[0]);
  const minD = Math.max(3, cell / 3.2), taken = new Set();
  let n = 0;
  for (const [, x, y] of mag) {
    if (n >= edges) break;
    const k = `${Math.floor(x / minD)},${Math.floor(y / minD)}`;
    if (taken.has(k)) continue;
    taken.add(k); push(x, y); n++;
  }
  const del = new Delaunator(Float64Array.from(pts));
  const T = del.triangles;
  const out = [];
  const SAMPLES = [[1 / 3, 1 / 3], [0.6, 0.2], [0.2, 0.6], [0.2, 0.2], [0.45, 0.45], [0.1, 0.45], [0.45, 0.1]];
  for (let t = 0; t < T.length; t += 3) {
    const ax = pts[T[t] * 2], ay = pts[T[t] * 2 + 1], bx = pts[T[t + 1] * 2], by = pts[T[t + 1] * 2 + 1], cx = pts[T[t + 2] * 2], cy = pts[T[t + 2] * 2 + 1];
    let r = 0, g = 0, b = 0, a = 0, cnt = 0, opaque = 0;
    for (const [u, v] of SAMPLES) {
      const x = Math.round(ax + (bx - ax) * u + (cx - ax) * v), y = Math.round(ay + (by - ay) * u + (cy - ay) * v);
      const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
      const al = data[i + 3];
      a += al; cnt++;
      if (al >= alphaCut) { r += data[i]; g += data[i + 1]; b += data[i + 2]; opaque++; }
    }
    if (opaque * 2 < cnt) continue; // mostly transparent: drop the triangle (cut-out edge)
    out.push(ax, ay, bx, by, cx, cy, r / opaque, g / opaque, b / opaque, 255);
  }
  return { width: W, height: H, tris: Float32Array.from(out) };
}

/** Paint triangles into an RGBA buffer (used by the Node build script; the browser uses canvas). */
export function rasterize({ width: W, height: H, tris }, scale = 1, light = null) {
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let t = 0; t < tris.length; t += 10) {
    const xs = [tris[t] * scale, tris[t + 2] * scale, tris[t + 4] * scale], ys = [tris[t + 1] * scale, tris[t + 3] * scale, tris[t + 5] * scale];
    let [r, g, b] = [tris[t + 6], tris[t + 7], tris[t + 8]];
    if (light) { const f = light(tris, t); r *= f; g *= f; b *= f; }
    const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
    if (Math.abs(area) < 1e-6) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((xs[1] - px) * (ys[2] - py) - (xs[2] - px) * (ys[1] - py)) / area;
      const w1 = ((xs[2] - px) * (ys[0] - py) - (xs[0] - px) * (ys[2] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const i = (y * w + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: buf };
}

/** Simple faceted lighting: each triangle is brightened or darkened by how its centre sits on a dome. */
export function domeLight(cx, cy, rx, ry, strength = 0.22) {
  return (tris, t) => {
    const mx = (tris[t] + tris[t + 2] + tris[t + 4]) / 3, my = (tris[t + 1] + tris[t + 3] + tris[t + 5]) / 3;
    // facet normal approximated from the triangle's orientation on an ellipsoid
    const nx = (mx - cx) / rx, ny = (my - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
    const d = (-0.45 * nx - 0.55 * ny + 0.7 * nz);
    const jitter = (((t * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
    return 1 + strength * (d - 0.4) + jitter * 0.08;
  };
}

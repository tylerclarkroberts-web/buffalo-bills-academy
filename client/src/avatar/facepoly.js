// Turns a cropped face (canvas) into the stylized low-poly avatar, entirely in the browser.
import { lowPoly } from '../lowpoly.js';

export const OUT_W = 240, OUT_H = 300;

/** src: canvas/image/video, crop: {x, y, w, h} in source pixels (4:5). Returns { png, tris, width, height }. */
export function stylize(src, crop) {
  const c = document.createElement('canvas');
  c.width = OUT_W; c.height = OUT_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, OUT_W, OUT_H);
  const img = g.getImageData(0, 0, OUT_W, OUT_H);
  // keep an egg-shaped head area, drop the background around it
  const cx = OUT_W / 2, cy = OUT_H * 0.47, rx = OUT_W * 0.43, ry = OUT_H * 0.46;
  for (let y = 0; y < OUT_H; y++) for (let x = 0; x < OUT_W; x++) {
    const k = ((x - cx) / (rx * (y > cy ? 0.92 - (y - cy) / OUT_H * 0.5 : 1))) ** 2 + ((y - cy) / ry) ** 2;
    if (k > 1) img.data[(y * OUT_W + x) * 4 + 3] = 0;
  }
  const poly = lowPoly(img, {
    cell: 22, edges: 420, seed: 5,
    detail: [{ x: OUT_W * 0.2, y: OUT_H * 0.25, w: OUT_W * 0.6, h: OUT_H * 0.5, cell: 11 }],
  });
  g.clearRect(0, 0, OUT_W, OUT_H);
  const t = poly.tris;
  for (let i = 0; i < t.length; i += 10) {
    const mx = (t[i] + t[i + 2] + t[i + 4]) / 3, my = (t[i + 1] + t[i + 3] + t[i + 5]) / 3;
    const nx = (mx - cx) / rx, ny = (my - cy) / ry, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
    const f = 1 + 0.22 * (-0.45 * nx - 0.5 * ny + 0.74 * nz - 0.45) + ((((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.07;
    const col = `rgb(${Math.min(255, t[i + 6] * f) | 0},${Math.min(255, t[i + 7] * f) | 0},${Math.min(255, t[i + 8] * f) | 0})`;
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(t[i], t[i + 1]); g.lineTo(t[i + 2], t[i + 3]); g.lineTo(t[i + 4], t[i + 5]); g.closePath(); g.fill(); g.stroke();
  }
  const png = c.toDataURL('image/png');
  img.data.fill(0); // forget the photo pixels
  return { png, tris: t, width: OUT_W, height: OUT_H };
}

/** Best-effort automatic face framing with the browser's built-in FaceDetector (where available). */
export async function detectFace(source) {
  if (!('FaceDetector' in window)) return null;
  try {
    const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const [f] = await fd.detect(source);
    return f?.boundingBox || null;
  } catch { return null; }
}

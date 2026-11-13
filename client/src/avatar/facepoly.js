// Turns a cropped face into a stylized avatar, entirely in the browser.
import { lowPoly, rasterize } from '../lowpoly.js';
import { applyHeadMask, clipHeadTriangles, fitHead } from './head-mask.js';

export const OUT_W = 240, OUT_H = 300;

/** Pure pixel/mesh conversion: both outputs use the same edited head mask. */
export function buildHead(img, alpha, outlined = true) {
  const { width, height } = img;
  const mask = applyHeadMask(img, alpha, outlined);
  const poly = clipHeadTriangles(lowPoly(img, {
    cell: 22, edges: 420, seed: 5, minCoverage: 0,
    detail: [{ x: width * 0.2, y: height * 0.25, w: width * 0.6, h: height * 0.5, cell: 11 }],
  }), mask);
  if (!poly.tris.length) throw new Error('No head remains in the cutout');
  const cx = width / 2, cy = height * 0.47, rx = width * 0.43, ry = height * 0.46;
  const pixels = rasterize(poly, 1, (t, i) => {
    const mx = (t[i] + t[i + 2] + t[i + 4]) / 3, my = (t[i + 1] + t[i + 3] + t[i + 5]) / 3;
    const nx = (mx - cx) / rx, ny = (my - cy) / ry, nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
    return 1 + 0.22 * (-0.45 * nx - 0.5 * ny + 0.74 * nz - 0.45) + ((((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.07;
  }).data;
  // Rasterization's seam tolerance must never expand the saved cutout.
  for (let i = 0; i < mask.length; i++) if (!mask[i]) pixels.fill(0, i * 4, i * 4 + 4);
  return { width, height, tris: poly.tris, pixels };
}

/** src: canvas/image/video, crop: {x,y,w,h}; optional alpha is 240×300 kept/removed pixels of that crop, refitted to fill the outline. */
export function stylize(src, crop, alpha) {
  const c = document.createElement('canvas');
  c.width = OUT_W; c.height = OUT_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (alpha) {
    const fit = fitHead(OUT_W, OUT_H, alpha), kx = crop.w / OUT_W, ky = crop.h / OUT_H;
    crop = { x: crop.x + fit.crop.x * kx, y: crop.y + fit.crop.y * ky, w: fit.crop.w * kx, h: fit.crop.h * ky };
    alpha = fit.alpha;
  }
  // Drawn through a transform because the fitted crop can hang off the photo, which Safari will not take as a source rectangle.
  g.setTransform(OUT_W / crop.w, 0, 0, OUT_H / crop.h, -crop.x * OUT_W / crop.w, -crop.y * OUT_H / crop.h);
  g.drawImage(src, 0, 0); g.resetTransform();
  const img = g.getImageData(0, 0, OUT_W, OUT_H);
  const { tris, pixels } = buildHead(img, alpha, !alpha);
  img.data.set(pixels); g.putImageData(img, 0, 0);
  const png = c.toDataURL('image/png');
  img.data.fill(0); pixels.fill(0); // forget intermediate photo and rendered pixels
  return { png, tris, width: OUT_W, height: OUT_H };
}

/** Best-effort automatic framing where the browser provides face detection. */
export async function detectFace(source) {
  if (!('FaceDetector' in window)) return null;
  try {
    const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const [f] = await fd.detect(source);
    return f?.boundingBox || null;
  } catch { return null; }
}

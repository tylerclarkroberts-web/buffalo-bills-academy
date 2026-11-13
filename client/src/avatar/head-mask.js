// Shared by framing and cutout correction; the saved picture and its 3D mesh are the kept head enlarged to fill it.
const CX = 0.5, CY = 0.47, RX = 0.43, RY = 0.46;
const taper = (y) => y > CY ? 0.92 - (y - CY) * 0.5 : 1;
const inside = (nx, ny) => ((nx - CX) / (RX * taper(ny))) ** 2 + ((ny - CY) / RY) ** 2 <= 1;

export function headPath(width, height) {
  const angles = [0, 1e-7, Math.PI - 1e-7, Math.PI];
  for (let i = 1; i < 128; i++) angles.push(i * Math.PI / 64);
  const points = [...new Set(angles)].sort((a, b) => a - b).map((angle) => {
    const y = angle === 0 || angle === Math.PI ? CY : CY + RY * Math.sin(angle);
    return `${((CX + RX * taper(y) * Math.cos(angle)) * width).toFixed(3)},${(y * height).toFixed(3)}`;
  });
  return `M${points.join('L')}Z`;
}

/** Optional alpha is one byte per pixel: 0 removed, 255 kept. outlined = false keeps an already fitted head (fitHead) whole. */
export function headMask(width, height, alpha, outlined = true) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid head size');
  if (alpha != null && (!(alpha instanceof Uint8Array || alpha instanceof Uint8ClampedArray) || alpha.length !== width * height)) throw new Error('Invalid head mask');
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ny = (y + 0.5) / height, nx = (x + 0.5) / width;
    const i = y * width + x;
    if ((!outlined || inside(nx, ny)) && (alpha == null || alpha[i] >= 128)) mask[i] = 255;
  }
  return mask;
}

/**
 * A cutout keeps only as much head as the framing caught, so a loose frame used to save a neck-sized head.
 * Returns the part of the frame to redraw across the whole frame so the kept area spans the outline's
 * height or width, and the mask redrawn the same way. The enlarged head is not cut to the outline's curve again.
 */
export function fitHead(width, height, alpha) {
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128) {
    const x = i % width, y = (i - x) / width;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  if (x1 <= x0) return { crop: { x: 0, y: 0, w: width, h: height }, alpha };
  // ponytail: fits the box around everything kept, so a stray kept speck holds the zoom back until it is erased.
  const zoom = Math.min(2 * RX * width / (x1 - x0), 2 * RY * height / (y1 - y0));
  const crop = { x: (x0 + x1) / 2 - CX * width / zoom, y: (y0 + y1) / 2 - CY * height / zoom, w: width / zoom, h: height / zoom };
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = Math.floor(crop.x + (x + 0.5) / zoom), v = Math.floor(crop.y + (y + 0.5) / zoom);
    if (u >= 0 && v >= 0 && u < width && v < height && alpha[v * width + u] >= 128) out[y * width + x] = 255;
  }
  return { crop, alpha: out };
}

/** Intersect the image's transparency, subject mask and (unless already fitted) framing outline in place. */
export function applyHeadMask(img, alpha, outlined = true) {
  const mask = headMask(img.width, img.height, alpha, outlined);
  if (img.data.length !== mask.length * 4) throw new Error('Invalid head image');
  for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i] = mask[i] && img.data[i * 4 + 3] >= 128 ? 255 : 0;
  return mask;
}

function cut(points, axis, at, greater) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const a = greater ? p[axis] >= at : p[axis] <= at, b = greater ? q[axis] >= at : q[axis] <= at;
    if (a) out.push(p);
    if (a !== b) {
      const t = (at - p[axis]) / (q[axis] - p[axis]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Keep solid interior facets; split only mask boundaries, including holes, into pixel-aligned pieces. */
export function clipHeadTriangles(poly, mask) {
  const { width, height, tris } = poly;
  if (mask.length !== width * height) throw new Error('Invalid head mask');
  const stride = width + 1, sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x] >= 128 ? 1 : 0;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const out = [];
  function visit(points, x0, y0, x1, y1, colour) {
    if (points.length < 3 || x1 <= x0 || y1 <= y0) return;
    const count = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
    if (!count) return;
    if (count === (x1 - x0) * (y1 - y0)) {
      for (let i = 1; i < points.length - 1; i++) {
        const [a, b, c] = [points[0], points[i], points[i + 1]];
        if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-6) out.push(...a, ...b, ...c, ...colour);
      }
      return;
    }
    if (x1 - x0 >= y1 - y0) {
      const mid = (x0 + x1) >> 1;
      visit(cut(points, 0, mid, false), x0, y0, mid, y1, colour);
      visit(cut(points, 0, mid, true), mid, y0, x1, y1, colour);
    } else {
      const mid = (y0 + y1) >> 1;
      visit(cut(points, 1, mid, false), x0, y0, x1, mid, colour);
      visit(cut(points, 1, mid, true), x0, mid, x1, y1, colour);
    }
  }
  for (let i = 0; i < tris.length; i += 10) {
    const points = [[tris[i], tris[i + 1]], [tris[i + 2], tris[i + 3]], [tris[i + 4], tris[i + 5]]];
    const x0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p[0])))), x1 = Math.min(width, Math.ceil(Math.max(...points.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1])))), y1 = Math.min(height, Math.ceil(Math.max(...points.map((p) => p[1]))));
    const clipped = cut(cut(cut(cut(points, 0, x0, true), 0, x1, false), 1, y0, true), 1, y1, false);
    visit(clipped, x0, y0, x1, y1, Array.from(tris.subarray(i + 6, i + 10)));
  }
  return { width, height, tris: Float32Array.from(out) };
}

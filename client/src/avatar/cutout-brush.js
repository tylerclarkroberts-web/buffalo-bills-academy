const clamp = (n, max) => Math.max(0, Math.min(max, n));

export function brushPoint(rect, clientX, clientY, width, height) {
  return { x: clamp((clientX - rect.left) * width / rect.width, width), y: clamp((clientY - rect.top) * height / rect.height, height) };
}

/** A swept circle keeps fast pointer strokes continuous; the head outline limits restored pixels. */
export function paintMask(alpha, width, height, from, to, radius, keep, outline) {
  if (alpha.length !== width * height || (outline && outline.length !== alpha.length)) throw new Error('Invalid cutout mask');
  const next = new Uint8ClampedArray(alpha);
  const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
  const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius)), x1 = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius)), y1 = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = length2 ? Math.max(0, Math.min(1, ((x + 0.5 - from.x) * dx + (y + 0.5 - from.y) * dy) / length2)) : 0;
    const distance2 = (x + 0.5 - from.x - t * dx) ** 2 + (y + 0.5 - from.y - t * dy) ** 2;
    if (distance2 <= radius * radius) next[y * width + x] = keep && (!outline || outline[y * width + x]) ? 255 : 0;
  }
  return next;
}

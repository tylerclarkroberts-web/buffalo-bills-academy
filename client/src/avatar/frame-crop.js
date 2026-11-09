/** Framing uses a fixed 4:5 coordinate space so resizing the page never changes the selected crop. */
export function frameCrop(width, height, { zoom, cx, cy }) {
  const scale = Math.max(240 / width, 300 / height) * zoom;
  const w = 240 / scale, h = 300 / scale;
  return { x: Math.max(0, Math.min(width - w, cx - w / 2)), y: Math.max(0, Math.min(height - h, cy - h / 2)), w, h };
}

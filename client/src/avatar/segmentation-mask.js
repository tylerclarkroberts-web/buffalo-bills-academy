/** Pinned SelfieMulticlass v1 labels: background, hair, body skin, face skin, clothes, accessories. */
export function segmentationAlpha(categories, width, height, outWidth, outHeight) {
  if (categories.length !== width * height || width <= 0 || height <= 0) throw new Error('Invalid segmentation mask');
  const alpha = new Uint8ClampedArray(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const category = categories[Math.min(height - 1, Math.floor(y * height / outHeight)) * width + Math.min(width - 1, Math.floor(x * width / outWidth))];
    if (category === 1 || category === 3 || category === 5) alpha[y * outWidth + x] = 255;
  }
  return alpha;
}

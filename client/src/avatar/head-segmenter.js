/** The worker and its same-origin model/runtime are fetched only after a player frames a photo. */
export function segmentHead(source, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let worker, timeout, done = false;
    const finish = (err, alpha) => {
      if (done) return; done = true;
      clearTimeout(timeout); signal?.removeEventListener('abort', abort); worker?.terminate();
      if (err) reject(err); else resolve(alpha);
    };
    const abort = () => finish(new DOMException('Cutout cancelled', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    try {
      if (!window.Worker || !window.OffscreenCanvas) throw new Error('Unsupported browser');
      worker = new Worker(new URL('./head-segmenter.worker.js', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => finish(new Error('Automatic cutout timed out')), 60000);
      worker.onerror = () => finish(new Error('Automatic cutout unavailable'));
      worker.onmessage = ({ data }) => {
        if (data.error) finish(new Error(data.error));
        else finish(null, new Uint8ClampedArray(data.alpha));
      };
      const image = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
      worker.postMessage({ pixels: image.data.buffer, width: source.width, height: source.height }, [image.data.buffer]);
    } catch (error) { finish(error); }
  });
}

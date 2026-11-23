// Shared async image cache & ready notifications for high-resolution Stage I sprites and eggs.

const readyListeners = new Set();
const loadedImages = new Map();

/** Subscribe to async high-res sprite loads; returns an unsubscribe callback. */
export function onSpriteReady(fn) {
  readyListeners.add(fn);
  return () => { readyListeners.delete(fn); };
}

/** Notify subscribed canvases and Three.js textures that a high-res sprite is ready to paint. */
export function notifySpriteReady(payload) {
  for (const fn of readyListeners) fn(payload);
}

/** Load and cache a sprite WebP in the browser, invoking `onLoad(img)` once decoded. No-op in Node. */
export function loadSpriteImage(src, onLoad) {
  if (!src || typeof Image === 'undefined') return;
  let entry = loadedImages.get(src);
  if (entry) {
    if (entry.status === 'ready') onLoad(entry.img);
    else if (entry.status === 'loading') entry.cbs.push(onLoad);
    return;
  }
  entry = { status: 'loading', img: null, cbs: [onLoad] };
  loadedImages.set(src, entry);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    entry.status = 'ready';
    entry.img = img;
    const list = entry.cbs.splice(0);
    for (const cb of list) cb(img);
  };
  img.onerror = () => {
    entry.status = 'error';
    entry.cbs.length = 0;
  };
  img.src = src;
}
